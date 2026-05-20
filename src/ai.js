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

  // ── GENERATION ────────────────────────────────────────────────────────────
  // Uses the Anthropic API proxy (no CORS, no key needed inside claude.ai)
  async function* streamGenerate(systemPrompt, userPrompt) {
    // 1. WebLLM local (WebGPU)
    const llm = window.__webllm;
    if (llm && typeof llm.chat?.completions?.create === 'function') {
      try {
        const stream = await llm.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) yield delta;
        }
        return;
      } catch (e) {
        console.warn('[AI] WebLLM failed:', e.message);
      }
    }

    // 2. Anthropic API (proxy — no key, no CORS)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || 'API error ' + resp.status);
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
          const ev = JSON.parse(raw);
          // Anthropic SSE format: content_block_delta with delta.text
          const delta = ev.delta?.text || ev.choices?.[0]?.delta?.content || '';
          if (delta) yield delta;
        } catch { /* skip malformed */ }
      }
    }
  }

  // ── RENDER AI TAB CONTENT ─────────────────────────────────────────────────
  function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    let _type = 'sphere';

    // ── Engine indicator ──────────────────────────────────────────────────
    const engBadge = document.createElement('div');
    engBadge.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:6px';
    const hasWebLLM = !!(window.__webllm && typeof window.__webllm.chat?.completions?.create === 'function');
    engBadge.innerHTML =
      '<div style="width:6px;height:6px;border-radius:50%;background:' + (hasWebLLM ? 'var(--green)' : 'var(--gold)') + ';flex-shrink:0"></div>' +
      '<span style="font-size:9px;color:var(--text3)">' +
        (hasWebLLM ? 'WebLLM local (WebGPU)' : 'Claude API') +
      '</span>';
    body.appendChild(engBadge);

    // ── Type toggle ───────────────────────────────────────────────────────
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Generate</div>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button id="ai-type-sphere" style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button id="ai-type-theme"  style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    // ── Prompt ────────────────────────────────────────────────────────────
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea id="ai-prompt" class="ym-input" rows="6" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical" placeholder="Describe what to generate…"></textarea>';
    body.appendChild(promptWrap);



    // ── Generate button ───────────────────────────────────────────────────
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button id="ai-generate" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">✦ Generate</button>' +
      '<div id="ai-progress" style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    // ── Output ────────────────────────────────────────────────────────────
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<button id="ai-copy" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 9px">⎘ Copy</button>' +
      '</div>' +
      '<textarea id="ai-output" class="ym-input" style="flex:1;min-height:180px;font-family:var(--font-m);font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;margin-bottom:14px" placeholder="Generated code appears here…" spellcheck="false"></textarea>';
    body.appendChild(outWrap);

    // ── Type toggle wiring ────────────────────────────────────────────────
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

    // ── Generate ─────────────────────────────────────────────────────────
    body.querySelector('#ai-generate').addEventListener('click', async () => {
      const prompt  = (body.querySelector('#ai-prompt')?.value || '').trim();
      const outEl   = body.querySelector('#ai-output');
      const progEl  = body.querySelector('#ai-progress');
      const genBtn  = body.querySelector('#ai-generate');

      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = prompt.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24).replace(/-$/,'');
      const filename = slug + ext;

      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
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
        for await (const chunk of streamGenerate(SYSTEM_SPHERE, userPrompt)) {
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
        progEl.innerHTML = '<span style="color:var(--green)">✓ Done in ' + elapsed + 's</span>';
        toast('Code generated!', 'success');
      } catch (e) {
        progEl.innerHTML = '<span style="color:var(--red)">✗ ' + esc(e.message) + '</span>';
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
