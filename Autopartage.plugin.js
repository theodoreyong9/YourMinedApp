frodon.register({
  id: 'autopartage',
  name: 'Autopartage',
  version: '3.2.0',
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
  function getConvs() { return store.get('convs') || {}; }
  // convs = { peerId: { peerName, peerProfile, msgs:[{fromMe,text,ts}], postInfo } }

  const _requested = new Set(); // éviter re-demandes en boucle

  /* ── DM ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type === 'profile_data') {
      store.set('peer_ap_'+fromId, {profile:payload.profile, ts:Date.now()});
      _requested.delete(fromId);
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type === 'request_profile') {
      const p = getMyProfile();
      if(p && profileActive(p))
        frodon.sendDM(fromId, PLUGIN_ID, {type:'profile_data', profile:p, _silent:true});
    }
    if(payload.type === 'apply') {
      const peer = frodon.getPeer(fromId);
      const convs = getConvs();
      if(!convs[fromId]) convs[fromId] = {peerName:peer?.name||'?', peerProfile:getPeerProfile(fromId)?.profile||null, msgs:[], applied:true};
      convs[fromId].msgs.push({fromMe:false, text:payload.message||'Candidature', ts:Date.now()});
      if(convs[fromId].msgs.length > 200) convs[fromId].msgs.splice(0, convs[fromId].msgs.length-200);
      store.set('convs', convs);
      frodon.showToast('🚗 '+(peer?.name||'Pair')+' candidate pour votre trajet');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type === 'chat') {
      const peer = frodon.getPeer(fromId);
      const convs = getConvs();
      if(!convs[fromId]) convs[fromId] = {peerName:peer?.name||'?', peerProfile:null, msgs:[]};
      if(peer?.name) convs[fromId].peerName = peer.name;
      convs[fromId].msgs.push({fromMe:false, text:payload.text, ts:Date.now()});
      if(convs[fromId].msgs.length > 200) convs[fromId].msgs.splice(0, convs[fromId].msgs.length-200);
      store.set('convs', convs);
      frodon.showToast('🚗 Message de '+(peer?.name||'Pair'));
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

        // Dédoublonner par peerId
        const seen = new Set();
        const allPeers = frodon.getAllPeers().filter(p => {
          if(seen.has(p.peerId)) return false;
          seen.add(p.peerId); return true;
        });

        // Demander les profils manquants (une seule fois par peer)
        allPeers.forEach(peer => {
          if(!_requested.has(peer.peerId)) {
            const cached = getPeerProfile(peer.peerId);
            if(!cached || Date.now() - cached.ts > 120000) {
              _requested.add(peer.peerId);
              frodon.sendDM(peer.peerId, PLUGIN_ID, {type:'request_profile', _silent:true});
            }
          }
        });

        const compatible = allPeers
          .map(peer => ({peer, profile: getPeerProfile(peer.peerId)?.profile}))
          .filter(({profile}) => profile && profileActive(profile))
          .filter(({profile}) => amDriver ? profile.role==='passenger' : profile.role==='driver');

        if(!compatible.length) {
          _empty(container, '🚗', allPeers.length
            ? 'Aucun '+(amDriver?'passager':'conducteur')+' visible parmi '+allPeers.length+' pair(s).\nLes profils arrivent dans quelques secondes…'
            : 'Aucun pair à proximité.');
          return;
        }

        const applied = store.get('applied') || {};
        _sLabel(container, amDriver ? 'Passagers qui cherchent' : 'Conducteurs disponibles');

        compatible.forEach(({peer, profile}) => {
          const name = peer.name || peer.peerId.substring(0,8)+'…';
          const card = frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:0 8px 8px;overflow:hidden';

          // Header cliquable → profil
          const hdr = frodon.makeElement('div','');
          hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click', ()=>frodon.openPeer(peer.peerId));
          const av=frodon.makeElement('div','');
          av.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(0,232,122,.15);border:1px solid rgba(0,232,122,.3);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono);font-weight:700';
          av.textContent=name[0].toUpperCase();
          const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; nameEl.textContent=name;
          const destEl=frodon.makeElement('div',''); destEl.style.cssText='font-size:.7rem;color:var(--acc);margin-top:1px;font-weight:600'; destEl.textContent='→ '+profile.destination;
          info.appendChild(nameEl); info.appendChild(destEl);
          const timeEl=frodon.makeElement('div',''); timeEl.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);text-align:right;flex-shrink:0';
          timeEl.textContent=profile.departureTime==='now'?'Maintenant':new Date(profile.departureTime).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'});
          hdr.appendChild(av); hdr.appendChild(info); hdr.appendChild(timeEl);
          card.appendChild(hdr);

          // Détails complets
          const body=frodon.makeElement('div',''); body.style.cssText='padding:9px 12px 11px';
          const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);line-height:1.9;margin-bottom:9px';
          let mh='';
          if(profile.from) mh+='📍 Depuis : <b style="color:var(--txt)">'+profile.from+'</b><br>';
          if(profile.role==='driver') mh+='💺 <b style="color:var(--txt)">'+profile.seats+'</b> place'+(profile.seats>1?'s disponibles':'disponible')+'<br>';
          if(profile.departureTime!=='now') mh+='⏰ <b style="color:var(--txt)">'+new Date(profile.departureTime).toLocaleString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+'</b><br>';
          else mh+='⏰ <b style="color:var(--ok)">Départ immédiat</b><br>';
          if(profile.note) mh+='📝 '+profile.note;
          meta.innerHTML=mh; body.appendChild(meta);

          if(applied[peer.peerId]) {
            const doneLbl=frodon.makeElement('div',''); doneLbl.style.cssText='font-size:.64rem;color:var(--ok);font-family:var(--mono);padding:4px 0';
            doneLbl.textContent='✓ Candidature envoyée — échange dans Réceptions';
            body.appendChild(doneLbl);
          } else {
            const applyBtn=frodon.makeElement('button','plugin-action-btn acc','🚗 Candidater');
            applyBtn.style.cssText+=';width:100%';
            applyBtn.addEventListener('click',()=>{
              // Marquer candidaté
              const a=store.get('applied')||{}; a[peer.peerId]=true; store.set('applied',a);
              // Créer conversation
              const convs=getConvs();
              if(!convs[peer.peerId]) convs[peer.peerId]={peerName:name,peerProfile:profile,msgs:[]};
              store.set('convs',convs);
              // Envoyer candidature
              setTimeout(()=>frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'apply',message:'Je candidate pour votre trajet.',_label:'🚗 Candidature autopartage'}),300);
              frodon.refreshSphereTab(PLUGIN_ID);
            });
            body.appendChild(applyBtn);
          }
          card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'reception', label: '📬 Réceptions',
      render(container) {
        const convs = getConvs();
        const entries = Object.entries(convs);
        if(!entries.length){ _empty(container,'📬','Aucune conversation.\nCandidatez à un trajet ou attendez des candidats.'); return; }

        // Liste des conversations
        entries.forEach(([peerId, conv]) => {
          const unread = conv.msgs.filter(m=>!m.read&&!m.fromMe).length;
          const card=frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:6px 8px 0;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer';
          card.addEventListener('click',()=>{
            container.innerHTML='';
            _renderConvDetail(container, peerId, conv);
          });
          const av=frodon.makeElement('div','');
          av.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono);font-weight:700';
          av.textContent=(conv.peerName||'?')[0].toUpperCase();
          const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2)'; nameEl.textContent=conv.peerName;
          info.appendChild(nameEl);
          if(conv.peerProfile){
            const dest=frodon.makeElement('div',''); dest.style.cssText='font-size:.64rem;color:var(--txt2)'; dest.textContent='→ '+(conv.peerProfile.destination||'?'); info.appendChild(dest);
          }
          if(conv.msgs.length){
            const last=conv.msgs[conv.msgs.length-1];
            const preview=frodon.makeElement('div',''); preview.style.cssText='font-size:.62rem;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; preview.textContent=(last.fromMe?'Vous : ':'')+last.text; info.appendChild(preview);
          }
          const right=frodon.makeElement('div',''); right.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0';
          if(conv.msgs.length) { const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono)'; ts.textContent=frodon.formatTime(conv.msgs[conv.msgs.length-1].ts); right.appendChild(ts); }
          if(unread){ const badge=frodon.makeElement('div',''); badge.style.cssText='background:var(--acc);color:#000;font-size:.58rem;font-weight:700;border-radius:99px;padding:1px 6px;font-family:var(--mono)'; badge.textContent=unread; right.appendChild(badge); }
          card.appendChild(av); card.appendChild(info); card.appendChild(right);
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

  function _renderConvDetail(container, peerId, conv) {
    const peer = frodon.getPeer(peerId);
    const name = conv.peerName;
    const profile = conv.peerProfile || getPeerProfile(peerId)?.profile;

    // Header avec retour
    const topBar=frodon.makeElement('div','');
    topBar.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--bdr);flex-shrink:0';
    const backBtn=frodon.makeElement('button','');
    backBtn.style.cssText='background:none;border:none;cursor:pointer;color:var(--acc);font-size:.85rem;padding:2px 6px 2px 0';
    backBtn.textContent='←';
    backBtn.addEventListener('click',()=>{ container.innerHTML=''; frodon.refreshSphereTab(PLUGIN_ID); });
    const av=frodon.makeElement('div','');
    av.style.cssText='width:32px;height:32px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;font-family:var(--mono);font-weight:700;cursor:pointer';
    av.textContent=name[0].toUpperCase();
    av.addEventListener('click',()=>frodon.openPeer(peerId));
    const hInfo=frodon.makeElement('div',''); hInfo.style.cssText='flex:1;min-width:0';
    const hName=frodon.makeElement('div',''); hName.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);cursor:pointer'; hName.textContent=name;
    hName.addEventListener('click',()=>frodon.openPeer(peerId));
    hInfo.appendChild(hName);
    if(profile){
      const hDest=frodon.makeElement('div',''); hDest.style.cssText='font-size:.62rem;color:var(--txt2)'; hDest.textContent='→ '+(profile.destination||'?')+' · '+(profile.departureTime==='now'?'Maintenant':new Date(profile.departureTime).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+(profile.role==='driver'?' · 💺'+profile.seats:''); hInfo.appendChild(hDest);
    }
    topBar.appendChild(backBtn); topBar.appendChild(av); topBar.appendChild(hInfo);
    container.appendChild(topBar);

    // Rappel trajet si dispo
    if(profile){
      const recap=frodon.makeElement('div','');
      recap.style.cssText='margin:8px 10px 0;padding:8px 10px;background:rgba(0,232,122,.07);border:1px solid rgba(0,232,122,.2);border-radius:8px;font-size:.62rem;color:var(--txt2);font-family:var(--mono);line-height:1.7';
      let rh='<span style="color:var(--ok);font-weight:700">'+(profile.role==='driver'?'🚗 Conducteur':'🙋 Passager')+'</span> → <b style="color:var(--txt)">'+profile.destination+'</b><br>';
      if(profile.from) rh+='📍 Depuis : '+profile.from+'<br>';
      if(profile.role==='driver') rh+='💺 '+profile.seats+' place'+(profile.seats>1?'s':'')+'<br>';
      rh+='⏰ '+(profile.departureTime==='now'?'Départ immédiat':new Date(profile.departureTime).toLocaleString('fr-FR',{weekday:'long',hour:'2-digit',minute:'2-digit'}));
      if(profile.note) rh+='<br>📝 '+profile.note;
      recap.innerHTML=rh;
      container.appendChild(recap);
    }

    // Fil de messages
    const feed=frodon.makeElement('div','');
    feed.style.cssText='flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:120px;max-height:300px';

    // Marquer lus
    const convs=getConvs();
    if(convs[peerId]) { convs[peerId].msgs.forEach(m=>{if(!m.fromMe)m.read=true;}); store.set('convs',convs); }

    function renderMsgs(){
      feed.innerHTML='';
      const c2=getConvs(); const msgs=(c2[peerId]?.msgs)||[];
      if(!msgs.length){
        const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;color:var(--txt3);font-size:.66rem;padding:16px 0'; em.textContent='Démarrez la conversation…'; feed.appendChild(em);
      }
      msgs.forEach(m=>{
        const bub=frodon.makeElement('div','');
        bub.style.cssText=m.fromMe
          ?'align-self:flex-end;background:rgba(0,245,200,.1);border:1px solid rgba(0,245,200,.2);color:var(--acc);border-radius:10px 10px 2px 10px;padding:6px 10px;font-size:.72rem;max-width:85%;word-break:break-word'
          :'align-self:flex-start;background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);color:var(--txt);border-radius:10px 10px 10px 2px;padding:6px 10px;font-size:.72rem;max-width:85%;word-break:break-word';
        bub.textContent=m.text;
        const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.52rem;opacity:.5;margin-top:2px;text-align:'+(m.fromMe?'right':'left'); ts.textContent=frodon.formatTime(m.ts);
        bub.appendChild(ts); feed.appendChild(bub);
      });
      feed.scrollTop=feed.scrollHeight;
    }
    renderMsgs();
    container.appendChild(feed);

    // Zone saisie
    const inputRow=frodon.makeElement('div','');
    inputRow.style.cssText='display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--bdr);flex-shrink:0';
    const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=500; ta.placeholder='Votre message…'; ta.style.cssText+=';flex:1;resize:none';
    const sendBtn=frodon.makeElement('button','plugin-action-btn acc','↑');
    sendBtn.style.cssText+=';padding:6px 12px;font-size:.9rem;align-self:flex-end';
    sendBtn.addEventListener('click',()=>{
      const txt=ta.value.trim(); if(!txt) return;
      const convs2=getConvs();
      if(!convs2[peerId]) convs2[peerId]={peerName:name,peerProfile:profile,msgs:[]};
      convs2[peerId].msgs.push({fromMe:true,text:txt,ts:Date.now(),read:true});
      store.set('convs',convs2);
      setTimeout(()=>frodon.sendDM(peerId,PLUGIN_ID,{type:'chat',text:txt,_label:'🚗 Message autopartage'}),300);
      ta.value=''; renderMsgs();
    });
    ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendBtn.click();} });
    inputRow.appendChild(ta); inputRow.appendChild(sendBtn);
    container.appendChild(inputRow);
  }

  function _switchTab(tabId, currentContainer, peerId, name, profile) {
    // Basculer vers l'onglet reception et ouvrir la conv
    frodon.focusPlugin(PLUGIN_ID);
    // On ne peut pas changer d'onglet programmatiquement, donc on refresh
    // et la conv s'ouvrira via le render normal de réceptions
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  function _openConv(container, peerId, name, profile) {
    container.innerHTML='';
    _renderConvDetail(container, peerId, {peerName:name, peerProfile:profile, msgs:(getConvs()[peerId]?.msgs)||[]});
  }

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
    const seatsRow=frodon.makeElement('div',''); seatsRow.style.cssText='display:'+(role==='driver'?'flex':'none')+';align-items:center;gap:8px;margin-bottom:6px';
    const fromRow=frodon.makeElement('div',''); fromRow.style.display=role==='passenger'?'block':'none';
    dBtn.addEventListener('click',()=>{role='driver';dBtn.classList.add('acc');pBtn.classList.remove('acc');seatsRow.style.display='flex';fromRow.style.display='none';});
    pBtn.addEventListener('click',()=>{role='passenger';pBtn.classList.add('acc');dBtn.classList.remove('acc');seatsRow.style.display='none';fromRow.style.display='block';});
    roleRow.appendChild(dBtn); roleRow.appendChild(pBtn); form.appendChild(roleRow);
    _fl(form,'Destination *');
    const destInp=document.createElement('input'); destInp.className='f-input'; destInp.placeholder='Ex: Gare de Lyon, Bordeaux…'; destInp.value=existing?.destination||''; destInp.style.marginBottom='6px'; form.appendChild(destInp);
    _fl(fromRow,'Point de départ');
    const fromInp=document.createElement('input'); fromInp.className='f-input'; fromInp.placeholder='Votre lieu de départ'; fromInp.value=existing?.from||''; fromInp.style.marginBottom='6px'; fromRow.appendChild(fromInp); form.appendChild(fromRow);
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
    _requested.delete(peer.peerId);
    const p=getMyProfile();
    if(p&&profileActive(p)) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'profile_data',profile:p,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_profile',_silent:true});
  });

  return { destroy() {} };
});
