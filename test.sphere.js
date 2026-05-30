(function() {
  const NAME = 'test.sphere.js';
  const GRID_W = 40;
  const GRID_H = 40;
  const TICK_MS = 120; // ~8fps — good for P2P
  const INITIAL_LENGTH = 4;

  const COLORS = {
    0: { stroke: '#08e0f8', glow: 'rgba(8,224,248,0.5)'  },
    1: { stroke: '#ff4560', glow: 'rgba(255,69,96,0.5)'  },
    2: { stroke: '#a855f7', glow: 'rgba(168,85,247,0.5)' },
    3: { stroke: '#22c55e', glow: 'rgba(34,197,94,0.5)'  },
  };

  const STARTS = [
    { x: 8,           y: GRID_H/2, dir: 'right' },
    { x: GRID_W-9,   y: GRID_H/2, dir: 'left'  },
    { x: GRID_W/2,   y: 8,        dir: 'down'  },
    { x: GRID_W/2,   y: GRID_H-9, dir: 'up'    },
  ];

  window.YM_S = window.YM_S || {};
  window.YM_S[NAME] = {
    name: 'Neon Duel',
    icon: '⚔️',
    category: 'Games',
    description: 'Neon Snake Battle — solo or up to 4 players P2P.',

    broadcastData() { return {}; },

    activate(ctx) {
      this.ctx = ctx;
      this._hardReset();
      if (ctx.addIconToDesktop) ctx.addIconToDesktop(NAME, this.icon, this.name);
      ctx.onReceive((type, data, peerId) => {
        if (type === 'sn:invited')  this._onInvited(data, peerId);
        if (type === 'sn:joined')   this._onJoined(data, peerId);
        if (type === 'sn:lobby')    this._onLobbySync(data, peerId);
        if (type === 'sn:ready')    this._onReady(data, peerId);
        if (type === 'sn:start')    this._onStart(data, peerId);
        if (type === 'sn:move')     this._onMove(data, peerId);
        if (type === 'sn:dead')     this._onDead(data, peerId);
        if (type === 'sn:food')     this._onFood(data, peerId);
        if (type === 'sn:reset')    this._onRemoteReset();
      });
      setTimeout(() => {
        const p = window.YM_PendingChallenges?.[NAME];
        if (p) { this._onInvited(p.data, p.peerId); delete window.YM_PendingChallenges[NAME]; }
      }, 500);
    },

    // ── State ───────────────────────────────────────────────────
    _hardReset() {
      clearInterval(this._ticker);
      this._ticker = null;
      this.phase = 'menu';
      this.isSolo = false;
      this.isHost = false;
      this.mySlot = -1;
      this.lobby = [];
      this.snakes = {};   // slot → {cells:[{x,y}], dir, alive, peerId, score}
      this.foods = [];    // [{x,y}]
      this.winner = null;
      this._pendingDir = null;
      if (this.view) this._render();
    },

    // ── Solo ────────────────────────────────────────────────────
    _startSolo() {
      this.isSolo = true;
      this.isHost = false;
      this.mySlot = 0;
      this.phase = 'playing';
      this._initSnake(0, null);
      this.foods = [this._spawnFood()];
      this._pendingDir = null;
      this._render();
      this._ticker = setInterval(() => this._tick(), TICK_MS);
    },

    // ── Lobby ───────────────────────────────────────────────────
    _createLobby() {
      this.isHost = true;
      this.mySlot = 0;
      this.phase = 'lobby';
      this.lobby = [{ slot: 0, peerId: null, name: 'You (host)', ready: false }];
      this._render();
    },

    _invite(peerId, peerName) {
      if (!this.isHost || this.phase !== 'lobby') return;
      if (this.lobby.length >= 4) { this.ctx.toast('Lobby full', 'warn'); return; }
      const slot = this.lobby.length;
      this.lobby.push({ slot, peerId, name: peerName || 'Player '+(slot+1), ready: false });
      this.ctx.send('sn:invited', { slot, snapshot: this._snap() }, peerId);
      this._broadcastLobby();
      this._render();
    },

    _snap() {
      return this.lobby.map(p => ({ slot: p.slot, name: p.name, ready: p.ready }));
    },

    _broadcastLobby() {
      this.lobby.forEach(p => {
        if (p.peerId) this.ctx.send('sn:lobby', { snapshot: this._snap() }, p.peerId);
      });
    },

    _onInvited(data, peerId) {
      if (this.phase !== 'menu') return;
      this.isHost = false;
      this.mySlot = data.slot;
      this.phase = 'lobby';
      this.lobby = (data.snapshot||[]).map(s => ({
        ...s, peerId: s.slot === 0 ? peerId : null
      }));
      this.ctx.send('sn:joined', { slot: this.mySlot, name: 'Player '+(this.mySlot+1) }, peerId);
      this.ctx.toast('Invited to Snake Battle!', 'info');
      this.ctx.openPanel();
      this._render();
    },

    _onJoined(data, peerId) {
      const e = this.lobby.find(p => p.slot === data.slot);
      if (e) e.name = data.name || e.name;
      this._broadcastLobby();
      this._render();
    },

    _onLobbySync(data, peerId) {
      if (!this.isHost) {
        this.lobby = data.snapshot.map(s => ({
          ...s, peerId: this.lobby.find(l => l.slot === s.slot)?.peerId || null
        }));
        this._render();
      }
    },

    // ── Ready ───────────────────────────────────────────────────
    _setReady() {
      const me = this.lobby.find(p => p.slot === this.mySlot);
      if (me) me.ready = true;
      if (this.isHost) {
        this._broadcastLobby();
        this._checkAllReady();
      } else {
        const host = this.lobby.find(p => p.slot === 0);
        if (host?.peerId) this.ctx.send('sn:ready', { slot: this.mySlot }, host.peerId);
      }
      this._render();
    },

    _onReady(data, peerId) {
      if (!this.isHost) return;
      const e = this.lobby.find(p => p.slot === data.slot);
      if (e) e.ready = true;
      this._broadcastLobby();
      this._checkAllReady();
      this._render();
    },

    _checkAllReady() {
      if (!this.isHost || this.lobby.length < 2) return;
      if (this.lobby.every(p => p.ready)) this._launch();
    },

    // ── Launch ──────────────────────────────────────────────────
    _launch() {
      const snapshot = this._snap();
      // Host generates initial foods: N foods for N players
      this.foods = [];
      for (let i = 0; i < this.lobby.length; i++) this.foods.push(this._spawnFood());
      // Init all snakes
      snapshot.forEach(p => this._initSnake(p.slot, this.lobby.find(l=>l.slot===p.slot)?.peerId||null));
      // Broadcast start
      this.lobby.forEach(p => {
        if (p.peerId) this.ctx.send('sn:start', {
          snapshot,
          foods: this.foods
        }, p.peerId);
      });
      this.phase = 'playing';
      this._pendingDir = null;
      this._countdown(3);
    },

    _onStart(data, peerId) {
      this.foods = data.foods || [];
      data.snapshot.forEach(p => {
        this._initSnake(p.slot, this.lobby.find(l=>l.slot===p.slot)?.peerId||null);
      });
      this.phase = 'playing';
      this._pendingDir = null;
      this._countdown(3);
    },

    _initSnake(slot, peerId) {
      const sp = STARTS[slot];
      const cells = [];
      for (let i = 0; i < INITIAL_LENGTH; i++) {
        const nx = this._nextPos(sp.x, sp.y, this._opposite(sp.dir));
        cells.push({ x: sp.x - this._dx(sp.dir)*i, y: sp.y - this._dy(sp.dir)*i });
      }
      this.snakes[slot] = { cells, dir: sp.dir, alive: true, peerId, score: 0 };
    },

    _dx(dir){ return dir==='right'?1:dir==='left'?-1:0; },
    _dy(dir){ return dir==='down'?1:dir==='up'?-1:0; },
    _opposite(dir){ return {up:'down',down:'up',left:'right',right:'left'}[dir]; },

    // ── Countdown ───────────────────────────────────────────────
    _countdown(n) {
      this._render(n);
      if (n === 0) { this._startTicker(); return; }
      setTimeout(() => this._countdown(n-1), 1000);
    },

    _startTicker() {
      this._render();
      this._ticker = setInterval(() => this._tick(), TICK_MS);
    },

    // ── Game tick ───────────────────────────────────────────────
    _tick() {
      if (this.phase !== 'playing') return;
      const me = this.snakes[this.mySlot];
      if (!me?.alive) return;

      // Apply direction
      if (this._pendingDir && !this._isOpposite(me.dir, this._pendingDir)) {
        me.dir = this._pendingDir;
        this._pendingDir = null;
      }

      // Move my snake
      const head = me.cells[0];
      const next = this._nextPos(head.x, head.y, me.dir);

      // Broadcast my move
      this.lobby.forEach(p => {
        if (p.peerId) this.ctx.send('sn:move', {
          slot: this.mySlot, dir: me.dir, head: next
        }, p.peerId);
      });

      this._applyMove(this.mySlot, next, me.dir);
      this._render();
      this._checkOver();
    },

    _applyMove(slot, next, dir) {
      const snake = this.snakes[slot];
      if (!snake?.alive) return;
      snake.dir = dir;

      // Wall collision
      if (next.x<0||next.x>=GRID_W||next.y<0||next.y>=GRID_H) {
        snake.alive = false;
        if (slot === this.mySlot) this._broadcastDead(slot);
        return;
      }
      // Snake collision (all snakes)
      for (const s of Object.values(this.snakes)) {
        if (s.cells.some(c => c.x===next.x && c.y===next.y)) {
          snake.alive = false;
          if (slot === this.mySlot) this._broadcastDead(slot);
          return;
        }
      }

      // Move: add head
      snake.cells.unshift({ x: next.x, y: next.y });

      // Food?
      const fi = this.foods.findIndex(f => f.x===next.x && f.y===next.y);
      if (fi !== -1) {
        snake.score++;
        // Replace food — only host spawns new food to stay in sync
        if (this.isHost || this.isSolo) {
          const newFood = this._spawnFood();
          this.foods[fi] = newFood;
          // Broadcast new food position
          this.lobby.forEach(p => {
            if (p.peerId) this.ctx.send('sn:food', { index: fi, food: newFood }, p.peerId);
          });
        } else {
          this.foods.splice(fi, 1);
        }
        // Don't remove tail — snake grew
      } else {
        snake.cells.pop(); // remove tail — no growth
      }
    },

    _onMove(data, peerId) {
      const snake = this.snakes[data.slot];
      if (!snake || snake.peerId !== peerId) return;
      this._applyMove(data.slot, data.head, data.dir);
      this._render();
      this._checkOver();
    },

    _onDead(data, peerId) {
      const snake = this.snakes[data.slot];
      if (snake) snake.alive = false;
      this._render();
    },

    _onFood(data, peerId) {
      if (data.index < this.foods.length) this.foods[data.index] = data.food;
      else this.foods.push(data.food);
    },

    _broadcastDead(slot) {
      this.lobby.forEach(p => {
        if (p.peerId) this.ctx.send('sn:dead', { slot }, p.peerId);
      });
    },

    _checkOver() {
      const alive = Object.entries(this.snakes).filter(([,s])=>s.alive);
      if (this.isSolo) {
        if (alive.length === 0) {
          this.phase = 'over';
          clearInterval(this._ticker);
          this._render();
        }
      } else {
        if (alive.length <= 1) {
          this.winner = alive.length===1 ? parseInt(alive[0][0]) : null;
          this.phase = 'over';
          clearInterval(this._ticker);
          this._render();
        }
      }
    },

    // ── Food spawning ───────────────────────────────────────────
    _spawnFood() {
      let f, tries = 0;
      do {
        f = { x: Math.floor(Math.random()*GRID_W), y: Math.floor(Math.random()*GRID_H) };
        tries++;
      } while (tries < 100 && (
        this.foods.some(e => e.x===f.x && e.y===f.y) ||
        Object.values(this.snakes).some(s => s.cells.some(c => c.x===f.x && c.y===f.y))
      ));
      return f;
    },

    // ── Reset ───────────────────────────────────────────────────
    _resetGame() {
      this.lobby.forEach(p => {
        if (p.peerId) this.ctx.send('sn:reset', {}, p.peerId);
      });
      this._onRemoteReset();
    },

    _onRemoteReset() {
      const savedLobby = this.lobby.map(p => ({ ...p, ready: false }));
      const mySlot = this.mySlot;
      const isHost = this.isHost;
      this._hardReset();
      this.phase = 'lobby';
      this.isHost = isHost;
      this.mySlot = mySlot;
      this.lobby = savedLobby;
      this._render();
    },

    // ── Utils ───────────────────────────────────────────────────
    _nextPos(x, y, dir) {
      return { x: x+this._dx(dir), y: y+this._dy(dir) };
    },
    _isOpposite(a, b) {
      return (a==='up'&&b==='down')||(a==='down'&&b==='up')||
             (a==='left'&&b==='right')||(a==='right'&&b==='left');
    },
    _setDir(dir) { this._pendingDir = dir; },

    // ── Render ──────────────────────────────────────────────────
    renderPanel(body) {
      this.view = body;
      this._setupKeys();
      this._render();
    },

    _setupKeys() {
      if (this._keysWired) return;
      this._keysWired = true;
      document.addEventListener('keydown', e => {
        const map = { ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right' };
        if (map[e.key]) { e.preventDefault(); this._setDir(map[e.key]); }
      });
    },

    _render(countdown) {
      if (!this.view) return;
      const size = Math.min(this.view.clientWidth||320, 360);
      const cell = Math.floor(size/GRID_W);
      const cw = cell*GRID_W, ch = cell*GRID_H;

      const css = `<style>
        .sn{display:flex;flex-direction:column;align-items:center;padding:12px;gap:10px;height:100%;font-family:'JetBrains Mono',monospace;color:#e4e6f4;overflow-y:auto}
        .sn h1{font-size:20px;letter-spacing:.3em;color:#08e0f8;text-shadow:0 0 20px rgba(8,224,248,.5);margin:0}
        .sn-status{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);text-align:center}
        .sn-status b{color:#08e0f8}
        .sn-btn{padding:11px 20px;border-radius:8px;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border:none;font-weight:700;transition:all .15s;text-align:center}
        .sn-btn.cyan{background:rgba(8,224,248,.12);color:#08e0f8;border:1px solid rgba(8,224,248,.3)}
        .sn-btn.ghost{background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.1)}
        .sn-btn.green{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.3)}
        .sn-btn:active{opacity:.7}
        .sn-row{display:flex;gap:8px;width:100%}
        .sn-row .sn-btn{flex:1}
        .sn-cv{border:1px solid rgba(8,224,248,.18);border-radius:4px;background:#02020a;display:block;box-shadow:0 0 20px rgba(8,224,248,.06)}

        .sn-scores{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
        .sn-score{font-size:10px;display:flex;align-items:center;gap:5px}
        .sn-dot{width:8px;height:8px;border-radius:50%}
        .sn-lobby{width:100%;display:flex;flex-direction:column;gap:6px}
        .sn-player{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid rgba(255,255,255,.06)}
        .sn-badge{font-size:9px;padding:2px 8px;border-radius:10px;letter-spacing:.08em}
        .sn-badge.ready{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
        .sn-badge.wait{background:rgba(255,255,255,.04);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08)}
      </style>`;

      let b = `${css}<div class="sn">`;

      // ── MENU ──
      if (this.phase === 'menu') {
        b += `<h1>SNAKE</h1>
          <div class="sn-status">Choose your mode</div>
          <div class="sn-row">
            <button class="sn-btn cyan" onclick="window.YM_S['${NAME}']._startSolo()">🐍 Solo</button>
            <button class="sn-btn ghost" onclick="window.YM_S['${NAME}']._createLobby()">⚔️ Battle</button>
          </div>`;
      }

      // ── LOBBY ──
      else if (this.phase === 'lobby') {
        const me = this.lobby.find(p => p.slot === this.mySlot);
        const iAmReady = me?.ready;
        const allReady = this.lobby.length >= 2 && this.lobby.every(p => p.ready);

        b += `<h1>LOBBY</h1>`;
        b += `<div class="sn-lobby">`;
        this.lobby.forEach(p => {
          const col = COLORS[p.slot]?.stroke || '#fff';
          b += `<div class="sn-player">
            <div class="sn-dot" style="background:${col};box-shadow:0 0 5px ${col}"></div>
            <div style="flex:1;font-size:12px">${p.name}${p.slot===this.mySlot?' <span style="opacity:.4">(you)</span>':''}</div>
            <div class="sn-badge ${p.ready?'ready':'wait'}">${p.ready?'READY':'WAITING'}</div>
          </div>`;
        });
        b += `</div>`;

        if (this.isHost && this.lobby.length < 4) {
          b += `<div class="sn-status" style="font-size:9px;opacity:.35">${this.lobby.length}/4 — invite from peer profiles</div>`;
        }

        b += `<div class="sn-row">`;
        if (!iAmReady) {
          b += `<button class="sn-btn green" onclick="window.YM_S['${NAME}']._setReady()">✓ I'm Ready</button>`;
        } else {
          b += `<div class="sn-btn ghost" style="opacity:.35;pointer-events:none">✓ Ready</div>`;
        }
        b += `<button class="sn-btn ghost" onclick="window.YM_S['${NAME}']._hardReset()">← Back</button>`;
        b += `</div>`;

        if (this.isHost && allReady) {
          b += `<button class="sn-btn cyan" style="width:100%" onclick="window.YM_S['${NAME}']._launch()">🚀 LAUNCH</button>`;
        }
      }

      // ── PLAYING / COUNTDOWN / OVER ──
      else {
        // Scores bar
        if (Object.keys(this.snakes).length) {
          b += `<div class="sn-scores">`;
          Object.entries(this.snakes).forEach(([slot, s]) => {
            const col = COLORS[slot]?.stroke || '#fff';
            const label = parseInt(slot)===this.mySlot ? 'You' : (this.lobby.find(p=>p.slot===parseInt(slot))?.name||'P'+(parseInt(slot)+1));
            b += `<div class="sn-score">
              <div class="sn-dot" style="background:${col};${!s.alive?'opacity:.3':''}"></div>
              <span style="${!s.alive?'opacity:.3':''}">${label}: ${s.score}${!s.alive?' 💀':''}</span>
            </div>`;
          });
          b += `</div>`;
        }

        // Status
        if (this.phase === 'over') {
          if (this.isSolo) {
            const score = this.snakes[0]?.score||0;
            b += `<div class="sn-status" style="font-size:16px;color:#ff4560">💀 GAME OVER — Score: ${score}</div>`;
          } else {
            const isWin = this.winner === this.mySlot;
            b += `<div class="sn-status" style="font-size:16px;color:${isWin?'#08e0f8':'#ff4560'}">${isWin?'🏆 YOU WIN':'💀 YOU LOST'}</div>`;
          }
        } else if (countdown !== undefined && countdown > 0) {
          b += `<div class="sn-status" style="font-size:36px;color:#f0a830;text-shadow:0 0 20px rgba(240,168,48,.6)">${countdown}</div>`;
        }

        // Canvas
        b += `<canvas id="sn-cv" class="sn-cv" width="${cw}" height="${ch}" style="width:${cw}px;height:${ch}px;touch-action:none;cursor:pointer"></canvas>`;

        // D-pad
        // No dpad — tap canvas to steer (see canvas touch handler below)

        // Over buttons
        if (this.phase === 'over') {
          b += `<div class="sn-row">
            <button class="sn-btn cyan" onclick="window.YM_S['${NAME}']._startSolo()">Solo</button>
            <button class="sn-btn ghost" onclick="${this.isSolo?`window.YM_S['${NAME}']._hardReset()`:`window.YM_S['${NAME}']._resetGame()`}">${this.isSolo?'Menu':'Lobby'}</button>
          </div>`;
        }
      }

      b += `</div>`;
      this.view.innerHTML = b;

      // Draw canvas
      requestAnimationFrame(() => {
        const cv = document.getElementById('sn-cv');
        if (!cv) return;
        const c = cv.getContext('2d');
        c.fillStyle = '#02020a';
        c.fillRect(0,0,cw,ch);

        // Grid
        c.strokeStyle = 'rgba(8,224,248,0.03)';
        c.lineWidth = 0.5;
        for (let x=0;x<=GRID_W;x++){c.beginPath();c.moveTo(x*cell,0);c.lineTo(x*cell,ch);c.stroke();}
        for (let y=0;y<=GRID_H;y++){c.beginPath();c.moveTo(0,y*cell);c.lineTo(cw,y*cell);c.stroke();}

        // Snakes
        Object.entries(this.snakes).forEach(([slot,s]) => {
          const col = COLORS[slot]||COLORS[0];
          c.globalAlpha = s.alive ? 1 : 0.2;
          // Body
          c.fillStyle = col.stroke;
          c.shadowColor = col.glow;
          c.shadowBlur = 3;
          s.cells.slice(1).forEach(cell2 => {
            c.fillRect(cell2.x*cell+1, cell2.y*cell+1, cell-2, cell-2);
          });
          // Head — brighter
          if (s.cells.length > 0) {
            c.fillStyle = '#fff';
            c.shadowBlur = 8;
            const h = s.cells[0];
            c.fillRect(h.x*cell+1, h.y*cell+1, cell-2, cell-2);
          }
          c.globalAlpha = 1;
          c.shadowBlur = 0;
        });

        // Food
        this.foods.forEach(f => {
          c.fillStyle = '#f0a830';
          c.shadowColor = 'rgba(240,168,48,.9)';
          c.shadowBlur = 10;
          c.beginPath();
          c.arc((f.x+.5)*cell, (f.y+.5)*cell, cell*.42, 0, Math.PI*2);
          c.fill();
          c.shadowBlur = 0;
        });

        // Tap to steer — wired every render since canvas is recreated via innerHTML
        const cvEl = document.getElementById('sn-cv');
        if(cvEl){
          const handleTap = (ex, ey) => {
            const rect = cvEl.getBoundingClientRect();
            const scaleX = GRID_W / rect.width;
            const scaleY = GRID_H / rect.height;
            const tapGX = (ex - rect.left) * scaleX;
            const tapGY = (ey - rect.top) * scaleY;
            const S = window.YM_S[NAME];
            const me = S.isSolo
              ? (S._soloTrail && S._soloTrail[0])
              : (S.snakes[S.mySlot]?.cells[0]);
            if(!me) return;
            const dx = tapGX - me.x;
            const dy = tapGY - me.y;
            if(Math.abs(dx) > Math.abs(dy)){
              S._setDir(dx > 0 ? 'right' : 'left');
            } else {
              S._setDir(dy > 0 ? 'down' : 'up');
            }
          };
          cvEl.addEventListener('touchend', e => {
            e.preventDefault();
            const t = e.changedTouches[0];
            handleTap(t.clientX, t.clientY);
          }, { passive: false });
          cvEl.addEventListener('click', e => handleTap(e.clientX, e.clientY));
        }

        // Countdown overlay
        if (countdown !== undefined && countdown > 0) {
          c.fillStyle = 'rgba(0,0,0,.65)';
          c.fillRect(0,0,cw,ch);
          c.fillStyle = '#f0a830';
          c.font = `bold ${Math.floor(cw/4)}px monospace`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.shadowColor = 'rgba(240,168,48,.8)';
          c.shadowBlur = 24;
          c.fillText(String(countdown), cw/2, ch/2);
          c.shadowBlur = 0;
        }
      });
    },

    // ── Peer section ─────────────────────────────────────────────
    peerSection(container, peerCtx) {
      const self = this;
      const canInvite = self.isHost && self.phase === 'lobby' && self.lobby.length < 4;
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,.03);border-radius:12px;border:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">🐍</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#fff">Snake Battle</div>
              <div style="font-size:9px;opacity:.5;margin-top:1px">${canInvite?'Invite to your lobby':'Create a lobby first'}</div>
            </div>
          </div>
          <button style="padding:6px 14px;font-size:10px;letter-spacing:.08em;font-weight:700;font-family:monospace;cursor:${canInvite?'pointer':'default'};border-radius:6px;
            background:${canInvite?'rgba(8,224,248,.12)':'rgba(255,255,255,.04)'};
            color:${canInvite?'#08e0f8':'rgba(255,255,255,.25)'};
            border:1px solid ${canInvite?'rgba(8,224,248,.3)':'rgba(255,255,255,.08)'}">
            INVITE
          </button>
        </div>`;

      if (canInvite) {
        container.querySelector('button').onclick = () => {
          const peerId = peerCtx.peerId || peerCtx.uuid;
          const name = peerCtx.name || peerCtx.displayName || ('Player '+(self.lobby.length+1));
          if (!peerId) { self.ctx.toast('Peer offline', 'error'); return; }
          self._invite(peerId, name);
          self.ctx.toast('Invited!', 'success');
        };
      }
    },
  };
})();
