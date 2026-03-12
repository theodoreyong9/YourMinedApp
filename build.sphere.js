/* @sphere
 * @icon 🔨
 * @cat browser
 * @desc Builder IA — Créez, testez et publiez vos Spheres et Thèmes
 * @author theodoreyong9
 * @web https://yourmine.app
 */

// ════════════════════════════════════════════════════════
//  builder.browser.sphere.js — Builder IA pour Spheres & Themes
// ════════════════════════════════════════════════════════

function init(container) {

const REPO_RAW = window._REPO_RAW || 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/';
const REPO_API = window._REPO_API || 'https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/';
const CATEGORIES = ['Autres', 'Commerce', 'Social', 'Transport', 'Jeux'];

let mode         = 'sphere';   // 'sphere' | 'theme'
let subMode      = 'manual';   // 'manual' | 'ai'
let aiProvider   = 'anthropic';
let selectedSphereUrls = [];

// ── RENDER ────────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">

    <!-- Mode selector -->
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <div class="ym-tabs">
        <button class="ym-tab${mode==='sphere'?' active':''}" data-mode="sphere">Sphere</button>
        <button class="ym-tab${mode==='theme'?' active':''}" data-mode="theme">Thème</button>
      </div>
      <div class="ym-tabs" style="margin-left:auto">
        <button class="ym-tab${subMode==='manual'?' active':''}" data-sub="manual">Code</button>
        <button class="ym-tab${subMode==='ai'?' active':''}" data-sub="ai">IA</button>
      </div>
    </div>

    <!-- AI Config (shown if subMode=ai) -->
    ${subMode==='ai' ? `
    <div class="ym-panel" id="builder-ai-panel" style="padding:16px">
      <div class="ym-panel-title">Configuration IA</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px">
          <select class="ym-input" id="builder-ai-provider" style="width:auto">
            <option value="anthropic" ${aiProvider==='anthropic'?'selected':''}>Anthropic</option>
            <option value="openai"    ${aiProvider==='openai'?'selected':''}>OpenAI</option>
          </select>
          <input class="ym-input" id="builder-ai-key" type="password" placeholder="Clé API…" value="${localStorage.getItem('ym_builder_key')||''}"/>
        </div>
        ${mode==='sphere' ? renderSpherePicker() : ''}
        <textarea class="ym-editor" id="builder-prompt" rows="4" placeholder="${mode==='sphere' ? 'Décrivez la sphere : son comportement, son interface, ses données…' : 'Décrivez le thème : couleurs, typographie, ambiance…'}"></textarea>
        <button class="ym-btn ym-btn-accent" id="builder-gen-btn">✦ Générer avec IA</button>
      </div>
    </div>
    ` : ''}

    <!-- Documentation / context -->
    ${subMode==='ai' ? `
    <details class="ym-panel" style="padding:14px">
      <summary style="cursor:pointer;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">Documentation API ▸</summary>
      <div style="margin-top:12px;font-size:11px;color:var(--text2);line-height:1.7">
        ${mode==='sphere' ? renderSphereDoc() : renderThemeDoc()}
      </div>
    </details>
    ` : ''}

    <!-- Code editor -->
    <div class="ym-panel" style="padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div class="ym-panel-title" style="margin:0">Éditeur</div>
        <div style="display:flex;gap:6px">
          <button class="ym-btn ym-btn-ghost" id="builder-format-btn" style="font-size:10px">Format</button>
          <button class="ym-btn ym-btn-ghost" id="builder-clear-btn"  style="font-size:10px;color:var(--danger)">Effacer</button>
        </div>
      </div>
      <textarea class="ym-editor" id="builder-code" rows="14" placeholder="${mode==='sphere' ? placeholderSphere() : placeholderTheme()}"></textarea>
    </div>

    <!-- Name / Category (sphere only) -->
    ${mode==='sphere' ? `
    <div class="ym-panel" style="padding:14px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="ym-input" id="builder-name" placeholder="Nom de la sphere" style="flex:1;min-width:140px"/>
        <select class="ym-input" id="builder-cat" style="width:auto">
          ${CATEGORIES.map(c=>`<option value="${c.toLowerCase()}">${c}</option>`).join('')}
        </select>
      </div>
    </div>
    ` : `
    <div class="ym-panel" style="padding:14px">
      <input class="ym-input" id="builder-theme-name" placeholder="Nom du thème"/>
    </div>
    `}

    <!-- Actions -->
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="ym-btn ym-btn-accent" id="builder-test-btn" style="flex:1">▶ Tester</button>
      <button class="ym-btn" id="builder-save-local-btn" style="flex:1">⊕ Sauvegarder local</button>
      <button class="ym-btn" id="builder-publish-btn" style="flex:1">↑ Publier PR</button>
    </div>

    <!-- Status -->
    <div id="builder-status"></div>

    <!-- Test preview -->
    <div id="builder-preview" style="display:none" class="ym-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="ym-panel-title" style="margin:0">Aperçu test</div>
        <button class="ym-btn ym-btn-ghost" id="builder-close-preview" style="font-size:10px">Fermer</button>
      </div>
      <div id="builder-preview-sandbox" style="min-height:100px"></div>
    </div>
  </div>`;

  wireEvents();
}

function renderSpherePicker() {
  const YM = window._YM;
  const mySpheres = [
    ...(JSON.parse(localStorage.getItem('ym_creator_spheres')||'[]')),
    ...(JSON.parse(localStorage.getItem('ym_tester_spheres')||'[]'))
  ];
  if (!mySpheres.length) return '<div style="font-size:10px;color:var(--text3)">Aucune sphere dans votre Plug (max 3 peuvent être incluses comme contexte).</div>';
  return `
  <div>
    <div style="font-size:10px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Spheres contexte (max 3)</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px" id="builder-sphere-picker">
      ${mySpheres.slice(0,6).map(s=>`
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" value="${s.url||''}" ${selectedSphereUrls.includes(s.url)?'checked':''}/>
          <span class="ym-chip">${s.name}</span>
        </label>`).join('')}
    </div>
  </div>`;
}

function renderSphereDoc() {
  return `<strong>Structure d'une sphere</strong><br/>
Une sphere est un fichier JS autonome avec une fonction <code style="color:var(--accent)">init(container)</code>.<br/><br/>
<strong>Variables globales disponibles :</strong><br/>
<code style="color:var(--accent2)">window._YM</code> — État global YourMine (profile, contacts, wallet…)<br/>
<code style="color:var(--accent2)">window._REPO_RAW</code> — URL base du repo<br/>
<code style="color:var(--accent2)">window.YM_addSphereTab(name, fn)</code> — Ajouter un onglet sphere<br/>
<code style="color:var(--accent2)">window.YM_updateBalance(val)</code> — Mettre à jour la balance<br/><br/>
<strong>Métadonnées (@sphere block) :</strong><br/>
<code style="color:var(--accent3)">/* @sphere @icon 🚀 @cat social @desc Description @author pseudo @score 0 */</code><br/><br/>
<strong>P2P :</strong><br/>
<code>window._YM.p2p.sendProfile(data)</code> — Diffuser des données<br/>
<code>sessionStorage.getItem('ym_near_cache')</code> — Cache des profils proches`;
}

function renderThemeDoc() {
  return `<strong>Structure d'un thème</strong><br/>
Un thème est un fichier HTML contenant une balise <code style="color:var(--accent)">&lt;style&gt;</code> et optionnellement des <code>&lt;template&gt;</code>.<br/><br/>
<strong>IDs PROTÉGÉS (ne jamais supprimer ni renommer) :</strong><br/>
<code style="color:var(--danger)">ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val<br/>ym-main, ym-app-body, ym-btn-x, ym-btn-o, ym-x-menu, ym-o-menu<br/>ym-x-backdrop, ym-o-backdrop, ym-theme-confirm, ym-theme-root</code><br/><br/>
<strong>Variables CSS à définir :</strong><br/>
<code style="color:var(--accent2)">--bg, --bg2, --bg3, --surface, --border, --accent, --text, --text2<br/>--r, --r2, --r3, --transition, --font-display, --font-mono</code><br/><br/>
<strong>Classes utilitaires à conserver :</strong><br/>
<code>ym-btn, ym-input, ym-panel, ym-card, ym-chip, ym-tabs, ym-tab…</code>`;
}

function placeholderSphere() {
  return `/* @sphere
 * @icon 🚀
 * @cat Social
 * @desc Ma sphere personnalisée
 * @author votre-pseudo
 */

function init(container) {
  container.innerHTML = \`
    <div style="padding:16px;text-align:center;color:var(--accent)">
      <div style="font-size:32px;margin-bottom:8px">🚀</div>
      <div style="font-family:var(--font-display);font-size:16px;font-weight:700">Ma Sphere</div>
    </div>
  \`;
}`;
}

function placeholderTheme() {
  return `<style>
  :root {
    --bg: #050508;
    --accent: #c8f0a0;
    --text: #e8e8f0;
    /* Vos variables CSS ici */
  }
  /* Vos styles ici */
</style>`;
}

// ── EVENTS ────────────────────────────────────────────────
function wireEvents() {
  // Mode / subMode
  container.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = () => { mode = btn.dataset.mode; render(); };
  });
  container.querySelectorAll('[data-sub]').forEach(btn => {
    btn.onclick = () => { subMode = btn.dataset.sub; render(); };
  });

  // AI provider + key save
  container.querySelector('#builder-ai-provider')?.addEventListener('change', e => { aiProvider = e.target.value; });
  container.querySelector('#builder-ai-key')?.addEventListener('input', e => localStorage.setItem('ym_builder_key', e.target.value));

  // Sphere picker checkboxes
  container.querySelector('#builder-sphere-picker')?.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) { if (selectedSphereUrls.length < 3) selectedSphereUrls.push(cb.value); else cb.checked = false; }
      else { selectedSphereUrls = selectedSphereUrls.filter(u => u !== cb.value); }
    };
  });

  // Generate
  container.querySelector('#builder-gen-btn')?.addEventListener('click', generate);

  // Format
  container.querySelector('#builder-format-btn')?.addEventListener('click', () => {
    const ta = container.querySelector('#builder-code');
    if (!ta) return;
    try {
      // Basic indent attempt
      ta.value = ta.value.replace(/;(\s*)/g, ';\n$1').replace(/\{(\s*)/g, '{\n  ').replace(/\}(\s*)/g, '\n}\n');
    } catch {}
  });

  // Clear
  container.querySelector('#builder-clear-btn')?.addEventListener('click', () => {
    if (confirm('Effacer le code ?')) { const ta = container.querySelector('#builder-code'); if (ta) ta.value = ''; }
  });

  // Test
  container.querySelector('#builder-test-btn')?.addEventListener('click', testCode);

  // Save local
  container.querySelector('#builder-save-local-btn')?.addEventListener('click', saveLocal);

  // Publish
  container.querySelector('#builder-publish-btn')?.addEventListener('click', publish);

  // Close preview
  container.querySelector('#builder-close-preview')?.addEventListener('click', () => {
    const p = container.querySelector('#builder-preview');
    if (p) { p.style.display = 'none'; p.querySelector('#builder-preview-sandbox').innerHTML = ''; }
  });
}

// ── GENERATE WITH AI ──────────────────────────────────────
async function generate() {
  const key    = (container.querySelector('#builder-ai-key')?.value || localStorage.getItem('ym_builder_key') || '').trim();
  const prompt = container.querySelector('#builder-prompt')?.value?.trim();
  const prov   = container.querySelector('#builder-ai-provider')?.value || aiProvider;
  if (!key)    return setStatus('Clé API requise', true);
  if (!prompt) return setStatus('Prompt requis', true);

  setStatus('Génération en cours…');
  const btn = container.querySelector('#builder-gen-btn');
  btn.disabled = true;

  // Load context spheres
  let contextCode = '';
  for (const url of selectedSphereUrls.slice(0,3)) {
    try { const c = await (window._fetchText || fetch)(url).then(r => typeof r === 'string' ? r : r.text()); contextCode += `\n\n// === Sphere context: ${url} ===\n${c.slice(0,2000)}`; } catch {}
  }

  const systemPrompt = mode === 'sphere'
    ? `Tu es expert en création de Spheres pour YourMine. Une sphere est un fichier JS avec init(container).
RÈGLES : utilise uniquement les APIs et variables globales documentées. Le code doit être autonome.
Variables disponibles: window._YM, window._REPO_RAW, window._fetchText, window._fetchJSON, window.YM_addSphereTab, window.YM_updateBalance.
Inclus le bloc de métadonnées @sphere.
Génère UNIQUEMENT le code JS, sans markdown, sans explication.`
    : `Tu es expert en design CSS/HTML pour YourMine.
RÈGLE ABSOLUE : ne jamais supprimer/renommer les IDs protégés : ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-app-body, ym-btn-x, ym-btn-o, ym-x-menu, ym-o-menu, ym-theme-confirm.
Génère UNIQUEMENT HTML+CSS du thème, sans markdown.`;

  const userMsg = `${prompt}${contextCode ? `\n\nContexte de spheres:\n${contextCode}` : ''}`;

  try {
    let code = '';
    if (prov === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'x-api-key': key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:4096, system: systemPrompt, messages:[{ role:'user', content: userMsg }] })
      });
      const d = await r.json();
      code = d.content?.[0]?.text || d.error?.message || 'Erreur';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ model:'gpt-4o', messages:[{role:'system',content:systemPrompt},{role:'user',content:userMsg}] })
      });
      const d = await r.json();
      code = d.choices?.[0]?.message?.content || d.error?.message || 'Erreur';
    }
    code = code.replace(/```(?:javascript|js|html|css)?\n?/g,'').replace(/```/g,'').trim();
    const ta = container.querySelector('#builder-code');
    if (ta) ta.value = code;
    setStatus('✓ Code généré');
  } catch(e) {
    setStatus('Erreur: ' + e.message, true);
  }
  btn.disabled = false;
}

// ── TEST ──────────────────────────────────────────────────
function testCode() {
  const code = container.querySelector('#builder-code')?.value?.trim();
  if (!code) return setStatus('Aucun code à tester', true);

  const preview = container.querySelector('#builder-preview');
  const sandbox = container.querySelector('#builder-preview-sandbox');
  if (!preview || !sandbox) return;

  sandbox.innerHTML = '';
  preview.style.display = '';

  try {
    if (mode === 'sphere') {
      const fn = new Function('container', code + '\n;if(typeof init==="function")init(container);');
      fn(sandbox);
    } else {
      // Theme preview
      const root = document.getElementById('ym-theme-root');
      if (root) { root.innerHTML = code; }
      sandbox.innerHTML = `<div class="ym-notice success"><span>Thème appliqué en aperçu — cliquez sur Confirmer dans la barre en haut.</span></div>`;
      const confirm = document.getElementById('ym-theme-confirm');
      if (confirm) confirm.classList.add('visible');
    }
    setStatus('✓ Test OK');
  } catch(e) {
    sandbox.innerHTML = `<div class="ym-notice error"><span>Erreur: ${e.message}</span></div>`;
    setStatus('Erreur test: ' + e.message, true);
  }
}

// ── SAVE LOCAL ────────────────────────────────────────────
function saveLocal() {
  const code = container.querySelector('#builder-code')?.value?.trim();
  if (!code) return setStatus('Aucun code à sauvegarder', true);

  if (mode === 'sphere') {
    const name = container.querySelector('#builder-name')?.value?.trim() || 'sphere-' + Date.now();
    const cat  = container.querySelector('#builder-cat')?.value || 'autres';
    const spheres = JSON.parse(localStorage.getItem('ym_creator_spheres') || '[]');
    const existing = spheres.findIndex(s => s.name === name);
    const entry = { name, cat, code, url: null, _local: true };
    if (existing >= 0) spheres[existing] = entry; else spheres.push(entry);
    localStorage.setItem('ym_creator_spheres', JSON.stringify(spheres));
    setStatus(`✓ Sphere "${name}" sauvegardée dans votre Plug (Créateur)`);
  } else {
    const name = container.querySelector('#builder-theme-name')?.value?.trim() || 'theme-' + Date.now();
    const themes = JSON.parse(localStorage.getItem('ym_local_themes') || '[]');
    const existing = themes.findIndex(t => t.name === name);
    const entry = { name, code };
    if (existing >= 0) themes[existing] = entry; else themes.push(entry);
    localStorage.setItem('ym_local_themes', JSON.stringify(themes));
    setStatus(`✓ Thème "${name}" sauvegardé localement`);
  }
}

// ── PUBLISH ───────────────────────────────────────────────
async function publish() {
  const code  = container.querySelector('#builder-code')?.value?.trim();
  const token = localStorage.getItem('ym_gh_token') || prompt('Token GitHub (workflow ou public_repo scope) :');
  if (!code) return setStatus('Aucun code à publier', true);
  if (!token) return;
  localStorage.setItem('ym_gh_token', token);

  let filename;
  if (mode === 'sphere') {
    const name = container.querySelector('#builder-name')?.value?.trim();
    const cat  = container.querySelector('#builder-cat')?.value || 'autres';
    if (!name) return setStatus('Nom de sphere requis', true);
    filename = `${cat}.${name}.sphere.js`;
  } else {
    const name = container.querySelector('#builder-theme-name')?.value?.trim();
    if (!name) return setStatus('Nom de thème requis', true);
    filename = `${name}.theme.html`;
  }

  setStatus('Vérification du repo…');
  try {
    // Check if file already exists (PR check)
    const files = await (window._fetchJSON || (url => fetch(url).then(r=>r.json())))(REPO_API);
    if (files.find && files.find(f => f.name === filename)) {
      return setStatus(`⚠ Un fichier "${filename}" existe déjà. Choisissez un autre nom.`, true);
    }

    // Create file via API (would need write access — show instructions instead)
    const content = btoa(unescape(encodeURIComponent(code)));
    const r = await fetch(`https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/${filename}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Add ${filename}`, content })
    });
    if (r.status === 201) {
      setStatus(`✓ "${filename}" publié dans le repo !`);
    } else if (r.status === 403 || r.status === 422) {
      // Fork + PR fallback instruction
      setStatus(`Créez un fork du repo et soumettez le fichier "${filename}" manuellement, ou utilisez un token avec les droits "Contents: Write".`, true);
      navigator.clipboard.writeText(code).catch(()=>{});
    } else {
      const e = await r.json();
      setStatus('Erreur: ' + (e.message || r.status), true);
    }
  } catch(e) {
    setStatus('Erreur: ' + e.message, true);
  }
}

function setStatus(msg, isError = false) {
  const s = container.querySelector('#builder-status');
  if (!s) return;
  s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
  if (!isError) setTimeout(() => { s.innerHTML = ''; }, 5000);
}

// ── INIT ─────────────────────────────────────────────────
render();

} // end init
