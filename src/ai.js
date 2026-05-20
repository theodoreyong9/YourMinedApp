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
  // All local, all free, no API key.
  // Priority: 1. WebLLM  2. Lemonade (localhost:13305)  3. Ollama (localhost:11434)

  const LEMONADE_BASE = 'http://localhost:13305/v1';
  const LEMONADE_KEY  = 'lemonade';
  const OLLAMA_BASE   = 'http://localhost:11434';

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

    // 3. Ollama
    try {
      const r = await fetch(OLLAMA_BASE + '/api/tags', {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        const data = await r.json();
        const models = (data.models || []).map(m => ({ id: m.name, label: m.name }));
        if (models.length)
          return { engine: 'ollama', models };
      }
    } catch { /* offline */ }

    return { engine: 'none', models: [{ id: 'none', label: 'No engine found' }] };
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

    // 3. Ollama
    if (engine === 'ollama') {
      const resp = await fetch(OLLAMA_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          stream: true,
        }),
      });
      if (!resp.ok) throw new Error('Ollama HTTP ' + resp.status);
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
          try {
            const ev = JSON.parse(line);
            const d = ev.message?.content || '';
            if (d) yield d;
            if (ev.done) return;
          } catch { /* skip */ }
        }
      }
      return;
    }

    throw new Error('No local AI engine found. Install Lemonade or Ollama to use this feature.');
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
    body.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden;background:transparent';

    // ── Perlin background ─────────────────────────────────────────────────
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    body.appendChild(cv);
    const ctx2d = cv.getContext('2d');
    let W,H,OW,OH,offscreen,offCtx,imgData,buf32,timeAcc=0,lastT=0,rafId;
    const PERM=new Uint8Array(512);
    (function(){const p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;for(let i=255;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=p[i];p[i]=p[j];p[j]=t;}for(let i=0;i<512;i++)PERM[i]=p[i&255];})();
    function fade(t){return t*t*t*(t*(t*6-15)+10);}
    function lerp(a,b,t){return a+(b-a)*t;}
    function grad2(h,x,y){const hh=h&3;const u=hh<2?x:y;const v=hh<2?y:x;return((hh&1)?-u:u)+((hh&2)?-v:v);}
    function noise2(x,y){const xi=Math.floor(x)&255,yi=Math.floor(y)&255,xf=x-Math.floor(x),yf=y-Math.floor(y),u=fade(xf),v=fade(yf),aa=PERM[PERM[xi]+yi],ab=PERM[PERM[xi]+yi+1],ba=PERM[PERM[xi+1]+yi],bb=PERM[PERM[xi+1]+yi+1];return lerp(lerp(grad2(aa,xf,yf),grad2(ba,xf-1,yf),u),lerp(grad2(ab,xf,yf-1),grad2(bb,xf-1,yf-1),u),v);}
    function fbm(x,y){return noise2(x,y)*0.5+noise2(x*2.1,y*2.1)*0.3+noise2(x*4.3,y*4.3)*0.2;}
    function resizeCanvas(){W=cv.width=body.offsetWidth||300;H=cv.height=body.offsetHeight||400;OW=Math.ceil(W/3);OH=Math.ceil(H/3);offscreen=document.createElement('canvas');offscreen.width=OW;offscreen.height=OH;offCtx=offscreen.getContext('2d');imgData=offCtx.createImageData(OW,OH);buf32=new Uint32Array(imgData.data.buffer);}
    function drawNoise(ts){rafId=requestAnimationFrame(drawNoise);const dt=Math.min(ts-lastT,50);lastT=ts;timeAcc+=dt;const t=timeAcc*0.00018;let idx=0;for(let py=0;py<OH;py++){const fy=py*0.0052+t*0.6;for(let px=0;px<OW;px++){const fx=px*0.0048+t*0.4,n=fbm(fx,fy),n2=fbm(fx+t*0.3,fy+0.7),v=(n*0.6+n2*0.4)*0.5+0.5,hv=fbm(fx*0.5+1.3,fy*0.5+t*0.2)*0.5+0.5;let r,g,b;if(hv<0.5){const tt=hv*2;r=(240*(1-tt)+34*tt)|0;g=(168*(1-tt)+211*tt)|0;b=(48*(1-tt)+238*tt)|0;}else{const tt=(hv-0.5)*2;r=(34*(1-tt)+167*tt)|0;g=(211*(1-tt)+139*tt)|0;b=(238*(1-tt)+250*tt)|0;}const a=Math.min(0.52,v*v*0.52);buf32[idx++]=((a*255|0)<<24)|(b<<16)|(g<<8)|r;}}offCtx.putImageData(imgData,0,0);ctx2d.clearRect(0,0,W,H);ctx2d.drawImage(offscreen,0,0,W,H);}
    resizeCanvas();rafId=requestAnimationFrame(drawNoise);
    const cleanObs=new MutationObserver(()=>{if(!document.body.contains(cv)){cancelAnimationFrame(rafId);cleanObs.disconnect();}});
    cleanObs.observe(body,{childList:true});

    // ── Content (above canvas) ────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;z-index:1;flex:1;display:flex;flex-direction:column;min-height:0;overflow-y:auto;padding:20px 16px';
    body.appendChild(wrap);

    let _type = 'sphere';
    let _engine = null;
    let _modelId = null;
    let _webllmEngine = null;
    let _loadingModel = false;

    // ── Engine status ─────────────────────────────────────────────────────
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:8px 12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:10px;flex-shrink:0';
    statusEl.innerHTML = '<div data-dot style="width:6px;height:6px;border-radius:50%;background:var(--text3);flex-shrink:0"></div><span data-label style="font-size:10px;color:var(--text3);flex:1">Detecting…</span>';
    wrap.appendChild(statusEl);
    const dot   = statusEl.querySelector('[data-dot]');
    const label = statusEl.querySelector('[data-label]');

    detectEngine().then(({ engine, models }) => {
      _engine  = engine;
      _modelId = models[0]?.id || null;
      const NAMES = { webllm:'WebLLM (local)', lemonade:'Lemonade (local)', ollama:'Ollama (local)', none:'No local engine' };
      dot.style.background = engine === 'none' ? 'var(--text3)' : 'var(--green,#22d98a)';
      label.textContent    = NAMES[engine] || engine;
      if (engine !== 'none' && models.length > 1) {
        const sel = document.createElement('select');
        sel.style.cssText = 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text);font-size:10px;padding:3px 6px;cursor:pointer;max-width:140px';
        sel.innerHTML = models.map(m=>'<option value="'+m.id+'">'+m.label+'</option>').join('');
        sel.addEventListener('change', ()=>{ _modelId = sel.value; });
        statusEl.appendChild(sel);
      }
    });

    // ── Type toggle ───────────────────────────────────────────────────────
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-shrink:0';
    typeRow.innerHTML =
      '<span style="font-size:10px;color:var(--text3);flex:1">Generate</span>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button data-ts style="background:rgba(240,168,48,.12);border:none;color:var(--gold,#f0a830);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button data-tt style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    wrap.appendChild(typeRow);
    const sBtnEl=typeRow.querySelector('[data-ts]'),tBtnEl=typeRow.querySelector('[data-tt]');
    function setType(t){_type=t;if(t==='sphere'){sBtnEl.style.cssText='background:rgba(240,168,48,.12);border:none;color:var(--gold,#f0a830);font-size:10px;padding:5px 12px;cursor:pointer';tBtnEl.style.cssText='background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';}else{tBtnEl.style.cssText='background:rgba(34,211,238,.12);border:none;color:var(--cyan,#22d3ee);font-size:10px;padding:5px 12px;cursor:pointer';sBtnEl.style.cssText='background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';}}
    sBtnEl.addEventListener('click',()=>setType('sphere'));
    tBtnEl.addEventListener('click',()=>setType('theme'));

    // ── Prompt ────────────────────────────────────────────────────────────
    const promptEl = document.createElement('textarea');
    promptEl.rows = 5;
    promptEl.placeholder = 'Describe what to generate…';
    promptEl.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--text,#f0f0f8);font-size:12px;font-family:inherit;line-height:1.5;padding:10px 12px;outline:none;margin-bottom:10px;flex-shrink:0';
    wrap.appendChild(promptEl);

    // ── Progress ──────────────────────────────────────────────────────────
    const progEl = document.createElement('div');
    progEl.style.cssText = 'font-size:10px;color:var(--text3);min-height:14px;text-align:center;margin-bottom:8px;flex-shrink:0';
    wrap.appendChild(progEl);

    // ── Action buttons ────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;flex-shrink:0;flex-wrap:wrap';
    btnRow.innerHTML =
      // Try in browser (WebLLM)
      '<button data-webllm style="flex:1;min-width:120px;padding:10px;background:linear-gradient(135deg,var(--gold,#f0a830),rgba(240,168,48,.75));color:#05030a;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">⚡ Try in browser</button>' +
      // Generate (local engine)
      '<button data-gen style="flex:1;min-width:120px;padding:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--text2);border-radius:10px;font-size:12px;cursor:pointer">▶ Generate</button>';
    wrap.appendChild(btnRow);

    // Download README link
    const readmeLink = document.createElement('a');
    readmeLink.href = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/README.md';
    readmeLink.target = '_blank';
    readmeLink.rel = 'noopener';
    readmeLink.style.cssText = 'display:block;text-align:center;font-size:10px;color:var(--text3);text-decoration:none;margin-bottom:14px;flex-shrink:0;opacity:.7';
    readmeLink.textContent = '↓ Download README to prompt your own AI';
    wrap.appendChild(readmeLink);

    // ── Output ────────────────────────────────────────────────────────────
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:120px';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<span style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;flex:1">Output</span>' +
        '<button data-copy style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text3);font-size:9px;padding:3px 9px;cursor:pointer">⎘ Copy</button>' +
      '</div>' +
      '<textarea data-out style="flex:1;min-height:120px;font-family:monospace;font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:var(--text,#f0f0f8);padding:10px 12px;outline:none" placeholder="Generated code appears here…" spellcheck="false"></textarea>';
    wrap.appendChild(outWrap);
    const outEl  = outWrap.querySelector('[data-out]');
    const copyBtn = outWrap.querySelector('[data-copy]');

    // ── WebLLM button ─────────────────────────────────────────────────────
    // Phase 1: Load lib + download model (no prompt needed)
    // Phase 2: Generate (prompt needed)
    const webllmBtn = btnRow.querySelector('[data-webllm]');

    async function loadWebLLM() {
      if (_webllmEngine) return true;
      if (_loadingModel) return false;
      _loadingModel = true;
      webllmBtn.disabled = true;
      webllmBtn.textContent = '⏳ Loading library…';
      progEl.textContent = 'Loading WebLLM…';

      try {
        // WebLLM — load from official CDN (browser-native build)
        if (!window._webllmReady) {
          progEl.textContent = 'Loading WebLLM…';
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.type = 'module';
            s.textContent = `
              import { CreateMLCEngine } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.73/+esm';
              window._webllmCreate = CreateMLCEngine;
              window._webllmReady = true;
              window.dispatchEvent(new Event('webllm:ready'));
            `;
            s.onerror = () => rej(new Error('WebLLM script error'));
            document.head.appendChild(s);
            const onReady = () => { window.removeEventListener('webllm:ready', onReady); res(); };
            window.addEventListener('webllm:ready', onReady);
            setTimeout(() => rej(new Error('WebLLM load timeout — requires Chrome/Edge with WebGPU')), 20000);
          });
        }

        webllmBtn.textContent = '⏳ Downloading model…';
        progEl.textContent = 'Downloading Qwen 1.5B (~800MB, cached after first download)…';

        _webllmEngine = await window._webllmCreate(
          'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
          { initProgressCallback: p => {
            const pct = Math.round((p.progress||0)*100);
            progEl.textContent = p.text || ('Downloading… ' + pct + '%');
            webllmBtn.textContent = '⏳ ' + pct + '%';
          }}
        );
        progEl.innerHTML = '<span style="color:var(--green,#22d98a)">✓ Model ready</span>';
        webllmBtn.textContent = '⚡ Generate';
        webllmBtn.disabled = false;
        _loadingModel = false;
        return true;
      } catch(e) {
        progEl.innerHTML = '<span style="color:var(--red,#ff4560)">✗ ' + esc(e.message) + '</span>';
        webllmBtn.textContent = '⚡ Try in browser';
        webllmBtn.disabled = false;
        _loadingModel = false;
        return false;
      }
    }

    webllmBtn.addEventListener('click', async () => {
      // If model not loaded yet — just load it
      if (!_webllmEngine) { await loadWebLLM(); return; }

      // Model ready — generate
      const prompt = promptEl.value.trim();
      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      webllmBtn.disabled = true;
      webllmBtn.textContent = '⏳ Generating…';
      outEl.value = '';
      progEl.textContent = 'Generating…';

      const ext  = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24).replace(/-$/,'');
      const userPrompt = ['Generate a YourMine ' + _type + ' file.','Filename: '+slug+ext,'','Requirements:',prompt].join('\n');

      let full='', toks=0, t0=Date.now();
      try {
        const stream = await _webllmEngine.chat.completions.create({
          messages: [{ role:'system', content: SYSTEM_SPHERE }, { role:'user', content: userPrompt }],
          temperature: 0.3, max_tokens: 4096, stream: true,
        });
        for await (const chunk of stream) {
          const d = chunk.choices?.[0]?.delta?.content || '';
          if (d) { full+=d; toks++; outEl.value=full; outEl.scrollTop=outEl.scrollHeight; }
          if (toks%20===0) progEl.textContent = ((Date.now()-t0)/1000).toFixed(1)+'s…';
        }
        progEl.innerHTML = '<span style="color:var(--green,#22d98a)">✓ Done in '+((Date.now()-t0)/1000).toFixed(1)+'s</span>';
        toast('Code generated!', 'success');
      } catch(e) {
        progEl.innerHTML = '<span style="color:var(--red,#ff4560)">✗ '+esc(e.message)+'</span>';
        toast(e.message, 'error');
      } finally {
        webllmBtn.disabled = false;
        webllmBtn.textContent = '⚡ Generate';
      }
    });

    // ── Generate button (local engine) ────────────────────────────────────
    const genBtn = btnRow.querySelector('[data-gen]');
    genBtn.addEventListener('click', async () => {
      const prompt = promptEl.value.trim();
      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }
      if (!_engine || _engine === 'none') { toast('No local engine detected', 'warn'); return; }

      const ext  = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24).replace(/-$/,'');
      const userPrompt = ['Generate a YourMine ' + _type + ' file.','Filename: '+slug+ext,'','Requirements:',prompt].join('\n');

      genBtn.disabled = true; genBtn.style.opacity = '.5';
      genBtn.textContent = '⏳ Generating…';
      outEl.value = ''; progEl.textContent = 'Starting…';

      let full='', toks=0, t0=Date.now();
      try {
        for await (const chunk of streamGenerate(SYSTEM_SPHERE, userPrompt, _engine, _modelId)) {
          full += chunk; toks++;
          outEl.value = full; outEl.scrollTop = outEl.scrollHeight;
          if (toks%20===0) progEl.textContent = ((Date.now()-t0)/1000).toFixed(1) + 's…';
        }
        progEl.innerHTML = '<span style="color:var(--green,#22d98a)">✓ Done in ' + ((Date.now()-t0)/1000).toFixed(1) + 's</span>';
        toast('Code generated!', 'success');
      } catch(e) {
        progEl.innerHTML = '<span style="color:var(--red,#ff4560)">✗ ' + esc(e.message) + '</span>';
        toast(e.message, 'error');
      } finally {
        genBtn.disabled=false; genBtn.style.opacity='1'; genBtn.textContent='▶ Generate';
      }
    });

    // ── Copy ──────────────────────────────────────────────────────────────
    copyBtn.addEventListener('click', () => {
      const code = outEl.value || '';
      if (!code) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard?.writeText(code).then(()=>toast('Copied!','success')).catch(()=>{
        const ta=document.createElement('textarea');ta.value=code;ta.style.cssText='position:fixed;opacity:0';
        document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
        toast('Copied!','success');
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
