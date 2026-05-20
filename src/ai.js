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
    body.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative;overflow:hidden;background:transparent';

    // Perlin noise canvas — same as hello theme
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    body.appendChild(cv);

    const ctx = cv.getContext('2d');
    let W, H, OW, OH, offscreen, offCtx, imgData, buf32;
    let timeAcc = 0, lastT = 0, raf;

    const PERM = new Uint8Array(512);
    (function(){
      const p = new Uint8Array(256);
      for(let i=0;i<256;i++) p[i]=i;
      for(let i=255;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=p[i];p[i]=p[j];p[j]=t;}
      for(let i=0;i<512;i++) PERM[i]=p[i&255];
    })();

    function fade(t){return t*t*t*(t*(t*6-15)+10);}
    function lerp(a,b,t){return a+(b-a)*t;}
    function grad2(h,x,y){const hh=h&3;const u=hh<2?x:y;const v=hh<2?y:x;return((hh&1)?-u:u)+((hh&2)?-v:v);}
    function noise2(x,y){
      const xi=Math.floor(x)&255,yi=Math.floor(y)&255;
      const xf=x-Math.floor(x),yf=y-Math.floor(y);
      const u=fade(xf),v=fade(yf);
      const aa=PERM[PERM[xi]+yi],ab=PERM[PERM[xi]+yi+1],ba=PERM[PERM[xi+1]+yi],bb=PERM[PERM[xi+1]+yi+1];
      return lerp(lerp(grad2(aa,xf,yf),grad2(ba,xf-1,yf),u),lerp(grad2(ab,xf,yf-1),grad2(bb,xf-1,yf-1),u),v);
    }
    function fbm(x,y){return noise2(x,y)*0.5+noise2(x*2.1,y*2.1)*0.3+noise2(x*4.3,y*4.3)*0.2;}

    function resize(){
      W=cv.width=body.offsetWidth||300;
      H=cv.height=body.offsetHeight||400;
      OW=Math.ceil(W/3);OH=Math.ceil(H/3);
      offscreen=document.createElement('canvas');
      offscreen.width=OW;offscreen.height=OH;
      offCtx=offscreen.getContext('2d');
      imgData=offCtx.createImageData(OW,OH);
      buf32=new Uint32Array(imgData.data.buffer);
    }

    function draw(ts){
      raf=requestAnimationFrame(draw);
      const dt=Math.min(ts-lastT,50);lastT=ts;timeAcc+=dt;
      const t=timeAcc*0.00018;
      let idx=0;
      for(let py=0;py<OH;py++){
        const fy=py*0.0052+t*0.6;
        for(let px=0;px<OW;px++){
          const fx=px*0.0048+t*0.4;
          const n=fbm(fx,fy),n2=fbm(fx+t*0.3,fy+0.7);
          const v=(n*0.6+n2*0.4)*0.5+0.5;
          const hv=fbm(fx*0.5+1.3,fy*0.5+t*0.2)*0.5+0.5;
          let r,g,b;
          if(hv<0.5){const tt=hv*2;r=(240*(1-tt)+34*tt)|0;g=(168*(1-tt)+211*tt)|0;b=(48*(1-tt)+238*tt)|0;}
          else{const tt=(hv-0.5)*2;r=(34*(1-tt)+167*tt)|0;g=(211*(1-tt)+139*tt)|0;b=(238*(1-tt)+250*tt)|0;}
          const a=Math.min(0.52,v*v*0.52);
          buf32[idx++]=((a*255|0)<<24)|(b<<16)|(g<<8)|r;
        }
      }
      offCtx.putImageData(imgData,0,0);
      ctx.clearRect(0,0,W,H);
      ctx.drawImage(offscreen,0,0,W,H);
    }

    resize();
    raf = requestAnimationFrame(draw);

    // Cleanup when tab switches
    const obs = new MutationObserver(() => {
      if (!document.body.contains(cv)) { cancelAnimationFrame(raf); obs.disconnect(); }
    });
    obs.observe(body, { childList: true });

    // SOON label
    const soon = document.createElement('div');
    soon.style.cssText = 'position:relative;z-index:1;font-family:Syne,var(--font-d,sans-serif);font-size:clamp(48px,12vw,96px);font-weight:800;letter-spacing:.05em;background:linear-gradient(140deg,#f0a830 0%,#fff 45%,#22d3ee 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;user-select:none;pointer-events:none';
    soon.textContent = 'SOON';
    body.appendChild(soon);
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
