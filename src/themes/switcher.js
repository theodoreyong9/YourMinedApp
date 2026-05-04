/**
 * switcher.js — YourMine Panel Manager + App Switcher
 * GitHub: theodoreyong9/YourMinedApp/src/switcher.js
 *
 * Extrait de app.js. Dépend de :
 *   - window.YM_toast          (helpers, injectés avant)
 *   - window.YM_Build          (optionnel, chargé après)
 *   - window.YM_Profile        (optionnel, chargé après)
 *   - window.YM_Mine           (optionnel, chargé après)
 *   - window.YM_Liste          (optionnel, chargé après)
 *   - window.YM_sphereRegistry (initialisé dans app.js)
 *
 * Expose :
 *   window.YM_Panels   → openPanel, reducePanel, openSpherePanel,
 *                         openProfilePanel, togglePanel
 *   window.YM_Switcher → open, close, render
 *
 * Doit être chargé AVANT app.js (qui l'utilise via window.YM_Panels
 * et window.YM_Switcher), APRÈS que le DOM est prêt.
 */

;(function () {
  'use strict';

  const toast = (...a) => window.YM_toast(...a);

  /* ── Références DOM ─────────────────────────────────────────── */
  const overlay = document.getElementById('panel-overlay');
  const sw      = document.getElementById('panel-switcher');

  /* ── État panels ────────────────────────────────────────────── */
  let _panel     = null;
  let _prevPanel = null;
  const navStack     = [];
  const _openPanels  = new Map();
  const _openSpheres = new Map();

  const PANEL_META = {
    'panel-spheres':      { label: 'Spheres'  },
    'panel-profile':      { label: 'Profile'  },
    'panel-build':        { label: 'Build'    },
    'panel-mine':         { label: 'YourMine' },
    'panel-profile-view': { label: 'Profile'  },
  };

  /* ════════════════════════════════════════════════════════════
   * ONGLETS YOURMINE
   * ════════════════════════════════════════════════════════════ */
  function renderFormulaTab() {
    const el = document.getElementById('panel-mine-formula');
    if (!el) return;
    el.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;padding:0';
    el.innerHTML = `
<a href="#" style="flex:1;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:20px;text-decoration:none;border-bottom:1px solid rgba(240,168,48,.15);background:linear-gradient(160deg,#06060e 0%,rgba(240,168,48,.06) 100%)">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 80% 10%,rgba(240,168,48,.22) 0%,transparent 65%);pointer-events:none"></div>
  <div style="position:absolute;top:50%;right:20px;transform:translateY(-50%);font-size:72px;opacity:.08;font-family:var(--font-m);line-height:1">⟐</div>
  <div>
    <div style="font-family:var(--font-m);font-size:9px;letter-spacing:3px;color:rgba(240,168,48,.5);text-transform:uppercase;margin-bottom:6px">YM Token</div>
    <div style="font-family:var(--font-d);font-size:26px;font-weight:700;color:var(--gold);line-height:1.1">Proof of Will<br>as Currency</div>
  </div>
</a>
<a href="#" style="flex:1;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:20px;text-decoration:none;border-bottom:1px solid rgba(8,224,248,.12);background:linear-gradient(160deg,#06060e 0%,rgba(8,224,248,.05) 100%)">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 90%,rgba(8,224,248,.15) 0%,transparent 65%);pointer-events:none"></div>
  <div style="position:absolute;top:50%;right:20px;transform:translateY(-50%);font-size:72px;opacity:.07;font-family:var(--font-m);line-height:1">◈</div>
  <div>
    <div style="font-family:var(--font-m);font-size:9px;letter-spacing:3px;color:rgba(8,224,248,.5);text-transform:uppercase;margin-bottom:6px">Identity Theory</div>
    <div style="font-family:var(--font-d);font-size:26px;font-weight:700;color:var(--cyan);line-height:1.1">Your Wallet<br>is Your Identity</div>
  </div>
</a>
<a href="#" style="flex:1;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:20px;text-decoration:none;background:linear-gradient(160deg,#06060e 0%,rgba(34,217,138,.05) 100%)">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 60% 20%,rgba(34,217,138,.12) 0%,transparent 65%);pointer-events:none"></div>
  <div style="position:absolute;top:50%;right:20px;transform:translateY(-50%);font-size:72px;opacity:.07;font-family:var(--font-m);line-height:1">∿</div>
  <div>
    <div style="font-family:var(--font-m);font-size:9px;letter-spacing:3px;color:rgba(34,217,138,.5);text-transform:uppercase;margin-bottom:6px">Value Viscoelasticity</div>
    <div style="font-family:var(--font-d);font-size:26px;font-weight:700;color:var(--green);line-height:1.1">Time Shapes<br>Your Reward</div>
  </div>
</a>`;
  }

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

    if (tab === 'wallet'  && w) { w.style.display = 'flex'; if (window.YM_Mine)  window.YM_Mine.render(w); }
    if (tab === 'build'   && b) { b.style.display = 'flex'; b.innerHTML = ''; if (window.YM_Build) window.YM_Build.render(b); }
    if (tab === 'formula' && f) { f.style.display = 'flex'; renderFormulaTab(); }
    if (tab === 'liste'   && l) {
      l.style.display = 'flex';
      if (window.YM_Liste) { if (!l.children.length) window.YM_Liste.render(l); }
      else l.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px">Loading…</div>';
    }
  }

  /* ════════════════════════════════════════════════════════════
   * SWITCHER — clone preview
   * ════════════════════════════════════════════════════════════ */
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

  /* ── Switcher card ──────────────────────────────────────────── */
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
        onTap:  isFolder ? () => closeSwitcher() : () => { closeSwitcher(); openPanel(id); },
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
      fp.style.transition = 'none'; fp.classList.remove('open');
      requestAnimationFrame(() => { fp.style.transition = ''; });
      if (window._deskFolderStack) window._deskFolderStack.length = 0;
    }
    if (_openPanels.size + _openSpheres.size === 0) {
      openPanel('panel-spheres');
      if (window.YM_Liste) window.YM_Liste.render();
      return;
    }
    _buildSwitcherRows();
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

  /* ════════════════════════════════════════════════════════════
   * PANELS
   * ════════════════════════════════════════════════════════════ */
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
    p.style.zIndex = (id === 'panel-profile' || id === 'panel-mine' || id === 'panel-profile-view') ? '302' : '';

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

  function togglePanel(id, onOpen) {
    if (_panel === id) reducePanel();
    else { openPanel(id); if (onOpen) onOpen(); }
  }

  /* ── Gestures panel handle / head / overlay ──────────────── */
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

  /* ════════════════════════════════════════════════════════════
   * NAVIGATION HISTORY
   * ════════════════════════════════════════════════════════════ */
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

  /* checkURLRoute et hashchange sont gardés dans app.js
     car ils dépendent de openSpherePanel et activateSphereByName
     qui sont définis dans app.js — switcher.js expose openPanel
     que app.js utilisera pour checkURLRoute. */

  /* ════════════════════════════════════════════════════════════
   * openSpherePanel + openProfilePanel
   * (déplacés ici car ils manipulent l'état panel)
   * ════════════════════════════════════════════════════════════ */
  function openSpherePanel(id) {
    // Réinitialisation notif
    if (window.YM_Desk) window.YM_Desk.setNotif(id, 0);

    // Activation à la volée si absente du registry
    const _tryOpen = async () => {
      let s = window.YM_sphereRegistry && window.YM_sphereRegistry.get(id);
      if (!s) {
        try { if (window.YM_Liste) await window.YM_Liste.activateSphereByName(id); } catch {}
        s = window.YM_sphereRegistry && window.YM_sphereRegistry.get(id);
      }
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
          const esc = window.YM_escHtml || (t => t);
          body.innerHTML = '<div class="ym-notice error" style="margin:16px">⚠️ ' + esc(s.name || id) + ' encountered an error.<br><small style="color:var(--text3)">' + esc(e.message) + '</small></div>';
        }
      } else {
        const esc = window.YM_escHtml || (t => t);
        body.innerHTML = '<div class="ym-notice info">' + esc(s.description || 'No content.') + '</div>';
      }

      const panelEl = document.getElementById('panel-sphere');
      _openSpheres.set(id, {
        label:    s.name || id.replace('.sphere.js', ''),
        snapshot: panelEl ? panelEl.innerHTML : '',
        panelW:   panelEl ? panelEl.offsetWidth  || window.innerWidth  : window.innerWidth,
        panelH:   panelEl ? panelEl.offsetHeight || window.innerHeight : window.innerHeight,
      });

      openPanel('panel-sphere');

      // log — app.js a sa propre fonction log, on appelle via YM si dispo
      if (window.YM && window.YM._log) window.YM._log('open', { sphere: id });
    };

    _tryOpen();
  }

  function openProfilePanel(profile) {
    const dn = profile.name || (profile.uuid ? profile.uuid.slice(0, 8) + '…' : '') || 'Profile';
    document.getElementById('profile-view-title').textContent = dn;
    const body = document.getElementById('panel-profile-view-body');
    body.innerHTML = '';
    if (window._renderProfileView) window._renderProfileView(body, profile);
    openPanel('panel-profile-view');
    if (window.YM && window.YM._log) window.YM._log('open', { profile: profile.uuid });
  }

  /* ════════════════════════════════════════════════════════════
   * BOUTONS DOCK
   * (gardés ici car ils appellent openPanel / openSwitcher)
   * ════════════════════════════════════════════════════════════ */
  document.getElementById('btn-back').addEventListener('click', () => {
    if (sw.classList.contains('open')) { closeSwitcher(); return; }
    if (_panel && (_openPanels.size + _openSpheres.size > 0)) {
      reducePanel();
      requestAnimationFrame(() => { _buildSwitcherRows(); sw.classList.add('open'); });
      return;
    }
    if (_panel) { reducePanel(); return; }
    if (_openPanels.size + _openSpheres.size > 0) { _buildSwitcherRows(); sw.classList.add('open'); return; }
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

  /* ════════════════════════════════════════════════════════════
   * EXPOSITION PUBLIQUE
   * ════════════════════════════════════════════════════════════ */
  window.YM_Panels = {
    open:           openPanel,
    reduce:         reducePanel,
    toggle:         togglePanel,
    openSphere:     openSpherePanel,
    openProfile:    openProfilePanel,
    updateActiveBtn: updateActiveDbtn,
    pushNav,
    // accès lecture pour app.js
    get current()      { return _panel; },
    get openPanels()   { return _openPanels; },
    get openSpheres()  { return _openSpheres; },
    get navStack()     { return navStack; },
  };

  window.YM_Switcher = {
    open:   openSwitcher,
    close:  closeSwitcher,
    render: _buildSwitcherRows,
  };

})();
