/**
 * ╔══════════════════════════════════════════════════╗
 * ║   FRODON PLUGIN — TicTacToe P2P                  ║
 * ║   Défiez vos pairs à une partie en temps réel    ║
 * ╚══════════════════════════════════════════════════╝
 *
 * Installation : coller l'URL raw GitHub dans ⬡ SPHERE
 * Aucune installation requise chez l'adversaire —
 * il verra un bouton "Installer et jouer" automatiquement.
 */

frodon.register({
  id          : 'tictactoe',
  name        : 'TicTacToe',
  version     : '1.1.0',
  author      : 'frodon-community',
  description : 'Défiez vos pairs à une partie de TicTacToe en P2P.',
  icon        : '⊞',
}, () => {

  const PLUGIN_ID = 'tictactoe';
  const store     = frodon.storage(PLUGIN_ID);

  /* ──────────────────────────────────────────────────
     ÉTAT DES PARTIES
     { [gameId]: { board, mySymbol, opponentId, myTurn, done, winner } }
  ────────────────────────────────────────────────── */
  const games = {};

  function newGame(opponentId, mySymbol) {
    return {
      board      : Array(9).fill(null),
      mySymbol,
      opponentId,
      myTurn     : mySymbol === 'X',   // X always goes first
      done       : false,
      winner     : null,
    };
  }

  function checkWinner(board) {
    const LINES = [
      [0,1,2],[3,4,5],[6,7,8],   // rows
      [0,3,6],[1,4,7],[2,5,8],   // cols
      [0,4,8],[2,4,6],            // diags
    ];
    for(const [a,b,c] of LINES) {
      if(board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.every(Boolean) ? 'draw' : null;
  }

  function getWinLine(board) {
    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(const line of LINES) {
      const [a,b,c] = line;
      if(board[a] && board[a]===board[b] && board[a]===board[c]) return line;
    }
    return null;
  }

  function getGameId(peerId) {
    return Object.keys(games).find(gid => games[gid].opponentId === peerId);
  }

  /* ──────────────────────────────────────────────────
     SCORE
  ────────────────────────────────────────────────── */
  function addScore(result) {
    // result: 'win' | 'loss' | 'draw'
    const wins   = store.get('wins')   || 0;
    const losses = store.get('losses') || 0;
    const draws  = store.get('draws')  || 0;
    if(result === 'win')  store.set('wins',   wins+1);
    if(result === 'loss') store.set('losses', losses+1);
    if(result === 'draw') store.set('draws',  draws+1);
  }

  /* ──────────────────────────────────────────────────
     RÉCEPTION DES PAQUETS DM
  ────────────────────────────────────────────────── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    const {type, gameId} = payload;

    if(type === 'challenge') {
      // We are invited → we play as O
      const prev = getGameId(fromId);
      if(prev) delete games[prev];   // cancel any previous game with this peer
      games[gameId] = newGame(fromId, 'O');
      const peer = frodon.getPeer(fromId);
      frodon.showToast('⊞ ' + (peer?.name || 'Un pair') + ' vous défie au TicTacToe !');
      frodon.refreshPeerModal(fromId);
    }

    if(type === 'move') {
      const game = games[gameId];
      if(!game || game.done) return;
      const opponentSymbol = game.mySymbol === 'X' ? 'O' : 'X';
      game.board[payload.cell] = opponentSymbol;
      game.myTurn = true;
      const win = checkWinner(game.board);
      if(win) {
        game.done   = true;
        game.winner = win;
        if(win === 'draw') addScore('draw');
        else               addScore('loss');   // opponent won
      }
      frodon.showToast(win ? (win==='draw'?'🤝 Égalité !':'😔 Défaite…') : '⊞ À vous de jouer !');
      frodon.refreshPeerModal(game.opponentId);
    }

    if(type === 'forfeit') {
      const game = games[gameId];
      if(!game) return;
      game.done   = true;
      game.winner = game.mySymbol;   // opponent forfeits → we win
      addScore('win');
      const peer = frodon.getPeer(fromId);
      frodon.showToast('🏆 ' + (peer?.name||'L\'adversaire') + ' a abandonné. Victoire !');
      frodon.refreshPeerModal(game.opponentId);
    }

    if(type === 'rematch') {
      // Opponent wants a rematch — auto-accept by resetting
      const prev = getGameId(fromId);
      if(prev) delete games[prev];
      games[gameId] = newGame(fromId, 'O');
      const peer = frodon.getPeer(fromId);
      frodon.showToast('⊞ ' + (peer?.name||'Votre adversaire') + ' veut une revanche !');
      frodon.refreshPeerModal(fromId);
    }
  });

  /* ──────────────────────────────────────────────────
     ACTION DANS LA FICHE D'UN PAIR
  ────────────────────────────────────────────────── */
  frodon.registerPeerAction(PLUGIN_ID, '⊞ TicTacToe', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    if(!peer) return;

    const gameId = getGameId(peerId);
    const game   = gameId ? games[gameId] : null;

    // ── No game yet → Challenge button ────────────────
    if(!game) {
      const wrap = frodon.makeElement('div','');
      wrap.style.cssText = 'text-align:center;padding:8px 0';

      const challengeBtn = frodon.makeElement('button','plugin-action-btn acc','⊞ Défier ' + peer.name);
      challengeBtn.style.cssText = 'font-size:.85rem;padding:12px;width:100%';
      challengeBtn.addEventListener('click', () => {
        const gid    = 'ttc_' + Date.now();
        games[gid]   = newGame(peerId, 'X');
        frodon.sendDM(peerId, PLUGIN_ID, {type:'challenge', gameId:gid});
        frodon.showToast('Défi envoyé à ' + peer.name + ' !');
        frodon.refreshPeerModal(peerId);
      });
      wrap.appendChild(challengeBtn);

      const hint = frodon.makeElement('div','');
      hint.style.cssText = 'font-size:.6rem;color:var(--txt2);font-family:var(--mono);margin-top:8px';
      hint.textContent   = 'En attente que ' + peer.name + ' accepte…';
      hint.style.display = 'none';

      container.appendChild(wrap);
      return;
    }

    // ── Game in progress or finished ──────────────────
    renderBoard(container, game, gameId, peerId, peer);
  });

  /* ──────────────────────────────────────────────────
     RENDU DE LA GRILLE
  ────────────────────────────────────────────────── */
  function renderBoard(container, game, gameId, peerId, peer) {
    const winLine = game.done ? getWinLine(game.board) : null;

    // Status bar
    const statusBar = frodon.makeElement('div','');
    statusBar.style.cssText = `
      text-align:center;padding:8px 4px 12px;
      font-family:var(--mono);font-size:.82rem;
      color:var(--acc);letter-spacing:.5px;
    `;
    if(game.done) {
      if(game.winner === 'draw')
        statusBar.textContent = '🤝 Égalité !';
      else if(game.winner === game.mySymbol)
        statusBar.textContent = '🏆 Victoire !';
      else
        statusBar.textContent = '😔 ' + peer.name + ' a gagné';
    } else {
      statusBar.textContent = game.myTurn
        ? '⌛ Votre tour — vous jouez ' + (game.mySymbol === 'X' ? '✕' : '○')
        : '💬 Tour de ' + peer.name + '…';
    }
    container.appendChild(statusBar);

    // Players row
    const playersRow = frodon.makeElement('div','');
    playersRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:.72rem;font-family:var(--mono)';
    const me = frodon.getMyProfile();
    const mkPlayer = (name, symbol, active) => {
      const p = frodon.makeElement('div','');
      p.style.cssText = `display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:8px;
        border:1px solid ${active?'rgba(0,245,200,.4)':'var(--bdr)'};
        background:${active?'rgba(0,245,200,.06)':'transparent'};
        color:${active?'var(--acc)':'var(--txt2)'}`;
      p.innerHTML = (symbol==='X'?'<span style="color:#ff6b35">✕</span>':'<span style="color:#7c4dff">○</span>')
        + ' ' + name.substring(0,10);
      return p;
    };
    const myActive   = !game.done && game.myTurn;
    const oppActive  = !game.done && !game.myTurn;
    playersRow.appendChild(mkPlayer(me.name, game.mySymbol, myActive));
    playersRow.appendChild(frodon.makeElement('span','','vs'));
    playersRow.appendChild(mkPlayer(peer.name, game.mySymbol==='X'?'O':'X', oppActive));
    container.appendChild(playersRow);

    // Board grid 3×3
    const grid = frodon.makeElement('div','');
    grid.style.cssText = `
      display:grid;grid-template-columns:repeat(3,1fr);gap:6px;
      max-width:210px;margin:0 auto 14px;
    `;

    game.board.forEach((cell, i) => {
      const sq = frodon.makeElement('div','');
      const isWinCell = winLine && winLine.includes(i);
      const canClick  = !cell && game.myTurn && !game.done;

      sq.style.cssText = `
        aspect-ratio:1;display:flex;align-items:center;justify-content:center;
        border-radius:10px;font-size:1.5rem;cursor:${canClick?'pointer':'default'};
        background:${isWinCell?'rgba(0,245,200,.12)':'var(--sur2)'};
        border:1px solid ${isWinCell?'rgba(0,245,200,.5)':'var(--bdr2)'};
        transition:all .15s;user-select:none;
      `;

      if(cell === 'X')
        sq.innerHTML = '<span style="color:#ff6b35;text-shadow:0 0 12px rgba(255,107,53,.5)">✕</span>';
      else if(cell === 'O')
        sq.innerHTML = '<span style="color:#7c4dff;text-shadow:0 0 12px rgba(124,77,255,.5)">○</span>';

      if(canClick) {
        const hoverSymbol = game.mySymbol==='X'
          ? '<span style="color:rgba(255,107,53,.3)">✕</span>'
          : '<span style="color:rgba(124,77,255,.3)">○</span>';
        sq.addEventListener('mouseenter', () => {
          sq.style.background = 'var(--bdr)';
          if(!cell) sq.innerHTML = hoverSymbol;
        });
        sq.addEventListener('mouseleave', () => {
          sq.style.background = 'var(--sur2)';
          if(!cell) sq.innerHTML = '';
        });
        sq.addEventListener('click', () => {
          game.board[i] = game.mySymbol;
          game.myTurn   = false;
          const win = checkWinner(game.board);
          if(win) {
            game.done   = true;
            game.winner = win;
            if(win === 'draw') addScore('draw');
            else               addScore('win');
          }
          frodon.sendDM(peerId, PLUGIN_ID, {type:'move', gameId, cell:i});
          frodon.refreshPeerModal(peerId);
        });
      }
      grid.appendChild(sq);
    });
    container.appendChild(grid);

    // Action buttons row
    const btnRow = frodon.makeElement('div','plugin-actions-row');

    if(!game.done) {
      // Abandon
      const forfeitBtn = frodon.makeElement('button','plugin-action-btn','🏳 Abandonner');
      forfeitBtn.addEventListener('click', () => {
        game.done   = true;
        game.winner = game.mySymbol === 'X' ? 'O' : 'X';
        addScore('loss');
        frodon.sendDM(peerId, PLUGIN_ID, {type:'forfeit', gameId});
        frodon.refreshPeerModal(peerId);
      });
      btnRow.appendChild(forfeitBtn);
    } else {
      // Rematch
      const rematchBtn = frodon.makeElement('button','plugin-action-btn acc','🔄 Revanche');
      rematchBtn.addEventListener('click', () => {
        delete games[gameId];
        const newGid = 'ttc_' + Date.now();
        games[newGid] = newGame(peerId, 'X');
        frodon.sendDM(peerId, PLUGIN_ID, {type:'rematch', gameId:newGid});
        frodon.showToast('Demande de revanche envoyée !');
        frodon.refreshPeerModal(peerId);
      });
      btnRow.appendChild(rematchBtn);
    }
    container.appendChild(btnRow);
  }

  /* ──────────────────────────────────────────────────
     WIDGET PROFIL — scores & parties en cours
  ────────────────────────────────────────────────── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const wins   = store.get('wins')   || 0;
    const losses = store.get('losses') || 0;
    const draws  = store.get('draws')  || 0;
    const total  = wins + losses + draws;

    // Score board
    const board = frodon.makeElement('div','');
    board.style.cssText = 'display:flex;gap:0;border:1px solid var(--bdr2);border-radius:10px;overflow:hidden;margin-bottom:10px';
    [
      {icon:'🏆', val:wins,   lbl:'Victoires', color:'var(--ok)'},
      {icon:'😔', val:losses, lbl:'Défaites',  color:'var(--warn)'},
      {icon:'🤝', val:draws,  lbl:'Égalités',  color:'var(--txt2)'},
    ].forEach(({icon, val, lbl, color}, i) => {
      const cell = frodon.makeElement('div','');
      cell.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;
        gap:1px;padding:8px 4px;
        ${i<2?'border-right:1px solid var(--bdr2);':''}`;
      cell.innerHTML = `<span style="font-size:1rem">${icon}</span>
        <strong style="font-size:1.1rem;color:${color};font-family:var(--mono)">${val}</strong>
        <span style="font-size:.55rem;color:var(--txt2)">${lbl}</span>`;
      board.appendChild(cell);
    });
    container.appendChild(board);

    // Parties en cours
    const activeGames = Object.entries(games).filter(([,g]) => !g.done);
    if(activeGames.length) {
      container.appendChild(frodon.makeElement('div','section-label',`⊞ ${activeGames.length} partie(s) en cours`));
      activeGames.forEach(([gid, g]) => {
        const peer = frodon.getPeer(g.opponentId);
        const chip = frodon.makeElement('div','mini-card');
        chip.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';
        chip.innerHTML = `<span style="font-size:1.2rem">⊞</span>
          <div>
            <div style="font-size:.78rem;font-weight:700">${peer?.name || g.opponentId}</div>
            <div style="font-size:.62rem;color:var(--txt2);font-family:var(--mono)">
              ${g.myTurn ? '⌛ Votre tour' : '💬 Son tour'}
              &nbsp;·&nbsp; ${g.mySymbol}
            </div>
          </div>`;
        container.appendChild(chip);
      });
    } else if(total === 0) {
      const hint = frodon.makeElement('div','no-posts','Défiez un pair sur le radar pour commencer !');
      container.appendChild(hint);
    }
  });

  /* ──────────────────────────────────────────────────
     LIFECYCLE HOOKS
  ────────────────────────────────────────────────── */

  // Notify when a peer with an active game appears
  frodon.onPeerAppear(peer => {
    const gid = getGameId(peer.peerId);
    if(gid && !games[gid].done && !games[gid].myTurn) {
      frodon.showToast('⊞ ' + peer.name + ' est de retour — TicTacToe en attente');
    }
  });

  return {
    destroy() {
      // No external resources to clean up
    },
  };
});
