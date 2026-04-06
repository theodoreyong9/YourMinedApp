/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense v3 — Phaser 3
// Ennemis redessinés, difficulté équilibrée, effets améliorés
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_td_scores_v3';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch (e) { return []; } }
  function saveScore(s) { const a = loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY, JSON.stringify(a.slice(0, 20))); }

  let _ctx = null, _game = null;

  function renderPanel(container) {
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0b0c14;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    container.innerHTML = '';
    const TABS = [['play', '🗼 Play'], ['scores', '🏆 Scores']];
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;background:#070710';
    TABS.forEach(([id, label]) => {
      const t = document.createElement('div');
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;color:${id === 'play' ? '#f59e0b' : 'rgba(255,255,255,.4)'}`;
      t.textContent = label;
      t.addEventListener('click', () => {
        tabs.querySelectorAll('div').forEach((x, i) => x.style.color = TABS[i][0] === id ? '#f59e0b' : 'rgba(255,255,255,.4)');
        track.innerHTML = '';
        if (_game) { _game.destroy(true); _game = null; }
        if (id === 'play') renderPlay(track); else renderScores(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track); container.appendChild(tabs);
    renderPlay(track);
  }

  function renderScores(container) {
    container.style.cssText = 'flex:1;overflow-y:auto;padding:16px;background:#0b0c14';
    const scores = loadScores();
    const html = [`<div style="font-size:18px;font-weight:700;color:#f59e0b;margin-bottom:16px">🏆 Hall of Fame</div>`];
    if (!scores.length) {
      html.push('<div style="color:rgba(255,255,255,.3);font-size:13px;text-align:center;margin-top:40px">No games yet.<br>Start defending!</div>');
    } else {
      scores.forEach((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        html.push(`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,.04)">
          <span>${medal}</span><div style="flex:1"><div style="font-size:13px;color:#fff">${s.name || 'Commander'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.35)">Wave ${s.wave}</div></div>
          <div style="font-size:15px;font-weight:700;color:#f59e0b">${s.score.toLocaleString()}</div></div>`);
      });
    }
    container.innerHTML = html.join('');
  }

  function renderPlay(container) {
    container.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#0b0c14';

    function initPhaser() {
      const Phaser = window.Phaser;
      const W = container.offsetWidth || 360;
      const H = container.offsetHeight || 500;

      // TOWER DEFINITIONS
      const TOWERS = {
        basic:  { cost:50,  range:88,  dmg:14,  rate:850,  col:0x3b82f6, name:'Archer',  emoji:'🏹', desc:'Équilibré',       upgrades:[{cost:55,dmg:22,range:98},{cost:90,dmg:34,range:108,rate:700}] },
        rapid:  { cost:70,  range:72,  dmg:7,   rate:260,  col:0x10b981, name:'Gatling', emoji:'⚡', desc:'Rafale rapide',   upgrades:[{cost:70,dmg:10,rate:200},{cost:120,dmg:16,rate:150,range:82}] },
        sniper: { cost:100, range:210, dmg:65,  rate:2000, col:0x8b5cf6, name:'Sniper',  emoji:'🎯', desc:'Longue portée',   upgrades:[{cost:85,dmg:110,rate:1700},{cost:140,dmg:175,range:250,rate:1400}] },
        frost:  { cost:80,  range:98,  dmg:6,   rate:700,  col:0x38bdf8, name:'Frost',   emoji:'❄️', desc:'Ralentit ×2',     slow:0.42, upgrades:[{cost:70,slow:0.22,range:115},{cost:110,dmg:12,slow:0.15,rate:550}] },
        cannon: { cost:120, range:108, dmg:90,  rate:2600, col:0xef4444, name:'Cannon',  emoji:'💣', desc:'Dégâts de zone',  splash:65, upgrades:[{cost:90,dmg:140,splash:85},{cost:170,dmg:210,splash:110,rate:2000}] },
        poison: { cost:90,  range:92,  dmg:4,   rate:580,  col:0xa3e635, name:'Poison',  emoji:'☠️', desc:'DoT persistant',  poison:true, upgrades:[{cost:75,dmg:6,rate:480},{cost:130,dmg:10,rate:380,range:112}] },
        tesla:  { cost:140, range:122, dmg:45,  rate:1400, col:0xfacc15, name:'Tesla',   emoji:'⚡', desc:'Arc en chaîne',   chain:3, upgrades:[{cost:110,dmg:68,chain:4},{cost:190,dmg:100,chain:5,range:145}] },
      };

      // WAVES — plus progressives, moins brutales au début
      const WAVES = [
        { count:6,  hp:30,  spd:45, rew:12, col:'#ef4444' },
        { count:9,  hp:55,  spd:52, rew:15, col:'#f97316' },
        { count:12, hp:85,  spd:50, rew:18, col:'#eab308' },
        { count:3,  hp:0,   spd:0,  rew:0,  col:'#a855f7', boss:true, bossHp:900,  bossSpd:28, bossRew:100 },
        { count:16, hp:110, spd:62, rew:20, col:'#84cc16' },
        { count:14, hp:175, spd:55, rew:28, col:'#06b6d4' },
        { count:10, hp:250, spd:65, rew:35, col:'#ec4899', armored:true },
        { count:2,  hp:0,   spd:0,  rew:0,  col:'#ff2222', boss:true, bossHp:3200, bossSpd:25, bossRew:280 },
        { count:22, hp:280, spd:72, rew:38, col:'#fbbf24' },
        { count:2,  hp:0,   spd:0,  rew:0,  col:'#ff0000', boss:true, bossHp:6500, bossSpd:32, bossRew:550 },
      ];

      let gold = 180, lives = 25, score = 0, wave = 0;
      let towers = [], enemies = [], bullets = [], particles = [];
      let selectedType = 'basic';
      let gameOver = false;
      let combo = 0, comboTimer = 0;
      let killCount = 0;
      let scene2 = null;

      function makePath(W, H) {
        const m = 24;
        return [
          { x: m + 8,    y: -30 },
          { x: m + 8,    y: H * 0.16 },
          { x: W * 0.54, y: H * 0.16 },
          { x: W * 0.54, y: H * 0.40 },
          { x: W * 0.20, y: H * 0.40 },
          { x: W * 0.20, y: H * 0.63 },
          { x: W * 0.74, y: H * 0.63 },
          { x: W * 0.74, y: H * 0.83 },
          { x: W - m,    y: H * 0.83 },
          { x: W - m,    y: H + 30 },
        ];
      }

      let pathPts = [];
      let pGfx = null;

      function isOnPath(x, y) {
        for (let i = 0; i < pathPts.length - 1; i++) {
          const a = pathPts[i], b = pathPts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
          if (!len2) continue;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
          const px = a.x + t * dx, py = a.y + t * dy;
          if ((x - px) ** 2 + (y - py) ** 2 < 32 * 32) return true;
        }
        return false;
      }

      function preload() { }

      function create() {
        scene2 = this;
        pathPts = makePath(W, H);

        // FOND étoilé animé
        const bgGfx = this.add.graphics();
        bgGfx.fillStyle(0x080910); bgGfx.fillRect(0, 0, W, H);

        // Grille subtile
        const gridGfx = this.add.graphics();
        gridGfx.lineStyle(0.5, 0xffffff, 0.03);
        const cs = 40;
        for (let x = 0; x < W; x += cs) gridGfx.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += cs) gridGfx.lineBetween(0, y, W, y);

        // Étoiles avec scintillement (groupe)
        const starGfx = this.add.graphics();
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * 0.4 + 0.1;
          starGfx.fillStyle(0xffffff, a);
          starGfx.fillCircle(Math.random() * W, Math.random() * H, Math.random() < 0.12 ? 1.5 : 0.8);
        }

        pGfx = this.add.graphics();
        drawPath();

        this.add.text(pathPts[1].x, 4, 'START', { fontSize: '9px', color: '#00f5ff88', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        this.add.text(pathPts[pathPts.length - 2].x, H - 14, 'END', { fontSize: '9px', color: '#ff336688', fontFamily: 'monospace' }).setOrigin(0.5, 0);

        createHUD(this);

        this.input.on('pointerdown', ptr => {
          if (gameOver) return;
          const x = ptr.x, y = ptr.y;
          const clickedTower = towers.find(t => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 20);
          if (clickedTower) { showUpgradePanel(this, clickedTower); return; }
          if (y > H - 56) return;
          if (isOnPath(x, y)) { showMsg(this, 'Chemin bloqué!', 0xef4444); return; }
          if (towers.some(t => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 34)) { showMsg(this, 'Trop proche!', 0xf97316); return; }
          const cfg = TOWERS[selectedType];
          if (gold < cfg.cost) { showMsg(this, 'Pas assez d\'or!', 0xef4444); return; }
          gold -= cfg.cost;
          placeTower(this, x, y, selectedType);
          updateHUD();
        });

        const preview = this.add.graphics();
        preview.setDepth(50);
        this.input.on('pointermove', ptr => {
          preview.clear();
          if (gameOver || ptr.y > H - 56) return;
          const cfg = TOWERS[selectedType];
          const valid = !isOnPath(ptr.x, ptr.y) && !towers.some(t => Phaser.Math.Distance.Between(t.x, t.y, ptr.x, ptr.y) < 34);
          preview.lineStyle(1, valid ? cfg.col : 0xff4444, 0.35);
          preview.strokeCircle(ptr.x, ptr.y, cfg.range);
          preview.fillStyle(valid ? cfg.col : 0xff4444, 0.2);
          preview.fillCircle(ptr.x, ptr.y, 16);
        });

        this.time.delayedCall(2000, () => spawnWave(this));
      }

      function drawPath() {
        pGfx.clear();
        // Ombre portée
        pGfx.lineStyle(44, 0x000000, 0.6);
        pGfx.beginPath(); pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x + 4, p.y + 4) : pGfx.moveTo(p.x + 4, p.y + 4)); pGfx.strokePath();
        // Sol brun
        pGfx.lineStyle(42, 0x1c1a28, 1);
        pGfx.beginPath(); pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y)); pGfx.strokePath();
        // Surface principale
        pGfx.lineStyle(34, 0x1e2345, 1);
        pGfx.beginPath(); pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y)); pGfx.strokePath();
        // Liseré neon gauche
        pGfx.lineStyle(2, 0x6366f1, 0.7);
        pGfx.beginPath(); pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y)); pGfx.strokePath();
        // Pointillés milieu
        for (let i = 0; i < pathPts.length - 1; i++) {
          const a = pathPts[i], b = pathPts[i + 1];
          const steps = 10;
          for (let s = 0; s < steps; s += 2) {
            const t0 = s / steps, t1 = (s + 0.7) / steps;
            pGfx.lineStyle(1.5, 0xffffff, 0.12);
            pGfx.beginPath();
            pGfx.moveTo(a.x + t0 * (b.x - a.x), a.y + t0 * (b.y - a.y));
            pGfx.lineTo(a.x + t1 * (b.x - a.x), a.y + t1 * (b.y - a.y));
            pGfx.strokePath();
          }
        }
      }

      // PLACE TOWER
      function placeTower(scene, x, y, type) {
        const cfg = { ...TOWERS[type] };
        cfg.upgrades = TOWERS[type].upgrades ? JSON.parse(JSON.stringify(TOWERS[type].upgrades)) : [];

        const g = scene.add.graphics();
        drawTowerGfx(g, cfg, 0);
        g.setPosition(x, y);

        const ico = scene.add.text(x, y - 1, cfg.emoji, { fontSize: '14px' }).setOrigin(0.5);

        const rg = scene.add.graphics();
        rg.lineStyle(1, cfg.col, 0.12); rg.strokeCircle(0, 0, cfg.range);
        rg.setPosition(x, y); rg.visible = false;

        const lvlTxt = scene.add.text(x + 13, y - 15, 'Lv1', { fontSize: '7px', color: '#ffffff88', fontFamily: 'monospace' }).setOrigin(0.5);

        g.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        g.on('pointerover', () => { rg.visible = true; });
        g.on('pointerout', () => { rg.visible = false; });

        emitBurst(scene, x, y, cfg.col, 14);
        scene.tweens.add({ targets: [g, ico], scaleX: { from: 0, to: 1 }, scaleY: { from: 0, to: 1 }, duration: 220, ease: 'Back.Out' });

        const tower = { x, y, type, cfg, g, ico, rg, lvlTxt, lastFire: 0, level: 0, totalDmg: 0 };
        towers.push(tower);
        score += 5; updateHUD();
        return tower;
      }

      function drawTowerGfx(g, cfg, level) {
        g.clear();
        // Halo niveau
        if (level >= 2) { g.fillStyle(cfg.col, 0.12); g.fillCircle(0, 0, 24); }
        // Base hexagonale
        g.fillStyle(0x0d1028); g.fillCircle(0, 0, 20);
        g.fillStyle(0x181f3a); g.fillCircle(0, 0, 17);
        // Anneau principal
        g.lineStyle(level >= 1 ? 2.5 : 2, cfg.col, level >= 2 ? 1 : 0.85);
        g.strokeCircle(0, 0, 13);
        if (level >= 1) { g.lineStyle(1, cfg.col, 0.35); g.strokeCircle(0, 0, 17); }
        // Croix centrale subtile
        g.lineStyle(1, cfg.col, 0.3);
        g.lineBetween(-6, 0, 6, 0); g.lineBetween(0, -6, 0, 6);
      }

      // UPGRADE UI
      let upgradeContainer = null;
      function showUpgradePanel(scene, tower) {
        if (upgradeContainer) { upgradeContainer.destroy(); upgradeContainer = null; }
        if (!tower.cfg.upgrades || tower.level >= tower.cfg.upgrades.length) {
          showMsg(scene, 'Niveau max!', 0xf59e0b); return;
        }
        const upg = tower.cfg.upgrades[tower.level];
        const cost = upg.cost;
        const px = Math.min(tower.x, W - 145), py = Math.max(tower.y - 72, 46);

        const cont = scene.add.container(px, py);
        const bg = scene.add.graphics();
        bg.fillStyle(0x080e1e, 0.96); bg.fillRoundedRect(0, 0, 138, 62, 8);
        bg.lineStyle(1, tower.cfg.col, 0.45); bg.strokeRoundedRect(0, 0, 138, 62, 8);
        const title = scene.add.text(69, 8, `Améliorer → Lv${tower.level + 2}`, { fontSize: '9px', color: '#ffffff88', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        const info = scene.add.text(8, 22, `Coût: ${cost}g`, { fontSize: '11px', color: '#f59e0b', fontFamily: 'monospace' });
        const can = gold >= cost;
        const okBtn = scene.add.text(69, 40, can ? '✓ AMÉLIORER' : '✗ MANQUE OR', {
          fontSize: '10px', color: can ? '#10b981' : '#ef4444', fontFamily: 'monospace', fontStyle: 'bold'
        }).setOrigin(0.5, 0).setInteractive();
        okBtn.on('pointerdown', () => {
          if (gold < cost) { showMsg(scene, 'Pas assez d\'or!', 0xef4444); return; }
          gold -= cost; tower.level++;
          Object.assign(tower.cfg, upg);
          drawTowerGfx(tower.g, tower.cfg, tower.level);
          tower.lvlTxt.setText(`Lv${tower.level + 1}`);
          tower.rg.clear(); tower.rg.lineStyle(1, tower.cfg.col, 0.18); tower.rg.strokeCircle(0, 0, tower.cfg.range);
          emitBurst(scene, tower.x, tower.y, tower.cfg.col, 22);
          score += 10; updateHUD();
          cont.destroy(); upgradeContainer = null;
        });
        cont.add([bg, title, info, okBtn]);
        cont.setDepth(100);
        upgradeContainer = cont;
        scene.time.delayedCall(4500, () => { if (upgradeContainer === cont) { cont.destroy(); upgradeContainer = null; } });
      }

      // SPAWN WAVE
      function spawnWave(scene) {
        if (gameOver) return;
        wave++; updateHUD();
        const wc = WAVES[Math.min(wave - 1, WAVES.length - 1)];
        const scale = Math.pow(1.28, Math.max(0, wave - WAVES.length));
        showMsg(scene, `⚔ Vague ${wave}`, 0xfbbf24);

        if (wc.boss) {
          let spawned = 0;
          function spawnNextBoss() {
            if (gameOver) return;
            spawnEnemy(scene, Math.round(wc.bossHp * scale), wc.bossSpd, wc.col, Math.round(wc.bossRew * scale), true, false);
            spawned++;
            if (spawned < wc.count) scene.time.delayedCall(2200, spawnNextBoss);
            else scheduleNext(scene, 9000);
          }
          scene.time.delayedCall(600, spawnNextBoss);
        } else {
          let spawned = 0;
          scene.time.addEvent({
            delay: 580, repeat: wc.count - 1, callback: () => {
              spawnEnemy(scene, Math.round(wc.hp * scale), Math.min(wc.spd + wave * 1.2, 145), wc.col, wc.rew, false, wc.armored);
              spawned++;
              if (spawned >= wc.count) scheduleNext(scene, 6000);
            }
          });
        }
      }

      function scheduleNext(scene, delay) {
        scene.time.delayedCall(delay, () => { if (!gameOver) spawnWave(scene); });
      }

      // SPAWN ENEMY — graphismes améliorés
      function spawnEnemy(scene, hp, speed, col, reward, boss = false, armored = false) {
        const radius = boss ? 16 : (armored ? 12 : 9);
        const g = scene.add.graphics();
        const hpBar = scene.add.graphics();
        const effectGfx = scene.add.graphics(); // effets (poison, slow, aura)
        const trailGfx = scene.add.graphics();  // trail de mouvement

        const colNum = parseInt(col.replace('#', ''), 16);
        const e = {
          g, hpBar, effectGfx, trailGfx,
          hp, maxHp: hp, speed, col, colNum, reward, boss, armored,
          pathIdx: 0, progress: 0,
          x: pathPts[0].x, y: pathPts[0].y,
          dead: false, radius,
          slowTimer: 0, poisonTimer: 0, poisonDmg: 0,
          flickerT: 0,
          shieldHp: armored ? Math.round(hp * 0.28) : 0,
          trailHistory: [],
          angle: 0, // rotation animée
          pulseT: Math.random() * Math.PI * 2, // phase d'animation
        };
        enemies.push(e);

        // Setup des layers de profondeur
        trailGfx.setDepth(8);
        g.setDepth(10);
        effectGfx.setDepth(11);
        hpBar.setDepth(12);

        drawEnemyInitial(e);
      }

      function drawEnemyInitial(e) {
        e.g.clear();
        const r = e.radius;
        const col = e.colNum;

        if (e.boss) {
          // Boss: design complexe — diamant avec aura tournante
          // Corps principal
          e.g.fillStyle(col, 1);
          e.g.fillTriangle(-r * 0.7, 0, 0, -r, r * 0.7, 0);
          e.g.fillTriangle(-r * 0.7, 0, 0, r, r * 0.7, 0);
          // Détails internes
          e.g.fillStyle(0xffffff, 0.25);
          e.g.fillTriangle(-r * 0.35, 0, 0, -r * 0.5, r * 0.35, 0);
          // Contour épais
          e.g.lineStyle(2.5, 0xffd700, 1);
          e.g.strokeTriangle(-r * 0.7, 0, 0, -r, r * 0.7, 0);
          e.g.strokeTriangle(-r * 0.7, 0, 0, r, r * 0.7, 0);

        } else if (e.armored) {
          // Blindé: forme hexagonale avec plaques
          const pts = [];
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 - Math.PI / 6;
            pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
          }
          e.g.fillStyle(col, 1);
          e.g.beginPath();
          pts.forEach((p, i) => i ? e.g.lineTo(p.x, p.y) : e.g.moveTo(p.x, p.y));
          e.g.closePath(); e.g.fillPath();
          // Plaques métalliques
          e.g.lineStyle(2, 0x94a3b8, 0.9);
          e.g.beginPath();
          pts.forEach((p, i) => i ? e.g.lineTo(p.x, p.y) : e.g.moveTo(p.x, p.y));
          e.g.closePath(); e.g.strokePath();
          e.g.lineStyle(1, 0xffffff, 0.2);
          e.g.lineBetween(-r * 0.5, 0, r * 0.5, 0);
          e.g.lineBetween(0, -r * 0.5, 0, r * 0.5);

        } else {
          // Ennemi normal: cercle avec œil central
          e.g.fillStyle(col, 1);
          e.g.fillCircle(0, 0, r);
          // Reflet
          e.g.fillStyle(0xffffff, 0.2);
          e.g.fillCircle(-r * 0.25, -r * 0.28, r * 0.3);
          // Contour
          e.g.lineStyle(1.5, 0xffffff, 0.45);
          e.g.strokeCircle(0, 0, r);
          // Pupille
          e.g.fillStyle(0x000000, 0.7);
          e.g.fillCircle(r * 0.18, 0, r * 0.32);
          e.g.fillStyle(0xffffff, 0.9);
          e.g.fillCircle(r * 0.22, -r * 0.05, r * 0.12);
        }
      }

      function updateEnemyGfx(e, time) {
        e.pulseT += 0.04;
        const pulse = Math.sin(e.pulseT) * 0.5 + 0.5;

        if (e.boss) {
          // Boss: redessine avec rotation et aura pulsante
          e.g.clear();
          const r = e.radius;
          const col = e.colNum;

          // Aura externe
          e.g.lineStyle(3, 0xffd700, 0.2 + pulse * 0.3);
          e.g.strokeCircle(0, 0, r + 5 + pulse * 3);

          // Corps
          e.g.fillStyle(col, 1);
          e.g.fillTriangle(-r * 0.72, 0, 0, -r, r * 0.72, 0);
          e.g.fillTriangle(-r * 0.72, 0, 0, r, r * 0.72, 0);
          e.g.fillStyle(0xffffff, 0.15 + pulse * 0.15);
          e.g.fillTriangle(-r * 0.36, 0, 0, -r * 0.5, r * 0.36, 0);
          e.g.lineStyle(2.5, 0xffd700, 0.7 + pulse * 0.3);
          e.g.strokeTriangle(-r * 0.72, 0, 0, -r, r * 0.72, 0);
          e.g.strokeTriangle(-r * 0.72, 0, 0, r, r * 0.72, 0);

          // Orbites tournantes
          for (let k = 0; k < 3; k++) {
            const oa = time * 0.003 + k * Math.PI * 2 / 3;
            const ox = Math.cos(oa) * (r + 9), oy = Math.sin(oa) * (r + 9);
            e.g.fillStyle(0xffd700, 0.8);
            e.g.fillCircle(ox, oy, 2.5);
          }
        }

        // Trail de mouvement
        e.trailHistory.push({ x: e.x, y: e.y });
        if (e.trailHistory.length > 8) e.trailHistory.shift();
        e.trailGfx.clear();
        e.trailGfx.setPosition(0, 0);
        e.trailHistory.forEach((p, i) => {
          const alpha = (i / e.trailHistory.length) * 0.35;
          const rTrail = (i / e.trailHistory.length) * (e.radius * 0.6);
          e.trailGfx.fillStyle(e.colNum, alpha);
          e.trailGfx.fillCircle(p.x, p.y, rTrail);
        });

        // Effet slow: cercles bleus
        if (e.slowTimer > 0) {
          e.effectGfx.clear();
          e.effectGfx.setPosition(e.x, e.y);
          e.effectGfx.lineStyle(2, 0x38bdf8, 0.6 + pulse * 0.4);
          e.effectGfx.strokeCircle(0, 0, e.radius + 4);
          e.effectGfx.lineStyle(1, 0x38bdf8, 0.25);
          e.effectGfx.strokeCircle(0, 0, e.radius + 8);
        } else if (e.poisonTimer > 0) {
          // Effet poison: bulles vertes
          e.effectGfx.clear();
          e.effectGfx.setPosition(e.x, e.y);
          for (let k = 0; k < 4; k++) {
            const ba = time * 0.004 + k * Math.PI / 2;
            const bx = Math.cos(ba) * (e.radius + 4), by = Math.sin(ba) * (e.radius + 4);
            e.effectGfx.fillStyle(0xa3e635, 0.7);
            e.effectGfx.fillCircle(bx, by, 2.5);
          }
          e.effectGfx.lineStyle(1.5, 0xa3e635, 0.4);
          e.effectGfx.strokeCircle(0, 0, e.radius + 5);
        } else {
          e.effectGfx.clear();
        }
      }

      // UPDATE LOOP
      function update(time, delta) {
        if (gameOver) return;
        const dt = delta / 1000;

        if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; if (hudTexts.combo) hudTexts.combo.setText(''); } }

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.dead) continue;

          if (e.poisonTimer > 0) {
            e.poisonTimer -= dt;
            e.hp -= e.poisonDmg * dt * 60;
            if (e.hp <= 0) { killEnemy(e, i); continue; }
          }
          if (e.slowTimer > 0) e.slowTimer -= dt;

          const spd = e.slowTimer > 0 ? e.speed * (e.slow || 0.42) : e.speed;
          e.progress += spd * dt;

          while (e.pathIdx < pathPts.length - 2) {
            const a = pathPts[e.pathIdx], b = pathPts[e.pathIdx + 1];
            const sLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (e.progress < sLen) break;
            e.progress -= sLen; e.pathIdx++;
          }
          if (e.pathIdx >= pathPts.length - 1) {
            lives = Math.max(0, lives - (e.boss ? 3 : 1));
            e.dead = true;
            e.g.destroy(); e.hpBar.destroy(); e.effectGfx.destroy(); e.trailGfx.destroy();
            enemies.splice(i, 1);
            scene2.cameras.main.shake(220, 0.007);
            updateHUD();
            if (lives <= 0) { triggerGameOver(); return; }
            continue;
          }

          const a = pathPts[e.pathIdx], b = pathPts[e.pathIdx + 1];
          const sLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const t = e.progress / sLen;
          e.x = a.x + t * (b.x - a.x);
          e.y = a.y + t * (b.y - a.y);
          e.g.setPosition(e.x, e.y);
          e.hpBar.setPosition(e.x, e.y);

          if (e.flickerT > 0) { e.flickerT -= dt; e.g.setAlpha(e.flickerT % 0.06 < 0.03 ? 0.25 : 1); }
          else e.g.setAlpha(1);

          // Mise à jour graphique animée
          updateEnemyGfx(e, time);

          // HP bar
          const bw = e.boss ? 32 : (e.armored ? 24 : 20);
          e.hpBar.clear();
          e.hpBar.fillStyle(0x000000, 0.7); e.hpBar.fillRect(-bw / 2, -e.radius - 11, bw, 5);
          const pct = Math.max(0, e.hp / e.maxHp);
          const hpCol = pct > 0.6 ? 0x22c55e : pct > 0.3 ? 0xfbbf24 : 0xef4444;
          e.hpBar.fillStyle(hpCol); e.hpBar.fillRect(-bw / 2, -e.radius - 11, bw * pct, 5);
          if (e.boss) { e.hpBar.lineStyle(1, 0xffd700, 0.5); e.hpBar.strokeRect(-bw / 2, -e.radius - 11, bw, 5); }
          if (e.shieldHp > 0) {
            e.hpBar.fillStyle(0x94a3b8);
            e.hpBar.fillRect(-bw / 2, -e.radius - 17, bw * (e.shieldHp / (e.maxHp * 0.28)), 3);
          }
        }

        // Towers fire
        towers.forEach(tower => {
          if (time - tower.lastFire < tower.cfg.rate) return;
          const inRange = enemies.filter(e => !e.dead && Math.hypot(tower.x - e.x, tower.y - e.y) <= tower.cfg.range);
          if (!inRange.length) return;
          inRange.sort((a, b) => (b.pathIdx + b.progress / 100) - (a.pathIdx + a.progress / 100));
          const tgt = inRange[0];
          tower.lastFire = time;

          if (tower.cfg.chain) {
            let targets = [tgt], last = tgt;
            for (let k = 1; k < tower.cfg.chain; k++) {
              const next = enemies.find(e => !e.dead && e !== last && !targets.includes(e) && Math.hypot(last.x - e.x, last.y - e.y) < 60);
              if (next) { targets.push(next); last = next; } else break;
            }
            targets.forEach((t, idx) => fireBullet(scene2, tower, t, tower.cfg.dmg * Math.pow(0.72, idx)));
            for (let k = 0; k < targets.length - 1; k++) emitSpark(scene2, targets[k], targets[k + 1]);
          } else {
            fireBullet(scene2, tower, tgt, tower.cfg.dmg);
          }
        });

        // Bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          if (!b.target || b.target.dead) { b.g.destroy(); bullets.splice(i, 1); continue; }
          const dx = b.target.x - b.g.x, dy = b.target.y - b.g.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 8) { applyHit(b); b.g.destroy(); bullets.splice(i, 1); }
          else { const s = 220 / 60; b.g.x += dx / dist * s; b.g.y += dy / dist * s; }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt;
          p.life -= dt;
          p.g.setPosition(p.x, p.y); p.g.setAlpha(Math.max(0, p.life / p.maxLife));
          if (p.life <= 0) { p.g.destroy(); particles.splice(i, 1); }
        }
      }

      function applyHit(b) {
        const e = b.target, tower = b.tower;
        if (e.shieldHp > 0 && e.armored) {
          e.shieldHp -= b.dmg * 0.45;
          if (e.shieldHp <= 0) { e.shieldHp = 0; emitBurst(scene2, e.x, e.y, 0x94a3b8, 10); }
          return;
        }
        e.hp -= b.dmg; e.flickerT = 0.14;
        tower.totalDmg = (tower.totalDmg || 0) + b.dmg;
        if (tower.cfg.slow) { e.slowTimer = 1.8; e.slow = tower.cfg.slow; }
        if (tower.cfg.poison) { e.poisonTimer = 4.0; e.poisonDmg = tower.cfg.dmg * 0.28; }
        if (tower.cfg.splash > 0) {
          enemies.forEach(ne => {
            if (!ne.dead && ne !== e && Math.hypot(ne.x - e.x, ne.y - e.y) < tower.cfg.splash) {
              ne.hp -= b.dmg * 0.48; ne.flickerT = 0.1;
              if (ne.hp <= 0) killEnemy(ne, enemies.indexOf(ne));
            }
          });
          emitSplash(scene2, e.x, e.y, b.col, tower.cfg.splash);
        }
        if (e.hp <= 0) killEnemy(e, enemies.indexOf(e));
      }

      function killEnemy(e, idx) {
        if (e.dead) return;
        e.dead = true; killCount++;
        combo++; comboTimer = 2.8;
        const mult = combo >= 5 ? 2.0 : combo >= 3 ? 1.5 : 1;
        const earned = Math.round(e.reward * mult);
        gold += earned; score += earned * 3 + (e.boss ? 1200 : 0);
        updateHUD();

        if (combo >= 3 && hudTexts.combo) {
          hudTexts.combo.setText(`${combo}x COMBO!`);
          hudTexts.combo.setAlpha(1);
          scene2.tweens.add({ targets: hudTexts.combo, alpha: 0, delay: 2000, duration: 500 });
        }

        // Explosion particules variées
        const count = e.boss ? 35 : (e.armored ? 15 : 10);
        for (let k = 0; k < count; k++) {
          const pg = scene2.add.graphics();
          const r = e.boss ? 5 : 3;
          // Alternance de 2 couleurs pour plus d'éclat
          const pCol = k % 2 === 0 ? e.colNum : 0xffffff;
          pg.fillStyle(pCol, 1); pg.fillCircle(0, 0, r);
          pg.setPosition(e.x, e.y); pg.setDepth(70);
          particles.push({
            g: pg, x: e.x, y: e.y,
            vx: (Math.random() - 0.5) * (e.boss ? 230 : 150),
            vy: (Math.random() - 0.85) * (e.boss ? 250 : 180),
            life: Math.random() * 0.9 + 0.35, maxLife: 1.25
          });
        }
        // Onde de choc
        emitBurst(scene2, e.x, e.y, e.colNum, 0);
        if (e.boss) {
          scene2.cameras.main.shake(450, 0.015);
          // 2e onde plus large
          scene2.time.delayedCall(80, () => emitBurst(scene2, e.x, e.y, 0xffd700, 0));
        }

        e.g.destroy(); e.hpBar.destroy(); e.effectGfx.destroy(); e.trailGfx.destroy();
        if (idx >= 0 && idx < enemies.length) enemies.splice(idx, 1);
      }

      function fireBullet(scene, tower, target, dmg) {
        const g = scene.add.graphics();
        const isBig = tower.cfg.splash > 0;
        const isChain = !!tower.cfg.chain;
        const r = isBig ? 5.5 : (isChain ? 4 : 3);
        g.fillStyle(tower.cfg.col, 1);
        if (isChain) { g.lineStyle(2.5, tower.cfg.col, 1); g.strokeCircle(0, 0, r); g.fillStyle(0xffffff, 0.6); g.fillCircle(0, 0, r * 0.5); }
        else if (isBig) { g.fillCircle(0, 0, r); g.lineStyle(1.5, 0xff8800, 0.7); g.strokeCircle(0, 0, r); }
        else { g.fillCircle(0, 0, r); }
        g.setPosition(tower.x, tower.y); g.setDepth(40);
        bullets.push({ g, target, tower, dmg, col: tower.cfg.col });
      }

      function emitBurst(scene, x, y, col, count) {
        const g = scene.add.graphics();
        g.lineStyle(2.5, col, 0.9); g.strokeCircle(0, 0, 6);
        g.setPosition(x, y).setDepth(80);
        scene.tweens.add({ targets: g, scaleX: 5, scaleY: 5, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => g.destroy() });
      }

      function emitSplash(scene, x, y, col, r) {
        const g = scene.add.graphics();
        g.lineStyle(3, col, 0.75); g.strokeCircle(0, 0, 6);
        g.setPosition(x, y).setDepth(70);
        scene.tweens.add({ targets: g, scaleX: r / 6, scaleY: r / 6, alpha: 0, duration: 310, ease: 'Cubic.Out', onComplete: () => g.destroy() });
        // 2e anneau
        const g2 = scene.add.graphics();
        g2.lineStyle(1.5, col, 0.4); g2.strokeCircle(0, 0, 8);
        g2.setPosition(x, y).setDepth(70);
        scene.tweens.add({ targets: g2, scaleX: r / 8 * 1.4, scaleY: r / 8 * 1.4, alpha: 0, duration: 450, ease: 'Cubic.Out', onComplete: () => g2.destroy() });
      }

      function emitSpark(scene, from, to) {
        const g = scene.add.graphics();
        g.lineStyle(2.5, 0xfacc15, 1);
        g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y); g.strokePath();
        g.setDepth(55);
        scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        // Éclairs secondaires
        const midX = (from.x + to.x) / 2 + (Math.random() - 0.5) * 14;
        const midY = (from.y + to.y) / 2 + (Math.random() - 0.5) * 14;
        const g2 = scene.add.graphics();
        g2.lineStyle(1, 0xfacc15, 0.6);
        g2.beginPath(); g2.moveTo(from.x, from.y); g2.lineTo(midX, midY); g2.lineTo(to.x, to.y); g2.strokePath();
        g2.setDepth(55);
        scene.tweens.add({ targets: g2, alpha: 0, duration: 180, onComplete: () => g2.destroy() });
      }

      // HUD
      let hudTexts = {};
      function createHUD(scene) {
        const topBg = scene.add.graphics();
        topBg.fillStyle(0x000000, 0.78); topBg.fillRect(0, 0, W, 40);
        topBg.setDepth(90);

        hudTexts.gold  = scene.add.text(10, 6, '💰 ' + gold, { fontSize: '13px', color: '#f59e0b', fontFamily: 'monospace' }).setDepth(91);
        hudTexts.lives = scene.add.text(W / 2, 6, '❤️ ' + lives, { fontSize: '13px', color: '#ef4444', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(91);
        hudTexts.score = scene.add.text(W - 8, 6, '⭐ ' + score, { fontSize: '13px', color: '#a78bfa', fontFamily: 'monospace' }).setOrigin(1, 0).setDepth(91);
        hudTexts.wave  = scene.add.text(W - 8, 24, 'Wave 0/' + WAVES.length, { fontSize: '9px', color: 'rgba(255,255,255,.4)', fontFamily: 'monospace' }).setOrigin(1, 0).setDepth(91);
        hudTexts.combo = scene.add.text(W / 2, 50, '', { fontSize: '16px', color: '#fbbf24', fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(95).setAlpha(0);

        const barH = 52, barY = H - barH;
        const barBg = scene.add.graphics();
        barBg.fillStyle(0x000000, 0.9); barBg.fillRect(0, barY, W, barH);
        barBg.setDepth(90);

        const types = Object.entries(TOWERS);
        const btnW = W / types.length;
        types.forEach(([id, cfg], i) => {
          const btn = scene.add.graphics().setDepth(91);
          btn.setInteractive(new Phaser.Geom.Rectangle(i * btnW, barY, btnW, barH), Phaser.Geom.Rectangle.Contains);
          function drawBtn(active) {
            btn.clear();
            btn.fillStyle(active ? cfg.col : 0x0e1020, active ? 0.28 : 0.85);
            btn.fillRect(i * btnW + 1, barY + 1, btnW - 2, barH - 2);
            if (active) { btn.lineStyle(1.5, cfg.col, 0.75); btn.strokeRect(i * btnW + 1, barY + 1, btnW - 2, barH - 2); }
          }
          drawBtn(id === selectedType);
          btn._isTowerBtn = true; btn.drawMe = drawBtn; btn._id = id;
          btn.on('pointerdown', () => {
            selectedType = id;
            scene.children.list.filter(c => c._isTowerBtn).forEach(c => c.drawMe(c._id === id));
            showMsg(scene, `${cfg.emoji} ${cfg.name} — ${cfg.cost}g — ${cfg.desc}`, cfg.col);
          });
          scene.add.text(i * btnW + btnW / 2, barY + 7, cfg.emoji, { fontSize: '17px' }).setOrigin(0.5, 0).setDepth(92);
          scene.add.text(i * btnW + btnW / 2, barY + 28, cfg.cost + 'g', { fontSize: '9px', color: '#f59e0b', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(92);
          scene.add.text(i * btnW + btnW / 2, barY + 39, cfg.name, { fontSize: '8px', color: 'rgba(255,255,255,.4)', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(92);
        });
      }

      function updateHUD() {
        if (hudTexts.gold)  hudTexts.gold.setText('💰 ' + gold.toLocaleString());
        if (hudTexts.lives) hudTexts.lives.setText('❤️ ' + lives);
        if (hudTexts.score) hudTexts.score.setText('⭐ ' + score.toLocaleString());
        if (hudTexts.wave)  hudTexts.wave.setText(`Wave ${wave}/${WAVES.length}`);
      }

      function showMsg(scene, txt, col) {
        const hexCol = typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : (col || '#fff');
        const t = scene.add.text(W / 2, H / 2 - 48, txt, {
          fontSize: '15px', color: hexCol, fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);
        scene.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1700, ease: 'Cubic.Out', onComplete: () => t.destroy() });
      }

      function triggerGameOver() {
        gameOver = true;
        const name = _ctx?.loadProfile?.()?.name || 'Commander';
        saveScore({ name, score, wave, ts: Date.now() });

        const ov = scene2.add.graphics().setDepth(300);
        ov.fillStyle(0x000000, 0.9); ov.fillRect(0, 0, W, H);
        scene2.add.text(W / 2, H / 2 - 75, 'GAME OVER', { fontSize: '30px', color: '#ef4444', fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(301);
        scene2.add.text(W / 2, H / 2 - 33, score.toLocaleString() + ' pts', { fontSize: '24px', color: '#f59e0b', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(301);
        scene2.add.text(W / 2, H / 2 + 2, `${killCount} ennemis · Vague ${wave}`, { fontSize: '12px', color: 'rgba(255,255,255,.5)', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(301);
        const rb = scene2.add.text(W / 2, H / 2 + 50, '▶  REJOUER', {
          fontSize: '14px', color: '#fff', fontFamily: 'monospace', backgroundColor: '#1d4ed8', padding: { x: 24, y: 12 }
        }).setOrigin(0.5).setInteractive().setDepth(302);
        rb.on('pointerover', () => rb.setBackgroundColor('#2563eb'));
        rb.on('pointerout', () => rb.setBackgroundColor('#1d4ed8'));
        rb.on('pointerdown', () => { if (_game) { _game.destroy(true); _game = null; } container.innerHTML = ''; renderPlay(container); });
      }

      const config = {
        type: Phaser.AUTO, width: W, height: H, parent: container,
        backgroundColor: '#080910',
        scene: { preload, create, update },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      };
      _game = new Phaser.Game(config);
    }

    if (window.Phaser) { initPhaser(); }
    else {
      const loading = document.createElement('div');
      loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:13px';
      loading.textContent = 'Chargement Phaser…'; container.appendChild(loading);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
      s.onload = () => { loading.remove(); initPhaser(); };
      document.head.appendChild(s);
    }
  }

  window.YM_S['towerdefense.sphere.js'] = {
    name: 'Tower Defense', icon: '🗼', category: 'Games',
    description: 'Tower Defense v3 — ennemis animés, boss orbitaux, effets trails/splash/arcs, difficulté équilibrée',
    emit: [], receive: [],
    activate(ctx) { _ctx = ctx; },
    deactivate() { if (_game) { _game.destroy(true); _game = null; } },
    renderPanel,
    profileSection(container) {
      const scores = loadScores(); if (!scores.length) return;
      const best = scores[0];
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0b0c14,#0d1a1f);border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML = `<span style="font-size:24px">🗼</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense</div><div style="font-size:11px;color:rgba(255,255,255,.5)">Wave ${best.wave}</div></div><div style="font-size:16px;font-weight:700;color:#f59e0b">${best.score.toLocaleString()} pts</div>`;
      container.appendChild(el);
    }
  };
})();
