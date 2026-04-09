/* jshint esversion:11, browser:true */
// wipeout.sphere.js — Anti-Gravity Racer v9
// Architecture fiabilisée :
// - W/H mesurés AVANT de vider le container, passés en paramètres à startRace
// - Canvas créé avec dimensions explicites en px (pas de % CSS)
// - Hover spring-damper (anti-sautillement)
// - Boost + virage gauche simultané (multitouch Map)
// - Qualité réduite mobile automatiquement
// - Specs vaisseau dans le menu de sélection
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_wipeout_scores_v9';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScores(d) { localStorage.setItem(SCORES_KEY, JSON.stringify(d.slice(0,20))); }
  function fmt(ms) {
    if(!ms||ms<=0) return '--:--.---';
    const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, r=ms%1000;
    return `${m}:${String(s).padStart(2,'0')}.${String(r).padStart(3,'0')}`;
  }

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 600;
  const SEG = isMobile ? 180 : 360;
  const BLDG = isMobile ? 25 : 50;
  const PSTEP = isMobile ? 30 : 20;

  let _ctx=null, _running=false, _raf=null, _renderer=null;

  const TRACKS = {
    venom:{
      name:'Venom Circuit', laps:3, difficulty:'Facile', col:0x00ccff, col2:0x0044ff,
      pts:()=>{const R=160,P=[];[0,30,60,90,110,140,180,210,240,270,300,330].forEach(deg=>{const a=deg*Math.PI/180,w=(deg%60===30)?.76:1;P.push(new THREE.Vector3(Math.cos(a)*R*w,Math.sin(a*2)*8,Math.sin(a)*R*w));});return P;},
      width:26, fog:0x000a1a, fogD:.005,
    },
    rapier:{
      name:'Rapier Cross', laps:3, difficulty:'Moyen', col:0xaa00ff, col2:0xff0066,
      pts:()=>{const P=[];for(let i=0;i<18;i++){const t=i/18*Math.PI*2;P.push(new THREE.Vector3(Math.cos(t)*180,Math.sin(t*3)*16,Math.sin(t*2)*100));}return P;},
      width:20, fog:0x08001a, fogD:.006,
    },
    phantom:{
      name:'Phantom Storm', laps:2, difficulty:'Difficile', col:0xff1144, col2:0xff8800,
      pts:()=>{const P=[];for(let i=0;i<20;i++){const t=i/20*Math.PI*2,r=150+70*Math.sin(t*3+.5);P.push(new THREE.Vector3(Math.cos(t)*r,Math.sin(t*4)*22+Math.cos(t*2)*10,Math.sin(t)*r*.8));}return P;},
      width:17, fog:0x150005, fogD:.008,
    },
  };

  const SHIPS = {
    feisar:  { name:'FEISAR',  col:0x2277ff, accel:22, maxSpd:28, turnRate:2.6, drag:.94, grip:.80, shield:100, boostMult:1.8, desc:'Équilibré · Polyvalent · Recommandé' },
    auricom: { name:'AURICOM', col:0xdd2222, accel:28, maxSpd:32, turnRate:2.1, drag:.92, grip:.68, shield:80,  boostMult:2.1, desc:'Rapide · Lourd · Difficile à virer' },
    piranha: { name:'PIRANHA', col:0x00ee66, accel:17, maxSpd:38, turnRate:3.6, drag:.96, grip:.88, shield:55,  boostMult:2.6, desc:'Extrême · Fragile · Expert uniquement' },
  };

  // ── PANEL ──────────────────────────────────────────────────────────────────
  function renderPanel(container) {
    container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;font-family:monospace';
    container.innerHTML='';
    const body=document.createElement('div');
    body.style.cssText='flex:1;min-height:0;position:relative;overflow:hidden';
    const tabs=document.createElement('div');
    tabs.style.cssText='display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#060608';
    [['race','🏁 Course'],['scores','🏆 Temps']].forEach(([id,lbl],i)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${i===0?'#00ccff':'rgba(255,255,255,.35)'}`;
      t.textContent=lbl;
      t.onclick=()=>{
        tabs.querySelectorAll('div').forEach((x,j)=>x.style.color=j===i?'#00ccff':'rgba(255,255,255,.35)');
        stopRace();
        body.innerHTML='';
        if(id==='race') renderMenu(body);
        else renderLB(body);
      };
      tabs.appendChild(t);
    });
    container.appendChild(body);
    container.appendChild(tabs);
    renderMenu(body);
  }

  function renderLB(c){
    c.style.cssText='position:absolute;inset:0;overflow-y:auto;padding:14px;background:#000;box-sizing:border-box';
    const sc=loadScores().sort((a,b)=>a.time-b.time);
    let h=`<div style="font-size:15px;font-weight:700;color:#00ccff;margin-bottom:12px">🏆 Meilleurs temps</div>`;
    if(!sc.length) h+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">Aucune course.</div>';
    else sc.forEach((s,i)=>{
      h+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span>
        <div style="flex:1"><div style="color:#fff;font-size:12px">${s.name||'Pilote'}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">${s.track} · ${s.ship}</div></div>
        <div style="color:#00ccff;font-size:14px;font-weight:700">${fmt(s.time)}</div></div>`;
    });
    c.innerHTML=h;
  }

  function renderMenu(container){
    let selTrack='venom', selShip='feisar';
    const div=document.createElement('div');
    div.style.cssText='position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;background:linear-gradient(180deg,#000,#020218);padding:16px 12px;box-sizing:border-box';

    function build(){
      const bar=(v,mx,col)=>`<div style="flex:1;height:3px;background:rgba(255,255,255,.08);border-radius:2px"><div style="width:${Math.round(v/mx*100)}%;height:100%;background:#${col.toString(16).padStart(6,'0')};border-radius:2px"></div></div>`;
      div.innerHTML=`
        <div style="font-size:40px;font-weight:900;background:linear-gradient(135deg,#00ccff,#7700ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px;margin-bottom:1px">WIPEOUT</div>
        <div style="font-size:9px;color:rgba(255,255,255,.2);letter-spacing:5px;margin-bottom:16px">ANTI-GRAVITY RACING</div>

        <div style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:2px;margin-bottom:7px;align-self:flex-start">PISTE</div>
        <div style="display:flex;gap:6px;width:100%;margin-bottom:16px">
          ${Object.entries(TRACKS).map(([id,t])=>`
            <div data-track="${id}" style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${id===selTrack?`#${t.col.toString(16).padStart(6,'0')}`:'rgba(255,255,255,.1)'};background:${id===selTrack?'rgba(0,200,255,.06)':'rgba(255,255,255,.02)'};cursor:pointer;text-align:center">
              <div style="font-size:10px;font-weight:700;color:${id===selTrack?'#fff':'rgba(255,255,255,.4)'}">${t.name}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.3)">${t.difficulty}</div>
            </div>`).join('')}
        </div>

        <div style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:2px;margin-bottom:7px;align-self:flex-start">VAISSEAU</div>
        <div style="display:flex;flex-direction:column;gap:6px;width:100%;margin-bottom:16px">
          ${Object.entries(SHIPS).map(([id,s])=>{
            const sel=id===selShip;
            const colHex=s.col.toString(16).padStart(6,'0');
            return `<div data-ship="${id}" style="padding:10px 12px;border-radius:8px;border:1.5px solid ${sel?`#${colHex}`:'rgba(255,255,255,.08)'};cursor:pointer;background:${sel?'rgba(255,255,255,.04)':'transparent'}">
              <div style="display:flex;align-items:center;gap:10px;${sel?'margin-bottom:10px':''}">
                <div style="width:14px;height:14px;border-radius:50%;background:#${colHex};flex-shrink:0"></div>
                <div style="flex:1">
                  <div style="font-size:12px;font-weight:700;color:${sel?'#fff':'rgba(255,255,255,.4)'}">${s.name}</div>
                  <div style="font-size:9px;color:rgba(255,255,255,.28)">${s.desc}</div>
                </div>
              </div>
              ${sel?`<div style="display:flex;flex-direction:column;gap:5px">
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:8px;color:rgba(255,255,255,.35);width:50px">ACCEL</span>${bar(s.accel,28,s.col)}<span style="font-size:8px;color:rgba(255,255,255,.3);width:22px;text-align:right">${s.accel}</span></div>
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:8px;color:rgba(255,255,255,.35);width:50px">VITESSE</span>${bar(s.maxSpd,38,s.col)}<span style="font-size:8px;color:rgba(255,255,255,.3);width:22px;text-align:right">${s.maxSpd}</span></div>
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:8px;color:rgba(255,255,255,.35);width:50px">GRIP</span>${bar(s.grip*100,100,s.col)}<span style="font-size:8px;color:rgba(255,255,255,.3);width:22px;text-align:right">${Math.round(s.grip*100)}</span></div>
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:8px;color:rgba(255,255,255,.35);width:50px">BOUCLIER</span>${bar(s.shield,100,s.col)}<span style="font-size:8px;color:rgba(255,255,255,.3);width:22px;text-align:right">${s.shield}</span></div>
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:8px;color:rgba(255,255,255,.35);width:50px">BOOST</span>${bar(s.boostMult,3,s.col)}<span style="font-size:8px;color:rgba(255,255,255,.3);width:22px;text-align:right">×${s.boostMult}</span></div>
              </div>`:''}
            </div>`;
          }).join('')}
        </div>

        <div style="width:100%;padding:10px;background:rgba(0,200,255,.05);border:1px solid rgba(0,200,255,.2);border-radius:10px;margin-bottom:14px;font-size:9px;color:rgba(255,255,255,.4);line-height:1.9;text-align:center;box-sizing:border-box">
          ← → VIRER &nbsp;·&nbsp; ↑ ACCÉLÉRER &nbsp;·&nbsp; ↓ FREINER &nbsp;·&nbsp; ESPACE BOOST<br>Mobile : boutons ← ↑ → à gauche · ⚡ BOOST à droite</div>
        <button id="wo-go" style="width:100%;background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;letter-spacing:2px;font-family:monospace;box-sizing:border-box">▶  DÉMARRER</button>
        <div style="height:20px;flex-shrink:0"></div>`;

      div.querySelectorAll('[data-track]').forEach(el=>el.onclick=e=>{e.stopPropagation();selTrack=el.dataset.track;build();});
      div.querySelectorAll('[data-ship]').forEach(el=>el.onclick=e=>{e.stopPropagation();selShip=el.dataset.ship;build();});

      div.querySelector('#wo-go').onclick=()=>{
        // CRUCIAL : mesurer les dimensions du container AVANT de vider quoi que ce soit
        const rect=container.getBoundingClientRect();
        const W=Math.round(rect.width>10?rect.width:360);
        const H=Math.round(rect.height>10?rect.height:520);
        // Vider le container et lancer immédiatement avec les dimensions connues
        container.innerHTML='';
        startRace(container, selTrack, selShip, W, H);
      };
    }
    build();
    container.appendChild(div);
  }

  function stopRace(){
    _running=false;
    if(_raf){cancelAnimationFrame(_raf);_raf=null;}
    if(_renderer){try{_renderer.dispose();}catch(e){} _renderer=null;}
  }

  // ── TEXTURE PISTE ──────────────────────────────────────────────────────────
  function buildTrackTexture(T){
    const TS=512, TD=new Uint8Array(TS*TS*4);
    const cr=(T.col>>16)&255, cg=(T.col>>8)&255, cb=T.col&255;
    const cr2=(T.col2>>16)&255, cg2=(T.col2>>8)&255, cb2=T.col2&255;
    for(let y=0;y<TS;y++) for(let x=0;x<TS;x++){
      const i4=(y*TS+x)*4, u=x/TS, v=y/TS;
      const noise=(Math.sin(x*.37)*Math.cos(y*.29)*.5+.5)*.04;
      let r=6+noise*12, g=8+noise*10, b=14+noise*18;
      const ctr=Math.max(0,1-Math.abs(u-.5)/.012);
      if(ctr>.05){r=Math.round(cr2*.45+r*(1-ctr*.9));g=Math.round(cg2*.45+g*(1-ctr*.9));b=Math.round(cb2*.45+b*(1-ctr*.9));}
      const l1=Math.abs(u-.33)<.009, l2=Math.abs(u-.67)<.009;
      if((l1||l2)&&(v*60%1)<.5){r=Math.max(r,Math.round(cr*.25));g=Math.max(g,Math.round(cg*.25));b=Math.max(b,Math.round(cb*.25));}
      const eL=Math.pow(Math.max(0,1-u/.07),1.4), eR=Math.pow(Math.max(0,1-(1-u)/.07),1.4), edge=Math.max(eL,eR);
      if(edge>.02){r=Math.round(cr*edge*.6+r*(1-edge*.6));g=Math.round(cg*edge*.6+g*(1-edge*.6));b=Math.round(cb*edge*.6+b*(1-edge*.6));}
      const spec=Math.pow(Math.max(0,Math.sin(v*Math.PI*80)*.5+.5),8)*.12;
      r=Math.min(255,r+Math.round(spec*80));g=Math.min(255,g+Math.round(spec*70));b=Math.min(255,b+Math.round(spec*120));
      if(v<.025||v>.975){const cx=Math.floor(u*16),cy=Math.floor(v*200)%8,ch=(cx+cy)%2===0;r=ch?180:20;g=ch?180:20;b=ch?180:20;}
      TD[i4]=Math.min(255,Math.max(0,r));TD[i4+1]=Math.min(255,Math.max(0,g));TD[i4+2]=Math.min(255,Math.max(0,b));TD[i4+3]=255;
    }
    const tex=new THREE.DataTexture(TD,TS,TS,THREE.RGBAFormat);
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.needsUpdate=true;
    return tex;
  }

  // ── COURSE ─────────────────────────────────────────────────────────────────
  function startRace(container, trackId, shipId, W, H){
    if(!window.THREE){
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload=()=>startRace(container,trackId,shipId,W,H);
      document.head.appendChild(s);
      return;
    }
    stopRace();
    _running=true;
    W=W||360; H=H||520;

    const THREE=window.THREE;
    const T=TRACKS[trackId], SD=SHIPS[shipId];

    // Le container doit être en position relative pour les éléments absolus enfants
    container.style.cssText='position:absolute;inset:0;overflow:hidden';

    // Canvas avec dimensions pixel exactes — PAS de width/height CSS en %
    const canvas=document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    canvas.style.cssText=`position:absolute;top:0;left:0;width:${W}px;height:${H}px;display:block`;
    container.appendChild(canvas);

    const renderer=new THREE.WebGLRenderer({canvas, antialias:!isMobile, powerPreference:isMobile?'low-power':'high-performance'});
    _renderer=renderer;
    renderer.setSize(W,H,false);
    renderer.setPixelRatio(isMobile?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,2));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(T.fog, isMobile?T.fogD*1.4:T.fogD);
    scene.background=new THREE.Color(T.fog);
    const camera=new THREE.PerspectiveCamera(70,W/H,.2,isMobile?700:1200);

    // ResizeObserver pour s'adapter si le panneau change de taille
    const ro=new ResizeObserver(entries=>{
      const e=entries[0]; if(!e) return;
      const nw=Math.round(e.contentRect.width), nh=Math.round(e.contentRect.height);
      if(!nw||!nh) return;
      canvas.width=nw; canvas.height=nh;
      canvas.style.width=nw+'px'; canvas.style.height=nh+'px';
      renderer.setSize(nw,nh,false);
      camera.aspect=nw/nh; camera.updateProjectionMatrix();
      slCanvas.width=nw; slCanvas.height=nh;
      slCanvas.style.width=nw+'px'; slCanvas.style.height=nh+'px';
    });
    ro.observe(container);

    // HUD
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

    const speedo=document.createElement('div');
    speedo.style.cssText='position:absolute;bottom:92px;left:12px;right:12px;pointer-events:none;z-index:10;font-family:monospace';
    speedo.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">KM/H</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div id="sb" style="height:100%;background:linear-gradient(90deg,#00ccff,#0af);border-radius:3px;width:0%"></div></div>
        <span id="sv" style="font-size:12px;color:#00ccff;width:36px;text-align:right;font-weight:700">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">BOOST</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div id="bb" style="height:100%;background:linear-gradient(90deg,#7700ff,#cc00ff);border-radius:3px;width:80%"></div></div>
        <span id="bv" style="font-size:12px;color:#aa88ff;width:36px;text-align:right">80</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:8px;color:rgba(255,255,255,.3);width:32px">SHLD</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div id="shb" style="height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:3px;width:100%"></div></div>
        <span id="shv" style="font-size:12px;color:#34d399;width:36px;text-align:right">100</span>
      </div>`;
    container.appendChild(speedo);

    const slCanvas=document.createElement('canvas');
    slCanvas.width=W; slCanvas.height=H;
    slCanvas.style.cssText=`position:absolute;top:0;left:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5;opacity:0`;
    container.appendChild(slCanvas);
    const slCtx=slCanvas.getContext('2d');

    const cntDiv=document.createElement('div');
    cntDiv.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25';
    const cntTxt=document.createElement('div');
    cntTxt.style.cssText='font-size:80px;font-weight:900;font-family:monospace;color:#00ccff;opacity:0;transition:opacity .1s;text-shadow:0 0 40px #00ccff';
    cntDiv.appendChild(cntTxt); container.appendChild(cntDiv);

    const dmgFlash=document.createElement('div');
    dmgFlash.style.cssText='position:absolute;inset:0;background:rgba(255,0,0,0);pointer-events:none;z-index:20;transition:background .15s';
    container.appendChild(dmgFlash);

    // Contrôles mobiles
    const ctrlDiv=document.createElement('div');
    ctrlDiv.style.cssText='position:absolute;bottom:6px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-end;padding:0 10px;z-index:10';
    const L=document.createElement('div');
    L.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;width:140px';
    L.innerHTML=`<div></div>
      <button id="wu" style="height:42px;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.25);color:#00ccff;border-radius:8px;cursor:pointer;font-size:18px;touch-action:none">↑</button><div></div>
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

    const finDiv=document.createElement('div');
    finDiv.style.cssText='position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.92);z-index:30;font-family:monospace';
    container.appendChild(finDiv);

    // ── SCÈNE THREE.JS ──────────────────────────────────────────────────────
    {
      const sv=new Float32Array(isMobile?6000:14000);
      for(let i=0;i<sv.length;i+=3){const r=300+Math.random()*500,th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI;sv[i]=Math.sin(ph)*Math.cos(th)*r;sv[i+1]=Math.cos(ph)*r*.5+80;sv[i+2]=Math.sin(ph)*Math.sin(th)*r;}
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(sv,3));
      scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:isMobile?1.:.8,transparent:true,opacity:.85})));
    }

    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000,isMobile?20:50,isMobile?20:50),new THREE.MeshLambertMaterial({color:T.fog===0x000a1a?0x001428:T.fog===0x08001a?0x0a0015:0x110008}));
    gnd.rotation.x=-Math.PI/2; gnd.position.y=-8; scene.add(gnd);
    const grid=new THREE.GridHelper(800,isMobile?24:40,T.col,T.col);
    grid.material.transparent=true; grid.material.opacity=.055; grid.position.y=-7.5; scene.add(grid);

    // Piste
    const curvePts=T.pts();
    const curve=new THREE.CatmullRomCurve3(curvePts,true,'catmullrom',.5);
    const N=SEG;
    const frames=curve.computeFrenetFrames(N,true);
    const TW=T.width;

    function trackRight(fi){
      const tang=frames.tangents[fi%N];
      const r=new THREE.Vector3(-tang.z,0,tang.x).normalize();
      return r.lengthSq()<.001?new THREE.Vector3(1,0,0):r;
    }

    const sPos=[],sUV=[],sIdx=[];
    for(let i=0;i<=N;i++){
      const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
      const r=trackRight(i);
      sPos.push(pt.x-r.x*TW/2,pt.y,pt.z-r.z*TW/2, pt.x+r.x*TW/2,pt.y,pt.z+r.z*TW/2);
      sUV.push(i/N*50,0, i/N*50,1);
      if(i<N){const b=i*2;sIdx.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    sIdx.push(N*2,N*2+1,0,N*2+1,1,0);
    const sGeo=new THREE.BufferGeometry();
    sGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(sPos),3));
    sGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(sUV),2));
    sGeo.setIndex(sIdx); sGeo.computeVertexNormals();
    scene.add(new THREE.Mesh(sGeo,new THREE.MeshStandardMaterial({map:buildTrackTexture(T),roughness:.12,metalness:.95,side:THREE.DoubleSide})));

    function buildRail(side){
      const lo=[],hi=[];
      for(let i=0;i<=N;i++){
        const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
        const r=trackRight(i);
        lo.push(new THREE.Vector3(pt.x+r.x*side*(TW/2+.3),pt.y+.25,pt.z+r.z*side*(TW/2+.3)));
        hi.push(new THREE.Vector3(pt.x+r.x*side*(TW/2+.3),pt.y+3.2,pt.z+r.z*side*(TW/2+.3)));
      }
      const col=side<0?T.col:T.col2;
      const mkL=(pts,c,op)=>scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:c,transparent:true,opacity:op})));
      mkL(lo,col,.9); mkL(hi,col,.7);
      for(let i=0;i<N;i+=(isMobile?16:10)) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([lo[i],hi[i]]),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.35})));
    }
    buildRail(-1); buildRail(1);

    const rng=(()=>{let s=7777;return{n:()=>{s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;}};})();
    for(let i=0;i<BLDG;i++){
      const t=i/BLDG; const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const r=trackRight(Math.floor(t*N));
      const side=rng.n()>.5?1:-1,dist=TW/2+14+rng.n()*28,bw=5+rng.n()*14,bh=10+rng.n()*45,bd=5+rng.n()*12;
      const bx=pt.x+r.x*side*dist,bz=pt.z+r.z*side*dist;
      const b=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),new THREE.MeshLambertMaterial({color:rng.n()>.5?0x001122:rng.n()>.5?0x0a0018:0x110008}));
      b.position.set(bx,bh/2-8,bz); scene.add(b);
      const wc=rng.n()>.5?T.col:T.col2;
      const wm=new THREE.Mesh(new THREE.BoxGeometry(bw*.85,bh*.8,bd*.85),new THREE.MeshBasicMaterial({color:wc,transparent:true,opacity:.05+rng.n()*.06}));
      wm.position.copy(b.position); scene.add(wm);
      if(rng.n()<.18){const pl=new THREE.PointLight(wc,isMobile?1.5:2,22);pl.position.set(bx,pt.y+bh*.6,bz);scene.add(pl);}
    }

    for(let i=0;i<N;i+=PSTEP){
      const pt=new THREE.Vector3(); curve.getPointAt(i/N,pt);
      const r=trackRight(i);
      [-1,1].forEach(s=>{
        const px=pt.x+r.x*s*(TW/2+1.5),pz=pt.z+r.z*s*(TW/2+1.5);
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,6,6),new THREE.MeshStandardMaterial({color:0x060c1e,metalness:.95,roughness:.1}));
        pole.position.set(px,pt.y+3,pz); scene.add(pole);
        const ball=new THREE.Mesh(new THREE.SphereGeometry(.35,6,6),new THREE.MeshBasicMaterial({color:s<0?T.col:T.col2}));
        ball.position.set(px,pt.y+6.4,pz); scene.add(ball);
        const pl=new THREE.PointLight(s<0?T.col:T.col2,isMobile?4:5,14);
        pl.position.copy(ball.position); scene.add(pl);
      });
    }

    const pads=[];
    for(let i=0;i<8;i++){
      const t=(i+.5)/8; const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const tang=frames.tangents[Math.floor(t*N)%N];
      const pad=new THREE.Mesh(new THREE.BoxGeometry(TW-6,.18,4),new THREE.MeshStandardMaterial({color:0x3300aa,emissive:0x1100aa,emissiveIntensity:.5,roughness:.05,metalness:.98,transparent:true,opacity:.88}));
      pad.position.copy(pt).add(new THREE.Vector3(0,.25,0)); pad.lookAt(pt.clone().add(tang)); scene.add(pad);
      const pl=new THREE.PointLight(0x6600ff,4,12); pl.position.copy(pad.position).add(new THREE.Vector3(0,1,0)); scene.add(pl);
      pads.push({pad,pl,pt:pt.clone()});
    }

    const GATES=4, gatePos=[];
    for(let i=0;i<GATES;i++){
      const t=(i+.5)/GATES; const pt=new THREE.Vector3(); curve.getPointAt(t,pt);
      const r=trackRight(Math.floor(t*N)), tang=frames.tangents[Math.floor(t*N)%N];
      [-1,1].forEach(s=>{
        const px=pt.x+r.x*s*(TW/2+1.5),pz=pt.z+r.z*s*(TW/2+1.5);
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,7,6),new THREE.MeshStandardMaterial({color:0x0a001a,metalness:.9}));
        post.position.set(px,pt.y+3.5,pz); scene.add(post);
        const ball=new THREE.Mesh(new THREE.SphereGeometry(.4,6,6),new THREE.MeshBasicMaterial({color:T.col}));
        ball.position.set(px,pt.y+7.4,pz); scene.add(ball);
        const pl=new THREE.PointLight(T.col,6,18); pl.position.copy(ball.position); scene.add(pl);
      });
      const bar=new THREE.Mesh(new THREE.BoxGeometry(TW+3,.25,.4),new THREE.MeshBasicMaterial({color:T.col}));
      bar.position.copy(pt).add(new THREE.Vector3(0,7.4,0)); bar.lookAt(pt.clone().add(tang)); scene.add(bar);
      gatePos.push({t,pt:pt.clone()});
    }

    scene.add(new THREE.AmbientLight(0x111428,3));
    const sun=new THREE.DirectionalLight(0x5566ff,3); sun.position.set(20,60,30); scene.add(sun);
    scene.add(Object.assign(new THREE.DirectionalLight(0xff0033,1.2),{position:new THREE.Vector3(-20,-10,-30)}));
    const shipGL=new THREE.PointLight(SD.col,10,30); scene.add(shipGL);
    const underGL=new THREE.PointLight(0x00ccff,4,10); scene.add(underGL);
    const boostGL=new THREE.PointLight(0x8800ff,0,28); scene.add(boostGL);

    // ── VAISSEAU ───────────────────────────────────────────────────────────
    const ship=new THREE.Group();
    const sCol=new THREE.Color(SD.col);
    const darkM=new THREE.MeshStandardMaterial({color:0x000e22,metalness:.97,roughness:.04});
    const accentM=new THREE.MeshStandardMaterial({color:sCol,emissive:sCol.clone().multiplyScalar(.15),metalness:.95,roughness:.05});
    const glassM=new THREE.MeshStandardMaterial({color:0x66aaff,emissive:0x001144,transparent:true,opacity:.55,roughness:0,metalness:.1});

    const fuseG=new THREE.CylinderGeometry(.55,.30,5,10); fuseG.rotateX(Math.PI/2);
    ship.add(new THREE.Mesh(fuseG,darkM));
    ship.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.4,.15,4.2),accentM),{position:new THREE.Vector3(0,.45,0)}));
    const noseG=new THREE.ConeGeometry(.42,2,10); noseG.rotateX(Math.PI/2);
    ship.add(Object.assign(new THREE.Mesh(noseG,darkM),{position:new THREE.Vector3(0,0,3.5)}));
    const ntG=new THREE.ConeGeometry(.18,.8,10); ntG.rotateX(Math.PI/2);
    ship.add(Object.assign(new THREE.Mesh(ntG,accentM),{position:new THREE.Vector3(0,0,4.4)}));

    [-1,1].forEach(s=>{
      const wv=new Float32Array([0,.05,2.5, s*3.8,-.05,-.5, s*2.8,-.02,-2.2, 0,.05,-2.2]);
      const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.BufferAttribute(wv,3));
      wg.setIndex([0,1,2,2,3,0,0,2,1,0,3,2]); wg.computeVertexNormals();
      ship.add(new THREE.Mesh(wg,darkM));
      const pv=new Float32Array([0,.09,2.0, s*3.2,-.02,-.2, s*2.2,-.01,-1.8, 0,.08,-1.8]);
      const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.BufferAttribute(pv,3));
      pg.setIndex([0,1,2,2,3,0]); pg.computeVertexNormals();
      ship.add(new THREE.Mesh(pg,accentM));
      const tG=new THREE.CylinderGeometry(.14,.18,1.4,7); tG.rotateX(Math.PI/2);
      ship.add(Object.assign(new THREE.Mesh(tG,accentM),{position:new THREE.Vector3(s*3.75,-.05,-.2)}));
    });

    const ckG=new THREE.SphereGeometry(.45,10,8); ckG.scale(1.1,.52,1.4);
    ship.add(Object.assign(new THREE.Mesh(ckG,glassM),{position:new THREE.Vector3(0,.48,1.2)}));

    const engineGlows=[], engineLts=[];
    [-0.7,.7].forEach(ex=>{
      const nacG=new THREE.CylinderGeometry(.35,.30,1.6,10); nacG.rotateX(Math.PI/2);
      ship.add(Object.assign(new THREE.Mesh(nacG,darkM),{position:new THREE.Vector3(ex,-.12,-2.4)}));
      const glG=new THREE.ConeGeometry(.22,1.8,8); glG.rotateX(-Math.PI/2);
      const glMat=new THREE.MeshBasicMaterial({color:0x00ccff,transparent:true,opacity:.9});
      const gl=new THREE.Mesh(glG,glMat); gl.position.set(ex,-.12,-3.9); ship.add(gl); engineGlows.push(gl);
      const el=new THREE.PointLight(0x00ccff,8,16); el.position.set(ex,-.12,-4); ship.add(el); engineLts.push(el);
    });

    const hPods=[];
    [[-0.7,-2],[0.7,-2],[-0.65,1.2],[0.65,1.2]].forEach(([hx,hz])=>{
      const p=new THREE.Mesh(new THREE.SphereGeometry(.12,6,6),new THREE.MeshBasicMaterial({color:0x00ccff}));
      p.position.set(hx,-.30,hz); ship.add(p); hPods.push(p);
    });
    scene.add(ship);

    const MXE=isMobile?80:200, MXT=isMobile?50:120, MXS=isMobile?40:80;
    const mkPS=(n,sz,col)=>{
      const pos=new Float32Array(n*3),geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const mat=new THREE.PointsMaterial({color:col,size:sz,transparent:true,opacity:0,sizeAttenuation:true});
      const sys=new THREE.Points(geo,mat); scene.add(sys);
      return{pos,geo,mat,p:[]};
    };
    const EX=mkPS(MXE,.8,0x00ccff), TR=mkPS(MXT,1.8,0x8800ff), SPK=mkPS(MXS,.9,0xff6600);

    // ── PHYSIQUE ───────────────────────────────────────────────────────────
    const startPt=new THREE.Vector3(); curve.getPointAt(0,startPt);
    const startTan=frames.tangents[0].clone();
    let pos=startPt.clone().add(new THREE.Vector3(0,1.3,0));
    let vel=new THREE.Vector3();
    let heading=Math.atan2(startTan.x,startTan.z);
    let vertVel=0;
    let speed=0, roll=0, pitch=0, hoverPhase=0;
    let boost=.8, shield=SD.shield;
    let laps=0, lapStart=0, raceStart=0, started=false, done=false;
    let wallCD=0, camShake=0, _lastT=0;
    let cpPassed=new Set(), lapTimes=[];
    let camP=new THREE.Vector3(), camL=new THREE.Vector3(), camFirst=true;

    const saved=loadScores().filter(s=>s.track===T.name).sort((a,b)=>a.time-b.time);
    if(saved.length) document.getElementById('wo-best').textContent='Meilleur: '+fmt(saved[0].time);

    const keys={l:false,r:false,u:false,d:false,b:false};
    const onKey=e=>{
      const dn=e.type==='keydown';
      if(e.key==='ArrowLeft'||e.key==='a'||e.key==='q') keys.l=dn;
      if(e.key==='ArrowRight'||e.key==='d') keys.r=dn;
      if(e.key==='ArrowUp'||e.key==='w'||e.key==='z') keys.u=dn;
      if(e.key==='ArrowDown'||e.key==='s') keys.d=dn;
      if(e.key===' '){keys.b=dn;if(dn)e.preventDefault();}
    };
    window.addEventListener('keydown',onKey);
    window.addEventListener('keyup',onKey);

    const ptrMap=new Map();
    const bindBtn=(id,key)=>{
      const el=container.querySelector('#'+id); if(!el) return;
      const dn=e=>{e.preventDefault();ptrMap.set(e.pointerId,key);keys[key]=true;};
      const up=e=>{e.preventDefault();if(ptrMap.get(e.pointerId)===key){ptrMap.delete(e.pointerId);if(![...ptrMap.values()].includes(key))keys[key]=false;}};
      ['pointerdown'].forEach(ev=>el.addEventListener(ev,dn,{passive:false}));
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,up,{passive:false}));
    };
    bindBtn('wu','u'); bindBtn('wd','d'); bindBtn('wl','l'); bindBtn('wr','r'); bindBtn('wbs','b');

    let cdDone=false;
    const showCnt=(txt,dur,cb)=>{cntTxt.textContent=txt;cntTxt.style.opacity='1';setTimeout(()=>{cntTxt.style.opacity='0';setTimeout(()=>cb&&cb(),180);},dur);};
    setTimeout(()=>showCnt('3',900,()=>showCnt('2',900,()=>showCnt('1',900,()=>showCnt('GO!',600,()=>{cdDone=true;raceStart=Date.now();lapStart=raceStart;started=true;})))),500);

    const _tv=new THREE.Vector3();
    function nearestT(p){
      let best=_lastT,bestD=1e18;
      const W2=.18,steps=isMobile?40:60;
      for(let i=0;i<steps;i++){const t=((_lastT-W2+i*(W2*2/steps))%1+1)%1;curve.getPointAt(t,_tv);const d=_tv.distanceToSquared(p);if(d<bestD){bestD=d;best=t;}}
      _lastT=best; return best;
    }

    function drawSL(spF,boostI){
      const alpha=Math.pow(spF,2)*.35+boostI*.45;
      slCanvas.style.opacity=alpha<.01?'0':alpha.toFixed(3);
      if(alpha<.01) return;
      const cw=slCanvas.width,ch=slCanvas.height,cx=cw/2,cy=ch/2;
      slCtx.clearRect(0,0,cw,ch);
      for(let i=0;i<20;i++){
        const ang=Math.random()*Math.PI*2,r0=50+Math.random()*80,r1=r0+20+Math.random()*60*(1+spF*2);
        slCtx.strokeStyle=`rgba(0,200,255,${.3+boostI*.4})`;
        slCtx.lineWidth=.5+Math.random()*1.5;
        slCtx.globalAlpha=Math.random()*.5;
        slCtx.beginPath();slCtx.moveTo(cx+Math.cos(ang)*r0,cy+Math.sin(ang)*r0);slCtx.lineTo(cx+Math.cos(ang)*r1,cy+Math.sin(ang)*r1);slCtx.stroke();
      }
      slCtx.globalAlpha=1;
    }

    // ── BOUCLE ─────────────────────────────────────────────────────────────
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
          const baseMax=SD.maxSpd, effMax=boostOn?baseMax*SD.boostMult:baseMax;
          const turn=SD.turnRate*(1+Math.abs(speed)*.012)*(boostOn?.78:1);
          if(keys.l) heading+=turn*dt;
          if(keys.r) heading-=turn*dt;
          if(keys.u) speed=Math.min(speed+SD.accel*(boostOn?1.8:1)*dt,effMax);
          else if(keys.d) speed=Math.max(speed-SD.accel*1.6*dt,-baseMax*.3);
          else{speed*=Math.pow(SD.drag,dt*60);if(Math.abs(speed)<.01)speed=0;}

          const fwd=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
          vel.lerp(fwd.clone().multiplyScalar(speed),SD.grip*dt*10);
          pos.x+=vel.x*dt; pos.z+=vel.z*dt;

          // Hover spring-damper
          const ct=nearestT(pos);
          const trackPt=new THREE.Vector3(); curve.getPointAt(ct,trackPt);
          const targetY=trackPt.y+1.25+Math.sin(hoverPhase)*.1;
          vertVel=(vertVel+(targetY-pos.y)*12*dt)*.82;
          pos.y+=vertVel*dt;

          // Murs
          if(wallCD>0) wallCD-=dt;
          const r2=trackRight(Math.floor(ct*N));
          const lat=new THREE.Vector3().subVectors(pos,trackPt).dot(r2);
          const hw=TW/2-.6;
          if(Math.abs(lat)>hw){
            if(wallCD<=0){
              const imp=Math.abs(vel.dot(r2));
              shield=Math.max(0,shield-imp*2.8);
              vel.reflect(r2.clone().multiplyScalar(Math.sign(lat))).multiplyScalar(.32);
              speed*=.35; vertVel*=.5; camShake=Math.min(3.5,imp*.9); wallCD=.38;
              dmgFlash.style.background='rgba(255,0,0,.5)';
              setTimeout(()=>dmgFlash.style.background='rgba(255,0,0,0)',230);
              for(let k=0;k<18;k++) SPK.p.push({x:pos.x,y:pos.y,z:pos.z,vx:(Math.random()-.5)*60,vy:Math.random()*45+12,vz:(Math.random()-.5)*60,life:.8});
              if(shield<=0&&!done){crash();return;}
            }
            pos.x=trackPt.x+r2.x*hw*Math.sign(lat); pos.z=trackPt.z+r2.z*hw*Math.sign(lat);
          }

          pads.forEach(({pt:p2})=>{if(Math.hypot(pos.x-p2.x,pos.z-p2.z)<TW*.42){boost=Math.min(1,boost+.08);camShake=.5;vertVel+=1.5;}});
          gatePos.forEach(({pt:p2},gi)=>{if(Math.hypot(pos.x-p2.x,pos.z-p2.z)<TW&&!cpPassed.has(gi))cpPassed.add(gi);});

          if(started&&_lastT>.85&&ct<.15&&cpPassed.size>=GATES){
            cpPassed.clear();
            const lt=Date.now()-lapStart; lapTimes.push(lt); lapStart=Date.now(); laps++;
            document.getElementById('wo-lap').textContent=`${laps}/${T.laps}`;
            document.getElementById('wo-laptime').textContent=fmt(lt);
            camShake=1.5;
            if(laps>=T.laps){done=true;finish(Date.now()-raceStart);return;}
          }

          if(started) document.getElementById('wo-time').textContent=fmt(Date.now()-raceStart);
          const spF=Math.min(1,Math.abs(speed)/baseMax), boostI=boostOn?Math.min(1,speed/baseMax):0;
          const spd3=vel.length()*36;
          document.getElementById('sb').style.width=Math.round(Math.min(100,spd3/(SD.maxSpd*SD.boostMult*36)*100))+'%';
          document.getElementById('sv').textContent=Math.round(spd3);
          document.getElementById('bb').style.width=Math.round(boost*100)+'%';
          document.getElementById('bv').textContent=Math.round(boost*100);
          const shp=Math.max(0,Math.round(shield/SD.shield*100));
          document.getElementById('shb').style.width=shp+'%';
          document.getElementById('shv').textContent=Math.round(shield);
          document.getElementById('shb').style.background=shp<25?'linear-gradient(90deg,#ef4444,#f87171)':shp<55?'linear-gradient(90deg,#fbbf24,#f59e0b)':'linear-gradient(90deg,#10b981,#34d399)';
          if(!isMobile) drawSL(spF,boostI);

          hoverPhase+=dt*3.5;
          ship.position.copy(pos);
          const m4=new THREE.Matrix4();
          m4.lookAt(new THREE.Vector3(0,0,0),fwd.clone().negate(),new THREE.Vector3(0,1,0));
          ship.quaternion.setFromRotationMatrix(m4);
          const turnIn=(keys.r?1:0)-(keys.l?1:0);
          roll+=((-turnIn*.55)-roll)*dt*7;
          pitch+=((keys.u?.06:keys.d?-.04:0)-pitch)*dt*6;
          ship.rotateZ(-roll); ship.rotateX(-pitch);

          engineGlows.forEach((g,i)=>{g.material.color.setHSL(boostOn?.78:.54,1,.3+boostI*.5);const sc=.4+spF*2+Math.sin(ts*.022+i)*.18;g.scale.set(sc,sc,.5+spF*1.8+boostI*2.5);g.material.opacity=.5+spF*.5;});
          engineLts.forEach(l=>{l.color.setHSL(boostOn?.78:.54,1,.5);l.intensity=5+spF*12+boostI*20;});
          hPods.forEach((p2,i)=>{p2.material.color.setHSL(.54,1,.3+Math.sin(hoverPhase*2+i)*.25);});
          shipGL.position.copy(pos); shipGL.intensity=6+spF*15;
          boostGL.position.copy(pos); boostGL.intensity=boostOn?boost*25:0;
          underGL.position.copy(pos).add(new THREE.Vector3(0,-1.5,0));

          const e1=ship.localToWorld(new THREE.Vector3(-.7,-.12,-4.2));
          const e2=ship.localToWorld(new THREE.Vector3(.7,-.12,-4.2));
          const bkDir=ship.localToWorld(new THREE.Vector3(0,0,-1)).sub(ship.localToWorld(new THREE.Vector3())).normalize();
          if(EX.p.length<MXE-4)[e1,e2].forEach(o=>{const sp2=45+spF*110+boostI*180;EX.p.push({x:o.x,y:o.y,z:o.z,vx:bkDir.x*sp2+(Math.random()-.5)*9,vy:bkDir.y*sp2,vz:bkDir.z*sp2+(Math.random()-.5)*9,life:.35+spF*.3});});
          if(boostOn&&TR.p.length<MXT-4)[e1,e2].forEach(o=>{TR.p.push({x:o.x,y:o.y,z:o.z,vx:bkDir.x*28+(Math.random()-.5)*22,vy:bkDir.y*28,vz:bkDir.z*28+(Math.random()-.5)*22,life:.6});});
        }

        [[EX,MXE],[TR,MXT]].forEach(([ps,MX])=>{
          for(let i=ps.p.length-1;i>=0;i--){const p2=ps.p[i];p2.x+=p2.vx*dt;p2.y+=p2.vy*dt;p2.z+=p2.vz*dt;p2.life-=dt;if(p2.life<=0){ps.p.splice(i,1);continue;}const pi=Math.min(i,MX-1)*3;ps.pos[pi]=p2.x;ps.pos[pi+1]=p2.y;ps.pos[pi+2]=p2.z;}
          ps.geo.attributes.position.needsUpdate=true; ps.mat.opacity=ps.p.length>0?.85:0;
        });
        for(let i=SPK.p.length-1;i>=0;i--){const p2=SPK.p[i];p2.x+=p2.vx*dt;p2.y+=p2.vy*dt;p2.z+=p2.vz*dt;p2.vy-=40*dt;p2.life-=dt;if(p2.life<=0){SPK.p.splice(i,1);continue;}const pi=Math.min(i,MXS-1)*3;SPK.pos[pi]=p2.x;SPK.pos[pi+1]=p2.y;SPK.pos[pi+2]=p2.z;}
        SPK.geo.attributes.position.needsUpdate=true; SPK.mat.opacity=SPK.p.length>0?.9:0;
        TR.mat.opacity=keys.b?.78:.08;
        pads.forEach(({pad,pl},i)=>{pad.material.emissiveIntensity=.4+Math.sin(ts*.005+i*1.4)*.6;pl.intensity=3+Math.sin(ts*.007+i)*1.5;});

        const spF2=Math.min(1,Math.abs(speed)/SD.maxSpd), boostI2=keys.b?Math.min(1,speed/SD.maxSpd):0;
        const camOff=ship.localToWorld(new THREE.Vector3(0,3.5+spF2*2,-(9+spF2*3)));
        const camTgt=ship.localToWorld(new THREE.Vector3(0,.5,10+spF2*5));
        if(camShake>0){camShake=Math.max(0,camShake-dt*6);camOff.x+=(Math.random()-.5)*camShake;camOff.y+=(Math.random()-.5)*camShake*.4;}
        if(camFirst){camP.copy(camOff);camL.copy(camTgt);camFirst=false;}
        else{camP.lerp(camOff,isMobile?.13:.10);camL.lerp(camTgt,isMobile?.16:.13);}
        camera.position.copy(camP); camera.lookAt(camL);
        camera.fov=70+spF2*18+boostI2*10; camera.updateProjectionMatrix();
        scene.fog.density=T.fogD+spF2*.003;
      }

      renderer.render(scene,camera);
    }
    requestAnimationFrame(t=>{lastTs=t;loop(t);});

    function crash(){
      done=true;
      setTimeout(()=>{
        finDiv.style.display='flex';
        finDiv.innerHTML=`<div style="font-size:52px">💥</div>
          <div style="font-size:28px;font-weight:900;color:#ef4444">ÉLIMINÉ</div>
          <div style="font-size:12px;color:rgba(255,255,255,.4)">Bouclier détruit</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="fin-r" style="background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;padding:13px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ RÉESSAYER</button>
            <button id="fin-m" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button></div>`;
        finDiv.querySelector('#fin-r').onclick=()=>{finDiv.style.display='none';stopRace();container.innerHTML='';startRace(container,trackId,shipId,W,H);};
        finDiv.querySelector('#fin-m').onclick=()=>{finDiv.style.display='none';stopRace();container.innerHTML='';renderMenu(container);};
      },900);
    }

    function finish(totalMs){
      const name=_ctx?.loadProfile?.()?.name||'Pilote';
      const all=loadScores();
      all.push({name,time:totalMs,track:T.name,ship:SD.name,laps:T.laps,ts:Date.now()});
      all.sort((a,b)=>a.time-b.time); saveScores(all);
      const isRec=!saved.length||totalMs<saved[0].time;
      const bestLap=lapTimes.length?Math.min(...lapTimes):totalMs;
      finDiv.style.display='flex';
      finDiv.innerHTML=`<div style="font-size:52px">🏁</div>
        <div style="font-size:38px;font-weight:900;background:linear-gradient(135deg,#00ccff,#7700ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-2px">${fmt(totalMs)}</div>
        ${isRec?'<div style="font-size:12px;color:#fbbf24;letter-spacing:3px">✦ NOUVEAU RECORD ✦</div>':''}
        <div style="font-size:11px;color:rgba(255,255,255,.4)">Meilleur tour: ${fmt(bestLap)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="fin-r" style="background:linear-gradient(135deg,#00ccff,#0055ff);border:none;color:#000;font-weight:800;padding:13px 22px;border-radius:10px;cursor:pointer;font-family:monospace">↺ REJOUER</button>
          <button id="fin-m" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:13px 16px;border-radius:10px;cursor:pointer;font-family:monospace">⟵ MENU</button></div>`;
      finDiv.querySelector('#fin-r').onclick=()=>{finDiv.style.display='none';stopRace();container.innerHTML='';startRace(container,trackId,shipId,W,H);};
      finDiv.querySelector('#fin-m').onclick=()=>{finDiv.style.display='none';stopRace();container.innerHTML='';renderMenu(container);};
    }
  }

  // ── EXPORT ─────────────────────────────────────────────────────────────────
  window.YM_S['wipeout.sphere.js']={
    name:'WipeOut', icon:'🚀', category:'Games',
    description:'WipeOut v9 — canvas sizing fiabilisé, hover spring-damper, boost+gauche, specs dans menu',
    emit:[], receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){stopRace();},
    renderPanel,
    profileSection(container){
      const sc=loadScores(); if(!sc.length) return;
      const b=sc[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#000,#030320);border:1px solid rgba(0,200,255,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">🚀</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#00ccff">WipeOut · ${b.track||''}</div><div style="font-size:10px;color:rgba(255,255,255,.35)">${b.ship||'FEISAR'}</div></div><div style="font-size:15px;font-weight:700;color:#00ccff;font-family:monospace">${fmt(b.time)}</div>`;
      container.appendChild(el);
    },
  };
})();
