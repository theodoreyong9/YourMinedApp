/**
 * app.js — YourMine core logic
 * GitHub: theodoreyong9/YourMinedApp/src/app.js
 *
 * Dépend de :
 *   - window.YM_toast, window.YM_escHtml  (injectés par index.html avant chargement)
 *   - desk.js chargé avant app.js
 */

;(function () {
  'use strict';

  /* ── Raccourcis ───────────────────────────────────────────── */
  const toast = (...a) => window.YM_toast(...a);
  const esc   = (...a) => window.YM_escHtml(...a);

  /* ── LocalStorage helpers ─────────────────────────────────── */
  const PK = 'ym_profile_v1';
  const AK = 'ym_activity_v1';

  function gid() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
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

  /* ── Rate-limiting P2P ────────────────────────────────────── */
  const p2pS = new Map(), p2pR = new Map(), GAP = 3000;
  function cS(id) { const n = Date.now(); if (n - (p2pS.get(id) || 0) < GAP) return false; p2pS.set(id, n); return true; }
  function cR(id) { const n = Date.now(); if (n - (p2pR.get(id) || 0) < GAP) return false; p2pR.set(id, n); return true; }

  /* ── Références DOM ───────────────────────────────────────── */
  const overlay = document.getElementById('panel-overlay');
  const sw      = document.getElementById('panel-switcher');

  /* ── État panels ──────────────────────────────────────────── */
  let _panel    = null;
  let _prevPanel = null;
  const navStack     = [];
  const _openPanels  = new Map();
  const _openSpheres = new Map();

  const PANEL_META = {
    'panel-spheres':      { label: 'Spheres' },
    'panel-profile':      { label: 'Profile' },
    'panel-build':        { label: 'Build'   },
    'panel-mine':         { label: 'YourMine'},
    'panel-profile-view': { label: 'Profile' },
  };

  function setupMineTabs() {
    const bar = document.getElementById('mine-tabs-bar');
    if (!bar || bar._init) return;
    bar._init = true;
    bar.querySelectorAll('.ym-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        bar.querySelectorAll('.ym-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        switchMineTab(tab.dataset.mineTab);
      });
    });
  }

  function switchMineTab(tab) {
    const w = document.getElementById('panel-mine-wallet');
    const b = document.getElementById('panel-mine-build');
    const f = document.getElementById('panel-mine-formula');
    const l = document.getElementById('panel-mine-liste');
    [w, b, f, l].forEach(el => { if (el) el.style.display = 'none'; });

    if (tab === 'wallet' && w) {
      w.style.display = 'flex';
      if (window.YM_Mine) window.YM_Mine.render(w);
    }
    if (tab === 'build' && b) {
      b.style.display = 'flex';
      b.innerHTML = '';
      if (window.YM_Build) window.YM_Build.render(b);
    }
    if (tab === 'formula' && f) {
      f.style.display = 'flex';
      renderFormulaTab();
    }
    if (tab === 'liste' && l) {
      l.style.display = 'flex';
      if (window.YM_Liste) {
        if (!l.children.length) window.YM_Liste.render(l);
      } else {
        l.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px">Loading…</div>';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * SWITCHER
   * ═══════════════════════════════════════════════════════════ */
  function _buildClonePreview(sourceEl) {
    const preview = document.createElement('div');
    preview.className = 'sw-preview';
    const wrap  = document.createElement('div');
    wrap.className = 'sw-clone-wrap';
    const clone = sourceEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = 'position:relative;transform:none;transition:none;border-radius:0;pointer-events:none;overflow:hidden;';
    clone.querySelectorAll('*').forEach(el => {
      el.style.animation = 'none'; el.style.transition = 'none'; el.style.pointerEvents = 'none';
      el.removeAttribute('id');
    });
    clone.querySelectorAll('button,input,textarea,select,canvas,video,audio,script,.panel-handle').forEach(el => el.remove());
    if (sourceEl._needsRemoval) sourceEl.remove();
    wrap.appendChild(clone);
    preview.appendChild(wrap);
    setTimeout(() => { requestAnimationFrame(() => {
      const pw = sourceEl._snapshotWidth  || sourceEl.offsetWidth  || window.innerWidth;
      const ph = sourceEl._snapshotHeight || sourceEl.offsetHeight || window.innerHeight;
      const cw = preview.offsetWidth;
      if (pw > 0 && cw > 0) {
        const sc = cw / pw;
        clone.style.width  = pw + 'px';
        clone.style.height = ph + 'px';
        wrap.style.transform = 'scale(' + sc + ')';
        wrap.style.width  = pw + 'px';
        wrap.style.height = ph + 'px';
      }
    }); }, 0);
    return preview;
  }

  function _buildFakePanel(snapshot, panelW, panelH) {
    const fake = document.createElement('div');
    fake.className = 'ym-panel';
    fake.style.cssText = 'position:fixed;left:-19999px;top:0;width:' + panelW + 'px;height:' + panelH + 'px;transform:none;visibility:hidden;pointer-events:none;border-radius:30px 30px 0 0;';
    fake.innerHTML = snapshot;
    fake._needsRemoval = true;
    fake._snapshotWidth  = panelW;
    fake._snapshotHeight = panelH;
    document.body.appendChild(fake);
    return fake;
  }

  function _makeCard(label, getSourceEl, onTap, onDismiss) {
    const card = document.createElement('div');
    card.className = 'sw-card';

    const previewSlot = document.createElement('div');
    previewSlot.className = 'sw-preview';
    card.appendChild(previewSlot);

    const lbl = document.createElement('div');
    lbl.className = 'sw-label';
    lbl.textContent = label;
    card.appendChild(lbl);

    setTimeout(() => {
      const sourceEl = getSourceEl();
      if (!sourceEl) return;
      const preview = _buildClonePreview(sourceEl);
      card.replaceChild(preview, previewSlot);
    }, 0);

    const SWIPE_THRESH = 48;
    const TAP_THRESH   = 12;
    let _tx = 0, _ty = 0, _tActive = false;

    card.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      _tx = e.touches[0].clientX; _ty = e.touches[0].clientY; _tActive = true;
    }, { passive: true });

    card.addEventListener('touchend', e => {
      if (!_tActive) return; _tActive = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - _tx, dy = t.clientY - _ty;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx > SWIPE_THRESH && adx > ady * 1.5) {
        card.style.transition = 'transform .2s,opacity .2s';
        card.style.transform  = 'translateX(' + (dx > 0 ? 120 : -120) + '%)';
        card.style.opacity    = '0';
        setTimeout(onDismiss, 200);
      } else if (adx < TAP_THRESH && ady < TAP_THRESH) {
        _blockOverlayUntil = Date.now() + 500;
        onTap();
      }
    }, { passive: true });

    let _mx = 0, _my = 0, _mDown = false, _mMoved = false;
    card.addEventListener('mousedown', e => { _mx = e.clientX; _my = e.clientY; _mDown = true; _mMoved = false; });
    card.addEventListener('mousemove', e => {
      if (!_mDown) return;
      if (Math.abs(e.clientX - _mx) > 6 || Math.abs(e.clientY - _my) > 6) _mMoved = true;
      if (_mMoved) {
        card.style.transform = 'translateX(' + (e.clientX - _mx) + 'px)';
        card.style.opacity   = String(Math.max(0, 1 - Math.abs(e.clientX - _mx) / SWIPE_THRESH));
      }
    });
    card.addEventListener('mouseup', e => {
      if (!_mDown) return; _mDown = false;
      const dx = e.clientX - _mx, adx = Math.abs(dx), ady = Math.abs(e.clientY - _my);
      if (adx > SWIPE_THRESH && adx > ady * 1.5) {
        card.style.transition = 'transform .2s,opacity .2s';
        card.style.transform  = 'translateX(' + (dx > 0 ? 120 : -120) + '%)';
        card.style.opacity    = '0';
        setTimeout(onDismiss, 200);
      } else if (!_mMoved) {
        card.style.transform = ''; card.style.opacity = ''; onTap();
      } else {
        card.style.transition = 'transform .15s,opacity .15s';
        card.style.transform  = ''; card.style.opacity = '';
        setTimeout(() => { card.style.transition = ''; }, 160);
      }
      _mMoved = false;
    });
    card.addEventListener('mouseleave', () => {
      if (!_mDown) return; _mDown = false; _mMoved = false;
      card.style.transition = 'transform .15s,opacity .15s';
      card.style.transform  = ''; card.style.opacity = '';
      setTimeout(() => { card.style.transition = ''; }, 160);
    });

    return card;
  }

  function _afterDismiss() {
    if (_openPanels.size + _openSpheres.size === 0) closeSwitcher();
    else _buildSwitcherRows();
  }

  function _buildSwitcherRows() {
    const grid = document.getElementById('switcher-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = [];
    _openPanels.forEach(({ label, snapshot, panelW, panelH }, id) => {
      const isFolder = id.startsWith('__folder__');
      items.push({
        id, label, snapshot, panelW, panelH,
        onTap: isFolder ? () => closeSwitcher() : () => { closeSwitcher(); openPanel(id); },
        getEl:  isFolder
          ? () => { if (snapshot) return _buildFakePanel(snapshot, panelW || window.innerWidth, panelH || window.innerHeight); return document.getElementById('panel-folder'); }
          : () => document.getElementById(id),
        onDel: () => { _openPanels.delete(id); _afterDismiss(); },
      });
    });
    _openSpheres.forEach(({ label, snapshot, panelW, panelH }, id) => {
      items.push({
        id, label, snapshot, panelW, panelH,
        onTap:  () => { closeSwitcher(); openSpherePanel(id); },
        getEl:  () => { if (snapshot) return _buildFakePanel(snapshot, panelW, panelH); return document.getElementById('panel-sphere'); },
        onDel:  () => { _openSpheres.delete(id); _afterDismiss(); },
      });
    });

    if (!items.length) { closeSwitcher(); return; }
    if (items.length % 2 === 1) grid.appendChild(document.createElement('div'));
    items.forEach(item => grid.appendChild(_makeCard(item.label, item.getEl, item.onTap, item.onDel)));
  }

  function renderSwitcherCards() { _buildSwitcherRows(); }

  function closeSwitcher() {
    sw.classList.remove('open');
    const grid = document.getElementById('switcher-grid');
    if (grid) grid.innerHTML = '';
  }

  function openSwitcher() {
    if (sw.classList.contains('open')) { closeSwitcher(); return; }
    if (_panel) {
      const el = document.getElementById(_panel);
      if (el) el.classList.remove('open');
      overlay.classList.remove('open');
      _panel = null; updateActiveDbtn(null);
    }
    const fp = document.getElementById('panel-folder');
    if (fp && fp.classList.contains('open')) {
      const fs = window._deskFolderStack;
      if (fs && fs.length) {
        const topIc = fs[fs.length - 1].ic;
        if (topIc) {
          _openPanels.set('__folder__' + topIc.id, {
            label: topIc.label || 'Folder',
            snapshot: fp.innerHTML,
            panelW: fp.offsetWidth  || window.innerWidth,
            panelH: fp.offsetHeight || window.innerHeight,
          });
        }
      }
      fp.style.transition = 'none';
      fp.classList.remove('open');
      requestAnimationFrame(() => { fp.style.transition = ''; });
      if (window._deskFolderStack) window._deskFolderStack.length = 0;
    }
    if (_openPanels.size + _openSpheres.size === 0) {
      openPanel('panel-spheres');
      if (window.YM_Liste) window.YM_Liste.render();
      return;
    }
    renderSwitcherCards();
    sw.classList.add('open');
  }

  /* Switcher handle drag-to-close */
  (() => {
    const h = document.getElementById('switcher-handle');
    let sy = 0;
    if (h) {
      h.addEventListener('pointerdown', e => { sy = e.clientY; });
      h.addEventListener('pointerup',   e => { if (e.clientY - sy > 30) closeSwitcher(); });
    }
  })();

  /* ═══════════════════════════════════════════════════════════
   * PANELS
   * ═══════════════════════════════════════════════════════════ */
  let _blockOverlayUntil = 0;

  function updateActiveDbtn(panelId) {
    document.getElementById('nav-bar').addEventListener('contextmenu', e => e.preventDefault());
    document.querySelectorAll('.dbtn').forEach(b => {
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.classList.remove('active');
    });
    if (!panelId) return;
    const map = { 'panel-profile': 'btn-profile', 'panel-mine': 'btn-figure' };
    const btnId = map[panelId];
    if (btnId) { const btn = document.getElementById(btnId); if (btn) btn.classList.add('active'); }
  }

  function openPanel(id) {
    sw.classList.remove('open');

    const isProfileOverlay = (id === 'panel-profile' || id === 'panel-profile-view' || id === 'panel-mine') && _panel === 'panel-sphere';
    if (isProfileOverlay) {
      _prevPanel = 'panel-sphere';
      const p = document.getElementById(id); if (!p) return;
      const fp = document.getElementById('panel-folder');
      if (fp && fp.classList.contains('open')) {
        fp.style.transition = 'none'; fp.classList.remove('open');
        requestAnimationFrame(() => { fp.style.transition = ''; });
        if (window._deskFolderStack) window._deskFolderStack.length = 0;
      }
      p.style.zIndex = '302';
      _panel = id; p.classList.add('open');
      const meta = PANEL_META[id] || { label: id.replace('panel-', '') };
      _openPanels.set(id, { label: meta.label });
      updateActiveDbtn(id);
      if (id === 'panel-build'   && window.YM_Build)   window.YM_Build.render();
      if (id === 'panel-profile' && window.YM_Profile) window.YM_Profile.render();
      if (id === 'panel-mine') _initMinePanel();
      pushNav({ type: 'panel', id });
      return;
    }

    if (_panel && _panel !== id) {
      const el = document.getElementById(_panel);
      if (el) { el.classList.remove('open'); el.style.zIndex = ''; }
      _panel = null; _prevPanel = null;
    }
    const p = document.getElementById(id); if (!p) return;

    const fp = document.getElementById('panel-folder');
    if (fp && fp.classList.contains('open')) {
      fp.style.transition = 'none'; fp.classList.remove('open');
      requestAnimationFrame(() => { fp.style.transition = ''; });
      if (window._deskFolderStack) window._deskFolderStack.length = 0;
    }
    if (id !== 'panel-sphere') {
      const sp = document.getElementById('panel-sphere');
      if (sp && sp.classList.contains('open') && _prevPanel !== 'panel-sphere') {
        sp.classList.remove('open'); sp.style.zIndex = '';
      }
    }
    if (id === 'panel-profile' || id === 'panel-mine' || id === 'panel-profile-view') {
      p.style.zIndex = '302';
    } else {
      p.style.zIndex = '';
    }

    _panel = id;
    overlay.classList.add('open');
    p.classList.add('open');
    if (id !== 'panel-sphere' && id !== 'panel-spheres') {
      const meta = PANEL_META[id] || { label: id.replace('panel-', '') };
      _openPanels.set(id, { label: meta.label });
    }
    updateActiveDbtn(id);
    if (id === 'panel-build'   && window.YM_Build)   window.YM_Build.render();
    if (id === 'panel-profile' && window.YM_Profile) window.YM_Profile.render();
    if (id === 'panel-mine') _initMinePanel();
    pushNav({ type: 'panel', id });
  }

  function _initMinePanel() {
    setTimeout(() => {
      if (window.YM_Mine) window.YM_Mine.render(document.getElementById('panel-mine-wallet'));
      setupMineTabs();
      const bar    = document.getElementById('mine-tabs-bar');
      const active = bar && bar.querySelector('.ym-tab.active');
      if (active) switchMineTab(active.dataset.mineTab || 'wallet');
    }, 0);
  }

  function reducePanel() {
    if (!_panel) return;
    const el = document.getElementById(_panel);
    if (el) { el.classList.remove('open'); el.style.zIndex = ''; }
    if (_prevPanel) {
      const prev = document.getElementById(_prevPanel);
      if (prev && prev.classList.contains('open')) {
        _panel = _prevPanel; _prevPanel = null; updateActiveDbtn(_panel); return;
      }
      _prevPanel = null;
    }
    document.querySelectorAll('.ym-panel').forEach(p => { p.style.zIndex = ''; });
    overlay.classList.remove('open');
    _panel = null; updateActiveDbtn(null);
  }

  /* Panel handle/head close gestures */
  document.querySelectorAll('.ym-panel').forEach(panel => {
    const head   = panel.querySelector('.panel-head');
    const handle = panel.querySelector('.panel-handle');
    let sy = 0;
    if (handle) {
      handle.addEventListener('pointerdown', e => { sy = e.clientY; });
      handle.addEventListener('pointerup',   e => { if (_panel && (e.clientY - sy > 40 || Math.abs(e.clientY - sy) < 8)) reducePanel(); });
    }
    if (head) head.addEventListener('click', e => {
      if (!e.target.closest('button') && !e.target.closest('input') && _panel) reducePanel();
    });
  });

  overlay.addEventListener('click', () => {
    if (Date.now() < _blockOverlayUntil) return;
    reducePanel();
  });

  document.getElementById('nav-bar').addEventListener('click', e => {
    if (e.target.closest('.dbtn')) return;
    if (sw && sw.classList.contains('open')) { closeSwitcher(); return; }
    const fp = document.getElementById('panel-folder');
    if (fp && fp.classList.contains('open') && window.YM_closeFolderPanel) { window.YM_closeFolderPanel(); return; }
    if (_panel) reducePanel();
  });

  /* ═══════════════════════════════════════════════════════════
   * NAVIGATION HISTORY
   * ═══════════════════════════════════════════════════════════ */
  history.replaceState({ t: 'root', stack: [] }, '', '#');

  window.addEventListener('popstate', e => {
    const state = e.state || { t: 'root', stack: [] };
    navStack.length = 0;
    (state.stack || []).forEach(s => navStack.push(s));
    document.querySelectorAll('.ym-panel.open').forEach(p => p.classList.remove('open'));
    overlay.classList.remove('open');
    _panel = null; updateActiveDbtn(null);
    if (state.t === 'root') return;
    const lastPanel = navStack.slice().reverse().find(s => s.type === 'panel');
    if (lastPanel) {
      const p = document.getElementById(lastPanel.id);
      if (p) { p.classList.add('open'); overlay.classList.add('open'); _panel = lastPanel.id; updateActiveDbtn(lastPanel.id); }
    }
    if (lastPanel && lastPanel.id === 'panel-sphere') {
      const entry = navStack.slice().reverse().find(s => s.type === 'panel' && s.id === 'panel-sphere');
      if (entry && entry.sphereId && window.YM_sphereRegistry) {
        const s = window.YM_sphereRegistry.get(entry.sphereId);
        if (s) {
          document.getElementById('sphere-panel-title').textContent = s.name || entry.sphereId.replace('.sphere.js', '');
          const body = document.getElementById('panel-sphere-body');
          if (body) { body.innerHTML = ''; if (typeof s.renderPanel === 'function') s.renderPanel(body); }
        }
      }
    }
  });

  function pushNav(entry) {
    navStack.push(entry);
    const stack = navStack.map(s => { const o = {}; Object.keys(s).forEach(k => { if (k !== 'restore') o[k] = s[k]; }); return o; });
    history.pushState({ t: entry.type, stack }, '', '#' + (entry.id || entry.panelId) + (entry.tabId ? '/' + entry.tabId : ''));
  }

  function checkURLRoute() {
    const raw = location.pathname.replace(/^\//, '') || location.hash.replace('#', '').replace(/^panel-[\w-]+\/?/, '');
    const m = raw.match(/^([\w-]+)\.sphere(\.js)?$/i);
    if (m) setTimeout(async () => {
      const n = m[1] + '.sphere.js';
      if (window.YM_sphereRegistry && !window.YM_sphereRegistry.has(n)) {
        try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(n); } catch (ex) {}
      }
      openSpherePanel(n);
    }, 1400);
  }
  window.addEventListener('hashchange', checkURLRoute);
  setTimeout(checkURLRoute, 100);

  function togglePanel(id, onOpen) {
    if (_panel === id) reducePanel();
    else { openPanel(id); if (onOpen) onOpen(); }
  }

  /* ═══════════════════════════════════════════════════════════
   * BOUTONS DOCK
   * ═══════════════════════════════════════════════════════════ */
  document.getElementById('btn-back').addEventListener('click', () => {
    if (sw.classList.contains('open')) { closeSwitcher(); return; }
    if (_panel && (_openPanels.size + _openSpheres.size > 0)) {
      reducePanel();
      requestAnimationFrame(() => { renderSwitcherCards(); sw.classList.add('open'); });
      return;
    }
    if (_panel) { reducePanel(); return; }
    if (_openPanels.size + _openSpheres.size > 0) { renderSwitcherCards(); sw.classList.add('open'); return; }
    openPanel('panel-spheres');
    if (window.YM_Liste) window.YM_Liste.render();
  });

  document.getElementById('btn-profile').addEventListener('click', () =>
    togglePanel('panel-profile', () => { if (window.YM_Profile) window.YM_Profile.render(); }));

  const psbtn = document.getElementById('profile-share-btn');
  if (psbtn) psbtn.addEventListener('click', () => { if (window.YM_Profile) window.YM_Profile.showShare(); });

  document.getElementById('btn-figure').addEventListener('click', () => togglePanel('panel-mine'));

  const buildBtn = document.getElementById('spheres-build-btn');
  if (buildBtn) buildBtn.addEventListener('click', () => {
    reducePanel(); openPanel('panel-mine');
    setTimeout(() => {
      setupMineTabs();
      const bar = document.getElementById('mine-tabs-bar');
      if (bar) {
        bar.querySelectorAll('.ym-tab').forEach(t => t.classList.remove('active'));
        const bt = bar.querySelector('[data-mine-tab="build"]');
        if (bt) bt.classList.add('active');
        switchMineTab('build');
      }
    }, 50);
  });

  const bgSphBtn = document.getElementById('bg-spheres');
  if (bgSphBtn) bgSphBtn.addEventListener('click', () => {
    document.getElementById('bg-dlg').classList.remove('open');
    openPanel('panel-spheres');
    if (window.YM_Liste) window.YM_Liste.render();
  });

  /* ═══════════════════════════════════════════════════════════
   * SPHERE REGISTRY + ACTIVATION
   * ═══════════════════════════════════════════════════════════ */
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
        get(k)    { try { return JSON.parse(localStorage.getItem('ym_s|' + name + '|' + k)); } catch { return null; } },
        set(k, v) { try { localStorage.setItem('ym_s|' + name + '|' + k, JSON.stringify(v)); } catch {} },
        del(k)    { localStorage.removeItem('ym_s|' + name + '|' + k); },
      },
      setNotification(n) { if (window.YM_Desk) window.YM_Desk.setNotif(name, n); },
      openPanel(fn) {
        if (fn) { document.getElementById('panel-sphere-body').innerHTML = ''; fn(document.getElementById('panel-sphere-body')); }
        openPanel('panel-sphere');
      },
      toast(msg, type) { if (_rateOk(_toastTs, _TOAST_MAX, _TOAST_WIN)) toast(msg, type); },
      setTabBadge(container, tabId, count) {
        const tab = container && container.querySelector('.ym-tab[data-tab="' + tabId + '"]'); if (!tab) return;
        let badge = tab.querySelector('.ym-tab-badge');
        if (count > 0) { if (!badge) { badge = document.createElement('span'); badge.className = 'ym-tab-badge'; tab.appendChild(badge); } badge.textContent = count; }
        else if (badge) badge.remove();
      },
      _cleanup() { _l.forEach(h => window.removeEventListener('ym:p2p-data', h)); _l.length = 0; },
    };
  }

  let _sA = false;
  const _ACT_TIMEOUT    = 8000;
  const MANDATORY_SPHERES = ['social.sphere.js'];

  async function activateSphere(name, obj) {
    if (window.YM_sphereRegistry.has(name)) return;
    const ctx = mkCtx(name);
    obj._ctx = ctx;
    window.YM_sphereRegistry.set(name, obj);
    if (window.YM_Desk) window.YM_Desk.addIcon(name, obj.icon || '⬡', obj.name || name.replace('.sphere.js', ''));
    else setTimeout(() => { if (window.YM_Desk) window.YM_Desk.addIcon(name, obj.icon || '⬡', obj.name || name.replace('.sphere.js', '')); }, 500);

    if (typeof obj.activate === 'function') {
      _sA = true;
      try {
        const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('activation timeout')), _ACT_TIMEOUT));
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
    _openSpheres.delete(name);
    log('deactivate', { sphere: name });
    window.dispatchEvent(new CustomEvent('ym:sphere-deactivated', { detail: { name } }));
    if (window.YM_Desk) window.YM_Desk.autoCleanPages();
  }

  async function openSpherePanel(id) {
    if (window.YM_Desk) window.YM_Desk.setNotif(id, 0);
    let s = window.YM_sphereRegistry.get(id);
    if (!s) { try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(id); } catch {} s = window.YM_sphereRegistry.get(id); }
    if (!s) { toast('Sphere not found', 'error'); return; }

    document.getElementById('sphere-panel-title').textContent = s.name || id.replace('.sphere.js', '');

    let settingsBtn = document.getElementById('sphere-panel-settings');
    if (!settingsBtn) {
      settingsBtn = document.createElement('button');
      settingsBtn.id        = 'sphere-panel-settings';
      settingsBtn.className = 'ym-btn ym-btn-ghost';
      settingsBtn.style.cssText = 'padding:4px 8px;font-size:13px;min-height:unset';
      settingsBtn.textContent = '⚙';
      document.querySelector('#panel-sphere .panel-head').appendChild(settingsBtn);
    }
    settingsBtn.onclick = () => { openPanel('panel-profile'); if (window.YM_Profile) window.YM_Profile.renderFor(id); };
    settingsBtn.style.display = s.profileSection ? '' : 'none';

    const body = document.getElementById('panel-sphere-body');
    body.innerHTML = '';
    if (typeof s.renderPanel === 'function') {
      try { s.renderPanel(body); }
      catch (e) {
        console.error('[YM] renderPanel crash:', id, e);
        body.innerHTML = '<div class="ym-notice error" style="margin:16px">⚠️ ' + esc(s.name || id) + ' encountered an error.<br><small style="color:var(--text3)">' + esc(e.message) + '</small></div>';
      }
    } else {
      body.innerHTML = '<div class="ym-notice info">' + esc(s.description || 'No content.') + '</div>';
    }

    const panelEl = document.getElementById('panel-sphere');
    _openSpheres.set(id, {
      label:   s.name || id.replace('.sphere.js', ''),
      snapshot: panelEl ? panelEl.innerHTML : '',
      panelW:   panelEl ? panelEl.offsetWidth  || window.innerWidth  : window.innerWidth,
      panelH:   panelEl ? panelEl.offsetHeight || window.innerHeight : window.innerHeight,
    });

    openPanel('panel-sphere');
    log('open', { sphere: id });
  }

  function openProfilePanel(profile) {
    const dn = profile.name || (profile.uuid ? profile.uuid.slice(0, 8) + '…' : '') || 'Profile';
    document.getElementById('profile-view-title').textContent = dn;
    const body = document.getElementById('panel-profile-view-body');
    body.innerHTML = '';
    if (window._renderProfileView) window._renderProfileView(body, profile);
    openPanel('panel-profile-view');
    log('open', { profile: profile.uuid });
  }

  /* ═══════════════════════════════════════════════════════════
   * SÉCURITÉ fetch / localStorage
   * ═══════════════════════════════════════════════════════════ */
  const _f   = window.fetch.bind(window);
  window.fetch = function (i, o) { return _f(i, o); };
  Object.defineProperty(window, 'fetch', { configurable: false, writable: false, value: window.fetch });

  const _lsS = localStorage.setItem.bind(localStorage);
  const _lsR = localStorage.removeItem.bind(localStorage);
  localStorage.setItem    = function (k, v) { if (window._ym_sl && k === PK) { console.warn('[YM] blocked'); return; } return _lsS(k, v); };
  localStorage.removeItem = function (k)    { if (window._ym_sl && k === PK) { console.warn('[YM] blocked'); return; } return _lsR(k); };

  /* ═══════════════════════════════════════════════════════════
   * P2P (Trystero)
   * ═══════════════════════════════════════════════════════════ */
  const YM_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.wirednet.jp', 'wss://nostr.oxtr.dev'];

  async function initP2P() {
    window.addEventListener('error', e => { if (e.message && (e.message.includes('WebSocket') || e.message.includes('wss://'))) e.stopImmediatePropagation(); }, true);
    const _w = console.warn, _e = console.error;
    console.warn  = function () { if (typeof arguments[0] === 'string' && (arguments[0].includes('Trystero') || arguments[0].includes('wss://'))) return; _w.apply(console, arguments); };
    console.error = function () { if (typeof arguments[0] === 'string' && (arguments[0].includes('WebSocket') || arguments[0].includes('wss://'))) return; _e.apply(console, arguments); };

    for (const cdn of ['https://cdn.jsdelivr.net/npm/trystero@0.21.0/+esm', 'https://esm.run/trystero@0.21.0']) {
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

  /* ═══════════════════════════════════════════════════════════
   * LOADERS
   * ═══════════════════════════════════════════════════════════ */
  function loadScript(src) {
    // URLs GitHub (raw ou jsDelivr) → fetch + blob pour bypasser tout cache HTTP.
    // URLs locales → <script src> classique.
    if (src.startsWith('https://')) {
      const url = src + (src.includes('?') ? '&' : '?') + '_=' + Date.now();
      return fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + src); return r.text(); })
        .then(code => new Promise((res, rej) => {
          const blob    = new Blob([code], { type: 'text/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          const s = document.createElement('script');
          s.src     = blobUrl;
          s.onload  = () => { URL.revokeObjectURL(blobUrl); res(); };
          s.onerror = () => { URL.revokeObjectURL(blobUrl); rej(new Error('exec failed: ' + src)); };
          document.head.appendChild(s);
        }));
    }
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
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

  /* ═══════════════════════════════════════════════════════════
   * window.YM — API publique exposée aux spheres
   * ═══════════════════════════════════════════════════════════ */
  window.YM = {
    toast, openPanel, closePanel: reducePanel, openSwitcher, closeSwitcher,
    openSpherePanel, openProfilePanel, activateSphere, deactivateSphere,
    addIconToDesktop:    (id, icon, label) => { if (window.YM_Desk) window.YM_Desk.addIcon(id, icon, label); },
    removeIconFromDesktop: id => { if (window.YM_Desk) window.YM_Desk.removeIcon(id); },
    activateSphereByName(n) {
      const id = n.endsWith('.sphere.js') ? n : n + '.sphere.js';
      if (window.YM_sphereRegistry && window.YM_sphereRegistry.has(id)) openSpherePanel(id);
      else toast('Not active: ' + n, 'warn');
    },
    getProfile: LP, saveProfile: SP, createCtx: mkCtx, loadSphereFromURL: loadSphereURL,
    p2p:            () => window.YM_P2P,
    setIconNotif:   (id, n) => { if (window.YM_Desk) window.YM_Desk.setNotif(id, n); },
  };

  /* ═══════════════════════════════════════════════════════════
   * SIGN WALLET CONFIRMATION
   * ═══════════════════════════════════════════════════════════ */
  function _wrapSignWithConfirmation() {
    if (!window.YM_Mine_sign || window.YM_Mine_sign._wrapped) return;
    const _orig = window.YM_Mine_sign;
    window.YM_Mine_sign = async function (message, callerSphereId) {
      let parsed = {}; try { parsed = JSON.parse(message); } catch {}
      const sphereName = callerSphereId
        ? (window.YM_sphereRegistry.get(callerSphereId) || {}).name || callerSphereId
        : 'Unknown sphere';
      return new Promise((resolve, reject) => {
        const dlg       = document.getElementById('ym-sign-dlg');
        const sphereEl  = document.getElementById('ym-sign-sphere');
        const detailEl  = document.getElementById('ym-sign-detail');
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

  /* ═══════════════════════════════════════════════════════════
   * INIT
   * ═══════════════════════════════════════════════════════════ */

  // GitHub raw — cache-bust automatique via fetch+blob dans loadScript()
  const GH_BASE = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/';

  async function init() {
    OC();
    if (window.YM_Desk) window.YM_Desk.deskInit();

    // Charge les modules depuis GitHub raw (cache-bust via fetch+blob)
    for (const m of ['mine.js', 'liste.js', 'build.js', 'profile.js']) {
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

    /* Masque le loader dès que les fontes sont prêtes */
    const hideLdr = () => { const l = document.getElementById('ym-loader'); if (l) l.classList.add('hidden'); };
    const t0 = performance.now();
    document.fonts.ready.then(() => {
      const elapsed = performance.now() - t0;
      setTimeout(hideLdr, Math.max(0, 400 - elapsed));
    }).catch(() => setTimeout(hideLdr, 400));

    /* PWA install prompt */
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

  /* Lance tout */
  init();

})();
