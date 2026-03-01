/**
 * FRODON PLUGIN — TicTacToe P2P  v2.2
 * Le plateau vit dans ⬡ SPHERE. focusPlugin() y amène le joueur.
 */
frodon.register({
  id:'tictactoe', name:'TicTacToe', version:'2.2.0',
  author:'frodon-community',
  description:'Défiez vos pairs à une partie de TicTacToe en P2P.',
  icon:'⊞',
}, () => {

  const PLUGIN_ID = 'tictactoe';
  const store = frodon.storage(PLUGIN_ID);
  const games = {};
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function newGame(opponentId, sym) {
    return {board:Array(9).fill(null),mySymbol:sym,opponentId,myTurn:sym==='X',done:false,winner:null};
  }
  function checkWinner(b) {
    for(const [a,c,d] of LINES) if(b[a]&&b[a]===b[c]&&b[a]===b[d]) return b[a];
    return b.every(Boolean)?'draw':null;
  }
  function getWinLine(b) {
    for(const l of LINES){const[a,c,d]=l;if(b[a]&&b[a]===b[c]&&b[a]===b[d])return l;} return null;
  }
  function getGameId(pid) { return Object.keys(games).find(g=>games[g].opponentId===pid); }

  function addScore(result, opponentId) {
    store.set('wins',  (store.get('wins') ||0)+(result==='win' ?1:0));
    store.set('losses',(store.get('losses')||0)+(result==='loss'?1:0));
    store.set('draws', (store.get('draws') ||0)+(result==='draw'?1:0));
    const hist = store.get('history')||[];
    const peer = frodon.getPeer(opponentId);
    hist.unshift({opponentId, name:peer?.name||opponentId,
      network:peer?.network||'', handle:peer?.handle||'', result, ts:Date.now()});
    if(hist.length>30) hist.length=30;
    store.set('history', hist);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    const {type, gameId} = payload;

    if(type === 'challenge') {
      const prev = getGameId(fromId); if(prev) delete games[prev];
      games[gameId] = newGame(fromId, 'O');
      const peer = frodon.getPeer(fromId);
      frodon.showToast('⊞ '+(peer?.name||'?')+' vous défie !');
      frodon.refreshSphereTab(PLUGIN_ID);
      frodon.refreshPeerModal(fromId);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 400);
    }

    if(type === 'move') {
      const game = games[gameId]; if(!game||game.done) return;
      game.board[payload.cell] = game.mySymbol==='X' ? 'O' : 'X';
      game.myTurn = true;
      const win = checkWinner(game.board);
      if(win) {
        game.done=true; game.winner=win;
        win==='draw' ? addScore('draw',game.opponentId) : addScore('loss',game.opponentId);
        const peer = frodon.getPeer(game.opponentId);
        frodon.showToast((win==='draw'?'🤝 Égalité':'😔 Défaite')+' contre '+(peer?.name||'?'));
      } else {
        frodon.showToast('⊞ À votre tour !');
        frodon.focusPlugin(PLUGIN_ID);
      }
      frodon.refreshSphereTab(PLUGIN_ID);
      frodon.refreshPeerModal(fromId);
    }

    if(type === 'forfeit') {
      const game = games[gameId]; if(!game) return;
      game.done=true; game.winner=game.mySymbol;
      addScore('win', game.opponentId);
      frodon.showToast('🏆 Victoire par abandon !');
      frodon.refreshSphereTab(PLUGIN_ID);
      frodon.refreshPeerModal(fromId);
    }

    if(type === 'rematch') {
      const prev = getGameId(fromId); if(prev) delete games[prev];
      games[gameId] = newGame(fromId, 'O');
      const peer = frodon.getPeer(fromId);
      frodon.showToast('⊞ Revanche de '+(peer?.name||'?')+' !');
      frodon.refreshSphereTab(PLUGIN_ID);
      frodon.refreshPeerModal(fromId);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 400);
    }
  });

  /* ── Fiche d'un pair — compact, jeu dans SPHERE ── */
  frodon.registerPeerAction(PLUGIN_ID, '⊞ TicTacToe', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;
    const gameId = getGameId(peerId);
    const game = gameId ? games[gameId] : null;

    if(!game) {
      const btn = frodon.makeElement('button','plugin-action-btn acc','⊞ Défier '+peerName);
      btn.addEventListener('click', () => {
        const gid = 'ttc_'+Date.now();
        games[gid] = newGame(peerId, 'X');
        // _label: shows in opponent's feed as a challenge notification
        frodon.sendDM(peerId, PLUGIN_ID, {type:'challenge', gameId:gid, _label:'⊞ Défi TicTacToe !'});
        frodon.showToast('Défi envoyé à '+peerName+' !');
        frodon.refreshPeerModal(peerId);
        frodon.refreshSphereTab(PLUGIN_ID);
        setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 200);
      });
      container.appendChild(btn);
      return;
    }

    // Game in progress — minimal status + "Ouvrir dans SPHERE"
    const st = frodon.makeElement('div','');
    st.style.cssText = 'font-family:var(--mono);font-size:.72rem;text-align:center;padding:6px 0 8px;color:var(--acc)';
    if(game.done) {
      const w = game.winner;
      st.textContent = w==='draw'?'🤝 Égalité':w===game.mySymbol?'🏆 Victoire !':'😔 Défaite';
    } else {
      st.textContent = game.myTurn ? '⌛ Votre tour' : '💬 Tour de '+peerName;
    }
    container.appendChild(st);

    // Mini read-only board
    const mini = frodon.makeElement('div','');
    mini.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:72px;margin:0 auto 8px';
    game.board.forEach(cell => {
      const sq = frodon.makeElement('div','');
      sq.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--sur2);border-radius:3px;font-size:.55rem';
      sq.innerHTML = cell==='X'?'<span style="color:#ff6b35">✕</span>':cell==='O'?'<span style="color:#7c4dff">○</span>':'';
      mini.appendChild(sq);
    });
    container.appendChild(mini);

    if(!game.done) {
      const go = frodon.makeElement('button','plugin-action-btn acc','▶ Jouer dans SPHERE');
      go.addEventListener('click', () => frodon.focusPlugin(PLUGIN_ID));
      container.appendChild(go);
    } else {
      const rem = frodon.makeElement('button','plugin-action-btn','🔄 Revanche');
      rem.addEventListener('click', () => {
        delete games[gameId];
        const gid = 'ttc_'+Date.now();
        games[gid] = newGame(peerId, 'X');
        frodon.sendDM(peerId, PLUGIN_ID, {type:'rematch', gameId:gid, _label:'⊞ Revanche TicTacToe !'});
        frodon.refreshPeerModal(peerId);
        frodon.refreshSphereTab(PLUGIN_ID);
        setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 200);
      });
      container.appendChild(rem);
    }
  });

  /* ── Panneau SPHERE — le vrai jeu ── */
  frodon.registerBottomPanel(PLUGIN_ID, [

    { id:'games', label:'⊞ Parties',
      render(container) {
        const active = Object.entries(games).filter(([,g]) => !g.done);
        const done   = Object.entries(games).filter(([,g]) =>  g.done);

        if(!active.length && !done.length) {
          const em = frodon.makeElement('div','');
          em.style.cssText = 'text-align:center;padding:22px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML = '<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">⊞</div>Aucune partie.<br><small style="color:var(--txt3)">Cliquez sur un pair → Défier</small>';
          container.appendChild(em); return;
        }

        [...active, ...done].forEach(([gameId, game]) => {
          const peer = frodon.getPeer(game.opponentId);
          const peerName = peer?.name || game.opponentId;
          const card = frodon.makeElement('div','');
          card.style.cssText = 'background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:6px 8px 0;overflow:hidden';

          const hdr = frodon.makeElement('div','');
          hdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bdr)';
          const inf = frodon.makeElement('div',''); inf.style.cssText = 'flex:1;min-width:0';
          inf.innerHTML = '<div style="font-size:.76rem;font-weight:700;color:var(--txt)">'+peerName+'</div>'
            +'<div style="font-size:.58rem;color:'+(game.myTurn&&!game.done?'var(--acc)':'var(--txt2)')+';font-family:var(--mono);margin-top:1px">'
            +(game.done ? (game.winner==='draw'?'🤝 Égalité':game.winner===game.mySymbol?'🏆 Victoire !':'😔 Défaite') : (game.myTurn?'⌛ Votre tour':'💬 Tour de '+peerName))
            +' · '+(game.mySymbol==='X'?'✕':'○')+'</div>';
          hdr.appendChild(Object.assign(frodon.makeElement('span',''),{textContent:'⊞',style:{fontSize:'1rem',flexShrink:'0'}}));
          hdr.appendChild(inf);
          card.appendChild(hdr);

          const bw = frodon.makeElement('div',''); bw.style.cssText = 'padding:10px';
          const winLine = getWinLine(game.board);
          const grid = frodon.makeElement('div','');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;max-width:190px;margin:0 auto 10px';
          game.board.forEach((cell, i) => {
            const isWin = winLine?.includes(i);
            const canPlay = !cell && game.myTurn && !game.done;
            const sq = frodon.makeElement('div','');
            sq.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:1.3rem;'
              +'cursor:'+(canPlay?'pointer':'default')+';'
              +'background:'+(isWin?'rgba(0,245,200,.1)':'var(--sur2)')+';'
              +'border:1.5px solid '+(isWin?'rgba(0,245,200,.45)':'var(--bdr2)')+';transition:all .1s;user-select:none';
            if(cell==='X') sq.innerHTML = '<span style="color:#ff6b35;text-shadow:0 0 8px rgba(255,107,53,.4)">✕</span>';
            else if(cell==='O') sq.innerHTML = '<span style="color:#7c4dff;text-shadow:0 0 8px rgba(124,77,255,.4)">○</span>';
            const hSym = game.mySymbol==='X'
              ?'<span style="color:rgba(255,107,53,.25)">✕</span>'
              :'<span style="color:rgba(124,77,255,.25)">○</span>';
            if(canPlay) {
              sq.addEventListener('mouseenter', () => { sq.style.background='var(--bdr)'; if(!cell) sq.innerHTML=hSym; });
              sq.addEventListener('mouseleave', () => { sq.style.background='var(--sur2)'; if(!cell) sq.innerHTML=''; });
              sq.addEventListener('click', () => {
                game.board[i] = game.mySymbol; game.myTurn = false;
                const win = checkWinner(game.board);
                if(win) { game.done=true; game.winner=win; win==='draw'?addScore('draw',game.opponentId):addScore('win',game.opponentId); }
                // move DM is silent (it's game protocol, not a user-facing event)
                frodon.sendDM(game.opponentId, PLUGIN_ID, {type:'move', gameId, cell:i, _silent:true});
                frodon.refreshSphereTab(PLUGIN_ID);
                frodon.refreshPeerModal(game.opponentId);
              });
            }
            grid.appendChild(sq);
          });
          bw.appendChild(grid);

          const me = frodon.getMyProfile();
          const pl = frodon.makeElement('div','');
          pl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:.64rem;font-family:var(--mono);margin-bottom:8px;padding:0 2px';
          const mkP = (n,s,act) => {
            const p = frodon.makeElement('div','');
            p.style.cssText = 'display:flex;align-items:center;gap:3px;padding:2px 7px;border-radius:6px;'
              +'border:1px solid '+(act?'rgba(0,245,200,.4)':'var(--bdr)')+';color:'+(act?'var(--acc)':'var(--txt2)');
            p.innerHTML = (s==='X'?'<span style="color:#ff6b35">✕</span>':'<span style="color:#7c4dff">○</span>')+' '+n.substring(0,11);
            return p;
          };
          pl.appendChild(mkP(me.name, game.mySymbol, !game.done&&game.myTurn));
          pl.appendChild(frodon.makeElement('span','','vs'));
          pl.appendChild(mkP(peerName, game.mySymbol==='X'?'O':'X', !game.done&&!game.myTurn));
          bw.appendChild(pl);

          const btnRow = frodon.makeElement('div','plugin-actions-row');
          if(!game.done) {
            const f = frodon.makeElement('button','plugin-action-btn','🏳 Abandonner');
            f.style.fontSize = '.68rem';
            f.addEventListener('click', () => {
              game.done=true; game.winner=game.mySymbol==='X'?'O':'X';
              addScore('loss', game.opponentId);
              // forfeit is silent — toast on their side handles it
              frodon.sendDM(game.opponentId, PLUGIN_ID, {type:'forfeit', gameId, _silent:true});
              frodon.refreshSphereTab(PLUGIN_ID);
              frodon.refreshPeerModal(game.opponentId);
            });
            btnRow.appendChild(f);
          } else {
            const r = frodon.makeElement('button','plugin-action-btn acc','🔄 Revanche');
            r.style.fontSize = '.68rem';
            r.addEventListener('click', () => {
              delete games[gameId];
              const gid = 'ttc_'+Date.now();
              games[gid] = newGame(game.opponentId, 'X');
              frodon.sendDM(game.opponentId, PLUGIN_ID, {type:'rematch', gameId:gid, _label:'⊞ Revanche TicTacToe !'});
              frodon.refreshSphereTab(PLUGIN_ID);
              frodon.refreshPeerModal(game.opponentId);
            });
            btnRow.appendChild(r);
          }
          bw.appendChild(btnRow);
          card.appendChild(bw);
          container.appendChild(card);
        });
      }
    },

    { id:'scores', label:'🏆 Scores',
      render(container) {
        const wins=store.get('wins')||0, losses=store.get('losses')||0, draws=store.get('draws')||0;
        const total = wins+losses+draws;
        if(!total) {
          container.innerHTML = '<div style="text-align:center;padding:22px 14px;color:var(--txt2);font-size:.72rem"><div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏆</div>Jouez votre première partie !</div>';
          return;
        }
        const sb = frodon.makeElement('div','');
        sb.style.cssText = 'display:flex;border:1px solid var(--bdr2);border-radius:10px;overflow:hidden;margin:8px';
        [['🏆',wins,'Victoires','var(--ok)'],['😔',losses,'Défaites','var(--warn)'],['🤝',draws,'Égalités','var(--txt2)']].forEach(([ico,n,lbl,col],i) => {
          const c = frodon.makeElement('div','');
          c.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:10px 3px;'+(i<2?'border-right:1px solid var(--bdr2)':'');
          c.innerHTML = '<span style="font-size:1rem">'+ico+'</span><strong style="font-size:1.2rem;color:'+col+';font-family:var(--mono)">'+n+'</strong><span style="font-size:.52rem;color:var(--txt2)">'+lbl+'</span>';
          sb.appendChild(c);
        });
        container.appendChild(sb);

        const rate = Math.round(wins/total*100);
        const bw = frodon.makeElement('div',''); bw.style.cssText = 'margin:0 8px 12px';
        bw.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-bottom:3px"><span>Taux de victoire</span><span style="color:var(--ok)">'+rate+'%</span></div>'
          +'<div style="height:5px;background:var(--sur2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+rate+'%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:4px"></div></div>'
          +'<div style="font-size:.55rem;color:var(--txt2);font-family:var(--mono);margin-top:3px;text-align:center">'+total+' partie'+(total>1?'s':'')+' jouée'+(total>1?'s':'')+'</div>';
        container.appendChild(bw);

        const hist = store.get('history')||[];
        if(!hist.length) return;
        const lbl = frodon.makeElement('div','section-label','Historique récent');
        lbl.style.cssText = 'margin:0 8px 6px;font-size:.55rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px';
        container.appendChild(lbl);
        hist.slice(0,12).forEach(h => {
          const peer = frodon.getPeer(h.opponentId);
          const name = peer?.name || h.name || '?';
          const isWin=h.result==='win', isDraw=h.result==='draw';
          const row = frodon.makeElement('div','');
          row.style.cssText = 'display:flex;align-items:center;gap:7px;padding:5px 10px;border-bottom:1px solid var(--bdr)';
          row.innerHTML = '<span style="font-size:.85rem">'+(isDraw?'🤝':isWin?'🏆':'😔')+'</span>';
          const inf = frodon.makeElement('div',''); inf.style.cssText = 'flex:1;min-width:0';
          const nameEl = frodon.makeElement('div','');
          nameEl.style.cssText = 'font-size:.72rem;font-weight:700;color:var(--txt)';
          nameEl.textContent = name;
          const ts = frodon.makeElement('div','', frodon.formatTime(h.ts));
          ts.style.cssText = 'font-size:.56rem;color:var(--txt2);font-family:var(--mono)';
          inf.appendChild(nameEl); inf.appendChild(ts);
          row.appendChild(inf);
          const res = frodon.makeElement('span','', isDraw?'Éga.':isWin?'Vic.':'Déf.');
          res.style.cssText = 'font-size:.58rem;color:'+(isDraw?'var(--txt2)':isWin?'var(--ok)':'var(--warn)')+';font-family:var(--mono)';
          row.appendChild(res);
          container.appendChild(row);
        });
      }
    },
  ]);

  frodon.onPeerAppear(peer => {
    const gid = getGameId(peer.peerId);
    if(gid && !games[gid].done && !games[gid].myTurn)
      frodon.showToast('⊞ '+peer.name+' est de retour');
  });

  // Auto-challenge when installed from a peer's profile
  frodon.registerPeerInstallHook(PLUGIN_ID, (peerId) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;
    const gid = 'ttc_'+Date.now();
    games[gid] = newGame(peerId, 'X');
    frodon.sendDM(peerId, PLUGIN_ID, {type:'challenge', gameId:gid, _label:'⊞ Défi TicTacToe !'});
    frodon.showToast('⊞ Défi envoyé à '+peerName+' !');
    frodon.refreshSphereTab(PLUGIN_ID);
    setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
  });

  return { destroy() {} };
});
