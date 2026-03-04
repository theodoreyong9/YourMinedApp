/**
 * FRODON PLUGIN — Carousel  v2.0
 * Modèle jobseeker : config dans le widget profil, feed pour les carousels reçus.
 */
frodon.register({
  id: 'carousel', name: 'Carousel', version: '2.0.0',
  author: 'frodon-community',
  description: 'Diffusez un carousel d\'images sur votre profil.',
  icon: '🖼',
}, () => {

  const PLUGIN_ID = 'carousel';
  const store = frodon.storage(PLUGIN_ID);

  function getMyCarousel() { return store.get('carousel') || { title: '', images: [], active: false }; }
  function isActive() { const c = getMyCarousel(); return !!(c.active && c.images.length); }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    // Quelqu'un vérifie si on a un carousel
    if (payload.type === 'request_meta') {
      const c = getMyCarousel();
      frodon.sendDM(fromId, PLUGIN_ID, {
        type:   'meta',
        title:  c.title,
        count:  c.images.length,
        active: isActive(),
        _silent: true,
      });
      return;
    }

    // Réception de la meta d'un pair (réponse à request_meta)
    if (payload.type === 'meta') {
      store.set('peer_meta_' + fromId, { title: payload.title, count: payload.count, active: payload.active });
      // Pas de refreshPeerModal ici — évite la boucle infinie render→request→meta→refresh→render
      return;
    }

    // Quelqu'un demande notre carousel
    if (payload.type === 'request_carousel') {
      if (!isActive()) return;
      const c = getMyCarousel();
      frodon.sendDM(fromId, PLUGIN_ID, {
        type:   'carousel_data',
        title:  c.title,
        images: c.images,
        _label: '🖼 ' + c.title,
        _silent: false,
      });
      return;
    }

    // Réception d'un carousel demandé
    if (payload.type === 'carousel_data') {
      const peer = frodon.getPeer(fromId);
      const peerName = peer?.name || 'Pair inconnu';
      const received = store.get('received') || [];
      received.unshift({
        fromId,
        fromName: peerName,
        title:    payload.title,
        images:   payload.images || [],
        ts:       Date.now(),
      });
      if (received.length > 30) received.length = 30;
      store.set('received', received);
      frodon.showToast('🖼 Carousel de ' + peerName + ' reçu !');
      // Ajouter dans le feed
      frodon.addFeedEvent(fromId, {
        pluginId:   PLUGIN_ID,
        pluginName: 'Carousel',
        pluginIcon: '🖼',
        peerName,
        text: '→ ' + (payload.title || 'Carousel') + ' · ' + (payload.images?.length || 0) + ' image(s)',
      });
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 400);
      return;
    }
  });

  /* ── Action sur profil d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🖼 Carousel', (peerId, container) => {
    const meta = store.get('peer_meta_' + peerId);

    // Demander la meta seulement si absente (évite la boucle render→DM→refreshPeerModal→render)
    if (!meta) frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_meta', _silent: true });

    if (!meta) {
      const loading = frodon.makeElement('div', '');
      loading.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:4px 0 8px';
      loading.textContent = '⌛ Vérification du carousel…';
      container.appendChild(loading);
      return;
    }

    if (!meta.active) {
      const info = frodon.makeElement('div', '');
      info.style.cssText = 'font-size:.65rem;color:var(--txt3);padding:4px 0 8px;text-align:center';
      info.textContent = 'Pas de carousel actif.';
      container.appendChild(info);
      return;
    }

    // Carte aperçu
    const card = frodon.makeElement('div', '');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(124,77,255,.1),rgba(0,245,200,.07));border:1px solid rgba(124,77,255,.3);border-radius:10px;padding:10px 12px;margin-bottom:10px';
    const ct = frodon.makeElement('div','');
    ct.style.cssText = 'font-size:.62rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px';
    ct.textContent = '🖼 CAROUSEL';
    card.appendChild(ct);
    const cname = frodon.makeElement('div','');
    cname.style.cssText = 'font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:3px';
    cname.textContent = meta.title || 'Carousel';
    card.appendChild(cname);
    const ccount = frodon.makeElement('div','');
    ccount.style.cssText = 'font-size:.64rem;color:var(--txt2)';
    ccount.textContent = meta.count + ' image' + (meta.count > 1 ? 's' : '');
    card.appendChild(ccount);
    container.appendChild(card);

    const btn = frodon.makeElement('button','plugin-action-btn acc','🖼 Voir "' + (meta.title || 'Carousel') + '"');
    btn.style.width = '100%';
    btn.addEventListener('click', () => {
      frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_carousel', _silent: true });
      frodon.showToast('🖼 Demande envoyée, ouverture en cours…');
      btn.textContent = '⌛ Chargement…';
      btn.disabled = true;
    });
    container.appendChild(btn);
  });

  /* ── Widget profil : config sur MON profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    if (!isActive()) return;
    const c = getMyCarousel();
    const card = frodon.makeElement('div','');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(124,77,255,.12),rgba(0,245,200,.08));border:1px solid rgba(124,77,255,.35);border-radius:10px;padding:10px 12px;margin-top:6px';
    const t = frodon.makeElement('div','');
    t.style.cssText = 'font-size:.62rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px';
    t.textContent = '🖼 CAROUSEL ACTIF';
    card.appendChild(t);
    const j = frodon.makeElement('div','');
    j.style.cssText = 'font-size:.85rem;font-weight:700;color:var(--txt)';
    j.textContent = c.title || '';
    card.appendChild(j);
    const n = frodon.makeElement('div','');
    n.style.cssText = 'font-size:.64rem;color:var(--txt2);margin-top:2px';
    n.textContent = c.images.length + ' image' + (c.images.length > 1 ? 's' : '');
    card.appendChild(n);
    container.appendChild(card);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'my_carousel', label: '🖼 Mon carousel',
      settings: true,
      render(container) {
        // État local du formulaire — pas de refreshSphereTab intermédiaire
        const c = getMyCarousel();
        // Images en cours d'édition (ajouts/suppressions sans rechargement)
        let editImages = c.images.map(img => ({...img}));
        let pendingDataUrl = null;

        const wrap = frodon.makeElement('div','');
        wrap.style.cssText = 'padding:10px 10px 14px';

        // Statut
        const status = frodon.makeElement('div','');
        status.style.cssText = 'font-size:.7rem;font-family:var(--mono);margin-bottom:10px;padding:6px 8px;border-radius:6px;border:1px solid';
        const refreshStatus = () => {
          const active = isActive();
          status.textContent = active ? '● Carousel actif — visible sur votre profil' : '○ Renseignez un titre et ajoutez des images pour activer';
          status.style.color = active ? 'var(--ok)' : 'var(--txt3)';
          status.style.borderColor = active ? 'rgba(0,229,122,.25)' : 'var(--bdr)';
          status.style.background = active ? 'rgba(0,229,122,.06)' : 'transparent';
        };
        refreshStatus();
        wrap.appendChild(status);

        // Titre
        const lbl = frodon.makeElement('div','');
        lbl.style.cssText = 'font-size:.62rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px';
        lbl.textContent = 'Nom du carousel *';
        wrap.appendChild(lbl);
        const titleInp = document.createElement('input');
        titleInp.className = 'f-input';
        titleInp.placeholder = 'ex: Mon portfolio, Vacances 2024…';
        titleInp.maxLength = 60;
        titleInp.value = c.title || '';
        wrap.appendChild(titleInp);

        // Toggle actif (juste un checkbox visuel, sauvé avec le bouton principal)
        const togRow = frodon.makeElement('div','');
        togRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:8px 0;border-top:1px solid var(--bdr)';
        const togLbl = frodon.makeElement('div','');
        togLbl.style.cssText = 'font-size:.72rem;color:var(--txt)';
        togLbl.textContent = 'Visible sur mon profil';
        let activeState = c.active;
        const togBtn = frodon.makeElement('button', 'plugin-action-btn' + (activeState ? ' acc' : ''), activeState ? '✔ Activé' : '○ Désactivé');
        togBtn.style.fontSize = '.65rem';
        togBtn.addEventListener('click', () => {
          activeState = !activeState;
          togBtn.textContent = activeState ? '✔ Activé' : '○ Désactivé';
          togBtn.className = 'plugin-action-btn' + (activeState ? ' acc' : '');
        });
        togRow.appendChild(togLbl);
        togRow.appendChild(togBtn);
        wrap.appendChild(togRow);
        container.appendChild(wrap);

        // Liste des images (rendu dynamique dans un conteneur dédié)
        const imgSec = frodon.makeElement('div','section-label','');
        imgSec.style.margin = '8px 10px 4px';
        container.appendChild(imgSec);
        const imgList = frodon.makeElement('div','');
        container.appendChild(imgList);

        function renderImageList() {
          imgSec.textContent = 'Images (' + editImages.length + ')';
          imgList.innerHTML = '';
          editImages.forEach((img, i) => {
            const row = frodon.makeElement('div','');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--bdr)';
            const thumb = document.createElement('img');
            thumb.src = img.url;
            thumb.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;background:var(--sur2)';
            const info = frodon.makeElement('div','');
            info.style.cssText = 'flex:1;min-width:0';
            const nm = frodon.makeElement('div','');
            nm.style.cssText = 'font-size:.68rem;font-weight:600;color:var(--txt)';
            nm.textContent = 'Image ' + (i + 1);
            const cap = frodon.makeElement('div','');
            cap.style.cssText = 'font-size:.58rem;color:var(--txt3);font-style:italic';
            cap.textContent = img.caption || '(sans légende)';
            info.appendChild(nm); info.appendChild(cap);
            const del = frodon.makeElement('button','plugin-action-btn','✕');
            del.style.cssText = 'font-size:.65rem;color:var(--warn);flex-shrink:0;padding:4px 8px';
            del.addEventListener('click', () => {
              editImages.splice(i, 1);
              renderImageList();
            });
            row.appendChild(thumb); row.appendChild(info); row.appendChild(del);
            imgList.appendChild(row);
          });
        }
        renderImageList();

        // Ajouter image
        const addSec = frodon.makeElement('div','section-label','Ajouter une image');
        addSec.style.margin = '10px 10px 6px';
        container.appendChild(addSec);

        const addForm = frodon.makeElement('div','');
        addForm.style.cssText = 'padding:0 10px 8px;display:flex;flex-direction:column;gap:8px';

        const dropZone = frodon.makeElement('div','');
        dropZone.style.cssText = 'border:2px dashed var(--bdr2);border-radius:10px;padding:16px;text-align:center;cursor:pointer;background:var(--sur2)';
        const dropLbl = frodon.makeElement('div','');
        dropLbl.style.cssText = 'font-size:.72rem;color:var(--txt2);line-height:1.6';
        dropLbl.innerHTML = '📁 <strong>Cliquez</strong> ou glissez une image<br><span style="font-size:.6rem;color:var(--txt3)">JPG, PNG, GIF, WebP · max 2 Mo</span>';
        dropZone.appendChild(dropLbl);

        const preview = frodon.makeElement('div','');
        preview.style.cssText = 'display:none;align-items:center;gap:8px';
        const preImg = document.createElement('img');
        preImg.style.cssText = 'width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0';
        const preName = frodon.makeElement('div','');
        preName.style.cssText = 'font-size:.62rem;color:var(--txt2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const preReset = frodon.makeElement('button','plugin-action-btn','✕');
        preReset.style.cssText = 'font-size:.62rem;color:var(--warn);padding:3px 7px;flex-shrink:0';
        preview.appendChild(preImg); preview.appendChild(preName); preview.appendChild(preReset);

        const fileInp = document.createElement('input');
        fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.style.display = 'none';

        function loadFile(file) {
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) { frodon.showToast('⚠ Image trop lourde (max 2 Mo)', true); return; }
          const reader = new FileReader();
          reader.onload = ev => {
            pendingDataUrl = ev.target.result;
            preImg.src = pendingDataUrl;
            preName.textContent = file.name;
            dropZone.style.display = 'none';
            preview.style.display = 'flex';
          };
          reader.readAsDataURL(file);
        }

        fileInp.addEventListener('change', () => loadFile(fileInp.files[0]));
        dropZone.addEventListener('click', () => fileInp.click());
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--acc)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--bdr2)'; });
        dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--bdr2)'; loadFile(e.dataTransfer.files[0]); });
        preReset.addEventListener('click', () => {
          pendingDataUrl = null; fileInp.value = '';
          preImg.src = ''; preName.textContent = '';
          preview.style.display = 'none';
          dropZone.style.display = '';
        });

        addForm.appendChild(fileInp);
        addForm.appendChild(dropZone);
        addForm.appendChild(preview);

        const capInp = document.createElement('input');
        capInp.type = 'text'; capInp.className = 'f-input';
        capInp.placeholder = 'Légende (optionnel)'; capInp.style.width = '100%';
        addForm.appendChild(capInp);

        const addBtn = frodon.makeElement('button','plugin-action-btn','＋ Mettre en file');
        addBtn.style.cssText = 'width:100%;font-size:.72rem';
        addBtn.addEventListener('click', () => {
          if (!pendingDataUrl) { frodon.showToast('⚠ Choisissez une image', true); return; }
          editImages.push({ url: pendingDataUrl, caption: capInp.value.trim() });
          pendingDataUrl = null; fileInp.value = ''; capInp.value = '';
          preImg.src = ''; preName.textContent = '';
          preview.style.display = 'none';
          dropZone.style.display = '';
          renderImageList();
          frodon.showToast('🖼 Image en attente — cliquez Enregistrer pour sauver');
        });
        addForm.appendChild(addBtn);
        container.appendChild(addForm);

        // Bouton Enregistrer UNIQUE
        const saveWrap = frodon.makeElement('div','');
        saveWrap.style.cssText = 'padding:10px 10px 6px;border-top:1px solid var(--bdr);margin-top:4px';
        const saveBtn = frodon.makeElement('button','plugin-action-btn acc','💾 Enregistrer tout');
        saveBtn.style.width = '100%';
        saveBtn.addEventListener('click', () => {
          const t = titleInp.value.trim();
          if (!t) { frodon.showToast('Le titre est obligatoire', true); return; }
          const c2 = getMyCarousel();
          c2.title = t;
          c2.active = activeState;
          c2.images = editImages;
          store.set('carousel', c2);
          refreshStatus();
          renderImageList();
          frodon.showToast('🖼 Carousel enregistré !');
        });
        saveWrap.appendChild(saveBtn);

        if (editImages.length) {
          const clr = frodon.makeElement('button','plugin-action-btn');
          clr.style.cssText = 'font-size:.62rem;margin-top:8px;width:100%;color:var(--warn);border-color:var(--warn)';
          clr.textContent = '🗑 Vider toutes les images';
          clr.addEventListener('click', () => {
            if (!confirm('Vider toutes les images ?')) return;
            editImages = [];
            renderImageList();
          });
          saveWrap.appendChild(clr);
        }
        container.appendChild(saveWrap);
      }
    },
    {
      id: 'received', label: '📬 Reçus',
      render(container) {
        const received = store.get('received') || [];
        if (!received.length) {
          const em = frodon.makeElement('div','no-posts','Aucun carousel reçu.\nVisitez un profil et cliquez sur "Voir le carousel".');
          em.style.cssText += ';padding:20px 16px;white-space:pre-line;text-align:center';
          container.appendChild(em);
          return;
        }
        received.forEach((item, ri) => {
          const wrap = frodon.makeElement('div','');
          wrap.style.cssText = 'border-bottom:1px solid var(--bdr);padding:10px 10px 12px';

          // En-tête
          const hdr = frodon.makeElement('div','');
          hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px';
          const nameBtn = frodon.makeElement('strong','', item.title || 'Carousel');
          nameBtn.style.cssText = 'font-size:.78rem;color:var(--acc2);cursor:pointer';
          nameBtn.addEventListener('click', () => frodon.openPeer(item.fromId));
          const sub = frodon.makeElement('span','');
          sub.style.cssText = 'font-size:.58rem;color:var(--txt3);margin-left:6px';
          sub.textContent = 'par ' + item.fromName;
          const left = frodon.makeElement('div','');
          left.appendChild(nameBtn); left.appendChild(sub);
          hdr.appendChild(left);
          hdr.appendChild(frodon.makeElement('span','mini-card-ts', frodon.formatTime(item.ts)));
          wrap.appendChild(hdr);

          // Carousel viewer
          const images = item.images || [];
          if (!images.length) { wrap.appendChild(frodon.makeElement('div','','Aucune image.')); container.appendChild(wrap); return; }

          const idxKey = 'view_idx_' + item.fromId + '_' + ri;
          let idx = store.get(idxKey) || 0;
          if (idx >= images.length) idx = 0;

          const imgWrap = frodon.makeElement('div','');
          imgWrap.style.cssText = 'position:relative;background:#000;border-radius:8px;overflow:hidden;margin-bottom:6px';
          const imgEl = document.createElement('img');
          imgEl.style.cssText = 'width:100%;max-height:200px;object-fit:contain;display:block';
          imgEl.src = images[idx]?.url || '';
          imgWrap.appendChild(imgEl);
          if (images.length > 1) {
            const ctr = frodon.makeElement('div','');
            ctr.style.cssText = 'position:absolute;bottom:5px;right:7px;background:rgba(0,0,0,.6);color:#fff;font-size:.52rem;font-family:var(--mono);padding:2px 6px;border-radius:8px';
            ctr.textContent = (idx+1)+'/'+images.length;
            imgWrap.appendChild(ctr);
          }
          wrap.appendChild(imgWrap);

          if (images[idx]?.caption) {
            const cap = frodon.makeElement('div','');
            cap.style.cssText = 'font-size:.65rem;color:var(--txt2);text-align:center;margin-bottom:6px;font-style:italic';
            cap.textContent = images[idx].caption;
            wrap.appendChild(cap);
          }

          if (images.length > 1) {
            const nav = frodon.makeElement('div','');
            nav.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px';
            const prev = frodon.makeElement('button','plugin-action-btn','◀');
            prev.style.cssText = 'width:34px;height:34px;padding:0;font-size:.8rem';
            prev.disabled = idx === 0;
            prev.addEventListener('click', () => { store.set(idxKey, Math.max(0,idx-1)); frodon.refreshSphereTab(PLUGIN_ID); });
            const dots = frodon.makeElement('div','');
            dots.style.cssText = 'display:flex;gap:4px;align-items:center';
            images.forEach((_,i) => {
              const d = frodon.makeElement('div','');
              d.style.cssText = `width:${i===idx?9:5}px;height:${i===idx?9:5}px;border-radius:50%;background:${i===idx?'var(--acc)':'var(--bdr2)'};cursor:pointer`;
              d.addEventListener('click', () => { store.set(idxKey, i); frodon.refreshSphereTab(PLUGIN_ID); });
              dots.appendChild(d);
            });
            const next = frodon.makeElement('button','plugin-action-btn','▶');
            next.style.cssText = 'width:34px;height:34px;padding:0;font-size:.8rem';
            next.disabled = idx === images.length - 1;
            next.addEventListener('click', () => { store.set(idxKey, Math.min(images.length-1,idx+1)); frodon.refreshSphereTab(PLUGIN_ID); });
            nav.appendChild(prev); nav.appendChild(dots); nav.appendChild(next);
            wrap.appendChild(nav);
          }

          container.appendChild(wrap);
        });
      }
    },
  ]);

  frodon.onPeerAppear(peer => {
    // Demander la meta des pairs qui arrivent
    frodon.sendDM(peer.peerId, PLUGIN_ID, { type: 'request_meta', _silent: true });
  });

  frodon.registerUninstallHook(PLUGIN_ID, () => {});
  return { destroy() {} };
});
