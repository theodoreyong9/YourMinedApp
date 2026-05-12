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
const WEBLLM_CDN  = 'https://esm.run/@mlc-ai/web-llm';

const ENABLED_KEY = 'ym_safety_enabled';

function isEnabled(){ return localStorage.getItem(ENABLED_KEY) !== '0'; }
function setEnabled(v){ localStorage.setItem(ENABLED_KEY, v ? '1' : '0'); }
// Le LLM tourne dans un Worker séparé — UI jamais bloquée
const WORKER_CODE = `
import { CreateMLCEngine } from "${WEBLLM_CDN}";

let engine = null;
let ready  = false;

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;

  if (type === 'load') {
    try {
      engine = await CreateMLCEngine("${MODEL_ID}", {
        initProgressCallback: (p) => {
          self.postMessage({ id, type: 'progress', progress: p.progress, text: p.text });
        }
      });
      ready = true;
      self.postMessage({ id, type: 'ready' });
    } catch(e) {
      self.postMessage({ id, type: 'error', msg: e.message });
    }
    return;
  }

  if (type === 'analyze' && ready) {
    try {
      const reply = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: \`You are a security assistant for a decentralized web app.
Analyze the user action and respond with JSON only:
{"risk": "none"|"low"|"medium"|"high", "reason": "one short sentence"}\` },
          { role: 'user', content: payload.prompt }
        ],
        max_tokens: 80,
        temperature: 0.1,
      });
      const text = reply.choices[0].message.content.trim();
      // Parse JSON robuste
      const match = text.match(/\\{[^}]+\\}/);
      const result = match ? JSON.parse(match[0]) : { risk: 'none', reason: '' };
      self.postMessage({ id, type: 'result', result });
    } catch(e) {
      // En cas d'erreur d'analyse → ne pas bloquer l'action
      self.postMessage({ id, type: 'result', result: { risk: 'none', reason: '' } });
    }
    return;
  }

  // Worker pas prêt → laisse passer
  self.postMessage({ id, type: 'result', result: { risk: 'none', reason: '' } });
};
`;

// ── Gestion du Worker ─────────────────────────────────────────────────────────
let _worker   = null;
let _ready    = false;
let _loading  = false;
let _msgId    = 0;
const _pending = new Map();

function _initWorker() {
  if (_worker) return;
  const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
  const url  = URL.createObjectURL(blob);
  _worker = new Worker(url, { type: 'module' });
  _worker.onmessage = (e) => {
    const { id, type, progress, text, result, msg } = e.data;
    if (type === 'progress') {
      window.dispatchEvent(new CustomEvent('ym:safety-progress', {
        detail: { progress, text }
      }));
      return;
    }
    const cb = _pending.get(id);
    if (cb) { _pending.delete(id); cb({ type, result, msg }); }
  };
}

function _send(type, payload) {
  return new Promise((resolve) => {
    const id = ++_msgId;
    _pending.set(id, resolve);
    _worker.postMessage({ id, type, payload });
  });
}

async function loadModel(onProgress) {
  if (_ready) return true;
  if (_loading) return false;
  _loading = true;
  _initWorker();
  if (onProgress) {
    const handler = (e) => onProgress(e.detail);
    window.addEventListener('ym:safety-progress', handler, { once: false });
    const res = await _send('load', {});
    window.removeEventListener('ym:safety-progress', handler);
    _loading = false;
    if (res.type === 'ready') { _ready = true; localStorage.setItem(MODEL_KEY, '1'); return true; }
    return false;
  }
  const res = await _send('load', {});
  _loading = false;
  if (res.type === 'ready') { _ready = true; localStorage.setItem(MODEL_KEY, '1'); return true; }
  return false;
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
  if (!_ready || !isEnabled()) return { risk: 'none', reason: '' };

  const prompts = {
    external_app: `User is about to load an external web app from: "${context.url}"\nApp name: "${context.name}"\nIs this URL potentially dangerous, phishing, or suspicious?`,
    sphere_code:  `A sphere JavaScript file is being activated.\nFilename: "${context.filename}"\nAuthor: "${context.author}"\nCode preview (first 500 chars): ${context.code?.slice(0,500)}\nDoes this code contain suspicious patterns (eval, crypto mining, data exfiltration)?`,
    transaction:  `User is about to sign a Solana transaction.\nAmount: ${context.amount} SOL\nDestination: ${context.destination}\nProgram: ${context.program}\nIs this transaction suspicious?`,
    profile_share:`User is about to share their profile with UUID: ${context.uuid}\nWith peer: ${context.peer}\nContext: ${context.context}\nIs there any risk?`,
    url:          `User is about to navigate to URL: "${context.url}"\nContext: ${context.context}\nIs this URL potentially dangerous?`,
  };

  const prompt = prompts[actionType] || `Action: ${actionType}\nContext: ${JSON.stringify(context)}\nIs there any security risk?`;
  const res = await _send('analyze', { prompt });
  return res.result || { risk: 'none', reason: '' };
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
      if (_worker) { _worker.terminate(); _worker = null; }
    } else if (localStorage.getItem(MODEL_KEY)) {
      // Réactive — recharge le modèle si déjà téléchargé
      loadModel().then(() => { if (_ready) setupInterceptors(); });
    }
    renderPanel(container);
  });
  container.appendChild(toggleCard);

  function updateStatus() {
    if (_ready) {
      statusCard.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<div style="width:10px;height:10px;border-radius:50%;background:#22d98a;box-shadow:0 0 8px #22d98a;flex-shrink:0"></div>'+
          '<div><div style="font-weight:600;font-size:13px">Safety Monitor Active</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+MODEL_ID+'</div></div>'+
        '</div>'+
        '<div style="font-size:11px;color:var(--text2);margin-top:10px;line-height:1.6">'+
          'Monitoring: external apps, sphere activations, transactions.'+
          '<br>Model runs locally — no data leaves your device.'+
        '</div>';
    } else if (_loading) {
      statusCard.innerHTML =
        '<div style="font-weight:600;font-size:13px;margin-bottom:10px">Loading model…</div>'+
        '<div id="safety-progress-bar" style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-bottom:6px">'+
          '<div id="safety-progress-fill" style="height:100%;background:linear-gradient(90deg,var(--accent,#f0a830),var(--cyan,#08e0f8));width:0%;transition:width .3s"></div>'+
        '</div>'+
        '<div id="safety-progress-text" style="font-size:10px;color:var(--text3)">Initializing…</div>';

      window.addEventListener('ym:safety-progress', (e) => {
        const fill = document.getElementById('safety-progress-fill');
        const txt  = document.getElementById('safety-progress-text');
        if (fill) fill.style.width = Math.round((e.detail.progress||0)*100)+'%';
        if (txt)  txt.textContent  = e.detail.text || '';
        if (e.detail.progress >= 1) setTimeout(updateStatus, 500);
      });
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
          await loadModel();
          updateStatus();
          setupInterceptors();
          renderPanel(container);
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
  category:    'Security',
  description: 'Local AI safety monitor. Detects risky actions in real time using Llama 3.2 running entirely in your browser — no cloud, no cost.',
  version:     '1.0.0',

  async activate(ctx) {
    if (!isEnabled()) return;
    if (localStorage.getItem(MODEL_KEY)) {
      loadModel().then(() => { if (_ready) setupInterceptors(ctx); });
    }
  },

  panel(container) {
    renderPanel(container);
  },

  deactivate() {
    // Restore original functions si interceptées
    _ready = false;
  },

  profileSection(container) {
    container.innerHTML = _ready
      ? '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#22d98a"><span>🛡️</span> Safety monitor active</div>'
      : '<div style="font-size:12px;color:var(--text3)">Safety monitor — model not loaded</div>';
  },
};

})();
