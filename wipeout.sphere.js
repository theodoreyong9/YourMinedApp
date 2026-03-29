/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-gravity racer (WipeOut-like) with Three.js
// Solo + accelerator pads + P2P leaderboard
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const SCORES_KEY='ym_wipeout_scores_v1';
function loadScores(){try{return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]');}catch(e){return[];}}
function saveScores(d){localStorage.setItem(SCORES_KEY,JSON.stringify(d.slice(0,20)));}

let _ctx=null,_gameEl=null,_running=false,_raf=null;

// ── PANEL ─────────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:-apple-system,sans-serif';
  container.innerHTML='';

  const TABS=[['race','🏁 Race'],['scores','🏆 Scores']];
  let tab='race';
  const track=document.createElement('div');track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  const tabs=document.createElement('div');tabs.className='ym-tabs';tabs.style.cssText='border-top:1px solid rgba(255,255,255,.1);margin:0;flex-shrink:0;background:#0a0a0a';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');t.className='ym-tab'+(id==='race'?' active':'');t.dataset.tab=id;t.textContent=label;
    t.style.cssText='color:'+(id==='race'?'#00f5ff':'rgba(255,255,255,.5)');
    t.addEventListener('click',()=>{
      tab=id;tabs.querySelectorAll('.ym-tab').forEach(x=>{x.classList.toggle('active',x.dataset.tab===id);x.style.color=x.dataset.tab===id?'#00f5ff':'rgba(255,255,255,.5)';});
      track.innerHTML='';
      if(id==='race')renderRace(track);else renderLeaderboard(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(track);container.appendChild(tabs);
  renderRace(track);
}

function renderLeaderboard(container){
  container.style.cssText='flex:1;overflow-y:auto;padding:16px;background:#000';
  container.innerHTML=`<div style="font-size:18px;font-weight:700;color:#00f5ff;margin-bottom:16px;text-shadow:0 0 20px #00f5ff">🏆 Leaderboard</div>`;
  const scores=loadScores().sort((a,b)=>b.time&&a.time?a.time-b.time:b.score-a.score);
  if(!scores.length){container.innerHTML+='<div style="color:rgba(255,255,255,.4);font-size:13px">No races yet. Hit the track!</div>';return;}
  scores.forEach((s,i)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)';
    const medal=['🥇','🥈','🥉'][i]||`#${i+1}`;
    row.innerHTML=`<span style="font-size:18px;width:28px">${medal}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">${s.name||'Racer'}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.4)">${new Date(s.ts).toLocaleDateString()}</div></div>
      <div style="text-align:right"><div style="font-size:14px;font-weight:700;color:#00f5ff">${s.time?_fmt(s.time):(s.score+' pts')}</div></div>`;
    container.appendChild(row);
  });
  // Scores réseau depuis YM_P2P
  const near=window.YM_Social?._nearUsers;
  if(near&&near.size){
    const netTitle=document.createElement('div');netTitle.style.cssText='font-size:12px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px';netTitle.textContent='Nearby Racers';container.appendChild(netTitle);
    near.forEach((u,uuid)=>{if(u.profile&&u.profile.wipeoutScore){
      const r=document.createElement('div');r.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(0,245,255,.04);border:1px solid rgba(0,245,255,.1);margin-bottom:6px';
      r.innerHTML=`<span style="font-size:20px">👤</span><div style="flex:1;font-size:12px;color:#fff">${u.profile.name||'Racer'}</div><div style="color:#00f5ff;font-size:12px">${_fmt(u.profile.wipeoutScore)}</div>`;
      container.appendChild(r);
    }});
  }
}

function _fmt(ms){if(!ms)return'—';const m=Math.floor(ms/60000);const s=((ms%60000)/1000).toFixed(2);return`${m}:${s.padStart(5,'0')}`;}

// ── GAME ──────────────────────────────────────────────────────────────────────
function renderRace(container){
  container.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;background:#000;position:relative';
  _gameEl=container;

  // Menu de départ
  const menu=document.createElement('div');
  menu.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;background:linear-gradient(to bottom,#000,#080828)';
  menu.innerHTML=`
    <div style="font-size:42px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px;margin-bottom:4px">WIPEOUT</div>
    <div style="font-size:12px;color:rgba(255,255,255,.4);letter-spacing:4px;margin-bottom:32px">ANTI-GRAVITY RACING</div>
    <div style="display:flex;flex-direction:column;gap:10px;width:200px">
      <button id="wo-start" style="background:linear-gradient(135deg,#00f5ff,#0080ff);border:none;color:#000;font-weight:700;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:1px">▶ RACE</button>
      <button id="wo-scores" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6);font-size:13px;padding:10px;border-radius:10px;cursor:pointer">🏆 Scores</button>
    </div>`;
  container.appendChild(menu);

  menu.querySelector('#wo-start').addEventListener('click',()=>{menu.remove();_startGame(container);});
  menu.querySelector('#wo-scores').addEventListener('click',()=>{
    const tabs=container.closest('.ym-panel-body')?.parentElement?.querySelector('.ym-tabs');
    if(tabs)tabs.querySelector('[data-tab="scores"]')?.click();
  });
}

function _startGame(container){
  if(_raf){cancelAnimationFrame(_raf);_raf=null;}
  _running=true;

  // Canvas
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%';
  container.appendChild(canvas);

  // HUD
  const hud=document.createElement('div');
  hud.style.cssText='position:absolute;top:0;left:0;right:0;padding:10px 16px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:5';
  hud.innerHTML=`
    <div style="font-size:11px;color:rgba(255,255,255,.5);letter-spacing:2px">SPEED</div>
    <div id="wo-timer" style="font-size:20px;font-weight:700;color:#00f5ff;font-variant-numeric:tabular-nums;text-shadow:0 0 10px #00f5ff">0:00.00</div>
    <div id="wo-boost" style="font-size:11px;color:rgba(255,255,255,.5)">BOOST</div>`;
  container.appendChild(hud);

  // Jauges
  const gauges=document.createElement('div');
  gauges.style.cssText='position:absolute;bottom:60px;left:16px;right:16px;pointer-events:none;z-index:5;display:flex;flex-direction:column;gap:4px';
  gauges.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:9px;color:rgba(255,255,255,.4);width:36px">SPEED</div>
      <div style="flex:1;height:3px;background:rgba(255,255,255,.1);border-radius:2px"><div id="wo-speedbar" style="height:100%;background:#00f5ff;width:0%;border-radius:2px;transition:width .1s"></div></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:9px;color:rgba(255,255,255,.4);width:36px">BOOST</div>
      <div style="flex:1;height:3px;background:rgba(255,255,255,.1);border-radius:2px"><div id="wo-boostbar" style="height:100%;background:#7B2FFF;width:100%;border-radius:2px;transition:width .1s"></div></div>
    </div>`;
  container.appendChild(gauges);

  // Contrôles touch
  const ctrlLeft=document.createElement('div');
  ctrlLeft.style.cssText='position:absolute;bottom:70px;left:0;width:50%;height:160px;z-index:5';
  const ctrlRight=document.createElement('div');
  ctrlRight.style.cssText='position:absolute;bottom:70px;right:0;width:50%;height:160px;z-index:5';
  const ctrlArrows=document.createElement('div');
  ctrlArrows.style.cssText='position:absolute;bottom:70px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:8px';
  ctrlArrows.innerHTML=`
    <button id="wo-left" style="width:52px;height:52px;border-radius:50%;background:rgba(0,245,255,.1);border:1px solid rgba(0,245,255,.3);color:#00f5ff;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent">◀</button>
    <button id="wo-right" style="width:52px;height:52px;border-radius:50%;background:rgba(0,245,255,.1);border:1px solid rgba(0,245,255,.3);color:#00f5ff;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent">▶</button>`;
  container.appendChild(ctrlLeft);container.appendChild(ctrlRight);container.appendChild(ctrlArrows);

  const finishOverlay=document.createElement('div');
  finishOverlay.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.85);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:20';
  container.appendChild(finishOverlay);

  // ── THREE.JS SETUP ────────────────────────────────────────────────────────
  function initThree(){
    const THREE=window.THREE;
    const W=canvas.offsetWidth||360,H=canvas.offsetHeight||500;
    canvas.width=W;canvas.height=H;

    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.2;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x000510,0.018);
    scene.background=new THREE.Color(0x000510);

    const camera=new THREE.PerspectiveCamera(75,W/H,0.1,500);
    camera.position.set(0,2.5,-5);camera.lookAt(0,0,10);

    // ── TRACK ──────────────────────────────────────────────────────────────
    // Génère un circuit en boucle avec des courbes
    const TRACK_POINTS=[];
    const LAPS=1;
    const numPts=32;
    for(let i=0;i<numPts;i++){
      const t=i/numPts*Math.PI*2;
      const r=80;
      const x=Math.sin(t)*r+(Math.sin(t*3)*15);
      const z=Math.cos(t)*r+(Math.cos(t*2)*20);
      const y=Math.sin(t*2)*4+Math.cos(t*3)*3;
      TRACK_POINTS.push(new THREE.Vector3(x,y,z));
    }
    const trackCurve=new THREE.CatmullRomCurve3(TRACK_POINTS,true,'catmullrom',0.4);
    const trackLen=trackCurve.getLength();

    // Surface de piste
    const trackW=12;
    const tubeGeo=new THREE.TubeGeometry(trackCurve,200,trackW/2,6,true);
    const trackMat=new THREE.MeshStandardMaterial({
      color:0x0a0a2e,roughness:0.3,metalness:0.8,
      emissive:0x000510,side:THREE.DoubleSide
    });
    scene.add(new THREE.Mesh(tubeGeo,trackMat));

    // Bordures lumineuses néon
    const edgeMat=new THREE.MeshBasicMaterial({color:0x00f5ff});
    [-1,1].forEach(side=>{
      const edgePts=[];
      for(let i=0;i<=200;i++){
        const t=i/200;
        const pt=new THREE.Vector3();const tan=new THREE.Vector3();const norm=new THREE.Vector3();
        trackCurve.getPointAt(t,pt);trackCurve.getTangentAt(t,tan);
        norm.crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
        edgePts.push(pt.clone().add(norm.multiplyScalar(side*(trackW/2-0.3))));
      }
      const edgeGeo=new THREE.BufferGeometry().setFromPoints(edgePts);
      scene.add(new THREE.Line(edgeGeo,edgeMat));
    });

    // ── ACCELERATOR PADS ──────────────────────────────────────────────────
    const PADS=[];
    const padPositions=[0.1,0.25,0.4,0.55,0.7,0.85];
    const padGeo=new THREE.BoxGeometry(8,0.15,3);
    const padMat=new THREE.MeshStandardMaterial({color:0x7B2FFF,emissive:0x3B0F8F,roughness:0.2,metalness:0.9});
    padPositions.forEach(t=>{
      const pt=new THREE.Vector3();const tan=new THREE.Vector3();
      trackCurve.getPointAt(t,pt);trackCurve.getTangentAt(t,tan);
      const pad=new THREE.Mesh(padGeo,padMat);
      pad.position.copy(pt);pad.position.y+=0.05;
      pad.lookAt(pt.clone().add(tan));
      pad.userData.t=t;
      scene.add(pad);PADS.push(pad);
    });

    // ── SHIP ──────────────────────────────────────────────────────────────
    const shipGroup=new THREE.Group();
    const hullGeo=new THREE.ConeGeometry(0.5,2.4,6);
    hullGeo.rotateX(Math.PI/2);
    const hullMat=new THREE.MeshStandardMaterial({color:0x00aaff,emissive:0x003366,metalness:0.9,roughness:0.1});
    const hull=new THREE.Mesh(hullGeo,hullMat);
    shipGroup.add(hull);
    // Wings
    [-1,1].forEach(s=>{
      const wGeo=new THREE.BoxGeometry(1.6,0.08,0.6);
      const wing=new THREE.Mesh(wGeo,hullMat);wing.position.set(s*0.9,0,0.1);shipGroup.add(wing);
    });
    // Engine glow
    const glowGeo=new THREE.SphereGeometry(0.25,8,8);
    const glowMat=new THREE.MeshBasicMaterial({color:0x00f5ff});
    const glow=new THREE.Mesh(glowGeo,glowMat);glow.position.set(0,0,-1.2);shipGroup.add(glow);
    scene.add(shipGroup);

    // ── ENVIRONMENT ───────────────────────────────────────────────────────
    // Étoiles
    const starsGeo=new THREE.BufferGeometry();
    const starVerts=new Float32Array(3000);
    for(let i=0;i<3000;i+=3){starVerts[i]=(Math.random()-.5)*600;starVerts[i+1]=(Math.random()-.5)*600;starVerts[i+2]=(Math.random()-.5)*600;}
    starsGeo.setAttribute('position',new THREE.BufferAttribute(starVerts,3));
    scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0xffffff,size:0.5,sizeAttenuation:true})));

    // Lumières
    scene.add(new THREE.AmbientLight(0x111133,2));
    const dirLight=new THREE.DirectionalLight(0x00aaff,3);dirLight.position.set(10,20,10);scene.add(dirLight);
    const ptLight=new THREE.PointLight(0x7B2FFF,4,40);scene.add(ptLight);

    // ── PHYSICS STATE ─────────────────────────────────────────────────────
    let trackT=0;      // position sur la piste [0..1]
    let speed=0.0003;  // vitesse en unités de t/frame
    const baseSpeed=0.0003;
    const maxSpeed=0.0014;
    let boost=1.0;     // jauge boost [0..1]
    let steer=0;       // direction [-1..1]
    let lapStart=Date.now();
    let lapTime=0;
    let finished=false;
    let lapCount=0;
    const totalLaps=LAPS;
    let bankAngle=0;
    let hoverY=0;

    // Contrôles
    const keys={left:false,right:false,boost:false};
    const onKey=e=>{const d=e.type==='keydown';if(e.key==='ArrowLeft'||e.key==='a')keys.left=d;if(e.key==='ArrowRight'||e.key==='d')keys.right=d;if(e.key===' ')keys.boost=d;};
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKey);

    ctrlLeft.addEventListener('touchstart',()=>keys.left=true,{passive:true});
    ctrlLeft.addEventListener('touchend',()=>keys.left=false,{passive:true});
    ctrlRight.addEventListener('touchstart',()=>keys.right=true,{passive:true});
    ctrlRight.addEventListener('touchend',()=>keys.right=false,{passive:true});
    ctrlArrows.querySelector('#wo-left').addEventListener('pointerdown',()=>keys.left=true);
    ctrlArrows.querySelector('#wo-left').addEventListener('pointerup',()=>keys.left=false);
    ctrlArrows.querySelector('#wo-right').addEventListener('pointerdown',()=>keys.right=true);
    ctrlArrows.querySelector('#wo-right').addEventListener('pointerup',()=>keys.right=false);

    let prevT=trackT;
    function loop(){
      if(!_running){renderer.dispose();window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKey);return;}
      _raf=requestAnimationFrame(loop);

      if(!finished){
        // Boost
        if(keys.left)steer=Math.max(-1,steer-0.08);
        else if(keys.right)steer=Math.min(1,steer+0.08);
        else steer*=0.88;

        // Vérifie accélérateur pads
        let onPad=false;
        PADS.forEach(pad=>{if(Math.abs(trackT-pad.userData.t)<0.008){onPad=true;}});
        if(onPad){boost=Math.min(1,boost+0.04);speed=Math.min(maxSpeed,speed*1.04);}
        else{boost=Math.max(0,boost-0.0015);}

        // Vitesse de base + accélération progressive
        const targetSpeed=baseSpeed*(1+boost*1.8);
        speed+=(targetSpeed-speed)*0.05;
        trackT=(trackT+speed)%1;

        // Détection fin de tour
        if(prevT>0.95&&trackT<0.05){
          lapCount++;
          if(lapCount>=totalLaps){
            finished=true;
            lapTime=Date.now()-lapStart;
            _finishRace(lapTime,finishOverlay,container,canvas,hud,gauges,ctrlArrows,ctrlLeft,ctrlRight);
          }
        }
        prevT=trackT;

        // HUD
        const elapsed=Date.now()-lapStart;
        hud.querySelector('#wo-timer').textContent=_fmt(elapsed);
        const speedPct=Math.min(100,speed/maxSpeed*100);
        document.getElementById('wo-speedbar')&&(document.getElementById('wo-speedbar').style.width=speedPct+'%');
        document.getElementById('wo-boostbar')&&(document.getElementById('wo-boostbar').style.width=(boost*100)+'%');
      }

      // Position ship sur la piste
      const shipPos=new THREE.Vector3();const shipTan=new THREE.Vector3();
      trackCurve.getPointAt(trackT,shipPos);trackCurve.getTangentAt(trackT,shipTan);
      const shipNorm=new THREE.Vector3();
      const up=new THREE.Vector3(0,1,0);
      shipNorm.crossVectors(up,shipTan).normalize();
      hoverY=Math.sin(Date.now()*0.003)*0.08;
      shipGroup.position.copy(shipPos).addScaledVector(shipNorm,steer*2).add(new THREE.Vector3(0,hoverY+0.8,0));
      shipGroup.lookAt(shipPos.clone().addScaledVector(shipTan,3));
      bankAngle+=((-steer*0.4)-bankAngle)*0.1;
      shipGroup.rotateZ(bankAngle);

      // Lumière moteur suit le vaisseau
      ptLight.position.copy(shipGroup.position);

      // Camera suit le vaisseau (légèrement en retard)
      const camTarget=shipPos.clone().addScaledVector(shipTan,-7).add(new THREE.Vector3(0,3,0));
      camera.position.lerp(camTarget,0.08);
      const lookTarget=shipPos.clone().addScaledVector(shipTan,6);
      camera.lookAt(lookTarget);

      // Glow moteur pulse
      glow.material.color.setHSL(0.55+boost*0.1,1,0.5+boost*0.3);
      glow.scale.setScalar(0.8+Math.sin(Date.now()*0.01)*0.2+boost*0.5);

      renderer.render(scene,camera);
    }

    loop();

    // Resize
    const obs=new ResizeObserver(()=>{
      const W2=canvas.offsetWidth,H2=canvas.offsetHeight;
      renderer.setSize(W2,H2);camera.aspect=W2/H2;camera.updateProjectionMatrix();
    });
    obs.observe(canvas);
    canvas._obs=obs;
  }

  // Charge Three.js si nécessaire
  if(window.THREE){initThree();}
  else{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload=initThree;document.head.appendChild(s);
  }
}

function _finishRace(lapTime,overlay,container,canvas,hud,gauges,arrows,ctrlL,ctrlR){
  _running=false;
  if(canvas._obs)canvas._obs.disconnect();
  const name=_ctx?.loadProfile?.()?.name||'Racer';
  const scores=loadScores();
  scores.push({name,time:lapTime,ts:Date.now()});
  scores.sort((a,b)=>a.time-b.time);
  saveScores(scores);
  // Broadcast score
  const best=scores[0];
  if(window.YM_P2P)try{window.YM_P2P.broadcast({sphere:'wipeout.sphere.js',type:'wo:score',data:{name,time:lapTime}});}catch(e){}

  overlay.style.display='flex';overlay.innerHTML=`
    <div style="font-size:36px;margin-bottom:8px">🏁</div>
    <div style="font-size:28px;font-weight:900;background:linear-gradient(135deg,#00f5ff,#7B2FFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px">FINISH</div>
    <div style="font-size:32px;font-weight:700;color:#00f5ff;margin-bottom:20px">${_fmt(lapTime)}</div>
    <div style="display:flex;flex-direction:column;gap:8px;width:180px">
      <button id="wo-retry" style="background:linear-gradient(135deg,#00f5ff,#0080ff);border:none;color:#000;font-weight:700;padding:12px;border-radius:10px;cursor:pointer;font-size:14px">↺ Race Again</button>
      <button id="wo-menu" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6);padding:10px;border-radius:10px;cursor:pointer;font-size:13px">⟵ Menu</button>
    </div>`;
  overlay.querySelector('#wo-retry').addEventListener('click',()=>{
    canvas.remove();hud.remove();gauges.remove();arrows.remove();ctrlL.remove();ctrlR.remove();overlay.remove();
    _startGame(container);
  });
  overlay.querySelector('#wo-menu').addEventListener('click',()=>{
    canvas.remove();hud.remove();gauges.remove();arrows.remove();ctrlL.remove();ctrlR.remove();overlay.remove();
    renderRace(container);
  });
}

// ── SPHERE ─────────────────────────────────────────────────────────────────────
window.YM_S['wipeout.sphere.js']={
  name:'WipeOut',icon:'🚀',category:'Games',
  description:'Anti-gravity racer — accelerator pads, P2P leaderboard',
  emit:[],receive:[],
  activate(ctx){_ctx=ctx;},
  deactivate(){_running=false;if(_raf){cancelAnimationFrame(_raf);_raf=null;}},
  renderPanel,
  profileSection(container){
    const scores=loadScores();if(!scores.length)return;
    const best=scores[0];
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#080828);border:1px solid rgba(0,245,255,.2);border-radius:12px;padding:10px';
    el.innerHTML=`<span style="font-size:24px">🚀</span>
      <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#00f5ff">WipeOut Best</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5)">${best.name||'—'}</div></div>
      <div style="font-size:16px;font-weight:700;color:#00f5ff">${_fmt(best.time)}</div>`;
    container.appendChild(el);
  },
  broadcastData(){
    const scores=loadScores();if(!scores.length)return{};
    return{wipeoutScore:scores[0]?.time||0};
  }
};
})();

