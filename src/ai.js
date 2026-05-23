/* jshint esversion:11 */
// ai.js — YourMine AI Code Generator
(function () {
  'use strict';

  const SYSTEM_SPHERE = `You are an expert YourMine developer. Output ONLY the complete file code. No explanation, no markdown fences, no preamble.

## SPHERE FILE (filename.sphere.js)
(function(){
'use strict';
window.YM_S = window.YM_S || {};
let _ctx = null, _timer = null;
window.YM_S['FILENAME'] = {
  name: 'Display Name',
  icon: '🔮',
  category: 'Tools',
  description: 'Under 140 chars.',

  activate(ctx) {
    _ctx = ctx;
    // ctx.storage.get/set/del(key)
    // ctx.toast(msg, 'success'|'error'|'info'|'warn')
    // ctx.send(type, data)          — P2P broadcast, rate-limited 10/s
    // ctx.onReceive((type, data, peerId) => {})  — auto-cleaned on deactivate
    // ctx.openPanel(renderFn)
    // ctx.setNotification(n)        — badge on desktop icon
    // ctx.saveProfile(obj) / ctx.loadProfile()
    // window.YM_Social?._nearUsers  — Map<uuid,{profile,ts,peerId,broadcastData}>
    // window.YM_sphereRegistry      — Map<filename,ctx> of active spheres
    // window.YM_P2P?.sendTo(peerId, {sphere,type,data})
    // window.YM?.openSpherePanel?.('filename.sphere.js')
    // window.YM?.openProfilePanel?.(profileObject)
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
  },

  renderPanel(container) {
    container.innerHTML = '<div style="padding:16px"><div class="ym-card"><div class="ym-card-title">Title</div></div></div>';
  },

  // Optional:
  profileSection(container) { /* shown in own profile → Spheres tab */ },
  peerSection(container, peerCtx) {
    // peerCtx = { uuid, isNear, isReciproc, profile }
    // NOT the activate ctx — use window.YM_P2P.sendTo() for P2P here
  },
  broadcastData() {
    // Merged into social presence packet — keep < 500 bytes
    return {};
  },
};
})();

## THEME FILE (name.theme.html)
<!-- HTML fragment injected into <body> by index.html -->
<!-- Must include ALL required YourMine DOM elements -->
<script>
window.YM_THEME_META = {"name":"ThemeName","icon":"🎨","description":"Short description"};
window.YM_WALLPAPER_PRESETS = [{ label: 'Name', url: 'https://...' }];
// Optional: window.YM_NO_WIDGETS = true; to suppress sphere widgets
</script>
<!-- Required IDs: ym-wp, ym-bg, ym-loader, toasts, desktop, desktop-slider,
     drag-ghost, page-dots, nav-bar, dock, btn-back, btn-profile, btn-figure,
     panel-overlay, panel-spheres, panel-spheres-body, panel-profile, panel-profile-body,
     panel-build, panel-build-body, panel-mine, panel-mine-wallet, panel-mine-build,
     panel-mine-formula, panel-mine-liste, mine-tabs-bar, panel-sphere, sphere-panel-title,
     panel-sphere-body, panel-profile-view, profile-view-title, panel-profile-view-body,
     panel-switcher, switcher-handle, switcher-grid, folder-dlg, folder-name-input,
     folder-confirm, folder-cancel, bg-dlg, bg-presets, theme-list, theme-custom-input,
     theme-custom-btn, bg-wp, bg-remove, bg-spheres, bg-del, bg-dlg-title,
     ym-sign-dlg, ym-sign-sphere, ym-sign-detail, ym-sign-confirm, ym-sign-reject,
     pwa-install-btn, spheres-build-btn, profile-share-btn -->
<!-- Grid: --cols:4 --rows:6 mobile / --cols:8 --rows:5 desktop -->
<!-- Widget injection: use MutationObserver to catch position:fixed elements injected by spheres -->

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

## CRITICAL RULES
- IIFE wrapper always — no top-level vars
- window.YM_S key MUST exactly match the filename
- activate() must complete in <8s — never await slow calls inside it
- deactivate() is a top-level method on the object, never ctx.deactivate=...
- Widget page registry: YM_Desk.registerWidgetPage(id,page) / registeredWidgetPage(id) / unregisterWidget(id)
- Do NOT clamp targetPage to pageCount at spawn — registerWidgetPage creates pages as needed
- broadcastData() is called by social.sphere.js — keep payload small

Output ONLY the complete file content. No explanation, no markdown fences.`;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function toast(m, t) { if (window.YM_toast) window.YM_toast(m, t); }

  // ── GENERATION ────────────────────────────────────────────────
  // 1. WebLLM (WebGPU local) → 2. Lemonade (localhost:13305) → 3. Ollama (localhost:11434)
  async function detectEngine() {
    // 1. WebLLM
    const llm = window.__webllm;
    if (llm && typeof llm.chat?.completions?.create === 'function') {
      return { type: 'webllm', label: 'WebLLM local (WebGPU)', models: ['webllm'] };
    }
    // 2. Lemonade
    try {
      const r = await fetch('http://localhost:13305/api/v1/models', { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const d = await r.json();
        const models = (d.data || d.models || []).map(m => m.id || m.name || m).filter(Boolean);
        return { type: 'lemonade', label: 'Lemonade (local)', models: models.length ? models : ['default'] };
      }
    } catch {}
    // 3. Ollama
    try {
      const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const d = await r.json();
        const models = (d.models || []).map(m => m.name).filter(Boolean);
        return { type: 'ollama', label: 'Ollama (local)', models: models.length ? models : ['llama3'] };
      }
    } catch {}
    return { type: 'none', label: 'No engine detected', models: [] };
  }

  async function* streamGenerate(engine, model, systemPrompt, userPrompt) {
    if (engine.type === 'webllm') {
      const llm = window.__webllm;
      const stream = await llm.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3, max_tokens: 4096, stream: true,
      });
      for await (const chunk of stream) {
        const d = chunk.choices?.[0]?.delta?.content || '';
        if (d) yield d;
      }
      return;
    }
    if (engine.type === 'lemonade') {
      const resp = await fetch('http://localhost:13305/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: true, max_tokens: 4096 }),
      });
      if (!resp.ok) throw new Error('Lemonade error ' + resp.status);
      yield* readSSE(resp);
      return;
    }
    if (engine.type === 'ollama') {
      const resp = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: true }),
      });
      if (!resp.ok) throw new Error('Ollama error ' + resp.status);
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
          if (!line.trim()) continue;
          try { const ev = JSON.parse(line); const d = ev.message?.content || ''; if (d) yield d; } catch {}
        }
      }
      return;
    }
    throw new Error('No engine available. Install Lemonade or Ollama, or enable WebGPU.');
  }

  async function* readSSE(resp) {
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
        try { const ev = JSON.parse(raw); const d = ev.choices?.[0]?.delta?.content || ev.delta?.text || ''; if (d) yield d; } catch {}
      }
    }
  }

  // ── RENDER ────────────────────────────────────────────────────
  function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    let _type = 'sphere';
    let _engine = { type: 'none', label: 'Detecting…', models: [] };
    let _model = '';

    // Engine indicator
    const engRow = document.createElement('div');
    engRow.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:8px';
    body.appendChild(engRow);

    function updateEngBadge() {
      const ok = _engine.type !== 'none';
      engRow.innerHTML =
        '<div style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:' + (ok ? 'var(--green)' : 'var(--red)') + '"></div>' +
        '<span style="font-size:9px;color:var(--text3);flex:1">' + esc(_engine.label) + '</span>' +
        (_engine.models.length > 1 ?
          '<select id="ai-model" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text2);font-size:10px;border-radius:6px;padding:2px 6px;cursor:pointer">' +
          _engine.models.map(m => '<option value="' + esc(m) + '"' + (m === _model ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
          '</select>' : '');
      body.querySelector('#ai-model')?.addEventListener('change', e => { _model = e.target.value; });
    }

    detectEngine().then(eng => {
      _engine = eng;
      _model = eng.models[0] || '';
      updateEngBadge();
    });
    updateEngBadge();

    // Type toggle
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Generate</div>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button id="ai-type-sphere" style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button id="ai-type-theme"  style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    // Prompt
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea id="ai-prompt" class="ym-input" rows="6" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical" placeholder="Describe what to generate…"></textarea>';
    body.appendChild(promptWrap);

    // Category
    const optsWrap = document.createElement('div');
    optsWrap.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    optsWrap.innerHTML =
      '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Category</div>' +
      '<input id="ai-cat" class="ym-input" placeholder="Tools" style="font-size:11px;width:100%;box-sizing:border-box">';
    body.appendChild(optsWrap);

    // Generate button
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button id="ai-generate" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">✦ Generate</button>' +
      '<div id="ai-progress" style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    // Output
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<span id="ai-chars" style="font-size:9px;color:var(--text3)">0 chars</span>' +
        '<button id="ai-copy" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 9px">⎘ Copy</button>' +
      '</div>' +
      '<textarea id="ai-output" class="ym-input" style="flex:1;min-height:180px;font-family:var(--font-m);font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;margin-bottom:14px" placeholder="Generated code appears here…" spellcheck="false"></textarea>';
    body.appendChild(outWrap);

    // Type toggle wiring
    function setType(t) {
      _type = t;
      const sBtn  = typeRow.querySelector('#ai-type-sphere');
      const thBtn = typeRow.querySelector('#ai-type-theme');
      if (t === 'sphere') {
        sBtn.style.cssText  = 'background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer';
        thBtn.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      } else {
        thBtn.style.cssText = 'background:rgba(8,224,248,.12);border:none;color:var(--cyan);font-size:10px;padding:5px 12px;cursor:pointer';
        sBtn.style.cssText  = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      }
    }
    typeRow.querySelector('#ai-type-sphere').addEventListener('click', () => setType('sphere'));
    typeRow.querySelector('#ai-type-theme').addEventListener('click',  () => setType('theme'));

    // Generate
    body.querySelector('#ai-generate').addEventListener('click', async () => {
      const prompt  = (body.querySelector('#ai-prompt')?.value || '').trim();
      const cat     = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      const outEl   = body.querySelector('#ai-output');
      const progEl  = body.querySelector('#ai-progress');
      const charsEl = body.querySelector('#ai-chars');
      const genBtn  = body.querySelector('#ai-generate');

      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }
      if (_engine.type === 'none') { toast('No engine available — install Lemonade or Ollama', 'error'); return; }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/-$/, '');
      const filename = slug + ext;

      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
        'Category: ' + cat,
        '',
        'Requirements:',
        prompt,
      ].join('\n');

      genBtn.disabled = true;
      genBtn.textContent = '⏳ Generating…';
      outEl.value = '';
      charsEl.textContent = '0 chars';
      progEl.textContent = 'Starting…';

      let fullCode = '';
      let tokenCount = 0;
      const t0 = Date.now();

      try {
        for await (const chunk of streamGenerate(_engine, _model, SYSTEM_SPHERE, userPrompt)) {
          fullCode += chunk;
          tokenCount++;
          outEl.value = fullCode;
          outEl.scrollTop = outEl.scrollHeight;
          charsEl.textContent = fullCode.length + ' chars';
          if (tokenCount % 20 === 0) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            progEl.textContent = fullCode.length + ' chars · ' + elapsed + 's';
          }
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        progEl.innerHTML = '<span style="color:var(--green)">✓ Done in ' + elapsed + 's — ' + fullCode.length + ' chars</span>';
        toast('Code generated!', 'success');
      } catch (e) {
        progEl.innerHTML = '<span style="color:var(--red)">✗ ' + esc(e.message) + '</span>';
        toast(e.message, 'error');
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = '✦ Generate';
      }
    });

    // Copy
    body.querySelector('#ai-copy').addEventListener('click', () => {
      const code = body.querySelector('#ai-output')?.value || '';
      if (!code) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard?.writeText(code)
        .then(() => toast('Copied!', 'success'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = code; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('Copied!', 'success');
        });
    });
  }

  // ── PATCH YM_Build.render ──────────────────────────────────────
  function _patchBuildRender() {
    if (!window.YM_Build) return false;
    if (window.YM_Build.__ai) return true;
    const origRender = window.YM_Build.render;
    window.YM_Build.render = async function (containerArg, presetType) {
      await origRender.call(this, containerArg, presetType);
    };
    window.YM_Build.__ai = true;
    return true;
  }

  // ── BOOT ──────────────────────────────────────────────────────
  (function boot() {
    _patchBuildRender();
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (_patchBuildRender()) clearInterval(iv);
      if (n > 60) clearInterval(iv);
    }, 500);
  })();

  window.YM_AI = { renderAIContent, SYSTEM_SPHERE };

})();
