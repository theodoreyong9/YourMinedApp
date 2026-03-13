// ════════════════════════════════════════════════════════
//  builder.sphere.js — YourMine Builder IA
//  @icon 🔨
//  @desc Builder IA — Créez Spheres, Thèmes et Apps
//  @author YourMine
//  @cat core
//  @score 100
// ════════════════════════════════════════════════════════

function init(container) {

const YM       = window.YM || window._YM || {};
const REPO_RAW = window.REPO_RAW || window._REPO_RAW || 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/';
const REPO_API = window.REPO_API || window._REPO_API || 'https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/';
const ft       = window.fetchText || window._fetchText || (url => fetch(url).then(r=>r.text()));
const fj       = window.fetchJSON || window._fetchJSON || (url => fetch(url).then(r=>r.json()));

let mode       = 'sphere'; // 'sphere' | 'theme' | 'app'
let subMode    = 'code';   // 'code' | 'ai' | 'doc'
let aiProvider = 'anthropic';
let aiHistory  = []; // [{role, content}] — conversation itérable
let ctxDocs    = []; // [{label, content}] — chips supprimables

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── RENDER ────────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <div class="ym-tabs">
        <button class="ym-tab${mode==='sphere'?' active':''}" data-mode="sphere">◎ Sphere</button>
        <button class="ym-tab${mode==='theme' ?' active':''}" data-mode="theme">🎨 Thème</button>
        <button class="ym-tab${mode==='app'   ?' active':''}" data-mode="app">⬡ App</button>
      </div>
      <div class="ym-tabs" style="margin-left:auto">
        <button class="ym-tab${subMode==='code'?' active':''}" data-sub="code">Code</button>
        <button class="ym-tab${subMode==='ai'  ?' active':''}" data-sub="ai">✦ IA</button>
        <button class="ym-tab${subMode==='doc' ?' active':''}" data-sub="doc">📖 Doc</button>
      </div>
    </div>
    ${subMode==='doc' ? renderDocPanel() : subMode==='ai' ? renderAIPanel() : renderCodePanel()}
  </div>`;
  wireEvents();
}

// ── DOC API INDEX.HTML ────────────────────────────────────
function renderDocPanel() {
  return `<div class="ym-panel" style="padding:16px">
    <div class="ym-panel-title">Documentation API — ce qui est accessible depuis un fichier app/sphere/theme</div>
    <div style="font-size:11px;color:var(--text2);line-height:1.9">${getIndexDoc()}</div>
  </div>`;
}

function getIndexDoc() {
  return `<strong style="color:var(--accent)">État global window.YM</strong><br/>
<code>YM.profile</code> — <code>{uuid, name, bio, photo, socialNet, socialHandle, website, gistId}</code><br/>
<code>YM.contacts</code> — <code>[{uuid, name}]</code><br/>
<code>YM.apps</code> — <code>[{name, url, info, _mountAs}]</code><br/>
<code>YM.themes</code>, <code>YM.spheres</code> — idem<br/>
<code>YM.openApps</code>, <code>YM.activeApp</code>, <code>YM.theme</code><br/>
<code>YM.sphereTabs</code> — <code>[{name, url}]</code> — <code>YM.activeSphere</code><br/>
<code>YM.balance</code> — solde claimable YRM<br/>
<code>YM.geo</code> — <code>{lat, lng}</code> ou null<br/>
<code>YM.peerCount</code>, <code>YM.p2p</code> — <code>{sendProfile(data)}</code><br/>
<code>YM.room</code> — room Trystero (<code>makeAction</code>, <code>onPeerJoin</code>, <code>onPeerLeave</code>)<br/><br/>

<strong style="color:var(--accent2)">Fonctions utilitaires</strong><br/>
<code>window.fetchText(url)</code> → Promise&lt;string&gt;<br/>
<code>window.fetchJSON(url)</code> → Promise&lt;any&gt;<br/>
<code>window.el(tag, cls?, html?)</code> → HTMLElement<br/>
<code>window.REPO_RAW</code>, <code>window.REPO_API</code><br/><br/>

<strong style="color:var(--accent2)">Fonctions UI</strong><br/>
<code>window.YM_addSphereTab(name, url, autoActivate?)</code><br/>
<code>window.YM_removeSphereTab(name)</code><br/>
<code>window.YM_updateBalance(val)</code> — met à jour ⚡ header<br/>
<code>window.YM_setDisconnected()</code><br/>
<code>window.YM_updateProfileIcon()</code><br/><br/>

<strong style="color:var(--accent2)">Signature app (IIFE)</strong><br/>
<code>(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) { … })</code><br/>
<code>$('ym-app-body')</code> = container de l'app<br/>
<code>return { mountAs: 'pill'|'profile-icon'|'balance', cleanup: ()=>{} }</code><br/>
mountAs: <b>pill</b> = pill visible barre, <b>profile-icon</b> = pill invisible raccourci 👤, <b>balance</b> = pill invisible raccourci ⚡<br/><br/>

<strong style="color:var(--accent2)">Signature sphere</strong><br/>
<code>function init(container) { … }</code><br/><br/>

<strong style="color:var(--accent2)">Gist — brancher sur la sauvegarde profil</strong><br/>
<code>window.YM_GIST_CONTRIBUTORS = window.YM_GIST_CONTRIBUTORS || {};</code><br/>
<code>window.YM_GIST_CONTRIBUTORS['ma_cle'] = () =&gt; monData;</code><br/>
<code>window.YM_GIST_RESTORE = window.YM_GIST_RESTORE || {};</code><br/>
<code>window.YM_GIST_RESTORE['ma_cle'] = (data) =&gt; restaurer(data);</code><br/><br/>

<strong style="color:var(--accent2)">sessionStorage P2P</strong><br/>
<code>sessionStorage.getItem('ym_near_cache')</code> — JSON des profils peers proches<br/><br/>

<strong style="color:var(--danger)">IDs protégés — NE JAMAIS TOUCHER</strong><br/>
<code>ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main</code><br/>
<code>ym-app-frames, ym-bottombar, ym-tabs-zone, ym-btn-x, ym-btn-o</code><br/>
<code>ym-x-menu, ym-o-menu, ym-x-backdrop, ym-o-backdrop, ym-app-filters</code><br/>
<code>ym-theme-confirm, ym-theme-root, ym-boot, ym-boot-logo, ym-boot-bar, ym-boot-progress</code><br/>
<code>ym-profile-icon</code>`;
}

// ── PANNEAU IA ────────────────────────────────────────────
function renderAIPanel() {
  const histHTML = aiHistory.map(m => `
    <div style="margin-bottom:10px">
      <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${m.role==='user'?'var(--accent2)':'var(--accent)'};margin-bottom:4px">
        ${m.role==='user' ? 'Vous' : '✦ IA'}
      </div>
      <div style="font-size:11px;color:var(--text2);white-space:pre-wrap;line-height:1.6;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:10px;max-height:200px;overflow-y:auto">${escHtml(m.content.slice(0,1000))}${m.content.length>1000?'…':''}</div>
    </div>`).join('');

  const chips = ctxDocs.map((d,i) =>
    `<span class="ym-chip accent" style="cursor:pointer" data-rmctx="${i}">✕ ${escHtml(d.label)}</span>`
  ).join('');

  return `
  <div class="ym-panel" style="padding:14px">
    <div class="ym-panel-title">Config IA</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select class="ym-input" id="builder-ai-provider" style="width:auto">
        <option value="anthropic" ${aiProvider==='anthropic'?'selected':''}>Anthropic (Claude)</option>
        <option value="openai"    ${aiProvider==='openai'   ?'selected':''}>OpenAI (GPT-4o)</option>
      </select>
      <input class="ym-input" id="builder-ai-key" type="password" placeholder="Clé API…" value="${localStorage.getItem('ym_builder_key')||''}" style="flex:1;min-width:160px"/>
    </div>
    ${renderAIFields()}
  </div>

  ${aiHistory.length ? `<div class="ym-panel" style="padding:14px;max-height:320px;overflow-y:auto">${histHTML}</div>` : ''}

  ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 2px"><span style="font-size:10px;color:var(--text3);align-self:center">Contexte :</span>${chips}</div>` : ''}

  <div class="ym-panel" style="padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
      <div class="ym-panel-title" style="margin:0">${aiHistory.length ? 'Continuer la conversation' : 'Prompt'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="ym-btn ym-btn-ghost" id="builder-add-ctx-btn" style="font-size:10px">+ Fichier contexte</button>
        ${aiHistory.length ? `<button class="ym-btn ym-btn-ghost" id="builder-clear-history" style="font-size:10px;color:var(--danger)">Effacer conv.</button>` : ''}
      </div>
    </div>
    <textarea class="ym-editor" id="builder-prompt" rows="4" placeholder="${getPromptPlaceholder()}"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="ym-btn ym-btn-accent" id="builder-gen-btn" style="flex:1">✦ ${aiHistory.length ? 'Continuer' : 'Générer'}</button>
      ${aiHistory.length ? `<button class="ym-btn" id="builder-use-last" style="flex:1">← Injecter code</button>` : ''}
    </div>
    <div id="builder-ai-status" style="margin-top:6px"></div>
  </div>`;
}

function renderAIFields() {
  if (mode==='sphere') return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <input class="ym-input" id="ai-icon"   placeholder="@icon (ex: 🚀)"/>
    <input class="ym-input" id="ai-cat"    placeholder="@cat (ex: social)"/>
    <input class="ym-input" id="ai-author" placeholder="@author"/>
    <input class="ym-input" id="ai-desc"   placeholder="@desc courte"/>
  </div>`;
  if (mode==='app') return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <input class="ym-input" id="ai-icon"   placeholder="@icon (ex: ⬡)"/>
    <select class="ym-input" id="ai-mount">
      <option value="pill">mountAs: pill</option>
      <option value="balance">mountAs: balance</option>
      <option value="profile-icon">mountAs: profile-icon</option>
    </select>
    <input class="ym-input" id="ai-author" placeholder="@author"/>
    <input class="ym-input" id="ai-desc"   placeholder="@desc"/>
  </div>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <input class="ym-input" id="ai-title"       placeholder="@title"/>
    <input class="ym-input" id="ai-themeColor"  placeholder="@themeColor (#c8f0a0)"/>
    <input class="ym-input" id="ai-bootLogo"    placeholder="@bootLogo"/>
    <input class="ym-input" id="ai-author"      placeholder="@author"/>
  </div>`;
}

function getPromptPlaceholder() {
  if (mode==='sphere') return 'Décrivez la sphere : comportement, interface, données…';
  if (mode==='app')    return "Décrivez l'app : ce qu'elle fait, son mountAs, son interface…";
  return 'Décrivez le thème : couleurs, typographie, ambiance…';
}

// ── PANNEAU CODE ──────────────────────────────────────────
function renderCodePanel() {
  const chips = ctxDocs.map((d,i) =>
    `<span class="ym-chip accent" style="cursor:pointer" data-rmctx="${i}">✕ ${escHtml(d.label)}</span>`
  ).join('');

  return `
  <div class="ym-panel" style="padding:14px">
    <div class="ym-panel-title">Fichier existant → sa doc intégrée</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select class="ym-input" id="builder-file-picker" style="flex:1">
        <option value="">Choisir un fichier…</option>
        <option value="__index__">index.html (doc API)</option>
        ${buildFilePicker()}
      </select>
      <button class="ym-btn" id="builder-load-doc-btn">Voir doc</button>
      <button class="ym-btn ym-btn-ghost" id="builder-add-ctx-code" style="font-size:10px">+ Prompt contexte</button>
    </div>
    <div id="builder-file-doc" style="display:none;margin-top:10px;font-size:11px;color:var(--text2);line-height:1.8;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;max-height:260px;overflow-y:auto"></div>
  </div>

  ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 2px"><span style="font-size:10px;color:var(--text3);align-self:center">Contexte prompt :</span>${chips}</div>` : ''}

  <div class="ym-panel" style="padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <div class="ym-panel-title" style="margin:0">Éditeur</div>
      <button class="ym-btn ym-btn-ghost" id="builder-clear-btn" style="font-size:10px;color:var(--danger)">Effacer</button>
    </div>
    <textarea class="ym-editor" id="builder-code" rows="16" placeholder="${escHtml(getPlaceholder())}"></textarea>
  </div>

  <div class="ym-panel" style="padding:14px">
    ${mode==='sphere' ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="ym-input" id="builder-name" placeholder="Nom de la sphere" style="flex:2;min-width:140px"/>
        <input class="ym-input" id="builder-cat"  placeholder="Catégorie (ex: social)" style="flex:1;min-width:100px"/>
      </div>` : mode==='app' ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="ym-input" id="builder-name"  placeholder="Nom de l'app" style="flex:2;min-width:140px"/>
        <select class="ym-input" id="builder-mount" style="flex:1;min-width:140px">
          <option value="pill">pill — barre</option>
          <option value="balance">balance — ⚡</option>
          <option value="profile-icon">profile — 👤</option>
        </select>
      </div>` : `
      <input class="ym-input" id="builder-name" placeholder="Nom du thème"/>`}
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="ym-btn ym-btn-accent" id="builder-test-btn"       style="flex:1">▶ Tester</button>
    <button class="ym-btn"               id="builder-save-local-btn" style="flex:1">⊕ Local</button>
    <button class="ym-btn"               id="builder-publish-btn"    style="flex:1">↑ Publier</button>
  </div>
  <div id="builder-status"></div>
  <div id="builder-preview" style="display:none" class="ym-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="ym-panel-title" style="margin:0">Aperçu</div>
      <button class="ym-btn ym-btn-ghost" id="builder-close-preview" style="font-size:10px">Fermer</button>
    </div>
    <div id="builder-preview-sandbox" style="min-height:80px"></div>
  </div>`;
}

function buildFilePicker() {
  const all = [
    ...(YM.apps    || []).map(a => ({label: a.name+'.app.js',    url: a.url})),
    ...(YM.spheres || []).map(s => ({label: s.name+'.sphere.js', url: s.url})),
    ...(YM.themes  || []).map(t => ({label: t.name+'.theme.html',url: t.url})),
  ];
  return all.map(f => `<option value="${escHtml(f.url||'')}">${escHtml(f.label)}</option>`).join('');
}

function getPlaceholder() {
  if (mode==='sphere') return `// @icon 🚀\n// @desc Ma sphere\n// @author pseudo\n// @cat social\n\nfunction init(container) {\n  container.innerHTML = '<div style="padding:16px">Hello</div>';\n}`;
  if (mode==='app')    return `// @icon ⬡\n// @desc Mon app\n\n(function(YM,$,el,fetchText,fetchJSON,REPO_RAW,REPO_API){\n  const body=$('ym-app-body');\n  if(body) body.innerHTML='<div class=\"ym-panel\">Hello</div>';\n  return { mountAs: 'pill', cleanup: ()=>{} };\n});`;
  return `<!-- @title YourMine @themeColor #c8f0a0 -->\n<style id="ym-theme-css">\n  :root { --accent: #c8f0a0; }\n</style>`;
}

// ── EVENTS ────────────────────────────────────────────────
function wireEvents() {
  container.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = () => { mode = btn.dataset.mode; render(); };
  });
  container.querySelectorAll('[data-sub]').forEach(btn => {
    btn.onclick = () => { subMode = btn.dataset.sub; render(); };
  });

  container.querySelector('#builder-ai-provider')?.addEventListener('change', e => { aiProvider = e.target.value; });
  container.querySelector('#builder-ai-key')?.addEventListener('input', e => localStorage.setItem('ym_builder_key', e.target.value));

  container.querySelectorAll('[data-rmctx]').forEach(chip => {
    chip.onclick = () => { ctxDocs.splice(parseInt(chip.dataset.rmctx), 1); render(); };
  });

  container.querySelector('#builder-gen-btn')?.addEventListener('click', generate);
  container.querySelector('#builder-clear-history')?.addEventListener('click', () => { aiHistory = []; render(); });
  container.querySelector('#builder-use-last')?.addEventListener('click', injectLastCode);
  container.querySelector('#builder-add-ctx-btn')?.addEventListener('click', addCtxFromPrompt);
  container.querySelector('#builder-add-ctx-code')?.addEventListener('click', addCtxFromPickerSelection);
  container.querySelector('#builder-load-doc-btn')?.addEventListener('click', loadFileDoc);
  container.querySelector('#builder-clear-btn')?.addEventListener('click', () => {
    if (confirm('Effacer ?')) { const ta = container.querySelector('#builder-code'); if (ta) ta.value = ''; }
  });
  container.querySelector('#builder-test-btn')?.addEventListener('click', testCode);
  container.querySelector('#builder-save-local-btn')?.addEventListener('click', saveLocal);
  container.querySelector('#builder-publish-btn')?.addEventListener('click', publish);
  container.querySelector('#builder-close-preview')?.addEventListener('click', () => {
    const p = container.querySelector('#builder-preview');
    if (p) { p.style.display='none'; p.querySelector('#builder-preview-sandbox').innerHTML=''; }
  });
}

function injectLastCode() {
  const last = [...aiHistory].reverse().find(m => m.role==='assistant');
  if (!last) return;
  const code = last.content.replace(/```(?:javascript|js|html|css)?\n?/g,'').replace(/```/g,'').trim();
  subMode = 'code'; render();
  const ta = container.querySelector('#builder-code');
  if (ta) ta.value = code;
}

// ── AJOUTER DOC EN CONTEXTE ───────────────────────────────
async function addCtxFromPrompt() {
  const name = prompt('Nom du fichier à ajouter (ex: mine.app.js) ou URL :');
  if (!name) return;
  const url = name.startsWith('http') ? name : REPO_RAW + name;
  try {
    const code = await ft(url);
    const docLines = code.split('\n').filter(l => l.trim().startsWith('//') || l.trim().startsWith('*') || l.trim().startsWith('/*')).slice(0, 80);
    ctxDocs.push({ label: name.split('/').pop(), content: docLines.join('\n') || code.slice(0,2000) });
    render();
  } catch(e) { alert('Erreur: ' + e.message); }
}

async function addCtxFromPickerSelection() {
  const picker = container.querySelector('#builder-file-picker');
  const val = picker?.value;
  const label = picker?.options[picker?.selectedIndex]?.text || 'fichier';
  if (!val) return;
  if (val === '__index__') {
    ctxDocs.push({ label: 'index.html doc', content: getIndexDoc().replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') });
    render(); return;
  }
  try {
    const code = await ft(val);
    const docLines = code.split('\n').filter(l => l.trim().startsWith('//') || l.trim().startsWith('*') || l.trim().startsWith('/*')).slice(0, 80);
    ctxDocs.push({ label, content: docLines.join('\n') || code.slice(0,2000) });
    render();
  } catch(e) { alert('Erreur: ' + e.message); }
}

async function loadFileDoc() {
  const picker = container.querySelector('#builder-file-picker');
  const val = picker?.value;
  const docEl = container.querySelector('#builder-file-doc');
  if (!docEl) return;
  if (!val) { docEl.style.display='none'; return; }
  if (val === '__index__') {
    docEl.innerHTML = getIndexDoc();
    docEl.style.display = '';
    return;
  }
  docEl.innerHTML = '<div class="ym-loading"></div> Chargement…';
  docEl.style.display = '';
  try {
    const code = await ft(val);
    const lines = code.split('\n');
    // Cherche un bloc de doc structuré (lignes de commentaires en tête + après les séparateurs ═)
    let docLines = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === '' && docLines.length > 5) break;
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/')) {
        docLines.push(line);
      } else if (docLines.length > 0) {
        break;
      }
      if (docLines.length > 120) break;
    }
    if (docLines.length < 3) docLines = lines.slice(0,40);
    docEl.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-all;font-size:10px;color:var(--accent)">${escHtml(docLines.join('\n'))}</pre>`;
  } catch(e) {
    docEl.innerHTML = `<div class="ym-notice error"><span>${escHtml(e.message)}</span></div>`;
  }
}

// ── GENERATE IA ───────────────────────────────────────────
async function generate() {
  const key    = (container.querySelector('#builder-ai-key')?.value || localStorage.getItem('ym_builder_key')||'').trim();
  const prompt = container.querySelector('#builder-prompt')?.value?.trim();
  if (!key)    return setAIStatus('Clé API requise', true);
  if (!prompt) return setAIStatus('Prompt requis', true);

  const getF = id => container.querySelector('#'+id)?.value?.trim() || '';
  let fieldCtx = '';
  if (mode==='sphere') fieldCtx = `Métadonnées : @icon ${getF('ai-icon')||'◎'} @cat ${getF('ai-cat')||'autres'} @author ${getF('ai-author')||'unknown'} @desc ${getF('ai-desc')||''}`;
  else if (mode==='app') fieldCtx = `Métadonnées : @icon ${getF('ai-icon')||'⬡'} mountAs: ${container.querySelector('#ai-mount')?.value||'pill'} @author ${getF('ai-author')||'unknown'} @desc ${getF('ai-desc')||''}`;
  else fieldCtx = `Thème : @title ${getF('ai-title')||'YourMine'} @bootLogo ${getF('ai-bootLogo')||'YourMine'} @themeColor ${getF('ai-themeColor')||'#c8f0a0'} @author ${getF('ai-author')||'unknown'}`;

  const ctxContent = ctxDocs.map(d => `\n\n// === Contexte: ${d.label} ===\n${d.content}`).join('');

  const SYSTEMS = {
    sphere: `Tu es expert en création de Spheres YourMine. Sphere = fichier JS avec function init(container){}.
Variables: window.YM, window.REPO_RAW, window.fetchText, window.fetchJSON, window.el, window.YM_addSphereTab, window.YM_updateBalance.
Classes CSS: ym-panel, ym-btn, ym-btn-accent, ym-input, ym-notice, ym-loading, ym-card, ym-chip, ym-tabs, ym-tab, ym-stat-row.
Génère UNIQUEMENT le code JS, sans markdown.`,
    app: `Tu es expert en création d'Apps YourMine. App = IIFE (function(YM,$,el,fetchText,fetchJSON,REPO_RAW,REPO_API){}).
Return DOIT inclure mountAs et cleanup. $('ym-app-body') = container.
IDs protégés: ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-btn-x, ym-btn-o, ym-profile-icon.
Classes CSS: ym-panel, ym-btn, ym-btn-accent, ym-input, ym-notice, ym-loading, ym-card, ym-chip.
Génère UNIQUEMENT le code JS, sans markdown.`,
    theme: `Tu es expert en design CSS pour YourMine. Thème = fichier HTML avec <style id="ym-theme-css">.
IDs PROTÉGÉS: ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-app-frames, ym-btn-x, ym-btn-o, ym-bottombar, ym-tabs-zone, ym-x-menu, ym-o-menu, ym-theme-confirm, ym-theme-root, ym-boot, ym-boot-logo, ym-boot-bar, ym-boot-progress, ym-profile-icon.
Variables CSS: --bg, --bg2, --bg3, --surface, --surface2, --border, --border2, --accent, --accent2, --accent3, --text, --text2, --text3, --danger, --gold, --r, --r2, --r3, --transition, --font-display, --font-mono.
Génère UNIQUEMENT HTML+CSS, sans markdown.`
  };

  const userContent = aiHistory.length === 0
    ? `${fieldCtx}\n${ctxContent}\n\n${prompt}`
    : prompt;

  aiHistory.push({ role: 'user', content: userContent });

  setAIStatus('Génération…');
  const btn = container.querySelector('#builder-gen-btn');
  if (btn) { btn.disabled=true; btn.innerHTML='<div class="ym-loading"></div>'; }

  try {
    const prov = container.querySelector('#builder-ai-provider')?.value || aiProvider;
    let code = '';
    if (prov === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: SYSTEMS[mode], messages: aiHistory.map(m=>({role:m.role,content:m.content})) })
      });
      const d = await r.json();
      code = d.content?.[0]?.text || d.error?.message || 'Erreur';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{role:'system',content:SYSTEMS[mode]}, ...aiHistory.map(m=>({role:m.role,content:m.content}))] })
      });
      const d = await r.json();
      code = d.choices?.[0]?.message?.content || d.error?.message || 'Erreur';
    }
    aiHistory.push({ role: 'assistant', content: code });
    const ta = container.querySelector('#builder-prompt');
    if (ta) ta.value = '';
    render();
    setAIStatus('✓ Réponse reçue — cliquez "Injecter code" pour l\'utiliser');
  } catch(e) {
    aiHistory.push({ role: 'assistant', content: 'Erreur: ' + e.message });
    render();
    setAIStatus('Erreur: ' + e.message, true);
  }
}

function setAIStatus(msg, isError=false) {
  const s = container.querySelector('#builder-ai-status');
  if (!s) return;
  s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
}

// ── TEST ──────────────────────────────────────────────────
function testCode() {
  const code = container.querySelector('#builder-code')?.value?.trim();
  if (!code) return setStatus('Aucun code', true);
  const preview = container.querySelector('#builder-preview');
  const sandbox = container.querySelector('#builder-preview-sandbox');
  if (!preview || !sandbox) return;
  sandbox.innerHTML = '';
  preview.style.display = '';
  try {
    if (mode==='sphere') {
      const fn = new Function('container', code + '\n;if(typeof init==="function")init(container);');
      fn(sandbox);
    } else if (mode==='app') {
      const fn = (0,eval)('('+code.trimEnd().replace(/;+$/,'')+')');
      const oid = sandbox.id; sandbox.id='ym-app-body';
      fn(YM, id=>id==='ym-app-body'?sandbox:document.getElementById(id), window.el||((t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e;}), ft, fj, REPO_RAW, REPO_API);
      sandbox.id = oid;
    } else {
      const root = document.getElementById('ym-theme-root');
      if (root) root.innerHTML = code;
      sandbox.innerHTML = '<div class="ym-notice success"><span>Thème appliqué.</span></div>';
    }
    setStatus('✓ Test OK');
  } catch(e) {
    sandbox.innerHTML = `<div class="ym-notice error"><span>${escHtml(e.message)}</span></div>`;
    setStatus('Erreur: '+e.message, true);
  }
}

// ── SAVE LOCAL ────────────────────────────────────────────
function saveLocal() {
  const code = container.querySelector('#builder-code')?.value?.trim();
  if (!code) return setStatus('Aucun code', true);
  const name = container.querySelector('#builder-name')?.value?.trim() || (mode+'-'+Date.now());
  const key = mode==='sphere'?'ym_local_spheres':mode==='app'?'ym_local_apps':'ym_local_themes';
  const list = JSON.parse(localStorage.getItem(key)||'[]');
  const i = list.findIndex(s=>s.name===name);
  const entry = { name, code, _local: true };
  if (mode==='sphere') entry.cat = container.querySelector('#builder-cat')?.value?.trim()||'autres';
  if (i>=0) list[i]=entry; else list.push(entry);
  localStorage.setItem(key, JSON.stringify(list));
  setStatus(`✓ "${name}" sauvegardé`);
}

// ── PUBLISH ───────────────────────────────────────────────
async function publish() {
  const code  = container.querySelector('#builder-code')?.value?.trim();
  const token = localStorage.getItem('ym_gh_token') || prompt('Token GitHub (Contents: Write) :');
  if (!code)  return setStatus('Aucun code', true);
  if (!token) return;
  localStorage.setItem('ym_gh_token', token);
  const name = container.querySelector('#builder-name')?.value?.trim();
  if (!name) return setStatus('Nom requis', true);
  const ext = mode==='sphere'?'.sphere.js':mode==='app'?'.app.js':'.theme.html';
  const filename = name+ext;
  setStatus('Publication…');
  try {
    const existing = await fj(REPO_API).catch(()=>[]);
    if (Array.isArray(existing) && existing.find(f=>f.name===filename)) return setStatus(`⚠ "${filename}" existe déjà`, true);
    const content = btoa(unescape(encodeURIComponent(code)));
    const r = await fetch(`https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/${filename}`, {
      method:'PUT',
      headers:{ Authorization:`token ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ message:`Add ${filename}`, content })
    });
    if (r.status===201) setStatus(`✓ "${filename}" publié !`);
    else { const e=await r.json(); setStatus('Erreur: '+(e.message||r.status), true); }
  } catch(e) { setStatus('Erreur: '+e.message, true); }
}

function setStatus(msg, isError=false) {
  const s = container.querySelector('#builder-status');
  if (!s) return;
  s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
  if (!isError) setTimeout(()=>{ s.innerHTML=''; }, 5000);
}

render();
} // end init
