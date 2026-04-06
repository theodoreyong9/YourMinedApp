/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense v2 — Phaser 3
// Améliorations : 7 types de tours avec upgrades, boss visuels, vfx particules,
// chemin animé, preview de placement, slow/poison/splash/beam, combo multiplier
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_td_scores_v2';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch (e) { return []; } }
  function saveScore(s) { const a = loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY, JSON.stringify(a.slice(0, 20))); }

  let _ctx = null, _game = null;

  // ── PANEL ──────────────────────────────────────────────────────────────────
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
      t.style.cssText = `flex:1;padding:10px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;transition:color .2s;color:${id === 'play' ? '#f59e0b' : 'rgba(255,255,255,.4)'}`;
      t.textContent = label;
      t.addEventListener('click', () => {
        tabs.querySelectorAll('div').forEach((x, i) => x.style.color = TABS[i][0] === id ? '#f59e0b' : 'rgba(255,255,255,.4)');
        track.innerHTML = '';
        if (_game) { _game.destroy(true); _game = null; }
        if (id === 'play') renderPlay(track); else renderScores(track);
      });
      tabs.appendChild(t);
    });
    container.appendChild(track);
    container.appendChild(tabs);
    renderPlay(track);
  }

  function renderScores(container) {
    container.style.cssText = 'flex:1;overflow-y:auto;padding:16px;background:#0b0c14';
    const scores = loadScores();
    const html = [`<div style="font-size:18px;font-weight:700;color:#f59e0b;margin-bottom:16px;letter-spacing:.5px">🏆 Hall of Fame</div>`];
    if (!scores.length) {
      html.push('<div style="color:rgba(255,255,255,.3);font-size:13px;text-align:center;margin-top:40px">No games yet.<br>Start defending!</div>');
    } else {
      scores.forEach((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        html.push(`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)">
          <span style="font-size:18px">${medal}</span>
          <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">${s.name || 'Commander'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.35)">Wave ${s.wave} · ${new Date(s.ts).toLocaleDateString()}</div></div>
          <div style="font-size:15px;font-weight:700;color:#f59e0b">${s.score.toLocaleString()} pts</div></div>`);
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

      // ── TOWER DEFINITIONS ────────────────────────────────────────────────
      const TOWERS = {
        basic:  { cost:50,  range:85,  dmg:12,  rate:900,  col:0x3b82f6, name:'Archer',  emoji:'🏹', desc:'Équilibré',        upgrades:[{cost:60,dmg:18,range:95},{cost:100,dmg:28,range:105,rate:750}] },
        rapid:  { cost:75,  range:70,  dmg:6,   rate:280,  col:0x10b981, name:'Gatling', emoji:'⚡', desc:'Cadence rapide',   upgrades:[{cost:80,dmg:9,rate:220},{cost:130,dmg:14,rate:160,range:80}] },
        sniper: { cost:110, range:200, dmg:60,  rate:2200, col:0x8b5cf6, name:'Sniper',  emoji:'🎯', desc:'Longue portée',    upgrades:[{cost:90,dmg:100,rate:1900},{cost:150,dmg:160,range:240,rate:1600}] },
        frost:  { cost:85,  range:95,  dmg:5,   rate:750,  col:0x38bdf8, name:'Frost',   emoji:'❄️', desc:'Ralentit ennemis', slow:0.45, upgrades:[{cost:75,slow:0.25,range:110},{cost:120,dmg:10,slow:0.15,rate:600}] },
        cannon: { cost:130, range:105, dmg:85,  rate:2800, col:0xef4444, name:'Cannon',  emoji:'💣', desc:'Dégâts zone',      splash:60, upgrades:[{cost:100,dmg:130,splash:80},{cost:180,dmg:200,splash:100,rate:2200}] },
        poison: { cost:95,  range:90,  dmg:3,   rate:600,  col:0xa3e635, name:'Poison',  emoji:'☠️', desc:'Dégâts persistants', poison:true, upgrades:[{cost:80,dmg:5,rate:500},{cost:140,dmg:8,rate:400,range:110}] },
        tesla:  { cost:150, range:120, dmg:40,  rate:1500, col:0xfacc15, name:'Tesla',   emoji:'⚡', desc:'Arc électrique',   chain:3, upgrades:[{cost:120,dmg:60,chain:4},{cost:200,dmg:90,chain:5,range:140}] },
      };

      // ── WAVE CONFIGS ─────────────────────────────────────────────────────
      const WAVES = [
        { count:8,  hp:40,  spd:55, rew:10, col:'#ef4444' },
        { count:12, hp:70,  spd:65, rew:13, col:'#f97316' },
        { count:16, hp:110, spd:62, rew:16, col:'#eab308' },
        { count:6,  hp:0,   spd:0,  rew:0,  col:'#a855f7', boss:true, bossHp:1200, bossSpd:32, bossRew:120 },
        { count:20, hp:140, spd:75, rew:18, col:'#84cc16' },
        { count:18, hp:220, spd:58, rew:25, col:'#06b6d4' },
        { count:12, hp:300, spd:70, rew:30, col:'#ec4899', armored:true },
        { count:4,  hp:0,   spd:0,  rew:0,  col:'#ff2222', boss:true, bossHp:4000, bossSpd:28, bossRew:300 },
        { count:25, hp:350, spd:80, rew:35, col:'#fbbf24' },
        { count:8,  hp:0,   spd:0,  rew:0,  col:'#ff0000', boss:true, bossHp:8000, bossSpd:38, bossRew:600 },
      ];

      // ── GAME STATE ───────────────────────────────────────────────────────
      let gold = 150, lives = 20, score = 0, wave = 0;
      let towers = [], enemies = [], bullets = [], particles = [];
      let selectedType = 'basic';
      let gameOver = false, waveActive = false;
      let combo = 0, comboTimer = 0;
      let selectedTower = null; // for upgrade UI
      let killCount = 0;
      let scene2 = null;

      // ── PATH GENERATION ──────────────────────────────────────────────────
      // Chemin en S + zigzag pour donner de l'espace aux tours
      function makePath(W, H) {
        const m = 22;
        return [
          { x: m + 10, y: -30 },
          { x: m + 10, y: H * 0.18 },
          { x: W * 0.52, y: H * 0.18 },
          { x: W * 0.52, y: H * 0.42 },
          { x: W * 0.22, y: H * 0.42 },
          { x: W * 0.22, y: H * 0.65 },
          { x: W * 0.72, y: H * 0.65 },
          { x: W * 0.72, y: H * 0.85 },
          { x: W - m, y: H * 0.85 },
          { x: W - m, y: H + 30 },
        ];
      }

      let pathPts = [];
      let pGfx = null, gridGfx = null;

      function isOnPath(x, y) {
        for (let i = 0; i < pathPts.length - 1; i++) {
          const a = pathPts[i], b = pathPts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
          if (!len2) continue;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
          const px = a.x + t * dx, py = a.y + t * dy;
          if ((x - px) ** 2 + (y - py) ** 2 < 30 * 30) return true;
        }
        return false;
      }

      function preload() { }

      function create() {
        scene2 = this;
        pathPts = makePath(W, H);

        // ── BACKGROUND STARS ─────────────────────────────────────────────
        const bgGfx = this.add.graphics();
        bgGfx.fillStyle(0x0b0c14); bgGfx.fillRect(0, 0, W, H);
        for (let i = 0; i < 80; i++) {
          const alpha = Math.random() * 0.5 + 0.1;
          const r = Math.random() < 0.1 ? 1.5 : 0.8;
          bgGfx.fillStyle(0xffffff, alpha);
          bgGfx.fillCircle(Math.random() * W, Math.random() * H, r);
        }

        // ── GRID ─────────────────────────────────────────────────────────
        gridGfx = this.add.graphics();
        gridGfx.lineStyle(1, 0xffffff, 0.04);
        const cs = 38;
        for (let x = 0; x < W; x += cs) gridGfx.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += cs) gridGfx.lineBetween(0, y, W, y);

        // ── PATH ─────────────────────────────────────────────────────────
        pGfx = this.add.graphics();
        drawPath();

        // ── LABELS DEBUT/FIN ─────────────────────────────────────────────
        this.add.text(pathPts[1].x, 6, 'START', { fontSize: '9px', color: '#ffffff55', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        this.add.text(pathPts[pathPts.length - 2].x, H - 14, 'END', { fontSize: '9px', color: '#ffffff55', fontFamily: 'monospace' }).setOrigin(0.5, 0);

        // ── HUD ──────────────────────────────────────────────────────────
        createHUD(this);

        // ── INPUT ────────────────────────────────────────────────────────
        this.input.on('pointerdown', ptr => {
          if (gameOver) return;
          const x = ptr.x, y = ptr.y;
          // Vérif clic sur tour existante (upgrade)
          const clickedTower = towers.find(t => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 20);
          if (clickedTower) {
            showUpgradePanel(this, clickedTower);
            return;
          }
          if (y > H - 56) return; // zone barre de sélection
          if (isOnPath(x, y)) { showMsg(this, 'Chemin bloqué!', 0xef4444); return; }
          if (towers.some(t => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 32)) {
            showMsg(this, 'Trop proche!', 0xf97316); return;
          }
          const cfg = TOWERS[selectedType];
          if (gold < cfg.cost) { showMsg(this, 'Pas assez d\'or!', 0xef4444); return; }
          gold -= cfg.cost;
          placeTower(this, x, y, selectedType);
          updateHUD();
        });

        // ── PREVIEW CURSEUR ──────────────────────────────────────────────
        const preview = this.add.graphics();
        preview.setDepth(50);
        this.input.on('pointermove', ptr => {
          preview.clear();
          if (gameOver || ptr.y > H - 56) return;
          const cfg = TOWERS[selectedType];
          const valid = !isOnPath(ptr.x, ptr.y) && !towers.some(t => Phaser.Math.Distance.Between(t.x, t.y, ptr.x, ptr.y) < 32);
          preview.lineStyle(1, valid ? cfg.col : 0xff4444, 0.4);
          preview.strokeCircle(ptr.x, ptr.y, cfg.range);
          preview.fillStyle(valid ? cfg.col : 0xff4444, 0.25);
          preview.fillCircle(ptr.x, ptr.y, 16);
        });

        this.time.delayedCall(1500, () => spawnWave(this));
      }

      // ── DRAW PATH ────────────────────────────────────────────────────────
      function drawPath() {
        pGfx.clear();
        // Ombre
        pGfx.lineStyle(40, 0x000000, 0.5);
        pGfx.beginPath();
        pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x + 3, p.y + 3) : pGfx.moveTo(p.x + 3, p.y + 3));
        pGfx.strokePath();
        // Sol
        pGfx.lineStyle(38, 0x1a1f35, 1);
        pGfx.beginPath();
        pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y));
        pGfx.strokePath();
        // Texture centrale
        pGfx.lineStyle(30, 0x1e2540, 1);
        pGfx.beginPath();
        pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y));
        pGfx.strokePath();
        // Bords gauche / droite neon
        pGfx.lineStyle(2, 0x6366f1, 0.5);
        pGfx.beginPath();
        pathPts.forEach((p, i) => i ? pGfx.lineTo(p.x, p.y) : pGfx.moveTo(p.x, p.y));
        pGfx.strokePath();
        // Pointillés centre
        for (let i = 0; i < pathPts.length - 1; i++) {
          const a = pathPts[i], b = pathPts[i + 1];
          const steps = 8;
          for (let s = 0; s < steps; s++) {
            if (s % 2 === 0) {
              const t0 = s / steps, t1 = (s + 0.5) / steps;
              const x0 = a.x + t0 * (b.x - a.x), y0 = a.y + t0 * (b.y - a.y);
              const x1 = a.x + t1 * (b.x - a.x), y1 = a.y + t1 * (b.y - a.y);
              pGfx.lineStyle(1.5, 0xffffff, 0.15);
              pGfx.beginPath(); pGfx.moveTo(x0, y0); pGfx.lineTo(x1, y1); pGfx.strokePath();
            }
          }
        }
      }

      // ── PLACE TOWER ──────────────────────────────────────────────────────
      function placeTower(scene, x, y, type) {
        const cfg = { ...TOWERS[type] };
        cfg.upgrades = TOWERS[type].upgrades ? JSON.parse(JSON.stringify(TOWERS[type].upgrades)) : [];

        // Base graphique
        const g = scene.add.graphics();
        drawTowerGfx(g, cfg, 0);
        g.setPosition(x, y);

        // Emoji
        const ico = scene.add.text(x, y - 1, cfg.emoji, { fontSize: '14px' }).setOrigin(0.5);

        // Range glow
        const rg = scene.add.graphics();
        rg.lineStyle(1, cfg.col, 0.12); rg.strokeCircle(0, 0, cfg.range);
        rg.setPosition(x, y); rg.visible = false;

        // Level badge
        const lvlTxt = scene.add.text(x + 12, y - 14, 'Lv1', {
          fontSize: '7px', color: '#ffffff88', fontFamily: 'monospace'
        }).setOrigin(0.5);

        g.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        g.on('pointerover', () => { rg.visible = true; });
        g.on('pointerout', () => { rg.visible = false; });

        // Effet placement burst
        emitBurst(scene, x, y, cfg.col, 12);
        scene.tweens.add({ targets: [g, ico], scaleX: { from: 0, to: 1 }, scaleY: { from: 0, to: 1 }, duration: 200, ease: 'Back.Out' });

        const tower = { x, y, type, cfg, g, ico, rg, lvlTxt, lastFire: 0, target: null, level: 0, totalDmg: 0 };
        towers.push(tower);
        score += 5; updateHUD();
        return tower;
      }

      function drawTowerGfx(g, cfg, level) {
        g.clear();
        // Halo de niveau
        if (level >= 2) {
          g.fillStyle(cfg.col, 0.15); g.fillCircle(0, 0, 22);
        }
        // Piédestal
        g.fillStyle(0x0f1020); g.fillCircle(0, 0, 19);
        g.fillStyle(0x1a2040); g.fillCircle(0, 0, 17);
        // Anneau de couleur
        const ringAlpha = level >= 1 ? 1 : 0.8;
        g.lineStyle(level >= 2 ? 3 : 2, cfg.col, ringAlpha);
        g.strokeCircle(0, 0, 13);
        if (level >= 1) {
          g.lineStyle(1, cfg.col, 0.4); g.strokeCircle(0, 0, 16);
        }
      }

      // ── UPGRADE UI ───────────────────────────────────────────────────────
      let upgradeContainer = null;
      function showUpgradePanel(scene, tower) {
        if (upgradeContainer) { upgradeContainer.destroy(); upgradeContainer = null; }
        if (!tower.cfg.upgrades || tower.level >= tower.cfg.upgrades.length) {
          showMsg(scene, 'Max level!', 0xf59e0b); return;
        }
        const upg = tower.cfg.upgrades[tower.level];
        const cost = upg.cost;
        const px = Math.min(tower.x, W - 140), py = Math.max(tower.y - 70, 48);

        const container = scene.add.container(px, py);
        const bg = scene.add.graphics();
        bg.fillStyle(0x0a0e20, 0.95); bg.fillRoundedRect(0, 0, 130, 60, 8);
        bg.lineStyle(1, tower.cfg.cfg || tower.cfg.col, 0.5); bg.strokeRoundedRect(0, 0, 130, 60, 8);
        const title = scene.add.text(65, 8, `Upgrade → Lv${tower.level + 2}`, { fontSize: '9px', color: '#ffffff99', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        const info = scene.add.text(8, 22, `Cost: ${cost}g`, { fontSize: '10px', color: '#f59e0b', fontFamily: 'monospace' });
        const okBtn = scene.add.text(65, 38, gold >= cost ? '✓ UPGRADE' : '✗ PAS ASSEZ', {
          fontSize: '10px', color: gold >= cost ? '#10b981' : '#ef4444',
          fontFamily: 'monospace', fontStyle: 'bold'
        }).setOrigin(0.5, 0).setInteractive();
        okBtn.on('pointerdown', () => {
          if (gold < cost) { showMsg(scene, 'Pas assez d\'or!', 0xef4444); return; }
          gold -= cost; tower.level++;
          // Apply upgrades
          Object.assign(tower.cfg, upg);
          drawTowerGfx(tower.g, tower.cfg, tower.level);
          tower.lvlTxt.setText(`Lv${tower.level + 1}`);
          tower.rg.clear(); tower.rg.lineStyle(1, tower.cfg.col, 0.18); tower.rg.strokeCircle(0, 0, tower.cfg.range);
          emitBurst(scene, tower.x, tower.y, tower.cfg.col, 20);
          score += 10; updateHUD();
          container.destroy(); upgradeContainer = null;
        });
        okBtn.on('pointerover', () => { if (gold >= cost) okBtn.setColor('#34d399'); });
        okBtn.on('pointerout', () => { okBtn.setColor(gold >= cost ? '#10b981' : '#ef4444'); });
        container.add([bg, title, info, okBtn]);
        container.setDepth(100);
        upgradeContainer = container;
        // Auto-close
        scene.time.delayedCall(4000, () => { if (upgradeContainer === container) { container.destroy(); upgradeContainer = null; } });
      }

      // ── SPAWN WAVE ────────────────────────────────────────────────────────
      function spawnWave(scene) {
        if (gameOver) return;
        wave++; updateHUD();
        waveActive = true;
        const wc = WAVES[Math.min(wave - 1, WAVES.length - 1)];
        const scale = Math.pow(1.35, Math.max(0, wave - WAVES.length));
        showMsg(scene, `⚔ Vague ${wave}!`, 0xfbbf24);

        if (wc.boss) {
          // Boss wave: plusieurs boss
          let spawned = 0;
          function spawnNext() {
            if (gameOver) return;
            spawnEnemy(scene, Math.round(wc.bossHp * scale), wc.bossSpd, wc.col, Math.round(wc.bossRew * scale), true);
            spawned++;
            if (spawned < wc.count) scene.time.delayedCall(2000, spawnNext);
            else scheduleNext(scene, 8000);
          }
          scene.time.delayedCall(500, spawnNext);
        } else {
          let spawned = 0;
          const interval = scene.time.addEvent({
            delay: 550, repeat: wc.count - 1, callback: () => {
              spawnEnemy(scene, Math.round(wc.hp * scale), Math.min(wc.spd + wave * 1.5, 155), wc.col, wc.rew, false, wc.armored);
              spawned++;
              if (spawned >= wc.count) { waveActive = false; scheduleNext(scene, 5500); }
            }
          });
        }
      }

      function scheduleNext(scene, delay) {
        scene.time.delayedCall(delay, () => { if (!gameOver) spawnWave(scene); });
      }

      function spawnEnemy(scene, hp, speed, col, reward, boss = false, armored = false) {
        const radius = boss ? 14 : (armored ? 11 : 9);
        const g = scene.add.graphics();
        const hpBar = scene.add.graphics();
        const poisonGfx = scene.add.graphics();
        const e = {
          g, hpBar, poisonGfx,
          hp, maxHp: hp, speed, col, reward, boss, armored,
          pathIdx: 0, progress: 0,
          x: pathPts[0].x, y: pathPts[0].y,
          dead: false, radius,
          slowTimer: 0, poisonTimer: 0, poisonDmg: 0,
          flickerT: 0,
          shieldHp: armored ? Math.round(hp * 0.3) : 0,
        };
        enemies.push(e);
        drawEnemyGfx(e);
      }

      function drawEnemyGfx(e) {
        e.g.clear();
        const r = e.radius;
        if (e.boss) {
          // Boss: diamant doré
          e.g.fillStyle(parseInt(e.col.replace('#', '0x')), 1);
          e.g.fillTriangle(-r, 0, 0, -r * 1.3, r, 0);
          e.g.fillTriangle(-r, 0, r, 0, 0, r * 1.3);
          e.g.lineStyle(2, 0xffd700, 0.9);
          e.g.strokeTriangle(-r, 0, 0, -r * 1.3, r, 0);
          e.g.strokeTriangle(-r, 0, r, 0, 0, r * 1.3);
          // Aura
          e.g.lineStyle(3, 0xffd700, 0.25); e.g.strokeCircle(0, 0, r + 5);
        } else if (e.armored) {
          e.g.fillStyle(parseInt(e.col.replace('#', '0x')), 1);
          e.g.fillRect(-r, -r, r * 2, r * 2);
          e.g.lineStyle(2.5, 0x94a3b8, 0.9);
          e.g.strokeRect(-r, -r, r * 2, r * 2);
        } else {
          e.g.fillStyle(parseInt(e.col.replace('#', '0x')), 1);
          e.g.fillCircle(0, 0, r);
          e.g.lineStyle(1.5, 0xffffff, 0.35);
          e.g.strokeCircle(0, 0, r);
        }
      }

      // ── UPDATE ────────────────────────────────────────────────────────────
      function update(time, delta) {
        if (gameOver) return;
        const dt = delta / 1000;

        // Combo decay
        if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; if (hudTexts.combo) hudTexts.combo.setText(''); } }

        // Move enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.dead) continue;

          // Poison
          if (e.poisonTimer > 0) {
            e.poisonTimer -= dt;
            e.hp -= e.poisonDmg * dt * 60;
            e.poisonGfx.clear();
            e.poisonGfx.lineStyle(1.5, 0xa3e635, 0.6 + Math.sin(time * 0.01) * 0.4);
            e.poisonGfx.strokeCircle(0, 0, e.radius + 3);
            if (e.hp <= 0) { killEnemy(e, i); continue; }
          } else { e.poisonGfx.clear(); }

          // Slow
          if (e.slowTimer > 0) e.slowTimer -= dt;

          const spd = e.slowTimer > 0 ? e.speed * (e.slow || 0.45) : e.speed;
          e.progress += spd * dt;

          // Advance path
          while (e.pathIdx < pathPts.length - 2) {
            const a = pathPts[e.pathIdx], b = pathPts[e.pathIdx + 1];
            const sLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (e.progress < sLen) break;
            e.progress -= sLen; e.pathIdx++;
          }
          if (e.pathIdx >= pathPts.length - 1) {
            lives = Math.max(0, lives - (e.boss ? 3 : 1));
            e.dead = true; e.g.destroy(); e.hpBar.destroy(); e.poisonGfx.destroy();
            enemies.splice(i, 1);
            scene2.cameras.main.shake(200, 0.006);
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
          e.poisonGfx.setPosition(e.x, e.y);

          // Flicker on hit
          if (e.flickerT > 0) { e.flickerT -= dt; e.g.setAlpha(e.flickerT % 0.06 < 0.03 ? 0.3 : 1); }
          else e.g.setAlpha(1);

          // HP bar
          const bw = e.boss ? 30 : (e.armored ? 22 : 18);
          e.hpBar.clear();
          e.hpBar.fillStyle(0x0f1020); e.hpBar.fillRect(-bw / 2, -e.radius - 10, bw, 4);
          const pct = e.hp / e.maxHp;
          const hpCol = pct > 0.6 ? 0x22c55e : pct > 0.3 ? 0xfbbf24 : 0xef4444;
          e.hpBar.fillStyle(hpCol); e.hpBar.fillRect(-bw / 2, -e.radius - 10, Math.max(0, bw * pct), 4);
          if (e.boss) {
            e.hpBar.lineStyle(1, 0xffd700, 0.4); e.hpBar.strokeRect(-bw / 2, -e.radius - 10, bw, 4);
          }
          // Shield bar
          if (e.shieldHp > 0 && e.armored) {
            e.hpBar.fillStyle(0x94a3b8);
            e.hpBar.fillRect(-bw / 2, -e.radius - 15, bw * (e.shieldHp / (e.maxHp * 0.3)), 3);
          }
        }

        // Tower shoot
        towers.forEach(tower => {
          if (time - tower.lastFire < tower.cfg.rate) return;
          const inRange = enemies.filter(e => !e.dead && Math.hypot(tower.x - e.x, tower.y - e.y) <= tower.cfg.range);
          if (!inRange.length) return;
          inRange.sort((a, b) => (b.pathIdx + b.progress / 100) - (a.pathIdx + a.progress / 100));
          const tgt = inRange[0];
          tower.lastFire = time;
          tower.target = tgt;

          if (tower.cfg.chain) {
            // Tesla: arc chain
            let targets = [tgt];
            let last = tgt;
            for (let k = 1; k < tower.cfg.chain; k++) {
              const next = enemies.find(e => !e.dead && e !== last && !targets.includes(e) && Math.hypot(last.x - e.x, last.y - e.y) < 55);
              if (next) { targets.push(next); last = next; } else break;
            }
            targets.forEach((t, idx) => {
              const dmgMult = Math.pow(0.7, idx);
              fireBullet(scene2, tower, t, tower.cfg.dmg * dmgMult);
            });
            // Spark visuals
            for (let k = 0; k < targets.length - 1; k++) {
              emitSpark(scene2, targets[k], targets[k + 1]);
            }
          } else {
            fireBullet(scene2, tower, tgt, tower.cfg.dmg);
          }
        });

        // Move bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          if (!b.target || b.target.dead) { b.g.destroy(); bullets.splice(i, 1); continue; }
          const dx = b.target.x - b.g.x, dy = b.target.y - b.g.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 8) {
            // Hit
            applyHit(b, scene2, i);
            bullets.splice(i, 1);
          } else {
            const s = 210 / 60;
            b.g.x += dx / dist * s;
            b.g.y += dy / dist * s;
          }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy += 180 * dt;
          p.life -= dt;
          p.g.setPosition(p.x, p.y);
          p.g.setAlpha(Math.max(0, p.life / p.maxLife));
          if (p.life <= 0) { p.g.destroy(); particles.splice(i, 1); }
        }
      }

      function applyHit(b, scene, bulletIdx) {
        const e = b.target;
        const tower = b.tower;

        // Armure
        if (e.shieldHp > 0 && e.armored) {
          e.shieldHp -= b.dmg * 0.5;
          if (e.shieldHp <= 0) { e.shieldHp = 0; emitBurst(scene, e.x, e.y, 0x94a3b8, 8); }
          b.g.destroy(); return;
        }

        e.hp -= b.dmg;
        e.flickerT = 0.15;
        tower.totalDmg = (tower.totalDmg || 0) + b.dmg;

        if (tower.cfg.slow) e.slowTimer = 1.5;
        if (tower.cfg.poison) { e.poisonTimer = 3.5; e.poisonDmg = tower.cfg.dmg * 0.3; }

        if (tower.cfg.splash > 0) {
          enemies.forEach(ne => {
            if (!ne.dead && ne !== e && Math.hypot(ne.x - e.x, ne.y - e.y) < tower.cfg.splash) {
              ne.hp -= b.dmg * 0.5; ne.flickerT = 0.1;
              if (ne.hp <= 0) killEnemy(ne, enemies.indexOf(ne));
            }
          });
          emitSplash(scene, e.x, e.y, b.col, tower.cfg.splash);
        }

        b.g.destroy();
        if (e.hp <= 0) killEnemy(e, enemies.indexOf(e));
      }

      function killEnemy(e, idx) {
        if (e.dead) return;
        e.dead = true;
        killCount++;
        combo++;
        comboTimer = 2.5;
        const mult = combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1;
        const earned = Math.round(e.reward * mult);
        gold += earned;
        score += earned * 3 + (e.boss ? 1000 : 0);
        updateHUD();

        if (combo >= 3 && hudTexts.combo) {
          hudTexts.combo.setText(`${combo}x COMBO!`);
          hudTexts.combo.setAlpha(1);
          scene2.tweens.add({ targets: hudTexts.combo, alpha: 0, delay: 1800, duration: 500 });
        }

        // Death particles
        const count = e.boss ? 30 : (e.armored ? 12 : 8);
        for (let k = 0; k < count; k++) {
          const pg = scene2.add.graphics();
          const r = e.boss ? 4 : 2.5;
          pg.fillStyle(parseInt(e.col.replace('#', '0x')));
          pg.fillCircle(0, 0, r);
          pg.setPosition(e.x, e.y);
          pg.setDepth(60);
          particles.push({
            g: pg, x: e.x, y: e.y,
            vx: (Math.random() - 0.5) * (e.boss ? 200 : 130),
            vy: (Math.random() - 0.8) * (e.boss ? 220 : 160),
            life: Math.random() * 0.8 + 0.3,
            maxLife: 1.1
          });
        }
        if (e.boss) scene2.cameras.main.shake(400, 0.012);

        e.g.destroy(); e.hpBar.destroy(); e.poisonGfx.destroy();
        if (idx >= 0 && idx < enemies.length) enemies.splice(idx, 1);
      }

      function fireBullet(scene, tower, target, dmg) {
        const g = scene.add.graphics();
        const isBig = tower.cfg.splash > 0;
        const r = tower.cfg.chain ? 4 : (isBig ? 5 : 3);
        g.fillStyle(tower.cfg.col, 1);
        if (tower.cfg.chain) {
          g.lineStyle(2, tower.cfg.col); g.strokeCircle(0, 0, r);
        } else {
          g.fillCircle(0, 0, r);
        }
        g.setPosition(tower.x, tower.y);
        g.setDepth(40);
        bullets.push({ g, target, tower, dmg, col: tower.cfg.col, splash: tower.cfg.splash || 0 });
      }

      function emitBurst(scene, x, y, col, count) {
        const g = scene.add.graphics();
        g.lineStyle(2, col, 0.8); g.strokeCircle(0, 0, 5);
        g.setPosition(x, y).setDepth(80);
        scene.tweens.add({ targets: g, scaleX: 4, scaleY: 4, alpha: 0, duration: 350, onComplete: () => g.destroy() });
      }

      function emitSplash(scene, x, y, col, r) {
        const g = scene.add.graphics();
        g.lineStyle(3, col, 0.7); g.strokeCircle(0, 0, 5);
        g.setPosition(x, y).setDepth(70);
        scene.tweens.add({ targets: g, scaleX: r / 5, scaleY: r / 5, alpha: 0, duration: 280, onComplete: () => g.destroy() });
      }

      function emitSpark(scene, from, to) {
        const g = scene.add.graphics();
        g.lineStyle(2, 0xfacc15, 0.9);
        g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y); g.strokePath();
        g.setDepth(55);
        scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
      }

      // ── HUD ──────────────────────────────────────────────────────────────
      let hudTexts = {};
      function createHUD(scene) {
        // Top bar
        const topBg = scene.add.graphics();
        topBg.fillStyle(0x000000, 0.75); topBg.fillRect(0, 0, W, 40);
        topBg.setDepth(90);

        hudTexts.gold = scene.add.text(10, 6, '💰 ' + gold, { fontSize: '13px', color: '#f59e0b', fontFamily: 'monospace' }).setDepth(91);
        hudTexts.lives = scene.add.text(W / 2, 6, '❤️ ' + lives, { fontSize: '13px', color: '#ef4444', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(91);
        hudTexts.score = scene.add.text(W - 8, 6, '⭐ ' + score, { fontSize: '13px', color: '#a78bfa', fontFamily: 'monospace' }).setOrigin(1, 0).setDepth(91);
        hudTexts.wave = scene.add.text(W - 8, 24, 'Wave 0/' + WAVES.length, { fontSize: '9px', color: 'rgba(255,255,255,.4)', fontFamily: 'monospace' }).setOrigin(1, 0).setDepth(91);

        // Combo text
        hudTexts.combo = scene.add.text(W / 2, 50, '', { fontSize: '16px', color: '#fbbf24', fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(95).setAlpha(0);

        // Bottom tower bar
        const barH = 52, barY = H - barH;
        const barBg = scene.add.graphics();
        barBg.fillStyle(0x000000, 0.88); barBg.fillRect(0, barY, W, barH);
        barBg.setDepth(90);

        const types = Object.entries(TOWERS);
        const btnW = W / types.length;
        types.forEach(([id, cfg], i) => {
          const bx = i * btnW + btnW / 2, by = barY + barH / 2;
          const btn = scene.add.graphics().setDepth(91);
          btn.setInteractive(new Phaser.Geom.Rectangle(i * btnW, barY, btnW, barH), Phaser.Geom.Rectangle.Contains);
          btn._id = id; btn._cfg = cfg; btn._i = i; btn._btnW = btnW; btn._barY = barY; btn._barH = barH;
          function drawBtn(active) {
            btn.clear();
            btn.fillStyle(active ? cfg.col : 0x111118, active ? 0.3 : 0.7);
            btn.fillRect(i * btnW + 1, barY + 1, btnW - 2, barH - 2);
            if (active) {
              btn.lineStyle(1.5, cfg.col, 0.7);
              btn.strokeRect(i * btnW + 1, barY + 1, btnW - 2, barH - 2);
            }
          }
          drawBtn(id === selectedType);
          btn.on('pointerdown', () => {
            selectedType = id;
            // Redraw all
            scene.children.list.filter(c => c._isTowerBtn).forEach(c => c.drawMe(c._id === id));
            showMsg(scene, `${cfg.emoji} ${cfg.name} — ${cfg.cost}g — ${cfg.desc}`, cfg.col);
          });
          btn._isTowerBtn = true; btn.drawMe = drawBtn;

          scene.add.text(bx, barY + 7, cfg.emoji, { fontSize: '17px' }).setOrigin(0.5, 0).setDepth(92);
          scene.add.text(bx, barY + 28, cfg.cost + 'g', { fontSize: '9px', color: '#f59e0b', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(92);
          scene.add.text(bx, barY + 39, cfg.name, { fontSize: '8px', color: 'rgba(255,255,255,.45)', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(92);
        });
      }

      function updateHUD() {
        if (hudTexts.gold) hudTexts.gold.setText('💰 ' + gold.toLocaleString());
        if (hudTexts.lives) hudTexts.lives.setText('❤️ ' + lives);
        if (hudTexts.score) hudTexts.score.setText('⭐ ' + score.toLocaleString());
        if (hudTexts.wave) hudTexts.wave.setText(`Wave ${wave}/${WAVES.length}`);
      }

      function showMsg(scene, txt, col) {
        const hexCol = typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : (col || '#fff');
        const t = scene.add.text(W / 2, H / 2 - 50, txt, {
          fontSize: '15px', color: hexCol, fontFamily: 'monospace',
          fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);
        scene.tweens.add({ targets: t, y: t.y - 35, alpha: 0, duration: 1600, onComplete: () => t.destroy() });
      }

      function triggerGameOver() {
        gameOver = true;
        const name = _ctx?.loadProfile?.()?.name || 'Commander';
        saveScore({ name, score, wave, ts: Date.now() });
        if (window.YM_P2P) try { window.YM_P2P.broadcast({ sphere: 'towerdefense.sphere.js', type: 'td:score', data: { name, score, wave } }); } catch (e) { }

        const ov = scene2.add.graphics().setDepth(300);
        ov.fillStyle(0x000000, 0.88); ov.fillRect(0, 0, W, H);
        scene2.add.text(W / 2, H / 2 - 70, 'GAME OVER', { fontSize: '30px', color: '#ef4444', fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(301);
        scene2.add.text(W / 2, H / 2 - 30, `Score: ${score.toLocaleString()}`, { fontSize: '20px', color: '#f59e0b', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(301);
        scene2.add.text(W / 2, H / 2, `${killCount} ennemis éliminés · Vague ${wave}`, { fontSize: '12px', color: 'rgba(255,255,255,.5)', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(301);
        const rb = scene2.add.text(W / 2, H / 2 + 45, '▶  REJOUER', {
          fontSize: '14px', color: '#fff', fontFamily: 'monospace',
          backgroundColor: '#1d4ed8', padding: { x: 24, y: 12 }
        }).setOrigin(0.5).setInteractive().setDepth(302);
        rb.on('pointerover', () => rb.setBackgroundColor('#2563eb'));
        rb.on('pointerout', () => rb.setBackgroundColor('#1d4ed8'));
        rb.on('pointerdown', () => { if (_game) { _game.destroy(true); _game = null; } container.innerHTML = ''; renderPlay(container); });
      }

      const config = {
        type: Phaser.AUTO, width: W, height: H, parent: container,
        backgroundColor: '#0b0c14',
        scene: { preload, create, update },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      };
      _game = new Phaser.Game(config);
    }

    if (window.Phaser) { initPhaser(); }
    else {
      const loading = document.createElement('div');
      loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:13px';
      loading.textContent = 'Chargement…'; container.appendChild(loading);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
      s.onload = () => { loading.remove(); initPhaser(); };
      document.head.appendChild(s);
    }
  }

  // ── SPHERE ─────────────────────────────────────────────────────────────────
  window.YM_S['towerdefense.sphere.js'] = {
    name: 'Tower Defense', icon: '🗼', category: 'Games',
    description: 'Tower Defense v2 — 7 tours upgradables, boss, poison, Tesla chain, combo multiplier',
    emit: [], receive: [],
    activate(ctx) { _ctx = ctx; },
    deactivate() { if (_game) { _game.destroy(true); _game = null; } },
    renderPanel,
    profileSection(container) {
      const scores = loadScores(); if (!scores.length) return;
      const best = scores[0];
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0b0c14,#0d1f1a);border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML = `<span style="font-size:24px">🗼</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense</div>
        <div style="font-size:11px;color:rgba(255,255,255,.5)">Wave ${best.wave} · ${best.name || '—'}</div></div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">${best.score.toLocaleString()} pts</div>`;
      container.appendChild(el);
    }
  };
})();
