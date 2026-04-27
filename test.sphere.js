/* jshint esversion:11 */
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const MSG = {
    INVITE:  'ttt:invite',
    ACCEPT:  'ttt:accept',
    DECLINE: 'ttt:decline',
    MOVE:    'ttt:move',
    REMATCH: 'ttt:rematch',
    CANCEL:  'ttt:cancel',
  };

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  let ctx_ref = null;
  let game = null;
  let pendingInvite = null;
  let renderRoot = null;

  function checkWinner(board) {
    for (const [a,b,c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c])
        return { winner: board[a], line: [a,b,c] };
    }
    if (board.every(Boolean)) return { winner: 'draw' };
    return null;
  }

  function resetGame() { game = null; pendingInvite = null; }

  function getContacts() {
    try { return JSON.parse(localStorage.getItem('ym_contacts_v1') || '[]'); } catch { return []; }
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function getMyName() {
    try { return ctx_ref.loadProfile()?.name || 'Joueur'; } catch { return 'Joueur'; }
  }

  const CSS = `
    .ttt-wrap {
      font-family: var(--font-b, sans-serif);
      color: var(--text);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 200px;
    }
    .ttt-title {
      font-family: var(--font-d, sans-serif);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: .04em;
      color: var(--cyan);
      margin: 0;
    }
    .ttt-sub { font-size: 12px; color: var(--text2); margin: -8px 0 0; }
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
    .ttt-status {
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
    }
    .ttt-status--turn { background: color-mix(in srgb, var(--cyan) 15%, var(--bg) 85%); color: var(--cyan); }
    .ttt-status--wait { background: color-mix(in srgb, var(--text3) 20%, var(--bg) 80%); color: var(--text2); }
    .ttt-status--win  { background: color-mix(in srgb, var(--green) 20%, var(--bg) 80%); color: var(--green); }
    .ttt-status--lose { background: color-mix(in srgb, var(--red) 20%, var(--bg) 80%); color: var(--red); }
    .ttt-status--draw { background: color-mix(in srgb, var(--gold) 20%, var(--bg) 80%); color: var(--gold); }
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
    .ttt-btn--primary { background: var(--cyan); color: #000; }
    .ttt-btn--danger  { background: var(--red);  color: #fff; }
    .ttt-btn--ghost   { background: transparent; border: 1.5px solid var(--text3); color: var(--text2); }
    .ttt-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
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
    .ttt-contact-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 260px;
      overflow-y: auto;
    }
    .ttt-contact-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--bg) 60%, var(--text) 40%);
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.07);
    }
    .ttt-contact-av-fb {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--cyan);
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
      flex-shrink: 0;
    }
    .ttt-contact-name {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ttt-invite-btn { padding: 6px 12px !important; font-size: 12px !important; flex-shrink: 0; }
    .ttt-empty { font-size: 12px; color: var(--text3); text-align: center; padding: 20px 0; }
  `;

  function injectCSS() {
    if (document.getElementById('ttt-style')) return;
    const s = document.createElement('style');
    s.id = 'ttt-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function render(container) {
    renderRoot = container;
    injectCSS();
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'ttt-wrap';

    const title = document.createElement('p');
    title.className = 'ttt-title';
    title.textContent = 'Tic Tac Toe';
    wrap.appendChild(title);

    // Incoming invite
    if (pendingInvite && !game) {
      const banner = document.createElement('div');
      banner.className = 'ttt-invite-banner';
      banner.innerHTML = '<p>📩 <strong>' + esc(pendingInvite.fromName || pendingInvite.fromId) + '</strong> t\'invite à jouer !</p>';
      const row = document.createElement('div');
      row.className = 'ttt-btn-row';

      const accept = document.createElement('button');
      accept.className = 'ttt-btn ttt-btn--primary';
      accept.textContent = '✓ Accepter';
      accept.onclick = () => {
        game = { board: Array(9).fill(null), myMark: 'O', opponentId: pendingInvite.fromId, myTurn: false, result: null, winLine: null };
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

    // Active game
    if (game && !game.waiting) {
      const status = document.createElement('div');
      if      (game.result === 'win')  { status.className = 'ttt-status ttt-status--win';  status.textContent = '🏆 Tu as gagné !'; }
      else if (game.result === 'lose') { status.className = 'ttt-status ttt-status--lose'; status.textContent = '😞 Tu as perdu.'; }
      else if (game.result === 'draw') { status.className = 'ttt-status ttt-status--draw'; status.textContent = '🤝 Match nul !'; }
      else if (game.myTurn)            { status.className = 'ttt-status ttt-status--turn'; status.textContent = 'C\'est ton tour — tu joues ' + game.myMark; }
      else                             { status.className = 'ttt-status ttt-status--wait'; status.textContent = 'En attente de l\'adversaire…'; }
      wrap.appendChild(status);

      const board = document.createElement('div');
      board.className = 'ttt-board';
      game.board.forEach((cell, i) => {
        const c = document.createElement('div');
        c.className = 'ttt-cell';
        if (cell) { c.classList.add('ttt-cell--taken', 'ttt-cell--' + cell); c.textContent = cell === 'X' ? '✕' : '○'; }
        if (game.winLine && game.winLine.includes(i)) c.classList.add('ttt-cell--win');
        const disabled = !game.myTurn || !!cell || !!game.result;
        if (disabled) c.classList.add('ttt-cell--disabled');
        else c.onclick = () => playMove(i);
        board.appendChild(c);
      });
      wrap.appendChild(board);

      if (game.result) {
        const row = document.createElement('div');
        row.className = 'ttt-btn-row';
        const rematch = document.createElement('button');
        rematch.className = 'ttt-btn ttt-btn--primary';
        rematch.textContent = '🔄 Revanche';
        rematch.onclick = () => {
          ctx_ref.send(MSG.REMATCH, {}, game.opponentId);
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

    } else if (game && game.waiting) {
      // Waiting for opponent
      const status = document.createElement('div');
      status.className = 'ttt-status ttt-status--wait';
      status.textContent = '⏳ Invitation envoyée… en attente de réponse';
      wrap.appendChild(status);
      const cancel = document.createElement('button');
      cancel.className = 'ttt-btn ttt-btn--ghost';
      cancel.textContent = 'Annuler';
      cancel.onclick = () => { ctx_ref.send(MSG.CANCEL, {}, game.opponentId); resetGame(); render(renderRoot); };
      wrap.appendChild(cancel);

    } else if (!pendingInvite) {
      // Lobby — contact picker
      const contacts = getContacts();
      if (!contacts.length) {
        const empty = document.createElement('div');
        empty.className = 'ttt-empty';
        empty.textContent = 'Aucun contact. Ajoute des contacts dans ton profil !';
        wrap.appendChild(empty);
      } else {
        const sub = document.createElement('p');
        sub.className = 'ttt-sub';
        sub.textContent = 'Choisis un contact à défier';
        wrap.appendChild(sub);

        const list = document.createElement('div');
        list.className = 'ttt-contact-list';

        contacts.forEach(c => {
          const prof = c.profile || {};
          const name = c.nickname || prof.name || c.uuid;

          const card = document.createElement('div');
          card.className = 'ttt-contact-card';

          const av = document.createElement('div');
          if (prof.avatar) {
            const img = document.createElement('img');
            img.src = prof.avatar;
            img.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0';
            av.appendChild(img);
          } else {
            av.className = 'ttt-contact-av-fb';
            av.textContent = name.charAt(0).toUpperCase();
          }

          const nameEl = document.createElement('div');
          nameEl.className = 'ttt-contact-name';
          nameEl.textContent = name;

          const btn = document.createElement('button');
          btn.className = 'ttt-btn ttt-btn--primary ttt-invite-btn';
          btn.textContent = '📨 Inviter';
          btn.onclick = () => {
            ctx_ref.send(MSG.INVITE, { name: getMyName() }, c.uuid);
            ctx_ref.toast('Invitation envoyée à ' + name + ' !', 'success');
            game = { board: Array(9).fill(null), myMark: 'X', opponentId: c.uuid, myTurn: true, result: null, winLine: null, waiting: true };
            render(renderRoot);
          };

          card.appendChild(av);
          card.appendChild(nameEl);
          card.appendChild(btn);
          list.appendChild(card);
        });

        wrap.appendChild(list);
      }
    }

    container.appendChild(wrap);
  }

  function playMove(index) {
    if (!game || !game.myTurn || game.board[index] || game.result) return;
    game.board[index] = game.myMark;
    game.myTurn = false;
    const outcome = checkWinner(game.board);
    if (outcome) { game.winLine = outcome.line || null; game.result = outcome.winner === 'draw' ? 'draw' : 'win'; }
    ctx_ref.send(MSG.MOVE, { index, mark: game.myMark, board: game.board }, game.opponentId);
    render(renderRoot);
  }

  window.YM_S['test.sphere.js'] = {
    name: 'Tic Tac Toe',
    icon: '🎮',
    category: 'Games',
    description: 'Joue au Tic Tac Toe contre un contact — invite, accepte, joue !',
    emit:    [MSG.INVITE, MSG.ACCEPT, MSG.DECLINE, MSG.MOVE, MSG.REMATCH, MSG.CANCEL],
    receive: [MSG.INVITE, MSG.ACCEPT, MSG.DECLINE, MSG.MOVE, MSG.REMATCH, MSG.CANCEL],

    activate(ctx) {
      ctx_ref = ctx;

      // ── Polling fallback: check storage for pending invites ──────────────
      // In case P2P message was missed, sender also writes to a shared key
      // and receiver polls for it every 2s
      const _pollInterval = setInterval(() => {
        try {
          const raw = localStorage.getItem('ttt:invite:' + (ctx.loadProfile && ctx.loadProfile()?.uuid));
          if (!raw) return;
          const inv = JSON.parse(raw);
          // Only process if fresh (< 30s) and not already handled
          if (!inv || Date.now() - inv.ts > 30000) { localStorage.removeItem('ttt:invite:' + ctx.loadProfile()?.uuid); return; }
          if (!game && !pendingInvite) {
            pendingInvite = { fromId: inv.fromId, fromName: inv.fromName };
            ctx.setNotification(1);
            ctx.toast('📩 ' + (inv.fromName || inv.fromId) + ' t\'invite à jouer !', 'info');
            localStorage.removeItem('ttt:invite:' + ctx.loadProfile()?.uuid);
            document.querySelectorAll('[id^="peer-sphere-"]').forEach(el => { if (el._tttRefresh) el._tttRefresh(); });
            if (renderRoot) render(renderRoot);
          }
        } catch(e) {}
      }, 2000);

      ctx.onReceive((type, data, peerId) => {
        switch (type) {
          case MSG.INVITE:
            if (game) { ctx.send(MSG.DECLINE, {}, peerId); break; }
            pendingInvite = { fromId: peerId, fromName: data.name };
            ctx.setNotification(1);
            ctx.toast('📩 ' + (data.name || peerId) + ' t\'invite à jouer !', 'info');
            // Refresh peerSection if the contact's profile is open
            document.querySelectorAll('[id^="peer-sphere-"]').forEach(el => {
              if (el._tttRefresh) el._tttRefresh();
            });
            if (renderRoot) render(renderRoot);
            break;

          case MSG.ACCEPT:
            if (game && game.waiting && game.opponentId === peerId) {
              game.waiting = false;
              ctx.toast((data.name || peerId) + ' a accepté !', 'success');
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
            if (outcome) { game.winLine = outcome.line || null; game.result = outcome.winner === 'draw' ? 'draw' : 'lose'; }
            if (renderRoot) render(renderRoot);
            break;

          case MSG.REMATCH:
            if (!game || game.opponentId !== peerId) break;
            game = { board: Array(9).fill(null), myMark: 'O', opponentId: peerId, myTurn: false, result: null, winLine: null };
            ctx.toast('Revanche !', 'success');
            if (renderRoot) render(renderRoot);
            break;

          case MSG.CANCEL:
            if (game && game.opponentId === peerId) {
              ctx.toast("L'adversaire a quitté.", 'warn');
              resetGame(); if (renderRoot) render(renderRoot);
            } else if (pendingInvite && pendingInvite.fromId === peerId) {
              ctx.toast("L'invitation a été annulée.", 'warn');
              pendingInvite = null; ctx.setNotification(0);
              if (renderRoot) render(renderRoot);
            }
            break;
        }
      });
    },

    deactivate() { ctx_ref = null; renderRoot = null; resetGame(); clearInterval(_pollInterval); },

    // Called by profile.js when viewing a contact's profile or contact list
    peerSection(container, pCtx) {
      const uuid = pCtx.uuid;

      function renderPeer() {
        container.innerHTML = '';
        container.style.cssText = 'padding: 4px 0';

        // Case 1: pending invite FROM this peer
        if (pendingInvite && pendingInvite.fromId === uuid) {
          const banner = document.createElement('div');
          banner.style.cssText = 'background:color-mix(in srgb,var(--gold) 15%,var(--bg) 85%);border:1.5px solid var(--gold);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px';
          banner.innerHTML = '<p style="margin:0;font-size:13px;font-weight:600;color:var(--text)">📩 Invitation à jouer !</p>';
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px';

          const accept = document.createElement('button');
          accept.className = 'ym-btn ym-btn-accent';
          accept.style.cssText = 'flex:1;font-size:12px';
          accept.textContent = '✓ Accepter';
          accept.onclick = () => {
            game = { board: Array(9).fill(null), myMark: 'O', opponentId: uuid, myTurn: false, result: null, winLine: null };
            ctx_ref.send(MSG.ACCEPT, { name: getMyName() }, uuid);
            pendingInvite = null;
            ctx_ref.setNotification(0);
            // Open the game panel
            ctx_ref.openPanel(c => { renderRoot = c; render(c); });
            renderPeer();
          };

          const decline = document.createElement('button');
          decline.className = 'ym-btn ym-btn-ghost';
          decline.style.cssText = 'flex:1;font-size:12px';
          decline.textContent = '✗ Refuser';
          decline.onclick = () => {
            ctx_ref.send(MSG.DECLINE, {}, uuid);
            pendingInvite = null;
            ctx_ref.setNotification(0);
            renderPeer();
          };

          row.appendChild(accept);
          row.appendChild(decline);
          banner.appendChild(row);
          container.appendChild(banner);

        // Case 2: active game with this peer
        } else if (game && game.opponentId === uuid) {
          const btn = document.createElement('button');
          btn.className = 'ym-btn ym-btn-ghost';
          btn.style.cssText = 'width:100%;font-size:12px';
          btn.textContent = '🎮 Voir la partie en cours';
          btn.onclick = () => ctx_ref.openPanel(c => { renderRoot = c; render(c); });
          container.appendChild(btn);

        // Case 3: no game — invite button
        } else if (!game) {
          const btn = document.createElement('button');
          btn.className = 'ym-btn ym-btn-ghost';
          btn.style.cssText = 'width:100%;font-size:12px';
          btn.textContent = '🎮 Inviter à jouer';
          btn.onclick = () => {
            const myName = getMyName();
            ctx_ref.send(MSG.INVITE, { name: myName }, uuid);
            // Fallback: write invite to localStorage so opponent's polling catches it
            try {
              localStorage.setItem('ttt:invite:' + uuid, JSON.stringify({
                fromId: ctx_ref.loadProfile()?.uuid || 'unknown',
                fromName: myName,
                ts: Date.now()
              }));
            } catch(e) {}
            ctx_ref.toast('Invitation envoyée !', 'success');
            game = { board: Array(9).fill(null), myMark: 'X', opponentId: uuid, myTurn: true, result: null, winLine: null, waiting: true };
            ctx_ref.openPanel(c => { renderRoot = c; render(c); });
            renderPeer();
          };
          container.appendChild(btn);
        }
      }

      renderPeer();

      // Re-render this section when state changes (invite received while profile open)
      const _orig = render;
      container._tttRefresh = () => renderPeer();
    },
    renderPanel(container) { renderRoot = container; render(container); },
  };

})();
