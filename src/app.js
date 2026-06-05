/**
 * app.js — YourMine core logic
 * GitHub: theodoreyong9/YourMinedApp/src/app.js
 */

;(function () {
  'use strict';

  const toast = (...a) => window.YM_toast(...a);
  const esc   = (...a) => window.YM_escHtml(...a);

  // Derive profile key from active theme URL — stable across reloads
  const _themeUrl = localStorage.getItem('ym_theme_url') || '';
  const _isTestTheme = _themeUrl.includes('test');
  const _testHash = _isTestTheme ? (localStorage.getItem('ym_profile_key') || 'ym_profile_test_v1') : null;
  const PK = () => _isTestTheme ? (_testHash || 'ym_profile_test_v1') : 'ym_profile_v1';
  const AK = 'ym_activity_v1';

  function gid() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }

  function LP() { try { return JSON.parse(localStorage.getItem(PK()) || 'null'); } catch { return null; } }
  function SP(d) {
    const p = Object.assign({}, LP() || {}, d);
    localStorage.setItem(PK(), JSON.stringify(p));
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

  const p2pS = new Map(), p2pR = new Map(), GAP = 3000;
  function cS(id) { const n = Date.now(); if (n - (p2pS.get(id) || 0) < GAP) return false; p2pS.set(id, n); return true; }
  function cR(id) { const n = Date.now(); if (n - (p2pR.get(id) || 0) < GAP) return false; p2pR.set(id, n); return true; }

  const overlay = document.getElementById('panel-overlay');
  const sw      = document.getElementById('panel-switcher');

  let _panel    = null;
  let _currentSphereId = null;
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

  window.app_switchMineTab = (tab) => switchMineTab(tab);

  function switchMineTab(tab) {
    const w = document.getElementById('panel-mine-wallet');
    const b = document.getElementById('panel-mine-build');
    const f = document.getElementById('panel-mine-formula');
    const l = document.getElementById('panel-mine-liste');

    [w, b, f, l].forEach(el => {
      if (!el) return;
      el.style.cssText = 'display:none !important; flex:0; min-height:0;';
    });

    if (tab === 'wallet' && w) {
      w.style.cssText = 'display:flex; flex:1; flex-direction:column; overflow-y:auto; min-height:0;';
      if (window.YM_Mine) window.YM_Mine.render(w);
    }
    else if (tab === 'build' && b) {
      b.style.cssText = 'display:flex; flex:1; flex-direction:column; overflow:hidden; min-height:0;';
      b.innerHTML = '';
      if (window.YM_Build) window.YM_Build.render(b);
    }
    else if (tab === 'formula' && f) {
      f.style.cssText = 'display:flex; flex:1; flex-direction:column; overflow-y:auto; padding:16px;';
      renderFormulaTab();
    }
    else if (tab === 'liste' && l) {
      l.style.cssText = 'display:flex; flex:1; flex-direction:column; overflow:hidden; min-height:0;';
      if (window.YM_Liste) {
        // Always re-render to ensure fresh state
        window.YM_Liste.render(l);
      } else {
        l.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px">Loading…</div>';
        // Retry once YM_Liste is available
        const iv = setInterval(() => {
          if (window.YM_Liste) { clearInterval(iv); window.YM_Liste.render(l); }
        }, 300);
        setTimeout(() => clearInterval(iv), 5000);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * SWITCHER
   * ═══════════════════════════════════════════════════════════ */

  function _buildClonePreview(sourceEl, cardEl, cardW, cardH) {
    const preview = document.createElement('div');
    preview.className = 'sw-preview';
    const wrap = document.createElement('div');
    wrap.className = 'sw-clone-wrap';

    const pw = sourceEl._snapshotWidth  || sourceEl.offsetWidth  || window.innerWidth;
    const ph = sourceEl._snapshotHeight || sourceEl.offsetHeight || window.innerHeight;
    const cw = cardW || (cardEl ? cardEl.offsetWidth  : 0) || Math.round(window.innerWidth / 2 - 10);
    const isDesktop = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    const totalH = cardH || (cardEl ? cardEl.offsetHeight : 0) || (isDesktop ? 130 : 160);
    const ch = Math.max(40, totalH - 30);

    if (pw <= 0 || cw <= 0) { preview.appendChild(wrap); return preview; }

    const sc  = Math.min(cw / pw, 1);
    const visH = Math.min(ph, Math.ceil(ch / sc));

    const clone = document.createElement('div');
    clone.style.cssText =
      'position:relative;width:'+pw+'px;height:'+visH+'px;overflow:hidden;'+
      'background:inherit;pointer-events:none;flex-shrink:0;';

    const toClone = sourceEl.querySelectorAll('.panel-head,.panel-body,.ym-tabs');
    if (toClone.length) {
      toClone.forEach(el => {
        const deep = el.cloneNode(true);
        deep.removeAttribute('id');
        deep.style.position = 'relative';
        deep.style.transform = 'none';
        deep.style.transition = 'none';
        deep.style.animation = 'none';
        deep.querySelectorAll('*').forEach(child => {
          child.removeAttribute('id');
          child.style.animation = 'none';
          child.style.transition = 'none';
          child.style.pointerEvents = 'none';
          const cs = getComputedStyle(child);
          if (cs.position === 'fixed') child.style.position = 'relative';
        });
        deep.querySelectorAll('button,input,textarea,select,canvas,video,audio,script').forEach(el => el.remove());
        clone.appendChild(deep);
      });
    } else {
      const deep = sourceEl.cloneNode(true);
      deep.removeAttribute('id');
      deep.style.cssText = 'position:relative;transform:none;transition:none;width:'+pw+'px;height:'+visH+'px;overflow:hidden;pointer-events:none;';
      deep.querySelectorAll('*').forEach(child => {
        child.removeAttribute('id');
        child.style.animation = 'none';
        child.style.transition = 'none';
        child.style.pointerEvents = 'none';
        if (window.getComputedStyle(child).position === 'fixed') child.style.position = 'relative';
      });
      deep.querySelectorAll('button,input,textarea,select,canvas,video,audio,script,.panel-handle').forEach(el => el.remove());
      clone.appendChild(deep);
    }

    if (sourceEl._needsRemoval) sourceEl.remove();

    wrap.style.cssText =
      'position:absolute;top:0;left:0;'+
      'width:'+pw+'px;height:'+visH+'px;'+
      'transform:scale('+sc+');transform-origin:top left;'+
      'overflow:hidden;pointer-events:none;';
    wrap.appendChild(clone);
    preview.appendChild(wrap);
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

  function _makeCard(label, getSourceEl, onTap, onDismiss, buildPreviewNow) {
    const card = document.createElement('div');
    card.className = 'sw-card';

    const previewSlot = document.createElement('div');
    previewSlot.className = 'sw-preview';
    card.appendChild(previewSlot);

    const lbl = document.createElement('div');
    lbl.className = 'sw-label';
    lbl.textContent = label;
    card.appendChild(lbl);

    const doPreview = () => {
      const sourceEl = getSourceEl();
      if (!sourceEl) return;
      const cardW = card.offsetWidth;
      const cardH = card.offsetHeight;
      const preview = _buildClonePreview(sourceEl, card, cardW, cardH);
      card.replaceChild(preview, card.querySelector('.sw-preview') || previewSlot);
    };

    if (buildPreviewNow !== false) {
      requestAnimationFrame(doPreview);
    }
    card._buildPreview = doPreview;

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

  function _buildSwitcherRows(buildPreviews) {
    buildPreviews = buildPreviews !== false;
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
    items.forEach(item => grid.appendChild(_makeCard(item.label, item.getEl, item.onTap, item.onDel, buildPreviews)));
  }

  function renderSwitcherCards(buildPreviews) {
    const grid = document.getElementById('switcher-grid');
    if (buildPreviews === true && grid) {
      grid.querySelectorAll('.sw-card').forEach(card => {
        if (card._buildPreview) card._buildPreview();
      });
      return;
    }
    const bp = buildPreviews !== false;
    _buildSwitcherRows(bp);
  }

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
    renderSwitcherCards(false);
    sw.classList.add('open');
    setTimeout(() => { renderSwitcherCards(true); }, 180);
  }

  (() => {
    const h = document.getElementById('switcher-handle');
    let sy = 0;
    if (h) {
      h.addEventListener('pointerdown', e => { sy = e.clientY; });
      h.addEventListener('pointerup',   e => { if (e.clientY - sy > 30) closeSwitcher(); });
    }
  })();

  window.YM_Switcher = { open: openSwitcher, close: closeSwitcher, render: renderSwitcherCards };

  /* ═══════════════════════════════════════════════════════════
   * PANELS
   * ═══════════════════════════════════════════════════════════ */
  let _blockOverlayUntil = 0;

  function updateActiveDbtn(panelId, tab) {
    document.getElementById('nav-bar').addEventListener('contextmenu', e => e.preventDefault());
    document.querySelectorAll('.dbtn').forEach(b => {
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.classList.remove('active');
    });
    if (!panelId) return;
    // Find which button matches this panel+tab combo, respecting YM_NAV_CONFIG
    let matched = null;
    document.querySelectorAll('.dbtn').forEach(b => {
      const cfg = window.YM_NAV_CONFIG?.[b.id];
      const btnPanel = cfg?.panel ?? (b.id === 'btn-wallet' ? 'panel-mine' : b.id === 'btn-figure' ? 'panel-mine' : b.id === 'btn-profile' ? 'panel-profile' : null);
      const btnTab   = cfg?.tab   ?? (b.id === 'btn-wallet' ? 'wallet' : b.id === 'btn-figure' ? 'liste' : null);
      if (btnPanel === panelId) {
        if (!tab || !btnTab || btnTab === tab) {
          if (!matched) matched = b;
        }
      }
    });
    // Fallback to static map
    if (!matched) {
      const map = { 'panel-profile': 'btn-profile', 'panel-mine': 'btn-figure', 'panel-spheres': 'btn-figure' };
      const btnId = map[panelId];
      if (btnId) matched = document.getElementById(btnId);
    }
    if (matched) matched.classList.add('active');
  }

  function openPanel(id) {
    sw.classList.remove('open');

    if (id !== 'panel-sphere') {
      const sp = document.getElementById('panel-sphere');
      if (sp && sp.classList.contains('open')) {
        sp.classList.remove('open'); sp.style.zIndex = '';
        if (_panel === 'panel-sphere') { _panel = null; _prevPanel = null; }
      }
    }

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
      const isDesktop2 = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
      const pw2 = p.offsetWidth || (isDesktop2 ? Math.min(560, window.innerWidth - 72) : window.innerWidth);
      const ph2 = p.offsetHeight || (isDesktop2 ? window.innerHeight : window.innerHeight - 80);
      _openPanels.set(id, { label: meta.label, panelW: pw2, panelH: ph2 });
    }
    updateActiveDbtn(id);
    if (id === 'panel-build'   && window.YM_Build)   window.YM_Build.render();
    if (id === 'panel-profile' && window.YM_Profile) window.YM_Profile.render();
    if (id === 'panel-mine') _initMinePanel();
    pushNav({ type: 'panel', id });
  }

  function _initMinePanel() {
    setTimeout(() => {
      ['panel-mine-wallet','panel-mine-build','panel-mine-formula','panel-mine-liste'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.style.flex = ''; }
      });
      setupMineTabs();
      const bar    = document.getElementById('mine-tabs-bar');
      const active = bar && bar.querySelector('.ym-tab.active');
      const tab    = (active && active.dataset.mineTab) || 'wallet';
      if (bar) bar.querySelectorAll('.ym-tab').forEach(t => t.classList.toggle('active', t.dataset.mineTab === tab));
      switchMineTab(tab);
    }, 0);
  }

  function reducePanel() {
    if (!_panel) return;
    const el = document.getElementById(_panel);

    // Take snapshot at reduce time — panel is full and representative
    if (_panel === 'panel-sphere' && _currentSphereId) {
      const panelEl = document.getElementById('panel-sphere');
      if (panelEl && _openSpheres.has(_currentSphereId)) {
        const data = _openSpheres.get(_currentSphereId);
        _openSpheres.set(_currentSphereId, {
          ...data,
          snapshot: panelEl.innerHTML,
          panelW: panelEl.offsetWidth || data.panelW,
          panelH: panelEl.offsetHeight || data.panelH,
        });
      }
    }
    if (_panel === 'panel-folder' || _panel === 'panel-profile-view') {
      const panelEl = document.getElementById(_panel);
      if (panelEl) {
        _openPanels.forEach((data, pid) => {
          if (data.panelId === _panel || pid === _panel) {
            _openPanels.set(pid, {
              ...data,
              snapshot: panelEl.innerHTML,
              panelW: panelEl.offsetWidth || data.panelW,
              panelH: panelEl.offsetHeight || data.panelH,
            });
          }
        });
      }
    }

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

  let _deskMouseSX = 0, _deskMouseSY = 0;
  document.getElementById('desktop').addEventListener('mousedown', e => {
    _deskMouseSX = e.clientX; _deskMouseSY = e.clientY;
  }, { passive: true });
  document.getElementById('desktop').addEventListener('click', e => {
    if (e.target.closest('.icon-wrap')) return;
    if (e.target.closest('#drag-ghost')) return;
    const dx = Math.abs(e.clientX - _deskMouseSX);
    const dy = Math.abs(e.clientY - _deskMouseSY);
    if (dx > 10 || dy > 10) return;
    if (sw && sw.classList.contains('open')) { closeSwitcher(); return; }
    if (_panel) reducePanel();
  });

  (() => {
    let _sx = 0, _sy = 0, _active = false;
    document.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      _sx = e.touches[0].clientX;
      _sy = e.touches[0].clientY;
      _active = _sx < 30;
    }, { passive: true, capture: true });
    document.addEventListener('touchend', e => {
      if (!_active) return;
      _active = false;
      const dx = e.changedTouches[0].clientX - _sx;
      const dy = Math.abs(e.changedTouches[0].clientY - _sy);
      if (dx > 50 && dy < 100) {
        if (_panel) { reducePanel(); return; }
        if (sw.classList.contains('open')) { closeSwitcher(); return; }
      }
    }, { passive: true, capture: true });
  })();

  window.YM = window.YM || {};
  window.YM.closePanel   = () => { if (_panel) reducePanel(); else if (sw.classList.contains('open')) closeSwitcher(); };
  window.YM.openPanel    = (id) => openPanel(id);
  window.YM.openSwitcher = () => openSwitcher();

  (() => {
    const edgeBtn = document.getElementById('_ym_edge_btn');
    if (!edgeBtn) return;
    edgeBtn.addEventListener('click', () => {
      if (_panel) { reducePanel(); return; }
      if (sw.classList.contains('open')) { closeSwitcher(); return; }
    });
    const sphBtn = document.getElementById('_ym_edge_sph');
    if (sphBtn) sphBtn.addEventListener('click', () => openPanel('panel-mine'));
  })();

  document.getElementById('nav-bar').addEventListener('click', e => {
    if (e.target.closest('.dbtn')) return;
    if (sw && sw.classList.contains('open')) { closeSwitcher(); return; }
    const fp = document.getElementById('panel-folder');
    if (fp && fp.classList.contains('open') && window.YM_closeFolderPanel) { window.YM_closeFolderPanel(); return; }
    if (_panel) { reducePanel(); return; }
    // No panel open — if not on page 0, go back to page 0
    if (window._deskCurPage > 0 && window.YM_Desk) {
      window.YM_Desk.goPage(0, true);
    }
  });

  /* ═══════════════════════════════════════════════════════════
   * NAVIGATION HISTORY
   * ═══════════════════════════════════════════════════════════ */
  history.replaceState({ t: 'root', stack: [] }, '', '#');

  window.addEventListener('popstate', e => {
    const state = e.state || { t: 'root', stack: [] };
    navStack.length = 0;
    (state.stack || []).forEach(s => navStack.push(s));
    if (sw && sw.classList.contains('open')) closeSwitcher();
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
    const parts = location.pathname.replace(/^\//, '').split('/').filter(Boolean);
    const _GH_RAW = window._YM_GH_RAW || 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/';
    const THEMES_FILES_URL = _GH_RAW.replace('/src/', '/') + 'themes-files.json';

    let themeSegment  = null;
    let sphereSegment = null;

    parts.forEach(function(seg) {
      const tm = seg.match(/^([\w-]+)\.theme$/i);
      if (tm) themeSegment = tm[1];
      const sm = seg.match(/^([\w-]+)\.sphere(\.js)?$/i);
      if (sm) sphereSegment = sm[1] + '.sphere.js';
    });

    const handleSphere = () => {
      if (!sphereSegment) return;
      const n = sphereSegment;
      setTimeout(async () => {
        if (window.YM_sphereRegistry && !window.YM_sphereRegistry.has(n)) {
          try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(n); } catch {}
        }
        openSpherePanel(n);
      }, 1400);
    };

    if (themeSegment) {
      (async () => {
        let themeUrl = null;
        try {
          const r = await fetch(THEMES_FILES_URL + '?t=' + Date.now(), { cache: 'no-store' });
          if (r.ok) {
            const list = await r.json();
            const entry = list.find(t =>
              (t.filename || '').replace(/\.theme\.html$/i,'').toLowerCase() === themeSegment.toLowerCase() ||
              (t.name || '').toLowerCase().replace(/\s+/g,'-') === themeSegment.toLowerCase()
            );
            if (entry && entry.codeUrl) themeUrl = entry.codeUrl;
          }
        } catch {}
        if (!themeUrl) {
          const c1 = _GH_RAW + 'themes/' + themeSegment + '.theme.html';
          try { const r = await fetch(c1 + '?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' }); if (r.ok) themeUrl = c1; } catch {}
        }
        if (!themeUrl) {
          const c2 = _GH_RAW + 'themes/' + themeSegment + '.html';
          try { const r = await fetch(c2 + '?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' }); if (r.ok) themeUrl = c2; } catch {}
        }
        if (!themeUrl) {
          toast('Thème "' + themeSegment + '" introuvable', 'error');
          history.replaceState(null, '', sphereSegment ? '/' + sphereSegment.replace('.sphere.js','.sphere') : '/');
          handleSphere();
          return;
        }
        const cur = localStorage.getItem('ym_theme_url') || '';
        if (themeUrl !== cur) {
          localStorage.setItem('ym_theme_url', themeUrl);
          localStorage.removeItem('ym_theme_cache');
          if (sphereSegment) {
            history.replaceState(null, '', '/' + sphereSegment.replace('.sphere.js','.sphere'));
          } else {
            history.replaceState(null, '', '/');
          }
          location.reload();
        } else {
          handleSphere();
        }
      })();
      return;
    }

    handleSphere();
  }

  setTimeout(function(){
    var _hasThemeSegment = location.pathname.split('/').some(function(s){ return /\.theme$/i.test(s); });
    if(_hasThemeSegment) checkURLRoute();
  }, 100);

  function togglePanel(id, onOpen) {
    if (_panel === id) reducePanel();
    else { openPanel(id); if (onOpen) onOpen(); }
  }

  /* ═══════════════════════════════════════════════════════════
   * BOUTONS DOCK
   * ═══════════════════════════════════════════════════════════ */
  document.getElementById('btn-back').addEventListener('click', () => {
    const _cfg = window.YM_NAV_CONFIG?.['btn-back'];
    // Switcher open
    if (sw.classList.contains('open')) {
      if (_cfg?.onSwitcher) { _cfg.onSwitcher(); return; }
      closeSwitcher(); return;
    }
    // Panel open + history
    if (_panel && (_openPanels.size + _openSpheres.size > 0)) {
      if (_cfg?.onPanel) { _cfg.onPanel(); return; }
      reducePanel();
      requestAnimationFrame(() => { renderSwitcherCards(); sw.classList.add('open'); });
      return;
    }
    // Panel open, no history
    if (_panel) { reducePanel(); return; }
    // History but no panel
    if (_openPanels.size + _openSpheres.size > 0) { renderSwitcherCards(); sw.classList.add('open'); return; }
    // Nothing open — fully configurable
    if (_cfg?.onEmpty) { _cfg.onEmpty(); return; }
    openPanel('panel-spheres');
    if (window.YM_Liste) window.YM_Liste.render();
  });

  document.getElementById('btn-profile').addEventListener('click', () => {
    const _cfg = window.YM_NAV_CONFIG?.['btn-profile'];
    const panel  = _cfg?.panel  ?? 'panel-profile';
    const onOpen = _cfg?.onOpen ?? (() => { if (window.YM_Profile) window.YM_Profile.render(); });
    togglePanel(panel, onOpen);
  });

  const psbtn = document.getElementById('profile-share-btn');
  if (psbtn) psbtn.addEventListener('click', () => { if (window.YM_Profile) window.YM_Profile.showShare(); });

  /* ── YM_NAV_CONFIG ────────────────────────────────────────────────────
   * Themes can override btn-figure / btn-wallet by declaring before load:
   * window.YM_NAV_CONFIG = {
   *   'btn-figure': { panel:'panel-spheres', tab:null, onOpen: fn },
   *   'btn-wallet': { panel:'panel-mine',    tab:'wallet' }
   * }
   * All keys optional — defaults apply if not declared.
   * ──────────────────────────────────────────────────────────────────── */
  function _wireNavBtn(btnId, defaultPanel, defaultTab, defaultOnOpen) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const cfg    = window.YM_NAV_CONFIG?.[btnId];
    const panel  = cfg?.panel  ?? defaultPanel;
    const tab    = cfg?.tab    !== undefined ? cfg.tab : defaultTab;
    const onOpen = cfg?.onOpen ?? defaultOnOpen ?? null;
    btn.addEventListener('click', () => {
      togglePanel(panel, () => {
        updateActiveDbtn(panel, tab);
        if (tab) {
          setTimeout(() => {
            setupMineTabs();
            const bar = document.getElementById('mine-tabs-bar');
            if (bar) bar.querySelectorAll('.ym-tab').forEach(t => t.classList.toggle('active', t.dataset.mineTab === tab));
            switchMineTab(tab);
          }, 50);
        }
        if (onOpen) onOpen();
      });
    });
  }

  _wireNavBtn('btn-figure', 'panel-mine', 'liste', null);
  _wireNavBtn('btn-wallet', 'panel-mine', 'wallet', null);

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
      setIcon(icon) { if (window.YM_Desk) window.YM_Desk.setIcon(name, icon); },
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

    if (!MANDATORY_SPHERES.includes(name)) {
      window.dispatchEvent(new CustomEvent('ym:sphere-before-activate', {
        detail: { filename: name, author: obj.ghAuthor||'', code: obj._sourceCode||'' }
      }));
    }
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
    if (MANDATORY_SPHERES.includes(name)) { toast('This sphere is mandatory', 'warn'); return; }
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

    const listeEl = document.getElementById('panel-mine-liste');
    if (listeEl && listeEl.style.display !== 'none' && window.YM_Liste) {
      // Let liste.js update in-place via _setInactive — already called above
      // Just refresh the list content without clearing the container
      const _sli = listeEl.querySelector('#sphere-list-inner');
      const _savedScroll = _sli ? _sli.scrollTop : 0;
      if (_sli) {
        // Only re-render the list items, not the whole container
        window.YM_Liste.renderList && window.YM_Liste.renderList(_sli.parentElement?.parentElement || listeEl);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const _sli2 = listeEl.querySelector('#sphere-list-inner');
          if (_sli2) _sli2.scrollTop = _savedScroll;
        }));
      } else {
        listeEl.innerHTML = '';
        window.YM_Liste.render(listeEl);
      }
    }
    const buildStandalone = document.getElementById('panel-build-body');
    if (buildStandalone && document.getElementById('panel-build')?.classList.contains('open') && window.YM_Build) {
      window.YM_Build.render(buildStandalone);
    }
    const buildMine = document.getElementById('panel-mine-build');
    if (buildMine && buildMine.style.display !== 'none' && window.YM_Build) {
      buildMine.innerHTML = '';
      window.YM_Build.render(buildMine);
    }
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
    // Panels use overflow:hidden by default — open it for spheres with renderPanel
    // so touch/pointer events reach canvas elements properly
    if (typeof s.renderPanel === 'function') {
      body.style.overflowY = 'auto';
      body.style.touchAction = 'manipulation';
      const _pb = body.closest('.panel-body');
      if (_pb) { _pb.style.overflowY = 'auto'; _pb.style.touchAction = 'manipulation'; }
    }
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
    const isDesktop = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    const deskPanelW = isDesktop ? Math.min(560, window.innerWidth - 72) : window.innerWidth;
    const deskPanelH = isDesktop ? window.innerHeight : (window.innerHeight - 80);
    _openSpheres.set(id, {
      label:   s.name || id.replace('.sphere.js', ''),
      snapshot: '',
      panelW:   panelEl ? (panelEl.offsetWidth  || deskPanelW) : deskPanelW,
      panelH:   panelEl ? (panelEl.offsetHeight || deskPanelH) : deskPanelH,
    });
    _currentSphereId = id;

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
  localStorage.setItem    = function (k, v) { if (window._ym_sl && k === PK()) { console.warn('[YM] blocked'); return; } return _lsS(k, v); };
  localStorage.removeItem = function (k)    { if (window._ym_sl && k === PK()) { console.warn('[YM] blocked'); return; } return _lsR(k); };

  /* ═══════════════════════════════════════════════════════════
   * P2P (Trystero — or any YM_TRANSPORT override)
   * ═══════════════════════════════════════════════════════════ */
  const YM_RELAYS = window.YM_RELAYS_OVERRIDE || ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.wirednet.jp', 'wss://nostr.oxtr.dev'];
  const YM_APPID  = window.YM_APPID_OVERRIDE  || 'yourmine-v1';
  const YM_ROOM   = window.YM_ROOM_OVERRIDE   || 'ym-main';

  async function initP2P() {
    window.addEventListener('error', e => { if (e.message && (e.message.includes('WebSocket') || e.message.includes('wss://'))) e.stopImmediatePropagation(); }, true);
    const _w = console.warn, _e = console.error;
    console.warn  = function () { if (typeof arguments[0] === 'string' && (arguments[0].includes('Trystero') || arguments[0].includes('wss://'))) return; _w.apply(console, arguments); };
    console.error = function () { if (typeof arguments[0] === 'string' && (arguments[0].includes('WebSocket') || arguments[0].includes('wss://'))) return; _e.apply(console, arguments); };

    // ── Transport override ──────────────────────────────────────────
    // Any theme or sphere can provide a custom transport by declaring:
    //   window.YM_TRANSPORT = {
    //     connect(roomId, appId),
    //     send(peerId, data),       // direct message — null peerId = broadcast
    //     onMessage(callback),      // callback(peerId, data)
    //     onPeerJoin(callback),     // callback(peerId)
    //     onPeerLeave(callback),    // callback(peerId)
    //   }
    if (window.YM_TRANSPORT) {
      try {
        const t = window.YM_TRANSPORT;
        await t.connect(YM_ROOM, YM_APPID);
        t.onMessage((pid, data) => {
          if ((data && data.type === 'social:presence') || cR(pid))
            window.dispatchEvent(new CustomEvent('ym:p2p-data', { detail: { peerId: pid, msg: data } }));
        });
        t.onPeerJoin(id => {
          window.dispatchEvent(new CustomEvent('ym:peer-join', { detail: { peerId: id } }));
          setTimeout(() => t.send(id, { sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }), 200);
        });
        t.onPeerLeave(id => {
          p2pS.delete(id); p2pR.delete(id);
          window.dispatchEvent(new CustomEvent('ym:peer-leave', { detail: { peerId: id } }));
        });
        window.YM_P2P = {
          broadcast(d)     { t.send(null, d); },
          sendTo(id, d)    { if (cS(id)) t.send(id, d); },
          transport: t,
        };
        setTimeout(() => t.send(null, { sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }), 800);
        setInterval(() => { if (!document.hidden) t.send(null, { sphere: 'social.sphere.js', type: 'social:presence-req', data: {} }); }, 30000);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            requestAnimationFrame(() => {
              t.send(null, { sphere: 'social.sphere.js', type: 'social:presence-req', data: {} });
              window.dispatchEvent(new CustomEvent('ym:peer-join', { detail: { peerId: '_self_' } }));
            });
          }
        });
        return;
      } catch(e) { _w('[YM] YM_TRANSPORT failed, falling back to Trystero:', e.message); }
    }

    // ── Default: Trystero over Nostr ────────────────────────────────
    for (const cdn of ['https://cdn.jsdelivr.net/npm/trystero@0.21.0/+esm', 'https://esm.run/trystero@0.21.0']) {
      try {
        const { joinRoom } = await import(cdn);
        const room = joinRoom({ appId: YM_APPID, relayUrls: YM_RELAYS }, YM_ROOM);
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
            requestAnimationFrame(() => {
              send({ sphere: 'social.sphere.js', type: 'social:presence-req', data: {} });
              window.dispatchEvent(new CustomEvent('ym:peer-join', { detail: { peerId: '_self_' } }));
            });
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

  function _normalizeExtURL(url){
    url = url.trim();
    if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace('stackblitz.com/edit/', 'stackblitz.com/preview/');
    url = url.replace('codesandbox.io/s/', 'codesandbox.io/embed/');
    return url;
  }

  function _makeIframeSphere(url, name){
    const icon = '⬡';
    let _bridgeCleanup = null;

    return {
      name, icon,
      description: url,
      _isExternalApp: true,
      _externalUrl: url,

      panel(container){
        if(_bridgeCleanup){ _bridgeCleanup(); _bridgeCleanup=null; }
        container.innerHTML = '';
        container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.3)';
        hdr.innerHTML =
          '<div style="flex:1;font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+url+'</div>'+
          '<a href="'+url+'" target="_blank" rel="noopener" style="color:var(--cyan);font-size:11px;text-decoration:none;flex-shrink:0;padding:4px">↗</a>';
        container.appendChild(hdr);

        const bar = document.createElement('div');
        bar.style.cssText = 'flex-shrink:0;height:2px;background:linear-gradient(90deg,var(--accent,#f0a830),var(--cyan,#08e0f8));transform-origin:left;animation:_ym_load .9s ease-in-out infinite alternate';
        container.appendChild(bar);
        const style = document.createElement('style');
        style.textContent = '@keyframes _ym_load{from{transform:scaleX(.2)}to{transform:scaleX(1)}}';
        document.head.appendChild(style);

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'flex:1;border:none;width:100%;min-height:0';
        iframe.setAttribute('allow','camera;microphone;clipboard-read;clipboard-write;fullscreen');
        iframe.setAttribute('allowfullscreen','');
        iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');
        iframe.addEventListener('load', () => {
          bar.style.display = 'none';
          const p = window.YM?.getProfile?.();
          setTimeout(() => {
            try { iframe.contentWindow?.postMessage({type:'ym:ready', version:'1.0', profile:p||{}}, '*'); } catch{}
          }, 300);
        });
        container.appendChild(iframe);

        const handler = (e) => {
          if(!e.data||typeof e.data!=='object') return;
          try{ if(e.source!==iframe.contentWindow) return; }catch{ return; }
          const {type,msg,style:st,key,value,height} = e.data;
          switch(type){
            case 'ym:toast': toast(msg||'', st||'info'); break;
            case 'ym:getProfile':
              iframe.contentWindow?.postMessage({type:'ym:profile',data:window.YM?.getProfile?.()}, '*');
              break;
            case 'ym:storage:get':
              iframe.contentWindow?.postMessage({type:'ym:storage:value',key,value:localStorage.getItem('ym_ext|'+name+'|'+key)}, '*');
              break;
            case 'ym:storage:set':
              localStorage.setItem('ym_ext|'+name+'|'+key, value);
              iframe.contentWindow?.postMessage({type:'ym:storage:ok',key}, '*');
              break;
            case 'ym:resize':
              if(height) iframe.style.height=Math.max(100,Math.min(height,window.innerHeight-120))+'px';
              break;
          }
        };
        window.addEventListener('message', handler);
        _bridgeCleanup = () => window.removeEventListener('message', handler);
      },

      deactivate(){ if(_bridgeCleanup){_bridgeCleanup();_bridgeCleanup=null;} },
    };
  }

  async function loadSphereURL(url, name) {
    if (_sA) { console.warn('[YM] blocked nested load'); return null; }

    const isExternal = !url.includes('.sphere.js') &&
      !url.includes('raw.githubusercontent.com') &&
      (url.startsWith('http'));
    if(isExternal){
      const sphereName = name || url.replace(/^https?:\/\//,'').split('/')[0];
      return _makeIframeSphere(_normalizeExtURL(url), sphereName);
    }
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
   * window.YM — API publique
   * ═══════════════════════════════════════════════════════════ */
  window.YM = {
    toast, openPanel, closePanel: reducePanel, openSwitcher, closeSwitcher,
    openSpherePanel, openProfilePanel, activateSphere, deactivateSphere,
    _hasOpenPanel: () => !!_panel || sw.classList.contains('open'),
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
    setTheme(url, prevUrl) {
      if (!url) return;
      if (prevUrl !== undefined) localStorage.setItem('ym_prev_theme', prevUrl);
      localStorage.setItem('ym_theme_url', url);
      // Clear test profile key when switching to a non-test theme
      if (!url.includes('test')) localStorage.removeItem('ym_profile_key');
      fetch(url).then(r => r.ok ? r.text() : null).then(html => {
        if (html) try { localStorage.setItem('ym_theme_cache', html); } catch(e) {}
        location.reload();
      }).catch(() => location.reload());
    },
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

  /* ═══════════════════════════════════════════════════════════
   * INIT
   * ═══════════════════════════════════════════════════════════ */
  const GH_BASE = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/';

  async function init() {
    OC();
    if (window.YM_Desk) window.YM_Desk.deskInit();

    for (const m of ['mine.js', 'liste.js', 'build.js', 'ai.js', 'profile.js']) {
      try {
        const url = (m === 'liste.js' && window.YM_LISTE_URL) ? window.YM_LISTE_URL : GH_BASE + m;
        await loadScript(url);
      }
      catch (e) { console.warn('[YM]', m, e.message); }
    }

    _wrapSignWithConfirmation();
    setTimeout(_wrapSignWithConfirmation, 2000);
    window.addEventListener('ym:wallet-unlocked', _wrapSignWithConfirmation);

    // Desk renders first — spheres activate after
    initP2P();

    setTimeout(async function() {
      try { if (window.YM_Liste && window.YM_Liste.fetchSphereList) await window.YM_Liste.fetchSphereList(); } catch {}

      const p = LP();
      if (p && p.spheres && p.spheres.length) {
        await Promise.allSettled(
          p.spheres
            .filter(sname => !window.YM_sphereRegistry || !window.YM_sphereRegistry.has(sname))
            .map(sname => window.YM_Liste
              ? window.YM_Liste.activateSphereByName(sname).catch(e => console.warn('[YM] restore:', sname, e.message))
              : Promise.resolve()
            )
        );
      }

      const _socId = 'social.sphere.js';
      if (window.YM_Liste && !window.YM_sphereRegistry.has(_socId)) {
        try { await window.YM_Liste.activateSphereByName(_socId); }
        catch (e) { console.warn('[YM] social:', e.message); }
      }

      // Theme-required spheres — defined in YM_THEME_META.requiredSpheres
      const _themeMeta = window.YM_THEME_META || {};
      const _required = Array.isArray(_themeMeta.requiredSpheres) ? _themeMeta.requiredSpheres : [];
      for (const _rId of _required) {
        if (_rId === _socId) continue; // already activated
        if (window.YM_Liste && !window.YM_sphereRegistry.has(_rId)) {
          try { await window.YM_Liste.activateSphereByName(_rId); }
          catch (e) { console.warn('[YM] theme required sphere:', _rId, e.message); }
        }
      }

    }, 0);

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

    const hideLdr = () => { const l = document.getElementById('ym-loader'); if (l) l.classList.add('hidden'); };
    const t0 = performance.now();
    document.fonts.ready.then(() => {
      const elapsed = performance.now() - t0;
      setTimeout(hideLdr, Math.max(0, 400 - elapsed));
    }).catch(() => setTimeout(hideLdr, 400));

    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    const btn = document.getElementById('pwa-install-btn');

    if (btn && !isStandalone()) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      if (isIOS && isSafari) {
        btn.innerHTML = '<span>⬆</span> ADD TO HOME SCREEN';
        btn.style.display = 'flex';
        btn.addEventListener('click', () => {
          toast('Tap ⎙ Share → "Add to Home Screen"', 'info');
        });
      } else {
        const setupPrompt = (e) => {
          btn.style.display = 'flex';
          btn.onclick = async () => {
            btn.style.opacity = '.6';
            btn.style.pointerEvents = 'none';
            try {
              e.prompt();
              const result = await e.userChoice;
              if (result.outcome === 'accepted') {
                btn.style.display = 'none';
                window._pwaPrompt = null;
              }
            } catch {}
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
          };
        };

        if (window._pwaPrompt) {
          setupPrompt(window._pwaPrompt);
        } else {
          btn.style.display = 'none';
          window._pwaPromptReady = (e) => {
            window._pwaPrompt = e;
            setupPrompt(e);
          };
        }
      }

      window.matchMedia('(display-mode: standalone)').addEventListener('change', e => {
        if (e.matches) btn.style.display = 'none';
      });

      window.addEventListener('appinstalled', () => {
        btn.style.display = 'none';
        window._pwaPrompt = null;
      });
    }
  }

  /* Lance tout */
  init();

})();
