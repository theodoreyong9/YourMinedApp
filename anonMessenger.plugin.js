frodon.register({
  id: 'anon-messenger',
  name: 'Messager Anonyme',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Envoyez des messages anonymes. Le destinataire ne sait pas qui écrit.',
  icon: '🕵',
}, () => {

  const PLUGIN_ID = 'anon-messenger';
  const store = frodon.storage(PLUGIN_ID);

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    // Nouveau message reçu — fromId est connu du plugin mais jamais affiché
    if (payload.type === 'anon_msg') {
      const inbox = store.get('inbox') || [];
      let conv = inbox.find(c => c.convId === payload.convId);
      if (!conv) {
        const n = (inbox.filter(c => c.anonLabel).length) + 1;
        conv = {
          convId:    payload.convId,
          routeTo:   fromId,        // utilisé pour router les réponses — jamais affiché
          anonLabel: 'Inconnu #' + payload.convId.slice(-4).toUpperCase(),
          messages:  [],
          ts:        Date.now(),
        };
        inbox.unshift(conv);
      }
      conv.messages.push({ text: payload.text, fromMe: false, ts: Date.now() });
      conv.ts = Date.now();
      if (inbox[0] !== conv) { inbox.splice(inbox.indexOf(conv), 1); inbox.unshift(conv); }
      store.set('inbox', inbox);
      frodon.showToast('🕵 Message de ' + conv.anonLabel);
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      return;
    }

    // Réponse dans une conversation que j'ai initiée
    if (payload.type === 'anon_reply') {
      const sent = store.get('sent') || [];
      const conv = sent.find(c => c.convId === payload.convId);
      if (conv) {
        conv.messages.push({ text: payload.text, fromMe: false, ts: Date.now() });
        conv.ts = Date.now();
        store.set('sent', sent);
        frodon.showToast('🕵 Réponse de ' + conv.toName);
        frodon.refreshSphereTab(PLUGIN_ID);
        setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      }
      return;
    }
  });

  /* ── Action sur le profil d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🕵 Message anonyme', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    if (!peer) return;

    // Conversations existantes avec ce pair
    const sent = store.get('sent') || [];
    const existing = sent.filter(c => c.toId === peerId);
    if (existing.length) {
      const sec = frodon.makeElement('div', 'section-label', existing.length + ' conversation(s) active(s)');
      container.appendChild(sec);
      existing.slice(0, 3).forEach(c => {
        const last = c.messages[c.messages.length - 1];
        const row = frodon.makeElement('div', 'mini-card');
        row.style.cssText = 'margin:0 0 5px;cursor:default;font-size:.68rem;color:var(--txt2)';
        row.textContent = (last?.fromMe ? '→ ' : '← ') + (last?.text || '').substring(0, 60);
        container.appendChild(row);
      });
      const hr = document.createElement('hr');
      hr.style.cssText = 'border:none;border-top:1px solid var(--bdr);margin:8px 0';
      container.appendChild(hr);
    }

    const sec2 = frodon.makeElement('div', 'section-label', 'Nouveau message');
    container.appendChild(sec2);

    const hint = frodon.makeElement('div', '');
    hint.style.cssText = 'font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:8px;padding:5px 8px;background:rgba(124,77,255,.06);border-radius:6px;border:1px solid rgba(124,77,255,.15)';
    hint.textContent = '👁 ' + peer.name + ' ne verra pas votre nom';
    container.appendChild(hint);

    const ta = document.createElement('textarea');
    ta.className = 'f-input'; ta.rows = 3; ta.maxLength = 500;
    ta.placeholder = 'Votre message…';
    container.appendChild(ta);

    const btn = frodon.makeElement('button', 'plugin-action-btn acc', '🕵 Envoyer anonymement');
    btn.style.cssText += ';width:100%;margin-top:8px';
    btn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { frodon.showToast('Écrivez un message', true); return; }
      const convId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const sent = store.get('sent') || [];
      sent.unshift({
        convId, toId: peerId, toName: peer.name,
        messages: [{ text, fromMe: true, ts: Date.now() }],
        ts: Date.now(),
      });
      store.set('sent', sent);
      frodon.sendDM(peerId, PLUGIN_ID, {
        type: 'anon_msg', convId, text,
        _label: '🕵 Message anonyme',
        _silent: false,
      });
      frodon.showToast('🕵 Envoyé anonymement à ' + peer.name);
      frodon.refreshSphereTab(PLUGIN_ID);
      btn.textContent = '✓ Envoyé'; btn.disabled = true; ta.disabled = true;
    });
    container.appendChild(btn);
  });

  /* ── Rendu d'une conversation ── */
  function renderConv(container, conv, type) {
    const wrap = frodon.makeElement('div', '');
    wrap.style.cssText = 'border-bottom:1px solid var(--bdr);padding:8px 10px 10px';

    // En-tête
    const hdr = frodon.makeElement('div', '');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px';
    const nameEl = frodon.makeElement('strong', '');
    nameEl.style.cssText = 'font-size:.76rem;' + (type === 'sent' ? 'color:var(--acc)' : 'color:var(--acc2)');
    nameEl.textContent = type === 'sent' ? ('→ ' + conv.toName) : conv.anonLabel;
    hdr.appendChild(nameEl);
    hdr.appendChild(frodon.makeElement('span', 'mini-card-ts', frodon.formatTime(conv.ts)));
    wrap.appendChild(hdr);

    // Bulles de messages
    const bubblesEl = frodon.makeElement('div', '');
    bubblesEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;max-height:160px;overflow-y:auto';
    const msgs = conv.messages.slice(-20);
    msgs.forEach(m => {
      const b = frodon.makeElement('div', '');
      b.style.cssText = m.fromMe
        ? 'align-self:flex-end;background:rgba(0,245,200,.1);border:1px solid rgba(0,245,200,.2);color:var(--acc);border-radius:10px 10px 2px 10px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word'
        : 'align-self:flex-start;background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);color:var(--txt);border-radius:10px 10px 10px 2px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word';
      b.textContent = m.text;
      bubblesEl.appendChild(b);
    });
    wrap.appendChild(bubblesEl);
    // Scroll to bottom
    setTimeout(() => { bubblesEl.scrollTop = bubblesEl.scrollHeight; }, 0);

    // Champ réponse
    const replyRow = frodon.makeElement('div', '');
    replyRow.style.cssText = 'display:flex;gap:6px';
    const replyIn = document.createElement('input');
    replyIn.type = 'text'; replyIn.className = 'f-input';
    replyIn.placeholder = 'Répondre…'; replyIn.maxLength = 500;
    replyIn.style.flex = '1';

    const replyBtn = frodon.makeElement('button', 'plugin-action-btn acc', '↩');
    replyBtn.style.cssText += ';padding:0 12px;flex-shrink:0';

    const doReply = () => {
      const text = replyIn.value.trim(); if (!text) return;
      replyIn.value = '';
      if (type === 'sent') {
        const sent = store.get('sent') || [];
        const c = sent.find(x => x.convId === conv.convId);
        if (c) {
          c.messages.push({ text, fromMe: true, ts: Date.now() });
          c.ts = Date.now();
          store.set('sent', sent);
          frodon.sendDM(conv.toId, PLUGIN_ID, { type: 'anon_reply', convId: conv.convId, text, _silent: true });
        }
      } else {
        const inbox = store.get('inbox') || [];
        const c = inbox.find(x => x.convId === conv.convId);
        if (c) {
          c.messages.push({ text, fromMe: true, ts: Date.now() });
          c.ts = Date.now();
          store.set('inbox', inbox);
          frodon.sendDM(c.routeTo, PLUGIN_ID, { type: 'anon_reply', convId: conv.convId, text, _silent: true });
        }
      }
      frodon.refreshSphereTab(PLUGIN_ID);
    };
    replyIn.addEventListener('keydown', e => { if (e.key === 'Enter') doReply(); });
    replyBtn.addEventListener('click', doReply);
    replyRow.appendChild(replyIn); replyRow.appendChild(replyBtn);
    wrap.appendChild(replyRow);
    container.appendChild(wrap);
  }

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'inbox', label: '📬 Reçus',
      render(container) {
        const inbox = store.get('inbox') || [];
        if (!inbox.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Aucun message reçu.\nVous ne saurez jamais qui vous a écrit.');
          em.style.cssText += ';padding:20px 16px;white-space:pre-line;text-align:center';
          container.appendChild(em); return;
        }
        inbox.forEach(conv => renderConv(container, conv, 'inbox'));
      }
    },
    {
      id: 'sent', label: '📤 Envoyés',
      render(container) {
        const sent = store.get('sent') || [];
        if (!sent.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Aucun message envoyé.\nVisitez un profil pour écrire anonymement.');
          em.style.cssText += ';padding:20px 16px;white-space:pre-line;text-align:center';
          container.appendChild(em); return;
        }
        sent.forEach(conv => renderConv(container, conv, 'sent'));
      }
    },
  ]);

  return { destroy() {} };
});
