/**
 * FRODON PLUGIN — Autopartage  v1.0.0
 * Propose un trajet, reçois des demandes de stop
 */
frodon.register({
  id: 'autopartage',
  name: 'Autopartage',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Partagez vos trajets avec les pairs à proximité. Proposez un stop, trouvez un covoiturage.',
  icon: '🚗',
}, () => {

  const PLUGIN_ID = 'autopartage';
  const store = frodon.storage(PLUGIN_ID);

  function getMyTrip() { return store.get('my_trip') || null; }
  function saveMyTrip(t) { if(t) store.set('my_trip', t); else store.del('my_trip'); }
  function getRequests() { return store.get('requests') || []; }
  function getMyRequests() { return store.get('my_requests') || []; }

  function tripActive(trip) {
    if(!trip) return false;
    if(trip.departureTime === 'now') return true;
    return new Date(trip.departureTime) > new Date(Date.now() - 30*60*1000);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'request_trip') {
      const trip = getMyTrip();
      if(trip && tripActive(trip)) {
        frodon.sendDM(fromId, PLUGIN_ID, {type:'trip_data', trip, _silent:true});
      }
    }

    if(payload.type === 'trip_data') {
      store.set('peer_trip_'+fromId, {trip:payload.trip, ts:Date.now()});
      frodon.refreshPeerModal(fromId);
    }

    if(payload.type === 'stop_request') {
      const peer = frodon.getPeer(fromId);
      const reqs = getRequests();
      // Avoid duplicate
      if(reqs.find(r=>r.fromId===fromId && r.tripId===payload.tripId)) return;
      reqs.unshift({fromId, fromName:peer?.name||'?', fromAvatar:peer?.avatar||'',
        tripId:payload.tripId, stopPoint:payload.stopPoint||'', message:payload.message||'',
        ts:Date.now(), status:'pending'});
      store.set('requests', reqs);
      frodon.showToast('🚗 '+(peer?.name||'Pair')+' demande un stop !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'stop_response') {
      const myReqs = getMyRequests();
      const req = myReqs.find(r=>r.tripId===payload.tripId);
      if(req) { req.status=payload.accepted?'accepted':'refused'; req.message=payload.message||''; }
      store.set('my_requests', myReqs);
      const peer = frodon.getPeer(fromId);
      frodon.showToast(payload.accepted
        ? '🚗 Stop accepté par '+(peer?.name||'le conducteur')+(payload.message?' — '+payload.message:'')
        : '❌ Stop refusé'+(payload.message?' — '+payload.message:''));
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'cancel_trip') {
      store.del('peer_trip_'+fromId);
      frodon.refreshPeerModal(fromId);
      frodon.showToast('🚗 '+(frodon.getPeer(fromId)?.name||'Pair')+' a annulé son trajet');
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🚗 Autopartage', (peerId, container) => {
    const cached = store.get('peer_trip_'+peerId);
    if(!cached || Date.now()-cached.ts > 60000) {
      frodon.sendDM(peerId, PLUGIN_ID, {type:'request_trip', _silent:true});
    }

    if(!cached?.trip || !tripActive(cached.trip)) {
      const msg = frodon.makeElement('div','');
      msg.style.cssText='font-size:.68rem;color:var(--txt2);padding:4px 0;font-family:var(--mono)';
      msg.textContent = cached ? '🚗 Aucun trajet en cours' : '⌛ Vérification…';
      container.appendChild(msg); return;
    }

    const trip = cached.trip;
    const card = frodon.makeElement('div','');
    card.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.08),rgba(0,245,200,.06));border:1px solid rgba(0,232,122,.25);border-radius:10px;padding:11px 13px;margin-bottom:10px';

    const row = frodon.makeElement('div','');
    row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:6px';
    const ico = frodon.makeElement('span','','🚗'); ico.style.fontSize='1.2rem';
    const dest = frodon.makeElement('div','');
    dest.style.cssText='font-size:.85rem;font-weight:700;color:var(--txt)';
    dest.textContent='→ '+trip.destination;
    row.appendChild(ico); row.appendChild(dest);
    card.appendChild(row);

    const meta = frodon.makeElement('div','');
    meta.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);line-height:1.7';
    meta.innerHTML='⏰ '+(trip.departureTime==='now'?'Départ immédiat':new Date(trip.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',weekday:'short'}))
      +'<br>💺 '+trip.seats+' place'+(trip.seats>1?'s':'')+(trip.note?'<br>📝 '+trip.note:'');
    card.appendChild(meta);
    container.appendChild(card);

    const stopInput = document.createElement('input');
    stopInput.className='f-input'; stopInput.placeholder='Point de prise en charge…'; stopInput.style.marginBottom='6px';

    const msgInput = document.createElement('input');
    msgInput.className='f-input'; msgInput.placeholder='Message (optionnel)'; msgInput.style.marginBottom='8px';

    const reqBtn = frodon.makeElement('button','plugin-action-btn acc','🤝 Demander un stop');
    reqBtn.addEventListener('click', () => {
      const myReqs = getMyRequests();
      if(myReqs.find(r=>r.tripId===trip.id && r.status==='pending')) {
        frodon.showToast('Demande déjà envoyée'); return;
      }
      const entry = {tripId:trip.id, driverPeerId:peerId, destination:trip.destination,
        stopPoint:stopInput.value.trim(), message:msgInput.value.trim(), ts:Date.now(), status:'pending'};
      myReqs.unshift(entry);
      if(myReqs.length>20) myReqs.length=20;
      store.set('my_requests', myReqs);
      setTimeout(()=>{
        frodon.sendDM(peerId, PLUGIN_ID, {type:'stop_request', tripId:trip.id,
          stopPoint:entry.stopPoint, message:entry.message, _label:'🚗 Demande de stop'});
      }, 300);
      reqBtn.disabled=true; reqBtn.textContent='✓ Demande envoyée !';
      frodon.refreshSphereTab(PLUGIN_ID);
    });

    container.appendChild(stopInput); container.appendChild(msgInput); container.appendChild(reqBtn);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'mon-trajet', label: '🚗 Mon trajet',
      render(container) {
        const trip = getMyTrip();
        const active = trip && tripActive(trip);

        if(active) {
          // Show active trip
          const card = frodon.makeElement('div','');
          card.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.1),rgba(0,245,200,.07));border:1px solid rgba(0,232,122,.3);border-radius:10px;margin:8px;padding:12px';
          const lbl = frodon.makeElement('div','');
          lbl.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px';
          lbl.textContent='● Trajet actif — visible par les pairs proches';
          card.appendChild(lbl);
          const dest = frodon.makeElement('div','');
          dest.style.cssText='font-size:.9rem;font-weight:700;color:var(--txt);margin-bottom:4px';
          dest.textContent='🚗 → '+trip.destination;
          const meta = frodon.makeElement('div','');
          meta.style.cssText='font-size:.65rem;color:var(--txt2);font-family:var(--mono);line-height:1.8';
          meta.innerHTML='⏰ '+(trip.departureTime==='now'?'Maintenant':new Date(trip.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',weekday:'short'}))
            +'<br>💺 '+trip.seats+' place'+(trip.seats>1?'s disponibles':'disponible')+(trip.note?'<br>📝 '+trip.note:'');
          const cancelBtn = frodon.makeElement('button','plugin-action-btn');
          cancelBtn.style.cssText+=';color:var(--warn);border-color:rgba(255,85,85,.3);margin-top:8px;font-size:.68rem';
          cancelBtn.textContent='✕ Annuler le trajet';
          cancelBtn.addEventListener('click', () => {
            saveMyTrip(null);
            // Notify recent peers
            Object.keys(S?.disc||{}).forEach(pid => {
              frodon.sendDM(pid, PLUGIN_ID, {type:'cancel_trip', _silent:true});
            });
            frodon.refreshSphereTab(PLUGIN_ID);
          });
          card.appendChild(dest); card.appendChild(meta); card.appendChild(cancelBtn);
          container.appendChild(card);
        } else {
          showTripForm(container);
        }

        // Incoming requests
        const reqs = getRequests().filter(r=>r.status==='pending');
        if(reqs.length) {
          const lbl2 = frodon.makeElement('div','');
          lbl2.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:12px 8px 6px';
          lbl2.textContent=reqs.length+' demande'+(reqs.length>1?'s':'')+' de stop';
          container.appendChild(lbl2);
          reqs.forEach(req => {
            const card2 = frodon.makeElement('div','');
            card2.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:0 8px 6px;padding:10px 12px';
            const name = frodon.makeElement('div','');
            name.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);cursor:pointer;margin-bottom:3px';
            name.textContent=req.fromName;
            name.addEventListener('click',()=>frodon.openPeer(req.fromId));
            if(req.stopPoint){
              const sp=frodon.makeElement('div','');
              sp.style.cssText='font-size:.64rem;color:var(--txt2);margin-bottom:2px';
              sp.textContent='📍 '+req.stopPoint; card2.appendChild(sp);
            }
            if(req.message){
              const mg=frodon.makeElement('div','');
              mg.style.cssText='font-size:.64rem;color:var(--txt2);margin-bottom:6px';
              mg.textContent='💬 '+req.message; card2.appendChild(mg);
            }
            const btnRow=frodon.makeElement('div',''); btnRow.style.cssText='display:flex;gap:6px;margin-top:6px';
            const accept=frodon.makeElement('button','plugin-action-btn acc','✓ Accepter');
            accept.style.fontSize='.66rem';
            accept.addEventListener('click',()=>{
              req.status='accepted';
              store.set('requests',getRequests().map(r=>r.fromId===req.fromId&&r.tripId===req.tripId?req:r));
              frodon.sendDM(req.fromId,PLUGIN_ID,{type:'stop_response',tripId:req.tripId,accepted:true,_label:'🚗 Stop accepté !'});
              frodon.refreshSphereTab(PLUGIN_ID);
            });
            const refuse=frodon.makeElement('button','plugin-action-btn','✕ Refuser');
            refuse.style.cssText+=';font-size:.66rem;color:var(--warn)';
            refuse.addEventListener('click',()=>{
              req.status='refused';
              store.set('requests',getRequests().map(r=>r.fromId===req.fromId&&r.tripId===req.tripId?req:r));
              frodon.sendDM(req.fromId,PLUGIN_ID,{type:'stop_response',tripId:req.tripId,accepted:false,_label:'🚗 Stop refusé'});
              frodon.refreshSphereTab(PLUGIN_ID);
            });
            card2.appendChild(name); btnRow.appendChild(accept); btnRow.appendChild(refuse);
            card2.appendChild(btnRow); container.appendChild(card2);
          });
        }
      }
    },
    {
      id: 'mes-stops', label: '🤝 Mes demandes',
      render(container) {
        const reqs = getMyRequests();
        if(!reqs.length) {
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🤝</div>Aucune demande de stop.<br><small style="color:var(--txt3)">Trouvez un trajet sur le radar.</small>';
          container.appendChild(em); return;
        }
        reqs.forEach(req => {
          const card=frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:6px 8px 0;padding:10px 12px';
          const status={pending:'⌛',accepted:'✅',refused:'❌'}[req.status]||'?';
          const col={pending:'var(--txt2)',accepted:'var(--ok)',refused:'var(--warn)'}[req.status];
          card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            +'<strong style="font-size:.76rem;color:var(--txt)">→ '+req.destination+'</strong>'
            +'<span style="font-size:.7rem;color:'+col+'">'+status+' '+(req.status==='pending'?'En attente':req.status==='accepted'?'Accepté':'Refusé')+'</span>'
            +'</div>'
            +'<div style="font-size:.62rem;color:var(--txt2);font-family:var(--mono)">'+frodon.formatTime(req.ts)+(req.message?'<br>'+req.message:'')+'</div>';
          container.appendChild(card);
        });
      }
    },
  ]);

  function showTripForm(container) {
    const form = frodon.makeElement('div','');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';

    const title=frodon.makeElement('div','');
    title.style.cssText='font-size:.65rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px';
    title.textContent='Proposer un trajet';
    form.appendChild(title);

    const destInput=document.createElement('input'); destInput.className='f-input';
    destInput.placeholder='Destination *'; destInput.style.marginBottom='6px';

    const timeWrap=frodon.makeElement('div',''); timeWrap.style.cssText='display:flex;gap:6px;margin-bottom:6px';
    const nowBtn=frodon.makeElement('button','plugin-action-btn acc','Maintenant');
    nowBtn.style.cssText+=';flex:1;font-size:.66rem';
    let departureTime='now';
    nowBtn.addEventListener('click',()=>{ departureTime='now'; nowBtn.classList.add('acc'); laterInput.style.display='none'; });
    const laterInput=document.createElement('input'); laterInput.type='datetime-local'; laterInput.className='f-input';
    laterInput.style.cssText='flex:2;display:none';
    laterInput.addEventListener('change',()=>{ departureTime=laterInput.value; nowBtn.classList.remove('acc'); });
    const laterBtn=frodon.makeElement('button','plugin-action-btn','Plus tard');
    laterBtn.style.cssText+=';flex:1;font-size:.66rem';
    laterBtn.addEventListener('click',()=>{ laterInput.style.display=''; laterInput.style.flex='2'; nowBtn.classList.remove('acc'); });
    timeWrap.appendChild(nowBtn); timeWrap.appendChild(laterBtn); timeWrap.appendChild(laterInput);

    const seatsWrap=frodon.makeElement('div',''); seatsWrap.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:6px';
    const seatsLbl=frodon.makeElement('div',''); seatsLbl.style.cssText='font-size:.66rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; seatsLbl.textContent='💺 Places :';
    const seatsInput=document.createElement('input'); seatsInput.type='number'; seatsInput.className='f-input';
    seatsInput.min='1'; seatsInput.max='8'; seatsInput.value='1'; seatsInput.style.width='60px';
    seatsWrap.appendChild(seatsLbl); seatsWrap.appendChild(seatsInput);

    const noteInput=document.createElement('input'); noteInput.className='f-input';
    noteInput.placeholder='Note (détour possible, bagages…)'; noteInput.style.marginBottom='10px';

    const goBtn=frodon.makeElement('button','plugin-action-btn acc','🚗 Publier le trajet');
    goBtn.style.cssText+=';width:100%';
    goBtn.addEventListener('click',()=>{
      const dest=destInput.value.trim();
      if(!dest){frodon.showToast('Destination requise',true);return;}
      const trip={id:'trip_'+Date.now(), destination:dest, departureTime,
        seats:parseInt(seatsInput.value)||1, note:noteInput.value.trim(), createdAt:Date.now()};
      saveMyTrip(trip);
      frodon.showToast('🚗 Trajet publié — visible sur le radar !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });

    form.appendChild(destInput); form.appendChild(timeWrap); form.appendChild(seatsWrap);
    form.appendChild(noteInput); form.appendChild(goBtn);
    container.appendChild(form);
  }

  frodon.onPeerAppear(peer => {
    const trip=getMyTrip();
    if(trip&&tripActive(trip)) {
      frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'trip_data',trip,_silent:true});
    }
  });

  return { destroy() {} };
});
