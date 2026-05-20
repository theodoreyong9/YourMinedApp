/* jshint esversion:11 */
// ai.js — YourMine AI Code Generator
// Ajoute l'onglet "✦ AI" entre Rank et Plug dans le panel Build.
// Moteur 1 : WebLLM (window.__webllm, WebGPU, déjà chargé par index.html)
// Moteur 2 : Lemonade Server (daemon local AMD, http://localhost:13305/v1)
// Pas de cloud, pas de clé. Auto-détection au démarrage.
//
// ⚠ Ce fichier est chargé par app.js dans la boucle loadScript :
//    for (const m of ['mine.js','liste.js','build.js','ai.js','profile.js'])
// Il ne modifie rien d'autre dans app.js.
(function () {
  'use strict';

  const LEMONADE_BASE = 'http://localhost:13305/v1';
  const LEMONADE_KEY  = 'lemonade';

  // ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
  // Chunk dense, <2500 tokens — calibré pour les petits modèles locaux (1-4B).
  const SYS = `You are an expert YourMine developer. Output ONLY the complete file code. No explanation, no markdown fences, no preamble.

## SPHERE FILE (filename.sphere.js)
(function(){
'use strict';
window.YM_S = window.YM_S || {};
let _ctx = null, _timer = null;
window.YM_S['FILENAME'] = {
  name: 'Display Name',
  icon: '🔮',
  category: 'Tools', // Tools|Games|AI|Finance|Commerce|Social|Media|Search|Agent|Communication
  description: 'Under 140 chars.',
  // wip: true,

  activate(ctx) {
    _ctx = ctx;
    // NEVER await slow ops here — fire-and-forget only
    // ctx.storage.get/set/del(key)
    // ctx.toast(msg, 'success'|'error'|'info'|'warn')
    // ctx.send(type, data)  — P2P broadcast, max 10/s
    // ctx.onReceive((type, data, peerId) => {})  — auto-cleaned on deactivate
    // ctx.openPanel(renderFn)
    // ctx.setNotification(n)
    // ctx.saveProfile(obj) / ctx.loadProfile()
    // window.YM?.openSpherePanel?.('FILENAME')
    // window.YM_P2P?.sendTo(peerId, {sphere:'FILENAME', type, data})
    // window.YM_Social?._nearUsers  Map<uuid, {profile, ts, peerId}>
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
    // NEVER assign ctx.deactivate = ...
  },

  renderPanel(container) {
    container.innerHTML = '<div style="padding:16px"><div class="ym-card"><div class="ym-card-title">Title</div></div></div>';
  },

  // OPTIONAL:
  // profileSection(container) {}          own profile Spheres tab
  // peerSection(container, peerCtx) {}    peer card; peerCtx={uuid,isNear,isReciproc,profile}
  // broadcastData() { return {}; }        merged into social presence packet
};
})();

## CSS VARIABLES — always use, never hardcode colors
--bg:#06060e --text:#e4e6f4 --text2:rgba(228,230,244,.52) --text3:rgba(228,230,244,.26)
--gold:#f0a830 --cyan:#08e0f8 --red:#ff4560 --green:#22d98a
--font-d:'Syne' --font-b:'Space Grotesk' --font-m:'JetBrains Mono'
Fallbacks: var(--surface2,#12121e) var(--border,rgba(255,255,255,.08)) var(--r,12px) var(--accent,var(--gold))

## UI CLASSES
.ym-card .ym-card-title
.ym-btn .ym-btn-accent .ym-btn-ghost .ym-btn-danger
.ym-input
.ym-notice .info/.success/.error/.warn
.ym-tabs .ym-tab .ym-tab.active
.pill .pill.active

## RULES
- IIFE wrapper always — no top-level vars
- window.YM_S key MUST exactly match the filename
- activate() must complete in <8s — never await slow calls inside it
- deactivate() is a top-level method on the object

## THEME FILE (src/themes/name.theme.html)
HTML fragment injected into <body> (not a full document).
Required <script>:
  window.YM_THEME_META = { name, icon, description };
  window.YM_WALLPAPER_PRESETS = [{ label, url }];
Required DOM IDs (all mandatory):
  #ym-wp #ym-bg #ym-loader #toasts #desktop #desktop-slider #drag-ghost #page-dots
  #nav-bar #dock #btn-back #btn-profile #btn-figure
  #panel-overlay #panel-spheres #panel-spheres-body #panel-profile #panel-profile-body
  #panel-build #panel-build-body #panel-mine #panel-mine-wallet #panel-mine-build
  #panel-mine-formula #panel-mine-liste #mine-tabs-bar
  #panel-sphere #panel-sphere-body #sphere-panel-title
  #panel-profile-view #panel-profile-view-body #profile-view-title
  #panel-switcher #switcher-handle #switcher-grid
  #folder-dlg #folder-name-input #folder-confirm #folder-cancel
  #bg-dlg #bg-presets #theme-list #theme-custom-input #theme-custom-btn
  #bg-wp #bg-remove #bg-spheres #bg-del
  #ym-sign-dlg #ym-sign-sphere #ym-sign-detail #ym-sign-confirm #ym-sign-reject
  #pwa-install-btn #spheres-build-btn #profile-share-btn
Required CSS classes:
  .ym-panel .ym-panel.open .ym-overlay .dbtn .dbtn.active
  .icon-wrap .icon-body .icon-label .icon-notif .icon-del .icon-label--below
  .ym-btn .ym-btn-accent .ym-btn-ghost .ym-input .ym-card .ym-card-title
  .ym-notice .ym-tabs .ym-tab .pill .toast .dlg .dlg.open
  .desktop-page .cell-hl .panel-handle .panel-head .panel-body`;

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── DÉTECTION MOTEUR ───────────────────────────────────────────────────────
  // Retourne 'webllm' | 'lemonade' | null
  async function detectEngine() {
    // 1. WebLLM : déjà chargé par index.html dans window.__webllm
    if (window.__webllm && typeof window.__webllm.chat?.completions?.create === 'function') {
      return 'webllm';
    }
    // 2. Lemonade : daemon local sur localhost:13305
    try {
      const r = await fetch(LEMONADE_BASE + '/models', {
        headers: { 'Authorization': 'Bearer ' + LEMONADE_KEY },
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) return 'lemonade';
    } catch { /* offline */ }
    return null;
  }

  // ── LEMONADE : liste des modèles LLM texte disponibles ─────────────────────
  async function lemonadeModels() {
    const r = await fetch(LEMONADE_BASE + '/models', {
      headers: { 'Authorization': 'Bearer ' + LEMONADE_KEY },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const SKIP = new Set(['image','tts','transcription','embeddings','reranking','upscaling','edit']);
    return (data.data || []).filter(m =>
      m.downloaded && !(m.labels || []).some(l => SKIP.has(l))
    );
  }

  // ── GÉNÉRATION STREAMING ───────────────────────────────────────────────────
  // onChunk(delta:string) est appelé pour chaque token reçu.
  async function generate(engine, model, userPrompt, onChunk) {
    const messages = [
      { role: 'system', content: SYS },
      { role: 'user',   content: userPrompt },
    ];

    if (engine === 'webllm') {
      // WebLLM — API identique à OpenAI, stream natif
      const stream = await window.__webllm.chat.completions.create({
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) onChunk(delta);
      }
      return;
    }

    if (engine === 'lemonade') {
      // Lemonade — OpenAI-compatible SSE
      const resp = await fetch(LEMONADE_BASE + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + LEMONADE_KEY,
        },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 4096, stream: true }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error?.message || 'Lemonade HTTP ' + resp.status);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
            if (delta) onChunk(delta);
          } catch { /* malformed SSE */ }
        }
      }
      return;
    }

    throw new Error('No AI engine available');
  }

  // ── RENDER UI ──────────────────────────────────────────────────────────────
  async function renderAI(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0';

    // État partagé
    let _engine = null;
    let _model  = null;
    let _type   = 'sphere';

    // ── 1. Bannière moteur ─────────────────────────────────────────────────
    const engRow = document.createElement('div');
    engRow.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    engRow.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Engine</div>' +
        '<button id="ai-probe" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px">↺ Detect</button>' +
      '</div>' +
      '<div id="ai-eng-status" style="font-size:10px;color:var(--text3)">Detecting…</div>' +
      '<div id="ai-model-row" style="display:none;margin-top:8px;display:none;gap:6px;align-items:center">' +
        '<span style="font-size:10px;color:var(--text3);flex-shrink:0">Model</span>' +
        '<select id="ai-model-sel" class="ym-input" style="flex:1;font-size:11px;padding:5px 8px;cursor:pointer"></select>' +
      '</div>' +
      '<div id="ai-offline-hint" style="display:none;margin-top:6px">' +
        '<div class="ym-notice warn" style="font-size:10px;line-height:1.7">' +
          'No local AI detected.<br>' +
          '· WebGPU: Chrome/Edge desktop (automatic)<br>' +
          '· <a href="https://lemonade-server.ai" target="_blank" rel="noopener" style="color:var(--cyan)">Lemonade ↗</a> ' +
          '→ <code style="background:rgba(255,255,255,.06);padding:1px 5px;border-radius:4px;font-size:9px">lemonade run Qwen3-0.6B-GGUF</code>' +
        '</div>' +
      '</div>';
    body.appendChild(engRow);

    async function probe() {
      const statusEl  = engRow.querySelector('#ai-eng-status');
      const modelRow  = engRow.querySelector('#ai-model-row');
      const offHint   = engRow.querySelector('#ai-offline-hint');
      const selEl     = engRow.querySelector('#ai-model-sel');
      statusEl.textContent = 'Detecting…';
      statusEl.style.color = 'var(--text3)';
      offHint.style.display  = 'none';
      modelRow.style.display = 'none';

      _engine = await detectEngine();

      if (_engine === 'webllm') {
        statusEl.innerHTML = '<span style="color:var(--green)">● WebLLM</span> — local WebGPU';
        // WebLLM n'a pas de liste de modèles externe — le modèle est chargé par index.html
        _model = null;
        modelRow.style.display = 'none';
      } else if (_engine === 'lemonade') {
        statusEl.innerHTML = '<span style="color:var(--green)">● Lemonade</span> — localhost:13305';
        try {
          const models = await lemonadeModels();
          selEl.innerHTML = '';
          models.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.id + (m.size ? ' · ' + m.size + 'GB' : '');
            selEl.appendChild(opt);
            if (i === 0) _model = m.id;
          });
          selEl.onchange = () => { _model = selEl.value; };
          modelRow.style.display = 'flex';
        } catch { /* modèles non récupérés */ }
      } else {
        _engine = null;
        statusEl.innerHTML = '<span style="color:var(--red)">● No engine</span>';
        offHint.style.display = 'block';
      }
    }

    engRow.querySelector('#ai-probe').addEventListener('click', probe);
    probe(); // sonde au chargement

    // ── 2. Type Sphere / Thème ─────────────────────────────────────────────
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Generate</div>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button id="ai-t-s" style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button id="ai-t-t" style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    function setType(t) {
      _type = t;
      const extEl = body.querySelector('#ai-ext');
      const bs    = typeRow.querySelector('#ai-t-s');
      const bt    = typeRow.querySelector('#ai-t-t');
      if (t === 'sphere') {
        if (extEl) extEl.textContent = '.sphere.js';
        bs.style.cssText = 'background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer';
        bt.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      } else {
        if (extEl) extEl.textContent = '.theme.html';
        bt.style.cssText = 'background:rgba(8,224,248,.12);border:none;color:var(--cyan);font-size:10px;padding:5px 12px;cursor:pointer';
        bs.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      }
      refreshChips();
    }
    typeRow.querySelector('#ai-t-s').addEventListener('click', () => setType('sphere'));
    typeRow.querySelector('#ai-t-t').addEventListener('click', () => setType('theme'));

    // ── 3. Options (filename, catégorie, wip) ─────────────────────────────
    const optsWrap = document.createElement('div');
    optsWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;flex-direction:column;gap:8px';
    optsWrap.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
        '<div>' +
          '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Filename</div>' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<input id="ai-filename" class="ym-input" placeholder="my-sphere" style="flex:1;font-size:11px">' +
            '<span id="ai-ext" style="font-size:10px;color:var(--text3);flex-shrink:0">.sphere.js</span>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Category</div>' +
          '<input id="ai-cat" class="ym-input" placeholder="Tools" style="font-size:11px;width:100%;box-sizing:border-box">' +
        '</div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);cursor:pointer">' +
        '<input type="checkbox" id="ai-wip" checked> 🚧 Under Construction' +
      '</label>';
    body.appendChild(optsWrap);

    // ── 4. Prompt + chips ─────────────────────────────────────────────────
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea id="ai-prompt" class="ym-input" rows="5" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical" placeholder="Describe what to generate…\n\nEx: A chess game with P2P multiplayer, lobby, board and move validation."></textarea>' +
      '<div id="ai-chips" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px"></div>';
    body.appendChild(promptWrap);

    const CHIPS = {
      sphere: ['Timer / countdown widget','Weather with geolocation','P2P whiteboard with peers','Crypto price tracker'],
      theme:  ['Dark glassmorphism + gold','Minimal brutalist B&W','Cyberpunk neon grid','Soft pastel / organic'],
    };

    function refreshChips() {
      const el = promptWrap.querySelector('#ai-chips');
      if (!el) return;
      el.innerHTML = '';
      CHIPS[_type].forEach(label => {
        const c = document.createElement('span');
        c.style.cssText = 'display:inline-flex;align-items:center;font-size:10px;color:var(--text3);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:3px 10px;cursor:pointer;transition:border-color .15s,color .15s;flex-shrink:0';
        c.textContent = label;
        c.addEventListener('mouseenter', () => { c.style.borderColor='rgba(240,168,48,.4)'; c.style.color='var(--text2)'; });
        c.addEventListener('mouseleave', () => { c.style.borderColor='rgba(255,255,255,.1)'; c.style.color='var(--text3)'; });
        c.addEventListener('click', () => {
          const ta = body.querySelector('#ai-prompt');
          if (ta) ta.value = label;
        });
        el.appendChild(c);
      });
    }
    refreshChips();

    // ── 5. Bouton Generate ────────────────────────────────────────────────
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button id="ai-gen" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">✦ Generate</button>' +
      '<div id="ai-prog" style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    // ── 6. Output ─────────────────────────────────────────────────────────
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<span id="ai-chars" style="font-size:9px;color:var(--text3)">0 chars</span>' +
        '<button id="ai-copy" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 10px">⎘ Copy</button>' +
      '</div>' +
      '<textarea id="ai-out" class="ym-input" style="flex:1;min-height:200px;font-family:var(--font-m);font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;margin-bottom:14px" placeholder="Generated code appears here…" spellcheck="false"></textarea>';
    body.appendChild(outWrap);

    // ── Generate handler ──────────────────────────────────────────────────
    genWrap.querySelector('#ai-gen').addEventListener('click', async () => {
      const prompt  = (body.querySelector('#ai-prompt')?.value || '').trim();
      const fnRaw   = (body.querySelector('#ai-filename')?.value || '').trim();
      const cat     = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      const wip     = body.querySelector('#ai-wip')?.checked !== false;
      const outEl   = body.querySelector('#ai-out');
      const progEl  = body.querySelector('#ai-prog');
      const charsEl = body.querySelector('#ai-chars');
      const genBtn  = body.querySelector('#ai-gen');

      if (!prompt) { window.YM_toast?.('Enter a prompt first', 'warn'); return; }
      if (!_engine) {
        // Re-sonde au clic
        await probe();
        if (!_engine) { window.YM_toast?.('No AI engine available', 'error'); return; }
      }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = fnRaw ? fnRaw.replace(/\.(sphere\.js|theme\.html)$/, '') : 'my-' + _type;
      const filename = slug + ext;

      const userPrompt = [
        'Generate a YourMine ' + _type + '.',
        'Filename: ' + filename,
        'Category: ' + cat,
        wip ? 'Include wip: true in the metadata.' : '',
        '',
        'Requirements:',
        prompt,
      ].filter(Boolean).join('\n');

      genBtn.disabled    = true;
      genBtn.textContent = '⏳ Generating…';
      outEl.value        = '';
      charsEl.textContent = '0 chars';

      const engineLabel = _engine === 'webllm' ? 'WebLLM' : 'Lemonade';
      progEl.textContent = 'Starting ' + engineLabel + '…';

      let full  = '';
      let toks  = 0;
      const t0  = Date.now();

      try {
        await generate(_engine, _model, userPrompt, delta => {
          full += delta;
          toks++;
          outEl.value     = full;
          outEl.scrollTop = outEl.scrollHeight;
          charsEl.textContent = full.length + ' chars';
          if (toks % 15 === 0) {
            const s = ((Date.now() - t0) / 1000).toFixed(1);
            progEl.textContent = engineLabel + ' · ' + full.length + ' chars · ' + s + 's';
          }
        });

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        progEl.innerHTML =
          '<span style="color:var(--green)">✓ ' + engineLabel + ' — ' + elapsed + 's · ' + full.length + ' chars</span>';
        window.YM_toast?.('Code generated!', 'success');

      } catch (e) {
        progEl.innerHTML = '<span style="color:var(--red)">✗ ' + esc(e.message) + '</span>';
        window.YM_toast?.(e.message, 'error');
      } finally {
        genBtn.disabled    = false;
        genBtn.textContent = '✦ Generate';
      }
    });

    // ── Copy handler ──────────────────────────────────────────────────────
    outWrap.querySelector('#ai-copy').addEventListener('click', () => {
      const code = body.querySelector('#ai-out')?.value || '';
      if (!code) { window.YM_toast?.('Nothing to copy yet', 'warn'); return; }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code)
          .then(() => window.YM_toast?.('Copied!', 'success'))
          .catch(() => _fallbackCopy(code));
      } else {
        _fallbackCopy(code);
      }
    });
  }

  function _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); window.YM_toast?.('Copied!', 'success'); }
    catch { window.YM_toast?.('Copy failed — select manually', 'error'); }
    document.body.removeChild(ta);
  }

  // ── INJECTION DU TAB ───────────────────────────────────────────────────────
  // Appelé depuis switchMineTab('build') dans app.js — le container #build-content
  // est garanti présent à ce moment-là car YM_Build.render() vient de s'exécuter.
  function injectTab(body) {
    if (!body) return;
    if (body.querySelector('[data-btab="ai"]')) return; // déjà injecté

    const plugTab = body.querySelector('[data-btab="plug"]');
    if (!plugTab) return;

    const tabBar       = plugTab.parentElement;
    const buildContent = body.querySelector('#build-content');
    if (!tabBar || !buildContent) return;

    const aiTab = document.createElement('div');
    aiTab.className    = 'ym-tab';
    aiTab.dataset.btab = 'ai';
    aiTab.style.cssText = 'flex:1;padding:10px 4px;font-size:10px;cursor:pointer';
    aiTab.textContent  = '✦ AI';

    // Insère entre Rank et Plug
    tabBar.insertBefore(aiTab, plugTab);

    aiTab.addEventListener('click', () => {
      tabBar.querySelectorAll('[data-btab]').forEach(t => t.classList.remove('active'));
      aiTab.classList.add('active');
      buildContent.innerHTML = '';
      renderAI(buildContent);
    });
  }

  // ── PATCH YM_Build.render ──────────────────────────────────────────────────
  // YM_Build est chargé juste avant ai.js dans la boucle loadScript de app.js.
  // On patche render() pour injecter le tab à chaque rendu du panel Build.
  function patchBuild() {
    if (!window.YM_Build) return false;
    if (window.YM_Build.__ai) return true;

    const origRender = window.YM_Build.render;
    window.YM_Build.render = async function (container, preset) {
      await origRender.call(this, container, preset);
      // container peut être passé en arg ou ciblé via les IDs connus
      const target = container ||
        document.getElementById('panel-mine-build') ||
        document.getElementById('panel-build-body');
      injectTab(target);
    };

    // renderPublishForm est appelé depuis liste.js (bouton +)
    if (typeof window.YM_Build.renderPublishForm === 'function') {
      const origPub = window.YM_Build.renderPublishForm;
      window.YM_Build.renderPublishForm = async function (c, t) {
        await origPub.call(this, c, t);
        injectTab(c);
      };
    }

    window.YM_Build.__ai = true;
    return true;
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  // ai.js est chargé dans la boucle après build.js, donc YM_Build est disponible
  // immédiatement. Le patch réussit au premier essai dans presque tous les cas.
  // Le fallback polling couvre les cas de race condition improbables.
  ;(function boot() {
    if (patchBuild()) return;
    let n = 0;
    const iv = setInterval(() => {
      if (++n > 40 || patchBuild()) clearInterval(iv);
    }, 250);
  })();

  // ── API publique ───────────────────────────────────────────────────────────
  window.YM_AI = { renderAI, injectTab, detectEngine };

})();
  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
  },
  renderPanel(container) {
    container.innerHTML = \`
      <div style="padding:16px">
        <div class="ym-card">
          <div class="ym-card-title">My Sphere</div>
          <button class="ym-btn ym-btn-accent" style="width:100%;margin-top:12px">Action</button>
        </div>
      </div>\`;
  },
  // Optional:
  // profileSection(container) {} — shown in own profile → Spheres tab
  // peerSection(container, peerCtx) {} — shown in peer's profile card
  //   peerCtx = { uuid, isNear, isReciproc, profile }
  //   use window.YM_P2P?.sendTo(peerId, {sphere,type,data}) for targeted P2P
  // broadcastData() { return { key: value }; } — merged into social presence
};
})();
\`\`\`

## CSS VARIABLES (always use these — never hardcode colors)
--bg #06060e | --text #e4e6f4 | --text2 rgba(228,230,244,.52) | --text3 rgba(228,230,244,.26)
--gold #f0a830 | --cyan #08e0f8 | --red #ff4560 | --green #22d98a
--font-d 'Syne' | --font-b 'Space Grotesk' | --font-m 'JetBrains Mono'
Fallbacks: var(--surface2,#12121e) | var(--border,rgba(255,255,255,.08)) | var(--r,12px) | var(--accent,var(--gold))

## UI CLASSES
.ym-card .ym-card-title | .ym-btn .ym-btn-accent .ym-btn-ghost .ym-btn-danger
.ym-input | .ym-notice .info/.success/.error/.warn | .ym-tabs .ym-tab .ym-tab.active
.pill .pill.active | .toast

## CTX API
ctx.storage.get(key)→value|null  ctx.storage.set(key,val)  ctx.storage.del(key)
ctx.toast(msg,type)  ctx.openPanel(renderFn)  ctx.setNotification(n)
ctx.send(type,data)  ctx.onReceive(cb)  ctx.saveProfile(data)  ctx.loadProfile()

## P2P PATTERNS
// Broadcast: ctx.send('myevent', {data})
// Targeted: window.YM_P2P?.sendTo(peerId, {sphere:'name.sphere.js',type,data})
// Get peerId: window.YM_Social?._nearUsers.get(uuid)?.peerId
// Presence: implement broadcastData(){return{status:'active'}}

## RULES
- IIFE wrapper always — no top-level vars
- Key in window.YM_S[...] must EXACTLY match filename
- deactivate() is top-level method on the object — NEVER ctx.deactivate=...
- Never await in activate() — fire-and-forget only
- activate() must finish in <8s

## THEME FORMAT (src/themes/mytheme.html)
Full HTML fragment (not a document) injected into <body>.
Must declare: <script>window.YM_THEME_META={name,icon,description}; window.YM_WALLPAPER_PRESETS=[{label,url}];</script>
Must include all required DOM IDs: #ym-wp #ym-bg #ym-loader #toasts #desktop #desktop-slider #drag-ghost #page-dots
#nav-bar #dock #btn-back #btn-profile #btn-figure
#panel-overlay #panel-spheres #panel-spheres-body #panel-profile #panel-profile-body
#panel-build #panel-build-body #panel-mine #panel-mine-wallet #panel-mine-build
#panel-mine-formula #panel-mine-liste #mine-tabs-bar
#panel-sphere #panel-sphere-body #sphere-panel-title
#panel-profile-view #panel-profile-view-body #profile-view-title
#panel-switcher #switcher-handle #switcher-grid
#folder-dlg #folder-name-input #folder-confirm #folder-cancel
#bg-dlg #bg-presets #theme-list #theme-custom-input #theme-custom-btn #bg-wp #bg-remove #bg-spheres #bg-del
#ym-sign-dlg #ym-sign-sphere #ym-sign-detail #ym-sign-confirm #ym-sign-reject
#pwa-install-btn #spheres-build-btn #profile-share-btn
Required CSS classes: .ym-panel .ym-panel.open .ym-overlay .dbtn .dbtn.active
.icon-wrap .icon-body .icon-label .icon-notif .icon-del .icon-label--below
.ym-btn .ym-btn-accent .ym-btn-ghost .ym-input .ym-card .ym-card-title
.ym-notice .ym-tabs .ym-tab .pill .toast .dlg .dlg.open
.desktop-page .cell-hl .panel-handle .panel-head .panel-body

Output ONLY the complete file content. No explanation, no markdown fences.`;

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toast(m, t) { if (window.YM_toast) window.YM_toast(m, t); }

  // ── MODEL ABSTRACTION ─────────────────────────────────────────────────────
  // Returns an async generator that yields text chunks.
  async function* streamGenerate(systemPrompt, userPrompt, onToken) {
    // 1. Try WebLLM (WebGPU, runs locally in the PWA)
    const llm = window.__webllm;
    if (llm && typeof llm.chat === 'function') {
      try {
        const stream = await llm.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.4,
          max_tokens: 3000,
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) { onToken(delta); yield delta; }
        }
        return;
      } catch (e) {
        console.warn('[AI] WebLLM failed, falling back to Anthropic API:', e.message);
      }
    }

    // 2. Fallback: Anthropic API (claude-sonnet-4-20250514)
    // No API key needed — handled by the platform when running inside claude.ai
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
      }),
    });
    if (!resp.ok) throw new Error('Anthropic API HTTP ' + resp.status);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break;
        try {
          const ev = JSON.parse(raw);
          const delta = ev.delta?.text || '';
          if (delta) { onToken(delta); yield delta; }
        } catch { /* skip malformed */ }
      }
    }
  }

  // ── RENDER AI TAB ─────────────────────────────────────────────────────────
  function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    // ── Type selector ──────────────────────────────────────────────────────
    let _type = 'sphere'; // 'sphere' | 'theme'

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:4px;border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px;flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1;align-self:center">Generate</div>' +
      '<div style="display:flex;gap:4px;border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden">' +
        '<button id="ai-type-sphere" style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)">⬡ Sphere</button>' +
        '<button id="ai-type-theme"  style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    // ── LLM indicator ─────────────────────────────────────────────────────
    const llmBadge = document.createElement('div');
    llmBadge.style.cssText = 'padding:6px 14px 0;flex-shrink:0;display:flex;align-items:center;gap:6px';
    const hasWebLLM = !!(window.__webllm && typeof window.__webllm.chat === 'function');
    llmBadge.innerHTML =
      '<div style="width:6px;height:6px;border-radius:50%;background:' + (hasWebLLM ? 'var(--green)' : 'var(--gold)') + ';flex-shrink:0"></div>' +
      '<span style="font-size:9px;color:var(--text3)">' +
        (hasWebLLM ? 'WebLLM local (WebGPU)' : 'Claude API (cloud fallback)') +
      '</span>';
    body.appendChild(llmBadge);

    // ── Prompt area ───────────────────────────────────────────────────────
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea id="ai-prompt" class="ym-input" rows="5" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical" ' +
        'placeholder="Describe what your sphere should do…\n\nEx: A chess game with online multiplayer using the P2P layer. Include a lobby, board, and move validation."></textarea>' +
      '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' +
        _suggestionChip('Timer / countdown widget', 'promptWrap') +
        _suggestionChip('Weather dashboard with geolocation', 'promptWrap') +
        _suggestionChip('P2P drawing canvas with peers', 'promptWrap') +
        _suggestionChip('Crypto price tracker sphere', 'promptWrap') +
      '</div>';
    body.appendChild(promptWrap);

    // ── Options ───────────────────────────────────────────────────────────
    const optsWrap = document.createElement('div');
    optsWrap.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;flex-direction:column;gap:6px';
    optsWrap.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
        '<div>' +
          '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Filename</div>' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<input id="ai-filename" class="ym-input" placeholder="my-sphere" style="flex:1;font-size:11px">' +
            '<span id="ai-ext" style="font-size:10px;color:var(--text3);flex-shrink:0">.sphere.js</span>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Category</div>' +
          '<input id="ai-cat" class="ym-input" placeholder="Tools" style="font-size:11px;width:100%;box-sizing:border-box">' +
        '</div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);cursor:pointer">' +
        '<input type="checkbox" id="ai-wip" checked> 🚧 Mark as Under Construction' +
      '</label>';
    body.appendChild(optsWrap);

    // ── Generate button ───────────────────────────────────────────────────
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button id="ai-generate" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px;letter-spacing:.5px">' +
        '✦ Generate' +
      '</button>' +
      '<div id="ai-progress" style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    // ── Output ────────────────────────────────────────────────────────────
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<button id="ai-copy" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 9px">Copy</button>' +
        '<button id="ai-send-build" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 9px">→ Build</button>' +
      '</div>' +
      '<textarea id="ai-output" class="ym-input" style="flex:1;min-height:180px;font-family:var(--font-m);font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box" ' +
        'placeholder="Generated code will appear here…" spellcheck="false" readonly></textarea>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:4px;margin-bottom:14px;flex-shrink:0">' +
        '<span id="ai-chars" style="font-size:9px;color:var(--text3)">0 chars</span>' +
      '</div>';
    body.appendChild(outWrap);

    // ── Wire type toggle ──────────────────────────────────────────────────
    function _setType(t) {
      _type = t;
      const extEl = body.querySelector('#ai-ext');
      const sBtn  = typeRow.querySelector('#ai-type-sphere');
      const thBtn = typeRow.querySelector('#ai-type-theme');
      if (t === 'sphere') {
        if (extEl) extEl.textContent = '.sphere.js';
        sBtn.style.cssText  = 'background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)';
        thBtn.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)';
        _setThemeSuggestions(false);
      } else {
        if (extEl) extEl.textContent = '.theme.html';
        thBtn.style.cssText = 'background:rgba(8,224,248,.12);border:none;color:var(--cyan);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)';
        sBtn.style.cssText  = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer;font-family:var(--font-b)';
        _setThemeSuggestions(true);
      }
    }

    function _setThemeSuggestions(isTheme) {
      const chips = promptWrap.querySelectorAll('.ai-chip');
      const themeSuggestions = ['Dark glassmorphism with gold accents', 'Minimal white brutalist theme', 'Cyberpunk neon grid theme', 'Nature / organic forest theme'];
      const sphereSuggestions = ['Timer / countdown widget', 'Weather dashboard with geolocation', 'P2P drawing canvas with peers', 'Crypto price tracker sphere'];
      const list = isTheme ? themeSuggestions : sphereSuggestions;
      chips.forEach((c, i) => { if (list[i]) c.textContent = list[i]; });
    }

    typeRow.querySelector('#ai-type-sphere').addEventListener('click', () => _setType('sphere'));
    typeRow.querySelector('#ai-type-theme').addEventListener('click',  () => _setType('theme'));

    // ── Chip clicks ───────────────────────────────────────────────────────
    promptWrap.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ta = body.querySelector('#ai-prompt');
        if (ta) ta.value = chip.textContent;
      });
    });

    // ── Generate ─────────────────────────────────────────────────────────
    body.querySelector('#ai-generate').addEventListener('click', async () => {
      const prompt  = (body.querySelector('#ai-prompt')?.value || '').trim();
      const fnRaw   = (body.querySelector('#ai-filename')?.value || '').trim();
      const cat     = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      const wip     = body.querySelector('#ai-wip')?.checked !== false;
      const outEl   = body.querySelector('#ai-output');
      const progEl  = body.querySelector('#ai-progress');
      const charsEl = body.querySelector('#ai-chars');
      const genBtn  = body.querySelector('#ai-generate');

      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      const ext  = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug = fnRaw ? fnRaw.replace(/\.(sphere\.js|theme\.html)$/, '') : 'my-' + _type;
      const filename = slug + ext;

      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
        'Category: ' + cat,
        wip ? 'Mark wip:true in the metadata.' : '',
        '',
        'Requirements:',
        prompt,
      ].filter(Boolean).join('\n');

      genBtn.disabled = true;
      genBtn.textContent = '⏳ Generating…';
      outEl.readOnly = true;
      outEl.value = '';
      progEl.textContent = 'Starting…';

      let fullCode = '';
      let tokenCount = 0;
      const t0 = Date.now();

      try {
        const gen = streamGenerate(
          _type === 'sphere' ? SYSTEM_SPHERE : SYSTEM_SPHERE,
          userPrompt,
          delta => { /* handled below via generator */ }
        );

        for await (const chunk of streamGenerate(
          SYSTEM_SPHERE,
          userPrompt,
          () => {}
        )) {
          fullCode += chunk;
          tokenCount++;
          outEl.value = fullCode;
          outEl.scrollTop = outEl.scrollHeight;
          charsEl.textContent = fullCode.length + ' chars';
          if (tokenCount % 20 === 0) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            progEl.textContent = `${fullCode.length} chars · ${elapsed}s`;
          }
        }

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        progEl.innerHTML = `<span style="color:var(--green)">✓ Done in ${elapsed}s — ${fullCode.length} chars</span>`;
        outEl.readOnly = false;
        toast('Code generated!', 'success');
      } catch (e) {
        progEl.innerHTML = `<span style="color:var(--red)">✗ ${esc(e.message)}</span>`;
        toast(e.message, 'error');
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = '✦ Generate';
      }
    });

    // ── Copy ─────────────────────────────────────────────────────────────
    body.querySelector('#ai-copy').addEventListener('click', () => {
      const code = body.querySelector('#ai-output')?.value || '';
      if (!code) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard?.writeText(code).then(() => toast('Copied!', 'success')).catch(() => {
        // Fallback for PWA contexts without clipboard API
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied!', 'success');
      });
    });

    // ── Send to Build tab ─────────────────────────────────────────────────
    // Transfers generated code + filename into the Rank tab's code form
    body.querySelector('#ai-send-build').addEventListener('click', () => {
      const code = (body.querySelector('#ai-output')?.value || '').trim();
      const fn   = (body.querySelector('#ai-filename')?.value || '').trim();
      if (!code) { toast('Generate code first', 'warn'); return; }

      // Store for the Rank tab to pick up
      window._ymAITransfer = { code, filename: fn, type: _type };

      // Switch to Rank tab by clicking it
      const rankTab = document.querySelector('[data-btab="rank"]');
      if (rankTab) rankTab.click();

      // After a short delay, inject into the form
      setTimeout(() => {
        // Find the correct textarea (pub-code-main is the "Code brut" textarea)
        const codeTA = document.querySelector('#pub-code-main') || document.querySelector('#pub-code');
        if (codeTA) {
          codeTA.value = code;
          codeTA.dispatchEvent(new Event('input'));
        }
        const nameInput = document.querySelector('#pub-name-main') || document.querySelector('#pub-name');
        if (nameInput && fn) {
          const slug = fn.replace(/\.(sphere\.js|theme\.html)$/, '');
          nameInput.value = slug;
          nameInput.dispatchEvent(new Event('input'));
        }
        toast('Transferred to Build ✦', 'success');
      }, 350);
    });
  }

  // ── CHIP HELPER ──────────────────────────────────────────────────────────
  function _suggestionChip(label) {
    const span = document.createElement('span');
    span.className = 'ai-chip';
    span.style.cssText =
      'display:inline-flex;align-items:center;font-size:10px;color:var(--text3);' +
      'border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:3px 10px;' +
      'cursor:pointer;transition:border-color .15s,color .15s;flex-shrink:0;' +
      'font-family:var(--font-b)';
    span.textContent = label;
    span.addEventListener('mouseenter', () => {
      span.style.borderColor = 'rgba(240,168,48,.4)';
      span.style.color = 'var(--text2)';
    });
    span.addEventListener('mouseleave', () => {
      span.style.borderColor = 'rgba(255,255,255,.1)';
      span.style.color = 'var(--text3)';
    });
    return span;
  }

  // ── PATCH build.js render() TO INJECT AI TAB ─────────────────────────────
  // We hook into the DOM after build.js has rendered its tab bar and inject
  // the AI tab between Rank and Plug. Works by patching window.YM_Build.render.
  function _patchBuildRender() {
    if (!window.YM_Build) return false;

    const origRender = window.YM_Build.render;

    window.YM_Build.render = async function (containerArg, presetType) {
      await origRender.call(this, containerArg, presetType);

      // Find the tab bar inside the build panel body
      const body = containerArg ||
        document.getElementById('panel-build-body') ||
        document.getElementById('panel-mine-build');
      if (!body) return;

      _injectAITab(body);
    };

    // Also patch renderPublishForm if exposed
    if (window.YM_Build.renderPublishForm) {
      const origPub = window.YM_Build.renderPublishForm;
      window.YM_Build.renderPublishForm = async function (c, t) {
        await origPub.call(this, c, t);
        const body = c;
        if (body) _injectAITab(body);
      };
    }

    return true;
  }

  function _injectAITab(body) {
    // Prevent double-injection
    if (body.querySelector('[data-btab="ai"]')) return;

    // Find the tab bar (bottom of the build panel)
    const tabBar = body.querySelector('[data-btab="plug"]')?.parentElement;
    if (!tabBar) return;

    // Create AI tab pill — insert between Rank and Plug
    const plugTab  = tabBar.querySelector('[data-btab="plug"]');
    const rankTab  = tabBar.querySelector('[data-btab="rank"]');
    if (!plugTab || !rankTab) return;

    const aiTab = document.createElement('div');
    aiTab.className = 'ym-tab';
    aiTab.dataset.btab = 'ai';
    aiTab.style.cssText = 'flex:1;padding:10px 4px;font-size:10px;cursor:pointer';
    aiTab.innerHTML = '✦ AI';

    // Insert between Rank and Plug
    tabBar.insertBefore(aiTab, plugTab);

    // Find build-content div
    const buildContent = body.querySelector('#build-content');
    if (!buildContent) return;

    // Wire up click
    aiTab.addEventListener('click', () => {
      // Deactivate all tabs
      tabBar.querySelectorAll('[data-btab]').forEach(t => t.classList.remove('active'));
      aiTab.classList.add('active');

      buildContent.innerHTML = '';
      renderAIContent(buildContent);
    });
  }

  // ── DIRECT PANEL INJECTION (for mine panel's Build sub-tab) ──────────────
  // If the build panel is rendered inside panel-mine, watch for DOM changes.
  function _watchMinePanel() {
    const target = document.getElementById('panel-mine-build') ||
                   document.getElementById('panel-build-body');
    if (!target) return;

    const obs = new MutationObserver(() => {
      const body = target.querySelector('#build-content')?.parentElement || target;
      if (body && !body.querySelector('[data-btab="ai"]')) {
        _injectAITab(body);
      }
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  (function boot() {
    // Try to patch immediately if YM_Build is already loaded
    if (_patchBuildRender()) {
      _watchMinePanel();
      return;
    }

    // Otherwise poll until YM_Build is available (it's loaded async by app.js)
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (_patchBuildRender()) {
        clearInterval(iv);
        _watchMinePanel();

        // Also re-inject if the build panel is currently open
        const body = document.getElementById('panel-build-body') ||
                     document.getElementById('panel-mine-build');
        if (body) _injectAITab(body);
      }
      if (attempts > 60) clearInterval(iv); // give up after 30s
    }, 500);
  })();

  // ── PUBLIC API ────────────────────────────────────────────────────────────
  window.YM_AI = {
    renderAIContent,
    SYSTEM_SPHERE,
  };

})();
