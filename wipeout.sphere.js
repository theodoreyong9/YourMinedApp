/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense VS v1
// Mode 2 joueurs en temps réel sur le même écran :
// - J1 (gauche) vs J2 (droite)
// - 2 économies : Or défense (tuer ennemis adverses) + Or attaque (avancer ses attaquants)
// - Boutique tours (défense) + boutique attaquants (envoi)
// - Les attaquants achetés s'envoient à chaque vague suivante en boucle
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_tdvs_scores_v1';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScore(s) { const a=loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY, JSON.stringify(a.slice(0,10))); }

  let _ctx=null, _game=null;

  // ── TOURS ──────────────────────────────────────────────────────────────────
  const TOWER_DEFS = {
    archer:  { cost:60,  range:85,  dmg:18,  rate:750,  col:0x3b82f6, name:'Archer',  emoji:'🏹', desc:'Rapide, mono-cible',
      upg:[{cost:70,dmg:30,label:'Pointes'},{cost:130,dmg:52,rate:600,label:'Arc composé'},{cost:240,dmg:95,rate:480,range:105,label:'Maître'}] },
    rapid:   { cost:80,  range:70,  dmg:9,   rate:220,  col:0x10b981, name:'Gatling', emoji:'⚡', desc:'Ultra rapide, faible dégât',
      upg:[{cost:75,dmg:14,rate:180,label:'Huilé'},{cost:140,dmg:22,rate:140,label:'Overclocké'},{cost:260,dmg:36,rate:100,range:82,label:'Minigun'}] },
    sniper:  { cost:120, range:210, dmg:85,  rate:1900, col:0x8b5cf6, name:'Sniper',  emoji:'🎯', desc:'Longue portée, très lent',
      upg:[{cost:100,dmg:140,rate:1600,label:'Lunette'},{cost:180,dmg:220,rate:1300,label:'Anti-matériel'},{cost:340,dmg:400,rate:1000,range:250,label:'Rail Gun'}] },
    frost:   { cost:90,  range:95,  dmg:8,   rate:680,  col:0x38bdf8, name:'Frost',   emoji:'❄️', desc:'Ralentit les ennemis', slow:0.40,
      upg:[{cost:80,slow:0.20,range:115,label:'Gel'},{cost:150,dmg:15,slow:0.12,rate:520,label:'Blizzard'},{cost:280,dmg:24,slow:0.05,range:135,rate:380,label:'Zéro absolu'}] },
    cannon:  { cost:140, range:105, dmg:110, rate:2500, col:0xef4444, name:'Canon',   emoji:'💣', desc:'Dégâts de zone', splash:65,
      upg:[{cost:110,dmg:175,splash:85,label:'Explosif'},{cost:200,dmg:280,splash:115,label:'Cluster'},{cost:380,dmg:460,splash:155,rate:1900,label:'Thermobarique'}] },
    tesla:   { cost:160, range:120, dmg:55,  rate:1350, col:0xfacc15, name:'Tesla',   emoji:'⚡', desc:'Foudre en chaîne', chain:3,
      upg:[{cost:130,dmg:82,chain:4,label:'Superconducteur'},{cost:240,dmg:125,chain:5,range:140,label:'Tempête'},{cost:440,dmg:195,chain:7,range:160,rate:950,label:'Dieu foudre'}] },
    laser:   { cost:210, range:145, dmg:38,  rate:110,  col:0xf43f5e, name:'Laser',   emoji:'🔴', desc:'Perce tous en ligne', pierce:true,
      upg:[{cost:190,dmg:60,rate:90,label:'Focalisé'},{cost:340,dmg:98,rate:72,range:165,label:'Laser X'},{cost:600,dmg:160,rate:55,range:195,label:'Étoile mort'}] },
    mortar:  { cost:170, range:175, dmg:150, rate:3400, col:0xf97316, name:'Mortier', emoji:'🔥', desc:'AoE longue portée', splash:105, minRange:55,
      upg:[{cost:150,dmg:235,splash:125,label:'Phosphore'},{cost:280,dmg:360,splash:155,rate:2700,label:'Incendiaire'},{cost:500,dmg:580,splash:195,rate:2100,label:'Daisy Cutter'}] },
  };

  // ── ATTAQUANTS (achetés par le joueur, envoyés contre l'adversaire) ─────────
  const ATTACKER_DEFS = {
    grunt:    { cost:20,  hp:35,   spd:55, reward:8,  col:'#ef4444', name:'Grunt',    emoji:'👊', size:9,  desc:'Basique, bon marché' },
    fast:     { cost:30,  hp:20,   spd:120,reward:10, col:'#fbbf24', name:'Dasher',   emoji:'💨', size:8,  desc:'Très rapide' },
    tank:     { cost:80,  hp:320,  spd:28, reward:40, col:'#6366f1', name:'Tank',     emoji:'🛡', size:14, desc:'Très résistant', armor:0.25 },
    swarm:    { cost:15,  hp:10,   spd:85, reward:3,  col:'#84cc16', name:'Swarm×3',  emoji:'🐝', size:6,  desc:'Envoyé par 3', count:3 },
    stealth:  { cost:55,  hp:70,   spd:75, reward:28, col:'#475569', name:'Fantôme',  emoji:'👻', size:8,  desc:'Furtif, détecté par laser', stealth:true },
    healer:   { cost:90,  hp:90,   spd:48, reward:35, col:'#34d399', name:'Médecin',  emoji:'💚', size:10, desc:'Soigne les alliés proches', heals:true },
    armored:  { cost:70,  hp:170,  spd:40, reward:32, col:'#94a3b8', name:'Armored',  emoji:'⚙️', size:12, desc:'45% d\'armure', armor:0.45 },
    boss:     { cost:200, hp:900,  spd:20, reward:100,col:'#7c3aed', name:'TITAN',    emoji:'💀', size:18, desc:'Boss massif', armor:0.30, boss:true },
  };

  // ── VAGUES AUTOMATIQUES (communes aux deux côtés) ───────────────────────────
  const AUTO_WAVES = [
    [{type:'grunt',count:5,delay:700}],
    [{type:'grunt',count:6,delay:600},{type:'fast',count:3,delay:450,offset:2500}],
    [{type:'grunt',count:8,delay:500},{type:'swarm',count:3,delay:300,offset:2000}],
    [{type:'fast',count:8,delay:350},{type:'armored',count:2,delay:1500,offset:2500}],
    [{type:'tank',count:2,delay:2500},{type:'grunt',count:10,delay:400,offset:1500}],
    [{type:'stealth',count:6,delay:600},{type:'fast',count:8,delay:300,offset:2000}],
    [{type:'healer',count:3,delay:1200},{type:'grunt',count:12,delay:400,offset:1000}],
    [{type:'armored',count:6,delay:800},{type:'swarm',count:5,delay:250,offset:2500}],
    [{type:'boss',count:1,delay:5000}],
    [{type:'fast',count:15,delay:250},{type:'stealth',count:8,delay:500,offset:3000}],
    [{type:'tank',count:4,delay:2000},{type:'healer',count:4,delay:1000,offset:2500}],
    [{type:'boss',count:2,delay:4000},{type:'armored',count:8,delay:700,offset:6000}],
  ];

  // ── PANEL ──────────────────────────────────────────────────────────────────
  function renderPanel(container) {
    container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#07080e;font-family:monospace';
    container.innerHTML='';
    const gameZone=document.createElement('div');
    gameZone.style.cssText='flex:1;overflow:hidden;min-height:0;position:relative';
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;z-index:200;display:none;flex-direction:column;background:#07080e;overflow-y:auto;padding:14px;box-sizing:border-box';
    gameZone.appendChild(overlay);
    container.appendChild(gameZone);

    const tabBar=document.createElement('div');
    tabBar.style.cssText='display:flex;border-top:1px solid rgba(255,255,255,.07);flex-shrink:0;background:#040508';

    const goPlay=()=>{ overlay.style.display='none'; tabBar.querySelectorAll('div').forEach((x,i)=>x.style.color=i===0?'#f59e0b':'rgba(255,255,255,.35)'); };

    [['play','⚔️ VS'],['scores','🏆 Scores'],['guide','📖 Guide']].forEach(([id,lbl],idx)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${idx===0?'#f59e0b':'rgba(255,255,255,.35)'}`;
      t.textContent=lbl;
      t.onclick=()=>{
        tabBar.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#f59e0b':'rgba(255,255,255,.35)');
        if(id==='play'){ overlay.style.display='none'; }
        else if(id==='scores'){ overlay.style.display='flex'; renderScoresInto(overlay, ()=>{ if(_game){_game.destroy(true);_game=null;} goPlay(); renderPlay(gameZone); }); }
        else { overlay.style.display='flex'; renderGuideInto(overlay); }
      };
      tabBar.appendChild(t);
    });
    container.appendChild(tabBar);
    renderPlay(gameZone);
  }

  function renderScoresInto(c, onRestart) {
    const scores=loadScores();
    let h=`<div style="font-size:16px;font-weight:700;color:#f59e0b;margin-bottom:10px">🏆 Palmarès VS</div>`;
    h+=`<button id="tdvs-restart" style="width:100%;padding:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:8px;cursor:pointer;font-family:monospace;font-size:12px;font-weight:700;margin-bottom:12px">↺ Nouvelle partie</button>`;
    if(!scores.length) h+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:30px">Aucune partie.</div>';
    else scores.forEach((s,i)=>{
      h+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span>
        <div style="flex:1"><div style="color:#fff;font-size:11px">${s.winner} a gagné</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">Vague ${s.wave} · ${s.kills} kills</div></div>
        <div style="color:#f59e0b;font-size:13px;font-weight:700">${s.score.toLocaleString()}</div></div>`;
    });
    c.innerHTML=h;
    const btn=c.querySelector('#tdvs-restart');
    if(btn&&onRestart) btn.onclick=onRestart;
  }

  function renderGuideInto(c) {
    let h=`<div style="font-size:16px;font-weight:700;color:#f59e0b;margin-bottom:10px">📖 Comment jouer</div>
    <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;margin-bottom:12px;font-size:10px;color:rgba(255,255,255,.6);line-height:1.7">
      Chaque joueur a son chemin et ses vies.<br>
      <span style="color:#60a5fa">💰 Or défense</span> : gagné en tuant les ennemis adverses → achète tes <strong>tours</strong>.<br>
      <span style="color:#f59e0b">⚔️ Or attaque</span> : gagné quand tes attaquants avancent → achète tes <strong>attaquants</strong>.<br>
      Tes attaquants achetés sont envoyés à chaque vague contre l'adversaire.<br>
      Le premier à 0 vies perd !
    </div>
    <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:8px">🗼 Tours</div>`;
    Object.entries(TOWER_DEFS).forEach(([,t])=>{
      h+=`<div style="padding:7px 9px;border-radius:7px;margin-bottom:5px;background:rgba(255,255,255,.03);border-left:2px solid #${t.col.toString(16).padStart(6,'0')}">
        <div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:#fff">${t.emoji} ${t.name}</span><span style="color:#60a5fa;font-size:10px">${t.cost}💰</span></div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">${t.desc}</div></div>`;
    });
    h+=`<div style="font-size:13px;font-weight:700;color:#f59e0b;margin:12px 0 8px">⚔️ Attaquants</div>`;
    Object.entries(ATTACKER_DEFS).forEach(([,a])=>{
      h+=`<div style="padding:7px 9px;border-radius:7px;margin-bottom:5px;background:rgba(255,255,255,.03);border-left:2px solid ${a.col}">
        <div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:#fff">${a.emoji} ${a.name}</span><span style="color:#f59e0b;font-size:10px">${a.cost}⚔️</span></div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">${a.desc}</div></div>`;
    });
    c.innerHTML=h;
  }

  // ── JEU ────────────────────────────────────────────────────────────────────
  function renderPlay(container) {
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';
    if(window.Phaser) initGame();
    else {
      const load=document.createElement('div');
      load.style.cssText='display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4);font-size:13px;font-family:monospace';
      load.textContent='Chargement…';
      container.appendChild(load);
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
      s.onload=()=>{load.remove();initGame();};
      document.head.appendChild(s);
    }

    function initGame() {
      const Phaser=window.Phaser;
      const W=container.offsetWidth||360, H=container.offsetHeight||520;

      // ── LAYOUT ───────────────────────────────────────────────────────────
      // Chaque joueur occupe la moitié de l'écran
      const HALF=Math.floor(W/2);
      const BAR_H=48;  // barre de boutique en bas
      const TOP_H=36;  // HUD en haut
      const GAME_H=H-BAR_H-TOP_H; // hauteur utile pour les chemins

      // ── CHEMIN pour chaque côté ────────────────────────────────────────
      // Le chemin est identique mais décalé horizontalement
      function makePath(offsetX, gameH) {
        const m=18, w=HALF-4;
        return [
          {x:offsetX+m,           y:TOP_H-10},
          {x:offsetX+m,           y:TOP_H+gameH*.15},
          {x:offsetX+w*.55,       y:TOP_H+gameH*.15},
          {x:offsetX+w*.55,       y:TOP_H+gameH*.38},
          {x:offsetX+w*.22,       y:TOP_H+gameH*.38},
          {x:offsetX+w*.22,       y:TOP_H+gameH*.62},
          {x:offsetX+w*.72,       y:TOP_H+gameH*.62},
          {x:offsetX+w*.72,       y:TOP_H+gameH*.82},
          {x:offsetX+w-m,         y:TOP_H+gameH*.82},
          {x:offsetX+w-m,         y:H-BAR_H+10},
        ];
      }

      // ── ÉTAT JOUEURS ───────────────────────────────────────────────────
      function makePlayer(id, side, pathPts) {
        return {
          id,           // 0=gauche, 1=droite
          side,         // 'left' | 'right'
          path:pathPts,
          lives:20,
          goldDef:150,  // or défense → tours
          goldAtk:100,  // or attaque → attaquants
          score:0,
          kills:0,
          towers:[],
          enemies:[],   // ennemis sur son chemin (envoyés par l'adversaire)
          attackers:{}, // {type:count} attaquants achetés (envoyés chaque vague)
          selectedTower:'archer',
          selectedAttacker:'grunt',
          shopTab:'towers', // 'towers' | 'attackers'
        };
      }

      // ── HELPERS CHEMIN ─────────────────────────────────────────────────
      function buildPathData(pts) {
        const segLengths=[]; let total=0;
        for(let i=0;i<pts.length-1;i++){const l=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y);segLengths.push(l);total+=l;}
        return {pts,segLengths,total};
      }
      function posOnPath(pd,d) {
        let rem=Math.max(0,d);
        for(let i=0;i<pd.segLengths.length;i++){
          const sl=pd.segLengths[i];
          if(rem<=sl){const t=rem/sl;return{x:pd.pts[i].x+t*(pd.pts[i+1].x-pd.pts[i].x),y:pd.pts[i].y+t*(pd.pts[i+1].y-pd.pts[i].y),done:false};}
          rem-=sl;
        }
        return{x:pd.pts[pd.pts.length-1].x,y:pd.pts[pd.pts.length-1].y,done:true};
      }
      function isOnPath(pd,x,y,rad=26){
        const pts=pd.pts;
        for(let i=0;i<pts.length-1;i++){
          const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
          if(!len2)continue;
          const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));
          if((x-a.x-t*dx)**2+(y-a.y-t*dy)**2<rad*rad)return true;
        }
        return false;
      }

      let scene=null, gameOver=false;
      let waveIdx=0, waveTimer=0, betweenWaves=false, shopIsOpen=false;
      let shopOverlay=null;
      let bullets=[], particles=[];
      let hudTexts={};

      // ── PHASER ─────────────────────────────────────────────────────────
      function preload(){}

      function create(){
        scene=this;
        const pathA=makePath(0,GAME_H);
        const pathB=makePath(HALF,GAME_H);
        const pdA=buildPathData(pathA);
        const pdB=buildPathData(pathB);

        const p1=makePlayer(0,'left',pdA);
        const p2=makePlayer(1,'right',pdB);
        const players=[p1,p2];

        drawBackground(scene,W,H,HALF,TOP_H,BAR_H);
        drawPathVisual(scene,pathA,0x3b82f6,0x1e3a5f);
        drawPathVisual(scene,pathB,0xef4444,0x5f1e1e);

        // Séparateur vertical
        const sep=scene.add.graphics().setDepth(50);
        sep.lineStyle(1,0x333344,.8); sep.lineBetween(HALF,0,HALF,H);

        createHUDs(scene,players,W,HALF,TOP_H);
        createShopBars(scene,players,W,H,HALF,BAR_H,pdA,pdB);

        // Inputs : clic sur le terrain
        scene.input.on('pointerdown',ptr=>{
          if(gameOver||shopIsOpen)return;
          const {x,y}=ptr;
          if(y<TOP_H||y>H-BAR_H)return;
          const player=x<HALF?p1:p2;
          const pd=x<HALF?pdA:pdB;
          if(isOnPath(pd,x,y)){showFloat(scene,'Chemin!',x,y-24,'#fbbf24');return;}
          if(player.towers.some(t=>Math.hypot(t.x-x,t.y-y)<30)){showFloat(scene,'Trop proche!',x,y-24,'#fbbf24');return;}
          const cfg=TOWER_DEFS[player.selectedTower];
          if(player.goldDef<cfg.cost){showFloat(scene,'Pas assez 💰',x,y-24,'#ef4444');return;}
          player.goldDef-=cfg.cost;
          placeTower(scene,player,x,y,player.selectedTower);
          updateHUD(player,hudTexts);
        });

        // Démarrer première vague après 3s
        scene.time.delayedCall(3000,()=>launchWave(scene,players,pdA,pdB));
      }

      function drawBackground(scene,W,H,HALF,TOP_H,BAR_H){
        const bg=scene.add.graphics();
        bg.fillStyle(0x07080e);bg.fillRect(0,0,W,H);
        // Fond légèrement différent pour chaque côté
        bg.fillStyle(0x060d1a,.5);bg.fillRect(0,0,HALF,H);
        bg.fillStyle(0x1a0606,.5);bg.fillRect(HALF,0,HALF,H);
        // Grille
        const gr=scene.add.graphics();gr.lineStyle(0.4,0xffffff,0.02);
        for(let x=0;x<W;x+=32)gr.lineBetween(x,0,x,H);
        for(let y=0;y<H;y+=32)gr.lineBetween(0,y,W,y);
      }

      function drawPathVisual(scene,pts,col1,col2){
        const g=scene.add.graphics();
        g.lineStyle(38,col2,1);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
        g.lineStyle(30,0x111828,1);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
        g.lineStyle(1.5,col1,.6);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
      }

      function createHUDs(scene,players,W,HALF,TOP_H){
        // Fond HUD
        const hg=scene.add.graphics().setDepth(90);
        hg.fillStyle(0x000000,.88);hg.fillRect(0,0,W,TOP_H);
        hg.lineStyle(1,0x333344,.6);hg.lineBetween(0,TOP_H,W,TOP_H);

        players.forEach((p,i)=>{
          const ox=i===0?4:HALF+4;
          const key=`p${i}`;
          hudTexts[key+'lives']=scene.add.text(ox,4,'❤️ 20',{fontSize:'11px',color:'#ef4444',fontFamily:'monospace'}).setDepth(91);
          hudTexts[key+'gdef']=scene.add.text(ox,18,'💰 150',{fontSize:'10px',color:'#60a5fa',fontFamily:'monospace'}).setDepth(91);
          hudTexts[key+'gatk']=scene.add.text(ox+70,18,'⚔️ 100',{fontSize:'10px',color:'#f59e0b',fontFamily:'monospace'}).setDepth(91);
          hudTexts[key+'wave']=scene.add.text(ox+(HALF/2)-20,4,'Vague 0',{fontSize:'10px',color:'rgba(255,255,255,.4)',fontFamily:'monospace'}).setDepth(91);
        });
        // Nom des joueurs centré
        scene.add.text(HALF/2,4,'J1',{fontSize:'11px',color:'#60a5fa',fontFamily:'monospace',fontStyle:'bold'}).setOrigin(0.5,0).setDepth(91);
        scene.add.text(HALF+HALF/2,4,'J2',{fontSize:'11px',color:'#ef4444',fontFamily:'monospace',fontStyle:'bold'}).setOrigin(0.5,0).setDepth(91);
      }

      function updateHUD(player,ht){
        const k=`p${player.id}`;
        if(ht[k+'lives'])ht[k+'lives'].setText('❤️ '+player.lives);
        if(ht[k+'gdef'])ht[k+'gdef'].setText('💰 '+player.goldDef);
        if(ht[k+'gatk'])ht[k+'gatk'].setText('⚔️ '+player.goldAtk);
        if(ht[k+'wave'])ht[k+'wave'].setText('Vague '+waveIdx);
      }

      // ── BOUTIQUE ───────────────────────────────────────────────────────
      function createShopBars(scene,players,W,H,HALF,BAR_H,pdA,pdB){
        const barY=H-BAR_H;
        const shopBg=scene.add.graphics().setDepth(90);
        shopBg.fillStyle(0x000000,.92);shopBg.fillRect(0,barY,W,BAR_H);
        shopBg.lineStyle(1,0x333344,.6);shopBg.lineBetween(0,barY,W,barY);

        // Onglets boutique pour chaque joueur : tours | attaquants
        players.forEach((player,pi)=>{
          const ox=pi*HALF;
          // Mini-onglets
          const tabW=HALF/2-1;
          ['Tours 🗼','Attaq ⚔️'].forEach((lbl,ti)=>{
            const bx=ox+ti*tabW;
            const btn=scene.add.text(bx+tabW/2,barY+4,lbl,{fontSize:'9px',color:ti===0?'#60a5fa':'rgba(255,255,255,.35)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92).setInteractive();
            btn.on('pointerdown',()=>{
              player.shopTab=ti===0?'towers':'attackers';
              showShopOverlay(player,pi,pi===0?pdA:pdB);
            });
          });

          // Raccourcis : tour sélectionné + attaquant sélectionné en petits boutons
          drawQuickBar(scene,player,ox,barY,HALF,BAR_H);
        });
      }

      function drawQuickBar(scene,player,ox,barY,w,BAR_H){
        // On affiche juste le sélecteur actif et le coût
        const tc=TOWER_DEFS[player.selectedTower];
        const ac=ATTACKER_DEFS[player.selectedAttacker];
        const k=`p${player.id}`;
        if(hudTexts[k+'quick'])hudTexts[k+'quick'].destroy();
        hudTexts[k+'quick']=scene.add.text(ox+4,barY+14,
          `${tc.emoji}${tc.cost}💰  ${ac.emoji}${ac.cost}⚔️`,
          {fontSize:'10px',color:'rgba(255,255,255,.5)',fontFamily:'monospace'}).setDepth(92);
      }

      // Overlay HTML pour la boutique (HTML sur Phaser car plus pratique pour les listes)
      function showShopOverlay(player,pi,pd){
        removeShopOverlay();
        shopIsOpen=true;
        const ov=document.createElement('div');
        ov.style.cssText=`position:absolute;${pi===0?'left:0':'left:50%'};bottom:${BAR_H}px;width:50%;background:#050710;border:1px solid rgba(255,255,255,.15);border-radius:10px 10px 0 0;z-index:500;font-family:monospace;max-height:${H*0.65}px;overflow-y:auto;box-sizing:border-box`;
        const isT=player.shopTab==='towers';

        let html=`<div style="display:flex;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:6px">
          <div data-tab="towers" style="flex:1;padding:7px 4px;text-align:center;font-size:10px;font-weight:700;cursor:pointer;color:${isT?'#60a5fa':'rgba(255,255,255,.3)'}">🗼 Tours</div>
          <div data-tab="attackers" style="flex:1;padding:7px 4px;text-align:center;font-size:10px;font-weight:700;cursor:pointer;color:${!isT?'#f59e0b':'rgba(255,255,255,.3)'}">⚔️ Attaquants</div>
        </div>`;

        if(isT){
          // Liste des tours
          Object.entries(TOWER_DEFS).forEach(([id,t])=>{
            const sel=id===player.selectedTower;
            const canAff=player.goldDef>=t.cost;
            html+=`<div data-towersel="${id}" style="display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;background:${sel?'rgba(96,165,250,.1)':'transparent'};border-left:2px solid ${sel?'#60a5fa':'transparent'}">
              <span style="font-size:14px">${t.emoji}</span>
              <div style="flex:1"><div style="font-size:10px;color:${canAff?'#fff':'rgba(255,255,255,.35)'}">${t.name}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.3)">${t.desc}</div></div>
              <span style="font-size:10px;color:${canAff?'#60a5fa':'#444'}">${t.cost}💰</span></div>`;
          });
          // Tours posées (upgrade/sell)
          if(player.towers.length>0){
            html+=`<div style="font-size:9px;color:rgba(255,255,255,.3);padding:6px 8px 2px;border-top:1px solid rgba(255,255,255,.08);margin-top:4px">Vos tours :</div>`;
            player.towers.forEach((t,ti)=>{
              const cfg=TOWER_DEFS[t.type];
              const hasUpg=t.level<cfg.upg.length;
              const upg=hasUpg?cfg.upg[t.level]:null;
              const sellVal=Math.round(cfg.cost*0.6);
              html+=`<div style="display:flex;align-items:center;gap:5px;padding:4px 8px;font-size:9px;color:rgba(255,255,255,.5)">
                <span>${cfg.emoji} ${cfg.name} Niv${t.level+1}</span>
                ${hasUpg&&player.goldDef>=upg.cost?`<button data-upgtower="${ti}" style="background:rgba(16,185,129,.15);border:1px solid #10b981;color:#10b981;border-radius:4px;cursor:pointer;font-size:8px;padding:2px 5px;font-family:monospace">↑${upg.cost}💰</button>`:''}
                <button data-selltower="${ti}" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4);color:#ef4444;border-radius:4px;cursor:pointer;font-size:8px;padding:2px 5px;font-family:monospace">💰${sellVal}</button>
              </div>`;
            });
          }
        } else {
          // Attaquants
          Object.entries(ATTACKER_DEFS).forEach(([id,a])=>{
            const sel=id===player.selectedAttacker;
            const canAff=player.goldAtk>=a.cost;
            const owned=player.attackers[id]||0;
            html+=`<div data-atksel="${id}" style="display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;background:${sel?'rgba(245,158,11,.1)':'transparent'};border-left:2px solid ${sel?'#f59e0b':'transparent'}">
              <span style="font-size:14px">${a.emoji}</span>
              <div style="flex:1"><div style="font-size:10px;color:${canAff?'#fff':'rgba(255,255,255,.35)'}">${a.name}${owned>0?` <span style="color:#f59e0b">(×${owned})</span>`:''}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.3)">${a.desc}</div></div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
                <button data-buyatk="${id}" style="background:${canAff?'rgba(245,158,11,.15)':'rgba(100,100,100,.1)'};border:1px solid ${canAff?'#f59e0b':'#444'};color:${canAff?'#f59e0b':'#555'};border-radius:4px;cursor:${canAff?'pointer':'default'};font-size:8px;padding:2px 5px;font-family:monospace">+${a.cost}⚔️</button>
                ${owned>0?`<button data-sellatk="${id}" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:4px;cursor:pointer;font-size:8px;padding:2px 5px;font-family:monospace">-1 (${Math.round(a.cost*0.5)}⚔️)</button>`:''}
              </div>
            </div>`;
          });
        }

        html+=`<button id="shop-close" style="width:100%;padding:7px;background:rgba(245,158,11,.1);border-top:1px solid rgba(245,158,11,.25);color:#f59e0b;cursor:pointer;font-size:10px;font-family:monospace;font-weight:700;box-sizing:border-box">✕ Fermer</button>`;
        ov.innerHTML=html;
        container.appendChild(ov);
        shopOverlay=ov;

        // Onglets
        ov.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{player.shopTab=el.dataset.tab==='towers'?'towers':'attackers';showShopOverlay(player,pi,pd);});
        // Sélection tour
        ov.querySelectorAll('[data-towersel]').forEach(el=>el.onclick=()=>{player.selectedTower=el.dataset.towersel;showShopOverlay(player,pi,pd);});
        // Upgrade tour
        ov.querySelectorAll('[data-upgtower]').forEach(el=>el.onclick=()=>{
          const ti=parseInt(el.dataset.upgtower);
          const t=player.towers[ti]; if(!t)return;
          const cfg=TOWER_DEFS[t.type];
          const upg=cfg.upg[t.level];
          if(!upg||player.goldDef<upg.cost)return;
          player.goldDef-=upg.cost; t.level++;
          Object.keys(upg).forEach(k=>{if(k!=='cost'&&k!=='label')t.cfg[k]=upg[k];});
          redrawTower(t); updateHUD(player,hudTexts); showShopOverlay(player,pi,pd);
        });
        // Sell tour
        ov.querySelectorAll('[data-selltower]').forEach(el=>el.onclick=()=>{
          const ti=parseInt(el.dataset.selltower);
          const t=player.towers.splice(ti,1)[0]; if(!t)return;
          player.goldDef+=Math.round(TOWER_DEFS[t.type].cost*0.6);
          t.g.destroy(); t.ico.destroy(); t.rg.destroy(); t.lvlTxt.destroy();
          updateHUD(player,hudTexts); showShopOverlay(player,pi,pd);
        });
        // Sélection attaquant
        ov.querySelectorAll('[data-atksel]').forEach(el=>el.onclick=()=>{player.selectedAttacker=el.dataset.atksel;showShopOverlay(player,pi,pd);});
        // Achat attaquant
        ov.querySelectorAll('[data-buyatk]').forEach(el=>el.onclick=()=>{
          const id=el.dataset.buyatk;
          const a=ATTACKER_DEFS[id];
          if(player.goldAtk<a.cost)return;
          player.goldAtk-=a.cost;
          player.attackers[id]=(player.attackers[id]||0)+(a.count||1);
          updateHUD(player,hudTexts); showShopOverlay(player,pi,pd);
        });
        // Vente attaquant
        ov.querySelectorAll('[data-sellatk]').forEach(el=>el.onclick=()=>{
          const id=el.dataset.sellatk;
          if(!player.attackers[id])return;
          player.attackers[id]--;
          if(player.attackers[id]<=0)delete player.attackers[id];
          player.goldAtk+=Math.round(ATTACKER_DEFS[id].cost*0.5);
          updateHUD(player,hudTexts); showShopOverlay(player,pi,pd);
        });
        ov.querySelector('#shop-close').onclick=()=>removeShopOverlay();
      }

      function removeShopOverlay(){
        if(shopOverlay&&shopOverlay.parentNode)shopOverlay.remove();
        shopOverlay=null; shopIsOpen=false;
      }

      // ── TOURS ──────────────────────────────────────────────────────────
      function placeTower(scene,player,x,y,type){
        const base=TOWER_DEFS[type];
        const cfg={...base,upg:undefined,upgrades:JSON.parse(JSON.stringify(base.upg))};
        const g=scene.add.graphics().setPosition(x,y).setDepth(15);
        drawTowerGfx(g,cfg,0);
        const ico=scene.add.text(x,y-1,cfg.emoji,{fontSize:'11px'}).setOrigin(0.5).setDepth(16);
        const rg=scene.add.graphics().setPosition(x,y).setDepth(9);
        rg.lineStyle(1,cfg.col,.1);rg.strokeCircle(0,0,cfg.range);rg.visible=false;
        g.setInteractive(new Phaser.Geom.Circle(0,0,18),Phaser.Geom.Circle.Contains);
        g.on('pointerover',()=>rg.visible=true);g.on('pointerout',()=>rg.visible=false);
        const lvlTxt=scene.add.text(x+12,y-12,'1',{fontSize:'7px',color:'#ffffff55',fontFamily:'monospace'}).setDepth(17);
        const t={x,y,type,cfg,g,ico,rg,lvlTxt,lastFire:0,level:0,totalDmg:0};
        player.towers.push(t);
        emitBurst(scene,x,y,cfg.col);
        return t;
      }

      function drawTowerGfx(g,cfg,level){
        g.clear();
        if(level>=2){g.fillStyle(cfg.col,.1);g.fillCircle(0,0,20);}
        g.fillStyle(0x080b1a);g.fillCircle(0,0,17);
        g.fillStyle(0x111830);g.fillCircle(0,0,14);
        g.lineStyle(level>=1?2.5:1.8,cfg.col,level>=2?1:.8);g.strokeCircle(0,0,11);
        if(cfg.splash){g.fillStyle(cfg.col,.5);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;g.fillCircle(Math.cos(a)*4,Math.sin(a)*4,2);}}
        else if(cfg.chain){g.lineStyle(1.5,cfg.col,.7);g.lineBetween(-5,-3,5,-3);g.lineBetween(-5,0,5,0);g.lineBetween(-5,3,5,3);}
        else if(cfg.pierce){g.lineStyle(2,cfg.col,.9);g.lineBetween(-6,0,6,0);}
        else{g.lineStyle(1.5,cfg.col,.5);g.lineBetween(-4,0,4,0);g.lineBetween(0,-4,0,4);}
      }

      function redrawTower(t){drawTowerGfx(t.g,t.cfg,t.level);t.lvlTxt.setText(''+(t.level+1));}

      // ── ENNEMIS ────────────────────────────────────────────────────────
      function spawnEnemy(scene,data,pd,player,enemyPlayer){
        const colNum=parseInt(data.col.replace('#',''),16);
        const g=scene.add.graphics().setDepth(10);
        const hpBar=scene.add.graphics().setDepth(12);
        const start=posOnPath(pd,0);
        const e={
          g,hpBar,pd,player,enemyPlayer,
          hp:data.hp,maxHp:data.hp,spd:data.spd,col:data.col,colNum,
          reward:data.reward,size:data.size,
          armor:data.armor||0,stealth:!!data.stealth,heals:!!data.heals,boss:!!data.boss,
          name:data.name,typeid:data.typeid,
          distTraveled:0,x:start.x,y:start.y,dead:false,
          slowTimer:0,slowFactor:1,poisonTimer:0,poisonDmg:0,
          pulseT:Math.random()*Math.PI*2,
          stealthVisible:false,stealthFlicker:0,
        };
        player.enemies.push(e);
        drawEnemy(e);
        return e;
      }

      function drawEnemy(e){
        e.g.clear();
        const r=e.size,c=e.colNum;
        e.g.setAlpha(e.stealth&&!e.stealthVisible?0.32:1);
        if(e.boss){
          const pts=[];for(let k=0;k<6;k++){const a=k/6*Math.PI*2-Math.PI/6;pts.push({x:Math.cos(a)*r,y:Math.sin(a)*r});}
          e.g.fillStyle(c,1);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.fillPath();
          e.g.lineStyle(2,0xffd700,.8);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.strokePath();
        } else {
          e.g.fillStyle(c,1);e.g.fillCircle(0,0,r);
          e.g.fillStyle(0xffffff,.15);e.g.fillCircle(-r*.2,-r*.2,r*.3);
          e.g.lineStyle(1.5,0xffffff,.2);e.g.strokeCircle(0,0,r);
        }
        if(e.stealth){e.g.lineStyle(1,0x475569,.5);e.g.strokeCircle(0,0,r+3);}
      }

      // ── VAGUES ─────────────────────────────────────────────────────────
      function launchWave(scene,players,pdA,pdB){
        betweenWaves=false;shopIsOpen=false;
        const waveData=AUTO_WAVES[waveIdx%AUTO_WAVES.length];
        const scale=Math.pow(1.18,Math.floor(waveIdx/AUTO_WAVES.length));
        waveIdx++;
        hudTexts['p0wave']&&hudTexts['p0wave'].setText('Vague '+waveIdx);
        hudTexts['p1wave']&&hudTexts['p1wave'].setText('Vague '+waveIdx);

        showFloat2(scene,'⚔️ Vague '+waveIdx,players[0].path.pts[0].x+20,TOP_H+20,'#60a5fa');
        showFloat2(scene,'⚔️ Vague '+waveIdx,players[1].path.pts[0].x+20,TOP_H+20,'#ef4444');

        // Spawner les ennemis automatiques sur chaque chemin
        // Les ennemis du joueur 0 vont sur le chemin de J1 (attaquent J1)
        // et vice versa
        waveData.forEach(sq=>{
          const offset=sq.offset||0;
          for(let i=0;i<sq.count;i++){
            scene.time.delayedCall(offset+i*sq.delay,()=>{
              if(gameOver)return;
              const def=ATTACKER_DEFS[sq.type]||ATTACKER_DEFS['grunt'];
              const d={...def,typeid:sq.type,hp:Math.round(def.hp*scale),spd:Math.min(def.spd+(waveIdx-1)*1.2,150),reward:Math.round(def.reward*scale)};
              // Ennemis auto : envoyés sur les deux chemins
              spawnEnemy(scene,d,pdA,players[0],players[1]); // ennemi sur chemin J1, J2 tire dessus
              spawnEnemy(scene,d,pdB,players[1],players[0]); // ennemi sur chemin J2, J1 tire dessus
            });
          }
        });

        // Attaquants achetés par les joueurs → envoyés sur le chemin adverse
        players.forEach((attacker,ai)=>{
          const defender=players[1-ai];
          const defPd=ai===0?pdB:pdA;
          Object.entries(attacker.attackers).forEach(([type,count])=>{
            for(let i=0;i<count;i++){
              const def=ATTACKER_DEFS[type];
              const d={...def,typeid:type,hp:Math.round(def.hp*scale),spd:Math.min(def.spd+(waveIdx-1)*1.2,150),reward:Math.round(def.reward*scale)};
              scene.time.delayedCall(1500+i*400,()=>{
                if(gameOver)return;
                spawnEnemy(scene,d,defPd,defender,attacker);
              });
            }
          });
        });

        const maxDelay=(waveData.reduce((mx,sq)=>Math.max(mx,(sq.offset||0)+sq.count*sq.delay),0))+4000;
        scene.time.delayedCall(maxDelay,()=>checkWaveEnd(scene,players,pdA,pdB));
      }

      function checkWaveEnd(scene,players,pdA,pdB){
        if(gameOver)return;
        const allClear=players.every(p=>p.enemies.every(e=>e.dead));
        if(!allClear){scene.time.delayedCall(1500,()=>checkWaveEnd(scene,players,pdA,pdB));return;}
        betweenWaves=true;
        // Bonus entre vagues
        players.forEach(p=>{
          const bonus=40+waveIdx*10;
          p.goldDef+=bonus; p.goldAtk+=Math.round(bonus*0.5);
          updateHUD(p,hudTexts);
          showFloat2(scene,`+${bonus}💰 +${Math.round(bonus*0.5)}⚔️`,p.path.pts[0].x+20,TOP_H+40,'#10b981');
        });
        // Prochain vague après 6s (temps de shop)
        scene.time.delayedCall(6000,()=>{if(!gameOver)launchWave(scene,players,pdA,pdB);});
        showFloat2(scene,'🏪 6s de shop!',players[0].path.pts[0].x+20,TOP_H+60,'#fbbf24');
        showFloat2(scene,'🏪 6s de shop!',players[1].path.pts[0].x+20,TOP_H+60,'#fbbf24');
      }

      // ── UPDATE ─────────────────────────────────────────────────────────
      function update(time,delta){
        if(gameOver)return;
        const dt=delta/1000;

        // Mettre à jour les ennemis de chaque joueur
        // "player.enemies" = les ennemis qui avancent SUR son chemin (attaquent ce joueur)
        const allPlayers=scene.registry.get('players');
        if(!allPlayers)return;
        const [p1,p2]=allPlayers;
        const players=[p1,p2];

        players.forEach(defender=>{
          const attacker=players[1-defender.id];
          for(let i=defender.enemies.length-1;i>=0;i--){
            const e=defender.enemies[i];
            if(e.dead)continue;
            e.pulseT+=0.06;

            // Soins inter-ennemis
            if(e.heals){
              defender.enemies.forEach(ne=>{if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<55){ne.hp=Math.min(ne.maxHp,ne.hp+ne.maxHp*.03);}});
            }
            // Stealth
            if(e.stealth){
              e.stealthFlicker+=dt;
              e.stealthVisible=defender.towers.some(t=>t.type==='laser'&&Math.hypot(t.x-e.x,t.y-e.y)<t.cfg.range);
              e.g.setAlpha(e.stealthVisible?1:0.3+Math.sin(e.stealthFlicker*3)*.1);
            }
            // Ralentissement
            if(e.slowTimer>0){e.slowTimer-=dt;}else{e.slowFactor=1;}
            // Poison
            if(e.poisonTimer>0){e.poisonTimer-=dt;e.hp-=e.poisonDmg*dt;if(e.hp<=0){killEnemy(e,i,defender,attacker,players);continue;}}

            // Mouvement
            const effSpd=e.spd*e.slowFactor;
            e.distTraveled+=effSpd*dt;
            const pos=posOnPath(e.pd,e.distTraveled);
            e.x=pos.x; e.y=pos.y;

            if(pos.done){
              // A atteint la fin → perd des vies
              e.dead=true;
              const loss=e.boss?4:e.armor>0.3?2:1;
              defender.lives=Math.max(0,defender.lives-loss);
              // Or d'attaque pour l'attaquant (son ennemi a avancé)
              attacker.goldAtk=Math.min(9999,attacker.goldAtk+Math.round(e.reward*0.4));
              cleanupEnemy(e);
              defender.enemies.splice(i,1);
              updateHUD(defender,hudTexts);
              updateHUD(attacker,hudTexts);
              if(defender.lives<=0){triggerGameOver(scene,players,defender,attacker);return;}
              continue;
            }

            e.g.setPosition(e.x,e.y);
            e.hpBar.setPosition(e.x,e.y);
            const bw=e.boss?34:(e.size>12?26:20);
            e.hpBar.clear();
            e.hpBar.fillStyle(0x000000,.7);e.hpBar.fillRect(-bw/2,-e.size-12,bw,3.5);
            const pct=Math.max(0,e.hp/e.maxHp);
            e.hpBar.fillStyle(pct>.6?0x22c55e:pct>.3?0xfbbf24:0xef4444);
            e.hpBar.fillRect(-bw/2,-e.size-12,bw*pct,3.5);
          }

          // Tours tirent
          defender.towers.forEach(tower=>{
            if(time-tower.lastFire<tower.cfg.rate)return;
            let cands=defender.enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=tower.cfg.range);
            if(tower.type!=='laser')cands=cands.filter(e=>!e.stealth||e.stealthVisible);
            if(tower.cfg.minRange)cands=cands.filter(e=>Math.hypot(tower.x-e.x,tower.y-e.y)>=tower.cfg.minRange);
            if(!cands.length)return;
            cands.sort((a,b)=>b.distTraveled-a.distTraveled);
            const tgt=cands[0];
            tower.lastFire=time;
            if(tower.cfg.chain) doChain(tower,tgt,defender,attacker,players,time);
            else if(tower.cfg.pierce) doPierce(tower,tgt,defender,attacker,players,time);
            else fireBullet(scene,tower,tgt,tower.cfg.dmg,defender,attacker,players);
          });
        });

        // Projectiles
        for(let i=bullets.length-1;i>=0;i--){
          const b=bullets[i];
          if(!b.target||b.target.dead){b.g.destroy();bullets.splice(i,1);continue;}
          const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y,d=Math.hypot(dx,dy);
          if(d<8){applyHit(b,players);b.g.destroy();bullets.splice(i,1);}
          else{b.g.x+=dx/d*(220/60);b.g.y+=dy/d*(220/60);}
        }

        // Particules
        for(let i=particles.length-1;i>=0;i--){
          const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=200*dt;p.life-=dt;
          p.g.setPosition(p.x,p.y).setAlpha(Math.max(0,p.life/p.maxLife));
          if(p.life<=0){p.g.destroy();particles.splice(i,1);}
        }
      }

      function doChain(tower,first,defender,attacker,players,time){
        const maxC=(tower.cfg.chain||3)+2;
        let tgts=[first],last=first;
        for(let k=1;k<maxC;k++){
          const n=defender.enemies.find(e=>!e.dead&&e!==last&&!tgts.includes(e)&&Math.hypot(last.x-e.x,last.y-e.y)<65);
          if(n){tgts.push(n);last=n;}else break;
        }
        tgts.forEach((t,idx)=>fireBullet(scene,tower,t,tower.cfg.dmg*Math.pow(.75,idx),defender,attacker,players));
        for(let k=0;k<tgts.length-1;k++){
          const cg=scene.add.graphics().setDepth(55);
          cg.lineStyle(2,0xfacc15,1);cg.beginPath();cg.moveTo(tgts[k].x,tgts[k].y);cg.lineTo(tgts[k+1].x,tgts[k+1].y);cg.strokePath();
          scene.tweens.add({targets:cg,alpha:0,duration:150,onComplete:()=>cg.destroy()});
        }
      }

      function doPierce(tower,first,defender,attacker,players,time){
        const dx=first.x-tower.x,dy=first.y-tower.y,len=Math.hypot(dx,dy)||1;
        const nx=dx/len,ny=dy/len;
        const hit=defender.enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=tower.cfg.range);
        hit.sort((a,b)=>Math.abs((a.x-tower.x)*ny-(a.y-tower.y)*nx)-Math.abs((b.x-tower.x)*ny-(b.y-tower.y)*nx));
        hit.slice(0,5).forEach((e,idx)=>{
          e.hp-=tower.cfg.dmg*Math.pow(.85,idx); tower.totalDmg+=tower.cfg.dmg;
          if(e.hp<=0) killEnemy(e,defender.enemies.indexOf(e),defender,attacker,players);
        });
        const lg=scene.add.graphics().setDepth(55);
        lg.lineStyle(2.5,tower.cfg.col,.85);lg.beginPath();lg.moveTo(tower.x,tower.y);lg.lineTo(first.x,first.y);lg.strokePath();
        scene.tweens.add({targets:lg,alpha:0,duration:80,onComplete:()=>lg.destroy()});
      }

      function fireBullet(scene,tower,target,dmg,defender,attacker,players){
        const g=scene.add.graphics().setDepth(40);
        g.fillStyle(tower.cfg.col,1);
        tower.cfg.splash?g.fillCircle(0,0,5):(g.fillCircle(0,0,2.5));
        g.setPosition(tower.x,tower.y);
        bullets.push({g,target,tower,dmg,defender,attacker,players});
      }

      function applyHit(b,players){
        const e=b.target; if(e.dead)return;
        let dmg=b.dmg*(1-e.armor);
        if(b.tower.cfg.slow){e.slowTimer=1.8;e.slowFactor=b.tower.cfg.slow;}
        if(b.tower.cfg.poison){e.poisonTimer=4;e.poisonDmg=b.tower.cfg.dmg*.2;}
        e.hp-=dmg; b.tower.totalDmg+=dmg;
        if(b.tower.cfg.splash>0){
          b.defender.enemies.forEach(ne=>{if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<b.tower.cfg.splash){ne.hp-=dmg*.5;if(ne.hp<=0)killEnemy(ne,b.defender.enemies.indexOf(ne),b.defender,b.attacker,players);}});
          const sg=scene.add.graphics().setPosition(e.x,e.y).setDepth(70);
          sg.lineStyle(2.5,b.tower.cfg.col,.7);sg.strokeCircle(0,0,5);
          scene.tweens.add({targets:sg,scaleX:b.tower.cfg.splash/5,scaleY:b.tower.cfg.splash/5,alpha:0,duration:280,ease:'Cubic.Out',onComplete:()=>sg.destroy()});
        }
        if(e.hp<=0) killEnemy(e,b.defender.enemies.indexOf(e),b.defender,b.attacker,players);
      }

      function killEnemy(e,idx,defender,attacker,players){
        if(e.dead)return; e.dead=true;
        defender.kills++;
        // Or de défense pour le défenseur (a tué un ennemi)
        defender.goldDef=Math.min(9999,defender.goldDef+e.reward);
        defender.score+=e.reward*4+(e.boss?1500:0);
        updateHUD(defender,hudTexts);
        // Particules
        for(let k=0;k<(e.boss?25:8);k++){
          const pg=scene.add.graphics().setDepth(70);
          pg.fillStyle(e.colNum,1);pg.fillCircle(0,0,e.boss?4:2.5);pg.setPosition(e.x,e.y);
          particles.push({g:pg,x:e.x,y:e.y,vx:(Math.random()-.5)*(e.boss?240:150),vy:(Math.random()-.9)*(e.boss?260:180),life:Math.random()*.8+.2,maxLife:1.2});
        }
        emitBurst(scene,e.x,e.y,e.colNum);
        cleanupEnemy(e);
        if(idx>=0&&idx<defender.enemies.length)defender.enemies.splice(idx,1);
      }

      function cleanupEnemy(e){e.g.destroy();e.hpBar.destroy();}

      function emitBurst(scene,x,y,col){
        const g=scene.add.graphics().setPosition(x,y).setDepth(80);
        g.lineStyle(2,col,.8);g.strokeCircle(0,0,4);
        scene.tweens.add({targets:g,scaleX:5,scaleY:5,alpha:0,duration:320,ease:'Cubic.Out',onComplete:()=>g.destroy()});
      }

      function showFloat(scene,txt,x,y,col){
        const t=scene.add.text(x,y,txt,{fontSize:'11px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);
        scene.tweens.add({targets:t,y:y-32,alpha:0,duration:1400,onComplete:()=>t.destroy()});
      }
      function showFloat2(scene,txt,x,y,col){
        const t=scene.add.text(x,y,txt,{fontSize:'14px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);
        scene.tweens.add({targets:t,y:y-45,alpha:0,duration:1900,ease:'Cubic.Out',onComplete:()=>t.destroy()});
      }

      function triggerGameOver(scene,players,loser,winner){
        if(gameOver)return;
        gameOver=true;
        removeShopOverlay();
        saveScore({winner:`J${winner.id+1}`,wave:waveIdx,kills:winner.kills,score:winner.score,ts:Date.now()});
        const ov=document.createElement('div');
        ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.92);z-index:600;font-family:monospace';
        ov.innerHTML=`<div style="font-size:44px">${winner.id===0?'🔵':'🔴'}</div>
          <div style="font-size:26px;font-weight:900;color:${winner.id===0?'#60a5fa':'#ef4444'}">J${winner.id+1} GAGNE !</div>
          <div style="font-size:13px;color:rgba(255,255,255,.5)">Vague ${waveIdx} · ${winner.kills} kills · ${winner.score.toLocaleString()} pts</div>
          <button id="go-replay" style="margin-top:8px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#000;font-weight:800;padding:12px 28px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:14px">↺ REJOUER</button>`;
        container.appendChild(ov);
        ov.querySelector('#go-replay').onclick=()=>{ov.remove();if(_game){_game.destroy(true);_game=null;}renderPlay(container);};
      }

      // Config Phaser
      const config={
        type:Phaser.AUTO,
        width:W, height:H,
        parent:container,
        backgroundColor:'#07080e',
        scene:{
          preload,
          create(){
            create.call(this);
            this.registry.set('players',[makePlayer(0,'left',buildPathData(makePath(0,GAME_H))),makePlayer(1,'right',buildPathData(makePath(HALF,GAME_H)))]);
            // Re-init avec les vrais joueurs du registry
            const [p1r,p2r]=this.registry.get('players');
            const pdA2=p1r.path; const pdB2=p2r.path;
            this.input.removeAllListeners();
            this.input.on('pointerdown',ptr=>{
              if(gameOver||shopIsOpen)return;
              const {x,y}=ptr;
              if(y<TOP_H||y>H-BAR_H)return;
              const player=x<HALF?p1r:p2r;
              const pd=x<HALF?pdA2:pdB2;
              if(isOnPath(pd,x,y)){showFloat(this,'Chemin!',x,y-24,'#fbbf24');return;}
              if(player.towers.some(t=>Math.hypot(t.x-x,t.y-y)<30)){showFloat(this,'Trop proche!',x,y-24,'#fbbf24');return;}
              const cfg=TOWER_DEFS[player.selectedTower];
              if(player.goldDef<cfg.cost){showFloat(this,'Pas assez 💰',x,y-24,'#ef4444');return;}
              player.goldDef-=cfg.cost;
              placeTower(this,player,x,y,player.selectedTower);
              updateHUD(player,hudTexts);
            });
            // Boutiques
            const c2=container;
            [p1r,p2r].forEach((p,pi)=>{
              const ox=pi*HALF;
              scene=this;
              ['Tours 🗼','Attaq ⚔️'].forEach((lbl,ti)=>{
                const btn=this.add.text(ox+(ti===0?HALF/4:HALF*3/4),H-BAR_H+24,lbl,{fontSize:'9px',color:ti===0?'#60a5fa':'rgba(255,255,255,.4)',fontFamily:'monospace'}).setOrigin(0.5).setDepth(92).setInteractive();
                btn.on('pointerdown',()=>{p.shopTab=ti===0?'towers':'attackers';showShopOverlay(p,pi,p.path);});
              });
            });
            this.time.delayedCall(3000,()=>launchWave(this,[p1r,p2r],p1r.path,p2r.path));
          },
          update
        },
        scale:{mode:Phaser.Scale.NONE}
      };
      _game=new Phaser.Game(config);
      _game._active=true;
    }
  }

  // ── EXPORT ─────────────────────────────────────────────────────────────────
  window.YM_S['wipeout.sphere.js']={
    name:'Tower Defense VS', icon:'⚔️', category:'Games',
    description:'Tower Defense VS — 2 joueurs temps réel, 2 économies, attaquants achetables',
    emit:[], receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){if(_game){_game.destroy(true);_game=null;}},
    renderPanel,
    profileSection(container){
      const s=loadScores(); if(!s.length)return;
      const b=s[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:#0b0c14;border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">⚔️</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">TD VS · ${b.winner}</div><div style="font-size:10px;color:rgba(255,255,255,.4)">Vague ${b.wave} · ${b.kills} kills</div></div><div style="font-size:14px;font-weight:700;color:#f59e0b">${b.score.toLocaleString()}</div>`;
      container.appendChild(el);
    }
  };
})();
