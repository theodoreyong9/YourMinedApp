/* jshint esversion:11, module:true */
/* global crypto */
// ============================================================
//  MeshAI — Cloudflare Worker v2
//  Variables d'env Cloudflare :
//    WORKER_SECRET = secret interne bridge
//
//  Déploiement :
//    wrangler deploy worker.js --name yourmine-worker
//    wrangler secret put WORKER_SECRET
// ============================================================

const NODES  = new Map(); // nodeId → node
const TOKENS = new Map(); // tokenId → token
const CODES  = new Map(); // code → code entry
const AUDIT  = [];

// rate limiting : ip → { count, resetAt }
const RATE   = new Map();

// device binding : deviceHash → nodeId
const DEVICES = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────────
function uid(p = '') {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function now()    { return Date.now(); }
function isoNow() { return new Date().toISOString(); }
function log(action, nodeId, detail = '') {
  AUDIT.unshift({ ts: isoNow(), action, nodeId, detail: String(detail).slice(0, 120) });
  if (AUDIT.length > 500) AUDIT.pop();
}

// ── CORS ───────────────────────────────────────────────────────────────────────
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Mesh-Token, X-Node-Id',
    'Content-Type': 'application/json',
  };
}
function json(data, status = 200, h = {}) {
  return new Response(JSON.stringify(data), { status, headers: h });
}

// ── Hash SHA-256 (clé, device fingerprint) ─────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Rate limiting sur /api/join : 10 tentatives / IP / 60s ────────────────────
function checkRate(ip) {
  const entry = RATE.get(ip) || { count: 0, resetAt: now() + 60000 };
  if (now() > entry.resetAt) { entry.count = 0; entry.resetAt = now() + 60000; }
  entry.count++;
  RATE.set(ip, entry);
  return entry.count <= 10;
}

// ── Valider token ──────────────────────────────────────────────────────────────
function validateToken(tokenId, nodeId) {
  const t = TOKENS.get(tokenId);
  if (!t)              return { ok: false, reason: 'token_not_found' };
  if (!t.active)       return { ok: false, reason: 'token_revoked' };
  if (t.nodeId !== nodeId) return { ok: false, reason: 'node_mismatch' };
  if (now() > t.expiresAt) { t.active = false; return { ok: false, reason: 'token_expired' }; }
  return { ok: true, token: t };
}

// ── Valider device binding ─────────────────────────────────────────────────────
// Retourne true si le deviceHash est autorisé pour ce nodeId
function validateDevice(nodeId, deviceHash) {
  if (!deviceHash) return false;
  const bound = DEVICES.get(deviceHash);
  return bound === nodeId;
}

// ── Remonter la chaîne root ───────────────────────────────────────────────────
function findRoot(nodeId) {
  let cur = NODES.get(nodeId);
  let depth = 0;
  while (cur && cur.parentId && depth < 20) {
    cur = NODES.get(cur.parentId);
    depth++;
  }
  return cur;
}

// ── Budget ────────────────────────────────────────────────────────────────────
function checkBudget(nodeId, requested = 1) {
  const node = NODES.get(nodeId);
  if (!node) return { ok: false, reason: 'node_not_found' };
  const rem = node.budgetTotal - node.budgetUsed;
  if (rem < requested) return { ok: false, reason: 'budget_exhausted', remaining: rem };
  return { ok: true, remaining: rem };
}

function deductBudget(nodeId, used) {
  let cur = NODES.get(nodeId);
  let depth = 0;
  while (cur && depth < 20) {
    cur.budgetUsed += used;
    cur = cur.parentId ? NODES.get(cur.parentId) : null;
    depth++;
  }
}

// ── Budget disponible réel d'un nœud (plafonné par toute la chaîne amont) ─────
function effectiveBudget(nodeId) {
  const node = NODES.get(nodeId);
  if (!node) return 0;
  let mine = node.budgetTotal - node.budgetUsed;
  // Vérifier que chaque ancêtre a aussi du budget
  let cur = node.parentId ? NODES.get(node.parentId) : null;
  let depth = 0;
  while (cur && depth < 20) {
    const parentRem = cur.budgetTotal - cur.budgetUsed;
    mine = Math.min(mine, parentRem);
    cur = cur.parentId ? NODES.get(cur.parentId) : null;
    depth++;
  }
  return Math.max(0, mine);
}

// ══════════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';
    const h      = cors(origin);
    const ip     = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const path = url.pathname;

    try {

      // ══════════════════════════════════════════
      //  1. ENREGISTREMENT ROOT (B renseigne sa clé)
      //     La clé est stockée dans le node en mémoire
      //     En prod : utiliser env.MASTER_KEY stocké dans Cloudflare Secrets
      // ══════════════════════════════════════════
      if (path === '/api/register-root' && request.method === 'POST') {
        const { apiKey, label, budgetTokens, deviceHash } = await request.json();

        if (!apiKey || !apiKey.startsWith('sk-ant-')) {
          return json({ error: 'invalid_key' }, 400, h);
        }

        const keyHash = await sha256(apiKey);

        // Vérifier si ce device a déjà un node root — retourner le même
        if (deviceHash) {
          const existingNodeId = DEVICES.get(deviceHash);
          if (existingNodeId) {
            const existing = NODES.get(existingNodeId);
            if (existing && existing.role === 'root') {
              // Met à jour la clé si changée
              existing._apiKey = apiKey;
              existing.label   = label || existing.label;
              const tok = [...TOKENS.values()].find(t => t.nodeId === existingNodeId && t.active);
              if (tok) {
                log('reregister_root', existingNodeId, label);
                return json({ ok: true, nodeId: existingNodeId, tokenId: tok.tokenId, keyHash: keyHash.slice(0,16), budgetTotal: existing.budgetTotal }, 200, h);
              }
            }
          }
        }

        const nodeId  = uid('node_');
        const tokenId = uid('tok_');

        NODES.set(nodeId, {
          nodeId,
          parentId: null,
          label:    label || 'Root',
          role:     'root',
          budgetTotal: budgetTokens || 1000000,
          budgetUsed:  0,
          _apiKey:  apiKey,
          keyHash:  keyHash.slice(0, 16),
          ts: isoNow(),
        });

        TOKENS.set(tokenId, {
          tokenId,
          nodeId,
          scope:     'admin',
          expiresAt: now() + 365 * 24 * 3600 * 1000, // 1 an
          active:    true,
        });

        if (deviceHash) DEVICES.set(deviceHash, nodeId);

        log('register_root', nodeId, label);
        return json({ ok: true, nodeId, tokenId, keyHash: keyHash.slice(0,16), budgetTotal: budgetTokens || 1000000 }, 200, h);
      }

      // ══════════════════════════════════════════
      //  2. GÉNÉRER UN CODE (B → A, A → C, etc.)
      //     Budget plafonné automatiquement au disponible réel
      // ══════════════════════════════════════════
      if (path === '/api/generate-code' && request.method === 'POST') {
        const { tokenId, nodeId, label, budgetTokens, expiresInHours, maxChildren, deviceHash } = await request.json();

        const v = validateToken(tokenId, nodeId);
        if (!v.ok) return json({ error: v.reason }, 403, h);

        // Valider device binding
        if (deviceHash && !validateDevice(nodeId, deviceHash)) {
          return json({ error: 'device_not_bound' }, 403, h);
        }

        const ownerNode = NODES.get(nodeId);
        if (!ownerNode) return json({ error: 'node_not_found' }, 404, h);

        // Budget réel disponible (plafonné par toute la chaîne amont)
        const available = effectiveBudget(nodeId);
        if (available <= 0) return json({ error: 'no_budget_to_delegate', available: 0 }, 400, h);

        // Plafonnement automatique — jamais plus que le disponible
        const budget     = Math.min(budgetTokens || 10000, available);
        const expiresAt  = now() + (expiresInHours || 24) * 3600 * 1000;

        // Code 6 chars lisible (sans 0/O/I/1 pour éviter confusions)
        const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];

        CODES.set(code, {
          code,
          ownerNodeId: nodeId,
          label:       label || 'Session',
          budgetTokens: budget,
          maxChildren:  maxChildren || 50,
          expiresAt,
          childCount:   0,
          // Map deviceHash → nodeId pour ce code (binding par device)
          deviceBindings: new Map(),
        });

        log('generate_code', nodeId, `code=${code} budget=${budget} max=${maxChildren || 50}`);
        return json({
          ok: true, code, budget, available,
          expiresAt: new Date(expiresAt).toISOString(),
        }, 200, h);
      }

      // ══════════════════════════════════════════
      //  3. REJOINDRE AVEC UN CODE
      //     Device binding : même device = même nodeId (reconnexion)
      //     Nouveau device = nouveau nodeId (si maxChildren pas atteint)
      // ══════════════════════════════════════════
      if (path === '/api/join' && request.method === 'POST') {

        // Rate limiting
        if (!checkRate(ip)) {
          return json({ error: 'rate_limited', retryAfter: 60 }, 429, h);
        }

        const { code, label, deviceHash } = await request.json();
        if (!code) return json({ error: 'missing_code' }, 400, h);

        const c = CODES.get(code.toUpperCase().trim());
        if (!c)               return json({ error: 'invalid_code' }, 404, h);
        if (now() > c.expiresAt) return json({ error: 'code_expired' }, 400, h);

        // Device binding : si ce device a déjà rejoint avec ce code → retourne le même node
        if (deviceHash && c.deviceBindings.has(deviceHash)) {
          const existingNodeId = c.deviceBindings.get(deviceHash);
          const existingNode   = NODES.get(existingNodeId);
          const existingToken  = [...TOKENS.values()].find(t => t.nodeId === existingNodeId && t.active);

          if (existingNode && existingToken) {
            log('rejoin', existingNodeId, `device=${deviceHash.slice(0,8)}`);
            return json({
              ok: true,
              nodeId:      existingNodeId,
              tokenId:     existingToken.tokenId,
              budgetTotal: existingNode.budgetTotal,
              budgetUsed:  existingNode.budgetUsed,
              expiresAt:   new Date(existingToken.expiresAt).toISOString(),
              rejoined:    true,
            }, 200, h);
          }
        }

        // Nouveau device
        if (c.childCount >= c.maxChildren) {
          return json({ error: 'code_full', max: c.maxChildren }, 400, h);
        }

        const nodeId  = uid('node_');
        const tokenId = uid('tok_');

        NODES.set(nodeId, {
          nodeId,
          parentId:    c.ownerNodeId,
          label:       label || 'Consumer',
          role:        'consumer',
          budgetTotal: c.budgetTokens,
          budgetUsed:  0,
          ts: isoNow(),
        });

        TOKENS.set(tokenId, {
          tokenId,
          nodeId,
          scope:     'llm.use',
          expiresAt: c.expiresAt,
          active:    true,
        });

        c.childCount++;
        if (deviceHash) {
          c.deviceBindings.set(deviceHash, nodeId);
          DEVICES.set(deviceHash, nodeId);
        }

        log('join', nodeId, `code=${code} device=${(deviceHash||'?').slice(0,8)}`);
        return json({
          ok: true, nodeId, tokenId,
          budgetTotal: c.budgetTokens,
          budgetUsed:  0,
          expiresAt:   new Date(c.expiresAt).toISOString(),
          rejoined:    false,
        }, 200, h);
      }

      // ══════════════════════════════════════════
      //  4. APPEL LLM — proxy Anthropic
      // ══════════════════════════════════════════
      if (path === '/api/llm' && request.method === 'POST') {
        const { tokenId, nodeId, messages, system, maxTokens, model, stream, deviceHash } = await request.json();

        const v = validateToken(tokenId, nodeId);
        if (!v.ok) return json({ error: v.reason }, 403, h);

        // Device binding check
        if (deviceHash && DEVICES.has(deviceHash) && DEVICES.get(deviceHash) !== nodeId) {
          return json({ error: 'device_mismatch' }, 403, h);
        }

        const bCheck = checkBudget(nodeId, 1);
        if (!bCheck.ok) return json({ error: bCheck.reason, remaining: bCheck.remaining }, 429, h);

        const root   = findRoot(nodeId);
        const apiKey = root?._apiKey || env.MASTER_KEY;
        if (!apiKey) return json({ error: 'no_api_key_in_chain' }, 500, h);

        const requested = Math.min(maxTokens || 1024, 4096);
        const body = {
          model:      model || 'claude-opus-4-5',
          max_tokens: requested,
          messages:   messages || [],
          system:     system || 'You are a helpful assistant.',
        };

        if (stream) {
          const up = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type':    'application/json',
              'x-api-key':       apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({ ...body, stream: true }),
          });
          if (!up.ok) { log('llm_error', nodeId, 'stream_fail'); return json({ error: 'upstream_error' }, 502, h); }
          deductBudget(nodeId, 150); // estimation streaming
          log('llm_stream', nodeId, `model=${body.model}`);
          return new Response(up.body, {
            headers: { ...h, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          });
        }

        const up = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':    'application/json',
            'x-api-key':       apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });

        if (!up.ok) {
          const err = await up.text();
          log('llm_error', nodeId, err.slice(0, 100));
          return json({ error: 'upstream_error', detail: err.slice(0, 200) }, 502, h);
        }

        const data       = await up.json();
        const usedTokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
        deductBudget(nodeId, usedTokens);
        log('llm_call', nodeId, `used=${usedTokens} model=${body.model}`);

        const node = NODES.get(nodeId);
        return json({
          content: data.content,
          usage: {
            used:      usedTokens,
            nodeUsed:  node?.budgetUsed,
            nodeTotal: node?.budgetTotal,
            remaining: (node?.budgetTotal || 0) - (node?.budgetUsed || 0),
          },
        }, 200, h);
      }

      // ══════════════════════════════════════════
      //  5. STATUT — dashboard (retourne aussi le budget max délégable)
      // ══════════════════════════════════════════
      if (path === '/api/status' && request.method === 'POST') {
        const { tokenId, nodeId, deviceHash } = await request.json();
        const v = validateToken(tokenId, nodeId);
        if (!v.ok) return json({ error: v.reason }, 403, h);

        // Device binding check
        if (deviceHash && DEVICES.has(deviceHash) && DEVICES.get(deviceHash) !== nodeId) {
          return json({ error: 'device_mismatch' }, 403, h);
        }

        const node     = NODES.get(nodeId);
        const children = [...NODES.values()].filter(n => n.parentId === nodeId).map(n => ({
          nodeId: n.nodeId, label: n.label,
          budgetTotal: n.budgetTotal, budgetUsed: n.budgetUsed, ts: n.ts,
        }));
        const parent = node.parentId ? NODES.get(node.parentId) : null;
        const codes  = [...CODES.values()]
          .filter(c => c.ownerNodeId === nodeId && now() < c.expiresAt)
          .map(c => ({
            code: c.code, label: c.label,
            budgetTokens: c.budgetTokens, childCount: c.childCount,
            maxChildren: c.maxChildren,
            expiresAt: new Date(c.expiresAt).toISOString(),
          }));
        const myAudit = AUDIT.filter(a => a.nodeId === nodeId).slice(0, 30);

        // Budget max délégable = ce que ce nœud peut encore donner
        const maxDelegatable = effectiveBudget(nodeId);

        return json({
          node: {
            nodeId: node.nodeId, label: node.label, role: node.role,
            budgetTotal: node.budgetTotal, budgetUsed: node.budgetUsed,
            remaining: node.budgetTotal - node.budgetUsed,
            maxDelegatable,
            ts: node.ts,
          },
          parent:   parent ? { nodeId: parent.nodeId, label: parent.label } : null,
          children, codes, audit: myAudit,
        }, 200, h);
      }

      // ══════════════════════════════════════════
      //  6. RÉVOQUER un code ou un token enfant
      // ══════════════════════════════════════════
      if (path === '/api/revoke' && request.method === 'POST') {
        const { tokenId, nodeId, revokeCode, revokeNodeId, deviceHash } = await request.json();
        const v = validateToken(tokenId, nodeId);
        if (!v.ok) return json({ error: v.reason }, 403, h);

        if (deviceHash && DEVICES.has(deviceHash) && DEVICES.get(deviceHash) !== nodeId) {
          return json({ error: 'device_mismatch' }, 403, h);
        }

        if (revokeCode) {
          const c = CODES.get(revokeCode.toUpperCase());
          if (c && c.ownerNodeId === nodeId) {
            c.expiresAt = 0;
            log('revoke_code', nodeId, revokeCode);
          }
        }

        if (revokeNodeId) {
          // Révoque tous les tokens du nœud enfant (vérifie que nodeId est bien le parent)
          const target = NODES.get(revokeNodeId);
          if (target && target.parentId === nodeId) {
            TOKENS.forEach(t => { if (t.nodeId === revokeNodeId) t.active = false; });
            log('revoke_node', nodeId, revokeNodeId);
          }
        }

        return json({ ok: true }, 200, h);
      }

      // ══════════════════════════════════════════
      //  7. BRIDGE AUTH (bridge local Node.js)
      // ══════════════════════════════════════════
      if (path === '/api/bridge-auth' && request.method === 'POST') {
        const { bridgeToken, workerSecret } = await request.json();
        if (workerSecret !== env.WORKER_SECRET) return json({ error: 'forbidden' }, 403, h);
        const [nodeId, tokenId] = (bridgeToken || '').split(':');
        const v = validateToken(tokenId, nodeId);
        if (!v.ok) return json({ error: v.reason }, 403, h);
        const node = NODES.get(nodeId);
        return json({
          ok: true, nodeId, label: node?.label,
          budgetRemaining: effectiveBudget(nodeId),
          workerUrl: url.origin,
        }, 200, h);
      }

      return json({ error: 'not_found' }, 404, h);

    } catch (e) {
      return json({ error: 'internal', detail: e.message }, 500, h);
    }
  },
};
