/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v4
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
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:monospace';
    container.innerHTML = '';
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#080808';
    [['race','🏁 Race'],['scores','🏆 Scores']].forEach(([id,label],idx) => {
      const t = document.createElement('div');
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;color:${idx===0?'#00f5ff':'rgba(255,255,255,.4)'}`;
      t.textContent = label;
      t.addEventListener('click', () => {
        tabs.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#00f5ff':'rgba(255,255,255,.4)');
        track.innerHTML = '';
        if (id==='race') renderRace(track); else renderLeaderboard(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track); container.appendChild(tabs);
    renderRace(track);
  }

  function renderLeaderboard(container) {
    container.style.cssText = 'flex:1;overflow-y:auto;padding:16px;background:#000';
    const scores = loadScores().sort((a,b)=>(a.time||99999999)-(b.time||99999999));
    let html = `<div style="font-size:18px;font-weight:700;color:#00f5ff;margin-bottom:16px">🏆 Leaderboard</div>`;
    if (!scores.length) { html += '<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">Aucune course.</div>'; }
    else scores.forEach((s,i) => {
      const medal = ['🥇','🥈','🥉'][i]||`#${i+1}`;
      html += `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,.04)">
        <span>${medal}</span><div style="flex:1;color:#fff;font-size:13px">${s.name||'Racer'}</div>
        <div style="color:#00f5ff;font-size:15px;font-weight:700">${fmt(s.time)}</div></div>`;
    });
    container.innerHTML = html;
  }

  function renderRace(container) {
    container.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#000';
    stopRace();
    const menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(180deg,#000,#030320);z-index:20';
    menu.innerHTML = `
      <div style="font-size:44px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-3px">WIPEOUT</div>
      <div style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:5px">ANTI-GRAVITY RACING</div>
      <div style="display:flex;flex-direction:column;gap:8px;width:200px;margin-top:8px">
        <button id="wo-start" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px">▶  RACE</button>
        <button id="wo-easy" style="background:transparent;border:1px solid rgba(0,245,255,.3);color:rgba(0,245,255,.7);font-size:13px;padding:10px;border-radius:10px;cursor:pointer">🟢  EASY MODE</button>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,.25);text-align:center;line-height:1.8">← → diriger · ESPACE = boost · 3 tours</div>`;
    container.appendChild(menu);
    menu.querySelector('#wo-start').onclick = () => { menu.remove(); startRace(container, false); };
    menu.querySelector('#wo-easy').onclick   = () => { menu.remove(); startRace(container, true); };
  }

  function stopRace() {
    _running = false;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (_renderer) { try { _renderer.dispose(); } catch(e){} _renderer = null; }
  }

  function startRace(container, easyMode) {
    if (!window.THREE) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => startRace(container, easyMode);
      document.head.appendChild(s);
      return;
    }
    stopRace();
    _running = true;
    const THREE = window.THREE;
    const TOTAL_LAPS = easyMode ? 2 : 3;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const W = canvas.offsetWidth || 360, H = canvas.offsetHeight || 480;
    canvas.width = W; canvas.height = H;

    // HUD overlay
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:8px 14px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:10;font-family:monospace';
    hud.innerHTML = `
      <div><div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px">LAP</div>
           <div id="wo-lap" style="font-size:22px;font-weight:700;color:#00f5ff">0/${TOTAL_LAPS}</div></div>
      <div style="text-align:center"><div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px">TIME</div>
           <div id="wo-time" style="font-size:22px;font-weight:700;color:#00f5ff">0:00.00</div></div>
      <div style="text-align:right"><div style="font-size:9px;color:rgba(0,245,255,.5);letter-spacing:2px">BEST</div>
           <div id="wo-best" style="font-size:16px;color:rgba(0,245,255,.5)">--:--.--</div></div>`;
    container.appendChild(hud);

    const speedo = document.createElement('div');
    speedo.style.cssText = 'position:absolute;bottom:68px;left:12px;right:12px;pointer-events:none;z-index:10;font-family:monospace;display:flex;flex-direction:column;gap:5px';
    speedo.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);width:30px">SPD</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div id="wo-spd" style="height:100%;background:linear-gradient(90deg,#00f5ff,#007fff);border-radius:2px;width:0%"></div></div>
        <span id="wo-spdN" style="font-size:10px;color:#00f5ff;width:36px;text-align:right">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px;color:rgba(255,255,255,.4);width:30px">BOS</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div id="wo-bos" style="height:100%;background:linear-gradient(90deg,#7B2FFF,#c026d3);border-radius:2px;width:80%"></div></div>
        <span id="wo-bosN" style="font-size:10px;color:#a78bfa;width:36px;text-align:right">80</span>
      </div>`;
    container.appendChild(speedo);

    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'position:absolute;bottom:68px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 16px;z-index:10';
    ctrl.innerHTML = `
      <button id="wo-bl" style="width:60px;height:60px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.3);color:#00f5ff;font-size:24px;cursor:pointer">◀</button>
      <button id="wo-bb" style="width:60px;height:60px;border-radius:50%;background:rgba(123,47,255,.15);border:1px solid rgba(123,47,255,.4);color:#c4b5fd;font-size:24px;cursor:pointer">⚡</button>
      <button id="wo-br" style="width:60px;height:60px;border-radius:50%;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.3);color:#00f5ff;font-size:24px;cursor:pointer">▶</button>`;
    container.appendChild(ctrl);

    const fin = document.createElement('div');
    fin.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.9);z-index:30';
    container.appendChild(fin);

    // ── THREE.JS ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    _renderer = renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000510, 0.009);
    scene.background = new THREE.Color(0x000510);
    const camera = new THREE.PerspectiveCamera(72, W/H, 0.1, 900);

    // Stars
    const sv = new Float32Array(6000);
    for (let i=0;i<6000;i+=3){ sv[i]=(Math.random()-.5)*1200; sv[i+1]=(Math.random()-.5)*900; sv[i+2]=(Math.random()-.5)*1200; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sv,3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color:0xffffff,size:0.7})));

    // Nébuleuses — FIX: utiliser .position.set() et non Object.assign
    [[0x3300ff,-300,80,-200,180],[0xff0066,250,-50,300,150],[0x00ffaa,-200,30,400,160]].forEach(([col,x,y,z,r])=>{
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r,8,8),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.04,side:THREE.BackSide})
      );
      m.position.set(x,y,z); // FIX: .set() pas Object.assign
      scene.add(m);
    });

    // ── TRACK ─────────────────────────────────────────────────────────────
    const N_CTRL = 52;
    const ctrl_pts = [];
    for (let i=0;i<N_CTRL;i++){
      const t=i/N_CTRL*Math.PI*2, r=100;
      ctrl_pts.push(new THREE.Vector3(
        Math.sin(t)*r + Math.sin(t*2)*24 + Math.sin(t*5)*8,
        Math.sin(t*2.5)*10 + Math.cos(t*3)*6,
        Math.cos(t)*r + Math.cos(t*2)*28 + Math.cos(t*4)*6
      ));
    }
    const trackCurve = new THREE.CatmullRomCurve3(ctrl_pts, true,'catmullrom',0.5);
    const N_STEPS = 400, TRACK_W = 18;
    const frames = trackCurve.computeFrenetFrames(N_STEPS, true);

    // Build ribbon mesh
    const tp=[], tn=[], tuv=[], ti=[];
    for(let i=0;i<=N_STEPS;i++){
      const pt=new THREE.Vector3(); trackCurve.getPointAt(i/N_STEPS,pt);
      const tan=frames.tangents[i%N_STEPS];
      const right=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
      const L=pt.clone().addScaledVector(right,-TRACK_W/2);
      const R=pt.clone().addScaledVector(right, TRACK_W/2);
      tp.push(L.x,L.y,L.z, R.x,R.y,R.z);
      tn.push(0,1,0, 0,1,0);
      tuv.push(i/N_STEPS*24,0, i/N_STEPS*24,1);
      if(i<N_STEPS){ const b=i*2; ti.push(b,b+1,b+2, b+1,b+3,b+2); }
    }
    const last=N_STEPS*2; ti.push(last,last+1,0, last+1,1,0);
    const tGeo=new THREE.BufferGeometry();
    tGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tp),3));
    tGeo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(tn),3));
    tGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(tuv),2));
    tGeo.setIndex(ti);

    // Track texture
    const ts=256; const td=new Uint8Array(ts*ts*4);
    for(let y=0;y<ts;y++) for(let x=0;x<ts;x++){
      const i4=(y*ts+x)*4, lane=x/ts;
      const stripe=Math.sin(y/ts*Math.PI*2*18)*0.5+0.5;
      const isEdge=lane<0.04||lane>0.96;
      const isCtr=Math.abs(lane-0.5)<0.012;
      let rv=14,gv=16,bv=24;
      if(isEdge){rv=0;gv=80;bv=120;}
      else if(isCtr){rv=30;gv=30;bv=65;}
      else{rv+=stripe*5;gv+=stripe*5;bv+=stripe*10;}
      td[i4]=rv;td[i4+1]=gv;td[i4+2]=bv;td[i4+3]=255;
    }
    const trackTex=new THREE.DataTexture(td,ts,ts,THREE.RGBAFormat);
    trackTex.wrapS=trackTex.wrapT=THREE.RepeatWrapping; trackTex.needsUpdate=true;
    scene.add(new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({map:trackTex,roughness:0.3,metalness:0.7,side:THREE.DoubleSide})));

    // Neon borders
    [[-1,0x00f5ff],[1,0x7B2FFF]].forEach(([side,col])=>{
      const pts=[]; const pts2=[];
      for(let i=0;i<=N_STEPS;i++){
        const pt=new THREE.Vector3(); trackCurve.getPointAt(i/N_STEPS,pt);
        const tan=frames.tangents[i%N_STEPS];
        const right=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
        const ep=pt.clone().addScaledVector(right,side*(TRACK_W/2-0.2)); ep.y+=0.3;
        pts.push(ep.clone());
        ep.y+=0.5; pts2.push(ep.clone());
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:col})));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.25})));
    });

    // Pylônes décoratifs le long de la piste
    for(let i=0;i<20;i++){
      const t=i/20;
      const pt=new THREE.Vector3(); trackCurve.getPointAt(t,pt);
      const tan=frames.tangents[Math.floor(t*N_STEPS)%N_STEPS];
      const right=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
      const side=i%2===0?1:-1;
      const post=new THREE.Mesh(
        new THREE.CylinderGeometry(0.12,0.12,6,5),
        new THREE.MeshStandardMaterial({color:0x0a0018,metalness:0.9})
      );
      post.position.copy(pt).addScaledVector(right,side*(TRACK_W/2+2)).add(new THREE.Vector3(0,3,0));
      scene.add(post);
      const lightColors=[0xff3366,0x00f5ff,0xffaa00,0x7B2FFF];
      const lc=lightColors[i%lightColors.length];
      const ball=new THREE.Mesh(new THREE.SphereGeometry(0.22,6,6), new THREE.MeshBasicMaterial({color:lc}));
      ball.position.copy(post.position).add(new THREE.Vector3(0,3.3,0));
      scene.add(ball);
      const pl=new THREE.PointLight(lc,3.5,16); pl.position.copy(ball.position); scene.add(pl);
    }

    // Boost pads
    const PAD_T=[0.07,0.18,0.30,0.44,0.57,0.70,0.83,0.94];
    const PADS=[];
    PAD_T.forEach(t=>{
      const pt=new THREE.Vector3(); trackCurve.getPointAt(t,pt);
      const idx=Math.floor(t*N_STEPS)%N_STEPS;
      const tan=frames.tangents[idx];
      const pad=new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_W-4,0.15,3.5),
        new THREE.MeshStandardMaterial({color:0x4400cc,emissive:0x2200aa,roughness:0.1,metalness:0.95,transparent:true,opacity:0.9})
      );
      pad.position.copy(pt).add(new THREE.Vector3(0,0.22,0));
      pad.lookAt(pt.clone().add(tan));
      pad.userData.t=t; scene.add(pad); PADS.push(pad);
      // Flèches
      [-1.6,0,1.6].forEach(k=>{
        const a=new THREE.Mesh(new THREE.ConeGeometry(0.45,1.1,3), new THREE.MeshBasicMaterial({color:0xaa88ff}));
        a.position.copy(pt).add(new THREE.Vector3(0,0.65,0)).addScaledVector(tan,k);
        a.lookAt(pt.clone().add(tan).add(new THREE.Vector3(0,-1,0)));
        scene.add(a);
      });
    });

    // ── VAISSEAU ───────────────────────────────────────────────────────────
    const ship = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({color:0x003366,emissive:0x000820,metalness:0.98,roughness:0.03});
    const accentMat = new THREE.MeshStandardMaterial({color:0x0055bb,emissive:0x001833,metalness:0.95,roughness:0.04});

    // Fuselage
    const fuseG = new THREE.CylinderGeometry(0.32,0.14,4.2,8); fuseG.rotateX(Math.PI/2);
    ship.add(new THREE.Mesh(fuseG, bodyMat));
    // Carapace plate
    const shellG = new THREE.BoxGeometry(2.9,0.2,3.4);
    const shell = new THREE.Mesh(shellG, bodyMat); shell.position.set(0,0.08,-0.1); ship.add(shell);

    // Ailes delta — FIX: triangles corrects, pas wingPts[3] en double
    [-1,1].forEach(s=>{
      const verts = new Float32Array([
        // Triangle avant
        0,0,1.5,   s*2.9,0,0.1,  0,0,-1.0,
        // Triangle arrière
        s*2.9,0,0.1,  s*2.2,0,-1.5,  0,0,-1.0
      ]);
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(verts,3));
      wg.computeVertexNormals();
      const wing = new THREE.Mesh(wg, accentMat);
      wing.position.y = -0.04;
      ship.add(wing);
      // Winglet
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.7,0.9), bodyMat);
      wl.position.set(s*2.7,0.28,-1.1); ship.add(wl);
    });

    // Moteurs — 2 cylindres
    const engMat = new THREE.MeshStandardMaterial({color:0x0d1020,metalness:0.9,roughness:0.1});
    const glows = [];
    [-0.78,0.78].forEach(s=>{
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.40,1.3,10), engMat);
      outer.rotation.x=Math.PI/2; outer.position.set(s,-0.06,-1.9); ship.add(outer);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.23,1.35,8), new THREE.MeshBasicMaterial({color:0x003355}));
      inner.rotation.x=Math.PI/2; inner.position.set(s,-0.06,-1.92); ship.add(inner);
      const glowG = new THREE.CylinderGeometry(0.18,0.04,0.9,8); glowG.rotateX(Math.PI/2);
      const g = new THREE.Mesh(glowG, new THREE.MeshBasicMaterial({color:0x00f5ff,transparent:true,opacity:0.9}));
      g.position.set(s,-0.06,-2.45); ship.add(g); glows.push(g);
    });

    // Cockpit
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.36,10,7), new THREE.MeshStandardMaterial({color:0x66ccff,emissive:0x002255,transparent:true,opacity:0.65,roughness:0,metalness:0.2}));
    ck.scale.set(1.2,0.55,1.1); ck.position.set(0,0.28,0.9); ship.add(ck);

    // Phares
    [-0.65,0.65].forEach(s=>{
      const hl=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,6),new THREE.MeshBasicMaterial({color:0xffffff}));
      hl.position.set(s,0.04,1.95); ship.add(hl);
    });

    // Hover pads
    const hoverPadMat = new THREE.MeshBasicMaterial({color:0x00f5ff});
    const hoverPads = [];
    [[-0.85,-0.9],[0.85,-0.9],[-0.85,0.9],[0.85,0.9]].forEach(([x,z])=>{
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), hoverPadMat.clone());
      p.position.set(x,-0.24,z); ship.add(p); hoverPads.push(p);
    });
    scene.add(ship);

    // Particules
    const MAX_EX=90; const exPos=new Float32Array(MAX_EX*3);
    const exGeo=new THREE.BufferGeometry(); exGeo.setAttribute('position',new THREE.BufferAttribute(exPos,3));
    const exMat=new THREE.PointsMaterial({color:0x00f5ff,size:0.5,transparent:true,opacity:0.9}); scene.add(new THREE.Points(exGeo,exMat));
    const exParticles=[];

    const MAX_TR=50; const trPos=new Float32Array(MAX_TR*3);
    const trGeo=new THREE.BufferGeometry(); trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3));
    const trMat=new THREE.PointsMaterial({color:0x7B2FFF,size:1.2,transparent:true,opacity:0.6}); scene.add(new THREE.Points(trGeo,trMat));
    const trParticles=[];

    // Lumières
    scene.add(new THREE.AmbientLight(0x112244,2.5));
    const sun=new THREE.DirectionalLight(0x4466ff,3.0); sun.position.set(10,40,20); scene.add(sun);
    const rim=new THREE.DirectionalLight(0xff0066,1.5); rim.position.set(-10,-5,-20); scene.add(rim);
    const shipLight=new THREE.PointLight(0x00f5ff,8,30); scene.add(shipLight);
    const boostLight=new THREE.PointLight(0x7B2FFF,0,25); scene.add(boostLight);

    // ── PHYSIQUE ───────────────────────────────────────────────────────────
    let trackT=0.001, trackSpeed=easyMode?0.00038:0.00030;
    const BASE_SPEED=easyMode?0.00038:0.00030, MAX_SPEED=easyMode?0.0022:0.0020;
    let boost=0.8, hoverPhase=0, lapCount=0, prevT=0;
    let raceStart=Date.now(), finished=false, camShake=0;
    let shipLateralOffset=0, shipLateralVel=0;
    const STEER_ACCEL=14, LAT_FRICTION=5.5, MAX_LAT=TRACK_W/2-1.5, BOUNCE=0.4;
    let camPos=new THREE.Vector3(), camLookTarget=new THREE.Vector3(), firstFrame=true;

    const scores=loadScores();
    const bestTime=scores.length?scores[0].time:0;
    if(bestTime) document.getElementById('wo-best').textContent=fmt(bestTime);

    const keys={left:false,right:false,boost:false};
    const onKey=e=>{ const d=e.type==='keydown';
      if(e.key==='ArrowLeft'||e.key==='a'||e.key==='q') keys.left=d;
      if(e.key==='ArrowRight'||e.key==='d') keys.right=d;
      if(e.key===' '||e.key==='ArrowUp'){keys.boost=d; if(d)e.preventDefault();}
    };
    window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);

    const [blBtn,brBtn,bbBtn]=['#wo-bl','#wo-br','#wo-bb'].map(id=>container.querySelector(id));
    const pd=k=>()=>keys[k]=true, pu=k=>()=>keys[k]=false;
    blBtn.addEventListener('pointerdown',pd('left')); blBtn.addEventListener('pointerup',pu('left')); blBtn.addEventListener('pointerleave',pu('left'));
    brBtn.addEventListener('pointerdown',pd('right')); brBtn.addEventListener('pointerup',pu('right')); brBtn.addEventListener('pointerleave',pu('right'));
    bbBtn.addEventListener('pointerdown',pd('boost')); bbBtn.addEventListener('pointerup',pu('boost')); bbBtn.addEventListener('pointerleave',pu('boost'));

    const obs=new ResizeObserver(()=>{
      const W2=canvas.offsetWidth,H2=canvas.offsetHeight;
      if(!W2||!H2)return;
      renderer.setSize(W2,H2); camera.aspect=W2/H2; camera.updateProjectionMatrix();
    }); obs.observe(canvas);

    let lastTs=0;
    function loop(ts){
      if(!_running){obs.disconnect();window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKey);return;}
      _raf=requestAnimationFrame(loop);
      const dt=Math.min((ts-lastTs)/1000,0.05); lastTs=ts;

      if(!finished){
        // Steer physique
        if(keys.left)  shipLateralVel -= STEER_ACCEL*dt;
        if(keys.right) shipLateralVel += STEER_ACCEL*dt;
        shipLateralVel -= shipLateralVel*LAT_FRICTION*dt;
        shipLateralOffset += shipLateralVel*dt;
        if(shipLateralOffset>MAX_LAT){shipLateralOffset=MAX_LAT;shipLateralVel=-Math.abs(shipLateralVel)*BOUNCE;camShake=0.6;}
        if(shipLateralOffset<-MAX_LAT){shipLateralOffset=-MAX_LAT;shipLateralVel=Math.abs(shipLateralVel)*BOUNCE;camShake=0.6;}

        // Pads
        let onPad=false;
        PADS.forEach(p=>{ const d=Math.abs(trackT-p.userData.t); if(d<0.011||d>0.989){onPad=true;} });
        if(keys.boost) boost=Math.max(0,boost-0.004);
        if(onPad){boost=Math.min(1,boost+0.08);camShake=0.5;}
        boost=Math.min(1,boost+0.0022);

        const boostActive=keys.boost&&boost>0.05;
        const eff=boostActive?boost:(onPad?0.85:0);
        const tgtSpd=BASE_SPEED*(1+eff*2.9);
        trackSpeed+=(tgtSpd-trackSpeed)*0.055;
        trackSpeed=Math.min(trackSpeed,MAX_SPEED);
        trackT=(trackT+trackSpeed)%1;

        if(prevT>0.965&&trackT<0.035){
          lapCount++;
          document.getElementById('wo-lap').textContent=`${lapCount}/${TOTAL_LAPS}`;
          camShake=1.0;
          if(lapCount>=TOTAL_LAPS){finished=true;finishRace(Date.now()-raceStart);}
        }
        prevT=trackT;

        const elapsed=Date.now()-raceStart;
        document.getElementById('wo-time').textContent=fmt(elapsed);
        const sp=Math.round(trackSpeed/MAX_SPEED*100), bp=Math.round(boost*100);
        document.getElementById('wo-spd').style.width=sp+'%';
        document.getElementById('wo-bos').style.width=bp+'%';
        document.getElementById('wo-spdN').textContent=Math.round(trackSpeed*75000)+' km/h';
        document.getElementById('wo-bosN').textContent=bp;
      }

      // Position vaisseau
      const trackPt=new THREE.Vector3(); trackCurve.getPointAt(trackT,trackPt);
      const shipTan=new THREE.Vector3(); trackCurve.getTangentAt(trackT,shipTan);
      const right=new THREE.Vector3().crossVectors(shipTan,new THREE.Vector3(0,1,0)).normalize();
      hoverPhase+=dt*3.0;
      const hoverY=Math.sin(hoverPhase)*0.14+1.1;
      ship.position.copy(trackPt).addScaledVector(right,shipLateralOffset).add(new THREE.Vector3(0,hoverY,0));

      // Orientation vers l'avant
      const fwdPt=new THREE.Vector3(); trackCurve.getPointAt((trackT+0.020)%1,fwdPt);
      ship.lookAt(fwdPt);

      // Banking basé sur vélocité latérale
      const normLV=shipLateralVel/(STEER_ACCEL*2);
      const targetBank=-normLV*0.6;
      const currentBank=(ship.rotation._order?0:0); // recalc each frame
      ship.rotateZ(targetBank*0.85); // simplifié mais efficace

      const boostI=trackSpeed/MAX_SPEED;
      ship.rotateX(-boostI*0.12);

      // Hover pads scintillement
      hoverPads.forEach((p,i)=>{
        p.material.color.setHSL(0.54,1,0.3+Math.sin(hoverPhase*2+i)*0.3);
        p.scale.setScalar(0.65+Math.sin(hoverPhase+i*1.7)*0.45);
      });

      // Engine glow
      glows.forEach((g,i)=>{
        g.material.color.setHSL(0.54+boostI*0.12,1,0.3+boostI*0.45);
        g.scale.setScalar(0.45+boostI*1.8+Math.sin(ts*0.018+i)*0.2);
        g.material.opacity=0.45+boostI*0.55;
      });

      shipLight.position.copy(ship.position); shipLight.intensity=5+boostI*12;
      shipLight.color.setHSL(0.54+boostI*0.06,1,0.7);
      boostLight.position.copy(ship.position); boostLight.intensity=keys.boost?boost*18:0;

      // Particules échappement
      const exOrigin=ship.localToWorld(new THREE.Vector3(0,-0.05,-2.0));
      const exDir=ship.localToWorld(new THREE.Vector3(0,0,-5)).sub(exOrigin).normalize();
      if(!finished&&exParticles.length<MAX_EX-2){
        exParticles.push({x:exOrigin.x+(Math.random()-.5)*.3,y:exOrigin.y+(Math.random()-.5)*.3,z:exOrigin.z,
          vx:exDir.x*(50+boostI*130)+(Math.random()-.5)*8,vy:exDir.y*(50+boostI*130)+(Math.random()-.3)*6,vz:exDir.z*(50+boostI*130)+(Math.random()-.5)*8,
          life:0.35+boostI*0.35});
      }
      if(keys.boost&&boost>0.1&&!finished&&trParticles.length<MAX_TR-2){
        trParticles.push({x:exOrigin.x+(Math.random()-.5)*1.5,y:exOrigin.y,z:exOrigin.z,
          vx:exDir.x*28+(Math.random()-.5)*22,vy:exDir.y*28+(Math.random()-.5)*16,vz:exDir.z*28+(Math.random()-.5)*22,life:0.55});
      }
      for(let i=exParticles.length-1;i>=0;i--){
        const p=exParticles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; p.life-=dt;
        if(p.life<=0){exParticles.splice(i,1);continue;}
        const pi=Math.min(i,MAX_EX-1)*3; exPos[pi]=p.x;exPos[pi+1]=p.y;exPos[pi+2]=p.z;
      }
      for(let i=trParticles.length-1;i>=0;i--){
        const p=trParticles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; p.life-=dt;
        if(p.life<=0){trParticles.splice(i,1);continue;}
        const pi=Math.min(i,MAX_TR-1)*3; trPos[pi]=p.x;trPos[pi+1]=p.y;trPos[pi+2]=p.z;
      }
      exGeo.attributes.position.needsUpdate=true; trGeo.attributes.position.needsUpdate=true;
      exMat.opacity=0.4+boostI*0.6; exMat.color.setHSL(0.54+boostI*0.12,1,0.55+boostI*0.3);
      trMat.opacity=keys.boost?0.8:0.15; trMat.size=0.8+boostI*0.8;
      PADS.forEach((p,i)=>{ p.material.emissiveIntensity=0.4+Math.sin(ts*0.005+i)*0.6; });

      // Caméra
      const camBehindLocal=new THREE.Vector3(0,3.5+boostI*1.8,-9);
      const camDesired=ship.localToWorld(camBehindLocal.clone());
      const lookAheadPt=new THREE.Vector3(); trackCurve.getPointAt((trackT+0.025)%1,lookAheadPt);
      lookAheadPt.addScaledVector(right,shipLateralOffset*0.6);
      if(camShake>0){camShake=Math.max(0,camShake-dt*4);camDesired.x+=(Math.random()-.5)*camShake;camDesired.y+=(Math.random()-.5)*camShake*.5;}
      if(firstFrame){camPos.copy(camDesired);camLookTarget.copy(lookAheadPt);firstFrame=false;}
      else{camPos.lerp(camDesired,0.11);camLookTarget.lerp(lookAheadPt,0.13);}
      camera.position.copy(camPos); camera.lookAt(camLookTarget);
      camera.fov=68+boostI*16; camera.updateProjectionMatrix();
      scene.fog.density=0.008+boostI*0.014;
      renderer.render(scene,camera);
    }
    requestAnimationFrame(t=>{lastTs=t;loop(t);});

    function finishRace(totalTime){
      const name=_ctx?.loadProfile?.()?.name||'Racer';
      const all=loadScores(); all.push({name,time:totalTime,ts:Date.now()}); all.sort((a,b)=>a.time-b.time); saveScores(all);
      const isNew=!bestTime||totalTime<bestTime;
      fin.style.display='flex';
      fin.innerHTML=`
        <div style="font-size:48px">🏁</div>
        <div style="font-size:38px;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalTime)}</div>
        ${isNew?'<div style="font-size:13px;color:#fbbf24;font-family:monospace;letter-spacing:2px">✦ NOUVEAU RECORD ✦</div>':`<div style="font-size:12px;color:rgba(255,255,255,.4);font-family:monospace">Record: ${fmt(bestTime)}</div>`}
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:12px 24px;border-radius:10px;cursor:pointer;font-family:monospace">↺ REJOUER</button>
          <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:12px 20px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
        </div>`;
      fin.querySelector('#fin-retry').onclick=()=>{fin.style.display='none';stopRace();startRace(container,easyMode);};
      fin.querySelector('#fin-menu').onclick=()=>{fin.style.display='none';stopRace();renderRace(container);};
    }
  }

  window.YM_S['wipeout.sphere.js']={
    name:'WipeOut',icon:'🚀',category:'Games',
    description:'Anti-gravity racer v4 — physique réelle, vaisseau delta, boost trail, piste neon, caméra embarquée',
    emit:[],receive:[],
    activate(ctx){_ctx=ctx;}, deactivate(){stopRace();},
    renderPanel,
    profileSection(container){
      const scores=loadScores(); if(!scores.length)return;
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,245,255,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:24px">🚀</span><div style="flex:1;font-size:12px;font-weight:700;color:#00f5ff">WipeOut Best</div><div style="font-size:16px;font-weight:700;color:#00f5ff;font-family:monospace">${fmt(scores[0].time)}</div>`;
      container.appendChild(el);
    }
  };
})();
