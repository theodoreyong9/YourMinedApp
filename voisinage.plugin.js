/**
 * FRODON PLUGIN — Voisinage  v1.0.0
 * Demandes d'aide et propositions d'activités entre voisins
 */
frodon.register({
  id: 'voisinage',
  name: 'Voisinage',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Demandez de l\'aide ou proposez une activité à vos voisins proches.',
  icon: '🏘',
}, () => {

  const PLUGIN_ID = 'voisinage';
  const store = frodon.storage(PLUGIN_ID);

  const CATS_AIDE = ['🔧 Bricolage','📦 Déménagement','🛒 Courses','🐾 Animaux','🌱 Jardinage','💻 Tech','🚗 Transport','❓ Autre'];
  const CATS_ACTIV = ['☕ Café/Resto','🚶 Balade','⚽ Sport','🎲 Jeux','🎬 Cinéma/Séries','📚 Culture','🎵 Musique','❓ Autre'];

  function getMyPosts() { return store.get('my_posts') || []; }
  function saveMyPosts(p) { store.set('my_posts', p); }
  function getInbox() { return store.get('inbox') || []; }
  function getPeerPosts(pid) { return store.get('peer_posts_'+pid) || null; }

  function postActive(p) {
    if(p.when === 'now') return Date.now()-p.createdAt < 4*60*60*1000; // 4h
    return new Date(p.when) > new Date(Date.now()-60*60*1000);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'request_posts') {
      const active = getMyPosts().filter(postActive);
      if(active.length) frodon.sendDM(fromId, PLUGIN_ID, {type:'posts_data', posts:active, _silent:true});
    }

    if(payload.type === 'posts_data') {
      store.set('peer_posts_'+fromId, {posts:payload.posts, ts:Date.now()});
      frodon.refreshPeerModal(fromId);
    }

    if(payload.type === 'reply') {
      const peer = frodon.getPeer(fromId);
      const inbox = getInbox();
      inbox.unshift({
        fromId, fromName:peer?.name||'?',
        postId:payload.postId, postTitle:payload.postTitle||'',
        message:payload.message||'', ts:Date.now(), read:false
      });
      if(inbox.length>50) inbox.length=50;
      store.set('inbox', inbox);
      frodon.showToast('🏘 '+(peer?.name||'Voisin')+' répond à votre annonce !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'broadcast_posts') {
      store.set('peer_posts_'+fromId, {posts:payload.posts, ts:Date.now()});
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🏘 Voisinage', (peerId, container) => {
    const cached = getPeerPosts(peerId);
    if(!cached || Date.now()-cached.ts > 60000) {
      frodon.sendDM(peerId, PLUGIN_ID, {type:'request_posts', _silent:true});
    }

    const posts = (cached?.posts||[]).filter(postActive);
    if(!posts.length) {
      const msg=frodon.makeElement('div','');
      msg.style.cssText='font-size:.68rem;color:var(--txt2);padding:4px 0;font-family:var(--mono)';
      msg.textContent=cached?'🏘 Aucune annonce active':'⌛ Vérification…';
      container.appendChild(msg); return;
    }

    posts.forEach(post => {
      const card=frodon.makeElement('div','');
      const isAide=post.type==='aide';
      const accentColor=isAide?'rgba(255,107,53,.2)':'rgba(0,245,200,.15)';
      const borderColor=isAide?'rgba(255,107,53,.35)':'rgba(0,245,200,.3)';
      card.style.cssText=`background:${accentColor};border:1px solid ${borderColor};border-radius:10px;padding:11px 13px;margin-bottom:8px`;

      const badge=frodon.makeElement('div','');
      badge.style.cssText='font-size:.58rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;color:'+(isAide?'#ff6b35':'var(--acc)');
      badge.textContent=(isAide?'🆘 Cherche aide':'🤝 Propose')+' · '+post.category;
      card.appendChild(badge);

      const ttl=frodon.makeElement('div','');
      ttl.style.cssText='font-size:.82rem;font-weight:700;color:var(--txt);margin-bottom:3px';
      ttl.textContent=post.title; card.appendChild(ttl);

      if(post.description){
        const desc=frodon.makeElement('div','');
        desc.style.cssText='font-size:.66rem;color:var(--txt2);margin-bottom:5px';
        desc.textContent=post.description; card.appendChild(desc);
      }

      const meta=frodon.makeElement('div','');
      meta.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:7px';
      meta.textContent=post.when==='now'?'⏰ Maintenant':'⏰ '+new Date(post.when).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'});
      card.appendChild(meta);

      const ta=document.createElement('textarea');
      ta.className='f-input'; ta.rows=2; ta.maxLength=300;
      ta.placeholder='Votre réponse…'; ta.style.marginBottom='6px';
      card.appendChild(ta);

      const replyBtn=frodon.makeElement('button','plugin-action-btn '+(isAide?'':'acc'),'💬 Répondre');
      replyBtn.addEventListener('click',()=>{
        const msg=ta.value.trim();
        if(!msg){frodon.showToast('Écrivez un message',true);return;}
        setTimeout(()=>{
          frodon.sendDM(peerId,PLUGIN_ID,{type:'reply',postId:post.id,postTitle:post.title,message:msg,_label:'🏘 Réponse voisinage'});
        },300);
        replyBtn.disabled=true; replyBtn.textContent='✓ Envoyé !';
        frodon.showToast('🏘 Réponse envoyée !');
      });
      card.appendChild(replyBtn);
      container.appendChild(card);
    });
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'annonces', label: '🏘 Annonces',
      render(container) {
        // Create buttons
        const btnRow=frodon.makeElement('div',''); btnRow.style.cssText='display:flex;gap:6px;margin:8px';
        const aideBtn=frodon.makeElement('button','plugin-action-btn','🆘 Demander aide');
        aideBtn.style.cssText+=';flex:1;font-size:.66rem';
        aideBtn.addEventListener('click',()=>showPostForm(container,'aide',btnRow));
        const activBtn=frodon.makeElement('button','plugin-action-btn acc','🤝 Proposer activité');
        activBtn.style.cssText+=';flex:1;font-size:.66rem';
        activBtn.addEventListener('click',()=>showPostForm(container,'activite',btnRow));
        btnRow.appendChild(aideBtn); btnRow.appendChild(activBtn);
        container.appendChild(btnRow);

        const posts=getMyPosts();
        const active=posts.filter(postActive);
        const expired=posts.filter(p=>!postActive(p));

        if(!posts.length){
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏘</div>Aucune annonce.<br><small style="color:var(--txt3)">Créez une demande ou une proposition.</small>';
          container.appendChild(em); return;
        }

        if(active.length){
          const lbl=frodon.makeElement('div','');
          lbl.style.cssText='font-size:.58rem;color:var(--ok);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:4px 8px 6px';
          lbl.textContent='● Annonces actives';
          container.appendChild(lbl);
          active.forEach(p=>container.appendChild(buildMyPostCard(p)));
        }

        if(expired.length){
          const lbl=frodon.makeElement('div','');
          lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:10px 8px 6px';
          lbl.textContent='○ Expirées';
          container.appendChild(lbl);
          expired.forEach(p=>container.appendChild(buildMyPostCard(p,true)));
        }
      }
    },
    {
      id: 'inbox', label: '📬 Réponses',
      render(container) {
        const inbox=getInbox();
        // Mark all read
        inbox.forEach(m=>m.read=true); store.set('inbox',inbox);

        if(!inbox.length){
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">📬</div>Aucune réponse.<br><small style="color:var(--txt3)">Les voisins qui répondront apparaîtront ici.</small>';
          container.appendChild(em); return;
        }
        inbox.forEach(msg=>{
          const card=frodon.makeElement('div','mini-card'); card.style.margin='6px 8px 0';
          const hdr=frodon.makeElement('div',''); hdr.style.cssText='display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px';
          const name=frodon.makeElement('strong','',msg.fromName);
          name.style.cssText='font-size:.74rem;color:var(--acc2);cursor:pointer';
          name.addEventListener('click',()=>frodon.openPeer(msg.fromId));
          hdr.appendChild(name); hdr.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(msg.ts)));
          if(msg.postTitle){
            const pt=frodon.makeElement('div','');
            pt.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:3px';
            pt.textContent='Re: '+msg.postTitle; card.appendChild(hdr); card.appendChild(pt);
          } else { card.appendChild(hdr); }
          card.appendChild(frodon.makeElement('div','mini-card-body',msg.message));
          container.appendChild(card);
        });
      }
    },
  ]);

  function buildMyPostCard(p, expired=false) {
    const card=frodon.makeElement('div','');
    const isAide=p.type==='aide';
    card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:9px;margin:0 8px 6px;padding:10px 12px;opacity:'+(expired?.6:1);
    const row=frodon.makeElement('div',''); row.style.cssText='display:flex;justify-content:space-between;align-items:flex-start';
    const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
    const badge=frodon.makeElement('div','');
    badge.style.cssText='font-size:.58rem;font-family:var(--mono);margin-bottom:3px;color:'+(isAide?'#ff6b35':'var(--acc)');
    badge.textContent=(isAide?'🆘':'🤝')+' '+p.category;
    const ttl=frodon.makeElement('div','');
    ttl.style.cssText='font-size:.76rem;font-weight:700;color:var(--txt)';
    ttl.textContent=p.title;
    info.appendChild(badge); info.appendChild(ttl);
    const delBtn=frodon.makeElement('button','');
    delBtn.style.cssText='background:none;border:none;cursor:pointer;color:var(--txt3);font-size:.8rem;padding:0 0 0 6px';
    delBtn.textContent='✕';
    delBtn.addEventListener('click',()=>{
      const posts=getMyPosts().filter(x=>x.id!==p.id);
      saveMyPosts(posts); frodon.refreshSphereTab(PLUGIN_ID);
    });
    row.appendChild(info); row.appendChild(delBtn);
    card.appendChild(row);
    return card;
  }

  function showPostForm(container, type, afterEl) {
    const existing=container.querySelector('.voisinage-form');
    if(existing){existing.remove();return;}
    const isAide=type==='aide';
    const form=frodon.makeElement('div','voisinage-form');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;padding:12px';

    const title=frodon.makeElement('div','');
    title.style.cssText='font-size:.65rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;color:'+(isAide?'#ff6b35':'var(--acc)');
    title.textContent=isAide?'🆘 Demande d\'aide':'🤝 Proposer une activité';
    form.appendChild(title);

    // Category picker
    const catLbl=frodon.makeElement('div',''); catLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;margin-bottom:4px'; catLbl.textContent='Catégorie'; form.appendChild(catLbl);
    const cats=isAide?CATS_AIDE:CATS_ACTIV;
    const catWrap=frodon.makeElement('div',''); catWrap.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px';
    let selectedCat=cats[0];
    const catBtns=[];
    cats.forEach(cat=>{
      const btn=frodon.makeElement('button','');
      btn.style.cssText='padding:3px 8px;border-radius:6px;border:1px solid var(--bdr2);background:var(--sur2);color:var(--txt2);font-size:.6rem;cursor:pointer;transition:all .15s';
      btn.textContent=cat;
      btn.addEventListener('click',()=>{
        selectedCat=cat;
        catBtns.forEach(b=>{ b.style.background='var(--sur2)'; b.style.color='var(--txt2)'; b.style.borderColor='var(--bdr2)'; });
        btn.style.background=isAide?'rgba(255,107,53,.15)':'rgba(0,245,200,.12)';
        btn.style.color=isAide?'#ff6b35':'var(--acc)';
        btn.style.borderColor=isAide?'rgba(255,107,53,.4)':'rgba(0,245,200,.35)';
      });
      catBtns.push(btn); catWrap.appendChild(btn);
    });
    catBtns[0].click();
    form.appendChild(catWrap);

    const titleInput=document.createElement('input'); titleInput.className='f-input';
    titleInput.placeholder=(isAide?'Ex: Cherche quelqu\'un pour aider à déplacer un meuble…':'Ex: Qui veut faire une balade ce soir ?'); titleInput.maxLength=100; titleInput.style.marginBottom='6px';
    form.appendChild(titleInput);

    const descInput=document.createElement('textarea'); descInput.className='f-input'; descInput.rows=2; descInput.maxLength=300;
    descInput.placeholder='Détails (lieu, durée, conditions…)'; descInput.style.marginBottom='6px';
    form.appendChild(descInput);

    // When
    const whenWrap=frodon.makeElement('div',''); whenWrap.style.cssText='display:flex;gap:6px;margin-bottom:10px;align-items:center';
    const whenLbl=frodon.makeElement('div',''); whenLbl.style.cssText='font-size:.62rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap'; whenLbl.textContent='⏰ Quand :';
    const nowBtn2=frodon.makeElement('button','plugin-action-btn acc','Maintenant'); nowBtn2.style.cssText+=';flex:1;font-size:.62rem';
    let when='now';
    nowBtn2.addEventListener('click',()=>{ when='now'; nowBtn2.classList.add('acc'); laterInp.style.display='none'; });
    const laterInp=document.createElement('input'); laterInp.type='datetime-local'; laterInp.className='f-input'; laterInp.style.display='none'; laterInp.style.flex='2';
    laterInp.addEventListener('change',()=>{ when=laterInp.value; nowBtn2.classList.remove('acc'); });
    const laterBtn2=frodon.makeElement('button','plugin-action-btn','Planifier'); laterBtn2.style.cssText+=';flex:1;font-size:.62rem';
    laterBtn2.addEventListener('click',()=>{ laterInp.style.display=''; nowBtn2.classList.remove('acc'); });
    whenWrap.appendChild(whenLbl); whenWrap.appendChild(nowBtn2); whenWrap.appendChild(laterBtn2); whenWrap.appendChild(laterInp);
    form.appendChild(whenWrap);

    const btnRow=frodon.makeElement('div',''); btnRow.style.cssText='display:flex;gap:6px';
    const cancel=frodon.makeElement('button','plugin-action-btn','Annuler');
    cancel.addEventListener('click',()=>form.remove());
    const pub=frodon.makeElement('button','plugin-action-btn '+(isAide?'':'acc'),'📢 Publier');
    pub.addEventListener('click',()=>{
      const t=titleInput.value.trim();
      if(!t){frodon.showToast('Titre requis',true);return;}
      const post={id:'post_'+Date.now(), type, category:selectedCat, title:t, description:descInput.value.trim(), when, createdAt:Date.now()};
      const posts=getMyPosts(); posts.unshift(post);
      if(posts.length>20) posts.length=20;
      saveMyPosts(posts);
      // Broadcast to current peers
      const active=posts.filter(postActive);
      Object.keys(S?.disc||{}).forEach(pid=>{
        frodon.sendDM(pid,PLUGIN_ID,{type:'broadcast_posts',posts:active,_silent:true});
      });
      frodon.showToast('🏘 Annonce publiée — visible par vos voisins !');
      form.remove(); frodon.refreshSphereTab(PLUGIN_ID);
    });
    btnRow.appendChild(cancel); btnRow.appendChild(pub); form.appendChild(btnRow);
    afterEl.insertAdjacentElement('afterend', form);
  }

  frodon.onPeerAppear(peer=>{
    const active=getMyPosts().filter(postActive);
    if(active.length) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'posts_data',posts:active,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_posts',_silent:true});
  });

  return { destroy() {} };
});
