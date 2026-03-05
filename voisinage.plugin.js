frodon.register({
  id: 'autopartage',
  name: 'Autopartage',
  version: '3.1.0',
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
  function getMessages() { return store.get('messages') || []; }
  function getApplied() { return store.get('applied') || {}; }

  /* ── DM ── */
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
      msgs.unshift({fromId, fromName:peer?.name||'?',
        message:payload.message, tripDestination:payload.tripDestination||'',
        ts:Date.now(), read:false});
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

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const p=getMyProfile(); if(!p||!profileActive(p)) return;
    const card=frodon.makeElement('div','');
    card.style.cssText='background:rgba(0,232,122,.1);border:1px solid rgba(0,232,122,.3);border-radius:var(--r);padding:8px 12px;margin-top:5px';
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px';
    t.textContent=p.role==='driver'?'🚗 Conducteur actif':'🙋 Cherche un trajet';
    const d=frodon.makeElement('div',''); d.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt)'; d.textContent='→ '+p.destination;
    card.appendChild(t); card.appendChild(d); container.appendChild(card);
  });

  /* ── SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'trajets', label: '🚗 Trajets',
      render(container) {
        const myProfile = getMyProfile();

        if(!myProfile || !profileActive(myProfile)) {
          _empty(container, '🚗', 'Configurez votre trajet dans ⚙\npour voir les pairs compatibles.');
          return;
        }

        const amDriver = myProfile.role === 'driver';
        const allPeers = frodon.getAllPeers();

        // Demander les profils manquants
        allPeers.forEach(peer => {
          const cached = getPeerProfile(peer.peerId);
          if(!cached || Date.now() - cached.ts > 120000) {
            frodon.sendDM(peer.peerId, PLUGIN_ID, {type:'request_profile', _silent:true});
          }
        });

        // Pairs avec un profil compatible
        const compatible = allPeers
          .map(peer => ({peer, cached: getPeerProfile(peer.peerId)}))
          .filter(({cached}) => cached?.profile && profileActive(cached.profile))
          .filter(({cached}) => amDriver
            ? cached.profile.role === 'passenger'
            : cached.profile.role === 'driver');

        if(!compatible.length) {
          _empty(container, '🚗', allPeers.length
            ? (amDriver ? 'Aucun passager visible parmi '+allPeers.length+' pair(s).\nLes profils arrivent dans quelques secondes…' : 'Aucun conducteur visible parmi '+allPeers.length+' pair(s).\nLes profils arrivent dans quelques secondes…')
            : 'Aucun pair à proximité.');
          return;
        }

        const applied = getApplied();
        _sLabel(container, amDriver ? 'Passagers qui cherchent' : 'Conducteurs disponibles');

        compatible.forEach(({peer, cached}) => {
          const profile = cached.profile;
          const name = peer.name || peer.peerId.substring(0,8)+'…';
          const hasApplied = applied[peer.peerId];

          const card = frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:0 8px 8px;overflow:hidden';

          const hdr = frodon.makeElement('div','');
          hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click', ()=>frodon.openPeer(peer.peerId));

          const av = frodon.makeElement('div','');
          av.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(0,232,122,.15);border:1px solid rgba(0,232,122,.3);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono);font-weight:700';
          av.textContent=name[0].toUpperCase();

          const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; nameEl.textContent=name;
          const destEl=frodon.makeElement('div',''); destEl.style.cssText='font-size:.68rem;color:var(--acc);margin-top:1px'; destEl.textContent='→ '+profile.destination;
          info.appendChild(nameEl); info.appendChild(destEl);

          const timeEl=frodon.makeElement('div',''); timeEl.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono)';
          timeEl.textContent=profile.departureTime==='now'?'Maintenant':new Date(profile.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'});

          hdr.appendChild(av); hdr.appendChild(info); hdr.appendChild(timeEl);
          card.appendChild(hdr);

          const body=frodon.makeElement('div',''); body.style.cssText='padding:9px 12px 11px';

          const details=frodon.makeElement('div',''); details.style.cssText='font-size:.63rem;color:var(--txt2);font-family:var(--mono);line-height:1.8;margin-bottom:7px';
          let dh='';
          if(profile.from) dh+='📍 Depuis : '+profile.from+'<br>';
          if(profile.role==='driver') dh+='💺 '+profile.seats+' place'+(profile.seats>1?'s':'');
          if(profile.note) dh+=(dh?'<br>':'')+'📝 '+profile.note;
          if(dh){ details.innerHTML=dh; body.appendChild(details); }

          const ta=document.createElement('textarea');
          ta.className='f-input'; ta.rows=2; ta.maxLength=300;
          ta.placeholder=!amDriver?'Message au conducteur (optionnel)…':'Message au passager…';
          ta.style.marginBottom='6px';
          body.appendChild(ta);

          if(hasApplied) {
            const done=frodon.makeElement('div',''); done.style.cssText='font-size:.66rem;color:var(--ok);font-family:var(--mono);padding:3px 0'; done.textContent='✓ Candidature envoyée'; body.appendChild(done);
          } else {
            const btn=frodon.makeElement('button','plugin-action-btn acc', !amDriver?'🚗 Candidater':'💬 Contacter');
            btn.addEventListener('click',()=>{
              const msg=ta.value.trim()||(!amDriver?'Je suis intéressé par votre trajet.':'Je suis intéressé.');
              setTimeout(()=>frodon.sendDM(peer.peerId,PLUGIN_ID,{
                type:'message', message:msg, tripDestination:profile.destination,
                _label:'🚗 '+(!amDriver?'Candidature':'Message')+' autopartage'
              }),300);
              if(!amDriver){
                const a=getApplied(); a[peer.peerId]=true; store.set('applied',a);
              }
              btn.textContent='✓ Envoyé'; btn.disabled=true;
              frodon.showToast('🚗 Message envoyé à '+name+' !');
            });
            body.appendChild(btn);
          }
          card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'reception', label: '📬 Réceptions',
      render(container) {
        const msgs=getMessages();
        if(!msgs.length){ _empty(container,'📬','Aucun message reçu.'); return; }
        msgs.forEach(m=>m.read=true); store.set('messages',msgs);

        const grouped={};
        msgs.forEach(m=>{
          if(!grouped[m.fromId]) grouped[m.fromId]={fromId:m.fromId,fromName:m.fromName,msgs:[]};
          grouped[m.fromId].msgs.push(m);
        });

        Object.values(grouped).forEach(g=>{
          const card=frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:6px 8px 0;overflow:hidden';

          const hdr=frodon.makeElement('div','');
          hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click',()=>frodon.openPeer(g.fromId));
          const av=frodon.makeElement('div',''); av.style.cssText='width:32px;height:32px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;font-family:var(--mono);font-weight:700'; av.textContent=g.fromName[0].toUpperCase();
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);flex:1'; nameEl.textContent=g.fromName;
          hdr.appendChild(av); hdr.appendChild(nameEl); card.appendChild(hdr);

          const body=frodon.makeElement('div',''); body.style.cssText='padding:8px 12px';
          g.msgs.slice(0,5).forEach(m=>{
            const row=frodon.makeElement('div',''); row.style.cssText='padding:5px 0;border-bottom:1px solid var(--bdr)';
            if(m.tripDestination){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);margin-bottom:1px'; d.textContent='→ '+m.tripDestination; row.appendChild(d);}
            const txt=frodon.makeElement('div',''); txt.style.cssText='font-size:.7rem;color:var(--txt)'; txt.textContent=m.message; row.appendChild(txt);
            const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);margin-top:2px'; ts.textContent=frodon.formatTime(m.ts); row.appendChild(ts);
            body.appendChild(row);
          });

          const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=300; ta.placeholder='Votre réponse…'; ta.style.cssText+='margin-top:8px;margin-bottom:6px';
          const replyBtn=frodon.makeElement('button','plugin-action-btn acc','💬 Répondre');
          replyBtn.addEventListener('click',()=>{
            const msg=ta.value.trim(); if(!msg){frodon.showToast('Écrivez un message',true);return;}
            setTimeout(()=>frodon.sendDM(g.fromId,PLUGIN_ID,{type:'message',message:msg,_label:'🚗 Réponse autopartage'}),300);
            ta.value=''; replyBtn.textContent='✓ Envoyé'; replyBtn.disabled=true;
          });
          body.appendChild(ta); body.appendChild(replyBtn); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'settings', label: '⚙ Mon profil', settings:true,
      render(container) {
        const p=getMyProfile();
        if(p&&profileActive(p)){
          const sc=frodon.makeElement('div',''); sc.style.cssText='background:rgba(0,232,122,.1);border:1px solid rgba(0,232,122,.3);border-radius:var(--r);margin:8px;padding:12px';
          const dot=frodon.makeElement('div',''); dot.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);margin-bottom:4px'; dot.textContent='● Profil actif';
          const dest=frodon.makeElement('div',''); dest.style.cssText='font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:3px'; dest.textContent=(p.role==='driver'?'🚗':'🙋')+' → '+p.destination;
          const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono)';
          meta.textContent=(p.departureTime==='now'?'Maintenant':new Date(p.departureTime).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}))+(p.role==='driver'?' · '+p.seats+' place'+(p.seats>1?'s':''):'');
          const cancelBtn=frodon.makeElement('button','plugin-action-btn'); cancelBtn.style.cssText+=';color:var(--warn);border-color:rgba(255,85,85,.3);margin-top:8px;font-size:.68rem;width:100%'; cancelBtn.textContent='✕ Annuler le trajet';
          cancelBtn.addEventListener('click',()=>{
            store.del('profile'); store.del('applied');
            frodon.getAllPeers().forEach(peer=>frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'cancel_profile',_silent:true}));
            frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
          });
          sc.appendChild(dot); sc.appendChild(dest); sc.appendChild(meta); sc.appendChild(cancelBtn);
          container.appendChild(sc);
        }
        _renderForm(container, p);
      }
    },
  ]);

  function _empty(container,icon,text){
    const em=frodon.makeElement('div','no-posts'); em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:8px">'+icon+'</div>'+text.replace('\n','<br>'); container.appendChild(em);
  }
  function _sLabel(container,text){
    const l=frodon.makeElement('div','section-label'); l.textContent=text; container.appendChild(l);
  }
  function _fl(parent,text){
    const l=frodon.makeElement('div',''); l.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:8px'; l.textContent=text; parent.appendChild(l);
  }

  function _renderForm(container, existing){
    const form=frodon.makeElement('div',''); form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent=existing?'Modifier mon trajet':'Nouveau trajet'; form.appendChild(title);

    _fl(form,'Je suis…');
    const roleRow=frodon.makeElement('div',''); roleRow.style.cssText='display:flex;gap:6px;margin-bottom:10px';
    let role=existing?.role||'driver';
    const dBtn=frodon.makeElement('button','plugin-action-btn','🚗 Conducteur'); dBtn.style.cssText+=';flex:1;font-size:.64rem';
    const pBtn=frodon.makeElement('button','plugin-action-btn','🙋 Passager'); pBtn.style.cssText+=';flex:1;font-size:.64rem';
    if(role==='driver') dBtn.classList.add('acc'); else pBtn.classList.add('acc');
    dBtn.addEventListener('click',()=>{role='driver';dBtn.classList.add('acc');pBtn.classList.remove('acc');seatsRow.style.display='flex';fromRow.style.display='none';});
    pBtn.addEventListener('click',()=>{role='passenger';pBtn.classList.add('acc');dBtn.classList.remove('acc');seatsRow.style.display='none';fromRow.style.display='block';});
    roleRow.appendChild(dBtn); roleRow.appendChild(pBtn); form.appendChild(roleRow);

    _fl(form,'Destination *');
    const destInp=document.createElement('input'); destInp.className='f-input'; destInp.placeholder='Ex: Gare de Lyon, Bordeaux…'; destInp.value=existing?.destination||''; destInp.style.marginBottom='6px'; form.appendChild(destInp);

    const fromRow=frodon.makeElement('div',''); fromRow.style.display=role==='passenger'?'block':'none';
    _fl(fromRow,'Point de départ');
    const fromInp=document.createElement('input'); fromInp.className='f-input'; fromInp.placeholder='Votre lieu de départ'; fromInp.value=existing?.from||''; fromInp.style.marginBottom='6px'; fromRow.appendChild(fromInp); form.appendChild(fromRow);

    const seatsRow=frodon.makeElement('div',''); seatsRow.style.cssText='display:'+(role==='driver'?'flex':'none')+';align-items:center;gap:8px;margin-bottom:6px';
    const seatsLbl=frodon.makeElement('div',''); seatsLbl.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; seatsLbl.textContent='💺 Places :';
    const seatsInp=document.createElement('input'); seatsInp.type='number'; seatsInp.className='f-input'; seatsInp.min='1'; seatsInp.max='8'; seatsInp.value=existing?.seats||1; seatsInp.style.width='60px';
    seatsRow.appendChild(seatsLbl); seatsRow.appendChild(seatsInp); form.appendChild(seatsRow);

    _fl(form,'⏰ Départ');
    const timeRow=frodon.makeElement('div',''); timeRow.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:center';
    let dt=existing?.departureTime||'now';
    const nowBtn=frodon.makeElement('button','plugin-action-btn','Maintenant'); nowBtn.style.cssText+=';flex:1;font-size:.62rem';
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.cssText='flex:2;display:'+(dt!=='now'?'block':'none');
    if(dt!=='now') laterInp.value=dt;
    const laterBtn=frodon.makeElement('button','plugin-action-btn','Planifier'); laterBtn.style.cssText+=';flex:1;font-size:.62rem';
    if(dt==='now') nowBtn.classList.add('acc');
    nowBtn.addEventListener('click',()=>{dt='now';nowBtn.classList.add('acc');laterInp.style.display='none';});
    laterBtn.addEventListener('click',()=>{laterInp.style.display='block';nowBtn.classList.remove('acc');});
    laterInp.addEventListener('change',()=>{dt=laterInp.value;});
    timeRow.appendChild(nowBtn); timeRow.appendChild(laterBtn); timeRow.appendChild(laterInp); form.appendChild(timeRow);

    _fl(form,'Note (optionnel)');
    const noteInp=document.createElement('input'); noteInp.className='f-input'; noteInp.placeholder='Détour possible, animaux ok…'; noteInp.value=existing?.note||''; noteInp.style.marginBottom='10px'; form.appendChild(noteInp);

    const saveBtn=frodon.makeElement('button','plugin-action-btn acc','🚗 Publier'); saveBtn.style.cssText+=';width:100%';
    saveBtn.addEventListener('click',()=>{
      const dest=destInp.value.trim(); if(!dest){frodon.showToast('Destination requise',true);return;}
      const profile={role,destination:dest,from:fromInp.value.trim(),departureTime:dt,seats:parseInt(seatsInp.value)||1,note:noteInp.value.trim(),createdAt:Date.now()};
      store.set('profile',profile); store.del('applied');
      frodon.getAllPeers().forEach(peer=>frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'profile_data',profile,_silent:true}));
      frodon.showToast('🚗 Profil publié !');
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
    });
    form.appendChild(saveBtn); container.appendChild(form);
  }

  frodon.onPeerAppear(peer=>{
    const p=getMyProfile();
    if(p&&profileActive(p)) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'profile_data',profile:p,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_profile',_silent:true});
  });

  return { destroy() {} };
});
