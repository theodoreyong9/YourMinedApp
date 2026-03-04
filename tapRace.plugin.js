frodon.register({
  id: 'tap-race',
  name: 'Tap Race',
  version: '2.0.0',
  author: 'frodon-community',
  description: 'Course de tap : tapez sur la photo de votre adversaire pendant 10 secondes !',
  icon: '👆',
}, () => {

  const PLUGIN_ID = 'tap-race';
  const store = frodon.storage(PLUGIN_ID);

  // État en mémoire
  let game    = null;
  let pending = null;

  /* ─────────────────── Helpers ─────────────────── */
  function cleanGame() {
    if (game?.timerTO) clearTimeout(game.timerTO);
    if (game?.cdIV)    clearInterval(game.cdIV);
    game = null;
  }

  function newGame(peerId, peerName, peerAvatar) {
    cleanGame();
    game = { peerId, peerName, peerAvatar, myScore:0, theirScore:0,
             phase:'waiting_accept', timerTO:null, cdIV:null };
  }

  /* ─────────────────── DM handler ─────────────────── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if (payload.type === 'challenge') {
      // Refuser silencieusement si déjà en partie
      if (game && game.phase !== 'result') {
        frodon.sendDM(fromId, PLUGIN_ID, { type:'decline', reason:'busy', _silent:true });
        return;
      }
      const peer = frodon.getPeer(fromId);
      pending = { fromId, fromName: peer?.name || payload.fromName || 'Pair inconnu',
                  fromAvatar: peer?.avatar || payload.fromAvatar || '' };
      frodon.showToast('👆 Défi Tap Race de ' + pending.fromName + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      return;
    }

    if (payload.type === 'accept') {
      if (!game || game.phase !== 'waiting_accept') return;
      startCountdown();
      return;
    }

    if (payload.type === 'decline') {
      if (game) {
        const name = game.peerName;
        cleanGame();
        frodon.showToast('👆 ' + name + ' ' + (payload.reason === 'busy' ? 'est déjà en partie.' : 'a refusé le défi.'));
        frodon.refreshSphereTab(PLUGIN_ID);
      }
      return;
    }

    if (payload.type === 'tap') {
      if (game && game.phase === 'playing') {
        game.theirScore = payload.score;
        // Mise à jour DOM directe si possible
        const el = document.getElementById('tap-their-score');
        if (el) el.textContent = game.theirScore;
      }
      return;
    }

    if (payload.type === 'result') {
      if (game && game.phase === 'playing') {
        game.theirScore = payload.score;
        endGame();
      }
      return;
    }
  });

  /* ─────────────────── Phases ─────────────────── */
  function startCountdown() {
    if (!game) return;
    const peer = frodon.getPeer(game.peerId);
    if (peer?.avatar) game.peerAvatar = peer.avatar;
    game.phase = 'countdown';
    game.countdownVal = 3;
    frodon.refreshSphereTab(PLUGIN_ID);
    setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 80);

    game.cdIV = setInterval(() => {
      if (!game) return;
      game.countdownVal--;
      frodon.refreshSphereTab(PLUGIN_ID);
      if (game.countdownVal <= 0) {
        clearInterval(game.cdIV); game.cdIV = null;
        startPlaying();
      }
    }, 1000);
  }

  function startPlaying() {
    if (!game) return;
    game.phase   = 'playing';
    game.myScore = 0; game.theirScore = 0;
    game.startTs = Date.now();
    frodon.refreshSphereTab(PLUGIN_ID);

    game.timerTO = setTimeout(() => {
      if (!game || game.phase !== 'playing') return;
      frodon.sendDM(game.peerId, PLUGIN_ID, { type:'result', score:game.myScore, _silent:true });
      endGame();
    }, 10000);
  }

  function endGame() {
    if (!game) return;
    if (game.timerTO) { clearTimeout(game.timerTO);  game.timerTO = null; }
    if (game.cdIV)    { clearInterval(game.cdIV);     game.cdIV    = null; }
    game.phase = 'result';

    const hist = store.get('history') || [];
    const won  = game.myScore > game.theirScore;
    const draw = game.myScore === game.theirScore;
    hist.unshift({ peerName:game.peerName, myScore:game.myScore, theirScore:game.theirScore,
                   result: draw?'draw':(won?'win':'lose'), ts:Date.now() });
    if (hist.length > 30) hist.length = 30;
    store.set('history', hist);
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  /* ─────────────────── Action profil ─────────────────── */
  frodon.registerPeerAction(PLUGIN_ID, '👆 Tap Race', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    if (!peer) return;

    if (game && game.phase !== 'result') {
      const info = frodon.makeElement('div','');
      info.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:8px 0;text-align:center';
      info.textContent = '⏳ Partie en cours…'; container.appendChild(info); return;
    }

    const card = frodon.makeElement('div','');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(255,107,53,.1),rgba(124,77,255,.07));border:1px solid rgba(255,107,53,.3);border-radius:10px;padding:10px 12px;margin-bottom:10px;text-align:center';
    card.innerHTML = '<div style="font-size:.62rem;color:var(--warn);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">👆 TAP RACE</div>'
      + '<div style="font-size:.72rem;color:var(--txt2)">10 secondes · tapez sur la photo de votre adversaire</div>';
    container.appendChild(card);

    const btn = frodon.makeElement('button','plugin-action-btn acc','👆 Défier ' + peer.name);
    btn.style.width = '100%';
    btn.addEventListener('click', () => {
      const me = frodon.getMyProfile();
      newGame(peerId, peer.name, peer.avatar || '');
      frodon.sendDM(peerId, PLUGIN_ID, {
        type:'challenge', fromName:me.name, fromAvatar:me.avatar||'',
        _label:'👆 Défi Tap Race !', _silent:false,
      });
      frodon.showToast('👆 Défi envoyé à ' + peer.name + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
    });
    container.appendChild(btn);
  });

  /* ─────────────────── Rendus SPHERE ─────────────────── */
  function renderWaiting(container) {
    const w = frodon.makeElement('div','');
    w.style.cssText = 'padding:24px 12px;text-align:center;color:var(--txt2);font-size:.76rem;line-height:1.8';
    w.innerHTML = '<div style="font-size:1.8rem;margin-bottom:8px">⏳</div>En attente que <strong style="color:var(--acc2)">'
      + game.peerName + '</strong><br>accepte le défi…';
    const cancel = frodon.makeElement('button','plugin-action-btn','✕ Annuler');
    cancel.style.cssText += ';margin-top:10px;font-size:.7rem';
    cancel.addEventListener('click', () => {
      frodon.sendDM(game.peerId, PLUGIN_ID, { type:'decline', _silent:true });
      cleanGame(); frodon.refreshSphereTab(PLUGIN_ID);
    });
    w.appendChild(cancel); container.appendChild(w);
  }

  function renderCountdown(container) {
    const w = frodon.makeElement('div','');
    w.style.cssText = 'padding:24px 12px;text-align:center';
    w.innerHTML = '<div style="font-size:5.5rem;font-family:var(--mono);font-weight:700;color:var(--warn);line-height:1;animation:spulse 1s ease-in-out infinite">'
      + game.countdownVal + '</div>'
      + '<div style="font-size:.72rem;color:var(--txt2);margin-top:8px">vs ' + game.peerName + ' · Préparez-vous !</div>';
    container.appendChild(w);
  }

  function renderPlaying(container) {
    const elapsed = Math.max(0, Math.min(1, (Date.now() - game.startTs) / 10000));

    const scores = frodon.makeElement('div','');
    scores.style.cssText = 'display:flex;justify-content:space-around;width:100%;font-family:var(--mono);padding:10px 12px 0';
    scores.innerHTML =
      '<div style="text-align:center"><div style="font-size:.58rem;color:var(--acc);text-transform:uppercase;margin-bottom:2px">Vous</div>'
      + '<div id="tap-my-score" style="font-size:2.6rem;font-weight:700;color:var(--acc)">' + game.myScore + '</div></div>'
      + '<div style="align-self:center;color:var(--txt3);font-size:.8rem">vs</div>'
      + '<div style="text-align:center"><div style="font-size:.58rem;color:var(--acc2);text-transform:uppercase;margin-bottom:2px">' + game.peerName + '</div>'
      + '<div id="tap-their-score" style="font-size:2.6rem;font-weight:700;color:var(--acc2)">' + game.theirScore + '</div></div>';
    container.appendChild(scores);

    const barWrap = frodon.makeElement('div','');
    barWrap.style.cssText = 'width:calc(100% - 24px);height:6px;background:var(--bdr2);border-radius:4px;overflow:hidden;margin:8px 12px';
    const barFill = frodon.makeElement('div','');
    barFill.id = 'tap-timer-bar';
    barFill.style.cssText = 'height:100%;width:' + Math.round((1-elapsed)*100) + '%;background:var(--warn);border-radius:4px;transition:width .25s linear';
    barWrap.appendChild(barFill); container.appendChild(barWrap);

    // Rafraîchir la barre chaque 250ms sans re-render complet
    const barInterval = setInterval(() => {
      const b = document.getElementById('tap-timer-bar');
      if (!b || !game || game.phase !== 'playing') { clearInterval(barInterval); return; }
      const e2 = Math.max(0, Math.min(1, (Date.now() - game.startTs) / 10000));
      b.style.width = Math.round((1-e2)*100) + '%';
    }, 250);

    // Photo tapable de l'adversaire
    const tapArea = frodon.makeElement('div','');
    tapArea.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px 14px';

    const hint = frodon.makeElement('div','');
    hint.style.cssText = 'font-size:.6rem;color:var(--txt3);font-family:var(--mono)';
    hint.textContent = '↓ Tapez sur la photo de ' + game.peerName;
    tapArea.appendChild(hint);

    const tapBtn = document.createElement('div');
    tapBtn.style.cssText = 'width:120px;height:120px;border-radius:50%;overflow:hidden;border:4px solid var(--warn);cursor:pointer;box-shadow:0 0 28px rgba(255,107,53,.5);flex-shrink:0;user-select:none;-webkit-user-select:none;touch-action:manipulation;position:relative';
    const tapImg = document.createElement('img');
    tapImg.src = game.peerAvatar || '';
    tapImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
    tapImg.onerror = () => { tapImg.style.display='none'; };
    tapBtn.appendChild(tapImg);
    // Initiales en fallback
    const tapFallback = frodon.makeElement('div','');
    tapFallback.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:3rem;font-family:var(--mono);background:var(--sur2);color:var(--acc2);z-index:-1';
    tapFallback.textContent = (game.peerName[0]||'?').toUpperCase();
    tapBtn.appendChild(tapFallback);
    tapArea.appendChild(tapBtn);
    container.appendChild(tapArea);

    const doTap = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!game || game.phase !== 'playing') return;
      game.myScore++;
      // Mise à jour DOM directe
      const ms = document.getElementById('tap-my-score');
      if (ms) ms.textContent = game.myScore;
      // Animation
      tapBtn.style.transform = 'scale(.84)';
      tapBtn.style.boxShadow = '0 0 48px rgba(255,107,53,.95)';
      setTimeout(() => { tapBtn.style.transform=''; tapBtn.style.boxShadow='0 0 28px rgba(255,107,53,.5)'; }, 75);
      // Sync chaque tap vers l'adversaire
      frodon.sendDM(game.peerId, PLUGIN_ID, { type:'tap', score:game.myScore, _silent:true });
    };
    tapBtn.addEventListener('pointerdown', doTap);
  }

  function renderResult(container) {
    const won  = game.myScore > game.theirScore;
    const draw = game.myScore === game.theirScore;
    const emoji = draw ? '🤝' : (won ? '🏆' : '😅');
    const label = draw ? 'ÉGALITÉ !' : (won ? 'VICTOIRE !' : 'DÉFAITE');
    const col   = draw ? 'var(--txt)' : (won ? 'var(--ok)' : 'var(--warn)');

    const savedPeerId   = game.peerId;
    const savedPeerName = game.peerName;
    const savedPeerAv   = game.peerAvatar;

    const w = frodon.makeElement('div','');
    w.style.cssText = 'padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:10px';
    w.innerHTML = '<div style="font-size:3.2rem">' + emoji + '</div>'
      + '<div style="font-size:1.1rem;font-weight:800;color:' + col + ';font-family:var(--mono)">' + label + '</div>'
      + '<div style="display:flex;justify-content:space-around;width:100%;font-family:var(--mono)">'
      + '<div style="text-align:center"><div style="font-size:.56rem;color:var(--acc);text-transform:uppercase">Vous</div><div style="font-size:2rem;font-weight:700;color:var(--acc)">' + game.myScore + '</div></div>'
      + '<div style="align-self:center;color:var(--txt3)">vs</div>'
      + '<div style="text-align:center"><div style="font-size:.56rem;color:var(--acc2);text-transform:uppercase">' + game.peerName + '</div><div style="font-size:2rem;font-weight:700;color:var(--acc2)">' + game.theirScore + '</div></div>'
      + '</div>';

    const again = frodon.makeElement('button','plugin-action-btn acc','👆 Rejouer');
    again.style.cssText += ';width:180px';
    again.addEventListener('click', () => {
      // Réinitialiser et envoyer un nouveau défi directement
      const me = frodon.getMyProfile();
      newGame(savedPeerId, savedPeerName, savedPeerAv);
      frodon.sendDM(savedPeerId, PLUGIN_ID, {
        type:'challenge', fromName:me.name, fromAvatar:me.avatar||'',
        _label:'👆 Défi Tap Race !', _silent:false,
      });
      frodon.showToast('👆 Nouveau défi envoyé !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });

    const close = frodon.makeElement('button','plugin-action-btn','Fermer');
    close.style.cssText += ';width:180px';
    close.addEventListener('click', () => { cleanGame(); frodon.refreshSphereTab(PLUGIN_ID); });

    w.appendChild(again); w.appendChild(close);
    container.appendChild(w);
  }

  function renderPending(container) {
    const w = frodon.makeElement('div','');
    w.style.cssText = 'padding:20px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px';

    const av = document.createElement('img');
    av.src = pending.fromAvatar || '';
    av.onerror = () => av.remove();
    av.style.cssText = 'width:72px;height:72px;border-radius:50%;border:3px solid var(--warn);object-fit:cover;box-shadow:0 0 28px rgba(255,107,53,.5)';
    w.appendChild(av);

    const msg = frodon.makeElement('div','');
    msg.style.cssText = 'font-size:.8rem;color:var(--txt);line-height:1.6';
    msg.innerHTML = '<strong style="color:var(--warn)">' + pending.fromName + '</strong> vous défie !<br>'
      + '<span style="font-size:.64rem;color:var(--txt2)">10 secondes · qui tapera le plus vite ?</span>';
    w.appendChild(msg);

    const row = frodon.makeElement('div','');
    row.style.cssText = 'display:flex;gap:8px';

    const accept = frodon.makeElement('button','plugin-action-btn acc','✔ Accepter');
    accept.style.flex = '1';
    accept.addEventListener('click', () => {
      newGame(pending.fromId, pending.fromName, pending.fromAvatar);
      pending = null;
      frodon.sendDM(game.peerId, PLUGIN_ID, { type:'accept', _silent:true });
      startCountdown();
    });

    const decline = frodon.makeElement('button','plugin-action-btn','✕ Refuser');
    decline.style.flex = '1';
    decline.addEventListener('click', () => {
      frodon.sendDM(pending.fromId, PLUGIN_ID, { type:'decline', _silent:true });
      pending = null; frodon.refreshSphereTab(PLUGIN_ID);
    });

    row.appendChild(accept); row.appendChild(decline);
    w.appendChild(row);
    container.appendChild(w);
  }

  function renderIdle(container) {
    const w = frodon.makeElement('div','');
    w.style.cssText = 'text-align:center;padding:28px 16px;color:var(--txt2);font-size:.76rem;line-height:1.8';
    w.innerHTML = '<div style="font-size:2rem;margin-bottom:8px">👆</div>'
      + 'Visitez un profil et cliquez<br><strong style="color:var(--warn)">👆 Tap Race</strong> pour lancer un défi !';
    container.appendChild(w);
  }

  function renderHistory(container) {
    const hist = store.get('history') || [];
    if (!hist.length) {
      const em = frodon.makeElement('div','no-posts','Aucune partie jouée.');
      em.style.padding = '20px 16px'; container.appendChild(em); return;
    }
    const stats = hist.reduce((a,h) => { a[h.result]=(a[h.result]||0)+1; return a; }, {});
    const banner = frodon.makeElement('div','');
    banner.style.cssText = 'display:flex;gap:16px;padding:10px 12px;border-bottom:1px solid var(--bdr);justify-content:center;font-family:var(--mono)';
    [['🏆',stats.win||0,'var(--ok)'],['🤝',stats.draw||0,'var(--txt2)'],['😅',stats.lose||0,'var(--warn)']].forEach(([e,n,c]) => {
      const b = frodon.makeElement('div','');
      b.style.cssText = 'text-align:center';
      b.innerHTML = '<div style="font-size:.9rem">' + e + '</div><div style="font-size:.85rem;font-weight:700;color:' + c + '">' + n + '</div>';
      banner.appendChild(b);
    });
    container.appendChild(banner);
    hist.slice(0,20).forEach(h => {
      const row = frodon.makeElement('div','');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--bdr)';
      const col = h.result==='win'?'var(--ok)':h.result==='draw'?'var(--txt)':'var(--warn)';
      row.innerHTML = '<span style="font-size:1rem">' + (h.result==='win'?'🏆':h.result==='draw'?'🤝':'😅') + '</span>'
        + '<span style="flex:1;font-size:.72rem;color:var(--txt)">' + h.peerName + '</span>'
        + '<span style="font-family:var(--mono);font-size:.7rem;color:' + col + '">' + h.myScore + ' – ' + h.theirScore + '</span>'
        + '<span class="mini-card-ts" style="margin-left:6px">' + frodon.formatTime(h.ts) + '</span>';
      container.appendChild(row);
    });
  }

  /* ─────────────────── Panneau SPHERE ─────────────────── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'game', label: '👆 Jeu',
      render(container) {
        if (pending)                          { renderPending(container);   return; }
        if (!game)                            { renderIdle(container);      return; }
        if (game.phase === 'waiting_accept')  { renderWaiting(container);   return; }
        if (game.phase === 'countdown')       { renderCountdown(container); return; }
        if (game.phase === 'playing')         { renderPlaying(container);   return; }
        if (game.phase === 'result')          { renderResult(container);    return; }
      }
    },
    {
      id: 'history', label: '🏆 Scores',
      render(container) { renderHistory(container); }
    },
  ]);

  return { destroy() { cleanGame(); } };
});
