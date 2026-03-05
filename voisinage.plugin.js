frodon.register({
  id: 'voisinage',
  name: 'Voisinage',
  version: '3.2.0',
  author: 'frodon-community',
  description: 'Demandez de l\'aide ou proposez une activité à vos voisins.',
  icon: '🏘',
}, () => {

  const PLUGIN_ID = 'voisinage';
  const store = frodon.storage(PLUGIN_ID);

  const CATS_AIDE=['🔧 Bricolage','📦 Déménagement','🛒 Courses','🐾 Animaux','🌱 Jardinage','💻 Tech','🚗 Transport','❓ Autre'];
  const CATS_ACTIV=['☕ Café/Resto','🚶 Balade','⚽ Sport','🎲 Jeux','🎬 Ciné','📚 Culture','🎵 Musique','❓ Autre'];

  function getMyPosts() { return store.get('my_posts')||[]; }
  function saveMyPosts(p) { store.set('my_posts',p); }
  function getConvs() { return store.get('convs')||{}; }
  // convs = { peerId: { peerName, postId, postTitle, postType, postCategory, msgs:[{fromMe,text,ts,read}] } }

  function postActive(p){
    if(p.when==='now') return Date.now()-p.createdAt < 8*60*60*1000;
    return new Date(p.when) > new Date(Date.now()-60*60*1000);
  }

  /* ── DM ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type==='posts_data'){
      store.set('peer_posts_'+fromId,{posts:payload.posts,ts:Date.now()});
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type==='request_posts'){
      const active=getMyPosts().filter(postActive);
      if(active.length) frodon.sendDM(fromId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    }
    if(payload.type==='apply'){
      const peer=frodon.getPeer(fromId);
      const convs=getConvs();
      const key=fromId+'_'+payload.postId;
      if(!convs[key]) convs[key]={
        peerName:peer?.name||'?', peerId:fromId,
        postId:payload.postId, postTitle:payload.postTitle, postType:payload.postType, postCategory:payload.postCategory,
        msgs:[]
      };
      convs[key].msgs.push({fromMe:false, text:payload.message||'Candidature', ts:Date.now(), read:false});
      store.set('convs',convs);
      frodon.showToast('🏘 '+(peer?.name||'Voisin')+' répond à "'+payload.postTitle+'"');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type==='chat'){
      const peer=frodon.getPeer(fromId);
      const convs=getConvs();
      const key=payload.convKey||fromId;
      if(!convs[key]) convs[key]={peerName:peer?.name||'?',peerId:fromId,msgs:[]};
      if(peer?.name) convs[key].peerName=peer.name;
      convs[key].msgs.push({fromMe:false,text:payload.text,ts:Date.now(),read:false});
      store.set('convs',convs);
      frodon.showToast('🏘 Message de '+(peer?.name||'Voisin'));
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container)=>{
    const active=getMyPosts().filter(postActive); if(!active.length) return;
    active.slice(0,2).forEach(p=>{
      const isAide=p.type==='aide';
      const card=frodon.makeElement('div',''); card.style.cssText='background:'+(isAide?'rgba(255,107,53,.07)':'rgba(0,245,200,.06)')+';border:1px solid '+(isAide?'rgba(255,107,53,.28)':'rgba(0,245,200,.22)')+';border-radius:var(--r);padding:8px 11px;margin-top:5px';
      const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.57rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:2px'; lbl.textContent=(isAide?'🆘 Cherche':'🤝 Propose')+' · '+p.category; card.appendChild(lbl);
      const t=frodon.makeElement('div',''); t.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; t.textContent=p.title; card.appendChild(t);
      container.appendChild(card);
    });
  });

  /* ── SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'annonces', label: '🏘 Annonces',
      render(container) {
        const myPosts=getMyPosts().filter(postActive);
        const allPeer=[];
        const seen=new Set();
        frodon.getAllPeers().forEach(peer=>{
          if(seen.has(peer.peerId)) return; seen.add(peer.peerId);
          const cached=store.get('peer_posts_'+peer.peerId);
          if(!cached?.posts) return;
          cached.posts.filter(postActive).forEach(p=>allPeer.push({...p,_peerId:peer.peerId,_peerName:peer.name||peer.peerId.substring(0,8)+'…'}));
        });
        allPeer.sort((a,b)=>b.createdAt-a.createdAt);

        if(!myPosts.length&&!allPeer.length){
          const em=frodon.makeElement('div','no-posts'); em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:8px">🏘</div>Aucune annonce à proximité.<br><small style="color:var(--txt3)">Créez une annonce dans ⚙</small>'; container.appendChild(em); return;
        }

        if(myPosts.length){
          _sLabel(container,'● Mes annonces');
          myPosts.forEach(p=>{
            const isAide=p.type==='aide';
            const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid '+(isAide?'rgba(255,107,53,.22)':'rgba(0,245,200,.18)')+';border-radius:var(--r);margin:0 8px 6px;padding:9px 12px';
            const badge=frodon.makeElement('div',''); badge.style.cssText='font-size:.57rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:3px'; badge.textContent=(isAide?'🆘 Cherche':'🤝 Propose')+' · '+p.category; card.appendChild(badge);
            const t=frodon.makeElement('div',''); t.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; t.textContent=p.title; card.appendChild(t);
            const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-top:3px'; meta.textContent='⏰ '+(p.when==='now'?'Maintenant':new Date(p.when).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}))+(p.location?' · 📍'+p.location:''); card.appendChild(meta);
            container.appendChild(card);
          });
        }

        if(allPeer.length){
          _sLabel(container, allPeer.length+' annonce'+(allPeer.length>1?'s':'')+' à proximité');
          allPeer.forEach(p=>{
            const applied=store.get('applied_'+p._peerId+'_'+p.id);
            container.appendChild(_peerPostCard(p, applied, container));
          });
        }
      }
    },
    {
      id: 'candidatures', label: '📬 Candidatures',
      render(container) {
        const convs=getConvs();
        const entries=Object.entries(convs);
        if(!entries.length){
          const em=frodon.makeElement('div','no-posts'); em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:8px">📬</div>Aucune candidature.<br><small style="color:var(--txt3)">Apparaissent quand des voisins répondent.</small>'; container.appendChild(em); return;
        }
        const unreadTotal=entries.reduce((s,[,c])=>s+c.msgs.filter(m=>!m.read&&!m.fromMe).length,0);
        entries.forEach(([key,conv])=>{
          const unread=conv.msgs.filter(m=>!m.read&&!m.fromMe).length;
          const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:6px 8px 0;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer';
          card.addEventListener('click',()=>{ container.innerHTML=''; _renderConvDetail(container,key,conv); });
          const av=frodon.makeElement('div',''); av.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;font-family:var(--mono);font-weight:700'; av.textContent=(conv.peerName||'?')[0].toUpperCase();
          const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2)'; nameEl.textContent=conv.peerName; info.appendChild(nameEl);
          if(conv.postTitle){const pt=frodon.makeElement('div',''); pt.style.cssText='font-size:.63rem;color:var(--txt2)'; pt.textContent='Re: '+conv.postTitle+(conv.postType==='aide'?' 🆘':' 🤝'); info.appendChild(pt);}
          if(conv.msgs.length){const last=conv.msgs[conv.msgs.length-1]; const prev=frodon.makeElement('div',''); prev.style.cssText='font-size:.62rem;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; prev.textContent=(last.fromMe?'Vous : ':'')+last.text; info.appendChild(prev);}
          const right=frodon.makeElement('div',''); right.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0';
          if(conv.msgs.length){const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono)'; ts.textContent=frodon.formatTime(conv.msgs[conv.msgs.length-1].ts); right.appendChild(ts);}
          if(unread){const badge=frodon.makeElement('div',''); badge.style.cssText='background:var(--acc);color:#000;font-size:.58rem;font-weight:700;border-radius:99px;padding:1px 6px;font-family:var(--mono)'; badge.textContent=unread; right.appendChild(badge);}
          card.appendChild(av); card.appendChild(info); card.appendChild(right);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'settings', label: '⚙ Mes annonces', settings:true,
      render(container) {
        _renderForm(container);
        const posts=getMyPosts();
        if(posts.length){
          const lbl=frodon.makeElement('div','section-label'); lbl.textContent='Mes annonces'; container.appendChild(lbl);
          posts.forEach(p=>{
            const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--sur);border-bottom:1px solid var(--bdr)';
            const dot=frodon.makeElement('span','',postActive(p)?'●':'○'); dot.style.cssText='color:'+(postActive(p)?'var(--ok)':'var(--txt3)')+';font-size:.7rem;flex-shrink:0';
            const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.title,style:{fontSize:'.72rem',fontWeight:'700',color:'var(--txt)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}));
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.category,style:{fontSize:'.6rem',color:'var(--txt2)'}}));
            const del=frodon.makeElement('button',''); del.style.cssText='background:none;border:none;cursor:pointer;color:var(--txt3);font-size:.9rem;padding:2px 4px;flex-shrink:0'; del.textContent='✕';
            del.addEventListener('click',()=>{
              const updated=getMyPosts().filter(x=>x.id!==p.id); saveMyPosts(updated);
              const active=updated.filter(postActive);
              frodon.getAllPeers().forEach(peer=>{
                frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
              });
              frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
            });
            row.appendChild(dot); row.appendChild(info); row.appendChild(del); container.appendChild(row);
          });
        }
      }
    },
  ]);

  function _peerPostCard(p, applied, sphereContainer) {
    const isAide=p.type==='aide';
    const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:0 8px 8px;overflow:hidden';

    // Header profil cliquable
    const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
    hdr.addEventListener('click',()=>frodon.openPeer(p._peerId));
    const av=frodon.makeElement('div',''); av.style.cssText='width:28px;height:28px;border-radius:50%;background:rgba(124,77,255,.15);border:1px solid rgba(124,77,255,.25);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:var(--mono);font-weight:700;flex-shrink:0'; av.textContent=p._peerName[0].toUpperCase();
    const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.7rem;font-weight:700;color:var(--acc2);flex:1'; nameEl.textContent=p._peerName;
    const cat=frodon.makeElement('div',''); cat.style.cssText='font-size:.58rem;font-family:var(--mono);color:'+(isAide?'#ff6b35':'var(--acc)'); cat.textContent=(isAide?'🆘':'🤝')+' '+p.category;
    hdr.appendChild(av); hdr.appendChild(nameEl); hdr.appendChild(cat); card.appendChild(hdr);

    // Contenu complet
    const body=frodon.makeElement('div',''); body.style.cssText='padding:9px 12px 11px';
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.82rem;font-weight:700;color:var(--txt);margin-bottom:3px'; t.textContent=p.title; body.appendChild(t);
    if(p.description){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.65rem;color:var(--txt2);margin-bottom:4px'; d.textContent=p.description; body.appendChild(d);}
    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);line-height:1.8;margin-bottom:8px';
    let mh='⏰ '+(p.when==='now'?'<b style="color:var(--ok)">Maintenant</b>':'<b style="color:var(--txt)">'+new Date(p.when).toLocaleString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+'</b>');
    if(p.location) mh+='<br>📍 '+p.location;
    if(p.maxPeople) mh+='<br>👥 Max '+p.maxPeople+' personnes';
    meta.innerHTML=mh; body.appendChild(meta);

    if(applied){
      const done=frodon.makeElement('div',''); done.style.cssText='font-size:.66rem;color:var(--ok);font-family:var(--mono);padding:2px 0;margin-bottom:4px'; done.textContent='✓ Candidature envoyée'; body.appendChild(done);
      const convBtn=frodon.makeElement('button','plugin-action-btn','💬 Voir la conversation');
      convBtn.addEventListener('click',()=>{
        const key=p._peerId+'_'+p.id;
        const convs=getConvs();
        sphereContainer.innerHTML='';
        _renderConvDetail(sphereContainer, key, convs[key]||{peerName:p._peerName,peerId:p._peerId,postTitle:p.title,postType:p.type,postCategory:p.category,msgs:[]});
      });
      body.appendChild(convBtn);
    } else {
      const applyBtn=frodon.makeElement('button','plugin-action-btn acc','🙋 Candidater');
      applyBtn.style.cssText+=';width:100%';
      applyBtn.addEventListener('click',()=>{
        store.set('applied_'+p._peerId+'_'+p.id, true);
        // Créer conv
        const convs=getConvs(); const key=p._peerId+'_'+p.id;
        if(!convs[key]) convs[key]={peerName:p._peerName,peerId:p._peerId,postId:p.id,postTitle:p.title,postType:p.type,postCategory:p.category,msgs:[]};
        store.set('convs',convs);
        setTimeout(()=>frodon.sendDM(p._peerId,PLUGIN_ID,{type:'apply',postId:p.id,postTitle:p.title,postType:p.type,postCategory:p.category,message:'Je suis intéressé'+(p.type==='aide'?' pour vous aider':' par cette activité')+'.',_label:'🏘 Candidature voisinage'}),300);
        frodon.refreshSphereTab(PLUGIN_ID);
        // Ouvrir conv dans candidatures
        sphereContainer.innerHTML='';
        _renderConvDetail(sphereContainer, key, convs[key]);
      });
      body.appendChild(applyBtn);
    }
    card.appendChild(body); return card;
  }

  function _renderConvDetail(container, convKey, conv) {
    if(!conv) conv={peerName:'?',peerId:convKey,msgs:[]};
    const peerId=conv.peerId||convKey.split('_')[0];
    const name=conv.peerName||'?';

    // Top bar avec retour
    const topBar=frodon.makeElement('div',''); topBar.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--bdr);flex-shrink:0';
    const backBtn=frodon.makeElement('button',''); backBtn.style.cssText='background:none;border:none;cursor:pointer;color:var(--acc);font-size:.85rem;padding:2px 6px 2px 0'; backBtn.textContent='←';
    backBtn.addEventListener('click',()=>{ container.innerHTML=''; frodon.refreshSphereTab(PLUGIN_ID); });
    const av=frodon.makeElement('div',''); av.style.cssText='width:32px;height:32px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;font-family:var(--mono);font-weight:700;cursor:pointer'; av.textContent=name[0].toUpperCase(); av.addEventListener('click',()=>frodon.openPeer(peerId));
    const hInfo=frodon.makeElement('div',''); hInfo.style.cssText='flex:1;min-width:0';
    const hName=frodon.makeElement('div',''); hName.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);cursor:pointer'; hName.textContent=name; hName.addEventListener('click',()=>frodon.openPeer(peerId));
    hInfo.appendChild(hName);
    topBar.appendChild(backBtn); topBar.appendChild(av); topBar.appendChild(hInfo); container.appendChild(topBar);

    // Rappel de l'annonce
    if(conv.postTitle){
      const isAide=conv.postType==='aide';
      const recap=frodon.makeElement('div',''); recap.style.cssText='margin:8px 10px 0;padding:8px 10px;background:'+(isAide?'rgba(255,107,53,.07)':'rgba(0,245,200,.07)')+';border:1px solid '+(isAide?'rgba(255,107,53,.25)':'rgba(0,245,200,.2)')+';border-radius:8px';
      const rl=frodon.makeElement('div',''); rl.style.cssText='font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:3px'; rl.textContent=(isAide?'🆘 Cherche aide':'🤝 Propose')+' · '+(conv.postCategory||'');
      const rt=frodon.makeElement('div',''); rt.style.cssText='font-size:.76rem;font-weight:700;color:var(--txt)'; rt.textContent=conv.postTitle;
      recap.appendChild(rl); recap.appendChild(rt); container.appendChild(recap);
    }

    // Fil
    const feed=frodon.makeElement('div',''); feed.style.cssText='flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:5px;min-height:120px;max-height:280px';

    const convs=getConvs();
    if(convs[convKey]) { convs[convKey].msgs.forEach(m=>{if(!m.fromMe)m.read=true;}); store.set('convs',convs); }

    function renderMsgs(){
      feed.innerHTML='';
      const c2=getConvs(); const msgs=(c2[convKey]?.msgs)||conv.msgs||[];
      if(!msgs.length){ const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;color:var(--txt3);font-size:.66rem;padding:16px 0'; em.textContent='Démarrez la conversation…'; feed.appendChild(em); }
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
    renderMsgs(); container.appendChild(feed);

    // Saisie
    const inputRow=frodon.makeElement('div',''); inputRow.style.cssText='display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--bdr);flex-shrink:0';
    const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=500; ta.placeholder='Votre message…'; ta.style.cssText+=';flex:1;resize:none';
    const sendBtn=frodon.makeElement('button','plugin-action-btn acc','↑'); sendBtn.style.cssText+=';padding:6px 12px;font-size:.9rem;align-self:flex-end';
    sendBtn.addEventListener('click',()=>{
      const txt=ta.value.trim(); if(!txt) return;
      const convs2=getConvs();
      if(!convs2[convKey]) convs2[convKey]={peerName:name,peerId,postId:conv.postId,postTitle:conv.postTitle,postType:conv.postType,postCategory:conv.postCategory,msgs:[]};
      convs2[convKey].msgs.push({fromMe:true,text:txt,ts:Date.now(),read:true});
      store.set('convs',convs2);
      setTimeout(()=>frodon.sendDM(peerId,PLUGIN_ID,{type:'chat',text:txt,convKey,_label:'🏘 Message voisinage'}),300);
      ta.value=''; renderMsgs();
    });
    ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendBtn.click();} });
    inputRow.appendChild(ta); inputRow.appendChild(sendBtn); container.appendChild(inputRow);
  }

  function _sLabel(container,text){ const l=frodon.makeElement('div','section-label'); l.textContent=text; container.appendChild(l); }

  function _renderForm(container){
    const form=frodon.makeElement('div',''); form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent='Nouvelle annonce'; form.appendChild(title);

    const typeRow=frodon.makeElement('div',''); typeRow.style.cssText='display:flex;gap:6px;margin-bottom:9px';
    let selType='aide';
    const aBtn=frodon.makeElement('button','plugin-action-btn acc','🆘 Cherche aide'); aBtn.style.cssText+=';flex:1;font-size:.63rem';
    const acBtn=frodon.makeElement('button','plugin-action-btn','🤝 Propose activité'); acBtn.style.cssText+=';flex:1;font-size:.63rem';
    let selCat=CATS_AIDE[0];
    const catWrap=frodon.makeElement('div',''); catWrap.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px';

    function rebuildCats(type){
      const cats=type==='aide'?CATS_AIDE:CATS_ACTIV; selCat=cats[0]; catWrap.innerHTML='';
      cats.forEach(cat=>{
        const cb=frodon.makeElement('button',''); cb.style.cssText='padding:3px 8px;border-radius:6px;border:1px solid var(--bdr2);background:var(--sur2);color:var(--txt2);font-size:.6rem;cursor:pointer;transition:all .15s'; cb.textContent=cat;
        cb.addEventListener('click',()=>{selCat=cat; catWrap.querySelectorAll('button').forEach(b=>{b.style.background='var(--sur2)';b.style.color='var(--txt2)';b.style.borderColor='var(--bdr2)';}); cb.style.background=type==='aide'?'rgba(255,107,53,.12)':'rgba(0,245,200,.1)'; cb.style.color=type==='aide'?'#ff6b35':'var(--acc)'; cb.style.borderColor=type==='aide'?'rgba(255,107,53,.35)':'rgba(0,245,200,.3)';});
        if(cat===selCat) cb.click(); catWrap.appendChild(cb);
      });
      maxRow.style.display=type==='activite'?'flex':'none';
    }
    aBtn.addEventListener('click',()=>{selType='aide';aBtn.classList.add('acc');acBtn.classList.remove('acc');rebuildCats('aide');});
    acBtn.addEventListener('click',()=>{selType='activite';acBtn.classList.add('acc');aBtn.classList.remove('acc');rebuildCats('activite');});
    typeRow.appendChild(aBtn); typeRow.appendChild(acBtn); form.appendChild(typeRow);

    const catLbl=frodon.makeElement('div',''); catLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; catLbl.textContent='Catégorie'; form.appendChild(catLbl); form.appendChild(catWrap);

    const fl=(p,t)=>{const l=frodon.makeElement('div',''); l.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:7px'; l.textContent=t; p.appendChild(l);};
    fl(form,'Titre *'); const tInp=document.createElement('input'); tInp.className='f-input'; tInp.placeholder='Ex: Aide pour monter un meuble ? / Balade dimanche matin ?'; tInp.maxLength=100; tInp.style.marginBottom='5px'; form.appendChild(tInp);
    fl(form,'Détails'); const dInp=document.createElement('textarea'); dInp.className='f-input'; dInp.rows=2; dInp.maxLength=300; dInp.placeholder='Description, matériel, conditions…'; dInp.style.marginBottom='5px'; form.appendChild(dInp);
    fl(form,'📍 Lieu (optionnel)'); const lInp=document.createElement('input'); lInp.className='f-input'; lInp.placeholder='Quartier, adresse, lieu de RDV…'; lInp.style.marginBottom='5px'; form.appendChild(lInp);

    const maxRow=frodon.makeElement('div',''); maxRow.style.cssText='display:none;align-items:center;gap:8px;margin-bottom:5px';
    const maxLbl=frodon.makeElement('div',''); maxLbl.style.cssText='font-size:.63rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; maxLbl.textContent='👥 Participants max :';
    const maxInp=document.createElement('input'); maxInp.type='number'; maxInp.className='f-input'; maxInp.min='2'; maxInp.max='50'; maxInp.value='5'; maxInp.style.width='60px';
    maxRow.appendChild(maxLbl); maxRow.appendChild(maxInp); form.appendChild(maxRow);
    rebuildCats('aide');

    fl(form,'⏰ Quand');
    const whenRow=frodon.makeElement('div',''); whenRow.style.cssText='display:flex;gap:6px;margin-bottom:10px;align-items:center';
    let when='now';
    const nowBtn=frodon.makeElement('button','plugin-action-btn acc','Maintenant'); nowBtn.style.cssText+=';flex:1;font-size:.62rem';
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.cssText='flex:2;display:none';
    const planBtn=frodon.makeElement('button','plugin-action-btn','Planifier'); planBtn.style.cssText+=';flex:1;font-size:.62rem';
    nowBtn.addEventListener('click',()=>{when='now';nowBtn.classList.add('acc');laterInp.style.display='none';});
    planBtn.addEventListener('click',()=>{laterInp.style.display='block';nowBtn.classList.remove('acc');});
    laterInp.addEventListener('change',()=>{when=laterInp.value;});
    whenRow.appendChild(nowBtn); whenRow.appendChild(planBtn); whenRow.appendChild(laterInp); form.appendChild(whenRow);

    const pubBtn=frodon.makeElement('button','plugin-action-btn acc','📢 Publier'); pubBtn.style.cssText+=';width:100%';
    pubBtn.addEventListener('click',()=>{
      const t=tInp.value.trim(); if(!t){frodon.showToast('Titre requis',true);return;}
      const post={id:'post_'+Date.now(),type:selType,category:selCat,title:t,description:dInp.value.trim(),location:lInp.value.trim(),maxPeople:selType==='activite'?parseInt(maxInp.value)||null:null,when,createdAt:Date.now()};
      const posts=getMyPosts(); posts.unshift(post); if(posts.length>15)posts.length=15;
      saveMyPosts(posts);
      const active=posts.filter(postActive);
      frodon.getAllPeers().forEach(peer=>frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true}));
      frodon.showToast('🏘 Annonce publiée !');
      tInp.value=''; dInp.value=''; lInp.value='';
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
    });
    form.appendChild(pubBtn); container.appendChild(form);
  }

  frodon.onPeerAppear(peer=>{
    const active=getMyPosts().filter(postActive);
    if(active.length) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_posts',_silent:true});
  });

  return { destroy() {} };
});
