/**
 * FRODON PLUGIN — Message rapide  v1.1.0
 */
frodon.register({
  id: 'quickmsg',
  name: 'Message rapide',
  version: '1.1.0',
  author: 'frodon-community',
  description: 'Envoyez des réactions et messages courts en un tap.',
  icon: '⚡',
}, () => {

  const PLUGIN_ID = 'quickmsg';
  const store = frodon.storage(PLUGIN_ID);

  const REACTIONS = [
    { emoji: '👋', label: 'Salut !'      },
    { emoji: '🔥', label: 'Hot !'        },
    { emoji: '❤️', label: 'J\'aime'      },
    { emoji: '🎉', label: 'Bravo !'      },
    { emoji: '😂', label: 'MDR'          },
    { emoji: '🤔', label: 'Hmm…'         },
    { emoji: '👏', label: 'Chapeau !'    },
    { emoji: '⚡', label: 'Go !'         },
    { emoji: '🙏', label: 'Merci !'      },
    { emoji: '👀', label: 'Je regarde'   },
    { emoji: '🤝', label: 'Pareil'       },
    { emoji: '💡', label: 'Bonne idée !' },
  ];

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type !== 'react') return;
    const peer = frodon.getPeer(fromId);
    const name = peer?.name || '?';

    const inbox = store.get('inbox') || [];
    inbox.unshift({ fromId, fromName: name, emoji: payload.emoji, label: payload.label, ts: Date.now() });
    if(inbox.length > 100) inbox.length = 100;
    store.set('inbox', inbox);

    const counts = store.get('counts') || {};
    counts[payload.emoji] = (counts[payload.emoji] || 0) + 1;
    store.set('counts', counts);

    frodon.showToast(payload.emoji + ' ' + name + ' : ' + (payload.label || payload.emoji));
    // refreshSphereTab will re-render the panel + update feed badge
    frodon.refreshSphereTab(PLUGIN_ID);
  });

  /* ── Fiche d'un pair ── */
  frodon.registerPeerAction(PLUGIN_ID, '⚡ Message rapide', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name || peerId;

    const grid = frodon.makeElement('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px';

    REACTIONS.forEach(({ emoji, label }) => {
      const btn = frodon.makeElement('button', 'plugin-action-btn');
      btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;font-size:1.3rem;line-height:1';
      btn.innerHTML = emoji;
      const lbl = frodon.makeElement('span', '', label);
      lbl.style.cssText = 'font-size:.52rem;color:var(--txt2);font-weight:400;line-height:1.2';
      btn.appendChild(lbl);
      btn.addEventListener('click', () => {
        // _label makes this appear in recipient's feed
        frodon.sendDM(peerId, PLUGIN_ID, { type: 'react', emoji, label, _label: emoji + ' ' + label });
        frodon.showToast(emoji + ' envoyé à ' + peerName + ' !');
        btn.style.transform = 'scale(1.25)';
        btn.style.borderColor = 'var(--acc)';
        setTimeout(() => { btn.style.transform = ''; btn.style.borderColor = ''; }, 350);
      });
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  });

  /* ── Widget profil ── */
  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const counts = store.get('counts') || {};
    const total = Object.values(counts).reduce((a,b) => a+b, 0);
    if(!total) return;
    const lbl = frodon.makeElement('div', 'section-label', '⚡ Réactions reçues — ' + total);
    container.appendChild(lbl);
    const row = frodon.makeElement('div', '');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:4px 0';
    Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8).forEach(([emoji, count]) => {
      const chip = frodon.makeElement('div', '');
      chip.style.cssText = 'font-size:.78rem;padding:2px 8px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:12px';
      chip.textContent = emoji + ' ' + count;
      row.appendChild(chip);
    });
    container.appendChild(row);
  });

  /* ── Panneau SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id: 'inbox', label: '⚡ Reçus',
      render(container) {
        const inbox = store.get('inbox') || [];
        if(!inbox.length) {
          const em = frodon.makeElement('div', 'no-posts', 'Aucune réaction reçue pour l\'instant.');
          em.style.padding = '24px 16px';
          container.appendChild(em);
          return;
        }
        inbox.slice(0, 40).forEach(e => {
          const row = frodon.makeElement('div', '');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid var(--bdr)';
          const ico = frodon.makeElement('span', '');
          ico.style.cssText = 'font-size:1.4rem;flex-shrink:0';
          ico.textContent = e.emoji;
          const inf = frodon.makeElement('div', '');
          inf.style.cssText = 'flex:1;min-width:0';
          const name = frodon.makeElement('div', '');
          name.style.cssText = 'font-size:.74rem;font-weight:700;color:var(--txt)';
          name.textContent = e.fromName;
          const lbl = frodon.makeElement('div', '');
          lbl.style.cssText = 'font-size:.64rem;color:var(--txt2)';
          lbl.textContent = e.label || e.emoji;
          inf.appendChild(name); inf.appendChild(lbl);
          row.appendChild(ico); row.appendChild(inf);
          row.appendChild(frodon.makeElement('span', 'mini-card-ts', frodon.formatTime(e.ts)));
          container.appendChild(row);
        });
      }
    },
    {
      id: 'stats', label: '📊 Stats',
      render(container) {
        const counts = store.get('counts') || {};
        const total = Object.values(counts).reduce((a,b) => a+b, 0);
        if(!total) {
          container.appendChild(frodon.makeElement('div', 'no-posts', 'Aucune réaction encore.'));
          return;
        }
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
        const wrap = frodon.makeElement('div', '');
        wrap.style.cssText = 'padding:10px 8px';
        sorted.forEach(([emoji, count]) => {
          const reaction = REACTIONS.find(r => r.emoji === emoji);
          const pct = Math.round(count / total * 100);
          const row = frodon.makeElement('div', '');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
          const em = frodon.makeElement('span', '');
          em.style.cssText = 'font-size:1.1rem;width:24px;text-align:center;flex-shrink:0';
          em.textContent = emoji;
          const bar_wrap = frodon.makeElement('div', '');
          bar_wrap.style.cssText = 'flex:1;min-width:0';
          const bar_bg = frodon.makeElement('div', '');
          bar_bg.style.cssText = 'height:6px;background:var(--sur2);border-radius:4px;overflow:hidden';
          const bar_fill = frodon.makeElement('div', '');
          bar_fill.style.cssText = 'height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--acc2),var(--acc));border-radius:4px';
          bar_bg.appendChild(bar_fill);
          const bar_lbl = frodon.makeElement('div', '');
          bar_lbl.style.cssText = 'font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-top:2px';
          bar_lbl.textContent = (reaction?.label || '') + '  ' + count + 'x';
          bar_wrap.appendChild(bar_bg); bar_wrap.appendChild(bar_lbl);
          row.appendChild(em); row.appendChild(bar_wrap);
          wrap.appendChild(row);
        });
        container.appendChild(wrap);
      }
    },
  ]);

  return { destroy() {} };
});
