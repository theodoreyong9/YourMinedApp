/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense v5 — FIXED
// Fixes: 1) enemies reaching end now correctly remove lives
//        2) between-wave shop stays open until player makes a choice (no auto-close)
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_td_scores_v5';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch(e) { return []; } }
  function saveScore(s) { const a = loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY, JSON.stringify(a.slice(0,20))); }

  let _ctx = null, _game2 = null;

  const TOWER_DEFS = {
    archer:  { cost:50,  range:90,  dmg:16,  rate:800,  col:0x3b82f6, name:'Archer',   emoji:'🏹', cat:'basic',
      desc:'Fast single-target. Good starter.',
      upg:[{cost:60,dmg:26,label:'Iron Tips'},{cost:110,dmg:44,rate:650,label:'Compound Bow'},{cost:200,dmg:80,rate:500,range:110,label:'Longbow Master'}] },
    rapid:   { cost:75,  range:72,  dmg:8,   rate:240,  col:0x10b981, name:'Gatling',  emoji:'⚡', cat:'basic',
      desc:'Very fast, low damage. Great DPS.',
      upg:[{cost:70,dmg:13,rate:190,label:'Oiled Gears'},{cost:130,dmg:20,rate:150,label:'Overclocked'},{cost:240,dmg:32,rate:110,range:85,label:'Minigun'}] },
    sniper:  { cost:110, range:220, dmg:75,  rate:2000, col:0x8b5cf6, name:'Sniper',   emoji:'🎯', cat:'basic',
      desc:'Extreme range & damage. Slow fire.',
      upg:[{cost:90,dmg:125,rate:1700,label:'Scope+'},{cost:160,dmg:200,rate:1400,label:'Anti-Materiel'},{cost:300,dmg:360,rate:1100,range:260,label:'Rail Gun'}] },
    frost:   { cost:85,  range:100, dmg:7,   rate:700,  col:0x38bdf8, name:'Frost',    emoji:'❄️', cat:'support', slow:0.40,
      desc:'Slows enemies. No armour bypass.',
      upg:[{cost:75,slow:0.20,range:120,label:'Deep Freeze'},{cost:140,dmg:14,slow:0.12,rate:550,label:'Blizzard'},{cost:260,dmg:22,slow:0.05,range:140,rate:400,label:'Absolute Zero'}] },
    cannon:  { cost:130, range:110, dmg:100, rate:2600, col:0xef4444, name:'Cannon',   emoji:'💣', cat:'heavy', splash:70,
      desc:'Splash damage. Devastating vs groups.',
      upg:[{cost:100,dmg:160,splash:90,label:'Explosive Shell'},{cost:190,dmg:260,splash:120,label:'Cluster Bomb'},{cost:350,dmg:420,splash:160,rate:2000,label:'Thermobaric'}] },
    poison:  { cost:90,  range:95,  dmg:5,   rate:560,  col:0xa3e635, name:'Poison',   emoji:'☠️', cat:'dot', poison:true,
      desc:'Poison DOT. Stacks with multiple towers.',
      upg:[{cost:80,dmg:8,rate:440,label:'Neurotoxin'},{cost:145,dmg:14,rate:340,range:115,label:'Plague'},{cost:270,dmg:22,rate:260,range:135,label:'Biohazard'}] },
    tesla:   { cost:150, range:125, dmg:50,  rate:1400, col:0xfacc15, name:'Tesla',    emoji:'⚡', cat:'special', chain:3,
      desc:'Chains lightning to nearby enemies.',
      upg:[{cost:120,dmg:75,chain:4,label:'Superconductor'},{cost:220,dmg:115,chain:5,range:145,label:'Storm'},{cost:400,dmg:180,chain:7,range:165,rate:1000,label:'Thundergod'}] },
    mortar:  { cost:160, range:180, dmg:140, rate:3500, col:0xf97316, name:'Mortar',   emoji:'🔥', cat:'heavy', splash:110, minRange:60,
      desc:'Long range AoE. Can\'t hit close targets.',
      upg:[{cost:140,dmg:220,splash:130,label:'White Phosphorus'},{cost:260,dmg:340,splash:160,rate:2800,label:'Incendiary'},{cost:480,dmg:550,splash:200,rate:2200,label:'Daisy Cutter'}] },
    laser:   { cost:200, range:150, dmg:35,  rate:120,  col:0xf43f5e, name:'Laser',    emoji:'🔴', cat:'special', pierce:true,
      desc:'Pierces all enemies in a line.',
      upg:[{cost:180,dmg:55,rate:100,label:'Focused Beam'},{cost:320,dmg:90,rate:80,range:170,label:'X-Ray Laser'},{cost:580,dmg:150,rate:60,range:200,label:'Death Star'}] },
    vortex:  { cost:180, range:130, dmg:20,  rate:1800, col:0xc026d3, name:'Vortex',   emoji:'🌀', cat:'special', pull:true,
      desc:'Pulls enemies to centre, clusters them.',
      upg:[{cost:160,range:155,dmg:35,label:'Gravity Well'},{cost:290,range:180,dmg:60,rate:1400,label:'Black Hole'},{cost:520,range:210,dmg:100,rate:1000,label:'Singularity'}] },
    flame:   { cost:120, range:80,  dmg:22,  rate:300,  col:0xff6b35, name:'Flamer',   emoji:'🌋', cat:'dot', burn:true,
      desc:'Burns enemies. AoE cone damage.',
      upg:[{cost:100,dmg:36,range:95,label:'Napalm'},{cost:190,dmg:60,rate:240,range:115,label:'Dragon\'s Breath'},{cost:360,dmg:100,rate:180,range:140,label:'Inferno'}] },
    cryo:    { cost:140, range:115, dmg:30,  rate:1200, col:0x67e8f9, name:'Cryo',     emoji:'🧊', cat:'support', freeze:true,
      desc:'Freezes enemies solid for 1.5s.',
      upg:[{cost:120,range:135,label:'Deep Freeze'},{cost:220,dmg:55,range:155,label:'Cryostasis'},{cost:400,dmg:90,range:175,rate:900,label:'Absolute Zero'}] },
  };

  const ENEMY_TYPES = {
    grunt:    { hp:30,   spd:50, rew:10, col:'#ef4444', shape:'circle',   name:'Grunt',    size:9  },
    fast:     { hp:18,   spd:110,rew:12, col:'#fbbf24', shape:'diamond',  name:'Dasher',   size:8  },
    tank:     { hp:280,  spd:30, rew:35, col:'#6366f1', shape:'hex',      name:'Tank',     size:14, armor:0.25 },
    swarm:    { hp:8,    spd:80, rew:4,  col:'#84cc16', shape:'circle',   name:'Swarm',    size:6  },
    armored:  { hp:150,  spd:42, rew:28, col:'#94a3b8', shape:'hex',      name:'Armored',  size:12, armor:0.45 },
    flyer:    { hp:55,   spd:90, rew:18, col:'#e879f9', shape:'diamond',  name:'Flyer',    size:8, flying:true },
    healer:   { hp:80,   spd:45, rew:30, col:'#34d399', shape:'circle',   name:'Healer',   size:10, heals:true },
    splitter: { hp:120,  spd:38, rew:22, col:'#fb923c', shape:'circle',   name:'Splitter', size:11, splits:true },
    stealth:  { hp:65,   spd:72, rew:25, col:'#475569', shape:'diamond',  name:'Phantom',  size:8, stealth:true },
    berserker:{ hp:200,  spd:28, rew:32, col:'#dc2626', shape:'hex',      name:'Beserker', size:13, rages:true },
    titan:    { hp:800,  spd:22, rew:80, col:'#7c3aed', shape:'hex',      name:'Titan',    size:18, armor:0.35, boss:true },
    overlord: { hp:3500, spd:18, rew:300,col:'#ff0000', shape:'diamond',  name:'Overlord', size:22, armor:0.20, boss:true },
  };

  const WAVE_SCRIPT = [
    { squads:[{type:'grunt',count:8,delay:600}], inter:7000 },
    { squads:[{type:'grunt',count:10,delay:500},{type:'fast',count:4,delay:400,offset:3000}], inter:7000 },
    { squads:[{type:'grunt',count:8,delay:500},{type:'swarm',count:20,delay:200,offset:2000}], inter:8000 },
    { squads:[{type:'tank',count:2,delay:2000},{type:'grunt',count:10,delay:400,offset:2000}], inter:8000 },
    { squads:[{type:'fast',count:12,delay:300},{type:'armored',count:3,delay:1500,offset:3000}], inter:9000 },
    { squads:[{type:'swarm',count:30,delay:180},{type:'fast',count:8,delay:350,offset:4000}], inter:9000 },
    { squads:[{type:'titan',count:1,delay:5000}], inter:10000, bossWave:true },
    { squads:[{type:'flyer',count:10,delay:400},{type:'stealth',count:6,delay:600,offset:2500}], inter:9000 },
    { squads:[{type:'healer',count:4,delay:1200},{type:'grunt',count:15,delay:400,offset:1000}], inter:10000 },
    { squads:[{type:'splitter',count:6,delay:900},{type:'armored',count:5,delay:1000,offset:2000}], inter:10000 },
    { squads:[{type:'berserker',count:4,delay:1400},{type:'fast',count:14,delay:300,offset:1500}], inter:11000 },
    { squads:[{type:'swarm',count:40,delay:150},{type:'tank',count:3,delay:2000,offset:5000}], inter:11000 },
    { squads:[{type:'stealth',count:12,delay:500},{type:'healer',count:5,delay:1000,offset:2000}], inter:11000 },
    { squads:[{type:'overlord',count:1,delay:8000}], inter:14000, bossWave:true },
    { squads:[{type:'flyer',count:16,delay:300},{type:'berserker',count:5,delay:1200,offset:3000}], inter:12000 },
    { squads:[{type:'armored',count:10,delay:700},{type:'splitter',count:8,delay:800,offset:3000}], inter:12000 },
    { squads:[{type:'swarm',count:50,delay:130},{type:'titan',count:2,delay:5000,offset:6000}], inter:14000, bossWave:true },
    { squads:[{type:'stealth',count:16,delay:400},{type:'healer',count:8,delay:800,offset:2000},{type:'fast',count:20,delay:250,offset:5000}], inter:14000 },
    { squads:[{type:'berserker',count:10,delay:800},{type:'armored',count:12,delay:700,offset:3000},{type:'splitter',count:10,delay:600,offset:7000}], inter:16000 },
    { squads:[{type:'overlord',count:2,delay:7000},{type:'titan',count:3,delay:4000,offset:8000},{type:'swarm',count:30,delay:150,offset:2000}], inter:0, bossWave:true },
  ];

  const GLOBAL_UPGRADES = [
    { id:'dmg_all',    name:'War Academy',    emoji:'⚔️',  cost:200, desc:'All towers +15% damage',      effect:{dmgMult:0.15} },
    { id:'range_all',  name:'Optics',         emoji:'🔭',  cost:150, desc:'All towers +12% range',       effect:{rangeMult:0.12} },
    { id:'rate_all',   name:'Logistics',      emoji:'📦',  cost:180, desc:'All towers -10% fire delay',  effect:{rateMult:-0.10} },
    { id:'gold_mine',  name:'Gold Mine',      emoji:'⛏️',  cost:300, desc:'+5 gold per enemy kill',     effect:{goldBonus:5} },
    { id:'lives_up',   name:'Medic Corps',    emoji:'💊',  cost:250, desc:'+5 lives',                   effect:{livesBonus:5} },
    { id:'interest',   name:'Bank',           emoji:'🏦',  cost:400, desc:'3% interest on gold/wave',   effect:{interest:0.03} },
    { id:'slow_all',   name:'Time Warp',      emoji:'⏳',  cost:220, desc:'Frost/Cryo towers +20% slow', effect:{slowBoost:0.20} },
    { id:'splash_all', name:'Demolitions',    emoji:'💥',  cost:280, desc:'Splash towers +30% radius',  effect:{splashMult:0.30} },
    { id:'chain_all',  name:'Conductor',      emoji:'🌩️',  cost:260, desc:'Tesla chains +2 targets',    effect:{chainBonus:2} },
    { id:'detect',     name:'Radar',          emoji:'📡',  cost:200, desc:'All towers detect stealth',   effect:{detectStealth:true} },
  ];

  function renderPanel(container) {
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#07080e;font-family:-apple-system,monospace';
    container.innerHTML = '';
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;border-top:1px solid rgba(255,255,255,.07);flex-shrink:0;background:#040508';
    [['play','🗼 Play'],['scores','🏆 Scores'],['guide','📖 Guide']].forEach(([id,label],idx)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${idx===0?'#f59e0b':'rgba(255,255,255,.35)'}`;
      t.textContent=label;
      t.addEventListener('click',()=>{
        tabBar.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#f59e0b':'rgba(255,255,255,.35)');
        track.innerHTML='';
        if(_game2){_game2.destroy(true);_game2=null;}
        if(id==='play') renderPlay(track);
        else if(id==='scores') renderScores(track);
        else renderGuide(track);
      });
      tabBar.appendChild(t);
    });
    container.appendChild(track);
    container.appendChild(tabBar);
    renderPlay(track);
  }

  function renderScores(container) {
    container.style.cssText='flex:1;overflow-y:auto;padding:16px;background:#07080e';
    const scores=loadScores();
    let html=`<div style="font-size:17px;font-weight:700;color:#f59e0b;margin-bottom:14px">🏆 Hall of Fame</div>`;
    if(!scores.length){html+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">No games yet.</div>';}
    else scores.forEach((s,i)=>{
      const medal=['🥇','🥈','🥉'][i]||`#${i+1}`;
      html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${medal}</span><div style="flex:1"><div style="color:#fff;font-size:12px">${s.name||'Commander'}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">Wave ${s.wave} · ${s.kills||0} kills · ${s.towers||0} towers</div></div>
        <div style="color:#f59e0b;font-size:14px;font-weight:700">${s.score.toLocaleString()}</div></div>`;
    });
    container.innerHTML=html;
  }

  function renderGuide(container) {
    container.style.cssText='flex:1;overflow-y:auto;padding:14px;background:#07080e';
    let html=`<div style="font-size:17px;font-weight:700;color:#f59e0b;margin-bottom:12px">📖 Tower Guide</div>`;
    Object.entries(TOWER_DEFS).forEach(([id,t])=>{
      html+=`<div style="padding:8px 10px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.04);border-left:3px solid #${t.col.toString(16).padStart(6,'0')}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:600;color:#fff">${t.emoji} ${t.name}</span>
          <span style="font-size:11px;color:#f59e0b">${t.cost}g</span></div>
        <div style="font-size:10px;color:rgba(255,255,255,.45);margin-top:2px">${t.desc}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.25);margin-top:4px">${t.upg.map((u,i)=>`Lv${i+2}: ${u.label} (${u.cost}g)`).join(' → ')}</div></div>`;
    });
    html+=`<div style="font-size:14px;font-weight:700;color:#f59e0b;margin:16px 0 10px">⚠️ Enemy Types</div>`;
    Object.entries(ENEMY_TYPES).forEach(([id,e])=>{
      const tags=[];
      if(e.armor) tags.push(`🛡️ ${Math.round(e.armor*100)}% armor`);
      if(e.flying) tags.push('✈️ flying');
      if(e.stealth) tags.push('👻 stealth');
      if(e.heals) tags.push('💚 heals allies');
      if(e.splits) tags.push('🔀 splits on death');
      if(e.rages) tags.push('😡 rages below 50% HP');
      if(e.boss) tags.push('👑 BOSS');
      html+=`<div style="padding:7px 10px;border-radius:8px;margin-bottom:5px;background:rgba(255,255,255,.04);border-left:3px solid ${e.col}">
        <div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:#fff">${e.name}</span>
        <span style="font-size:10px;color:#fbbf24">${e.rew}g</span></div>
        ${tags.length?`<div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${tags.join(' · ')}</div>`:''}
      </div>`;
    });
    container.innerHTML=html;
  }

  function renderPlay(container) {
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';

    function initPhaser() {
      const Phaser=window.Phaser;
      const W=container.offsetWidth||360;
      const H=container.offsetHeight||500;
      const BAR_H=52;
      const TOP_H=38;

      function makePathA(W,H) {
        const m=20;
        return [
          {x:m,          y:-30},
          {x:m,          y:H*.15},
          {x:W*.48,      y:H*.15},
          {x:W*.48,      y:H*.38},
          {x:W*.18,      y:H*.38},
          {x:W*.18,      y:H*.62},
          {x:W*.70,      y:H*.62},
          {x:W*.70,      y:H*.82},
          {x:W-m,        y:H*.82},
          {x:W-m,        y:H+30},
        ];
      }
      function makePathB(W,H) {
        const m=20;
        return [
          {x:W-m,        y:-30},
          {x:W-m,        y:H*.28},
          {x:W*.55,      y:H*.28},
          {x:W*.55,      y:H*.50},
          {x:W*.82,      y:H*.50},
          {x:W*.82,      y:H*.72},
          {x:W*.30,      y:H*.72},
          {x:W*.30,      y:H*.90},
          {x:m,          y:H*.90},
          {x:m,          y:H+30},
        ];
      }

      let pathA=[], pathB=[];

      function isOnAnyPath(x,y,rad=32) {
        for(const pts of [pathA,pathB]) {
          for(let i=0;i<pts.length-1;i++){
            const a=pts[i],b=pts[i+1];
            const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
            if(!len2)continue;
            const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));
            if((x-a.x-t*dx)**2+(y-a.y-t*dy)**2<rad*rad) return true;
          }
        }
        return false;
      }

      let gold=200, lives=30, score=0, waveIdx=0;
      let towers=[], enemies=[], bullets=[], particles=[], killFeed=[];
      let selectedType='archer', gameOver=false, betweenWaves=false;
      let combo=0, comboTimer=0, killCount=0, waveActive=false;
      let globalMods={ dmgMult:0, rangeMult:0, rateMult:0, goldBonus:0,
                       livesBonus:0, interest:0, slowBoost:0, splashMult:0,
                       chainBonus:0, detectStealth:false };
      let purchasedUpgrades=new Set();
      let scene=null;
      let upgradeOverlay=null, shopOverlay=null, towerOverlay=null;
      let hudTexts={}, killFeedTexts=[];

      // FIX: track whether shop is actively being shown
      let shopIsOpen=false;
      let nextWaveTimer=null;

      function preload() {}

      function create() {
        scene=this;
        pathA=makePathA(W,H-BAR_H+TOP_H);
        pathB=makePathB(W,H-BAR_H+TOP_H);

        drawBackground(this);
        drawPath(this,pathA,0x5b21b6,0x1a2040);
        drawPath(this,pathB,0x0e7490,0x0f2540);
        drawPathLabels(this);
        createHUD(this);

        this.input.on('pointerdown',ptr=>{
          if(gameOver)return;
          removeAllOverlays();
          const {x,y}=ptr;
          const clickedTower=towers.find(t=>Math.hypot(t.x-x,t.y-y)<22);
          if(clickedTower){showTowerOverlay(clickedTower);return;}
          if(y>H-BAR_H||y<TOP_H) return;
          if(isOnAnyPath(x,y)){showFloatMsg('Path blocked!',x,y-30);return;}
          if(towers.some(t=>Math.hypot(t.x-x,t.y-y)<36)){showFloatMsg('Too close!',x,y-30);return;}
          const cfg=TOWER_DEFS[selectedType];
          if(gold<cfg.cost){showFloatMsg('Need more gold!',x,y-30);return;}
          gold-=cfg.cost;
          placeTower(this,x,y,selectedType);
          updateHUD();
        });

        const preview=this.add.graphics().setDepth(50);
        this.input.on('pointermove',ptr=>{
          preview.clear();
          if(gameOver||ptr.y>H-BAR_H||ptr.y<TOP_H) return;
          const cfg=TOWER_DEFS[selectedType];
          const ok=!isOnAnyPath(ptr.x,ptr.y)&&!towers.some(t=>Math.hypot(t.x-ptr.x,t.y-ptr.y)<36);
          preview.lineStyle(1,ok?cfg.col:0xff4444,0.3);
          preview.strokeCircle(ptr.x,ptr.y,getEffectiveRange(cfg));
          preview.fillStyle(ok?cfg.col:0xff4444,0.2);
          preview.fillCircle(ptr.x,ptr.y,14);
        });

        this.time.delayedCall(1800,()=>startWave(this));
      }

      function getEffectiveRange(cfg) { return cfg.range*(1+globalMods.rangeMult); }
      function getEffectiveDmg(cfg)   { return cfg.dmg*(1+globalMods.dmgMult); }
      function getEffectiveRate(cfg)  { return cfg.rate*(1+globalMods.rateMult); }

      function drawBackground(scene) {
        const bg=scene.add.graphics();
        bg.fillStyle(0x07080e); bg.fillRect(0,0,W,H);
        const gr=scene.add.graphics(); gr.lineStyle(0.5,0xffffff,0.025);
        for(let x=0;x<W;x+=36) gr.lineBetween(x,0,x,H);
        for(let y=0;y<H;y+=36) gr.lineBetween(0,y,W,y);
        const st=scene.add.graphics();
        for(let i=0;i<80;i++){
          st.fillStyle(0xffffff,Math.random()*.55+.05);
          st.fillCircle(Math.random()*W,Math.random()*H,Math.random()<.1?1.4:.6);
        }
        const nb=scene.add.graphics();
        [[0x3b1d6e,W*.3,H*.4,90],[0x0c3b52,W*.7,H*.6,80],[0x1a0a30,W*.5,H*.2,70]].forEach(([c,x,y,r])=>{
          nb.fillStyle(c,0.18); nb.fillCircle(x,y,r);
        });
      }

      function drawPath(scene,pts,col1,col2) {
        const g=scene.add.graphics();
        g.lineStyle(48,0x000000,.5); g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p.x+3,p.y+3):g.moveTo(p.x+3,p.y+3)); g.strokePath();
        g.lineStyle(44,col2,1); g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        g.lineStyle(36,0x131628,1); g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        g.lineStyle(2,col1,.65); g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        for(let i=0;i<pts.length-1;i++){
          const a=pts[i],b=pts[i+1];
          for(let s=0;s<10;s+=2.5){
            const t0=s/10,t1=(s+.5)/10;
            g.lineStyle(1.2,0xffffff,.08);
            g.beginPath(); g.moveTo(a.x+t0*(b.x-a.x),a.y+t0*(b.y-a.y));
            g.lineTo(a.x+t1*(b.x-a.x),a.y+t1*(b.y-a.y)); g.strokePath();
          }
        }
      }

      function drawPathLabels(scene) {
        const s=scene.add.graphics();
        s.fillStyle(0x5b21b6,.8); s.fillTriangle(pathA[0].x-8,TOP_H+20,pathA[0].x+8,TOP_H+20,pathA[0].x,TOP_H+8);
        s.fillStyle(0x0e7490,.8); s.fillTriangle(pathB[0].x-8,TOP_H+20,pathB[0].x+8,TOP_H+20,pathB[0].x,TOP_H+8);
      }

      function placeTower(scene,x,y,type) {
        const base=TOWER_DEFS[type];
        const cfg={...base, upgrades:JSON.parse(JSON.stringify(base.upg)), upg:undefined};

        const g=scene.add.graphics().setPosition(x,y).setDepth(15);
        drawTowerGfx(g,cfg,0);
        g.setInteractive(new Phaser.Geom.Circle(0,0,20),Phaser.Geom.Circle.Contains);

        const ico=scene.add.text(x,y-1,cfg.emoji,{fontSize:'13px'}).setOrigin(0.5).setDepth(16);
        const rg=scene.add.graphics().setPosition(x,y).setDepth(9);
        rg.lineStyle(1,cfg.col,.1); rg.strokeCircle(0,0,getEffectiveRange(cfg)); rg.visible=false;
        g.on('pointerover',()=>rg.visible=true); g.on('pointerout',()=>rg.visible=false);
        const lvlTxt=scene.add.text(x+14,y-14,'1',{fontSize:'7px',color:'#ffffff60',fontFamily:'monospace'}).setOrigin(0.5).setDepth(17);

        emitBurst(scene,x,y,cfg.col,12);
        scene.tweens.add({targets:[g,ico],scaleX:{from:0,to:1},scaleY:{from:0,to:1},duration:200,ease:'Back.Out'});

        const tower={x,y,type,cfg,g,ico,rg,lvlTxt,lastFire:0,level:0,totalDmg:0,kills:0};
        towers.push(tower);
        score+=8; updateHUD();
        return tower;
      }

      function drawTowerGfx(g,cfg,level) {
        g.clear();
        if(level>=3){g.fillStyle(cfg.col,.08);g.fillCircle(0,0,26);}
        if(level>=2){g.fillStyle(cfg.col,.14);g.fillCircle(0,0,22);}
        g.fillStyle(0x080b1a); g.fillCircle(0,0,19);
        g.fillStyle(0x111830); g.fillCircle(0,0,16);
        g.lineStyle(level>=1?2.5:1.8,cfg.col,level>=2?1:.8); g.strokeCircle(0,0,12);
        if(level>=1){g.lineStyle(1,cfg.col,.3);g.strokeCircle(0,0,16);}
        if(level>=2){g.lineStyle(.8,cfg.col,.18);g.strokeCircle(0,0,20);}
        if(cfg.splash){g.fillStyle(cfg.col,.5);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;g.fillCircle(Math.cos(a)*5,Math.sin(a)*5,2);}}
        else if(cfg.chain){g.lineStyle(1.5,cfg.col,.7);g.lineBetween(-6,-4,6,-4);g.lineBetween(-6,0,6,0);g.lineBetween(-6,4,6,4);}
        else if(cfg.poison){g.fillStyle(cfg.col,.6);g.fillCircle(0,0,4);}
        else if(cfg.pierce){g.lineStyle(2.5,cfg.col,.9);g.lineBetween(-7,0,7,0);}
        else if(cfg.pull){g.lineStyle(1.5,cfg.col,.5);for(let k=0;k<4;k++){const a=k*Math.PI*.5;g.lineBetween(Math.cos(a)*3,Math.sin(a)*3,Math.cos(a)*8,Math.sin(a)*8);}}
        else if(cfg.freeze){g.fillStyle(cfg.col,.5);g.fillRect(-3,-7,6,14);g.fillRect(-7,-3,14,6);}
        else if(cfg.burn){g.fillStyle(cfg.col,.7);g.fillTriangle(0,-7,-5,5,5,5);}
        else{g.lineStyle(1.5,cfg.col,.5);g.lineBetween(-5,0,5,0);g.lineBetween(0,-5,0,5);}
      }

      // ── WAVE MANAGEMENT ─────────────────────────────────────────────────────
      function startWave(scene) {
        if(gameOver) return;
        waveActive=true;
        betweenWaves=false;
        shopIsOpen=false;
        removeAllOverlays();

        const ws=WAVE_SCRIPT[Math.min(waveIdx,WAVE_SCRIPT.length-1)];
        const scale=Math.pow(1.22,Math.max(0,waveIdx-WAVE_SCRIPT.length+1));
        waveIdx++;
        if(hudTexts.wave) hudTexts.wave.setText(`Wave ${waveIdx}/${WAVE_SCRIPT.length}`);

        showFloatMsg2(scene, ws.bossWave?`⚠ BOSS WAVE ${waveIdx}`:`⚔ Wave ${waveIdx}`, W/2, H/2-50, ws.bossWave?'#ff4444':'#fbbf24');

        ws.squads.forEach(sq=>{
          const offset=sq.offset||0;
          for(let i=0;i<sq.count;i++){
            const delay=offset+i*sq.delay;
            const pathChoice=Math.random()<0.5?pathA:pathB;
            scene.time.delayedCall(delay,()=>{
              if(gameOver) return;
              const def=ENEMY_TYPES[sq.type];
              spawnEnemy(scene, {
                hp: Math.round(def.hp*scale),
                spd: Math.min(def.spd+(waveIdx-1)*1.5, 160),
                reward: Math.round(def.rew*scale),
                col: def.col,
                shape: def.shape,
                size: def.size,
                armor: def.armor||0,
                flying: !!def.flying,
                stealth: !!def.stealth,
                heals: !!def.heals,
                splits: !!def.splits,
                rages: !!def.rages,
                boss: !!def.boss,
                name: def.name,
                typeid: sq.type,
              }, pathChoice);
            });
          }
        });

        const maxDelay=(ws.squads.reduce((mx,sq)=>Math.max(mx,(sq.offset||0)+sq.count*sq.delay),0))+4000;
        scene.time.delayedCall(maxDelay,()=>checkWaveEnd(scene,ws));
      }

      function checkWaveEnd(scene,ws) {
        if(gameOver) return;
        if(enemies.length>0){
          scene.time.delayedCall(2000,()=>checkWaveEnd(scene,ws));
          return;
        }
        waveActive=false;
        betweenWaves=true;

        if(globalMods.interest>0){
          const bonus=Math.floor(gold*globalMods.interest);
          if(bonus>0){gold+=bonus;showFloatMsg2(scene,`+${bonus}g interest`,W/2,H/2-30,'#f59e0b');}
        }

        const bonus=50+waveIdx*15;
        gold+=bonus;
        score+=bonus*2;
        updateHUD();
        showFloatMsg2(scene,`Wave Clear! +${bonus}g`,W/2,H/2-50,'#10b981');

        if(waveIdx>=WAVE_SCRIPT.length){
          triggerVictory();
          return;
        }

        // FIX: Show shop and wait for player to close it before scheduling next wave
        scene.time.delayedCall(1800,()=>{
          if(!gameOver) showWaveShop(scene);
        });
      }

      // FIX: Removed auto-close timer; next wave only starts when player clicks Continue/buys
      function startNextWave() {
        if(gameOver||!betweenWaves) return;
        betweenWaves=false;
        shopIsOpen=false;
        // Small delay so player sees shop close before wave starts
        if(scene) scene.time.delayedCall(600,()=>startWave(scene));
      }

      function spawnEnemy(scene,data,path) {
        const colNum=parseInt(data.col.replace('#',''),16);
        const g=scene.add.graphics().setDepth(10);
        const hpBar=scene.add.graphics().setDepth(12);
        const fx=scene.add.graphics().setDepth(11);
        const trail=scene.add.graphics().setDepth(8);
        const nametag=data.boss?scene.add.text(0,0,data.name,{fontSize:'8px',color:'#ffd700',fontFamily:'monospace',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setDepth(13):null;

        const e={
          g,hpBar,fx,trail,nametag,
          hp:data.hp,maxHp:data.hp,
          spd:data.spd,col:data.col,colNum,
          reward:data.reward,
          shape:data.shape,size:data.size,
          armor:data.armor||0,
          flying:data.flying,stealth:data.stealth,
          heals:data.heals,splits:data.splits,
          rages:data.rages,boss:data.boss,
          name:data.name,typeid:data.typeid,
          path,pathIdx:0,progress:0,
          x:path[0].x,y:path[0].y,
          dead:false,frozen:false,freezeTimer:0,
          slowTimer:0,slowFactor:1,
          poisonTimer:0,poisonDmg:0,
          burnTimer:0,burnDmg:0,
          raging:false,
          pulseT:Math.random()*Math.PI*2,
          trailHist:[],
          healTimer:0,
          stealthVisible:false,stealthFlicker:0,
          shieldHp:data.armor?Math.round(data.hp*data.armor):0,
          splitDone:false,
        };
        enemies.push(e);
        drawEnemy(e);
        return e;
      }

      function drawEnemy(e) {
        e.g.clear();
        const r=e.size,c=e.colNum;
        const alpha=e.stealth&&!e.stealthVisible?0.35:1;
        e.g.setAlpha(alpha);
        if(e.shape==='diamond'){
          e.g.fillStyle(c,1); e.g.fillTriangle(0,-r,r*.7,0,0,r); e.g.fillTriangle(0,-r,-r*.7,0,0,r);
          if(e.boss){e.g.lineStyle(2,0xffd700,.9);e.g.strokeTriangle(0,-r,r*.7,0,0,r);e.g.strokeTriangle(0,-r,-r*.7,0,0,r);}
          else{e.g.lineStyle(1.5,0xffffff,.25);e.g.strokeTriangle(0,-r,r*.7,0,0,r);}
          e.g.fillStyle(0xffffff,.18);e.g.fillTriangle(0,-r*.5,r*.3,0,0,r*.2);
        } else if(e.shape==='hex'){
          const pts=[];
          for(let k=0;k<6;k++){const a=k/6*Math.PI*2-Math.PI/6;pts.push({x:Math.cos(a)*r,y:Math.sin(a)*r});}
          e.g.fillStyle(c,1);
          e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.fillPath();
          e.g.lineStyle(e.boss?2.5:1.5,e.boss?0xffd700:0xffffff,.3);
          e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.strokePath();
        } else {
          e.g.fillStyle(c,1);e.g.fillCircle(0,0,r);
          e.g.fillStyle(0xffffff,.18);e.g.fillCircle(-r*.22,-r*.25,r*.32);
          e.g.lineStyle(e.boss?2:1.5,e.boss?0xffd700:0xffffff,.3);e.g.strokeCircle(0,0,r);
        }
        if(e.flying){e.g.fillStyle(0xffffff,.5);e.g.fillCircle(0,-r-3,2.5);}
        if(e.heals){e.g.lineStyle(1.5,0x34d399,.8);e.g.lineBetween(-3,0,3,0);e.g.lineBetween(0,-3,0,3);}
        if(e.stealth){e.g.lineStyle(1,0x475569,.5);e.g.strokeCircle(0,0,r+3);}
      }

      function update(time,delta) {
        if(gameOver) return;
        const dt=delta/1000;
        if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0){combo=0;if(hudTexts.combo)hudTexts.combo.setText('');}}

        for(let i=enemies.length-1;i>=0;i--){
          const e=enemies[i]; if(e.dead) continue;
          e.pulseT+=0.05;
          const pulse=Math.sin(e.pulseT)*.5+.5;

          if(e.heals){
            e.healTimer-=dt;
            if(e.healTimer<=0){
              e.healTimer=1.2;
              enemies.forEach(ne=>{if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<60){ne.hp=Math.min(ne.maxHp,ne.hp+ne.maxHp*.04);}});
              e.fx.clear();e.fx.setPosition(e.x,e.y);e.fx.lineStyle(2,0x34d399,.6);e.fx.strokeCircle(0,0,60);
            }
          }

          if(e.freezeTimer>0){
            e.freezeTimer-=dt;
            e.fx.clear();e.fx.setPosition(e.x,e.y);
            e.fx.lineStyle(3,0x67e8f9,.7+pulse*.3);e.fx.strokeCircle(0,0,e.size+5);
            if(e.freezeTimer<=0){e.frozen=false;}
            else{e.g.setPosition(e.x,e.y);e.hpBar.setPosition(e.x,e.y);if(e.nametag)e.nametag.setPosition(e.x,e.y-e.size-16);continue;}
          } else {
            if(e.slowTimer>0){
              e.slowTimer-=dt;
              e.fx.clear();e.fx.setPosition(e.x,e.y);
              e.fx.lineStyle(2,0x38bdf8,.4+pulse*.4);e.fx.strokeCircle(0,0,e.size+4);
            } else {
              e.slowFactor=1; e.fx.clear();
            }
          }

          if(e.poisonTimer>0){
            e.poisonTimer-=dt; e.hp-=e.poisonDmg*dt;
            e.fx.clear();e.fx.setPosition(e.x,e.y);
            for(let k=0;k<4;k++){const ba=time*.004+k*Math.PI*.5;e.fx.fillStyle(0xa3e635,.7);e.fx.fillCircle(Math.cos(ba)*(e.size+4),Math.sin(ba)*(e.size+4),2.5);}
            if(e.hp<=0){killEnemy(e,i);continue;}
          }

          if(e.burnTimer>0){
            e.burnTimer-=dt; e.hp-=e.burnDmg*dt;
            if(e.hp<=0){killEnemy(e,i);continue;}
          }

          if(e.rages&&!e.raging&&e.hp<e.maxHp*.5){
            e.raging=true;e.spd*=1.7;
            showFloatMsg2(scene,'ENRAGED!',e.x,e.y-30,'#ff4444');
          }

          if(e.stealth){
            e.stealthFlicker+=dt;
            const detected=globalMods.detectStealth||towers.some(t=>t.type==='laser'&&Math.hypot(t.x-e.x,t.y-e.y)<t.cfg.range);
            e.stealthVisible=detected;
            e.g.setAlpha(e.stealthVisible?1:0.3+Math.sin(e.stealthFlicker*3)*.1);
          }

          if(e.boss){
            e.g.clear(); const r=e.size,c=e.colNum;
            if(e.shape==='diamond'){
              e.g.lineStyle(3,0xffd700,.12+pulse*.22);e.g.strokeCircle(0,0,r+6+pulse*4);
              e.g.fillStyle(c,1);e.g.fillTriangle(0,-r,r*.7,0,0,r);e.g.fillTriangle(0,-r,-r*.7,0,0,r);
              e.g.lineStyle(2.5,0xffd700,.7+pulse*.3);e.g.strokeTriangle(0,-r,r*.7,0,0,r);e.g.strokeTriangle(0,-r,-r*.7,0,0,r);
            } else {
              const pts=[];for(let k=0;k<6;k++){const a=k/6*Math.PI*2-Math.PI/6;pts.push({x:Math.cos(a)*r,y:Math.sin(a)*r});}
              e.g.lineStyle(3,0xffd700,.12+pulse*.22);e.g.strokeCircle(0,0,r+6+pulse*4);
              e.g.fillStyle(c,1);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.fillPath();
              e.g.lineStyle(2.5,0xffd700,.7+pulse*.3);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.strokePath();
            }
            for(let k=0;k<4;k++){const oa=time*.003+k*Math.PI*.5;e.g.fillStyle(0xffd700,.9);e.g.fillCircle(Math.cos(oa)*(r+10),Math.sin(oa)*(r+10),2.5);}
          }

          e.trailHist.push({x:e.x,y:e.y});
          if(e.trailHist.length>10) e.trailHist.shift();
          e.trail.clear();
          e.trailHist.forEach((p,j)=>{
            e.trail.fillStyle(e.colNum,(j/e.trailHist.length)*.25);
            e.trail.fillCircle(p.x,p.y,(j/e.trailHist.length)*e.size*.5);
          });

          // Movement
          if(!e.frozen){
            const effSpd=e.spd*e.slowFactor;
            e.progress+=effSpd*dt;
            const path=e.path;
            while(e.pathIdx<path.length-2){
              const a=path[e.pathIdx],b=path[e.pathIdx+1];
              const sLen=Math.hypot(b.x-a.x,b.y-a.y);
              if(e.progress<sLen) break;
              e.progress-=sLen;e.pathIdx++;
            }

            // FIX: Enemy reached end — properly remove lives
            if(e.pathIdx>=path.length-1){
              e.dead=true;

              // Calculate life loss based on enemy type
              let lifeLoss=1;
              if(e.boss) lifeLoss=5;
              else if(e.typeid==='titan') lifeLoss=4;
              else if(e.typeid==='tank'||e.typeid==='berserker'||e.typeid==='armored') lifeLoss=2;

              lives=Math.max(0,lives-lifeLoss);

              // Visual feedback
              cleanupEnemy(e);
              enemies.splice(i,1);
              if(scene) scene.cameras.main.shake(300,0.012);
              updateHUD();

              showFloatMsg2(scene,`-${lifeLoss} ❤️`,W/2,H*.35,'#ef4444');

              if(lives<=0){triggerGameOver();return;}
              continue;
            }

            const a=e.path[e.pathIdx],b=e.path[e.pathIdx+1];
            const sLen=Math.hypot(b.x-a.x,b.y-a.y)||1;
            const t=e.progress/sLen;
            e.x=a.x+t*(b.x-a.x);e.y=a.y+t*(b.y-a.y);
          }

          e.g.setPosition(e.x,e.y);
          e.hpBar.setPosition(e.x,e.y);
          if(e.nametag) e.nametag.setPosition(e.x,e.y-e.size-16);

          const bw=e.boss?38:(e.size>12?28:22);
          e.hpBar.clear();
          e.hpBar.fillStyle(0x000000,.7);e.hpBar.fillRect(-bw/2,-e.size-13,bw,4);
          const pct=Math.max(0,e.hp/e.maxHp);
          e.hpBar.fillStyle(pct>.6?0x22c55e:pct>.3?0xfbbf24:0xef4444);
          e.hpBar.fillRect(-bw/2,-e.size-13,bw*pct,4);
          if(e.boss){e.hpBar.lineStyle(1,0xffd700,.5);e.hpBar.strokeRect(-bw/2,-e.size-13,bw,4);}
          if(e.shieldHp>0){
            e.hpBar.fillStyle(0x94a3b8);
            e.hpBar.fillRect(-bw/2,-e.size-18,bw*(e.shieldHp/(e.maxHp*(e.armor||.25))),3);
          }
        }

        // Tower firing
        towers.forEach(tower=>{
          const effRate=getEffectiveRate(tower.cfg);
          if(time-tower.lastFire<effRate) return;
          const effRange=getEffectiveRange(tower.cfg);
          let candidates=enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=effRange);
          if(!globalMods.detectStealth&&tower.type!=='laser'){
            candidates=candidates.filter(e=>!e.stealth||e.stealthVisible);
          }
          if(tower.cfg.minRange){candidates=candidates.filter(e=>Math.hypot(tower.x-e.x,tower.y-e.y)>=tower.cfg.minRange);}
          if(!candidates.length) return;
          candidates.sort((a,b)=>(b.pathIdx*1000+b.progress)-(a.pathIdx*1000+a.progress));
          const tgt=candidates[0];
          tower.lastFire=time;
          if(tower.cfg.chain) doChainAttack(tower,tgt,time);
          else if(tower.cfg.pierce) doPierceAttack(tower,tgt,time);
          else if(tower.cfg.pull) doPullAttack(tower,candidates,time);
          else if(tower.cfg.burn) doFlameCone(tower,tgt,time);
          else fireBullet(scene,tower,tgt,getEffectiveDmg(tower.cfg));
        });

        for(let i=bullets.length-1;i>=0;i--){
          const b=bullets[i];
          if(!b.target||b.target.dead){b.g.destroy();bullets.splice(i,1);continue;}
          const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y,dist=Math.hypot(dx,dy);
          if(dist<9){applyHit(b);b.g.destroy();bullets.splice(i,1);}
          else{const spd=240/60;b.g.x+=dx/dist*spd;b.g.y+=dy/dist*spd;}
        }

        for(let i=particles.length-1;i>=0;i--){
          const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt;
          p.g.setPosition(p.x,p.y).setAlpha(Math.max(0,p.life/p.maxLife));
          if(p.life<=0){p.g.destroy();particles.splice(i,1);}
        }

        killFeedTexts=killFeedTexts.filter(t=>t.active);
      }

      function doChainAttack(tower,firstTarget,time) {
        const maxChain=Math.min((tower.cfg.chain||3)+(globalMods.chainBonus||0),8);
        let targets=[firstTarget],last=firstTarget;
        for(let k=1;k<maxChain;k++){
          const next=enemies.find(e=>!e.dead&&e!==last&&!targets.includes(e)&&Math.hypot(last.x-e.x,last.y-e.y)<70);
          if(next){targets.push(next);last=next;}else break;
        }
        targets.forEach((t,idx)=>fireBullet(scene,tower,t,getEffectiveDmg(tower.cfg)*Math.pow(.75,idx)));
        for(let k=0;k<targets.length-1;k++) emitChainSpark(scene,targets[k],targets[k+1]);
      }

      function doPierceAttack(tower,firstTarget,time) {
        const effRange=getEffectiveRange(tower.cfg);
        const dx=firstTarget.x-tower.x,dy=firstTarget.y-tower.y;
        const len=Math.hypot(dx,dy);
        const nx=dx/len,ny=dy/len;
        const hit=enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=effRange);
        hit.sort((a,b)=>{
          const da=Math.abs((a.x-tower.x)*ny-(a.y-tower.y)*nx);
          const db=Math.abs((b.x-tower.x)*ny-(b.y-tower.y)*nx);
          return da-db;
        });
        const pierced=hit.slice(0,5);
        pierced.forEach((e,idx)=>{
          const dmg=getEffectiveDmg(tower.cfg)*Math.pow(.85,idx);
          e.hp-=dmg; tower.totalDmg+=dmg;
          if(e.hp<=0) killEnemy(e,enemies.indexOf(e));
        });
        emitLaserBeam(scene,tower,firstTarget,tower.cfg.col);
      }

      function doPullAttack(tower,candidates,time) {
        const effRange=getEffectiveRange(tower.cfg);
        candidates.forEach(e=>{
          const dx=tower.x-e.x,dy=tower.y-e.y,d=Math.hypot(dx,dy)||1;
          const force=60*(1-d/effRange);
          e.x+=dx/d*force*(1/60);e.y+=dy/d*force*(1/60);
          e.hp-=getEffectiveDmg(tower.cfg)*.3;
          if(e.hp<=0) killEnemy(e,enemies.indexOf(e));
        });
        emitVortexFx(scene,tower);
      }

      function doFlameCone(tower,tgt,time) {
        const effRange=getEffectiveRange(tower.cfg);
        const angle=Math.atan2(tgt.y-tower.y,tgt.x-tower.x);
        const coneAngle=Math.PI/4;
        enemies.forEach(e=>{
          if(e.dead) return;
          const d=Math.hypot(e.x-tower.x,e.y-tower.y);
          if(d>effRange) return;
          const ea=Math.atan2(e.y-tower.y,e.x-tower.x);
          let da=Math.abs(ea-angle);if(da>Math.PI)da=Math.PI*2-da;
          if(da<coneAngle){
            const dmg=getEffectiveDmg(tower.cfg)*(1-da/coneAngle*.5);
            e.hp-=dmg; tower.totalDmg+=dmg;
            e.burnTimer=2.5;e.burnDmg=tower.cfg.dmg*.15;
            if(e.hp<=0) killEnemy(e,enemies.indexOf(e));
          }
        });
        emitFlameFx(scene,tower,angle,effRange,tower.cfg.col);
      }

      function applyHit(b) {
        const e=b.target,tower=b.tower;
        if(e.dead) return;
        if(e.shieldHp>0&&e.armor>0){
          e.shieldHp-=b.dmg*(1-e.armor);
          if(e.shieldHp<=0){e.shieldHp=0;emitBurst(scene,e.x,e.y,0x94a3b8,8);}
          return;
        }
        let dmg=b.dmg;
        if(e.armor>0) dmg*=(1-e.armor);
        e.hp-=dmg; tower.totalDmg+=dmg;
        if(tower.cfg.slow){e.slowTimer=2.0;e.slowFactor=tower.cfg.slow+(globalMods.slowBoost||0);}
        if(tower.cfg.freeze){e.freezeTimer=1.5;e.frozen=true;emitBurst(scene,e.x,e.y,0x67e8f9,6);}
        if(tower.cfg.poison){e.poisonTimer=4.5;e.poisonDmg=tower.cfg.dmg*.25;}
        if(tower.cfg.burn){e.burnTimer=2.5;e.burnDmg=tower.cfg.dmg*.15;}
        if(tower.cfg.splash>0){
          const splashR=tower.cfg.splash*(1+(globalMods.splashMult||0));
          enemies.forEach(ne=>{
            if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<splashR){
              ne.hp-=dmg*.5;
              if(ne.hp<=0) killEnemy(ne,enemies.indexOf(ne));
            }
          });
          emitSplash(scene,e.x,e.y,tower.cfg.col,splashR);
        }
        if(e.hp<=0) killEnemy(e,enemies.indexOf(e));
      }

      function killEnemy(e,idx) {
        if(e.dead) return;
        e.dead=true;
        killCount++;
        combo++; comboTimer=3.0;
        const mult=combo>=10?3:combo>=5?2:combo>=3?1.5:1;
        const earned=Math.round(e.reward*mult)+(globalMods.goldBonus||0);
        gold+=earned;
        score+=earned*4+(e.boss?2000:e.typeid==='titan'?800:0);
        updateHUD();
        if(combo>=3&&hudTexts.combo){
          const comboStr=combo>=10?`${combo}x MEGA COMBO!`:combo>=5?`${combo}x COMBO!`:`${combo}x Combo`;
          hudTexts.combo.setText(comboStr).setAlpha(1);
          scene.tweens.add({targets:hudTexts.combo,alpha:0,delay:2200,duration:500});
        }
        addKillFeed(e.name,earned,e.boss);
        if(e.splits&&!e.splitDone){
          e.splitDone=true;
          for(let k=0;k<3;k++){
            const def=ENEMY_TYPES['swarm'];
            const angle=k/3*Math.PI*2;
            const ne=spawnEnemy(scene,{...def,hp:Math.round(e.maxHp*.2),spd:def.spd,reward:Math.round(e.reward*.2),typeid:'swarm'},e.path);
            ne.x=e.x+Math.cos(angle)*10;ne.y=e.y+Math.sin(angle)*10;
            ne.pathIdx=e.pathIdx;ne.progress=e.progress;
          }
        }
        const cnt=e.boss?40:(e.size>12?20:10);
        for(let k=0;k<cnt;k++){
          const pg=scene.add.graphics().setDepth(70);
          pg.fillStyle(k%2===0?e.colNum:0xffffff,1);
          pg.fillCircle(0,0,e.boss?5:e.size>12?3.5:2.5);
          pg.setPosition(e.x,e.y);
          particles.push({g:pg,x:e.x,y:e.y,vx:(Math.random()-.5)*(e.boss?280:180),vy:(Math.random()-.9)*(e.boss?300:210),life:Math.random()*.9+.3,maxLife:1.4});
        }
        emitBurst(scene,e.x,e.y,e.colNum,0);
        if(e.boss){scene.cameras.main.shake(500,.018);}
        cleanupEnemy(e);
        if(idx>=0&&idx<enemies.length) enemies.splice(idx,1);
      }

      function cleanupEnemy(e){
        e.g.destroy();e.hpBar.destroy();e.fx.destroy();e.trail.destroy();
        if(e.nametag) e.nametag.destroy();
      }

      function fireBullet(scene,tower,target,dmg) {
        const g=scene.add.graphics().setDepth(40);
        const isBig=tower.cfg.splash>0,isChain=!!tower.cfg.chain,isCryo=tower.cfg.freeze;
        const r=isBig?5.5:(isChain?4:2.5);
        g.fillStyle(tower.cfg.col,1);
        if(isBig){g.fillCircle(0,0,r);g.lineStyle(2,0xff8800,.6);g.strokeCircle(0,0,r);}
        else if(isCryo){g.fillStyle(tower.cfg.col,.9);g.fillCircle(0,0,r);g.lineStyle(1,0xffffff,.6);g.strokeCircle(0,0,r);}
        else if(isChain){g.lineStyle(2,tower.cfg.col,1);g.strokeCircle(0,0,r);g.fillStyle(0xffffff,.5);g.fillCircle(0,0,r*.4);}
        else g.fillCircle(0,0,r);
        g.setPosition(tower.x,tower.y);
        bullets.push({g,target,tower,dmg,col:tower.cfg.col});
      }

      function emitBurst(scene,x,y,col,_c){
        const g=scene.add.graphics().setPosition(x,y).setDepth(80);
        g.lineStyle(2.5,col,.85);g.strokeCircle(0,0,5);
        scene.tweens.add({targets:g,scaleX:5.5,scaleY:5.5,alpha:0,duration:380,ease:'Cubic.Out',onComplete:()=>g.destroy()});
      }

      function emitSplash(scene,x,y,col,r){
        const g=scene.add.graphics().setPosition(x,y).setDepth(70);
        g.lineStyle(3,col,.7);g.strokeCircle(0,0,5);
        scene.tweens.add({targets:g,scaleX:r/5,scaleY:r/5,alpha:0,duration:300,ease:'Cubic.Out',onComplete:()=>g.destroy()});
      }

      function emitChainSpark(scene,from,to){
        const g=scene.add.graphics().setDepth(55);
        g.lineStyle(2.5,0xfacc15,1);g.beginPath();g.moveTo(from.x,from.y);g.lineTo(to.x,to.y);g.strokePath();
        scene.tweens.add({targets:g,alpha:0,duration:180,onComplete:()=>g.destroy()});
      }

      function emitLaserBeam(scene,tower,target,col){
        const g=scene.add.graphics().setDepth(55);
        g.lineStyle(3,col,.9);g.beginPath();g.moveTo(tower.x,tower.y);g.lineTo(target.x,target.y);g.strokePath();
        scene.tweens.add({targets:g,alpha:0,duration:90,onComplete:()=>g.destroy()});
      }

      function emitVortexFx(scene,tower){
        const g=scene.add.graphics().setPosition(tower.x,tower.y).setDepth(55);
        g.lineStyle(2,0xc026d3,.7);g.strokeCircle(0,0,8);
        scene.tweens.add({targets:g,scaleX:3,scaleY:3,alpha:0,duration:400,ease:'Cubic.Out',onComplete:()=>g.destroy()});
      }

      function emitFlameFx(scene,tower,angle,range,col){
        for(let k=0;k<6;k++){
          const a=angle+(Math.random()-.5)*(Math.PI/3);
          const dist=Math.random()*range;
          const g=scene.add.graphics().setDepth(45).setPosition(tower.x,tower.y);
          g.fillStyle(col,.7);g.fillCircle(0,0,4);
          const tx=tower.x+Math.cos(a)*dist,ty=tower.y+Math.sin(a)*dist;
          scene.tweens.add({targets:g,x:tx,y:ty,alpha:0,scaleX:.2,scaleY:.2,duration:180,onComplete:()=>g.destroy()});
        }
      }

      function addKillFeed(name,gold,isBoss){
        const t=scene.add.text(W-6,TOP_H+6+killFeedTexts.length*14,
          `${isBoss?'💀 ':''}${name} +${gold}g`,
          {fontSize:'9px',color:isBoss?'#ffd700':'rgba(255,255,255,.55)',fontFamily:'monospace',stroke:'#000',strokeThickness:2})
          .setOrigin(1,0).setDepth(98);
        killFeedTexts.push(t);
        scene.tweens.add({targets:t,alpha:0,delay:2500,duration:600,onComplete:()=>{t.destroy();killFeedTexts=killFeedTexts.filter(x=>x!==t);}});
        killFeedTexts.forEach((tt,i)=>{tt.y=TOP_H+6+i*14;});
      }

      function showFloatMsg(txt,x,y){
        if(!scene) return;
        const col=txt.includes('gold')||txt.includes('Need')?'#ef4444':txt.includes('Path')||txt.includes('close')?'#fbbf24':'#10b981';
        const t=scene.add.text(x,y,txt,{fontSize:'12px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);
        scene.tweens.add({targets:t,y:y-36,alpha:0,duration:1500,onComplete:()=>t.destroy()});
      }

      function showFloatMsg2(scene,txt,x,y,col){
        if(!scene) return;
        const t=scene.add.text(x,y,txt,{fontSize:'16px',color:col||'#fff',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(200);
        scene.tweens.add({targets:t,y:y-50,alpha:0,duration:2000,ease:'Cubic.Out',onComplete:()=>t.destroy()});
      }

      function createHUD(scene) {
        const topBg=scene.add.graphics().setDepth(90);
        topBg.fillStyle(0x000000,.85);topBg.fillRect(0,0,W,TOP_H);
        hudTexts.gold=scene.add.text(8,5,'💰 '+gold,{fontSize:'12px',color:'#f59e0b',fontFamily:'monospace'}).setDepth(91);
        hudTexts.lives=scene.add.text(W/2,5,'❤️ '+lives,{fontSize:'12px',color:'#ef4444',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
        hudTexts.score=scene.add.text(W-8,5,'⭐ '+score,{fontSize:'12px',color:'#a78bfa',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91);
        hudTexts.wave=scene.add.text(W/2,18,'Wave 0/'+WAVE_SCRIPT.length,{fontSize:'9px',color:'rgba(255,255,255,.35)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
        hudTexts.combo=scene.add.text(W/2,TOP_H+30,'',{fontSize:'15px',color:'#fbbf24',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(95).setAlpha(0);

        const barY=H-BAR_H;
        const barBg=scene.add.graphics().setDepth(90);
        barBg.fillStyle(0x000000,.92);barBg.fillRect(0,barY,W,BAR_H);

        const types=Object.entries(TOWER_DEFS);
        const btnW=W/types.length;
        types.forEach(([id,cfg],i)=>{
          const bx=i*btnW,by=barY;
          const btn=scene.add.graphics().setDepth(91);
          btn.setInteractive(new Phaser.Geom.Rectangle(bx,by,btnW,BAR_H),Phaser.Geom.Rectangle.Contains);
          function drawBtn(active){
            btn.clear();
            btn.fillStyle(active?cfg.col:0x0a0d1a,active?.22:.92);
            btn.fillRect(bx+1,by+1,btnW-2,BAR_H-2);
            if(active){btn.lineStyle(1.5,cfg.col,.8);btn.strokeRect(bx+1,by+1,btnW-2,BAR_H-2);}
          }
          drawBtn(id===selectedType);
          btn._id=id;btn.drawMe=drawBtn;btn._isTB=true;
          btn.on('pointerdown',()=>{
            selectedType=id;
            scene.children.list.filter(c=>c._isTB).forEach(c=>c.drawMe(c._id===id));
          });
          scene.add.text(bx+btnW/2,by+5,cfg.emoji,{fontSize:'14px'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(bx+btnW/2,by+22,cfg.cost+'g',{fontSize:'8px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(bx+btnW/2,by+33,cfg.name,{fontSize:'7px',color:'rgba(255,255,255,.35)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
        });
      }

      function updateHUD() {
        if(hudTexts.gold)  hudTexts.gold.setText('💰 '+gold.toLocaleString());
        if(hudTexts.lives) hudTexts.lives.setText('❤️ '+lives);
        if(hudTexts.score) hudTexts.score.setText('⭐ '+score.toLocaleString());
      }

      function showTowerOverlay(tower) {
        removeAllOverlays();
        const canvasEl=container.querySelector('canvas');
        const cRect=canvasEl?canvasEl.getBoundingClientRect():{width:W,height:H};
        const sx=W/cRect.width,sy=H/cRect.height;
        const ox=Math.min(tower.x/sx,cRect.width-160);
        const oy=Math.max(tower.y/sy-110,TOP_H+5);
        const colHex='#'+tower.cfg.col.toString(16).padStart(6,'0');
        const hasUpg=tower.level<(tower.cfg.upgrades||[]).length;
        const upg=hasUpg?tower.cfg.upgrades[tower.level]:null;

        const ov=document.createElement('div');
        ov.id='td-tower-ov';
        ov.style.cssText=`position:absolute;left:${ox}px;top:${oy}px;width:155px;background:#050710;border:1px solid ${colHex}55;border-radius:10px;padding:10px;z-index:300;font-family:monospace;pointer-events:all`;

        let upgradeHtml='';
        if(hasUpg){
          const canAfford=gold>=upg.cost;
          upgradeHtml=`<div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:4px">→ Lv${tower.level+2}: ${upg.label}</div>
          <button id="td-upg" style="width:100%;padding:6px;background:${canAfford?'rgba(16,185,129,.18)':'rgba(239,68,68,.1)'};border:1px solid ${canAfford?'#10b981':'#ef4444'};color:${canAfford?'#10b981':'#ef4444'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;font-family:monospace">
            ${canAfford?`✓ Upgrade (${upg.cost}g)`:`✗ Need ${upg.cost}g`}</button>`;
        } else {
          upgradeHtml='<div style="font-size:9px;color:#f59e0b;text-align:center">✦ MAX LEVEL ✦</div>';
        }

        const sellVal=Math.round(tower.cfg.cost*.6);
        ov.innerHTML=`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <span style="font-size:16px">${tower.cfg.emoji}</span>
            <div><div style="font-size:12px;font-weight:700;color:#fff">${tower.cfg.name}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.4)">Lv${tower.level+1} · ${Math.round(tower.totalDmg)} dmg</div></div></div>
          <div style="font-size:9px;color:rgba(255,255,255,.35);margin-bottom:8px">
            DMG: ${Math.round(getEffectiveDmg(tower.cfg))} · RNG: ${Math.round(getEffectiveRange(tower.cfg))}<br>Kills: ${tower.kills||0}</div>
          ${upgradeHtml}
          <button id="td-sell" style="width:100%;padding:5px;background:rgba(239,68,68,.1);border:1px solid #ef444444;color:#ef4444;border-radius:6px;cursor:pointer;font-size:10px;margin-top:5px;font-family:monospace">
            💰 Sell (${sellVal}g)</button>
          <button id="td-close" style="width:100%;padding:4px;background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:10px;margin-top:3px">✕</button>`;

        container.appendChild(ov);
        towerOverlay=ov;

        ov.querySelector('#td-close').onclick=()=>removeAllOverlays();
        ov.querySelector('#td-sell').onclick=()=>{
          gold+=sellVal;
          tower.g.destroy();tower.ico.destroy();tower.rg.destroy();tower.lvlTxt.destroy();
          towers=towers.filter(t=>t!==tower);
          updateHUD();removeAllOverlays();
        };
        if(hasUpg&&ov.querySelector('#td-upg')){
          ov.querySelector('#td-upg').onclick=()=>{
            if(gold<upg.cost){showFloatMsg('Need more gold!',tower.x,tower.y-40);removeAllOverlays();return;}
            gold-=upg.cost;
            tower.level++;
            Object.keys(upg).forEach(k=>{if(k!=='cost'&&k!=='label') tower.cfg[k]=upg[k];});
            drawTowerGfx(tower.g,tower.cfg,tower.level);
            tower.rg.clear();tower.rg.lineStyle(1,tower.cfg.col,.12);tower.rg.strokeCircle(0,0,getEffectiveRange(tower.cfg));
            tower.lvlTxt.setText(''+(tower.level+1));
            emitBurst(scene,tower.x,tower.y,tower.cfg.col,0);
            score+=20;updateHUD();removeAllOverlays();
          };
        }
        setTimeout(()=>{if(towerOverlay===ov)removeAllOverlays();},6000);
      }

      // FIX: Shop stays open until player explicitly clicks an option
      function showWaveShop(scene) {
        removeAllOverlays();
        shopIsOpen=true;

        const available=GLOBAL_UPGRADES.filter(u=>!purchasedUpgrades.has(u.id));
        const offers=[];
        const shuffled=[...available].sort(()=>Math.random()-.5);
        for(let i=0;i<Math.min(3,shuffled.length);i++) offers.push(shuffled[i]);

        const ov=document.createElement('div');
        ov.id='td-shop-ov';
        ov.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 32px);max-width:320px;background:#050710;border:1px solid rgba(245,158,11,.35);border-radius:12px;padding:14px;z-index:400;font-family:monospace;pointer-events:all';

        let offerHtml=offers.map(u=>{
          const canAfford=gold>=u.cost;
          return `<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:13px">${u.emoji} <strong style="color:#fff;font-size:11px">${u.name}</strong></span>
              <span style="font-size:11px;color:#f59e0b">${u.cost}g</span></div>
            <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:6px">${u.desc}</div>
            <button data-id="${u.id}" class="shop-btn" style="width:100%;padding:6px;background:${canAfford?'rgba(16,185,129,.15)':'rgba(100,100,100,.1)'};border:1px solid ${canAfford?'#10b981':'#444'};color:${canAfford?'#10b981':'#555'};border-radius:6px;cursor:${canAfford?'pointer':'default'};font-size:10px;font-family:monospace">
              ${canAfford?`✓ Buy (${u.cost}g)`:`✗ Need ${u.cost}g`}</button></div>`;
        }).join('');

        if(!offerHtml) offerHtml='<div style="color:rgba(255,255,255,.3);text-align:center;padding:10px">All upgrades purchased!</div>';

        ov.innerHTML=`
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:14px;font-weight:700;color:#f59e0b">🏪 Base Upgrades</div>
            <div style="font-size:10px;color:rgba(255,255,255,.4)">Wave ${waveIdx}/${WAVE_SCRIPT.length} next</div></div>
          <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px">💰 Treasury: ${gold.toLocaleString()}g — buy one or skip</div>
          ${offerHtml}
          <button id="shop-close" style="width:100%;padding:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#f59e0b;border-radius:8px;cursor:pointer;font-size:11px;margin-top:4px;font-family:monospace;font-weight:700">▶ Start Next Wave →</button>`;

        container.appendChild(ov);
        shopOverlay=ov;

        ov.querySelectorAll('.shop-btn').forEach(btn=>{
          btn.addEventListener('click',()=>{
            const uid=btn.dataset.id;
            const upg=GLOBAL_UPGRADES.find(u=>u.id===uid);
            if(!upg||gold<upg.cost||purchasedUpgrades.has(uid)) return;
            gold-=upg.cost;
            purchasedUpgrades.add(uid);
            applyGlobalUpgrade(upg.effect);
            updateHUD();
            showFloatMsg2(scene,`✦ ${upg.name}!`,W/2,H*.4,'#10b981');
            // FIX: after buying, refresh shop (so they can keep buying if they want, or close)
            removeAllOverlays();
            showWaveShop(scene);
          });
        });

        // FIX: Continue button triggers next wave
        ov.querySelector('#shop-close').onclick=()=>{
          removeAllOverlays();
          startNextWave();
        };
      }

      function applyGlobalUpgrade(effect) {
        if(effect.dmgMult)   globalMods.dmgMult+=effect.dmgMult;
        if(effect.rangeMult) globalMods.rangeMult+=effect.rangeMult;
        if(effect.rateMult)  globalMods.rateMult+=effect.rateMult;
        if(effect.goldBonus) globalMods.goldBonus+=effect.goldBonus;
        if(effect.livesBonus){lives+=effect.livesBonus;updateHUD();}
        if(effect.interest)  globalMods.interest+=effect.interest;
        if(effect.slowBoost) globalMods.slowBoost+=effect.slowBoost;
        if(effect.splashMult)globalMods.splashMult+=effect.splashMult;
        if(effect.chainBonus)globalMods.chainBonus+=effect.chainBonus;
        if(effect.detectStealth)globalMods.detectStealth=true;
      }

      function removeAllOverlays(){
        [upgradeOverlay,shopOverlay,towerOverlay].forEach(ov=>{if(ov&&ov.parentNode)ov.remove();});
        upgradeOverlay=null;shopOverlay=null;towerOverlay=null;
      }

      function triggerGameOver(){
        if(gameOver) return;
        gameOver=true;
        removeAllOverlays();
        const name=_ctx?.loadProfile?.()?.name||'Commander';
        saveScore({name,score,wave:waveIdx,kills:killCount,towers:towers.length,ts:Date.now()});

        const ov=scene.add.graphics().setDepth(300);
        ov.fillStyle(0x000000,.92);ov.fillRect(0,0,W,H);
        scene.add.text(W/2,H/2-80,'GAME OVER',{fontSize:'28px',color:'#ef4444',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(301);
        scene.add.text(W/2,H/2-44,score.toLocaleString()+' pts',{fontSize:'22px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        scene.add.text(W/2,H/2-16,`${killCount} kills · Wave ${waveIdx}/${WAVE_SCRIPT.length}`,{fontSize:'11px',color:'rgba(255,255,255,.45)',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        const rb=scene.add.text(W/2,H/2+30,'▶  PLAY AGAIN',{fontSize:'13px',color:'#fff',fontFamily:'monospace',backgroundColor:'#1d4ed8',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setDepth(302);
        rb.on('pointerdown',()=>{if(_game2){_game2.destroy(true);_game2=null;}container.innerHTML='';renderPlay(container);});
      }

      function triggerVictory(){
        if(gameOver) return;
        gameOver=true;
        removeAllOverlays();
        const name=_ctx?.loadProfile?.()?.name||'Commander';
        saveScore({name,score,wave:WAVE_SCRIPT.length,kills:killCount,towers:towers.length,ts:Date.now(),victory:true});

        const ov=scene.add.graphics().setDepth(300);
        ov.fillStyle(0x000000,.92);ov.fillRect(0,0,W,H);
        scene.add.text(W/2,H/2-80,'VICTORY!',{fontSize:'32px',color:'#ffd700',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(301);
        scene.add.text(W/2,H/2-42,score.toLocaleString()+' pts',{fontSize:'24px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        scene.add.text(W/2,H/2-14,`${killCount} kills · All 20 waves cleared!`,{fontSize:'11px',color:'rgba(255,255,255,.5)',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        const rb=scene.add.text(W/2,H/2+30,'▶  PLAY AGAIN',{fontSize:'13px',color:'#000',fontFamily:'monospace',backgroundColor:'#ffd700',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setDepth(302);
        rb.on('pointerdown',()=>{if(_game2){_game2.destroy(true);_game2=null;}container.innerHTML='';renderPlay(container);});
      }

      const config={
        type:Phaser.AUTO,
        width:W,height:H,
        parent:container,
        backgroundColor:'#07080e',
        scene:{preload,create,update},
        scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}
      };
      _game2=new Phaser.Game(config);
    }

    if(window.Phaser){initPhaser();}
    else{
      const loading=document.createElement('div');
      loading.style.cssText='display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4);font-size:13px';
      loading.textContent='Loading Phaser…';container.appendChild(loading);
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
      s.onload=()=>{loading.remove();initPhaser();};
      document.head.appendChild(s);
    }
  }

  window.YM_S['towerdefense.sphere.js']={
    name:'Tower Defense',icon:'🗼',category:'Games',
    description:'Tower Defense v5 FIXED — lives correctly deducted, shop stays until player chooses',
    emit:[],receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){if(_game2){_game2.destroy(true);_game2=null;}},
    renderPanel,
    profileSection(container){
      const scores=loadScores();if(!scores.length)return;
      const best=scores[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:#0b0c14;border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">🗼</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4)">Wave ${best.wave} · ${best.kills||0} kills${best.victory?' · ✦ Victory':''}</div></div>
        <div style="font-size:15px;font-weight:700;color:#f59e0b">${best.score.toLocaleString()}</div>`;
      container.appendChild(el);
    }
  };
})();
