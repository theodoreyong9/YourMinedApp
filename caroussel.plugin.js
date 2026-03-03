/**
 * FRODON PLUGIN — Carousel  v1.0
 * Diffuse un carousel d'images sur ton profil.
 * Les visiteurs voient "▶ [ton nom]" sur ton profil → s'ouvre dans leur SPHERE.
 */
frodon.register({
  id: 'carousel', name: 'Carousel', version: '1.0.0',
  author: 'frodon-community',
  description: 'Diffusez un carousel d\'images sur votre profil.',
  icon: '🖼',
}, () => {

  const PLUGIN_ID = 'carousel';
  const store = frodon.storage(PLUGIN_ID);

  /* ── State ── */
  function getConfig() {
    return store.get('config') || {
      title:  'Mon Carousel',
      images: [],   // [{url, caption}]
      active: true,
    };
  }
  function saveConfig(cfg) { store.set('config', cfg); }

  // Carousel reçus des autres (clé = peerId expéditeur)
  const received = {};

  /* ── Profil : action visible sur NOTRE profil par les autres ──
     Le visiteur voit "▶ [title]" et clic → on lui envoie le carousel par DM  */
  frodon.registerPeerAction(PLUGIN_ID, '🖼 Carousel', (peerId, container) => {
    const cfg = getConfig();
    if (!cfg.active || !cfg.images.length) {
      // On n'affiche rien si pas configuré
      const info = frodon.makeElement('div','');
      info.style.cssText = 'font-size:.65rem;color:var(--txt3);padding:6px 0;text-align:center';
      info.textContent = 'Aucun carousel configuré.';
      container.appendChild(info);
      return;
    }
    /* Bouton visible sur notre profil par le visiteur.
       "Ouvrir" (pas "installer") — envoie le carousel par DM au visiteur */
    const btn = frodon.makeElement('button','plugin-action-btn acc','▶ '+cfg.title);
    btn.style.width = '100%';
    btn.addEventListener('click', () => {
      frodon.sendDM(peerId, PLUGIN_ID, {
        type:   'push',
        title:  cfg.title,
        images: cfg.images,
        from:   frodon.getMyProfile().name,
        _label: '🖼 '+cfg.title,
        _silent: false,
      });
      frodon.showToast('🖼 Carousel envoyé !');
    });
    container.appendChild(btn);
  });

  /* ── DM : réception d'un carousel poussé ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if (payload.type !== 'push') return;
    received[fromId] = {
      fromId,
      fromName: frodon.getPeer(fromId)?.name || 'Pair inconnu',
      title:    payload.title,
      images:   payload.images || [],
      idx:      0,
      ts:       Date.now(),
    };
    frodon.showToast('🖼 Carousel de '+received[fromId].fromName+' reçu !');
    frodon.refreshSphereTab(PLUGIN_ID);
    setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 400);
  });

  /* ── SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    { id:'view', label:'🖼 Voir', render(container) {
      injectCSS();
      const cfg = getConfig();
      const items = Object.values(received);

      // Mon carousel (propriétaire)
      if (cfg.active && cfg.images.length) {
        renderCarousel(container, {
          title:   cfg.title + ' (moi)',
          images:  cfg.images,
          idx:     0,
          isMine:  true,
          id:      '_mine',
        });
      }

      // Carousels reçus
      if (items.length) {
        items.sort((a,b) => b.ts - a.ts).forEach(item => {
          renderCarousel(container, item);
        });
      }

      if (!cfg.images.length && !items.length) {
        const e = frodon.makeElement('div','');
        e.style.cssText = 'text-align:center;padding:32px 20px';
        e.innerHTML = '<div style="font-size:2.5rem;margin-bottom:10px">🖼</div><div style="color:var(--txt2);font-size:.76rem;line-height:1.8">Aucun carousel.<br><small style="color:var(--txt3)">Configurez le vôtre dans l\'onglet Paramètres.</small></div>';
        container.appendChild(e);
      }
    }},
    { id:'config', label:'⚙ Paramètres', render(container) {
      injectCSS();
      renderConfig(container);
    }},
  ]);

  /* ── Rendu carousel ── */
  const liveIdx = {};   // id → current index (survit aux re-renders)

  function renderCarousel(c, item) {
    const id     = item.id || item.fromId;
    const images = item.images || [];
    if (!images.length) return;

    if (!(id in liveIdx)) liveIdx[id] = item.idx || 0;
    let idx = liveIdx[id];

    const wrap = frodon.makeElement('div','');
    wrap.style.cssText = 'border-bottom:1px solid var(--bdr);padding:12px 10px 14px;margin-bottom:2px';

    // Titre
    const ttl = frodon.makeElement('div','');
    ttl.style.cssText = 'font-size:.72rem;font-weight:700;color:var(--acc);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between';
    const tspan = frodon.makeElement('span','', item.title || 'Carousel');
    const sub   = frodon.makeElement('span','');
    sub.style.cssText = 'font-size:.58rem;font-family:var(--mono);color:var(--txt3)';
    sub.textContent = item.fromName ? 'par '+item.fromName : '';
    ttl.appendChild(tspan);
    if (item.fromName && !item.isMine) ttl.appendChild(sub);
    wrap.appendChild(ttl);

    // Image
    const imgWrap = frodon.makeElement('div','');
    imgWrap.style.cssText = 'position:relative;width:100%;background:#000;border-radius:10px;overflow:hidden;margin-bottom:8px';

    const img = document.createElement('img');
    img.style.cssText = 'width:100%;max-height:220px;object-fit:contain;display:block';
    img.src = images[idx]?.url || '';
    img.alt = images[idx]?.caption || '';
    img.onerror = () => { img.style.cssText += 'min-height:80px'; img.alt = '⚠ Image introuvable'; };
    imgWrap.appendChild(img);

    // Counter
    if (images.length > 1) {
      const ctr = frodon.makeElement('div','');
      ctr.style.cssText = 'position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.6);color:#fff;font-size:.55rem;font-family:var(--mono);padding:2px 6px;border-radius:10px';
      ctr.textContent = (idx+1)+'/'+images.length;
      imgWrap.appendChild(ctr);
    }
    wrap.appendChild(imgWrap);

    // Caption
    if (images[idx]?.caption) {
      const cap = frodon.makeElement('div','');
      cap.style.cssText = 'font-size:.68rem;color:var(--txt2);text-align:center;margin-bottom:8px;font-style:italic';
      cap.textContent = images[idx].caption;
      wrap.appendChild(cap);
    }

    // Nav
    if (images.length > 1) {
      const nav = frodon.makeElement('div','');
      nav.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px';

      const prev = frodon.makeElement('button','plugin-action-btn','◀');
      prev.style.cssText = 'width:36px;height:36px;padding:0;font-size:.85rem';
      prev.disabled = idx === 0;
      prev.addEventListener('click', () => {
        liveIdx[id] = Math.max(0, liveIdx[id] - 1);
        frodon.refreshSphereTab(PLUGIN_ID);
      });

      // Dots
      const dots = frodon.makeElement('div','');
      dots.style.cssText = 'display:flex;gap:4px;align-items:center';
      images.forEach((_, i) => {
        const d = frodon.makeElement('div','');
        d.style.cssText = `width:${i===idx?10:6}px;height:${i===idx?10:6}px;border-radius:50%;background:${i===idx?'var(--acc)':'var(--bdr2)'};transition:.2s;cursor:pointer`;
        d.addEventListener('click', () => { liveIdx[id] = i; frodon.refreshSphereTab(PLUGIN_ID); });
        dots.appendChild(d);
      });

      const next = frodon.makeElement('button','plugin-action-btn','▶');
      next.style.cssText = 'width:36px;height:36px;padding:0;font-size:.85rem';
      next.disabled = idx === images.length - 1;
      next.addEventListener('click', () => {
        liveIdx[id] = Math.min(images.length-1, liveIdx[id] + 1);
        frodon.refreshSphereTab(PLUGIN_ID);
      });

      nav.appendChild(prev); nav.appendChild(dots); nav.appendChild(next);
      wrap.appendChild(nav);
    }

    c.appendChild(wrap);
  }

  /* ── Configuration ── */
  function renderConfig(c) {
    const cfg = getConfig();

    // Nom du carousel
    const secName = frodon.makeElement('div','section-label','Nom du carousel');
    secName.style.margin = '10px 10px 6px';
    c.appendChild(secName);

    const nameRow = frodon.makeElement('div','');
    nameRow.style.cssText = 'display:flex;gap:8px;padding:0 10px 10px';
    const nameInp = document.createElement('input');
    nameInp.type  = 'text';
    nameInp.className = 'f-input';
    nameInp.placeholder = 'Mon Carousel';
    nameInp.value = cfg.title;
    nameInp.style.flex = '1';
    const saveName = frodon.makeElement('button','plugin-action-btn acc','✔ Sauver');
    saveName.style.fontSize = '.68rem';
    saveName.addEventListener('click', () => {
      const c2 = getConfig();
      c2.title = nameInp.value.trim() || 'Mon Carousel';
      saveConfig(c2);
      frodon.showToast('🖼 Nom sauvegardé !');
    });
    nameRow.appendChild(nameInp);
    nameRow.appendChild(saveName);
    c.appendChild(nameRow);

    // Toggle actif
    const togRow = frodon.makeElement('div','');
    togRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);margin-bottom:10px';
    const togLbl = frodon.makeElement('div','');
    togLbl.style.cssText = 'font-size:.72rem;color:var(--txt)';
    togLbl.textContent = 'Visible sur mon profil';
    const togBtn = frodon.makeElement('button','plugin-action-btn'+(cfg.active?' acc':''), cfg.active ? '✔ Activé' : '○ Désactivé');
    togBtn.style.fontSize = '.65rem';
    togBtn.addEventListener('click', () => {
      const c2 = getConfig();
      c2.active = !c2.active;
      saveConfig(c2);
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    togRow.appendChild(togLbl);
    togRow.appendChild(togBtn);
    c.appendChild(togRow);

    // Liste images
    const secImg = frodon.makeElement('div','section-label','Images ('+cfg.images.length+')');
    secImg.style.margin = '0 10px 6px';
    c.appendChild(secImg);

    cfg.images.forEach((img, i) => {
      const row = frodon.makeElement('div','');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--bdr)';

      const thumb = document.createElement('img');
      thumb.src  = img.url;
      thumb.style.cssText = 'width:36px;height:36px;object-fit:cover;border-radius:5px;flex-shrink:0;background:var(--sur2)';
      thumb.onerror = () => { thumb.style.background='var(--warn)'; };

      const info = frodon.makeElement('div','');
      info.style.cssText = 'flex:1;min-width:0';
      const u = frodon.makeElement('div','');
      u.style.cssText = 'font-size:.62rem;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      // base64 → juste afficher le type et numéro
      const isB64 = img.url.startsWith('data:');
      u.textContent = isB64 ? 'Image '+(i+1) : img.url;
      const cap = frodon.makeElement('div','');
      cap.style.cssText = 'font-size:.58rem;color:var(--txt3);font-style:italic';
      cap.textContent = img.caption || '(sans légende)';
      info.appendChild(u); info.appendChild(cap);

      const del = frodon.makeElement('button','plugin-action-btn','✕');
      del.style.cssText = 'font-size:.65rem;color:var(--warn);flex-shrink:0;padding:4px 8px';
      del.addEventListener('click', () => {
        const c2 = getConfig();
        c2.images.splice(i, 1);
        saveConfig(c2);
        frodon.refreshSphereTab(PLUGIN_ID);
      });

      row.appendChild(thumb); row.appendChild(info); row.appendChild(del);
      c.appendChild(row);
    });

    // Ajouter une image (upload fichier → base64)
    const addSec = frodon.makeElement('div','section-label','Ajouter une image');
    addSec.style.margin = '10px 10px 6px';
    c.appendChild(addSec);

    const addForm = frodon.makeElement('div','');
    addForm.style.cssText = 'padding:0 10px 12px;display:flex;flex-direction:column;gap:8px';

    // Zone de drop / bouton upload
    const dropZone = frodon.makeElement('div','');
    dropZone.style.cssText = 'border:2px dashed var(--bdr2);border-radius:10px;padding:18px;text-align:center;cursor:pointer;transition:.2s;background:var(--sur2)';
    const dropLbl = frodon.makeElement('div','');
    dropLbl.style.cssText = 'font-size:.72rem;color:var(--txt2);line-height:1.6';
    dropLbl.innerHTML = '📁 <strong>Cliquez</strong> pour choisir une image<br><span style="font-size:.6rem;color:var(--txt3)">JPG, PNG, GIF, WebP · max 2 Mo</span>';
    dropZone.appendChild(dropLbl);

    // Prévisualisation
    const preview = frodon.makeElement('div','');
    preview.style.cssText = 'display:none;align-items:center;gap:8px';
    const preImg = document.createElement('img');
    preImg.style.cssText = 'width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0';
    const preName = frodon.makeElement('div','');
    preName.style.cssText = 'font-size:.62rem;color:var(--txt2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const preReset = frodon.makeElement('button','plugin-action-btn','✕');
    preReset.style.cssText = 'font-size:.62rem;color:var(--warn);padding:3px 7px;flex-shrink:0';
    preview.appendChild(preImg); preview.appendChild(preName); preview.appendChild(preReset);

    // Input file caché
    const fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/*';
    fileInp.style.display = 'none';
    let pendingDataUrl = null;

    function loadFile(file) {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { frodon.showToast('⚠ Image trop lourde (max 2 Mo)'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingDataUrl = ev.target.result;
        preImg.src = pendingDataUrl;
        preName.textContent = file.name;
        dropZone.style.display = 'none';
        preview.style.display  = 'flex';
      };
      reader.readAsDataURL(file);
    }

    fileInp.addEventListener('change', () => loadFile(fileInp.files[0]));
    dropZone.addEventListener('click', () => fileInp.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor='var(--acc)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor='var(--bdr2)'; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--bdr2)';
      loadFile(e.dataTransfer.files[0]);
    });

    preReset.addEventListener('click', () => {
      pendingDataUrl = null; fileInp.value = '';
      preImg.src = ''; preName.textContent = '';
      preview.style.display  = 'none';
      dropZone.style.display = '';
    });

    addForm.appendChild(fileInp);
    addForm.appendChild(dropZone);
    addForm.appendChild(preview);

    const capInp = document.createElement('input');
    capInp.type = 'text';
    capInp.className = 'f-input';
    capInp.placeholder = 'Légende (optionnel)';
    capInp.style.width = '100%';
    addForm.appendChild(capInp);

    const addBtn = frodon.makeElement('button','plugin-action-btn acc','＋ Ajouter au carousel');
    addBtn.style.cssText = 'width:100%;font-size:.72rem';
    addBtn.addEventListener('click', () => {
      if (!pendingDataUrl) { frodon.showToast('⚠ Choisissez une image'); return; }
      const c2 = getConfig();
      c2.images.push({ url: pendingDataUrl, caption: capInp.value.trim() });
      saveConfig(c2);
      // reset
      pendingDataUrl = null; fileInp.value = ''; capInp.value = '';
      preImg.src = ''; preName.textContent = '';
      preview.style.display  = 'none';
      dropZone.style.display = '';
      frodon.showToast('🖼 Image ajoutée !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    addForm.appendChild(addBtn);
    c.appendChild(addForm);

    // Effacer tout
    if (cfg.images.length) {
      const clr = frodon.makeElement('button','plugin-action-btn');
      clr.style.cssText = 'font-size:.62rem;margin:0 10px;width:calc(100% - 20px);color:var(--warn);border-color:var(--warn)';
      clr.textContent = '🗑 Vider le carousel';
      clr.addEventListener('click', () => {
        if (!confirm('Vider le carousel ?')) return;
        const c2 = getConfig();
        c2.images = [];
        saveConfig(c2);
        frodon.refreshSphereTab(PLUGIN_ID);
      });
      c.appendChild(clr);
    }
  }

  let _css = false;
  function injectCSS() {
    if (_css) return; _css = true;
    // styles déjà fournis par frodon
  }

  frodon.registerUninstallHook(PLUGIN_ID, () => {});

  return { destroy() {} };
});
