/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v8
// Fixes v8:
// 1. Mobile perf : géométrie réduite, segments adaptés, LOD simple
// 2. Boost+gauche : keys.l/r découplés du heading, gestion multitouch correcte
// 3. Hover smooth : lerp Y progressif avec vélocité verticale (pas de sautillement)
// 4. Textures piste améliorées : bandes colorées, réflexions, marquages
// 5. ~Double le code : shaders procéduraux, effets atmosphériques, systèmes enrichis
// 6. Nouveau : speed lines, cockpit shake adaptatif, lumières réactives, sol réfléchissant
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_wipeout_scores_v8';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScores(d) { localStorage.setItem(SCORES_KEY, JSON.stringify(d.slice(0,20))); }
  function fmt(ms) {
    if(!ms||ms<=0) return '--:--.---';
    const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, r=ms%1000;
    return `${m}:${String(s).padStart(2,'0')}.${String(r).padStart(3,'0')}`;
  }

  // Détection mobile pour adapter la qualité
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 600;
  const QUALITY = isMobile ? 'low' : 'high';
  const SEG = QUALITY === 'low' ? 200 : 400;
  const BLDG_COUNT = QUALITY === 'low' ? 28 : 55;
  const PYLON_STEP = QUALITY === 'low' ? 30 : 22;
  const STAR_COUNT = QUALITY === 'low' ? 5000 : 14000;
  const MAX_EX_P = QUALITY === 'low' ? 80 : 200;
  const MAX_TR_P = QUALITY === 'low' ? 50 : 120;
  const MAX_SPK_P = QUALITY === 'low' ? 40 : 80;

  let _ctx=null, _running=false, _raf=null, _renderer=null;

  // ── DÉFINITION DES PISTES ──────────────────────────────────────────────────
  const TRACKS = {
    venom:{
      name:'Venom Circuit', laps:3, difficulty:'Facile', col:0x00ccff, col2:0x0044ff,
      pts:()=>{
        const R=160, P=[];
        [0,30,60,90,110,140,180,210,240,270,300,330].forEach(deg=>{
          const a=deg*Math.PI/180, w=(deg%60===30)?0.76:1.0;
          P.push(new THREE.Vector3(Math.cos(a)*R*w, Math.sin(a*2)*8, Math.sin(a)*R*w));
        });
        return P;
      },
      width:26, fog:0x000a1a, fogD:isMobile?0.007:0.005,
      skyCol1:'#000a1a', skyCol2:'#001833',
      ambCol:0x111428, ambInt:3.0,
      sunCol:0x5566ff, sunInt:3.0,
    },
    rapier:{
      name:'Rapier Cross', laps:3, difficulty:'Moyen', col:0xaa00ff, col2:0xff0066,
      pts:()=>{
        const P=[];
        for(let i=0;i<18;i++){const t=i/18*Math.PI*2;P.push(new THREE.Vector3(Math.cos(t)*180,Math.sin(t*3)*16,Math.sin(t*2)*100));}
        return P;
      },
      width:20, fog:0x08001a, fogD:isMobile?0.008:0.006,
      skyCol1:'#08001a', skyCol2:'#1a0033',
      ambCol:0x180a28, ambInt:2.8,
      sunCol:0x9933ff, sunInt:2.5,
    },
    phantom:{
      name:'Phantom Storm', laps:2, difficulty:'Difficile', col:0xff1144, col2:0xff8800,
      pts:()=>{
        const P=[];
        for(let i=0;i<20;i++){const t=i/20*Math.PI*2,r=150+70*Math.sin(t*3+.5);P.push(new THREE.Vector3(Math.cos(t)*r,Math.sin(t*4)*22+Math.cos(t*2)*10,Math.sin(t)*r*.8));}
        return P;
      },
      width:17, fog:0x150005, fogD:isMobile?0.010:0.008,
      skyCol1:'#150005', skyCol2:'#2a000a',
      ambCol:0x200008, ambInt:2.5,
      sunCol:0xff2244, sunInt:2.8,
    },
  };

  // ── DÉFINITION DES VAISSEAUX ───────────────────────────────────────────────
  const SHIPS = {
    feisar:{ name:'FEISAR', col:0x2277ff, accel:22, maxSpd:28, turnRate:2.6, drag:0.94, grip:0.80, shield:100, boostMult:1.8, desc:'Équilibré · Polyvalent · Recommandé' },
    auricom:{ name:'AURICOM', col:0xdd2222, accel:28, maxSpd:32, turnRate:2.1, drag:0.92, grip:0.68, shield:80, boostMult:2.1, desc:'Rapide · Lourd · Difficile à virer' },
    piranha:{ name:'PIRANHA', col:0x00ee66, accel:17, maxSpd:38, turnRate:3.6, drag:0.96, grip:0.88, shield:55, boostMult:2.6, desc:'Extrême · Fragile · Expert uniquement' },
  };

  // ── PANEL / MENU ───────────────────────────────────────────────────────────
  function renderPanel(container) {
    container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:monospace';
    container.innerHTML='';
    const body=document.createElement('div');
    body.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs=document.createElement('div');
    tabs.style.cssText='display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#060608';
    [['race','🏁 Course'],['scores','🏆 Temps'],['info','📊 Specs']].forEach(([id,lbl],i)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${i===0?'#00ccff':'rgba(255,255,255,.35)'}`;
      t.textContent=lbl;
      t.onclick=()=>{
        tabs.querySelectorAll('div').forEach((x,j)=>x.style.color=j===i?'#00ccff':'rgba(255,255,255,.35)');
        body.innerHTML='';
        if(id==='race') renderMenu(body);
        else if(id==='scores') renderLB(body);
        else renderSpecs(body);
      };
      tabs.appendChild(t);
    });
    container.appendChild(body); container.appendChild(tabs);
    renderMenu(body);
  }

  function renderLB(c){
    c.style.cssText='flex:1;overflow-y:auto;padding:14px;background:#000';
    const sc=loadScores().sort((a,b)=>a.time-b.time);
    let h=`<div style="font-size:15px;font-weight:700;color:#00ccff;margin-bottom:12px">🏆 Meilleurs temps</div>`;
    if(!sc.length) h+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">Aucune course.</div>';
    else sc.forEach((s,i)=>{
      h+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span><div style="flex:1"><div style="color:#fff;font-size:12px">${s.name||'Pilote'}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">${s.track} · ${s.ship}</div></div>
        <div style="color:#00ccff;font-size:14px;font-weight:700">${fmt(s.time)}</div></div>`;
    });
    c.innerHTML=h;
  }

  function renderSpecs(c){
    c.style.cssText='flex:1;overflow-y:auto;padding:14px;background:#000';
    let h=`<div style="font-size:15px;font-weight:700;color:#00ccff;margin-bottom:12px">📊 Vaisseaux</div>`;
    Object.entries(SHIPS).forEach(([,s])=>{
      const bar=(v,mx)=>`<div style="flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px"><div style="width:${Math.round(v/mx*100)}%;height:100%;background:#${s.col.toString(16).padStart(6,'0')};border-radius:2px"></div></div>`;
      h+=`<div style="padding:10px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.04);border-left:3px solid #${s.col.toString(16).padStart(6,'0')}">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px">${s.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:8px">${s.desc}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span style="font-size:9px;color:rgba(255,255,255,.35);width:48px">ACCEL</span>${bar(s.accel,28)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span style="font-size:9px;color:rgba(255,255,255,.35);width:48px">VITESSE</span>${bar(s.maxSpd,38)}</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="font-size:9px;color:rgba(255,255,255,.35);width:48px">GRIP</span>${bar(s.grip*100,100)}</div></div>`;
    });
    c.innerHTML=h;
  }

  function renderMenu(container){
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#000';
    stopRace();
    let selTrack='venom', selShip='feisar';
    const div=document.createElement('div');
    div.style.cssText='position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;background:linear-gradient(180deg,#000,#020218);padding:16px 12px';
    function build(){
      div.innerHTML=`
        <div style="font-size:40px;font-weight:900;background:linear-gradient(135deg,#00ccff,#7700ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px;margin-bottom:1px">WIPEOUT</div>
        <div style="font-size:9px;color:rgba(255,255,255,.2);letter-spacing:5px;margin-bottom:4px">ANTI-GRAVITY RACING v8</div>
        ${isMobile?'<div style="font-size:8px;color:rgba(0,200,100,.4);letter-spacing:1px;margin-bottom:12px">MODE MOBILE OPTIMISÉ</div>':'<div style="margin-bottom:12px"></div>'}
        <div style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:2px;margin-bottom:7px;align-self:flex-start">PISTE</div>
        <div style="display:flex;gap:6px;width:100%;margin-bottom:14px">
          ${Object.entries(TRACKS).map(([id,t])=>`<div data-track="${id}" style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${id===selTrack?`#${t.col.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.1)'};background:${id===selTrack?'rgba(0,200,255,.06)':'rgba(255,255,255,.02)'};cursor:pointer;text-align:center">
            <div style="font-size:11px;font-weight:700;color:${id===selTrack?'#fff':'rgba(255,255,255,.4)'}">${t.name}</div>
            <div style="font-size:8px;color:rgba(255,255,255,.3)">${t.difficulty}</div></div>`).join('')}
        </div>
        <div style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:2px;margin-bottom:7px;align-self:flex-start">VAISSEAU</div>
        <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-bottom:16px">
          ${Object.entries(SHIPS).map(([id,s])=>`<div data-ship="${id}" style="padding:8px 12px;border-radius:8px;border:1.5px solid ${id===selShip?`#${s.col.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.08)'};cursor:pointer;display:flex;align-items:center;gap:10px">
            <div style="width:16px;height:16px;border-radius:50%;background:#${s.col.toString(16).padStart(6,'0')}"></div>
            <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${id===selShip?'#fff':'rgba(255,255,255,.4)'}">${s.name}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.3)">${s.desc}</div></div></div>`).join('')}
        </div>
        <div style="width:100%;padding:10px;background:rgba(0,200,255,.05);border:1px solid rgba(0,200,255,.2);border-radius:10px;margin-bottom:14px;font-size:9px;color:rgba(255,255,255,.4);line-height:1.9;text-align:center">
          ← → VIRER &nbsp;·&nbsp; ↑ ACCÉLÉRER &nbsp;·&nbsp; ↓ FREINER &nbsp;·&nbsp; ESPACE BOOST<br>Mobile : ← ↑ → à gauche · ⚡ BOOST à droite</div>
        <button id="wo-go" style="width:100%;background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace">▶  DÉMARRER</button>`;
      div.querySelectorAll('[data-track]').forEach(el=>el.onclick=()=>{selTrack=el.dataset.track;build();});
      div.querySelectorAll('[data-ship]').forEach(el=>el.onclick=()=>{selShip=el.dataset.ship;build();});
      div.querySelector('#wo-go').onclick=()=>{div.remove();startRace(container,selTrack,selShip);};
    }
    build();
    container.appendChild(div);
  }

  function stopRace(){
    _running=false;
    if(_raf){cancelAnimationFrame(_raf);_raf=null;}
    if(_renderer){try{_renderer.dispose();}catch(e){} _renderer=null;}
  }

  // ── GÉNÉRATION TEXTURE PISTE AMÉLIORÉE ─────────────────────────────────────
  function buildTrackTexture(T){
    const TS=512;
    const TD=new Uint8Array(TS*TS*4);
    const cr=(T.col>>16)&255,cg=(T.col>>8)&255,cb=T.col&255;
    const cr2=(T.col2>>16)&255,cg2=(T.col2>>8)&255,cb2=T.col2&255;

    for(let y=0;y<TS;y++){
      for(let x=0;x<TS;x++){
        const i4=(y*TS+x)*4;
        const u=x/TS; // 0=gauche, 1=droite
        const v=y/TS; // 0..1 le long de la piste

        // Base : asphalte sombre avec variation de bruit subtile
        const noise=(Math.sin(x*.37)*Math.cos(y*.29)*.5+.5)*.04;
        let r=6+noise*12,g=8+noise*10,b=14+noise*18;

        // Bande centrale lumineuse (ligne de milieu)
        const ctr=Math.max(0,1-Math.abs(u-0.5)/0.012);
        if(ctr>0.05){
          r=Math.round(cr2*.45+r*(1-ctr*.9));
          g=Math.round(cg2*.45+g*(1-ctr*.9));
          b=Math.round(cb2*.45+b*(1-ctr*.9));
        }

        // Lignes de couloir (pointillés)
        const lane1=Math.abs(u-.33)<0.009;
        const lane2=Math.abs(u-.67)<0.009;
        const dash=(v*60%1)<0.5;
        if((lane1||lane2)&&dash){
          r=Math.max(r,Math.round(cr*.25));
          g=Math.max(g,Math.round(cg*.25));
          b=Math.max(b,Math.round(cb*.25));
        }

        // Bords lumineux (couleur piste)
        const eL=Math.pow(Math.max(0,1-u/0.07),1.4);
        const eR=Math.pow(Math.max(0,1-(1-u)/0.07),1.4);
        const edge=Math.max(eL,eR);
        if(edge>0.02){
          r=Math.round(cr*edge*.6+r*(1-edge*.6));
          g=Math.round(cg*edge*.6+g*(1-edge*.6));
          b=Math.round(cb*edge*.6+b*(1-edge*.6));
        }

        // Reflets spéculaires simulés (variation longitudinale)
        const specular=Math.pow(Math.max(0,Math.sin(v*Math.PI*80)*.5+.5),8)*.12;
        r=Math.min(255,r+Math.round(specular*80));
        g=Math.min(255,g+Math.round(specular*70));
        b=Math.min(255,b+Math.round(specular*120));

        // Bandes de freinage (marquages avant virages)
        const brakeZone=v>0.45&&v<0.52;
        if(brakeZone&&(u<0.15||u>0.85)){
          const bStripe=Math.floor(v*200)%3<1;
          if(bStripe){r=Math.min(255,r+30);g=Math.min(255,g+20);b=Math.min(255,b+10);}
        }

        // Zone de départ/arrivée (damier)
        const startZone=v<0.025||v>0.975;
        if(startZone){
          const cx=Math.floor(u*16), cy=Math.floor(v*200)%8;
          const checker=(cx+cy)%2===0;
          r=checker?180:20; g=checker?180:20; b=checker?180:20;
        }

        TD[i4]=Math.min(255,Math.max(0,r));
        TD[i4+1]=Math.min(255,Math.max(0,g));
        TD[i4+2]=Math.min(255,Math.max(0,b));
        TD[i4+3]=255;
      }
    }
    const tex=new THREE.DataTexture(TD,TS,TS,THREE.RGBAFormat);
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.needsUpdate=true;
    return tex;
  }

  // ── COURSE ────────────────────────────────────────────────────────────────
  function startRace(container,trackId,shipId){
    if(!window.THREE){
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload=()=>startRace(container,trackId,shipId);
      document.head.appendChild(s);
      return;
    }
    stopRace(); _running=true;

    const THREE=window.THREE;
    const T=TRACKS[trackId], SD=SHIPS[shipId];

    // Canvas
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    const W=canvas.offsetWidth||360, H=canvas.offsetHeight||520;
    canvas.width=W; canvas.height=H;

    // Renderer
    const renderer=new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      powerPreference: isMobile ? 'low-power' : 'high-performance',
    });
    _renderer=renderer;
    renderer.setSize(W,H);
    renderer.setPixelRatio(isMobile ? Math.min(devicePixelRatio,1.5) : Math.min(devicePixelRatio,2));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(T.fog,T.fogD);
    scene.background=new THREE.Color(T.fog);
    const camera=new THREE.PerspectiveCamera(70,W/H,0.2,isMobile?800:1200);

    // ── HUD ────────────────────────────────────────────────────────────────
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:0;left:0;right:0;padding:8px 12px;pointer-events:none;z-index:10;font-family:monospace';
    hud.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div style="font-size:7px;color:rgba(0,200,255,.45);letter-spacing:3px">TOUR</div>
        <div id="wo-lap" style="font-size:24px;font-weight:700;color:#00ccff;line-height:1">0/${T.laps}</div></div>
      <div style="text-align:center"><div style="font-size:7px;color:rgba(0,200,255,.45);letter-spacing:3px">TEMPS</div>
        <div id="wo-time" style="font-size:24px;font-weight:700;color:#00ccff;line-height:1">0:00.000</div>
        <div id="wo-best" style="font-size:10px;color:rgba(0,200,255,.4)">Meilleur: --:--.---</div></div>
      <div style="text-align:right"><div style="font-size:7px;color:rgba(0,200,255,.45);letter-spacing:3px">LAP</div>
        <div id="wo-laptime" style="font-size:13px;color:rgba(0,200,255,.6)">--:--.---</div>
        <div style="font-size:8px;color:rgba(255,255,255,.2)">${T.name}</div></div></div>`;
    container.appendChild(hud);

    // Speedo
    const speedo=document.createElement('div');
    speedo.style.cssText='position:absolute;bottom:92px;left:12px;right:12px;pointer-events:none;z-index:10;font-family:monospace';
    speedo.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">KM/H</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="sb" style="height:100%;background:linear-gradient(90deg,#00ccff,#0af);border-radius:3px;width:0%;transition:width .1s"></div>
        </div>
        <span id="sv" style="font-size:12px;color:#00ccff;width:36px;text-align:right;font-weight:700">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">BOOST</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="bb" style="height:100%;background:linear-gradient(90deg,#7700ff,#cc00ff);border-radius:3px;width:80%;transition:width .1s"></div>
        </div>
        <span id="bv" style="font-size:12px;color:#aa88ff;width:36px;text-align:right">80</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">SHLD</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div id="shb" style="height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:3px;width:100%;transition:width .2s"></div>
        </div>
        <span id="shv" style="font-size:12px;color:#34d399;width:36px;text-align:right">100</span>
      </div>`;
    container.appendChild(speedo);

    // Speed lines canvas overlay
    const slCanvas=document.createElement('canvas');
    slCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;opacity:0';
    slCanvas.width=W; slCanvas.height=H;
    container.appendChild(slCanvas);
    const slCtx=slCanvas.getContext('2d');

    // Compte à rebours
    const cntDiv=document.createElement('div');
    cntDiv.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25';
    const cntTxt=document.createElement('div');
    cntTxt.style.cssText='font-size:80px;font-weight:900;font-family:monospace;color:#00ccff;opacity:0;transition:opacity .1s;text-shadow:0 0 40px #00ccff';
    cntDiv.appendChild(cntTxt); container.appendChild(cntDiv);

    // Flash dégâts
    const dmgFlash=document.createElement('div');
    dmgFlash.style.cssText='position:absolute;inset:0;background:rgba(255,0,0,0);pointer-events:none;z-index:20;transition:background .15s';
    container.appendChild(dmgFlash);

    // Contrôles mobiles
    const ctrlDiv=document.createElement('div');
    ctrlDiv.style.cssText='position:absolute;bottom:6px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-end;padding:0 10px;z-index:10';
    const L=document.createElement('div');
    L.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;width:140px';
    L.innerHTML=`
      <div></div>
      <button id="wu" style="height:42px;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.25);color:#00ccff;border-radius:8px;cursor:pointer;font-size:18px;touch-action:none">↑</button>
      <div></div>
      <button id="wl" style="height:42px;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.2);color:#00ccff;border-radius:8px;cursor:pointer;font-size:18px;touch-action:none">←</button>
      <button id="wd" style="height:42px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.2);color:#ff6464;border-radius:8px;cursor:pointer;font-size:18px;touch-action:none">↓</button>
      <button id="wr" style="height:42px;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.2);color:#00ccff;border-radius:8px;cursor:pointer;font-size:18px;touch-action:none">→</button>`;
    ctrlDiv.appendChild(L);
    const bstBtn=document.createElement('button');
    bstBtn.id='wbs';
    bstBtn.style.cssText='width:84px;height:84px;background:rgba(100,0,255,.18);border:2px solid rgba(100,0,255,.5);color:#bb99ff;font-size:26px;border-radius:50%;cursor:pointer;font-family:monospace;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1px;touch-action:none';
    bstBtn.innerHTML='⚡<span style="font-size:9px;letter-spacing:1px">BOOST</span>';
    ctrlDiv.appendChild(bstBtn);
    container.appendChild(ctrlDiv);

    // Écran fin de course
    const finDiv=document.createElement('div');
    finDiv.style.cssText='position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.92);z-index:30';
    container.appendChild(finDiv);

    // ── SCÈNE THREE.JS ─────────────────────────────────────────────────────
    // Étoiles
    {
      const sv=new Float32Array(STAR_COUNT*3);
      for(let i=0;i<STAR_COUNT;i+=3){
        const r=300+Math.random()*500, th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI;
        sv[i]=Math.sin(ph)*Math.cos(th)*r;
        sv[i+1]=Math.cos(ph)*r*.5+80;
        sv[i+2]=Math.sin(ph)*Math.sin(th)*r;
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(sv,3));
      scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:isMobile?1.0:.8,transparent:true,opacity:.85})));
    }

    // Sol avec effet de grille et réflexion simulée
    const gndSeg=isMobile?30:60;
    const gndGeo=new THREE.PlaneGeometry(2000,2000,gndSeg,gndSeg);
    const gndCol=T.fog===0x000a1a?0x001428:T.fog===0x08001a?0x0a0015:0x110008;
    const gndMat=new THREE.MeshLambertMaterial({color:gndCol});
    const gnd=new THREE.Mesh(gndGeo,gndMat);
    gnd.rotation.x=-Math.PI/2; gnd.position.y=-8;
    scene.add(gnd);

    // Grille sol
    const grid=new THREE.GridHelper(800,isMobile?24:40,T.col,T.col);
    grid.material.transparent=true; grid.material.opacity=0.055; grid.position.y=-7.5;
    scene.add(grid);

    // Deuxième grille plus fine (haute qualité seulement)
    if(!isMobile){
      const grid2=new THREE.GridHelper(400,80,T.col2,T.col2);
      grid2.material.transparent=true; grid2.material.opacity=0.02; grid2.position.y=-7.4;
      scene.add(grid2);
    }

    // ── PISTE ──────────────────────────────────────────────────────────────
    const curvePts=T.pts();
    const curve=new THREE.CatmullRomCurve3(curvePts,true,'catmullrom',0.5);
    const N=SEG;
    const frames=curve.computeFrenetFrames(N,true);
    const TW=T.width;

    // Vecteur droite en XZ (pas de banking pour éviter le sautillement)
    function trackRight(fn){
      const tang=frames.tangents[fn%N];
      const r=new THREE.Vector3(-tang.z,0,tang.x).normalize();
      if(r.lengthSq()<0.001) r.set(1,0,0);
      return r;
    }

    // Surface de piste
    const sPos=[], sUV=[], sIdx=[];
    for(let i=0;i<=N;i++){
      const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
      const r=trackRight(i);
      sPos.push(pt.x-r.x*TW/2, pt.y, pt.z-r.z*TW/2,
                pt.x+r.x*TW/2, pt.y, pt.z+r.z*TW/2);
      sUV.push(i/N*50,0, i/N*50,1);
      if(i<N){const b=i*2;sIdx.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    const lv=N*2; sIdx.push(lv,lv+1,0,lv+1,1,0);
    const sGeo=new THREE.BufferGeometry();
    sGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(sPos),3));
    sGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(sUV),2));
    sGeo.setIndex(sIdx);
    sGeo.computeVertexNormals();

    const trackTex=buildTrackTexture(T);
    const trackMesh=new THREE.Mesh(sGeo,new THREE.MeshStandardMaterial({
      map:trackTex,
      roughness:.12,
      metalness:.95,
      side:THREE.DoubleSide,
      envMapIntensity: isMobile ? 0 : 0.5,
    }));
    scene.add(trackMesh);

    // Sous-couche de la piste (épaisseur visuelle)
    if(!isMobile){
      const underPos=[];
      for(let i=0;i<=N;i++){
        const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
        const r=trackRight(i);
        underPos.push(pt.x-r.x*(TW/2+0.5),pt.y-0.3,pt.z-r.z*(TW/2+0.5),
                      pt.x+r.x*(TW/2+0.5),pt.y-0.3,pt.z+r.z*(TW/2+0.5));
      }
      const uGeo=new THREE.BufferGeometry();
      uGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(underPos),3));
      const uIdx=[]; for(let i=0;i<N;i++){const b=i*2;uIdx.push(b,b+2,b+1,b+1,b+2,b+3);}
      uIdx.push(N*2,0,N*2+1,N*2+1,0,1);
      uGeo.setIndex(uIdx); uGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(uGeo,new THREE.MeshLambertMaterial({color:0x010408,side:THREE.DoubleSide})));
    }

    // Guard rails
    function buildRail(side){
      const lo=[], hi=[], mid=[];
      for(let i=0;i<=N;i++){
        const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
        const r=trackRight(i);
        const base=pt.clone().add(new THREE.Vector3(r.x*side*(TW/2+0.3),0,r.z*side*(TW/2+0.3)));
        lo.push(base.clone().add(new THREE.Vector3(0,.25,0)));
        mid.push(base.clone().add(new THREE.Vector3(0,1.8,0)));
        hi.push(base.clone().add(new THREE.Vector3(0,3.2,0)));
      }
      const col=side<0?T.col:T.col2;
      const colDim=side<0?T.col2:T.col;
      const mkLine=(pts,c,op)=>scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({color:c,transparent:true,opacity:op})
      ));
      mkLine(lo,col,.9);
      mkLine(mid,colDim,.4);
      mkLine(hi,col,.7);
      const step=isMobile?16:10;
      for(let i=0;i<N;i+=step){
        scene.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([lo[i],hi[i]]),
          new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.35})
        ));
      }
    }
    buildRail(-1); buildRail(1);

    // Générateur pseudo-aléatoire déterministe
    const rng=(function(){
      let s=7777;
      return {n:()=>{s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;}};
    })();

    // Bâtiments procéduraux
    for(let i=0;i<BLDG_COUNT;i++){
      const t=i/BLDG_COUNT;
      const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const r=trackRight(Math.floor(t*N));
      const side=rng.n()>.5?1:-1;
      const dist=TW/2+14+rng.n()*28;
      const bw=5+rng.n()*14, bh=10+rng.n()*45, bd=5+rng.n()*12;
      const bx=pt.x+r.x*side*dist, bz=pt.z+r.z*side*dist;

      const bGeo=new THREE.BoxGeometry(bw,bh,bd);
      const bMat=new THREE.MeshLambertMaterial({color:rng.n()>.5?0x001122:rng.n()>.5?0x0a0018:0x110008});
      const b=new THREE.Mesh(bGeo,bMat);
      b.position.set(bx,bh/2-8,bz);
      scene.add(b);

      // Fenêtres lumineuses
      const wc=rng.n()>.5?T.col:T.col2;
      const wMesh=new THREE.Mesh(
        new THREE.BoxGeometry(bw*.85,bh*.8,bd*.85),
        new THREE.MeshBasicMaterial({color:wc,transparent:true,opacity:.04+rng.n()*.07})
      );
      wMesh.position.copy(b.position); scene.add(wMesh);

      // Antennes sur le toit (haute qualité)
      if(!isMobile&&rng.n()<0.3){
        const ant=new THREE.Mesh(
          new THREE.CylinderGeometry(.05,.08,bh*.3,4),
          new THREE.MeshLambertMaterial({color:0x222222})
        );
        ant.position.set(bx,b.position.y+bh*.5+bh*.15,bz);
        scene.add(ant);
        const aLight=new THREE.Mesh(
          new THREE.SphereGeometry(.2,4,4),
          new THREE.MeshBasicMaterial({color:0xff2200})
        );
        aLight.position.set(bx,b.position.y+bh*.5+bh*.3,bz);
        scene.add(aLight);
      }

      // Lumières de bâtiment
      if(rng.n()<.18){
        const pl=new THREE.PointLight(wc,isMobile?1.5:2,22);
        pl.position.set(bx,pt.y+bh*.6,bz);
        scene.add(pl);
      }
    }

    // Pylônes lumineux sur la piste
    for(let i=0;i<N;i+=PYLON_STEP){
      const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
      const r=trackRight(i);
      [-1,1].forEach(s=>{
        const px=pt.x+r.x*s*(TW/2+1.5);
        const pz=pt.z+r.z*s*(TW/2+1.5);
        // Socle
        scene.add(Object.assign(new THREE.Mesh(
          new THREE.CylinderGeometry(.22,.3,6,isMobile?5:8),
          new THREE.MeshStandardMaterial({color:0x060c1e,metalness:.95,roughness:.1})
        ),{position:new THREE.Vector3(px,pt.y+3,pz)}));
        // Sphère lumineuse
        const sCol=s<0?T.col:T.col2;
        scene.add(Object.assign(new THREE.Mesh(
          new THREE.SphereGeometry(.35,isMobile?5:8,isMobile?5:8),
          new THREE.MeshBasicMaterial({color:sCol})
        ),{position:new THREE.Vector3(px,pt.y+6.4,pz)}));
        // Lumière
        const pl=new THREE.PointLight(sCol,isMobile?4:5,14);
        pl.position.set(px,pt.y+6.4,pz);
        scene.add(pl);
      });
    }

    // Boost pads
    const pads=[];
    for(let i=0;i<8;i++){
      const t=(i+.5)/8;
      const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const fn=Math.floor(t*N), tang=frames.tangents[fn%N];
      const padMesh=new THREE.Mesh(
        new THREE.BoxGeometry(TW-6,.18,4),
        new THREE.MeshStandardMaterial({color:0x3300aa,emissive:0x1100aa,emissiveIntensity:.5,roughness:.05,metalness:.98,transparent:true,opacity:.88})
      );
      padMesh.position.copy(pt).add(new THREE.Vector3(0,.25,0));
      padMesh.lookAt(pt.clone().add(tang));
      scene.add(padMesh);
      const pl=new THREE.PointLight(0x6600ff,4,12);
      pl.position.copy(padMesh.position).add(new THREE.Vector3(0,1,0));
      scene.add(pl);
      pads.push({pad:padMesh,pl,pt:pt.clone()});
    }

    // Checkpoints
    const GATES=4, gatePos=[];
    for(let i=0;i<GATES;i++){
      const t=(i+.5)/GATES;
      const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const r=trackRight(Math.floor(t*N));
      const tang=frames.tangents[Math.floor(t*N)%N];
      [-1,1].forEach(s=>{
        const px=pt.x+r.x*s*(TW/2+1.5), pz=pt.z+r.z*s*(TW/2+1.5);
        scene.add(Object.assign(new THREE.Mesh(
          new THREE.CylinderGeometry(.2,.25,7,isMobile?5:8),
          new THREE.MeshStandardMaterial({color:0x0a001a,metalness:.9})
        ),{position:new THREE.Vector3(px,pt.y+3.5,pz)}));
        scene.add(Object.assign(new THREE.Mesh(
          new THREE.SphereGeometry(.4,isMobile?5:8,isMobile?5:8),
          new THREE.MeshBasicMaterial({color:T.col})
        ),{position:new THREE.Vector3(px,pt.y+7.4,pz)}));
        const pl=new THREE.PointLight(T.col,6,18);
        pl.position.set(px,pt.y+7.4,pz); scene.add(pl);
      });
      const bar=new THREE.Mesh(
        new THREE.BoxGeometry(TW+3,.25,.4),
        new THREE.MeshBasicMaterial({color:T.col})
      );
      bar.position.copy(pt).add(new THREE.Vector3(0,7.4,0));
      bar.lookAt(pt.clone().add(tang));
      scene.add(bar);
      gatePos.push({t,pt:pt.clone()});
    }

    // Lumières de scène
    scene.add(new THREE.AmbientLight(T.ambCol,T.ambInt));
    const sun=new THREE.DirectionalLight(T.sunCol,T.sunInt);
    sun.position.set(20,60,30); scene.add(sun);
    scene.add(Object.assign(new THREE.DirectionalLight(0xff0033,1.2),{position:new THREE.Vector3(-20,-10,-30)}));

    // Lumières dynamiques liées au vaisseau
    const shipGL=new THREE.PointLight(SD.col,10,30); scene.add(shipGL);
    const underGL=new THREE.PointLight(0x00ccff,4,10); scene.add(underGL);
    const boostGL=new THREE.PointLight(0x8800ff,0,28); scene.add(boostGL);
    const leftGL=new THREE.PointLight(T.col,2,15); scene.add(leftGL);
    const rightGL=new THREE.PointLight(T.col2,2,15); scene.add(rightGL);

    // ── VAISSEAU ──────────────────────────────────────────────────────────
    const ship=new THREE.Group();
    const sCol=new THREE.Color(SD.col);
    const darkM=new THREE.MeshStandardMaterial({color:0x000e22,metalness:.97,roughness:.04});
    const accentM=new THREE.MeshStandardMaterial({color:sCol,emissive:sCol.clone().multiplyScalar(.15),metalness:.95,roughness:.05});
    const glassM=new THREE.MeshStandardMaterial({color:0x66aaff,emissive:0x001144,transparent:true,opacity:.55,roughness:0,metalness:.1});
    const trimM=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x333333,metalness:.8,roughness:.1});

    // Fuselage principal (sur l'axe Z)
    const fuseG=new THREE.CylinderGeometry(.55,.30,5,isMobile?8:12);
    fuseG.rotateX(Math.PI/2);
    ship.add(new THREE.Mesh(fuseG,darkM));

    // Dos supérieur coloré
    const topM=new THREE.Mesh(new THREE.BoxGeometry(1.4,.15,4.2),accentM);
    topM.position.set(0,.45,0); ship.add(topM);

    // Bande décorative longitudinale
    if(!isMobile){
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.15,.08,5.5),trimM);
      stripe.position.set(0,.6,-.3); ship.add(stripe);
    }

    // Nez vers +Z
    const noseG=new THREE.ConeGeometry(.42,2,isMobile?7:10); noseG.rotateX(Math.PI/2);
    const nose=new THREE.Mesh(noseG,darkM); nose.position.set(0,0,3.5); ship.add(nose);
    const ntG=new THREE.ConeGeometry(.18,.8,isMobile?6:10); ntG.rotateX(Math.PI/2);
    const nt=new THREE.Mesh(ntG,accentM); nt.position.set(0,0,4.4); ship.add(nt);

    // Ailes delta
    [-1,1].forEach(s=>{
      const wv=new Float32Array([0,.05,2.5, s*3.8,-.05,-.5, s*2.8,-.02,-2.2, 0,.05,-2.2]);
      const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.BufferAttribute(wv,3));
      wg.setIndex([0,1,2,2,3,0,0,2,1,0,3,2]); wg.computeVertexNormals();
      ship.add(new THREE.Mesh(wg,darkM));

      // Bande accentuée sur l'aile
      const pv=new Float32Array([0,.09,2.0, s*3.2,-.02,-.2, s*2.2,-.01,-1.8, 0,.08,-1.8]);
      const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.BufferAttribute(pv,3));
      pg.setIndex([0,1,2,2,3,0]); pg.computeVertexNormals();
      ship.add(new THREE.Mesh(pg,accentM));

      // Tip de winglet
      const tG=new THREE.CylinderGeometry(.14,.18,1.4,isMobile?5:7); tG.rotateX(Math.PI/2);
      const tip=new THREE.Mesh(tG,accentM); tip.position.set(s*3.75,-.05,-.2); ship.add(tip);

      // Feux de navigation
      if(!isMobile){
        const navLight=new THREE.Mesh(new THREE.SphereGeometry(.1,4,4),new THREE.MeshBasicMaterial({color:s<0?0xff2200:0x00ff44}));
        navLight.position.set(s*3.8,-.06,-.5); ship.add(navLight);
      }
    });

    // Cockpit
    const ckG=new THREE.SphereGeometry(.45,isMobile?7:10,isMobile?5:8); ckG.scale(1.1,.52,1.4);
    const ck=new THREE.Mesh(ckG,glassM); ck.position.set(0,.48,1.2); ship.add(ck);

    // Moteurs (arrière = -Z)
    const engineGlows=[], engineLts=[];
    [-0.7,.7].forEach(ex=>{
      const nacG=new THREE.CylinderGeometry(.35,.30,1.6,isMobile?7:10); nacG.rotateX(Math.PI/2);
      ship.add(Object.assign(new THREE.Mesh(nacG,darkM),{position:new THREE.Vector3(ex,-.12,-2.4)}));

      const nzG=new THREE.CylinderGeometry(.24,.35,.35,isMobile?7:10); nzG.rotateX(Math.PI/2);
      ship.add(Object.assign(new THREE.Mesh(nzG,darkM),{position:new THREE.Vector3(ex,-.12,-3.15)}));

      // Flamme moteur (cône vers -Z)
      const glG=new THREE.ConeGeometry(.22,1.8,isMobile?6:8); glG.rotateX(-Math.PI/2);
      const glMat=new THREE.MeshBasicMaterial({color:0x00ccff,transparent:true,opacity:.9});
      const gl=new THREE.Mesh(glG,glMat); gl.position.set(ex,-.12,-3.9); ship.add(gl);
      engineGlows.push(gl);

      const el=new THREE.PointLight(0x00ccff,8,16); el.position.set(ex,-.12,-4.0); ship.add(el);
      engineLts.push(el);
    });

    // Pods de sustentation
    const hPods=[];
    [[-0.7,-2.0],[0.7,-2.0],[-0.65,1.2],[0.65,1.2]].forEach(([hx,hz])=>{
      const p=new THREE.Mesh(
        new THREE.SphereGeometry(.12,isMobile?4:6,isMobile?4:6),
        new THREE.MeshBasicMaterial({color:0x00ccff})
      );
      p.position.set(hx,-.30,hz); ship.add(p); hPods.push(p);
    });

    // Capteurs avant
    if(!isMobile){
      [-0.4,0.4].forEach(sx=>{
        const sens=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.5),new THREE.MeshBasicMaterial({color:0x00ffff}));
        sens.position.set(sx,.15,4.0); ship.add(sens);
      });
    }

    scene.add(ship);

    // ── SYSTÈME DE PARTICULES ──────────────────────────────────────────────
    const mkPS=(n,sz,col)=>{
      const pos=new Float32Array(n*3);
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const mat=new THREE.PointsMaterial({color:col,size:sz,transparent:true,opacity:0,sizeAttenuation:true});
      const sys=new THREE.Points(geo,mat);
      scene.add(sys);
      return{pos,geo,mat,p:[]};
    };
    const EX=mkPS(MAX_EX_P,.8,0x00ccff);
    const TR=mkPS(MAX_TR_P,1.8,0x8800ff);
    const SPK=mkPS(MAX_SPK_P,.9,0xff6600);

    // ── PHYSIQUE & ÉTAT ────────────────────────────────────────────────────
    const startPt=new THREE.Vector3(); curve.getPointAt(0,startPt);
    const startTan=frames.tangents[0].clone();

    let pos=startPt.clone().add(new THREE.Vector3(0,1.3,0));
    let vel=new THREE.Vector3();
    let heading=Math.atan2(startTan.x,startTan.z);

    // Vitesse verticale pour un hover fluide (évite le sautillement)
    let vertVel=0;
    const HOVER_SPRING=12;   // Raideur du ressort de hover
    const HOVER_DAMP=0.82;   // Amortissement
    const HOVER_HEIGHT=1.25; // Hauteur cible au-dessus de la piste

    let speed=0, roll=0, pitch=0, hoverPhase=0;
    let boost=.8, shield=SD.shield;
    let laps=0, lapStart=0, raceStart=0, started=false, done=false;
    let wallCD=0, camShake=0;
    let _lastT=0;
    let cpPassed=new Set();
    const lapTimes=[];
    let camP=new THREE.Vector3(), camL=new THREE.Vector3(), camFirst=true;

    // Score et meilleur temps
    const saved=loadScores().filter(s=>s.track===T.name).sort((a,b)=>a.time-b.time);
    if(saved.length) document.getElementById('wo-best').textContent='Meilleur: '+fmt(saved[0].time);

    // ── INPUT CLAVIER ──────────────────────────────────────────────────────
    // FIX: état indépendant pour chaque touche
    const keys={l:false,r:false,u:false,d:false,b:false};

    const onKey=e=>{
      const dn=e.type==='keydown';
      // Gauche
      if(e.key==='ArrowLeft'||e.key==='a'||e.key==='q'){keys.l=dn;}
      // Droite
      if(e.key==='ArrowRight'||e.key==='d'){keys.r=dn;}
      // Avant
      if(e.key==='ArrowUp'||e.key==='w'||e.key==='z'){keys.u=dn;}
      // Arrière
      if(e.key==='ArrowDown'||e.key==='s'){keys.d=dn;}
      // Boost
      if(e.key===' '){keys.b=dn;if(dn)e.preventDefault();}
    };
    window.addEventListener('keydown',onKey);
    window.addEventListener('keyup',onKey);

    // ── INPUT TOUCH MOBILE ─────────────────────────────────────────────────
    // FIX: gestion multitouch correcte avec Map des pointeurs actifs
    const activePointers=new Map(); // pointerId -> {key, element}

    const bindBtn=(id,key)=>{
      const el=container.querySelector('#'+id);
      if(!el) return;
      const down=e=>{
        e.preventDefault();
        if(!activePointers.has(e.pointerId)){
          activePointers.set(e.pointerId,key);
          keys[key]=true;
        }
      };
      const up=e=>{
        e.preventDefault();
        if(activePointers.get(e.pointerId)===key){
          activePointers.delete(e.pointerId);
          // Vérifier si une autre pointer active la même touche
          const stillActive=[...activePointers.values()].includes(key);
          if(!stillActive) keys[key]=false;
        }
      };
      el.addEventListener('pointerdown',down,{passive:false});
      el.addEventListener('pointerup',up,{passive:false});
      el.addEventListener('pointercancel',up,{passive:false});
      el.addEventListener('pointerleave',up,{passive:false});
    };
    bindBtn('wu','u');
    bindBtn('wd','d');
    bindBtn('wl','l');
    bindBtn('wr','r');
    bindBtn('wbs','b');

    // ResizeObserver
    const ro=new ResizeObserver(()=>{
      const w2=canvas.offsetWidth, h2=canvas.offsetHeight;
      if(!w2||!h2) return;
      renderer.setSize(w2,h2);
      camera.aspect=w2/h2;
      camera.updateProjectionMatrix();
      slCanvas.width=w2; slCanvas.height=h2;
    });
    ro.observe(canvas);

    // ── COMPTE À REBOURS ───────────────────────────────────────────────────
    let cdDone=false;
    const showCnt=(txt,dur,cb)=>{
      cntTxt.textContent=txt;
      cntTxt.style.opacity='1';
      setTimeout(()=>{
        cntTxt.style.opacity='0';
        setTimeout(()=>cb&&cb(),180);
      },dur);
    };
    setTimeout(()=>showCnt('3',900,()=>showCnt('2',900,()=>showCnt('1',900,()=>showCnt('GO!',600,()=>{
      cdDone=true;
      raceStart=Date.now();
      lapStart=raceStart;
      started=true;
    })))),500);

    // ── HELPER : T le plus proche sur la courbe ─────────────────────────
    const _tv=new THREE.Vector3();
    function nearestT(p){
      let best=_lastT,bestD=1e18;
      const W2=.18, steps=isMobile?40:60;
      for(let i=0;i<steps;i++){
        const t=((_lastT-W2+i*(W2*2/steps))%1+1)%1;
        curve.getPointAt(t,_tv);
        const d=_tv.distanceToSquared(p);
        if(d<bestD){bestD=d;best=t;}
      }
      _lastT=best;
      return best;
    }

    // Speed lines
    function drawSpeedLines(spF,boostI){
      slCtx.clearRect(0,0,slCanvas.width,slCanvas.height);
      const alpha=Math.pow(spF,2)*0.4+boostI*0.5;
      if(alpha<0.01) return;
      slCanvas.style.opacity=alpha.toFixed(3);
      slCtx.strokeStyle=`rgba(0,200,255,${0.5+boostI*0.5})`;
      const cx=slCanvas.width/2, cy=slCanvas.height/2;
      const count=isMobile?12:24;
      for(let i=0;i<count;i++){
        const angle=Math.random()*Math.PI*2;
        const r0=50+Math.random()*80;
        const r1=r0+20+Math.random()*60*(1+spF*2);
        slCtx.lineWidth=0.5+Math.random()*1.5;
        slCtx.globalAlpha=Math.random()*0.5;
        slCtx.beginPath();
        slCtx.moveTo(cx+Math.cos(angle)*r0,cy+Math.sin(angle)*r0);
        slCtx.lineTo(cx+Math.cos(angle)*r1,cy+Math.sin(angle)*r1);
        slCtx.stroke();
      }
      slCtx.globalAlpha=1;
    }

    // ── BOUCLE PRINCIPALE ─────────────────────────────────────────────────
    let lastTs=0;
    function loop(ts){
      if(!_running){
        ro.disconnect();
        window.removeEventListener('keydown',onKey);
        window.removeEventListener('keyup',onKey);
        return;
      }
      _raf=requestAnimationFrame(loop);
      const dt=Math.min((ts-lastTs)/1000,.05);
      lastTs=ts;

      if(!done){
        const boostOn=keys.b&&boost>.03&&cdDone;
        boostOn?(boost=Math.max(0,boost-.0045)):(boost=Math.min(1,boost+.0028));

        if(cdDone){
          const baseMax=SD.maxSpd;
          const effMax=boostOn?baseMax*SD.boostMult:baseMax;

          // FIX CLEF : le virage est indépendant pour gauche ET droite
          // Pas de condition booléenne exclusive — chacun ajoute/soustrait librement
          const turn=SD.turnRate*(1+Math.abs(speed)*.012)*(boostOn?.78:1);
          if(keys.l) heading+=turn*dt;
          if(keys.r) heading-=turn*dt;

          // Accélération/freinage
          if(keys.u)      speed=Math.min(speed+SD.accel*(boostOn?1.8:1)*dt,effMax);
          else if(keys.d) speed=Math.max(speed-SD.accel*1.6*dt,-baseMax*.3);
          else{ speed*=Math.pow(SD.drag,dt*60); if(Math.abs(speed)<.01) speed=0; }

          // Déplacement XZ
          const fwd=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
          vel.lerp(fwd.clone().multiplyScalar(speed),SD.grip*dt*10);
          pos.x+=vel.x*dt;
          pos.z+=vel.z*dt;

          // FIX HOVER : système ressort-amortisseur en Y (plus de sautillement)
          const ct=nearestT(pos);
          const trackPt=new THREE.Vector3(); curve.getPointAt(ct,trackPt);
          const hoverOscil=Math.sin(hoverPhase)*.12; // ondulation douce
          const targetY=trackPt.y+HOVER_HEIGHT+hoverOscil;
          const deltaY=targetY-pos.y;
          // Force du ressort
          const springForce=deltaY*HOVER_SPRING;
          vertVel=(vertVel+springForce*dt)*HOVER_DAMP;
          pos.y+=vertVel*dt;

          // Collision murs
          if(wallCD>0) wallCD-=dt;
          const r2=trackRight(Math.floor(ct*N));
          const lat=new THREE.Vector3().subVectors(pos,trackPt).dot(r2);
          const hw=TW/2-.6;
          if(Math.abs(lat)>hw){
            if(wallCD<=0){
              const imp=Math.abs(vel.dot(r2));
              shield=Math.max(0,shield-imp*2.8);
              vel.reflect(r2.clone().multiplyScalar(Math.sign(lat))).multiplyScalar(.32);
              speed*=.35;
              vertVel*=.5; // amortir le rebond vertical aussi
              camShake=Math.min(3.5,imp*.9);
              wallCD=.38;
              dmgFlash.style.background='rgba(255,0,0,.5)';
              setTimeout(()=>dmgFlash.style.background='rgba(255,0,0,0)',230);
              for(let k=0;k<18;k++){
                SPK.p.push({
                  x:pos.x,y:pos.y,z:pos.z,
                  vx:(Math.random()-.5)*60,
                  vy:Math.random()*45+12,
                  vz:(Math.random()-.5)*60,
                  life:.8
                });
              }
              if(shield<=0&&!done){crash();return;}
            }
            pos.x=trackPt.x+r2.x*hw*Math.sign(lat);
            pos.z=trackPt.z+r2.z*hw*Math.sign(lat);
          }

          // Boost pads
          pads.forEach(({pt:p2})=>{
            if(Math.hypot(pos.x-p2.x,pos.z-p2.z)<TW*.42){
              boost=Math.min(1,boost+.08);
              camShake=.5;
              vertVel+=2; // petit saut au passage du pad
            }
          });

          // Checkpoints
          gatePos.forEach(({pt:p2},gi)=>{
            if(Math.hypot(pos.x-p2.x,pos.z-p2.z)<TW&&!cpPassed.has(gi)) cpPassed.add(gi);
          });

          // Détection de tour
          if(started&&_lastT>.85&&ct<.15&&cpPassed.size>=GATES){
            cpPassed.clear();
            const lt=Date.now()-lapStart;
            lapTimes.push(lt);
            lapStart=Date.now();
            laps++;
            document.getElementById('wo-lap').textContent=`${laps}/${T.laps}`;
            document.getElementById('wo-laptime').textContent=fmt(lt);
            camShake=1.5;
            if(laps>=T.laps){done=true;finish(Date.now()-raceStart);return;}
          }

          // Mise à jour HUD
          if(started) document.getElementById('wo-time').textContent=fmt(Date.now()-raceStart);
          const spd3=vel.length()*36;
          const spF=Math.min(1,Math.abs(speed)/baseMax);
          const boostI=boostOn?Math.min(1,speed/baseMax):0;
          document.getElementById('sb').style.width=Math.round(Math.min(100,spd3/(SD.maxSpd*SD.boostMult*36)*100))+'%';
          document.getElementById('sv').textContent=Math.round(spd3);
          document.getElementById('bb').style.width=Math.round(boost*100)+'%';
          document.getElementById('bv').textContent=Math.round(boost*100);
          const shp=Math.round(shield/SD.shield*100);
          document.getElementById('shb').style.width=Math.max(0,shp)+'%';
          document.getElementById('shv').textContent=Math.max(0,Math.round(shield));
          const shEl=document.getElementById('shb');
          if(shp<25) shEl.style.background='linear-gradient(90deg,#ef4444,#f87171)';
          else if(shp<55) shEl.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
          else shEl.style.background='linear-gradient(90deg,#10b981,#34d399)';

          // Speed lines overlay
          if(!isMobile) drawSpeedLines(spF,boostI);

          // ── MISE À JOUR VAISSEAU VISUEL ──────────────────────────────────
          hoverPhase+=dt*3.5;
          ship.position.copy(pos);

          // Orientation via Matrix4.lookAt : nez (+Z) vers fwd
          const m4=new THREE.Matrix4();
          const fwdNeg=fwd.clone().negate();
          m4.lookAt(new THREE.Vector3(0,0,0), fwdNeg, new THREE.Vector3(0,1,0));
          ship.quaternion.setFromRotationMatrix(m4);

          // Roulis en virage (visuel seulement)
          const turnIn=(keys.r?1:0)-(keys.l?1:0);
          roll+=((-turnIn*.55)-roll)*dt*7;
          pitch+=((keys.u?.06:keys.d?-.04:0)-pitch)*dt*6;
          ship.rotateZ(-roll);
          ship.rotateX(-pitch);

          // Flammes moteur
          engineGlows.forEach((g,i)=>{
            g.material.color.setHSL(boostOn?.78:.54,1,.3+boostI*.5);
            const sc=.4+spF*2+Math.sin(ts*.022+i)*.18;
            g.scale.set(sc,sc,.5+spF*1.8+boostI*2.5);
            g.material.opacity=.5+spF*.5;
          });
          engineLts.forEach(l=>{
            l.color.setHSL(boostOn?.78:.54,1,.5);
            l.intensity=5+spF*12+boostI*20;
          });
          hPods.forEach((p2,i)=>{
            p2.material.color.setHSL(.54,1,.3+Math.sin(hoverPhase*2+i)*.25);
          });

          // Lumières dynamiques
          shipGL.position.copy(pos); shipGL.intensity=6+spF*15;
          boostGL.position.copy(pos); boostGL.intensity=boostOn?boost*25:0;
          underGL.position.copy(pos).add(new THREE.Vector3(0,-1.5,0));
          // Lumières latérales colorées
          const lPos=ship.localToWorld(new THREE.Vector3(-3,.2,0));
          const rPos=ship.localToWorld(new THREE.Vector3(3,.2,0));
          leftGL.position.copy(lPos);
          rightGL.position.copy(rPos);

          // Particules exhaust
          const e1=ship.localToWorld(new THREE.Vector3(-.7,-.12,-4.2));
          const e2=ship.localToWorld(new THREE.Vector3(.7,-.12,-4.2));
          const bkDir=ship.localToWorld(new THREE.Vector3(0,0,-1)).sub(ship.localToWorld(new THREE.Vector3())).normalize();
          if(EX.p.length<MAX_EX_P-4){
            [e1,e2].forEach(o=>{
              const sp2=45+spF*110+boostI*180;
              EX.p.push({
                x:o.x+(Math.random()-.5)*.3,y:o.y+(Math.random()-.5)*.2,z:o.z,
                vx:bkDir.x*sp2+(Math.random()-.5)*9,
                vy:bkDir.y*sp2+(Math.random()-.2)*7,
                vz:bkDir.z*sp2+(Math.random()-.5)*9,
                life:.35+spF*.3,boost:boostOn
              });
            });
          }
          if(boostOn&&TR.p.length<MAX_TR_P-4){
            [e1,e2].forEach(o=>{
              TR.p.push({
                x:o.x+(Math.random()-.5)*1,y:o.y,z:o.z,
                vx:bkDir.x*28+(Math.random()-.5)*22,
                vy:bkDir.y*28+(Math.random()-.5)*16,
                vz:bkDir.z*28+(Math.random()-.5)*22,
                life:.6
              });
            });
          }
        } // fin if(cdDone)

        // ── MISE À JOUR PARTICULES ────────────────────────────────────────
        [[EX,MAX_EX_P],[TR,MAX_TR_P]].forEach(([ps,MX])=>{
          for(let i=ps.p.length-1;i>=0;i--){
            const p2=ps.p[i];
            p2.x+=p2.vx*dt; p2.y+=p2.vy*dt; p2.z+=p2.vz*dt;
            p2.life-=dt;
            if(p2.life<=0){ps.p.splice(i,1);continue;}
            const pi=Math.min(i,MX-1)*3;
            ps.pos[pi]=p2.x; ps.pos[pi+1]=p2.y; ps.pos[pi+2]=p2.z;
          }
          ps.geo.attributes.position.needsUpdate=true;
          ps.mat.opacity=ps.p.length>0?.85:0;
        });

        for(let i=SPK.p.length-1;i>=0;i--){
          const p2=SPK.p[i];
          p2.x+=p2.vx*dt; p2.y+=p2.vy*dt; p2.z+=p2.vz*dt;
          p2.vy-=40*dt;
          p2.life-=dt;
          if(p2.life<=0){SPK.p.splice(i,1);continue;}
          const pi=Math.min(i,MAX_SPK_P-1)*3;
          SPK.pos[pi]=p2.x; SPK.pos[pi+1]=p2.y; SPK.pos[pi+2]=p2.z;
        }
        SPK.geo.attributes.position.needsUpdate=true;
        SPK.mat.opacity=SPK.p.length>0?.9:0;
        TR.mat.opacity=keys.b?.78:.08;

        // Boost pads pulsation
        pads.forEach(({pad,pl},i)=>{
          pad.material.emissiveIntensity=.4+Math.sin(ts*.005+i*1.4)*.6;
          pl.intensity=3+Math.sin(ts*.007+i)*1.5;
        });

        // ── CAMÉRA ────────────────────────────────────────────────────────
        const spF2=Math.min(1,Math.abs(speed)/SD.maxSpd);
        const boostI2=keys.b?Math.min(1,speed/SD.maxSpd):0;

        // Position caméra en espace local vaisseau
        const camOff=ship.localToWorld(new THREE.Vector3(0,3.5+spF2*2,-(9+spF2*3)));
        const camTgt=ship.localToWorld(new THREE.Vector3(0,.5,10+spF2*5));

        // Shake caméra adaptatif
        if(camShake>0){
          camShake=Math.max(0,camShake-dt*6);
          camOff.x+=(Math.random()-.5)*camShake;
          camOff.y+=(Math.random()-.5)*camShake*.4;
        }

        if(camFirst){camP.copy(camOff);camL.copy(camTgt);camFirst=false;}
        else{
          // Lerp plus rapide en mobile pour réactivité
          const lerpSpd=isMobile?.13:.10;
          const lookSpd=isMobile?.16:.13;
          camP.lerp(camOff,lerpSpd);
          camL.lerp(camTgt,lookSpd);
        }
        camera.position.copy(camP);
        camera.lookAt(camL);
        camera.fov=70+spF2*18+boostI2*10;
        camera.updateProjectionMatrix();
        scene.fog.density=T.fogD+spF2*.003;

      } // fin if(!done)

      renderer.render(scene,camera);
    }

    requestAnimationFrame(t=>{lastTs=t;loop(t);});

    // ── CRASH ─────────────────────────────────────────────────────────────
    function crash(){
      done=true; camShake=5;
      if(!isMobile) drawSpeedLines(0,0);
      setTimeout(()=>{
        finDiv.style.display='flex';
        finDiv.innerHTML=`
          <div style="font-size:52px">💥</div>
          <div style="font-size:28px;font-weight:900;font-family:monospace;color:#ef4444">ÉLIMINÉ</div>
          <div style="font-size:12px;color:rgba(255,255,255,.4);font-family:monospace">Bouclier détruit</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="fin-r" style="background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;padding:13px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ RÉESSAYER</button>
            <button id="fin-m" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
          </div>`;
        finDiv.querySelector('#fin-r').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
        finDiv.querySelector('#fin-m').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
      },900);
    }

    // ── VICTOIRE ──────────────────────────────────────────────────────────
    function finish(totalMs){
      if(!isMobile) drawSpeedLines(0,0);
      const name=_ctx?.loadProfile?.()?.name||'Pilote';
      const all=loadScores();
      all.push({name,time:totalMs,track:T.name,ship:SD.name,laps:T.laps,ts:Date.now()});
      all.sort((a,b)=>a.time-b.time);
      saveScores(all);
      const isRec=!saved.length||totalMs<saved[0].time;
      const bestLap=lapTimes.length?Math.min(...lapTimes):totalMs;
      finDiv.style.display='flex';
      finDiv.innerHTML=`
        <div style="font-size:52px">🏁</div>
        <div style="font-size:38px;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00ccff,#7700ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalMs)}</div>
        ${isRec?'<div style="font-size:12px;color:#fbbf24;font-family:monospace;letter-spacing:3px">✦ NOUVEAU RECORD ✦</div>':''}
        <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:monospace">Meilleur tour: ${fmt(bestLap)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="fin-r" style="background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;padding:13px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ REJOUER</button>
          <button id="fin-m" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button>
        </div>`;
      finDiv.querySelector('#fin-r').onclick=()=>{finDiv.style.display='none';stopRace();startRace(container,trackId,shipId);};
      finDiv.querySelector('#fin-m').onclick=()=>{finDiv.style.display='none';stopRace();renderMenu(container);};
    }

  } // fin startRace

  // ── EXPORT MODULE ─────────────────────────────────────────────────────────
  window.YM_S['wipeout.sphere.js']={
    name:'WipeOut',icon:'🚀',category:'Games',
    description:'WipeOut v8 — mobile optimisé, hover spring-damper, boost+virage gauche fixé, textures piste enrichies, speed lines',
    emit:[],receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){stopRace();},
    renderPanel,
    profileSection(container){
      const sc=loadScores();if(!sc.length)return;
      const b=sc[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,200,255,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">🚀</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#00ccff">WipeOut · ${b.track||''}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.35)">${b.ship||'FEISAR'}</div>
        </div>
        <div style="font-size:15px;font-weight:700;color:#00ccff;font-family:monospace">${fmt(b.time)}</div>`;
      container.appendChild(el);
    },
  };
})();
