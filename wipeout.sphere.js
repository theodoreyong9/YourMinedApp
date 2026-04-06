/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v2 — Three.js r128
// Améliorations : piste ruban plat, banking physique, effets boost visuels,
// compte-tours, meilleur temps, particules d'échappement, obstacles, skybox
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

  // ── PANEL ──────────────────────────────────────────────────────────────────
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
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;transition:color .2s;color:${id === 'race' ? '#00f5ff' : 'rgba(255,255,255,.4)'}`;
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
    const html = [`<div style="font-size:18px;font-weight:700;color:#00f5ff;margin-bottom:16px;text-shadow:0 0 20px rgba(0,245,255,.4)">🏆 Leaderboard</div>`];
    if (!scores.length) {
      html.push('<div style="color:rgba(255,255,255,.3);font-size:13px;text-align:center;margin-top:40px">Aucune course.<br>Prends la piste!</div>');
    } else {
      scores.forEach((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        html.push(`<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)">
          <span style="font-size:18px;width:28px">${medal}</span>
          <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">${s.name || 'Racer'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.4)">${new Date(s.ts).toLocaleDateString()}</div></div>
          <div style="font-size:15px;font-weight:700;color:#00f5ff;font-variant-numeric:tabular-nums">${fmt(s.time)}</div></div>`);
      });
    }
    container.innerHTML = html.join('');
  }

  // ── RACE SCREEN ────────────────────────────────────────────────────────────
  function renderRace(container) {
    container.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#000';
    stopRace();

    // Menu
    const menu = document.createElement('div');
    menu.id = 'wo-menu';
    menu.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
      background:linear-gradient(180deg,#000 0%,#030320 100%);z-index:20`;
    menu.innerHTML = `
      <div style="font-size:44px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-3px;line-height:1">WIPEOUT</div>
      <div style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:5px;font-family:monospace">ANTI-GRAVITY RACING</div>
      <div style="display:flex;flex-direction:column;gap:8px;width:200px;margin-top:8px">
        <button id="wo-start" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace">▶  RACE</button>
        <button id="wo-start-easy" style="background:transparent;border:1px solid rgba(0,245,255,.3);color:rgba(0,245,255,.7);font-size:13px;padding:10px;border-radius:10px;cursor:pointer;font-family:monospace">🟢  EASY MODE</button>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,.25);font-family:monospace;text-align:center;line-height:1.6">← → ou touches directionnelles<br>ESPACE = boost · 3 tours</div>`;
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

    // ── DOM ELEMENTS ──────────────────────────────────────────────────────
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
        <div id="wo-lap" style="font-size:22px;font-weight:700;color:#00f5ff;font-family:monospace;line-height:1">0/${TOTAL_LAPS}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px;font-family:monospace">TIME</div>
        <div id="wo-time" style="font-size:22px;font-weight:700;color:#00f5ff;font-family:monospace;line-height:1;text-shadow:0 0 12px rgba(0,245,255,.4)">0:00.00</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px;font-family:monospace">BEST</div>
        <div id="wo-best" style="font-size:16px;font-weight:700;color:rgba(0,245,255,.5);font-family:monospace;line-height:1">--:--.--</div>
      </div>`;
    container.appendChild(hud);

    // Speedometer
    const speedo = document.createElement('div');
    speedo.style.cssText = 'position:absolute;bottom:62px;left:12px;right:12px;pointer-events:none;z-index:10;display:flex;flex-direction:column;gap:5px';
    speedo.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);font-family:monospace;width:30px">SPD</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px">
          <div id="wo-spd" style="height:100%;background:linear-gradient(90deg,#00f5ff,#007fff);border-radius:2px;width:0%;transition:width .06s"></div>
        </div>
        <span id="wo-spd-num" style="font-size:10px;color:#00f5ff;font-family:monospace;width:28px;text-align:right">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);font-family:monospace;width:30px">BOS</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px">
          <div id="wo-bos" style="height:100%;background:linear-gradient(90deg,#7B2FFF,#c026d3);border-radius:2px;width:80%;transition:width .06s"></div>
        </div>
        <span id="wo-bos-num" style="font-size:10px;color:#a78bfa;font-family:monospace;width:28px;text-align:right">80</span>
      </div>`;
    container.appendChild(speedo);

    // Touch controls
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'position:absolute;bottom:62px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 16px;z-index:10';
    ctrl.innerHTML = `
      <button id="wo-bl" style="width:56px;height:56px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;font-size:22px;cursor:pointer;-webkit-tap-highlight-color:transparent">◀</button>
      <button id="wo-bb" style="width:56px;height:56px;border-radius:50%;background:rgba(123,47,255,.2);border:1px solid rgba(123,47,255,.4);color:#c4b5fd;font-size:22px;cursor:pointer;-webkit-tap-highlight-color:transparent">▲</button>
      <button id="wo-br" style="width:56px;height:56px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;font-size:22px;cursor:pointer;-webkit-tap-highlight-color:transparent">▶</button>`;
    container.appendChild(ctrl);

    // Finish overlay
    const fin = document.createElement('div');
    fin.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.88);z-index:30;backdrop-filter:blur(4px)';
    container.appendChild(fin);

    // ── THREE.JS SETUP ────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    _renderer = renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000510, 0.012);
    scene.background = new THREE.Color(0x000510);

    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 600);
    camera.position.set(0, 3, -6);

    // ── SKYBOX-LIKE ENVIRONMENT ───────────────────────────────────────────
    // Étoiles
    const starVerts = new Float32Array(4500);
    for (let i = 0; i < 4500; i += 3) {
      starVerts[i] = (Math.random() - 0.5) * 800;
      starVerts[i + 1] = (Math.random() - 0.5) * 600;
      starVerts[i + 2] = (Math.random() - 0.5) * 800;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starVerts, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));

    // Grilles holographiques au sol (décoratives)
    const gridHelper = new THREE.GridHelper(400, 40, 0x0a1f3f, 0x050f20);
    gridHelper.position.y = -15;
    scene.add(gridHelper);

    // Pylônes décoratifs
    const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 25, 6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, emissive: 0x001030, metalness: 0.8, roughness: 0.3 });
    const pillarPositions = [
      [-40, -12, 60], [40, -12, 60], [-60, -12, -20], [60, -12, -20],
      [-30, -12, -80], [30, -12, -80], [0, -12, 110]
    ];
    pillarPositions.forEach(([x, y, z]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, y, z);
      scene.add(p);
      // Anneau lumineux
      const ringGeo = new THREE.TorusGeometry(2, 0.15, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x00f5ff : 0x7B2FFF });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, y + 10 + Math.random() * 5, z);
      scene.add(ring);
    });

    // ── TRACK (RIBBON PLAT) ───────────────────────────────────────────────
    const N_CTRL = 48;
    const TRACK_CTRL = [];
    for (let i = 0; i < N_CTRL; i++) {
      const t = i / N_CTRL * Math.PI * 2;
      const r = 90;
      TRACK_CTRL.push(new THREE.Vector3(
        Math.sin(t) * r + Math.sin(t * 3) * 16,
        Math.sin(t * 2) * 6 + Math.cos(t * 3) * 4,
        Math.cos(t) * r + Math.cos(t * 2) * 22
      ));
    }
    const trackCurve = new THREE.CatmullRomCurve3(TRACK_CTRL, true, 'catmullrom', 0.5);
    const N_STEPS = 350;
    const TRACK_W = 16;

    // Construire le mesh ruban manuellement
    const positions = [], uvCoords = [], indices = [], trackNormals = [];
    // Precalcule les frames de Frenet
    const frames = trackCurve.computeFrenetFrames(N_STEPS, true);
    for (let i = 0; i <= N_STEPS; i++) {
      const idx = i % N_STEPS;
      const pt = new THREE.Vector3(); trackCurve.getPointAt(i / N_STEPS, pt);
      const N = frames.normals[idx];
      const up = frames.binormals[idx];

      // On veut la piste HORIZONTALE -> utilise world up projeté
      const worldUp = new THREE.Vector3(0, 1, 0);
      const tan = frames.tangents[idx].clone();
      const right = new THREE.Vector3().crossVectors(tan, worldUp).normalize();
      // Légère inclinaison basée sur la courbure
      const curv = (i < N_STEPS) ? frames.tangents[(i + 1) % N_STEPS].clone().sub(tan).length() * 8 : 0;

      const L = pt.clone().addScaledVector(right, -TRACK_W / 2);
      const R = pt.clone().addScaledVector(right, TRACK_W / 2);
      // Bombé léger
      L.y -= 0.3; R.y -= 0.3;

      positions.push(L.x, L.y, L.z, R.x, R.y, R.z);
      trackNormals.push(0, 1, 0, 0, 1, 0);
      uvCoords.push(i / N_STEPS * 20, 0, i / N_STEPS * 20, 1);
      if (i < N_STEPS) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    // Fermer la boucle
    const last = N_STEPS * 2;
    indices.push(last, last + 1, 0, last + 1, 1, 0);

    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    tGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(trackNormals), 3));
    tGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvCoords), 2));
    tGeo.setIndex(indices);

    // Texture damier
    const texSize = 128;
    const texData = new Uint8Array(texSize * texSize * 4);
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        const idx4 = (y * texSize + x) * 4;
        const checker = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0);
        const v = checker ? 15 : 22;
        texData[idx4] = v; texData[idx4 + 1] = v; texData[idx4 + 2] = v + 8; texData[idx4 + 3] = 255;
      }
    }
    const trackTex = new THREE.DataTexture(texData, texSize, texSize, THREE.RGBAFormat);
    trackTex.wrapS = trackTex.wrapT = THREE.RepeatWrapping; trackTex.needsUpdate = true;

    const tMat = new THREE.MeshStandardMaterial({
      map: trackTex, roughness: 0.35, metalness: 0.6,
      side: THREE.DoubleSide
    });
    scene.add(new THREE.Mesh(tGeo, tMat));

    // Bordures néon gauche / droite
    const edgeColors = [0x00f5ff, 0x7B2FFF];
    [0, 1].forEach(side => {
      const edgePts = [];
      for (let i = 0; i <= N_STEPS; i++) {
        const pt = new THREE.Vector3(); trackCurve.getPointAt(i / N_STEPS, pt);
        const tan = frames.tangents[i % N_STEPS].clone();
        const wUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(tan, wUp).normalize();
        const s = side === 0 ? -1 : 1;
        const ep = pt.clone().addScaledVector(right, s * (TRACK_W / 2 - 0.2));
        ep.y += 0.25;
        edgePts.push(ep);
      }
      const eGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
      scene.add(new THREE.Line(eGeo, new THREE.LineBasicMaterial({ color: edgeColors[side], linewidth: 2 })));
    });

    // Ligne de départ
    {
      const startPt = new THREE.Vector3(); trackCurve.getPointAt(0, startPt);
      const tan = frames.tangents[0].clone();
      const wUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tan, wUp).normalize();
      const slGeo = new THREE.BufferGeometry().setFromPoints([
        startPt.clone().addScaledVector(right, -TRACK_W / 2 + 0.5).add(new THREE.Vector3(0, 0.3, 0)),
        startPt.clone().addScaledVector(right, TRACK_W / 2 - 0.5).add(new THREE.Vector3(0, 0.3, 0))
      ]);
      scene.add(new THREE.Line(slGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));
    }

    // ── BOOST PADS ────────────────────────────────────────────────────────
    const PAD_T = [0.08, 0.20, 0.33, 0.46, 0.60, 0.73, 0.87];
    const padMat = new THREE.MeshStandardMaterial({ color: 0x5B0FBF, emissive: 0x3B007F, roughness: 0.1, metalness: 0.95 });
    const padGeo = new THREE.BoxGeometry(TRACK_W - 3, 0.3, 3);
    const PADS = [];
    PAD_T.forEach(t => {
      const pt = new THREE.Vector3(); trackCurve.getPointAt(t, pt);
      const idx = Math.floor(t * N_STEPS) % N_STEPS;
      const tan = frames.tangents[idx];
      const wUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tan, wUp).normalize();
      const pad = new THREE.Mesh(padGeo, padMat.clone());
      pad.position.copy(pt).add(new THREE.Vector3(0, 0.3, 0));
      pad.lookAt(pt.clone().add(tan));
      pad.userData.t = t;
      scene.add(pad);
      PADS.push(pad);

      // Fleches lumineuses sur le pad
      for (let k = 0; k < 3; k++) {
        const aGeo = new THREE.ConeGeometry(0.4, 1, 4);
        const aMat = new THREE.MeshBasicMaterial({ color: 0xc4b5fd });
        const arrow = new THREE.Mesh(aGeo, aMat);
        arrow.position.copy(pt).add(new THREE.Vector3(0, 0.8, 0)).addScaledVector(tan, (k - 1) * 1.5);
        arrow.rotation.copy(pad.rotation);
        scene.add(arrow);
      }
    });

    // ── VAISSEAU ──────────────────────────────────────────────────────────
    const shipGroup = new THREE.Group();

    // Corps principal (ellipsoïde aplati)
    const bodyGeo = new THREE.SphereGeometry(1, 8, 6);
    bodyGeo.scale(1.4, 0.3, 2.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0066aa, emissive: 0x001833, metalness: 0.95, roughness: 0.05 });
    shipGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

    // Ailes avant
    [-1, 1].forEach(s => {
      const wGeo = new THREE.BoxGeometry(2.2, 0.12, 0.9);
      const wing = new THREE.Mesh(wGeo, bodyMat);
      wing.position.set(s * 1.1, 0, 0.4); wing.rotation.z = s * 0.05;
      shipGroup.add(wing);
    });
    // Ailes arrière (plus petites)
    [-1, 1].forEach(s => {
      const wGeo = new THREE.BoxGeometry(1.4, 0.1, 0.6);
      const wing = new THREE.Mesh(wGeo, bodyMat);
      wing.position.set(s * 0.7, 0, -1.0);
      shipGroup.add(wing);
    });

    // Moteurs (2 cylindres arrière)
    [-1, 1].forEach(s => {
      const eGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.8, 8);
      eGeo.rotateX(Math.PI / 2);
      const eMat = new THREE.MeshStandardMaterial({ color: 0x112244, metalness: 0.9, roughness: 0.1 });
      const eng = new THREE.Mesh(eGeo, eMat);
      eng.position.set(s * 0.55, -0.05, -1.5);
      shipGroup.add(eng);
    });

    // Cockpit
    const cockGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const cockMat = new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x003366, metalness: 0.3, roughness: 0.0, transparent: true, opacity: 0.7 });
    const cockpit = new THREE.Mesh(cockGeo, cockMat);
    cockpit.position.set(0, 0.18, 0.6); cockpit.scale.set(1, 0.5, 0.8);
    shipGroup.add(cockpit);

    // Lueurs moteurs
    const engineGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const glows = [];
    [-1, 1].forEach(s => {
      const gGeo = new THREE.SphereGeometry(0.2, 6, 6);
      const g = new THREE.Mesh(gGeo, engineGlowMat.clone());
      g.position.set(s * 0.55, -0.05, -1.8);
      shipGroup.add(g);
      glows.push(g);
    });
    scene.add(shipGroup);

    // Hover pads sous le vaisseau (suspensions magnétiques)
    const hoverPadMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const hoverPads = [];
    [[-0.7, -1.0], [0.7, -1.0], [-0.7, 1.0], [0.7, 1.0]].forEach(([x, z]) => {
      const pg = new THREE.SphereGeometry(0.08, 6, 6);
      const p = new THREE.Mesh(pg, hoverPadMat);
      p.position.set(x, -0.2, z);
      shipGroup.add(p);
      hoverPads.push(p);
    });

    // ── PARTICULES D'ECHAPPEMENT ──────────────────────────────────────────
    const MAX_EX = 60;
    const exPos = new Float32Array(MAX_EX * 3);
    const exGeo = new THREE.BufferGeometry();
    exGeo.setAttribute('position', new THREE.BufferAttribute(exPos, 3));
    const exMat = new THREE.PointsMaterial({ color: 0x00f5ff, size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    scene.add(new THREE.Points(exGeo, exMat));
    const exParticles = [];

    // ── LUMIERES ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x112244, 2.5));
    const sunLight = new THREE.DirectionalLight(0x4488ff, 3.5);
    sunLight.position.set(10, 40, 20);
    scene.add(sunLight);
    const shipLight = new THREE.PointLight(0x00f5ff, 8, 30);
    scene.add(shipLight);
    const boostLight = new THREE.PointLight(0x7B2FFF, 0, 20);
    scene.add(boostLight);

    // ── PHYSIQUE ──────────────────────────────────────────────────────────
    let trackT = 0.001;
    let speed = 0.00025;
    const BASE_SPEED = easyMode ? 0.00035 : 0.00028;
    const MAX_SPEED = easyMode ? 0.0020 : 0.0018;
    let boost = 0.7;
    let steer = 0;
    let bank = 0;
    let hoverPhase = 0;
    let lapCount = 0;
    let prevT = 0;
    let raceStart = Date.now();
    let finished = false;

    const scores = loadScores();
    const bestTime = scores.length ? scores[0].time : 0;
    if (bestTime) document.getElementById('wo-best').textContent = fmt(bestTime);
    document.getElementById('wo-lap').textContent = `0/${TOTAL_LAPS}`;

    // Caméra state
    let camPos = new THREE.Vector3(0, 3, -6);
    let camLookTarget = new THREE.Vector3();
    let camShake = 0;

    // Contrôles
    const keys = { left: false, right: false, boost: false };
    const onKey = e => {
      const d = e.type === 'keydown';
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = d;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = d;
      if (e.key === ' ' || e.key === 'ArrowUp') { keys.boost = d; if (d) e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const bl = container.querySelector('#wo-bl');
    const br = container.querySelector('#wo-br');
    const bb = container.querySelector('#wo-bb');
    const pd = k => () => keys[k] = true;
    const pu = k => () => keys[k] = false;
    bl.addEventListener('pointerdown', pd('left')); bl.addEventListener('pointerup', pu('left')); bl.addEventListener('pointerleave', pu('left'));
    br.addEventListener('pointerdown', pd('right')); br.addEventListener('pointerup', pu('right')); br.addEventListener('pointerleave', pu('right'));
    bb.addEventListener('pointerdown', pd('boost')); bb.addEventListener('pointerup', pu('boost')); bb.addEventListener('pointerleave', pu('boost'));

    // ── RESIZE ────────────────────────────────────────────────────────────
    const obs = new ResizeObserver(() => {
      const W2 = canvas.offsetWidth, H2 = canvas.offsetHeight;
      if (!W2 || !H2) return;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
    });
    obs.observe(canvas);

    // ── LOOP ─────────────────────────────────────────────────────────────
    let lastTs = 0;
    function loop(ts) {
      if (!_running) {
        obs.disconnect();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        return;
      }
      _raf = requestAnimationFrame(loop);
      const dt = Math.min((ts - lastTs) / 1000, 0.05); lastTs = ts;

      if (!finished) {
        // Steer
        const steerForce = 0.075;
        if (keys.left) steer = Math.max(-1, steer - steerForce);
        else if (keys.right) steer = Math.min(1, steer + steerForce);
        else steer *= 0.82;

        // Boost logic
        let onPad = false;
        PADS.forEach(pad => {
          const diff = Math.abs(trackT - pad.userData.t);
          if (diff < 0.009 || diff > 0.991) onPad = true;
        });
        if (keys.boost) {
          boost = Math.max(0, boost - 0.004);
        }
        if (onPad) {
          boost = Math.min(1, boost + 0.06);
          camShake = 0.4;
        }
        boost = Math.min(1, boost + 0.0018); // recharge naturelle

        const boostActive = keys.boost && boost > 0;
        const effectiveBoost = boostActive ? boost : (onPad ? 0.8 : 0);
        const targetSpeed = BASE_SPEED * (1 + effectiveBoost * 2.5);
        speed += (targetSpeed - speed) * 0.05;
        speed = Math.min(speed, MAX_SPEED);
        trackT = (trackT + speed) % 1;

        // Lap detection
        if (prevT > 0.96 && trackT < 0.04) {
          lapCount++;
          document.getElementById('wo-lap').textContent = `${lapCount}/${TOTAL_LAPS}`;
          camShake = 0.8;
          if (lapCount >= TOTAL_LAPS) {
            finished = true;
            const totalTime = Date.now() - raceStart;
            finishRace(totalTime);
          }
        }
        prevT = trackT;

        // HUD update
        const elapsed = Date.now() - raceStart;
        document.getElementById('wo-time').textContent = fmt(elapsed);
        const spdPct = Math.round(speed / MAX_SPEED * 100);
        const bosPct = Math.round(boost * 100);
        document.getElementById('wo-spd').style.width = spdPct + '%';
        document.getElementById('wo-bos').style.width = bosPct + '%';
        document.getElementById('wo-spd-num').textContent = Math.round(speed * 80000);
        document.getElementById('wo-bos-num').textContent = bosPct;
      }

      // ── POSITION VAISSEAU ─────────────────────────────────────────────
      const shipPt = new THREE.Vector3();
      const shipTan = new THREE.Vector3();
      trackCurve.getPointAt(trackT, shipPt);
      trackCurve.getTangentAt(trackT, shipTan);

      const wUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(shipTan, wUp).normalize();

      hoverPhase += dt * 2.5;
      const hoverY = Math.sin(hoverPhase) * 0.12 + 0.95;

      shipGroup.position.copy(shipPt)
        .addScaledVector(right, steer * 3.5)
        .add(new THREE.Vector3(0, hoverY, 0));

      // Orientation vaisseau
      const fwdPt = new THREE.Vector3(); trackCurve.getPointAt((trackT + 0.018) % 1, fwdPt);
      shipGroup.lookAt(fwdPt);

      // Banking progressif
      bank += ((-steer * 0.55) - bank) * 0.14;
      shipGroup.rotateZ(bank);

      // Légère inclinaison vers l'avant à haute vitesse
      shipGroup.rotateX(-speed / MAX_SPEED * 0.1);

      // Hover pads scintillement
      hoverPads.forEach((p, i) => {
        p.material.color.setHSL(0.54, 1, 0.4 + Math.sin(hoverPhase * 1.5 + i) * 0.3);
        p.scale.setScalar(0.8 + Math.sin(hoverPhase + i * 1.5) * 0.4);
      });

      // Engine glow
      const boostIntensity = speed / MAX_SPEED;
      glows.forEach((g, i) => {
        g.material.color.setHSL(0.54 + boostIntensity * 0.08, 1, 0.4 + boostIntensity * 0.4);
        g.scale.setScalar(0.6 + boostIntensity * 1.2 + Math.sin(ts * 0.015 + i) * 0.15);
      });

      // Lumières
      shipLight.position.copy(shipGroup.position);
      shipLight.intensity = 5 + boostIntensity * 10;
      shipLight.color.setHSL(0.54 + boostIntensity * 0.05, 1, 0.7);
      boostLight.position.copy(shipGroup.position);
      boostLight.intensity = keys.boost ? boost * 15 : 0;

      // ── PARTICULES ECHAPPEMENT ────────────────────────────────────────
      const exOrigin = shipGroup.localToWorld(new THREE.Vector3(0, 0, -1.9));
      const backward = shipGroup.localToWorld(new THREE.Vector3(0, 0, -4)).sub(exOrigin).normalize();
      if (_running && !finished && exParticles.length < MAX_EX - 2) {
        const spread = 0.4 + boostIntensity;
        exParticles.push({
          x: exOrigin.x, y: exOrigin.y, z: exOrigin.z,
          vx: backward.x * (60 + boostIntensity * 150) + (Math.random() - 0.5) * 10,
          vy: backward.y * (60 + boostIntensity * 150) + (Math.random() - 0.3) * 8,
          vz: backward.z * (60 + boostIntensity * 150) + (Math.random() - 0.5) * 10,
          life: 0.4 + boostIntensity * 0.3
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
      exGeo.attributes.position.needsUpdate = true;
      exMat.opacity = 0.4 + boostIntensity * 0.6;
      exMat.color.setHSL(0.54 + boostIntensity * 0.1, 1, 0.6 + boostIntensity * 0.3);

      // Pad animation pulsation
      PADS.forEach((pad, i) => {
        pad.material.emissiveIntensity = 0.5 + Math.sin(ts * 0.004 + i * 0.8) * 0.5;
      });

      // ── CAMERA ───────────────────────────────────────────────────────
      // Position derrière et légèrement au-dessus
      const lookAheadPt = new THREE.Vector3(); trackCurve.getPointAt((trackT + 0.02) % 1, lookAheadPt);
      const camBehind = new THREE.Vector3(); trackCurve.getPointAt(Math.max(0, trackT - 0.018), camBehind);
      const desiredCam = camBehind.clone()
        .addScaledVector(right, steer * 1.2)
        .add(new THREE.Vector3(0, 3.5 + boostIntensity * 1.5, 0));

      // Camera shake
      if (camShake > 0) {
        camShake -= dt * 3;
        desiredCam.x += (Math.random() - 0.5) * camShake * 0.8;
        desiredCam.y += (Math.random() - 0.5) * camShake * 0.4;
      }

      camPos.lerp(desiredCam, 0.10);
      camera.position.copy(camPos);
      const desiredLook = lookAheadPt.clone().addScaledVector(right, steer * 0.8);
      camLookTarget.lerp(desiredLook, 0.12);
      camera.lookAt(camLookTarget);

      // FOV dynamique selon vitesse
      camera.fov = 68 + boostIntensity * 14;
      camera.updateProjectionMatrix();

      // Fog dynamique
      scene.fog.density = 0.010 + boostIntensity * 0.012;

      renderer.render(scene, camera);
    }

    requestAnimationFrame(t => { lastTs = t; loop(t); });

    function finishRace(totalTime) {
      const name = _ctx?.loadProfile?.()?.name || 'Racer';
      const allScores = loadScores();
      allScores.push({ name, time: totalTime, ts: Date.now() });
      allScores.sort((a, b) => a.time - b.time);
      saveScores(allScores);
      if (window.YM_P2P) try { window.YM_P2P.broadcast({ sphere: 'wipeout.sphere.js', type: 'wo:score', data: { name, time: totalTime } }); } catch (e) { }

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
      fin.querySelector('#fin-retry').addEventListener('click', () => {
        fin.style.display = 'none';
        stopRace();
        startRace(container, easyMode);
      });
      fin.querySelector('#fin-menu').addEventListener('click', () => {
        fin.style.display = 'none';
        stopRace();
        renderRace(container);
      });
    }
  }

  // ── SPHERE ─────────────────────────────────────────────────────────────────
  window.YM_S['wipeout.sphere.js'] = {
    name: 'WipeOut', icon: '🚀', category: 'Games',
    description: 'Anti-gravity racer v2 — piste ruban, banking physique, boost pads, particules, 3 tours',
    emit: [], receive: [],
    activate(ctx) { _ctx = ctx; },
    deactivate() { stopRace(); },
    renderPanel,
    profileSection(container) {
      const scores = loadScores(); if (!scores.length) return;
      const best = scores[0];
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,245,255,.2);border-radius:12px;padding:10px';
      el.innerHTML = `<span style="font-size:24px">🚀</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#00f5ff">WipeOut Best</div>
        <div style="font-size:11px;color:rgba(255,255,255,.5)">${best.name || '—'}</div></div>
        <div style="font-size:16px;font-weight:700;color:#00f5ff;font-family:monospace">${fmt(best.time)}</div>`;
      container.appendChild(el);
    },
    broadcastData() {
      const scores = loadScores(); if (!scores.length) return {};
      return { wipeoutScore: scores[0]?.time || 0 };
    }
  };
})();
