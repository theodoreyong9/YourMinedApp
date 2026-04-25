// morpion.sphere.js — Plugin Tic-Tac-Toe 2 joueurs pour YourMine
(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Constantes ───────────────────────────────────────────── */
  const SPHERE_ID  = 'morpion.sphere.js';
  const STORE_KEY  = 'ym_morpion_scores';
  const LINES      = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  /* ── Scores persistants ───────────────────────────────────── */
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{"X":0,"O":0,"draws":0}'); }
    catch { return { X: 0, O: 0, draws: 0 }; }
  }
  function saveScores(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

  /* ── Logique du jeu ───────────────────────────────────────── */
  function checkWinner(board) {
    for (const [a, b, c] of LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c])
        return { winner: board[a], line: [a, b, c] };
    }
    return board.includes('') ? null : { winner: null, line: [] }; // null = en cours
  }

  /* ── CSS injecté une seule fois ───────────────────────────── */
  function injectCSS() {
    if (document.getElementById('morpion-style')) return;
    const s = document.createElement('style');
    s.id = 'morpion-style';
    s.textContent = `
      .morpion-root {
        font-family: 'Courier New', monospace;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding: 16px 12px 20px;
        user-select: none;
      }
      .morpion-title {
        font-size: 11px;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--accent, #e8a020);
        margin-bottom: 12px;
        font-weight: 700;
      }
      .morpion-players {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
        width: 100%;
        max-width: 280px;
      }
      .morpion-player-input {
        flex: 1;
        background: var(--surface3, #1a1a2e);
        border: 1px solid var(--border, rgba(232,160,32,.2));
        border-radius: var(--r-sm, 6px);
        color: var(--text1, #fff);
        font-family: inherit;
        font-size: 12px;
        padding: 6px 8px;
        text-align: center;
        outline: none;
        transition: border-color .2s;
      }
      .morpion-player-input:focus { border-color: var(--accent, #e8a020); }
      .morpion-player-input.active { border-color: var(--accent, #e8a020); box-shadow: 0 0 0 2px rgba(232,160,32,.15); }
      .morpion-status {
        font-size: 12px;
        color: var(--text2, #bbb);
        margin-bottom: 14px;
        min-height: 20px;
        text-align: center;
        transition: color .2s;
      }
      .morpion-status.winner { color: var(--accent, #e8a020); font-weight: 700; }
      .morpion-status.draw   { color: var(--text3, #777); }
      .morpion-grid {
        display: grid;
        grid-template-columns: repeat(3, 80px);
        grid-template-rows: repeat(3, 80px);
        gap: 6px;
        margin-bottom: 16px;
      }
      .morpion-cell {
        width: 80px;
        height: 80px;
        background: var(--surface3, #1a1a2e);
        border: 1px solid var(--border, rgba(232,160,32,.15));
        border-radius: var(--r-sm, 6px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 34px;
        cursor: pointer;
        transition: background .15s, border-color .15s, transform .1s;
        position: relative;
        overflow: hidden;
      }
      .morpion-cell:hover:not(.taken) {
        background: rgba(232,160,32,.07);
        border-color: rgba(232,160,32,.4);
        transform: scale(1.04);
      }
      .morpion-cell.taken { cursor: default; }
      .morpion-cell.X-cell { color: #e8a020; }
      .morpion-cell.O-cell { color: #30c8e8; }
      .morpion-cell.winning {
        background: rgba(232,160,32,.18);
        border-color: var(--accent, #e8a020);
        animation: morpion-pulse .5s ease-in-out 2;
      }
      .morpion-cell.O-cell.winning {
        background: rgba(48,200,232,.18);
        border-color: #30c8e8;
        animation: morpion-pulse-o .5s ease-in-out 2;
      }
      @keyframes morpion-pulse   { 0%,100%{transform:scale(1)}50%{transform:scale(1.08)} }
      @keyframes morpion-pulse-o { 0%,100%{transform:scale(1)}50%{transform:scale(1.08)} }
      .morpion-cell .mark {
        opacity: 0;
        transform: scale(.4) rotate(-20deg);
        transition: opacity .2s, transform .2s;
      }
      .morpion-cell.taken .mark { opacity: 1; transform: scale(1) rotate(0deg); }
      .morpion-scores {
        display: flex;
        gap: 6px;
        margin-bottom: 14px;
        font-size: 11px;
        color: var(--text3, #777);
      }
      .morpion-score-box {
        background: var(--surface3, #1a1a2e);
        border: 1px solid var(--border, rgba(232,160,32,.12));
        border-radius: var(--r-sm, 6px);
        padding: 5px 10px;
        text-align: center;
        min-width: 60px;
      }
      .morpion-score-box .sc-name { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
      .morpion-score-box .sc-val  { font-size: 18px; font-weight: 700; color: var(--text1, #fff); }
      .morpion-score-box.X-score .sc-name { color: #e8a020; }
      .morpion-score-box.O-score .sc-name { color: #30c8e8; }
      .morpion-actions {
        display: flex;
        gap: 8px;
      }
      .morpion-btn {
        font-family: inherit;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 7px 14px;
        border-radius: var(--r-sm, 6px);
        border: 1px solid var(--border, rgba(232,160,32,.2));
        background: transparent;
        color: var(--text2, #bbb);
        cursor: pointer;
        transition: background .15s, border-color .15s, color .15s;
      }
      .morpion-btn:hover { background: rgba(255,255,255,.05); border-color: var(--accent, #e8a020); color: var(--accent, #e8a020); }
      .morpion-btn.accent {
        background: var(--accent, #e8a020);
        color: #000;
        border-color: var(--accent, #e8a020);
        font-weight: 700;
      }
      .morpion-btn.accent:hover { filter: brightness(1.15); }
      .morpion-preview {
        font-size: 9px;
        color: var(--text3, #555);
        margin-bottom: 4px;
        letter-spacing: 1px;
        text-transform: uppercase;
        text-align: center;
      }
      .morpion-ghost { opacity: .3; font-size: 24px; }
    `;
    document.head.appendChild(s);
  }

  /* ── Rendu principal ──────────────────────────────────────── */
  function renderMorpion(container, opts) {
    opts = opts || {};
    injectCSS();
    container.innerHTML = '';

    /* État */
    let board     = Array(9).fill('');
    let current   = 'X';
    let gameOver  = false;
    let scores    = loadScores();
    let names     = { X: 'Joueur X', O: 'Joueur O' };

    /* Structure */
    const root = document.createElement('div');
    root.className = 'morpion-root';

    /* Titre */
    const title = document.createElement('div');
    title.className = 'morpion-title';
    title.textContent = '✕ Morpion ○';
    root.appendChild(title);

    /* Noms des joueurs */
    const playersRow = document.createElement('div');
    playersRow.className = 'morpion-players';

    const inputX = document.createElement('input');
    inputX.className = 'morpion-player-input active';
    inputX.type = 'text';
    inputX.value = names.X;
    inputX.maxLength = 16;
    inputX.placeholder = 'Joueur ✕';

    const vs = document.createElement('div');
    vs.style.cssText = 'font-size:10px;color:var(--text3,#555);align-self:center;flex-shrink:0;letter-spacing:1px';
    vs.textContent = 'vs';

    const inputO = document.createElement('input');
    inputO.className = 'morpion-player-input';
    inputO.type = 'text';
    inputO.value = names.O;
    inputO.maxLength = 16;
    inputO.placeholder = 'Joueur ○';

    inputX.addEventListener('input', () => { names.X = inputX.value || 'Joueur X'; updateStatus(); });
    inputO.addEventListener('input', () => { names.O = inputO.value || 'Joueur O'; updateStatus(); });

    playersRow.appendChild(inputX);
    playersRow.appendChild(vs);
    playersRow.appendChild(inputO);
    root.appendChild(playersRow);

    /* Status */
    const status = document.createElement('div');
    status.className = 'morpion-status';
    root.appendChild(status);

    /* Grille */
    const grid = document.createElement('div');
    grid.className = 'morpion-grid';
    const cells = [];

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'morpion-cell';
      cell.innerHTML = '<span class="mark"></span>';
      cell.addEventListener('click', () => onCellClick(i));
      cells.push(cell);
      grid.appendChild(cell);
    }
    root.appendChild(grid);

    /* Scores */
    const scoresRow = document.createElement('div');
    scoresRow.className = 'morpion-scores';

    function makeScoreBox(cls, label, key) {
      const box = document.createElement('div');
      box.className = 'morpion-score-box ' + cls;
      box.innerHTML = `<div class="sc-name">${label}</div><div class="sc-val" id="sc-${key}">0</div>`;
      return box;
    }
    scoresRow.appendChild(makeScoreBox('X-score', '✕', 'X'));
    scoresRow.appendChild(makeScoreBox('', 'Nuls', 'draws'));
    scoresRow.appendChild(makeScoreBox('O-score', '○', 'O'));
    root.appendChild(scoresRow);

    /* Boutons */
    const actions = document.createElement('div');
    actions.className = 'morpion-actions';

    const btnRestart = document.createElement('button');
    btnRestart.className = 'morpion-btn accent';
    btnRestart.textContent = 'Rejouer';
    btnRestart.addEventListener('click', resetGame);

    const btnReset = document.createElement('button');
    btnReset.className = 'morpion-btn';
    btnReset.textContent = 'Reset scores';
    btnReset.addEventListener('click', resetScores);

    actions.appendChild(btnRestart);
    actions.appendChild(btnReset);
    root.appendChild(actions);

    container.appendChild(root);

    /* ── Fonctions internes ─────────────────────────────────── */
    function updateStatus() {
      const result = checkWinner(board);
      if (!result) {
        // Partie en cours
        const who = current === 'X' ? names.X || 'Joueur ✕' : names.O || 'Joueur ○';
        const sym = current === 'X' ? '✕' : '○';
        status.textContent = `Tour de ${who} (${sym})`;
        status.className = 'morpion-status';
        // Surligner l'input actif
        inputX.className = 'morpion-player-input' + (current === 'X' ? ' active' : '');
        inputO.className = 'morpion-player-input' + (current === 'O' ? ' active' : '');
      } else if (result.winner) {
        const who = result.winner === 'X' ? names.X || 'Joueur ✕' : names.O || 'Joueur ○';
        const sym = result.winner === 'X' ? '✕' : '○';
        status.textContent = `🎉 ${who} (${sym}) a gagné !`;
        status.className = 'morpion-status winner';
        inputX.className = 'morpion-player-input';
        inputO.className = 'morpion-player-input';
      } else {
        status.textContent = 'Match nul !';
        status.className = 'morpion-status draw';
        inputX.className = 'morpion-player-input';
        inputO.className = 'morpion-player-input';
      }
    }

    function renderScores() {
      const elX = root.querySelector('#sc-X');
      const elO = root.querySelector('#sc-O');
      const elD = root.querySelector('#sc-draws');
      if (elX) elX.textContent = scores.X;
      if (elO) elO.textContent = scores.O;
      if (elD) elD.textContent = scores.draws;
    }

    function onCellClick(i) {
      if (gameOver || board[i]) return;
      board[i] = current;

      const cell = cells[i];
      cell.classList.add('taken', current + '-cell');
      cell.querySelector('.mark').textContent = current === 'X' ? '✕' : '○';

      const result = checkWinner(board);
      if (result) {
        gameOver = true;
        if (result.winner) {
          result.line.forEach(idx => cells[idx].classList.add('winning'));
          scores[result.winner]++;
        } else {
          scores.draws++;
        }
        saveScores(scores);
        renderScores();
      } else {
        current = current === 'X' ? 'O' : 'X';
      }
      updateStatus();
    }

    function resetGame() {
      board    = Array(9).fill('');
      current  = 'X';
      gameOver = false;
      cells.forEach(cell => {
        cell.className = 'morpion-cell';
        cell.querySelector('.mark').textContent = '';
      });
      updateStatus();
    }

    function resetScores() {
      scores = { X: 0, O: 0, draws: 0 };
      saveScores(scores);
      renderScores();
    }

    /* Init */
    renderScores();
    updateStatus();
  }

  /* ── Intégration YourMine ─────────────────────────────────── */
  const sphereDef = {
    id:          SPHERE_ID,
    name:        'Morpion',
    icon:        '✕',
    description: 'Jeu de morpion (Tic-Tac-Toe) à 2 joueurs — scores persistants.',

    /* Onglet principal dans le panel sphere */
    render(container) {
      renderMorpion(container);
    },

    /* Section affichée sur le profil d'un peer (accordéon "Him") */
    peerSection(container, ctx) {
      container.style.cssText = 'text-align:center;padding:8px 0';
      container.innerHTML =
        '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Défie ' +
        esc((ctx && ctx.profile && ctx.profile.name) || 'ce joueur') +
        ' au morpion !</div>';
      const btn = document.createElement('button');
      btn.className = 'ym-btn ym-btn-accent';
      btn.style.cssText = 'font-size:12px';
      btn.textContent = '⊞ Lancer une partie';
      btn.addEventListener('click', () => {
        /* Ouvre le panel sphere si disponible, sinon overlay */
        if (window.YM && window.YM.openPanel) window.YM.openPanel('panel-spheres');
        else openGameOverlay();
      });
      container.appendChild(btn);
    },
  };

  /* ── Overlay standalone (hors YourMine) ──────────────────── */
  function openGameOverlay() {
    injectCSS();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px)';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface2,#12121f);border:1px solid var(--border,rgba(232,160,32,.2));border-radius:var(--r-lg,12px);overflow:hidden;max-width:340px;width:90vw';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border,rgba(232,160,32,.12))';
    head.innerHTML = '<span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:var(--accent,#e8a020)">✕ Morpion ○</span>';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:var(--text3,#777);font-size:18px;cursor:pointer;line-height:1';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => overlay.remove());
    head.appendChild(closeBtn);
    box.appendChild(head);

    const body = document.createElement('div');
    renderMorpion(body);
    box.appendChild(body);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  /* ── Enregistrement dans le registre YourMine ────────────── */
  function register() {
    if (window.YM_sphereRegistry) {
      window.YM_sphereRegistry.set(SPHERE_ID, sphereDef);
    }
    // Expose aussi pour usage direct
    window.YM_Morpion = { open: openGameOverlay, render: renderMorpion };
  }

  /* Lance l'enregistrement quand le DOM est prêt */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register);
  } else {
    register();
  }

})();