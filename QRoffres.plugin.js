/**
 * FRODON PLUGIN — QR Offres v3.0.0
 *
 * ⚙ Paramètres : créer/gérer ses offres + bouton scanner
 *
 * SPHERE onglet "Offres" :
 *   - Voir toutes les offres des pairs découverts (bandeau profil + offres)
 *   - QR code par offre, alerte premier-servi
 *   - Lien vers profil
 *
 * Onglet "Mes offres" :
 *   - Ses propres offres avec QR + compteur + scans reçus
 */
frodon.register({
  id: 'qr-offres',
  name: 'QR Offres',
  version: '3.0.0',
  author: 'frodon-community',
  description: 'Diffusez des offres avec QR codes scannables et à décompte automatique.',
  icon: '🎟',
}, () => {

  const PLUGIN_ID = 'qr-offres';
  const store = frodon.storage(PLUGIN_ID);

  function getOffers() { return store.get('offers') || {}; }
  function saveOffers(o) { store.set('offers', o); }
  function buildQRData(offerId) {
    const me=frodon.getMyProfile();
    return JSON.stringify({type:'frodon-offer', offerId, creatorPeerId:me.peerId});
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'offers_data') {
      store.set('peer_offers_'+fromId, {offers:payload.offers, ts:Date.now()});
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'request_offers') {
      const pub=Object.entries(getOffers()).filter(([,o])=>o.remaining>0).map(([id,o])=>({id,title:o.title,description:o.description,total:o.total,remaining:o.remaining}));
      if(pub.length) frodon.sendDM(fromId,PLUGIN_ID,{type:'offers_data',offers:pub,_silent:true});
    }

    if(payload.type === 'claim') {
      const offers=getOffers(); const offer=offers[payload.offerId];
      if(!offer||offer.remaining<=0){
        frodon.sendDM(fromId,PLUGIN_ID,{type:'claim_result',success:false,reason:!offer?'Offre introuvable':'Offre épuisée',_silent:true});
        return;
      }
      offer.remaining--;
      const peer=frodon.getPeer(fromId);
      offer.claimants=offer.claimants||[];
      offer.claimants.push({name:peer?.name||'?',ts:Date.now()});
      saveOffers(offers);
      frodon.sendDM(fromId,PLUGIN_ID,{type:'claim_result',success:true,title:offer.title,remaining:offer.remaining,_silent:true});
      frodon.showToast('🎟 '+(peer?.name||'Pair')+' — "'+offer.title+'" ('+offer.remaining+' restantes)');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'claim_result') {
      if(payload.success) frodon.showToast('✅ "'+payload.title+'" validée — '+payload.remaining+' restantes');
      else frodon.showToast('❌ '+payload.reason);
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'offres', label: '🎟 Offres',
      render(container) {
        // Collecter toutes les offres des pairs actuellement découverts
        const peerEntries = [];
        frodon.getAllPeers().forEach(peer => {
          const cached = store.get('peer_offers_'+peer.peerId);
          if(!cached?.offers?.length) return;
          const avail = cached.offers.filter(o=>o.remaining>0);
          if(avail.length) peerEntries.push({peerId:peer.peerId, offers:avail});
        });

        if(!peerEntries.length){
          const em=frodon.makeElement('div',''); em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🎟</div>Aucune offre disponible à proximité.';
          container.appendChild(em); return;
        }

        // Alerte premier-servi
        const warn=frodon.makeElement('div','');
        warn.style.cssText='margin:6px 8px 4px;padding:7px 10px;background:rgba(255,107,53,.08);border:1px solid rgba(255,107,53,.25);border-radius:8px;font-size:.62rem;color:#ff8a5c;font-family:var(--mono);line-height:1.5';
        warn.textContent='⚠️ Premier arrivé, premier servi. Le QR code peut expirer si le pair se déconnecte.';
        container.appendChild(warn);

        peerEntries.forEach(({peerId, offers})=>{
          const peer=frodon.getPeer(peerId);
          const name=peer?.name||peerId.substring(0,8)+'…';

          // Bandeau profil
          const peerHdr=frodon.makeElement('div','');
          peerHdr.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px 5px;cursor:pointer';
          peerHdr.addEventListener('click',()=>frodon.openPeer(peerId));
          const av=frodon.makeElement('div',''); av.style.cssText='width:26px;height:26px;border-radius:50%;background:rgba(124,77,255,.18);border:1px solid rgba(124,77,255,.28);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:var(--mono);font-weight:700';
          av.textContent=name[0].toUpperCase();
          const nameEl=frodon.makeElement('div',''); nameEl.style.cssText='font-size:.72rem;font-weight:700;color:var(--acc2)'; nameEl.textContent=name;
          const arrow=frodon.makeElement('div',''); arrow.style.cssText='font-size:.6rem;color:var(--txt3);margin-left:auto'; arrow.textContent='↗ voir profil';
          peerHdr.appendChild(av); peerHdr.appendChild(nameEl); peerHdr.appendChild(arrow);
          container.appendChild(peerHdr);

          offers.forEach(offer=>{
            const card=frodon.makeElement('div','');
            card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;overflow:hidden';

            const hdr2=frodon.makeElement('div',''); hdr2.style.cssText='padding:9px 12px 7px;border-bottom:1px solid var(--bdr)';
            const t=frodon.makeElement('div',''); t.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt);margin-bottom:2px'; t.textContent=offer.title; hdr2.appendChild(t);
            if(offer.description){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.64rem;color:var(--txt2);margin-bottom:3px'; d.textContent=offer.description; hdr2.appendChild(d);}
            const cnt=frodon.makeElement('div',''); cnt.style.cssText='display:flex;align-items:center;gap:8px;margin-top:4px';
            const badge=frodon.makeElement('span',''); badge.style.cssText='font-size:.62rem;font-family:var(--mono);font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid rgba(0,229,122,.3);background:rgba(0,229,122,.08);color:var(--ok)';
            badge.textContent=offer.remaining+' / '+offer.total+' dispo';
            const prog=frodon.makeElement('div',''); prog.style.cssText='flex:1;height:3px;background:var(--sur2);border-radius:2px;overflow:hidden';
            const bar=frodon.makeElement('div',''); bar.style.cssText='height:100%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:2px'; bar.style.width=Math.round(offer.remaining/offer.total*100)+'%'; prog.appendChild(bar);
            cnt.appendChild(badge); cnt.appendChild(prog); hdr2.appendChild(cnt);
            card.appendChild(hdr2);

            // QR code
            const body=frodon.makeElement('div',''); body.style.cssText='padding:10px 12px;display:flex;gap:12px;align-items:center';
            const qrDiv=frodon.makeElement('div',''); qrDiv.style.cssText='width:88px;height:88px;background:#fff;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center';
            if(window.QRCode){
              try{ new QRCode(qrDiv,{text:buildQRDataForPeer(peerId,offer.id),width:84,height:84,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M}); }
              catch(e){ qrDiv.textContent='QR'; }
            } else { qrDiv.innerHTML='<div style="font-size:.55rem;color:#aaa;text-align:center">QR<br>loading</div>'; }

            const infoR=frodon.makeElement('div',''); infoR.style.cssText='flex:1;font-size:.62rem;color:var(--txt3);font-family:var(--mono);line-height:1.8';
            infoR.textContent='Scannez ce QR code pour utiliser l\'offre. Valable tant que '+name+' est connecté.';
            body.appendChild(qrDiv); body.appendChild(infoR); card.appendChild(body);
            container.appendChild(card);
          });
        });
      }
    },


    {
      id: 'settings', label: '⚙ Gérer',
      settings: true,
      render(container) {
        // Scanner
        const scanSection=frodon.makeElement('div',''); scanSection.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';
        const scanTitle=frodon.makeElement('div',''); scanTitle.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px'; scanTitle.textContent='Scanner un QR code';
        const scanNote=frodon.makeElement('div',''); scanNote.style.cssText='font-size:.64rem;color:var(--txt2);font-family:var(--mono);line-height:1.6;margin-bottom:8px'; scanNote.textContent='Scannez le QR code d\'une offre pour la valider et décrémenter le compteur.';
        const scanBtn=frodon.makeElement('button','plugin-action-btn acc','📷 Scanner un QR code'); scanBtn.style.cssText+=';width:100%';
        scanBtn.addEventListener('click',()=>_openScanner(scanSection,scanBtn));
        scanSection.appendChild(scanTitle); scanSection.appendChild(scanNote); scanSection.appendChild(scanBtn);
        container.appendChild(scanSection);

        // Créer offre
        _renderCreateForm(container);

        // Liste gestion
        const offers=getOffers(); const entries=Object.entries(offers);
        if(entries.length){
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:12px 8px 4px'; lbl.textContent='Mes offres — gestion'; container.appendChild(lbl);
          const noDelNote=frodon.makeElement('div',''); noDelNote.style.cssText='margin:4px 8px 6px;padding:7px 10px;background:rgba(255,107,53,.07);border:1px solid rgba(255,107,53,.22);border-radius:8px;font-size:.62rem;color:#ff8a5c;font-family:var(--mono);line-height:1.5'; noDelNote.textContent='ℹ️ Les offres ne peuvent pas être supprimées manuellement. Elles disparaissent automatiquement une fois épuisées.'; container.appendChild(noDelNote);
          entries.forEach(([id,offer])=>{
            const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--sur);border-bottom:1px solid var(--bdr)';
            const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:offer.title,style:{fontSize:'.72rem',fontWeight:'700',color:'var(--txt)'}}));
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:offer.remaining+' / '+offer.total+' restantes',style:{fontSize:'.6rem',color:'var(--txt2)',fontFamily:'var(--mono)'}}));
            row.appendChild(info); container.appendChild(row);
          });
        }
      }
    },
  ]);

  function buildQRDataForPeer(peerId, offerId) {
    return JSON.stringify({type:'frodon-offer', offerId, creatorPeerId:peerId});
  }

  function _renderCreateForm(container){
    const form=frodon.makeElement('div',''); form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent='Nouvelle offre'; form.appendChild(title);

    _fLabel(form,'Titre *'); const tInp=document.createElement('input'); tInp.className='f-input'; tInp.placeholder='Ex: Café offert, -20% sur le menu du soir…'; tInp.maxLength=100; tInp.style.marginBottom='5px'; form.appendChild(tInp);
    _fLabel(form,'Description'); const dInp=document.createElement('textarea'); dInp.className='f-input'; dInp.rows=2; dInp.maxLength=300; dInp.placeholder='Conditions, durée, modalités…'; dInp.style.marginBottom='5px'; form.appendChild(dInp);
    _fLabel(form,'Nombre d\'offres *'); const qInp=document.createElement('input'); qInp.type='number'; qInp.className='f-input'; qInp.min='1'; qInp.max='9999'; qInp.placeholder='Ex: 50'; qInp.style.marginBottom='10px'; form.appendChild(qInp);

    const saveBtn=frodon.makeElement('button','plugin-action-btn acc','＋ Créer l\'offre'); saveBtn.style.cssText+=';width:100%';
    saveBtn.addEventListener('click',()=>{
      const t=tInp.value.trim(); const q=parseInt(qInp.value)||0;
      if(!t||!q||q<1){frodon.showToast('Titre et quantité requis',true);return;}
      const id='offer_'+Date.now(); const offers=getOffers();
      offers[id]={title:t,description:dInp.value.trim(),total:q,remaining:q,claimants:[],createdAt:Date.now()};
      saveOffers(offers); tInp.value=''; dInp.value=''; qInp.value='';
      frodon.showToast('🎟 Offre créée — '+q+' disponibles !');
      // Broadcast aux pairs
      const pub2=Object.entries(getOffers()).filter(([,o])=>o.remaining>0).map(([oid,o])=>({id:oid,title:o.title,description:o.description,total:o.total,remaining:o.remaining}));
      frodon.getAllPeers().forEach(peer=>{
        frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'offers_data',offers:pub2,_silent:true});
      });
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    form.appendChild(saveBtn); container.appendChild(form);
  }

  function _fLabel(parent,text){
    const l=frodon.makeElement('div',''); l.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:6px'; l.textContent=text; parent.appendChild(l);
  }

  function _openScanner(sectionEl, triggerBtn){
    triggerBtn.disabled=true; triggerBtn.textContent='📷 Caméra active…';
    const wrap=frodon.makeElement('div',''); wrap.style.cssText='margin-top:8px;border-radius:8px;overflow:hidden;background:#000';
    const video=document.createElement('video'); video.style.cssText='width:100%;max-height:180px;display:block'; video.setAttribute('playsinline','');
    const status=frodon.makeElement('div',''); status.style.cssText='padding:5px 8px;font-size:.62rem;color:var(--txt2);font-family:var(--mono);background:var(--sur)'; status.textContent='Pointez vers un QR code…';
    const stopBtn=frodon.makeElement('button','plugin-action-btn'); stopBtn.style.cssText+=';width:100%;margin-top:6px;font-size:.62rem'; stopBtn.textContent='✕ Arrêter';
    wrap.appendChild(video); wrap.appendChild(status); sectionEl.appendChild(wrap); sectionEl.appendChild(stopBtn);

    let stream=null,raf=null;
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d');

    function stop(){
      if(raf)cancelAnimationFrame(raf); if(stream)stream.getTracks().forEach(t=>t.stop());
      wrap.remove(); stopBtn.remove(); triggerBtn.disabled=false; triggerBtn.textContent='📷 Scanner un QR code';
    }
    stopBtn.addEventListener('click',stop);

    navigator.mediaDevices?.getUserMedia({video:{facingMode:'environment'}}).then(s=>{
      stream=s; video.srcObject=s; video.play();
      function scan(){
        if(video.readyState===video.HAVE_ENOUGH_DATA&&window.jsQR){
          canvas.width=video.videoWidth; canvas.height=video.videoHeight; ctx.drawImage(video,0,0);
          const code=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
          if(code?.data){
            try{
              const parsed=JSON.parse(code.data);
              if(parsed.type==='frodon-offer'&&parsed.creatorPeerId&&parsed.offerId){
                stop();
                status.textContent='✅ QR détecté : offre "'+parsed.offerId+'"';
                if(parsed.creatorPeerId===frodon.getMyProfile().peerId){
                  // Ma propre offre
                  const offers=getOffers(); const offer=offers[parsed.offerId];
                  if(!offer){frodon.showToast('❌ Offre introuvable');return;}
                  if(offer.remaining<=0){frodon.showToast('❌ Offre épuisée');return;}
                  // Chercher le nom de l'offre pour confirmation
                  const offerName=offer.title;
                  offer.remaining--; offer.claimants=offer.claimants||[]; offer.claimants.push({name:'Scan direct',ts:Date.now()});
                  saveOffers(offers);
                  frodon.showToast('✅ "'+offerName+'" décomptée — '+offer.remaining+' restantes');
                  frodon.refreshSphereTab(PLUGIN_ID);
                } else {
                  frodon.sendDM(parsed.creatorPeerId,PLUGIN_ID,{type:'claim',offerId:parsed.offerId,_silent:true});
                  frodon.showToast('🎟 Validation de l\'offre envoyée…');
                }
                return;
              }
            }catch(e){}
            frodon.showToast('❌ QR non reconnu (pas une offre FRODON)');
          }
        }
        raf=requestAnimationFrame(scan);
      }
      raf=requestAnimationFrame(scan);
    }).catch(()=>{status.textContent='❌ Caméra inaccessible';stop();});
  }

  frodon.onPeerAppear(peer=>{
    const pub=Object.entries(getOffers()).filter(([,o])=>o.remaining>0).map(([id,o])=>({id,title:o.title,description:o.description,total:o.total,remaining:o.remaining}));
    if(pub.length) frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'offers_data',offers:pub,_silent:true});
    frodon.sendDM(peer.peerId,PLUGIN_ID,{type:'request_offers',_silent:true});
  });

  return { destroy() {} };
});
