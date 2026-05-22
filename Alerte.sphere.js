/* jshint esversion:11, browser:true */
// alerte.sphere.js — YourMine Global Signals
// Polls Osiris public APIs, cross-references peer network, badges on alerts
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const OSIRIS = 'https://osiris-jet.vercel.app/api';

const POLL_INTERVAL  = 60 * 1000;  // 60s
const QUAKE_MIN_MAG  = 5.0;        // magnitude minimum pour alerter
const MARKET_MOVE    = 2.0;        // % de variation pour alerter

let _ctx       = null;
let _timer     = null;
let _alerts    = [];   // alertes actives
let _lastFetch = 0;

// ── FETCH OSIRIS ──────────────────────────────────────────────
async function fetchQuakes() {
  try {
    const r = await fetch(OSIRIS + '/earthquakes', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.features || [])
      .filter(f => (f.properties?.mag || 0) >= QUAKE_MIN_MAG)
      .map(f => ({
        type: 'quake',
        icon: '🌍',
        title: 'M' + f.properties.mag.toFixed(1) + ' — ' + (f.properties.place || 'Unknown'),
        mag: f.properties.mag,
        coords: f.geometry?.coordinates,
        ts: f.properties.time,
      }));
  } catch { return []; }
}

async function fetchConflicts() {
  try {
    const r = await fetch(OSIRIS + '/gdelt', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const events = data.events || data.articles || data || [];
    return events.slice(0, 5).map(e => ({
      type: 'conflict',
      icon: '⚠',
      title: e.title || e.headline || 'Conflict event',
      location: e.location || e.country || '',
      ts: Date.now(),
    }));
  } catch { return []; }
}

async function fetchMarkets() {
  try {
    const r = await fetch(OSIRIS + '/markets', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const tickers = data.tickers || data || [];
    return tickers
      .filter(t => Math.abs(parseFloat(t.changePercent) || 0) >= MARKET_MOVE)
      .map(t => ({
        type: 'market',
        icon: (parseFloat(t.changePercent) > 0) ? '📈' : '📉',
        title: (t.symbol || '') + ' ' + (parseFloat(t.changePercent) > 0 ? '+' : '') + parseFloat(t.changePercent).toFixed(1) + '%',
        symbol: t.symbol,
        change: parseFloat(t.changePercent),
        ts: Date.now(),
      }));
  } catch { return []; }
}

async function fetchMilitary() {
  try {
    const r = await fetch(OSIRIS + '/flights?type=military', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const flights = data.aircraft || data || [];
    const count = flights.length;
    if (count === 0) return [];
    return [{
      type: 'military',
      icon: '✈',
      title: count + ' military flight' + (count > 1 ? 's' : '') + ' tracked',
      count,
      ts: Date.now(),
    }];
  } catch { return []; }
}

// ── PEER CONTEXT ──────────────────────────────────────────────
// Extracts location keywords from peer bios and sphere categories
function getPeerContext() {
  const keywords = new Set();
  const nearUsers = window.YM_Social?._nearUsers;
  if (!nearUsers) return keywords;

  nearUsers.forEach((userData) => {
    const bio = userData.profile?.bio || '';
    const name = userData.profile?.name || '';
    // Extract capitalised words as potential locations
    const words = (bio + ' ' + name).match(/[A-Z][a-z]{2,}/g) || [];
    words.forEach(w => keywords.add(w.toLowerCase()));

    // Sphere categories
    const spheres = userData.profile?.spheres || [];
    spheres.forEach(sid => {
      const obj = window.YM_sphereRegistry?.get(sid);
      if (obj?.category) keywords.add(obj.category.toLowerCase());
    });
  });

  return keywords;
}

// ── POLL ──────────────────────────────────────────────────────
async function poll() {
  const [quakes, conflicts, markets, military] = await Promise.all([
    fetchQuakes(),
    fetchConflicts(),
    fetchMarkets(),
    fetchMilitary(),
  ]);

  const peerCtx = getPeerContext();

  // Score alerts — boost if matches peer context
  const score = (alert) => {
    const text = (alert.title + ' ' + (alert.location || '')).toLowerCase();
    let s = 1;
    peerCtx.forEach(kw => { if (text.includes(kw)) s += 2; });
    return s;
  };

  const all = [...quakes, ...conflicts, ...markets, ...military];
  all.forEach(a => { a.score = score(a); a.id = a.type + '_' + a.ts; });
  all.sort((a, b) => b.score - a.score);

  _alerts = all.slice(0, 20);
  _lastFetch = Date.now();

  // Badge = number of high-relevance alerts
  const high = _alerts.filter(a => a.score >= 3).length;
  const badge = high > 0 ? high : (_alerts.length > 0 ? _alerts.length : 0);
  if (_ctx) _ctx.setNotification(badge);

  _refreshPanel();
}

let _panelRefresh = null;
function _refreshPanel() { if (_panelRefresh) _panelRefresh(); }

// ── RENDER ────────────────────────────────────────────────────
function renderPanel(container) {
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';
  _panelRefresh = () => renderPanel(container);

  // Header
  const head = document.createElement('div');
  head.style.cssText = 'flex-shrink:0;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px';
  container.appendChild(head);

  function updateHead() {
    const age = _lastFetch ? Math.round((Date.now() - _lastFetch) / 1000) : null;
    head.innerHTML =
      '<div style="flex:1">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2)">Global Signals</div>' +
        '<div style="font-size:9px;color:var(--text3);margin-top:2px">' +
          (age !== null ? 'Updated ' + (age < 60 ? age + 's' : Math.round(age/60) + 'min') + ' ago' : 'Fetching…') +
        '</div>' +
      '</div>' +
      '<button data-refresh style="background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer;padding:4px">↺</button>';
    head.querySelector('[data-refresh]').addEventListener('click', () => {
      head.querySelector('[data-refresh]').style.opacity = '.4';
      poll().then(() => { head.querySelector('[data-refresh]') && (head.querySelector('[data-refresh]').style.opacity = '1'); updateHead(); });
    });
  }
  updateHead();

  // Filter pills
  const filters = document.createElement('div');
  filters.style.cssText = 'flex-shrink:0;display:flex;gap:5px;padding:8px 16px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid rgba(255,255,255,.06)';
  const TYPES = [
    { id: 'all',      label: 'All'      },
    { id: 'quake',    label: '🌍 Quakes' },
    { id: 'conflict', label: '⚠ Conflict'},
    { id: 'market',   label: '📈 Markets'},
    { id: 'military', label: '✈ Military'},
  ];
  let _filter = 'all';
  TYPES.forEach(t => {
    const p = document.createElement('span');
    p.className = 'pill' + (t.id === _filter ? ' active' : '');
    p.style.cssText = 'cursor:pointer;font-size:10px;flex-shrink:0;white-space:nowrap';
    p.textContent = t.label;
    p.addEventListener('click', () => {
      _filter = t.id;
      filters.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      renderList();
    });
    filters.appendChild(p);
  });
  container.appendChild(filters);

  // List
  const list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch';
  container.appendChild(list);

  function renderList() {
    list.innerHTML = '';
    const filtered = _filter === 'all' ? _alerts : _alerts.filter(a => a.type === _filter);

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 16px;text-align:center;color:var(--text3);font-size:12px';
      empty.textContent = _lastFetch ? 'No signals' : 'Loading…';
      list.appendChild(empty);
      return;
    }

    filtered.forEach(alert => {
      const row = document.createElement('div');
      const isPeer = alert.score >= 3;
      row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);' +
        (isPeer ? 'background:rgba(240,168,48,.04)' : '');

      row.innerHTML =
        '<div style="font-size:20px;flex-shrink:0;margin-top:1px">' + alert.icon + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;color:var(--text);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(alert.title) + '</div>' +
          (alert.location ? '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + esc(alert.location) + '</div>' : '') +
          (isPeer ? '<div style="font-size:9px;color:var(--gold);margin-top:2px">● Relevant to your network</div>' : '') +
        '</div>' +
        '<div style="font-size:9px;color:var(--text3);flex-shrink:0;white-space:nowrap">' + _fmtAge(alert.ts) + '</div>';

      list.appendChild(row);
    });
  }

  renderList();

  // Start polling if not already
  if (!_lastFetch) poll();
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _fmtAge(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.round(s/60) + 'min';
  return Math.round(s/3600) + 'h';
}

window.YM_S['alerte.sphere.js'] = {
  name: 'Alerte',
  icon: '⚠',
  category: 'Media',
  description: 'Global signals — earthquakes, conflicts, markets, military. Cross-referenced with your network.',

  activate(ctx) {
    _ctx = ctx;
    // First fetch
    poll();
    // Poll every minute
    _timer = setInterval(poll, POLL_INTERVAL);
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
    _alerts = [];
    _panelRefresh = null;
    if (_ctx) _ctx.setNotification(0);
  },

  renderPanel,

  profileSection(container) {
    container.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text3);line-height:1.7';
    info.textContent = _alerts.length
      ? _alerts.length + ' signal' + (_alerts.length > 1 ? 's' : '') + ' active · ' +
        _alerts.filter(a => a.score >= 3).length + ' relevant to your network'
      : 'No signals yet.';
    container.appendChild(info);
  },

  peerSection(container) {
    container.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text3)';
    info.textContent = '⚠ Also monitors global signals';
    container.appendChild(info);
  },
};
})();
