// ════════════════════════════════════════════════════════
//  profile.app.js — YourMine Profile
//  @icon 👤
//  @desc Identité, réseaux sociaux, sauvegarde Gist
//  @author YourMine
//  @cat core
//  @score 100
// ════════════════════════════════════════════════════════

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

const SOCIAL_NETWORKS = [
  { id: 'mastodon',   name: 'Mastodon',    needsInstance: true,  base: 'https://{instance}/@' },
  { id: 'pixelfed',   name: 'Pixelfed',    needsInstance: true,  base: 'https://{instance}/@' },
  { id: 'bluesky',    name: 'Bluesky',     needsInstance: false, base: 'https://bsky.app/profile/' },
  { id: 'farcaster',  name: 'Farcaster',   needsInstance: false, base: 'https://warpcast.com/' },
  { id: 'nostr',      name: 'Nostr',       needsInstance: false, base: 'https://snort.social/p/' },
  { id: 'threads',    name: 'Threads',     needsInstance: false, base: 'https://www.threads.net/@' },
  { id: 'paragraph',  name: 'Paragraph',   needsInstance: false, base: 'https://paragraph.xyz/@' },
  { id: 'substack',   name: 'Substack',    needsInstance: false, base: 'https://{handle}.substack.com' },
  { id: 'medium',     name: 'Medium',      needsInstance: false, base: 'https://medium.com/@' },
  { id: 'ghost',      name: 'Ghost',       needsInstance: true,  base: 'https://{instance}/' },
  { id: 'youtube',    name: 'YouTube',     needsInstance: false, base: 'https://youtube.com/@' },
  { id: 'github',     name: 'GitHub',      needsInstance: false, base: 'https://github.com/' },
  { id: 'twitter',    name: 'X / Twitter', needsInstance: false, base: 'https://x.com/', needsToken: true },
];

// ── GIST — structure explicite sauvegardée ────────────────
// Chaque app montée sur profile-icon peut déclarer window.YM_GIST_SAVE et window.YM_GIST_RESTORE
// profile.app.js orchestre la sauvegarde/restauration de tous
function buildGistPayload() {
  const p = YM.profile;
  // Données de base du profil
  const payload = {
    _v: 2,
    uuid: p.uuid,
    name: p.name || '',
    bio: p.bio || '',
    website: p.website || '',
    socialNet: p.socialNet || '',
    socialHandle: p.socialHandle || '',
    socialInstance: p.socialInstance || '',
    contacts: (YM.contacts || []).map(c => ({ uuid: c.uuid, name: c.name })),
    startApp: localStorage.getItem('ym_start_app') || '',
    theme: YM.theme || 'default',
  };
  // Demande à chaque app profile-icon de contribuer ses données
  if (window.YM_GIST_CONTRIBUTORS) {
    for (const [key, fn] of Object.entries(window.YM_GIST_CONTRIBUTORS)) {
      try { payload[key] = fn(); } catch {}
    }
  }
  return payload;
}

async function saveToGist(token) {
  const p = YM.profile;
  const payload = buildGistPayload();
  const body = JSON.stringify({
    description: 'YourMine profile backup',
    public: false,
    files: { 'yourmine.json': { content: JSON.stringify(payload, null, 2) } }
  });
  const url = p.gistId ? `https://api.github.com/gists/${p.gistId}` : 'https://api.github.com/gists';
  const r = await fetch(url, {
    method: p.gistId ? 'PATCH' : 'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body
  });
  const data = await r.json();
  if (data.id) { p.gistId = data.id; saveProfile(); }
  return data.html_url;
}

async function restoreFromGist(token) {
  const r = await fetch('https://api.github.com/gists', { headers: { Authorization: `token ${token}` } });
  const gists = await r.json();
  if (!Array.isArray(gists)) throw new Error('Token invalide ou pas de gists');
  const found = gists.find(g => g.files?.['yourmine.json']);
  if (!found) throw new Error('Aucun gist YourMine trouvé');
  const r2 = await fetch(`https://api.github.com/gists/${found.id}`, { headers: { Authorization: `token ${token}` } });
  const data = await r2.json();
  const content = data.files?.['yourmine.json']?.content;
  if (!content) throw new Error('yourmine.json introuvable');
  const payload = JSON.parse(content);

  // Restauration profil de base
  const p = YM.profile;
  if (payload.uuid)           p.uuid           = payload.uuid;
  if (payload.name)           p.name           = payload.name;
  if (payload.bio)            p.bio            = payload.bio;
  if (payload.website)        p.website        = payload.website;
  if (payload.socialNet)      p.socialNet      = payload.socialNet;
  if (payload.socialHandle)   p.socialHandle   = payload.socialHandle;
  if (payload.socialInstance) p.socialInstance = payload.socialInstance;
  if (payload.startApp)       localStorage.setItem('ym_start_app', payload.startApp);
  if (Array.isArray(payload.contacts)) {
    const existing = YM.contacts || [];
    payload.contacts.forEach(c => {
      if (!existing.find(x => x.uuid === c.uuid)) existing.push(c);
    });
    YM.contacts = existing;
    localStorage.setItem('ym_contacts', JSON.stringify(YM.contacts));
  }
  p.gistId = found.id;
  saveProfile();

  // Délègue aux apps contributeurs
  if (window.YM_GIST_CONTRIBUTORS) {
    for (const [key, _] of Object.entries(window.YM_GIST_CONTRIBUTORS)) {
      if (payload[key] && window.YM_GIST_RESTORE?.[key]) {
        try { window.YM_GIST_RESTORE[key](payload[key]); } catch {}
      }
    }
  }
}

function ensureProfile() {
  if (!YM.profile) {
    YM.profile = {
      uuid: crypto.randomUUID(), name: '', bio: '', photo: null,
      socialNet: '', socialHandle: '', socialInstance: '', socialToken: '',
      website: '', gistId: null
    };
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

// ── RENDER ────────────────────────────────────────────────
function render() {
  const body = $('ym-app-body');
  if (!body) return;
  const p = ensureProfile();
  const netObj = SOCIAL_NETWORKS.find(n => n.id === p.socialNet);
  const gistToken = localStorage.getItem('ym_gh_token') || '';

  body.innerHTML = `
  <div class="ym-panel">
    <div class="ym-panel-title">Identité</div>
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">

      <!-- Avatar -->
      <div style="flex-shrink:0">
        <div style="position:relative">
          <div id="profile-avatar-display" style="width:80px;height:80px;border-radius:50%;background:var(--surface2);border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;overflow:hidden;cursor:pointer" title="Changer photo">
            ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover"/>` : (p.name ? p.name[0].toUpperCase() : '?')}
          </div>
          <button id="profile-photo-btn" style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;color:#050508">+</button>
          <input type="file" id="profile-photo-input" accept="image/*" style="display:none"/>
        </div>
      </div>

      <!-- Champs -->
      <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px">
        <input class="ym-input" id="profile-name" placeholder="Nom affiché" value="${p.name || ''}"/>
        <textarea class="ym-input" id="profile-bio" placeholder="Bio courte…" style="resize:none;height:52px">${p.bio || ''}</textarea>
        <input class="ym-input" id="profile-website" placeholder="Site web (https://…)" value="${p.website||''}"/>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select class="ym-input" id="profile-social-net" style="flex:1;min-width:120px">
            <option value="">Réseau social</option>
            ${SOCIAL_NETWORKS.map(n=>`<option value="${n.id}" ${p.socialNet===n.id?'selected':''}>${n.name}</option>`).join('')}
          </select>
          <input class="ym-input" id="profile-social-handle" placeholder="handle" value="${p.socialHandle||''}" style="flex:1;min-width:100px"/>
        </div>
        <div id="profile-social-instance-wrap" style="${netObj?.needsInstance?'':'display:none'}">
          <input class="ym-input" id="profile-social-instance" placeholder="Instance (ex: mastodon.social)" value="${p.socialInstance||''}"/>
        </div>
        <div id="profile-social-token-wrap" style="${netObj?.needsToken?'':'display:none'}">
          <input class="ym-input" id="profile-social-token" type="password" placeholder="Bearer token" value="${p.socialToken||''}"/>
        </div>
        <div style="font-size:9px;color:var(--text3);word-break:break-all;padding:4px 0;user-select:all">${p.uuid}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ym-btn ym-btn-ghost" id="profile-copy-uuid" style="font-size:9px;padding:4px 10px">⧉ UUID</button>
          <button class="ym-btn ym-btn-accent" id="profile-save-btn" style="flex:1;min-width:120px">Enregistrer</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Gist backup -->
  <div class="ym-panel">
    <div class="ym-panel-title">Sauvegarde Gist</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px;line-height:1.6">
      Sauvegarde chiffrée de votre profil + données des apps actives (mine, contacts…) dans un Gist GitHub privé.
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <input class="ym-input" id="profile-gist-token" type="password" placeholder="Token GitHub (gist scope)" value="${gistToken}"/>
      ${p.gistId ? `<div style="font-size:10px;color:var(--text3)">Gist : ${p.gistId}</div>` : ''}
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="profile-gist-save" style="flex:1">↑ Sauvegarder</button>
        <button class="ym-btn" id="profile-gist-restore" style="flex:1">↓ Restaurer</button>
      </div>
      <div id="profile-gist-status"></div>
    </div>
  </div>

  <!-- Page de démarrage -->
  <div class="ym-panel">
    <div class="ym-panel-title">Page de démarrage</div>
    <div id="profile-start-page" style="display:flex;gap:6px;flex-wrap:wrap"></div>
  </div>
  `;

  wireProfileEvents();
}

function wireProfileEvents() {
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

  $('profile-social-net')?.addEventListener('change', e => {
    const net = SOCIAL_NETWORKS.find(n => n.id === e.target.value);
    $('profile-social-instance-wrap').style.display = net?.needsInstance ? '' : 'none';
    $('profile-social-token-wrap').style.display    = net?.needsToken    ? '' : 'none';
  });

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

  $('profile-copy-uuid')?.addEventListener('click', () => navigator.clipboard.writeText(YM.profile.uuid).catch(()=>{}));

  // Gist token save
  $('profile-gist-token')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) localStorage.setItem('ym_gh_token', v);
  });

  $('profile-gist-save')?.addEventListener('click', async () => {
    const token = $('profile-gist-token')?.value?.trim() || localStorage.getItem('ym_gh_token');
    if (!token) return setGistStatus('Token GitHub requis', true);
    setGistStatus('Sauvegarde…');
    try {
      const url = await saveToGist(token);
      setGistStatus(`✓ Sauvegardé — <a href="${url}" target="_blank" style="color:var(--accent2)">voir le gist</a>`);
    } catch(e) { setGistStatus('Erreur: ' + e.message, true); }
  });

  $('profile-gist-restore')?.addEventListener('click', async () => {
    const token = $('profile-gist-token')?.value?.trim() || localStorage.getItem('ym_gh_token');
    if (!token) return setGistStatus('Token GitHub requis', true);
    setGistStatus('Restauration…');
    try {
      await restoreFromGist(token);
      setGistStatus('✓ Profil restauré');
      render();
    } catch(e) { setGistStatus('Erreur: ' + e.message, true); }
  });

  // Start page
  const startPageEl = $('profile-start-page');
  if (startPageEl) {
    const currentStart = localStorage.getItem('ym_start_app') || 'plug';
    const appItems = (YM?.apps?.length ? YM.apps : [{name:'plug'},{name:'mine'},{name:'profile'}])
      .map(a => ({ name: a.name, isSphere: false }));
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

function setGistStatus(msg, isError = false) {
  const s = $('profile-gist-status');
  if (s) s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
}

render();
return { mountAs: 'profile-icon', cleanup: () => {} };

});
