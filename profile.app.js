// ════════════════════════════════════════════════════════
//  profile.app.js — YourMine Profile Management
// ════════════════════════════════════════════════════════

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

// Réseaux dont le contenu est extractible sans backend :
// Mastodon & Pixelfed : API publique (instance variable)
// Bluesky : AT Protocol public
// Twitter/X : PKCE Bearer token
// Nostr : relais public WebSocket
const SOCIAL_NETWORKS = [
  { id: 'mastodon',  name: 'Mastodon',       needsInstance: true,  base: '' },
  { id: 'bluesky',   name: 'Bluesky',        needsInstance: false, base: 'https://bsky.app/profile/' },
  { id: 'pixelfed',  name: 'Pixelfed',       needsInstance: true,  base: '' },
  { id: 'twitter',   name: 'X / Twitter',    needsInstance: false, base: 'https://x.com/', needsToken: true },
  { id: 'nostr',     name: 'Nostr',          needsInstance: false, base: 'https://snort.social/p/', needsToken: false },
];

function ensureProfile() {
  if (!YM.profile) {
    YM.profile = {
      uuid:            crypto.randomUUID(),
      name:            '',
      photo:           null,
      socialNet:       '',
      socialHandle:    '',
      socialInstance:  '',   // ex: mastodon.social, pixelfed.social
      socialToken:     '',   // Bearer token pour X/Twitter
      website:         '',
      theme:           'default',
      spheres:         { repo: [], creator: [], tester: [] },
      gistId:          null,
    };
    localStorage.setItem('ym_profile', JSON.stringify(YM.profile));
  }
  return YM.profile;
}

function saveProfile() {
  localStorage.setItem('ym_profile', JSON.stringify(YM.profile));
  YM.contacts = JSON.parse(localStorage.getItem('ym_contacts') || '[]');
}

// ── PHOTO COMPRESS ────────────────────────────────────────
function compressPhoto(file, maxW = 200) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = rej;
    img.src = url;
  });
}

// ── GIST SAVE / RESTORE ───────────────────────────────────
async function saveToGist(token) {
  const p = YM.profile;
  const payload = {
    uuid:     p.uuid,
    contacts: (YM.contacts || []).map(c => c.uuid),
  };
  const body = JSON.stringify({
    description: 'YourMine profile backup',
    public: false,
    files: { 'yourmine.json': { content: JSON.stringify(payload, null, 2) } }
  });
  const url = p.gistId ? `https://api.github.com/gists/${p.gistId}` : 'https://api.github.com/gists';
  const method = p.gistId ? 'PATCH' : 'POST';
  const r = await fetch(url, { method, headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' }, body });
  const data = await r.json();
  if (data.id) { p.gistId = data.id; saveProfile(); }
  return data.html_url;
}

async function restoreFromGist(gistId) {
  const r = await fetch(`https://api.github.com/gists/${gistId}`);
  const data = await r.json();
  const content = data.files?.['yourmine.json']?.content;
  if (!content) throw new Error('Fichier yourmine.json introuvable');
  const payload = JSON.parse(content);
  if (payload.uuid) { YM.profile.uuid = payload.uuid; }
  if (Array.isArray(payload.contacts)) {
    const existing = YM.contacts || [];
    payload.contacts.forEach(uuid => {
      if (!existing.find(c => c.uuid === uuid)) existing.push({ uuid, name: uuid.slice(0,8) });
    });
    YM.contacts = existing;
    localStorage.setItem('ym_contacts', JSON.stringify(YM.contacts));
  }
  YM.profile.gistId = gistId;
  saveProfile();
}

// ── QR CODE ───────────────────────────────────────────────
function renderQR(uuid) {
  const container = $('profile-qr-container');
  if (!container) return;
  container.innerHTML = '';
  const profileUrl = `https://yourmine.app/u/${uuid}`;
  try {
    new QRCode(container, { text: profileUrl, width: 140, height: 140, colorDark: '#c8f0a0', colorLight: '#050508', correctLevel: QRCode.CorrectLevel.M });
  } catch { container.innerHTML = `<div class="ym-wallet-address" style="font-size:10px;word-break:break-all">${profileUrl}</div>`; }
}

// ── THEME BUILDER SECTION ─────────────────────────────────
function renderThemeBuilder() {
  return `
  <div class="ym-panel" id="profile-theme-builder">
    <div class="ym-panel-title">Builder de Thème</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="ym-notice info"><span>Générez ou codez un thème HTML+CSS. Les IDs existants ne doivent pas être supprimés.</span></div>
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Clé IA</label>
        <div style="display:flex;gap:6px">
          <select class="ym-input" id="profile-ai-provider" style="width:auto;flex-shrink:0">
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
          <input class="ym-input" id="profile-ai-key" type="password" placeholder="sk-…" style="flex:1"/>
        </div>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Thème exemple (optionnel)</label>
        <select class="ym-input" id="profile-theme-example">
          <option value="">Aucun (thème default)</option>
        </select>
      </div>
      <textarea class="ym-editor" id="profile-theme-prompt" placeholder="Décrivez le thème voulu : couleurs, typographie, ambiance…" rows="3"></textarea>
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="profile-gen-theme-btn" style="flex:1">Générer avec IA</button>
        <button class="ym-btn" id="profile-code-theme-btn" style="flex:1">Éditer code</button>
      </div>
      <textarea class="ym-editor" id="profile-theme-code" placeholder="<!-- Code HTML+CSS du thème -->" rows="6" style="display:none"></textarea>
      <div style="display:flex;gap:8px" id="profile-theme-actions" style="display:none">
        <button class="ym-btn" id="profile-theme-preview-btn" style="flex:1">Prévisualiser</button>
        <button class="ym-btn ym-btn-accent" id="profile-theme-publish-btn" style="flex:1">Publier</button>
      </div>
      <div id="profile-theme-status"></div>
    </div>
  </div>`;
}

// ── MAIN RENDER ────────────────────────────────────────────
function render() {
  const body = $('ym-app-body');
  if (!body) return;

  const p = ensureProfile();
  const netObj = SOCIAL_NETWORKS.find(n => n.id === p.socialNet);

  body.innerHTML = `
  <!-- Profile Card -->
  <div class="ym-panel">
    <div class="ym-profile-hero">
      <div class="ym-profile-avatar" id="profile-avatar-display">
        ${p.photo ? `<img src="${p.photo}" alt="" style="width:100%;height:100%;object-fit:cover"/>` : (p.name ? p.name[0].toUpperCase() : '?')}
      </div>
      <input type="file" id="profile-photo-input" accept="image/*" style="display:none"/>
      <button class="ym-btn ym-btn-ghost" id="profile-photo-btn" style="font-size:10px">Changer photo</button>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:800">${p.name || 'Votre nom'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <span class="ym-chip blue">${p.uuid.slice(0,8)}…</span>
        ${p.socialNet ? `<span class="ym-chip">${netObj?.name || p.socialNet} @${p.socialHandle}</span>` : ''}
      </div>
    </div>

    <!-- Edit form -->
    <div style="display:flex;flex-direction:column;gap:10px">
      <input class="ym-input" id="profile-name" placeholder="Nom affiché" value="${p.name || ''}"/>
      <div style="display:flex;gap:8px">
        <select class="ym-input" id="profile-social-net" style="flex:1">
          <option value="">Réseau social</option>
          ${SOCIAL_NETWORKS.map(n=>`<option value="${n.id}" ${p.socialNet===n.id?'selected':''}>${n.name}</option>`).join('')}
        </select>
        <input class="ym-input" id="profile-social-handle" placeholder="pseudo / handle" value="${p.socialHandle||''}" style="flex:1"/>
      </div>
      <div id="profile-social-instance-wrap" style="${netObj?.needsInstance?'':'display:none'}">
        <input class="ym-input" id="profile-social-instance" placeholder="Instance ex: mastodon.social" value="${p.socialInstance||''}"/>
      </div>
      <div id="profile-social-token-wrap" style="${netObj?.needsToken?'':'display:none'}">
        <input class="ym-input" id="profile-social-token" type="password" placeholder="Bearer token (X/Twitter PKCE)" value="${p.socialToken||''}"/>
      </div>
      <input class="ym-input" id="profile-website" placeholder="Site web (https://…)" value="${p.website||''}"/>
      <button class="ym-btn ym-btn-accent" id="profile-save-btn">Enregistrer</button>
    </div>
  </div>

  <!-- UUID + QR -->
  <div class="ym-panel">
    <div class="ym-panel-title">Identité</div>
    <div class="ym-wallet-address" style="margin-bottom:12px">${p.uuid}</div>
    <div id="profile-qr-container" class="ym-flex" style="display:flex;justify-content:center;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px">
      <button class="ym-btn ym-btn-ghost" id="profile-copy-uuid" style="flex:1" data-tip="Copier UUID">Copier UUID</button>
      <button class="ym-btn ym-btn-ghost" id="profile-copy-url" style="flex:1" data-tip="Copier URL">Copier URL</button>
    </div>
  </div>

  <!-- Gist Backup -->
  <div class="ym-panel">
    <div class="ym-panel-title">Sauvegarde Gist</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="ym-notice info"><span>Sauvegarde : UUID + liste UUID de vos contacts dans un Gist privé GitHub.</span></div>
      <input class="ym-input" id="profile-gh-token" type="password" placeholder="Token GitHub (scope : gist)"/>
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="profile-save-gist" style="flex:1">Sauvegarder</button>
        <button class="ym-btn" id="profile-restore-gist" style="flex:1">Restaurer</button>
      </div>
      <div style="display:flex;gap:8px">
        <input class="ym-input" id="profile-gist-id" placeholder="Gist ID (pour restaurer)" value="${p.gistId||''}" style="flex:1"/>
        <button class="ym-btn ym-btn-ghost" id="profile-copy-gistid" data-tip="Copier Gist ID">⧉</button>
      </div>
      <div id="profile-gist-status"></div>
    </div>
  </div>

  <!-- Page de démarrage -->
  <div class="ym-panel">
    <div class="ym-panel-title">Page de démarrage</div>
    <div id="profile-start-page" style="display:flex;gap:6px;flex-wrap:wrap"></div>
  </div>

  <!-- Theme Builder -->
  ${renderThemeBuilder()}

  <!-- About YourMine -->
  <div class="ym-panel">
    <div class="ym-panel-title" style="cursor:pointer" id="about-toggle">Notre Projet ▸</div>
    <div id="about-content" style="display:none">
      <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--text2);line-height:1.7">
        <p style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text)">Value Engine</p>
        <p>Un moteur d'incitation économique dans un navigateur. Le App layer P2P de YourMine combine l'IA et une infrastructure ouverte et auto-confinée avec une adaptabilité extrême.</p>
        <p>YourMine introduit le concept de <em style="color:var(--accent)">"Mine Per Clic"</em>. Les utilisateurs minent de la cryptomonnaie favorisés par leur fidélité grâce au <strong>Proof of Sacrifice</strong>.</p>
        <p>Un système déterministe et désinflationiste de minage par burn. Commission volontaire au lieu d'être brûlée, déterminant également leur récompense.</p>
        <p style="color:var(--accent3)">YourMine ne vend pas des apps. Ne vend pas un store. Ne vend pas une crypto. C'est une infrastructure d'incitation collective, ouverte et auto-confinée.</p>
        <div class="ym-divider"></div>
        <p style="font-size:11px;font-style:italic;color:var(--text3)">"Facebook a développé un réseau d'incitation sociale. WordPress a développé une plateforme de plugins. YourMine développe l'incitation économique dans un réseau de plugins."</p>
      </div>
    </div>
  </div>
  `;

  renderQR(p.uuid);
  wireProfileEvents();
  loadThemeExamples();
}

function wireProfileEvents() {
  const body = $('ym-app-body');
  if (!body) return;

  // Photo
  $('profile-photo-btn')?.addEventListener('click', () => $('profile-photo-input')?.click());
  $('profile-photo-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressPhoto(file);
    YM.profile.photo = compressed;
    const av = $('profile-avatar-display');
    if (av) av.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover"/>`;
  });

  // Network select → show/hide instance & token fields
  $('profile-social-net')?.addEventListener('change', e => {
    const net = SOCIAL_NETWORKS.find(n => n.id === e.target.value);
    $('profile-social-instance-wrap').style.display = net?.needsInstance  ? '' : 'none';
    $('profile-social-token-wrap').style.display    = net?.needsToken     ? '' : 'none';
  });

  // Save profile
  $('profile-save-btn')?.addEventListener('click', () => {
    const p = YM.profile;
    p.name            = $('profile-name')?.value || '';
    p.socialNet       = $('profile-social-net')?.value || '';
    p.socialHandle    = $('profile-social-handle')?.value || '';
    p.socialInstance  = $('profile-social-instance')?.value?.trim() || '';
    p.socialToken     = $('profile-social-token')?.value || '';
    p.website         = $('profile-website')?.value || '';
    saveProfile();
    const btn = $('profile-save-btn');
    if (btn) { btn.textContent = '✓ Enregistré'; setTimeout(() => btn.textContent = 'Enregistrer', 2000); }
  });

  // Copy UUID / URL
  $('profile-copy-uuid')?.addEventListener('click', () => navigator.clipboard.writeText(YM.profile.uuid));
  $('profile-copy-url')?.addEventListener('click',  () => navigator.clipboard.writeText(`https://yourmine.app/u/${YM.profile.uuid}`));

  // Gist
  $('profile-save-gist')?.addEventListener('click', async () => {
    const token = $('profile-gh-token')?.value;
    if (!token) return setStatus('profile-gist-status', 'Token GitHub requis', true);
    try {
      const url = await saveToGist(token);
      setStatus('profile-gist-status', 'Sauvegardé : ' + YM.profile.gistId);
    } catch(e) { setStatus('profile-gist-status', e.message, true); }
  });

  $('profile-restore-gist')?.addEventListener('click', async () => {
    const gistId = $('profile-gist-id')?.value?.trim();
    if (!gistId) return setStatus('profile-gist-status', 'Gist ID requis', true);
    try {
      await restoreFromGist(gistId);
      setStatus('profile-gist-status', 'Restauré !');
      render();
    } catch(e) { setStatus('profile-gist-status', e.message, true); }
  });

  // Copy Gist ID
  $('profile-copy-gistid')?.addEventListener('click', () => {
    const id = YM.profile?.gistId;
    if (id) navigator.clipboard.writeText(id).catch(()=>{});
  });

  // Start page — construit dynamiquement à partir des apps disponibles
  const startPageEl = $('profile-start-page');
  if (startPageEl) {
    const currentStart = localStorage.getItem('ym_start_app') || 'plug';
    const apps = (YM?.apps?.length ? YM.apps : [{name:'plug'},{name:'mine'},{name:'profile'}]);
    apps.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'ym-cat-btn' + (a.name === currentStart ? ' active' : '');
      btn.dataset.app = a.name;
      btn.textContent = a.name;
      btn.onclick = () => {
        localStorage.setItem('ym_start_app', a.name);
        startPageEl.querySelectorAll('[data-app]').forEach(b => b.classList.toggle('active', b.dataset.app === a.name));
      };
      startPageEl.appendChild(btn);
    });
  }

  // Theme builder
  $('profile-code-theme-btn')?.addEventListener('click', () => {
    const editor = $('profile-theme-code');
    const actions = $('profile-theme-actions');
    if (editor) { editor.style.display = editor.style.display === 'none' ? '' : 'none'; }
    if (actions) actions.style.display = '';
  });

  $('profile-gen-theme-btn')?.addEventListener('click', genThemeWithAI);
  $('profile-theme-preview-btn')?.addEventListener('click', previewTheme);
  $('profile-theme-publish-btn')?.addEventListener('click', publishTheme);

  // About toggle
  $('about-toggle')?.addEventListener('click', () => {
    const c = $('about-content');
    if (c) { const open = c.style.display !== 'none'; c.style.display = open ? 'none' : ''; $('about-toggle').textContent = 'Notre Projet ' + (open ? '▸' : '▾'); }
  });
}

async function loadThemeExamples() {
  const sel = $('profile-theme-example');
  if (!sel) return;
  try {
    const files = await fetchJSON(REPO_API);
    const themes = files.filter(f => f.name.endsWith('.theme.html'));
    themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name.replace('.theme.html','');
      sel.appendChild(opt);
    });
  } catch {}
}

async function genThemeWithAI() {
  const provider = $('profile-ai-provider')?.value;
  const key      = $('profile-ai-key')?.value?.trim();
  const prompt   = $('profile-theme-prompt')?.value?.trim();
  const example  = $('profile-theme-example')?.value;

  if (!key) return setStatus('profile-theme-status', 'Clé API requise', true);
  if (!prompt) return setStatus('profile-theme-status', 'Prompt requis', true);

  setStatus('profile-theme-status', 'Génération en cours…');
  const btn = $('profile-gen-theme-btn');
  btn.disabled = true;

  let exampleCode = '';
  if (example) {
    try { exampleCode = await fetchText(REPO_RAW + example); } catch {}
  }

  const systemPrompt = `Tu es un expert en design CSS/HTML futuriste, organique, minimaliste pour l'app YourMine.
Génère UNIQUEMENT le code HTML+CSS d'un thème.
RÈGLE ABSOLUE : tu ne dois JAMAIS supprimer ou renommer les IDs existants : ym-root, ym-header, ym-logo, ym-balance-display, ym-balance-val, ym-main, ym-app-body, ym-btn-x, ym-btn-o, ym-x-menu, ym-o-menu, ym-theme-confirm.
Tu peux jouer avec TOUT le reste : couleurs, typo, layout, animations, variables CSS.
Le code commence par <style> et peut contenir des <template> HTML.
NE PAS inclure de markdown, juste le code brut.`;

  const userMsg = `Crée un thème HTML+CSS pour YourMine. Prompt: "${prompt}"${exampleCode ? `\n\nExemple de référence:\n${exampleCode.slice(0,3000)}` : ''}`;

  try {
    let code = '';
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userMsg }] })
      });
      const d = await r.json();
      code = d.content?.[0]?.text || '';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] })
      });
      const d = await r.json();
      code = d.choices?.[0]?.message?.content || '';
    }
    // Strip markdown fences
    code = code.replace(/```html|```css|```/g, '').trim();
    const editor = $('profile-theme-code');
    if (editor) { editor.value = code; editor.style.display = ''; }
    const actions = $('profile-theme-actions');
    if (actions) actions.style.display = '';
    setStatus('profile-theme-status', 'Thème généré !');
  } catch(e) {
    setStatus('profile-theme-status', 'Erreur: ' + e.message, true);
  }
  btn.disabled = false;
}

function previewTheme() {
  const code = $('profile-theme-code')?.value?.trim();
  if (!code) return;
  const root = $('ym-theme-root');
  if (root) root.innerHTML = code;
  const confirm = $('ym-theme-confirm');
  if (confirm) confirm.classList.add('visible');
}

async function publishTheme() {
  const code = $('profile-theme-code')?.value?.trim();
  const token = $('profile-gh-token')?.value?.trim();
  if (!code) return setStatus('profile-theme-status', 'Code requis', true);
  // Propose a filename
  const name = prompt('Nom du thème (sans .theme.html) :');
  if (!name) return;
  if (!token) return setStatus('profile-theme-status', 'Token GitHub requis pour publier', true);
  // PR to repo (simplified: create fork + file)
  setStatus('profile-theme-status', 'Publication: fonctionnalité PR en développement. Code copié dans le presse-papier.');
  navigator.clipboard.writeText(code).catch(()=>{});
}

function setStatus(id, msg, isError = false) {
  const s = $(id);
  if (!s) return;
  s.innerHTML = `<div class="ym-notice ${isError?'error':'success'}" style="margin-top:4px"><span>${msg}</span></div>`;
}

// ── INIT ──────────────────────────────────────────────────
render();
return { cleanup: () => {} };

})(window._YM, window._$, window._el, window._fetchText, window._fetchJSON, window._REPO_RAW, window._REPO_API);
