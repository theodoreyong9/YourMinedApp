/**
 * FRODON PLUGIN — Livre d'Or  v1.0.0
 * Les pairs signent votre livre en laissant un message libre.
 * Vous voyez toutes les signatures dans SPHERE → Reçus.
 * Vos signatures envoyées sont dans SPHERE → Envoyés.
 */
frodon.register({
  id: 'guestbook',
  name: "Livre d'Or",
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Laissez un message à chaque pair que vous croisez.',
  icon: '📖',
}, () => {

  const PLUGIN_ID = 'guestbook';
  const store = frodon.storage(PLUGIN_ID);

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type !== 'sign') return;
    const entries = store.get('received') || [];
    entries.unshift({
      fromId,
      name   : payload.authorName || '?',
      avatar : payload.authorAvatar || '',
      text   : (payload.text || '').substring(0, 300),
      ts     : Date.now(),
    });
    if(entries.length > 100) entries.length = 100;
    store.set('received', entries);
    const peer = frodon.getPeer(fromId);
    frodon.showToast('📖 ' + (peer?.name || payload.authorName || '?') + ' a signé votre livre !');
    frodon.refreshSphereTab(PLUGIN_ID);
    frodon.refreshProfileModal();
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, "📖 Livre d'Or", (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;

    // Textarea
    const ta = document.createElement('textarea');
    ta.className = 'f-input';
    ta.rows = 3;
    ta.maxLength = 300;
    ta.placeholder = 'Signez le livre de ' + peerName + '…';
    ta.style.marginBottom = '8px';
    container.appendChild(ta);

    // Char counter
    const counter = frodon.makeElement('div', '');
    counter.style.cssText = 'font-size:.58rem;color:var(--txt2);font-family:var(--mono);text-align:right;margin-top:-5px;margin-bottom:8px';
    counter.textContent = '0 / 300';
    ta.addEventListener('input', () => { counter.textContent = ta.value.length + ' / 300'; });
    container.appendChild(counter);

    // Check if already signed today
    const sent = store.get('sent') || [];
    const today = new Date().toDateString();
    const alreadySigned = sent.find(s => s.toId === peerId && new Date(s.ts).toDateString() === today);

    if(alreadySigned) {
      const note = frodon.makeElement('div', '');
      note.style.cssText = 'font-size:.65rem;color:var(--txt2);font-family:var(--mono);margin-bottom:8px';
      note.textContent = '✓ Déjà signé aujourd\'hui';
      container.insertBefore(note, ta);
    }

    const btn = frodon.makeElement('button', 'plugin-action-btn acc', '✍ Signer');
    btn.addEventListener('click', () => {
      const text = ta.value.trim();
      if(!text) { frodon.showToast('Écrivez quelque chose !', true); return; }
      const me = frodon.getMyProfile();
      frodon.sendDM(peerId, PLUGIN_ID, {
        type       : 'sign',
        authorName  : me.name,
        authorAvatar: me.avatar,
        text,
      });
      // Save locally
      const sent2 = store.get('sent') || [];
      sent2.unshift({ toId: peerId, toName: peerName, text, ts: Date.now() });
      if(sent2.length > 50) sent2.length = 50;
      store.set('sent', sent2);
      btn.textContent = '✓ Signé !';
      btn.disabled = true;
      ta.disabled = true;
      frodon.showToast('✍ Message envoyé à ' + peerName + ' !');
    });
    container.appendChild(btn);
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const received = store.get('received') || [];
    const lbl = frodon.makeElement('div', 'section-label', '📖 Livre d\'Or — ' + received.length + ' signature' + (received.length !== 1 ? 's' : ''));
    container.appendChild(lbl);
    if(received.length > 0) {
      const latest = received[0];
      const preview = frodon.makeElement('div', '');
      preview.style.cssText = 'font-size:.67rem;color:var(--txt2);font-family:var(--mono);padding:4px 0';
      preview.textContent = '"' + latest.text.substring(0, 60) + (latest.text.length > 60 ? '…' : '') + '"';
      container.appendChild(preview);
    }
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'received',
      label: '📖 Reçus',
      render(container) {
        const entries = store.get('received') || [];
        if(!entries.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Personne n\'a encore signé votre livre.');
          em.style.padding = '24px 16px';
          container.appendChild(em);
          return;
        }
        entries.slice(0, 30).forEach(e => {
          const card = frodon.makeElement('div', 'mini-card');
          card.style.margin = '6px 8px 0';

          const hdr = frodon.makeElement('div', '');
          hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px';

          const name = frodon.makeElement('strong', '', e.name);
          name.style.cssText = 'font-size:.76rem;color:var(--txt)';
          const ts = frodon.makeElement('span', 'mini-card-ts', frodon.formatTime(e.ts));

          hdr.appendChild(name);
          hdr.appendChild(ts);
          card.appendChild(hdr);

          const body = frodon.makeElement('div', 'mini-card-body', '"' + e.text + '"');
          card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'sent',
      label: '✍ Envoyés',
      render(container) {
        const entries = store.get('sent') || [];
        if(!entries.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Vous n\'avez pas encore signé de livre.');
          em.style.padding = '24px 16px';
          container.appendChild(em);
          return;
        }
        entries.slice(0, 30).forEach(e => {
          const card = frodon.makeElement('div', 'mini-card');
          card.style.margin = '6px 8px 0';

          const hdr = frodon.makeElement('div', '');
          hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px';
          const name = frodon.makeElement('span', '', '→ ' + e.toName);
          name.style.cssText = 'font-size:.72rem;color:var(--acc2)';
          const ts = frodon.makeElement('span', 'mini-card-ts', frodon.formatTime(e.ts));
          hdr.appendChild(name); hdr.appendChild(ts);
          card.appendChild(hdr);
          card.appendChild(frodon.makeElement('div', 'mini-card-body', '"' + e.text + '"'));
          container.appendChild(card);
        });
      }
    },
  ]);

  return { destroy() {} };
});
