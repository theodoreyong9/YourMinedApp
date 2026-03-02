/**
 * FRODON PLUGIN — Cherche un emploi  v1.2.0
 * Badge auto-actif si jobTitle renseigné. Pas de toggle.
 */
frodon.register({
  id: 'jobseeker',
  name: 'Cherche un emploi',
  version: '1.2.0',
  author: 'frodon-community',
  description: 'Affichez que vous cherchez un emploi et recevez des opportunités.',
  icon: '💼',
}, () => {

  const PLUGIN_ID = 'jobseeker';
  const store = frodon.storage(PLUGIN_ID);

  // Badge is active whenever jobTitle is filled
  function getMyBadge() { return store.get('badge') || null; }
  function isActive() { const b = getMyBadge(); return !!(b && b.jobTitle); }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type === 'request_badge') {
      if(isActive()) {
        frodon.sendDM(fromId, PLUGIN_ID, { type: 'badge_data', badge: getMyBadge(), _silent: true });
      }
      return;
    }
    if(payload.type === 'badge_data') {
      store.set('peer_badge_' + fromId, payload.badge);
      frodon.refreshPeerModal(fromId);
      return;
    }
    if(payload.type === 'opportunity') {
      const peer = frodon.getPeer(fromId);
      const opps = store.get('opportunities') || [];
      opps.unshift({ fromId, fromName: peer?.name || '?', message: (payload.message||'').substring(0,500), ts: Date.now() });
      if(opps.length > 50) opps.length = 50;
      store.set('opportunities', opps);
      frodon.showToast('💼 Opportunité de ' + (peer?.name||'?') + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '💼 Emploi', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;
    const peerBadge = store.get('peer_badge_' + peerId) || null;

    if(!peerBadge) {
      frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_badge', _silent: true });
      const loading = frodon.makeElement('div', '');
      loading.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:4px 0 8px';
      loading.textContent = '⌛ Vérification du badge…';
      container.appendChild(loading);
      return;
    }

    const card = frodon.makeElement('div', '');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(124,77,255,.1),rgba(0,245,200,.07));border:1px solid rgba(124,77,255,.3);border-radius:10px;padding:12px;margin-bottom:10px';
    const ctitle = frodon.makeElement('div','');
    ctitle.style.cssText = 'font-size:.65rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px';
    ctitle.textContent = '💼 EN RECHERCHE D\'EMPLOI'; card.appendChild(ctitle);
    const cjob = frodon.makeElement('div','');
    cjob.style.cssText = 'font-size:.9rem;font-weight:700;color:var(--txt);margin-bottom:4px';
    cjob.textContent = peerBadge.jobTitle || 'Poste non précisé'; card.appendChild(cjob);
    if(peerBadge.skills){ const s=frodon.makeElement('div',''); s.style.cssText='font-size:.66rem;color:var(--txt2);margin-bottom:4px'; s.textContent='🛠 '+peerBadge.skills; card.appendChild(s); }
    if(peerBadge.location){ const l=frodon.makeElement('div',''); l.style.cssText='font-size:.66rem;color:var(--txt2)'; l.textContent='📍 '+peerBadge.location; card.appendChild(l); }
    if(peerBadge.contact){ const c=frodon.makeElement('div',''); c.style.cssText='font-size:.66rem;color:var(--acc);margin-top:4px'; c.textContent='✉ '+peerBadge.contact; card.appendChild(c); }
    container.appendChild(card);

    const ta = document.createElement('textarea');
    ta.className='f-input'; ta.rows=3; ta.maxLength=500;
    ta.placeholder='Décrivez une opportunité ou partagez un contact…'; ta.style.marginBottom='8px';
    container.appendChild(ta);

    const sendBtn = frodon.makeElement('button','plugin-action-btn acc','💼 Envoyer une opportunité');
    sendBtn.addEventListener('click', () => {
      const msg = ta.value.trim();
      if(!msg){ frodon.showToast('Écrivez un message', true); return; }
      frodon.sendDM(peerId, PLUGIN_ID, { type:'opportunity', message:msg, _label:'💼 Opportunité reçue' });
      frodon.showToast('💼 Opportunité envoyée à '+peerName+' !');
      // Save to sent history for our own "Envoyés" tab
      const peer = frodon.getPeer(peerId);
      const sent = store.get('sent_opps') || [];
      sent.unshift({toId:peerId, toName:peerName, toAvatar:peer?.avatar||'', badge:peerBadge, message:msg, ts:Date.now()});
      if(sent.length>50) sent.length=50;
      store.set('sent_opps', sent);
      frodon.addFeedEvent(peerId, {
        pluginId: PLUGIN_ID, pluginName:'Cherche un emploi', pluginIcon:'💼', peerName,
        text: '→ '+(peerBadge?.jobTitle||'Opportunité envoyée')+(peerBadge?.skills?' · '+peerBadge.skills:''),
      });
      frodon.refreshSphereTab(PLUGIN_ID);
      sendBtn.textContent='✓ Envoyé !'; sendBtn.disabled=true; ta.disabled=true;
    });
    container.appendChild(sendBtn);
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    if(!isActive()) return;
    const badge = getMyBadge();
    const card = frodon.makeElement('div','');
    card.style.cssText='background:linear-gradient(135deg,rgba(124,77,255,.12),rgba(0,245,200,.08));border:1px solid rgba(124,77,255,.35);border-radius:10px;padding:10px 12px;margin-top:6px';
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.62rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px'; t.textContent='💼 EN RECHERCHE D\'EMPLOI'; card.appendChild(t);
    const j=frodon.makeElement('div',''); j.style.cssText='font-size:.85rem;font-weight:700;color:var(--txt)'; j.textContent=badge.jobTitle||''; card.appendChild(j);
    container.appendChild(card);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id:'my_badge', label:'💼 Mon badge',
      settings: true, // dans ⚙ seulement
      render(container) {
        const badge = getMyBadge();
        const form = frodon.makeElement('div',''); form.style.cssText='padding:10px 10px 12px';

        const status = frodon.makeElement('div','');
        status.style.cssText='font-size:.7rem;font-family:var(--mono);margin-bottom:10px;padding:6px 8px;border-radius:6px;border:1px solid';
        if(isActive()){
          status.textContent='● Badge actif — visible par les recruteurs à proximité';
          status.style.color='var(--ok)'; status.style.borderColor='rgba(0,229,122,.25)'; status.style.background='rgba(0,229,122,.06)';
        } else {
          status.textContent='○ Renseignez un poste pour activer votre badge';
          status.style.color='var(--txt3)'; status.style.borderColor='var(--bdr)'; status.style.background='transparent';
        }
        form.appendChild(status);

        const fields=[
          {key:'jobTitle', label:'Poste recherché *', placeholder:'ex: Développeur Front-end…'},
          {key:'skills',   label:'Compétences clés',   placeholder:'ex: React, Figma, Python…'},
          {key:'location', label:'Localisation souhaitée', placeholder:'ex: Paris, Remote…'},
          {key:'contact',  label:'Contact / lien CV',  placeholder:'email ou URL'},
        ];
        const inputs={};
        fields.forEach(f => {
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.62rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:10px'; lbl.textContent=f.label; form.appendChild(lbl);
          const inp=document.createElement('input'); inp.className='f-input'; inp.placeholder=f.placeholder; inp.maxLength=100; inp.value=badge?.[f.key]||''; inputs[f.key]=inp; form.appendChild(inp);
        });
        const save=frodon.makeElement('button','plugin-action-btn acc','💾 Enregistrer'); save.style.cssText+=';width:100%;margin-top:14px';
        save.addEventListener('click',()=>{
          const jobTitle=inputs.jobTitle.value.trim();
          if(!jobTitle){frodon.showToast('Le poste est obligatoire',true);return;}
          store.set('badge',{jobTitle,skills:inputs.skills.value.trim(),location:inputs.location.value.trim(),contact:inputs.contact.value.trim()});
          frodon.showToast('💼 Badge enregistré — maintenant actif !');
          frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
        });
        form.appendChild(save); container.appendChild(form);
      }
    },
    {
      id:'opportunities', label:'📬 Reçues',
      render(container) {
        const opps=store.get('opportunities')||[];
        if(!opps.length){ const em=frodon.makeElement('div','no-posts','Aucune opportunité reçue.'); em.style.padding='20px 16px'; container.appendChild(em); return; }
        opps.slice(0,20).forEach(o=>{
          const card=frodon.makeElement('div','mini-card'); card.style.margin='6px 8px 0';
          const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:5px';
          const name=frodon.makeElement('strong','',o.fromName); name.style.cssText='font-size:.74rem;color:var(--acc2);cursor:pointer';
          name.addEventListener('click',()=>frodon.openPeer(o.fromId));
          hdr.appendChild(name); hdr.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(o.ts)));
          card.appendChild(hdr); card.appendChild(frodon.makeElement('div','mini-card-body',o.message));
          container.appendChild(card);
        });
      }
    },
    {
      id:'sent', label:'📤 Envoyés',
      render(container) {
        const sent=store.get('sent_opps')||[];
        if(!sent.length){ const em=frodon.makeElement('div','no-posts','Aucune opportunité envoyée.'); em.style.padding='20px 16px'; container.appendChild(em); return; }
        sent.slice(0,20).forEach(s=>{
          const card=frodon.makeElement('div','mini-card'); card.style.margin='6px 8px 0';
          const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px';
          const nameWrap=frodon.makeElement('div',''); nameWrap.style.cssText='display:flex;align-items:center;gap:6px;min-width:0';
          const av=frodon.safeImg(s.toAvatar||'',frodon.makeElement('span','','').textContent,'');
          // Build avatar as initials circle placeholder
          const avEl=document.createElement('div'); avEl.style.cssText='width:22px;height:22px;border-radius:50%;flex-shrink:0;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.3);display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--acc2);font-family:var(--mono)';
          avEl.textContent=(s.toName||'?')[0].toUpperCase();
          const name=frodon.makeElement('strong','',s.toName||'?'); name.style.cssText='font-size:.74rem;color:var(--acc2);cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          name.addEventListener('click',()=>frodon.openPeer(s.toId));
          nameWrap.appendChild(avEl); nameWrap.appendChild(name);
          hdr.appendChild(nameWrap); hdr.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(s.ts)));
          card.appendChild(hdr);
          if(s.badge){
            const badge=frodon.makeElement('div',''); badge.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);margin-bottom:4px';
            badge.textContent='💼 '+s.badge.jobTitle+(s.badge.skills?' · '+s.badge.skills:'');
            card.appendChild(badge);
          }
          card.appendChild(frodon.makeElement('div','mini-card-body','"'+s.message+'"'));
          container.appendChild(card);
        });
      }
    },
  ]);

  frodon.onPeerAppear(peer => {
    if(isActive()) {
      frodon.sendDM(peer.peerId, PLUGIN_ID, {type:'badge_data', badge:getMyBadge(), _silent:true});
    }
  });

  return { destroy() {} };
});
