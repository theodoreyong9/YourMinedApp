/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v5 — REAL PILOTING
// The ship does NOT auto-follow the track. You steer manually.
// Miss a turn → hit the wall → bounce/damage. Full physics sim.
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_wipeout_scores_v5';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScores(d) { localStorage.setItem(SCORES_KEY, JSON.stringify(d.slice(0,20))); }
  function fmt(ms) {
    if(!ms||ms<=0) return '--:--.---';
    const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, ms2=ms%1000;
    return `${m}:${String(s).padStart(2,'0')}.${String(ms2).padStart(3,'0')}`;
  }

  let _ctx=null, _running=false, _raf=null, _renderer=null;

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK DEFINITIONS — multiple tracks
  // ═══════════════════════════════════════════════════════════════════════════
  const TRACKS = {
    venom: {
      name:'Venom', laps:3, difficulty:'Easy',
      color:0x00f5ff,
      // Control points for the CatmullRom curve
      // Relatively wide corners, forgiving
      ctrl: (W,H)=>{
        const R=Math.min(W,H)*.38;
        const cx=0,cy=0;
        const pts=[];
        const N=10;
        for(let i=0;i<N;i++){
          const t=i/N*Math.PI*2;
          const r=R*(0.7+0.3*Math.sin(t*2.5));
          pts.push([cx+Math.cos(t)*r, cy+Math.sin(t)*r]);
        }
        return pts;
      },
      width:24, gravity:0, bankAngle:0.15,
    },
    rapier: {
      name:'Rapier', laps:3, difficulty:'Medium',
      color:0x7B2FFF,
      ctrl:(W,H)=>{
        const R=Math.min(W,H)*.35;
        const pts=[];
        const N=14;
        for(let i=0;i<N;i++){
          const t=i/N*Math.PI*2;
          // Figure-8 variant
          const r=R*(0.5+0.5*Math.abs(Math.cos(t)));
          const x=Math.cos(t)*r;
          const y=Math.sin(t*2)*(R*.6);
          pts.push([x,y]);
        }
        return pts;
      },
      width:20, gravity:0.08, bankAngle:0.22,
    },
    phantom: {
      name:'Phantom', laps:2, difficulty:'Hard',
      color:0xff2266,
      ctrl:(W,H)=>{
        const R=Math.min(W,H)*.4;
        const pts=[];
        const N=18;
        for(let i=0;i<N;i++){
          const t=i/N*Math.PI*2;
          const r=R*(0.4+0.6*Math.abs(Math.sin(t*3)));
          pts.push([Math.cos(t)*r*1.1, Math.sin(t)*r*.85]);
        }
        return pts;
      },
      width:17, gravity:0.12, bankAngle:0.30,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIP SPECS
  // ═══════════════════════════════════════════════════════════════════════════
  const SHIPS = {
    feisar: {
      name:'FEISAR', col:0x3b82f6, accel:22, maxSpd:260, turnRate:2.8,
      drag:0.94, grip:0.82, mass:1.0, boostMult:1.8, shield:100,
      desc:'Balanced · Forgiving · Recommended'
    },
    auricom: {
      name:'AURICOM', col:0xef4444, accel:28, maxSpd:300, turnRate:2.3,
      drag:0.92, grip:0.72, mass:1.2, boostMult:2.0, shield:80,
      desc:'Fast · Heavy · Hard to turn'
    },
    piranha: {
      name:'PIRANHA', col:0xa3e635, accel:18, maxSpd:340, turnRate:3.5,
      drag:0.96, grip:0.90, mass:0.7, boostMult:2.4, shield:60,
      desc:'Extreme speed · Fragile · Expert only'
    },
  };

  function renderPanel(container) {
    container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:monospace';
    container.innerHTML='';
    const track=document.createElement('div');
    track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs=document.createElement('div');
    tabs.style.cssText='display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#060608';
    [['race','🏁 Race'],['scores','🏆 Times'],['info','📊 Specs']].forEach(([id,label],idx)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${idx===0?'#00f5ff':'rgba(255,255,255,.35)'}`;
      t.textContent=label;
      t.addEventListener('click',()=>{
        tabs.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#00f5ff':'rgba(255,255,255,.35)');
        track.innerHTML='';
        if(id==='race') renderMenu(track);
        else if(id==='scores') renderLeaderboard(track);
        else renderSpecs(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track); container.appendChild(tabs);
    renderMenu(track);
  }

  function renderLeaderboard(container) {
    container.style.cssText='flex:1;overflow-y:auto;padding:14px;background:#000';
    const scores=loadScores().sort((a,b)=>(a.time||99999999)-(b.time||99999999));
    let html=`<div style="font-size:16px;font-weight:700;color:#00f5ff;margin-bottom:12px">🏆 Time Attack</div>`;
    if(!scores.length){html+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">No runs yet.</div>';}
    else scores.forEach((s,i)=>{
      const medal=['🥇','🥈','🥉'][i]||`#${i+1}`;
      html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${medal}</span>
        <div style="flex:1"><div style="color:#fff;font-size:12px">${s.name||'Racer'}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">${s.track||'Venom'} · ${s.ship||'FEISAR'} · ${s.laps} laps</div></div>
        <div style="color:#00f5ff;font-size:14px;font-weight:700">${fmt(s.time)}</div></div>`;
    });
    container.innerHTML=html;
  }

  function renderSpecs(container) {
    container.style.cssText='flex:1;overflow-y:auto;padding:14px;background:#000';
    let html=`<div style="font-size:16px;font-weight:700;color:#00f5ff;margin-bottom:12px">📊 Ship Specs</div>`;
    Object.entries(SHIPS).forEach(([id,s])=>{
      const barFn=(v,mx,col)=>{
        const pct=Math.round(v/mx*100);
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:9px;color:rgba(255,255,255,.35);width:50px">${col}</span>
          <div style="flex:1;height:3px;background:rgba(255,255,255,.1);border-radius:2px">
            <div style="width:${pct}%;height:100%;background:#00f5ff;border-radius:2px"></div></div>
          <span style="font-size:9px;color:rgba(255,255,255,.45);width:24px;text-align:right">${pct}</span></div>`;
      };
      html+=`<div style="padding:10px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-left:3px solid #${s.col.toString(16).padStart(6,'0')}">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px">${s.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:8px">${s.desc}</div>
        ${barFn(s.accel,28,'ACCEL')}
        ${barFn(s.maxSpd,340,'TOP SPD')}
        ${barFn(s.grip*100,100,'GRIP')}
        ${barFn(s.shield,100,'SHIELD')}</div>`;
    });
    html+=`<div style="font-size:16px;font-weight:700;color:#00f5ff;margin:14px 0 10px">🏁 Tracks</div>`;
    Object.entries(TRACKS).forEach(([id,t])=>{
      html+=`<div style="padding:9px 12px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.04);border-left:3px solid #${t.color.toString(16).padStart(6,'0')}">
        <div style="display:flex;justify-content:space-between">
          <span style="color:#fff;font-size:12px">${t.name}</span>
          <span style="font-size:10px;color:rgba(255,255,255,.4)">${t.difficulty} · ${t.laps} laps</span></div></div>`;
    });
    container.innerHTML=html;
  }

  function renderMenu(container) {
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#000';
    stopRace();

    let selectedTrack='venom', selectedShip='feisar';

    const menu=document.createElement('div');
    menu.style.cssText='position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:0;background:linear-gradient(180deg,#000,#020218);padding:16px 12px';

    function buildMenu(){
      menu.innerHTML=`
        <div style="font-size:38px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px;margin-bottom:2px">WIPEOUT</div>
        <div style="font-size:9px;color:rgba(255,255,255,.25);letter-spacing:5px;margin-bottom:14px">ANTI-GRAVITY RACING</div>

        <div style="font-size:10px;color:rgba(0,245,255,.6);letter-spacing:2px;margin-bottom:8px;align-self:flex-start">TRACK</div>
        <div style="display:flex;gap:6px;width:100%;margin-bottom:14px">
          ${Object.entries(TRACKS).map(([id,t])=>`
            <div data-track="${id}" style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${id===selectedTrack?`#${t.color.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.1)'};background:${id===selectedTrack?'rgba(0,245,255,.05)':'rgba(255,255,255,.02)'};cursor:pointer;text-align:center">
              <div style="font-size:11px;font-weight:700;color:${id===selectedTrack?'#fff':'rgba(255,255,255,.4)'}">${t.name}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.3)">${t.difficulty}</div>
            </div>`).join('')}
        </div>

        <div style="font-size:10px;color:rgba(0,245,255,.6);letter-spacing:2px;margin-bottom:8px;align-self:flex-start">SHIP</div>
        <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-bottom:16px">
          ${Object.entries(SHIPS).map(([id,s])=>`
            <div data-ship="${id}" style="padding:8px 12px;border-radius:8px;border:1.5px solid ${id===selectedShip?`#${s.col.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.08)'};background:${id===selectedShip?'rgba(255,255,255,.04)':'transparent'};cursor:pointer;display:flex;align-items:center;gap:10px">
              <div style="width:16px;height:16px;border-radius:50%;background:#${s.col.toString(16).padStart(6,'0')}"></div>
              <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${id===selectedShip?'#fff':'rgba(255,255,255,.4)'}">${s.name}</div>
              <div style="font-size:9px;color:rgba(255,255,255,.3)">${s.desc}</div></div>
            </div>`).join('')}
        </div>

        <div style="width:100%;padding:10px;background:rgba(0,245,255,.06);border:1px solid rgba(0,245,255,.2);border-radius:10px;margin-bottom:14px;font-size:9px;color:rgba(255,255,255,.4);line-height:1.8;text-align:center">
          ← → STEER · ↑ ACCELERATE · ↓ BRAKE · SPACE BOOST<br>
          Mobile: ← ↑ → on left · ⚡ BOOST on right</div>

        <button id="wo-start" style="width:100%;background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace">▶  RACE</button>`;

      // Events
      menu.querySelectorAll('[data-track]').forEach(el=>{
        el.addEventListener('click',()=>{selectedTrack=el.dataset.track;buildMenu();});
      });
      menu.querySelectorAll('[data-ship]').forEach(el=>{
        el.addEventListener('click',()=>{selectedShip=el.dataset.ship;buildMenu();});
      });
      menu.querySelector('#wo-start').addEventListener('click',()=>{
        menu.remove();startRace(container,selectedTrack,selectedShip);
      });
    }
    buildMenu();
    container.appendChild(menu);
  }

  function stopRace() {
    _running=false;
    if(_raf){cancelAnimationFrame(_raf);_raf=null;}
    if(_renderer){try{_renderer.dispose();}catch(e){}  _renderer=null;}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RACE
  // ═══════════════════════════════════════════════════════════════════════════
  function startRace(container, trackId, shipId) {
    if(!window.THREE){
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload=()=>startRace(container,trackId,shipId);
      document.head.appendChild(s); return;
    }
    stopRace();
    _running=true;

    const THREE=window.THREE;
    const trackDef=TRACKS[trackId];
    const shipDef=SHIPS[shipId];
    const TOTAL_LAPS=trackDef.laps;
    const TRACK_W=trackDef.width;

    // Canvas
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const W=canvas.offsetWidth||360, H=canvas.offsetHeight||480;
    canvas.width=W; canvas.height=H;

    // ── HUD ──────────────────────────────────────────────────────────────────
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:0;left:0;right:0;padding:8px 12px;pointer-events:none;z-index:10;font-family:monospace';
    hud.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:8px;color:rgba(0,245,255,.5);letter-spacing:2px">LAP</div>
          <div id="wo-lap" style="font-size:22px;font-weight:700;color:#00f5ff;line-height:1">0/${TOTAL_LAPS}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:8px;color:rgba(0,245,255,.5);letter-spacing:2px">TIME</div>
          <div id="wo-time" style="font-size:22px;font-weight:700;color:#00f5ff;line-height:1">0:00.000</div>
          <div id="wo-best" style="font-size:11px;color:rgba(0,245,255,.4)">Best: --:--.---</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:8px;color:rgba(0,245,255,.5);letter-spacing:2px">LAPTIME</div>
          <div id="wo-laptime" style="font-size:14px;color:rgba(0,245,255,.6);line-height:1.2">--:--.---</div>
          <div id="wo-track" style="font-size:9px;color:rgba(255,255,255,.3)">${trackDef.name}</div>
        </div>
      </div>`;
    container.appendChild(hud);

    // Speed/boost bar (bottom)
    const speedo=document.createElement('div');
    speedo.style.cssText='position:absolute;bottom:100px;left:12px;right:12px;pointer-events:none;z-index:10;font-family:monospace';
    speedo.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:8px;color:rgba(255,255,255,.35);width:28px">KM/H</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-spd-bar" style="height:100%;background:linear-gradient(90deg,#00f5ff,#0af);border-radius:3px;width:0%;transition:width .05s"></div></div>
        <span id="wo-spd-val" style="font-size:11px;color:#00f5ff;width:40px;text-align:right;font-weight:700">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:8px;color:rgba(255,255,255,.35);width:28px">BOOST</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-bst-bar" style="height:100%;background:linear-gradient(90deg,#7B2FFF,#c026d3);border-radius:3px;width:80%;transition:width .05s"></div></div>
        <span id="wo-bst-val" style="font-size:11px;color:#a78bfa;width:40px;text-align:right">80</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:8px;color:rgba(255,255,255,.35);width:28px">SHLD</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-shld-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:3px;width:100%;transition:width .15s"></div></div>
        <span id="wo-shld-val" style="font-size:11px;color:#34d399;width:40px;text-align:right">100</span>
      </div>`;
    container.appendChild(speedo);

    // Damage flash overlay
    const dmgFlash=document.createElement('div');
    dmgFlash.style.cssText='position:absolute;inset:0;background:rgba(255,0,0,0);pointer-events:none;z-index:20;transition:background .1s';
    container.appendChild(dmgFlash);

    // Speed lines overlay
    const speedLines=document.createElement('canvas');
    speedLines.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0';
    speedLines.width=W; speedLines.height=H;
    container.appendChild(speedLines);
    const slCtx=speedLines.getContext('2d');

    // ── CONTROLS (mobile) ──────────────────────────────────────────────────
    const ctrlDiv=document.createElement('div');
    ctrlDiv.style.cssText='position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-end;padding:0 10px;z-index:10;gap:6px';

    // Left cluster: ← ↑ →
    const leftCluster=document.createElement('div');
    leftCluster.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;width:140px';
    leftCluster.innerHTML=`
      <div></div>
      <button id="wo-up" style="height:36px;background:rgba(0,245,255,.1);border:1px solid rgba(0,245,255,.25);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">↑</button>
      <div></div>
      <button id="wo-left" style="height:36px;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">←</button>
      <button id="wo-down" style="height:36px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.2);color:#ff6464;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">↓</button>
      <button id="wo-right" style="height:36px;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">→</button>`;
    ctrlDiv.appendChild(leftCluster);

    // Right: BOOST
    const boostBtn=document.createElement('button');
    boostBtn.id='wo-boost';
    boostBtn.style.cssText='width:80px;height:80px;background:rgba(123,47,255,.18);border:2px solid rgba(123,47,255,.5);color:#c4b5fd;font-size:24px;border-radius:50%;cursor:pointer;font-family:monospace;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px';
    boostBtn.innerHTML='⚡<span style="font-size:9px;letter-spacing:1px">BOOST</span>';
    ctrlDiv.appendChild(boostBtn);
    container.appendChild(ctrlDiv);

    const finDiv=document.createElement('div');
    finDiv.style.cssText='position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.92);z-index:30';
    container.appendChild(finDiv);

    // ── THREE.JS SETUP ─────────────────────────────────────────────────────
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    _renderer=renderer;
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;

    const threeScene=new THREE.Scene();
    threeScene.fog=new THREE.FogExp2(0x000410,0.007);
    threeScene.background=new THREE.Color(0x000410);
    const camera=new THREE.PerspectiveCamera(75,W/H,.1,1200);

    // Stars
    const sv=new Float32Array(9000);
    for(let i=0;i<9000;i+=3){sv[i]=(Math.random()-.5)*1800;sv[i+1]=(Math.random()-.5)*1200;sv[i+2]=(Math.random()-.5)*1800;}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sv,3));
    threeScene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:0.7})));

    // ── TRACK GENERATION ──────────────────────────────────────────────────
    const rawCtrl=trackDef.ctrl(W,H);
    const N_CTRL=rawCtrl.length;
    const N_STEPS=500;

    // Build 3D control points (Y elevation varies)
    const ctrlPts3=rawCtrl.map(([x,z],i)=>{
      const t=i/N_CTRL;
      const elev=Math.sin(t*Math.PI*4)*12*trackDef.gravity;
      return new THREE.Vector3(x,elev,z);
    });
    const trackCurve=new THREE.CatmullRomCurve3(ctrlPts3,true,'catmullrom',0.5);
    const frenetFrames=trackCurve.computeFrenetFrames(N_STEPS,true);

    // Track ribbon mesh
    const tPos=[], tNorm=[], tUV=[], tIdx=[];
    for(let i=0;i<=N_STEPS;i++){
      const pt=new THREE.Vector3(); trackCurve.getPointAt(i/N_STEPS,pt);
      const tanVec=frenetFrames.tangents[i%N_STEPS];
      const right=new THREE.Vector3().crossVectors(tanVec,new THREE.Vector3(0,1,0)).normalize();
      // Banking based on curvature
      const bankAmt=trackDef.bankAngle;
      const upVec=new THREE.Vector3(0,1,0).lerp(frenetFrames.normals[i%N_STEPS],bankAmt).normalize();
      const rBanked=new THREE.Vector3().crossVectors(tanVec,upVec).normalize();

      const L=pt.clone().addScaledVector(rBanked,-TRACK_W/2);
      const R=pt.clone().addScaledVector(rBanked, TRACK_W/2);
      tPos.push(L.x,L.y,L.z,R.x,R.y,R.z);
      tNorm.push(upVec.x,upVec.y,upVec.z,upVec.x,upVec.y,upVec.z);
      tUV.push(i/N_STEPS*30,0,i/N_STEPS*30,1);
      if(i<N_STEPS){const b=i*2;tIdx.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    const last=N_STEPS*2;tIdx.push(last,last+1,0,last+1,1,0);

    const tGeo=new THREE.BufferGeometry();
    tGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tPos),3));
    tGeo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(tNorm),3));
    tGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(tUV),2));
    tGeo.setIndex(tIdx);

    // Track texture
    const TS=256;const TD=new Uint8Array(TS*TS*4);
    for(let y=0;y<TS;y++) for(let x=0;x<TS;x++){
      const i4=(y*TS+x)*4,lane=x/TS;
      const isEdge=lane<0.035||lane>0.965,isCtr=Math.abs(lane-.5)<.01;
      const stripe=Math.sin(y/TS*Math.PI*2*20)*.5+.5;
      const tc=parseInt(trackDef.color.toString(16).padStart(6,'0'),16);
      const tr=(tc>>16)&255,tg=(tc>>8)&255,tb=tc&255;
      if(isEdge){TD[i4]=tr*.6;TD[i4+1]=tg*.6;TD[i4+2]=tb*.6;TD[i4+3]=255;}
      else if(isCtr){TD[i4]=30;TD[i4+1]=30;TD[i4+2]=60;TD[i4+3]=255;}
      else{TD[i4]=12+stripe*4;TD[i4+1]=14+stripe*4;TD[i4+2]=22+stripe*8;TD[i4+3]=255;}
    }
    const trackTex=new THREE.DataTexture(TD,TS,TS,THREE.RGBAFormat);
    trackTex.wrapS=trackTex.wrapT=THREE.RepeatWrapping;trackTex.needsUpdate=true;
    threeScene.add(new THREE.Mesh(tGeo,new THREE.MeshStandardMaterial({map:trackTex,roughness:.25,metalness:.75,side:THREE.DoubleSide})));

    // Neon track borders
    [[-1,trackDef.color],[1,0xff2266]].forEach(([side,col])=>{
      const pts1=[],pts2=[];
      for(let i=0;i<=N_STEPS;i++){
        const pt=new THREE.Vector3();trackCurve.getPointAt(i/N_STEPS,pt);
        const t=frenetFrames.tangents[i%N_STEPS];
        const right=new THREE.Vector3().crossVectors(t,new THREE.Vector3(0,1,0)).normalize();
        const ep=pt.clone().addScaledVector(right,side*(TRACK_W/2-.2));ep.y+=.25;
        pts1.push(ep.clone());ep.y+=.4;pts2.push(ep.clone());
      }
      threeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1),new THREE.LineBasicMaterial({color:col})));
      threeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.2})));
    });

    // ── BOOST PADS ────────────────────────────────────────────────────────
    const N_PADS=10;
    const padMeshes=[];
    for(let i=0;i<N_PADS;i++){
      const t=i/N_PADS;
      const pt=new THREE.Vector3();trackCurve.getPointAt(t,pt);
      const tanVec=frenetFrames.tangents[Math.floor(t*N_STEPS)%N_STEPS];
      const pad=new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_W-6,.12,3),
        new THREE.MeshStandardMaterial({color:0x4400cc,emissive:0x2200aa,roughness:.05,metalness:.98,transparent:true,opacity:.88})
      );
      pad.position.copy(pt).add(new THREE.Vector3(0,.18,0));
      pad.lookAt(pt.clone().add(tanVec));
      pad.userData.t=t;
      threeScene.add(pad);padMeshes.push(pad);
    }

    // Checkpoint gates (visual only, used for lap detection)
    const GATE_COUNT=4;
    const gates=[];
    for(let i=0;i<GATE_COUNT;i++){
      const t=(i+.5)/GATE_COUNT;
      const pt=new THREE.Vector3();trackCurve.getPointAt(t,pt);
      const tanVec=frenetFrames.tangents[Math.floor(t*N_STEPS)%N_STEPS];
      const right=new THREE.Vector3().crossVectors(tanVec,new THREE.Vector3(0,1,0)).normalize();
      const g=new THREE.Group();
      [-1,1].forEach(side=>{
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,8,5),new THREE.MeshStandardMaterial({color:0x0a0018,metalness:.9}));
        post.position.addScaledVector(right,side*(TRACK_W/2+1.5));post.position.y=4;g.add(post);
        const ball=new THREE.Mesh(new THREE.SphereGeometry(.28,6,6),new THREE.MeshBasicMaterial({color:trackDef.color}));
        ball.position.copy(post.position);ball.position.y=8.3;g.add(ball);
        const pl=new THREE.PointLight(trackDef.color,4,18);pl.position.copy(ball.position);g.add(pl);
      });
      g.position.copy(pt);g.lookAt(pt.clone().add(tanVec));
      threeScene.add(g);
      gates.push({t,pos:pt});
    }

    // ── SHIP ASSEMBLY ─────────────────────────────────────────────────────
    const shipGroup=new THREE.Group();
    const col=shipDef.col;
    const bMat=new THREE.MeshStandardMaterial({color:0x001133,emissive:0x000418,metalness:.98,roughness:.02});
    const aMat=new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col).multiplyScalar(.2),metalness:.95,roughness:.05});
    const gMat=new THREE.MeshBasicMaterial({color:0x00f5ff});

    // Body
    const bodyG=new THREE.CylinderGeometry(.28,.12,4,.8,1);bodyG.rotateX(Math.PI/2);
    shipGroup.add(new THREE.Mesh(bodyG,bMat));
    const plG=new THREE.BoxGeometry(3,.18,3.2);
    shipGroup.add(new THREE.Mesh(plG,bMat));

    // Wings
    [-1,1].forEach(s=>{
      const wv=new Float32Array([0,0,1.6,s*3.1,0,-.2,0,0,-1.2,  s*3.1,0,-.2,s*2.3,0,-1.6,0,0,-1.2]);
      const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.BufferAttribute(wv,3));wg.computeVertexNormals();
      const w=new THREE.Mesh(wg,aMat);w.position.y=-.05;shipGroup.add(w);
      const wl=new THREE.Mesh(new THREE.BoxGeometry(.1,.7,.8),bMat);wl.position.set(s*2.9,.28,-1.2);shipGroup.add(wl);
    });

    // Engines
    const shipGlows=[];
    [-0.8,0.8].forEach(s=>{
      const eo=new THREE.Mesh(new THREE.CylinderGeometry(.33,.38,1.3,10),bMat);eo.rotation.x=Math.PI/2;eo.position.set(s,-.06,-1.9);shipGroup.add(eo);
      const eg=new THREE.CylinderGeometry(.17,.04,.9,8);eg.rotateX(Math.PI/2);
      const gm=new THREE.Mesh(eg,new THREE.MeshBasicMaterial({color:0x00f5ff,transparent:true,opacity:.9}));
      gm.position.set(s,-.06,-2.42);shipGroup.add(gm);shipGlows.push(gm);
    });

    // Cockpit
    const ck=new THREE.Mesh(new THREE.SphereGeometry(.34,10,7),new THREE.MeshStandardMaterial({color:0x66ccff,emissive:0x002255,transparent:true,opacity:.6,roughness:0,metalness:.2}));
    ck.scale.set(1.2,.55,1.1);ck.position.set(0,.27,.9);shipGroup.add(ck);

    // Hover pad lights
    const hoverPadMeshes=[];
    [[-0.85,-0.9],[0.85,-0.9],[-0.85,0.9],[0.85,0.9]].forEach(([x,z])=>{
      const p=new THREE.Mesh(new THREE.SphereGeometry(.09,5,5),new THREE.MeshBasicMaterial({color:0x00f5ff}));
      p.position.set(x,-.24,z);shipGroup.add(p);hoverPadMeshes.push(p);
    });

    threeScene.add(shipGroup);

    // Damage sparks
    const sparkGeo=new THREE.BufferGeometry();
    const sparkPos=new Float32Array(150*3);
    sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPos,3));
    const sparkMesh=new THREE.Points(sparkGeo,new THREE.PointsMaterial({color:0xff4400,size:.6,transparent:true,opacity:.9}));
    threeScene.add(sparkMesh);
    const sparks=[];

    // Exhaust
    const MAX_EX=120;
    const exPos=new Float32Array(MAX_EX*3);
    const exGeo=new THREE.BufferGeometry();exGeo.setAttribute('position',new THREE.BufferAttribute(exPos,3));
    const exMat=new THREE.PointsMaterial({color:0x00f5ff,size:.55,transparent:true,opacity:.9});
    threeScene.add(new THREE.Points(exGeo,exMat));
    const exParts=[];

    // Boost trail
    const MAX_TR=70;
    const trPos=new Float32Array(MAX_TR*3);
    const trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3));
    const trMat=new THREE.PointsMaterial({color:0x7B2FFF,size:1.4,transparent:true,opacity:.65});
    threeScene.add(new THREE.Points(trGeo,trMat));
    const trParts=[];

    // Lights
    threeScene.add(new THREE.AmbientLight(0x112244,2.5));
    const sun=new THREE.DirectionalLight(0x4466ff,2.8);sun.position.set(10,40,20);threeScene.add(sun);
    const rim=new THREE.DirectionalLight(0xff0044,1.4);rim.position.set(-10,-5,-20);threeScene.add(rim);
    const shipLight=new THREE.PointLight(new THREE.Color(col),8,30);threeScene.add(shipLight);
    const boostLight=new THREE.PointLight(0x7B2FFF,0,25);threeScene.add(boostLight);
    const underLight=new THREE.PointLight(0x00f5ff,3,8);threeScene.add(underLight);

    // ═══════════════════════════════════════════════════════════════════════
    // REAL PHYSICS STATE
    // ═══════════════════════════════════════════════════════════════════════
    // Ship has a position in 3D world space, velocity, heading angle.
    // It is NOT constrained to the track — it flies freely above it.
    // Track detection: project ship onto track curve → find closest point.
    // If ship leaves track width → wall collision → damage + bounce.

    // Init ship at track start
    const startPt=new THREE.Vector3(); trackCurve.getPointAt(0,startPt);
    const startTan=frenetFrames.tangents[0];

    // Physics
    let shipPos=startPt.clone().add(new THREE.Vector3(0,1.2,0));
    let shipVel=new THREE.Vector3();
    let shipHeading=Math.atan2(startTan.x,startTan.z); // world heading angle (Y-axis)
    let shipSpeed=0; // signed speed forward
    let shipPitch=0; // visual tilt
    let shipRoll=0;  // visual bank

    // Game state
    let boostCharge=0.8;
    let shield=shipDef.shield;
    let lapCount=0, lapStartTime=0, raceStart=Date.now(), finished=false;
    let prevCheckpoint=-1;
    let checkpointsPassed=new Set();
    let hoverPhase=0;
    let camPos=new THREE.Vector3();
    let camLook=new THREE.Vector3();
    let firstFrame=true;
    let camShake=0;
    let wallHitCooldown=0;

    // Best time from saved scores
    const savedScores=loadScores().filter(s=>s.track===trackDef.name).sort((a,b)=>a.time-b.time);
    if(savedScores.length) document.getElementById('wo-best').textContent='Best: '+fmt(savedScores[0].time);

    // Lap times
    const lapTimes=[];

    // ═══════════════════════════════════════════════════════════════════════
    // INPUT
    // ═══════════════════════════════════════════════════════════════════════
    const keys={left:false,right:false,up:false,down:false,boost:false};
    const onKey=e=>{
      const d=e.type==='keydown';
      if(e.key==='ArrowLeft'||e.key==='a'||e.key==='q') keys.left=d;
      if(e.key==='ArrowRight'||e.key==='d') keys.right=d;
      if(e.key==='ArrowUp'||e.key==='w'||e.key==='z') keys.up=d;
      if(e.key==='ArrowDown'||e.key==='s') keys.down=d;
      if(e.key===' '){keys.boost=d;if(d)e.preventDefault();}
    };
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKey);

    // Mobile controls
    const mobileMap=[
      ['#wo-up','up'],['#wo-down','down'],['#wo-left','left'],['#wo-right','right'],['#wo-boost','boost']
    ];
    mobileMap.forEach(([sel,k])=>{
      const el=container.querySelector(sel);
      if(!el) return;
      el.addEventListener('pointerdown',e=>{keys[k]=true;e.preventDefault();});
      el.addEventListener('pointerup',()=>keys[k]=false);
      el.addEventListener('pointerleave',()=>keys[k]=false);
    });

    const resObs=new ResizeObserver(()=>{
      const W2=canvas.offsetWidth,H2=canvas.offsetHeight;
      if(!W2||!H2) return;
      renderer.setSize(W2,H2);camera.aspect=W2/H2;camera.updateProjectionMatrix();
      speedLines.width=W2;speedLines.height=H2;
    });
    resObs.observe(canvas);

    // ── HELPER: closest track position ────────────────────────────────────
    function closestTrackT(pos) {
      // Coarse grid search
      let best=0,bestD=Infinity;
      const N=100;
      const tmp=new THREE.Vector3();
      for(let i=0;i<N;i++){
        const t=i/N;
        trackCurve.getPointAt(t,tmp);
        const d=tmp.distanceToSquared(pos);
        if(d<bestD){bestD=d;best=t;}
      }
      // Refine
      let lo=best-1/N,hi=best+1/N;
      for(let iter=0;iter<8;iter++){
        const mid=(lo+hi)/2;
        trackCurve.getPointAt(((mid%1)+1)%1,tmp);
        const dL=tmp.distanceTo(pos);
        const midR=mid+.001;
        trackCurve.getPointAt(((midR%1)+1)%1,tmp);
        const dR=tmp.distanceTo(pos);
        if(dL<dR) hi=midR; else lo=mid;
      }
      return ((((lo+hi)/2)%1)+1)%1;
    }

    // ── MAIN LOOP ─────────────────────────────────────────────────────────
    let lastTs=0;

    function loop(ts){
      if(!_running){resObs.disconnect();window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKey);return;}
      _raf=requestAnimationFrame(loop);
      const dt=Math.min((ts-lastTs)/1000,.05);lastTs=ts;

      if(!finished){
        // ── PHYSICS ──────────────────────────────────────────────────────
        const boostActive=keys.boost&&boostCharge>0.03;

        // Boost charge regen
        if(boostActive) boostCharge=Math.max(0,boostCharge-.005);
        else boostCharge=Math.min(1,boostCharge+.003);

        // Effective max speed
        const baseMax=shipDef.maxSpd/10; // in units/sec
        const effMax=boostActive?baseMax*shipDef.boostMult:baseMax;
        const effAccel=shipDef.accel*(boostActive?1.6:1);

        // Steering — rotates heading angle
        const turnSpeed=shipDef.turnRate*(1+Math.abs(shipSpeed)*0.01)*(boostActive?.75:1);
        if(keys.left) shipHeading+=turnSpeed*dt;
        if(keys.right) shipHeading-=turnSpeed*dt;

        // Acceleration along heading
        if(keys.up){
          shipSpeed=Math.min(shipSpeed+effAccel*dt,effMax);
        } else if(keys.down){
          shipSpeed=Math.max(shipSpeed-effAccel*1.4*dt,-(effMax*.35));
        } else {
          // Natural deceleration
          shipSpeed*=Math.pow(shipDef.drag,dt*60);
          if(Math.abs(shipSpeed)<.02) shipSpeed=0;
        }

        // Convert heading + speed → velocity
        const fwdDir=new THREE.Vector3(Math.sin(shipHeading),0,Math.cos(shipHeading));
        const targetVel=fwdDir.clone().multiplyScalar(shipSpeed);

        // Grip: blend towards target vel (high grip = responsive)
        const gripF=Math.pow(shipDef.grip,dt*60);
        shipVel.lerp(targetVel,1-gripF*dt*8);
        shipVel.lerp(targetVel,shipDef.grip*(1-gripF)); // simplified but feels right

        // Gravity / track hover
        const closestT=closestTrackT(shipPos);
        const trackPt=new THREE.Vector3();trackCurve.getPointAt(closestT,trackPt);
        const trackNorm=frenetFrames.normals[Math.floor(closestT*N_STEPS)%N_STEPS].clone().normalize();
        const desiredY=trackPt.y+1.1+Math.sin(hoverPhase)*.1;
        shipPos.y+=(desiredY-shipPos.y)*Math.min(1,dt*8);

        // Horizontal movement
        shipPos.x+=shipVel.x*dt;
        shipPos.z+=shipVel.z*dt;

        // ── WALL COLLISION ────────────────────────────────────────────────
        if(wallHitCooldown>0) wallHitCooldown-=dt;

        const trackRight=new THREE.Vector3().crossVectors(frenetFrames.tangents[Math.floor(closestT*N_STEPS)%N_STEPS],new THREE.Vector3(0,1,0)).normalize();
        const lateralOffset=new THREE.Vector3().subVectors(shipPos,trackPt).dot(trackRight);
        const hardWall=TRACK_W/2;

        if(Math.abs(lateralOffset)>hardWall-.3){
          if(wallHitCooldown<=0){
            // Bounce
            const impactSpeed=Math.abs(shipVel.dot(trackRight));
            shield=Math.max(0,shield-impactSpeed*3);
            const reflectedVel=shipVel.clone().reflect(trackRight.clone().multiplyScalar(Math.sign(lateralOffset)));
            shipVel.copy(reflectedVel.multiplyScalar(.35));
            shipSpeed*=.4;
            camShake=Math.min(2.5,impactSpeed*.8);
            wallHitCooldown=.3;
            // Damage flash
            dmgFlash.style.background='rgba(255,0,0,0.4)';
            setTimeout(()=>dmgFlash.style.background='rgba(255,0,0,0)',200);
            // Sparks
            for(let k=0;k<12;k++){
              sparks.push({x:shipPos.x,y:shipPos.y,z:shipPos.z,
                vx:(Math.random()-.5)*40,vy:Math.random()*30+10,vz:(Math.random()-.5)*40,life:.6});
            }
            if(shield<=0&&!finished){triggerCrash();return;}
          }
          // Push back onto track
          const maxOff=(hardWall-.5)*Math.sign(lateralOffset);
          shipPos.x=trackPt.x+trackRight.x*maxOff;
          shipPos.z=trackPt.z+trackRight.z*maxOff;
        }

        // ── BOOST PADS ────────────────────────────────────────────────────
        padMeshes.forEach(pad=>{
          const d=Math.hypot(shipPos.x-pad.position.x,shipPos.z-pad.position.z);
          if(d<TRACK_W/2-1){boostCharge=Math.min(1,boostCharge+.06);camShake=.4;}
        });

        // ── LAP / CHECKPOINT TRACKING ─────────────────────────────────────
        gates.forEach((gate,gi)=>{
          const d=Math.hypot(shipPos.x-gate.pos.x,shipPos.z-gate.pos.z);
          if(d<TRACK_W&&!checkpointsPassed.has(gi)){
            checkpointsPassed.add(gi);
          }
        });

        // Lap completion: pass t≈0 with all checkpoints cleared
        const prevT_store=closestTrackT._prevT||0;
        closestTrackT._prevT=closestT;
        if(prevT_store>0.85&&closestT<0.15&&checkpointsPassed.size>=GATE_COUNT){
          checkpointsPassed.clear();
          const lapTime=Date.now()-lapStartTime;
          lapTimes.push(lapTime);
          lapStartTime=Date.now();
          lapCount++;
          document.getElementById('wo-lap').textContent=`${lapCount}/${TOTAL_LAPS}`;
          document.getElementById('wo-laptime').textContent=fmt(lapTime);
          camShake=1.2;
          if(lapCount>=TOTAL_LAPS){finished=true;finishRace(Date.now()-raceStart);return;}
        }

        // ── UPDATE HUD ────────────────────────────────────────────────────
        const elapsed=Date.now()-raceStart;
        document.getElementById('wo-time').textContent=fmt(elapsed);
        const spd3d=shipVel.length()*36; // rough km/h
        const spdPct=Math.round(Math.min(100,spd3d/((shipDef.maxSpd*shipDef.boostMult)*36/10)*100));
        document.getElementById('wo-spd-bar').style.width=spdPct+'%';
        document.getElementById('wo-spd-val').textContent=Math.round(spd3d);
        const bstPct=Math.round(boostCharge*100);
        document.getElementById('wo-bst-bar').style.width=bstPct+'%';
        document.getElementById('wo-bst-val').textContent=bstPct;
        const shldPct=Math.round(shield/shipDef.shield*100);
        document.getElementById('wo-shld-bar').style.width=Math.max(0,shldPct)+'%';
        document.getElementById('wo-shld-val').textContent=Math.max(0,Math.round(shield));

        // Shield color change
        const shldEl=document.getElementById('wo-shld-bar');
        if(shldPct<25) shldEl.style.background='linear-gradient(90deg,#ef4444,#f87171)';
        else if(shldPct<50) shldEl.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
        else shldEl.style.background='linear-gradient(90deg,#10b981,#34d399)';

        // ── SHIP VISUAL UPDATE ────────────────────────────────────────────
        hoverPhase+=dt*3.2;
        shipGroup.position.copy(shipPos);

        // Orient ship along heading
        const lookTarget=new THREE.Vector3(
          shipPos.x+Math.sin(shipHeading),shipPos.y,shipPos.z+Math.cos(shipHeading));
        shipGroup.lookAt(lookTarget);
        shipGroup.rotateX(-Math.PI/2); // correct for geometry orientation

        // Visual roll/pitch
        const turnInput=(keys.right?1:0)-(keys.left?1:0);
        shipRoll+=((-turnInput*.55)-shipRoll)*dt*6;
        shipPitch+=((keys.up?.06:keys.down?-.04:0)-shipPitch)*dt*5;
        shipGroup.rotateZ(shipRoll);
        shipGroup.rotateX(shipPitch);

        const boostIntensity=boostActive?Math.min(1,shipSpeed/baseMax):0;
        const speedFactor=Math.min(1,Math.abs(shipSpeed)/baseMax);

        // Engine glow
        shipGlows.forEach((g,i)=>{
          g.material.color.setHSL(.54+boostIntensity*.1,1,.25+boostIntensity*.5);
          g.scale.setScalar(.4+speedFactor*1.9+Math.sin(ts*.018+i)*.15);
          g.material.opacity=.4+speedFactor*.6;
        });
        hoverPadMeshes.forEach((p,i)=>{
          p.material.color.setHSL(.54,1,.25+Math.sin(hoverPhase*2+i)*.25);
          p.scale.setScalar(.6+Math.sin(hoverPhase+i*1.7)*.35);
        });

        // Lights
        shipLight.position.copy(shipPos);shipLight.intensity=5+speedFactor*12;
        shipLight.color.set(col);
        boostLight.position.copy(shipPos);boostLight.intensity=boostActive?boostCharge*20:0;
        underLight.position.copy(shipPos).add(new THREE.Vector3(0,-1,0));

        // ── EXHAUST PARTICLES ─────────────────────────────────────────────
        const exOrig=shipGroup.localToWorld(new THREE.Vector3(0,.06,-2.1));
        const exDir=shipGroup.localToWorld(new THREE.Vector3(0,0,-5)).sub(shipGroup.localToWorld(new THREE.Vector3())).normalize();
        if(exParts.length<MAX_EX-2){
          exParts.push({x:exOrig.x+(Math.random()-.5)*.25,y:exOrig.y+(Math.random()-.5)*.25,z:exOrig.z,
            vx:exDir.x*(45+boostIntensity*120)+(Math.random()-.5)*7,
            vy:exDir.y*(45+boostIntensity*120)+(Math.random()-.3)*5,
            vz:exDir.z*(45+boostIntensity*120)+(Math.random()-.5)*7,
            life:.3+speedFactor*.3});
        }
        if(boostActive&&trParts.length<MAX_TR-2){
          trParts.push({x:exOrig.x+(Math.random()-.5)*1.2,y:exOrig.y,z:exOrig.z,
            vx:exDir.x*25+(Math.random()-.5)*18,vy:exDir.y*25+(Math.random()-.5)*12,vz:exDir.z*25+(Math.random()-.5)*18,life:.5});
        }
        for(let i=exParts.length-1;i>=0;i--){
          const p=exParts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.life-=dt;
          if(p.life<=0){exParts.splice(i,1);continue;}
          const pi=Math.min(i,MAX_EX-1)*3;exPos[pi]=p.x;exPos[pi+1]=p.y;exPos[pi+2]=p.z;
        }
        for(let i=trParts.length-1;i>=0;i--){
          const p=trParts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.life-=dt;
          if(p.life<=0){trParts.splice(i,1);continue;}
          const pi=Math.min(i,MAX_TR-1)*3;trPos[pi]=p.x;trPos[pi+1]=p.y;trPos[pi+2]=p.z;
        }
        exGeo.attributes.position.needsUpdate=true;trGeo.attributes.position.needsUpdate=true;
        exMat.color.setHSL(.54+boostIntensity*.1,1,.5+boostIntensity*.3);
        exMat.opacity=.4+speedFactor*.6;
        trMat.opacity=boostActive?.8:.1;trMat.size=.8+speedFactor*.6;

        // ── DAMAGE SPARKS ─────────────────────────────────────────────────
        for(let i=sparks.length-1;i>=0;i--){
          const p=sparks[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=30*dt;p.life-=dt;
          if(p.life<=0){sparks.splice(i,1);continue;}
          const pi=Math.min(i,49)*3;sparkPos[pi]=p.x;sparkPos[pi+1]=p.y;sparkPos[pi+2]=p.z;
        }
        sparkGeo.attributes.position.needsUpdate=true;
        sparkMesh.material.opacity=sparks.length>0?.9:0;

        // Boost pad animation
        padMeshes.forEach((p,i)=>{p.material.emissiveIntensity=.4+Math.sin(ts*.005+i)*.55;});

        // ── CAMERA ────────────────────────────────────────────────────────
        const camOffset=new THREE.Vector3(0,3.5+speedFactor*2,-9-speedFactor*2);
        const camWorld=shipGroup.localToWorld(camOffset.clone());
        const lookFwd=shipGroup.localToWorld(new THREE.Vector3(0,0,8));

        if(camShake>0){
          camShake=Math.max(0,camShake-dt*5);
          camWorld.x+=(Math.random()-.5)*camShake;
          camWorld.y+=(Math.random()-.5)*camShake*.5;
        }

        if(firstFrame){camPos.copy(camWorld);camLook.copy(lookFwd);firstFrame=false;}
        else{camPos.lerp(camWorld,.12);camLook.lerp(lookFwd,.15);}

        camera.position.copy(camPos);camera.lookAt(camLook);
        camera.fov=68+speedFactor*18+boostIntensity*8;camera.updateProjectionMatrix();
        threeScene.fog.density=.006+speedFactor*.012;

        // ── SPEED LINES ───────────────────────────────────────────────────
        const slIntensity=Math.max(0,(speedFactor-.4)*1.67);
        speedLines.style.opacity=slIntensity.toFixed(2);
        if(slIntensity>0&&Math.random()<.3){
          slCtx.clearRect(0,0,speedLines.width,speedLines.height);
          slCtx.strokeStyle=`rgba(0,245,255,${slIntensity*.3})`;
          slCtx.lineWidth=1;
          for(let k=0;k<20;k++){
            const x=speedLines.width/2+(Math.random()-.5)*speedLines.width;
            const y=speedLines.height/2+(Math.random()-.5)*speedLines.height;
            const len=30+Math.random()*80*slIntensity;
            slCtx.beginPath();slCtx.moveTo(x,y);slCtx.lineTo(x,y+len);slCtx.stroke();
          }
        }
      } // end !finished

      renderer.render(threeScene,camera);
    }
    requestAnimationFrame(t=>{lastTs=t;loop(t);});

    function triggerCrash(){
      finished=true;
      camShake=3;
      setTimeout(()=>{
        finDiv.style.display='flex';
        finDiv.innerHTML=`
          <div style="font-size:44px">💥</div>
          <div style="font-size:28px;font-weight:900;font-family:monospace;color:#ef4444;letter-spacing:-1px">ELIMINATED</div>
          <div style="font-size:13px;color:rgba(255,255,255,.4);font-family:monospace">Shield destroyed — hull breach</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:12px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ RETRY</button>
            <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:12px 18px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
          </div>`;
        finDiv.querySelector('#fin-retry').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
        finDiv.querySelector('#fin-menu').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
      },800);
    }

    function finishRace(totalTime){
      const name=_ctx?.loadProfile?.()?.name||'Racer';
      const all=loadScores();
      all.push({name,time:totalTime,track:trackDef.name,ship:shipDef.name,laps:TOTAL_LAPS,ts:Date.now()});
      all.sort((a,b)=>(a.time||999999)-(b.time||999999));
      saveScores(all);
      const bestT=savedScores.length?savedScores[0].time:Infinity;
      const isRecord=totalTime<bestT;
      const bestLap=lapTimes.length?Math.min(...lapTimes):totalTime;

      finDiv.style.display='flex';
      finDiv.innerHTML=`
        <div style="font-size:44px">🏁</div>
        <div style="font-size:36px;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalTime)}</div>
        ${isRecord?'<div style="font-size:12px;color:#fbbf24;font-family:monospace;letter-spacing:3px">✦ NEW RECORD ✦</div>':''}
        <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:monospace">Best lap: ${fmt(bestLap)}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:12px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ RACE AGAIN</button>
          <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:12px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
        </div>`;
      finDiv.querySelector('#fin-retry').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
      finDiv.querySelector('#fin-menu').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
    }
  }

  window.YM_S['wipeout.sphere.js']={
    name:'WipeOut',icon:'🚀',category:'Games',
    description:'WipeOut v5 — real manual piloting, wall collisions with damage, 3 tracks, 3 ships, extreme speed',
    emit:[],receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){stopRace();},
    renderPanel,
    profileSection(container){
      const scores=loadScores();if(!scores.length)return;
      const best=scores[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,245,255,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">🚀</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#00f5ff">WipeOut · ${best.track||''}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35)">${best.ship||'FEISAR'}</div></div>
        <div style="font-size:15px;font-weight:700;color:#00f5ff;font-family:monospace">${fmt(best.time)}</div>`;
      container.appendChild(el);
    }
  };
})();
