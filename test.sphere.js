/* jshint esversion:11, -W033 */
// browser.sphere.js — YourMine Mini Browser
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;
let _currentURL = 'https://example.com';

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // Header avec icône et titre
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px;font-family:var(--font-d);font-size:13px;font-weight:700;color:var(--text3);border-bottom:1px solid var(--border);flex-shrink:0';
  hdr.innerHTML = '🖥️ Mini Browser';
  container.appendChild(hdr);

  // Barre d’adresse
  const addrRow = document.createElement('div');
  addrRow.style.cssText = 'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);flex-shrink:0';
  const addrInput = document.createElement('input');
  addrInput.type = 'text';
  addrInput.value = _currentURL;
  addrInput.placeholder = 'Enter URL…';
  addrInput.style.cssText = 'flex:1;padding:6px 8px;font-size:12px;border-radius:4px;border:1px solid var(--surface3);background:var(--surface2);color:var(--text)';
  const goBtn = document.createElement('button');
  goBtn.textContent = 'Go';
  goBtn.className = 'ym-btn ym-btn-accent';
  goBtn.style.cssText = 'padding:6px 12px;font-size:12px';
  addrRow.appendChild(addrInput);
  addrRow.appendChild(goBtn);
  container.appendChild(addrRow);

  // Iframe pour le contenu web
  const iframe = document.createElement('iframe');
  iframe.src = _currentURL;
  iframe.style.cssText = 'flex:1;border:none;width:100%';
  container.appendChild(iframe);

  // Gestion navigation
  function navigate(url){
    url = url.trim();
    if(!url) return;
    if(!url.match(/^https?:\/\//)) url = 'https://' + url;
    _currentURL = url;
    addrInput.value = url;
    iframe.src = url;
    saveLastURL(url);
  }

  goBtn.addEventListener('click',()=>navigate(addrInput.value));
  addrInput.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();navigate(addrInput.value);}});
}

// ── STORAGE ────────────────────────────────────────────────────────────────
const LAST_URL_KEY = 'ym_browser_last_url';
function saveLastURL(url){try{localStorage.setItem(LAST_URL_KEY,url);}catch(e){}}
function loadLastURL(){try{return localStorage.getItem(LAST_URL_KEY)||'https://example.com';}catch(e){return 'https://example.com';}}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['browser.sphere.js'] = {
  name:'Mini Browser',
  icon:'🖥️',
  category:'Utility',
  description:'A minimal web browser inside YourMine',
  author:'yourmine',
  emit:[],
  receive:[],

  activate(ctx){
    _ctx = ctx;
    _currentURL = loadLastURL();
  },

  deactivate(){
    _ctx = null;
  },

  renderPanel: renderPanel,

  profileSection(container){
    container.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text3)">No settings available for Mini Browser.</div>';
  }
};

})();
