/**
 * FRODON PLUGIN — Liste de liens  v1.0.0
 * Partagez une liste de liens nommés (portfolio, réseaux, projets…).
 * Visible dans la fiche des pairs qui vous croisent.
 * Configurez vos propres liens dans SPHERE → Mes liens.
 */
frodon.register({
  id: 'linklist',
  name: 'Mes liens',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Partagez une liste de liens nommés avec vos pairs.',
  icon: '🔗',
}, () => {

  const PLUGIN_ID = 'linklist';
  const store = frodon.storage(PLUGIN_ID);

  function getMyLinks() {
    return store.get('links') || [];
  }

  function renderLinkList(links, container, editable) {
    links.forEach((link, i) => {
      const row = frodon.makeElement('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)';

      const icon = frodon.makeElement('span', '');
      icon.style.cssText = 'font-size:1rem;flex-shrink:0';
      icon.textContent = link.icon || '🔗';

      const inf = frodon.makeElement('div', '');
      inf.style.cssText = 'flex:1;min-width:0;overflow:hidden';
      const name = frodon.makeElement('div', '');
      name.style.cssText = 'font-size:.76rem;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      name.textContent = link.name;
      const url = frodon.makeElement('div', '');
      url.style.cssText = 'font-size:.6rem;color:var(--txt2);font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      url.textContent = link.url;
      inf.appendChild(name); inf.appendChild(url);

      const open = frodon.makeElement('a', '');
      open.href = link.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.style.cssText = 'font-size:.65rem;color:var(--acc);text-decoration:none;flex-shrink:0;padding:3px 8px;border:1px solid rgba(0,245,200,.25);border-radius:6px';
      open.textContent = '↗';

      row.appendChild(icon); row.appendChild(inf); row.appendChild(open);

      if(editable) {
        const del = frodon.makeElement('button', '');
        del.style.cssText = 'color:var(--warn);background:none;border:none;cursor:pointer;font-size:.85rem;padding:3px;flex-shrink:0';
        del.textContent = '✕';
        del.title = 'Supprimer';
        del.addEventListener('click', () => {
          const links2 = getMyLinks();
          links2.splice(i, 1);
          store.set('links', links2);
          frodon.refreshSphereTab(PLUGIN_ID);
        });
        row.appendChild(del);
      }
      container.appendChild(row);
    });
  }

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '🔗 Liens', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const raw = peer?.pluginUrls?.[PLUGIN_ID] || null;
    // Links are broadcast via profile storage — we read from peer's shared data
    // Since peers broadcast their plugin list but not data, we use DM to request
    const peerLinks = store.get('peer_' + peerId) || null;

    if(!peerLinks) {
      const loading = frodon.makeElement('div', '');
      loading.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:8px 0 4px';
      loading.textContent = 'Chargement des liens…';
      container.appendChild(loading);
      // Request links via DM
      frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_links' });
      return;
    }

    if(!peerLinks.length) {
      container.appendChild(frodon.makeElement('div', 'no-posts', 'Aucun lien partagé.'));
      return;
    }
    renderLinkList(peerLinks, container, false);
  });

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type === 'request_links') {
      // Someone wants our links — send them
      frodon.sendDM(fromId, PLUGIN_ID, {
        type : 'share_links',
        links: getMyLinks(),
      });
    }
    if(payload.type === 'share_links') {
      // Store peer's links
      store.set('peer_' + fromId, payload.links || []);
      frodon.refreshPeerModal(fromId);
    }
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const links = getMyLinks();
    const lbl = frodon.makeElement('div', 'section-label', '🔗 Mes liens — ' + links.length + ' lien' + (links.length !== 1 ? 's' : ''));
    container.appendChild(lbl);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'mylinks',
      label: '🔗 Mes liens',
      render(container) {
        const links = getMyLinks();
        const header = frodon.makeElement('div', '');
        header.style.cssText = 'padding:8px 8px 4px;display:flex;justify-content:space-between;align-items:center';
        const title = frodon.makeElement('div', 'section-label', 'Mes liens partagés');
        title.style.margin = '0';

        const addBtn = frodon.makeElement('button', 'plugin-action-btn acc', '+ Ajouter');
        addBtn.style.cssText += ';font-size:.65rem;padding:5px 10px';
        addBtn.addEventListener('click', () => {
          // Toggle add form
          const existing = container.querySelector('#ll-add-form');
          if(existing) { existing.remove(); return; }

          const form = frodon.makeElement('div', '');
          form.id = 'll-add-form';
          form.style.cssText = 'padding:10px 8px;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);margin-bottom:4px';

          const iconRow = frodon.makeElement('div', '');
          iconRow.style.cssText = 'display:flex;gap:6px;margin-bottom:7px';
          const iconIn = document.createElement('input');
          iconIn.className = 'f-input'; iconIn.placeholder = '🔗'; iconIn.maxLength = 2;
          iconIn.style.cssText = 'width:48px;text-align:center;flex-shrink:0';
          const nameIn = document.createElement('input');
          nameIn.className = 'f-input'; nameIn.placeholder = 'Nom (ex: Portfolio)'; nameIn.maxLength = 40;
          nameIn.style.flex = '1';
          iconRow.appendChild(iconIn); iconRow.appendChild(nameIn);
          form.appendChild(iconRow);

          const urlIn = document.createElement('input');
          urlIn.className = 'f-input'; urlIn.type = 'url'; urlIn.placeholder = 'https://…';
          urlIn.style.marginBottom = '8px';
          form.appendChild(urlIn);

          const saveBtn = frodon.makeElement('button', 'plugin-action-btn acc', '💾 Enregistrer');
          saveBtn.style.width = '100%';
          saveBtn.addEventListener('click', () => {
            const name2 = nameIn.value.trim();
            const url2 = urlIn.value.trim();
            if(!name2 || !url2) { frodon.showToast('Nom et URL requis', true); return; }
            if(!/^https?:\/\//i.test(url2)) { frodon.showToast('URL invalide (https requis)', true); return; }
            const links2 = getMyLinks();
            if(links2.length >= 20) { frodon.showToast('Maximum 20 liens', true); return; }
            links2.push({ icon: iconIn.value.trim() || '🔗', name: name2, url: url2 });
            store.set('links', links2);
            frodon.showToast('🔗 Lien ajouté !');
            frodon.refreshSphereTab(PLUGIN_ID);
          });
          form.appendChild(saveBtn);

          header.insertAdjacentElement('afterend', form);
        });
        header.appendChild(title); header.appendChild(addBtn);
        container.appendChild(header);

        if(!links.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Aucun lien. Cliquez + Ajouter pour commencer.');
          em.style.padding = '20px 16px';
          container.appendChild(em);
          return;
        }
        const list = frodon.makeElement('div', '');
        list.style.padding = '0 8px';
        renderLinkList(links, list, true);
        container.appendChild(list);
      }
    },
  ]);

  // Auto-respond to link requests on peer appear
  frodon.onPeerAppear(peer => {
    // Proactively share links if we have any
    const links = getMyLinks();
    if(links.length > 0) {
      frodon.sendDM(peer.peerId, PLUGIN_ID, { type: 'share_links', links });
    }
  });

  return { destroy() {} };
});
