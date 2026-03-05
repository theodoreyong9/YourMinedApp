/**
 * FRODON PLUGIN — QR Offres  v2.0.0
 * Paramétrage dans ⚙ (titre, description, quantité)
 * SPHERE : liste ses offres avec QR code auto-généré par offre
 * Scanner QR : décompte l'offre
 */
frodon.register({
  id: 'qr-offres',
  name: 'QR Offres',
  version: '2.0.0',
  author: 'frodon-community',
  description: 'Créez des offres avec QR codes. Chaque scan consomme une offre.',
  icon: '🎟',
}, () => {

  const PLUGIN_ID = 'qr-offres';
  const store = frodon.storage(PLUGIN_ID);

  function getOffers() { return store.get('offers') || {}; }
  function saveOffers(o) { store.set('offers', o); }

  function buildQRData(offerId) {
    const me = frodon.getMyProfile();
    return JSON.stringify({type:'frodon-offer', offerId, creatorPeerId:me.peerId});
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type === 'claim') {
      const offers = getOffers();
      const offer = offers[payload.offerId];
      if(!offer || offer.remaining <= 0) {
        frodon.sendDM(fromId, PLUGIN_ID, {type:'claim_result', success:false,
          reason: !offer?'Offre introuvable':'Offre épuisée', _silent:true});
        return;
      }
      offer.remaining--;
      const peer = frodon.getPeer(fromId);
      offer.claimants = offer.claimants||[];
      offer.claimants.push({name:peer?.name||'?', ts:Date.now()});
      saveOffers(offers);
      frodon.sendDM(fromId, PLUGIN_ID, {type:'claim_result', success:true,
        title:offer.title, remaining:offer.remaining, _silent:true});
      frodon.showToast('🎟 '+(peer?.name||'Pair')+' — "'+offer.title+'" ('+offer.remaining+' restantes)');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'claim_result') {
      if(payload.success) frodon.showToast('✅ Offre validée : '+payload.title+' ('+payload.remaining+' restantes)');
      else frodon.showToast('❌ '+payload.reason);
    }
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'mes-offres', label: '🎟 Mes offres',
      render(container) {
        const offers = getOffers();
        const entries = Object.entries(offers);

        if(!entries.length) {
          const em=frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🎟</div>Aucune offre.<br><small style="color:var(--txt3)">Créez des offres dans les paramètres ⚙</small>';
          container.appendChild(em); return;
        }

        entries.forEach(([id, offer]) => {
          const card=frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:6px 8px 0;overflow:hidden';

          // Header
          const hdr=frodon.makeElement('div','');
          hdr.style.cssText='padding:10px 12px 8px;border-bottom:1px solid var(--bdr)';
          const title=frodon.makeElement('div',''); title.style.cssText='font-size:.82rem;font-weight:700;color:var(--txt);margin-bottom:2px'; title.textContent=offer.title;
          if(offer.description){const d=frodon.makeElement('div',''); d.style.cssText='font-size:.65rem;color:var(--txt2);margin-bottom:5px'; d.textContent=offer.description; hdr.appendChild(title); hdr.appendChild(d);}
          else hdr.appendChild(title);

          // Compteur
          const remaining=offer.remaining;
          const total=offer.total;
          const isEmpty=remaining<=0;
          const countRow=frodon.makeElement('div',''); countRow.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-top:4px';
          const countBadge=frodon.makeElement('div','');
          countBadge.style.cssText='font-size:.66rem;font-family:var(--mono);font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid;'
            +(isEmpty?'color:var(--warn);border-color:rgba(255,85,85,.3);background:rgba(255,85,85,.08)':'color:var(--ok);border-color:rgba(0,229,122,.3);background:rgba(0,229,122,.08)');
          countBadge.textContent=isEmpty?'Épuisée':remaining+' / '+total+' disponible'+(remaining>1?'s':'');
          const prog=frodon.makeElement('div',''); prog.style.cssText='flex:1;height:3px;background:var(--sur2);border-radius:2px;margin-left:10px;overflow:hidden';
          const bar=frodon.makeElement('div',''); bar.style.cssText='height:100%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:2px;transition:width .3s';
          bar.style.width=Math.round(remaining/total*100)+'%'; prog.appendChild(bar);
          countRow.appendChild(countBadge); countRow.appendChild(prog);
          hdr.appendChild(countRow); card.appendChild(hdr);

          // QR code
          const body=frodon.makeElement('div',''); body.style.cssText='padding:12px;display:flex;gap:12px;align-items:flex-start';
          const qrWrap=frodon.makeElement('div','');
          qrWrap.style.cssText='flex-shrink:0;width:100px;height:100px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;position:relative';

          if(isEmpty) {
            qrWrap.style.cssText+='filter:grayscale(1);opacity:.4';
          }

          // Generate QR
          if(window.QRCode) {
            try {
              new QRCode(qrWrap, {text:buildQRData(id), width:96, height:96, colorDark:'#000', colorLight:'#fff', correctLevel:QRCode.CorrectLevel.M});
            } catch(e){ qrWrap.textContent='QR'; }
          } else {
            qrWrap.innerHTML='<div style="font-size:.55rem;color:#999;text-align:center;padding:4px">QR<br>chargement…</div>';
          }

          const infoCol=frodon.makeElement('div',''); infoCol.style.cssText='flex:1;min-width:0';

          // Expiry warning
          const warn=frodon.makeElement('div',''); warn.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);line-height:1.6;margin-bottom:8px';
          warn.innerHTML='⚠️ Ce QR code est lié à votre session.<br>Il expirera si vous rechargez la page.';
          infoCol.appendChild(warn);

          // Derniers utilisateurs
          if(offer.claimants?.length){
            const cl=frodon.makeElement('div',''); cl.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-bottom:4px'; cl.textContent='Derniers scans :'; infoCol.appendChild(cl);
            offer.claimants.slice(-3).reverse().forEach(c=>{
              const r=frodon.makeElement('div',''); r.style.cssText='font-size:.64rem;color:var(--txt2);display:flex;justify-content:space-between';
              r.innerHTML='<span>'+c.name+'</span><span style="color:var(--txt3)">'+frodon.formatTime(c.ts)+'</span>'; infoCol.appendChild(r);
            });
          }

          const delBtn=frodon.makeElement('button','plugin-action-btn');
          delBtn.style.cssText+=';font-size:.6rem;color:var(--warn);border-color:rgba(255,85,85,.25);margin-top:6px;width:100%';
          delBtn.textContent='🗑 Supprimer cette offre';
          delBtn.addEventListener('click',()=>{const o=getOffers();delete o[id];saveOffers(o);frodon.refreshSphereTab(PLUGIN_ID);});
          infoCol.appendChild(delBtn);

          body.appendChild(qrWrap); body.appendChild(infoCol); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'scanner', label: '📷 Scanner',
      render(container) {
        const note=frodon.makeElement('div','');
        note.style.cssText='font-size:.66rem;color:var(--txt2);font-family:var(--mono);margin:8px 8px 6px;line-height:1.6';
        note.textContent='Scannez le QR code d\'une offre pour la valider et décrémenter le compteur.';
        container.appendChild(note);

        const scanBtn=frodon.makeElement('button','plugin-action-btn acc','📷 Scanner un QR code');
        scanBtn.style.cssText+=';width:calc(100% - 16px);margin:0 8px 8px';
        scanBtn.addEventListener('click',()=>_openScanner(container, scanBtn));
        container.appendChild(scanBtn);
      }
    },
    {
      id: 'settings', label: '⚙ Mes offres',
      settings: true,
      render(container) {
        _renderCreateForm(container);

        // Liste éditable
        const offers=getOffers();
        const entries=Object.entries(offers);
        if(entries.length){
          const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:12px 8px 6px'; lbl.textContent='Mes offres';
          container.appendChild(lbl);
          entries.forEach(([id,offer])=>{
            const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--bdr)';
            const info=frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:offer.title,style:{fontSize:'.74rem',fontWeight:'700',color:'var(--txt)'}}));
            const sub=frodon.makeElement('div',''); sub.style.cssText='font-size:.62rem;color:var(--txt2);font-family:var(--mono)'; sub.textContent=offer.remaining+' / '+offer.total; info.appendChild(sub);
            const del=frodon.makeElement('button',''); del.style.cssText='background:none;border:none;cursor:pointer;color:var(--txt3);font-size:.85rem;padding:2px 4px'; del.textContent='✕';
            del.addEventListener('click',()=>{const o=getOffers();delete o[id];saveOffers(o);frodon.refreshSphereTab(PLUGIN_ID);});
            row.appendChild(info); row.appendChild(del); container.appendChild(row);
          });
        }
      }
    },
  ]);

  function _renderCreateForm(container) {
    const form=frodon.makeElement('div','');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:8px;padding:12px';
    const title=frodon.makeElement('div',''); title.style.cssText='font-size:.62rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px'; title.textContent='Nouvelle offre';
    form.appendChild(title);

    const labels=[
      {key:'title',label:'Titre *',placeholder:'Ex: Café offert, -10% sur le menu…',type:'input'},
      {key:'description',label:'Description',placeholder:'Conditions, validité, détails…',type:'textarea'},
    ];
    const inputs={};
    labels.forEach(f=>{
      const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:10px'; lbl.textContent=f.label; form.appendChild(lbl);
      const inp=f.type==='textarea'?document.createElement('textarea'):document.createElement('input');
      inp.className='f-input'; inp.placeholder=f.placeholder; inp.maxLength=200;
      if(f.type==='textarea') inp.rows=2;
      inputs[f.key]=inp; form.appendChild(inp);
    });

    const qtyLbl=frodon.makeElement('div',''); qtyLbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:10px'; qtyLbl.textContent='Nombre d\'offres *'; form.appendChild(qtyLbl);
    const qtyInp=document.createElement('input'); qtyInp.type='number'; qtyInp.className='f-input'; qtyInp.min='1'; qtyInp.max='9999'; qtyInp.placeholder='Ex: 50'; form.appendChild(qtyInp);

    const saveBtn=frodon.makeElement('button','plugin-action-btn acc','＋ Créer l\'offre'); saveBtn.style.cssText+=';width:100%;margin-top:12px';
    saveBtn.addEventListener('click',()=>{
      const t=inputs.title.value.trim(); const q=parseInt(qtyInp.value)||0;
      if(!t||!q||q<1){frodon.showToast('Titre et quantité requis',true);return;}
      const id='offer_'+Date.now();
      const offers=getOffers();
      offers[id]={title:t,description:inputs.description.value.trim(),total:q,remaining:q,claimants:[],createdAt:Date.now()};
      saveOffers(offers);
      inputs.title.value=''; inputs.description.value=''; qtyInp.value='';
      frodon.showToast('🎟 Offre créée — '+q+' disponibles !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    form.appendChild(saveBtn); container.appendChild(form);
  }

  function _openScanner(container, triggerBtn) {
    triggerBtn.disabled=true; triggerBtn.textContent='📷 Caméra active…';
    const wrap=frodon.makeElement('div',''); wrap.style.cssText='margin:0 8px 8px;border-radius:10px;overflow:hidden;background:#000';
    const video=document.createElement('video'); video.style.cssText='width:100%;max-height:200px;display:block'; video.setAttribute('playsinline','');
    const status=frodon.makeElement('div',''); status.style.cssText='padding:6px 10px;font-size:.64rem;color:var(--txt2);font-family:var(--mono);background:var(--sur)'; status.textContent='Pointez vers un QR code…';
    const stopBtn=frodon.makeElement('button','plugin-action-btn'); stopBtn.style.cssText+=';width:calc(100% - 16px);margin:4px 8px;font-size:.64rem'; stopBtn.textContent='✕ Arrêter';
    wrap.appendChild(video); wrap.appendChild(status); container.appendChild(wrap); container.appendChild(stopBtn);

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
                // Si c'est ma propre offre, décompter directement
                if(parsed.creatorPeerId===frodon.getMyProfile().peerId){
                  const offers=getOffers();
                  const offer=offers[parsed.offerId];
                  if(!offer){frodon.showToast('❌ Offre introuvable');return;}
                  if(offer.remaining<=0){frodon.showToast('❌ Offre épuisée');return;}
                  offer.remaining--;
                  offer.claimants=offer.claimants||[];
                  offer.claimants.push({name:'Scan direct',ts:Date.now()});
                  saveOffers(offers);
                  frodon.showToast('✅ Offre décomptée — '+offer.remaining+' restantes');
                  frodon.refreshSphereTab(PLUGIN_ID);
                } else {
                  frodon.sendDM(parsed.creatorPeerId,PLUGIN_ID,{type:'claim',offerId:parsed.offerId,_silent:true});
                  frodon.showToast('🎟 Validation envoyée…');
                }
                return;
              }
            }catch(e){}
            frodon.showToast('❌ QR non reconnu');
          }
        }
        raf=requestAnimationFrame(scan);
      }
      raf=requestAnimationFrame(scan);
    }).catch(()=>{status.textContent='❌ Caméra inaccessible';triggerBtn.disabled=false;triggerBtn.textContent='📷 Scanner un QR code';});
  }

  return { destroy() {} };
});
