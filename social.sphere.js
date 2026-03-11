/* @sphere
 * @icon 📡
 * @cat Social
 * @desc Near • Contact • Feed — Découvrez vos voisins, gérez vos contacts, suivez leur contenu
 * @author theodoreyong9
 * @web https://yourmine.app
 */

// ════════════════════════════════════════════════════════
//  social.sphere.js — Near / Contact / Feed
//  Réseaux extractibles sans backend :
//  Mastodon (instance), Bluesky (AT Proto), Pixelfed,
//  Twitter/X (PKCE token), Nostr (relais public)
// ════════════════════════════════════════════════════════

function init(container) {

const NEAR_RADIUS_M   = 100;
const GOSSIP_TTL_MS   = 15 * 60 * 1000;
const CYCLE_MS        = 5000;

let activeTab     = 'near';
let nearFilter    = '';
let contactSearch = '';
let contactFilter = '';
let feedFilter    = 'all';
let myPos         = null;
let cycleTimer    = null;
let nearDiscoveries = {};

// ── GEO ───────────────────────────────────────────────────
function requestGeo() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(pos => {
    myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    announceSelf();
  }, null, { enableHighAccuracy: true, maximumAge: 5000 });
}

function haversine(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// ── P2P ANNOUNCE ──────────────────────────────────────────
function announceSelf() {
  const YM = window._YM;
  if (!YM?.profile || !myPos) return;
  YM.p2p?.sendProfile?.({ ...YM.profile, _geo: myPos });
}

// ── NEAR CACHE ────────────────────────────────────────────
function getNearProfiles() {
  const raw = sessionStorage.getItem('ym_near_cache') || '{}';
  const cache = JSON.parse(raw);
  const now = Date.now();
  const valid = {};
  Object.entries(cache).forEach(([uuid, p]) => {
    if (now - p._ts < GOSSIP_TTL_MS) valid[uuid] = p;
  });
  return valid;
}

function filterNear() {
  const profiles = Object.values(getNearProfiles());
  const YM = window._YM;
  const selfUUID = YM?.profile?.uuid;

  return profiles
    .filter(p => p.uuid !== selfUUID)
    .filter(p => {
      if (!myPos || !p._geo) return true; // show if no geo data
      return haversine(myPos, p._geo) <= NEAR_RADIUS_M;
    })
    .filter(p => {
      if (!nearFilter) return true;
      return p.spheres?.repo?.includes(nearFilter) || p.spheres?.creator?.some(s => s.name?.includes(nearFilter));
    });
}

// ── CONTACTS ──────────────────────────────────────────────
function getContacts() {
  const YM = window._YM;
  return (YM?.contacts || JSON.parse(localStorage.getItem('ym_contacts') || '[]'));
}

function addContact(uuid, name, photo) {
  const YM = window._YM;
  const contacts = getContacts();
  if (contacts.find(c => c.uuid === uuid)) return;
  contacts.push({ uuid, name: name || uuid.slice(0,8), photo: photo || null, added: Date.now() });
  YM.contacts = contacts;
  localStorage.setItem('ym_contacts', JSON.stringify(contacts));
  renderContent();
}

function removeContact(uuid) {
  const YM = window._YM;
  YM.contacts = getContacts().filter(c => c.uuid !== uuid);
  localStorage.setItem('ym_contacts', JSON.stringify(YM.contacts));
  renderContent();
}

function filterContacts() {
  return getContacts().filter(c => {
    if (contactSearch) {
      const q = contactSearch.toLowerCase();
      if (!c.name?.toLowerCase().includes(q) && !c.uuid.includes(q)) return false;
    }
    return true;
  });
}

// ── SOCIAL FEED — APIs extractibles sans backend ──────────
// Chaque réseau expose une API publique ou supporte PKCE.
// Le profil contient : socialNet, socialHandle, socialInstance (Mastodon/Pixelfed), socialToken (X/Nostr)

async function fetchFeed(profile) {
  const net      = (profile.socialNet || '').toLowerCase();
  const handle   = profile.socialHandle || '';
  const instance = profile.socialInstance || '';  // ex: mastodon.social
  const token    = profile.socialToken || '';

  if (!net || !handle) return [];

  try {
    // ── MASTODON (API publique, pas de token requis pour posts publics) ──
    if (net === 'mastodon') {
      const host = instance || 'mastodon.social';
      // Résoudre l'acct → id
      const lookup = await fetch(`https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`);
      if (!lookup.ok) return _placeholder(profile);
      const acct = await lookup.json();
      const r = await fetch(`https://${host}/api/v1/accounts/${acct.id}/statuses?limit=10&exclude_reblogs=true`);
      if (!r.ok) return _placeholder(profile);
      const statuses = await r.json();
      return statuses.map(s => ({
        id: s.id, ts: new Date(s.created_at).getTime(),
        text: s.content.replace(/<[^>]+>/g,'').slice(0,280),
        url: s.url, net: 'mastodon'
      }));
    }

    // ── BLUESKY (AT Protocol, API publique pour comptes publics) ──
    if (net === 'bluesky') {
      const actor = handle.includes('.') ? handle : `${handle}.bsky.social`;
      const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=10`);
      if (!r.ok) return _placeholder(profile);
      const data = await r.json();
      return (data.feed || []).map(item => ({
        id: item.post.uri, ts: new Date(item.post.record.createdAt).getTime(),
        text: item.post.record.text?.slice(0,280) || '',
        url: `https://bsky.app/profile/${actor}/post/${item.post.uri.split('/').pop()}`,
        net: 'bluesky'
      }));
    }

    // ── PIXELFED (API publique compatible Mastodon) ──
    if (net === 'pixelfed') {
      const host = instance || 'pixelfed.social';
      const lookup = await fetch(`https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`);
      if (!lookup.ok) return _placeholder(profile);
      const acct = await lookup.json();
      const r = await fetch(`https://${host}/api/v1/accounts/${acct.id}/statuses?limit=10`);
      if (!r.ok) return _placeholder(profile);
      const statuses = await r.json();
      return statuses.map(s => ({
        id: s.id, ts: new Date(s.created_at).getTime(),
        text: s.content.replace(/<[^>]+>/g,'').slice(0,280),
        url: s.url, net: 'pixelfed',
        media: s.media_attachments?.[0]?.url
      }));
    }

    // ── TWITTER/X (nécessite token Bearer PKCE — l'utilisateur fournit son token) ──
    if (net === 'twitter' || net === 'x') {
      if (!token) return _placeholder(profile, 'Token Bearer requis pour X/Twitter');
      const r = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=id`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) return _placeholder(profile);
      const user = await r.json();
      const tweets = await fetch(`https://api.twitter.com/2/users/${user.data.id}/tweets?max_results=10&tweet.fields=created_at,text`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!tweets.ok) return _placeholder(profile);
      const data = await tweets.json();
      return (data.data || []).map(t => ({
        id: t.id, ts: new Date(t.created_at).getTime(),
        text: t.text?.slice(0,280),
        url: `https://x.com/${handle}/status/${t.id}`, net: 'x'
      }));
    }

    // ── NOSTR (relais public WebSocket, NIP-01) ──
    if (net === 'nostr') {
      // handle = npub ou hex pubkey
      return await new Promise(resolve => {
        try {
          const ws = new WebSocket('wss://relay.damus.io');
          const posts = [];
          const timeout = setTimeout(() => { ws.close(); resolve(posts); }, 5000);
          ws.onopen = () => {
            ws.send(JSON.stringify(['REQ','ym-feed',{ authors:[handle], kinds:[1], limit:10 }]));
          };
          ws.onmessage = e => {
            const msg = JSON.parse(e.data);
            if (msg[0]==='EVENT' && msg[2]?.kind===1) {
              posts.push({ id:msg[2].id, ts:msg[2].created_at*1000, text:msg[2].content?.slice(0,280), url:`https://snort.social/e/${msg[2].id}`, net:'nostr' });
            }
            if (msg[0]==='EOSE') { clearTimeout(timeout); ws.close(); resolve(posts); }
          };
          ws.onerror = () => { clearTimeout(timeout); resolve(posts); };
        } catch { resolve([]); }
      });
    }

  } catch(e) { console.warn('[social feed]', net, e.message); }
  return _placeholder(profile);
}

function _placeholder(profile, note = '') {
  const net = profile.socialNet || '?';
  const handle = profile.socialHandle || '';
  return [{
    id: profile.uuid + '-ph',
    ts: Date.now(),
    text: note || `Contenu de @${handle} sur ${net} (chargement impossible depuis ce navigateur)`,
    url: `https://${net}.com/${handle}`,
    net
  }];
}

// ── VOICE CALL ─────────────────────────────────────────────
let activeCall = null;

async function startCall(contactUUID) {
  const YM = window._YM;
  // Check mutual contact
  const cache = getNearProfiles();
  const contactData = Object.values(cache).find(p => p.uuid === contactUUID);
  const myContacts = getContacts().map(c => c.uuid);
  const theirContacts = contactData?._contacts || [];
  const isMutual = theirContacts.includes(YM?.profile?.uuid) && myContacts.includes(contactUUID);

  if (!isMutual) {
    showNotice('Appel vocal disponible uniquement avec contacts réciproques', 'warn');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeCall = { uuid: contactUUID, stream };
    showNotice('Appel en cours…', 'info');
  } catch(e) {
    showNotice('Microphone requis pour les appels', 'warn');
  }
}

// ── QR SCANNER ─────────────────────────────────────────────
function scanQR(callback) {
  const modal = document.createElement('div');
  modal.className = 'ym-modal-backdrop open';
  modal.innerHTML = `
    <div class="ym-modal" style="text-align:center">
      <div class="ym-modal-header"><span class="ym-modal-title">Scanner QR</span><button class="ym-btn ym-btn-ghost" id="qr-close">✕</button></div>
      <video id="qr-video" style="width:100%;border-radius:12px;max-height:250px" autoplay playsinline></video>
      <div id="qr-status" style="margin-top:8px;color:var(--text3);font-size:11px">Pointez vers un QR code YourMine</div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#qr-close').onclick = () => { stream?.getTracks().forEach(t=>t.stop()); modal.remove(); };

  let stream;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
    stream = s;
    const video = modal.querySelector('#qr-video');
    video.srcObject = s;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scan = () => {
      if (!modal.isConnected) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR?.(img.data, img.width, img.height);
        if (code?.data) {
          stream.getTracks().forEach(t=>t.stop());
          modal.remove();
          callback(code.data);
          return;
        }
      }
      requestAnimationFrame(scan);
    };
    scan();
  }).catch(() => { modal.querySelector('#qr-status').textContent = 'Caméra non disponible'; });
}

// ── RENDER ─────────────────────────────────────────────────
function renderContent() {
  container.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">

    <!-- Tabs -->
    <div class="ym-tabs">
      ${['near','contacts','feed'].map(t => `<button class="ym-tab${activeTab===t?' active':''}" data-tab="${t}">${{near:'◎ Near',contacts:'✦ Contacts',feed:'⊞ Feed'}[t]}</button>`).join('')}
    </div>

    <!-- Content -->
    <div id="social-content"></div>
  </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => { activeTab = btn.dataset.tab; renderContent(); };
  });

  if (activeTab === 'near') renderNear();
  else if (activeTab === 'contacts') renderContacts();
  else renderFeed();
}

function renderNear() {
  const area = container.querySelector('#social-content');
  const nearProfiles = filterNear();

  area.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="ym-radar" style="width:60px;height:60px;flex-shrink:0">
          <div class="ym-radar-ring"></div>
          <div class="ym-radar-ring"></div>
          <div class="ym-radar-ring"></div>
          <div class="ym-radar-sweep"></div>
        </div>
        <div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:700">${nearProfiles.length} Near</div>
          <div style="font-size:10px;color:var(--text3)">Rayon ${NEAR_RADIUS_M}m ${myPos ? '· Géo active' : '· Géo non activée'}</div>
        </div>
      </div>
      ${!myPos ? `<button class="ym-btn ym-btn-accent" id="near-geo-btn">Activer géo</button>` : ''}
    </div>

    <div class="ym-search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="ym-input" id="near-filter" placeholder="Filtrer par sphere…" value="${nearFilter}"/>
    </div>

    <div id="near-list" style="display:flex;flex-direction:column;gap:6px">
      ${nearProfiles.length ? nearProfiles.map(p => renderContactRow(p, 'near')).join('') : `<div style="color:var(--text3);text-align:center;padding:20px;font-size:11px">Aucun utilisateur proche détecté</div>`}
    </div>
  </div>`;

  area.querySelector('#near-geo-btn')?.addEventListener('click', requestGeo);
  area.querySelector('#near-filter')?.addEventListener('input', e => { nearFilter = e.target.value; renderNear(); });
  wireContactRowEvents(area, 'near');
}

function renderContacts() {
  const area = container.querySelector('#social-content');
  const contacts = filterContacts();

  area.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">
    <div class="ym-search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="ym-input" id="contact-search" placeholder="Rechercher…" value="${contactSearch}"/>
    </div>

    <!-- Add contact -->
    <div style="display:flex;gap:6px">
      <input class="ym-input" id="contact-add-input" placeholder="UUID ou URL profil" style="flex:1"/>
      <button class="ym-btn" id="contact-add-btn">+</button>
      <button class="ym-btn ym-btn-ghost" id="contact-scan-btn" data-tip="Scanner QR">⊡</button>
    </div>

    <div id="contact-list" style="display:flex;flex-direction:column;gap:6px">
      ${contacts.length ? contacts.map(c => renderContactRow(c, 'contact')).join('') : `<div style="color:var(--text3);text-align:center;padding:20px;font-size:11px">Aucun contact. Ajoutez des proches ou scannez leur QR.</div>`}
    </div>
  </div>`;

  area.querySelector('#contact-search')?.addEventListener('input', e => { contactSearch = e.target.value; renderContacts(); });
  area.querySelector('#contact-add-btn')?.addEventListener('click', () => {
    const val = area.querySelector('#contact-add-input')?.value?.trim();
    if (!val) return;
    const uuid = val.includes('/u/') ? val.split('/u/')[1].split('?')[0] : val;
    addContact(uuid);
  });
  area.querySelector('#contact-scan-btn')?.addEventListener('click', () => {
    scanQR(data => {
      const uuid = data.includes('/u/') ? data.split('/u/')[1].split('?')[0] : data;
      addContact(uuid);
    });
  });
  wireContactRowEvents(area, 'contact');
}

function renderContactRow(p, type) {
  const name = p.name || p.uuid?.slice(0,8) || 'Inconnu';
  const avatarContent = p.photo ? `<img src="${p.photo}" alt="" style="width:100%;height:100%;object-fit:cover"/>` : name[0].toUpperCase();
  const dist = (myPos && p._geo) ? Math.round(haversine(myPos, p._geo)) + 'm' : '';
  return `<div class="ym-contact-row" data-uuid="${p.uuid || ''}" data-type="${type}">
    <div class="ym-avatar">${avatarContent}</div>
    <div class="ym-contact-info">
      <div class="ym-contact-name">${name}</div>
      <div class="ym-contact-sub">${dist ? `${dist} · ` : ''}${p.socialNet && p.socialHandle ? `@${p.socialHandle}` : p.uuid?.slice(0,12) + '…'}</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      ${type === 'near' ? `<button class="ym-btn ym-btn-ghost contact-action-add" data-uuid="${p.uuid}" style="font-size:10px;padding:5px 8px">+ Contact</button>` : ''}
      <button class="ym-call-btn contact-action-call" data-uuid="${p.uuid}" title="Appel vocal">☎</button>
      ${type === 'contact' ? `<button class="ym-btn ym-btn-ghost contact-action-remove" data-uuid="${p.uuid}" style="font-size:10px;color:var(--danger);border-color:transparent">✕</button>` : ''}
    </div>
  </div>`;
}

function wireContactRowEvents(area, type) {
  area.querySelectorAll('.contact-action-add').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); const uuid = btn.dataset.uuid; const cache = getNearProfiles(); const p = Object.values(cache).find(x => x.uuid === uuid); addContact(uuid, p?.name, p?.photo); };
  });
  area.querySelectorAll('.contact-action-call').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); startCall(btn.dataset.uuid); };
  });
  area.querySelectorAll('.contact-action-remove').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); removeContact(btn.dataset.uuid); };
  });
  area.querySelectorAll('.ym-contact-row').forEach(row => {
    row.onclick = () => openProfileModal(row.dataset.uuid);
  });
}

async function renderFeed() {
  const area = container.querySelector('#social-content');
  area.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:10px">
    <div class="ym-tabs">
      ${['all','near','contacts'].map(f=>`<button class="ym-tab${feedFilter===f?' active':''}" data-feed="${f}">${{all:'Tout',near:'Near',contacts:'Contacts'}[f]}</button>`).join('')}
    </div>
    <div id="feed-list" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;align-items:center;color:var(--text3);padding:20px;justify-content:center"><div class="ym-loading"></div><span>Chargement…</span></div>
    </div>
  </div>`;

  area.querySelectorAll('[data-feed]').forEach(btn => {
    btn.onclick = () => { feedFilter = btn.dataset.feed; renderFeed(); };
  });

  const feedList = area.querySelector('#feed-list');
  const sources = feedFilter === 'near' ? Object.values(getNearProfiles())
    : feedFilter === 'contacts' ? getContacts().map(c => ({ ...c, ...(Object.values(getNearProfiles()).find(p => p.uuid === c.uuid) || {}) }))
    : [...Object.values(getNearProfiles()), ...getContacts()];

  const items = [];
  for (const p of sources.slice(0, 10)) {
    try { const posts = await fetchFeed(p); items.push(...posts.map(post => ({...post, _profile: p}))); } catch {}
  }

  if (!items.length) {
    feedList.innerHTML = `<div style="color:var(--text3);text-align:center;padding:20px;font-size:11px">Aucun contenu. Vos contacts doivent renseigner leur réseau social.</div>`;
    return;
  }

  items.sort((a,b) => b.ts - a.ts);
  feedList.innerHTML = items.map(item => `
  <div class="ym-feed-card">
    <div class="ym-feed-card-body">
      <div class="ym-feed-card-meta">
        <div class="ym-avatar" style="width:28px;height:28px;font-size:11px">${item._profile?.name?.[0]?.toUpperCase() || '?'}</div>
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:12px;font-weight:600">${item._profile?.name || 'Inconnu'}</div>
          <div style="font-size:9px;color:var(--text3)">${new Date(item.ts).toLocaleTimeString()}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2)">${item.text}</div>
      <div style="display:flex;gap:8px">
        <a href="${item.url}" target="_blank" rel="noopener" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:4px 10px">Source externe ↗</a>
        <button class="ym-btn ym-btn-ghost" data-uuid="${item._profile?.uuid}" style="font-size:10px;padding:4px 10px" onclick="document.dispatchEvent(new CustomEvent('ym:openProfile',{detail:'${item._profile?.uuid}'}))">Profil</button>
      </div>
    </div>
  </div>`).join('');
}

function openProfileModal(uuid) {
  const cache = getNearProfiles();
  const contacts = getContacts();
  const p = Object.values(cache).find(x => x.uuid === uuid) || contacts.find(c => c.uuid === uuid);
  if (!p) return;

  const modal = document.createElement('div');
  modal.className = 'ym-modal-backdrop open';
  modal.innerHTML = `
  <div class="ym-modal">
    <div class="ym-modal-header">
      <span class="ym-modal-title">${p.name || uuid.slice(0,8)}</span>
      <button class="ym-btn ym-btn-ghost" id="modal-close">✕</button>
    </div>
    <div class="ym-profile-hero">
      <div class="ym-profile-avatar">${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover"/>` : (p.name?.[0]?.toUpperCase()||'?')}</div>
      <div class="ym-profile-name">${p.name || '—'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
        ${p.socialHandle ? `<span class="ym-chip">@${p.socialHandle}</span>` : ''}
        ${p.website ? `<a href="${p.website}" target="_blank" class="ym-chip blue">↗ site</a>` : ''}
      </div>
    </div>
    <div class="ym-stat-row"><span class="ym-stat-label">UUID</span><span style="font-size:10px;color:var(--text3);word-break:break-all">${uuid}</span></div>
    ${p._geo && myPos ? `<div class="ym-stat-row"><span class="ym-stat-label">Distance</span><span class="ym-stat-value">${Math.round(haversine(myPos, p._geo))}m</span></div>` : ''}
    <div class="ym-divider"></div>
    <div style="display:flex;gap:8px">
      <button class="ym-btn ym-btn-accent" id="modal-add-contact" style="flex:1">+ Contact</button>
      <button class="ym-call-btn" id="modal-call" style="width:40px">☎</button>
    </div>
  </div>`;

  document.body.appendChild(modal);
  modal.querySelector('#modal-close').onclick = () => modal.remove();
  modal.querySelector('#modal-add-contact').onclick = () => { addContact(uuid, p.name, p.photo); modal.remove(); };
  modal.querySelector('#modal-call').onclick = () => { startCall(uuid); modal.remove(); };
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function showNotice(msg, type = 'info') {
  const n = document.createElement('div');
  n.className = `ym-notice ${type}`;
  n.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9998;white-space:nowrap;';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// ── CYCLE ────────────────────────────────────────────────
function startCycle() {
  clearInterval(cycleTimer);
  cycleTimer = setInterval(() => {
    announceSelf();
    if (activeTab === 'near') renderNear();
    else if (activeTab === 'contacts') renderContacts();
  }, CYCLE_MS);
}

// ── INIT ─────────────────────────────────────────────────
requestGeo();
renderContent();
startCycle();
announceSelf();

// Cleanup
container._cleanup = () => clearInterval(cycleTimer);

} // end init
