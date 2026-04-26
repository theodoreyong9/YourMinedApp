/* jshint esversion:11 */
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  // ── Constants ──────────────────────────────────────────────────────────────
  const MSG = {
    INVITE:   'ttt:invite',
    ACCEPT:   'ttt:accept',
    DECLINE:  'ttt:decline',
    MOVE:     'ttt:move',
    REMATCH:  'ttt:rematch',
    CANCEL:   'ttt:cancel',
  };

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  // ── Shared state (survives panel re-renders) ───────────────────────────────
  let ctx_ref = null;
  let game = null;   // { board, myMark, opponentId, myTurn, status }
  let pendingInvite = null;  // { fromId, fromName }
  let renderRoot = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function checkWinner(board) {
    for (const [a,b,c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c])
        return { winner: board[a], line: [a,b,c] };
    }
    if (board.every(Boolean)) return { winner: 'draw' };
    return null;
  }

  function resetGame() {
    game = null;
    pendingInvite = null;
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  const CSS = `
    .ttt-wrap {
      font-family: var(--font-b, 'Space Grotesk', sans-serif);
      color: var(--text);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 200px;
    }
    .ttt-title {
      font-family: var(--font-d, 'Syne', sans-serif);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: .04em;
      color: var(--cyan);
      margin: 0;
    }
    .ttt-sub {
      font-size: 12px;
      color: var(--text2);
      margin: -8px 0 0;
    }
    /* Board */
    .ttt-board {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .ttt-cell {
      aspect-ratio: 1;
      background: color-mix(in srgb, var(--bg) 70%, var(--text) 30%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 900;
      cursor: pointer;
      transition: background .15s, transform .1s;
      user-select: none;
    }
    .ttt-cell:hover:not(.ttt-cell--taken):not(.ttt-cell--disabled) {
      background: color-mix(in srgb, var(--cyan) 20%, var(--bg) 80%);
      transform: scale(1.04);
    }
    .ttt-cell--taken { cursor: default; }
    .ttt-cell--disabled { opacity: .6; cursor: not-allowed; }
    .ttt-cell--X { color: var(--cyan); }
    .ttt-cell--O { color: var(--gold); }
    .ttt-cell--win {
      background: color-mix(in srgb, var(--green) 25%, var(--bg) 75%);
      animation: ttt-pop .3s ease;
    }
    @keyframes ttt-pop {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.12); }
      100% { transform: scale(1); }
    }
    /* Status bar */
    .ttt-status {
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
    }
    .ttt-status--turn    { background: color-mix(in srgb, var(--cyan) 15%, var(--bg) 85%); color: var(--cyan); }
    .ttt-status--wait    { background: color-mix(in srgb, var(--text3) 20%, var(--bg) 80%); color: var(--text2); }
    .ttt-status--win     { background: color-mix(in srgb, var(--green) 20%, var(--bg) 80%); color: var(--green); }
    .ttt-status--lose    { background: color-mix(in srgb, var(--red) 20%, var(--bg) 80%); color: var(--red); }
    .ttt-status--draw    { background: color-mix(in srgb, var(--gold) 20%, var(--bg) 80%); color: var(--gold); }
    /* Buttons */
    .ttt-btn {
      padding: 9px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-family: var(--font-b, sans-serif);
      font-size: 13px;
      font-weight: 700;
      transition: opacity .15s, transform .1s;
    }
    .ttt-btn:hover { opacity: .85; transform: scale(1.02); }
    .ttt-btn--primary  { background: var(--cyan); color: #000; }
    .ttt-btn--danger   { background: var(--red);  color: #fff; }
    .ttt-btn--ghost    { background: transparent; border: 1.5px solid var(--text3); color: var(--text2); }
    .ttt-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
    /* Invite banner */
    .ttt-invite-banner {
      background: color-mix(in srgb, var(--gold) 15%, var(--bg) 85%);
      border: 1.5px solid var(--gold);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ttt-invite-banner p { margin: 0; font-size: 13px; color: var(--text); }
    /* Input */
    .ttt-label { font-size: 12px; color: var(--text2); margin-bottom: 2px; }
    .ttt-input {
      width: 100%;
      box-sizing: border-box;
      background: color-mix(in srgb, var(--bg) 60%, var(--text) 40%);
      border: 1.5px solid var(--text3);
      border-radius: 8px;
      color: var(--text);
      font-family: var(--font-b, sans-serif);
      font-size: 13px;
      padding: 8px 10px;
      outline: none;
    }
    .ttt-input:focus { border-color: var(--cyan); }
  `;

  function injectCSS() {
    if (document.getElementById('ttt-style')) return;
    const s = document.createElement('style');
    s.id = 'ttt-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(container) {
    renderRoot = container;
    injectCSS();
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'ttt-wrap';

    const title = document.createElement('p');
    title.className = 'ttt-title';
    title.textContent = '✕ Tic Tac Toe ○';
    wrap.appendChild(title);

    // ── Pending incoming invite ────────────────────────────────────────────
    if (pendingInvite && !game) {
      const banner = document.createElement('div');
      banner.className = 'ttt-invite-banner';
      banner.innerHTML = `<p>📩 <strong>${esc(pendingInvite.fromName || pendingInvite.fromId)}</strong> t'invite à jouer !</p>`;
      const row = document.createElement('div');
      row.className = 'ttt-btn-row';
      const accept = document.createElement('button');
      accept.className = 'ttt-btn ttt-btn--primary';
      accept.textContent = '✓ Accepter';
      accept.onclick = () => {
        game = {
          board: Array(9).fill(null),
          myMark: 'O',
          opponentId: pendingInvite.fromId,
          myTurn: false,
          result: null,
          winLine: null,
        };
        ctx_ref.send(MSG.ACCEPT, { name: getMyName() }, pendingInvite.fromId);
        pendingInvite = null;
        ctx_ref.setNotification(0);
        render(renderRoot);
      };
      const decline = document.createElement('button');
      decline.className = 'ttt-btn ttt-btn--danger';
      decline.textContent = '✗ Refuser';
      decline.onclick = () => {
        ctx_ref.send(MSG.DECLINE, {}, pendingInvite.fromId);
        pendingInvite = null;
        ctx_ref.setNotification(0);
        render(renderRoot);
      };
      row.appendChild(accept);
      row.appendChild(decline);
      banner.appendChild(row);
      wrap.appendChild(banner);
    }

    // ── Active game ────────────────────────────────────────────────────────
    if (game) {
      // Status
      const status = document.createElement('div');
      if (game.result === 'win') {
        status.className = 'ttt-status ttt-status--win';
        status.textContent = '🏆 Tu as gagné !';
      } else if (game.result === 'lose') {
        status.className = 'ttt-status ttt-status--lose';
        status.textContent = '😞 Tu as perdu.';
      } else if (game.result === 'draw') {
        status.className = 'ttt-status ttt-status--draw';
        status.textContent = '🤝 Match nul !';
      } else if (game.myTurn) {
        status.className = 'ttt-status ttt-status--turn';
        status.textContent = `C'est ton tour — tu joues ${game.myMark}`;
      } else {
        status.className = 'ttt-status ttt-status--wait';
        status.textContent = `En attente de l'adversaire…`;
      }
      wrap.appendChild(status);

      // Board
      const board = document.createElement('div');
      board.className = 'ttt-board';
      game.board.forEach((cell, i) => {
        const c = document.createElement('div');
        c.className = 'ttt-cell';
        if (cell) {
          c.classList.add('ttt-cell--taken', `ttt-cell--${cell}`);
          c.textContent = cell === 'X' ? '✕' : '○';
        }
        if (game.winLine && game.winLine.includes(i)) {
          c.classList.add('ttt-cell--win');
        }
        const disabled = !game.myTurn || !!cell || !!game.result;
        if (disabled) c.classList.add('ttt-cell--disabled');
        if (!disabled) {
          c.onclick = () => playMove(i);
        }
        board.appendChild(c);
      });
      wrap.appendChild(board);

      // End-game buttons
      if (game.result) {
        const row = document.createElement('div');
        row.className = 'ttt-btn-row';
        const rematch = document.createElement('button');
        rematch.className = 'ttt-btn ttt-btn--primary';
        rematch.textContent = '🔄 Revanche';
        rematch.onclick = () => {
          ctx_ref.send(MSG.REMATCH, {}, game.opponentId);
          // Reset locally, we'll be X and go first
          game = { board: Array(9).fill(null), myMark: 'X', opponentId: game.opponentId, myTurn: true, result: null, winLine: null };
          render(renderRoot);
        };
        const quit = document.createElement('button');
        quit.className = 'ttt-btn ttt-btn--ghost';
        quit.textContent = 'Quitter';
        quit.onclick = () => { ctx_ref.send(MSG.CANCEL, {}, game.opponentId); resetGame(); render(renderRoot); };
        row.appendChild(rematch);
        row.appendChild(quit);
        wrap.appendChild(row);
      }

    } else if (!pendingInvite) {
      // ── Lobby ────────────────────────────────────────────────────────────
      const sub = document.createElement('p');
      sub.className = 'ttt-sub';
      sub.textContent = 'Défie un contact en entrant son ID';
      wrap.appendChild(sub);

      const lbl = document.createElement('p');
      lbl.className = 'ttt-label';
      lbl.textContent = 'ID du contact';
      wrap.appendChild(lbl);

      const input = document.createElement('input');
      input.className = 'ttt-input';
      input.type = 'text';
      input.placeholder = 'peer-id…';
      wrap.appendChild(input);

      const row = document.createElement('div');
      row.className = 'ttt-btn-row';

      const send = document.createElement('button');
      send.className = 'ttt-btn ttt-btn--primary';
      send.textContent = '📨 Inviter';
      send.onclick = () => {
        const peerId = input.value.trim();
        if (!peerId) { ctx_ref.toast('Entre un ID de contact', 'warn'); return; }
        ctx_ref.send(MSG.INVITE, { name: getMyName() }, peerId);
        ctx_ref.toast('Invitation envoyée !', 'success');
        // Store tentative game state waiting for accept
        game = { board: Array(9).fill(null), myMark: 'X', opponentId: peerId, myTurn: true, result: null, winLine: null, waiting: true };
        render(renderRoot);
      };
      row.appendChild(send);
      wrap.appendChild(row);
    }

    // ── Waiting for accept ─────────────────────────────────────────────────
    if (game && game.waiting) {
      const status = document.createElement('div');
      status.className = 'ttt-status ttt-status--wait';
      status.textContent = `⏳ Invitation envoyée… en attente de réponse`;
      wrap.appendChild(status);

      const cancel = document.createElement('button');
      cancel.className = 'ttt-btn ttt-btn--ghost';
      cancel.textContent = 'Annuler';
      cancel.onclick = () => {
        ctx_ref.send(MSG.CANCEL, {}, game.opponentId);
        resetGame();
        render(renderRoot);
      };
      wrap.appendChild(cancel);
    }

    container.appendChild(wrap);
  }

  // ── Game logic ─────────────────────────────────────────────────────────────
  function playMove(index) {
    if (!game || !game.myTurn || game.board[index] || game.result) return;
    game.board[index] = game.myMark;
    game.myTurn = false;

    const outcome = checkWinner(game.board);
    if (outcome) {
      game.winLine = outcome.line || null;
      game.result = outcome.winner === 'draw' ? 'draw' : 'win';
    }

    ctx_ref.send(MSG.MOVE, { index, mark: game.myMark, board: game.board }, game.opponentId);
    render(renderRoot);
  }

  function getMyName() {
    try { return ctx_ref.loadProfile()?.name || 'Joueur'; } catch { return 'Joueur'; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Sphere registration ────────────────────────────────────────────────────
  window.YM_S['tictactoe.sphere.js'] = {
    name: 'Tic Tac Toe',
    icon: '🎮',
    category: 'Games',
    description: 'Joue au Tic Tac Toe contre un contact — invite, accepte, joue !',
    emit:    [MSG.INVITE, MSG.ACCEPT, MSG.DECLINE, MSG.MOVE, MSG.REMATCH, MSG.CANCEL],
    receive: [MSG.INVITE, MSG.ACCEPT, MSG.DECLINE, MSG.MOVE, MSG.REMATCH, MSG.CANCEL],

    activate(ctx) {
      ctx_ref = ctx;
      ctx.onReceive((type, data, peerId) => {
        switch (type) {

          case MSG.INVITE:
            if (game) {
              // Already in a game, decline
              ctx.send(MSG.DECLINE, {}, peerId);
              break;
            }
            pendingInvite = { fromId: peerId, fromName: data.name };
            ctx.setNotification(1);
            ctx.toast(`📩 ${data.name || peerId} t'invite à jouer !`, 'info');
            if (renderRoot) render(renderRoot);
            break;

          case MSG.ACCEPT:
            if (game && game.waiting && game.opponentId === peerId) {
              game.waiting = false;
              // We are X, we go first
              ctx.toast(`${data.name || peerId} a accepté !`, 'success');
              if (renderRoot) render(renderRoot);
            }
            break;

          case MSG.DECLINE:
            if (game && game.opponentId === peerId) {
              ctx.toast('Invitation refusée.', 'warn');
              resetGame();
              if (renderRoot) render(renderRoot);
            }
            break;

          case MSG.MOVE:
            if (!game || game.opponentId !== peerId) break;
            game.board[data.index] = data.mark;
            game.myTurn = true;
            const outcome = checkWinner(game.board);
            if (outcome) {
              game.winLine = outcome.line || null;
              game.result = outcome.winner === 'draw' ? 'draw' : 'lose';
            }
            if (renderRoot) render(renderRoot);
            break;

          case MSG.REMATCH:
            if (!game || game.opponentId !== peerId) break;
            // Opponent asks for rematch — they'll be X, we are O, they go first
            game = { board: Array(9).fill(null), myMark: 'O', opponentId: peerId, myTurn: false, result: null, winLine: null };
            ctx.toast('Revanche acceptée !', 'success');
            if (renderRoot) render(renderRoot);
            break;

          case MSG.CANCEL:
            if (game && game.opponentId === peerId) {
              ctx.toast("L'adversaire a quitté la partie.", 'warn');
              resetGame();
              if (renderRoot) render(renderRoot);
            } else if (pendingInvite && pendingInvite.fromId === peerId) {
              ctx.toast("L'invitation a été annulée.", 'warn');
              pendingInvite = null;
              ctx.setNotification(0);
              if (renderRoot) render(renderRoot);
            }
            break;
        }
      });
    },

    deactivate() {
      ctx_ref = null;
      renderRoot = null;
      resetGame();
    },

    renderPanel(container) {
      renderRoot = container;
      render(container);
    },
  };

})();