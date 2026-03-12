// ════════════════════════════════════════════════════════
//  profile.app.js — YourMine Profile
//  @icon 👤
//  @desc Identité, réseaux sociaux, sauvegarde Gist
//  @author YourMine
//  @cat core
// ════════════════════════════════════════════════════════

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

const SOCIAL_NETWORKS = [
  { id: 'mastodon',   name: 'Mastodon',      needsInstance: true,  base: 'https://{instance}/@',          type: 'api' },
  { id: 'pixelfed',   name: 'Pixelfed',      needsInstance: true,  base: 'https://{instance}/@',          type: 'api' },
  { id: 'misskey',    name: 'Misskey',       needsInstance: true,  base: 'https://{instance}/@',          type: 'api' },
  { id: 'peertube',   name: 'PeerTube',      needsInstance: true,  base: 'https://{instance}/a/',         type: 'api' },
  { id: 'lemmy',      name: 'Lemmy',         needsInstance: true,  base: 'https://{instance}/u/',         type: 'api' },
  { id: 'threads',    name: 'Threads',       needsInstance: false, base: 'https://www.threads.net/@',     type: 'api' },
  { id: 'bluesky',    name: 'Bluesky',       needsInstance: false, base: 'https://bsky.app/profile/',     type: 'api' },
  { id: 'nostr',      name: 'Nostr',         needsInstance: false, base: 'https://snort.social/p/',       type: 'ws'  },
  { id: 'farcaster',  name: 'Farcaster',     needsInstance: false, base: 'https://warpcast.com/',         type: 'api' },
  { id: 'paragraph',  name: 'Paragraph',     needsInstance: false, base: 'https://paragraph.xyz/@',       type: 'rss', rssUrl: 'https://paragraph.xyz/@{handle}/feed' },
  { id: 'substack',   name: 'Substack',      needsInstance: false, base: 'https://{handle}.substack.com', type: 'rss', rssUrl: 'https://{handle}.substack.com/feed' },
  { id: 'medium',     name: 'Medium',        needsInstance: false, base: 'https://medium.com/@',          type: 'rss', rssUrl: 'https://medium.com/feed/@{handle}' },
  { id: 'ghost',      name: 'Ghost',         needsInstance: true,  base: 'https://{instance}/',           type: 'rss', rssUrl: 'https://{instance}/rss/' },
  { id: 'beehiiv',    name: 'Beehiiv',       needsInstance: false, base: 'https://{handle}.beehiiv.com',  type: 'rss', rssUrl: 'https://{handle}.beehiiv.com/feed' },
  { id: 'wordpress',  name: 'WordPress',     needsInstance: true,  base: 'https://{instance}/',           type: 'rss', rssUrl: 'https://{instance}/feed/' },
  { id: 'youtube',    name: 'YouTube',       needsInstance: false, base: 'https://youtube.com/@',         type: 'rss', rssUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id={handle}' },
  { id: 'reddit',     name: 'Reddit',        needsInstance: false, base: 'https://reddit.com/user/',      type: 'rss', rssUrl: 'https://www.reddit.com/user/{handle}.rss' },
  { id: 'github',     name: 'GitHub',        needsInstance: false, base: 'https://github.com/',           type: 'api', apiUrl: 'https://api.github.com/users/{handle}' },
  { id: 'twitter',    name: 'X / Twitter',   needsInstance: false, base: 'https://x.com/',                type: 'api', needsToken: true },
];

function ensureProfile() {
  if (!YM.profile) {
    YM.profile = { uuid: crypto.randomUUID(), name: '', bio: '', photo: null, socialNet: '', socialHandle: '', socialInstance: '', socialToken: '', website: '', gistId: null };
    localStorage.setItem('ym_profile', JSON.stringify(YM.profile));
  }
  return YM.profile;
}

function saveProfile() {
  localStorage.setItem('ym_profile', JSON.stringify(YM.profile));
  window.YM_updateProfileIcon?.();
}

function compressPhoto(file, maxW = 200) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = rej; img.src = url;
  });
}

async function saveToGist(token) {
  const p = YM.profile;
  const payload = { uuid: p.uuid, contacts: (YM.contacts || []).map(c => c.uuid) };
  const body = JSON.stringify({ description: 'YourMine profile backup', public: false, files: { 'yourmine.json': { content: JSON.stringify(payload, null, 2) } } });
  const url = p.gistId ? `https://api.github.com/gists/${p.gistId}` : 'https://api.github.com/gists';
  const r = await fetch(url, { method: p.gistId ? 'PATCH' : 'POST', headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' }, body });
  const data = await r.json();
  if (data.id) { p.gistId = data.id; saveProfile(); }
  return data.html_url;
}

async function restoreFromGist(token) {
  const r = await fetch('https://api.github.com/gists', { headers: { Authorization: `token ${token}` } });
  const gists = await r.json();
  const found = gists.find(g => g.files?.['yourmine.json']);
  if (!found) throw new Error('Aucun gist YourMine trouvé');
  const r2 = await fetch(`https://api.github.com/gists/${found.id}`, { headers: { Authorization: `token ${token}` } });
  const data = await r2.json();
  const content = data.files?.['yourmine.json']?.content;
  if (!content) throw new Error('Fichier yourmine.json introuvable');
  const payload = JSON.parse(content);
  if (payload.uuid) YM.profile.uuid = payload.uuid;
  if (Array.isArray(payload.contacts)) {
    const existing = YM.contacts || [];
    payload.contacts.forEach(uuid => { if (!existing.find(c => c.uuid === uuid)) existing.push({ uuid, name: uuid.slice(0,8) }); });
    YM.contacts = existing;
    localStorage.setItem('ym_contacts', JSON.stringify(YM.contacts));
  }
  YM.profile.gistId = found.id;
  saveProfile();
}

function renderQR(uuid) {
  const container = $('profile-qr-container');
  if (!container || !window.QRCode) return;
  container.innerHTML = '';
  try {
    new QRCode(container, { text: `https://yourmine-dapp.web.app/u/${uuid}`, width: 110, height: 110, colorDark: '#c8f0a0', colorLight: '#050508', correctLevel: QRCode.CorrectLevel.M });
  } catch { container.innerHTML = `<div style="font-size:9px;word-break:break-all;color:var(--text3)">${uuid.slice(0,16)}…</div>`; }
}

function render() {
  const body = $('ym-app-body');
  if (!body) return;
  const p = ensureProfile();
  const netObj = SOCIAL_NETWORKS.find(n => n.id === p.socialNet);

  body.innerHTML = `
  <!-- Identité (pleine largeur en col 1 sur PC) -->
  <div class="ym-panel">
    <div class="ym-panel-title">Identité</div>
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">

      <!-- Avatar + QR -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
        <div style="position:relative">
          <div id="profile-avatar-display" style="width:80px;height:80px;border-radius:50%;background:var(--surface2);border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;overflow:hidden;cursor:pointer" title="Changer photo">
            ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover"/>` : (p.name ? p.name[0].toUpperCase() : '?')}
          </div>
          <button id="profile-photo-btn" style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;color:#050508">+</button>
          <input type="file" id="profile-photo-input" accept="image/*" style="display:none"/>
        </div>
        <div id="profile-qr-container"></div>
      </div>

      <!-- Formulaire -->
      <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px">
        <input class="ym-input" id="profile-name" placeholder="Nom affiché" value="${p.name || ''}"/>
        <textarea class="ym-input" id="profile-bio" placeholder="Bio courte…" style="resize:none;height:52px">${p.bio || ''}</textarea>
        <input class="ym-input" id="profile-website" placeholder="Site web (https://…)" value="${p.website||''}"/>
        <div style="display:flex;gap:8px">
          <select class="ym-input" id="profile-social-net" style="flex:1">
            <option value="">Réseau social principal</option>
            ${SOCIAL_NETWORKS.map(n=>`<option value="${n.id}" ${p.socialNet===n.id?'selected':''}>${n.name}</option>`).join('')}
          </select>
          <input class="ym-input" id="profile-social-handle" placeholder="handle" value="${p.socialHandle||''}" style="flex:1"/>
        </div>
        <div id="profile-social-instance-wrap" style="${netObj?.needsInstance?'':'display:none'}">
          <input class="ym-input" id="profile-social-instance" placeholder="Instance (ex: mastodon.social)" value="${p.socialInstance||''}"/>
        </div>
        <div id="profile-social-token-wrap" style="${netObj?.needsToken?'':'display:none'}">
          <input class="ym-input" id="profile-social-token" type="password" placeholder="Bearer token" value="${p.socialToken||''}"/>
        </div>
        <div style="font-size:9px;color:var(--text3);word-break:break-all;padding:4px 0">${p.uuid}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ym-btn ym-btn-ghost" id="profile-copy-uuid" style="font-size:9px;padding:4px 10px">⧉ UUID</button>
          <button class="ym-btn ym-btn-ghost" id="profile-copy-url"  style="font-size:9px;padding:4px 10px">⧉ URL</button>
          <button class="ym-btn ym-btn-accent" id="profile-save-btn" style="flex:1;min-width:120px">Enregistrer</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Gist Backup -->
  <div class="ym-panel">
    <div class="ym-panel-title">Sauvegarde Gist</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="ym-notice info"><span>Token GitHub (scope:gist) — sauvegarde et restaure UUID + contacts sur n'importe quel appareil. Le token suffit, pas besoin d'ID.</span></div>
      <input class="ym-input" id="profile-gh-token" type="password" placeholder="ghp_… (scope : gist)"/>
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="profile-save-gist" style="flex:1">Sauvegarder</button>
        <button class="ym-btn" id="profile-restore-gist" style="flex:1">Restaurer</button>
      </div>
      <div id="profile-gist-status"></div>
    </div>
  </div>

  <!-- Page de démarrage -->
  <div class="ym-panel">
    <div class="ym-panel-title">Page de démarrage</div>
    <div class="ym-notice info" style="margin-bottom:10px"><span>App ou sphere active au lancement. La liste inclut les pills actuellement ouvertes.</span></div>
    <div id="profile-start-page" style="display:flex;gap:6px;flex-wrap:wrap"></div>
  </div>
  `;

  renderQR(p.uuid);
  wireProfileEvents();
}

function wireProfileEvents() {
  // Photo
  $('profile-photo-btn')?.addEventListener('click', () => $('profile-photo-input')?.click());
  $('profile-avatar-display')?.addEventListener('click', () => $('profile-photo-input')?.click());
  $('profile-photo-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    const compressed = await compressPhoto(file);
    YM.profile.photo = compressed;
    saveProfile();
    const av = $('profile-avatar-display');
    if (av) av.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  });

  // Social net
  $('profile-social-net')?.addEventListener('change', e => {
    const net = SOCIAL_NETWORKS.find(n => n.id === e.target.value);
    $('profile-social-instance-wrap').style.display = net?.needsInstance ? '' : 'none';
    $('profile-social-token-wrap').style.display    = net?.needsToken    ? '' : 'none';
  });

  // Save
  $('profile-save-btn')?.addEventListener('click', () => {
    const p = YM.profile;
    p.name           = $('profile-name')?.value || '';
    p.bio            = $('profile-bio')?.value || '';
    p.socialNet      = $('profile-social-net')?.value || '';
    p.socialHandle   = $('profile-social-handle')?.value || '';
    p.socialInstance = $('profile-social-instance')?.value?.trim() || '';
    p.socialToken    = $('profile-social-token')?.value || '';
    p.website        = $('profile-website')?.value || '';
    saveProfile();
    const btn = $('profile-save-btn');
    if (btn) { btn.textContent = '✓ Enregistré'; setTimeout(() => btn.textContent = 'Enregistrer', 2000); }
  });

  // Copy
  $('profile-copy-uuid')?.addEventListener('click', () => navigator.clipboard.writeText(YM.profile.uuid).catch(()=>{}));
  $('profile-copy-url')?.addEventListener('click',  () => navigator.clipboard.writeText(`https://yourmine-dapp.web.app/u/${YM.profile.uuid}`).catch(()=>{}));

  // Gist
  $('profile-save-gist')?.addEventListener('click', async () => {
    const token = $('profile-gh-token')?.value;
    if (!token) return setStatus('profile-gist-status', 'Token requis', true);
    try { await saveToGist(token); setStatus('profile-gist-status', '✓ Sauvegardé'); }
    catch(e) { setStatus('profile-gist-status', e.message, true); }
  });
  $('profile-restore-gist')?.addEventListener('click', async () => {
    const token = $('profile-gh-token')?.value?.trim();
    if (!token) return setStatus('profile-gist-status', 'Token requis', true);
    try { await restoreFromGist(token); setStatus('profile-gist-status', '✓ Restauré'); render(); }
    catch(e) { setStatus('profile-gist-status', e.message, true); }
  });

  // Start page — apps + spheres ouvertes
  const startPageEl = $('profile-start-page');
  if (startPageEl) {
    const currentStart = localStorage.getItem('ym_start_app') || 'plug';
    const appItems = (YM?.apps?.length ? YM.apps : [{name:'plug'},{name:'mine'},{name:'profile'}]).map(a => ({ name: a.name, isSphere: false }));
    const sphereItems = (YM?.sphereTabs || []).map(t => ({ name: t.name, isSphere: true }));
    [...appItems, ...sphereItems].forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'ym-cat-btn' + (item.name === currentStart ? ' active' : '');
      btn.dataset.name = item.name;
      btn.textContent = (item.isSphere ? '◎ ' : '') + item.name;
      btn.onclick = () => {
        localStorage.setItem('ym_start_app', item.name);
        startPageEl.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('active', b.dataset.name === item.name));
      };
      startPageEl.appendChild(btn);
    });
  }
}

function setStatus(id, msg, isError = false) {
  const s = $(id);
  if (s) s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
}

render();
return { mountAs: 'profile-icon', cleanup: () => {} };

});
