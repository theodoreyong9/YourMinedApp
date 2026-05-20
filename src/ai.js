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
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
  },

  renderPanel(container) {
    container.innerHTML = '<div style="padding:16px"><div class="ym-card"><div class="ym-card-title">Title</div></div></div>';
  },
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
.ym-input .ym-notice .info/.success/.error/.warn
.ym-tabs .ym-tab .ym-tab.active .pill .pill.active

## RULES
- IIFE wrapper always — no top-level vars
- window.YM_S key MUST exactly match the filename
- activate() must complete in <8s — never await slow calls inside it
- deactivate() is a top-level method on the object

Output ONLY the complete file content. No explanation, no markdown fences.`;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function toast(m, t) { if (window.YM_toast) window.YM_toast(m, t); }

  // ── ENGINES ──────────────────────────────────────────────────────────────────
  // Priority: 1. WebLLM (local WebGPU)  2. Lemonade (local daemon)  3. Anthropic (proxy)

  const LEMONADE_BASE = 'http://localhost:13305/v1';
  const LEMONADE_KEY  = 'lemonade';

  async function detectEngine() {
    // 1. WebLLM
    if (window.__webllm && typeof window.__webllm.chat?.completions?.create === 'function')
      return { engine: 'webllm', models: [{ id: 'webllm', label: 'WebLLM (local)' }] };

    // 2. Lemonade
    try {
      const r = await fetch(LEMONADE_BASE + '/models', {
        headers: { Authorization: 'Bearer ' + LEMONADE_KEY },
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        const data = await r.json();
        const SKIP = new Set(['image','tts','transcription','embeddings','reranking']);
        const models = (data.data || [])
          .filter(m => m.downloaded && !(m.labels||[]).some(l => SKIP.has(l)))
          .map(m => ({ id: m.id, label: m.id + (m.size ? ' · ' + m.size + 'GB' : '') }));
        if (models.length)
          return { engine: 'lemonade', models };
      }
    } catch { /* offline */ }

    // 3. Anthropic (proxy — works when app is served via claude.ai or compatible host)
    return { engine: 'anthropic', models: [{ id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }] };
  }

  async function* streamGenerate(systemPrompt, userPrompt, engine, modelId) {
    // 1. WebLLM
    if (engine === 'webllm') {
      const stream = await window.__webllm.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3, max_tokens: 4096, stream: true,
      });
      for await (const chunk of stream) {
        const d = chunk.choices?.[0]?.delta?.content || '';
        if (d) yield d;
      }
      return;
    }

    // 2. Lemonade (OpenAI-compatible SSE)
    if (engine === 'lemonade') {
      const resp = await fetch(LEMONADE_BASE + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LEMONADE_KEY },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.3, max_tokens: 4096, stream: true,
        }),
      });
      if (!resp.ok) throw new Error('Lemonade HTTP ' + resp.status);
      yield* _readSSE(resp);
      return;
    }

    // 3. Anthropic — non-streaming (SSE blocked by CORS on some hosts)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelId || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Anthropic error ' + resp.status);
    }
    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const CHUNK = 60;
    for (let i = 0; i < text.length; i += CHUNK) {
      yield text.slice(i, i + CHUNK);
      await new Promise(r => setTimeout(r, 6));
    }
  }

  async function* _readSSE(resp) {
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
          const d = JSON.parse(raw).choices?.[0]?.delta?.content || '';
          if (d) yield d;
        } catch { /* skip */ }
      }
    }
  }

    // ── RENDER AI TAB CONTENT ─────────────────────────────────────────────────
  function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    let _type = 'sphere';
    let _engine = 'pollinations';
    let _modelId = 'qwen';

    // Helper: find element within body (avoids global ID conflicts)
    const $ = id => body.querySelector('#' + id);

    // ── Engine + model row ────────────────────────────────────────────────
    const engRow = document.createElement('div');
    engRow.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:8px';
    engRow.innerHTML =
      '<div data-dot style="width:6px;height:6px;border-radius:50%;background:var(--text3);flex-shrink:0;transition:background .3s"></div>' +
      '<span data-label style="font-size:9px;color:var(--text3);flex:1">Detecting…</span>' +
      '<select data-model style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--text);font-size:11px;padding:4px 8px;cursor:pointer;max-width:160px"><option value="qwen">Detecting…</option></select>';
    body.appendChild(engRow);

    const dot    = engRow.querySelector('[data-dot]');
    const label  = engRow.querySelector('[data-label]');
    const selEl  = engRow.querySelector('[data-model]');

    selEl.addEventListener('change', () => { _modelId = selEl.value; });

    detectEngine().then(({ engine, models }) => {
      _engine  = engine;
      _modelId = models[0]?.id || 'qwen';
      const NAMES = { webllm: 'WebLLM (local)', lemonade: 'Lemonade (local)', pollinations: 'Pollinations (cloud)' };
      dot.style.background   = engine === 'pollinations' ? 'var(--gold)' : 'var(--green)';
      label.textContent      = NAMES[engine] || engine;
      selEl.innerHTML        = models.map(m => '<option value="'+m.id+'">'+m.label+'</option>').join('');
      selEl.value            = _modelId;
    });

    // ── Type toggle ───────────────────────────────────────────────────────
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Generate</div>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button data-ts style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button data-tt style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    const sBtnEl = typeRow.querySelector('[data-ts]');
    const tBtnEl = typeRow.querySelector('[data-tt]');

    function setType(t) {
      _type = t;
      if (t === 'sphere') {
        sBtnEl.style.cssText = 'background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer';
        tBtnEl.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      } else {
        tBtnEl.style.cssText = 'background:rgba(8,224,248,.12);border:none;color:var(--cyan);font-size:10px;padding:5px 12px;cursor:pointer';
        sBtnEl.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      }
    }
    sBtnEl.addEventListener('click', () => setType('sphere'));
    tBtnEl.addEventListener('click', () => setType('theme'));

    // ── Prompt ────────────────────────────────────────────────────────────
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea data-prompt rows="6" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:var(--text,#e4e6f4);padding:10px 12px;outline:none" placeholder="Describe what to generate…"></textarea>';
    body.appendChild(promptWrap);

    const promptEl = promptWrap.querySelector('[data-prompt]');

    // ── Generate button ───────────────────────────────────────────────────
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button data-gen style="width:100%;font-size:13px;padding:12px;background:linear-gradient(135deg,var(--gold,#f0a830),rgba(240,168,48,.75));color:#05030a;border:none;border-radius:10px;font-weight:700;cursor:pointer;transition:opacity .2s">✦ Generate</button>' +
      '<div data-prog style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    const genBtn = genWrap.querySelector('[data-gen]');
    const progEl = genWrap.querySelector('[data-prog]');

    // ── Output ────────────────────────────────────────────────────────────
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<button data-copy style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(240,240,248,.52);font-size:9px;padding:3px 9px;cursor:pointer">⎘ Copy</button>' +
      '</div>' +
      '<textarea data-out style="flex:1;min-height:180px;font-family:monospace;font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;margin-bottom:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:var(--text,#e4e6f4);padding:10px 12px;outline:none" placeholder="Generated code appears here…" spellcheck="false"></textarea>';
    body.appendChild(outWrap);

    const outEl  = outWrap.querySelector('[data-out]');
    const copyBtn = outWrap.querySelector('[data-copy]');

    // ── Generate handler ──────────────────────────────────────────────────
    genBtn.addEventListener('click', async () => {
      const prompt = (promptEl.value || '').trim();
      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = prompt.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24).replace(/-$/, '');
      const filename = slug + ext;

      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
        '',
        'Requirements:',
        prompt,
      ].join('\n');

      genBtn.disabled = true;
      genBtn.style.opacity = '0.5';
      genBtn.textContent = '⏳ Generating…';
      outEl.value = '';
      progEl.textContent = 'Starting ' + _engine + ' / ' + _modelId + '…';

      let fullCode = '';
      let tokenCount = 0;
      const t0 = Date.now();

      try {
        for await (const chunk of streamGenerate(SYSTEM_SPHERE, userPrompt, _engine, _modelId)) {
          fullCode += chunk;
          tokenCount++;
          outEl.value = fullCode;
          outEl.scrollTop = outEl.scrollHeight;
          if (tokenCount % 20 === 0) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            progEl.textContent = elapsed + 's…';
          }
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        progEl.innerHTML = '<span style="color:var(--green,#22d98a)">✓ Done in ' + elapsed + 's</span>';
        toast('Code generated!', 'success');
      } catch (e) {
        progEl.innerHTML = '<span style="color:var(--red,#ff4560)">✗ ' + esc(e.message) + '</span>';
        toast(e.message, 'error');
      } finally {
        genBtn.disabled = false;
        genBtn.style.opacity = '1';
        genBtn.textContent = '✦ Generate';
      }
    });

    // ── Copy handler ──────────────────────────────────────────────────────
    copyBtn.addEventListener('click', () => {
      const code = outEl.value || '';
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

    // ── INJECT AI TAB ─────────────────────────────────────────────────────────
  function _injectAITab(body) {
    if (!body) return;
    if (body.querySelector('[data-btab="ai"]')) return;
    const plugTab = body.querySelector('[data-btab="plug"]');
    if (!plugTab) return;
    const tabBar = plugTab.parentElement;
    if (!tabBar) return;
    const buildContent = body.querySelector('#build-content');
    if (!buildContent) return;

    const aiTab = document.createElement('div');
    aiTab.className = 'ym-tab';
    aiTab.dataset.btab = 'ai';
    aiTab.style.cssText = 'flex:1;padding:10px 4px;font-size:10px;cursor:pointer';
    aiTab.textContent = '✦ AI';
    tabBar.insertBefore(aiTab, plugTab);

    aiTab.addEventListener('click', () => {
      tabBar.querySelectorAll('[data-btab]').forEach(t => t.classList.remove('active'));
      aiTab.classList.add('active');
      buildContent.innerHTML = '';
      renderAIContent(buildContent);
    });
  }

  // ── PATCH YM_Build.render ─────────────────────────────────────────────────
  function _patchBuildRender() {
    if (!window.YM_Build) return false;
    if (window.YM_Build.__ai) return true;

    const origRender = window.YM_Build.render;
    window.YM_Build.render = async function (containerArg, presetType) {
      await origRender.call(this, containerArg, presetType);
      const body = containerArg ||
        document.getElementById('panel-build-body') ||
        document.getElementById('panel-mine-build');
      if (body) _injectAITab(body);
    };

    if (typeof window.YM_Build.renderPublishForm === 'function') {
      const origPub = window.YM_Build.renderPublishForm;
      window.YM_Build.renderPublishForm = async function (c, t) {
        await origPub.call(this, c, t);
        if (c) _injectAITab(c);
      };
    }

    window.YM_Build.__ai = true;
    return true;
  }

  function _watchMinePanel() {
    const target = document.getElementById('panel-mine-build') ||
                   document.getElementById('panel-build-body');
    if (!target) return;
    const obs = new MutationObserver(() => {
      const body = target.querySelector('#build-content')?.parentElement || target;
      if (body && !body.querySelector('[data-btab="ai"]')) _injectAITab(body);
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  (function boot() {
    if (_patchBuildRender()) { _watchMinePanel(); return; }
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (_patchBuildRender()) { clearInterval(iv); _watchMinePanel(); }
      if (n > 60) clearInterval(iv);
    }, 500);
  })();

  window.YM_AI = { renderAIContent, SYSTEM_SPHERE };

})();
