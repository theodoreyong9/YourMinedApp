// ════════════════════════════════════════════════════════
//  search.sphere.js — YourMine Search
//  @icon 🔍
//  @desc Recherche globale dans vos spheres, apps et contenus reçus
//  @author YourMine
//  @cat core
//  @score 95
// ════════════════════════════════════════════════════════

function init(container) {

const YM       = window.YM       || {};
const REPO_RAW = window.REPO_RAW || 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/';
const ft       = window.fetchText|| (url => fetch(url).then(r=>r.text()));

// ── ÉTAT ─────────────────────────────────────────────────
let query      = '';
let results    = [];        // [{id, type, title, excerpt, url, meta, _source}]
let selected   = new Set(); // ids sélectionnés
let aiPanel    = false;
let aiLoading  = false;
let aiResponse = '';

// ── INDEX DES SOURCES ────────────────────────────────────
// On indexe :
//   1. Spheres et apps installées (méta + code partiel)
//   2. Contenus reçus via window.YM_SEARCH_INDEX (APIs tierces)
//   3. Contacts, profil, near cache P2P
//   4. localStorage connu (gist, open apps…)

function buildIndex() {
  const idx = [];

  // 1. Apps
  (YM.apps || []).forEach(app => {
    const info = app.info || {};
    idx.push({
      id:      'app:' + app.name,
      type:    'app',
      title:   app.name + '.app.js',
      excerpt: info.desc || app.url,
      url:     app.url,
      meta:    { icon: info.icon||'⬡', author: info.author||'', cat: 'app', mountAs: app._mountAs||'pill' },
      _source: app,
    });
  });

  // 2. Spheres
  (YM.spheres || []).forEach(sp => {
    const info = sp.info || {};
    idx.push({
      id:      'sphere:' + sp.name,
      type:    'sphere',
      title:   sp.name + '.sphere.js',
      excerpt: info.desc || sp.url,
      url:     sp.url,
      meta:    { icon: info.icon||'◎', author: info.author||'', cat: info.cat||'autres' },
      _source: sp,
    });
  });

  // 3. Themes
  (YM.themes || []).forEach(t => {
    const info = t.info || {};
    idx.push({
      id:      'theme:' + t.name,
      type:    'theme',
      title:   t.name + '.theme.html',
      excerpt: info.desc || t.url,
      url:     t.url,
      meta:    { icon: '🎨', author: info.author||'' },
      _source: t,
    });
  });

  // 4. Contacts
  (YM.contacts || []).forEach(c => {
    idx.push({
      id:      'contact:' + c.uuid,
      type:    'contact',
      title:   c.name || c.uuid.slice(0,12),
      excerpt: c.socialHandle ? '@'+c.socialHandle : c.uuid,
      url:     null,
      meta:    { icon: '👤', cat: 'contact' },
      _source: c,
    });
  });

  // 5. Near cache P2P
  try {
    const near = JSON.parse(sessionStorage.getItem('ym_near_cache') || '{}');
    Object.values(near).forEach(p => {
      if (!p.name && !p.uuid) return;
      idx.push({
        id:      'near:' + (p.uuid||p._peer),
        type:    'near',
        title:   p.name || ('Peer ' + (p._peer||'').slice(0,8)),
        excerpt: p.bio || (p.socialHandle ? '@'+p.socialHandle : 'Peer P2P'),
        url:     null,
        meta:    { icon: '📡', cat: 'near', ts: p._ts },
        _source: p,
      });
    });
  } catch {}

  // 6. URL spheres sauvegardées
  try {
    const urls = JSON.parse(localStorage.getItem('ym_url_spheres') || '[]');
    urls.forEach(u => {
      idx.push({
        id:      'url:' + u.url,
        type:    'url',
        title:   u.name,
        excerpt: u.url,
        url:     u.url,
        meta:    { icon: '🔗', cat: 'url' },
        _source: u,
      });
    });
  } catch {}

  // 7. Index externe — les spheres/apps peuvent pousser leurs données ici :
  //    window.YM_SEARCH_INDEX = [{id, type, title, excerpt, url, meta}]
  if (Array.isArray(window.YM_SEARCH_INDEX)) {
    window.YM_SEARCH_INDEX.forEach(item => {
      idx.push({ ...item, _external: true });
    });
  }

  return idx;
}

function search(q) {
  if (!q || q.trim().length < 2) return [];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const idx   = buildIndex();
  const scored = idx.map(item => {
    const haystack = [item.title, item.excerpt, item.type, item.meta?.cat, item.meta?.author, item.meta?.icon]
      .filter(Boolean).join(' ').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (haystack.includes(t)) score += (item.title.toLowerCase().includes(t) ? 3 : 1);
    }
    return { ...item, _score: score };
  }).filter(i => i._score > 0);
  scored.sort((a,b) => b._score - a._score);
  return scored;
}

// ── RENDER ────────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">

    <!-- Barre de recherche -->
    <div class="ym-panel" style="padding:14px">
      <div class="ym-search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input class="ym-input" id="search-input" placeholder="Rechercher dans vos spheres, apps, contacts, contenus…" value="${escHtml(query)}" autofocus style="padding-left:36px"/>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;flex-wrap:wrap;gap:6px">
        <div style="font-size:10px;color:var(--text3)">
          ${results.length ? `${results.length} résultat${results.length>1?'s':''} — ${selected.size} sélectionné${selected.size>1?'s':''}` : query.length>1 ? 'Aucun résultat' : 'Tapez au moins 2 caractères'}
        </div>
        ${selected.size ? `
          <div style="display:flex;gap:6px">
            <button class="ym-btn ym-btn-ghost" id="search-deselect-all" style="font-size:10px">Tout désélectionner</button>
            <button class="ym-btn ym-btn-accent" id="search-ai-btn" style="font-size:10px">✦ Générer idée sphere / app</button>
          </div>` : ''}
      </div>
    </div>

    <!-- Résultats -->
    ${results.length ? `
    <div style="display:flex;flex-direction:column;gap:4px;max-height:50dvh;overflow-y:auto" id="search-results">
      ${results.map(r => renderResult(r)).join('')}
    </div>` : ''}

    <!-- Panneau IA -->
    ${aiPanel ? renderAIPanel() : ''}

  </div>`;

  wireEvents();
}

function renderResult(r) {
  const isSel = selected.has(r.id);
  const typeColors = { app: 'blue', sphere: 'accent', theme: 'purple', contact: '', near: 'gold', url: '' };
  const col = typeColors[r.type] || '';
  return `
  <div class="ym-sphere-item${isSel?' active':''}" data-result-id="${escHtml(r.id)}" style="cursor:pointer;user-select:none">
    <div style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isSel?'var(--accent)':'transparent'};color:${isSel?'#050508':'var(--text3)'};font-size:11px;transition:all .15s">
      ${isSel?'✓':''}
    </div>
    <div class="ym-sphere-icon" style="font-size:16px">${r.meta?.icon||'◎'}</div>
    <div style="flex:1;overflow:hidden">
      <div style="font-family:var(--font-display);font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.title)}</div>
      <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.excerpt||'')}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
      <span class="ym-chip ${col}" style="font-size:8px">${r.type}</span>
      ${r.url ? `<button class="ym-btn ym-btn-ghost" data-goto="${escHtml(r.id)}" style="font-size:9px;padding:2px 8px">→ Ouvrir</button>` : ''}
    </div>
  </div>`;
}

function renderAIPanel() {
  const selResults = results.filter(r => selected.has(r.id));
  return `
  <div class="ym-panel" style="padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="ym-panel-title" style="margin:0">✦ Générer une idée de sphere / app</div>
      <button class="ym-btn ym-btn-ghost" id="search-ai-close" style="font-size:10px">Fermer</button>
    </div>
    <div style="font-size:10px;color:var(--text2);margin-bottom:8px">
      Éléments sélectionnés : ${selResults.map(r=>`<span class="ym-chip" style="font-size:9px">${escHtml(r.title)}</span>`).join(' ')}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input class="ym-input" id="search-ai-key" type="password" placeholder="Clé API Anthropic ou OpenAI" value="${localStorage.getItem('ym_builder_key')||''}" style="flex:1"/>
      <select class="ym-input" id="search-ai-provider" style="width:auto">
        <option value="anthropic">Claude</option>
        <option value="openai">GPT-4o</option>
      </select>
    </div>
    <textarea class="ym-editor" id="search-ai-prompt" rows="3" placeholder="Décrivez l'idée que vous souhaitez explorer… (laissez vide pour laisser l'IA proposer)"></textarea>
    <button class="ym-btn ym-btn-accent" id="search-ai-generate" style="width:100%;margin-top:8px">
      ${aiLoading ? '<div class="ym-loading"></div>' : '✦ Générer'}
    </button>
    ${aiResponse ? `
      <div style="margin-top:12px">
        <div class="ym-panel-title">Résultat</div>
        <div style="font-size:11px;color:var(--text2);white-space:pre-wrap;line-height:1.7;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;max-height:280px;overflow-y:auto">${escHtml(aiResponse)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="ym-btn" id="search-ai-copy" style="flex:1">⧉ Copier</button>
          <button class="ym-btn ym-btn-accent" id="search-ai-to-builder" style="flex:1">→ Ouvrir dans Builder</button>
        </div>
      </div>` : ''}
  </div>`;
}

// ── EVENTS ────────────────────────────────────────────────
function wireEvents() {
  // Recherche
  const inp = container.querySelector('#search-input');
  if (inp) {
    inp.oninput = e => {
      query = e.target.value;
      results = search(query);
      selected.clear();
      render();
    };
    // Focus auto
    setTimeout(() => inp.focus(), 80);
  }

  // Résultats — clic = sélectionner/désélectionner
  container.querySelectorAll('[data-result-id]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('[data-goto]')) return; // bouton ouvrir géré séparément
      const id = row.dataset.resultId;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      render();
    };
  });

  // Bouton ouvrir
  container.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const r = results.find(x => x.id === btn.dataset.goto);
      if (!r) return;
      openResult(r);
    };
  });

  // Tout désélectionner
  container.querySelector('#search-deselect-all')?.addEventListener('click', () => {
    selected.clear(); render();
  });

  // Ouvrir panneau IA
  container.querySelector('#search-ai-btn')?.addEventListener('click', () => {
    aiPanel = true; aiResponse = ''; render();
  });
  container.querySelector('#search-ai-close')?.addEventListener('click', () => {
    aiPanel = false; render();
  });

  // Générer
  container.querySelector('#search-ai-generate')?.addEventListener('click', generateIdea);

  // Copier résultat IA
  container.querySelector('#search-ai-copy')?.addEventListener('click', () => {
    navigator.clipboard.writeText(aiResponse).catch(()=>{});
  });

  // Envoyer dans builder
  container.querySelector('#search-ai-to-builder')?.addEventListener('click', () => {
    // Stocker dans localStorage pour que builder le récupère
    localStorage.setItem('ym_builder_prefill', aiResponse);
    // Ouvrir la sphere builder si disponible
    const builderSphere = (YM.spheres||[]).find(s=>s.name==='builder');
    if (builderSphere) window.YM_addSphereTab?.('builder', builderSphere.url, true);
    else alert('Ouvrez la sphere builder pour utiliser ce prompt.');
  });

  // Clé IA auto-save
  container.querySelector('#search-ai-key')?.addEventListener('input', e => {
    localStorage.setItem('ym_builder_key', e.target.value);
  });
}

// ── OUVRIR UN RÉSULTAT ────────────────────────────────────
function openResult(r) {
  if (r.type === 'sphere') {
    window.YM_addSphereTab?.(r._source.name, r._source.url, true);
  } else if (r.type === 'app') {
    // Ouvrir l'app (dispatch event que index.html écoute)
    window.dispatchEvent(new CustomEvent('ym:openapp', { detail: { name: r._source.name, url: r._source.url } }));
  } else if (r.type === 'url') {
    window.open(r.url, '_blank', 'noopener');
  } else if (r.type === 'near' || r.type === 'contact') {
    // Ouvrir l'app profile ou contacts si disponible
    window.dispatchEvent(new CustomEvent('ym:openapp', { detail: { name: 'profile' } }));
  } else if (r._external && r.url) {
    window.open(r.url, '_blank', 'noopener');
  }
}

// ── GÉNÉRATION IA ─────────────────────────────────────────
async function generateIdea() {
  const key      = container.querySelector('#search-ai-key')?.value?.trim() || localStorage.getItem('ym_builder_key') || '';
  const provider = container.querySelector('#search-ai-provider')?.value || 'anthropic';
  const userPrompt = container.querySelector('#search-ai-prompt')?.value?.trim();
  if (!key) { alert('Clé API requise'); return; }

  // Contexte : les éléments sélectionnés
  const selItems = results.filter(r => selected.has(r.id));
  const contextStr = selItems.map(r =>
    `[${r.type}] ${r.title}\n  Desc: ${r.excerpt}\n  Cat: ${r.meta?.cat||''}\n  URL: ${r.url||'local'}`
  ).join('\n\n');

  // Si des fichiers sont des spheres/apps → essayer de récupérer leurs entêtes
  const fileContexts = await Promise.all(
    selItems.filter(r => r.url && (r.type==='sphere'||r.type==='app'||r.type==='theme')).map(async r => {
      try {
        const code = await ft(r.url);
        const header = code.split('\n').slice(0,30).join('\n');
        return `\n// Entête de ${r.title}:\n${header}`;
      } catch { return ''; }
    })
  );
  const filesCtx = fileContexts.filter(Boolean).join('\n');

  const system = `Tu es expert en création de Spheres et Apps pour YourMine, une PWA P2P extensible.
Une sphere = fichier JS function init(container){} avec accès à window.YM, window.REPO_RAW, window.fetchText, window.YM_addSphereTab, window.YM_updateBalance.
Une app = IIFE (function(YM,$,el,fetchText,fetchJSON,REPO_RAW,REPO_API){ … }) qui retourne { mountAs, cleanup }.
Génère une proposition détaillée (nom, description, fonctionnalités, architecture, pseudo-code) de sphere ou app basée sur les éléments fournis.
Sois créatif et pratique. Indique clairement le type (sphere ou app), le mountAs si app, et les APIs/sources de données utilisées.`;

  const userContent = `Éléments sélectionnés dans YourMine:\n${contextStr}\n${filesCtx}\n\n${userPrompt || 'Propose une idée de sphere ou app innovante qui exploite ces éléments ensemble.'}`;

  aiLoading = true;
  render();

  try {
    let response = '';
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system,
          messages: [{ role: 'user', content: userContent }]
        })
      });
      const d = await r.json();
      response = d.content?.[0]?.text || d.error?.message || 'Erreur';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] })
      });
      const d = await r.json();
      response = d.choices?.[0]?.message?.content || d.error?.message || 'Erreur';
    }
    aiResponse = response;
  } catch(e) {
    aiResponse = 'Erreur: ' + e.message;
  }

  aiLoading = false;
  render();
}

// ── UTILS ─────────────────────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INDEX EXTERNE — API publique ──────────────────────────
// D'autres spheres/apps peuvent enregistrer leurs données :
//   window.YM_SEARCH_INDEX = window.YM_SEARCH_INDEX || [];
//   window.YM_SEARCH_INDEX.push({ id, type, title, excerpt, url, meta:{icon,cat} });
// La search sphere l'indexe automatiquement.
window.YM_SEARCH_INDEX = window.YM_SEARCH_INDEX || [];

// ── INIT ──────────────────────────────────────────────────
render();

} // end init
