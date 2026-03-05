/**
 * FRODON PLUGIN — Autopartage  v2.0.0
 * Paramétrage dans ⚙ (véhiculé ou non, trajet)
 * SPHERE : trajets dispo (conducteurs) + postulants (passagers)
 * Fiche pair : postuler en 1 clic
 */
frodon.register({
  id: 'autopartage',
  name: 'Autopartage',
  version: '2.0.0',
  author: 'frodon-community',
  description: 'Proposez ou trouvez un trajet avec les pairs à proximité.',
  icon: '🚗',
}, () => {

  const PLUGIN_ID = 'autopartage';
  const store = frodon.storage(PLUGIN_ID);

  // Mon profil autopartage
  function getMyProfile() { return store.get('profile') || null; }
  // profile = { role:'driver'|'passenger', destination, departureTime, seats, note, from, updatedAt }

  function profileActive(p) {
    if(!p) return false;
    if(p.departureTime === 'now') return Date.now() - p.updatedAt < 6*60*60*1000;
    return new Date(p.departureTime) > new Date(Date.now() - 30*60*1000);
  }

  // Cache des profils des pairs
  function getPeerProfile(pid) { return store.get('peer_ap_'+pid) || null; }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'profile_data') {
      store.set('peer_ap_'+fromId, {profile: payload.profile, ts: Date.now()});
      frodon.refreshPeerModal(fromId);
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'request_profile') {
      const p = getMyProfile();
      if(p && profileActive(p)) {
        frodon.sendDM(fromId, PLUGIN_ID, {type:'profile_data', profile:p, _silent:true});
      }
    }

    if(payload.type === 'apply') {
      // Reçu par le conducteur : quelqu'un postule
      const peer = frodon.getPeer(fromId);
      const apps = store.get('applicants') || [];
      if(apps.find(a => a.fromId === fromId)) return; // déjà postulé
      apps.unshift({
        fromId, fromName: peer?.name||'?', fromAvatar: peer?.avatar||'',
        role: payload.role, // 'passenger' ou 'driver'
        from: payload.from||'', // lieu pour passager
        departureTime: payload.departureTime||'', // heure pour conducteur
        destination: payload.destination||'',
        ts: Date.now()
      });
      store.set('applicants', apps);
      frodon.showToast('🚗 '+(peer?.name||'Pair')+' postule pour votre trajet !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'cancel_profile') {
      store.del('peer_ap_'+fromId);
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Fiche d'un pair : postuler en 1 clic ── */
  frodon.registerPeerAction(PLUGIN_ID, '🚗 Autopartage', (peerId, container) => {
    const cached = store.get('peer_ap_'+peerId);
    if(!cached || Date.now()-cached.ts > 60000) {
      frodon.sendDM(peerId, PLUGIN_ID, {type:'request_profile', _silent:true});
    }

    const peerProfile = cached?.profile;
    const peerName = frodon.getPeer(peerId)?.name || 'ce pair';

    if(!peerProfile || !profileActive(peerProfile)) {
      const msg = frodon.makeElement('div','');
      msg.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:4px 0;font-family:var(--mono)';
      msg.textContent = cached ? '🚗 Aucun trajet actif' : '⌛ Vérification…';
      container.appendChild(msg); return;
    }

    // Afficher le trajet du pair
    const card = frodon.makeElement('div','');
    const isDriver = peerProfile.role === 'driver';
    card.style.cssText = 'background:linear-gradient(135deg,rgba(0,232,122,.08),rgba(0,245,200,.05));border:1px solid rgba(0,232,122,.25);border-radius:10px;padding:11px 13px;margin-bottom:10px';
    const badge = frodon.makeElement('div','');
    badge.style.cssText = 'font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;color:var(--ok)';
    badge.textContent = isDriver ? '🚗 Conducteur — propose un trajet' : '🙋 Passager — cherche un trajet';
    card.appendChild(badge);

    const dest = frodon.makeElement('div','');
    dest.style.cssText = 'font-size:.86rem;font-weight:700;color:var(--txt);margin-bottom:4px';
    dest.textContent = '→ '+peerProfile.destination;
    card.appendChild(dest);

    const meta = frodon.makeElement('div','');
    meta.style.cssText = 'font-size:.64rem;color:var(--txt2);font-family:var(--mono);line-height:1.8';
    let metaHtml = '⏰ '+(peerProfile.departureTime==='now'?'Maintenant':new Date(peerProfile.departureTime).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}));
    if(isDriver) metaHtml += '<br>💺 '+peerProfile.seats+' place'+(peerProfile.seats>1?'s':'');
    if(peerProfile.from) metaHtml += '<br>📍 Depuis : '+peerProfile.from;
    if(peerProfile.note) metaHtml += '<br>📝 '+peerProfile.note;
    meta.innerHTML = metaHtml;
    card.appendChild(meta);
    container.appendChild(card);

    // Vérifier si déjà postulé
    const myProfile = getMyProfile();
    const alreadyApplied = (store.get('my_applications')||[]).find(a=>a.toPeerId===peerId);
    if(alreadyApplied) {
      const done = frodon.makeElement('div','');
      done.style.cssText = 'font-size:.68rem;color:var(--ok);font-family:var(--mono);padding:4px 0';
      done.textContent = '✓ Candidature envoyée';
      container.appendChild(done); return;
    }

    const applyBtn = frodon.makeElement('button','plugin-action-btn acc','🚗 Postuler en 1 clic');
    applyBtn.addEventListener('click', () => {
      const myP = getMyProfile();
      const apps = store.get('my_applications') || [];
      apps.unshift({toPeerId:peerId, toName:peerName, destination:peerProfile.destination, ts:Date.now()});
      store.set('my_applications', apps);
      setTimeout(()=>{
        frodon.sendDM(peerId, PLUGIN_ID, {
          type: 'apply',
          role: myP?.role || 'passenger',
          from: myP?.from || '',
          departureTime: myP?.departureTime || '',
          destination: myP?.destination || '',
          _label: '🚗 Candidature autopartage'
        });
      }, 300);
      applyBtn.disabled=true; applyBtn.textContent='✓ Candidature envoyée !';
      frodon.showToast('🚗 Candidature envoyée à '+peerName+' !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    container.appendChild(applyBtn);
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const p = getMyProfile();
    if(!p || !profileActive(p)) return;
    const card = frodon.makeElement('div','');
    card.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.1),rgba(0,245,200,.07));border:1px solid rgba(0,232,122,.3);border-radius:10px;padding:9px 12px;margin-top:6px';
    const t = frodon.makeElement('div','');
    t.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px';
    t.textContent = p.role==='driver'?'🚗 Conducteur actif':'🙋 Cherche un trajet';
    const d = frodon.makeElement('div','');
    d.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt)';
    d.textContent='→ '+p.destination;
    card.appendChild(t); card.appendChild(d); container.appendChild(card);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'trajets', label: '🚗 Trajets',
      render(container) {
        // Trajets conducteurs disponibles autour
        const drivers = [];
        const passengers = [];
        // Collect from all peers
        for(const key of Object.keys(localStorage)) {
          if(!key.startsWith('frd_ap_peer_ap_')) continue;
          try {
            const pid = key.replace('frd_ap_peer_ap_','');
            const cached = store.get('peer_ap_'+pid);
            if(!cached?.profile || !profileActive(cached.profile)) continue;
            if(cached.profile.role==='driver') drivers.push({peerId:pid, ...cached.profile});
            else passengers.push({peerId:pid, ...cached.profile});
          } catch(e){}
        }

        if(!drivers.length && !passengers.length) {
          const em = frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🚗</div>Aucun trajet à proximité.<br><small style="color:var(--txt3)">Configurez votre trajet dans les paramètres.</small>';
          container.appendChild(em); return;
        }

        if(drivers.length) {
          _sectionLabel(container, '🚗 Conducteurs disponibles');
          drivers.forEach(d => {
            const peer = frodon.getPeer(d.peerId);
            _tripCard(container, d, peer, 'driver');
          });
        }
        if(passengers.length) {
          _sectionLabel(container, '🙋 Passagers qui cherchent');
          passengers.forEach(d => {
            const peer = frodon.getPeer(d.peerId);
            _tripCard(container, d, peer, 'passenger');
          });
        }
      }
    },
    {
      id: 'candidats', label: '📬 Candidats',
      render(container) {
        const apps = store.get('applicants') || [];
        if(!apps.length) {
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">📬</div>Aucun candidat.<br><small style="color:var(--txt3)">Les pairs qui postulent apparaîtront ici.</small>';
          container.appendChild(em); return;
        }
        apps.forEach(app => {
          const card = frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:6px 8px 0;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer';
          card.addEventListener('click',()=>frodon.openPeer(app.fromId));

          // Avatar
          const av = frodon.makeElement('div','');
          av.style.cssText='width:34px;height:34px;border-radius:50%;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.3);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0;font-family:var(--mono)';
          av.textContent=(app.fromName||'?')[0].toUpperCase();

          const info = frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const name=frodon.makeElement('div',''); name.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2)'; name.textContent=app.fromName;

          const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.62rem;color:var(--txt2);font-family:var(--mono);margin-top:2px';
          if(app.role==='passenger' && app.from) meta.textContent='📍 '+app.from;
          else if(app.role==='driver' && app.departureTime) meta.textContent='⏰ '+(app.departureTime==='now'?'Maintenant':new Date(app.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'}));

          const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);flex-shrink:0';
          ts.textContent=frodon.formatTime(app.ts);

          info.appendChild(name); if(meta.textContent) info.appendChild(meta);
          card.appendChild(av); card.appendChild(info); card.appendChild(ts);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'settings', label: '⚙ Mon trajet',
      settings: true,
      render(container) {
        const p = getMyProfile();
        const active = p && profileActive(p);

        if(active) {
          const statusCard = frodon.makeElement('div','');
          statusCard.style.cssText='background:linear-gradient(135deg,rgba(0,232,122,.1),rgba(0,245,200,.07));border:1px solid rgba(0,232,122,.3);border-radius:10px;margin:8px;padding:12px';
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.6rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.7px;margin-bottom:5px'; lbl.textContent='● Trajet actif';
          const dest=frodon.makeElement('div',''); dest.style.cssText='font-size:.86rem;font-weight:700;color:var(--txt);margin-bottom:4px'; dest.textContent=(p.role==='driver'?'🚗':'🙋')+' → '+p.destination;
          const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono)';
          meta.textContent=(p.departureTime==='now'?'Maintenant':new Date(p.departureTime).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}))+(p.role==='driver'?' · '+p.seats+' place'+(p.seats>1?'s':''):'');
          const cancelBtn=frodon.makeElement('button','plugin-action-btn'); cancelBtn.style.cssText+=';color:var(--warn);border-color:rgba(255,85,85,.3);margin-top:8px;font-size:.68rem;width:100%'; cancelBtn.textContent='✕ Annuler le trajet';
          cancelBtn.addEventListener('click',()=>{
            store.del('profile');
            Object.keys(localStorage).filter(k=>k.startsWith('frd_disc_')).forEach(k=>{
              try{ const pid=k.replace('frd_disc_',''); frodon.sendDM(pid,PLUGIN_ID,{type:'cancel_profile',_silent:true}); }catch(e){}
            });
            frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
          });
          statusCard.appendChild(lbl); statusCard.appendChild(dest); statusCard.appendChild(meta); statusCard.appendChild(cancelBtn);
          container.appendChild(statusCard);
        }

        // Formulaire
        _renderSettingsForm(container, p);
      }
    },
  ]);

  function _sectionLabel(container, text) {
    const lbl=frodon.makeElement('div','');
    lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:10px 8px 5px';
    lbl.textContent=text; container.appendChild(lbl);
  }

  function _tripCard(container, profile, peer, role) {
    const card=frodon.makeElement('div','');
    card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:0 8px 6px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer';
    card.addEventListener('click',()=>frodon.openPeer(profile.peerId));

    const av=frodon.makeElement('div','');
    av.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(0,232,122,.15);border:1px solid rgba(0,232,122,.3);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono)';
    av.textContent=(peer?.name||'?')[0].toUpperCase();

    const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
    const name=frodon.makeElement('div',''); name.style.cssText='font-size:.76rem;font-weight:700;color:var(--txt)'; name.textContent=peer?.name||profile.peerId.substring(0,8)+'…';
    const dest=frodon.makeElement('div',''); dest.style.cssText='font-size:.68rem;color:var(--acc);margin-top:1px'; dest.textContent='→ '+profile.destination;
    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);margin-top:1px';
    if(role==='driver') meta.textContent='⏰ '+(profile.departureTime==='now'?'Maintenant':new Date(profile.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+'  💺 '+profile.seats;
    else meta.textContent='📍 '+(profile.from||'Lieu non précisé');

    info.appendChild(name); info.appendChild(dest); info.appendChild(meta);
    card.appendChild(av); card.appendChild(info);
    container.appendChild(card);
  }

  function _renderSettingsForm(container, existing) {
    const form=frodon.makeElement('div','');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';

    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px';
    title.textContent=existing?'Modifier mon trajet':'Configurer mon trajet';
    form.appendChild(title);

    // Rôle
    const roleLbl=frodon.makeElement('div',''); roleLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; roleLbl.textContent='Je suis…';
    form.appendChild(roleLbl);
    const roleRow=frodon.makeElement('div',''); roleRow.style.cssText='display:flex;gap:6px;margin-bottom:10px';
    let selectedRole=existing?.role||'driver';
    const driverBtn=frodon.makeElement('button','plugin-action-btn','🚗 Conducteur'); driverBtn.style.cssText+=';flex:1;font-size:.66rem';
    const passBtn=frodon.makeElement('button','plugin-action-btn','🙋 Passager'); passBtn.style.cssText+=';flex:1;font-size:.66rem';
    const roleButtons=[driverBtn,passBtn];
    const roleVals=['driver','passenger'];
    roleButtons.forEach((btn,i)=>{
      btn.addEventListener('click',()=>{
        selectedRole=roleVals[i];
        roleButtons.forEach((b,j)=>{b.classList.toggle('acc',j===i);});
        seatsRow.style.display=selectedRole==='driver'?'flex':'none';
        fromRow.style.display=selectedRole==='passenger'?'block':'none';
      });
    });
    roleRow.appendChild(driverBtn); roleRow.appendChild(passBtn); form.appendChild(roleRow);

    const destInput=document.createElement('input'); destInput.className='f-input'; destInput.placeholder='Destination *'; destInput.value=existing?.destination||''; destInput.style.marginBottom='6px'; form.appendChild(destInput);

    // Depuis (passager)
    const fromRow=frodon.makeElement('div',''); fromRow.style.display=existing?.role==='passenger'?'block':'none';
    const fromInput=document.createElement('input'); fromInput.className='f-input'; fromInput.placeholder='Depuis (lieu de prise en charge)'; fromInput.value=existing?.from||''; fromInput.style.marginBottom='6px';
    fromRow.appendChild(fromInput); form.appendChild(fromRow);

    // Places (conducteur)
    const seatsRow=frodon.makeElement('div',''); seatsRow.style.cssText='display:'+(existing?.role!=='passenger'?'flex':'none')+';align-items:center;gap:8px;margin-bottom:6px';
    const seatsLbl=frodon.makeElement('div',''); seatsLbl.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; seatsLbl.textContent='💺 Places :';
    const seatsInp=document.createElement('input'); seatsInp.type='number'; seatsInp.className='f-input'; seatsInp.min='1'; seatsInp.max='8'; seatsInp.value=existing?.seats||1; seatsInp.style.width='60px';
    seatsRow.appendChild(seatsLbl); seatsRow.appendChild(seatsInp); form.appendChild(seatsRow);

    // Heure de départ
    const timeLbl=frodon.makeElement('div',''); timeLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; timeLbl.textContent='⏰ Départ'; form.appendChild(timeLbl);
    const timeRow=frodon.makeElement('div',''); timeRow.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:center';
    let departureTime=existing?.departureTime||'now';
    const nowBtn=frodon.makeElement('button','plugin-action-btn','Maintenant'); nowBtn.style.cssText+=';flex:1;font-size:.62rem';
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.cssText='flex:2;display:'+(departureTime!=='now'?'block':'none');
    if(departureTime!=='now') laterInp.value=departureTime;
    const laterBtn=frodon.makeElement('button','plugin-action-btn','Planifier'); laterBtn.style.cssText+=';flex:1;font-size:.62rem';
    nowBtn.addEventListener('click',()=>{ departureTime='now'; nowBtn.classList.add('acc'); laterInp.style.display='none'; });
    laterBtn.addEventListener('click',()=>{ laterInp.style.display='block'; nowBtn.classList.remove('acc'); });
    laterInp.addEventListener('change',()=>{ departureTime=laterInp.value; });
    timeRow.appendChild(nowBtn); timeRow.appendChild(laterBtn); timeRow.appendChild(laterInp); form.appendChild(timeRow);

    const noteInp=document.createElement('input'); noteInp.className='f-input'; noteInp.placeholder='Note (détour ok, bagages…)'; noteInp.value=existing?.note||''; noteInp.style.marginBottom='10px'; form.appendChild(noteInp);

    // Activer le bon rôle
    if(selectedRole==='passenger') { passBtn.classList.add('acc'); } else { driverBtn.classList.add('acc'); }

    const saveBtn=frodon.makeElement('button','plugin-action-btn acc','🚗 Publier le trajet'); saveBtn.style.cssText+=';width:100%';
    saveBtn.addEventListener('click',()=>{
      const dest=destInput.value.trim();
      if(!dest){frodon.showToast('Destination requise',true);return;}
      const profile={role:selectedRole, destination:dest, from:fromInput.value.trim(),
        departureTime, seats:parseInt(seatsInp.value)||1, note:noteInp.value.trim(), updatedAt:Date.now()};
      store.set('profile',profile);
      // Broadcast to peers
      Object.keys(localStorage).filter(k=>k.startsWith('frd_disc_')).forEach(k=>{
        try{ const pid=k.replace('frd_disc_',''); frodon.sendDM(pid,PLUGIN_ID,{type:'profile_data',profile,_silent:true}); }catch(e){}
      });
      frodon.showToast('🚗 Trajet publié !');
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
