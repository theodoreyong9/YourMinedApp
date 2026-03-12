// ════════════════════════════════════════════════════════
//  plug.app.js — YourMine Sphere Browser & Manager
//  Injecte dans #ym-app-body
// ════════════════════════════════════════════════════════

(function() {
const _name = 'plug';
const _container = (window._YM_CONTAINERS || {})[_name];
const YM = window.YM;
const $ = id => id === 'ym-app-body' ? _container : document.getElementById(id);
const el = window.el;
const fetchText = window.fetchText;
const fetchJSON = window.fetchJSON;
const REPO_RAW = window.REPO_RAW;
const REPO_API = window.REPO_API;

const CATEGORIES = ['Autres', 'Commerce', 'Social', 'Transport', 'Jeux'];
const SPHERE_FILTERS = ['browser', 'créateur', 'testeur'];

let allSpheres = [];
let activeCategory = 'all';
let activeFilter   = 'browser';
let searchQuery    = '';

// ── RENDER ROOT ──────────────────────────────────────────
function render() {
  const body = $('ym-app-body');
  if (!body) return;

  body.innerHTML = `
  <div class="ym-panel ym-stagger">

    <!-- Top: search + filter type -->
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div class="ym-search-wrap" style="flex:1;min-width:180px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input class="ym-input" id="plug-search" placeholder="Rechercher une sphere…" value="${searchQuery}"/>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0" id="plug-filter-tabs">
        ${SPHERE_FILTERS.map(f => `<button class="ym-cat-btn${f===activeFilter?' active':''}" data-filter="${f}">${f}</button>`).join('')}
      </div>
    </div>

    <!-- Category row -->
    <div class="ym-cat-filter" id="plug-cats">
      <button class="ym-cat-btn${activeCategory==='all'?' active':''}" data-cat="all">Toutes</button>
      ${CATEGORIES.map(c=>`<button class="ym-cat-btn${activeCategory===c?' active':''}" data-cat="${c}">${c}</button>`).join('')}
    </div>

    <!-- Sphere list -->
    <div id="plug-sphere-list" class="ym-stagger" style="display:flex;flex-direction:column;gap:4px;max-height:40dvh;overflow-y:auto;padding-right:4px"></div>

  </div>

  <!-- Sphere content area -->
  <div id="ym-sphere-content" class="ym-panel" style="min-height:220px;flex:1;align-items:center;justify-content:center;display:flex">
    <span style="color:var(--text3);font-size:11px;letter-spacing:1.5px;text-transform:uppercase">Sélectionner une sphere</span>
  </div>

  <!-- My spheres -->
  <div class="ym-panel" id="plug-my-spheres-panel">
    <div class="ym-panel-title">Mes Spheres</div>
    <div id="plug-my-spheres" style="display:flex;flex-direction:column;gap:4px"></div>
  </div>
  `;

  // Wire search
  $('plug-search').oninput = e => { searchQuery = e.target.value; renderSphereList(); };

  // Wire filter tabs
  $('plug-filter-tabs').querySelectorAll('[data-filter]').forEach(btn => {
    btn.onclick = () => {
      activeFilter = btn.dataset.filter;
      $('plug-filter-tabs').querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === activeFilter));
      renderSphereList();
    };
  });

  // Wire category buttons
  $('plug-cats').querySelectorAll('[data-cat]').forEach(btn => {
    btn.onclick = () => {
      activeCategory = btn.dataset.cat;
      $('plug-cats').querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat === activeCategory));
      renderSphereList();
    };
  });

  loadSpheres();
  renderMySpheres();
}

// ── LOAD SPHERES FROM REPO ────────────────────────────────
async function loadSpheres() {
  const listEl = $('plug-sphere-list');
  if (!listEl) return;

  // Utilise YM.spheres déjà chargé par index.html — pas de double appel GitHub
  if (YM.spheres && YM.spheres.length) {
    allSpheres = YM.spheres.map(s => ({
      name: s.name, cat: s.cat || 'autres', url: s.url, info: null
    }));
    renderSphereList();
    // Charge les métadonnées de chaque sphere en arrière-plan
    allSpheres.forEach(async sp => {
      try {
        const code = await fetchText(sp.url);
        sp.info = extractSphereInfo(code);
        const item = document.querySelector(`[data-sphere="${sp.name}"]`);
        if (item) updateSphereItemUI(item, sp);
      } catch {}
    });
    return;
  }

  // Fallback : YM.spheres vide, on essaie l'API directement
  listEl.innerHTML = `<div style="display:flex;gap:8px;align-items:center;color:var(--text3);padding:12px 0"><div class="ym-loading"></div><span>Chargement des spheres…</span></div>`;
  try {
    const files = await fetchJSON(REPO_API);
    const sphereFiles = files.filter(f => f.name.endsWith('.sphere.js'));
    allSpheres = sphereFiles.map(f => {
      const base  = f.name.replace('.sphere.js', '');
      const parts = base.split('.');
      const name  = parts.length >= 2 ? parts.slice(1).join('.') : parts[0];
      const cat   = parts.length >= 2 ? parts[0] : 'autres';
      return { name, cat, url: REPO_RAW + f.name, info: null };
    });
    renderSphereList();
    allSpheres.forEach(async sp => {
      try {
        const code = await fetchText(sp.url);
        sp.info = extractSphereInfo(code);
        const item = document.querySelector(`[data-sphere="${sp.name}"]`);
        if (item) updateSphereItemUI(item, sp);
      } catch {}
    });
  } catch(e) {
    // Fallback hardcoded
    allSpheres = [
      { name: 'builder', cat: 'builder', url: REPO_RAW + 'builder.sphere.js', info: { icon: '🔨', desc: 'Créez et publiez des Spheres et Thèmes' } },
      { name: 'social',  cat: 'social',  url: REPO_RAW + 'social.sphere.js',  info: { icon: '📡', desc: 'Near • Contact • Feed' } },
    ];
    renderSphereList();
  }
}

function extractSphereInfo(code) {
  const info = {};
  const meta = code.match(/\/\*\s*@sphere\s+([\s\S]*?)\*\//);
  if (meta) {
    const block = meta[1];
    info.icon    = (block.match(/@icon\s+(.+)/)  || [])[1]?.trim();
    info.desc    = (block.match(/@desc\s+(.+)/)  || [])[1]?.trim();
    info.cat     = (block.match(/@cat\s+(.+)/)   || [])[1]?.trim();
    info.web     = (block.match(/@web\s+(.+)/)   || [])[1]?.trim();
    info.author  = (block.match(/@author\s+(.+)/)|| [])[1]?.trim();
    info.uuid    = (block.match(/@uuid\s+(.+)/)  || [])[1]?.trim();
    info.score   = parseFloat((block.match(/@score\s+([\d.]+)/)|| [])[1]) || 0;
    info.imgUrl  = (block.match(/@img\s+(.+)/)   || [])[1]?.trim();
  }
  return info;
}

// ── RENDER SPHERE LIST ────────────────────────────────────
function renderSphereList() {
  const listEl = $('plug-sphere-list');
  if (!listEl) return;

  let spheres = allSpheres;

  // Filter by type
  if (activeFilter === 'browser') {
    spheres = spheres.filter(s => s.cat === 'browser' || !s.cat);
  } else if (activeFilter === 'créateur') {
    const myCreator = JSON.parse(localStorage.getItem('ym_creator_spheres') || '[]');
    spheres = myCreator.map(s => ({ ...s, _own: true }));
  } else if (activeFilter === 'testeur') {
    const myTester = JSON.parse(localStorage.getItem('ym_tester_spheres') || '[]');
    spheres = myTester.map(s => ({ ...s, _own: true, _tester: true }));
  }

  // Filter by category
  if (activeCategory !== 'all') {
    spheres = spheres.filter(s => s.cat?.toLowerCase() === activeCategory.toLowerCase() || (s.info?.cat?.toLowerCase() === activeCategory.toLowerCase()));
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    spheres = spheres.filter(s => s.name.toLowerCase().includes(q) || s.info?.desc?.toLowerCase().includes(q));
  }

  listEl.innerHTML = '';
  if (!spheres.length) {
    listEl.innerHTML = `<div style="padding:20px 0;color:var(--text3);text-align:center;font-size:11px">Aucune sphere trouvée</div>`;
    return;
  }

  // Sort by score desc
  spheres.sort((a, b) => (b.info?.score || 0) - (a.info?.score || 0));

  spheres.forEach(sp => {
    const item = buildSphereItem(sp);
    listEl.appendChild(item);
  });
}

function buildSphereItem(sp) {
  const icon = sp.info?.icon || sp.info?.imgUrl || '◎';
  const desc = sp.info?.desc || '';
  const isActive = YM.sphereTabs?.some(t => t.name === sp.name);

  const div = el('div', `ym-sphere-item${isActive?' active':''}`, `
    <div class="ym-sphere-icon">${icon.startsWith('http') ? `<img src="${icon}" alt=""/>` : icon}</div>
    <div style="flex:1;overflow:hidden">
      <div style="font-family:var(--font-display);font-size:13px;font-weight:600">${sp.name}</div>
      ${desc ? `<div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${desc}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      ${sp.info?.score ? `<span class="ym-chip gold">${sp.info.score.toFixed(0)}</span>` : ''}
      ${isActive ? `<span class="ym-chip accent">actif</span>` : ''}
    </div>
  `);
  div.dataset.sphere = sp.name;

  div.onclick = () => activateSphere(sp);
  return div;
}

function updateSphereItemUI(itemEl, sp) {
  const icon = sp.info?.icon || sp.info?.imgUrl || '◎';
  const desc = sp.info?.desc || '';
  itemEl.querySelector('.ym-sphere-icon').innerHTML = icon.startsWith('http') ? `<img src="${icon}" alt=""/>` : icon;
}

// ── ACTIVATE SPHERE ────────────────────────────────────────
async function activateSphere(sp) {
  // Move to sphere tab
  window.YM_addSphereTab?.(sp.name, () => openSphereContent(sp));
  // Remove from list visually
  renderSphereList();
  // Open content immediately
  openSphereContent(sp);
}

async function openSphereContent(sp) {
  const area = $('ym-sphere-content');
  if (!area) return;
  area.innerHTML = `<div style="display:flex;gap:8px;align-items:center;color:var(--text3)"><div class="ym-loading"></div><span>Chargement ${sp.name}…</span></div>`;
  try {
    const code = await fetchText(sp.url);
    // Each sphere gets its own sandboxed div
    area.innerHTML = `<div id="sphere-sandbox-${sp.name}" style="width:100%;min-height:180px"></div>`;
    const sandbox = document.getElementById(`sphere-sandbox-${sp.name}`);
    const fn = new Function('YM','$','el','fetchText','fetchJSON','REPO_RAW','REPO_API','container', code + '\n;if(typeof init==="function")init(container);');
    fn(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API, sandbox);
  } catch(err) {
    area.innerHTML = `<div class="ym-notice error" style="width:100%"><span>Erreur sphere: ${err.message}</span></div>`;
  }
}

// ── MY SPHERES ─────────────────────────────────────────────
function renderMySpheres() {
  const panel = $('plug-my-spheres');
  if (!panel) return;

  const creatorSpheres = JSON.parse(localStorage.getItem('ym_creator_spheres') || '[]');
  const testerSpheres  = JSON.parse(localStorage.getItem('ym_tester_spheres') || '[]');
  const repoSpheres    = allSpheres.filter(() => false); // loaded from repo, shown in list

  if (!creatorSpheres.length && !testerSpheres.length) {
    panel.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:8px 0">Aucune sphere personnelle. Utilisez le Builder pour en créer.</div>`;
    return;
  }

  panel.innerHTML = '';
  [...creatorSpheres.map(s=>({...s,_type:'créateur'})), ...testerSpheres.map(s=>({...s,_type:'testeur'}))]
    .forEach(sp => {
      const row = el('div', 'ym-sphere-item', `
        <div class="ym-sphere-icon">◎</div>
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600">${sp.name}</div>
          <div style="font-size:10px;color:var(--text3)">${sp._type}</div>
        </div>
        <span class="ym-chip ${sp._type==='créateur'?'accent':'blue'}">${sp._type}</span>
      `);
      row.onclick = () => activateSphere(sp);
      panel.appendChild(row);
    });
}

// ── INIT ──────────────────────────────────────────────────
render();

// Return cleanup
return { cleanup: () => {} };

})();
