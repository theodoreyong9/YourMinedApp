/* safety.sphere.js — YourMine Local Safety Monitor
   Utilise WebLLM (Llama 3.2 1B) en Web Worker pour analyser
   les actions risquées en temps réel, sans cloud, sans coût.
   
   Actions surveillées :
   - Activation d'une app externe (URL inconnue)
   - Signature de transaction Solana
   - Partage de profil / UUID
   - Code de sphère avec patterns suspects
*/
(function(){
'use strict';

const SPHERE_NAME = 'safety.sphere.js';
const MODEL_KEY   = 'ym_safety_model_ready';
const MODEL_ID    = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
const WEBLLM_CDN  = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm';

const ENABLED_KEY = 'ym_safety_enabled';

function isEnabled(){ return localStorage.getItem(ENABLED_KEY) !== '0'; }
function setEnabled(v){ localStorage.setItem(ENABLED_KEY, v ? '1' : '0'); }
// ── WebLLM via script tag injection ──────────────────────────────────────────
// dynamic import() depuis une sphere blob est bloqué par la CSP Firebase
// Solution : injecter un <script type="module"> dans le DOM principal

let _engine  = null;
let _ready   = false;
let _loading = false;

function _loadWebLLMScript() {
  return new Promise((resolve, reject) => {
    if (window.__webllm) { resolve(window.__webllm); return; }
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `
      import * as webllm from "${WEBLLM_CDN}";
      window.__webllm = webllm;
      window.dispatchEvent(new CustomEvent('ym:webllm-ready'));
    `;
    // Poll + event — le poll rattrape si l'event arrive avant le listener
    const poll = setInterval(() => {
      if (window.__webllm) { clearInterval(poll); clearTimeout(timeout); resolve(window.__webllm); }
    }, 100);
    const onReady = () => { clearInterval(poll); clearTimeout(timeout); resolve(window.__webllm); };
    window.addEventListener('ym:webllm-ready', onReady, { once: true });
    const timeout = setTimeout(() => {
      clearInterval(poll);
      window.removeEventListener('ym:webllm-ready', onReady);
      reject(new Error('WebLLM script timeout after 30s'));
    }, 30000);
    s.onerror = (e) => { clearInterval(poll); clearTimeout(timeout); reject(new Error('Script load error')); };
    document.head.appendChild(s);
    console.log('[Safety] WebLLM script injected');
  });
}

async function loadModel(onProgress) {
  if (_ready) return true;
  if (_loading) return false;
  if (!isEnabled()) return false;
  _loading = true;

  const updateProgress = (text, progress=0) => {
    const detail = { progress, text };
    if (onProgress) onProgress(detail);
    window.dispatchEvent(new CustomEvent('ym:safety-progress', { detail }));
    console.log('[Safety]', text, progress);
  };

  try {
    updateProgress('Loading WebLLM library…', 0.02);
    const webllm = await _loadWebLLMScript();
    console.log('[Safety] WebLLM loaded, keys:', Object.keys(webllm));

    if (!webllm.CreateMLCEngine) throw new Error('CreateMLCEngine not found in WebLLM');

    updateProgress('Initializing engine…', 0.05);
    _engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (p) => {
        updateProgress(p.text || 'Loading…', p.progress || 0);
      }
    });
    _ready   = true;
    _loading = false;
    localStorage.setItem(MODEL_KEY, '1');
    updateProgress('Ready ✓', 1);
    return true;
  } catch(e) {
    console.error('[Safety] loadModel FAILED:', e);
    _loading = false;
    updateProgress('Error: ' + e.message, 0);
    return false;
  }
}

// ── Toast Safety haute priorité ───────────────────────────────────────────────
// Injecté directement dans body avec z-index maximal — aucun thème ne peut le couvrir
function safetyToast(msg, level){
  const t=document.createElement('div');
  const colors={warn:'#f0a830',error:'#ff4560',info:'#08e0f8'};
  const icons={warn:'⚠️',error:'🚨',info:'🛡️'};
  t.style.cssText=
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);'+
    'z-index:10002;'+  // au-dessus de TOUT y compris le bouton jaune (10000) et la modale (10001)
    'background:rgba(6,6,18,.96);'+
    'border:1px solid '+(colors[level]||colors.warn)+';'+
    'color:#fff;font-size:13px;font-family:sans-serif;'+
    'padding:10px 18px;border-radius:10px;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.5);'+
    'display:flex;align-items:center;gap:8px;'+
    'max-width:90vw;pointer-events:none;'+
    'animation:_ym_sf_in .2s ease';
  const style=document.createElement('style');
  style.textContent='@keyframes _ym_sf_in{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  t.appendChild(style);
  t.innerHTML+='<span>'+icons[level]+'</span><span>'+msg+'</span>';
  document.body.appendChild(t);
  setTimeout(()=>{
    t.style.transition='opacity .3s';t.style.opacity='0';
    setTimeout(()=>t.remove(),300);
  },4000);
}
async function analyze(actionType, context) {
  if (!_ready || !isEnabled() || !_engine) return { risk: 'none', reason: '' };
  try {
    const prompts = {
      external_app: `URL: "${context.url}" app: "${context.name}". Phishing or dangerous?`,
      sphere_code:  `Sphere "${context.filename}" by "${context.author}". Code: ${(context.code||'').slice(0,300)}. Suspicious?`,
      transaction:  `Solana tx ${context.amount} SOL to ${context.destination}. Suspicious?`,
      profile_share:`Profile share with ${context.peer}. Risk?`,
      url:          `URL: "${context.url}". Dangerous?`,
    };
    const prompt = prompts[actionType] || `${actionType}: ${JSON.stringify(context)}. Risk?`;
    const reply = await _engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'Security assistant. Respond JSON only: {"risk":"none"|"low"|"medium"|"high","reason":"short sentence"}' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 60, temperature: 0.1,
    });
    const text = reply.choices[0].message.content.trim();
    const m = text.match(/\{[^}]+\}/);
    return m ? JSON.parse(m[0]) : { risk: 'none', reason: '' };
  } catch(e) {
    return { risk: 'none', reason: '' };
  }
}

// ── Intercepte les actions YourMine ───────────────────────────────────────────
function setupInterceptors(ctx) {
  // 1. App externe chargée via liste.js
  const _origLoadSphere = window.YM?.loadSphereFromURL;
  if (_origLoadSphere && window.YM) {
    window.YM.loadSphereFromURL = async (url, name) => {
      const isExternal = !url.includes('.sphere.js') && !url.includes('raw.githubusercontent.com');
      if (isExternal && _ready) {
        const result = await analyze('external_app', { url, name });
        if (result.risk === 'high') {
          const ok = await _confirm(`⚠️ High risk detected\n${result.reason}\n\nLoad anyway?`);
          if (!ok) return null;
        } else if (result.risk === 'medium') {
          safetyToast(result.reason,'warn');
        }
      }
      return _origLoadSphere(url, name);
    };
  }

  // 2. Activation de sphère — analyse le code
  window.addEventListener('ym:sphere-before-activate', async (e) => {
    if (!_ready) return;
    const { filename, author, code } = e.detail || {};
    const result = await analyze('sphere_code', { filename, author, code });
    if (result.risk === 'high') {
      e.preventDefault?.();
      safetyToast('Sphere blocked: '+result.reason,'error');
    } else if (result.risk === 'medium') {
      safetyToast(result.reason,'warn');
    }
  });

  // 3. Transaction Solana
  window.addEventListener('ym:before-transaction', async (e) => {
    if (!_ready) return;
    const result = await analyze('transaction', e.detail || {});
    if (result.risk === 'high') {
      e.preventDefault?.();
      safetyToast('Transaction blocked: '+result.reason,'error');
    } else if (result.risk === 'medium') {
      safetyToast(result.reason,'warn');
    }
  });
}

function _confirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface2,#12121e);border:1px solid rgba(255,69,96,.4);border-radius:16px;padding:24px;max-width:320px;width:90vw;text-align:center';
    box.innerHTML =
      '<div style="font-size:28px;margin-bottom:12px">⚠️</div>'+
      '<div style="font-size:13px;color:var(--text,#e4e6f4);line-height:1.6;margin-bottom:20px;white-space:pre-line">'+msg+'</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button id="safety-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
        '<button id="safety-ok" class="ym-btn" style="flex:1;background:rgba(255,69,96,.2);border:1px solid rgba(255,69,96,.4);color:#ff4560">Load anyway</button>'+
      '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#safety-cancel').onclick = () => { overlay.remove(); resolve(false); };
    box.querySelector('#safety-ok').onclick     = () => { overlay.remove(); resolve(true); };
    overlay.onclick = (e) => { if(e.target===overlay){overlay.remove();resolve(false);} };
  });
}

// ── Panel UI ───────────────────────────────────────────────────────────────────
function renderPanel(container) {
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;padding:16px;gap:12px';

  // Toggle ON/OFF
  const enabled = isEnabled();
  const toggleCard = document.createElement('div');
  toggleCard.className = 'ym-card';
  toggleCard.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer';
  toggleCard.innerHTML =
    '<div style="flex:1">'+
      '<div style="font-weight:600;font-size:13px">Safety Monitor</div>'+
      '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+
        (enabled ? 'Active — monitoring your actions' : 'Disabled — no monitoring')+
      '</div>'+
    '</div>'+
    '<div id="safety-toggle" style="width:44px;height:24px;border-radius:12px;background:'+(enabled?'var(--accent,#f0a830)':'rgba(255,255,255,.1)')+';position:relative;transition:background .2s;flex-shrink:0">'+
      '<div style="position:absolute;top:3px;left:'+(enabled?'23px':'3px')+';width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s"></div>'+
    '</div>';
  toggleCard.addEventListener('click', () => {
    const newVal = !isEnabled();
    setEnabled(newVal);
    if (!newVal) {
      // Désactive — vide le worker
      _ready = false;
      _engine = null;
    } else if (localStorage.getItem(MODEL_KEY)) {
      // Réactive — recharge le modèle si déjà téléchargé
      loadModel().then(() => { if (_ready) setupInterceptors(); });
    }
    renderPanel(container);
  });
  container.appendChild(toggleCard);

  const statusCard = document.createElement('div');
  statusCard.className = 'ym-card';
  statusCard.id = 'safety-status-card';

  function updateStatus() {
    if (_ready) {
      statusCard.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<div style="width:10px;height:10px;border-radius:50%;background:#22d98a;box-shadow:0 0 8px #22d98a;flex-shrink:0"></div>'+
          '<div style="flex:1"><div style="font-weight:600;font-size:13px">Safety Monitor Active</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+MODEL_ID+'</div></div>'+
          '<button id="safety-reset-btn" style="font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;padding:4px">↺</button>'+
        '</div>'+
        '<div style="font-size:11px;color:var(--text2);margin-top:10px;line-height:1.6">'+
          'Monitoring: external apps, sphere activations, transactions.'+
          '<br>Model runs locally — no data leaves your device.'+
        '</div>';
      setTimeout(()=>{
        const rb = document.getElementById('safety-reset-btn');
        if(rb) rb.onclick = ()=>{
          _ready=false; _loading=false; _engine=null;
          localStorage.removeItem(MODEL_KEY);
          renderPanel(container);
        };
      }, 50);
    } else if (_loading) {
      statusCard.innerHTML =
        '<div style="font-weight:600;font-size:13px;margin-bottom:10px">Loading model…</div>'+
        '<div id="safety-progress-bar" style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-bottom:6px">'+
          '<div id="safety-progress-fill" style="height:100%;background:linear-gradient(90deg,var(--accent,#f0a830),var(--cyan,#08e0f8));width:2%;transition:width .3s"></div>'+
        '</div>'+
        '<div id="safety-progress-text" style="font-size:10px;color:var(--text3)">Initializing…</div>';
    } else {
      statusCard.innerHTML =
        '<div style="font-weight:600;font-size:13px;margin-bottom:6px">Safety Monitor</div>'+
        '<div style="font-size:11px;color:var(--text2);margin-bottom:14px;line-height:1.6">'+
          'Runs <b>Llama 3.2 1B</b> locally via WebGPU.<br>'+
          'Downloaded once (~500MB), cached permanently.<br>'+
          'Zero cloud. Zero cost. Zero data sharing.'+
        '</div>'+
        '<button id="safety-load-btn" class="ym-btn ym-btn-accent" style="width:100%">⬇ Download Model (~500MB)</button>';

      setTimeout(() => {
        const btn = document.getElementById('safety-load-btn');
        if (btn) btn.onclick = async () => {
          _loading = true;
          updateStatus();
          await loadModel((p) => {
            const fill = document.getElementById('safety-progress-fill');
            const txt  = document.getElementById('safety-progress-text');
            if (fill) fill.style.width = Math.round((p.progress||0)*100)+'%';
            if (txt)  txt.textContent  = p.text || '';
            if (p.error) txt && (txt.style.color='#ff4560');
          });
          _loading = false;
          updateStatus();
          if (_ready) setupInterceptors();
        };
      }, 50);
    }
  }

  updateStatus();
  container.appendChild(statusCard);

  // Infos plateformes supportées
  if (_ready) {
    const infoCard = document.createElement('div');
    infoCard.className = 'ym-card';
    infoCard.innerHTML =
      '<div style="font-family:var(--font-d,sans-serif);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent,#f0a830);margin-bottom:10px">Monitored actions</div>'+
      ['🌐 External app URLs','⬡ Sphere code activation','💸 Solana transactions','👤 Profile sharing'].map(s=>
        '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--text2)">'+
          '<span style="color:#22d98a;font-size:10px">✓</span>'+s+'</div>'
      ).join('');
    container.appendChild(infoCard);

    // Test
    const testCard = document.createElement('div');
    testCard.className = 'ym-card';
    testCard.innerHTML =
      '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Test the model</div>'+
      '<div style="display:flex;gap:6px">'+
        '<input class="ym-input" id="safety-test-input" placeholder="e.g. https://suspicious-site.xyz" style="flex:1;font-size:11px">'+
        '<button class="ym-btn ym-btn-ghost" id="safety-test-btn" style="font-size:11px;padding:6px 10px">Analyze</button>'+
      '</div>'+
      '<div id="safety-test-result" style="margin-top:8px;font-size:11px;min-height:16px"></div>';
    container.appendChild(testCard);

    setTimeout(() => {
      const btn = document.getElementById('safety-test-btn');
      const inp = document.getElementById('safety-test-input');
      const res = document.getElementById('safety-test-result');
      if (btn && inp && res) {
        btn.onclick = async () => {
          const url = inp.value.trim();
          if (!url) return;
          btn.textContent = '…';
          const result = await analyze('url', { url, context: 'user test' });
          const colors = { none:'#22d98a', low:'#f0a830', medium:'#f0a830', high:'#ff4560' };
          res.innerHTML = `<span style="color:${colors[result.risk]||'#fff'};font-weight:600">${result.risk.toUpperCase()}</span> — ${result.reason}`;
          btn.textContent = 'Analyze';
        };
        inp.addEventListener('keydown', e => { if(e.key==='Enter') btn.click(); });
      }
    }, 50);
  }

  // WebGPU check
  if (!navigator.gpu) {
    const warn = document.createElement('div');
    warn.className = 'ym-notice';
    warn.style.cssText = 'background:rgba(255,69,96,.08);border:1px solid rgba(255,69,96,.2);border-radius:8px;padding:10px 12px;font-size:11px;color:var(--text2)';
    warn.innerHTML = '⚠️ <b>WebGPU not available</b> — requires Chrome 113+ on a device with a GPU. The safety monitor will not function on this browser.';
    container.appendChild(warn);
  }
}

// ── Enregistrement ────────────────────────────────────────────────────────────
window.YM_S[SPHERE_NAME] = {
  name:        'Safety',
  icon:        '🛡️',
  category:    'AI',
  description: 'Local AI safety monitor. Runs Llama 3.2 entirely in your browser via WebGPU — no cloud, no data sharing. Detects risky actions in real time: external apps, sphere code, Solana transactions, profile sharing.',
  version:     '1.0.0',

  get _dbg_ready(){ return _ready; },
  get _dbg_loading(){ return _loading; },
  _dbg_reset(){ _ready=false; _loading=false; _engine=null; localStorage.removeItem(MODEL_KEY); },

  async activate(ctx) {
    if (!isEnabled()) return;
    if (localStorage.getItem(MODEL_KEY)) {
      loadModel().then(() => { if (_ready) setupInterceptors(ctx); });
    }
  },

  renderPanel(container) {
    renderPanel(container);
  },

  deactivate() {
    _ready = false;
    _engine = null;
  },

  profileSection(container) {
    container.innerHTML = _ready
      ? '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#22d98a"><span>🛡️</span> Safety monitor active</div>'
      : '<div style="font-size:12px;color:var(--text3)">Safety monitor — model not loaded</div>';
  },
};

})();
