/**
 * YourMine Plugin — Anon Messenger v1.0
 * Messages anonymes P2P. L'initiateur connaît le destinataire, pas l'inverse.
 * category: social
 * website: https://github.com/theodoreyong9/YourMinedApp
 */
const plugin = (() => {
  const ID  = 'social.anon-messenger';
  const KEY = 'ym_anonmsg_';

  let _YM = null;
  let _hubBound = false;
  let _activeTab = 'inbox';
  let _container = null;

  /* ── Storage ──
     convs: { convId: { kind:'sent'|'received', peerId(sent)/routeUuid(received),
                        peerUuid(sent), displayName, msgs:[{text,fromMe,ts}], ts } }
  */
  function getConvs() { return JSON.parse(localStorage.getItem(KEY+'convs') || '{}'); }
  function saveConvs(c) { localStorage.setItem(KEY+'convs', JSON.stringify(c)); }

  function send(peerId, payload) { _YM.sendTo(peerId, { plugin: ID, ...payload }); }
  function resolveName(peerId, uuid) {
    // 1. nearCache by peerId
    const byPeer = _YM.nearPeers?.find(e => e.peerId === peerId);
    if (byPeer?.profile?.name) return byPeer.profile.name;
    // 2. nearCache by uuid
    const byUuid = _YM.nearPeers?.find(e => e.uuid === uuid);
    if (byUuid?.profile?.name) return byUuid.profile.name;
    // 3. contacts
    const contact = _YM.contacts?.find(c => c.uuid === uuid);
    if (contact) return contact.nickname || contact.name || null;
    return null;
  }
  function peerName(peerId) {
    return resolveName(peerId, null) || 'Pair';
  }
  function peerNameFromUuid(peerUuid, peerId) {
    return resolveName(peerId, peerUuid) || null;
  }

  function onMsg(data) {
    if (data.plugin !== ID) return;
    const myUuid = _YM.profile.uuid;
    if (data.to && data.to !== myUuid) return;

    if (data.type === 'anon_msg') {
      const convs = getConvs();
      let conv = convs[data.convId];
      if (!conv) {
        const n = Object.values(convs).filter(c=>c.kind==='received').length + 1;
        conv = convs[data.convId] = {
          convId: data.convId, kind: 'received',
          routePeerId: data.from,    // pour router les réponses — jamais affiché
          routeUuid: data.fromUuid,
          displayName: '👁 Inconnu #' + data.convId.slice(-4).toUpperCase(),
          msgs: [], ts: Date.now(),
        };
      }
      conv.msgs.push({ text: data.text, fromMe: false, ts: Date.now() });
      conv.ts = Date.now();
      saveConvs(convs);
      _YM.notify(ID);
      _YM.toast('🕵 Message de ' + conv.displayName);
      rerender();
      return;
    }

    if (data.type === 'anon_reply') {
      const convs = getConvs();
      const conv = convs[data.convId];
      if (conv) {
        conv.msgs.push({ text: data.text, fromMe: false, ts: Date.now() });
        conv.ts = Date.now();
        saveConvs(convs);
        _YM.notify(ID);
        _YM.toast('🕵 Réponse de ' + conv.displayName);
        rerender();
      }
    }
  }

  function rerender() {
    if (_container) renderInto(_container);
  }

  function renderInto(container) {
    _container = container;
    container.innerHTML = '';

    const convs = getConvs();
    const sent     = Object.values(convs).filter(c=>c.kind==='sent').sort((a,b)=>b.ts-a.ts);
    const received = Object.values(convs).filter(c=>c.kind==='received').sort((a,b)=>b.ts-a.ts);
    const unreadSent = sent.reduce((s,c)=>s+c.msgs.filter(m=>!m.fromMe&&!m.read).length,0);
    const unreadRecv = received.reduce((s,c)=>s+c.msgs.filter(m=>!m.fromMe&&!m.read).length,0);

    // Tab bar
    const tabs = [['sent','→ Envoyés'+(unreadSent?` (${unreadSent})`:'')], ['inbox','← Reçus'+(unreadRecv?` (${unreadRecv})`:'')]];
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;border-bottom:1px solid var(--border)';
    tabs.forEach(([id,label]) => {
      const btn = document.createElement('button');
      btn.style.cssText = `flex:1;padding:10px;font-size:.74rem;background:none;border:none;cursor:pointer;color:${_activeTab===id?'var(--accent)':'var(--text-2)'};border-bottom:2px solid ${_activeTab===id?'var(--accent)':'transparent'};font-weight:${_activeTab===id?'700':'400'}`;
      btn.textContent = label;
      btn.onclick = () => { _activeTab = id; rerender(); };
      tabBar.appendChild(btn);
    });
    container.appendChild(tabBar);

    const body = document.createElement('div');
    container.appendChild(body);

    const list = _activeTab === 'sent' ? sent : received;
    if (!list.length) {
      body.innerHTML = `<div style="text-align:center;padding:36px 20px;color:var(--text-2);font-size:.78rem;line-height:1.9"><div style="font-size:2.2rem;margin-bottom:8px">🕵</div>${_activeTab==='sent'?'Aucun message envoyé.<br><small style="color:var(--text-3)">Visitez un profil → plug Anon Messenger</small>':'Aucun message reçu.<br><small style="color:var(--text-3)">Quelqu\'un vous écrira anonymement…</small>'}</div>`;
      return;
    }

    list.forEach(conv => renderConvCard(body, conv));
  }

  function renderConvCard(container, conv) {
    const block = document.createElement('div');
    block.style.cssText = 'border-bottom:1px solid var(--border)';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;user-select:none';
    const col = conv.kind==='sent' ? 'var(--accent)' : 'var(--accent-2,#7c4dff)';
    const ico = document.createElement('div');
    ico.style.cssText = `width:36px;height:36px;border-radius:50%;background:${conv.kind==='sent'?'rgba(0,212,170,.12)':'rgba(124,77,255,.12)'};border:1px solid ${conv.kind==='sent'?'rgba(0,212,170,.3)':'rgba(124,77,255,.3)'};display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0`;
    ico.textContent = conv.kind==='sent' ? '→' : '←';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    const lastMsg = conv.msgs[conv.msgs.length-1];
    const unread = conv.msgs.filter(m=>!m.fromMe&&!m.read).length;
    // Resolve live name: nearPeers > stored peerProfile > displayName
    let liveName = conv.displayName;
    if (conv.kind === 'sent') {
      const freshName = peerNameFromUuid(conv.peerUuid, conv.peerId)
        || conv.peerProfile?.name;
      if (freshName) {
        liveName = freshName;
        if (liveName !== conv.displayName) {
          const cs = getConvs(); if (cs[conv.convId]) { cs[conv.convId].displayName = liveName; saveConvs(cs); }
        }
      }
    }
    info.innerHTML = `<div style="font-size:.78rem;font-weight:700;color:${col}">${liveName}</div><div style="font-size:.65rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(lastMsg?.text||'').substring(0,50)}</div>`;
    // Click on avatar OR name → open profile (for sent convs)
    if (conv.kind === 'sent' && conv.peerUuid) {
      const openProf = e => {
        e.stopPropagation();
        const entry = _YM.nearPeers?.find(p => p.uuid === conv.peerUuid);
        const profile = entry?.profile || conv.peerProfile || null;
        _YM.openProfile(conv.peerUuid, profile, entry || null);
      };
      ico.style.cursor = 'pointer';
      ico.title = 'Voir le profil';
      ico.addEventListener('click', openProf);
      // Also make the name label clickable
      info.style.cursor = 'pointer';
      info.title = 'Voir le profil';
      info.addEventListener('click', openProf);
    }
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0';
    if (conv.msgs.length) {
      const ts = document.createElement('div');
      ts.style.cssText = 'font-size:.58rem;color:var(--text-3);font-family:var(--font-mono)';
      ts.textContent = new Date(conv.ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      right.appendChild(ts);
    }
    if (unread) {
      const badge = document.createElement('div');
      badge.style.cssText = 'background:var(--accent);color:#000;font-size:.58rem;font-weight:700;border-radius:99px;padding:1px 6px;font-family:var(--font-mono)';
      badge.textContent = unread;
      right.appendChild(badge);
    }
    hdr.appendChild(ico); hdr.appendChild(info); hdr.appendChild(right);
    block.appendChild(hdr);

    const bodyEl = document.createElement('div');
    bodyEl.style.display = 'none';
    bodyEl.style.borderTop = '1px solid var(--border)';

    // Mark as read on open
    hdr.addEventListener('click', () => {
      const open = bodyEl.style.display !== 'none';
      bodyEl.style.display = open ? 'none' : 'block';
      if (!open) {
        const convs = getConvs();
        if (convs[conv.convId]) {
          convs[conv.convId].msgs.forEach(m => { if (!m.fromMe) m.read = true; });
          saveConvs(convs);
        }
        renderBubbles();
        bubbles.scrollTop = bubbles.scrollHeight;
      }
    });

    const bubbles = document.createElement('div');
    bubbles.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:10px 14px;max-height:220px;overflow-y:auto';

    function renderBubbles() {
      bubbles.innerHTML = '';
      const fresh = getConvs()[conv.convId];
      const msgs = fresh?.msgs || conv.msgs;
      msgs.forEach(m => {
        const b = document.createElement('div');
        b.style.cssText = m.fromMe
          ? 'align-self:flex-end;background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.2);color:var(--accent);border-radius:10px 10px 2px 10px;padding:6px 10px;font-size:.74rem;max-width:85%;word-break:break-word'
          : 'align-self:flex-start;background:rgba(124,77,255,.08);border:1px solid rgba(124,77,255,.18);color:var(--text-1);border-radius:10px 10px 10px 2px;padding:6px 10px;font-size:.74rem;max-width:85%;word-break:break-word';
        b.textContent = m.text;
        bubbles.appendChild(b);
      });
      setTimeout(() => { bubbles.scrollTop = bubbles.scrollHeight; }, 0);
    }
    bodyEl.appendChild(bubbles);

    // Reply row
    const replyRow = document.createElement('div');
    replyRow.style.cssText = 'display:flex;gap:6px;padding:6px 10px 10px';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Répondre…'; inp.maxLength = 500;
    inp.style.cssText = 'flex:1;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:.74rem;color:var(--text-1);outline:none';
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn-accent'; sendBtn.textContent = '↗'; sendBtn.style.padding = '6px 12px';

    const doReply = () => {
      const text = inp.value.trim(); if (!text) return;
      const convs = getConvs();
      const c2 = convs[conv.convId]; if (!c2) return;
      c2.msgs.push({ text, fromMe: true, ts: Date.now() });
      c2.ts = Date.now();
      saveConvs(convs);
      if (c2.kind === 'sent') {
        send(c2.peerId, { type:'anon_reply', convId: conv.convId, text, to: c2.peerUuid });
      } else {
        send(c2.routePeerId, { type:'anon_reply', convId: conv.convId, text, to: c2.routeUuid });
      }
      inp.value = '';
      renderBubbles();
    };
    inp.addEventListener('keydown', e => { if (e.key==='Enter') doReply(); });
    sendBtn.addEventListener('click', doReply);
    replyRow.appendChild(inp); replyRow.appendChild(sendBtn);
    bodyEl.appendChild(replyRow);
    block.appendChild(bodyEl);
    container.appendChild(block);
  }

  return {
    name: 'social.anon-messenger',
    icon: '🕵',
    description: 'Messages anonymes P2P. L\'initiateur connaît le destinataire, l\'autre non.',

    init(YM) {
      _YM = YM;
      if (YM.onData) YM.onData('social.anon-messenger', onMsg);
    },

    render(container, YM) {
      _YM = YM;
      if (!_hubBound) { YM.onHub(onMsg); _hubBound = true; }
      if (YM.onData) YM.onData('social.anon-messenger', onMsg);
      _activeTab = 'inbox';
      renderInto(container);
    },

    couple(peerId, container, YM) {
      _YM = YM;
      if (!_hubBound) { YM.onHub(onMsg); _hubBound = true; }
      if (YM.onData) YM.onData('social.anon-messenger', onMsg);
      // Resolve peer from nearPeers (full entry with profile) or peers snapshot
      const nearEntry = YM.nearPeers?.find(e => e.peerId === peerId);
      const peersPeer = YM.peers?.find(p => p.peerId === peerId);
      const peerUuid = nearEntry?.uuid || peersPeer?.uuid;
      const peerProfile = nearEntry?.profile || null;
      const pn = peerProfile?.name || peersPeer?.name || resolveName(peerId, peerUuid) || 'Pair';

      // Conversation existantes avec ce pair
      const convs = getConvs();
      const existing = Object.values(convs).filter(c => c.kind==='sent' && c.peerId===peerId);

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:.65rem;color:var(--text-2);padding:5px 10px 10px;background:rgba(124,77,255,.06);border:1px solid rgba(124,77,255,.15);border-radius:8px;margin-bottom:10px';
      hint.textContent = `👁 ${pn} ne verra pas votre nom`;
      container.appendChild(hint);

      if (existing.length) {
        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:.62rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px';
        lbl.textContent = 'Conversations existantes';
        container.appendChild(lbl);
        existing.forEach(conv => {
          const row = document.createElement('div');
          row.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-size:.74rem;color:var(--accent)';
          const last = conv.msgs[conv.msgs.length-1];
          row.textContent = '→ Conv #' + conv.convId.slice(-4).toUpperCase() + ' — ' + (last?.text||'').substring(0,40) + '…';
          container.appendChild(row);
        });
      }

      // Nouvelle conversation
      const ta = document.createElement('textarea');
      ta.rows = 3; ta.maxLength = 500; ta.placeholder = 'Votre message anonyme…';
      ta.style.cssText = 'width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:.76rem;color:var(--text-1);resize:none;box-sizing:border-box;outline:none;margin-top:4px';
      container.appendChild(ta);

      const btn = document.createElement('button');
      btn.className = 'btn-accent'; btn.textContent = '🕵 Envoyer anonymement'; btn.style.cssText = 'width:100%;margin-top:8px';
      btn.addEventListener('click', () => {
        const text = ta.value.trim();
        if (!text) { _YM.toast('Écrivez un message', 'error'); return; }
        const convId = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
        const convs2 = getConvs();
        convs2[convId] = {
          convId, kind:'sent', peerId, peerUuid,
          displayName: pn,
          peerProfile: peerProfile,
          msgs: [{ text, fromMe: true, ts: Date.now() }], ts: Date.now(),
        };
        saveConvs(convs2);
        send(peerId, { type:'anon_msg', convId, text, fromUuid: YM.profile.uuid, to: peerUuid });
        _YM.toast('🕵 Envoyé anonymement à ' + pn + ' !');
        ta.value = ''; btn.textContent = '✓ Envoyé !';
        setTimeout(() => { btn.textContent = '🕵 Envoyer anonymement'; }, 1500);
      });
      container.appendChild(btn);
    },
  };
})();
