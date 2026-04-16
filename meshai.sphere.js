/* meshai.sphere.js — MeshAI — Délégation de capacités Anthropic en cascade
   Modèle : sphere plugin YourMine (même API que poker.sphere.js)
   Usage  : charger ce fichier dans le PWA, il s'enregistre dans window.YM_S
*/
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  // ── Config worker (à adapter) ──────────────────────────────────────────────
  const WORKER_URL = (window.MESHAI_WORKER_URL || 'https://meshai-worker.YOUR_ACCOUNT.workers.dev');

  // ── Persistance locale ─────────────────────────────────────────────────────
  const SK = 'meshai_node_v2';
  function loadNode()  { try { return JSON.parse(localStorage.getItem(SK) || 'null'); } catch { return null; } }
  function saveNode(n) { localStorage.setItem(SK, JSON.stringify(n)); }
  function clearNode() { localStorage.removeItem(SK); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _ctx   = null;
  let _node  = loadNode(); // { nodeId, tokenId, label, role, budgetTotal, budgetUsed, expiresAt }
  let _status = null;      // dernière réponse /api/status
  let _refresh = null;     // callback pour re-render le panel

  // ── API helpers ────────────────────────────────────────────────────────────
  async function api(path, body) {
    const r = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function registerRoot(apiKey, label, budget) {
    const r = await api('/api/register-root', { apiKey, label, budgetTokens: budget });
    if (r.error) throw new Error(r.error);
    _node = { nodeId: r.nodeId, tokenId: r.tokenId, label, role: 'root', budgetTotal: budget, budgetUsed: 0 };
    saveNode(_node);
    await refreshStatus();
    return _node;
  }

  async function joinWithCode(code, label) {
    const r = await api('/api/join', { code: code.toUpperCase().trim(), label });
    if (r.error) throw new Error(r.error);
    _node = {
      nodeId: r.nodeId, tokenId: r.tokenId, label: label || 'Consumer',
      role: 'consumer', budgetTotal: r.budgetTotal, budgetUsed: 0,
      expiresAt: r.expiresAt,
    };
    saveNode(_node);
    await refreshStatus();
    return _node;
  }

  async function generateCode(label, budget, hours, maxChildren) {
    if (!_node) throw new Error('not_registered');
    const r = await api('/api/generate-code', {
      tokenId: _node.tokenId, nodeId: _node.nodeId,
      label, budgetTokens: budget, expiresInHours: hours, maxChildren,
    });
    if (r.error) throw new Error(r.error);
    return r;
  }

  async function refreshStatus() {
    if (!_node) return;
    const r = await api('/api/status', { tokenId: _node.tokenId, nodeId: _node.nodeId });
    if (r.error) return;
    _status = r;
    if (_node) {
      _node.budgetUsed  = r.node.budgetUsed;
      _node.budgetTotal = r.node.budgetTotal;
      saveNode(_node);
    }
    _refresh?.();
  }

  async function revokeCode(code) {
    if (!_node) return;
    await api('/api/revoke', { tokenId: _node.tokenId, nodeId: _node.nodeId, revokeCode: code });
    await refreshStatus();
  }

  // ── LLM public (utilisé par l'extension et le bridge) ─────────────────────
  // Exposé sur window.MeshAI.llm pour que n'importe quelle page puisse l'appeler
  async function llm(messages, opts = {}) {
    if (!_node) throw new Error('no_mesh_node');
    const r = await api('/api/llm', {
      tokenId: _node.tokenId, nodeId: _node.nodeId,
      messages, system: opts.system, maxTokens: opts.maxTokens || 1024,
      model: opts.model, stream: false,
    });
    if (r.error) throw new Error(r.error);
    if (r.usage) {
      _node.budgetUsed = r.usage.nodeUsed || _node.budgetUsed;
      saveNode(_node);
    }
    return r;
  }

  // Streaming — retourne un ReadableStream d'events SSE
  async function llmStream(messages, opts = {}) {
    if (!_node) throw new Error('no_mesh_node');
    const r = await fetch(WORKER_URL + '/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: _node.tokenId, nodeId: _node.nodeId,
        messages, system: opts.system, maxTokens: opts.maxTokens || 2048,
        model: opts.model, stream: true,
      }),
    });
    if (!r.ok) throw new Error('stream_error');
    return r.body;
  }

  // ── Helpers UI ─────────────────────────────────────────────────────────────
  function pct() {
    if (!_node || !_node.budgetTotal) return 0;
    return Math.round((_node.budgetUsed / _node.budgetTotal) * 100);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtNum(n) { return (n || 0).toLocaleString('fr'); }

  function roleLabel(role) {
    return role === 'root' ? '⬡ root (B)' : role === 'consumer' ? '◎ consumer' : '—';
  }

  function budgetColor(p) {
    if (p > 85) return '#f06a6a';
    if (p > 60) return '#f0a84a';
    return '#4fd1a0';
  }

  // ── renderPanel ────────────────────────────────────────────────────────────
  function renderPanel(container) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg,#0a0a0f)';

    if (!_node) {
      renderOnboarding(container);
    } else {
      renderDashboard(container);
    }
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  function renderOnboarding(container) {
    container.innerHTML = `
      <div style="flex:1;overflow-y:auto;padding:20px">
        <div style="margin-bottom:20px">
          <div style="font-size:20px;font-weight:600;margin-bottom:4px">MeshAI</div>
          <div style="font-size:12px;color:var(--text3,#666)">Délégation de capacités Anthropic</div>
        </div>

        <div id="mesh-tab-onboard" style="display:flex;gap:6px;margin-bottom:16px">
          <button data-tab="join"  class="ym-btn ym-btn-accent" style="flex:1;font-size:12px" id="mesh-btn-join">J'ai un code</button>
          <button data-tab="root" class="ym-btn ym-btn-ghost"  style="flex:1;font-size:12px" id="mesh-btn-root">Je fournis la clé</button>
        </div>

        <div id="mesh-pane-join">
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Code de session (donné par B)</label>
            <input id="mesh-code-input" class="ym-input" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:3px;font-size:18px;text-align:center;width:100%">
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Ton nom / label</label>
            <input id="mesh-join-label" class="ym-input" placeholder="Mon poste" style="width:100%">
          </div>
          <button id="mesh-do-join" class="ym-btn ym-btn-accent" style="width:100%">Rejoindre →</button>
          <div id="mesh-join-err" style="font-size:11px;color:#f06a6a;margin-top:6px;display:none"></div>
        </div>

        <div id="mesh-pane-root" style="display:none">
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Clé Anthropic (sk-ant-…)</label>
            <input id="mesh-api-key" class="ym-input" type="password" placeholder="sk-ant-..." style="width:100%;font-family:monospace">
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Label</label>
            <input id="mesh-root-label" class="ym-input" placeholder="Mon compte Anthropic" style="width:100%">
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Budget total (tokens)</label>
            <input id="mesh-root-budget" class="ym-input" type="number" value="1000000" style="width:100%">
          </div>
          <button id="mesh-do-root" class="ym-btn ym-btn-accent" style="width:100%">Enregistrer →</button>
          <div id="mesh-root-err" style="font-size:11px;color:#f06a6a;margin-top:6px;display:none"></div>
        </div>
      </div>
    `;

    // Tab switch
    container.querySelector('#mesh-btn-join').addEventListener('click', () => {
      container.querySelector('#mesh-pane-join').style.display = 'block';
      container.querySelector('#mesh-pane-root').style.display = 'none';
      container.querySelector('#mesh-btn-join').className = 'ym-btn ym-btn-accent';
      container.querySelector('#mesh-btn-root').className = 'ym-btn ym-btn-ghost';
    });
    container.querySelector('#mesh-btn-root').addEventListener('click', () => {
      container.querySelector('#mesh-pane-join').style.display = 'none';
      container.querySelector('#mesh-pane-root').style.display = 'block';
      container.querySelector('#mesh-btn-root').className = 'ym-btn ym-btn-accent';
      container.querySelector('#mesh-btn-join').className = 'ym-btn ym-btn-ghost';
    });

    // Join
    container.querySelector('#mesh-do-join').addEventListener('click', async () => {
      const code  = container.querySelector('#mesh-code-input').value.trim();
      const label = container.querySelector('#mesh-join-label').value.trim() || 'Consumer';
      const errEl = container.querySelector('#mesh-join-err');
      if (code.length < 4) { errEl.textContent = 'Code invalide'; errEl.style.display = 'block'; return; }
      try {
        errEl.style.display = 'none';
        container.querySelector('#mesh-do-join').textContent = '…';
        await joinWithCode(code, label);
        renderPanel(container);
        window.YM_toast?.('MeshAI activé ✓', 'success');
      } catch (e) {
        errEl.textContent = e.message; errEl.style.display = 'block';
        container.querySelector('#mesh-do-join').textContent = 'Rejoindre →';
      }
    });

    // Root
    container.querySelector('#mesh-do-root').addEventListener('click', async () => {
      const key    = container.querySelector('#mesh-api-key').value.trim();
      const label  = container.querySelector('#mesh-root-label').value.trim() || 'Root';
      const budget = parseInt(container.querySelector('#mesh-root-budget').value) || 1_000_000;
      const errEl  = container.querySelector('#mesh-root-err');
      if (!key.startsWith('sk-ant-')) { errEl.textContent = 'Clé invalide'; errEl.style.display = 'block'; return; }
      try {
        errEl.style.display = 'none';
        container.querySelector('#mesh-do-root').textContent = '…';
        await registerRoot(key, label, budget);
        renderPanel(container);
        window.YM_toast?.('Compte root enregistré ✓', 'success');
      } catch (e) {
        errEl.textContent = e.message; errEl.style.display = 'block';
        container.querySelector('#mesh-do-root').textContent = 'Enregistrer →';
      }
    });
  }

  // ── Dashboard principal ────────────────────────────────────────────────────
  function renderDashboard(container) {
    _refresh = () => renderDashboard(container);
    const p = pct();
    const bc = budgetColor(p);
    const node = _node;
    const s = _status;

    container.innerHTML = `
      <div style="flex:1;overflow-y:auto;padding:16px">

        <!-- Identité -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:10px;border:1px solid rgba(255,255,255,.07)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.label)}</div>
            <div style="font-size:10px;color:var(--text3,#666);margin-top:1px">${roleLabel(node.role)} · ${esc(node.nodeId.slice(0, 14))}…</div>
          </div>
          <button id="mesh-logout" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:3px 8px;color:#f06a6a;border-color:rgba(240,106,106,.3)">✕ quitter</button>
        </div>

        <!-- Budget -->
        <div style="margin-bottom:16px;padding:12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:10px;border:1px solid rgba(255,255,255,.07)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <span style="font-size:11px;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em">Budget tokens</span>
            <span style="font-size:11px;color:${bc};font-weight:600">${p}%</span>
          </div>
          <div style="height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-bottom:6px">
            <div style="height:100%;width:${p}%;background:${bc};border-radius:3px;transition:width .3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3,#666)">
            <span>${fmtNum(node.budgetUsed)} utilisés</span>
            <span>${fmtNum(node.budgetTotal - node.budgetUsed)} restants</span>
          </div>
        </div>

        <!-- Amont (parent) -->
        ${s?.parent ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:rgba(124,106,247,.08);border-radius:8px;border:1px solid rgba(124,106,247,.2)">
          <div style="font-size:10px;color:#7c6af7;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Délégation reçue de</div>
          <div style="font-size:12px;font-weight:500">${esc(s.parent.label)}</div>
        </div>` : ''}

        <!-- Aval (enfants) -->
        ${s?.children?.length ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:rgba(79,209,160,.06);border-radius:8px;border:1px solid rgba(79,209,160,.15)">
          <div style="font-size:10px;color:#4fd1a0;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Délégations actives (${s.children.length})</div>
          ${s.children.map(c => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.label)}</div>
              <div style="font-size:10px;color:var(--text3,#666)">${fmtNum(c.budgetUsed)}/${fmtNum(c.budgetTotal)}</div>
            </div>
          `).join('')}
        </div>` : ''}

        <!-- Codes actifs -->
        ${s?.codes?.length ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07)">
          <div style="font-size:10px;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Codes actifs</div>
          ${s.codes.map(c => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <div style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:2px;color:#4fd1a0">${esc(c.code)}</div>
              <div style="flex:1;font-size:10px;color:var(--text3,#666)">${esc(c.label)} · ${fmtNum(c.budgetTokens)} tok · ${c.childCount} rejoints</div>
              <button data-revoke="${esc(c.code)}" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:2px 6px;color:#f06a6a;border-color:rgba(240,106,106,.3)">✕</button>
            </div>
          `).join('')}
        </div>` : ''}

        <!-- Bouton générer code -->
        <button id="mesh-gen-code" class="ym-btn ym-btn-accent" style="width:100%;margin-bottom:10px">+ Générer un code de session</button>

        <!-- Formulaire code (caché par défaut) -->
        <div id="mesh-gen-form" style="display:none;padding:12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07);margin-bottom:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Label</label>
              <input id="mesh-gen-label" class="ym-input" placeholder="Pour Thomas" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Budget (tokens)</label>
              <input id="mesh-gen-budget" class="ym-input" type="number" value="10000" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Durée (heures)</label>
              <input id="mesh-gen-hours" class="ym-input" type="number" value="24" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Max utilisateurs</label>
              <input id="mesh-gen-max" class="ym-input" type="number" value="5" style="width:100%;font-size:12px">
            </div>
          </div>
          <button id="mesh-gen-confirm" class="ym-btn ym-btn-accent" style="width:100%;font-size:12px">Créer le code →</button>
          <div id="mesh-gen-result" style="display:none;margin-top:10px;text-align:center">
            <div style="font-size:36px;font-weight:700;letter-spacing:6px;color:#4fd1a0;font-family:monospace" id="mesh-gen-code-display"></div>
            <div style="font-size:11px;color:var(--text3,#666);margin-top:4px">Donne ce code à l'autre utilisateur</div>
            <button id="mesh-gen-copy" class="ym-btn ym-btn-ghost" style="margin-top:8px;font-size:11px;width:100%">Copier le code</button>
          </div>
        </div>

        <!-- Audit -->
        ${s?.audit?.length ? `
        <div style="padding:10px 12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07)">
          <div style="font-size:10px;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Activité récente</div>
          ${s.audit.slice(0, 6).map(a => `
            <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <div style="font-size:10px;color:var(--text3,#666);flex:1">${esc(a.action)} · ${esc(a.detail)}</div>
              <div style="font-size:9px;color:var(--text3,#666);flex-shrink:0">${new Date(a.ts).toLocaleTimeString('fr')}</div>
            </div>
          `).join('')}
        </div>` : ''}

      </div>

      <div style="flex-shrink:0;border-top:1px solid rgba(255,255,255,.07);padding:10px;display:flex;justify-content:center">
        <button id="mesh-refresh" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">↻ Actualiser</button>
      </div>
    `;

    // Events
    container.querySelector('#mesh-logout').addEventListener('click', () => {
      if (!confirm('Quitter MeshAI ? (ton node sera déconnecté)')) return;
      clearNode(); _node = null; _status = null;
      renderPanel(container);
    });

    container.querySelector('#mesh-refresh').addEventListener('click', () => refreshStatus());

    container.querySelector('#mesh-gen-code').addEventListener('click', () => {
      const f = container.querySelector('#mesh-gen-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });

    container.querySelector('#mesh-gen-confirm').addEventListener('click', async () => {
      const label  = container.querySelector('#mesh-gen-label').value || 'Session';
      const budget = parseInt(container.querySelector('#mesh-gen-budget').value) || 10000;
      const hours  = parseInt(container.querySelector('#mesh-gen-hours').value) || 24;
      const max    = parseInt(container.querySelector('#mesh-gen-max').value) || 5;
      try {
        container.querySelector('#mesh-gen-confirm').textContent = '…';
        const r = await generateCode(label, budget, hours, max);
        container.querySelector('#mesh-gen-result').style.display = 'block';
        container.querySelector('#mesh-gen-code-display').textContent = r.code;
        container.querySelector('#mesh-gen-confirm').textContent = 'Créer →';
        await refreshStatus();
      } catch (e) {
        window.YM_toast?.(e.message, 'error');
        container.querySelector('#mesh-gen-confirm').textContent = 'Créer →';
      }
    });

    container.querySelector('#mesh-gen-copy')?.addEventListener('click', () => {
      const code = container.querySelector('#mesh-gen-code-display')?.textContent;
      if (code) navigator.clipboard.writeText(code).then(() => window.YM_toast?.('Copié !', 'success'));
    });

    container.querySelectorAll('[data-revoke]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await revokeCode(btn.dataset.revoke);
        window.YM_toast?.('Code révoqué', 'success');
      });
    });

    refreshStatus();
  }

  // ── profileSection ─────────────────────────────────────────────────────────
  function profileSection(container) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;gap:8px';
    if (_node) {
      const p = pct();
      el.innerHTML =
        '<span style="font-size:14px">⬡</span>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(_node.label) + '</div>' +
        '<div style="font-size:10px;color:var(--text3,#666)">' + fmtNum(_node.budgetTotal - _node.budgetUsed) + ' tokens restants · ' + p + '%</div>' +
        '</div>' +
        '<button id="mesh-ps-open" class="ym-btn ym-btn-ghost" style="font-size:11px">Ouvrir</button>';
    } else {
      el.innerHTML =
        '<span style="font-size:14px">⬡</span>' +
        '<div style="flex:1;font-size:12px;color:var(--text3,#666)">MeshAI — non configuré</div>' +
        '<button id="mesh-ps-open" class="ym-btn ym-btn-accent" style="font-size:11px">Configurer</button>';
    }
    el.querySelector('#mesh-ps-open').addEventListener('click', () => window.YM?.openSpherePanel?.('meshai.sphere.js'));
    container.appendChild(el);
  }

  // ── Enregistrement sphere ──────────────────────────────────────────────────
  window.YM_S['meshai.sphere.js'] = {
    name: 'MeshAI',
    icon: '⬡',
    category: 'AI',
    description: 'Délégation de capacités Anthropic en cascade — codes de session, budgets, graphe B→A→C',
    emit: [],
    receive: [],

    activate(ctx) {
      _ctx = ctx;
      refreshStatus();
    },
    deactivate() { _ctx = null; _refresh = null; },
    renderPanel,
    profileSection,
  };

  // ── API publique globale ───────────────────────────────────────────────────
  // Utilisée par l'extension Chrome et le bridge local
  window.MeshAI = {
    llm,
    llmStream,
    getNode: () => _node,
    getWorkerUrl: () => WORKER_URL,
    isReady: () => !!_node,
    generateCode,
    refreshStatus,
  };

})();
