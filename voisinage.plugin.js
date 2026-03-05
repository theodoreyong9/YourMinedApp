/**
 * FRODON PLUGIN — Voisinage  v2.0.0
 * Paramétrage dans ⚙ (demande aide ou activité)
 * SPHERE : toutes les annonces des pairs + les miennes
 * Fiche pair : voir ses annonces et répondre
 */
frodon.register({
  id: 'voisinage',
  name: 'Voisinage',
  version: '2.0.0',
  author: 'frodon-community',
  description: 'Demandez de l\'aide ou proposez une activité à vos voisins.',
  icon: '🏘',
}, () => {

  const PLUGIN_ID = 'voisinage';
  const store = frodon.storage(PLUGIN_ID);

  const CATS_AIDE=['🔧 Bricolage','📦 Déménagement','🛒 Courses','🐾 Animaux','🌱 Jardinage','💻 Tech','🚗 Transport','❓ Autre'];
  const CATS_ACTIV=['☕ Café/Resto','🚶 Balade','⚽ Sport','🎲 Jeux','🎬 Ciné/Séries','📚 Culture','🎵 Musique','❓ Autre'];

  function getMyPosts() { return store.get('my_posts')||[]; }
  function saveMyPosts(p) { store.set('my_posts',p); }
  function getInbox() { return store.get('inbox')||[]; }

  function postActive(p) {
    if(p.when==='now') return Date.now()-p.createdAt < 8*60*60*1000;
    return new Date(p.when) > new Date(Date.now()-60*60*1000);
  }

  function getPeerPosts(pid) {
    const c=store.get('peer_posts_'+pid); return c||null;
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type==='posts_data') {
      store.set('peer_posts_'+fromId,{posts:payload.posts,ts:Date.now()});
      frodon.refreshPeerModal(fromId);
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type==='request_posts') {
      const active=getMyPosts().filter(postActive);
      if(active.length) frodon.sendDM(fromId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    }

    if(payload.type==='reply') {
      const peer=frodon.getPeer(fromId);
      const inbox=getInbox();
      inbox.unshift({fromId,fromName:peer?.name||'?',postId:payload.postId,
        postTitle:payload.postTitle,postType:payload.postType,
        message:payload.message,contact:payload.contact||'',ts:Date.now(),read:false});
      if(inbox.length>50)inbox.length=50;
      store.set('inbox',inbox);
      frodon.showToast('🏘 '+(peer?.name||'Voisin')+' répond à votre annonce !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🏘 Voisinage', (peerId, container) => {
    const cached=getPeerPosts(peerId);
    if(!cached||Date.now()-cached.ts>60000) frodon.sendDM(peerId,PLUGIN_ID,{type:'request_posts',_silent:true});
    const posts=(cached?.posts||[]).filter(postActive);
    const peerName=frodon.getPeer(peerId)?.name||'ce voisin';

    if(!posts.length){
      const msg=frodon.makeElement('div',''); msg.style.cssText='font-size:.68rem;color:var(--txt2);padding:4px 0;font-family:var(--mono)';
      msg.textContent=cached?'🏘 Aucune annonce active':'⌛ Vérification…'; container.appendChild(msg); return;
    }

    posts.forEach(post=>{
      const isAide=post.type==='aide';
      const card=frodon.makeElement('div','');
      card.style.cssText='background:var(--sur);border:1px solid '+(isAide?'rgba(255,107,53,.3)':'rgba(0,245,200,.25)')+';border-radius:10px;padding:11px 13px;margin-bottom:10px';

      // Badge type
      const badge=frodon.makeElement('div',''); badge.style.cssText='font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;color:'+(isAide?'#ff6b35':'var(--acc)');
      badge.textContent=(isAide?'🆘 Cherche aide':'🤝 Propose')+' · '+post.category; card.appendChild(badge);

      const ttl=frodon.makeElement('div',''); ttl.style.cssText='font-size:.84rem;font-weight:700;color:var(--txt);margin-bottom:3px'; ttl.textContent=post.title; card.appendChild(ttl);
      if(post.description){ const d=frodon.makeElement('div',''); d.style.cssText='font-size:.66rem;color:var(--txt2);margin-bottom:4px'; d.textContent=post.description; card.appendChild(d); }

      // Quand + Lieu
      const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);line-height:1.7;margin-bottom:7px';
      let metaHtml='⏰ '+(post.when==='now'?'Maintenant':new Date(post.when).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}));
      if(post.location) metaHtml+='<br>📍 '+post.location;
      if(post.maxPeople&&post.type==='activite') metaHtml+='<br>👥 '+post.maxPeople+' personnes max';
      meta.innerHTML=metaHtml; card.appendChild(meta);

      // Formulaire réponse
      const ta=document.createElement('textarea'); ta.className='f-input'; ta.rows=2; ta.maxLength=300;
      ta.placeholder='Votre message…'; ta.style.marginBottom='5px'; card.appendChild(ta);

      const contactInp=document.createElement('input'); contactInp.className='f-input';
      contactInp.placeholder='Votre contact (email, téléphone, pseudo…)'; contactInp.style.marginBottom='7px'; card.appendChild(contactInp);

      const replyBtn=frodon.makeElement('button','plugin-action-btn '+(isAide?'acc':''),'💬 Répondre');
      replyBtn.addEventListener('click',()=>{
        const msg=ta.value.trim();
        if(!msg){frodon.showToast('Écrivez un message',true);return;}
        setTimeout(()=>{
          frodon.sendDM(peerId,PLUGIN_ID,{type:'reply',postId:post.id,postTitle:post.title,postType:post.type,
            message:msg,contact:contactInp.value.trim(),_label:'🏘 Réponse voisinage'});
        },300);
        replyBtn.disabled=true; replyBtn.textContent='✓ Envoyé !';
        frodon.showToast('🏘 Réponse envoyée à '+peerName+' !');
      });
      card.appendChild(replyBtn);
      container.appendChild(card);
    });
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const active=getMyPosts().filter(postActive);
    if(!active.length) return;
    active.forEach(p=>{
      const card=frodon.makeElement('div',''); const isAide=p.type==='aide';
      card.style.cssText='background:'+(isAide?'rgba(255,107,53,.08)':'rgba(0,245,200,.07)')+';border:1px solid '+(isAide?'rgba(255,107,53,.3)':'rgba(0,245,200,.25)')+';border-radius:10px;padding:8px 12px;margin-top:5px';
      const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:3px';
      lbl.textContent=(isAide?'🆘 Cherche aide':'🤝 Propose')+' · '+p.category;
      const t=frodon.makeElement('div',''); t.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; t.textContent=p.title;
      card.appendChild(lbl); card.appendChild(t); container.appendChild(card);
    });
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'annonces', label: '🏘 Annonces',
      render(container) {
        // Mes annonces actives
        const myActive=getMyPosts().filter(postActive);
        if(myActive.length){
          _sectionLabel(container,'● Mes annonces');
          myActive.forEach(p=>{
            const card=_buildPostCard(p,true);
            container.appendChild(card);
          });
        }

        // Annonces des pairs
        const peerPosts=[];
        for(const key of Object.keys(localStorage)){
          if(!key.startsWith('frd_voisinage_peer_posts_')) continue;
          try{
            const pid=key.replace('frd_voisinage_peer_posts_','');
            const cached=store.get('peer_posts_'+pid);
            if(!cached?.posts) continue;
            cached.posts.filter(postActive).forEach(p=>peerPosts.push({...p,_peerId:pid,_peerName:frodon.getPeer(pid)?.name||pid.substring(0,8)+'…'}));
          }catch(e){}
        }

        peerPosts.sort((a,b)=>b.createdAt-a.createdAt);

        if(!peerPosts.length&&!myActive.length){
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏘</div>Aucune annonce à proximité.<br><small style="color:var(--txt3)">Créez une annonce dans les paramètres ⚙</small>';
          container.appendChild(em); return;
        }

        if(peerPosts.length){
          const aides=peerPosts.filter(p=>p.type==='aide');
          const activites=peerPosts.filter(p=>p.type==='activite');
          if(aides.length){ _sectionLabel(container,'🆘 Demandes d\'aide'); aides.forEach(p=>container.appendChild(_buildPeerPostCard(p))); }
          if(activites.length){ _sectionLabel(container,'🤝 Activités proposées'); activites.forEach(p=>container.appendChild(_buildPeerPostCard(p))); }
        }
      }
    },
    {
      id: 'inbox', label: '📬 Réponses',
      render(container) {
        const inbox=getInbox();
        inbox.forEach(m=>{m.read=true;}); store.set('inbox',inbox);
        if(!inbox.length){
          const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">📬</div>Aucune réponse.<br><small style="color:var(--txt3)">Les voisins qui répondent apparaissent ici.</small>';
          container.appendChild(em); return;
        }
        inbox.forEach(msg=>{
          const card=frodon.makeElement('div','mini-card'); card.style.margin='6px 8px 0';
          const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px';
          const name=frodon.makeElement('strong','',msg.fromName); name.style.cssText='font-size:.74rem;color:var(--acc2);cursor:pointer';
          name.addEventListener('click',()=>frodon.openPeer(msg.fromId));
          hdr.appendChild(name); hdr.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(msg.ts)));
          card.appendChild(hdr);
          const re=frodon.makeElement('div',''); re.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:4px'; re.textContent='Re: '+msg.postTitle; card.appendChild(re);
          card.appendChild(frodon.makeElement('div','mini-card-body',msg.message));
          if(msg.contact){ const c=frodon.makeElement('div',''); c.style.cssText='font-size:.64rem;color:var(--acc);margin-top:4px'; c.textContent='✉ '+msg.contact; card.appendChild(c); }
          container.appendChild(card);
        });
      }
    },
    {
      id: 'settings', label: '⚙ Mon annonce',
      settings: true,
      render(container) {
        _renderPostForm(container);
        const posts=getMyPosts();
        if(posts.length){
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:14px 8px 6px'; lbl.textContent='Mes annonces';
          container.appendChild(lbl);
          posts.forEach(p=>{
            const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--bdr)';
            const dot=frodon.makeElement('span','',postActive(p)?'●':'○'); dot.style.cssText='color:'+(postActive(p)?'var(--ok)':'var(--txt3)')+';font-size:.7rem';
            const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.title,style:{fontSize:'.72rem',fontWeight:'700',color:'var(--txt)'}}));
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:p.category,style:{fontSize:'.6rem',color:'var(--txt2)'}}));
            const del=frodon.makeElement('button',''); del.style.cssText='background:none;border:none;cursor:pointer;color:var(--txt3);font-size:.85rem;padding:2px 4px'; del.textContent='✕';
            del.addEventListener('click',()=>{saveMyPosts(getMyPosts().filter(x=>x.id!==p.id));frodon.refreshSphereTab(PLUGIN_ID);frodon.refreshProfileModal();});
            row.appendChild(dot); row.appendChild(info); row.appendChild(del); container.appendChild(row);
          });
        }
      }
    },
  ]);

  function _sectionLabel(container,text){
    const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:10px 8px 5px';
    lbl.textContent=text; container.appendChild(lbl);
  }

  function _buildPostCard(p, isMine=false) {
    const isAide=p.type==='aide';
    const card=frodon.makeElement('div','');
    card.style.cssText='background:var(--sur);border:1px solid '+(isAide?'rgba(255,107,53,.25)':'rgba(0,245,200,.2)')+';border-radius:9px;margin:0 8px 6px;padding:10px 12px';
    const badge=frodon.makeElement('div',''); badge.style.cssText='font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;color:'+(isAide?'#ff6b35':'var(--acc)')+';margin-bottom:3px';
    badge.textContent=(isAide?'🆘':'🤝')+' '+p.category; card.appendChild(badge);
    const ttl=frodon.makeElement('div',''); ttl.style.cssText='font-size:.78rem;font-weight:700;color:var(--txt)'; ttl.textContent=p.title; card.appendChild(ttl);
    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-top:2px';
    meta.textContent='⏰ '+(p.when==='now'?'Maintenant':new Date(p.when).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}));
    card.appendChild(meta); return card;
  }

  function _buildPeerPostCard(p) {
    const isAide=p.type==='aide';
    const card=frodon.makeElement('div','');
    card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:0 8px 6px;padding:10px 12px;cursor:pointer';
    card.addEventListener('click',()=>frodon.openPeer(p._peerId));

    const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:5px';
    const av=frodon.makeElement('div',''); av.style.cssText='width:28px;height:28px;border-radius:50%;background:rgba(124,77,255,.15);border:1px solid rgba(124,77,255,.25);display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;font-family:var(--mono)';
    av.textContent=(p._peerName||'?')[0].toUpperCase();
    const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.7rem;font-weight:700;color:var(--acc2)'; nameEl.textContent=p._peerName;
    const cat=frodon.makeElement('div',''); cat.style.cssText='font-size:.58rem;color:'+(isAide?'#ff6b35':'var(--acc)')+';font-family:var(--mono);margin-left:auto'; cat.textContent=p.category;
    hdr.appendChild(av); hdr.appendChild(nameEl); hdr.appendChild(cat);
    card.appendChild(hdr);

    const ttl=frodon.makeElement('div',''); ttl.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt);margin-bottom:2px'; ttl.textContent=p.title; card.appendChild(ttl);
    if(p.description){ const d=frodon.makeElement('div',''); d.style.cssText='font-size:.64rem;color:var(--txt2);margin-bottom:3px'; d.textContent=p.description; card.appendChild(d); }

    const meta=frodon.makeElement('div',''); meta.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);line-height:1.6';
    let mh='⏰ '+(p.when==='now'?'Maintenant':new Date(p.when).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}));
    if(p.location) mh+='  📍 '+p.location;
    if(p.maxPeople) mh+='  👥 '+p.maxPeople;
    meta.innerHTML=mh; card.appendChild(meta);
    return card;
  }

  function _renderPostForm(container) {
    const form=frodon.makeElement('div','');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';

    // Type selector
    const typeLbl=frodon.makeElement('div',''); typeLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; typeLbl.textContent='Type d\'annonce'; form.appendChild(typeLbl);
    const typeRow=frodon.makeElement('div',''); typeRow.style.cssText='display:flex;gap:6px;margin-bottom:10px';
    let selectedType='aide';
    const aideBtn=frodon.makeElement('button','plugin-action-btn acc','🆘 Cherche aide'); aideBtn.style.cssText+=';flex:1;font-size:.64rem';
    const activBtn=frodon.makeElement('button','plugin-action-btn','🤝 Propose activité'); activBtn.style.cssText+=';flex:1;font-size:.64rem';

    let selectedCat=CATS_AIDE[0];
    const catWrap=frodon.makeElement('div',''); catWrap.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px';

    function updateCats(type){
      const cats=type==='aide'?CATS_AIDE:CATS_ACTIV;
      selectedCat=cats[0]; catWrap.innerHTML='';
      cats.forEach(cat=>{
        const btn=frodon.makeElement('button',''); btn.style.cssText='padding:3px 8px;border-radius:6px;border:1px solid var(--bdr2);background:var(--sur2);color:var(--txt2);font-size:.6rem;cursor:pointer;transition:all .15s';
        btn.textContent=cat;
        btn.addEventListener('click',()=>{
          selectedCat=cat;
          catWrap.querySelectorAll('button').forEach(b=>{b.style.background='var(--sur2)';b.style.color='var(--txt2)';b.style.borderColor='var(--bdr2)';});
          btn.style.background=type==='aide'?'rgba(255,107,53,.12)':'rgba(0,245,200,.1)';
          btn.style.color=type==='aide'?'#ff6b35':'var(--acc)';
          btn.style.borderColor=type==='aide'?'rgba(255,107,53,.35)':'rgba(0,245,200,.3)';
        });
        if(cat===selectedCat) btn.click();
        catWrap.appendChild(btn);
      });
    }

    aideBtn.addEventListener('click',()=>{selectedType='aide';aideBtn.classList.add('acc');activBtn.classList.remove('acc');updateCats('aide');maxRow.style.display='none';});
    activBtn.addEventListener('click',()=>{selectedType='activite';activBtn.classList.add('acc');aideBtn.classList.remove('acc');updateCats('activite');maxRow.style.display='flex';});
    typeRow.appendChild(aideBtn); typeRow.appendChild(activBtn); form.appendChild(typeRow);

    const catLbl=frodon.makeElement('div',''); catLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px'; catLbl.textContent='Catégorie'; form.appendChild(catLbl);
    form.appendChild(catWrap); updateCats('aide');

    const titleInp=document.createElement('input'); titleInp.className='f-input'; titleInp.placeholder='Titre *  (ex: Quelqu\'un pour aider à monter un meuble ?)'; titleInp.maxLength=100; titleInp.style.marginBottom='5px'; form.appendChild(titleInp);
    const descInp=document.createElement('textarea'); descInp.className='f-input'; descInp.rows=2; descInp.maxLength=300; descInp.placeholder='Détails, conditions, matériel…'; descInp.style.marginBottom='5px'; form.appendChild(descInp);

    const locInp=document.createElement('input'); locInp.className='f-input'; locInp.placeholder='📍 Lieu (optionnel — quartier, adresse…)'; locInp.style.marginBottom='5px'; form.appendChild(locInp);

    // Participants max (activité seulement)
    const maxRow=frodon.makeElement('div',''); maxRow.style.cssText='display:none;align-items:center;gap:8px;margin-bottom:5px';
    const maxLbl=frodon.makeElement('div',''); maxLbl.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; maxLbl.textContent='👥 Max :';
    const maxInp=document.createElement('input'); maxInp.type='number'; maxInp.className='f-input'; maxInp.min='2'; maxInp.max='50'; maxInp.value='5'; maxInp.style.width='60px';
    maxRow.appendChild(maxLbl); maxRow.appendChild(maxInp); form.appendChild(maxRow);

    // Quand
    const whenLbl=frodon.makeElement('div',''); whenLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:5px;margin-top:4px'; whenLbl.textContent='⏰ Quand'; form.appendChild(whenLbl);
    const whenRow=frodon.makeElement('div',''); whenRow.style.cssText='display:flex;gap:6px;margin-bottom:10px;align-items:center';
    let when='now';
    const nowBtn=frodon.makeElement('button','plugin-action-btn acc','Maintenant'); nowBtn.style.cssText+=';flex:1;font-size:.62rem';
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.cssText='flex:2;display:none';
    const laterBtn=frodon.makeElement('button','plugin-action-btn','Planifier'); laterBtn.style.cssText+=';flex:1;font-size:.62rem';
    nowBtn.addEventListener('click',()=>{when='now';nowBtn.classList.add('acc');laterInp.style.display='none';});
    laterBtn.addEventListener('click',()=>{laterInp.style.display='block';nowBtn.classList.remove('acc');});
    laterInp.addEventListener('change',()=>{when=laterInp.value;});
    whenRow.appendChild(nowBtn); whenRow.appendChild(laterBtn); whenRow.appendChild(laterInp); form.appendChild(whenRow);

    const pubBtn=frodon.makeElement('button','plugin-action-btn acc','📢 Publier l\'annonce'); pubBtn.style.cssText+=';width:100%';
    pubBtn.addEventListener('click',()=>{
      const t=titleInp.value.trim(); if(!t){frodon.showToast('Titre requis',true);return;}
      const post={id:'post_'+Date.now(),type:selectedType,category:selectedCat,title:t,
        description:descInp.value.trim(),location:locInp.value.trim(),
        maxPeople:selectedType==='activite'?parseInt(maxInp.value)||null:null,
        when,createdAt:Date.now()};
      const posts=getMyPosts(); posts.unshift(post); if(posts.length>10)posts.length=10;
      saveMyPosts(posts);
      // Broadcast
      Object.keys(localStorage).filter(k=>k.startsWith('frd_disc_')).forEach(k=>{
        try{const pid=k.replace('frd_disc_','');frodon.sendDM(pid,PLUGIN_ID,{type:'posts_data',posts:getMyPosts().filter(postActive),_silent:true});}catch(e){}
      });
      frodon.showToast('🏘 Annonce publiée !');
      titleInp.value=''; descInp.value=''; locInp.value='';
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
