/* meshai.sphere.js — MeshAI v2
   Modèle : sphere plugin YourMine (même API que poker.sphere.js)
   Nouveautés v2 : device binding, budget plafonné au disponible réel, multi-codes
*/
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const WORKER_URL = (window.MESHAI_WORKER_URL || 'https://yourmine-worker.yourminedapp.workers.dev');
  const SK = 'meshai_node_v2';

  function loadNode()  { try { return JSON.parse(localStorage.getItem(SK) || 'null'); } catch { return null; } }
  function saveNode(n) { localStorage.setItem(SK, JSON.stringify(n)); }
  function clearNode() { localStorage.removeItem(SK); }

  let _ctx        = null;
  let _node       = loadNode();
  let _status     = null;
  let _refresh    = null;
  let _deviceHash = null;

  // ── Device fingerprint SHA-256 ─────────────────────────────────────────────
  async function getDeviceHash() {
    if (_deviceHash) return _deviceHash;
    const raw = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
    ].join('|');
    const buf   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    _deviceHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 32);
    return _deviceHash;
  }

  // ── API (deviceHash automatiquement ajouté) ────────────────────────────────
  async function api(path, body) {
    const dh = await getDeviceHash();
    const r  = await fetch(WORKER_URL + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, deviceHash: dh }),
    });
    return r.json();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function registerRoot(apiKey, label, budget) {
    const r = await api('/api/register-root', { apiKey, label, budgetTokens: budget });
    if (r.error) throw new Error(r.error);
    _node = { nodeId: r.nodeId, tokenId: r.tokenId, label, role: 'root', budgetTotal: r.budgetTotal || budget, budgetUsed: 0 };
    saveNode(_node);
    await refreshStatus();
    return _node;
  }

  async function joinWithCode(code, label) {
    const r = await api('/api/join', { code: code.toUpperCase().trim(), label });
    if (r.error) throw new Error(r.error);
    _node = {
      nodeId:      r.nodeId,
      tokenId:     r.tokenId,
      label:       label || 'Consumer',
      role:        'consumer',
      budgetTotal: r.budgetTotal,
      budgetUsed:  r.budgetUsed || 0,
      expiresAt:   r.expiresAt,
    };
    saveNode(_node);
    await refreshStatus();
    return _node;
  }

  async function generateCode(label, budget, hours, maxChildren) {
    if (!_node) throw new Error('not_registered');
    // budget est déjà plafonné côté worker, mais on plafonne aussi localement
    const maxDelegatable = _status?.node?.maxDelegatable ?? (_node.budgetTotal - _node.budgetUsed);
    const safeBudget = Math.min(budget || 10000, maxDelegatable);
    const r = await api('/api/generate-code', {
      tokenId:      _node.tokenId,
      nodeId:       _node.nodeId,
      label,
      budgetTokens: safeBudget,
      expiresInHours: hours,
      maxChildren,
    });
    if (r.error) throw new Error(r.error);
    return r;
  }

  async function refreshStatus() {
    if (!_node) return;
    const r = await api('/api/status', { tokenId: _node.tokenId, nodeId: _node.nodeId });
    if (r.error) return;
    _status = r;
    _node.budgetUsed      = r.node.budgetUsed;
    _node.budgetTotal     = r.node.budgetTotal;
    _node.maxDelegatable  = r.node.maxDelegatable;
    saveNode(_node);
    _refresh?.();
  }

  async function revokeCode(code) {
    if (!_node) return;
    await api('/api/revoke', { tokenId: _node.tokenId, nodeId: _node.nodeId, revokeCode: code });
    await refreshStatus();
  }

  // ── LLM public ────────────────────────────────────────────────────────────

  async function fetchSubtree() {
    if (!_node) return null;
    const r = await api('/api/subtree', { tokenId: _node.tokenId, nodeId: _node.nodeId });
    if (r.error) return null;
    return r;
  }

  async function llm(messages, opts = {}) {
    if (!_node) throw new Error('no_mesh_node');
    const r = await api('/api/llm', {
      tokenId: _node.tokenId, nodeId: _node.nodeId,
      messages, system: opts.system, maxTokens: opts.maxTokens || 1024,
      model: opts.model, stream: false,
    });
    if (r.error) throw new Error(r.error);
    if (r.usage) { _node.budgetUsed = r.usage.nodeUsed || _node.budgetUsed; saveNode(_node); }
    return r;
  }

  async function llmStream(messages, opts = {}) {
    if (!_node) throw new Error('no_mesh_node');
    const dh = await getDeviceHash();
    const r  = await fetch(WORKER_URL + '/api/llm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tokenId: _node.tokenId, nodeId: _node.nodeId,
        messages, system: opts.system, maxTokens: opts.maxTokens || 2048,
        model: opts.model, stream: true, deviceHash: dh,
      }),
    });
    if (!r.ok) throw new Error('stream_error');
    return r.body;
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function pct() {
    if (!_node || !_node.budgetTotal) return 0;
    return Math.round((_node.budgetUsed / _node.budgetTotal) * 100);
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtNum(n) { return (n || 0).toLocaleString('fr'); }
  function roleLabel(role) {
    return role === 'root' ? '⬡ root (B)' : '◎ consumer';
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
    if (!_node) renderOnboarding(container);
    else renderDashboard(container);
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  function renderOnboarding(container) {
    container.innerHTML = `
      <div style="flex:1;overflow-y:auto;padding:20px">
        <div style="margin-bottom:20px">
          <div style="font-size:20px;font-weight:600;margin-bottom:4px">MeshAI</div>
          <div style="font-size:12px;color:var(--text3,#666)">Délégation de capacités Anthropic</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:16px">
          <button class="ym-btn ym-btn-accent" style="flex:1;font-size:12px" id="mesh-btn-join">J'ai un code</button>
          <button class="ym-btn ym-btn-ghost"  style="flex:1;font-size:12px" id="mesh-btn-root">Je fournis la clé</button>
        </div>
        <div id="mesh-pane-join">
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Code de session</label>
            <input id="mesh-code-input" class="ym-input" placeholder="EX: AB3K7P" style="text-transform:uppercase;letter-spacing:3px;font-size:18px;text-align:center;width:100%">
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Ton nom</label>
            <input id="mesh-join-label" class="ym-input" placeholder="Mon poste" style="width:100%">
          </div>
          <button id="mesh-do-join" class="ym-btn ym-btn-accent" style="width:100%">Rejoindre →</button>
          <div id="mesh-join-err" style="font-size:11px;color:#f06a6a;margin-top:6px;display:none"></div>
        </div>
        <div id="mesh-pane-root" style="display:none">
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Clé Anthropic (sk-ant-…)</label>
            <div style="position:relative">
              <input id="mesh-api-key" class="ym-input" type="password" placeholder="sk-ant-..." style="width:100%;font-family:monospace;padding-right:70px">
              <span id="mesh-key-status" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:10px;font-family:monospace;pointer-events:none"></span>
            </div>
          </div>
          <div id="mesh-key-info" style="display:none;margin-bottom:10px;padding:10px;background:rgba(79,209,160,.06);border-radius:8px;border:1px solid rgba(79,209,160,.15)">
            <div style="font-size:11px;color:#4fd1a0;font-weight:600;margin-bottom:4px" id="mesh-key-tier"></div>
            <div style="font-size:10px;color:var(--text3,#666)" id="mesh-key-limit"></div>
          </div>
          <div id="mesh-key-err-probe" style="display:none;margin-bottom:10px;padding:8px 10px;background:rgba(240,106,106,.08);border-radius:8px;border:1px solid rgba(240,106,106,.2);font-size:11px;color:#f06a6a"></div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Label</label>
            <input id="mesh-root-label" class="ym-input" placeholder="Mon compte" style="width:100%">
          </div>
          <div style="margin-bottom:4px">
            <label style="font-size:11px;color:var(--text3,#666);display:block;margin-bottom:4px">Budget total (tokens) <span id="mesh-budget-hint" style="color:#4fd1a0"></span></label>
            <input id="mesh-root-budget" class="ym-input" type="number" value="" placeholder="Vérification de la clé…" disabled style="width:100%;opacity:.5">
            <div style="font-size:10px;color:var(--text3,#666);margin-top:4px">Pré-rempli automatiquement selon les limites de ton compte. Tu peux réduire pour distribuer moins.</div>
          </div>
          <button id="mesh-do-root" class="ym-btn ym-btn-accent" style="width:100%;margin-top:10px" disabled>Vérification…</button>
          <div id="mesh-root-err" style="font-size:11px;color:#f06a6a;margin-top:6px;display:none"></div>
        </div>
      </div>`;

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
        _pushBridgeConfig();
      } catch (e) {
        errEl.textContent = e.message === 'invalid_code' ? 'Code invalide ou expiré'
          : e.message === 'rate_limited' ? 'Trop de tentatives, réessaie dans 1 min'
          : e.message === 'code_full' ? 'Ce code a atteint sa limite d\'utilisateurs'
          : e.message;
        errEl.style.display = 'block';
        container.querySelector('#mesh-do-join').textContent = 'Rejoindre →';
      }
    });

    // ── Auto-vérification de la clé (debounce 800ms) ──────────────────────────
    let _keyCheckTimer = null;
    let _keyValid      = false;
    let _keySuggested  = 0;

    async function checkKeyLive(key) {
      const statusEl  = container.querySelector('#mesh-key-status');
      const infoEl    = container.querySelector('#mesh-key-info');
      const errProbe  = container.querySelector('#mesh-key-err-probe');
      const budgetEl  = container.querySelector('#mesh-root-budget');
      const hintEl    = container.querySelector('#mesh-budget-hint');
      const doBtn     = container.querySelector('#mesh-do-root');
      const tierEl    = container.querySelector('#mesh-key-tier');
      const limitEl   = container.querySelector('#mesh-key-limit');

      statusEl.textContent  = '…';
      statusEl.style.color  = 'var(--text3,#666)';
      infoEl.style.display  = 'none';
      errProbe.style.display = 'none';
      _keyValid = false;
      doBtn.disabled = true;
      budgetEl.disabled = true;
      budgetEl.style.opacity = '.5';

      if (!key || !key.startsWith('sk-ant-') || key.length < 20) {
        statusEl.textContent = key.length > 5 ? '✕' : '';
        statusEl.style.color = '#f06a6a';
        budgetEl.placeholder = 'Entrez une clé valide…';
        return;
      }

      statusEl.textContent = '⟳';
      statusEl.style.color = 'var(--text3,#666)';

      try {
        const r = await fetch(WORKER_URL + '/api/check-key', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ apiKey: key }),
        }).then(function(x){ return x.json(); });

        if (r.error) {
          statusEl.textContent = '✕';
          statusEl.style.color = '#f06a6a';
          errProbe.textContent  = r.detail || 'Clé refusée par Anthropic';
          errProbe.style.display = 'block';
          budgetEl.placeholder = '—';
          doBtn.textContent = 'Enregistrer →';
          return;
        }

        // Clé valide
        _keyValid    = true;
        _keySuggested = r.suggestedBudget || 1000000;

        statusEl.textContent = '✓';
        statusEl.style.color = '#4fd1a0';

        tierEl.textContent  = r.tier || 'Compte détecté';
        limitEl.textContent = r.tokensLimit > 0
          ? 'Limite : ' + r.tokensLimit.toLocaleString('fr') + ' tokens/min · Budget suggéré : ' + _keySuggested.toLocaleString('fr') + ' tokens'
          : 'Limites non détectées — budget par défaut appliqué';
        infoEl.style.display = 'block';

        budgetEl.value       = _keySuggested;
        budgetEl.max         = _keySuggested;
        budgetEl.disabled    = false;
        budgetEl.style.opacity = '1';
        budgetEl.placeholder = '';
        hintEl.textContent   = '(max : ' + _keySuggested.toLocaleString('fr') + ')';

        doBtn.disabled   = false;
        doBtn.textContent = 'Enregistrer →';

      } catch(e) {
        statusEl.textContent = '?';
        statusEl.style.color = '#f0a84a';
        errProbe.textContent  = 'Impossible de joindre le worker';
        errProbe.style.display = 'block';
      }
    }

    container.querySelector('#mesh-api-key').addEventListener('input', function() {
      clearTimeout(_keyCheckTimer);
      const key = this.value.trim();
      _keyCheckTimer = setTimeout(function(){ checkKeyLive(key); }, 800);
    });

    container.querySelector('#mesh-do-root').addEventListener('click', async () => {
      if (!_keyValid) return;
      const key    = container.querySelector('#mesh-api-key').value.trim();
      const label  = container.querySelector('#mesh-root-label').value.trim() || 'Root';
      const budget = parseInt(container.querySelector('#mesh-root-budget').value) || _keySuggested || 1000000;
      const errEl  = container.querySelector('#mesh-root-err');
      try {
        errEl.style.display = 'none';
        container.querySelector('#mesh-do-root').textContent = '…';
        container.querySelector('#mesh-do-root').disabled = true;
        await registerRoot(key, label, budget);
        renderPanel(container);
        window.YM_toast?.('Compte root enregistré ✓', 'success');
        _pushBridgeConfig();
      } catch (e) {
        errEl.textContent = e.message; errEl.style.display = 'block';
        container.querySelector('#mesh-do-root').textContent = 'Enregistrer →';
        container.querySelector('#mesh-do-root').disabled = false;
      }
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  function renderDashboard(container) {
    _refresh = () => renderDashboard(container);
    const p    = pct();
    const bc   = budgetColor(p);
    const node = _node;
    const s    = _status;
    const maxDel = s && s.node && s.node.maxDelegatable !== undefined
      ? s.node.maxDelegatable
      : (node.budgetTotal - node.budgetUsed);

    container.innerHTML = `
      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0">
        <button class="mesh-tab active" data-tab="dashboard" style="flex:1;padding:10px 4px;background:none;border:none;color:var(--text3,#666);font-size:11px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s">Vue</button>
        <button class="mesh-tab" data-tab="graphe" style="flex:1;padding:10px 4px;background:none;border:none;color:var(--text3,#666);font-size:11px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s">Graphe</button>
        <button class="mesh-tab" data-tab="codes" style="flex:1;padding:10px 4px;background:none;border:none;color:var(--text3,#666);font-size:11px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s">Codes</button>
      </div>
      <div id="mesh-tab-content" style="flex:1;overflow-y:auto;min-height:0">
    <div id="mesh-pane-dashboard" style="padding:16px">
      <div style="flex:1;overflow-y:auto;padding:16px">

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:10px;border:1px solid rgba(255,255,255,.07)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.label)}</div>
            <div style="font-size:10px;color:var(--text3,#666);margin-top:1px">${roleLabel(node.role)} · ${esc(node.nodeId.slice(0, 14))}…</div>
          </div>
          <button id="mesh-logout" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:3px 8px;color:#f06a6a;border-color:rgba(240,106,106,.3)">✕ quitter</button>
        </div>

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
          ${maxDel < node.budgetTotal ? `<div style="font-size:10px;color:var(--text3,#666);margin-top:4px;text-align:right">max délégable : ${fmtNum(maxDel)}</div>` : ''}
        </div>

        ${s?.parent ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:rgba(124,106,247,.08);border-radius:8px;border:1px solid rgba(124,106,247,.2)">
          <div style="font-size:10px;color:#7c6af7;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Reçu de</div>
          <div style="font-size:12px;font-weight:500">${esc(s.parent.label)}</div>
        </div>` : ''}

        ${s?.children?.length ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:rgba(79,209,160,.06);border-radius:8px;border:1px solid rgba(79,209,160,.15)">
          <div style="font-size:10px;color:#4fd1a0;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Délégations actives (${s.children.length})</div>
          ${s.children.map(c => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.label)}</div>
              <div style="font-size:10px;color:var(--text3,#666)">${fmtNum(c.budgetUsed)}/${fmtNum(c.budgetTotal)}</div>
            </div>`).join('')}
        </div>` : ''}

        ${s?.codes?.length ? `
        <div style="margin-bottom:12px;padding:10px 12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07)">
          <div style="font-size:10px;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Codes actifs</div>
          ${s.codes.map(c => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <div style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:2px;color:#4fd1a0">${esc(c.code)}</div>
              <div style="flex:1;font-size:10px;color:var(--text3,#666)">${esc(c.label)} · ${fmtNum(c.budgetTokens)} tok · ${c.childCount}/${c.maxChildren}</div>
              <button data-revoke="${esc(c.code)}" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:2px 6px;color:#f06a6a;border-color:rgba(240,106,106,.3)">✕</button>
            </div>`).join('')}
        </div>` : ''}

        <button id="mesh-gen-code" class="ym-btn ym-btn-accent" style="width:100%;margin-bottom:10px">+ Générer un code de session</button>

        <div id="mesh-gen-form" style="display:none;padding:12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07);margin-bottom:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Label</label>
              <input id="mesh-gen-label" class="ym-input" placeholder="Pour Thomas" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Budget (max : ${fmtNum(maxDel)})</label>
              <input id="mesh-gen-budget" class="ym-input" type="number" value="${Math.min(10000, maxDel)}" max="${maxDel}" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Durée (heures)</label>
              <input id="mesh-gen-hours" class="ym-input" type="number" value="24" style="width:100%;font-size:12px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text3,#666);display:block;margin-bottom:3px">Max utilisateurs</label>
              <input id="mesh-gen-max" class="ym-input" type="number" value="10" style="width:100%;font-size:12px">
            </div>
          </div>
          <button id="mesh-gen-confirm" class="ym-btn ym-btn-accent" style="width:100%;font-size:12px">Créer →</button>
          <div id="mesh-gen-result" style="display:none;margin-top:12px;text-align:center">
            <div style="font-size:36px;font-weight:700;letter-spacing:6px;color:#4fd1a0;font-family:monospace" id="mesh-gen-code-display"></div>
            <div style="font-size:11px;color:var(--text3,#666);margin-top:4px">Donne ce code à l'autre utilisateur</div>
            <button id="mesh-gen-copy" class="ym-btn ym-btn-ghost" style="margin-top:8px;font-size:11px;width:100%">Copier</button>
          </div>
        </div>

        ${s && s.audit && s.audit.length ? `
        <div style="padding:10px 12px;background:var(--card-bg,rgba(255,255,255,.04));border-radius:8px;border:1px solid rgba(255,255,255,.07)">
          <div style="font-size:10px;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Activité récente</div>
          ${s.audit.slice(0, 6).map(a =>
            '<div style=\"display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)\">' +
            '<div style=\"font-size:10px;color:var(--text3,#666);flex:1\">' + esc(a.action) + ' · ' + esc(a.detail) + '</div>' +
            '<div style=\"font-size:9px;color:var(--text3,#666);flex-shrink:0\">' + new Date(a.ts).toLocaleTimeString('fr') + '</div></div>'
          ).join('')}
        </div>` : ''}
    </div>

    <div id="mesh-pane-graphe" style="display:none;padding:16px">
      <div id="mesh-graphe-content">
        <div style="font-size:12px;color:var(--text3,#666);text-align:center;padding:20px">Chargement du graphe…</div>
      </div>
    </div>

    <div id="mesh-pane-codes" style="display:none;padding:16px">
      <div id="mesh-codes-content">
        <div style="font-size:12px;color:var(--text3,#666);text-align:center;padding:20px">Chargement…</div>
      </div>
    </div>
      </div>
      <div style="flex-shrink:0;border-top:1px solid rgba(255,255,255,.07);padding:10px">
        <button id="mesh-refresh" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">↻ Actualiser</button>
      </div>`;

    container.querySelector('#mesh-logout').addEventListener('click', () => {
      if (!confirm('Quitter MeshAI ?')) return;
      clearNode(); _node = null; _status = null;
      renderPanel(container);
    });

    container.querySelector('#mesh-refresh').addEventListener('click', refreshStatus);

    container.querySelector('#mesh-gen-code').addEventListener('click', () => {
      const f = container.querySelector('#mesh-gen-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });

    container.querySelector('#mesh-gen-confirm').addEventListener('click', async () => {
      const label  = container.querySelector('#mesh-gen-label').value || 'Session';
      const budget = Math.min(
        parseInt(container.querySelector('#mesh-gen-budget').value) || 10000,
        maxDel
      );
      const hours  = parseInt(container.querySelector('#mesh-gen-hours').value) || 24;
      const max    = parseInt(container.querySelector('#mesh-gen-max').value) || 10;
      try {
        container.querySelector('#mesh-gen-confirm').textContent = '…';
        const r = await generateCode(label, budget, hours, max);
        container.querySelector('#mesh-gen-result').style.display = 'block';
        container.querySelector('#mesh-gen-code-display').textContent = r.code;
        container.querySelector('#mesh-gen-confirm').textContent = 'Créer →';
        window.YM_toast?.('Code créé : ' + r.code, 'success');
        await refreshStatus();
      } catch (e) {
        window.YM_toast?.(e.message, 'error');
        container.querySelector('#mesh-gen-confirm').textContent = 'Créer →';
      }
    });

    container.querySelector('#mesh-gen-copy') && container.querySelector('#mesh-gen-copy').addEventListener('click', function() {
      var code = container.querySelector('#mesh-gen-code-display') && container.querySelector('#mesh-gen-code-display').textContent;
      if (code) navigator.clipboard.writeText(code).then(function(){ window.YM_toast && window.YM_toast('Copié !', 'success'); });
    });

    container.querySelectorAll('[data-revoke]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await revokeCode(btn.dataset.revoke);
        window.YM_toast && window.YM_toast('Code révoqué', 'success');
      });
    });

    // ── Onglets ────────────────────────────────────────────────────────────────
    var tabs    = container.querySelectorAll('.mesh-tab');
    var panes   = { dashboard: container.querySelector('#mesh-pane-dashboard'), graphe: container.querySelector('#mesh-pane-graphe'), codes: container.querySelector('#mesh-pane-codes') };
    var curTab  = 'dashboard';
    var grapheLoaded = false;
    var codesLoaded  = false;

    function switchTab(name) {
      curTab = name;
      tabs.forEach(function(t) {
        var active = t.dataset.tab === name;
        t.style.color       = active ? '#4fd1a0' : 'var(--text3,#666)';
        t.style.borderColor = active ? '#4fd1a0' : 'transparent';
        t.style.fontWeight  = active ? '600' : '400';
      });
      Object.keys(panes).forEach(function(k) { if (panes[k]) panes[k].style.display = k === name ? 'block' : 'none'; });

      if (name === 'graphe' && !grapheLoaded) { grapheLoaded = true; loadGraphe(); }
      if (name === 'codes'  && !codesLoaded)  { codesLoaded  = true; loadCodes();  }
    }

    tabs.forEach(function(t) {
      t.addEventListener('click', function(){ switchTab(t.dataset.tab); });
    });
    switchTab('dashboard');

    // ── Rendu graphe ───────────────────────────────────────────────────────────
    async function loadGraphe() {
      var el = container.querySelector('#mesh-graphe-content');
      if (!el) return;
      var data = await fetchSubtree();
      if (!data || !data.tree) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text3,#666);text-align:center;padding:20px">Impossible de charger le graphe.</div>';
        return;
      }
      el.innerHTML = '';

      if (data.parent) {
        var parentEl = document.createElement('div');
        parentEl.style.cssText = 'padding:8px 12px;background:rgba(124,106,247,.08);border-radius:8px;border:1px solid rgba(124,106,247,.2);margin-bottom:8px;font-size:11px;color:#7c6af7;text-align:center';
        parentEl.textContent = '↑ ' + data.parent.label + ' (parent)';
        el.appendChild(parentEl);
      }

      el.appendChild(renderNode(data.tree, 0, true));
    }

    function renderNode(node, depth, isMe) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin-left:' + (depth * 16) + 'px;margin-bottom:6px';

      var used = node.budgetUsed || 0;
      var total = node.budgetTotal || 1;
      var p = Math.round((used / total) * 100);
      var bc = p > 85 ? '#f06a6a' : p > 60 ? '#f0a84a' : '#4fd1a0';

      var card = document.createElement('div');
      card.style.cssText = 'padding:10px 12px;border-radius:8px;border:1px solid ' +
        (isMe ? 'rgba(79,209,160,.4)' : 'rgba(255,255,255,.07)') + ';' +
        'background:' + (isMe ? 'rgba(79,209,160,.06)' : 'rgba(255,255,255,.03)');

      var header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
      header.innerHTML =
        '<div style="font-size:12px;font-weight:' + (isMe ? '600' : '400') + ';flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          (isMe ? '◎ ' : '· ') + esc(node.label) +
          (isMe ? ' <span style="font-size:9px;color:#4fd1a0;font-weight:400">(vous)</span>' : '') +
        '</div>' +
        '<div style="font-size:10px;color:var(--text3,#666);flex-shrink:0">' + fmtNum(node.remaining) + ' restants</div>';
      card.appendChild(header);

      // Barre budget
      var barWrap = document.createElement('div');
      barWrap.style.cssText = 'height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-bottom:4px';
      var barFill = document.createElement('div');
      barFill.style.cssText = 'height:100%;width:' + Math.min(p,100) + '%;background:' + bc + ';border-radius:2px';
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);

      var meta = document.createElement('div');
      meta.style.cssText = 'display:flex;justify-content:space-between;font-size:9px;color:var(--text3,#666)';
      meta.innerHTML = '<span>' + fmtNum(used) + ' / ' + fmtNum(total) + '</span><span>' + p + '%</span>';
      card.appendChild(meta);

      // Codes actifs de ce nœud
      if (node.codes && node.codes.length) {
        var codesWrap = document.createElement('div');
        codesWrap.style.cssText = 'margin-top:6px;display:flex;flex-wrap:wrap;gap:4px';
        node.codes.forEach(function(c) {
          var pill = document.createElement('span');
          pill.style.cssText = 'font-size:9px;padding:2px 7px;border-radius:20px;background:rgba(79,209,160,.1);color:#4fd1a0;font-family:monospace;border:1px solid rgba(79,209,160,.2)';
          pill.textContent = c.code + ' · ' + fmtNum(c.budgetTokens) + ' tok · ' + c.childCount + '/' + c.maxChildren;
          codesWrap.appendChild(pill);
        });
        card.appendChild(codesWrap);
      }

      wrap.appendChild(card);

      // Enfants récursifs
      if (node.children && node.children.length) {
        var line = document.createElement('div');
        line.style.cssText = 'margin-left:' + (depth * 16 + 12) + 'px;border-left:1px solid rgba(255,255,255,.07);padding-left:4px;margin-top:2px;margin-bottom:2px';
        node.children.forEach(function(child) {
          line.appendChild(renderNode(child, 0, false));
        });
        wrap.appendChild(line);
      }

      return wrap;
    }

    // ── Rendu codes ────────────────────────────────────────────────────────────
    async function loadCodes() {
      var el = container.querySelector('#mesh-codes-content');
      if (!el) return;
      if (!s || !s.codes || !s.codes.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text3,#666);text-align:center;padding:20px">Aucun code actif.</div>';
        return;
      }
      el.innerHTML = '';
      s.codes.forEach(function(c) {
        var row = document.createElement('div');
        row.style.cssText = 'padding:10px 12px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.07);margin-bottom:8px';
        row.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<div style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:3px;color:#4fd1a0">' + esc(c.code) + '</div>' +
            '<div style="flex:1;font-size:11px;color:var(--text3,#666)">' + esc(c.label) + '</div>' +
            '<button data-revoke2="' + esc(c.code) + '" style="font-size:10px;padding:2px 8px;border-radius:5px;border:1px solid rgba(240,106,106,.3);background:transparent;color:#f06a6a;cursor:pointer">✕</button>' +
          '</div>' +
          '<div style="display:flex;gap:12px;font-size:10px;color:var(--text3,#666)">' +
            '<span>Budget : ' + fmtNum(c.budgetTokens) + ' tok</span>' +
            '<span>' + c.childCount + ' / ' + c.maxChildren + ' utilisateurs</span>' +
            '<span>Expire : ' + new Date(c.expiresAt).toLocaleString('fr') + '</span>' +
          '</div>';
        row.querySelector('[data-revoke2]').addEventListener('click', async function() {
          await revokeCode(this.dataset.revoke2);
          window.YM_toast && window.YM_toast('Code révoqué', 'success');
          codesLoaded = false;
          loadCodes();
        });
        el.appendChild(row);
      });

      // Bouton générer depuis cet onglet aussi
      var genBtn = document.createElement('button');
      genBtn.className = 'ym-btn ym-btn-accent';
      genBtn.style.cssText = 'width:100%;margin-top:8px;font-size:12px';
      genBtn.textContent = '+ Nouveau code';
      genBtn.addEventListener('click', function(){ switchTab('dashboard'); setTimeout(function(){ var f = container.querySelector('#mesh-gen-form'); if (f) f.style.display = 'block'; }, 100); });
      el.appendChild(genBtn);
    }

    refreshStatus();
  }

  // ── Push config au bridge local (si actif sur cette machine) ───────────────
  function _pushBridgeConfig() {
    if (!_node) return;
    fetch('http://localhost:3779/configure', {
      method: 'POST',
      body:   JSON.stringify({ nodeId: _node.nodeId, tokenId: _node.tokenId, workerUrl: WORKER_URL, label: _node.label }),
    }).catch(() => {});
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
          '<div style="font-size:10px;color:var(--text3,#666)">' + fmtNum(_node.budgetTotal - _node.budgetUsed) + ' tok restants · ' + p + '%</div>' +
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
    name:        'MeshAI',
    icon:        '⬡',
    category:    'AI',
    description: 'Délégation de capacités Anthropic en cascade — codes de session, budgets, device binding',
    emit:    [],
    receive: [],
    activate(ctx)  { _ctx = ctx; refreshStatus(); _pushBridgeConfig(); },
    deactivate()   { _ctx = null; _refresh = null; },
    renderPanel,
    profileSection,
  };

  // ── API publique (bridge + extension) ──────────────────────────────────────
  window.MeshAI = {
    llm,
    llmStream,
    getNode:      () => _node,
    getWorkerUrl: () => WORKER_URL,
    isReady:      () => !!_node,
    generateCode,
    refreshStatus,
  };

})();
