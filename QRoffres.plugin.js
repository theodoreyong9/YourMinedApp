/**
 * FRODON PLUGIN — QR Offres  v1.0.0
 * Diffuse des offres avec QR codes scannables, compteur décrémenté P2P
 */
frodon.register({
  id: 'qr-offres',
  name: 'QR Offres',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Créez des offres avec QR codes imprimables. Chaque scan consomme une offre.',
  icon: '🎟',
}, () => {

  const PLUGIN_ID = 'qr-offres';
  const store = frodon.storage(PLUGIN_ID);

  function getOffers() { return store.get('offers') || {}; }
  function saveOffers(o) { store.set('offers', o); }
  function getScanned() { return store.get('scanned') || []; }

  function myId() { return frodon.getMyProfile().peerId; }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type === 'claim') {
      const offers = getOffers();
      const offer = offers[payload.offerId];
      if(!offer) {
        frodon.sendDM(fromId, PLUGIN_ID, {type:'claim_result', success:false, reason:'Offre introuvable', _silent:true});
        return;
      }
      if(offer.remaining <= 0) {
        frodon.sendDM(fromId, PLUGIN_ID, {type:'claim_result', success:false, reason:'Offre épuisée', offerId:payload.offerId, _silent:true});
        return;
      }
      offer.remaining--;
      const peer = frodon.getPeer(fromId);
      const claimants = offer.claimants || [];
      claimants.push({peerId:fromId, name:peer?.name||'?', ts:Date.now()});
      offer.claimants = claimants;
      saveOffers(offers);
      frodon.sendDM(fromId, PLUGIN_ID, {type:'claim_result', success:true, offer:{title:offer.title, description:offer.description, remaining:offer.remaining}, _silent:true});
      frodon.showToast('🎟 '+( peer?.name||'Pair')+ ' a utilisé "'+offer.title+'" ('+offer.remaining+' restantes)');
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'claim_result') {
      const scanned = getScanned();
      if(payload.success) {
        scanned.unshift({offerId:payload.offerId||'', title:payload.offer?.title||'Offre', description:payload.offer?.description||'', remaining:payload.offer?.remaining, ts:Date.now(), success:true});
        frodon.showToast('🎟 Offre validée : '+( payload.offer?.title||''));
      } else {
        scanned.unshift({title:'Échec', description:payload.reason||'Erreur', ts:Date.now(), success:false});
        frodon.showToast('❌ '+( payload.reason||'Offre invalide'));
      }
      if(scanned.length > 50) scanned.length = 50;
      store.set('scanned', scanned);
      frodon.refreshSphereTab(PLUGIN_ID);
    }

    if(payload.type === 'request_offers') {
      const offers = getOffers();
      const pub = Object.entries(offers)
        .filter(([,o]) => o.remaining > 0)
        .map(([id,o]) => ({id, title:o.title, description:o.description, remaining:o.remaining}));
      if(pub.length) frodon.sendDM(fromId, PLUGIN_ID, {type:'offers_list', offers:pub, _silent:true});
    }

    if(payload.type === 'offers_list') {
      store.set('peer_offers_'+fromId, {offers:payload.offers, ts:Date.now()});
      frodon.refreshPeerModal(fromId);
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🎟 Offres', (peerId, container) => {
    const cached = store.get('peer_offers_'+peerId);
    if(!cached || Date.now()-cached.ts > 30000) {
      frodon.sendDM(peerId, PLUGIN_ID, {type:'request_offers', _silent:true});
    }
    if(!cached || !cached.offers?.length) {
      const msg = frodon.makeElement('div','');
      msg.style.cssText='font-size:.68rem;color:var(--txt2);padding:4px 0 8px;font-family:var(--mono)';
      msg.textContent = cached ? '🎟 Aucune offre disponible' : '⌛ Chargement des offres…';
      container.appendChild(msg); return;
    }
    cached.offers.forEach(offer => {
      const card = frodon.makeElement('div','');
      card.style.cssText='background:linear-gradient(135deg,rgba(0,245,200,.08),rgba(124,77,255,.06));border:1px solid rgba(0,245,200,.25);border-radius:10px;padding:10px 12px;margin-bottom:8px';
      const title = frodon.makeElement('div','');
      title.style.cssText='font-size:.82rem;font-weight:700;color:var(--txt);margin-bottom:3px';
      title.textContent = offer.title;
      const desc = frodon.makeElement('div','');
      desc.style.cssText='font-size:.66rem;color:var(--txt2);margin-bottom:6px';
      desc.textContent = offer.description||'';
      const rem = frodon.makeElement('div','');
      rem.style.cssText='font-size:.6rem;color:var(--acc);font-family:var(--mono);margin-bottom:8px';
      rem.textContent = offer.remaining+' disponible'+(offer.remaining>1?'s':'');
      const btn = frodon.makeElement('button','plugin-action-btn acc','🎟 Utiliser cette offre');
      btn.addEventListener('click', () => {
        btn.disabled=true; btn.textContent='⏳ Validation…';
        frodon.sendDM(peerId, PLUGIN_ID, {type:'claim', offerId:offer.id, _silent:true});
        setTimeout(()=>{ if(btn.disabled) { btn.textContent='⌛ En attente…'; } }, 3000);
      });
      card.appendChild(title); card.appendChild(desc); card.appendChild(rem); card.appendChild(btn);
      container.appendChild(card);
    });
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'mes-offres', label: '🎟 Mes offres',
      render(container) {
        const offers = getOffers();
        const entries = Object.entries(offers);

        // Bouton créer
        const createBtn = frodon.makeElement('button','plugin-action-btn acc','＋ Créer une offre');
        createBtn.style.cssText+=';width:calc(100% - 16px);margin:8px;display:block';
        createBtn.addEventListener('click', () => showCreateForm(container, createBtn));
        container.appendChild(createBtn);

        if(!entries.length) {
          const em = frodon.makeElement('div','');
          em.style.cssText='text-align:center;padding:24px 14px;color:var(--txt2);font-size:.72rem;line-height:1.9';
          em.innerHTML='<div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🎟</div>Aucune offre créée.<br><small style="color:var(--txt3)">Créez une offre et imprimez les QR codes.</small>';
          container.appendChild(em); return;
        }

        entries.forEach(([id, offer]) => {
          const card = frodon.makeElement('div','');
          card.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;overflow:hidden';
          const hdr = frodon.makeElement('div','');
          hdr.style.cssText='padding:10px 12px;border-bottom:1px solid var(--bdr)';
          const title = frodon.makeElement('div','');
          title.style.cssText='font-size:.8rem;font-weight:700;color:var(--txt);margin-bottom:2px';
          title.textContent=offer.title;
          const stats = frodon.makeElement('div','');
          stats.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono)';
          const used = offer.total - offer.remaining;
          stats.textContent=offer.remaining+' restante'+(offer.remaining>1?'s':'')+' · '+used+' utilisée'+(used>1?'s':'');
          const prog = frodon.makeElement('div','');
          prog.style.cssText='height:3px;background:var(--sur2);border-radius:2px;margin-top:6px;overflow:hidden';
          const bar = frodon.makeElement('div','');
          bar.style.cssText='height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:2px;transition:width .3s';
          bar.style.width=Math.round(offer.remaining/offer.total*100)+'%';
          prog.appendChild(bar);
          hdr.appendChild(title); hdr.appendChild(stats); hdr.appendChild(prog);

          const body = frodon.makeElement('div','');
          body.style.cssText='padding:8px 12px';

          // QR code
          const qrBtn = frodon.makeElement('button','plugin-action-btn','📄 Télécharger QR codes');
          qrBtn.style.cssText+=';font-size:.68rem;margin-bottom:6px;width:100%';
          qrBtn.addEventListener('click', () => downloadQR(id, offer));

          // Claimants
          const claimants = offer.claimants||[];
          if(claimants.length) {
            const clLabel = frodon.makeElement('div','');
            clLabel.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px';
            clLabel.textContent='Utilisateurs récents';
            body.appendChild(clLabel);
            claimants.slice(-3).reverse().forEach(cl => {
              const row = frodon.makeElement('div','');
              row.style.cssText='font-size:.66rem;color:var(--txt2);padding:2px 0;display:flex;justify-content:space-between';
              row.innerHTML='<span>'+cl.name+'</span><span style="color:var(--txt3)">'+frodon.formatTime(cl.ts)+'</span>';
              body.appendChild(row);
            });
          }

          const delBtn = frodon.makeElement('button','plugin-action-btn');
          delBtn.style.cssText+=';font-size:.62rem;color:var(--warn);border-color:rgba(255,85,85,.3);margin-top:4px';
          delBtn.textContent='🗑 Supprimer';
          delBtn.addEventListener('click', () => {
            const o=getOffers(); delete o[id]; saveOffers(o);
            frodon.refreshSphereTab(PLUGIN_ID);
          });

          body.appendChild(qrBtn); body.appendChild(delBtn);
          card.appendChild(hdr); card.appendChild(body);
          container.appendChild(card);
        });
      }
    },
    {
      id: 'scan', label: '📷 Scanner',
      render(container) {
        const scanBtn = frodon.makeElement('button','plugin-action-btn acc','📷 Scanner un QR code');
        scanBtn.style.cssText+=';width:calc(100% - 16px);margin:8px;display:block';
        scanBtn.addEventListener('click', () => openScanner(container, scanBtn));
        container.appendChild(scanBtn);

        const scanned = getScanned();
        if(scanned.length) {
          const lbl = frodon.makeElement('div','');
          lbl.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.6px;margin:8px 8px 4px';
          lbl.textContent='Historique';
          container.appendChild(lbl);
          scanned.slice(0,10).forEach(s => {
            const row = frodon.makeElement('div','');
            row.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--bdr)';
            const ico = frodon.makeElement('span','',s.success?'✅':'❌');
            ico.style.fontSize='.9rem';
            const info = frodon.makeElement('div',''); info.style.cssText='flex:1;min-width:0';
            info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:s.title,style:{fontSize:'.72rem',fontWeight:'700',color:'var(--txt)'}}));
            if(s.description) info.appendChild(Object.assign(frodon.makeElement('div',''),{textContent:s.description,style:{fontSize:'.62rem',color:'var(--txt2)'}}));
            const ts = frodon.makeElement('div','',frodon.formatTime(s.ts));
            ts.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);flex-shrink:0';
            row.appendChild(ico); row.appendChild(info); row.appendChild(ts);
            container.appendChild(row);
          });
        }
      }
    },
  ]);

  function showCreateForm(container, triggerBtn) {
    triggerBtn.style.display='none';
    const form = frodon.makeElement('div','');
    form.style.cssText='background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;margin:0 8px 8px;padding:12px';

    const fields = [
      {key:'title', label:'Titre de l\'offre *', placeholder:'ex: Café offert, -20% repas…', type:'input'},
      {key:'description', label:'Description', placeholder:'Conditions, détails…', type:'textarea'},
      {key:'total', label:'Nombre d\'offres *', placeholder:'ex: 50', type:'number'},
    ];
    const inputs = {};
    fields.forEach(f => {
      const lbl = frodon.makeElement('div','');
      lbl.style.cssText='font-size:.6rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:10px';
      lbl.textContent=f.label; form.appendChild(lbl);
      let inp;
      if(f.type==='textarea') { inp=document.createElement('textarea'); inp.rows=2; }
      else { inp=document.createElement('input'); if(f.type==='number') inp.type='number'; }
      inp.className='f-input'; inp.placeholder=f.placeholder; inp.maxLength=200;
      inputs[f.key]=inp; form.appendChild(inp);
    });

    const row = frodon.makeElement('div','');
    row.style.cssText='display:flex;gap:6px;margin-top:12px';

    const cancel = frodon.makeElement('button','plugin-action-btn','Annuler');
    cancel.addEventListener('click', () => { form.remove(); triggerBtn.style.display=''; });

    const save = frodon.makeElement('button','plugin-action-btn acc','✓ Créer');
    save.addEventListener('click', () => {
      const title=inputs.title.value.trim();
      const total=parseInt(inputs.total.value)||0;
      if(!title||!total||total<1) { frodon.showToast('Titre et quantité requis', true); return; }
      const id='offer_'+Date.now();
      const offers=getOffers();
      offers[id]={title, description:inputs.description.value.trim(), total, remaining:total, claimants:[], createdAt:Date.now()};
      saveOffers(offers);
      frodon.showToast('🎟 Offre créée — '+total+' disponibles !');
      form.remove(); triggerBtn.style.display='';
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    row.appendChild(cancel); row.appendChild(save);
    form.appendChild(row);
    container.insertBefore(form, triggerBtn.nextSibling);
  }

  function downloadQR(offerId, offer) {
    const me = frodon.getMyProfile();
    const data = JSON.stringify({type:'frodon-offer', offerId, creatorPeerId:me.peerId, title:offer.title});
    const url = location.href.split('?')[0]+'?offer='+encodeURIComponent(data);
    // Generate printable HTML page with QR codes
    if(!window.QRCode) { frodon.showToast('QR lib en cours de chargement…', true); return; }
    const count = Math.min(offer.total, 20); // max 20 par page
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Offres — ${offer.title}</title>
<style>body{font-family:monospace;padding:20px;background:#fff;color:#000}
h2{font-size:1rem;margin-bottom:4px}p{font-size:.75rem;color:#666;margin:0 0 20px}
.grid{display:flex;flex-wrap:wrap;gap:16px}
.qr-item{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid #ddd;padding:10px;border-radius:8px}
.qr-item span{font-size:.6rem;color:#999;text-align:center;max-width:80px}
@media print{body{padding:8px}.qr-item{break-inside:avoid}}</style></head>
<body><h2>🎟 ${offer.title}</h2>
<p>${offer.description||''} — ${offer.total} offres au total</p>
<div class="grid" id="grid"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<script>
const url=${JSON.stringify(url)};
const grid=document.getElementById('grid');
for(let i=0;i<${count};i++){
  const item=document.createElement('div'); item.className='qr-item';
  const qrDiv=document.createElement('div');
  item.appendChild(qrDiv);
  item.appendChild(Object.assign(document.createElement('span'),{textContent:'${offer.title}'}));
  grid.appendChild(item);
  new QRCode(qrDiv,{text:url,width:90,height:90,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
}
setTimeout(()=>window.print(),800);
<\/script></body></html>`;
    const w = window.open('','_blank');
    w.document.write(html); w.document.close();
  }

  function openScanner(container, triggerBtn) {
    triggerBtn.disabled=true; triggerBtn.textContent='📷 Caméra active…';
    const wrap = frodon.makeElement('div','');
    wrap.style.cssText='margin:0 8px 8px;border-radius:10px;overflow:hidden;background:#000;position:relative';
    const video = document.createElement('video');
    video.style.cssText='width:100%;max-height:220px;display:block';
    video.setAttribute('playsinline','');
    const status = frodon.makeElement('div','');
    status.style.cssText='padding:6px 10px;font-size:.66rem;color:var(--txt2);font-family:var(--mono);background:var(--sur)';
    status.textContent='Pointez vers un QR code FRODON Offres…';
    const stopBtn = frodon.makeElement('button','plugin-action-btn');
    stopBtn.style.cssText+=';width:calc(100% - 16px);margin:4px 8px;font-size:.66rem';
    stopBtn.textContent='✕ Arrêter';
    wrap.appendChild(video); wrap.appendChild(status); container.appendChild(wrap); container.appendChild(stopBtn);

    let stream=null, raf=null;
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');

    function stop() {
      if(raf) cancelAnimationFrame(raf);
      if(stream) stream.getTracks().forEach(t=>t.stop());
      wrap.remove(); stopBtn.remove();
      triggerBtn.disabled=false; triggerBtn.textContent='📷 Scanner un QR code';
    }
    stopBtn.addEventListener('click', stop);

    navigator.mediaDevices?.getUserMedia({video:{facingMode:'environment'}})
      .then(s => {
        stream=s; video.srcObject=s; video.play();
        function scan() {
          if(video.readyState===video.HAVE_ENOUGH_DATA && window.jsQR) {
            canvas.width=video.videoWidth; canvas.height=video.videoHeight;
            ctx.drawImage(video,0,0);
            const img=ctx.getImageData(0,0,canvas.width,canvas.height);
            const code=jsQR(img.data,img.width,img.height);
            if(code?.data) {
              try {
                let parsed;
                if(code.data.includes('?offer=')) {
                  parsed=JSON.parse(decodeURIComponent(code.data.split('?offer=')[1]));
                } else {
                  parsed=JSON.parse(code.data);
                }
                if(parsed.type==='frodon-offer' && parsed.creatorPeerId && parsed.offerId) {
                  stop();
                  status.textContent='✅ QR détecté — validation en cours…';
                  frodon.sendDM(parsed.creatorPeerId, PLUGIN_ID, {type:'claim', offerId:parsed.offerId, _silent:true});
                  frodon.showToast('🎟 Validation envoyée…');
                  return;
                }
              } catch(e) {}
              frodon.showToast('❌ QR non reconnu');
            }
          }
          raf=requestAnimationFrame(scan);
        }
        raf=requestAnimationFrame(scan);
      })
      .catch(()=>{ status.textContent='❌ Caméra inaccessible'; triggerBtn.disabled=false; triggerBtn.textContent='📷 Scanner un QR code'; });
  }

  // Handle ?offer= URL param on load
  const params=new URLSearchParams(location.search);
  const offerParam=params.get('offer');
  if(offerParam) {
    try {
      const parsed=JSON.parse(decodeURIComponent(offerParam));
      if(parsed.type==='frodon-offer') {
        history.replaceState(null,'',location.pathname);
        setTimeout(()=>{
          frodon.sendDM(parsed.creatorPeerId, PLUGIN_ID, {type:'claim', offerId:parsed.offerId, _silent:true});
          frodon.showToast('🎟 Validation de l\'offre en cours…');
        }, 1500);
      }
    } catch(e) {}
  }

  return { destroy() {} };
});
