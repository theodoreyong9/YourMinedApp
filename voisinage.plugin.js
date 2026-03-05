/**
 * FRODON PLUGIN — Voisinage v3.0.0
 *
 * ⚙ Paramètres : créer/gérer ses annonces (aide ou activité)
 *
 * SPHERE onglet "Annonces" :
 *   - Toutes les annonces des pairs ET les miennes, détaillées avec profil
 *   - Bouton Candidater sur chaque annonce → formulaire message + contact
 *
 * SPHERE onglet "Candidatures" :
 *   - Messages reçus par annonce, groupés par pair, échange possible
 */
frodon.register({
  id: 'voisinage',
  name: 'Voisinage',
  version: '3.0.0',
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
  // Messages reçus : [{fromId,fromName,postId,postTitle,postType,message,contact,ts}]
  function getMessages() { return store.get('messages')||[]; }
  // Candidatures envoyées : {postId+peerId: true}
  function getApplied() { return store.get('applied')||{}; }

  function postActive(p){
    if(p.when==='now') return Date.now()-p.createdAt < 8*60*60*1000;
    return new Date(p.when) > new Date(Date.now()-60*60*1000);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type==='posts_data'){
      store.set('peer_posts_'+fromId,{posts:payload.posts,ts:Date.now()});
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type==='request_posts'){
      const active=getMyPosts().filter(postActive);
      if(active.length) frodon.sendDM(fromId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    }
    if(payload.type==='post_deleted'){
      const deleted=store.get('deleted_posts')||[];
      if(!deleted.includes(payload.postId)) deleted.push(payload.postId);
      if(deleted.length>100) deleted.splice(0, deleted.length-100);
      store.set('deleted_posts', deleted);
      frodon.refreshSphereTab(PLUGIN_ID);
    }
    if(payload.type==='apply'||payload.type==='message'){
      const peer=frodon.getPeer(fromId);
      const msgs=getMessages();
      msgs.unshift({fromId,fromName:peer?.name||'?',fromAvatar:peer?.avatar||'',
        postId:payload.postId,postTitle:payload.postTitle||'',postType:payload.postType||'',
        message:payload.message,contact:payload.contact||'',ts:Date.now(),read:false});
      if(msgs.length>100)msgs.length=100;
      store.set('messages',msgs);
      frodon.showToast('🏘 '+(peer?.name||'Voisin')+' répond à "'+( payload.postTitle||'votre annonce')+'" !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container)=>{
    const active=getMyPosts().filter(postActive); if(!active.length) return;
    active.slice(0,2).forEach(p=>{
      const isAide=p.type==='aide';
      const card=frodon.makeElement('div',''); card.style.cssText='background:'+(isAide?'rgba(255,107,53,.07)':'rgba(0,245,200,.06)')+';border:1px solid '+(isAide?'rgba(255,107,53,.28)':'rgba(0,245,200,.22)')+';border-radius:10px;padding:8px 11px;margin-top:5px';
      const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.57rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:2px'; lbl.textContent=(isAide?'🆘 Cherche':'🤝 Propose')+' · '+p.category; card.appendChild(lbl);
      const t=frodon.makeElement('div',''); t.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; t.textContent=p.title; card.appendChild(t);
      container.appendChild(card);
    });
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'annonces', label: '🏘 Annonces',
      render(container) {
        // Mes annonces actives
        const myPosts=getMyPosts().filter(postActive);
        // Annonces des pairs actuellement découverts
        const allPeer=[];
        frodon.getAllPeers().forEach(peer => {
          const cached=store.get('peer_posts_'+peer.peerId);
          if(!cached?.posts) return;
          cached.posts.filter(postActive).forEach(p=>allPeer.push({...p,_peerId:peer.peerId}));
        });
        allPeer.sort((a,b)=>b.createdAt-a.createdAt);

        if(!myPosts.length&&!allPeer.length){
          const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏘</div>Aucune annonce à proximité.<br><small style="color:var(--txt3)">Créez une annonce dans les paramètres ⚙</small>';
          container.appendChild(em); return;
        }

        if(myPosts.length){
          _sLabel(container,'● Mes annonces');
          myPosts.forEach(p=>container.appendChild(_myPostCard(p)));
        }

        if(allPeer.length){
          _sLabel(container, allPeer.length+' annonce'+(allPeer.length>1?'s':'')+' à proximité');
          allPeer.forEach(p=>container.appendChild(_peerPostCard(p)));
        }
      }
    },

    {
      id: 'candidatures', label: '📬 Candidatures',
      render(container) {
        const msgs=getMessages();
        if(!msgs.length){
          const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">📬</div>Aucune candidature reçue.<br><small style="color:var(--txt3)">Apparaissent ici quand des voisins répondent.</small>';
          container.appendChild(em); return;
        }
        msgs.forEach(m=>m.read=true); store.set('messages',msgs);

        // Grouper par fromId
        const grouped={};
        msgs.forEach(m=>{
          if(!grouped[m.fromId]) grouped[m.fromId]={fromId:m.fromId,fromName:m.fromName,msgs:[]};
          grouped[m.fromId].msgs.push(m);
        });

        Object.values(grouped).forEach(g=>{
          const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:6px 8px 0;overflow:hidden';
          const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
          hdr.addEventListener('click',()=>frodon.openPeer(g.fromId));
          const av=frodon.makeElement('div',''); av.style.cssText='width:32px;height:32px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-family:var(--mono);font-weight:700;flex-shrink:0'; av.textContent=g.fromName[0].toUpperCase();
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.76rem;font-weight:700;color:var(--acc2);flex:1'; nameEl.textContent=g.fromName;
          const cnt=frodon.makeElement('div',''); cnt.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono)'; cnt.textContent=g.msgs.length+' msg';
          hdr.appendChild(av); hdr.appendChild(nameEl); hdr.appendChild(cnt); card.appendChild(hdr);

          const body=frodon.makeElement('div',''); body.style.cssText='padding:8px 12px';
          g.msgs.slice(0,5).forEach(m=>{
            const row=frodon.makeElement('div',''); row.style.cssText='padding:5px 0;border-bottom:1px solid var(--bdr)';
            if(m.postTitle){const pt=frodon.makeElement('div',''); pt.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);margin-bottom:1px'; pt.textContent='Re: '+m.postTitle+(m.postType==='aide'?' 🆘':' 🤝'); row.appendChild(pt);}
            const txt=frodon.makeElement('div',''); txt.style.cssText='font-size:.7rem;color:var(--txt)'; txt.textContent=m.message; row.appendChild(txt);
            if(m.contact){const c=frodon.makeElement('div',''); c.style.cssText='font-size:.62rem;color:var(--acc);margin-top:2px'; c.textContent='✉ '+m.contact; row.appendChild(c);}
            const ts=frodon.makeElement('div',''); ts.style.cssText='font-size:.55rem;color:var(--txt3);font-family:var(--mono);margin-top:2px'; ts.textContent=frodon.formatTime(m.ts); row.appendChild(ts);
            body.appendChild(row);
          });

          // Répondre
          const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=300; ta.placeholder='Votre réponse…'; ta.style.cssText+='margin-top:8px;margin-bottom:6px';
          const replyBtn=frodon.makeElement('button','plugin-action-btn acc','💬 Répondre');
          replyBtn.addEventListener('click',()=>{
            const msg=ta.value.trim(); if(!msg){frodon.showToast('Écrivez un message',true);return;}
            setTimeout(()=>frodon.sendDM(g.fromId,PLUGIN_ID,{type:'message',message:msg,_label:'🏘 Réponse voisinage'}),300);
            ta.value=''; replyBtn.textContent='✓ Envoyé'; replyBtn.disabled=true;
            frodon.showToast('🏘 Réponse envoyée à '+g.fromName);
          });
          body.appendChild(ta); body.appendChild(replyBtn); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },

    {
      id: 'settings', label: '⚙ Mes annonces',
      settings: true,
      render(container) {
        _renderForm(container);
        const posts=getMyPosts();
        if(posts.length){
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:12px 8px 4px'; lbl.textContent='Mes annonces'; container.appendChild(lbl);
          posts.forEach(p=>{
            const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--sur);border-bottom:1px solid var(--bdr)';
            const dot=frodon.makeElement('span','',postActive(p)?'●':'○'); dot.style.cssText='color:'+(postActive(p)?'var(--ok)':'var(--txt3)')+';font-size:.7rem;flex-shrink:0';
            const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.title,style:{fontSize:'.72rem',fontWeight:'700',color:'var(--txt)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}));
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.category,style:{fontSize:'.6rem',color:'var(--txt2)'}}));
            const del=frodon.makeElement('button',''); del.style.cssText='background:none;border:none;cursor:pointer;color:var(--txt3);font-size:.9rem;padding:2px 4px;flex-shrink:0'; del.textContent='✕';
            del.addEventListener('click',()=>{
              const updated=getMyPosts().filter(x=>x.id!==p.id);
              saveMyPosts(updated);
              const active=updated.filter(postActive);
              // Broadcast mise à jour + signaler la suppression
              frodon.getAllPeers().forEach(peer=>{
                frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
                frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'post_deleted',postId:p.id,_silent:true});
              });
              frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
            });
            row.appendChild(dot); row.appendChild(info); row.appendChild(del); container.appendChild(row);
          });
        }
      }
    },
  ]);

  function _sLabel(container,text){
    const l=frodon.makeElement('div',''); l.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:8px 8px 4px'; l.textContent=text; container.appendChild(l);
  }

  function _myPostCard(p){
    const isAide=p.type==='aide';
    const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid '+(isAide?'rgba(255,107,53,.22)':'rgba(0,245,200,.18)')+';border-radius:9px;margin:0 8px 6px;padding:9px 12px';
    const badge=frodon.makeElement('div',''); badge.style.cssText='font-size:.57rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:3px'; badge.textContent=(isAide?'🆘 Cherche':'🤝 Propose')+' · '+p.category; card.appendChild(badge);
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; t.textContent=p.title; card.appendChild(t);
    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-top:3px'; meta.textContent='⏰ '+(p.when==='now'?'Maintenant':new Date(p.when).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}))+(p.location?' · 📍'+p.location:''); card.appendChild(meta);
    return card;
  }

  function _peerPostCard(p){
    const isAide=p.type==='aide';
    const peer=frodon.getPeer(p._peerId);
    const name=peer?.name||p._peerId.substring(0,8)+'…';
    const applied=getApplied()[p._peerId+'_'+p.id];

    const card=frodon.makeElement('div',''); card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;overflow:hidden';

    // Header profil cliquable
    const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--bdr)';
    hdr.addEventListener('click',()=>frodon.openPeer(p._peerId));
    const av=frodon.makeElement('div',''); av.style.cssText='width:28px;height:28px;border-radius:50%;background:rgba(124,77,255,.15);border:1px solid rgba(124,77,255,.25);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:var(--mono);font-weight:700;flex-shrink:0'; av.textContent=name[0].toUpperCase();
    const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.7rem;font-weight:700;color:var(--acc2);flex:1'; nameEl.textContent=name;
    const cat=frodon.makeElement('div',''); cat.style.cssText='font-size:.58rem;font-family:var(--mono);color:'+(isAide?'#ff6b35':'var(--acc)'); cat.textContent=(isAide?'🆘':'🤝')+' '+p.category;
    hdr.appendChild(av); hdr.appendChild(nameEl); hdr.appendChild(cat); card.appendChild(hdr);

    // Contenu
    const body=frodon.makeElement('div',''); body.style.cssText='padding:9px 12px 10px';
    const t=frodon.makeElement('div',''); t.style.cssText='font-size:.82rem;font-weight:700;color:var(--txt);margin-bottom:3px'; t.textContent=p.title; body.appendChild(t);
    if(p.description){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.65rem;color:var(--txt2);margin-bottom:4px'; d.textContent=p.description; body.appendChild(d);}
    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.61rem;color:var(--txt3);font-family:var(--mono);line-height:1.7;margin-bottom:8px';
    let mh='⏰ '+(p.when==='now'?'Maintenant':new Date(p.when).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}));
    if(p.location) mh+='<br>📍 '+p.location;
    if(p.maxPeople) mh+='<br>👥 Max '+p.maxPeople+' personnes';
    meta.innerHTML=mh; body.appendChild(meta);

    if(!applied){
      // Formulaire candidature
      const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=300; ta.placeholder='Votre message (optionnel)…'; ta.style.marginBottom='5px'; body.appendChild(ta);
      const contactInp=document.createElement('input'); contactInp.className='f-input'; contactInp.placeholder='Votre contact (email, tel, pseudo…)'; contactInp.style.marginBottom='7px'; body.appendChild(contactInp);
      const applyBtn=frodon.makeElement('button','plugin-action-btn acc','🙋 Candidater');
      applyBtn.addEventListener('click',()=>{
        const msg=ta.value.trim()||'Je suis intéressé'+(isAide?' pour vous aider':' par cette activité')+'.';
        setTimeout(()=>frodon.sendDM(p._peerId,PLUGIN_ID,{type:'apply',postId:p.id,postTitle:p.title,postType:p.type,message:msg,contact:contactInp.value.trim(),_label:'🏘 Candidature voisinage'}),300);
        const applied2=getApplied(); applied2[p._peerId+'_'+p.id]=true; store.set('applied',applied2);
        applyBtn.textContent='✓ Candidature envoyée'; applyBtn.disabled=true;
        frodon.showToast('🏘 Candidature envoyée à '+name+' !');
      });
      body.appendChild(applyBtn);
    } else {
      const done=frodon.makeElement('div',''); done.style.cssText='font-size:.66rem;color:var(--ok);font-family:var(--mono);padding:2px 0'; done.textContent='✓ Candidature envoyée'; body.appendChild(done);
    }
    card.appendChild(body); return card;
  }

  function _renderForm(container){
    const form=frodon.makeElement('div',''); form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent='Nouvelle annonce'; form.appendChild(title);

    // Type
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
        if(cat===selCat) cb.click();
        catWrap.appendChild(cb);
      });
      maxRow.style.display=type==='activite'?'flex':'none';
    }
    aBtn.addEventListener('click',()=>{selType='aide';aBtn.classList.add('acc');acBtn.classList.remove('acc');rebuildCats('aide');});
    acBtn.addEventListener('click',()=>{selType='activite';acBtn.classList.add('acc');aBtn.classList.remove('acc');rebuildCats('activite');});
    typeRow.appendChild(aBtn); typeRow.appendChild(acBtn); form.appendChild(typeRow);
    _fl(form,'Catégorie'); form.appendChild(catWrap);

    _fl(form,'Titre *'); const tInp=document.createElement('input'); tInp.className='f-input'; tInp.placeholder='Ex: Aide pour monter un meuble ? / Balade en forêt dimanche'; tInp.maxLength=100; tInp.style.marginBottom='5px'; form.appendChild(tInp);
    _fl(form,'Détails'); const dInp=document.createElement('textarea'); dInp.className='f-input'; dInp.rows=2; dInp.maxLength=300; dInp.placeholder='Description, matériel, conditions…'; dInp.style.marginBottom='5px'; form.appendChild(dInp);
    _fl(form,'📍 Lieu (optionnel)'); const lInp=document.createElement('input'); lInp.className='f-input'; lInp.placeholder='Quartier, adresse, lieu de RDV…'; lInp.style.marginBottom='5px'; form.appendChild(lInp);

    const maxRow=frodon.makeElement('div',''); maxRow.style.cssText='display:none;align-items:center;gap:8px;margin-bottom:5px';
    const maxLbl=frodon.makeElement('div',''); maxLbl.style.cssText='font-size:.63rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; maxLbl.textContent='👥 Participants max :';
    const maxInp=document.createElement('input'); maxInp.type='number'; maxInp.className='f-input'; maxInp.min='2'; maxInp.max='50'; maxInp.value='5'; maxInp.style.width='60px';
    maxRow.appendChild(maxLbl); maxRow.appendChild(maxInp); form.appendChild(maxRow);
    rebuildCats('aide');

    _fl(form,'⏰ Quand');
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
      frodon.getAllPeers().forEach(peer=>{
        frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
      });
      frodon.showToast('🏘 Annonce publiée !');
      tInp.value=''; dInp.value=''; lInp.value='';
      frodon.refreshSphereTab(PLUGIN_ID); frodon.refreshProfileModal();
    });
    form.appendChild(pubBtn); container.appendChild(form);
  }

  function _fl(parent,text){
    const l=frodon.makeElement('div',''); l.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:7px'; l.textContent=text; parent.appendChild(l);
  }

  frodon.onPeerAppear(peer=>{
    const active=getMyPosts().filter(postActive);
    if(active.length) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_posts',_silent:true});
  });

  return { destroy() {} };
});
