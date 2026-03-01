/**
 * FRODON PLUGIN — Cherche un emploi  v1.1.0
 */
frodon.register({
  id: 'jobseeker',
  name: 'Cherche un emploi',
  version: '1.1.0',
  author: 'frodon-community',
  description: 'Affichez que vous cherchez un emploi et recevez des opportunités.',
  icon: '💼',
}, () => {

  const PLUGIN_ID = 'jobseeker';
  const store = frodon.storage(PLUGIN_ID);

  function getMyBadge() { return store.get('badge') || null; }
  function isActive() { const b = getMyBadge(); return b && b.active; }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {

    if(payload.type === 'request_badge') {
      // Protocol: peer is asking for my badge — reply silently
      const badge = getMyBadge();
      if(badge && badge.active) {
        frodon.sendDM(fromId, PLUGIN_ID, { type: 'badge_data', badge, _silent: true });
      }
      return;
    }

    if(payload.type === 'badge_data') {
      // Protocol: receiving peer's badge — store and refresh their modal, no feed event
      store.set('peer_badge_' + fromId, payload.badge);
      frodon.refreshPeerModal(fromId);
      return;
    }

    if(payload.type === 'opportunity') {
      // Real interaction — appears in feed
      const peer = frodon.getPeer(fromId);
      const opps = store.get('opportunities') || [];
      opps.unshift({
        fromId, fromName: peer?.name || '?',
        message: (payload.message || '').substring(0, 500),
        ts: Date.now(),
      });
      if(opps.length > 50) opps.length = 50;
      store.set('opportunities', opps);
      frodon.showToast('💼 Opportunité de ' + (peer?.name || '?') + ' !');
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '💼 Emploi', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;
    const peerBadge = store.get('peer_badge_' + peerId) || null;

    if(!peerBadge) {
      frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_badge', _silent: true });
      const loading = frodon.makeElement('div', '');
      loading.style.cssText = 'font-size:.68rem;color:var(--txt2);padding:4px 0 8px';
      loading.textContent = 'Vérification du badge…';
      container.appendChild(loading);
      return;
    }

    const badge_card = frodon.makeElement('div', '');
    badge_card.style.cssText = 'background:linear-gradient(135deg,rgba(124,77,255,.1),rgba(0,245,200,.07));border:1px solid rgba(124,77,255,.3);border-radius:10px;padding:12px;margin-bottom:10px';
    const badge_title = frodon.makeElement('div', '');
    badge_title.style.cssText = 'font-size:.65rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px';
    badge_title.textContent = '💼 EN RECHERCHE D\'EMPLOI';
    badge_card.appendChild(badge_title);
    const job_title = frodon.makeElement('div', '');
    job_title.style.cssText = 'font-size:.9rem;font-weight:700;color:var(--txt);margin-bottom:4px';
    job_title.textContent = peerBadge.jobTitle || 'Poste non précisé';
    badge_card.appendChild(job_title);
    if(peerBadge.skills) {
      const skills = frodon.makeElement('div', '');
      skills.style.cssText = 'font-size:.66rem;color:var(--txt2);margin-bottom:4px';
      skills.textContent = '🛠 ' + peerBadge.skills;
      badge_card.appendChild(skills);
    }
    if(peerBadge.location) {
      const loc = frodon.makeElement('div', '');
      loc.style.cssText = 'font-size:.66rem;color:var(--txt2)';
      loc.textContent = '📍 ' + peerBadge.location;
      badge_card.appendChild(loc);
    }
    container.appendChild(badge_card);

    const ta = document.createElement('textarea');
    ta.className = 'f-input'; ta.rows = 3; ta.maxLength = 500;
    ta.placeholder = 'Décrivez une opportunité ou partagez un contact…';
    ta.style.marginBottom = '8px';
    container.appendChild(ta);

    const sendBtn = frodon.makeElement('button', 'plugin-action-btn acc', '💼 Envoyer une opportunité');
    sendBtn.addEventListener('click', () => {
      const msg = ta.value.trim();
      if(!msg) { frodon.showToast('Écrivez un message', true); return; }
      frodon.sendDM(peerId, PLUGIN_ID, { type: 'opportunity', message: msg, _label: '💼 Opportunité reçue' });
      frodon.showToast('💼 Opportunité envoyée à ' + peerName + ' !');
      // Add feed event on SENDER's side showing who they contacted + their badge
      frodon.addFeedEvent(peerId, {
        pluginName: 'Cherche un emploi', pluginIcon: '💼',
        peerName,
        text: '→ ' + (peerBadge?.jobTitle || 'Opportunité envoyée') + (peerBadge?.skills ? ' · ' + peerBadge.skills : ''),
      });
      sendBtn.textContent = '✓ Envoyé !'; sendBtn.disabled = true;
      ta.disabled = true;
    });
    container.appendChild(sendBtn);
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const badge = getMyBadge();
    if(!badge || !badge.active) return;
    const card = frodon.makeElement('div', '');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(124,77,255,.12),rgba(0,245,200,.08));border:1px solid rgba(124,77,255,.35);border-radius:10px;padding:10px 12px;margin-top:6px';
    const title = frodon.makeElement('div', '');
    title.style.cssText = 'font-size:.62rem;color:var(--acc2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px';
    title.textContent = '💼 EN RECHERCHE D\'EMPLOI';
    card.appendChild(title);
    const job = frodon.makeElement('div', '');
    job.style.cssText = 'font-size:.85rem;font-weight:700;color:var(--txt)';
    job.textContent = badge.jobTitle || '';
    card.appendChild(job);
    container.appendChild(card);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'my_badge', label: '💼 Mon badge',
      settings: true, // ← Config tab: shown in ⚙, NOT in SPHERE live panel
      render(container) {
        const badge = getMyBadge();
        const isOn = badge && badge.active;

        const toggle_row = frodon.makeElement('div', '');
        toggle_row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 10px 8px';
        const toggle_lbl = frodon.makeElement('div', '');
        toggle_lbl.style.cssText = 'font-size:.78rem;font-weight:700';
        toggle_lbl.textContent = isOn ? '● Badge actif' : '○ Badge inactif';
        toggle_lbl.style.color = isOn ? 'var(--ok)' : 'var(--txt2)';
        const toggle_btn = frodon.makeElement('button', isOn ? 'plugin-action-btn' : 'plugin-action-btn acc', isOn ? 'Désactiver' : 'Activer');
        toggle_btn.style.cssText += ';font-size:.65rem;padding:4px 10px';
        toggle_btn.addEventListener('click', () => {
          const b = getMyBadge() || {};
          b.active = !b.active;
          store.set('badge', b);
          frodon.showToast(b.active ? '💼 Badge activé !' : 'Badge désactivé');
          frodon.refreshSphereTab(PLUGIN_ID); // also closes the ⚙ panel
          frodon.refreshProfileModal();
        });
        toggle_row.appendChild(toggle_lbl); toggle_row.appendChild(toggle_btn);
        container.appendChild(toggle_row);

        const form = frodon.makeElement('div', '');
        form.style.cssText = 'padding:0 8px 10px';
        const fields = [
          { key: 'jobTitle',  label: 'Poste recherché *', placeholder: 'ex: Développeur Front-end…', required: true },
          { key: 'skills',    label: 'Compétences clés',   placeholder: 'ex: React, Figma, Python…' },
          { key: 'location',  label: 'Localisation souhaitée', placeholder: 'ex: Paris, Remote…' },
          { key: 'contact',   label: 'Contact / lien CV',  placeholder: 'email ou URL' },
        ];
        const inputs = {};
        fields.forEach(f => {
          const lbl = frodon.makeElement('div', '');
          lbl.style.cssText = 'font-size:.62rem;color:var(--txt2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;margin-top:10px';
          lbl.textContent = f.label;
          form.appendChild(lbl);
          const inp = document.createElement('input');
          inp.className = 'f-input'; inp.placeholder = f.placeholder; inp.maxLength = 100;
          inp.value = badge?.[f.key] || '';
          inputs[f.key] = inp;
          form.appendChild(inp);
        });
        const saveBtn = frodon.makeElement('button', 'plugin-action-btn acc', '💾 Enregistrer');
        saveBtn.style.cssText += ';width:100%;margin-top:12px';
        saveBtn.addEventListener('click', () => {
          const jobTitle = inputs.jobTitle.value.trim();
          if(!jobTitle) { frodon.showToast('Le poste est obligatoire', true); return; }
          const b = {
            active   : getMyBadge()?.active ?? false,
            jobTitle,
            skills   : inputs.skills.value.trim(),
            location : inputs.location.value.trim(),
            contact  : inputs.contact.value.trim(),
          };
          store.set('badge', b);
          frodon.showToast('💼 Badge mis à jour !');
          frodon.refreshSphereTab(PLUGIN_ID); // closes the ⚙ panel
          frodon.refreshProfileModal();
        });
        form.appendChild(saveBtn);
        container.appendChild(form);
      }
    },
    {
      id: 'opportunities', label: '📬 Opportunités',
      // No settings:true → shown as live panel in SPHERE tab
      render(container) {
        const opps = store.get('opportunities') || [];
        if(!opps.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Aucune opportunité reçue.');
          em.style.padding = '24px 16px';
          container.appendChild(em);
          return;
        }
        opps.slice(0, 20).forEach(o => {
          const card = frodon.makeElement('div', 'mini-card');
          card.style.margin = '6px 8px 0';
          const hdr = frodon.makeElement('div', '');
          hdr.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:5px';
          const name = frodon.makeElement('strong', '', o.fromName);
          name.style.cssText = 'font-size:.74rem;color:var(--acc2);cursor:pointer';
          name.addEventListener('click', () => frodon.openPeer(o.fromId));
          hdr.appendChild(name);
          hdr.appendChild(frodon.makeElement('span', 'mini-card-ts', frodon.formatTime(o.ts)));
          card.appendChild(hdr);
          card.appendChild(frodon.makeElement('div', 'mini-card-body', o.message));
          container.appendChild(card);
        });
      }
    },
  ]);

  // Broadcast badge silently on peer appear
  frodon.onPeerAppear(peer => {
    const badge = getMyBadge();
    if(badge && badge.active) {
      frodon.sendDM(peer.peerId, PLUGIN_ID, { type: 'badge_data', badge, _silent: true });
    }
  });

  return { destroy() {} };
});
