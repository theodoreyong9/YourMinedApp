/**
 * FRODON PLUGIN — Snake  v1.0
 * Jeu solo, pas d'invitation, score local
 */
frodon.register({
  id: 'snake', name: 'Snake', version: '1.0.0',
  author: 'frodon-community',
  description: 'Jeu Snake solo — mangez les pommes, évitez les murs !',
  icon: '🐍',
}, () => {

  const PLUGIN_ID = 'snake';
  const store = frodon.storage(PLUGIN_ID);

  const COLS = 20, ROWS = 20, CELL = 14;
  const DIR = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
                w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };

  let state = null;   // game state
  let loop  = null;   // setInterval handle
  let canvas = null;  // shared canvas ref

  function newState() {
    return {
      snake:  [{x:10,y:10},{x:9,y:10},{x:8,y:10}],
      dir:    {x:1, y:0},
      nextDir:{x:1, y:0},
      apple:  randomApple([{x:10,y:10},{x:9,y:10},{x:8,y:10}]),
      score:  0,
      alive:  true,
      paused: false,
      speed:  150,
    };
  }

  function randomApple(snake) {
    let a;
    do {
      a = { x: 0|Math.random()*COLS, y: 0|Math.random()*ROWS };
    } while (snake.some(s => s.x===a.x && s.y===a.y));
    return a;
  }

  function tick() {
    if (!state || !state.alive || state.paused) return;
    state.dir = state.nextDir;
    const head = { x: state.snake[0].x + state.dir.x, y: state.snake[0].y + state.dir.y };
    // mur
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver(); return;
    }
    // soi-même
    if (state.snake.some(s => s.x===head.x && s.y===head.y)) {
      gameOver(); return;
    }
    state.snake.unshift(head);
    if (head.x === state.apple.x && head.y === state.apple.y) {
      state.score++;
      // accélération progressive
      if (state.score % 5 === 0 && state.speed > 60) {
        state.speed = Math.max(60, state.speed - 10);
        clearInterval(loop);
        loop = setInterval(tick, state.speed);
      }
      state.apple = randomApple(state.snake);
    } else {
      state.snake.pop();
    }
    draw();
  }

  function gameOver() {
    if (!state) return;
    state.alive = false;
    clearInterval(loop); loop = null;
    const best = store.get('best') || 0;
    if (state.score > best) store.set('best', state.score);
    const hist = store.get('history') || [];
    hist.unshift({ score: state.score, ts: Date.now() });
    if (hist.length > 20) hist.length = 20;
    store.set('history', hist);
    draw();
  }

  function startGame() {
    clearInterval(loop);
    state = newState();
    loop  = setInterval(tick, state.speed);
    draw();
  }

  function togglePause() {
    if (!state || !state.alive) return;
    state.paused = !state.paused;
    draw();
  }

  /* ── Dessin ── */
  function draw() {
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    const W = COLS * CELL, H = ROWS * CELL;

    // fond
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, W, H);

    // grille légère
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = .5;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,H); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(W,y*CELL); ctx.stroke(); }

    // pomme
    ctx.fillStyle = '#ff4f8b';
    ctx.shadowColor = '#ff4f8b';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(state.apple.x*CELL + CELL/2, state.apple.y*CELL + CELL/2, CELL/2 - 1.5, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // serpent
    state.snake.forEach((s, i) => {
      const t = i / state.snake.length;
      const g1 = [0,245,200], g2 = [124,77,255];
      const r = Math.round(g1[0] + (g2[0]-g1[0])*t);
      const g = Math.round(g1[1] + (g2[1]-g1[1])*t);
      const b = Math.round(g1[2] + (g2[2]-g1[2])*t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      if (i === 0) {
        ctx.shadowColor = 'rgba(0,245,200,.8)';
        ctx.shadowBlur  = 10;
      } else {
        ctx.shadowBlur = 0;
      }
      const pad = i === 0 ? .5 : 1.5;
      const rad = i === 0 ? 4 : 3;
      const px = s.x*CELL + pad, py = s.y*CELL + pad;
      const pw = CELL - pad*2, ph = CELL - pad*2;
      ctx.beginPath();
      ctx.moveTo(px+rad, py);
      ctx.lineTo(px+pw-rad, py); ctx.quadraticCurveTo(px+pw, py, px+pw, py+rad);
      ctx.lineTo(px+pw, py+ph-rad); ctx.quadraticCurveTo(px+pw, py+ph, px+pw-rad, py+ph);
      ctx.lineTo(px+rad, py+ph); ctx.quadraticCurveTo(px, py+ph, px, py+ph-rad);
      ctx.lineTo(px, py+rad); ctx.quadraticCurveTo(px, py, px+rad, py);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // score en haut
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, W, 20);
    ctx.fillStyle = '#00f5c8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('Score: '+state.score, 6, 14);
    const best = store.get('best') || 0;
    ctx.fillStyle = '#7c4dff';
    ctx.fillText('Best: '+best, W - 70, 14);

    // overlay pause/gameover
    if (!state.alive) {
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4f8b';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W/2, H/2 - 16);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      ctx.fillText('Score : ' + state.score, W/2, H/2 + 8);
      if (state.score >= best) {
        ctx.fillStyle = '#f5c842';
        ctx.fillText('★ Nouveau record !', W/2, H/2 + 26);
      }
      ctx.textAlign = 'left';
    } else if (state.paused) {
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#00f5c8';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', W/2, H/2);
      ctx.textAlign = 'left';
    }
  }

  /* ── Contrôles clavier ── */
  function onKey(e) {
    if (!state) return;
    if (e.key === ' ') { e.preventDefault(); if (!state.alive) startGame(); else togglePause(); return; }
    if (e.key === 'Escape') { togglePause(); return; }
    const d = DIR[e.key];
    if (!d) return;
    e.preventDefault();
    const [nx, ny] = d;
    // pas de demi-tour
    if (nx !== 0 && nx === -state.dir.x) return;
    if (ny !== 0 && ny === -state.dir.y) return;
    state.nextDir = { x:nx, y:ny };
  }

  /* ── SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    { id:'game', label:'🐍 Jeu', render(container) {
      injectCSS();
      const wrap = frodon.makeElement('div','');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:10px 0 14px';

      // canvas
      const cvs = document.createElement('canvas');
      cvs.width  = COLS * CELL;
      cvs.height = ROWS * CELL;
      cvs.style.cssText = 'border-radius:8px;border:1.5px solid rgba(0,245,200,.25);cursor:pointer;outline:none;display:block';
      cvs.setAttribute('tabindex','0');
      canvas = cvs;

      // start/draw initial
      if (!state) {
        // état "pret à jouer"
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.fillStyle = '#00f5c8';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Appuyez sur Jouer', cvs.width/2, cvs.height/2 - 10);
        ctx.fillStyle = '#7c4dff';
        ctx.font = '12px monospace';
        ctx.fillText('ou [Espace] pour démarrer', cvs.width/2, cvs.height/2 + 12);
        ctx.textAlign = 'left';
      } else {
        draw();
      }

      // clic pour focus + pauser si en cours
      cvs.addEventListener('click', () => {
        cvs.focus();
        if (state && state.alive && !state.paused) return;
        if (state && state.alive && state.paused) { togglePause(); }
      });
      cvs.addEventListener('keydown', onKey);

      wrap.appendChild(cvs);

      // boutons sous le canvas
      const btns = frodon.makeElement('div','');
      btns.style.cssText = 'display:flex;gap:8px;margin-top:10px';

      const btnStart = frodon.makeElement('button','plugin-action-btn acc', state && state.alive ? '🔄 Recommencer' : '▶ Jouer');
      btnStart.style.fontSize = '.75rem';
      btnStart.addEventListener('click', () => {
        startGame();
        cvs.focus();
        btnStart.textContent = '🔄 Recommencer';
      });
      btns.appendChild(btnStart);

      const btnPause = frodon.makeElement('button','plugin-action-btn','⏸ Pause');
      btnPause.style.fontSize = '.75rem';
      btnPause.addEventListener('click', () => {
        togglePause();
        btnPause.textContent = state?.paused ? '▶ Reprendre' : '⏸ Pause';
      });
      btns.appendChild(btnPause);

      wrap.appendChild(btns);

      // contrôles tactiles
      const dpad = frodon.makeElement('div','');
      dpad.style.cssText = 'display:grid;grid-template-areas:"_ u _""l _ r""_ d _";grid-template-columns:44px 44px 44px;grid-template-rows:44px 44px 44px;gap:4px;margin-top:10px';
      const arrows = [
        ['u','▲','ArrowUp'],['l','◀','ArrowLeft'],['r','▶','ArrowRight'],['d','▼','ArrowDown']
      ];
      arrows.forEach(([area, sym, key]) => {
        const b = frodon.makeElement('button','plugin-action-btn');
        b.style.cssText = `grid-area:${area};font-size:.9rem;padding:0;display:flex;align-items:center;justify-content:center;height:44px`;
        b.textContent = sym;
        b.addEventListener('click', () => { onKey({key, preventDefault:()=>{}}); });
        dpad.appendChild(b);
      });
      wrap.appendChild(dpad);

      // hint
      const hint = frodon.makeElement('div','');
      hint.style.cssText = 'font-size:.56rem;color:var(--txt3);font-family:var(--mono);margin-top:8px;text-align:center';
      hint.textContent = 'WASD / ↑↓←→ · Espace = pause/démarrer';
      wrap.appendChild(hint);

      container.appendChild(wrap);
      setTimeout(() => cvs.focus(), 100);
    }},
    { id:'scores', label:'🏆 Records', render(container) {
      const best = store.get('best') || 0;
      const hist = store.get('history') || [];

      const top = frodon.makeElement('div','');
      top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 12px 10px';
      top.innerHTML = `<div><div style="font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px">Meilleur score</div><div style="font-size:2rem;font-weight:700;font-family:var(--mono);color:var(--acc)">${best}</div></div><div style="font-size:3rem;opacity:.2">🐍</div>`;
      container.appendChild(top);

      if (!hist.length) {
        const e = frodon.makeElement('div','');
        e.style.cssText = 'text-align:center;padding:20px;font-size:.7rem;color:var(--txt2)';
        e.textContent = 'Pas encore de partie jouée.';
        container.appendChild(e);
        return;
      }

      const lbl = frodon.makeElement('div','section-label','Dernières parties');
      lbl.style.margin = '0 8px 6px';
      container.appendChild(lbl);

      hist.forEach((h, i) => {
        const row = frodon.makeElement('div','');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--bdr)';
        const rank = frodon.makeElement('div','');
        rank.style.cssText = 'font-family:var(--mono);font-size:.6rem;color:var(--txt3);width:16px';
        rank.textContent = '#'+(i+1);
        const sc = frodon.makeElement('div','');
        sc.style.cssText = 'font-family:var(--mono);font-weight:700;font-size:.85rem;color:'+(h.score===best?'var(--acc)':'var(--txt)');
        sc.textContent = h.score + (h.score===best?' ★':'');
        const ts = frodon.makeElement('span','mini-card-ts', frodon.formatTime(h.ts));
        const spacer = frodon.makeElement('div','');
        spacer.style.flex = '1';
        row.appendChild(rank); row.appendChild(sc); row.appendChild(spacer); row.appendChild(ts);
        container.appendChild(row);
      });

      const rst = frodon.makeElement('button','plugin-action-btn');
      rst.style.cssText = 'font-size:.62rem;margin:10px 8px 0;width:calc(100% - 16px);color:var(--txt3);border-color:var(--bdr)';
      rst.textContent = '↺ Effacer les scores';
      rst.addEventListener('click', () => {
        if (!confirm('Effacer tous les scores ?')) return;
        store.del('best'); store.del('history');
        frodon.refreshSphereTab(PLUGIN_ID);
      });
      container.appendChild(rst);
    }},
  ]);

  let _css = false;
  function injectCSS() {
    if (_css) return; _css = true;
    // pas de styles spéciaux requis, canvas gère tout
  }

  // Nettoyer la boucle si plugin désinstallé
  frodon.registerUninstallHook(PLUGIN_ID, () => {
    clearInterval(loop); loop = null;
    document.removeEventListener('keydown', onKey);
  });

  return {
    destroy() { clearInterval(loop); loop = null; }
  };
});
