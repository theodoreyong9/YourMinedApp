/* jshint esversion:11, -W033 */
// browser.sphere.js — YourMine Minimal Browser
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;

// ── STATE ────────────────────────────────────────────────────────────────
let _history = [];
let _currentIndex = -1;

// ── NAVIGATION ───────────────────────────────────────────────────────────
function go(url, iframe, input){
  if(!url) return;
  if(!/^https?:\/\//.test(url)){
    url = 'https://' + url;
  }

  iframe.src = url;
  input.value = url;

  // historique
  _history = _history.slice(0, _currentIndex + 1);
  _history.push(url);
  _currentIndex++;
}

function back(iframe, input){
  if(_currentIndex <= 0) return;
  _currentIndex--;
  iframe.src = _history[_currentIndex];
  input.value = _history[_currentIndex];
}

function forward(iframe, input){
  if(_currentIndex >= _history.length - 1) return;
  _currentIndex++;
  iframe.src = _history[_currentIndex];
  input.value = _history[_currentIndex];
}

// ── PANEL ────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%';

  // ── NAVBAR
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--border);background:var(--surface2)';

  const backBtn = document.createElement('button');
  backBtn.textContent = '←';

  const fwdBtn = document.createElement('button');
  fwdBtn.textContent = '→';

  const input = document.createElement('input');
  input.className = 'ym-input';
  input.placeholder = 'https://...';
  input.style.cssText = 'flex:1;font-size:12px';

  const goBtn = document.createElement('button');
  goBtn.textContent = 'Go';

  nav.appendChild(backBtn);
  nav.appendChild(fwdBtn);
  nav.appendChild(input);
  nav.appendChild(goBtn);

  container.appendChild(nav);

  // ── VIEW
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'flex:1;border:none;background:#fff';
  container.appendChild(iframe);

  // ── EVENTS
  goBtn.addEventListener('click', function(){
    go(input.value, iframe, input);
  });

  input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      go(input.value, iframe, input);
    }
  });

  backBtn.addEventListener('click', function(){
    back(iframe, input);
  });

  fwdBtn.addEventListener('click', function(){
    forward(iframe, input);
  });

  // page par défaut
  go('https://example.com', iframe, input);
}

// ── SPHERE ───────────────────────────────────────────────────────────────
window.YM_S['browser.sphere.js'] = {
  name: 'Browser',
  icon: '🌐',
  category: 'Utility',
  description: 'Minimal web browser',
  author: 'yourmine',
  emit: [],
  receive: [],

  activate(ctx){
    _ctx = ctx;
  },

  deactivate(){
    _ctx = null;
    _history = [];
    _currentIndex = -1;
  },

  renderPanel: renderPanel
};

})();
