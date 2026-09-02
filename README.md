# YourMine

A permissionless WebOS for publishing JavaScript apps and fully customizing the interface — all in the same runtime.

Spheres are apps. Themes are interface layouts. Both are plain files hosted on GitHub forks, distributed without a central gatekeeper, ordered by a participatory scoring algorithm.

**Repo:** https://github.com/theodoreyong9/YourMinedApp
**Docs:** https://aiwa.gitbook.io/aiwa-docs/

---

## How it works

**Spheres** are JavaScript apps loaded into the runtime. Each sphere runs in an isolated context (`ctx`), with scoped storage, P2P messaging, and a UI container — no shared globals, no conflicts.

**Themes** are HTML fragments injected into `<body>`. They define the entire visual shell: desktop, navigation, panels, dialogs. A theme can completely replace the default interface — hide the desktop, override navigation, run its own router.

**The HyperProfile** is the infrastructure, not a feature. Instead of each sphere managing its own authentication, the profile already exists and is passed to every sphere via `ctx`. One identity, across every sphere, centralized in the interface but not on a server. The profile also manages per-sphere visibility and permissions — each sphere sees only what you expose to it.

**The registry** (`files.json` / `themes-files.json`) lives in your fork. Distribution is a PR — automated, scored by an algorithm, no editorial decision.

---

## Interplanetary Proof of Will

Any monetary system on earth (Dollars, Bitcoin, whatever...) cannot work across planets. The speed of light introduces 3–22 minutes of latency between Earth and Mars, which breaks global consensus. Any chain would fork irreversibly.

Proof of Will is geographically independent by design. Mining happens where you are, with who you are. Your will does not travel — it acts locally. No global synchronisation required other than time itself.

**This is a prototype.** The mining formula and permission score described in this repo demonstrate the concept inside YourMine, but the real interplanetary protocol — designed to actually run consensus across planets — is being developed separately at **[AIWA_chain](https://github.com/theodoreyong9/AIWA_chain)**.

---

## Architecture

```
index.html          Boot — fetches theme HTML, injects into DOM, loads desk.js then app.js
desk.js             Desktop runtime — icons, pages, folders, drag, widgets
app.js              Core — sphere lifecycle, panels, P2P, PWA, profile
*.theme.html        Theme — CSS + DOM injected by index.html at boot
src/*.js            Core modules — mine.js, build.js, liste.js, profile.js
*.sphere.js         Sphere — loaded from author fork via codeUrl in files.json
files.json          Sphere registry
themes-files.json   Theme registry
```

### Boot sequence

```
index.html
  → fetch theme HTML from localStorage (ym_theme_url) or default
  → inject theme into <body>
  → load desk.js → app.js
  → app.js activates social.sphere.js (mandatory)
  → app.js activates spheres from ym_active_spheres
  → app.js activates theme's requiredSpheres
```

### Sphere activation

```
YM.activateSphere(name)
  → dispatch 'ym:sphere-before-activate'
  → mkCtx(name)              — scoped context object
  → sphere.activate(ctx)     — 8s timeout enforced
  → addIcon(name, ...)
  → dispatch 'ym:sphere-activated'
```

### Profile isolation

Each theme can run a completely separate profile — different active spheres, desktop layout, contacts — without changing the UUID:

```js
// In your theme, before app.js boots:
var _owner = base.replace('https://raw.githubusercontent.com/','').split('/')[0];
var _hash  = btoa(_owner).replace(/[^a-z0-9]/gi,'').slice(0,10);
localStorage.setItem('ym_profile_key', 'ym_profile_test_' + _hash);
```

`app.js`, `desk.js`, and `liste.js` all derive their storage keys from `ym_profile_key`. Two forks have different hashes → completely separate environments sharing the same P2P network.

---

## Building a Sphere

A sphere is a single `.sphere.js` file. It must use an IIFE and register itself on `window.YM_S`.

### Minimal sphere

```js
/* jshint esversion:11 */
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;

window.YM_S['mysphere.sphere.js'] = {
  name:        'My Sphere',
  icon:        '🔮',
  category:    'Tools',
  description: 'What it does. Under 140 chars.',

  activate(ctx) {
    _ctx = ctx;
    // Fire-and-forget only — never await here
  },

  deactivate() {
    _ctx = null;
  },

  renderPanel(container) {
    container.innerHTML = `
      <div style="padding:16px">
        <div class="ym-card">
          <div class="ym-card-title">My Sphere</div>
          <button class="ym-btn ym-btn-accent" style="width:100%;margin-top:12px">
            Do something
          </button>
        </div>
      </div>`;
  },
};
})();
```

**Rules:**
- The key in `window.YM_S[...]` must match the filename exactly.
- `deactivate()` is a top-level method — never assign `ctx.deactivate = ...` inside `activate()`.
- `activate()` must return within **8 seconds**. Never `await` slow calls — use fire-and-forget.

### Full sphere shape

```js
window.YM_S['mysphere.sphere.js'] = {
  // Required
  name, icon, category, description,

  // Lifecycle
  activate(ctx)  { },   // called once on activation
  deactivate()   { },   // cleanup timers, listeners, DOM

  // UI
  renderPanel(container)            { },  // sphere panel body
  profileSection(container)         { },  // own profile → Spheres tab
  peerSection(container, peerCtx)   { },  // injected into peer profile cards

  // P2P
  broadcastData()  { return { key: value }; },  // merged into presence packet every 5s
  emit:    ['event:type'],
  receive: ['event:type'],

  // Visual
  cardBackground: 'https://...image.jpg',  // card watermark (12% opacity)
  cardGif:        'https://...anim.gif',   // animated card background
  fullscreen:     true,                    // open panel edge-to-edge
};
```

### Context API (`ctx`)

```js
// Storage — scoped to this sphere (ym_s|name|*)
ctx.storage.get(key)
ctx.storage.set(key, value)
ctx.storage.del(key)

// UI
ctx.toast(msg, type)          // 'success' | 'error' | 'info' | 'warn'
ctx.openPanel(renderFn)       // open panel-sphere with custom render
ctx.setNotification(n)        // badge count on desktop icon
ctx.setIcon(icon)             // emoji or image URL

// Profile
ctx.loadProfile()             // → current profile object
ctx.saveProfile(data)         // merges data into profile

// P2P — broadcast
ctx.send(type, data)          // rate-limited: 10/s
ctx.onReceive((type, data, peerId) => { })  // auto-cleaned on deactivate

// Navigation
window.YM?.openSpherePanel?.('mysphere.sphere.js')
window.YM?.openProfilePanel?.(profileObject)
window.YM?.openPanel?.('panel-profile')
```

### P2P — targeted messages

`ctx.send` broadcasts to all peers. For direct messages:

```js
window.YM_P2P?.sendTo(peerId, {
  sphere: 'mysphere.sphere.js',
  type:   'myevent:action',
  data:   { payload: 'data' }
});

// Get peerId from UUID
const peerId = window.YM_Social?._nearUsers.get(uuid)?.peerId ?? null;
```

---

## Profile as Infrastructure

The profile is not a feature bolt-on — it is what makes spheres interoperable without a backend.

When a user opens another user's profile card, `app.js` iterates every sphere both users have active and calls `peerSection(container, peerCtx)` on each one. Each sphere injects its own UI into that card. No coordination between spheres needed.

### `profileSection(container)` — own profile

Called when the user opens their own profile → Spheres tab. Use it for sphere-specific stats, history, settings.

```js
profileSection(container) {
  const best = _ctx.storage.get('best_score') || '0';
  container.innerHTML = `
    <div style="padding:14px">
      <div style="font-size:24px;font-weight:700;color:var(--accent,var(--gold))">${best}</div>
      <div style="font-size:9px;color:var(--text3);letter-spacing:.1em">BEST SCORE</div>
    </div>`;
},
```

### `peerSection(container, peerCtx)` — peer profile card

Called when viewing another user's profile. `peerCtx` has no `ctx.send` — access your sphere's ctx via the registry or use `window.YM_P2P.sendTo` directly.

```js
peerSection(container, peerCtx) {
  // peerCtx: { uuid, peerId, name, displayName }
  const btn = document.createElement('button');
  btn.className = 'ym-btn ym-btn-ghost';
  btn.textContent = '⚡ Challenge';
  btn.onclick = () => {
    const peerId = peerCtx.peerId || peerCtx.uuid;
    window.YM_P2P?.sendTo(peerId, {
      sphere: 'mysphere.sphere.js',
      type:   'mysphere:challenge',
      data:   {}
    });
  };
  container.appendChild(btn);
},
```

### `broadcastData()` — presence payload

Every sphere can attach data to the user's social presence packet, broadcast to nearby peers every 5s:

```js
broadcastData() {
  return { status: 'playing', score: 42 };  // keep under 500 bytes
}
// Peers read it: YM_Social._nearUsers[uuid].broadcastData
```

### Visibility

```js
window.YM_canSeeSphere(sphereName, peerUUID)  // → true | false
window.YM_getSphereVisibility(sphereName)     // → 'all' | 'contacts' | uuid[]
```

---

## Multiplayer

YourMine's P2P layer (Nostr via Trystero) enables real-time multiplayer with no backend. Three patterns cover most use cases.

**Rate limits:** 10 sends/second, max ~4KB per message.

### Shared state — continuous sync

```js
activate(ctx) {
  const state = { players: {}, myPos: { x: 0, y: 0 } };

  _interval = setInterval(() => {
    ctx.send('mygame:pos', state.myPos);
  }, 100);

  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:pos') {
      state.players[peerId] = data;
      renderPlayers(state.players);
    }
  });
},
deactivate() {
  if (_interval) { clearInterval(_interval); _interval = null; }
},
```

### Lobby — join/leave room

```js
activate(ctx) {
  const myProfile = ctx.loadProfile();
  ctx.send('mygame:join', { name: myProfile.name, avatar: myProfile.avatar });

  const room = new Map();
  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:join') {
      room.set(peerId, data);
      updateLobby(room);
      ctx.send('mygame:welcome', { players: [...room.values()] }, peerId);
    }
    if (type === 'mygame:leave') {
      room.delete(peerId);
      updateLobby(room);
    }
  });
},
```

### Turn-based — authoritative host

Host election by join time: earliest join is host. Host computes state, broadcasts to others.

```js
activate(ctx) {
  let isHost = false;
  const peers = new Map();
  const myJoinTime = Date.now();

  ctx.send('mygame:hello', { joinTime: myJoinTime });

  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:hello') {
      peers.set(peerId, data.joinTime);
      isHost = myJoinTime <= Math.min(...peers.values());
    }
    if (type === 'mygame:move' && isHost) {
      const newState = applyMove(gameState, data, peerId);
      ctx.send('mygame:state', newState);
    }
    if (type === 'mygame:state' && !isHost) {
      applyState(data);
    }
  });
},
```

### Wake-up from pending challenge

When a peer sends a challenge while a sphere is inactive, `social.sphere.js` queues it:

```js
activate(ctx) {
  _ctx = ctx;
  setTimeout(() => {
    const p = window.YM_PendingChallenges?.['mysphere.sphere.js'];
    if (p) {
      this._onInvited(p.data, p.peerId);
      delete window.YM_PendingChallenges['mysphere.sphere.js'];
    }
  }, 500);
},
```

---

## Desktop Widgets

A widget is a `position:fixed` element injected into `<body>` by the sphere — visible on the desktop, persistent across panel opens.

### Build the widget synchronously in `activate()`

Never build inside an async callback — the desktop page sync runs immediately after `activate()` returns:

```js
// ✗ Wrong — widget built too late
activate(ctx) {
  fetchData().then(data => { _buildWidget(); });
}

// ✓ Correct — build sync, enrich async
activate(ctx) {
  _ctx = ctx;
  _buildWidget();  // registers page immediately
  fetchData().then(data => { _refreshWidget(data); }).catch(() => {});
},
```

### Page sync pattern

Widgets must hide/show based on the current desktop page. Required implementation:

```js
const WIDGET_ID = 'mysphere-widget';
const POS_KEY   = 'mysphere_widget_pos';

function _syncWidgetPage() {
  if (!_widget || !document.body.contains(_widget)) return;
  if (_widget._dragging) return;
  let widgetPage = 0;
  if (window.YM_Desk?.registeredWidgetPage) {
    const rp = window.YM_Desk.registeredWidgetPage(WIDGET_ID);
    widgetPage = rp != null ? rp : (_loadPos().page || 0);
  }
  const curPage = window._deskCurPage ?? 0;
  const visible = curPage === widgetPage;
  _widget.style.opacity      = visible ? '1' : '0';
  _widget.style.pointerEvents = visible ? 'all' : 'none';
}

const _onPageChange = () => _syncWidgetPage();

function _buildWidget() {
  // ... create _widget element, append to document.body ...
  window.YM_Desk?.registerWidgetPage(WIDGET_ID, _loadPos().page || 0, POS_KEY);
  window.addEventListener('ym:page-change', _onPageChange);
  _syncWidgetPage();
}

deactivate() {
  window.removeEventListener('ym:page-change', _onPageChange);
  window.YM_Desk?.unregisterWidget(WIDGET_ID);
  _widget?.remove();
  _widget = null;
  _ctx = null;
},
```

Use `opacity:0/1` + `pointerEvents:none/all` — never `display:none` on widgets (breaks pointer capture during page transitions).

---

## Building a Theme

A theme is an HTML fragment (not a full document) injected into `<body>` by `index.html`. It owns the entire visual shell.

### Required metadata

```html
<script>
window.YM_THEME_META = {
  name:        "My Theme",
  icon:        "🎨",
  description: "Short description shown in theme picker",
  requiredSpheres: [],  // auto-activated on first load, user can deactivate later
};
window.YM_WALLPAPER_PRESETS = [
  { label: 'City Night', url: 'https://images.unsplash.com/photo-xxx?w=1400&q=80' },
];
</script>
```

### Required DOM IDs

These must exist or `app.js`/`desk.js` will crash:

```
ym-wp, ym-bg, ym-loader, toasts, desktop, desktop-slider,
drag-ghost, page-dots, nav-bar, dock,
btn-back, btn-profile, btn-figure,
panel-overlay, panel-spheres, panel-spheres-body,
panel-profile, panel-profile-body,
panel-build, panel-build-body,
panel-mine, panel-mine-wallet, panel-mine-build,
panel-mine-formula, panel-mine-liste, mine-tabs-bar,
panel-sphere, panel-sphere-body, sphere-panel-title,
panel-profile-view, panel-profile-view-body, profile-view-title,
panel-switcher, switcher-handle, switcher-grid,
folder-dlg, folder-name-input, folder-confirm, folder-cancel,
bg-dlg, bg-presets, theme-list, theme-custom-input, theme-custom-btn,
bg-wp, bg-remove, bg-spheres, bg-del,
ym-sign-dlg, ym-sign-sphere, ym-sign-detail, ym-sign-confirm, ym-sign-reject,
pwa-install-btn, spheres-build-btn, profile-share-btn
```

### Required CSS classes

```
.ym-panel, .ym-panel.open, .ym-overlay
.dbtn, .dbtn.active
.icon-wrap, .icon-body, .icon-label, .icon-notif, .icon-del
.folder-body, .folder-grid, .fi
.desktop-page, .cell-hl
.ym-btn, .ym-btn-accent, .ym-btn-ghost, .ym-btn-danger
.ym-input
.ym-card, .ym-card-title
.ym-notice, .ym-notice.info/.success/.error/.warn
.ym-tabs, .ym-tab, .ym-tab.active
.pill, .pill.active
.toast, .toast.success/.error/.info/.warn
.dlg, .dlg.open, .dlg-box, .dlg-title
.panel-handle, .panel-head, .panel-body
.sw-card, .sw-preview, .sw-label, .sw-clone-wrap
.pdot, .pdot.active
body.edit-mode .icon-del               { display: flex }
body.edit-mode .folder-body>.icon-del  { display: none !important }
body.has-wallpaper
```

**CSS isolation rule:** prefix all your custom classes with your theme name. The runtime injects `.ym-*` classes globally — any name collision makes your element invisible.

### CSS variables (guaranteed by all themes)

```
--bg, --text, --text2, --text3
--gold (#f0a830), --cyan (#08e0f8), --red (#ff4560), --green (#22d98a)
--font-d (Syne), --font-b (Space Grotesk), --font-m (JetBrains Mono)
```

Use `var(--accent, var(--gold))` as fallback — `--accent` exists in some themes only.

### DOM listener timing

Theme scripts execute before HTML is parsed. Wrap all `getElementById` / `addEventListener` calls:

```js
setTimeout(function() {
  var btn = document.getElementById('my-btn');
  if (btn) btn.addEventListener('click', handler);
}, 0);
```

### Navigation config

```js
window.YM_NAV_CONFIG = {
  'btn-figure': {
    panel: 'panel-spheres',
    tab:   null,
    onOpen: function() { if(window.YM_Liste) window.YM_Liste.render(); }
  },
  liste: {
    defaultType:   'spheres',
    spheresOnly:   false,
    socialFilters: false,  // adds Near / Contacts filter pills
  }
};
```

### Blocking desktop chrome (full custom UI)

If your theme replaces the desktop entirely, block sphere widget injection:

```js
const obs = new MutationObserver(muts => {
  muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if ((n.id || '').includes('widget') ||
        (n.style?.position === 'fixed' &&
         !n.id.startsWith('panel') &&
         !n.id.startsWith('ym-sign'))) {
      n.style.cssText = 'display:none!important';
    }
  }));
});
obs.observe(document.body, { childList: true });

function blockDesk() {
  if (window.YM_Desk) {
    window.YM_Desk.addIcon    = () => {};
    window.YM_Desk.removeIcon = () => {};
    window.YM_Desk.renderDesk = () => {};
  }
}
blockDesk();
window.addEventListener('ym:sphere-activated',   blockDesk);
window.addEventListener('ym:sphere-deactivated', blockDesk);
```

### Theme router

```js
window.YM.registerRouter({
  onPop(event) {
    // Return true to prevent app.js from handling popstate
    return true;
  }
});
```

---

## Registry Format

### `files.json` — sphere entry

```json
{
  "filename":  "mysphere.sphere.js",
  "author":    "SolanaBase58Pubkey",
  "ghAuthor":  "githubusername",
  "codeUrl":   "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/mysphere.sphere.js",
  "score":     12.345,
  "laps":      450000,
  "timestamp": 1700000000,
  "merged_at": 1700000100,
  "media":     { "photos": [], "videos": [] }
}
```

### `themes-files.json` — theme entry

```json
{
  "filename":    "mytheme.theme.html",
  "name":        "My Theme",
  "icon":        "🎨",
  "description": "Short description",
  "ghAuthor":    "githubusername",
  "codeUrl":     "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/src/themes/mytheme.html",
  "wip":         false,
  "score":       0,
  "laps":        0,
  "timestamp":   1700000000,
  "merged_at":   1700000100,
  "media":       { "photos": [], "videos": [] }
}
```

---

## Publishing & Permission Score

Fork `theodoreyong9/YourMinedApp`. Place your sphere at the repo root (or anywhere reachable via raw GitHub URL). Open a PR to the main repo.

`merge.js` (GitHub Action) handles the rest: extracts metadata from your sphere code, writes an entry in `files.json` with your `codeUrl`, scores the PR, merges automatically.

### The permission score

This is not a moderation system. It is the structural mechanism that makes the registry permissionless while staying ordered — no editor decides what gets in, the algorithm does.

```
(score_now + 1) / (laps_now + 1)  >  (score_last + 1) / (laps_last + 1)
```

- **First publication:** always allowed, no score required.
- **New sphere:** your current score ratio must improve on your last publication. The more you've contributed, the more credibility you carry.
- **Updating an existing sphere:** ownership check only, no score required.

Score is frozen at merge time. Ranking: `score / laps`. No editorial override.

The score itself comes from the mining formula — participation in the network (burns, time, patience rate) generates it. Score is therefore a function of genuine network engagement, not identity or reputation assigned externally.

---

## Test Environment

Any fork can run its own isolated registry inside the main runtime — no staging server.

### Declare overrides in your theme

```js
window.YM_REGISTRY_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/YourFork/YourMinedApp/main/test.json'
};
window.YM_THEMES_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/YourFork/YourMinedApp/main/test-theme.json'
};
localStorage.removeItem('ym_liste_cache_v4');
```

`liste.js` uses these URLs instead of the main registries. Your test spheres and themes are visible only to users running your theme. Profile isolation is automatic when the theme sets `ym_profile_key` — two forks have separate desktops, active spheres, and contacts while sharing the same P2P network and UUID.

### `test.json` — same format as `files.json`

```json
[
  {
    "filename": "mysphere.sphere.js",
    "author":   "SolanaBase58Pubkey",
    "ghAuthor": "githubusername",
    "codeUrl":  "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/mysphere.sphere.js",
    "score": 0, "laps": 0, "timestamp": 0, "merged_at": 0
  }
]
```

---

## Transport

Default P2P: Nostr via Trystero.

```js
const YM_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr.oxtr.dev'
];
```

Override relays or swap the entire transport before `app.js` boots:

```js
// Custom relay pool
window.YM_RELAYS_OVERRIDE = ['wss://my-relay.example.com'];

// Isolated private network
window.YM_APPID_OVERRIDE = 'myapp-v1';
window.YM_ROOM_OVERRIDE  = 'my-room';

// Full transport replacement
window.YM_TRANSPORT = {
  async connect(roomId, appId) { },
  send(peerId, data)           { },  // peerId=null → broadcast
  onMessage(callback)          { },  // callback(peerId, data)
  onPeerJoin(callback)         { },
  onPeerLeave(callback)        { },
};
```

If `YM_TRANSPORT` is defined, `app.js` uses it instead of Trystero. Falls back to Trystero on failure.

---

## Deployment

Static hosting only. Required files at root:

```
index.html
manifest.json
sw.js
ym512.png
icon-splash-dark.png
files.json
themes-files.json
```

Works on Vercel, Netlify, GitHub Pages, Cloudflare Pages, or any CDN.

---

## Global API Reference

| Global | Set by | Description |
|--------|--------|-------------|
| `window.YM` | `app.js` | `activateSphere`, `deactivateSphere`, `openPanel`, `openProfilePanel`, `openSpherePanel`, `setTheme` |
| `window.YM_Desk` | `desk.js` | `addIcon`, `removeIcon`, `setNotif`, `registerWidgetPage`, `unregisterWidget`, `registeredWidgetPage` |
| `window.YM_S` | spheres | Sphere registry `{ 'name.sphere.js': { … } }` |
| `window.YM_P2P` | `app.js` | `broadcast`, `sendTo` |
| `window.YM_Social` | `social.sphere.js` | `_nearUsers: Map<uuid, { profile, ts, peerId, broadcastData }>` |
| `window.YM_sphereRegistry` | `app.js` | `Map<filename, ctx>` of active spheres |
| `window.YM_Liste` | `liste.js` | `render(container)` — sphere/theme list, fully standalone |
| `window.YM_Mine_sign(msg)` | `mine.js` | Sign — triggers confirmation dialog |
| `window.YM_Mine_pubkey()` | `mine.js` | Current Solana pubkey or null |

## Runtime Events

| Event | Detail | When |
|-------|--------|------|
| `ym:sphere-before-activate` | `{ filename, author, code }` | Before activation |
| `ym:sphere-activated` | `{ name }` | After activation |
| `ym:sphere-deactivated` | `{ name }` | After deactivation |
| `ym:peer-join` | `{ peerId }` | New P2P peer |
| `ym:page-change` | — | Desktop page changed |
| `ym:before-transaction` | `{ amount, destination, program }` | Before wallet sign |
| `ym:webllm-ready` | — | WebLLM (Llama 3.2 1B) ready |

---

## AIWA Project

YourMine is the first application built on **AIWA** — the broader effort to build a real, geographically-independent consensus protocol for interplanetary participation, starting from the Proof of Will concept prototyped here.

**Repo:** https://github.com/theodoreyong9/AIWA_chain

---

## License

MIT
