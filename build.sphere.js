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

let mode    = 'sphere'; // 'sphere' | 'theme' | 'app'
let subMode = 'manual'; // 'manual' | 'ai'
let aiProvider = 'anthropic';
let selectedCtxUrls = [];

// ── RENDER ───────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">

    <!-- Mode selector -->
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <div class="ym-tabs">
        <button class="ym-tab${mode==='sphere'?' active':''}" data-mode="sphere">◎ Sphere</button>
        <button class="ym-tab${mode==='theme' ?' active':''}" data-mode="theme">🎨 Thème</button>
        <button class="ym-tab${mode==='app'   ?' active':''}" data-mode="app">⬡ App</button>
      </div>
      <div class="ym-tabs" style="margin-left:auto">
        <button class="ym-tab${subMode==='manual'?' active':''}" data-sub="manual">Code</button>
        <button class="ym-tab${subMode==='ai'   ?' active':''}" data-sub="ai">✦ IA</button>
      </div>
    </div>

    <!-- Panneau IA -->
    ${subMode==='ai' ? `
    <div class="ym-panel" style="padding:16px">
      <div class="ym-panel-title">Configuration IA</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select class="ym-input" id="builder-ai-provider" style="width:auto">
            <option value="anthropic" ${aiProvider==='anthropic'?'selected':''}>Anthropic (Claude)</option>
            <option value="openai"    ${aiProvider==='openai'   ?'selected':''}>OpenAI (GPT-4o)</option>
          </select>
          <input class="ym-input" id="builder-ai-key" type="password" placeholder="Clé API…" value="${localStorage.getItem('ym_builder_key')||''}" style="flex:1;min-width:160px"/>
        </div>

        <!-- Champs IA spécifiques au mode -->
        ${renderAIFields()}

        <textarea class="ym-editor" id="builder-prompt" rows="4"
          placeholder="${mode==='sphere'?'Décrivez la sphere : comportement, interface, données…':mode==='app'?'Décrivez l\'app : ce qu\'elle fait, comment elle s\'intègre, son point de montage…':'Décrivez le thème : couleurs, typographie, ambiance…'}"></textarea>
        <button class="ym-btn ym-btn-accent" id="builder-gen-btn">✦ Générer avec IA</button>
      </div>
    </div>
    ` : ''}

    <!-- Éditeur code -->
    <div class="ym-panel" style="padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div class="ym-panel-title" style="margin:0">Éditeur</div>
        <div style="display:flex;gap:6px">
          <button class="ym-btn ym-btn-ghost" id="builder-ai-fields-btn" style="font-size:10px">✦ Champs IA</button>
          <button class="ym-btn ym-btn-ghost" id="builder-doc-btn"       style="font-size:10px">📖 Doc API</button>
          <button class="ym-btn ym-btn-ghost" id="builder-clear-btn"     style="font-size:10px;color:var(--danger)">Effacer</button>
        </div>
      </div>
      <textarea class="ym-editor" id="builder-code" rows="16"
        placeholder="${getPlaceholder()}"></textarea>
    </div>

    <!-- Panneau doc (toggle) -->
    <div id="builder-doc-panel" style="display:none" class="ym-panel">
      <div class="ym-panel-title">Documentation API — ${mode}</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.8">${getDoc()}</div>
    </div>

    <!-- Panneau champs IA (toggle) -->
    <div id="builder-ai-fields-panel" style="display:none" class="ym-panel">
      <div class="ym-panel-title">Champs IA — paramètres ${mode}</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.8">${getAIFieldsDoc()}</div>
    </div>

    <!-- Nom / options -->
    <div class="ym-panel" style="padding:14px">
      ${mode==='sphere' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="ym-input" id="builder-name" placeholder="Nom de la sphere" style="flex:2;min-width:140px"/>
          <input class="ym-input" id="builder-cat"  placeholder="Catégorie (ex: social)" style="flex:1;min-width:100px"/>
        </div>
      ` : mode==='app' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="ym-input" id="builder-name" placeholder="Nom de l'app" style="flex:2;min-width:140px"/>
          <select class="ym-input" id="builder-mount" style="flex:1;min-width:140px">
            <option value="pill">pill — barre du bas</option>
            <option value="balance">balance — bloc claimable</option>
            <option value="profile-icon">profile-icon — icône header</option>
          </select>
        </div>
      ` : `
        <input class="ym-input" id="builder-name" placeholder="Nom du thème"/>
      `}
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="ym-btn ym-btn-accent" id="builder-test-btn"       style="flex:1">▶ Tester</button>
      <button class="ym-btn"               id="builder-save-local-btn" style="flex:1">⊕ Local</button>
      <button class="ym-btn"               id="builder-publish-btn"    style="flex:1">↑ Publier</button>
    </div>

    <div id="builder-status"></div>

    <!-- Preview -->
    <div id="builder-preview" style="display:none" class="ym-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="ym-panel-title" style="margin:0">Aperçu</div>
        <button class="ym-btn ym-btn-ghost" id="builder-close-preview" style="font-size:10px">Fermer</button>
      </div>
      <div id="builder-preview-sandbox" style="min-height:80px"></div>
    </div>

  </div>`;

  wireEvents();
}

// ── CHAMPS IA (dans le panneau IA) ───────────────────────
function renderAIFields() {
  if (mode === 'sphere') return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <input class="ym-input" id="ai-icon"    placeholder="@icon (ex: 🚀)"/>
      <input class="ym-input" id="ai-cat"     placeholder="@cat (ex: social)"/>
      <input class="ym-input" id="ai-author"  placeholder="@author"/>
      <input class="ym-input" id="ai-desc"    placeholder="@desc courte"/>
    </div>`;
  if (mode === 'app') return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <input class="ym-input" id="ai-icon"    placeholder="@icon (ex: ⬡)"/>
      <select class="ym-input" id="ai-mount">
        <option value="pill">mountAs: pill</option>
        <option value="balance">mountAs: balance</option>
        <option value="profile-icon">mountAs: profile-icon</option>
      </select>
      <input class="ym-input" id="ai-author"  placeholder="@author"/>
      <input class="ym-input" id="ai-desc"    placeholder="@desc courte"/>
    </div>`;
  // theme
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <input class="ym-input" id="ai-title"       placeholder="@title (nom affiché)"/>
      <input class="ym-input" id="ai-themeColor"  placeholder="@themeColor (ex: #c8f0a0)"/>
      <input class="ym-input" id="ai-bootLogo"    placeholder="@bootLogo (texte boot)"/>
      <input class="ym-input" id="ai-author"      placeholder="@author"/>
    </div>`;
}

// ── DOC API COMPLÈTE ─────────────────────────────────────
function getDoc() {
  if (mode === 'sphere') return `
<strong style="color:var(--accent)">Structure sphere</strong><br/>
Fichier JS avec <code>function init(container) { … }</code> — PAS une IIFE.<br/><br/>

<strong style="color:var(--accent2)">Variables globales disponibles</strong><br/>
<code>window.YM</code> — État global : <code>YM.profile</code>, <code>YM.contacts</code>, <code>YM.geo</code> {lat,lng}, <code>YM.peerCount</code>, <code>YM.p2p</code>, <code>YM.sphereTabs</code>, <code>YM.apps</code>, <code>YM.themes</code>, <code>YM.spheres</code><br/>
<code>window.REPO_RAW</code> — URL base raw GitHub<br/>
<code>window.REPO_API</code> — URL API GitHub contents<br/>
<code>window.fetchText(url)</code> — fetch → string<br/>
<code>window.fetchJSON(url)</code> — fetch → JSON<br/>
<code>window.el(tag, cls, html)</code> — créer un élément DOM<br/><br/>

<strong style="color:var(--accent2)">Fonctions YourMine</strong><br/>
<code>window.YM_addSphereTab(name, url, autoActivate?)</code><br/>
<code>window.YM_removeSphereTab(name)</code><br/>
<code>window.YM_updateBalance(val)</code><br/>
<code>window.YM_setDisconnected()</code><br/>
<code>window.YM_toggleMount(point)</code> — ouvre/ferme 'profile-icon' ou 'balance'<br/><br/>

<strong style="color:var(--accent2)">P2P (Trystero)</strong><br/>
<code>YM.room</code> — room Trystero actif<br/>
<code>YM.p2p.sendProfile(data)</code> — diffuse profil aux peers<br/>
<code>sessionStorage.getItem('ym_near_cache')</code> — cache JSON des profils proches<br/><br/>

<strong style="color:var(--accent2)">Métadonnées (20 premières lignes)</strong><br/>
<code style="color:var(--accent3)">// @icon 🚀  @desc …  @author …  @cat …  @score 0  @imgUrl https://…</code><br/><br/>

<strong style="color:var(--danger)">Classes CSS disponibles</strong><br/>
<code>ym-panel, ym-panel-title, ym-btn, ym-btn-accent, ym-btn-ghost, ym-btn-danger</code><br/>
<code>ym-input, ym-editor, ym-card, ym-chip, ym-tabs, ym-tab, ym-notice (info/success/warn/error)</code><br/>
<code>ym-loading, ym-shimmer, ym-avatar, ym-badge, ym-divider, ym-stat-row, ym-stat-label, ym-stat-value</code>`;

  if (mode === 'app') return `
<strong style="color:var(--accent)">Structure app</strong><br/>
Fichier JS avec une IIFE : <code>(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) { … });</code><br/>
Le <code>return</code> final DOIT inclure <code>mountAs</code> :<br/>
<code style="color:var(--accent3)">return { mountAs: 'pill', cleanup: () => {} };</code><br/>
<code style="color:var(--accent3)">return { mountAs: 'balance', cleanup: () => {} };</code><br/>
<code style="color:var(--accent3)">return { mountAs: 'profile-icon', cleanup: () => {} };</code><br/><br/>

<strong style="color:var(--accent2)">Points de montage</strong><br/>
<code>pill</code> — crée une pills dans la barre du bas, frame pleine page, croix pour fermer<br/>
<code>balance</code> — s'accroche au bloc "non connecté/balance" en haut à droite. Clic toggle. Croix dans menu X → décharge + cache si vide<br/>
<code>profile-icon</code> — s'accroche à l'icône bonhomme à côté de YourMine. Clic toggle. Croix dans menu X → décharge + cache si vide<br/>
Plusieurs apps sur le même point non-pill → <strong>sous-onglets automatiques</strong><br/><br/>

<strong style="color:var(--accent2)">Paramètres de l'IIFE</strong><br/>
<code>YM</code> — état global<br/>
<code>$</code> — <code>id => document.getElementById(id)</code>, avec <code>$('ym-app-body')</code> = container de l'app<br/>
<code>el(tag, cls, html)</code> — créer un élément<br/>
<code>fetchText(url)</code>, <code>fetchJSON(url)</code><br/>
<code>REPO_RAW</code>, <code>REPO_API</code><br/><br/>

<strong style="color:var(--accent2)">Métadonnées (20 premières lignes)</strong><br/>
<code style="color:var(--accent3)">// @icon ⬡  @desc …  @author …  @cat …  @score 0</code><br/><br/>

<strong style="color:var(--danger)">IDs protégés (ne JAMAIS toucher)</strong><br/>
<code>ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main</code><br/>
<code>ym-btn-x, ym-btn-o, ym-bottombar, ym-tabs-zone, ym-app-frames</code><br/>
<code>ym-x-menu, ym-o-menu, ym-x-backdrop, ym-o-backdrop</code><br/>
<code>ym-theme-confirm, ym-theme-root, ym-boot, ym-profile-icon</code><br/>
<code>ym-mount-profile, ym-mount-balance</code>`;

  // theme
  return `
<strong style="color:var(--accent)">Structure thème</strong><br/>
Fichier HTML avec un bloc <code>&lt;style id="ym-theme-css"&gt;</code> et optionnellement un <code>&lt;script&gt;</code>.<br/><br/>

<strong style="color:var(--accent2)">Métadonnées (commentaire HTML en tête)</strong><br/>
<code style="color:var(--accent3)">&lt;!-- @icon 🎨  @desc …  @author …  @cat …  @score 0<br/>
  @title NomApp  @bootLogo TexteBoot  @themeColor #hexcolor --&gt;</code><br/>
Le script dans le thème peut lire ces valeurs et les appliquer via :<br/>
<code>document.title = title;</code><br/>
<code>document.getElementById('ym-boot-logo').textContent = bootLogo;</code><br/>
<code>document.querySelector('meta[name="theme-color"]').content = themeColor;</code><br/><br/>

<strong style="color:var(--accent2)">Variables CSS à définir dans :root</strong><br/>
<code>--bg, --bg2, --bg3</code> — fonds<br/>
<code>--surface, --surface2</code> — surfaces<br/>
<code>--border, --border2</code> — bordures<br/>
<code>--accent, --accent2, --accent3</code> — couleurs d'accent<br/>
<code>--text, --text2, --text3</code> — textes<br/>
<code>--danger, --gold</code> — alertes<br/>
<code>--r, --r2, --r3</code> — border-radius<br/>
<code>--transition</code> — easing curve<br/>
<code>--font-display, --font-mono</code> — familles de polices<br/><br/>

<strong style="color:var(--danger)">IDs protégés (ne JAMAIS supprimer ni renommer)</strong><br/>
<code>ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val</code><br/>
<code>ym-main, ym-app-frames, ym-btn-x, ym-btn-o, ym-bottombar, ym-tabs-zone</code><br/>
<code>ym-x-menu, ym-o-menu, ym-x-backdrop, ym-o-backdrop</code><br/>
<code>ym-theme-confirm, ym-theme-root, ym-boot, ym-boot-logo, ym-boot-bar, ym-boot-progress</code><br/>
<code>ym-profile-icon, ym-mount-profile, ym-mount-balance</code><br/><br/>

<strong style="color:var(--accent2)">Zones de montage header à styler</strong><br/>
<code>#ym-mount-profile</code> — dropdown sous l'icône profil (left:0)<br/>
<code>#ym-mount-balance</code> — dropdown sous la balance (right:0)<br/>
<code>.ym-mount-tabbar</code> — barre de sous-onglets si plusieurs apps montées`;
}

// ── CHAMPS IA DOC ────────────────────────────────────────
function getAIFieldsDoc() {
  if (mode === 'sphere') return `
Les champs IA sont injectés comme contexte dans le prompt envoyé au modèle. Ils guident la génération :<br/><br/>
<code>@icon</code> — emoji ou URL image pour l'icône dans le browser plug<br/>
<code>@cat</code> — catégorie : social, commerce, jeux, transport, autres…<br/>
<code>@author</code> — votre pseudo ou UUID<br/>
<code>@desc</code> — description courte affichée dans le browser plug<br/><br/>
Ces valeurs seront intégrées automatiquement dans le header du fichier généré.`;

  if (mode === 'app') return `
<code>@icon</code> — emoji affiché dans le menu X<br/>
<code>mountAs</code> — point de montage de l'app :<br/>
&nbsp;&nbsp;<code>pill</code> → pills dans la barre du bas<br/>
&nbsp;&nbsp;<code>balance</code> → zone claimable/non connecté<br/>
&nbsp;&nbsp;<code>profile-icon</code> → icône bonhomme header<br/>
<code>@author</code> — votre pseudo<br/>
<code>@desc</code> — description courte dans le menu X<br/><br/>
Le modèle générera le <code>return { mountAs: '…' }</code> correct automatiquement.`;

  return `
<code>@title</code> — titre affiché dans l'onglet navigateur et le header YourMine quand ce thème est actif<br/>
<code>@bootLogo</code> — texte affiché dans le boot splash (remplace "YourMine")<br/>
<code>@themeColor</code> — couleur de la barre navigateur/système (meta theme-color)<br/>
<code>@author</code> — votre pseudo<br/><br/>
Ces valeurs sont lues par <code>_applyThemeMeta()</code> dans index.html au chargement du thème.`;
}

// ── PLACEHOLDERS ─────────────────────────────────────────
function getPlaceholder() {
  if (mode === 'sphere') return `// @icon 🚀
// @desc Ma sphere personnalisée
// @author votre-pseudo
// @cat social
// @score 0

function init(container) {
  container.innerHTML = \`
    <div style="padding:16px;text-align:center">
      <div style="font-size:32px">🚀</div>
      <div style="font-family:var(--font-display);font-weight:700;color:var(--accent)">Ma Sphere</div>
    </div>
  \`;
}`;

  if (mode === 'app') return `// @icon ⬡
// @desc Mon app personnalisée
// @author votre-pseudo
// @cat custom
// @score 0

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

  function render() {
    const body = $('ym-app-body');
    if (!body) return;
    body.innerHTML = \`
      <div class="ym-panel">
        <div class="ym-panel-title">Mon App</div>
        <p style="color:var(--text2)">Contenu ici…</p>
      </div>
    \`;
  }

  render();
  return { mountAs: 'pill', cleanup: () => {} };

});`;

  return `<!-- Mon Thème YourMine
  @icon 🎨
  @desc Mon thème personnalisé
  @author votre-pseudo
  @cat custom
  @score 0
  @title YourMine
  @bootLogo YourMine
  @themeColor #c8f0a0
-->
<style id="ym-theme-css">
  :root {
    --bg: #050508;
    --accent: #c8f0a0;
    --text: #e8e8f0;
    /* Vos variables CSS ici */
  }
  /* Vos styles ici */
</style>`;
}

// ── EVENTS ───────────────────────────────────────────────
function wireEvents() {
  container.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = () => { mode = btn.dataset.mode; render(); };
  });
  container.querySelectorAll('[data-sub]').forEach(btn => {
    btn.onclick = () => { subMode = btn.dataset.sub; render(); };
  });

  container.querySelector('#builder-ai-provider')?.addEventListener('change', e => { aiProvider = e.target.value; });
  container.querySelector('#builder-ai-key')?.addEventListener('input', e => localStorage.setItem('ym_builder_key', e.target.value));

  // Toggle doc
  container.querySelector('#builder-doc-btn')?.addEventListener('click', () => {
    const p = container.querySelector('#builder-doc-panel');
    if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
  });

  // Toggle champs IA
  container.querySelector('#builder-ai-fields-btn')?.addEventListener('click', () => {
    const p = container.querySelector('#builder-ai-fields-panel');
    if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
  });

  // Clear
  container.querySelector('#builder-clear-btn')?.addEventListener('click', () => {
    if (confirm('Effacer le code ?')) { const ta = container.querySelector('#builder-code'); if (ta) ta.value = ''; }
  });

  container.querySelector('#builder-gen-btn')?.addEventListener('click', generate);
  container.querySelector('#builder-test-btn')?.addEventListener('click', testCode);
  container.querySelector('#builder-save-local-btn')?.addEventListener('click', saveLocal);
  container.querySelector('#builder-publish-btn')?.addEventListener('click', publish);

  container.querySelector('#builder-close-preview')?.addEventListener('click', () => {
    const p = container.querySelector('#builder-preview');
    if (p) { p.style.display = 'none'; p.querySelector('#builder-preview-sandbox').innerHTML = ''; }
  });
}

// ── GENERATE ─────────────────────────────────────────────
async function generate() {
  const key    = (container.querySelector('#builder-ai-key')?.value || localStorage.getItem('ym_builder_key') || '').trim();
  const prompt = container.querySelector('#builder-prompt')?.value?.trim();
  if (!key)    return setStatus('Clé API requise', true);
  if (!prompt) return setStatus('Prompt requis', true);

  // Collecter les champs IA
  const getF = id => container.querySelector('#' + id)?.value?.trim() || '';
  let fieldContext = '';
  if (mode === 'sphere') {
    fieldContext = `Métadonnées à inclure : @icon ${getF('ai-icon')||'◎'} @cat ${getF('ai-cat')||'autres'} @author ${getF('ai-author')||'unknown'} @desc ${getF('ai-desc')||''}`;
  } else if (mode === 'app') {
    fieldContext = `Métadonnées : @icon ${getF('ai-icon')||'⬡'} @author ${getF('ai-author')||'unknown'} @desc ${getF('ai-desc')||''}. mountAs: ${container.querySelector('#ai-mount')?.value||'pill'}`;
  } else {
    fieldContext = `Métadonnées thème : @title ${getF('ai-title')||'YourMine'} @bootLogo ${getF('ai-bootLogo')||'YourMine'} @themeColor ${getF('ai-themeColor')||'#c8f0a0'} @author ${getF('ai-author')||'unknown'}`;
  }

  const systemPrompts = {
    sphere: `Tu es expert en création de Spheres pour YourMine. Une sphere est un fichier JS avec function init(container){}.
Variables disponibles: window.YM, window.REPO_RAW, window.fetchText, window.fetchJSON, window.el, window.YM_addSphereTab, window.YM_updateBalance.
Classes CSS disponibles: ym-panel, ym-btn, ym-btn-accent, ym-input, ym-notice, ym-loading, ym-card, ym-chip, ym-tabs, ym-tab, ym-stat-row.
Génère UNIQUEMENT le code JS sans markdown ni explication.`,

    app: `Tu es expert en création d'Apps pour YourMine. Une app est une IIFE (function(YM,$,el,fetchText,fetchJSON,REPO_RAW,REPO_API){}).
Le return final DOIT inclure mountAs ('pill', 'balance', ou 'profile-icon') et cleanup.
$('ym-app-body') = container principal de l'app.
IDs protégés à ne jamais toucher: ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-btn-x, ym-btn-o, ym-profile-icon, ym-mount-profile, ym-mount-balance.
Classes CSS disponibles: ym-panel, ym-btn, ym-btn-accent, ym-input, ym-notice, ym-loading, ym-card, ym-chip.
Génère UNIQUEMENT le code JS sans markdown.`,

    theme: `Tu es expert en design CSS pour YourMine. Un thème est un fichier HTML avec <style id="ym-theme-css"> et optionnellement <script>.
IDs PROTÉGÉS à ne JAMAIS supprimer: ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-app-frames, ym-btn-x, ym-btn-o, ym-bottombar, ym-tabs-zone, ym-x-menu, ym-o-menu, ym-theme-confirm, ym-theme-root, ym-boot, ym-boot-logo, ym-boot-bar, ym-boot-progress, ym-profile-icon, ym-mount-profile, ym-mount-balance.
Variables CSS requises: --bg, --bg2, --bg3, --surface, --surface2, --border, --border2, --accent, --accent2, --accent3, --text, --text2, --text3, --danger, --gold, --r, --r2, --r3, --transition, --font-display, --font-mono.
Génère UNIQUEMENT le HTML+CSS du thème sans markdown.`
  };

  setStatus('Génération en cours…');
  const btn = container.querySelector('#builder-gen-btn');
  btn.disabled = true;

  try {
    const prov = container.querySelector('#builder-ai-provider')?.value || aiProvider;
    const userMsg = `${fieldContext}\n\n${prompt}`;
    let code = '';

    if (prov === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: systemPrompts[mode], messages: [{ role: 'user', content: userMsg }] })
      });
      const d = await r.json();
      code = d.content?.[0]?.text || d.error?.message || 'Erreur';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompts[mode] }, { role: 'user', content: userMsg }] })
      });
      const d = await r.json();
      code = d.choices?.[0]?.message?.content || d.error?.message || 'Erreur';
    }

    code = code.replace(/```(?:javascript|js|html|css)?\n?/g, '').replace(/```/g, '').trim();
    const ta = container.querySelector('#builder-code');
    if (ta) ta.value = code;
    setStatus('✓ Code généré');
  } catch(e) {
    setStatus('Erreur: ' + e.message, true);
  }
  btn.disabled = false;
}

// ── TEST ─────────────────────────────────────────────────
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
    } else if (mode === 'app') {
      // Test l'app dans le sandbox
      const fn = (0, eval)('(' + code.trimEnd().replace(/;+$/, '') + ')');
      sandbox.id = 'ym-app-body'; // temporaire
      fn(YM, id => id === 'ym-app-body' ? sandbox : document.getElementById(id), window.el || ((t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e;}), ft, fj, REPO_RAW, REPO_API);
      sandbox.id = '';
    } else {
      const root = document.getElementById('ym-theme-root');
      if (root) root.innerHTML = code;
      sandbox.innerHTML = '<div class="ym-notice success"><span>Thème appliqué en aperçu.</span></div>';
    }
    setStatus('✓ Test OK');
  } catch(e) {
    sandbox.innerHTML = `<div class="ym-notice error"><span>Erreur: ${e.message}</span></div>`;
    setStatus('Erreur: ' + e.message, true);
  }
}

// ── SAVE LOCAL ───────────────────────────────────────────
function saveLocal() {
  const code = container.querySelector('#builder-code')?.value?.trim();
  if (!code) return setStatus('Aucun code', true);
  const name = container.querySelector('#builder-name')?.value?.trim() || (mode + '-' + Date.now());

  if (mode === 'sphere') {
    const cat = container.querySelector('#builder-cat')?.value?.trim() || 'autres';
    const list = JSON.parse(localStorage.getItem('ym_local_spheres') || '[]');
    const i = list.findIndex(s => s.name === name);
    const entry = { name, cat, code, _local: true };
    if (i >= 0) list[i] = entry; else list.push(entry);
    localStorage.setItem('ym_local_spheres', JSON.stringify(list));
  } else if (mode === 'app') {
    const list = JSON.parse(localStorage.getItem('ym_local_apps') || '[]');
    const i = list.findIndex(a => a.name === name);
    const entry = { name, code, _local: true };
    if (i >= 0) list[i] = entry; else list.push(entry);
    localStorage.setItem('ym_local_apps', JSON.stringify(list));
  } else {
    const list = JSON.parse(localStorage.getItem('ym_local_themes') || '[]');
    const i = list.findIndex(t => t.name === name);
    const entry = { name, code };
    if (i >= 0) list[i] = entry; else list.push(entry);
    localStorage.setItem('ym_local_themes', JSON.stringify(list));
  }
  setStatus(`✓ "${name}" sauvegardé localement`);
}

// ── PUBLISH ──────────────────────────────────────────────
async function publish() {
  const code  = container.querySelector('#builder-code')?.value?.trim();
  const token = localStorage.getItem('ym_gh_token') || prompt('Token GitHub (Contents: Write) :');
  if (!code)  return setStatus('Aucun code', true);
  if (!token) return;
  localStorage.setItem('ym_gh_token', token);

  const name = container.querySelector('#builder-name')?.value?.trim();
  if (!name) return setStatus('Nom requis', true);

  const ext = mode === 'sphere' ? '.sphere.js' : mode === 'app' ? '.app.js' : '.theme.html';
  const filename = name + ext;

  setStatus('Publication…');
  try {
    const existing = await fj(REPO_API).catch(() => []);
    if (Array.isArray(existing) && existing.find(f => f.name === filename)) {
      return setStatus(`⚠ "${filename}" existe déjà dans le repo`, true);
    }
    const content = btoa(unescape(encodeURIComponent(code)));
    const r = await fetch(`https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/${filename}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Add ${filename}`, content })
    });
    if (r.status === 201) {
      setStatus(`✓ "${filename}" publié !`);
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
