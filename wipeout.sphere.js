/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v3 — physique réelle, visuels améliorés
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_wipeout_scores_v4';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch (e) { return []; } }
  function saveScores(d) { localStorage.setItem(SCORES_KEY, JSON.stringify(d.slice(0, 20))); }
  function fmt(ms) {
    if (!ms || ms <= 0) return '--:--.--';
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(2);
    return `${m}:${s.padStart(5, '0')}`;
  }

  let _ctx = null, _running = false, _raf = null, _renderer = null;

  function renderPanel(container) {
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    container.innerHTML = '';
    const TABS = [['race', '🏁 Race'], ['scores', '🏆 Scores']];
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#080808';
    TABS.forEach(([id, label]) => {
      const t = document.createElement('div');
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;color:${id === 'race' ? '#00f5ff' : 'rgba(255,255,255,.4)'}`;
      t.textContent = label;
      t.addEventListener('click', () => {
        tabs.querySelectorAll('div').forEach((x, i) => x.style.color = TABS[i][0] === id ? '#00f5ff' : 'rgba(255,255,255,.4)');
        track.innerHTML = '';
        if (id === 'race') renderRace(track); else renderLeaderboard(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track); container.appendChild(tabs);
    renderRace(track);
  }

  function renderLeaderboard(container) {
    container.style.cssText = 'flex:1;overflow-y:auto;padding:16px;background:#000';
    const scores = loadScores().sort((a, b) => (a.time || 99999999) - (b.time || 99999999));
    const html = [`<div style="font-size:18px;font-weight:700;color:#00f5ff;margin-bottom:16px">🏆 Leaderboard</div>`];
    if (!scores.length) {
      html.push('<div style="color:rgba(255,255,255,.3);font-size:13px;text-align:center;margin-top:40px">Aucune course.</div>');
    } else {
      scores.forEach((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        html.push(`<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.04)">
          <span style="font-size:18px;width:28px">${medal}</span>
          <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">${s.name || 'Racer'}</div></div>
          <div style="font-size:15px;font-weight:700;color:#00f5ff;font-variant-numeric:tabular-nums">${fmt(s.time)}</div></div>`);
      });
    }
    container.innerHTML = html.join('');
  }

  function renderRace(container) {
    container.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#000';
    stopRace();

    const menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(180deg,#000 0%,#030320 100%);z-index:20';
    menu.innerHTML = `
      <div style="font-size:44px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-3px">WIPEOUT</div>
      <div style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:5px;font-family:monospace">ANTI-GRAVITY RACING</div>
      <div style="display:flex;flex-direction:column;gap:8px;width:200px;margin-top:8px">
        <button id="wo-start" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace">▶  RACE</button>
        <button id="wo-start-easy" style="background:transparent;border:1px solid rgba(0,245,255,.3);color:rgba(0,245,255,.7);font-size:13px;padding:10px;border-radius:10px;cursor:pointer;font-family:monospace">🟢  EASY MODE</button>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,.25);font-family:monospace;text-align:center;line-height:1.8">← → steer · ESPACE = boost · 3 tours</div>`;
    container.appendChild(menu);
    menu.querySelector('#wo-start').addEventListener('click', () => { menu.remove(); startRace(container, false); });
    menu.querySelector('#wo-start-easy').addEventListener('click', () => { menu.remove(); startRace(container, true); });
  }

  function stopRace() {
    _running = false;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (_renderer) { try { _renderer.dispose(); } catch (e) { } _renderer = null; }
  }

  function startRace(container, easyMode) {
    const THREE = window.THREE;
    if (!THREE) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => startRace(container, easyMode);
      document.head.appendChild(s);
      return;
    }
    stopRace();
    _running = true;
    const TOTAL_LAPS = easyMode ? 2 : 3;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const W = canvas.offsetWidth || 360, H = canvas.offsetHeight || 480;
    canvas.width = W; canvas.height = H;

    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:8px 14px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:10';
    hud.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px;font-family:monospace">LAP</div>
        <div id="wo-lap" style="font-size:22px;font-weight:700;color:#00f5ff;font-family:monospace">0/${TOTAL_LAPS}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px;font-family:monospace">TIME</div>
        <div id="wo-time" style="font-size:22px;font-weight:700;color:#00f5ff;font-family:monospace">0:00.00</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px;font-family:monospace">BEST</div>
        <div id="wo-best" style="font-size:16px;font-weight:700;color:rgba(0,245,255,.5);font-family:monospace">--:--.--</div>
      </div>`;
    container.appendChild(hud);

    const speedo = document.createElement('div');
    speedo.style.cssText = 'position:absolute;bottom:62px;left:12px;right:12px;pointer-events:none;z-index:10;display:flex;flex-direction:column;gap:5px';
    speedo.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);font-family:monospace;width:30px">SPD</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px">
          <div id="wo-spd" style="height:100%;background:linear-gradient(90deg,#00f5ff,#007fff);border-radius:2px;width:0%"></div>
        </div>
        <span id="wo-spd-num" style="font-size:10px;color:#00f5ff;font-family:monospace;width:32px;text-align:right">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);font-family:monospace;width:30px">BOS</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px">
          <div id="wo-bos" style="height:100%;background:linear-gradient(90deg,#7B2FFF,#c026d3);border-radius:2px;width:80%"></div>
        </div>
        <span id="wo-bos-num" style="font-size:10px;color:#a78bfa;font-family:monospace;width:32px;text-align:right">80</span>
      </div>`;
    container.appendChild(speedo);

    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'position:absolute;bottom:62px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 16px;z-index:10';
    ctrl.innerHTML = `
      <button id="wo-bl" style="width:56px;height:56px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;font-size:22px;cursor:pointer">◀</button>
      <button id="wo-bb" style="width:56px;height:56px;border-radius:50%;background:rgba(123,47,255,.2);border:1px solid rgba(123,47,255,.4);color:#c4b5fd;font-size:22px;cursor:pointer">▲</button>
      <button id="wo-br" style="width:56px;height:56px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;font-size:22px;cursor:pointer">▶</button>`;
    container.appendChild(ctrl);

    const fin = document.createElement('div');
    fin.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.88);z-index:30;backdrop-filter:blur(4px)';
    container.appendChild(fin);

    // THREE SETUP
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    _renderer = renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000510, 0.010);
    scene.background = new THREE.Color(0x000510);

    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 800);

    // Étoiles
    const starVerts = new Float32Array(6000);
    for (let i = 0; i < 6000; i += 3) {
      starVerts[i] = (Math.random() - 0.5) * 1000;
      starVerts[i + 1] = (Math.random() - 0.5) * 800;
      starVerts[i + 2] = (Math.random() - 0.5) * 1000;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starVerts, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })));

    // Nébuleuse colorée (sphères translucides lointaines)
    [[0x3300ff, -300, 80, -200, 200], [0xff0066, 250, -50, 300, 160], [0x00ffaa, -200, 30, 400, 180]].forEach(([col, x, y, z, r]) => {
      const nebGeo = new THREE.SphereGeometry(r, 8, 8);
      const nebMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.04, side: THREE.BackSide });
      scene.add(Object.assign(new THREE.Mesh(nebGeo, nebMat), { position: new THREE.Vector3(x, y, z) }));
    });

    // TRACK
    const N_CTRL = 52;
    const TRACK_CTRL = [];
    for (let i = 0; i < N_CTRL; i++) {
      const t = i / N_CTRL * Math.PI * 2;
      const r = 100;
      TRACK_CTRL.push(new THREE.Vector3(
        Math.sin(t) * r + Math.sin(t * 2) * 22 + Math.sin(t * 5) * 8,
        Math.sin(t * 2.5) * 10 + Math.cos(t * 3) * 6,
        Math.cos(t) * r + Math.cos(t * 2) * 28 + Math.cos(t * 4) * 6
      ));
    }
    const trackCurve = new THREE.CatmullRomCurve3(TRACK_CTRL, true, 'catmullrom', 0.5);
    const N_STEPS = 400;
    const TRACK_W = 18;

    const frames = trackCurve.computeFrenetFrames(N_STEPS, true);
    const positions = [], uvCoords = [], indices = [], trackNormals = [];
    for (let i = 0; i <= N_STEPS; i++) {
      const pt = new THREE.Vector3(); trackCurve.getPointAt(i / N_STEPS, pt);
      const tan = frames.tangents[i % N_STEPS].clone();
      const wUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tan, wUp).normalize();
      const L = pt.clone().addScaledVector(right, -TRACK_W / 2);
      const R = pt.clone().addScaledVector(right, TRACK_W / 2);
      positions.push(L.x, L.y, L.z, R.x, R.y, R.z);
      trackNormals.push(0, 1, 0, 0, 1, 0);
      uvCoords.push(i / N_STEPS * 24, 0, i / N_STEPS * 24, 1);
      if (i < N_STEPS) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const last = N_STEPS * 2;
    indices.push(last, last + 1, 0, last + 1, 1, 0);

    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    tGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(trackNormals), 3));
    tGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvCoords), 2));
    tGeo.setIndex(indices);

    // Texture piste avec rayures lumineuses
    const texSize = 256;
    const texData = new Uint8Array(texSize * texSize * 4);
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        const idx4 = (y * texSize + x) * 4;
        const lane = x / texSize;
        const stripe = Math.sin(y / texSize * Math.PI * 2 * 16) * 0.5 + 0.5;
        const isEdge = lane < 0.05 || lane > 0.95;
        const isCenterLine = Math.abs(lane - 0.5) < 0.015;
        let r = 12, g = 14, b = 20;
        if (isEdge) { r = 0; g = 80; b = 100; }
        else if (isCenterLine) { r = 30; g = 30; b = 60; }
        else { r += stripe * 4; g += stripe * 4; b += stripe * 8; }
        texData[idx4] = r; texData[idx4 + 1] = g; texData[idx4 + 2] = b; texData[idx4 + 3] = 255;
      }
    }
    const trackTex = new THREE.DataTexture(texData, texSize, texSize, THREE.RGBAFormat);
    trackTex.wrapS = trackTex.wrapT = THREE.RepeatWrapping; trackTex.needsUpdate = true;
    scene.add(new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide })));

    // Bordures néon
    [[-1, 0x00f5ff], [1, 0x7B2FFF]].forEach(([side, col]) => {
      const pts = [];
      for (let i = 0; i <= N_STEPS; i++) {
        const pt = new THREE.Vector3(); trackCurve.getPointAt(i / N_STEPS, pt);
        const tan = frames.tangents[i % N_STEPS];
        const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        const ep = pt.clone().addScaledVector(right, side * (TRACK_W / 2 - 0.3));
        ep.y += 0.3; pts.push(ep);
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
      // Double bordure
      const pts2 = pts.map(p => p.clone().add(new THREE.Vector3(0, 0.5, 0)));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.3 })));
    });

    // Panneaux décoratifs le long de la piste
    const signMat = new THREE.MeshStandardMaterial({ color: 0x0a0020, emissive: 0x050010, metalness: 0.9 });
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const pt = new THREE.Vector3(); trackCurve.getPointAt(t, pt);
      const tan = frames.tangents[Math.floor(t * N_STEPS) % N_STEPS];
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const side = i % 2 === 0 ? 1 : -1;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 5), signMat);
      post.position.copy(pt).addScaledVector(right, side * (TRACK_W / 2 + 2));
      post.position.y += 3;
      scene.add(post);
      const lightCol = i % 3 === 0 ? 0xff3366 : i % 3 === 1 ? 0x00f5ff : 0xffaa00;
      const gGeo = new THREE.SphereGeometry(0.25, 6, 6);
      const gMesh = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({ color: lightCol }));
      gMesh.position.copy(post.position).add(new THREE.Vector3(0, 3.2, 0));
      scene.add(gMesh);
      const pl = new THREE.PointLight(lightCol, 4, 18);
      pl.position.copy(gMesh.position);
      scene.add(pl);
    }

    // Boost pads
    const PAD_T = [0.08, 0.20, 0.33, 0.46, 0.60, 0.73, 0.87];
    const PADS = [];
    PAD_T.forEach(t => {
      const pt = new THREE.Vector3(); trackCurve.getPointAt(t, pt);
      const idx = Math.floor(t * N_STEPS) % N_STEPS;
      const tan = frames.tangents[idx];
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_W - 4, 0.15, 3.5),
        new THREE.MeshStandardMaterial({ color: 0x4400cc, emissive: 0x2200aa, roughness: 0.1, metalness: 0.95, transparent: true, opacity: 0.9 })
      );
      pad.position.copy(pt).add(new THREE.Vector3(0, 0.25, 0));
      pad.lookAt(pt.clone().add(tan));
      pad.userData.t = t;
      scene.add(pad);
      PADS.push(pad);
      // Flèches sur le pad
      for (let k = -1; k <= 1; k++) {
        const aGeo = new THREE.ConeGeometry(0.5, 1.2, 3);
        const aMesh = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xaa88ff }));
        aMesh.position.copy(pt).add(new THREE.Vector3(0, 0.7, 0)).addScaledVector(tan, k * 1.8);
        aMesh.lookAt(pt.clone().add(tan).add(new THREE.Vector3(0, -1, 0)));
        scene.add(aMesh);
      }
    });

    // VAISSEAU — design plus agressif
    const shipGroup = new THREE.Group();

    // Corps principal — fuselage effilé
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x003366, emissive: 0x000820, metalness: 0.98, roughness: 0.03 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x0066cc, emissive: 0x002244, metalness: 0.95, roughness: 0.05 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });

    // Fuselage central
    const fuseGeo = new THREE.CylinderGeometry(0.35, 0.18, 4.0, 8);
    fuseGeo.rotateX(Math.PI / 2);
    shipGroup.add(new THREE.Mesh(fuseGeo, bodyMat));

    // Carapace supérieure (forme plate)
    const shellGeo = new THREE.BoxGeometry(2.8, 0.22, 3.2);
    const shell = new THREE.Mesh(shellGeo, bodyMat);
    shell.position.set(0, 0.1, -0.2);
    shipGroup.add(shell);

    // Ailes — forme delta
    [-1, 1].forEach(s => {
      // Aile principale
      const wingPts = [
        new THREE.Vector3(0, 0, 1.4),
        new THREE.Vector3(s * 2.8, 0, 0.2),
        new THREE.Vector3(s * 2.2, 0, -1.4),
        new THREE.Vector3(0, 0, -1.0),
      ];
      const wGeo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        wingPts[0].x, wingPts[0].y, wingPts[0].z,
        wingPts[1].x, wingPts[1].y, wingPts[1].z,
        wingPts[3].x, wingPts[3].y, wingPts[3].z,
        wingPts[1].x, wingPts[1].y, wingPts[1].z,
        wingPts[2].x, wingPts[2].y, wingPts[2].z,
        wingPts[3].x, wingPts[3].y, wingPts[3].z,
      ]);
      wGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      wGeo.computeVertexNormals();
      const wing = new THREE.Mesh(wGeo, accentMat);
      wing.position.y = -0.05;
      shipGroup.add(wing);

      // Winglet vertical
      const wlGeo = new THREE.BoxGeometry(0.1, 0.6, 0.8);
      const wl = new THREE.Mesh(wlGeo, bodyMat);
      wl.position.set(s * 2.6, 0.25, -1.0);
      shipGroup.add(wl);
    });

    // Moteurs — 2 cylindres arrière proéminents
    const engMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.9, roughness: 0.1 });
    const glows = [];
    [-0.75, 0.75].forEach(s => {
      const outerGeo = new THREE.CylinderGeometry(0.32, 0.38, 1.2, 10);
      outerGeo.rotateX(Math.PI / 2);
      const outer = new THREE.Mesh(outerGeo, engMat);
      outer.position.set(s, -0.05, -1.8);
      shipGroup.add(outer);

      const innerGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.25, 8);
      innerGeo.rotateX(Math.PI / 2);
      const inner = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({ color: 0x003355 }));
      inner.position.set(s, -0.05, -1.82);
      shipGroup.add(inner);

      // Flamme moteur
      const glowGeo = new THREE.CylinderGeometry(0.18, 0.05, 0.8, 8);
      glowGeo.rotateX(Math.PI / 2);
      const g = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.9 }));
      g.position.set(s, -0.05, -2.3);
      shipGroup.add(g);
      glows.push(g);
    });

    // Cockpit vitré
    const cockGeo = new THREE.SphereGeometry(0.38, 10, 7);
    cockGeo.scale(1.2, 0.55, 1.0);
    const cockMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x003366, transparent: true, opacity: 0.65, roughness: 0, metalness: 0.2 });
    const cockpit = new THREE.Mesh(cockGeo, cockMat);
    cockpit.position.set(0, 0.28, 0.8);
    shipGroup.add(cockpit);

    // Phare avant
    const headlightGeo = new THREE.SphereGeometry(0.1, 6, 6);
    [-0.6, 0.6].forEach(s => {
      const hl = new THREE.Mesh(headlightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(s, 0.05, 1.85);
      shipGroup.add(hl);
    });

    // Hover pads magnétiques (dessous)
    const hoverPadMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const hoverPads = [];
    [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), hoverPadMat.clone());
      p.position.set(x, -0.22, z);
      shipGroup.add(p);
      hoverPads.push(p);
    });

    scene.add(shipGroup);

    // Particules d'échappement
    const MAX_EX = 80;
    const exPos = new Float32Array(MAX_EX * 3);
    const exGeo = new THREE.BufferGeometry();
    exGeo.setAttribute('position', new THREE.BufferAttribute(exPos, 3));
    const exMat = new THREE.PointsMaterial({ color: 0x00f5ff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    scene.add(new THREE.Points(exGeo, exMat));
    const exParticles = [];

    // Trail de boost — particules extra larges
    const MAX_TRAIL = 40;
    const trailPos = new Float32Array(MAX_TRAIL * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.PointsMaterial({ color: 0x7B2FFF, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.7 });
    scene.add(new THREE.Points(trailGeo, trailMat));
    const trailParticles = [];

    // Lumières
    scene.add(new THREE.AmbientLight(0x112244, 2.5));
    const sunLight = new THREE.DirectionalLight(0x4466ff, 3.0);
    sunLight.position.set(10, 40, 20);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0xff0066, 1.5);
    rimLight.position.set(-10, -5, -20);
    scene.add(rimLight);
    const shipLight = new THREE.PointLight(0x00f5ff, 8, 30);
    scene.add(shipLight);
    const boostLight = new THREE.PointLight(0x7B2FFF, 0, 25);
    scene.add(boostLight);

    // PHYSIQUE RÉELLE DU VAISSEAU
    // Le vaisseau a sa propre position et vélocité dans le monde
    // Il essaie de rester sur la piste mais a une physique propre

    let trackT = 0.001;    // paramètre de progression sur la piste (0-1)
    let trackSpeed = easyMode ? 0.00038 : 0.00030;  // vitesse de progression sur la piste
    const BASE_SPEED = easyMode ? 0.00038 : 0.00030;
    const MAX_SPEED = easyMode ? 0.0022 : 0.0020;

    // Position physique du vaisseau (indépendante de la piste)
    let shipWorldPos = new THREE.Vector3();
    let shipLateralOffset = 0;   // décalage latéral par rapport au centre de piste
    let shipLateralVel = 0;      // vélocité latérale
    const STEER_ACCEL = 14;      // accélération de direction
    const LATERAL_FRICTION = 5.5; // friction latérale (retour au centre)
    const MAX_LATERAL = TRACK_W / 2 - 1.5; // limite de largeur
    const LATERAL_BOUNCE = 0.4;  // rebond si on touche le bord

    let boost = 0.8;
    let bank = 0;
    let hoverPhase = 0;
    let lapCount = 0;
    let prevT = 0;
    let raceStart = Date.now();
    let finished = false;
    let camShake = 0;

    let camPos = new THREE.Vector3();
    let camLookTarget = new THREE.Vector3();
    let firstFrame = true;

    const scores = loadScores();
    const bestTime = scores.length ? scores[0].time : 0;
    if (bestTime) document.getElementById('wo-best').textContent = fmt(bestTime);

    const keys = { left: false, right: false, boost: false };
    const onKey = e => {
      const d = e.type === 'keydown';
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') keys.left = d;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = d;
      if (e.key === ' ' || e.key === 'ArrowUp') { keys.boost = d; if (d) e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const bl = container.querySelector('#wo-bl'), br = container.querySelector('#wo-br'), bb = container.querySelector('#wo-bb');
    const pd = k => () => keys[k] = true, pu = k => () => keys[k] = false;
    bl.addEventListener('pointerdown', pd('left')); bl.addEventListener('pointerup', pu('left')); bl.addEventListener('pointerleave', pu('left'));
    br.addEventListener('pointerdown', pd('right')); br.addEventListener('pointerup', pu('right')); br.addEventListener('pointerleave', pu('right'));
    bb.addEventListener('pointerdown', pd('boost')); bb.addEventListener('pointerup', pu('boost')); bb.addEventListener('pointerleave', pu('boost'));

    const obs = new ResizeObserver(() => {
      const W2 = canvas.offsetWidth, H2 = canvas.offsetHeight;
      if (!W2 || !H2) return;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
    });
    obs.observe(canvas);

    let lastTs = 0;
    function loop(ts) {
      if (!_running) { obs.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); return; }
      _raf = requestAnimationFrame(loop);
      const dt = Math.min((ts - lastTs) / 1000, 0.05); lastTs = ts;

      if (!finished) {
        // === DIRECTION : gauche = gauche, droite = droite ===
        // steer < 0 = gauche, steer > 0 = droite
        if (keys.left) {
          shipLateralVel -= STEER_ACCEL * dt;
        } else if (keys.right) {
          shipLateralVel += STEER_ACCEL * dt;
        }
        // Friction latérale (amortissement)
        shipLateralVel -= shipLateralVel * LATERAL_FRICTION * dt;

        // Mise à jour offset latéral
        shipLateralOffset += shipLateralVel * dt;

        // Rebond sur les bords de piste
        if (shipLateralOffset > MAX_LATERAL) {
          shipLateralOffset = MAX_LATERAL;
          shipLateralVel = -Math.abs(shipLateralVel) * LATERAL_BOUNCE;
          camShake = 0.5;
        } else if (shipLateralOffset < -MAX_LATERAL) {
          shipLateralOffset = -MAX_LATERAL;
          shipLateralVel = Math.abs(shipLateralVel) * LATERAL_BOUNCE;
          camShake = 0.5;
        }

        // Boost pads
        let onPad = false;
        PADS.forEach(pad => {
          const diff = Math.abs(trackT - pad.userData.t);
          if (diff < 0.010 || diff > 0.990) onPad = true;
        });
        if (keys.boost) boost = Math.max(0, boost - 0.004);
        if (onPad) { boost = Math.min(1, boost + 0.07); camShake = 0.5; }
        boost = Math.min(1, boost + 0.0020);

        const boostActive = keys.boost && boost > 0.05;
        const effectiveBoost = boostActive ? boost : (onPad ? 0.85 : 0);
        const targetSpeed = BASE_SPEED * (1 + effectiveBoost * 2.8);
        trackSpeed += (targetSpeed - trackSpeed) * 0.055;
        trackSpeed = Math.min(trackSpeed, MAX_SPEED);
        trackT = (trackT + trackSpeed) % 1;

        // Lap detection
        if (prevT > 0.965 && trackT < 0.035) {
          lapCount++;
          document.getElementById('wo-lap').textContent = `${lapCount}/${TOTAL_LAPS}`;
          camShake = 1.0;
          if (lapCount >= TOTAL_LAPS) { finished = true; finishRace(Date.now() - raceStart); }
        }
        prevT = trackT;

        const elapsed = Date.now() - raceStart;
        document.getElementById('wo-time').textContent = fmt(elapsed);
        const spdPct = Math.round(trackSpeed / MAX_SPEED * 100);
        const bosPct = Math.round(boost * 100);
        document.getElementById('wo-spd').style.width = spdPct + '%';
        document.getElementById('wo-bos').style.width = bosPct + '%';
        document.getElementById('wo-spd-num').textContent = Math.round(trackSpeed * 75000) + ' km/h';
        document.getElementById('wo-bos-num').textContent = bosPct;
      }

      // POSITION VAISSEAU sur la piste
      const trackPt = new THREE.Vector3();
      const shipTan = new THREE.Vector3();
      trackCurve.getPointAt(trackT, trackPt);
      trackCurve.getTangentAt(trackT, shipTan);

      const wUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(shipTan, wUp).normalize();

      hoverPhase += dt * 3.0;
      const hoverY = Math.sin(hoverPhase) * 0.14 + 1.1;

      // Position réelle = point piste + décalage latéral physique + hover
      shipWorldPos.copy(trackPt)
        .addScaledVector(right, shipLateralOffset)
        .add(new THREE.Vector3(0, hoverY, 0));

      shipGroup.position.copy(shipWorldPos);

      // Orientation : regarde vers l'avant sur la piste
      const fwdPt = new THREE.Vector3(); trackCurve.getPointAt((trackT + 0.020) % 1, fwdPt);
      shipGroup.lookAt(fwdPt);

      // Banking réaliste basé sur la vélocité latérale
      const normLateralVel = shipLateralVel / (STEER_ACCEL * 2);
      bank += ((-normLateralVel * 0.6) - bank) * 0.15;
      shipGroup.rotateZ(bank);

      // Inclinaison avant à haute vitesse
      const boostIntensity = trackSpeed / MAX_SPEED;
      shipGroup.rotateX(-boostIntensity * 0.12);

      // Hover pads
      hoverPads.forEach((p, i) => {
        p.material.color.setHSL(0.54, 1, 0.35 + Math.sin(hoverPhase * 2 + i) * 0.3);
        p.scale.setScalar(0.7 + Math.sin(hoverPhase + i * 1.6) * 0.45);
      });

      // Engine glow
      glows.forEach((g, i) => {
        g.material.color.setHSL(0.54 + boostIntensity * 0.12, 1, 0.35 + boostIntensity * 0.45);
        g.scale.setScalar(0.5 + boostIntensity * 1.6 + Math.sin(ts * 0.018 + i) * 0.2);
        g.material.opacity = 0.5 + boostIntensity * 0.5;
      });

      // Lumières
      shipLight.position.copy(shipWorldPos);
      shipLight.intensity = 5 + boostIntensity * 12;
      shipLight.color.setHSL(0.54 + boostIntensity * 0.06, 1, 0.7);
      boostLight.position.copy(shipWorldPos);
      boostLight.intensity = keys.boost ? boost * 18 : 0;

      // Particules échappement
      const exOrigin = shipGroup.localToWorld(new THREE.Vector3(0, -0.05, -2.0));
      const backward = shipGroup.localToWorld(new THREE.Vector3(0, 0, -5)).sub(exOrigin).normalize();
      if (!finished && exParticles.length < MAX_EX - 2) {
        exParticles.push({
          x: exOrigin.x + (Math.random() - 0.5) * 0.3,
          y: exOrigin.y + (Math.random() - 0.5) * 0.3,
          z: exOrigin.z,
          vx: backward.x * (50 + boostIntensity * 120) + (Math.random() - 0.5) * 8,
          vy: backward.y * (50 + boostIntensity * 120) + (Math.random() - 0.3) * 6,
          vz: backward.z * (50 + boostIntensity * 120) + (Math.random() - 0.5) * 8,
          life: 0.35 + boostIntensity * 0.35
        });
      }
      // Trail boost
      if (keys.boost && boost > 0.1 && !finished && trailParticles.length < MAX_TRAIL - 2) {
        trailParticles.push({
          x: exOrigin.x + (Math.random() - 0.5) * 1.5,
          y: exOrigin.y,
          z: exOrigin.z,
          vx: backward.x * 30 + (Math.random() - 0.5) * 20,
          vy: backward.y * 30 + (Math.random() - 0.5) * 15,
          vz: backward.z * 30 + (Math.random() - 0.5) * 20,
          life: 0.5
        });
      }

      for (let i = exParticles.length - 1; i >= 0; i--) {
        const p = exParticles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.life -= dt;
        if (p.life <= 0) { exParticles.splice(i, 1); continue; }
        const pi = Math.min(i, MAX_EX - 1) * 3;
        exPos[pi] = p.x; exPos[pi + 1] = p.y; exPos[pi + 2] = p.z;
      }
      for (let i = trailParticles.length - 1; i >= 0; i--) {
        const p = trailParticles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.life -= dt;
        if (p.life <= 0) { trailParticles.splice(i, 1); continue; }
        const pi = Math.min(i, MAX_TRAIL - 1) * 3;
        trailPos[pi] = p.x; trailPos[pi + 1] = p.y; trailPos[pi + 2] = p.z;
      }
      exGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.position.needsUpdate = true;
      exMat.opacity = 0.4 + boostIntensity * 0.6;
      exMat.color.setHSL(0.54 + boostIntensity * 0.12, 1, 0.55 + boostIntensity * 0.3);
      trailMat.opacity = keys.boost ? 0.8 : 0.2;
      trailMat.size = 0.8 + boostIntensity * 0.8;

      // Pulse pads
      PADS.forEach((pad, i) => { pad.material.emissiveIntensity = 0.4 + Math.sin(ts * 0.005 + i) * 0.6; });

      // CAMÉRA — derrière et légèrement au-dessus du vaisseau, suit réellement le vaisseau
      // Pas de lag sur le T de piste, suit la position réelle du vaisseau
      const lookAheadPt = new THREE.Vector3(); trackCurve.getPointAt((trackT + 0.025) % 1, lookAheadPt);
      lookAheadPt.addScaledVector(right, shipLateralOffset * 0.7);

      // Position caméra derrière le vaisseau (dans le repère vaisseau)
      const camBehindLocal = new THREE.Vector3(0, 3.5 + boostIntensity * 1.8, -8.5);
      const camDesired = shipGroup.localToWorld(camBehindLocal.clone());

      // Shake
      if (camShake > 0) {
        camShake = Math.max(0, camShake - dt * 4);
        camDesired.x += (Math.random() - 0.5) * camShake;
        camDesired.y += (Math.random() - 0.5) * camShake * 0.5;
      }

      if (firstFrame) { camPos.copy(camDesired); camLookTarget.copy(lookAheadPt); firstFrame = false; }
      else { camPos.lerp(camDesired, 0.12); camLookTarget.lerp(lookAheadPt, 0.15); }

      camera.position.copy(camPos);
      camera.lookAt(camLookTarget);
      camera.fov = 68 + boostIntensity * 16;
      camera.updateProjectionMatrix();
      scene.fog.density = 0.009 + boostIntensity * 0.014;

      renderer.render(scene, camera);
    }

    requestAnimationFrame(t => { lastTs = t; loop(t); });

    function finishRace(totalTime) {
      const name = _ctx?.loadProfile?.()?.name || 'Racer';
      const allScores = loadScores();
      allScores.push({ name, time: totalTime, ts: Date.now() });
      allScores.sort((a, b) => a.time - b.time);
      saveScores(allScores);
      const isNew = !bestTime || totalTime < bestTime;
      fin.style.display = 'flex';
      fin.innerHTML = `
        <div style="font-size:48px">🏁</div>
        <div style="font-size:38px;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalTime)}</div>
        ${isNew ? '<div style="font-size:13px;color:#fbbf24;font-family:monospace;letter-spacing:2px">✦ NOUVEAU RECORD ✦</div>' : `<div style="font-size:12px;color:rgba(255,255,255,.4);font-family:monospace">Record: ${fmt(bestTime)}</div>`}
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:12px 24px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">↺ REJOUER</button>
          <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:12px 20px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">⟵ MENU</button>
        </div>`;
      fin.querySelector('#fin-retry').addEventListener('click', () => { fin.style.display = 'none'; stopRace(); startRace(container, easyMode); });
      fin.querySelector('#fin-menu').addEventListener('click', () => { fin.style.display = 'none'; stopRace(); renderRace(container); });
    }
  }

  window.YM_S['wipeout.sphere.js'] = {
    name: 'WipeOut', icon: '🚀', category: 'Games',
    description: 'Anti-gravity racer v3 — physique réelle, vaisseau delta, boost trail, bordures neon, caméra embarquée',
    emit: [], receive: [],
    activate(ctx) { _ctx = ctx; },
    deactivate() { stopRace(); },
    renderPanel,
    profileSection(container) {
      const scores = loadScores(); if (!scores.length) return;
      const best = scores[0];
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,245,255,.2);border-radius:12px;padding:10px';
      el.innerHTML = `<span style="font-size:24px">🚀</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#00f5ff">WipeOut Best</div></div><div style="font-size:16px;font-weight:700;color:#00f5ff;font-family:monospace">${fmt(best.time)}</div>`;
      container.appendChild(el);
    }
  };
})();
