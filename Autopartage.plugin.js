/**
 * FRODON PLUGIN — Autopartage v3.0.0
 *
 * ⚙ Paramètres : configurer son profil (conducteur ou passager, trajet)
 *
 * SPHERE onglet "Trajets" :
 *   - Si passager → voit les conducteurs disponibles autour, peut candidater + message
 *   - Si conducteur → voit les passagers disponibles autour, peut envoyer un message
 *
 * SPHERE onglet "Réceptions" :
 *   - Tous : messages reçus groupés par profil, avec réponse possible
 */
frodon.register({
  id: 'autopartage',
  name: 'Autopartage',
  version: '3.0.0',
  author: 'frodon-community',
  description: 'Proposez ou trouvez un trajet avec les pairs à proximité.',
  icon: '🚗',
}, () => {

  const PLUGIN_ID = 'autopartage';
  const store = frodon.storage(PLUGIN_ID);

  function getMyProfile() { return store.get('profile') || null; }

  function profileActive(p) {
    if(!p) return false;
    if(p.departureTime === 'now') return Date.now() - p.createdAt < 8*60*60*1000;
    return new Date(p.departureTime) > new Date(Date.now() - 30*60*1000);
  }

  function getPeerProfile(pid) { return store.get('peer_ap_'+pid) || null; }

  // Messages reçus : [{fromId, fromName, fromAvatar, message, tripDestination, ts}]
  function getMessages() { return store.get('messages') || []; }

  // Candidatures envoyées : {peerId: true}
  function getApplied() { return store.get('applied') || {}; }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'profile_data') {
      store.set('peer_ap_'+fromId, {profile:payload.profile, ts:Date.now()});
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'request_profile') {
      const p = getMyProfile();
      if(p && profileActive(p))
        frodon.sendDM(fromId, PLUGIN_ID, {type:'profile_data', profile:p, _silent:true});
    }

    if(payload.type === 'message') {
      const peer = frodon.getPeer(fromId);
      const msgs = getMessages();
      msgs.unshift({
        fromId, fromName:peer?.name||'?', fromAvatar:peer?.avatar||'',
        message:payload.message, tripDestination:payload.tripDestination||'',
        ts:Date.now(), read:false
      });
      if(msgs.length > 100) msgs.length = 100;
      store.set('messages', msgs);
      frodon.showToast('🚗 Message de '+(peer?.name||'Pair')+' pour votre trajet');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'cancel_profile') {
      store.del('peer_ap_'+fromId);
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'trajets', label: '🚗 Trajets',
      render(container) {
        const myProfile = getMyProfile();
        const amDriver = myProfile?.role === 'driver';
        const amPassenger = myProfile?.role === 'passenger';

        if(!myProfile || !profileActive(myProfile)) {
          _emptyState(container, '🚗', 'Configurez votre trajet dans les paramètres ⚙\npour voir les pairs compatibles.');
          return;
        }

        // Collecter les profils des pairs compatibles
        const peers = _getAllPeerProfiles().filter(p => {
          if(!profileActive(p.profile)) return false;
          // Un conducteur voit les passagers, un passager voit les conducteurs
          return amDriver ? p.profile.role === 'passenger' : p.profile.role === 'driver';
        });

        if(!peers.length) {
          _emptyState(container, '🚗', amDriver
            ? 'Aucun passager à proximité pour l\'instant.'
            : 'Aucun conducteur disponible à proximité.');
          return;
        }

        const applied = getApplied();
        const label = amDriver ? 'Passagers qui cherchent un trajet' : 'Conducteurs disponibles';
        _sectionLabel(container, label);

        peers.forEach(({peerId, profile}) => {
          const peer = frodon.getPeer(peerId);
          const name = peer?.name || peerId.substring(0,8)+'…';
          const hasApplied = applied[peerId];

          const card = frodon.makeElement('div','');
          card.style.cssText = 'background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;overflow:hidden';

          // Header cliquable → profil
          const hdr = frodon.makeElement('div','');
          hdr.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click', () => frodon.openPeer(peerId));

          const av = frodon.makeElement('div','');
          av.style.cssText = 'width:36px;height:36px;border-radius:50%;background:rgba(0,232,122,.15);border:1px solid rgba(0,232,122,.3);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono);font-weight:700';
          av.textContent = name[0].toUpperCase();

          const info = frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const nameEl = frodon.makeElement('div',''); nameEl.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; nameEl.textContent=name;
          const destEl = frodon.makeElement('div',''); destEl.style.cssText='font-size:.68rem;color:var(--acc);margin-top:1px'; destEl.textContent='→ '+profile.destination;
          info.appendChild(nameEl); info.appendChild(destEl);

          const metaEl = frodon.makeElement('div',''); metaEl.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);text-align:right';
          metaEl.textContent = profile.departureTime==='now'?'Maintenant':new Date(profile.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'});

          hdr.appendChild(av); hdr.appendChild(info); hdr.appendChild(metaEl);
          card.appendChild(hdr);

          // Détails
          const body = frodon.makeElement('div',''); body.style.cssText='padding:8px 12px 10px';
          const details = frodon.makeElement('div',''); details.style.cssText='font-size:.63rem;color:var(--txt2);font-family:var(--mono);line-height:1.8;margin-bottom:8px';
          let dHtml = '';
          if(profile.from) dHtml += '📍 Depuis : '+profile.from+'<br>';
          if(profile.role==='driver') dHtml += '💺 '+profile.seats+' place'+(profile.seats>1?'s':'');
          if(profile.note) dHtml += (dHtml?'<br>':'')+'📝 '+profile.note;
          if(dHtml) { details.innerHTML=dHtml; body.appendChild(details); }

          // Zone message + bouton
          const ta = document.createElement('textarea');
          ta.className='f-input'; ta.rows=2; ta.maxLength=300;
          ta.placeholder = amPassenger ? 'Message au conducteur (optionnel)…' : 'Message au passager…';
          ta.style.marginBottom='6px';
          body.appendChild(ta);

          const btnLabel = amPassenger ? (hasApplied ? '✓ Candidature envoyée' : '🚗 Candidater') : '💬 Envoyer un message';
          const btn = frodon.makeElement('button','plugin-action-btn '+(hasApplied?'':'acc'), btnLabel);
          if(hasApplied && amPassenger) btn.disabled=true;

          btn.addEventListener('click', () => {
            const msg = ta.value.trim();
            if(amPassenger && !hasApplied && !msg && !confirm('Envoyer sans message ?')) return;
            setTimeout(()=>{
              frodon.sendDM(peerId, PLUGIN_ID, {
                type:'message',
                message: msg || (amPassenger ? 'Je suis intéressé par votre trajet.' : 'Je suis intéressé.'),
                tripDestination: profile.destination,
                _label: '🚗 '+(amPassenger?'Candidature':'Message')+' autopartage'
              });
            }, 300);
            if(amPassenger) {
              const applied2 = getApplied(); applied2[peerId]=true; store.set('applied', applied2);
              btn.textContent='✓ Candidature envoyée'; btn.disabled=true;
            } else {
              btn.textContent='✓ Envoyé'; btn.disabled=true;
            }
            frodon.showToast('🚗 Message envoyé à '+name+' !');
            ta.value='';
          });

          body.appendChild(btn); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },

    {
      id: 'reception', label: '📬 Réceptions',
      render(container) {
        const msgs = getMessages();
        if(!msgs.length) {
          _emptyState(container, '📬', 'Aucun message reçu.');
          return;
        }

        // Marquer comme lus
        msgs.forEach(m => m.read=true); store.set('messages', msgs);

        // Grouper par fromId
        const grouped = {};
        msgs.forEach(m => {
          if(!grouped[m.fromId]) grouped[m.fromId]={fromId:m.fromId,fromName:m.fromName,fromAvatar:m.fromAvatar,messages:[]};
          grouped[m.fromId].messages.push(m);
        });

        Object.values(grouped).forEach(group => {
          const card = frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:6px 8px 0;overflow:hidden';

          // Header cliquable
          const hdr = frodon.makeElement('div','');
          hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click',()=>frodon.openPeer(group.fromId));
          const av=frodon.makeElement('div','');
          av.style.cssText='width:32px;height:32px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.3);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;font-family:var(--mono);font-weight:700';
          av.textContent=group.fromName[0].toUpperCase();
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);flex:1'; nameEl.textContent=group.fromName;
          const countEl=frodon.makeElement('div',''); countEl.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono)'; countEl.textContent=group.messages.length+' msg';
          hdr.appendChild(av); hdr.appendChild(nameEl); hdr.appendChild(countEl);
          card.appendChild(hdr);

          // Messages
          const body=frodon.makeElement('div',''); body.style.cssText='padding:8px 12px';
          group.messages.slice(0,5).forEach(m=>{
            const row=frodon.makeElement('div',''); row.style.cssText='padding:5px 0;border-bottom:1px solid var(--bdr)';
            if(m.tripDestination){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);margin-bottom:2px'; d.textContent='Trajet → '+m.tripDestination; row.appendChild(d);}
            const txt=frodon.makeElement('div',''); txt.style.cssText='font-size:.7rem;color:var(--txt)'; txt.textContent=m.message; row.appendChild(txt);
            const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);margin-top:2px'; ts.textContent=frodon.formatTime(m.ts); row.appendChild(ts);
            body.appendChild(row);
          });

          // Répondre
          const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=300;
          ta.placeholder='Votre réponse…'; ta.style.cssText+='margin-top:8px;margin-bottom:6px';
          const replyBtn=frodon.makeElement('button','plugin-action-btn acc','💬 Répondre');
          replyBtn.addEventListener('click',()=>{
            const msg=ta.value.trim(); if(!msg){frodon.showToast('Écrivez un message',true);return;}
            setTimeout(()=>{
              frodon.sendDM(group.fromId,PLUGIN_ID,{type:'message',message:msg,_label:'🚗 Réponse autopartage'});
            },300);
            ta.value=''; replyBtn.textContent='✓ Envoyé'; replyBtn.disabled=true;
            frodon.showToast('🚗 Réponse envoyée à '+group.fromName+' !');
          });
          body.appendChild(ta); body.appendChild(replyBtn); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },

    {
      id: 'settings', label: '⚙ Mon profil',
      settings: true,
      render(container) {
        const p = getMyProfile();
        if(p && profileActive(p)) {
          const statusCard=frodon.makeElement('div','');
          statusCard.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.1),rgba(0,245,200,.07));border:1px solid rgba(0,232,122,.3);border-radius:10px;margin:8px;padding:12px';
          const dot=frodon.makeElement('div',''); dot.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);margin-bottom:5px'; dot.textContent='● Profil actif';
          const dest=frodon.makeElement('div',''); dest.style.cssText='font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:3px'; dest.textContent=(p.role==='driver'?'🚗':'🙋')+' → '+p.destination;
          const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono)';
          meta.textContent=(p.departureTime==='now'?'Maintenant':new Date(p.departureTime).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}))+(p.role==='driver'?' · '+p.seats+' place'+(p.seats>1?'s':''):'');
          const cancelBtn=frodon.makeElement('button','plugin-action-btn'); cancelBtn.style.cssText+=';color:var(--warn);border-color:rgba(255,85,85,.3);margin-top:8px;font-size:.68rem;width:100%'; cancelBtn.textContent='✕ Annuler le trajet';
          cancelBtn.addEventListener('click',()=>{
            store.del('profile'); store.del('applied');
            _broadcastCancel();
            frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
          });
          statusCard.appendChild(dot); statusCard.appendChild(dest); statusCard.appendChild(meta); statusCard.appendChild(cancelBtn);
          container.appendChild(statusCard);
        }
        _renderForm(container, p);
      }
    },
  ]);

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const p=getMyProfile(); if(!p||!profileActive(p)) return;
    const card=frodon.makeElement('div',''); card.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.1),rgba(0,245,200,.07));border:1px solid rgba(0,232,122,.3);border-radius:10px;padding:8px 12px;margin-top:5px';
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px'; t.textContent=p.role==='driver'?'🚗 Conducteur actif':'🙋 Cherche un trajet';
    const d=frodon.makeElement('div',''); d.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt)'; d.textContent='→ '+p.destination;
    card.appendChild(t); card.appendChild(d); container.appendChild(card);
  });

  function _getAllPeerProfiles() {
    const result=[];
    for(const key of Object.keys(localStorage)){
      if(!key.startsWith('frd_autopartage_peer_ap_')) continue;
      try{
        const pid=key.replace('frd_autopartage_peer_ap_','');
        const cached=getPeerProfile(pid);
        if(cached?.profile) result.push({peerId:pid, profile:cached.profile});
      }catch(e){}
    }
    return result;
  }

  function _broadcastCancel() {
    _getAllPeerProfiles().forEach(({peerId})=>{
      frodon.sendDM(peerId, PLUGIN_ID, {type:'cancel_profile', _silent:true});
    });
  }

  function _sectionLabel(container, text) {
    const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:8px 8px 5px'; lbl.textContent=text; container.appendChild(lbl);
  }

  function _emptyState(container, icon, text) {
    const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
    em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">'+icon+'</div>'+text.replace('\n','<br>'); container.appendChild(em);
  }

  function _renderForm(container, existing) {
    const form=frodon.makeElement('div',''); form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent=existing?'Modifier mon trajet':'Nouveau trajet';
    form.appendChild(title);

    // Rôle
    const roleLbl=frodon.makeElement('div',''); roleLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; roleLbl.textContent='Je suis…'; form.appendChild(roleLbl);
    const roleRow=frodon.makeElement('div',''); roleRow.style.cssText='display:flex;gap:6px;margin-bottom:10px';
    let role=existing?.role||'driver';
    const dBtn=frodon.makeElement('button','plugin-action-btn','🚗 Conducteur'); dBtn.style.cssText+=';flex:1;font-size:.64rem';
    const pBtn=frodon.makeElement('button','plugin-action-btn','🙋 Passager'); pBtn.style.cssText+=';flex:1;font-size:.64rem';
    dBtn.addEventListener('click',()=>{role='driver';dBtn.classList.add('acc');pBtn.classList.remove('acc');seatsRow.style.display='flex';fromRow.style.display='none';});
    pBtn.addEventListener('click',()=>{role='passenger';pBtn.classList.add('acc');dBtn.classList.remove('acc');seatsRow.style.display='none';fromRow.style.display='block';});
    roleRow.appendChild(dBtn); roleRow.appendChild(pBtn); form.appendChild(roleRow);
    if(role==='driver') dBtn.classList.add('acc'); else pBtn.classList.add('acc');

    _fLabel(form,'Destination *');
    const destInp=document.createElement('input'); destInp.className='f-input'; destInp.placeholder='Ex: Gare de Lyon, Bordeaux…'; destInp.value=existing?.destination||''; destInp.style.marginBottom='6px'; form.appendChild(destInp);

    const fromRow=frodon.makeElement('div',''); fromRow.style.display=role==='passenger'?'block':'none';
    _fLabel(fromRow,'Point de départ');
    const fromInp=document.createElement('input'); fromInp.className='f-input'; fromInp.placeholder='Votre lieu de départ'; fromInp.value=existing?.from||''; fromInp.style.marginBottom='6px'; fromRow.appendChild(fromInp); form.appendChild(fromRow);

    const seatsRow=frodon.makeElement('div',''); seatsRow.style.cssText='display:'+(role==='driver'?'flex':'none')+';align-items:center;gap:8px;margin-bottom:6px';
    const seatsLbl=frodon.makeElement('div',''); seatsLbl.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; seatsLbl.textContent='💺 Places :';
    const seatsInp=document.createElement('input'); seatsInp.type='number'; seatsInp.className='f-input'; seatsInp.min='1'; seatsInp.max='8'; seatsInp.value=existing?.seats||1; seatsInp.style.width='60px';
    seatsRow.appendChild(seatsLbl); seatsRow.appendChild(seatsInp); form.appendChild(seatsRow);

    _fLabel(form,'⏰ Départ');
    const timeRow=frodon.makeElement('div',''); timeRow.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:center';
    let dt=existing?.departureTime||'now';
    const nowBtn=frodon.makeElement('button','plugin-action-btn','Maintenant'); nowBtn.style.cssText+=';flex:1;font-size:.62rem';
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.cssText='flex:2;display:'+(dt!=='now'?'block':'none');
    if(dt!=='now') laterInp.value=dt;
    const laterBtn=frodon.makeElement('button','plugin-action-btn','Planifier'); laterBtn.style.cssText+=';flex:1;font-size:.62rem';
    nowBtn.addEventListener('click',()=>{dt='now';nowBtn.classList.add('acc');laterInp.style.display='none';});
    laterBtn.addEventListener('click',()=>{laterInp.style.display='block';nowBtn.classList.remove('acc');});
    laterInp.addEventListener('change',()=>{dt=laterInp.value;});
    if(dt==='now') nowBtn.classList.add('acc');
    timeRow.appendChild(nowBtn); timeRow.appendChild(laterBtn); timeRow.appendChild(laterInp); form.appendChild(timeRow);

    _fLabel(form,'Note (optionnel)');
    const noteInp=document.createElement('input'); noteInp.className='f-input'; noteInp.placeholder='Détour possible, animaux ok…'; noteInp.value=existing?.note||''; noteInp.style.marginBottom='10px'; form.appendChild(noteInp);

    const saveBtn=frodon.makeElement('button','plugin-action-btn acc','🚗 Publier'); saveBtn.style.cssText+=';width:100%';
    saveBtn.addEventListener('click',()=>{
      const dest=destInp.value.trim(); if(!dest){frodon.showToast('Destination requise',true);return;}
      const profile={role,destination:dest,from:fromInp.value.trim(),departureTime:dt,seats:parseInt(seatsInp.value)||1,note:noteInp.value.trim(),createdAt:Date.now()};
      store.set('profile',profile);
      store.del('applied'); // reset candidatures envoyées
      // Broadcast
      _getAllPeerProfiles().forEach(({peerId})=>{
        frodon.sendDM(peerId,PLUGIN_ID,{type:'profile_data',profile,_silent:true});
      });
      frodon.showToast('🚗 Profil publié — visible à proximité !');
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
    });
    form.appendChild(saveBtn); container.appendChild(form);
  }

  function _fLabel(parent, text) {
    const l=frodon.makeElement('div',''); l.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:8px'; l.textContent=text; parent.appendChild(l);
  }

  frodon.onPeerAppear(peer=>{
    const p=getMyProfile();
    if(p&&profileActive(p)) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'profile_data',profile:p,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_profile',_silent:true});
  });

  return { destroy() {} };
});
