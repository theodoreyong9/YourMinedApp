/**
 * app.js — YourMine core logic (v2 — allégé)
 * GitHub: theodoreyong9/YourMinedApp/src/app.js
 *
 * Dépend de (chargés avant) :
 *   - window.YM_toast, window.YM_escHtml  (index.html)
 *   - desk.js
 *   - switcher.js  → expose window.YM_Panels + window.YM_Switcher
 *
 * Ce fichier ne contient PLUS :
 *   - switcher cards / clone preview
 *   - openPanel / reducePanel / togglePanel
 *   - updateActiveDbtn / pushNav
 *   - popstate / dock button listeners
 *   - openSpherePanel / openProfilePanel
 *   → tout ça est dans switcher.js
 */

;(function () {
  'use strict';

  /* ── Raccourcis ───────────────────────────────────────────── */
  const toast = (...a) => window.YM_toast(...a);
  const esc   = (...a) => window.YM_escHtml(...a);

  /* ── Délégation vers switcher.js ──────────────────────────── */
  // On crée des alias locaux courts pour la lisibilité interne
  const openPanel       = (id)         => window.YM_Panels.open(id);
  const reducePanel     = ()           => window.YM_Panels.reduce();
  const openSpherePanel = (id)         => window.YM_Panels.openSphere(id);
  const openProfilePanel= (profile)    => window.YM_Panels.openProfile(profile);
  const openSwitcher    = ()           => window.YM_Switcher.open();
  const closeSwitcher   = ()           => window.YM_Switcher.close();

  /* ── LocalStorage helpers ─────────────────────────────────── */
  const PK = 'ym_profile_v1';
  const AK = 'ym_activity_v1';

  function gid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }

  function LP() { try { return JSON.parse(localStorage.getItem(PK) || 'null'); } catch { return null; } }
  function SP(d) {
    const p = Object.assign({}, LP() || {}, d);
    localStorage.setItem(PK, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent('ym:profile-updated', { detail: p }));
    return p;
  }
  function OC() {
    let p = LP();
    if (!p || !p.uuid) p = SP({ uuid: gid(), name: '', bio: '', avatar: '', spheres: [], created: Date.now() });
    return p;
  }
  function log(t, d) {
    const l = JSON.parse(localStorage.getItem(AK) || '[]');
    l.unshift({ t, d, ts: Date.now() });
    if (l.length > 200) l.length = 200;
    localStorage.setItem(AK, JSON.stringify(l));
  }

  /* Expose log aux modules (switcher.js l'appelle via YM._log) */
  window._ym_log = log;

  /* ── Rate-limiting P2P ────────────────────────────────────── */
  const p2pS = new Map(), p2pR = new Map(), GAP = 3000;
  function cS(id) { const n = Date.now(); if (n-(p2pS.get(id)||0) < GAP) return false; p2pS.set(id,n); return true; }
  function cR(id) { const n = Date.now(); if (n-(p2pR.get(id)||0) < GAP) return false; p2pR.set(id,n); return true; }

  /* ════════════════════════════════════════════════════════════
   * SPHERE REGISTRY + ACTIVATION
   * ════════════════════════════════════════════════════════════ */
  window.YM_sphereRegistry = new Map();

  function mkCtx(name) {
    const _l = [];
    const _toastTs = [], _sendTs = [];
    const _TOAST_MAX = 3, _TOAST_WIN = 5000;
    const _SEND_MAX  = 10, _SEND_WIN  = 1000;

    function _rateOk(arr, max, win) {
      const now = Date.now();
      while (arr.length && now - arr[0] > win) arr.shift();
      if (arr.length >= max) return false;
      arr.push(now); return true;
    }

    return {
      addHeaderBtn: () => {}, addPill: () => {}, addFigureTab: () => {}, addTabBadge: () => {},
      saveProfile: SP, loadProfile: LP, updateFigureCount() {},
      send(type, data, pid) {
        if (!window.YM_P2P) return false;
        if (!_rateOk(_sendTs, _SEND_MAX, _SEND_WIN)) return false;
        try {
          if (pid) { if (!cS(pid)) return false; window.YM_P2P.sendTo(pid, { sphere: name, type, data }); }
          else       window.YM_P2P.broadcast({ sphere: name, type, data });
          return true;
        } catch { return false; }
      },
      onReceive(cb) {
        const h = e => { try { if (e.detail.msg.sphere === name) cb(e.detail.msg.type, e.detail.msg.data, e.detail.peerId); } catch (e2) { console.warn('[YM ctx] onReceive:', name, e2.message); } };
        window.addEventListener('ym:p2p-data', h); _l.push(h);
      },
      storage: {
        get(k)    { try { return JSON.parse(localStorage.getItem('ym_s|'+name+'|'+k)); } catch { return null; } },
        set(k, v) { try { localStorage.setItem('ym_s|'+name+'|'+k, JSON.stringify(v)); } catch {} },
        del(k)    { localStorage.removeItem('ym_s|'+name+'|'+k); },
      },
      setNotification(n) { if (window.YM_Desk) window.YM_Desk.setNotif(name, n); },
      openPanel(fn) {
        if (fn) { document.getElementById('panel-sphere-body').innerHTML = ''; fn(document.getElementById('panel-sphere-body')); }
        openPanel('panel-sphere');
      },
      toast(msg, type) { if (_rateOk(_toastTs, _TOAST_MAX, _TOAST_WIN)) toast(msg, type); },
      setTabBadge(container, tabId, count) {
        const tab = container && container.querySelector('.ym-tab[data-tab="'+tabId+'"]'); if (!tab) return;
        let badge = tab.querySelector('.ym-tab-badge');
        if (count > 0) { if (!badge) { badge = document.createElement('span'); badge.className = 'ym-tab-badge'; tab.appendChild(badge); } badge.textContent = count; }
        else if (badge) badge.remove();
      },
      _cleanup() { _l.forEach(h => window.removeEventListener('ym:p2p-data', h)); _l.length = 0; },
    };
  }

  let _sA = false;
  const _ACT_TIMEOUT     = 8000;
  const MANDATORY_SPHERES = ['social.sphere.js'];

  async function activateSphere(name, obj) {
    if (window.YM_sphereRegistry.has(name)) return;
    const ctx = mkCtx(name);
    obj._ctx = ctx;
    window.YM_sphereRegistry.set(name, obj);
    if (window.YM_Desk) window.YM_Desk.addIcon(name, obj.icon || '⬡', obj.name || name.replace('.sphere.js',''));
    else setTimeout(() => { if (window.YM_Desk) window.YM_Desk.addIcon(name, obj.icon || '⬡', obj.name || name.replace('.sphere.js','')); }, 500);

    if (typeof obj.activate === 'function') {
      _sA = true;
      try {
        const timeoutP  = new Promise((_, rej) => setTimeout(() => rej(new Error('activation timeout')), _ACT_TIMEOUT));
        const activateP = (() => { try { const r = obj.activate(ctx); return r && r.then ? r : Promise.resolve(); } catch (e) { return Promise.reject(e); } })();
        await Promise.race([activateP, timeoutP]);
        _sA = false;
      } catch (e) {
        _sA = false;
        console.warn('[YM] activate failed:', name, e.message);
        toast((obj.name || name) + ' failed to load: ' + e.message, 'error');
        try { if (typeof obj.deactivate === 'function') obj.deactivate(); } catch {}
        ctx._cleanup();
        window.YM_sphereRegistry.delete(name);
        if (window.YM_Desk) window.YM_Desk.removeIcon(name);
        return;
      }
    }
    const p = OC();
    if (!p.spheres.includes(name)) { p.spheres.push(name); SP({ spheres: p.spheres }); }
    log('activate', { sphere: name });
    window.dispatchEvent(new CustomEvent('ym:sphere-activated', { detail: { name } }));
  }

  function deactivateSphere(name) {
    if (MANDATORY_SPHERES.includes(name)) { toast('Social sphere is mandatory', 'warn'); return; }
    const s = window.YM_sphereRegistry.get(name);
    if (s) {
      if (s.deactivate) {
        try { const r = s.deactivate(); if (r && r.then) r.catch(e => console.warn('[YM] deactivate:', name, e.message)); }
        catch (e) { console.warn('[YM] deactivate:', name, e.message); }
      }
      if (s._ctx) s._ctx._cleanup();
    }
    window.YM_sphereRegistry.delete(name);
    if (window.YM_Desk) window.YM_Desk.removeIcon(name);
    const p = OC();
    p.spheres = (p.spheres || []).filter(x => x !== name);
    SP({ spheres: p.spheres });
    if (window.YM_Liste) window.YM_Liste._setInactive(name);
    if (window.YM_Panels) window.YM_Panels.openSpheres.delete(name);
    log('deactivate', { sphere: name });
    window.dispatchEvent(new CustomEvent('ym:sphere-deactivated', { detail: { name } }));
    if (window.YM_Desk) window.YM_Desk.autoCleanPages();
  }

  /* ════════════════════════════════════════════════════════════
   * URL ROUTING
   * ════════════════════════════════════════════════════════════ */
  function checkURLRoute() {
    const parts = location.pathname.replace(/^\//, '').split('/').filter(Boolean);
    const GH_RAW    = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/';
    const DEF_THEME = GH_RAW + 'themes/default.html';

    let themeSegment  = null;
    let sphereSegment = null;

    parts.forEach(function(seg) {
      const tm = seg.match(/^([\w-]+)\.theme$/i);
      if (tm) themeSegment = tm[1];
      const sm = seg.match(/^([\w-]+)\.sphere(\.js)?$/i);
      if (sm) sphereSegment = sm[1] + '.sphere.js';
    });

    if (themeSegment) {
      const url = GH_RAW + 'themes/' + themeSegment + '.html';
      const cur = localStorage.getItem('ym_theme_url') || DEF_THEME;
      if (url !== cur) {
        localStorage.setItem('ym_theme_url', url);
        localStorage.removeItem('ym_theme_cache');
        if (sphereSegment) history.replaceState(null, '', '/' + sphereSegment.replace('.sphere.js', '.sphere'));
        else history.replaceState(null, '', '/');
        location.reload();
        return;
      }
    }

    if (sphereSegment) {
      const n = sphereSegment;
      setTimeout(async () => {
        if (window.YM_sphereRegistry && !window.YM_sphereRegistry.has(n)) {
          try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(n); } catch {}
        }
        openSpherePanel(n);
      }, 1400);
    }
  }
  window.addEventListener('hashchange', checkURLRoute);
  setTimeout(checkURLRoute, 100);

  /* ════════════════════════════════════════════════════════════
   * SÉCURITÉ fetch / localStorage
   * ════════════════════════════════════════════════════════════ */
  const _f = window.fetch.bind(window);
  window.fetch = function(i, o) { return _f(i, o); };
  Object.defineProperty(window, 'fetch', { configurable: false, writable: false, value: window.fetch });

  const _lsS = localStorage.setItem.bind(localStorage);
  const _lsR = localStorage.removeItem.bind(localStorage);
  localStorage.setItem    = function(k, v) { if (window._ym_sl && k === PK) { console.warn('[YM] blocked'); return; } return _lsS(k, v); };
  localStorage.removeItem = function(k)    { if (window._ym_sl && k === PK) { console.warn('[YM] blocked'); return; } return _lsR(k); };

  /* ════════════════════════════════════════════════════════════
   * LOADERS
   * ════════════════════════════════════════════════════════════ */
  function loadScript(src) {
    if (src.startsWith('https://')) {
      const url = src + (src.includes('?') ? '&' : '?') + '_=' + Date.now();
      return fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + src); return r.text(); })
        .then(code => new Promise((res, rej) => {
          const blob    = new Blob([code], { type: 'text/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          const s = document.createElement('script');
          s.src = blobUrl;
          s.onload  = () => { URL.revokeObjectURL(blobUrl); res(); };
          s.onerror = () => { URL.revokeObjectURL(blobUrl); rej(new Error('exec failed: ' + src)); };
          document.head.appendChild(s);
        }));
    }
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function loadSphereURL(url, name) {
    if (_sA) { console.warn('[YM] blocked nested load'); return null; }
    const r = await _f(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const _p  = { YM: window.YM, YM_Desk: window.YM_Desk, YM_sphereRegistry: window.YM_sphereRegistry, YM_P2P: window.YM_P2P, fetch: window.fetch };
    const _ps = Object.assign({}, window.YM_S);
    window._ym_sl = name;
    const blob    = new Blob([await r.text()], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = blobUrl;
      s.onload  = () => { URL.revokeObjectURL(blobUrl); res(); };
      s.onerror = () => { URL.revokeObjectURL(blobUrl); rej(new Error('Script load failed: ' + name)); };
      document.head.appendChild(s);
    });
    Object.entries(_p).forEach(([k, v]) => { if (window[k] !== v) window[k] = v; });
    if (window.YM_S) Object.keys(window.YM_S).forEach(k => { if (k !== name && _ps && _ps[k] && window.YM_S[k] !== _ps[k]) window.YM_S[k] = _ps[k]; });
    window._ym_sl = null;
    return window.YM_S ? window.YM_S[name] : null;
  }

  /* ════════════════════════════════════════════════════════════
   * P2P (Trystero)
   * ════════════════════════════════════════════════════════════ */
  const YM_RELAYS = ['wss://nos.lol','wss://relay.primal.net','wss://relay.nostr.wirednet.jp','wss://nostr.oxtr.dev'];

  async function initP2P() {
    window.addEventListener('error', e => { if (e.message && (e.message.includes('WebSocket') || e.message.includes('wss://'))) e.stopImmediatePropagation(); }, true);
    const _w = console.warn, _e = console.error;
    console.warn  = function() { if (typeof arguments[0]==='string' && (arguments[0].includes('Trystero') || arguments[0].includes('wss://'))) return; _w.apply(console, arguments); };
    console.error = function() { if (typeof arguments[0]==='string' && (arguments[0].includes('WebSocket') || arguments[0].includes('wss://'))) return; _e.apply(console, arguments); };

    for (const cdn of ['https://cdn.jsdelivr.net/npm/trystero@0.21.0/+esm','https://esm.run/trystero@0.21.0']) {
      try {
        const { joinRoom } = await import(cdn);
        const room = joinRoom({ appId: 'yourmine-v1', relayUrls: YM_RELAYS }, 'ym-main');
        const [send, recv] = room.makeAction('ym');
        recv((data, pid) => {
          if ((data && data.type === 'social:presence') || cR(pid))
            window.dispatchEvent(new CustomEvent('ym:p2p-data', { detail: { peerId: pid, msg: data } }));
        });
        room.onPeerJoin(id => {
          window.dispatchEvent(new CustomEvent('ym:peer-join', { detail: { peerId: id } }));
          setTimeout(() => send({ sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }, [id]), 200);
        });
        room.onPeerLeave(id => {
          p2pS.delete(id); p2pR.delete(id);
          window.dispatchEvent(new CustomEvent('ym:peer-leave', { detail: { peerId: id } }));
        });
        window.YM_P2P = {
          broadcast(d) { send(d); },
          sendTo(id, d) { if (cS(id)) send(d, [id]); },
          room,
        };
        setTimeout(() => send({ sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }), 800);
        setInterval(() => { if (!document.hidden) send({ sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }); }, 30000);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            send({ sphere: 'social.sphere.js', type: 'social:presence-req', data: {} });
            window.dispatchEvent(new CustomEvent('ym:peer-join', { detail: { peerId: '_self_' } }));
          }
        });
        return;
      } catch (e) { _w('[YM] P2P:', cdn, e.message); }
    }
  }

  /* ════════════════════════════════════════════════════════════
   * SIGN WALLET CONFIRMATION
   * ════════════════════════════════════════════════════════════ */
  function _wrapSignWithConfirmation() {
    if (!window.YM_Mine_sign || window.YM_Mine_sign._wrapped) return;
    const _orig = window.YM_Mine_sign;
    window.YM_Mine_sign = async function(message, callerSphereId) {
      let parsed = {}; try { parsed = JSON.parse(message); } catch {}
      const sphereName = callerSphereId
        ? (window.YM_sphereRegistry.get(callerSphereId) || {}).name || callerSphereId
        : 'Unknown sphere';
      return new Promise((resolve, reject) => {
        const dlg        = document.getElementById('ym-sign-dlg');
        const sphereEl   = document.getElementById('ym-sign-sphere');
        const detailEl   = document.getElementById('ym-sign-detail');
        const confirmBtn = document.getElementById('ym-sign-confirm');
        const rejectBtn  = document.getElementById('ym-sign-reject');
        if (!dlg) { _orig(message).then(resolve).catch(reject); return; }
        sphereEl.textContent = '"' + sphereName + '" wants to sign:';
        detailEl.textContent = JSON.stringify(parsed, null, 2) || message;
        dlg.classList.add('open');
        function cleanup() { dlg.classList.remove('open'); confirmBtn.onclick = null; rejectBtn.onclick = null; }
        confirmBtn.onclick = () => { cleanup(); _orig(message).then(resolve).catch(reject); };
        rejectBtn.onclick  = () => { cleanup(); reject(new Error('User rejected signature')); };
      });
    };
    window.YM_Mine_sign._wrapped = true;
  }

  /* ════════════════════════════════════════════════════════════
   * window.YM — API publique exposée aux spheres
   * ════════════════════════════════════════════════════════════ */
  window.YM = {
    toast,
    openPanel,
    closePanel:    reducePanel,
    openSwitcher,
    closeSwitcher,
    openSpherePanel,
    openProfilePanel,
    activateSphere,
    deactivateSphere,
    addIconToDesktop:      (id, icon, label) => { if (window.YM_Desk) window.YM_Desk.addIcon(id, icon, label); },
    removeIconFromDesktop: id               => { if (window.YM_Desk) window.YM_Desk.removeIcon(id); },
    activateSphereByName(n) {
      const id = n.endsWith('.sphere.js') ? n : n + '.sphere.js';
      if (window.YM_sphereRegistry && window.YM_sphereRegistry.has(id)) openSpherePanel(id);
      else toast('Not active: ' + n, 'warn');
    },
    getProfile:          LP,
    saveProfile:         SP,
    createCtx:           mkCtx,
    loadSphereFromURL:   loadSphereURL,
    p2p:                 () => window.YM_P2P,
    setIconNotif:        (id, n) => { if (window.YM_Desk) window.YM_Desk.setNotif(id, n); },
    // Accès interne pour switcher.js
    _log: log,
  };

  /* ════════════════════════════════════════════════════════════
   * INIT
   * ════════════════════════════════════════════════════════════ */
  const GH_BASE = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/';

  async function init() {
    OC();
    if (window.YM_Desk) window.YM_Desk.deskInit();

    for (const m of ['mine.js','liste.js','build.js','profile.js']) {
      try { await loadScript(GH_BASE + m); }
      catch (e) { console.warn('[YM]', m, e.message); }
    }

    _wrapSignWithConfirmation();
    setTimeout(_wrapSignWithConfirmation, 2000);
    window.addEventListener('ym:wallet-unlocked', _wrapSignWithConfirmation);

    try { if (window.YM_Liste && window.YM_Liste.fetchSphereList) await window.YM_Liste.fetchSphereList(); } catch {}

    const p = LP();
    if (p && p.spheres && p.spheres.length) {
      for (const sname of p.spheres) {
        if (!window.YM_sphereRegistry || !window.YM_sphereRegistry.has(sname)) {
          try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(sname); }
          catch (e) { console.warn('[YM] restore:', sname, e.message); }
        }
      }
    }

    const _socId = 'social.sphere.js';
    if (window.YM_Liste && !window.YM_sphereRegistry.has(_socId)) {
      try { await window.YM_Liste.activateSphereByName(_socId); }
      catch (e) { console.warn('[YM] social:', e.message); }
    }

    initP2P();

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

    const hideLdr = () => { const l = document.getElementById('ym-loader'); if (l) l.classList.add('hidden'); };
    const t0 = performance.now();
    document.fonts.ready.then(() => {
      const elapsed = performance.now() - t0;
      setTimeout(hideLdr, Math.max(0, 400 - elapsed));
    }).catch(() => setTimeout(hideLdr, 400));

    if (!window.matchMedia('(display-mode:standalone)').matches) {
      let _prompt = null;
      const btn = document.getElementById('pwa-install-btn');
      window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _prompt = e; btn.style.display = 'flex'; });
      btn.addEventListener('click', async () => {
        if (!_prompt) return;
        btn.style.opacity = '.6'; btn.style.pointerEvents = 'none';
        try { _prompt.prompt(); const result = await _prompt.userChoice; if (result.outcome === 'accepted') { btn.style.display = 'none'; _prompt = null; } } catch {}
        btn.style.opacity = ''; btn.style.pointerEvents = '';
      });
      window.matchMedia('(display-mode:standalone)').addEventListener('change', e => { if (e.matches) btn.style.display = 'none'; });
      window.addEventListener('appinstalled', () => { btn.style.display = 'none'; _prompt = null; });
    }
  }

  init();

})();
