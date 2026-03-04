frodon.register({
  id: 'anon-messenger',
  name: 'Messager Anonyme',
  version: '2.0.0',
  author: 'frodon-community',
  description: 'Envoyez des messages anonymes. Vos destinataires ne savent pas qui vous êtes.',
  icon: '🕵',
}, () => {

  const PLUGIN_ID = 'anon-messenger';
  const store = frodon.storage(PLUGIN_ID);

  /* ── Storage ──
     convs: tableau de { convId, kind:'sent'|'received', peerId (sent) / routeTo (received),
                         displayName, messages:[{text,fromMe,ts}], ts }
  */
  function getConvs()      { return store.get('convs') || []; }
  function saveConvs(list) { store.set('convs', list); }

  function findConv(convId) {
    return getConvs().find(c => c.convId === convId) || null;
  }

  function upsertConv(conv) {
    const list = getConvs();
    const i = list.findIndex(c => c.convId === conv.convId);
    if (i >= 0) list[i] = conv; else list.unshift(conv);
    saveConvs(list);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    // Nouveau message entrant — on ne sait pas qui c'est
    if (payload.type === 'anon_msg') {
      const list = getConvs();
      let conv = list.find(c => c.convId === payload.convId);
      if (!conv) {
        // Créer une nouvelle conversation inconnue
        const n = list.filter(c => c.kind === 'received').length + 1;
        conv = {
          convId:      payload.convId,
          kind:        'received',
          routeTo:     fromId,   // pour router les réponses — jamais affiché
          displayName: 'Inconnu #' + payload.convId.slice(-4).toUpperCase(),
          messages:    [],
          ts:          Date.now(),
        };
        list.unshift(conv);
      }
      conv.messages.push({ text: payload.text, fromMe: false, ts: Date.now() });
      conv.ts = Date.now();
      saveConvs(list);
      frodon.showToast('🕵 Message de ' + conv.displayName);
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      return;
    }

    // Réponse à une conversation que j'ai initiée
    if (payload.type === 'anon_reply') {
      const list = getConvs();
      const conv = list.find(c => c.convId === payload.convId);
      if (conv) {
        conv.messages.push({ text: payload.text, fromMe: false, ts: Date.now() });
        conv.ts = Date.now();
        saveConvs(list);
        frodon.showToast('🕵 Réponse de ' + conv.displayName);
        frodon.refreshSphereTab(PLUGIN_ID);
        setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
      }
      return;
    }
  });

  /* ── Action sur profil ── */
  frodon.registerPeerAction(PLUGIN_ID, '🕵 Message anonyme', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    if (!peer) return;

    const convs = getConvs().filter(c => c.kind === 'sent' && c.peerId === peerId);

    const hint = frodon.makeElement('div', '');
    hint.style.cssText = 'font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:10px;padding:5px 9px;background:rgba(124,77,255,.06);border-radius:6px;border:1px solid rgba(124,77,255,.15)';
    hint.textContent = '👁 ' + peer.name + ' ne verra pas votre nom · chaque envoi = nouvelle conversation anonyme';
    container.appendChild(hint);

    if (convs.length) {
      const sec = frodon.makeElement('div', 'section-label', convs.length + ' conversation(s) — voir dans SPHERE');
      sec.style.cssText += ';margin-bottom:8px';
      container.appendChild(sec);
    }

    const ta = document.createElement('textarea');
    ta.className = 'f-input'; ta.rows = 3; ta.maxLength = 500;
    ta.placeholder = 'Votre message anonyme…';
    container.appendChild(ta);

    const btn = frodon.makeElement('button', 'plugin-action-btn acc', '🕵 Envoyer anonymement');
    btn.style.cssText += ';width:100%;margin-top:8px';
    btn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { frodon.showToast('Écrivez un message', true); return; }

      const convId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const list = getConvs();
      list.unshift({
        convId, kind: 'sent', peerId, displayName: peer.name,
        messages: [{ text, fromMe: true, ts: Date.now() }], ts: Date.now(),
      });
      saveConvs(list);

      frodon.sendDM(peerId, PLUGIN_ID, { type:'anon_msg', convId, text,
        _label:'🕵 Message anonyme reçu', _silent:false });
      frodon.showToast('🕵 Envoyé anonymement à ' + peer.name + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);

      // Réinitialiser le champ pour permettre un autre envoi
      ta.value = '';
      btn.textContent = '✓ Envoyé ! Envoyer un autre…';
      setTimeout(() => { btn.textContent = '🕵 Envoyer anonymement'; }, 1500);
    });
    container.appendChild(btn);
  });

  /* ── Rendu d'une conversation dépliable ── */
  function renderConvCard(container, conv) {
    const block = frodon.makeElement('div', '');
    block.style.cssText = 'border-bottom:1px solid var(--bdr)';

    // En-tête cliquable
    const hdr = frodon.makeElement('div', '');
    hdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;user-select:none';
    const col = conv.kind === 'sent' ? 'var(--acc)' : 'var(--acc2)';
    const ico = frodon.makeElement('span', '');
    ico.style.cssText = 'font-size:.85rem';
    ico.textContent = conv.kind === 'sent' ? '→' : '←';
    const nameEl = frodon.makeElement('strong', '');
    nameEl.style.cssText = 'font-size:.76rem;color:' + col + ';flex:1';
    nameEl.textContent = conv.displayName;
    const lastMsg = conv.messages[conv.messages.length - 1];
    const preview = frodon.makeElement('span', '');
    preview.style.cssText = 'font-size:.6rem;color:var(--txt3);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    preview.textContent = (lastMsg?.text || '').substring(0, 40);
    const ts = frodon.makeElement('span', 'mini-card-ts');
    ts.style.marginLeft = '4px';
    ts.textContent = frodon.formatTime(conv.ts);
    const chev = frodon.makeElement('span', '');
    chev.style.cssText = 'font-size:.6rem;color:var(--txt3);transition:transform .2s;flex-shrink:0';
    chev.textContent = '›';

    hdr.appendChild(ico); hdr.appendChild(nameEl); hdr.appendChild(preview);
    hdr.appendChild(ts); hdr.appendChild(chev);
    block.appendChild(hdr);

    // Corps (caché par défaut)
    const body = frodon.makeElement('div', '');
    body.style.cssText = 'display:none;border-top:1px solid var(--bdr)';

    // Bulles
    const bubbles = frodon.makeElement('div', '');
    bubbles.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px 12px;max-height:200px;overflow-y:auto';
    conv.messages.forEach(m => {
      const b = frodon.makeElement('div', '');
      b.style.cssText = m.fromMe
        ? 'align-self:flex-end;background:rgba(0,245,200,.1);border:1px solid rgba(0,245,200,.2);color:var(--acc);border-radius:10px 10px 2px 10px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word'
        : 'align-self:flex-start;background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);color:var(--txt);border-radius:10px 10px 10px 2px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word';
      b.textContent = m.text;
      bubbles.appendChild(b);
    });
    body.appendChild(bubbles);
    setTimeout(() => { bubbles.scrollTop = bubbles.scrollHeight; }, 0);

    // Champ réponse
    const replyRow = frodon.makeElement('div', '');
    replyRow.style.cssText = 'display:flex;gap:6px;padding:6px 10px 10px';
    const replyIn = document.createElement('input');
    replyIn.type = 'text'; replyIn.className = 'f-input';
    replyIn.placeholder = 'Répondre…'; replyIn.maxLength = 500;
    replyIn.style.flex = '1';

    const replyBtn = frodon.makeElement('button', 'plugin-action-btn acc', '↩');
    replyBtn.style.cssText += ';padding:0 12px;flex-shrink:0';

    const doReply = () => {
      const text = replyIn.value.trim(); if (!text) return;
      const list = getConvs();
      const c = list.find(x => x.convId === conv.convId);
      if (!c) return;
      const msg = { text, fromMe: true, ts: Date.now() };
      c.messages.push(msg); c.ts = Date.now();
      saveConvs(list);

      // Envoi DM selon la direction
      if (c.kind === 'sent') {
        frodon.sendDM(c.peerId, PLUGIN_ID, { type:'anon_reply', convId:c.convId, text, _silent:true });
      } else {
        frodon.sendDM(c.routeTo, PLUGIN_ID, { type:'anon_reply', convId:c.convId, text, _silent:true });
      }

      // Mise à jour DOM directe
      const b = frodon.makeElement('div', '');
      b.style.cssText = 'align-self:flex-end;background:rgba(0,245,200,.1);border:1px solid rgba(0,245,200,.2);color:var(--acc);border-radius:10px 10px 2px 10px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word';
      b.textContent = text;
      bubbles.appendChild(b);
      setTimeout(() => { bubbles.scrollTop = bubbles.scrollHeight; }, 0);
      replyIn.value = '';
      preview.textContent = text.substring(0, 40);
      ts.textContent = frodon.formatTime(Date.now());
    };

    replyIn.addEventListener('keydown', e => { if (e.key === 'Enter') doReply(); });
    replyBtn.addEventListener('click', doReply);
    replyRow.appendChild(replyIn); replyRow.appendChild(replyBtn);
    body.appendChild(replyRow);
    block.appendChild(body);

    // Toggle
    let open = false;
    hdr.addEventListener('click', () => {
      open = !open;
      body.style.display = open ? 'block' : 'none';
      chev.style.transform = open ? 'rotate(90deg)' : '';
      if (open) setTimeout(() => { bubbles.scrollTop = bubbles.scrollHeight; }, 30);
    });

    container.appendChild(block);
  }

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'known', label: '🔍 Connus',
      render(container) {
        const list = getConvs().filter(c => c.kind === 'sent');
        if (!list.length) {
          const em = frodon.makeElement('div', 'no-posts',
            'Aucun message envoyé.\nVisitez un profil pour écrire anonymement.');
          em.style.cssText += ';padding:20px 16px;white-space:pre-line;text-align:center';
          container.appendChild(em); return;
        }
        const info = frodon.makeElement('div', '');
        info.style.cssText = 'font-size:.58rem;color:var(--txt3);font-family:var(--mono);padding:5px 12px;border-bottom:1px solid var(--bdr)';
        info.textContent = '→ Conversations que vous avez initiées · vous connaissez le destinataire';
        container.appendChild(info);
        list.forEach(c => renderConvCard(container, c));
      }
    },
    {
      id: 'unknown', label: '👁 Inconnus',
      render(container) {
        const list = getConvs().filter(c => c.kind === 'received');
        if (!list.length) {
          const em = frodon.makeElement('div', 'no-posts',
            'Aucun message reçu.\nQuelqu\'un vous écrira anonymement bientôt…');
          em.style.cssText += ';padding:20px 16px;white-space:pre-line;text-align:center';
          container.appendChild(em); return;
        }
        const info = frodon.makeElement('div', '');
        info.style.cssText = 'font-size:.58rem;color:var(--txt3);font-family:var(--mono);padding:5px 12px;border-bottom:1px solid var(--bdr)';
        info.textContent = '← Conversations reçues · vous ne savez pas qui vous écrit';
        container.appendChild(info);
        list.forEach(c => renderConvCard(container, c));
      }
    },
  ]);

  return { destroy() {} };
});
