// ════════════════════════════════════════════════════════
//  plug.app.js
//  @icon ◎
//  @desc Browser et gestionnaire de Spheres
//  @author YourMine
//  @cat core
//  @score 100
// ════════════════════════════════════════════════════════

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

const CATEGORIES = ['Autres', 'Commerce', 'Social', 'Transport', 'Jeux'];
const FILTERS    = ['browser', 'créateur', 'testeur', 'actifs', 'url'];

let allSpheres   = [];
let activeCategory = 'all';
let activeFilter   = 'browser';
let searchQuery    = '';

// ── RENDER ROOT ──────────────────────────────────────────
function render() {
  const body = $('ym-app-body');
  if (!body) return;

  body.innerHTML = `
  <div class="ym-panel ym-stagger">

    <!-- Onglets principaux -->
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px" id="plug-filter-tabs">
      ${FILTERS.map(f => `
        <button class="ym-cat-btn${f===activeFilter?' active':''}" data-filter="${f}" style="text-transform:capitalize">
          ${f === 'actifs' ? '⚡ Actifs' : f === 'url' ? '🔗 URL' : f}
        </button>`).join('')}
    </div>

    <!-- Panneau Browser / Créateur / Testeur -->
    <div id="plug-browse-panel" style="${['browser','créateur','testeur'].includes(activeFilter)?'':'display:none'}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div class="ym-search-wrap" style="flex:1;min-width:180px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input class="ym-input" id="plug-search" placeholder="Rechercher une sphere…" value="${searchQuery}"/>
        </div>
      </div>
      <div class="ym-cat-filter" id="plug-cats">
        <button class="ym-cat-btn${activeCategory==='all'?' active':''}" data-cat="all">Toutes</button>
        ${CATEGORIES.map(c=>`<button class="ym-cat-btn${activeCategory===c?' active':''}" data-cat="${c}">${c}</button>`).join('')}
      </div>
      <div id="plug-sphere-list" class="ym-stagger" style="display:flex;flex-direction:column;gap:4px;max-height:55dvh;overflow-y:auto;padding-right:4px;margin-top:10px"></div>
    </div>

    <!-- Panneau Actifs -->
    <div id="plug-actifs-panel" style="${activeFilter==='actifs'?'':'display:none'}">
      ${renderActifsHTML()}
    </div>

    <!-- Panneau URL -->
    <div id="plug-url-panel" style="${activeFilter==='url'?'':'display:none'}">
      ${renderURLHTML()}
    </div>

  </div>`;

  wireEvents();
  if (['browser','créateur','testeur'].includes(activeFilter)) {
    loadSpheres();
  }
}

// ── ACTIFS ────────────────────────────────────────────────
function renderActifsHTML() {
  const tabs = YM.sphereTabs || [];
  if (!tabs.length) return `
    <div style="color:var(--text3);font-size:11px;padding:16px 0;text-align:center">
      Aucune sphere active. Ouvre-en une depuis le Browser.
    </div>`;

  return tabs.map(tab => {
    const sp = allSpheres.find(s => s.name === tab.name) || {};
    const info = sp.info || {};
    return `
    <div class="ym-sphere-item active" data-active-sphere="${tab.name}" style="cursor:pointer">
      <div class="ym-sphere-icon">${info.icon || '◎'}</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-family:var(--font-display);font-size:13px;font-weight:600">${tab.name}</div>
        <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${info.desc || tab.url}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="ym-chip accent">actif</span>
        <button class="ym-btn ym-btn-ghost" data-deactivate="${tab.name}" style="font-size:10px;padding:4px 10px;color:var(--danger)">✕ Désactiver</button>
      </div>
    </div>`;
  }).join('');
}

// ── URL ───────────────────────────────────────────────────
function renderURLHTML() {
  const saved = JSON.parse(localStorage.getItem('ym_url_spheres') || '[]');
  return `
  <div style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:11px;color:var(--text2);line-height:1.6">
      Collez l'URL d'un fichier <code>.sphere.js</code> ou <code>.app.js</code> pour l'activer directement.
    </div>
    <div style="display:flex;gap:8px">
      <input class="ym-input" id="plug-url-input" placeholder="https://…/ma-sphere.sphere.js" style="flex:1"/>
      <input class="ym-input" id="plug-url-name"  placeholder="Nom (optionnel)" style="width:120px"/>
    </div>
    <button class="ym-btn ym-btn-accent" id="plug-url-activate">▶ Activer</button>
    <div id="plug-url-status"></div>

    ${saved.length ? `
      <div style="margin-top:8px">
        <div class="ym-panel-title">Récents</div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
          ${saved.map((s,i) => `
            <div class="ym-sphere-item" style="cursor:pointer">
              <div class="ym-sphere-icon" style="font-size:12px">🔗</div>
              <div style="flex:1;overflow:hidden">
                <div style="font-size:12px;font-weight:600;font-family:var(--font-display)">${s.name}</div>
                <div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.url}</div>
              </div>
              <div style="display:flex;gap:4px">
                <button class="ym-btn" data-url-open="${i}" style="font-size:10px;padding:4px 8px">▶</button>
                <button class="ym-btn ym-btn-ghost" data-url-del="${i}" style="font-size:10px;padding:4px 8px;color:var(--danger)">✕</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
  </div>`;
}

// ── WIRE EVENTS ───────────────────────────────────────────
function wireEvents() {
  // Onglets
  $('ym-app-body').querySelector('#plug-filter-tabs')?.querySelectorAll('[data-filter]').forEach(btn => {
    btn.onclick = () => {
      activeFilter = btn.dataset.filter;
      render();
    };
  });

  // Search
  $('plug-search')?.addEventListener('input', e => { searchQuery = e.target.value; renderSphereList(); });

  // Catégories
  $('ym-app-body').querySelector('#plug-cats')?.querySelectorAll('[data-cat]').forEach(btn => {
    btn.onclick = () => {
      activeCategory = btn.dataset.cat;
      $('ym-app-body').querySelector('#plug-cats').querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat === activeCategory));
      renderSphereList();
    };
  });

  // Actifs — clic sur sphere → ouvrir ; bouton désactiver
  $('ym-app-body').querySelector('#plug-actifs-panel')?.querySelectorAll('[data-active-sphere]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('[data-deactivate]')) return;
      const name = row.dataset.activeSphere;
      const tab = (YM.sphereTabs||[]).find(t=>t.name===name);
      if (tab) window.YM_addSphereTab?.(tab.name, tab.url, true);
    };
  });
  $('ym-app-body').querySelector('#plug-actifs-panel')?.querySelectorAll('[data-deactivate]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      window.YM_removeSphereTab?.(btn.dataset.deactivate);
      render();
    };
  });

  // URL — activer
  $('plug-url-activate')?.addEventListener('click', activateFromURL);

  // URL — récents : ouvrir
  $('ym-app-body').querySelector('#plug-url-panel')?.querySelectorAll('[data-url-open]').forEach(btn => {
    btn.onclick = () => {
      const saved = JSON.parse(localStorage.getItem('ym_url_spheres')||'[]');
      const entry = saved[parseInt(btn.dataset.urlOpen)];
      if (entry) openSphereOrApp(entry.name, entry.url);
    };
  });

  // URL — récents : supprimer
  $('ym-app-body').querySelector('#plug-url-panel')?.querySelectorAll('[data-url-del]').forEach(btn => {
    btn.onclick = () => {
      const saved = JSON.parse(localStorage.getItem('ym_url_spheres')||'[]');
      saved.splice(parseInt(btn.dataset.urlDel), 1);
      localStorage.setItem('ym_url_spheres', JSON.stringify(saved));
      render();
    };
  });
}

async function activateFromURL() {
  const urlInput  = $('plug-url-input');
  const nameInput = $('plug-url-name');
  const statusEl  = $('plug-url-status');
  const url = urlInput?.value?.trim();
  if (!url) { showURLStatus('URL requise', true); return; }

  showURLStatus('Vérification…');
  try {
    // Déterminer le nom
    const baseName = nameInput?.value?.trim() || url.split('/').pop().replace(/\.(sphere|app)\.js$/,'').replace(/\.theme\.html$/,'');
    // Tester que le fichier est accessible
    const code = await fetchText(url);
    if (!code || code.length < 10) throw new Error('Fichier vide ou inaccessible');

    openSphereOrApp(baseName, url);

    // Sauvegarder dans récents
    const saved = JSON.parse(localStorage.getItem('ym_url_spheres')||'[]');
    if (!saved.find(s=>s.url===url)) {
      saved.unshift({ name: baseName, url });
      if (saved.length > 10) saved.pop();
      localStorage.setItem('ym_url_spheres', JSON.stringify(saved));
    }
    showURLStatus(`✓ "${baseName}" activé`);
    if (urlInput) urlInput.value = '';
    if (nameInput) nameInput.value = '';
    setTimeout(() => render(), 1200);
  } catch(e) {
    showURLStatus('Erreur : ' + e.message, true);
  }
}

function openSphereOrApp(name, url) {
  // Sphere .sphere.js → tab sphere
  if (url.endsWith('.sphere.js')) {
    window.YM_addSphereTab?.(name, url, true);
    return;
  }
  // App .app.js → tenter de l'ajouter à YM.apps et l'ouvrir
  if (url.endsWith('.app.js')) {
    if (!YM.apps.find(a=>a.name===name)) {
      YM.apps.push({ name, url, info: {}, _local: true });
    }
    // openApp est défini dans index.html
    window.YM?.openApp?.(name) || window.dispatchEvent(new CustomEvent('ym:openapp', {detail:{name,url}}));
    return;
  }
  // Fallback : traiter comme sphere
  window.YM_addSphereTab?.(name, url, true);
}

function showURLStatus(msg, isError=false) {
  const s = $('plug-url-status');
  if (!s) return;
  s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
}

// ── LOAD SPHERES ──────────────────────────────────────────
async function loadSpheres() {
  const listEl = $('plug-sphere-list');
  if (!listEl) return;

  if (YM.spheres && YM.spheres.length) {
    allSpheres = YM.spheres.map(s => ({
      name: s.name, cat: s.cat || 'autres', url: s.url, info: s.info || null
    }));
    renderSphereList();
    allSpheres.forEach(async sp => {
      if (sp.info && Object.keys(sp.info).length) return; // déjà chargé
      try {
        const code = await fetchText(sp.url);
        sp.info = extractSphereInfo(code);
        const item = document.querySelector(`[data-sphere="${sp.name}"]`);
        if (item) updateSphereItemUI(item, sp);
      } catch {}
    });
    return;
  }

  listEl.innerHTML = `<div style="display:flex;gap:8px;align-items:center;color:var(--text3);padding:12px 0"><div class="ym-loading"></div><span>Chargement…</span></div>`;
  try {
    const files = await fetchJSON(REPO_API);
    const sphereFiles = files.filter(f => f.name.endsWith('.sphere.js'));
    allSpheres = sphereFiles.map(f => {
      const base = f.name.replace('.sphere.js','');
      return { name: base, cat: 'autres', url: REPO_RAW + f.name, info: null };
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
  } catch {
    allSpheres = [
      { name: 'builder', cat: 'builder', url: REPO_RAW+'builder.sphere.js', info: { icon: '🔨', desc: 'Builder IA — Créez Spheres, Thèmes et Apps' } },
      { name: 'search',  cat: 'search',  url: REPO_RAW+'search.sphere.js',  info: { icon: '🔍', desc: 'Recherche globale dans vos spheres et apps' } },
    ];
    renderSphereList();
  }
}

function extractSphereInfo(code) {
  const info = {};
  // Support @tag dans les commentaires // ou /* */
  const get = tag => { const m = code.match(new RegExp('@'+tag+'\\s+(.+)')); return m ? m[1].trim() : null; };
  info.icon   = get('icon')   || '◎';
  info.desc   = get('desc')   || '';
  info.cat    = get('cat')    || 'autres';
  info.author = get('author') || '';
  info.score  = parseFloat(get('score') || '0') || 0;
  info.imgUrl = get('imgUrl') || '';
  return info;
}

function renderSphereList() {
  const listEl = $('plug-sphere-list');
  if (!listEl) return;

  let spheres = allSpheres;

  if (activeFilter === 'créateur') {
    const local = JSON.parse(localStorage.getItem('ym_local_spheres')||'[]');
    spheres = local.map(s => ({ name: s.name, cat: s.cat||'autres', url: null, info: { icon: '🔨', desc: 'Local' }, _local: true, code: s.code }));
  } else if (activeFilter === 'testeur') {
    const local = JSON.parse(localStorage.getItem('ym_tester_spheres')||'[]');
    spheres = local.map(s => ({ name: s.name, cat: 'testeur', url: null, info: { icon: '🧪', desc: 'En test' }, _tester: true, code: s.code }));
  }

  if (activeCategory !== 'all') {
    spheres = spheres.filter(s => (s.info?.cat||s.cat||'').toLowerCase() === activeCategory.toLowerCase());
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    spheres = spheres.filter(s => s.name.toLowerCase().includes(q) || s.info?.desc?.toLowerCase().includes(q));
  }

  listEl.innerHTML = '';
  if (!spheres.length) {
    listEl.innerHTML = `<div style="padding:20px 0;color:var(--text3);text-align:center;font-size:11px">Aucune sphere trouvée</div>`;
    return;
  }

  spheres.sort((a,b) => (b.info?.score||0) - (a.info?.score||0));
  spheres.forEach(sp => listEl.appendChild(buildSphereItem(sp)));
}

function buildSphereItem(sp) {
  const isActive = YM.sphereTabs?.some(t => t.name === sp.name);
  const info   = sp.info || {};
  const icon   = info.imgUrl
    ? `<img src="${info.imgUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`
    : (info.icon || '◎');

  const div = el('div', `ym-sphere-item${isActive?' active':''}`, `
    <div class="ym-sphere-icon">${icon}</div>
    <div style="flex:1;overflow:hidden">
      <div style="font-family:var(--font-display);font-size:13px;font-weight:600">${sp.name}</div>
      ${info.desc ? `<div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${info.desc}</div>` : ''}
      ${info.author ? `<div style="font-size:9px;color:var(--text3);opacity:.7">by ${info.author}</div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      ${info.score ? `<span class="ym-chip gold">★ ${info.score}</span>` : ''}
      ${isActive ? `<span class="ym-chip accent">actif</span>` : ''}
    </div>
  `);
  div.dataset.sphere = sp.name;
  div.onclick = () => {
    if (isActive) {
      // Reclique = désactiver
      window.YM_removeSphereTab?.(sp.name);
      renderSphereList();
    } else {
      window.YM_addSphereTab?.(sp.name, sp.url, false);
      renderSphereList();
    }
  };
  return div;
}

function updateSphereItemUI(itemEl, sp) {
  const icon = sp.info?.imgUrl
    ? `<img src="${sp.info.imgUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`
    : (sp.info?.icon || '◎');
  const iconEl = itemEl.querySelector('.ym-sphere-icon');
  if (iconEl) iconEl.innerHTML = icon;
}

// ── INIT ──────────────────────────────────────────────────
render();

return { mountAs: 'pill', cleanup: () => {} };

});
