/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense using Phaser 3
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const SCORES_KEY='ym_td_scores_v1';
function loadScores(){try{return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]');}catch(e){return[];}}
function saveScore(s){const arr=loadScores();arr.unshift(s);localStorage.setItem(SCORES_KEY,JSON.stringify(arr.slice(0,20)));}

let _ctx=null,_game=null;

// ── PANEL ─────────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#1a1a2e;font-family:-apple-system,sans-serif';
  container.innerHTML='';

  const TABS=[['play','🗼 Play'],['scores','🏆 Scores']];
  let tab='play';
  const track=document.createElement('div');track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  const tabs=document.createElement('div');tabs.className='ym-tabs';tabs.style.cssText='border-top:1px solid rgba(255,255,255,.1);margin:0;flex-shrink:0;background:#0d0d1a';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');t.className='ym-tab'+(id==='play'?' active':'');t.dataset.tab=id;t.textContent=label;
    t.style.color=id==='play'?'#f59e0b':'rgba(255,255,255,.5)';
    t.addEventListener('click',()=>{
      tab=id;tabs.querySelectorAll('.ym-tab').forEach(x=>{x.classList.toggle('active',x.dataset.tab===id);x.style.color=x.dataset.tab===id?'#f59e0b':'rgba(255,255,255,.5)';});
      track.innerHTML='';
      if(_game){_game.destroy(true);_game=null;}
      if(id==='play')renderPlay(track);else renderScores(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(track);container.appendChild(tabs);
  renderPlay(track);
}

function renderScores(container){
  container.style.cssText='flex:1;overflow-y:auto;padding:16px;background:#1a1a2e';
  container.innerHTML='<div style="font-size:18px;font-weight:700;color:#f59e0b;margin-bottom:16px">🏆 High Scores</div>';
  const scores=loadScores();
  if(!scores.length){container.innerHTML+='<div style="color:rgba(255,255,255,.4);font-size:13px">No games yet.</div>';return;}
  scores.forEach((s,i)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,.04)';
    row.innerHTML=`<span style="font-size:18px">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">${s.name||'Commander'}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.4)">Wave ${s.wave} · ${new Date(s.ts).toLocaleDateString()}</div></div>
      <div style="font-size:15px;font-weight:700;color:#f59e0b">${s.score} pts</div>`;
    container.appendChild(row);
  });
}

function renderPlay(container){
  container.style.cssText='flex:1;overflow:hidden;position:relative;background:#1a1a2e';

  // Charge Phaser 3
  function initPhaser(){
    const Phaser=window.Phaser;
    const W=container.offsetWidth||360;
    const H=container.offsetHeight||480;

    // ── GAME CONFIG ──────────────────────────────────────────────────────
    const config={
      type:Phaser.AUTO,
      width:W,height:H,
      parent:container,
      backgroundColor:'#1a1a2e',
      scene:{preload,create,update},
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
    };

    // ── GAME STATE ────────────────────────────────────────────────────────
    let gold=150,lives=20,score=0,wave=0,waveActive=false;
    let towers=[],enemies=[],bullets=[];
    let selectedTowerType='basic';
    let waveTimer=null,spawnTimer=null;
    let gameOver=false;

    const TOWER_TYPES={
      basic: {cost:50,range:80,damage:10,fireRate:1000,color:0x3b82f6,label:'Basic',emoji:'🗼'},
      sniper:{cost:100,range:150,damage:40,fireRate:2500,color:0x8b5cf6,label:'Sniper',emoji:'🎯'},
      rapid: {cost:80,range:70,damage:6,fireRate:400,color:0x10b981,label:'Rapid',emoji:'⚡'},
      frost:  {cost:90,range:90,damage:5,fireRate:800,color:0x06b6d4,label:'Frost',emoji:'❄️'},
      cannon:{cost:120,range:100,damage:60,fireRate:3000,color:0xef4444,label:'Cannon',emoji:'💣'},
    };

    const WAVE_CONFIG=[
      {count:8,hp:30,speed:60,reward:10,color:0xef4444},
      {count:12,hp:50,speed:70,reward:12,color:0xf97316},
      {count:15,hp:80,speed:60,reward:15,color:0xeab308},
      {count:20,hp:120,speed:55,reward:18,color:0x84cc16},
      {count:15,hp:200,speed:45,reward:25,color:0xa855f7},
      {count:25,hp:150,speed:80,reward:20,color:0xec4899},
      {count:10,hp:500,speed:40,reward:50,color:0xff0000},
    ];

    // ── PATH ─────────────────────────────────────────────────────────────
    // Chemin en zigzag
    function getPath(W,H){
      const pts=[];
      const rows=5,cols=4;
      const cw=W/(cols+1),rh=H/(rows+1);
      for(let r=0;r<=rows;r++){
        const x=r%2===0?cw*0.5:W-cw*0.5;
        const y=rh*(r+0.5);
        if(r>0){pts.push({x:r%2===0?W-cw*0.5:cw*0.5,y});}
        pts.push({x,y});
      }
      pts.unshift({x:cw*0.5,y:-20});
      pts.push({x:pts[pts.length-1].x,y:H+20});
      return pts;
    }

    let pathPoints=[];
    let pathGraphics=null;
    let scene2=null; // reference to Phaser scene

    function preload(){}

    function create(){
      scene2=this;
      pathPoints=getPath(W,H);

      // Dessin du chemin
      pathGraphics=this.add.graphics();
      drawPath();

      // Grille de placement
      const grid=this.add.graphics();
      grid.lineStyle(1,0xffffff,0.04);
      const cellSize=40;
      for(let x=0;x<W;x+=cellSize)grid.lineBetween(x,0,x,H);
      for(let y=0;y<H;y+=cellSize)grid.lineBetween(0,y,W,y);

      // HUD
      createHUD(this);

      // Input clic pour placer une tour
      this.input.on('pointerdown',ptr=>{
        if(gameOver)return;
        const x=ptr.x,y=ptr.y;
        // Vérifie pas sur le chemin
        if(isOnPath(x,y))return;
        // Vérifie pas trop proche d'une autre tour
        const tooClose=towers.some(t=>Phaser.Math.Distance.Between(t.x,t.y,x,y)<28);
        if(tooClose)return;
        const type=TOWER_TYPES[selectedTowerType];
        if(gold<type.cost){showMsg(this,'Not enough gold!',0xef4444);return;}
        gold-=type.cost;placeTower(this,x,y,selectedTowerType);updateHUD();
      });

      // Lance la première vague après 2s
      this.time.delayedCall(2000,()=>spawnWave(this));
    }

    function drawPath(){
      pathGraphics.clear();
      pathGraphics.fillStyle(0x374151,1);pathGraphics.lineStyle(3,0x6b7280,1);
      for(let i=0;i<pathPoints.length-1;i++){
        const a=pathPoints[i],b=pathPoints[i+1];
        const dx=b.x-a.x,dy=b.y-a.y;
        const len=Math.sqrt(dx*dx+dy*dy);
        const nx=-dy/len*18,ny=dx/len*18;
        pathGraphics.fillPoints([
          {x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},
          {x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}
        ],true);
      }
      pathGraphics.strokePoints(pathPoints.map(p=>({x:p.x,y:p.y})),false,true);
    }

    function isOnPath(x,y){
      for(let i=0;i<pathPoints.length-1;i++){
        const a=pathPoints[i],b=pathPoints[i+1];
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(len*len)));
        const px=a.x+t*dx,py=a.y+t*dy;
        if(Math.sqrt((x-px)**2+(y-py)**2)<26)return true;
      }
      return false;
    }

    function placeTower(scene,x,y,type){
      const cfg=TOWER_TYPES[type];
      const g=scene.add.graphics();
      // Base
      g.fillStyle(0x1f2937,1);g.fillCircle(0,0,18);
      g.fillStyle(cfg.color,1);g.fillCircle(0,0,13);
      g.setPosition(x,y);
      // Emoji label
      const txt=scene.add.text(x,y-14,cfg.emoji,{fontSize:'12px'}).setOrigin(0.5);
      // Radius indicator (on hover)
      const rangeCircle=scene.add.graphics();rangeCircle.lineStyle(1,cfg.color,0.15);rangeCircle.strokeCircle(0,0,cfg.range);rangeCircle.setPosition(x,y);rangeCircle.visible=false;
      g.setInteractive(new Phaser.Geom.Circle(0,0,18),Phaser.Geom.Circle.Contains);
      g.on('pointerover',()=>rangeCircle.visible=true);g.on('pointerout',()=>rangeCircle.visible=false);
      const tower={x,y,type,cfg,g,txt,rangeCircle,lastFire:0,target:null};
      towers.push(tower);
      score+=5;updateHUD();
    }

    function spawnWave(scene){
      if(gameOver)return;
      wave++;updateHUD();
      waveActive=true;
      const waveCfg=WAVE_CONFIG[Math.min(wave-1,WAVE_CONFIG.length-1)];
      // Scale pour vagues au-delà du config
      const scale=Math.pow(1.3,Math.max(0,wave-WAVE_CONFIG.length));
      const hp=Math.round(waveCfg.hp*scale);
      const speed=Math.min(waveCfg.speed+wave*2,160);
      let spawned=0;
      spawnTimer=scene.time.addEvent({delay:600,repeat:waveCfg.count-1,callback:()=>{
        spawnEnemy(scene,hp,speed,waveCfg.color,waveCfg.reward);
        spawned++;
        if(spawned>=waveCfg.count){
          waveActive=false;
          // Prochaine vague dans 5s
          scene.time.delayedCall(5000,()=>{
            if(!gameOver){showMsg(scene,'Wave '+(wave+1)+'!',0xf59e0b);spawnWave(scene);}
          });
        }
      }});
    }

    function spawnEnemy(scene,hp,speed,color,reward){
      const g=scene.add.graphics();
      g.fillStyle(color,1);g.fillCircle(0,0,9);
      g.lineStyle(2,0xffffff,0.4);g.strokeCircle(0,0,9);
      g.setPosition(pathPoints[0].x,pathPoints[0].y);
      const hpBar=scene.add.graphics();
      const maxHp=hp;
      const enemy={g,hpBar,hp,maxHp,speed,reward,pathIndex:0,progress:0,x:pathPoints[0].x,y:pathPoints[0].y,dead:false};
      enemies.push(enemy);
    }

    function update(time){
      if(gameOver)return;

      // Move enemies
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];if(e.dead)continue;
        // Calcul position sur le path
        let seg=e.pathIndex;
        if(seg>=pathPoints.length-1){
          // Ennemi arrivé
          lives--;updateHUD();
          e.dead=true;e.g.destroy();e.hpBar.destroy();enemies.splice(i,1);
          if(lives<=0)endGame(scene2);
          continue;
        }
        const a=pathPoints[seg],b=pathPoints[seg+1];
        const dx=b.x-a.x,dy=b.y-a.y,segLen=Math.sqrt(dx*dx+dy*dy);
        e.progress+=e.speed*(1/60);
        while(e.progress>=segLen&&e.pathIndex<pathPoints.length-2){
          e.progress-=segLen;e.pathIndex++;seg=e.pathIndex;
          const na=pathPoints[seg],nb=pathPoints[seg+1];
          const ndx=nb.x-na.x,ndy=nb.y-na.y;
          e.progress=Math.min(e.progress,Math.sqrt(ndx*ndx+ndy*ndy));
        }
        const ca=pathPoints[e.pathIndex],cb=pathPoints[e.pathIndex+1]||ca;
        const cdx=cb.x-ca.x,cdy=cb.y-ca.y,clen=Math.sqrt(cdx*cdx+cdy*cdy)||1;
        const t=Math.min(e.progress/clen,1);
        e.x=ca.x+t*cdx;e.y=ca.y+t*cdy;
        e.g.setPosition(e.x,e.y);

        // HP bar
        e.hpBar.clear();
        const bw=18,bh=3,bx=e.x-bw/2,by=e.y-14;
        e.hpBar.fillStyle(0x374151);e.hpBar.fillRect(bx,by,bw,bh);
        e.hpBar.fillStyle(e.hp/e.maxHp>0.5?0x22c55e:e.hp/e.maxHp>0.25?0xf59e0b:0xef4444);
        e.hpBar.fillRect(bx,by,Math.max(0,bw*(e.hp/e.maxHp)),bh);
      }

      // Towers fire
      towers.forEach(tower=>{
        if(time-tower.lastFire<tower.cfg.fireRate)return;
        // Trouve la cible la plus avancée dans la range
        let best=null,bestProg=-1;
        enemies.forEach(e=>{
          if(e.dead)return;
          const dist=Phaser.Math.Distance.Between(tower.x,tower.y,e.x,e.y);
          if(dist<=tower.cfg.range){
            const prog=e.pathIndex+e.progress/100;
            if(prog>bestProg){bestProg=prog;best=e;}
          }
        });
        if(!best)return;
        tower.lastFire=time;
        fireBullet(scene2,tower,best);
      });

      // Move bullets
      for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i];
        if(!b.target||b.target.dead){b.g.destroy();bullets.splice(i,1);continue;}
        const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<8){
          // Hit
          b.target.hp-=b.damage;
          if(b.target.hp<=0){
            gold+=b.target.reward;score+=b.target.reward*2;updateHUD();
            b.target.dead=true;b.target.g.destroy();b.target.hpBar.destroy();
            const idx=enemies.indexOf(b.target);if(idx>=0)enemies.splice(idx,1);
          }
          b.g.destroy();bullets.splice(i,1);
        }else{
          const speed=180/60;
          b.g.x+=dx/dist*speed;b.g.y+=dy/dist*speed;
        }
      }
    }

    function fireBullet(scene,tower,target){
      const g=scene.add.graphics();
      g.fillStyle(tower.cfg.color,1);
      if(tower.type==='cannon')g.fillCircle(0,0,5);
      else g.fillCircle(0,0,3);
      g.setPosition(tower.x,tower.y);
      bullets.push({g,target,damage:tower.cfg.damage});
    }

    // ── HUD ────────────────────────────────────────────────────────────────
    let hudTexts={};
    function createHUD(scene){
      const bg=scene.add.graphics();
      bg.fillStyle(0x000000,0.7);bg.fillRect(0,0,W,42);
      hudTexts.gold=scene.add.text(10,8,'💰 '+gold,{fontSize:'13px',color:'#f59e0b',fontFamily:'Arial'});
      hudTexts.lives=scene.add.text(W/2,8,'❤️ '+lives,{fontSize:'13px',color:'#ef4444',fontFamily:'Arial'}).setOrigin(0.5,0);
      hudTexts.score=scene.add.text(W-10,8,'⭐ '+score,{fontSize:'13px',color:'#8b5cf6',fontFamily:'Arial'}).setOrigin(1,0);
      hudTexts.wave=scene.add.text(W-10,22,'Wave '+wave,{fontSize:'10px',color:'rgba(255,255,255,.5)',fontFamily:'Arial'}).setOrigin(1,0);

      // Sélecteur de tours (bottom)
      const barH=48;const barY=H-barH;
      scene.add.graphics().fillStyle(0x000000,0.85).fillRect(0,barY,W,barH);
      const types=Object.entries(TOWER_TYPES);
      const btnW=W/types.length;
      types.forEach(([id,cfg],i)=>{
        const bx=i*btnW+btnW/2,by=barY+barH/2;
        const bg2=scene.add.graphics();
        bg2.setInteractive(new Phaser.Geom.Rectangle(i*btnW,barY,btnW,barH),Phaser.Geom.Rectangle.Contains);
        bg2.on('pointerdown',()=>{
          selectedTowerType=id;
          // Met en surbrillance
          scene.children.list.filter(c=>c._towerBtn).forEach(c=>{c.clear();c.fillStyle(0x111111,0.8);c.fillRect(c._bx,barY,btnW-1,barH);});
          bg2.clear();bg2.fillStyle(cfg.color,0.3);bg2.fillRect(i*btnW,barY,btnW-1,barH);
        });
        bg2._towerBtn=true;bg2._bx=i*btnW;
        bg2.fillStyle(id===selectedTowerType?cfg.color:0x111111,id===selectedTowerType?0.3:0.8);
        bg2.fillRect(i*btnW,barY,btnW-1,barH);
        scene.add.text(bx,barY+8,cfg.emoji,{fontSize:'16px'}).setOrigin(0.5,0);
        scene.add.text(bx,barY+27,cfg.cost+'g',{fontSize:'9px',color:'#f59e0b',fontFamily:'Arial'}).setOrigin(0.5,0);
      });
    }

    function updateHUD(){
      if(hudTexts.gold)hudTexts.gold.setText('💰 '+gold);
      if(hudTexts.lives)hudTexts.lives.setText('❤️ '+lives);
      if(hudTexts.score)hudTexts.score.setText('⭐ '+score);
      if(hudTexts.wave)hudTexts.wave.setText('Wave '+wave);
    }

    function showMsg(scene,msg,color){
      const txt=scene.add.text(W/2,H/2-40,msg,{fontSize:'20px',color:'#'+color.toString(16).padStart(6,'0'),fontFamily:'Arial',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5);
      scene.tweens.add({targets:txt,y:H/2-80,alpha:0,duration:1500,onComplete:()=>txt.destroy()});
    }

    function endGame(scene){
      gameOver=true;
      const name=_ctx?.loadProfile?.()?.name||'Commander';
      saveScore({name,score,wave,ts:Date.now()});
      if(window.YM_P2P)try{window.YM_P2P.broadcast({sphere:'towerdefense.sphere.js',type:'td:score',data:{name,score,wave}});}catch(e){}
      // Game over overlay
      const g=scene.add.graphics();g.fillStyle(0x000000,0.85);g.fillRect(0,0,W,H);
      scene.add.text(W/2,H/2-60,'GAME OVER',{fontSize:'28px',color:'#ef4444',fontFamily:'Arial',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5);
      scene.add.text(W/2,H/2,'Score: '+score,{fontSize:'20px',color:'#f59e0b',fontFamily:'Arial',fontStyle:'bold'}).setOrigin(0.5);
      scene.add.text(W/2,H/2+30,'Wave '+wave,{fontSize:'14px',color:'rgba(255,255,255,.6)',fontFamily:'Arial'}).setOrigin(0.5);
      const restartBtn=scene.add.text(W/2,H/2+70,'▶ Play Again',{fontSize:'16px',color:'#fff',fontFamily:'Arial',backgroundColor:'#1d4ed8',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive();
      restartBtn.on('pointerdown',()=>{
        if(_game){_game.destroy(true);_game=null;}
        container.innerHTML='';renderPlay(container);
      });
    }

    _game=new Phaser.Game(config);
  }

  if(window.Phaser){initPhaser();}
  else{
    const loading=document.createElement('div');loading.style.cssText='display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:13px';loading.textContent='Loading Phaser…';container.appendChild(loading);
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
    s.onload=()=>{loading.remove();initPhaser();};
    document.head.appendChild(s);
  }
}

// ── SPHERE ─────────────────────────────────────────────────────────────────────
window.YM_S['towerdefense.sphere.js']={
  name:'Tower Defense',icon:'🗼',category:'Games',
  description:'Tower Defense — 5 tower types, progressive waves, P2P leaderboard',
  emit:[],receive:[],
  activate(ctx){_ctx=ctx;},
  deactivate(){if(_game){_game.destroy(true);_game=null;}},
  renderPanel,
  profileSection(container){
    const scores=loadScores();if(!scores.length)return;
    const best=scores[0];
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1a1a2e,#0d1f0d);border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
    el.innerHTML=`<span style="font-size:24px">🗼</span>
      <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5)">Wave ${best.wave} · ${best.name||'—'}</div></div>
      <div style="font-size:16px;font-weight:700;color:#f59e0b">${best.score} pts</div>`;
    container.appendChild(el);
  }
};
})();
