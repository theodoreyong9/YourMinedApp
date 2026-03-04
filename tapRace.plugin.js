frodon.register({
  id: 'tap-race',
  name: 'Tap Race',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Course de tap : tapez sur la photo de votre adversaire pendant 10 secondes !',
  icon: '👆',
}, () => {

  const PLUGIN_ID = 'tap-race';
  const store = frodon.storage(PLUGIN_ID);

  // État en mémoire (non persisté)
  let game = null; // { peerId, peerName, peerAvatar, myScore, theirScore, startTs, phase:'countdown'|'playing'|'result', interval, countdownVal }
  let pending = null; // { fromId, fromName, fromAvatar, ts } challenge reçu en attente

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if (payload.type === 'challenge') {
      const peer = frodon.getPeer(fromId);
      pending = {
        fromId,
        fromName:   peer?.name   || payload.fromName || 'Pair inconnu',
        fromAvatar: peer?.avatar || payload.fromAvatar || '',
        ts: Date.now(),
      };
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
        frodon.showToast('👆 ' + name + ' a refusé le défi.');
        frodon.refreshSphereTab(PLUGIN_ID);
      }
      return;
    }

    if (payload.type === 'tap') {
      if (game && game.phase === 'playing') {
        game.theirScore = payload.score;
        frodon.refreshSphereTab(PLUGIN_ID);
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

  function cleanGame() {
    if (game?.interval) clearInterval(game.interval);
    game = null;
  }

  /* ── Countdown then play ── */
  function startCountdown() {
    const peer = frodon.getPeer(game.peerId);
    game.peerAvatar = peer?.avatar || game.peerAvatar || '';
    game.phase = 'countdown';
    game.countdownVal = 3;
    frodon.refreshSphereTab(PLUGIN_ID);
    setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 100);

    game.interval = setInterval(() => {
      if (!game) return;
      game.countdownVal--;
      if (game.countdownVal <= 0) {
        clearInterval(game.interval);
        game.interval = null;
        startPlaying();
      } else {
        frodon.refreshSphereTab(PLUGIN_ID);
      }
    }, 1000);
  }

  function startPlaying() {
    game.phase = 'playing';
    game.myScore = 0;
    game.theirScore = 0;
    game.startTs = Date.now();
    frodon.refreshSphereTab(PLUGIN_ID);

    // Fin automatique à 10 secondes
    game.interval = setTimeout(() => {
      if (!game) return;
      frodon.sendDM(game.peerId, PLUGIN_ID, { type: 'result', score: game.myScore, _silent: true });
      endGame();
    }, 10000);
  }

  function endGame() {
    if (game?.interval) { clearTimeout(game.interval); clearInterval(game.interval); game.interval = null; }
    if (game) game.phase = 'result';
    // Sauvegarder dans l'historique
    if (game) {
      const hist = store.get('history') || [];
      const won = game.myScore > game.theirScore;
      const draw = game.myScore === game.theirScore;
      hist.unshift({
        peerName: game.peerName,
        myScore: game.myScore,
        theirScore: game.theirScore,
        result: draw ? 'draw' : (won ? 'win' : 'lose'),
        ts: Date.now(),
      });
      if (hist.length > 30) hist.length = 30;
      store.set('history', hist);
    }
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  /* ── Action sur profil ── */
  frodon.registerPeerAction(PLUGIN_ID, '👆 Tap Race', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    if (!peer) return;

    if (game) {
      const info = frodon.makeElement('div', '');
      info.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:8px 0;text-align:center';
      info.textContent = '⏳ Partie en cours…';
      container.appendChild(info);
      return;
    }

    const card = frodon.makeElement('div', '');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(255,107,53,.1),rgba(124,77,255,.07));border:1px solid rgba(255,107,53,.3);border-radius:10px;padding:10px 12px;margin-bottom:10px;text-align:center';
    const title = frodon.makeElement('div', '');
    title.style.cssText = 'font-size:.62rem;color:var(--warn);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px';
    title.textContent = '👆 TAP RACE';
    const desc = frodon.makeElement('div', '');
    desc.style.cssText = 'font-size:.72rem;color:var(--txt2)';
    desc.textContent = '10 secondes · tapez sur la photo de votre adversaire';
    card.appendChild(title); card.appendChild(desc);
    container.appendChild(card);

    const btn = frodon.makeElement('button', 'plugin-action-btn acc', '👆 Défier ' + peer.name);
    btn.style.width = '100%';
    btn.addEventListener('click', () => {
      const me = frodon.getMyProfile();
      game = {
        peerId:     peerId,
        peerName:   peer.name,
        peerAvatar: peer.avatar || '',
        myScore: 0, theirScore: 0,
        phase: 'waiting_accept',
        startTs: null, interval: null, countdownVal: 3,
      };
      frodon.sendDM(peerId, PLUGIN_ID, {
        type: 'challenge',
        fromName: me.name, fromAvatar: me.avatar || '',
        _label: '👆 Défi Tap Race !',
        _silent: false,
      });
      frodon.showToast('👆 Défi envoyé à ' + peer.name + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      btn.textContent = '⌛ En attente…'; btn.disabled = true;
    });
    container.appendChild(btn);
  });

  /* ── Rendu du jeu dans SPHERE ── */
  function renderGame(container) {
    const wrap = frodon.makeElement('div', '');
    wrap.style.cssText = 'padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:12px';

    if (game.phase === 'waiting_accept') {
      const msg = frodon.makeElement('div', '');
      msg.style.cssText = 'text-align:center;color:var(--txt2);font-size:.76rem;line-height:1.8';
      msg.innerHTML = '<div style="font-size:1.8rem;margin-bottom:6px">⏳</div>En attente que <strong style="color:var(--acc2)">' + game.peerName + '</strong><br>accepte le défi…';
      const cancel = frodon.makeElement('button', 'plugin-action-btn', '✕ Annuler');
      cancel.style.cssText += ';margin-top:8px;font-size:.7rem';
      cancel.addEventListener('click', () => {
        frodon.sendDM(game.peerId, PLUGIN_ID, { type: 'decline', _silent: true });
        cleanGame();
        frodon.refreshSphereTab(PLUGIN_ID);
      });
      wrap.appendChild(msg); wrap.appendChild(cancel);

    } else if (game.phase === 'countdown') {
      const msg = frodon.makeElement('div', '');
      msg.style.cssText = 'text-align:center';
      const cd = frodon.makeElement('div', '');
      cd.style.cssText = 'font-size:5rem;font-family:var(--mono);font-weight:700;color:var(--warn);line-height:1;animation:spulse 1s ease-in-out infinite';
      cd.textContent = game.countdownVal;
      const lbl = frodon.makeElement('div', '');
      lbl.style.cssText = 'font-size:.72rem;color:var(--txt2);margin-top:6px';
      lbl.textContent = 'vs ' + game.peerName + ' · Préparez-vous !';
      msg.appendChild(cd); msg.appendChild(lbl); wrap.appendChild(msg);

    } else if (game.phase === 'playing') {
      // Scores
      const scores = frodon.makeElement('div', '');
      scores.style.cssText = 'display:flex;justify-content:space-around;width:100%;font-family:var(--mono)';
      const myScoreEl = frodon.makeElement('div', '');
      myScoreEl.style.cssText = 'text-align:center';
      myScoreEl.innerHTML = '<div style="font-size:.6rem;color:var(--acc);text-transform:uppercase;margin-bottom:2px">Vous</div><div id="tap-my-score" style="font-size:2.4rem;font-weight:700;color:var(--acc)">' + game.myScore + '</div>';
      const vsEl = frodon.makeElement('div', '');
      vsEl.style.cssText = 'font-size:.9rem;color:var(--txt3);align-self:center';
      vsEl.textContent = 'vs';
      const theirScoreEl = frodon.makeElement('div', '');
      theirScoreEl.style.cssText = 'text-align:center';
      theirScoreEl.innerHTML = '<div style="font-size:.6rem;color:var(--acc2);text-transform:uppercase;margin-bottom:2px">' + game.peerName + '</div><div id="tap-their-score" style="font-size:2.4rem;font-weight:700;color:var(--acc2)">' + game.theirScore + '</div>';
      scores.appendChild(myScoreEl); scores.appendChild(vsEl); scores.appendChild(theirScoreEl);
      wrap.appendChild(scores);

      // Barre de temps
      const elapsed = Math.min((Date.now() - game.startTs) / 10000, 1);
      const barWrap = frodon.makeElement('div', '');
      barWrap.style.cssText = 'width:100%;height:6px;background:var(--bdr2);border-radius:4px;overflow:hidden';
      const barFill = frodon.makeElement('div', '');
      barFill.style.cssText = 'height:100%;width:' + Math.round((1-elapsed)*100) + '%;background:var(--warn);border-radius:4px;transition:width .2s';
      barWrap.appendChild(barFill); wrap.appendChild(barWrap);

      // Bouton TAP = avatar du pair
      const tapBtn = frodon.makeElement('div', '');
      tapBtn.style.cssText = 'width:110px;height:110px;border-radius:50%;overflow:hidden;border:4px solid var(--warn);cursor:pointer;box-shadow:0 0 28px rgba(255,107,53,.5);transition:transform .06s,box-shadow .06s;flex-shrink:0;user-select:none;-webkit-user-select:none';
      tapBtn.title = 'Tapez !';
      const tapImg = document.createElement('img');
      tapImg.src = game.peerAvatar || '';
      tapImg.onerror = () => { tapImg.style.display='none'; tapBtn.textContent = game.peerName[0]?.toUpperCase()||'?'; tapBtn.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:3rem;font-family:var(--mono);background:var(--sur2);color:var(--acc2)'; };
      tapImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
      tapBtn.appendChild(tapImg);

      const tapHint = frodon.makeElement('div', '');
      tapHint.style.cssText = 'font-size:.6rem;color:var(--txt3);font-family:var(--mono);text-align:center';
      tapHint.textContent = 'Tapez sur la photo de ' + game.peerName;

      let lastTapScore = 0;
      const doTap = (e) => {
        e.preventDefault();
        if (!game || game.phase !== 'playing') return;
        game.myScore++;
        // Animation
        tapBtn.style.transform = 'scale(.88)';
        tapBtn.style.boxShadow = '0 0 40px rgba(255,107,53,.9)';
        setTimeout(() => { if(tapBtn){ tapBtn.style.transform=''; tapBtn.style.boxShadow='0 0 28px rgba(255,107,53,.5)'; } }, 80);
        // Mettre à jour le score affiché sans re-render
        const ms = document.getElementById('tap-my-score');
        if (ms) ms.textContent = game.myScore;
        // Sync le score toutes les 5 taps
        if (game.myScore - lastTapScore >= 5) {
          lastTapScore = game.myScore;
          frodon.sendDM(game.peerId, PLUGIN_ID, { type: 'tap', score: game.myScore, _silent: true });
        }
      };
      tapBtn.addEventListener('click', doTap);
      tapBtn.addEventListener('touchstart', doTap, { passive: false });

      wrap.appendChild(tapBtn);
      wrap.appendChild(tapHint);

    } else if (game.phase === 'result') {
      const won  = game.myScore > game.theirScore;
      const draw = game.myScore === game.theirScore;
      const emoji = draw ? '🤝' : (won ? '🏆' : '😅');
      const label = draw ? 'ÉGALITÉ !' : (won ? 'VICTOIRE !' : 'DÉFAITE');
      const col   = draw ? 'var(--txt)' : (won ? 'var(--ok)' : 'var(--warn)');

      const res = frodon.makeElement('div', '');
      res.style.cssText = 'text-align:center;padding:8px 0';
      res.innerHTML = '<div style="font-size:3rem">' + emoji + '</div><div style="font-size:1.2rem;font-weight:800;color:' + col + ';font-family:var(--mono);margin:6px 0">' + label + '</div>';

      const sc = frodon.makeElement('div', '');
      sc.style.cssText = 'display:flex;justify-content:space-around;width:100%;font-family:var(--mono);margin:6px 0';
      sc.innerHTML = '<div style="text-align:center"><div style="font-size:.58rem;color:var(--acc);text-transform:uppercase">Vous</div><div style="font-size:2rem;font-weight:700;color:var(--acc)">' + game.myScore + '</div></div>'
        + '<div style="align-self:center;color:var(--txt3)">vs</div>'
        + '<div style="text-align:center"><div style="font-size:.58rem;color:var(--acc2);text-transform:uppercase">' + game.peerName + '</div><div style="font-size:2rem;font-weight:700;color:var(--acc2)">' + game.theirScore + '</div></div>';

      const again = frodon.makeElement('button', 'plugin-action-btn acc', '🔄 Rejouer');
      again.style.cssText += ';margin-top:10px';
      again.addEventListener('click', () => {
        const peerId = game.peerId;
        cleanGame();
        frodon.refreshSphereTab(PLUGIN_ID);
        // Réouvrir le profil pour relancer
        setTimeout(() => frodon.openPeer(peerId), 200);
      });

      const close = frodon.makeElement('button', 'plugin-action-btn', 'Fermer');
      close.style.cssText += ';margin-top:6px';
      close.addEventListener('click', () => { cleanGame(); frodon.refreshSphereTab(PLUGIN_ID); });

      wrap.appendChild(res); wrap.appendChild(sc); wrap.appendChild(again); wrap.appendChild(close);
    }

    container.appendChild(wrap);
  }

  /* ── Rendu du challenge reçu ── */
  function renderPending(container) {
    const wrap = frodon.makeElement('div', '');
    wrap.style.cssText = 'padding:14px 12px;text-align:center';

    const av = document.createElement('img');
    av.src = pending.fromAvatar || '';
    av.onerror = () => av.style.display='none';
    av.style.cssText = 'width:64px;height:64px;border-radius:50%;border:3px solid var(--warn);object-fit:cover;margin-bottom:10px;box-shadow:0 0 24px rgba(255,107,53,.5)';
    wrap.appendChild(av);

    const msg = frodon.makeElement('div', '');
    msg.style.cssText = 'font-size:.8rem;color:var(--txt);margin-bottom:14px;line-height:1.6';
    msg.innerHTML = '<strong style="color:var(--warn)">' + pending.fromName + '</strong> vous défie au Tap Race !<br><span style="font-size:.65rem;color:var(--txt2)">10 secondes · qui tapera le plus vite ?</span>';
    wrap.appendChild(msg);

    const row = frodon.makeElement('div', '');
    row.style.cssText = 'display:flex;gap:8px;justify-content:center';

    const accept = frodon.makeElement('button', 'plugin-action-btn acc', '✔ Accepter');
    accept.style.flex = '1';
    accept.addEventListener('click', () => {
      const me = frodon.getMyProfile();
      game = {
        peerId: pending.fromId, peerName: pending.fromName, peerAvatar: pending.fromAvatar,
        myScore: 0, theirScore: 0, phase: 'countdown',
        startTs: null, interval: null, countdownVal: 3,
      };
      pending = null;
      frodon.sendDM(game.peerId, PLUGIN_ID, { type: 'accept', _silent: true });
      startCountdown();
    });

    const decline = frodon.makeElement('button', 'plugin-action-btn', '✕ Refuser');
    decline.style.flex = '1';
    decline.addEventListener('click', () => {
      frodon.sendDM(pending.fromId, PLUGIN_ID, { type: 'decline', _silent: true });
      pending = null;
      frodon.refreshSphereTab(PLUGIN_ID);
    });

    row.appendChild(accept); row.appendChild(decline);
    wrap.appendChild(row);
    container.appendChild(wrap);
  }

  /* ── Historique ── */
  function renderHistory(container) {
    const hist = store.get('history') || [];
    if (!hist.length) {
      const em = frodon.makeElement('div', 'no-posts', 'Aucune partie jouée.');
      em.style.padding = '20px 16px'; container.appendChild(em); return;
    }
    const stats = hist.reduce((a, h) => {
      a[h.result] = (a[h.result]||0)+1; return a;
    }, {});
    const banner = frodon.makeElement('div', '');
    banner.style.cssText = 'display:flex;gap:12px;padding:10px 12px;border-bottom:1px solid var(--bdr);justify-content:center;font-family:var(--mono)';
    [['🏆', stats.win||0, 'var(--ok)'], ['🤝', stats.draw||0, 'var(--txt2)'], ['😅', stats.lose||0, 'var(--warn)']].forEach(([e, n, c]) => {
      const b = frodon.makeElement('div', '');
      b.style.cssText = 'text-align:center';
      b.innerHTML = '<div style="font-size:.9rem">' + e + '</div><div style="font-size:.8rem;font-weight:700;color:' + c + '">' + n + '</div>';
      banner.appendChild(b);
    });
    container.appendChild(banner);

    hist.slice(0, 20).forEach(h => {
      const row = frodon.makeElement('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--bdr)';
      const emoji = h.result==='win' ? '🏆' : h.result==='draw' ? '🤝' : '😅';
      const col   = h.result==='win' ? 'var(--ok)' : h.result==='draw' ? 'var(--txt)' : 'var(--warn)';
      row.innerHTML = '<span style="font-size:1.1rem">' + emoji + '</span>'
        + '<span style="flex:1;font-size:.72rem;color:var(--txt)">' + h.peerName + '</span>'
        + '<span style="font-family:var(--mono);font-size:.7rem;color:' + col + '">' + h.myScore + ' - ' + h.theirScore + '</span>'
        + '<span class="mini-card-ts" style="margin-left:6px">' + frodon.formatTime(h.ts) + '</span>';
      container.appendChild(row);
    });
  }

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'game', label: '👆 Jeu',
      render(container) {
        if (pending) { renderPending(container); return; }
        if (game)    { renderGame(container); return; }
        const em = frodon.makeElement('div', '');
        em.style.cssText = 'text-align:center;padding:28px 16px;color:var(--txt2);font-size:.76rem;line-height:1.8';
        em.innerHTML = '<div style="font-size:2rem;margin-bottom:8px">👆</div>Visitez un profil et cliquez<br><strong style="color:var(--warn)">👆 Tap Race</strong> pour lancer un défi !';
        container.appendChild(em);
      }
    },
    {
      id: 'history', label: '🏆 Scores',
      render(container) { renderHistory(container); }
    },
  ]);

  return { destroy() { cleanGame(); } };
});
