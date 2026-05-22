/* jshint esversion:11, browser:true */
// zone.sphere.js — YourMine Search Engine
// Two layers: Osiris global data + live peer network intelligence
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const OSIRIS    = 'https://osiris-jet.vercel.app/api';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const WIKI_API  = 'https://en.wikipedia.org/api/rest_v1';

let _ctx    = null;
let _query  = '';
let _results = { peers: [], geo: null, wiki: null, news: [], dossier: null };
let _loading = false;
let _panelRefresh = null;

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _refreshPanel(){ if(_panelRefresh)_panelRefresh(); }

// ── LAYER 1: PEER SEARCH ──────────────────────────────────────
function searchPeers(query) {
  const q = query.toLowerCase();
  const results = [];
  const nearUsers = window.YM_Social?._nearUsers;
  if (!nearUsers) return results;

  nearUsers.forEach((userData, uuid) => {
    const profile = userData.profile || {};
    const bio     = (profile.bio || '').toLowerCase();
    const name    = (profile.name || '').toLowerCase();
    const spheres = profile.spheres || [];

    // Score by relevance
    let score = 0;
    if (name.includes(q)) score += 3;
    if (bio.includes(q))  score += 2;

    // Match sphere names/categories
    const matchedSpheres = spheres.filter(sid => {
      const obj = window.YM_sphereRegistry?.get(sid);
      return obj && (
        (obj.name||'').toLowerCase().includes(q) ||
        (obj.category||'').toLowerCase().includes(q) ||
        (obj.description||'').toLowerCase().includes(q)
      );
    });
    score += matchedSpheres.length;

    // Match broadcastData
    const bcast = userData.broadcastData || {};
    const bcastStr = JSON.stringify(bcast).toLowerCase();
    if (bcastStr.includes(q)) score += 1;

    if (score > 0) {
      results.push({ uuid, profile, score, matchedSpheres, broadcastData: bcast });
    }
  });

  // Also search P2P — broadcast query, collect responses
  if (_ctx) {
    _ctx.send('zone:query', { q: query, ts: Date.now() });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

// Listen for peer search responses
function setupP2P(ctx) {
  ctx.onReceive((type, data, peerId) => {
    if (type === 'zone:query') {
      // A peer is searching — respond with our matching profile data
      const q = (data.q || '').toLowerCase();
      const myProfile = ctx.loadProfile();
      const myBio = (myProfile.bio || '').toLowerCase();
      const myName = (myProfile.name || '').toLowerCase();
      if (myBio.includes(q) || myName.includes(q)) {
        window.YM_P2P?.sendTo(peerId, {
          sphere: 'zone.sphere.js',
          type:   'zone:result',
          data:   { profile: { name: myProfile.name, bio: myProfile.bio, avatar: myProfile.avatar }, q },
        });
      }
    }
    if (type === 'zone:result') {
      // Peer responded to our query — add to results if matches current query
      if (data.q === _query && data.profile) {
        const already = _results.peers.find(p => p.uuid === peerId);
        if (!already) {
          _results.peers.push({ uuid: peerId, profile: data.profile, score: 1, matchedSpheres: [], remote: true });
          _refreshPanel();
        }
      }
    }
  });
}

// ── LAYER 2: OSIRIS + WEB DATA ────────────────────────────────
async function searchGeo(query) {
  try {
    const r = await fetch(
      NOMINATIM + '/search?q=' + encodeURIComponent(query) + '&format=json&limit=1',
      { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
  } catch { return null; }
}

async function fetchDossier(lat, lon) {
  try {
    const r = await fetch(
      OSIRIS + '/region-dossier?lat=' + lat + '&lon=' + lon,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchNews(query) {
  try {
    const r = await fetch(OSIRIS + '/news', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const articles = data.articles || data || [];
    const q = query.toLowerCase();
    return articles
      .filter(a => (a.title||'').toLowerCase().includes(q) || (a.description||'').toLowerCase().includes(q))
      .slice(0, 5);
  } catch { return []; }
}

async function fetchWiki(query) {
  try {
    const r = await fetch(
      WIKI_API + '/page/summary/' + encodeURIComponent(query),
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return { title: data.title, extract: data.extract?.slice(0, 280), thumb: data.thumbnail?.source };
  } catch { return null; }
}

// ── MAIN SEARCH ───────────────────────────────────────────────
async function doSearch(query) {
  if (!query.trim()) return;
  _query   = query.trim();
  _loading = true;
  _results = { peers: [], geo: null, wiki: null, news: [], dossier: null };
  _refreshPanel();

  // Peer search (sync)
  _results.peers = searchPeers(_query);
  _loading = false;
  _refreshPanel();

  // Async layers in parallel
  const [geo, wiki, news] = await Promise.all([
    searchGeo(_query),
    fetchWiki(_query),
    fetchNews(_query),
  ]);

  _results.geo  = geo;
  _results.wiki = wiki;
  _results.news = news;
  _refreshPanel();

  // Dossier if geo found
  if (geo) {
    const dossier = await fetchDossier(geo.lat, geo.lon);
    _results.dossier = dossier;
    _refreshPanel();
  }
}

// ── RENDER ────────────────────────────────────────────────────
function renderPanel(container) {
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';
  _panelRefresh = () => renderPanel(container);

  // Search bar
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'flex-shrink:0;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:8px;align-items:center';
  searchWrap.innerHTML =
    '<input data-input class="ym-input" placeholder="Search people, places, topics…" style="flex:1;font-size:13px;padding:9px 12px" value="' + esc(_query) + '">' +
    '<button data-btn style="background:linear-gradient(135deg,var(--gold,#f0a830),rgba(240,168,48,.75));border:none;color:#05030a;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">⌕</button>';
  container.appendChild(searchWrap);

  const input = searchWrap.querySelector('[data-input]');
  const btn   = searchWrap.querySelector('[data-btn]');

  const go = () => { const q = input.value.trim(); if(q) doSearch(q); };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', e => { if(e.key==='Enter') go(); });
  setTimeout(()=>input.focus(), 100);

  // Results area
  const results = document.createElement('div');
  results.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch';
  container.appendChild(results);

  function render() {
    results.innerHTML = '';

    if (!_query) {
      const hint = document.createElement('div');
      hint.style.cssText = 'padding:32px 16px;text-align:center;color:var(--text3);font-size:12px;line-height:1.8';
      hint.innerHTML =
        '<div style="font-size:24px;margin-bottom:10px">⌕</div>' +
        'Search across your peer network,<br>global news, geopolitics and Wikipedia.';
      results.appendChild(hint);
      return;
    }

    if (_loading) {
      const loader = document.createElement('div');
      loader.style.cssText = 'padding:32px 16px;text-align:center;color:var(--text3);font-size:12px';
      loader.textContent = 'Searching…';
      results.appendChild(loader);
      return;
    }

    const noResults = !_results.peers.length && !_results.wiki && !_results.news.length && !_results.dossier;

    // ── PEERS ──
    if (_results.peers.length) {
      _section(results, '⬡ Network', _results.peers.length + ' peer' + (_results.peers.length>1?'s':''));
      _results.peers.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
        const avatar = p.profile.avatar
          ? '<img src="'+esc(p.profile.avatar)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">⬡</div>';
        row.innerHTML =
          avatar +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;color:var(--text)">' + esc(p.profile.name||'Anonymous') + '</div>' +
            (p.profile.bio ? '<div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.profile.bio) + '</div>' : '') +
          '</div>' +
          (p.remote ? '<span style="font-size:9px;color:var(--cyan)">P2P</span>' : '');
        row.addEventListener('click', () => {
          if (window.YM?.openProfilePanel) window.YM.openProfilePanel(p.profile);
        });
        results.appendChild(row);
      });
    }

    // ── WIKI ──
    if (_results.wiki) {
      const w = _results.wiki;
      _section(results, '📖 Wikipedia');
      const card = document.createElement('div');
      card.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:10px;align-items:flex-start';
      card.innerHTML =
        (w.thumb ? '<img src="'+esc(w.thumb)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0">' : '') +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">' + esc(w.title) + '</div>' +
          '<div style="font-size:11px;color:var(--text2);line-height:1.6">' + esc(w.extract||'') + '</div>' +
        '</div>';
      results.appendChild(card);
    }

    // ── DOSSIER ──
    if (_results.dossier) {
      const d = _results.dossier;
      _section(results, '🌍 Region Dossier');
      const card = document.createElement('div');
      card.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.04)';
      const country = d.country || d.countryName || '';
      const head    = d.headOfState || d.leader || '';
      const summary = d.summary || d.description || '';
      card.innerHTML =
        (country ? '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">' + esc(country) + '</div>' : '') +
        (head    ? '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Leader: <span style="color:var(--text2)">' + esc(head) + '</span></div>' : '') +
        (summary ? '<div style="font-size:11px;color:var(--text2);line-height:1.6">' + esc(summary.slice(0,200)) + '</div>' : '');
      results.appendChild(card);
    }

    // ── NEWS ──
    if (_results.news.length) {
      _section(results, '📰 News', _results.news.length + ' articles');
      _results.news.forEach(a => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
        row.innerHTML =
          '<div style="font-size:12px;color:var(--text);line-height:1.4;margin-bottom:3px">' + esc(a.title||'') + '</div>' +
          '<div style="font-size:10px;color:var(--text3)">' + esc(a.source||a.feed||'') + '</div>';
        if (a.url || a.link) {
          row.addEventListener('click', () => window.open(a.url||a.link, '_blank', 'noopener'));
        }
        results.appendChild(row);
      });
    }

    // ── NO RESULTS ──
    if (noResults && !_loading) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 16px;text-align:center;color:var(--text3);font-size:12px';
      empty.textContent = 'No results for "' + esc(_query) + '"';
      results.appendChild(empty);
    }
  }

  _panelRefresh = render;
  render();
}

function _section(container, label, sub) {
  const s = document.createElement('div');
  s.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 16px 4px;border-bottom:1px solid rgba(255,255,255,.04)';
  s.innerHTML =
    '<span style="font-family:var(--font-d);font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)">' + label + '</span>' +
    (sub ? '<span style="font-size:9px;color:var(--text3);opacity:.6">' + sub + '</span>' : '');
  container.appendChild(s);
}

window.YM_S['zone.sphere.js'] = {
  name: 'Zone',
  icon: '⌕',
  category: 'Search',
  description: 'Search your peer network, global news, geopolitics and Wikipedia in one place.',

  activate(ctx) {
    _ctx = ctx;
    setupP2P(ctx);
  },

  deactivate() {
    _ctx        = null;
    _query      = '';
    _results    = { peers:[], geo:null, wiki:null, news:[], dossier:null };
    _panelRefresh = null;
  },

  renderPanel,

  profileSection(container) {
    container.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text3)';
    info.textContent = _query ? 'Last search: "' + _query + '"' : 'No search yet.';
    container.appendChild(info);
  },

  peerSection(container) {
    container.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text3)';
    info.textContent = '⌕ Also uses Zone search';
    container.appendChild(info);
  },
};
})();
