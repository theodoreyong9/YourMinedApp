// social.sphere.js — YourMine Social Sphere
// Category: YourMine | Author: theodoreyong9
(function(){
'use strict';

window.YM_S = window.YM_S || {};
window.YM_S['social.sphere.js'] = {
  name: 'Social',
  category: 'YourMine',
  author: 'theodoreyong9',
  description: 'Near discovery, contacts, profile feed',

  async activate(ctx) {
    this._ctx = ctx;
    loadSocialState(ctx);
    ctx.addPill('👥 Social', body => renderSocialUI(body, ctx));
    ctx.addProfileTab('Social', el => renderSocialProfile(el, ctx));
    ctx.p2p.onReceive((data, peerId) => onPeerData(data, peerId, ctx));
    startGeo();
    this._gossipTimer = setInterval(cleanGossips, 60000);
  },

  deactivate() {
    clearInterval(this._gossipTimer);
    if (this._geoWatch) navigator.geolocation.clearWatch(this._geoWatch);
  },

  getBroadcastData() {
    const p = SS.myProfile;
    if (!p.uuid) return null;
    return {
      type: 'profile',
      uuid: p.uuid,
      displayName: p.displayName || 'Anonymous',
      bio: p.bio || '',
      activeSpheres: p.activeSpheres || [],
      coords: SS.myCoords ? {
        lat: SS.myCoords.latitude + (Math.random() - 0.5) * 0.0001,
        lon: SS.myCoords.longitude + (Math.random() - 0.5) * 0.0001
      } : null
    };
  }
};

// ── STATE ─────────────────────────────────────────────────
const SS = {
  myProfile: {},
  myCoords: null,
  near: {},       // uuid → { profile, lastSeen, distance }
  contacts: [],   // [{ uuid, displayName, bio, … }]
  gossips: {},    // uuid → { profile, seenAt }
  feed: [],
};

function loadSocialState(ctx) {
  try {
    const d = JSON.parse(localStorage.getItem('ym_social') || '{}');
    SS.myProfile = d.myProfile || {};
    SS.contacts = d.contacts || [];
    if (!SS.myProfile.uuid) SS.myProfile.uuid = ctx.getProfile().uuid;
  } catch {}
}

function saveState() {
  try { localStorage.setItem('ym_social', JSON.stringify({ myProfile: SS.myProfile, contacts: SS.contacts })); } catch {}
}

// ── GEO ───────────────────────────────────────────────────
function startGeo() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => { SS.myCoords = p.coords; }, () => {});
  window.YM_S['social.sphere.js']._geoWatch = navigator.geolocation.watchPosition(p => { SS.myCoords = p.coords; }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function distanceTo(coords) {
  if (!SS.myCoords || !coords) return Infinity;
  return haversine(SS.myCoords.latitude, SS.myCoords.longitude, coords.lat, coords.lon);
}

function isNearby(coords) { return distanceTo(coords) <= 100; }

function cleanGossips() {
  const now = Date.now();
  for (const [uuid, g] of Object.entries(SS.gossips)) {
    if (now - g.seenAt > 15 * 60 * 1000) delete SS.gossips[uuid];
  }
}

// ── P2P ───────────────────────────────────────────────────
function onPeerData(data, peerId, ctx) {
  if (!data?.uuid || data.type !== 'profile') return;
  const { uuid } = data;
  const near = isNearby(data.coords);
  const isContact = SS.contacts.find(c => c.uuid === uuid);

  if (near) {
    SS.near[uuid] = { profile: data, lastSeen: Date.now(), distance: Math.round(distanceTo(data.coords)) };
  }
  // Gossip: seen by peers, not by us directly, not already known
  if (!near && !isContact && !SS.near[uuid] && !SS.gossips[uuid]) {
    SS.gossips[uuid] = { profile: data, seenAt: Date.now() };
  }
  if (data.content) {
    SS.feed.unshift({ uuid, content: data.content, displayName: data.displayName, ts: Date.now(), near });
    if (SS.feed.length > 200) SS.feed.pop();
  }
  refreshLiveLists();
}

function refreshLiveLists() {
  if (document.getElementById('soc-near-list')) renderNearList();
  if (document.getElementById('soc-feed-list')) renderFeedList();
}

// ── CSS ───────────────────────────────────────────────────
const CSS = `<style>
.s-tab{padding:10px 14px;background:none;border:none;border-bottom:2px solid transparent;color:rgba(232,232,240,.4);font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;white-space:nowrap;flex-shrink:0}
.s-tab.on{color:#c8f0a0;border-bottom-color:#c8f0a0}
.s-panel{display:none}.s-panel.on{display:block}
.s-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(200,240,160,.2);border-radius:8px;padding:9px 12px;color:#e8e8f0;font-family:'Space Mono',monospace;font-size:.8rem;outline:none;margin-bottom:8px;box-sizing:border-box}
.s-input:focus{border-color:rgba(200,240,160,.5)}
.s-input::placeholder{color:rgba(232,232,240,.3)}
.s-btn{padding:9px 16px;border-radius:8px;border:none;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;transition:all .2s}
.s-btn-p{background:#c8f0a0;color:#111113}
.s-btn-s{background:rgba(200,240,160,.08);border:1px solid rgba(200,240,160,.25);color:#e8e8f0}
.s-person{display:flex;gap:10px;align-items:center;padding:11px 12px;border:1px solid rgba(200,240,160,.12);border-radius:10px;margin-bottom:7px;cursor:pointer;transition:all .2s;background:rgba(17,17,19,.6)}
.s-person:hover{border-color:rgba(200,240,160,.3);background:rgba(200,240,160,.04)}
.s-avatar{width:38px;height:38px;border-radius:50%;background:rgba(200,240,160,.12);border:1px solid rgba(200,240,160,.25);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;overflow:hidden}
.s-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}
.s-pname{font-weight:700;font-size:.9rem;color:#e8e8f0;font-family:'Barlow Condensed',sans-serif}
.s-pmeta{font-size:.74rem;color:rgba(232,232,240,.4);margin-top:1px;font-family:'Barlow Condensed',sans-serif}
.s-badge{font-family:'Space Mono',monospace;font-size:.62rem;padding:2px 7px;border-radius:8px;border:1px solid rgba(200,240,160,.3);color:#c8f0a0;white-space:nowrap;flex-shrink:0}
.s-card{background:rgba(200,240,160,.04);border:1px solid rgba(200,240,160,.15);border-radius:12px;padding:14px;margin-bottom:10px}
.s-label{font-family:'Space Mono',monospace;font-size:.67rem;color:rgba(200,240,160,.5);letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px}
.s-feed-item{padding:12px;border:1px solid rgba(200,240,160,.1);border-radius:10px;margin-bottom:8px;background:rgba(17,17,19,.6)}
.s-feed-who{font-family:'Space Mono',monospace;font-size:.67rem;color:rgba(200,240,160,.6);margin-bottom:4px}
.s-feed-text{font-size:.85rem;color:#e8e8f0;line-height:1.5;font-family:'Barlow Condensed',sans-serif}
.s-empty{text-align:center;padding:32px 16px;color:rgba(232,232,240,.3);font-family:'Space Mono',monospace;font-size:.76rem;line-height:2}
.s-chip{padding:3px 10px;border-radius:12px;border:1px solid rgba(200,240,160,.2);background:none;color:rgba(200,240,160,.6);font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;cursor:pointer;letter-spacing:.04em;text-transform:uppercase;transition:all .2s}
.s-chip.on{border-color:rgba(200,240,160,.5);color:#c8f0a0;background:rgba(200,240,160,.08)}
.s-photo{width:72px;height:72px;border-radius:50%;background:rgba(200,240,160,.1);border:2px solid rgba(200,240,160,.3);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 12px;overflow:hidden;cursor:pointer}
.s-photo img{width:100%;height:100%;object-fit:cover;border-radius:50%}
</style>`;

// ── MAIN UI ───────────────────────────────────────────────
function renderSocialUI(body, ctx) {
  body.innerHTML = CSS + `
  <div style="padding:12px 16px">
    <div style="display:flex;border-bottom:1px solid rgba(200,240,160,.12);margin-bottom:12px;overflow-x:auto;scrollbar-width:none">
      <button class="s-tab on" onclick="sTab('near',this)">Near</button>
      <button class="s-tab" onclick="sTab('contacts',this)">Contacts</button>
      <button class="s-tab" onclick="sTab('feed',this)">Feed</button>
    </div>
    <div class="s-panel on" id="sp-near"><div id="soc-near-list"></div></div>
    <div class="s-panel" id="sp-contacts"><div id="soc-contacts-list"></div></div>
    <div class="s-panel" id="sp-feed"><div id="soc-feed-list"></div></div>
  </div>`;
  renderNearList();
  renderContactsList(ctx);
  renderFeedList();
}

function sTab(id, el) {
  document.querySelectorAll('.s-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.s-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('sp-' + id)?.classList.add('on');
}

// ── NEAR ──────────────────────────────────────────────────
function renderNearList() {
  const el = document.getElementById('soc-near-list');
  if (!el) return;
  const now = Date.now();
  const list = Object.values(SS.near).filter(n => now - n.lastSeen < 120000);
  const gossipList = Object.values(SS.gossips).filter(g => now - g.seenAt < 15*60000);

  let html = `<div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
    ${!SS.myCoords ? `<span style="font-family:'Space Mono',monospace;font-size:.72rem;color:rgba(255,200,100,.7)">⚠ Location disabled — enable to discover nearby peers</span>` : `<span style="font-family:'Space Mono',monospace;font-size:.72rem;color:rgba(200,240,160,.5)">📍 Scanning 100m radius</span>`}
  </div>`;

  if (list.length) {
    html += `<div class="s-label">Nearby (${list.length})</div>`;
    html += list.map(n => personCard(n.profile, `${n.distance}m`, true, () => openProfile(n.profile))).join('');
  } else {
    html += `<div class="s-empty">No one nearby yet.<br>P2P peers appear here<br>within 100m.</div>`;
  }

  if (gossipList.length) {
    html += `<div class="s-label" style="margin-top:14px">Gossips · seen by peers (${gossipList.length})</div>`;
    html += gossipList.map(g => personCard(g.profile, 'via peer', false, () => openProfile(g.profile))).join('');
  }
  el.innerHTML = html;
}

// ── CONTACTS ──────────────────────────────────────────────
function renderContactsList(ctx) {
  const el = document.getElementById('soc-contacts-list');
  if (!el) return;
  el.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:6px">
      <button class="s-btn s-btn-s" style="flex:1;font-size:.78rem" onclick="addContactDialog()">+ Add Contact</button>
    </div>
    ${SS.contacts.length
      ? SS.contacts.map(c => personCard(c, '', false, () => openProfile(c))).join('')
      : '<div class="s-empty">No contacts yet.<br>Add by UUID, URL or QR code.</div>'
    }`;
}

async function addContactDialog() {
  const uuid = prompt('Enter contact UUID or address:');
  if (!uuid) return;
  const existing = SS.contacts.find(c => c.uuid === uuid);
  if (existing) { YM?.toast?.('Already in contacts'); return; }
  const nearProfile = SS.near[uuid]?.profile || SS.gossips[uuid]?.profile;
  if (nearProfile) {
    SS.contacts.push(nearProfile);
    saveState();
    YM?.toast?.(`${nearProfile.displayName || 'Contact'} added`);
  } else {
    SS.contacts.push({ uuid, displayName: uuid.slice(0,8) + '…', bio: 'Manual add' });
    saveState();
    YM?.toast?.('Contact added');
  }
  renderContactsList(window.YM_S['social.sphere.js']._ctx);
}

window.addContactDialog = addContactDialog;

// ── FEED ──────────────────────────────────────────────────
function renderFeedList() {
  const el = document.getElementById('soc-feed-list');
  if (!el) return;
  if (!SS.feed.length) {
    el.innerHTML = '<div class="s-empty">Feed is empty.<br>Content from Near and<br>Contacts will appear here.</div>';
    return;
  }
  el.innerHTML = SS.feed.slice(0,50).map(item => `
    <div class="s-feed-item">
      <div class="s-feed-who">
        ${item.displayName || item.uuid?.slice(0,12) || '?'}
        ${item.near ? '<span class="s-badge" style="margin-left:6px">Near</span>' : ''}
        <span style="float:right;opacity:.4">${timeAgo(item.ts)}</span>
      </div>
      <div class="s-feed-text">${escHtml(item.content || '')}</div>
    </div>
  `).join('');
}

// ── PERSON CARD ───────────────────────────────────────────
function personCard(p, badge, showDist, onClick) {
  const initials = (p.displayName || '?').charAt(0).toUpperCase();
  const photoHtml = p.photo
    ? `<img src="${p.photo}" alt="">`
    : initials;
  const id = 'pc-' + (p.uuid || Math.random()).toString().replace(/\W/g,'');
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el && onClick) el.onclick = onClick;
  }, 0);
  return `<div class="s-person" id="${id}">
    <div class="s-avatar">${photoHtml}</div>
    <div style="flex:1;min-width:0">
      <div class="s-pname">${escHtml(p.displayName || 'Anonymous')}</div>
      <div class="s-pmeta">${escHtml(p.bio || '')}${p.activeSpheres?.length ? ' · '+p.activeSpheres.join(', ') : ''}</div>
    </div>
    ${badge ? `<span class="s-badge">${badge}</span>` : ''}
  </div>`;
}

// ── PROFILE DETAIL ────────────────────────────────────────
function openProfile(p) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;background:var(--bg,#111113);z-index:500;overflow-y:auto;padding:20px';
  d.innerHTML = CSS + `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:rgba(232,232,240,.5);font-size:1.4rem;cursor:pointer;line-height:1">×</button>
      <span style="font-family:'Space Mono',monospace;font-size:.8rem;color:#c8f0a0;letter-spacing:.08em;text-transform:uppercase">Profile</span>
    </div>
    <div style="text-align:center;margin-bottom:20px">
      <div class="s-photo" style="margin:0 auto 12px">${p.photo ? `<img src="${p.photo}">` : (p.displayName||'?').charAt(0).toUpperCase()}</div>
      <div style="font-size:1.3rem;font-weight:800;color:#e8e8f0">${escHtml(p.displayName||'Anonymous')}</div>
      <div style="font-size:.82rem;color:rgba(232,232,240,.5);margin-top:4px">${escHtml(p.bio||'')}</div>
    </div>
    <div class="s-card">
      <div class="s-label">UUID</div>
      <div style="font-family:'Space Mono',monospace;font-size:.68rem;color:#c8f0a0;word-break:break-all">${p.uuid||'?'}</div>
    </div>
    ${p.website ? `<div class="s-card"><div class="s-label">Website</div><div style="color:#c8f0a0;font-size:.85rem"><a href="${p.website}" target="_blank" style="color:inherit">${p.website}</a></div></div>` : ''}
    ${p.activeSpheres?.length ? `<div class="s-card"><div class="s-label">Active Spheres</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${p.activeSpheres.map(s=>`<span class="s-badge">${s}</span>`).join('')}</div></div>` : ''}
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="s-btn s-btn-p" style="flex:1" onclick="sAddContact('${p.uuid}')">+ Add Contact</button>
    </div>`;
  document.body.appendChild(d);
}

window.sAddContact = function(uuid) {
  if (SS.contacts.find(c => c.uuid === uuid)) { YM?.toast?.('Already a contact'); return; }
  const p = SS.near[uuid]?.profile || SS.gossips[uuid]?.profile || { uuid };
  SS.contacts.push(p); saveState();
  YM?.toast?.('Contact added ✓');
};

// ── PROFILE TAB (in Profile overlay) ─────────────────────
function renderSocialProfile(el, ctx) {
  const p = SS.myProfile;
  el.innerHTML = CSS + `<div style="padding:16px">
    <div style="text-align:center;margin-bottom:16px">
      <div class="s-photo" id="s-photo-btn" onclick="sPickPhoto()">
        ${p.photo ? `<img src="${p.photo}" id="s-photo-img">` : `<span id="s-photo-init">${(p.displayName||'Y').charAt(0)}</span>`}
      </div>
    </div>
    <div class="s-label">Display Name</div>
    <input class="s-input" id="sp-name" value="${escAttr(p.displayName||'')}" placeholder="Your name">
    <div class="s-label">Short Bio</div>
    <input class="s-input" id="sp-bio" value="${escAttr(p.bio||'')}" placeholder="A few words about you…">
    <div class="s-label">Website</div>
    <input class="s-input" id="sp-web" value="${escAttr(p.website||'')}" placeholder="https://…">

    <div class="s-label" style="margin-top:8px">Social Networks (PKCE/public)</div>
    ${['twitter','mastodon','github','youtube','lens'].map(net => `
      <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
        <span style="font-family:'Space Mono',monospace;font-size:.72rem;color:rgba(200,240,160,.6);min-width:70px;text-transform:uppercase">${net}</span>
        <input class="s-input" style="margin:0;flex:1" id="sp-net-${net}" value="${escAttr(p.networks?.[net]||'')}" placeholder="@handle or URL">
      </div>`).join('')}

    <div class="s-label" style="margin-top:12px">UUID</div>
    <div style="font-family:'Space Mono',monospace;font-size:.68rem;color:#c8f0a0;word-break:break-all;margin-bottom:12px">${p.uuid||'…'}</div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:16px">
      <div id="s-qr-me" style="background:#fff;padding:8px;border-radius:8px;display:inline-block"></div>
    </div>

    <button class="s-btn s-btn-p" style="width:100%" onclick="sSaveProfile()">Save Profile</button>
    <div id="s-prof-msg"></div>
    <input type="file" id="s-photo-input" accept="image/*" style="display:none" onchange="sHandlePhoto(this)">
  </div>`;

  // Generate QR
  if (p.uuid) {
    const qrData = JSON.stringify({ uuid: p.uuid, displayName: p.displayName, type: 'ym-profile' });
    const qrEl = document.getElementById('s-qr-me');
    if (window.QRCode && qrEl) {
      new QRCode(qrEl, { text: qrData, width: 120, height: 120, colorDark: '#111113', colorLight: '#c8f0a0' });
    } else if (qrEl) {
      qrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}&bgcolor=111113&color=c8f0a0" style="border-radius:4px">`;
    }
  }
}

window.sPickPhoto = function() { document.getElementById('s-photo-input')?.click(); };
window.sHandlePhoto = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Compress
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 128;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = h*MAX/w; w = MAX; } } else { if (h > MAX) { w = w*MAX/h; h = MAX; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      SS.myProfile.photo = canvas.toDataURL('image/jpeg', 0.7);
      saveState();
      const btn = document.getElementById('s-photo-btn');
      if (btn) btn.innerHTML = `<img src="${SS.myProfile.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.sSaveProfile = function() {
  SS.myProfile.displayName = document.getElementById('sp-name')?.value.trim();
  SS.myProfile.bio = document.getElementById('sp-bio')?.value.trim();
  SS.myProfile.website = document.getElementById('sp-web')?.value.trim();
  SS.myProfile.networks = {};
  ['twitter','mastodon','github','youtube','lens'].forEach(net => {
    const v = document.getElementById(`sp-net-${net}`)?.value.trim();
    if (v) SS.myProfile.networks[net] = v;
  });
  saveState();
  window.YM_S['social.sphere.js']._ctx?.saveProfile?.({ socialProfile: SS.myProfile });
  const msg = document.getElementById('s-prof-msg');
  if (msg) { msg.innerHTML = `<div style="color:#c8f0a0;font-family:'Space Mono',monospace;font-size:.75rem;margin-top:8px;text-align:center">Saved ✓</div>`; setTimeout(() => { msg.innerHTML=''; }, 2000); }
  YM?.toast?.('Profile saved');
};

// ── UTILS ─────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }
function timeAgo(ts) {
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}

window.sTab = function(id, el) {
  document.querySelectorAll('.s-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.s-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('sp-' + id)?.classList.add('on');
};

})();
