/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v6 — FULL REWRITE
// Massively improved: tube track with guard rails, detailed ship geometry,
// cinematic camera, bloom-like glow layers, particle engine, real physics.
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_wipeout_scores_v6';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScores(d) { localStorage.setItem(SCORES_KEY, JSON.stringify(d.slice(0,20))); }
  function fmt(ms) {
    if(!ms||ms<=0) return '--:--.---';
    const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, ms2=ms%1000;
    return `${m}:${String(s).padStart(2,'0')}.${String(ms2).padStart(3,'0')}`;
  }

  let _ctx=null, _running=false, _raf=null, _renderer=null;

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const TRACKS = {
    venom: {
      name:'Venom Circuit', laps:3, difficulty:'Easy',
      primaryCol:0x00f5ff, secondaryCol:0x0055ff,
      ctrl:(W,H)=>{
        const R=Math.min(W,H)*.40;
        const pts=[];
        for(let i=0;i<12;i++){
          const t=i/12*Math.PI*2;
          const wobble=0.22*Math.sin(t*2.3+1.1);
          const r=R*(0.82+wobble);
          pts.push(new THREE.Vector3(
            Math.cos(t)*r,
            Math.sin(t*2)*14,
            Math.sin(t)*r
          ));
        }
        return pts;
      },
      width:28, guardHeight:3.5, bankAngle:0.18,
      fogColor:0x000820, fogDensity:0.006,
      groundCol:0x000c24,
    },
    rapier: {
      name:'Rapier Cross', laps:3, difficulty:'Medium',
      primaryCol:0xaa22ff, secondaryCol:0xff2288,
      ctrl:(W,H)=>{
        const R=Math.min(W,H)*.36;
        const pts=[];
        for(let i=0;i<16;i++){
          const t=i/16*Math.PI*2;
          const figure8X=Math.cos(t)*R;
          const figure8Z=Math.sin(t*2)*(R*0.65);
          const elev=Math.sin(t*3)*18;
          pts.push(new THREE.Vector3(figure8X, elev, figure8Z));
        }
        return pts;
      },
      width:22, guardHeight:4, bankAngle:0.28,
      fogColor:0x0a0018, fogDensity:0.007,
      groundCol:0x0d0022,
    },
    phantom: {
      name:'Phantom Storm', laps:2, difficulty:'Hard',
      primaryCol:0xff1155, secondaryCol:0xff8800,
      ctrl:(W,H)=>{
        const R=Math.min(W,H)*.42;
        const pts=[];
        for(let i=0;i<20;i++){
          const t=i/20*Math.PI*2;
          const r=R*(0.45+0.55*Math.pow(Math.abs(Math.sin(t*2.5)),0.7));
          const elev=Math.sin(t*4)*24+Math.cos(t*2)*10;
          pts.push(new THREE.Vector3(
            Math.cos(t)*r*1.15,
            elev,
            Math.sin(t)*r*0.85
          ));
        }
        return pts;
      },
      width:18, guardHeight:4.5, bankAngle:0.35,
      fogColor:0x1a0000, fogDensity:0.009,
      groundCol:0x150008,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIP SPECS
  // ═══════════════════════════════════════════════════════════════════════════
  const SHIPS = {
    feisar: {
      name:'FEISAR', col:0x3b82f6, accel:24, maxSpd:280, turnRate:2.8,
      drag:0.94, grip:0.82, mass:1.0, boostMult:1.8, shield:100,
      desc:'Balanced · Forgiving · Recommended',
      wingSpan:3.2, bodyLength:4.2, bodyWidth:1.0,
    },
    auricom: {
      name:'AURICOM', col:0xef4444, accel:30, maxSpd:320, turnRate:2.2,
      drag:0.92, grip:0.70, mass:1.3, boostMult:2.1, shield:80,
      desc:'Fast · Heavy · Hard to turn',
      wingSpan:3.8, bodyLength:4.6, bodyWidth:1.15,
    },
    piranha: {
      name:'PIRANHA', col:0x00ff88, accel:18, maxSpd:360, turnRate:3.8,
      drag:0.96, grip:0.90, mass:0.7, boostMult:2.5, shield:55,
      desc:'Extreme speed · Fragile · Expert only',
      wingSpan:2.8, bodyLength:5.0, bodyWidth:0.8,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL
  // ═══════════════════════════════════════════════════════════════════════════
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
      const barFn=(v,mx,lbl)=>{
        const pct=Math.round(v/mx*100);
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:9px;color:rgba(255,255,255,.35);width:50px">${lbl}</span>
          <div style="flex:1;height:3px;background:rgba(255,255,255,.1);border-radius:2px">
            <div style="width:${pct}%;height:100%;background:#${s.col.toString(16).padStart(6,'0')};border-radius:2px"></div></div>
          <span style="font-size:9px;color:rgba(255,255,255,.45);width:24px;text-align:right">${pct}</span></div>`;
      };
      html+=`<div style="padding:10px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-left:3px solid #${s.col.toString(16).padStart(6,'0')}">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px">${s.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:8px">${s.desc}</div>
        ${barFn(s.accel,30,'ACCEL')}
        ${barFn(s.maxSpd,360,'TOP SPD')}
        ${barFn(s.grip*100,100,'GRIP')}
        ${barFn(s.shield,100,'SHIELD')}</div>`;
    });
    html+=`<div style="font-size:16px;font-weight:700;color:#00f5ff;margin:14px 0 10px">🏁 Tracks</div>`;
    Object.entries(TRACKS).forEach(([id,t])=>{
      html+=`<div style="padding:9px 12px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.04);border-left:3px solid #${t.primaryCol.toString(16).padStart(6,'0')}">
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
    menu.style.cssText='position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;background:linear-gradient(180deg,#000,#020218);padding:16px 12px';

    function buildMenu(){
      menu.innerHTML=`
        <div style="font-size:40px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px;margin-bottom:2px">WIPEOUT</div>
        <div style="font-size:9px;color:rgba(255,255,255,.25);letter-spacing:5px;margin-bottom:16px">ANTI-GRAVITY RACING</div>

        <div style="font-size:10px;color:rgba(0,245,255,.6);letter-spacing:2px;margin-bottom:8px;align-self:flex-start">TRACK</div>
        <div style="display:flex;gap:6px;width:100%;margin-bottom:16px">
          ${Object.entries(TRACKS).map(([id,t])=>`
            <div data-track="${id}" style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${id===selectedTrack?`#${t.primaryCol.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.1)'};background:${id===selectedTrack?'rgba(0,245,255,.05)':'rgba(255,255,255,.02)'};cursor:pointer;text-align:center">
              <div style="font-size:11px;font-weight:700;color:${id===selectedTrack?'#fff':'rgba(255,255,255,.4)'}">${t.name}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.3)">${t.difficulty}</div>
            </div>`).join('')}
        </div>

        <div style="font-size:10px;color:rgba(0,245,255,.6);letter-spacing:2px;margin-bottom:8px;align-self:flex-start">SHIP</div>
        <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-bottom:16px">
          ${Object.entries(SHIPS).map(([id,s])=>`
            <div data-ship="${id}" style="padding:8px 12px;border-radius:8px;border:1.5px solid ${id===selectedShip?`#${s.col.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.08)'};background:${id===selectedShip?'rgba(255,255,255,.05)':'transparent'};cursor:pointer;display:flex;align-items:center;gap:10px">
              <div style="width:18px;height:18px;border-radius:50%;background:#${s.col.toString(16).padStart(6,'0')}"></div>
              <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${id===selectedShip?'#fff':'rgba(255,255,255,.4)'}">${s.name}</div>
              <div style="font-size:9px;color:rgba(255,255,255,.3)">${s.desc}</div></div>
            </div>`).join('')}
        </div>

        <div style="width:100%;padding:10px;background:rgba(0,245,255,.06);border:1px solid rgba(0,245,255,.2);border-radius:10px;margin-bottom:14px;font-size:9px;color:rgba(255,255,255,.4);line-height:1.9;text-align:center">
          ← → STEER &nbsp;·&nbsp; ↑ ACCÉLÉRER &nbsp;·&nbsp; ↓ FREINER &nbsp;·&nbsp; ESPACE BOOST<br>
          Mobile : ← ↑ → à gauche &nbsp;·&nbsp; ⚡ BOOST à droite</div>

        <button id="wo-start" style="width:100%;background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace">▶  DÉMARRER</button>`;

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
  // MAIN RACE — completely rewritten
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

    // Canvas setup
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const W=canvas.offsetWidth||360, H=canvas.offsetHeight||520;
    canvas.width=W; canvas.height=H;

    // ── HUD ──────────────────────────────────────────────────────────────────
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:0;left:0;right:0;padding:8px 12px;pointer-events:none;z-index:10;font-family:monospace';
    hud.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:7px;color:rgba(0,245,255,.45);letter-spacing:3px">TOUR</div>
          <div id="wo-lap" style="font-size:24px;font-weight:700;color:#00f5ff;line-height:1;text-shadow:0 0 20px rgba(0,245,255,.5)">0/${TOTAL_LAPS}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:7px;color:rgba(0,245,255,.45);letter-spacing:3px">TEMPS</div>
          <div id="wo-time" style="font-size:24px;font-weight:700;color:#00f5ff;line-height:1;text-shadow:0 0 20px rgba(0,245,255,.5)">0:00.000</div>
          <div id="wo-best" style="font-size:10px;color:rgba(0,245,255,.4)">Meilleur: --:--.---</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:7px;color:rgba(0,245,255,.45);letter-spacing:3px">TOUR</div>
          <div id="wo-laptime" style="font-size:13px;color:rgba(0,245,255,.6);line-height:1.3">--:--.---</div>
          <div id="wo-track" style="font-size:8px;color:rgba(255,255,255,.25)">${trackDef.name}</div>
        </div>
      </div>`;
    container.appendChild(hud);

    // Speed / boost / shield bars
    const speedo=document.createElement('div');
    speedo.style.cssText='position:absolute;bottom:100px;left:12px;right:12px;pointer-events:none;z-index:10;font-family:monospace';
    speedo.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">KM/H</span>
        <div style="flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-spd-bar" style="height:100%;background:linear-gradient(90deg,#00f5ff,#0af);border-radius:3px;width:0%;transition:width .04s"></div></div>
        <span id="wo-spd-val" style="font-size:12px;color:#00f5ff;width:38px;text-align:right;font-weight:700">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">BOOST</span>
        <div style="flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-bst-bar" style="height:100%;background:linear-gradient(90deg,#7B2FFF,#c026d3);border-radius:3px;width:80%"></div></div>
        <span id="wo-bst-val" style="font-size:12px;color:#a78bfa;width:38px;text-align:right">80</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">SHLD</span>
        <div style="flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="wo-shld-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:3px;width:100%;transition:width .15s"></div></div>
        <span id="wo-shld-val" style="font-size:12px;color:#34d399;width:38px;text-align:right">100</span>
      </div>`;
    container.appendChild(speedo);

    // Countdown / message overlay
    const msgDiv=document.createElement('div');
    msgDiv.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25';
    const msgTxt=document.createElement('div');
    msgTxt.style.cssText='font-size:60px;font-weight:900;font-family:monospace;color:#00f5ff;text-shadow:0 0 40px rgba(0,245,255,.8);opacity:0;transition:opacity .15s;letter-spacing:-3px';
    msgDiv.appendChild(msgTxt); container.appendChild(msgDiv);

    // Damage flash
    const dmgFlash=document.createElement('div');
    dmgFlash.style.cssText='position:absolute;inset:0;background:rgba(255,0,0,0);pointer-events:none;z-index:20;transition:background .08s';
    container.appendChild(dmgFlash);

    // Boost flash
    const boostFlash=document.createElement('div');
    boostFlash.style.cssText='position:absolute;inset:0;background:rgba(120,50,255,0);pointer-events:none;z-index:20;transition:background .06s';
    container.appendChild(boostFlash);

    // ── CONTROLS ──────────────────────────────────────────────────────────────
    const ctrlDiv=document.createElement('div');
    ctrlDiv.style.cssText='position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-end;padding:0 10px;z-index:10;gap:6px';

    const leftCluster=document.createElement('div');
    leftCluster.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;width:140px';
    leftCluster.innerHTML=`
      <div></div>
      <button id="wo-up" style="height:38px;background:rgba(0,245,255,.1);border:1px solid rgba(0,245,255,.3);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px">↑</button>
      <div></div>
      <button id="wo-left" style="height:38px;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px">←</button>
      <button id="wo-down" style="height:38px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.2);color:#ff6464;border-radius:8px;cursor:pointer;font-size:16px">↓</button>
      <button id="wo-right" style="height:38px;background:rgba(0,245,255,.08);border:1px solid rgba(0,245,255,.2);color:#00f5ff;border-radius:8px;cursor:pointer;font-size:16px">→</button>`;
    ctrlDiv.appendChild(leftCluster);

    const boostBtn=document.createElement('button');
    boostBtn.id='wo-boost';
    boostBtn.style.cssText='width:82px;height:82px;background:rgba(123,47,255,.18);border:2px solid rgba(123,47,255,.55);color:#c4b5fd;font-size:26px;border-radius:50%;cursor:pointer;font-family:monospace;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px';
    boostBtn.innerHTML='⚡<span style="font-size:9px;letter-spacing:1px">BOOST</span>';
    ctrlDiv.appendChild(boostBtn);
    container.appendChild(ctrlDiv);

    // Finish overlay
    const finDiv=document.createElement('div');
    finDiv.style.cssText='position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.92);z-index:30';
    container.appendChild(finDiv);

    // ── THREE.JS ─────────────────────────────────────────────────────────────
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    _renderer=renderer;
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=false;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.2;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(trackDef.fogColor, trackDef.fogDensity);
    scene.background=new THREE.Color(trackDef.fogColor);

    const camera=new THREE.PerspectiveCamera(72,W/H,0.1,1400);

    // ── SKYBOX / ENVIRONMENT ──────────────────────────────────────────────────
    // Stars — multiple layers
    for(let layer=0;layer<3;layer++){
      const count=3000+layer*2000;
      const sv=new Float32Array(count*3);
      for(let i=0;i<count*3;i+=3){
        const r=400+layer*200;
        sv[i]=(Math.random()-.5)*r*2;
        sv[i+1]=(Math.random()-.5)*r;
        sv[i+2]=(Math.random()-.5)*r*2;
      }
      const sg=new THREE.BufferGeometry();
      sg.setAttribute('position',new THREE.BufferAttribute(sv,3));
      const sz=[1.2,0.7,0.4][layer];
      scene.add(new THREE.Points(sg,new THREE.PointsMaterial({
        color:[0xffffff,0xaad4ff,0xffeecc][layer],
        size:sz,transparent:true,opacity:[0.9,0.6,0.4][layer]
      })));
    }

    // Nebula planes (coloured fog panels far away)
    const nebulaData=[
      {col:0x001133,x:-300,y:50,z:-200,rx:0.2,ry:0.4},
      {col:0x110022,x:200,y:-30,z:-350,rx:-0.1,ry:-0.3},
      {col:0x220011,x:-100,y:80,z:300,rx:0.15,ry:0.6},
    ];
    nebulaData.forEach(nd=>{
      const ng=new THREE.Mesh(
        new THREE.PlaneGeometry(400,200),
        new THREE.MeshBasicMaterial({color:nd.col,transparent:true,opacity:0.18,side:THREE.DoubleSide,depthWrite:false})
      );
      ng.position.set(nd.x,nd.y,nd.z);
      ng.rotation.set(nd.rx,nd.ry,0);
      scene.add(ng);
    });

    // ── TRACK GENERATION ──────────────────────────────────────────────────────
    const rawCtrl=trackDef.ctrl(W,H);
    const N_STEPS=600;
    const trackCurve=new THREE.CatmullRomCurve3(rawCtrl,true,'catmullrom',0.5);
    const frenetFrames=trackCurve.computeFrenetFrames(N_STEPS,true);

    // Track surface with proper banking
    const tPos=[], tNorm=[], tUV=[], tIdx=[];
    for(let i=0;i<=N_STEPS;i++){
      const pt=new THREE.Vector3(); trackCurve.getPointAt(i/N_STEPS,pt);
      const ti=i%N_STEPS;
      const tangent=frenetFrames.tangents[ti];
      const normal=frenetFrames.normals[ti];
      const binormal=frenetFrames.binormals[ti];

      const bankAmt=trackDef.bankAngle;
      const up=new THREE.Vector3(0,1,0).lerp(normal,bankAmt).normalize();
      const right=new THREE.Vector3().crossVectors(tangent,up).normalize();

      const hw=TRACK_W/2;
      const L=pt.clone().addScaledVector(right,-hw);
      const R=pt.clone().addScaledVector(right, hw);
      tPos.push(L.x,L.y,L.z,R.x,R.y,R.z);
      tNorm.push(up.x,up.y,up.z,up.x,up.y,up.z);
      const u=i/N_STEPS;
      tUV.push(u*50,0,u*50,1);
      if(i<N_STEPS){const b=i*2;tIdx.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    const last=N_STEPS*2;tIdx.push(last,last+1,0,last+1,1,0);

    const tGeo=new THREE.BufferGeometry();
    tGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tPos),3));
    tGeo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(tNorm),3));
    tGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(tUV),2));
    tGeo.setIndex(tIdx);

    // Track texture — procedural with lane markers and glow strips
    const TS=512;
    const TD=new Uint8Array(TS*TS*4);
    const pc=trackDef.primaryCol;
    const pr=(pc>>16)&255,pg=(pc>>8)&255,pb=pc&255;
    const sc_=trackDef.secondaryCol;
    const sr=(sc_>>16)&255,sg_=(sc_>>8)&255,sb=sc_&255;

    for(let y=0;y<TS;y++) for(let x=0;x<TS;x++){
      const i4=(y*TS+x)*4;
      const lane=x/TS;
      const uv=y/TS;

      // Center divider line
      const isCtr=Math.abs(lane-.5)<.008;
      // Edge glow strips
      const isLeftGlow=lane<0.06;
      const isRightGlow=lane>0.94;
      // Lane dashes
      const dashCycle=((uv*40)%1);
      const isLaneMark=Math.abs(lane-.33)<.008&&dashCycle<0.5;
      const isLaneMark2=Math.abs(lane-.67)<.008&&dashCycle<0.5;
      // Subtle grid
      const gridU=(y%32)/32, gridV=(x%32)/32;
      const grid=Math.max(0,(1-Math.min(gridU,1-gridU,gridV,1-gridV)*10)*.015);

      let r=8+grid*80, g=10+grid*80, b=16+grid*80;

      if(isLeftGlow||isRightGlow){
        const side=isLeftGlow?1-lane/0.06:(lane-0.94)/0.06;
        r=Math.round(pr*side*.6); g=Math.round(pg*side*.6); b=Math.round(pb*side*.6);
      }
      if(isCtr){ r=Math.round(sr*.7); g=Math.round(sg_*.7); b=Math.round(sb*.7); }
      if(isLaneMark||isLaneMark2){ r=Math.max(r,Math.round(pr*.25)); g=Math.max(g,Math.round(pg*.25)); b=Math.max(b,Math.round(pb*.25)); }

      TD[i4]=r; TD[i4+1]=g; TD[i4+2]=b; TD[i4+3]=255;
    }
    const trackTex=new THREE.DataTexture(TD,TS,TS,THREE.RGBAFormat);
    trackTex.wrapS=trackTex.wrapT=THREE.RepeatWrapping;
    trackTex.needsUpdate=true;

    const trackMesh=new THREE.Mesh(tGeo,new THREE.MeshStandardMaterial({
      map:trackTex, roughness:0.18, metalness:0.85, side:THREE.DoubleSide,
      envMapIntensity:1.2,
    }));
    scene.add(trackMesh);

    // ── GUARD RAILS — both sides ──────────────────────────────────────────────
    const GH=trackDef.guardHeight;
    const guardColors=[[trackDef.primaryCol,0],[trackDef.secondaryCol,1]];
    const railGroups=[];

    guardColors.forEach(([col,sideIdx])=>{
      const side=sideIdx===0?-1:1;
      const railPts1=[],railPts2=[],railPts3=[];
      for(let i=0;i<=N_STEPS;i++){
        const pt=new THREE.Vector3(); trackCurve.getPointAt(i/N_STEPS,pt);
        const ti=i%N_STEPS;
        const tangent=frenetFrames.tangents[ti];
        const normal=frenetFrames.normals[ti];
        const bankAmt=trackDef.bankAngle;
        const up=new THREE.Vector3(0,1,0).lerp(normal,bankAmt).normalize();
        const right=new THREE.Vector3().crossVectors(tangent,up).normalize();
        const hw=TRACK_W/2+0.3;
        const base=pt.clone().addScaledVector(right,side*hw);
        railPts1.push(base.clone().addScaledVector(up, 0.1));
        railPts2.push(base.clone().addScaledVector(up, GH*0.5));
        railPts3.push(base.clone().addScaledVector(up, GH));
      }

      // Rail tubes as thick lines
      [[railPts1,1.5,0.9],[railPts2,0.8,0.5],[railPts3,2.5,1.0]].forEach(([pts,thick,opacity])=>{
        const geo=new THREE.BufferGeometry().setFromPoints(pts);
        const mat=new THREE.LineBasicMaterial({color:col,linewidth:thick,transparent:true,opacity});
        scene.add(new THREE.Line(geo,mat));
      });

      // Vertical struts every ~N steps
      const strutGrp=new THREE.Group();
      for(let i=0;i<N_STEPS;i+=Math.floor(N_STEPS/40)){
        const a=railPts1[i],b=railPts3[i];
        if(!a||!b) continue;
        const geo=new THREE.BufferGeometry().setFromPoints([a,b]);
        const mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.35});
        strutGrp.add(new THREE.Line(geo,mat));
      }
      scene.add(strutGrp);
      railGroups.push({col,railPts3});

      // Glow top rail — slightly bigger, more transparent
      const glowGeo=new THREE.BufferGeometry().setFromPoints(railPts3);
      scene.add(new THREE.Line(glowGeo,new THREE.LineBasicMaterial({
        color:col, transparent:true, opacity:0.2,
      })));
    });

    // ── GROUND PLANE ─────────────────────────────────────────────────────────
    const groundGeo=new THREE.PlaneGeometry(2000,2000,40,40);
    const groundMat=new THREE.MeshStandardMaterial({
      color:trackDef.groundCol, roughness:0.9, metalness:0.3,
      wireframe:false,
    });
    const ground=new THREE.Mesh(groundGeo,groundMat);
    ground.rotation.x=-Math.PI/2;
    ground.position.y=-10;
    scene.add(ground);

    // Ground grid lines
    const gridGeo=new THREE.PlaneGeometry(1200,1200,30,30);
    const gridMat=new THREE.MeshBasicMaterial({color:trackDef.primaryCol,wireframe:true,transparent:true,opacity:0.04});
    const gridMesh=new THREE.Mesh(gridGeo,gridMat);
    gridMesh.rotation.x=-Math.PI/2;
    gridMesh.position.y=-9.8;
    scene.add(gridMesh);

    // ── BOOST PADS ────────────────────────────────────────────────────────────
    const N_PADS=8;
    const padMeshes=[];
    for(let i=0;i<N_PADS;i++){
      const t=(i+0.5)/N_PADS;
      const pt=new THREE.Vector3(); trackCurve.getPointAt(t,pt);
      const ti=Math.floor(t*N_STEPS);
      const tangent=frenetFrames.tangents[ti%N_STEPS];
      const normal=frenetFrames.normals[ti%N_STEPS];
      const up=new THREE.Vector3(0,1,0).lerp(normal,trackDef.bankAngle).normalize();
      const right=new THREE.Vector3().crossVectors(tangent,up).normalize();

      const padGrp=new THREE.Group();

      // Main pad surface
      const padGeo=new THREE.BoxGeometry(TRACK_W-8,0.15,4);
      const padMat=new THREE.MeshStandardMaterial({
        color:0x2200aa, emissive:0x1100aa, emissiveIntensity:0.5,
        roughness:0.05, metalness:0.98, transparent:true, opacity:0.9,
      });
      padGrp.add(new THREE.Mesh(padGeo,padMat));

      // Pad arrow markers
      for(let a=0;a<3;a++){
        const arrowGeo=new THREE.BufferGeometry();
        const aw=2.5;
        const verts=new Float32Array([
          0,0.1,-aw*0.7, -aw*0.4,0.1,aw*0.3, aw*0.4,0.1,aw*0.3
        ]);
        arrowGeo.setAttribute('position',new THREE.BufferAttribute(verts,3));
        const arrowMat=new THREE.MeshBasicMaterial({color:0x6600ff,side:THREE.DoubleSide});
        const arrow=new THREE.Mesh(arrowGeo,arrowMat);
        arrow.position.z=(a-1)*1.2;
        padGrp.add(arrow);
      }

      padGrp.position.copy(pt).add(new THREE.Vector3(0,0.2,0));
      // Orient along track
      const lookAt=pt.clone().add(tangent);
      padGrp.lookAt(lookAt);
      padGrp.userData.t=t;
      padGrp.userData.pt=pt.clone();
      scene.add(padGrp);
      padMeshes.push(padGrp);

      // Pad point light
      const pl=new THREE.PointLight(0x6600ff,4,15);
      pl.position.copy(pt).add(new THREE.Vector3(0,1,0));
      scene.add(pl);
      padGrp.userData.light=pl;
    }

    // ── CHECKPOINT GATES ──────────────────────────────────────────────────────
    const GATE_COUNT=4;
    const gates=[];
    for(let i=0;i<GATE_COUNT;i++){
      const t=(i+.5)/GATE_COUNT;
      const pt=new THREE.Vector3(); trackCurve.getPointAt(t,pt);
      const ti=Math.floor(t*N_STEPS);
      const tangent=frenetFrames.tangents[ti%N_STEPS];
      const normal=frenetFrames.normals[ti%N_STEPS];
      const up=new THREE.Vector3(0,1,0).lerp(normal,trackDef.bankAngle).normalize();
      const right=new THREE.Vector3().crossVectors(tangent,up).normalize();

      const gateGrp=new THREE.Group();
      const hw=TRACK_W/2+2;
      const gh=GH+2;

      // Gate arch
      [-1,1].forEach(s=>{
        const post=new THREE.Mesh(
          new THREE.CylinderGeometry(0.2,0.25,gh,8),
          new THREE.MeshStandardMaterial({color:0x0a0018,metalness:0.95,roughness:0.05})
        );
        post.position.copy(pt).addScaledVector(right,s*hw);
        post.position.y+=gh/2;
        scene.add(post);

        // Top ball
        const ball=new THREE.Mesh(
          new THREE.SphereGeometry(0.4,8,8),
          new THREE.MeshBasicMaterial({color:trackDef.primaryCol})
        );
        ball.position.copy(post.position);
        ball.position.y=post.position.y+gh/2+0.4;
        scene.add(ball);

        const pl=new THREE.PointLight(trackDef.primaryCol,6,20);
        pl.position.copy(ball.position);
        scene.add(pl);
      });

      // Horizontal bar
      const bar=new THREE.Mesh(
        new THREE.BoxGeometry(hw*2+0.5,0.2,0.4),
        new THREE.MeshStandardMaterial({color:trackDef.primaryCol,emissive:new THREE.Color(trackDef.primaryCol).multiplyScalar(0.3),metalness:0.8})
      );
      bar.position.copy(pt);
      bar.position.y+=gh+0.1;
      scene.add(bar);

      gates.push({t,pos:pt.clone()});
    }

    // ── SHIP ASSEMBLY — detailed geometry ─────────────────────────────────────
    const shipGroup=new THREE.Group();
    const sCol=new THREE.Color(shipDef.col);
    const WS=shipDef.wingSpan, BL=shipDef.bodyLength, BW=shipDef.bodyWidth;

    // Materials
    const darkMat=new THREE.MeshStandardMaterial({color:0x000d20,metalness:0.98,roughness:0.04});
    const shipMat=new THREE.MeshStandardMaterial({color:sCol,emissive:sCol.clone().multiplyScalar(0.08),metalness:0.95,roughness:0.06});
    const accentMat=new THREE.MeshStandardMaterial({color:0xffffff,metalness:0.6,roughness:0.3});
    const glassMat=new THREE.MeshStandardMaterial({color:0x44aaff,emissive:0x001133,transparent:true,opacity:0.55,roughness:0,metalness:0.1});
    const engineGlowMat=new THREE.MeshBasicMaterial({color:0x00f5ff,transparent:true,opacity:0.9});
    const engineGlowMatBoost=new THREE.MeshBasicMaterial({color:0xaa44ff,transparent:true,opacity:0.9});

    // Main body — elongated shape using multiple pieces
    // Fuselage bottom
    const fuseGeo=new THREE.CylinderGeometry(BW*0.35,BW*0.2,BL,8,1);
    fuseGeo.rotateX(Math.PI/2);
    const fuse=new THREE.Mesh(fuseGeo,darkMat);
    fuse.position.set(0,0,0);
    shipGroup.add(fuse);

    // Fuselage top fairing (flatter)
    const fairingGeo=new THREE.CylinderGeometry(BW*0.5,BW*0.25,BL*0.7,8,1);
    fairingGeo.rotateX(Math.PI/2);
    const fairing=new THREE.Mesh(fairingGeo,darkMat);
    fairing.position.set(0,BW*0.15,BL*0.05);
    fairing.scale.y=0.4;
    shipGroup.add(fairing);

    // Hull plate top — flat colored panel
    const hullGeo=new THREE.BoxGeometry(BW*1.4,BW*0.12,BL*0.85);
    const hull=new THREE.Mesh(hullGeo,shipMat);
    hull.position.set(0,BW*0.22,0);
    shipGroup.add(hull);

    // Hull side accent strips
    [-1,1].forEach(s=>{
      const stripGeo=new THREE.BoxGeometry(BW*0.08,BW*0.08,BL*0.7);
      const strip=new THREE.Mesh(stripGeo,shipMat);
      strip.position.set(s*BW*0.65,BW*0.15,0);
      shipGroup.add(strip);
    });

    // Nose cone
    const noseGeo=new THREE.ConeGeometry(BW*0.3,BL*0.38,8);
    noseGeo.rotateX(-Math.PI/2);
    const nose=new THREE.Mesh(noseGeo,darkMat);
    nose.position.set(0,0,BL*0.69);
    shipGroup.add(nose);

    // Nose tip colored
    const noseTipGeo=new THREE.ConeGeometry(BW*0.12,BL*0.1,8);
    noseTipGeo.rotateX(-Math.PI/2);
    const noseTip=new THREE.Mesh(noseTipGeo,shipMat);
    noseTip.position.set(0,0,BL*0.88);
    shipGroup.add(noseTip);

    // Wings — swept delta shape
    [-1,1].forEach(s=>{
      // Main wing
      const wv=new Float32Array([
        0,    0,    BL*0.35,
        s*WS, -BW*0.05, -BL*0.15,
        s*WS*0.6, -BW*0.02, -BL*0.42,
        0,    0,    -BL*0.42,
        // duplicated for back face
        0,    0,    BL*0.35,
        s*WS*0.6, -BW*0.02, -BL*0.42,
        s*WS, -BW*0.05, -BL*0.15,
      ]);
      const wGeo=new THREE.BufferGeometry();
      wGeo.setAttribute('position',new THREE.BufferAttribute(wv,3));
      wGeo.setIndex([0,1,2, 2,3,0, 4,6,5]);
      wGeo.computeVertexNormals();
      const wing=new THREE.Mesh(wGeo,darkMat);
      shipGroup.add(wing);

      // Wing top colored panel
      const wpv=new Float32Array([
        0,    BW*0.04, BL*0.28,
        s*WS*0.88, BW*0.01, -BL*0.05,
        s*WS*0.45, BW*0.02, -BL*0.32,
        0,    BW*0.03, -BL*0.32,
      ]);
      const wpGeo=new THREE.BufferGeometry();
      wpGeo.setAttribute('position',new THREE.BufferAttribute(wpv,3));
      wpGeo.setIndex([0,1,2, 2,3,0]);
      wpGeo.computeVertexNormals();
      const wingPanel=new THREE.Mesh(wpGeo,shipMat);
      shipGroup.add(wingPanel);

      // Wing tip pod
      const wtGeo=new THREE.CylinderGeometry(0.14,0.2,1.4,6);
      wtGeo.rotateX(Math.PI/2);
      const wt=new THREE.Mesh(wtGeo,shipMat);
      wt.position.set(s*WS*0.92,-BW*0.05,-BL*0.1);
      shipGroup.add(wt);

      // Wingtip light
      const wtLight=new THREE.PointLight(shipDef.col,3,8);
      wtLight.position.set(s*WS*0.92,0,-BL*0.1);
      shipGroup.add(wtLight);
    });

    // Cockpit bubble
    const cockpitGeo=new THREE.SphereGeometry(BW*0.42,12,8);
    cockpitGeo.scale(1.15,0.52,1.3);
    const cockpit=new THREE.Mesh(cockpitGeo,glassMat);
    cockpit.position.set(0,BW*0.38,BL*0.25);
    shipGroup.add(cockpit);

    // Cockpit frame ring
    const cfGeo=new THREE.TorusGeometry(BW*0.44,0.04,6,20);
    const cf=new THREE.Mesh(cfGeo,shipMat);
    cf.position.copy(cockpit.position);
    cf.rotation.x=Math.PI/2;
    cf.scale.y=0.45;
    shipGroup.add(cf);

    // Engines x2
    const engineGlows=[];
    const engineLights=[];
    [-BW*0.55,BW*0.55].forEach((ex,ei)=>{
      // Engine nacelle
      const nacGeo=new THREE.CylinderGeometry(BW*0.32,BW*0.28,BL*0.45,10);
      nacGeo.rotateX(Math.PI/2);
      const nac=new THREE.Mesh(nacGeo,darkMat);
      nac.position.set(ex,-BW*0.1,-BL*0.5);
      shipGroup.add(nac);

      // Engine intake ring
      const intakeGeo=new THREE.TorusGeometry(BW*0.3,0.06,8,16);
      const intake=new THREE.Mesh(intakeGeo,shipMat);
      intake.position.set(ex,-BW*0.1,-BL*0.28);
      shipGroup.add(intake);

      // Engine nozzle
      const nozzleGeo=new THREE.CylinderGeometry(BW*0.22,BW*0.32,0.3,10);
      nozzleGeo.rotateX(Math.PI/2);
      const nozzle=new THREE.Mesh(nozzleGeo,darkMat);
      nozzle.position.set(ex,-BW*0.1,-BL*0.72);
      shipGroup.add(nozzle);

      // Engine glow cone
      const glowGeo=new THREE.CylinderGeometry(0.06,BW*0.2,BL*0.4,8);
      glowGeo.rotateX(Math.PI/2);
      const glow=new THREE.Mesh(glowGeo,engineGlowMat.clone());
      glow.position.set(ex,-BW*0.1,-BL*0.92);
      shipGroup.add(glow);
      engineGlows.push(glow);

      // Engine point light
      const el=new THREE.PointLight(0x00f5ff,8,18);
      el.position.set(ex,-BW*0.1,-BL*0.95);
      shipGroup.add(el);
      engineLights.push(el);
    });

    // Hover pods x4
    const hoverPods=[];
    [[-BW*0.6,-BL*0.38],[BW*0.6,-BL*0.38],[-BW*0.5,BL*0.2],[BW*0.5,BL*0.2]].forEach(([hx,hz])=>{
      const podGeo=new THREE.SphereGeometry(0.12,6,6);
      const pod=new THREE.Mesh(podGeo,new THREE.MeshBasicMaterial({color:0x00f5ff}));
      pod.position.set(hx,-BW*0.22,hz);
      shipGroup.add(pod);
      hoverPods.push(pod);

      // Pod glow
      const podLight=new THREE.PointLight(0x00f5ff,2.5,5);
      podLight.position.copy(pod.position);
      shipGroup.add(podLight);
    });

    scene.add(shipGroup);

    // ── PARTICLE SYSTEMS ──────────────────────────────────────────────────────
    // Exhaust particles
    const MAX_EX=200;
    const exPositions=new Float32Array(MAX_EX*3);
    const exColors=new Float32Array(MAX_EX*3);
    const exGeo=new THREE.BufferGeometry();
    exGeo.setAttribute('position',new THREE.BufferAttribute(exPositions,3));
    exGeo.setAttribute('color',new THREE.BufferAttribute(exColors,3));
    const exMat=new THREE.PointsMaterial({vertexColors:true,size:0.7,transparent:true,opacity:0.85,sizeAttenuation:true});
    const exSystem=new THREE.Points(exGeo,exMat);
    scene.add(exSystem);
    const exParticles=[];

    // Boost trail
    const MAX_TR=120;
    const trPositions=new Float32Array(MAX_TR*3);
    const trGeo=new THREE.BufferGeometry();
    trGeo.setAttribute('position',new THREE.BufferAttribute(trPositions,3));
    const trMat=new THREE.PointsMaterial({color:0x8800ff,size:1.6,transparent:true,opacity:0.7,sizeAttenuation:true});
    const trSystem=new THREE.Points(trGeo,trMat);
    scene.add(trSystem);
    const trParticles=[];

    // Wall sparks
    const MAX_SPK=80;
    const spkPositions=new Float32Array(MAX_SPK*3);
    const spkGeo=new THREE.BufferGeometry();
    spkGeo.setAttribute('position',new THREE.BufferAttribute(spkPositions,3));
    const spkMat=new THREE.PointsMaterial({color:0xff5500,size:0.9,transparent:true,opacity:0,sizeAttenuation:true});
    const spkSystem=new THREE.Points(spkGeo,spkMat);
    scene.add(spkSystem);
    const spkParticles=[];

    // ── LIGHTS ────────────────────────────────────────────────────────────────
    const ambientLight=new THREE.AmbientLight(0x111830,2.8);
    scene.add(ambientLight);

    const dirLight=new THREE.DirectionalLight(0x4466ff,3.5);
    dirLight.position.set(15,50,25);
    scene.add(dirLight);

    const rimLight=new THREE.DirectionalLight(0xff0044,1.8);
    rimLight.position.set(-15,-8,-25);
    scene.add(rimLight);

    const fillLight=new THREE.DirectionalLight(0x00ffaa,0.8);
    fillLight.position.set(5,-10,0);
    scene.add(fillLight);

    const shipGlowLight=new THREE.PointLight(shipDef.col,10,35);
    scene.add(shipGlowLight);

    const boostPointLight=new THREE.PointLight(0x8800ff,0,30);
    scene.add(boostPointLight);

    const underLight=new THREE.PointLight(0x00f5ff,4,10);
    scene.add(underLight);

    // ── PHYSICS STATE ─────────────────────────────────────────────────────────
    const startPt=new THREE.Vector3(); trackCurve.getPointAt(0,startPt);
    const startTan=frenetFrames.tangents[0].clone();

    let shipPos=startPt.clone().add(new THREE.Vector3(0,1.4,0));
    let shipVel=new THREE.Vector3();
    let shipHeading=Math.atan2(startTan.x,startTan.z);
    let shipSpeed=0;
    let shipRoll=0, shipPitch=0;
    let hoverPhase=0;
    let boostCharge=0.8;
    let shield=shipDef.shield;
    let lapCount=0, lapStartTime=0, raceStart=0, raceStarted=false, finished=false;
    let prevClosestT=0;
    let checkpointsPassed=new Set();
    let wallHitCooldown=0;
    let camShake=0;
    let boostJustFired=false;
    const lapTimes=[];

    // Camera
    let camPos=new THREE.Vector3();
    let camLookTarget=new THREE.Vector3();
    let firstFrame=true;

    // Saved best
    const savedScores=loadScores().filter(s=>s.track===trackDef.name).sort((a,b)=>a.time-b.time);
    if(savedScores.length) document.getElementById('wo-best').textContent='Meilleur: '+fmt(savedScores[0].time);

    // ── INPUT ─────────────────────────────────────────────────────────────────
    const keys={left:false,right:false,up:false,down:false,boost:false};
    const onKey=e=>{
      const d=e.type==='keydown';
      if(['ArrowLeft','a','q'].includes(e.key)) keys.left=d;
      if(['ArrowRight','d'].includes(e.key)) keys.right=d;
      if(['ArrowUp','w','z'].includes(e.key)) keys.up=d;
      if(['ArrowDown','s'].includes(e.key)) keys.down=d;
      if(e.key===' '){keys.boost=d;if(d)e.preventDefault();}
    };
    window.addEventListener('keydown',onKey);
    window.addEventListener('keyup',onKey);

    // Mobile
    [['#wo-up','up'],['#wo-down','down'],['#wo-left','left'],['#wo-right','right'],['#wo-boost','boost']].forEach(([sel,k])=>{
      const el=container.querySelector(sel);
      if(!el) return;
      el.addEventListener('pointerdown',e=>{keys[k]=true;e.preventDefault();});
      el.addEventListener('pointerup',()=>keys[k]=false);
      el.addEventListener('pointercancel',()=>keys[k]=false);
      el.addEventListener('pointerleave',()=>keys[k]=false);
    });

    const resObs=new ResizeObserver(()=>{
      const W2=canvas.offsetWidth,H2=canvas.offsetHeight;
      if(!W2||!H2) return;
      renderer.setSize(W2,H2);camera.aspect=W2/H2;camera.updateProjectionMatrix();
    });
    resObs.observe(canvas);

    // ── COUNTDOWN ─────────────────────────────────────────────────────────────
    let countdownDone=false;
    function showMsg(txt,duration=700,cb){
      msgTxt.textContent=txt;
      msgTxt.style.opacity='1';
      setTimeout(()=>{msgTxt.style.opacity='0';setTimeout(()=>{if(cb)cb();},200);},duration);
    }
    setTimeout(()=>showMsg('3',800,()=>
      showMsg('2',800,()=>
        showMsg('1',800,()=>
          showMsg('GO!',600,()=>{
            countdownDone=true;
            raceStart=Date.now();
            lapStartTime=raceStart;
            raceStarted=true;
          })
        )
      )
    ),400);

    // ── HELPERS ───────────────────────────────────────────────────────────────
    const _tmpV3=new THREE.Vector3();
    function closestTrackT(pos){
      let best=prevClosestT, bestD=Infinity;
      // Search around last known position
      const searchW=0.15;
      const steps=80;
      for(let i=0;i<steps;i++){
        const t=((prevClosestT-searchW+i*(searchW*2/steps))%1+1)%1;
        trackCurve.getPointAt(t,_tmpV3);
        const d=_tmpV3.distanceToSquared(pos);
        if(d<bestD){bestD=d;best=t;}
      }
      // Refine
      let lo=best-searchW/steps, hi=best+searchW/steps;
      for(let iter=0;iter<6;iter++){
        const mid=(lo+hi)/2;
        const t0=((mid)%1+1)%1, t1=((mid+0.001)%1+1)%1;
        trackCurve.getPointAt(t0,_tmpV3);const d0=_tmpV3.distanceTo(pos);
        trackCurve.getPointAt(t1,_tmpV3);const d1=_tmpV3.distanceTo(pos);
        if(d0<d1) hi=mid; else lo=mid;
      }
      return ((((lo+hi)/2)%1)+1)%1;
    }

    function getTrackRight(t){
      const ti=Math.floor(((t%1+1)%1)*N_STEPS)%N_STEPS;
      const tangent=frenetFrames.tangents[ti];
      const normal=frenetFrames.normals[ti];
      const up=new THREE.Vector3(0,1,0).lerp(normal,trackDef.bankAngle).normalize();
      return new THREE.Vector3().crossVectors(tangent,up).normalize();
    }

    // ── MAIN LOOP ─────────────────────────────────────────────────────────────
    let lastTs=0;

    function loop(ts){
      if(!_running){
        resObs.disconnect();
        window.removeEventListener('keydown',onKey);
        window.removeEventListener('keyup',onKey);
        return;
      }
      _raf=requestAnimationFrame(loop);
      const dt=Math.min((ts-lastTs)/1000,0.05);
      lastTs=ts;

      if(!finished){
        // ── PHYSICS ──────────────────────────────────────────────────────
        const boostActive=keys.boost&&boostCharge>0.03&&countdownDone;
        const canDrive=countdownDone;

        // Boost charge
        if(boostActive){
          boostCharge=Math.max(0,boostCharge-0.0045);
          if(!boostJustFired){
            boostJustFired=true;
            boostFlash.style.background='rgba(120,50,255,0.3)';
            setTimeout(()=>boostFlash.style.background='rgba(120,50,255,0)',150);
          }
        } else {
          boostJustFired=false;
          boostCharge=Math.min(1,boostCharge+0.0028);
        }

        if(canDrive){
          const baseMax=shipDef.maxSpd/10;
          const effMax=boostActive?baseMax*shipDef.boostMult:baseMax;
          const effAccel=shipDef.accel*(boostActive?1.7:1);

          // Steering
          const turnSpeed=shipDef.turnRate*(1+Math.abs(shipSpeed)*0.008)*(boostActive?0.78:1);
          if(keys.left) shipHeading+=turnSpeed*dt;
          if(keys.right) shipHeading-=turnSpeed*dt;

          // Acceleration
          if(keys.up){
            shipSpeed=Math.min(shipSpeed+effAccel*dt, effMax);
          } else if(keys.down){
            shipSpeed=Math.max(shipSpeed-effAccel*1.5*dt, -effMax*0.3);
          } else {
            shipSpeed*=Math.pow(shipDef.drag,dt*60);
            if(Math.abs(shipSpeed)<0.015) shipSpeed=0;
          }

          // Forward vector
          const fwdDir=new THREE.Vector3(Math.sin(shipHeading),0,Math.cos(shipHeading));
          const targetVel=fwdDir.clone().multiplyScalar(shipSpeed);

          // Grip blending
          const gripF=shipDef.grip;
          shipVel.lerp(targetVel,gripF*dt*9);

          // Track hover height
          const closestT=closestTrackT(shipPos);
          prevClosestT=closestT;
          const trackPt=new THREE.Vector3(); trackCurve.getPointAt(closestT,trackPt);
          const ti2=Math.floor(closestT*N_STEPS)%N_STEPS;
          const norm2=frenetFrames.normals[ti2];
          const desiredY=trackPt.y+1.25+Math.sin(hoverPhase)*0.14;
          shipPos.y+=(desiredY-shipPos.y)*Math.min(1,dt*9);

          // XZ movement
          shipPos.x+=shipVel.x*dt;
          shipPos.z+=shipVel.z*dt;

          // Wall collision
          if(wallHitCooldown>0) wallHitCooldown-=dt;

          const trackRight=getTrackRight(closestT);
          const lateralOff=new THREE.Vector3().subVectors(shipPos,trackPt).dot(trackRight);
          const hardWall=TRACK_W/2-0.5;

          if(Math.abs(lateralOff)>hardWall){
            if(wallHitCooldown<=0){
              const impactSpd=Math.abs(shipVel.dot(trackRight))*1.5;
              shield=Math.max(0,shield-impactSpd*2.5);
              // Reflect velocity
              const refl=shipVel.clone().reflect(trackRight.clone().multiplyScalar(Math.sign(lateralOff)));
              shipVel.copy(refl.multiplyScalar(0.3));
              shipSpeed*=0.38;
              camShake=Math.min(3,impactSpd*0.9);
              wallHitCooldown=0.35;
              dmgFlash.style.background='rgba(255,0,0,0.45)';
              setTimeout(()=>dmgFlash.style.background='rgba(255,0,0,0)',220);
              // Sparks burst
              for(let k=0;k<20;k++){
                spkParticles.push({
                  x:shipPos.x,y:shipPos.y,z:shipPos.z,
                  vx:(Math.random()-.5)*55, vy:Math.random()*40+15, vz:(Math.random()-.5)*55,
                  life:0.8, maxLife:0.8,
                });
              }
              if(shield<=0&&!finished){triggerCrash();return;}
            }
            // Push ship back
            const maxOff=(hardWall)*Math.sign(lateralOff);
            shipPos.x=trackPt.x+trackRight.x*maxOff;
            shipPos.z=trackPt.z+trackRight.z*maxOff;
          }

          // Boost pad pickup
          padMeshes.forEach(pad=>{
            const d=Math.hypot(shipPos.x-pad.userData.pt.x,shipPos.z-pad.userData.pt.z);
            if(d<TRACK_W*0.45){
              boostCharge=Math.min(1,boostCharge+0.07);
              camShake=0.5;
            }
          });

          // Checkpoint tracking
          gates.forEach((gate,gi)=>{
            const d=Math.hypot(shipPos.x-gate.pos.x,shipPos.z-gate.pos.z);
            if(d<TRACK_W*0.9&&!checkpointsPassed.has(gi)){
              checkpointsPassed.add(gi);
            }
          });

          // Lap detection
          const prevT=prevClosestT;
          if(raceStarted&&prevT>0.88&&closestT<0.12&&checkpointsPassed.size>=GATE_COUNT){
            checkpointsPassed.clear();
            const lapTime=Date.now()-lapStartTime;
            lapTimes.push(lapTime);
            lapStartTime=Date.now();
            lapCount++;
            document.getElementById('wo-lap').textContent=`${lapCount}/${TOTAL_LAPS}`;
            document.getElementById('wo-laptime').textContent=fmt(lapTime);
            camShake=1.5;
            if(lapCount>=TOTAL_LAPS){finished=true;finishRace(Date.now()-raceStart);return;}
          }

          // ── HUD UPDATE ────────────────────────────────────────────────
          if(raceStarted){
            document.getElementById('wo-time').textContent=fmt(Date.now()-raceStart);
          }
          const spd3=shipVel.length()*36;
          const spdPct=Math.round(Math.min(100,spd3/((shipDef.maxSpd*shipDef.boostMult)*36/10)*100));
          document.getElementById('wo-spd-bar').style.width=spdPct+'%';
          document.getElementById('wo-spd-val').textContent=Math.round(spd3);
          const bPct=Math.round(boostCharge*100);
          document.getElementById('wo-bst-bar').style.width=bPct+'%';
          document.getElementById('wo-bst-val').textContent=bPct;
          const sPct=Math.round(shield/shipDef.shield*100);
          document.getElementById('wo-shld-bar').style.width=Math.max(0,sPct)+'%';
          document.getElementById('wo-shld-val').textContent=Math.max(0,Math.round(shield));
          const shldEl=document.getElementById('wo-shld-bar');
          if(sPct<25) shldEl.style.background='linear-gradient(90deg,#ef4444,#f87171)';
          else if(sPct<55) shldEl.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
          else shldEl.style.background='linear-gradient(90deg,#10b981,#34d399)';

          // ── SHIP VISUALS ──────────────────────────────────────────────
          hoverPhase+=dt*3.5;
          shipGroup.position.copy(shipPos);

          const lookFwd=new THREE.Vector3(
            shipPos.x+Math.sin(shipHeading),
            shipPos.y,
            shipPos.z+Math.cos(shipHeading)
          );
          shipGroup.lookAt(lookFwd);
          shipGroup.rotateX(-Math.PI/2);

          const turnInput=(keys.right?1:0)-(keys.left?1:0);
          shipRoll+=((-turnInput*0.6)-shipRoll)*dt*7;
          shipPitch+=((keys.up?0.07:keys.down?-0.05:0)-shipPitch)*dt*6;
          shipGroup.rotateZ(shipRoll);
          shipGroup.rotateX(shipPitch);

          // Engine glow intensity
          const speedFactor=Math.min(1,Math.abs(shipSpeed)/(shipDef.maxSpd/10));
          const boostIntensity=boostActive?Math.min(1,shipSpeed/(shipDef.maxSpd/10)):0;

          engineGlows.forEach((g,i)=>{
            const hue=boostActive?0.75:0.54;
            g.material.color.setHSL(hue,1,0.3+boostIntensity*0.5);
            const sc=0.35+speedFactor*2.2+Math.sin(ts*0.02+i)*0.18;
            g.scale.set(sc,sc,0.5+speedFactor*2+boostIntensity*3);
            g.material.opacity=0.45+speedFactor*0.55;
          });

          engineLights.forEach((l,i)=>{
            l.color.setHSL(boostActive?0.75:0.54,1,0.5);
            l.intensity=5+speedFactor*10+boostIntensity*20;
          });

          hoverPods.forEach((p,i)=>{
            p.material.color.setHSL(0.54,1,0.3+Math.sin(hoverPhase*2+i)*0.25);
          });

          // Lights
          shipGlowLight.position.copy(shipPos);
          shipGlowLight.intensity=6+speedFactor*14;
          boostPointLight.position.copy(shipPos);
          boostPointLight.intensity=boostActive?boostCharge*28:0;
          underLight.position.copy(shipPos).add(new THREE.Vector3(0,-1.2,0));

          // ── EXHAUST PARTICLES ─────────────────────────────────────────
          const exOrig1=shipGroup.localToWorld(new THREE.Vector3(-BW*0.55,-BW*0.1,-BL*1.05));
          const exOrig2=shipGroup.localToWorld(new THREE.Vector3( BW*0.55,-BW*0.1,-BL*1.05));
          const exBackDir=shipGroup.localToWorld(new THREE.Vector3(0,0,-5)).sub(shipGroup.localToWorld(new THREE.Vector3())).normalize();

          if(exParticles.length<MAX_EX-4){
            [exOrig1,exOrig2].forEach(orig=>{
              const spd=50+speedFactor*120+boostIntensity*200;
              exParticles.push({
                x:orig.x+(Math.random()-.5)*0.3,
                y:orig.y+(Math.random()-.5)*0.2,
                z:orig.z,
                vx:exBackDir.x*spd+(Math.random()-.5)*10,
                vy:exBackDir.y*spd+(Math.random()-.1)*8,
                vz:exBackDir.z*spd+(Math.random()-.5)*10,
                life:0.3+speedFactor*0.35,
                maxLife:0.65,
                isBoost:boostActive,
              });
            });
          }

          if(boostActive&&trParticles.length<MAX_TR-4){
            [exOrig1,exOrig2].forEach(orig=>{
              trParticles.push({
                x:orig.x+(Math.random()-.5)*0.8,
                y:orig.y+(Math.random()-.5)*0.4,
                z:orig.z,
                vx:exBackDir.x*30+(Math.random()-.5)*25,
                vy:exBackDir.y*30+(Math.random()-.5)*18,
                vz:exBackDir.z*30+(Math.random()-.5)*25,
                life:0.55,
              });
            });
          }
        } // end canDrive

        // ── UPDATE PARTICLES ──────────────────────────────────────────────
        for(let i=exParticles.length-1;i>=0;i--){
          const p=exParticles[i];
          p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
          p.life-=dt;
          if(p.life<=0){exParticles.splice(i,1);continue;}
          const pi=Math.min(i,MAX_EX-1)*3;
          exPositions[pi]=p.x; exPositions[pi+1]=p.y; exPositions[pi+2]=p.z;
          const lf=p.life/p.maxLife;
          if(p.isBoost){
            exColors[pi]=0.55+lf*0.45; exColors[pi+1]=0.1*lf; exColors[pi+2]=1.0;
          } else {
            exColors[pi]=0+lf*0.1; exColors[pi+1]=0.8*lf+0.2; exColors[pi+2]=1.0;
          }
        }
        exGeo.attributes.position.needsUpdate=true;
        exGeo.attributes.color.needsUpdate=true;

        for(let i=trParticles.length-1;i>=0;i--){
          const p=trParticles[i];
          p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
          p.life-=dt;
          if(p.life<=0){trParticles.splice(i,1);continue;}
          const pi=Math.min(i,MAX_TR-1)*3;
          trPositions[pi]=p.x; trPositions[pi+1]=p.y; trPositions[pi+2]=p.z;
        }
        trGeo.attributes.position.needsUpdate=true;
        trMat.opacity=boostActive?0.75:0.1;
        trMat.size=1.0+(shipSpeed/(shipDef.maxSpd/10))*0.8;

        for(let i=spkParticles.length-1;i>=0;i--){
          const p=spkParticles[i];
          p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
          p.vy-=35*dt;
          p.life-=dt;
          if(p.life<=0){spkParticles.splice(i,1);continue;}
          const pi=Math.min(i,MAX_SPK-1)*3;
          spkPositions[pi]=p.x; spkPositions[pi+1]=p.y; spkPositions[pi+2]=p.z;
        }
        spkGeo.attributes.position.needsUpdate=true;
        spkMat.opacity=spkParticles.length>0?0.9:0;

        // Pad animation
        padMeshes.forEach((p,i)=>{
          const c=p.children[0];
          if(c&&c.material) c.material.emissiveIntensity=0.4+Math.sin(ts*0.005+i*1.3)*0.6;
          if(p.userData.light) p.userData.light.intensity=3+Math.sin(ts*0.007+i)*2;
        });

        // ── CAMERA ────────────────────────────────────────────────────────
        const speedFactor2=Math.min(1,Math.abs(shipSpeed)/(shipDef.maxSpd/10));
        const boostI2=boostActive?Math.min(1,shipSpeed/(shipDef.maxSpd/10)):0;

        const camDist=10+speedFactor2*3;
        const camHeight=3.8+speedFactor2*2.2;
        const camOffset=new THREE.Vector3(0,camHeight,-camDist);
        const camWorldPos=shipGroup.localToWorld(camOffset.clone());
        const camLookAt=shipGroup.localToWorld(new THREE.Vector3(0,0.5,12+speedFactor2*6));

        if(camShake>0){
          camShake=Math.max(0,camShake-dt*6);
          camWorldPos.x+=(Math.random()-.5)*camShake;
          camWorldPos.y+=(Math.random()-.5)*camShake*0.4;
          camWorldPos.z+=(Math.random()-.5)*camShake*0.4;
        }

        if(firstFrame){
          camPos.copy(camWorldPos);
          camLookTarget.copy(camLookAt);
          firstFrame=false;
        } else {
          camPos.lerp(camWorldPos,0.10);
          camLookTarget.lerp(camLookAt,0.13);
        }

        camera.position.copy(camPos);
        camera.lookAt(camLookTarget);
        camera.fov=70+speedFactor2*20+boostI2*10;
        camera.updateProjectionMatrix();

        scene.fog.density=trackDef.fogDensity+speedFactor2*0.004;
      } // end !finished

      renderer.render(scene,camera);
    }

    requestAnimationFrame(t=>{lastTs=t;loop(t);});

    // ── CRASH ─────────────────────────────────────────────────────────────────
    function triggerCrash(){
      finished=true;
      camShake=4;
      setTimeout(()=>{
        finDiv.style.display='flex';
        finDiv.innerHTML=`
          <div style="font-size:52px">💥</div>
          <div style="font-size:28px;font-weight:900;font-family:monospace;color:#ef4444;letter-spacing:-1px">ÉLIMINÉ</div>
          <div style="font-size:13px;color:rgba(255,255,255,.4);font-family:monospace">Bouclier détruit — brèche dans la coque</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:13px 24px;border-radius:10px;cursor:pointer;font-family:monospace">↺ RÉESSAYER</button>
            <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 18px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
          </div>`;
        finDiv.querySelector('#fin-retry').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
        finDiv.querySelector('#fin-menu').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
      },900);
    }

    // ── FINISH ────────────────────────────────────────────────────────────────
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
        <div style="font-size:52px">🏁</div>
        <div style="font-size:38px;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalTime)}</div>
        ${isRecord?'<div style="font-size:12px;color:#fbbf24;font-family:monospace;letter-spacing:3px">✦ NOUVEAU RECORD ✦</div>':''}
        <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:monospace">Meilleur tour: ${fmt(bestLap)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="fin-retry" style="background:linear-gradient(135deg,#00f5ff,#007fff);border:none;color:#000;font-weight:800;padding:13px 24px;border-radius:10px;cursor:pointer;font-family:monospace">↺ REJOUER</button>
          <button id="fin-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
        </div>`;
      finDiv.querySelector('#fin-retry').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
      finDiv.querySelector('#fin-menu').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
    }
  }

  window.YM_S['wipeout.sphere.js']={
    name:'WipeOut',icon:'🚀',category:'Games',
    description:'WipeOut v6 — graphismes entièrement refaits, physique réelle, guard-rails, 3 pistes, 3 vaisseaux',
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
