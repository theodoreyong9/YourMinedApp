/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense v4 — Phaser 3
// FIX: upgrades fonctionnelles, game over réel, ennemis animés
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_td_scores_v4';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch (e) { return []; } }
  function saveScore(s) { const a = loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY, JSON.stringify(a.slice(0, 20))); }

  let _ctx = null, _game = null;

  function renderPanel(container) {
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#08090f;font-family:-apple-system,sans-serif';
    container.innerHTML = '';
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#050509';
    [['play','🗼 Play'],['scores','🏆 Scores']].forEach(([id,label],idx)=>{
      const t = document.createElement('div');
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;color:${idx===0?'#f59e0b':'rgba(255,255,255,.4)'}`;
      t.textContent = label;
      t.addEventListener('click', ()=>{
        tabs.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#f59e0b':'rgba(255,255,255,.4)');
        track.innerHTML = '';
        if (_game) { _game.destroy(true); _game = null; }
        if (id==='play') renderPlay(track); else renderScores(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track); container.appendChild(tabs);
    renderPlay(track);
  }

  function renderScores(container) {
    container.style.cssText = 'flex:1;overflow-y:auto;padding:16px;background:#08090f';
    const scores = loadScores();
    let html = `<div style="font-size:18px;font-weight:700;color:#f59e0b;margin-bottom:16px">🏆 Hall of Fame</div>`;
    if (!scores.length) { html += '<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:40px">Pas encore de partie.</div>'; }
    else scores.forEach((s,i) => {
      const medal = ['🥇','🥈','🥉'][i]||`#${i+1}`;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,.04)">
        <span>${medal}</span><div style="flex:1"><div style="color:#fff;font-size:13px">${s.name||'Commander'}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35)">Vague ${s.wave}</div></div>
        <div style="color:#f59e0b;font-size:15px;font-weight:700">${s.score.toLocaleString()}</div></div>`;
    });
    container.innerHTML = html;
  }

  function renderPlay(container) {
    container.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#08090f';

    function initPhaser() {
      const Phaser = window.Phaser;
      const W = container.offsetWidth || 360;
      const H = container.offsetHeight || 500;
      const BAR_H = 56;

      // ── TOWER DEFS ────────────────────────────────────────────────────────
      const TOWERS = {
        basic:  {cost:50, range:88, dmg:14, rate:850, col:0x3b82f6, name:'Archer', emoji:'🏹',
          upgrades:[{cost:55,dmg:22,range:98},{cost:90,dmg:36,range:108,rate:700}]},
        rapid:  {cost:70, range:72, dmg:7,  rate:260, col:0x10b981, name:'Gatling',emoji:'⚡',
          upgrades:[{cost:70,dmg:11,rate:200},{cost:120,dmg:17,rate:150,range:82}]},
        sniper: {cost:100,range:210,dmg:65, rate:2000,col:0x8b5cf6, name:'Sniper', emoji:'🎯',
          upgrades:[{cost:85,dmg:110,rate:1700},{cost:140,dmg:175,range:250,rate:1400}]},
        frost:  {cost:80, range:98, dmg:6,  rate:700, col:0x38bdf8, name:'Frost',  emoji:'❄️', slow:0.42,
          upgrades:[{cost:70,slow:0.22,range:115},{cost:110,dmg:12,slow:0.15,rate:550}]},
        cannon: {cost:120,range:108,dmg:90, rate:2600,col:0xef4444, name:'Cannon', emoji:'💣', splash:65,
          upgrades:[{cost:90,dmg:140,splash:85},{cost:170,dmg:210,splash:110,rate:2000}]},
        poison: {cost:90, range:92, dmg:4,  rate:580, col:0xa3e635, name:'Poison', emoji:'☠️', poison:true,
          upgrades:[{cost:75,dmg:6,rate:480},{cost:130,dmg:10,rate:380,range:112}]},
        tesla:  {cost:140,range:122,dmg:45, rate:1400,col:0xfacc15, name:'Tesla',  emoji:'⚡', chain:3,
          upgrades:[{cost:110,dmg:68,chain:4},{cost:190,dmg:100,chain:5,range:145}]},
      };

      const WAVES = [
        {count:6, hp:28, spd:44,rew:12,col:'#ef4444'},
        {count:9, hp:50, spd:50,rew:15,col:'#f97316'},
        {count:12,hp:80, spd:48,rew:18,col:'#eab308'},
        {count:2, hp:0,  spd:0, rew:0, col:'#a855f7',boss:true,bossHp:850, bossSpd:27,bossRew:95},
        {count:16,hp:105,spd:60,rew:20,col:'#84cc16'},
        {count:14,hp:165,spd:54,rew:28,col:'#06b6d4'},
        {count:10,hp:240,spd:63,rew:35,col:'#ec4899',armored:true},
        {count:2, hp:0,  spd:0, rew:0, col:'#ff2222',boss:true,bossHp:3000,bossSpd:24,bossRew:260},
        {count:22,hp:270,spd:70,rew:38,col:'#fbbf24'},
        {count:2, hp:0,  spd:0, rew:0, col:'#ff0000',boss:true,bossHp:6000,bossSpd:30,bossRew:520},
      ];

      let gold=180, lives=25, score=0, wave=0;
      let towers=[], enemies=[], bullets=[], particles=[];
      let selectedType='basic', gameOver=false;
      let combo=0, comboTimer=0, killCount=0;
      let upgradeOverlay=null; // DOM overlay pour les upgrades (hors Phaser)
      let scene2=null;

      function makePath(W,H) {
        const m=24;
        return [
          {x:m+8,    y:-30},
          {x:m+8,    y:H*.16},
          {x:W*.54,  y:H*.16},
          {x:W*.54,  y:H*.40},
          {x:W*.20,  y:H*.40},
          {x:W*.20,  y:H*.63},
          {x:W*.74,  y:H*.63},
          {x:W*.74,  y:H*.83},
          {x:W-m,    y:H*.83},
          {x:W-m,    y:H+30},
        ];
      }
      let pathPts=[];

      function isOnPath(x,y) {
        for(let i=0;i<pathPts.length-1;i++){
          const a=pathPts[i],b=pathPts[i+1];
          const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
          if(!len2)continue;
          const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));
          const px=a.x+t*dx,py=a.y+t*dy;
          if((x-px)**2+(y-py)**2<34*34) return true;
        }
        return false;
      }

      // ── UPGRADE OVERLAY (DOM, hors Phaser — évite les bugs hit area) ─────
      function showUpgradeOverlay(tower) {
        removeUpgradeOverlay();
        if (!tower.cfg.upgrades || tower.level >= tower.cfg.upgrades.length) {
          showFloatMsg(`${tower.cfg.name} — Niveau max!`, tower.x, tower.y - 40);
          return;
        }
        const upg = tower.cfg.upgrades[tower.level];
        const cost = upg.cost;

        const ov = document.createElement('div');
        ov.id = 'td-upg-overlay';
        // Positionner en coordonnées canvas
        const rect = container.getBoundingClientRect();
        const canvasEl = container.querySelector('canvas');
        const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : rect;
        const scaleX = W / canvasRect.width;
        const scaleY = H / canvasRect.height;
        // Position en CSS pixels dans le container
        const ox = tower.x / scaleX;
        const oy = tower.y / scaleY;
        const px = Math.min(ox - 65, canvasRect.width - 145);
        const py = Math.max(oy - 80, 46);

        ov.style.cssText = `position:absolute;left:${px}px;top:${py}px;width:136px;background:#08090f;border:1px solid rgba(${hexToRgb(tower.cfg.col)},0.6);border-radius:10px;padding:10px 12px;z-index:200;font-family:monospace;pointer-events:all`;
        const canLabel = gold >= cost;
        ov.innerHTML = `
          <div style="font-size:9px;color:rgba(255,255,255,.5);margin-bottom:6px">Améliorer → Lv${tower.level+2}</div>
          <div style="font-size:11px;color:#f59e0b;margin-bottom:8px">Coût: ${cost}g</div>
          <button id="td-upg-ok" style="width:100%;padding:7px;background:${canLabel?'rgba(16,185,129,.2)':'rgba(239,68,68,.15)'};border:1px solid ${canLabel?'#10b981':'#ef4444'};color:${canLabel?'#10b981':'#ef4444'};border-radius:6px;cursor:pointer;font-family:monospace;font-size:10px;font-weight:700">${canLabel?'✓ AMÉLIORER':'✗ PAS ASSEZ'}</button>
          <button id="td-upg-close" style="width:100%;padding:4px;background:transparent;border:none;color:rgba(255,255,255,.3);cursor:pointer;font-size:10px;margin-top:4px">✕ Fermer</button>`;
        container.appendChild(ov);
        upgradeOverlay = ov;

        ov.querySelector('#td-upg-ok').onclick = () => {
          if (gold < cost) { removeUpgradeOverlay(); showFloatMsg('Pas assez d\'or!', tower.x, tower.y-40); return; }
          gold -= cost;
          tower.level++;
          Object.assign(tower.cfg, upg); // Appliquer les stats
          // Redessiner la tour
          if (tower.g && scene2) drawTowerGfx(tower.g, tower.cfg, tower.level);
          tower.rg.clear(); tower.rg.lineStyle(1,tower.cfg.col,0.18); tower.rg.strokeCircle(0,0,tower.cfg.range);
          tower.lvlTxt.setText(`Lv${tower.level+1}`);
          emitBurst(scene2, tower.x, tower.y, tower.cfg.col, 22);
          score += 10; updateHUD();
          removeUpgradeOverlay();
        };
        ov.querySelector('#td-upg-close').onclick = () => removeUpgradeOverlay();

        // Auto-close après 5s
        setTimeout(() => removeUpgradeOverlay(), 5000);
      }

      function removeUpgradeOverlay() {
        if (upgradeOverlay) { upgradeOverlay.remove(); upgradeOverlay = null; }
      }

      function hexToRgb(hex) {
        const r=(hex>>16)&255, g=(hex>>8)&255, b=hex&255;
        return `${r},${g},${b}`;
      }

      function showFloatMsg(txt, x, y) {
        if (!scene2) return;
        const col = txt.includes('or') ? '#ef4444' : txt.includes('max') ? '#f59e0b' : '#10b981';
        const t = scene2.add.text(x, y, txt, {fontSize:'13px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);
        scene2.tweens.add({targets:t, y:y-38, alpha:0, duration:1600, onComplete:()=>t.destroy()});
      }

      function preload() {}

      function create() {
        scene2 = this;
        pathPts = makePath(W, H);

        // Fond
        const bg = this.add.graphics();
        bg.fillStyle(0x08090f); bg.fillRect(0,0,W,H);
        // Grille
        const gr = this.add.graphics();
        gr.lineStyle(0.5,0xffffff,0.03);
        for(let x=0;x<W;x+=40) gr.lineBetween(x,0,x,H);
        for(let y=0;y<H;y+=40) gr.lineBetween(0,y,W,y);
        // Étoiles
        const st = this.add.graphics();
        for(let i=0;i<60;i++){ st.fillStyle(0xffffff,Math.random()*.5+.1); st.fillCircle(Math.random()*W,Math.random()*H,Math.random()<.12?1.5:.7); }

        drawPath(this);
        this.add.text(pathPts[1].x,4,'START',{fontSize:'9px',color:'#00f5ff88',fontFamily:'monospace'}).setOrigin(0.5,0);
        this.add.text(pathPts[pathPts.length-2].x,H-14,'END',{fontSize:'9px',color:'#ff336688',fontFamily:'monospace'}).setOrigin(0.5,0);
        createHUD(this);

        // Fermer overlay si clic ailleurs
        this.input.on('pointerdown', ptr => {
          if (upgradeOverlay) { removeUpgradeOverlay(); return; }
          if (gameOver) return;
          const x=ptr.x, y=ptr.y;

          // Clic sur tour existante?
          const clickedTower = towers.find(t => Phaser.Math.Distance.Between(t.x,t.y,x,y)<22);
          if (clickedTower) { showUpgradeOverlay(clickedTower); return; }
          if (y > H - BAR_H) return;
          if (isOnPath(x,y)) { showFloatMsg('Chemin!',x,y-30); return; }
          if (towers.some(t => Phaser.Math.Distance.Between(t.x,t.y,x,y)<34)) { showFloatMsg('Trop proche!',x,y-30); return; }
          const cfg = TOWERS[selectedType];
          if (gold < cfg.cost) { showFloatMsg('Pas assez d\'or!',x,y-30); return; }
          gold -= cfg.cost;
          placeTower(this, x, y, selectedType);
          updateHUD();
        });

        // Preview curseur
        const preview = this.add.graphics().setDepth(50);
        this.input.on('pointermove', ptr => {
          preview.clear();
          if (gameOver || ptr.y > H-BAR_H) return;
          const cfg = TOWERS[selectedType];
          const ok = !isOnPath(ptr.x,ptr.y) && !towers.some(t=>Phaser.Math.Distance.Between(t.x,t.y,ptr.x,ptr.y)<34);
          preview.lineStyle(1,ok?cfg.col:0xff4444,0.35);
          preview.strokeCircle(ptr.x,ptr.y,cfg.range);
          preview.fillStyle(ok?cfg.col:0xff4444,0.18);
          preview.fillCircle(ptr.x,ptr.y,15);
        });

        this.time.delayedCall(2000, ()=>spawnWave(this));
      }

      function drawPath(scene) {
        const g = scene.add.graphics();
        g.lineStyle(46,0x000000,0.55); g.beginPath(); pathPts.forEach((p,i)=>i?g.lineTo(p.x+4,p.y+4):g.moveTo(p.x+4,p.y+4)); g.strokePath();
        g.lineStyle(44,0x13152a,1); g.beginPath(); pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        g.lineStyle(34,0x1a2040,1); g.beginPath(); pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        g.lineStyle(2,0x5b21b6,0.6); g.beginPath(); pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.strokePath();
        // Pointillés
        for(let i=0;i<pathPts.length-1;i++){
          const a=pathPts[i],b=pathPts[i+1];
          for(let s=0;s<10;s+=2){
            const t0=s/10,t1=(s+.65)/10;
            g.lineStyle(1.5,0xffffff,.12);
            g.beginPath(); g.moveTo(a.x+t0*(b.x-a.x),a.y+t0*(b.y-a.y)); g.lineTo(a.x+t1*(b.x-a.x),a.y+t1*(b.y-a.y)); g.strokePath();
          }
        }
      }

      function placeTower(scene, x, y, type) {
        const base = TOWERS[type];
        const cfg = {
          cost: base.cost, range: base.range, dmg: base.dmg, rate: base.rate, col: base.col, name: base.name, emoji: base.emoji,
          slow: base.slow, poison: base.poison, splash: base.splash, chain: base.chain,
          upgrades: base.upgrades ? JSON.parse(JSON.stringify(base.upgrades)) : []
        };

        const g = scene.add.graphics().setPosition(x,y).setDepth(15);
        drawTowerGfx(g, cfg, 0);
        g.setInteractive(new Phaser.Geom.Circle(0,0,20), Phaser.Geom.Circle.Contains);

        const ico = scene.add.text(x,y-1,cfg.emoji,{fontSize:'14px'}).setOrigin(0.5).setDepth(16);

        const rg = scene.add.graphics().setPosition(x,y).setDepth(9);
        rg.lineStyle(1,cfg.col,.12); rg.strokeCircle(0,0,cfg.range); rg.visible=false;
        g.on('pointerover',()=>rg.visible=true);
        g.on('pointerout',()=>rg.visible=false);

        const lvlTxt = scene.add.text(x+13,y-15,'Lv1',{fontSize:'7px',color:'#ffffff88',fontFamily:'monospace'}).setOrigin(0.5).setDepth(17);

        emitBurst(scene,x,y,cfg.col,14);
        scene.tweens.add({targets:[g,ico],scaleX:{from:0,to:1},scaleY:{from:0,to:1},duration:220,ease:'Back.Out'});

        towers.push({x,y,type,cfg,g,ico,rg,lvlTxt,lastFire:0,level:0,totalDmg:0});
        score+=5; updateHUD();
      }

      function drawTowerGfx(g, cfg, level) {
        g.clear();
        if(level>=2){g.fillStyle(cfg.col,.12);g.fillCircle(0,0,24);}
        g.fillStyle(0x0c0e20);g.fillCircle(0,0,20);
        g.fillStyle(0x16204a);g.fillCircle(0,0,17);
        g.lineStyle(level>=1?2.5:2,cfg.col,level>=2?1:.85);
        g.strokeCircle(0,0,13);
        if(level>=1){g.lineStyle(1,cfg.col,.35);g.strokeCircle(0,0,17);}
        g.lineStyle(1,cfg.col,.3);g.lineBetween(-6,0,6,0);g.lineBetween(0,-6,0,6);
      }

      // ── SPAWN ENEMIES ──────────────────────────────────────────────────────
      function spawnWave(scene) {
        if(gameOver)return;
        wave++; updateHUD();
        const wc=WAVES[Math.min(wave-1,WAVES.length-1)];
        const scale=Math.pow(1.28,Math.max(0,wave-WAVES.length));
        showMsg(scene,`⚔ Vague ${wave}`,0xfbbf24);

        if(wc.boss){
          let n=0;
          const spawnB=()=>{
            if(gameOver)return;
            spawnEnemy(scene,Math.round(wc.bossHp*scale),wc.bossSpd,wc.col,Math.round(wc.bossRew*scale),true,false);
            n++;
            if(n<wc.count) scene.time.delayedCall(2200,spawnB);
            else scheduleNext(scene,9000);
          };
          scene.time.delayedCall(600,spawnB);
        } else {
          let n=0;
          scene.time.addEvent({delay:580,repeat:wc.count-1,callback:()=>{
            spawnEnemy(scene,Math.round(wc.hp*scale),Math.min(wc.spd+wave*1.2,140),wc.col,wc.rew,false,wc.armored);
            n++;
            if(n>=wc.count) scheduleNext(scene,6000);
          }});
        }
      }

      function scheduleNext(scene,delay){ scene.time.delayedCall(delay,()=>{if(!gameOver)spawnWave(scene);}); }

      function spawnEnemy(scene,hp,speed,col,reward,boss=false,armored=false) {
        const colNum=parseInt(col.replace('#',''),16);
        const radius=boss?16:(armored?12:9);
        const g=scene.add.graphics().setDepth(10);
        const hpBar=scene.add.graphics().setDepth(12);
        const fx=scene.add.graphics().setDepth(11);
        const trail=scene.add.graphics().setDepth(8);
        const e={g,hpBar,fx,trail,hp,maxHp:hp,speed,col,colNum,reward,boss,armored,
          pathIdx:0,progress:0,x:pathPts[0].x,y:pathPts[0].y,dead:false,radius,
          slowTimer:0,poisonTimer:0,poisonDmg:0,flickerT:0,
          shieldHp:armored?Math.round(hp*.28):0,trailHist:[],pulseT:Math.random()*Math.PI*2};
        enemies.push(e);
        redrawEnemy(e);
      }

      function redrawEnemy(e) {
        e.g.clear();
        const r=e.radius, c=e.colNum;
        if(e.boss){
          // Boss: diamant avec reflet
          e.g.fillStyle(c,1);
          e.g.fillTriangle(-r*.7,0, 0,-r, r*.7,0);
          e.g.fillTriangle(-r*.7,0, 0,r,  r*.7,0);
          e.g.fillStyle(0xffffff,.2);
          e.g.fillTriangle(-r*.3,0, 0,-r*.4, r*.3,0);
          e.g.lineStyle(2.5,0xffd700,1);
          e.g.strokeTriangle(-r*.7,0, 0,-r, r*.7,0);
          e.g.strokeTriangle(-r*.7,0, 0,r,  r*.7,0);
        } else if(e.armored){
          // Hexagone blindé
          e.g.fillStyle(c,1);
          const pts2=[];
          for(let k=0;k<6;k++){const a=(k/6)*Math.PI*2-Math.PI/6;pts2.push({x:Math.cos(a)*r,y:Math.sin(a)*r});}
          e.g.beginPath(); pts2.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y)); e.g.closePath(); e.g.fillPath();
          e.g.lineStyle(2,0x94a3b8,.9); e.g.beginPath(); pts2.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y)); e.g.closePath(); e.g.strokePath();
          e.g.lineStyle(1,0xffffff,.2); e.g.lineBetween(-r*.5,0,r*.5,0); e.g.lineBetween(0,-r*.5,0,r*.5);
        } else {
          // Cercle avec œil
          e.g.fillStyle(c,1); e.g.fillCircle(0,0,r);
          e.g.fillStyle(0xffffff,.22); e.g.fillCircle(-r*.22,-r*.26,r*.32);
          e.g.lineStyle(1.5,0xffffff,.4); e.g.strokeCircle(0,0,r);
          e.g.fillStyle(0x000000,.7); e.g.fillCircle(r*.16,0,r*.30);
          e.g.fillStyle(0xffffff,.9); e.g.fillCircle(r*.20,-r*.06,r*.11);
        }
      }

      // ── UPDATE ─────────────────────────────────────────────────────────────
      function update(time, delta) {
        if(gameOver)return;
        const dt=delta/1000;
        if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0){combo=0;if(hudTexts.combo)hudTexts.combo.setText('');}}

        for(let i=enemies.length-1;i>=0;i--){
          const e=enemies[i]; if(e.dead)continue;
          e.pulseT+=0.05;
          const pulse=Math.sin(e.pulseT)*.5+.5;

          // Poison
          if(e.poisonTimer>0){
            e.poisonTimer-=dt; e.hp-=e.poisonDmg*dt*60;
            e.fx.clear(); e.fx.setPosition(e.x,e.y);
            for(let k=0;k<4;k++){const ba=time*.004+k*Math.PI/2;e.fx.fillStyle(0xa3e635,.7);e.fx.fillCircle(Math.cos(ba)*(e.radius+4),Math.sin(ba)*(e.radius+4),2.5);}
            e.fx.lineStyle(1.5,0xa3e635,.4); e.fx.strokeCircle(0,0,e.radius+5);
            if(e.hp<=0){killEnemy(e,i);continue;}
          } else if(e.slowTimer>0) {
            e.fx.clear(); e.fx.setPosition(e.x,e.y);
            e.fx.lineStyle(2,0x38bdf8,.5+pulse*.4); e.fx.strokeCircle(0,0,e.radius+4);
          } else { e.fx.clear(); }
          if(e.slowTimer>0) e.slowTimer-=dt;

          // Boss: orbites animées
          if(e.boss){
            e.g.clear(); const r=e.radius,c=e.colNum;
            e.g.lineStyle(3,0xffd700,.18+pulse*.25); e.g.strokeCircle(0,0,r+5+pulse*3);
            e.g.fillStyle(c,1); e.g.fillTriangle(-r*.7,0,0,-r,r*.7,0); e.g.fillTriangle(-r*.7,0,0,r,r*.7,0);
            e.g.fillStyle(0xffffff,.12+pulse*.12); e.g.fillTriangle(-r*.35,0,0,-r*.48,r*.35,0);
            e.g.lineStyle(2.5,0xffd700,.7+pulse*.3);
            e.g.strokeTriangle(-r*.7,0,0,-r,r*.7,0); e.g.strokeTriangle(-r*.7,0,0,r,r*.7,0);
            for(let k=0;k<3;k++){const oa=time*.003+k*Math.PI*2/3;e.g.fillStyle(0xffd700,.85);e.g.fillCircle(Math.cos(oa)*(r+9),Math.sin(oa)*(r+9),2.5);}
          }

          // Trail
          e.trailHist.push({x:e.x,y:e.y});
          if(e.trailHist.length>8) e.trailHist.shift();
          e.trail.clear();
          e.trailHist.forEach((p,j)=>{
            const a=(j/e.trailHist.length)*.3;
            const rt=(j/e.trailHist.length)*e.radius*.6;
            e.trail.fillStyle(e.colNum,a); e.trail.fillCircle(p.x,p.y,rt);
          });

          const spd=e.slowTimer>0?e.speed*(e.slow||.42):e.speed;
          e.progress+=spd*dt;
          while(e.pathIdx<pathPts.length-2){
            const a=pathPts[e.pathIdx],b=pathPts[e.pathIdx+1];
            const sLen=Math.hypot(b.x-a.x,b.y-a.y);
            if(e.progress<sLen) break;
            e.progress-=sLen; e.pathIdx++;
          }
          if(e.pathIdx>=pathPts.length-1){
            // L'ennemi a passé la ligne — PERTE DE VIES
            lives=Math.max(0,lives-(e.boss?3:1));
            e.dead=true;
            e.g.destroy();e.hpBar.destroy();e.fx.destroy();e.trail.destroy();
            enemies.splice(i,1);
            scene2.cameras.main.shake(230,.008);
            updateHUD();
            if(lives<=0){triggerGameOver();return;}
            continue;
          }
          const a=pathPts[e.pathIdx],b=pathPts[e.pathIdx+1];
          const sLen=Math.hypot(b.x-a.x,b.y-a.y)||1;
          const t=e.progress/sLen;
          e.x=a.x+t*(b.x-a.x); e.y=a.y+t*(b.y-a.y);
          e.g.setPosition(e.x,e.y); e.hpBar.setPosition(e.x,e.y);
          if(e.flickerT>0){e.flickerT-=dt;e.g.setAlpha(e.flickerT%0.06<0.03?.25:1);}else e.g.setAlpha(1);

          // HP bar
          const bw=e.boss?34:(e.armored?24:20);
          e.hpBar.clear();
          e.hpBar.fillStyle(0x000000,.75);e.hpBar.fillRect(-bw/2,-e.radius-12,bw,5);
          const pct=Math.max(0,e.hp/e.maxHp);
          e.hpBar.fillStyle(pct>.6?0x22c55e:pct>.3?0xfbbf24:0xef4444);
          e.hpBar.fillRect(-bw/2,-e.radius-12,bw*pct,5);
          if(e.boss){e.hpBar.lineStyle(1,0xffd700,.5);e.hpBar.strokeRect(-bw/2,-e.radius-12,bw,5);}
          if(e.shieldHp>0){e.hpBar.fillStyle(0x94a3b8);e.hpBar.fillRect(-bw/2,-e.radius-18,bw*(e.shieldHp/(e.maxHp*.28)),3);}
        }

        // Tour tir
        towers.forEach(tower=>{
          if(time-tower.lastFire<tower.cfg.rate)return;
          const inRange=enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=tower.cfg.range);
          if(!inRange.length)return;
          inRange.sort((a,b)=>(b.pathIdx+b.progress/100)-(a.pathIdx+a.progress/100));
          const tgt=inRange[0]; tower.lastFire=time;
          if(tower.cfg.chain){
            let targets=[tgt],last=tgt;
            for(let k=1;k<tower.cfg.chain;k++){
              const next=enemies.find(e=>!e.dead&&e!==last&&!targets.includes(e)&&Math.hypot(last.x-e.x,last.y-e.y)<62);
              if(next){targets.push(next);last=next;}else break;
            }
            targets.forEach((t,idx)=>fireBullet(scene2,tower,t,tower.cfg.dmg*Math.pow(.72,idx)));
            for(let k=0;k<targets.length-1;k++) emitSpark(scene2,targets[k],targets[k+1]);
          } else fireBullet(scene2,tower,tgt,tower.cfg.dmg);
        });

        // Balles
        for(let i=bullets.length-1;i>=0;i--){
          const b=bullets[i];
          if(!b.target||b.target.dead){b.g.destroy();bullets.splice(i,1);continue;}
          const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y,dist=Math.hypot(dx,dy);
          if(dist<8){applyHit(b);b.g.destroy();bullets.splice(i,1);}
          else{const s=225/60;b.g.x+=dx/dist*s;b.g.y+=dy/dist*s;}
        }

        // Particules
        for(let i=particles.length-1;i>=0;i--){
          const p=particles[i]; p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=210*dt;p.life-=dt;
          p.g.setPosition(p.x,p.y).setAlpha(Math.max(0,p.life/p.maxLife));
          if(p.life<=0){p.g.destroy();particles.splice(i,1);}
        }
      }

      function applyHit(b) {
        const e=b.target,tower=b.tower;
        if(e.shieldHp>0&&e.armored){
          e.shieldHp-=b.dmg*.45;
          if(e.shieldHp<=0){e.shieldHp=0;emitBurst(scene2,e.x,e.y,0x94a3b8,10);}
          return;
        }
        e.hp-=b.dmg; e.flickerT=0.14; tower.totalDmg=(tower.totalDmg||0)+b.dmg;
        if(tower.cfg.slow){e.slowTimer=1.8;e.slow=tower.cfg.slow;}
        if(tower.cfg.poison){e.poisonTimer=4.0;e.poisonDmg=tower.cfg.dmg*.28;}
        if(tower.cfg.splash>0){
          enemies.forEach(ne=>{
            if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<tower.cfg.splash){
              ne.hp-=b.dmg*.48;ne.flickerT=.1;if(ne.hp<=0)killEnemy(ne,enemies.indexOf(ne));
            }
          });
          emitSplash(scene2,e.x,e.y,b.col,tower.cfg.splash);
        }
        if(e.hp<=0) killEnemy(e,enemies.indexOf(e));
      }

      function killEnemy(e,idx) {
        if(e.dead)return;
        e.dead=true; killCount++;
        combo++; comboTimer=2.8;
        const mult=combo>=5?2:combo>=3?1.5:1;
        const earned=Math.round(e.reward*mult);
        gold+=earned; score+=earned*3+(e.boss?1200:0);
        updateHUD();
        if(combo>=3&&hudTexts.combo){hudTexts.combo.setText(`${combo}x COMBO!`);hudTexts.combo.setAlpha(1);scene2.tweens.add({targets:hudTexts.combo,alpha:0,delay:2000,duration:500});}
        const cnt=e.boss?35:(e.armored?15:10);
        for(let k=0;k<cnt;k++){
          const pg=scene2.add.graphics().setDepth(70);
          pg.fillStyle(k%2===0?e.colNum:0xffffff,1);pg.fillCircle(0,0,e.boss?5:3);pg.setPosition(e.x,e.y);
          particles.push({g:pg,x:e.x,y:e.y,vx:(Math.random()-.5)*(e.boss?240:160),vy:(Math.random()-.85)*(e.boss?260:190),life:Math.random()*.9+.35,maxLife:1.3});
        }
        emitBurst(scene2,e.x,e.y,e.colNum,0);
        if(e.boss){scene2.cameras.main.shake(450,.015);scene2.time.delayedCall(90,()=>emitBurst(scene2,e.x,e.y,0xffd700,0));}
        e.g.destroy();e.hpBar.destroy();e.fx.destroy();e.trail.destroy();
        if(idx>=0&&idx<enemies.length)enemies.splice(idx,1);
      }

      function fireBullet(scene,tower,target,dmg) {
        const g=scene.add.graphics().setDepth(40);
        const isBig=tower.cfg.splash>0, isChain=!!tower.cfg.chain;
        const r=isBig?5.5:(isChain?4:3);
        g.fillStyle(tower.cfg.col,1);
        if(isChain){g.lineStyle(2.5,tower.cfg.col,1);g.strokeCircle(0,0,r);g.fillStyle(0xffffff,.6);g.fillCircle(0,0,r*.5);}
        else if(isBig){g.fillCircle(0,0,r);g.lineStyle(1.5,0xff8800,.7);g.strokeCircle(0,0,r);}
        else g.fillCircle(0,0,r);
        g.setPosition(tower.x,tower.y);
        bullets.push({g,target,tower,dmg,col:tower.cfg.col});
      }

      function emitBurst(scene,x,y,col,_count){
        const g=scene.add.graphics().setPosition(x,y).setDepth(80);
        g.lineStyle(2.5,col,.9);g.strokeCircle(0,0,6);
        scene.tweens.add({targets:g,scaleX:5.5,scaleY:5.5,alpha:0,duration:400,ease:'Cubic.Out',onComplete:()=>g.destroy()});
      }

      function emitSplash(scene,x,y,col,r){
        const g=scene.add.graphics().setPosition(x,y).setDepth(70);
        g.lineStyle(3,col,.75);g.strokeCircle(0,0,6);
        scene.tweens.add({targets:g,scaleX:r/6,scaleY:r/6,alpha:0,duration:320,ease:'Cubic.Out',onComplete:()=>g.destroy()});
        const g2=scene.add.graphics().setPosition(x,y).setDepth(70);
        g2.lineStyle(1.5,col,.4);g2.strokeCircle(0,0,8);
        scene.tweens.add({targets:g2,scaleX:r/8*1.4,scaleY:r/8*1.4,alpha:0,duration:460,ease:'Cubic.Out',onComplete:()=>g2.destroy()});
      }

      function emitSpark(scene,from,to){
        const g=scene.add.graphics().setDepth(55);
        g.lineStyle(2.5,0xfacc15,1);g.beginPath();g.moveTo(from.x,from.y);g.lineTo(to.x,to.y);g.strokePath();
        scene.tweens.add({targets:g,alpha:0,duration:210,onComplete:()=>g.destroy()});
        const mx=(from.x+to.x)/2+(Math.random()-.5)*16,my=(from.y+to.y)/2+(Math.random()-.5)*16;
        const g2=scene.add.graphics().setDepth(55);
        g2.lineStyle(1,0xfacc15,.55);g2.beginPath();g2.moveTo(from.x,from.y);g2.lineTo(mx,my);g2.lineTo(to.x,to.y);g2.strokePath();
        scene.tweens.add({targets:g2,alpha:0,duration:190,onComplete:()=>g2.destroy()});
      }

      // ── HUD ────────────────────────────────────────────────────────────────
      let hudTexts={};
      function createHUD(scene) {
        const topBg=scene.add.graphics().setDepth(90);
        topBg.fillStyle(0x000000,.8);topBg.fillRect(0,0,W,40);
        hudTexts.gold =scene.add.text(10,6,'💰 '+gold,{fontSize:'13px',color:'#f59e0b',fontFamily:'monospace'}).setDepth(91);
        hudTexts.lives=scene.add.text(W/2,6,'❤️ '+lives,{fontSize:'13px',color:'#ef4444',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
        hudTexts.score=scene.add.text(W-8,6,'⭐ '+score,{fontSize:'13px',color:'#a78bfa',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91);
        hudTexts.wave =scene.add.text(W-8,24,'Wave 0/'+WAVES.length,{fontSize:'9px',color:'rgba(255,255,255,.4)',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91);
        hudTexts.combo=scene.add.text(W/2,50,'',{fontSize:'16px',color:'#fbbf24',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(95).setAlpha(0);

        const barY=H-BAR_H;
        const barBg=scene.add.graphics().setDepth(90);
        barBg.fillStyle(0x000000,.9);barBg.fillRect(0,barY,W,BAR_H);

        const types=Object.entries(TOWERS);
        const btnW=W/types.length;
        types.forEach(([id,cfg],i)=>{
          const btn=scene.add.graphics().setDepth(91);
          btn.setInteractive(new Phaser.Geom.Rectangle(i*btnW,barY,btnW,BAR_H),Phaser.Geom.Rectangle.Contains);
          function drawBtn(active){btn.clear();btn.fillStyle(active?cfg.col:0x0c0e20,active?.28:.88);btn.fillRect(i*btnW+1,barY+1,btnW-2,BAR_H-2);if(active){btn.lineStyle(1.5,cfg.col,.75);btn.strokeRect(i*btnW+1,barY+1,btnW-2,BAR_H-2);}}
          drawBtn(id===selectedType);
          btn._id=id;btn.drawMe=drawBtn;btn._isTB=true;
          btn.on('pointerdown',()=>{
            selectedType=id;
            scene.children.list.filter(c=>c._isTB).forEach(c=>c.drawMe(c._id===id));
            showMsg(scene,`${cfg.emoji} ${cfg.name} — ${cfg.cost}g`,cfg.col);
          });
          scene.add.text(i*btnW+btnW/2,barY+7,cfg.emoji,{fontSize:'17px'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(i*btnW+btnW/2,barY+28,cfg.cost+'g',{fontSize:'9px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(i*btnW+btnW/2,barY+39,cfg.name,{fontSize:'8px',color:'rgba(255,255,255,.4)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
        });
      }

      function updateHUD(){
        if(hudTexts.gold)  hudTexts.gold.setText('💰 '+gold.toLocaleString());
        if(hudTexts.lives) hudTexts.lives.setText('❤️ '+lives);
        if(hudTexts.score) hudTexts.score.setText('⭐ '+score.toLocaleString());
        if(hudTexts.wave)  hudTexts.wave.setText(`Wave ${wave}/${WAVES.length}`);
      }

      function showMsg(scene,txt,col){
        const hexCol=typeof col==='number'?'#'+col.toString(16).padStart(6,'0'):(col||'#fff');
        const t=scene.add.text(W/2,H/2-50,txt,{fontSize:'15px',color:hexCol,fontFamily:'monospace',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setOrigin(0.5).setDepth(200);
        scene.tweens.add({targets:t,y:t.y-40,alpha:0,duration:1700,ease:'Cubic.Out',onComplete:()=>t.destroy()});
      }

      function triggerGameOver(){
        gameOver=true;
        removeUpgradeOverlay();
        const name=_ctx?.loadProfile?.()?.name||'Commander';
        saveScore({name,score,wave,ts:Date.now()});

        const ov=scene2.add.graphics().setDepth(300);
        ov.fillStyle(0x000000,.92);ov.fillRect(0,0,W,H);
        scene2.add.text(W/2,H/2-75,'GAME OVER',{fontSize:'30px',color:'#ef4444',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(301);
        scene2.add.text(W/2,H/2-32,score.toLocaleString()+' pts',{fontSize:'24px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        scene2.add.text(W/2,H/2+4,`${killCount} ennemis · Vague ${wave}`,{fontSize:'12px',color:'rgba(255,255,255,.5)',fontFamily:'monospace'}).setOrigin(0.5).setDepth(301);
        const rb=scene2.add.text(W/2,H/2+50,'▶  REJOUER',{fontSize:'14px',color:'#fff',fontFamily:'monospace',backgroundColor:'#1d4ed8',padding:{x:24,y:12}}).setOrigin(0.5).setInteractive().setDepth(302);
        rb.on('pointerover',()=>rb.setBackgroundColor('#2563eb'));
        rb.on('pointerout',()=>rb.setBackgroundColor('#1d4ed8'));
        rb.on('pointerdown',()=>{if(_game){_game.destroy(true);_game=null;}container.innerHTML='';renderPlay(container);});
      }

      const config={type:Phaser.AUTO,width:W,height:H,parent:container,backgroundColor:'#08090f',
        scene:{preload,create,update},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}};
      _game=new Phaser.Game(config);
    }

    if(window.Phaser){initPhaser();}
    else{
      const loading=document.createElement('div');
      loading.style.cssText='display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:13px';
      loading.textContent='Chargement…';container.appendChild(loading);
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
      s.onload=()=>{loading.remove();initPhaser();};
      document.head.appendChild(s);
    }
  }

  window.YM_S['towerdefense.sphere.js']={
    name:'Tower Defense',icon:'🗼',category:'Games',
    description:'Tower Defense v4 — upgrades DOM fiables, boss orbitaux, trails, arcs tesla, game over réel',
    emit:[],receive:[],
    activate(ctx){_ctx=ctx;},
    deactivate(){if(_game){_game.destroy(true);_game=null;}},
    renderPanel,
    profileSection(container){
      const scores=loadScores();if(!scores.length)return;
      const best=scores[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:#0b0c14;border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:24px">🗼</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense</div><div style="font-size:11px;color:rgba(255,255,255,.5)">Vague ${best.wave}</div></div><div style="font-size:16px;font-weight:700;color:#f59e0b">${best.score.toLocaleString()} pts</div>`;
      container.appendChild(el);
    }
  };
})();
