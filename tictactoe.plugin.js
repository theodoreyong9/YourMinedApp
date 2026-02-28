/**
 * ╔══════════════════════════════════════════════════╗
 * ║   FRODON PLUGIN — TicTacToe P2P  v2.0            ║
 * ║   Le jeu se joue dans l'onglet ⬡ SPHERE          ║
 * ╚══════════════════════════════════════════════════╝
 */

frodon.register({
  id          : 'tictactoe',
  name        : 'TicTacToe',
  version     : '2.0.0',
  author      : 'frodon-community',
  description : 'Défiez vos pairs à une partie de TicTacToe en P2P.',
  icon        : '⊞',
}, () => {

  const PLUGIN_ID = 'tictactoe';
  const store     = frodon.storage(PLUGIN_ID);
  const games     = {};

  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function newGame(opponentId, mySymbol) {
    return { board:Array(9).fill(null), mySymbol, opponentId,
             myTurn:mySymbol==='X', done:false, winner:null, startedAt:Date.now() };
  }

  function checkWinner(board) {
    for(const [a,b,c] of LINES)
      if(board[a] && board[a]===board[b] && board[a]===board[c]) return board[a];
    return board.every(Boolean) ? 'draw' : null;
  }

  function getWinLine(board) {
    for(const l of LINES) { const [a,b,c]=l; if(board[a]&&board[a]===board[b]&&board[a]===board[c]) return l; }
    return null;
  }

  function getGameId(peerId) {
    return Object.keys(games).find(gid => games[gid].opponentId === peerId);
  }

  /* ── Score helpers ── */
  function addScore(result, opponentId) {
    store.set('wins',   (store.get('wins')  ||0)+(result==='win' ?1:0));
    store.set('losses', (store.get('losses')||0)+(result==='loss'?1:0));
    store.set('draws',  (store.get('draws') ||0)+(result==='draw'?1:0));
    const key='vs_'+opponentId;
    const vs=store.get(key)||{wins:0,losses:0,draws:0,name:'?'};
    const peer=frodon.getPeer(opponentId);
    if(peer?.name) vs.name=peer.name;
    vs[result==='win'?'wins':result==='loss'?'losses':'draws']++;
    store.set(key, vs);
    const hist=store.get('history')||[];
    hist.unshift({opponentId, opponentName:peer?.name||opponentId,
                  opponentNetwork:peer?.network||'', opponentHandle:peer?.handle||'',
                  result, ts:Date.now()});
    if(hist.length>30) hist.length=30;
    store.set('history', hist);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    const {type, gameId} = payload;
    if(type==='challenge') {
      const prev=getGameId(fromId); if(prev) delete games[prev];
      games[gameId]=newGame(fromId,'O');
      const peer=frodon.getPeer(fromId);
      frodon.showToast('⊞ '+(peer?.name||'Un pair')+' vous défie ! → onglet SPHERE');
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshPeerModal(fromId);
    }
    if(type==='move') {
      const game=games[gameId]; if(!game||game.done) return;
      game.board[payload.cell]=game.mySymbol==='X'?'O':'X';
      game.myTurn=true;
      const win=checkWinner(game.board);
      if(win) {
        game.done=true; game.winner=win;
        if(win==='draw') addScore('draw',game.opponentId);
        else addScore('loss',game.opponentId);
        const peer=frodon.getPeer(game.opponentId);
        frodon.showToast((win==='draw'?'🤝 Égalité':'😔 Défaite')+' contre '+(peer?.name||'?'));
      } else { frodon.showToast('⊞ À votre tour !'); }
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshPeerModal(fromId);
    }
    if(type==='forfeit') {
      const game=games[gameId]; if(!game) return;
      game.done=true; game.winner=game.mySymbol;
      addScore('win',game.opponentId);
      const peer=frodon.getPeer(fromId);
      frodon.showToast('🏆 '+(peer?.name||'Adversaire')+' a abandonné. Victoire !');
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshPeerModal(fromId);
    }
    if(type==='rematch') {
      const prev=getGameId(fromId); if(prev) delete games[prev];
      games[gameId]=newGame(fromId,'O');
      const peer=frodon.getPeer(fromId);
      frodon.showToast('⊞ Revanche de '+(peer?.name||'?')+' → SPHERE');
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshPeerModal(fromId);
    }
  });

  /* ── Peer modal : juste défier / voir état / stats vs ── */
  frodon.registerPeerAction(PLUGIN_ID, '⊞ TicTacToe', (peerId, container) => {
    const peer=frodon.getPeer(peerId);
    const peerName=peer?.name||peerId;
    const gameId=getGameId(peerId);
    const game=gameId?games[gameId]:null;

    const vsStats = (label) => {
      const vs=store.get('vs_'+peerId); if(!vs) return;
      const note=frodon.makeElement('div','');
      note.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);margin-top:10px;text-align:center';
      note.textContent=label;
      container.appendChild(note);
      const row=frodon.makeElement('div','');
      row.style.cssText='display:flex;gap:7px;margin-top:5px';
      [['🏆',vs.wins,'V','var(--ok)'],['😔',vs.losses,'D','var(--warn)'],['🤝',vs.draws,'E','var(--txt2)']].forEach(([ico,n,l,col])=>{
        const c=frodon.makeElement('div','');
        c.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 4px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:8px';
        c.innerHTML=ico+'<strong style="color:'+col+';font-family:var(--mono)">'+n+'</strong><span style="font-size:.52rem;color:var(--txt2)">'+l+'</span>';
        row.appendChild(c);
      });
      container.appendChild(row);
    };

    if(!game) {
      const btn=frodon.makeElement('button','plugin-action-btn acc','⊞ Défier '+peerName);
      btn.addEventListener('click', ()=>{
        const gid='ttc_'+Date.now();
        games[gid]=newGame(peerId,'X');
        frodon.sendDM(peerId,PLUGIN_ID,{type:'challenge',gameId:gid});
        frodon.showToast('Défi envoyé !');
        frodon.refreshPeerModal(peerId); frodon.refreshSphereTab(PLUGIN_ID);
        frodon.focusPlugin(PLUGIN_ID);
      });
      container.appendChild(btn);
      vsStats('Votre historique contre '+peerName);
      return;
    }

    // Mini board preview
    const mini=frodon.makeElement('div','');
    mini.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:3px;max-width:84px;margin:0 auto 8px';
    game.board.forEach(cell=>{
      const sq=frodon.makeElement('div','');
      sq.style.cssText='aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--sur2);border-radius:3px;font-size:.6rem';
      sq.innerHTML=cell==='X'?'<span style="color:#ff6b35">✕</span>':cell==='O'?'<span style="color:#7c4dff">○</span>':'';
      mini.appendChild(sq);
    });
    container.appendChild(mini);

    const statusEl=frodon.makeElement('div','');
    statusEl.style.cssText='text-align:center;font-family:var(--mono);font-size:.73rem;color:var(--acc);margin-bottom:8px';
    if(game.done){
      const w=game.winner;
      statusEl.textContent=w==='draw'?'🤝 Égalité':w===game.mySymbol?'🏆 Victoire':'😔 '+peerName+' a gagné';
    } else {
      statusEl.textContent=game.myTurn?'⌛ Votre tour':'💬 Tour de '+peerName;
    }
    container.appendChild(statusEl);

    if(!game.done) {
      const go=frodon.makeElement('button','plugin-action-btn acc','▶ Jouer dans SPHERE');
      go.addEventListener('click',()=>frodon.focusPlugin(PLUGIN_ID));
      container.appendChild(go);
    } else {
      const rem=frodon.makeElement('button','plugin-action-btn','🔄 Revanche');
      rem.addEventListener('click',()=>{
        delete games[gameId];
        const gid='ttc_'+Date.now(); games[gid]=newGame(peerId,'X');
        frodon.sendDM(peerId,PLUGIN_ID,{type:'rematch',gameId:gid});
        frodon.refreshPeerModal(peerId); frodon.refreshSphereTab(PLUGIN_ID);
        frodon.focusPlugin(PLUGIN_ID);
      });
      container.appendChild(rem);
    }
    vsStats('Historique contre '+peerName);
  });

  /* ── Bottom panel ── */
  frodon.registerBottomPanel(PLUGIN_ID, [

    /* TAB 1 : Parties en cours — jeu interactif */
    {
      id:'games', label:'⊞ Parties en cours',
      render(container) {
        const active=Object.entries(games).filter(([,g])=>!g.done);
        if(!active.length) {
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:28px 16px;color:var(--txt2);font-size:.78rem;line-height:2';
          em.innerHTML='<div style="font-size:2rem;opacity:.25;margin-bottom:8px">⊞</div>Aucune partie en cours.<br><small style="color:var(--txt3)">Cliquez sur un pair dans le radar pour le défier.</small>';
          container.appendChild(em); return;
        }
        active.forEach(([gameId,game])=>{
          const peer=frodon.getPeer(game.opponentId);
          const peerName=peer?.name||game.opponentId;
          const vs=store.get('vs_'+game.opponentId);

          const card=frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:12px;margin:8px 10px 0;overflow:hidden';

          // Header
          const hdr=frodon.makeElement('div','');
          hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--bdr)';
          const inf=frodon.makeElement('div',''); inf.style.cssText='flex:1;min-width:0';
          inf.innerHTML='<div style="font-size:.82rem;font-weight:700;color:var(--txt)">'+peerName+'</div>'
            +'<div style="font-size:.62rem;color:'+(game.myTurn?'var(--acc)':'var(--txt2)')+';font-family:var(--mono);margin-top:1px">'
            +(game.myTurn?'⌛ Votre tour':'💬 Tour de '+peerName)
            +' &nbsp;·&nbsp; Vous jouez '+(game.mySymbol==='X'?'✕':'○')+'</div>';
          hdr.appendChild(Object.assign(frodon.makeElement('span',''),'⊞'&&{textContent:'⊞',style:{fontSize:'1.1rem',flexShrink:'0'}}));
          hdr.appendChild(inf);
          if(vs) {
            const badge=frodon.makeElement('div','');
            badge.style.cssText='font-size:.6rem;font-family:var(--mono);color:var(--txt2);text-align:right;flex-shrink:0;line-height:1.5';
            badge.innerHTML='<span style="color:var(--ok)">'+vs.wins+'V</span> <span style="color:var(--warn)">'+vs.losses+'D</span> <span>'+vs.draws+'E</span>';
            hdr.appendChild(badge);
          }
          card.appendChild(hdr);

          // Board
          const bw=frodon.makeElement('div',''); bw.style.cssText='padding:14px 12px';
          const winLine=getWinLine(game.board);
          const grid=frodon.makeElement('div','');
          grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:7px;max-width:220px;margin:0 auto 12px';

          game.board.forEach((cell,i)=>{
            const isWin=winLine?.includes(i);
            const canPlay=!cell&&game.myTurn&&!game.done;
            const sq=frodon.makeElement('div','');
            sq.style.cssText='aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:1.5rem;'
              +'cursor:'+(canPlay?'pointer':'default')+';background:'+(isWin?'rgba(0,245,200,.12)':'var(--sur2)')
              +';border:1.5px solid '+(isWin?'rgba(0,245,200,.5)':'var(--bdr2)')+';transition:all .12s;user-select:none';
            if(cell==='X') sq.innerHTML='<span style="color:#ff6b35;text-shadow:0 0 10px rgba(255,107,53,.45)">✕</span>';
            else if(cell==='O') sq.innerHTML='<span style="color:#7c4dff;text-shadow:0 0 10px rgba(124,77,255,.45)">○</span>';
            const hSym=game.mySymbol==='X'?'<span style="color:rgba(255,107,53,.3)">✕</span>':'<span style="color:rgba(124,77,255,.3)">○</span>';
            if(canPlay) {
              sq.addEventListener('mouseenter',()=>{sq.style.background='var(--bdr)';if(!cell)sq.innerHTML=hSym;});
              sq.addEventListener('mouseleave',()=>{sq.style.background='var(--sur2)';if(!cell)sq.innerHTML='';});
              sq.addEventListener('click',()=>{
                game.board[i]=game.mySymbol; game.myTurn=false;
                const win=checkWinner(game.board);
                if(win){game.done=true;game.winner=win;win==='draw'?addScore('draw',game.opponentId):addScore('win',game.opponentId);}
                frodon.sendDM(game.opponentId,PLUGIN_ID,{type:'move',gameId,cell:i});
                frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshPeerModal(game.opponentId);
              });
            }
            grid.appendChild(sq);
          });
          bw.appendChild(grid);

          // Players
          const me=frodon.getMyProfile();
          const pl=frodon.makeElement('div','');
          pl.style.cssText='display:flex;justify-content:space-between;align-items:center;font-size:.7rem;font-family:var(--mono);margin-bottom:10px;padding:0 4px';
          const mkP=(name,sym,active)=>{const p=frodon.makeElement('div','');p.style.cssText='display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:7px;border:1px solid '+(active?'rgba(0,245,200,.4)':'var(--bdr)')+';color:'+(active?'var(--acc)':'var(--txt2)');p.innerHTML=(sym==='X'?'<span style="color:#ff6b35">✕</span>':'<span style="color:#7c4dff">○</span>')+' '+name.substring(0,12);return p;};
          pl.appendChild(mkP(me.name,game.mySymbol,!game.done&&game.myTurn));
          pl.appendChild(frodon.makeElement('span','','vs'));
          pl.appendChild(mkP(peerName,game.mySymbol==='X'?'O':'X',!game.done&&!game.myTurn));
          bw.appendChild(pl);

          // Result + buttons
          if(game.done) {
            const w=game.winner;
            const res=frodon.makeElement('div','');
            res.style.cssText='text-align:center;padding:4px 0 8px;font-family:var(--mono);font-size:.82rem;color:var(--acc)';
            res.textContent=w==='draw'?'🤝 Égalité !':w===game.mySymbol?'🏆 Victoire !':'😔 '+peerName+' a gagné';
            bw.insertBefore(res,pl);
          }
          const btnRow=frodon.makeElement('div','plugin-actions-row');
          if(!game.done){
            const f=frodon.makeElement('button','plugin-action-btn','🏳 Abandonner');
            f.addEventListener('click',()=>{game.done=true;game.winner=game.mySymbol==='X'?'O':'X';addScore('loss',game.opponentId);frodon.sendDM(game.opponentId,PLUGIN_ID,{type:'forfeit',gameId});frodon.refreshSphereTab(PLUGIN_ID);frodon.refreshPeerModal(game.opponentId);});
            btnRow.appendChild(f);
          } else {
            const r=frodon.makeElement('button','plugin-action-btn acc','🔄 Revanche');
            r.addEventListener('click',()=>{delete games[gameId];const gid='ttc_'+Date.now();games[gid]=newGame(game.opponentId,'X');frodon.sendDM(game.opponentId,PLUGIN_ID,{type:'rematch',gameId:gid});frodon.refreshSphereTab(PLUGIN_ID);frodon.refreshPeerModal(game.opponentId);});
            btnRow.appendChild(r);
          }
          bw.appendChild(btnRow);
          card.appendChild(bw);
          container.appendChild(card);
        });
      }
    },

    /* TAB 2 : Scores & historique */
    {
      id:'scores', label:'🏆 Scores',
      render(container) {
        const wins=store.get('wins')||0, losses=store.get('losses')||0, draws=store.get('draws')||0;
        const total=wins+losses+draws;

        // Scoreboard global
        const sb=frodon.makeElement('div','');
        sb.style.cssText='display:flex;border:1px solid var(--bdr2);border-radius:12px;overflow:hidden;margin:10px';
        [['🏆',wins,'Victoires','var(--ok)'],['😔',losses,'Défaites','var(--warn)'],['🤝',draws,'Égalités','var(--txt2)']].forEach(([ico,n,lbl,col],i)=>{
          const c=frodon.makeElement('div','');
          c.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:14px 4px;'+(i<2?'border-right:1px solid var(--bdr2)':'');
          c.innerHTML='<span style="font-size:1.2rem">'+ico+'</span><strong style="font-size:1.4rem;color:'+col+';font-family:var(--mono)">'+n+'</strong><span style="font-size:.55rem;color:var(--txt2)">'+lbl+'</span>';
          sb.appendChild(c);
        });
        container.appendChild(sb);

        if(total>0){
          const rate=Math.round(wins/total*100);
          const bw=frodon.makeElement('div',''); bw.style.cssText='margin:0 10px 14px';
          bw.innerHTML='<div style="display:flex;justify-content:space-between;font-size:.6rem;color:var(--txt2);font-family:var(--mono);margin-bottom:4px"><span>Taux de victoire</span><span style="color:var(--ok)">'+rate+'%</span></div>'
            +'<div style="height:6px;background:var(--sur2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+rate+'%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:4px"></div></div>'
            +'<div style="font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-top:4px;text-align:center">'+total+' partie'+(total>1?'s':'')+' jouée'+(total>1?'s':'')+'</div>';
          container.appendChild(bw);
        }

        // Per-opponent scores
        const lbl1=frodon.makeElement('div','section-label','Scores par adversaire');
        lbl1.style.cssText='margin:0 10px 7px;font-size:.58rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px';
        container.appendChild(lbl1);

        const vsKeys=[];
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(k&&k.startsWith('frd_plug_tictactoe_vs_')) vsKeys.push(k.replace('frd_plug_tictactoe_',''));
        }

        if(!vsKeys.length){
          container.appendChild(frodon.makeElement('div','no-posts',"Pas encore joué contre quelqu'un."));
        } else {
          vsKeys.forEach(vsKey=>{
            const vs=store.get(vsKey); if(!vs) return;
            const peerId=vsKey.replace('vs_','');
            const peer=frodon.getPeer(peerId);
            const name=peer?.name||vs.name||'Pair inconnu';
            const NETS=window.NETS;
            const net=peer?.network&&NETS?.[peer.network]?NETS[peer.network]:null;

            const row=frodon.makeElement('div','');
            row.style.cssText='display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--sur);border:1px solid var(--bdr);border-radius:9px;margin:0 10px 6px';
            const av=frodon.makeElement('div','');
            av.style.cssText='width:32px;height:32px;border-radius:50%;background:var(--sur2);border:1px solid var(--bdr2);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:var(--acc);flex-shrink:0';
            av.textContent=(name[0]||'?').toUpperCase();
            if(peer?.avatar){const img=document.createElement('img');img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';img.src=peer.avatar;av.innerHTML='';av.appendChild(img);}

            const inf=frodon.makeElement('div',''); inf.style.cssText='flex:1;min-width:0';
            const nameEl=frodon.makeElement('div','');
            nameEl.style.cssText='font-size:.8rem;font-weight:700';
            if(net&&peer?.handle){
              const a=document.createElement('a');
              a.href=net.profileUrl(peer.handle);a.target='_blank';a.rel='noopener noreferrer';
              a.textContent=name;a.style.cssText='color:var(--acc2);text-decoration:none';
              a.addEventListener('mouseenter',()=>a.style.textDecoration='underline');
              a.addEventListener('mouseleave',()=>a.style.textDecoration='none');
              nameEl.appendChild(a);
            } else { nameEl.textContent=name; }
            inf.appendChild(nameEl);

            const vsLine=frodon.makeElement('div','');
            vsLine.style.cssText='display:flex;gap:5px;margin-top:3px;font-family:var(--mono);font-size:.62rem';
            [['🏆',vs.wins,'var(--ok)'],['😔',vs.losses,'var(--warn)'],['🤝',vs.draws,'var(--txt2)']].forEach(([ico,n,col])=>{
              const s=frodon.makeElement('span','');s.style.color=col;s.textContent=ico+n;vsLine.appendChild(s);
            });
            const tot=vs.wins+vs.losses+vs.draws;
            const ts=frodon.makeElement('span','');ts.style.cssText='color:var(--txt3);margin-left:4px';ts.textContent=tot+'p.';vsLine.appendChild(ts);
            inf.appendChild(vsLine);
            row.appendChild(av);row.appendChild(inf);
            container.appendChild(row);
          });
        }

        // Match history
        const hist=store.get('history')||[];
        if(hist.length){
          const lbl2=frodon.makeElement('div','section-label','Historique récent');
          lbl2.style.cssText='margin:12px 10px 7px;font-size:.58rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px';
          container.appendChild(lbl2);

          hist.slice(0,15).forEach(h=>{
            const peer=frodon.getPeer(h.opponentId);
            const name=peer?.name||h.opponentName||'Pair inconnu';
            const NETS=window.NETS;
            const net=(h.opponentNetwork||peer?.network)&&NETS?.[peer?.network||h.opponentNetwork]?NETS[peer?.network||h.opponentNetwork]:null;
            const handle=peer?.handle||h.opponentHandle||'';
            const isWin=h.result==='win',isDraw=h.result==='draw';

            const c=frodon.makeElement('div','');
            c.style.cssText='display:flex;align-items:center;gap:9px;padding:7px 12px;border-bottom:1px solid var(--bdr)';
            c.innerHTML='<span style="font-size:1rem">'+(isDraw?'🤝':isWin?'🏆':'😔')+'</span>';
            const inf=frodon.makeElement('div','');inf.style.cssText='flex:1;min-width:0';
            const nameEl=frodon.makeElement('div','');
            nameEl.style.cssText='font-size:.78rem;font-weight:700';
            if(net&&handle){
              const a=document.createElement('a');
              a.href=net.profileUrl(handle);a.target='_blank';a.rel='noopener noreferrer';
              a.textContent=name;a.style.cssText='color:var(--acc2);text-decoration:none';
              nameEl.appendChild(a);
            } else { nameEl.textContent=name; nameEl.style.color='var(--txt)'; }
            const ts=frodon.makeElement('div','',frodon.formatTime(h.ts));
            ts.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono)';
            inf.appendChild(nameEl);inf.appendChild(ts);
            c.appendChild(inf);
            const res=frodon.makeElement('span','',isDraw?'Égalité':isWin?'Victoire':'Défaite');
            res.style.cssText='font-size:.62rem;color:'+(isDraw?'var(--txt2)':isWin?'var(--ok)':'var(--warn)')+';font-family:var(--mono)';
            c.appendChild(res);
            container.appendChild(c);
          });
        }

        if(total===0&&!hist.length){
          container.innerHTML='<div style="text-align:center;padding:28px 16px;color:var(--txt2);font-size:.78rem"><div style="font-size:2rem;opacity:.25;margin-bottom:8px">🏆</div>Jouez votre première partie !</div>';
        }
      }
    },
  ]);

  frodon.onPeerAppear(peer=>{
    const gid=getGameId(peer.peerId);
    if(gid&&!games[gid].done&&!games[gid].myTurn)
      frodon.showToast('⊞ '+peer.name+' est de retour — votre partie attend dans SPHERE');
  });

  return { destroy(){} };
});
