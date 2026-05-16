# YourMine

**A Soulnet for apps and value.**

> Give to receive. Build and deploy instantly. Fork it. Run it. Break it. Improve it.

YourMine is a distributed layer for applications and value, built on Solana. It is not a platform — it is an open, forkable system where participation generates value, identity is non-transferable, and anyone can run their own instance instantly.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Sphere API Specification](#sphere-api-specification)
- [Profile Hooks](#profile-hooks)
- [Multiplayer](#multiplayer)
- [Theme API Specification](#theme-api-specification)
- [External Apps & Bridge API](#external-apps--bridge-api)
- [Runtime Cycle & Lifecycle](#runtime-cycle--lifecycle)
- [Safety System](#safety-system)
- [Link Tab](#link-tab)
- [Ownership Transfer](#ownership-transfer)
- [URL Routing](#url-routing)
- [Permissions & Security Model](#permissions--security-model)
- [File Format Standards](#file-format-standards)
- [Deployment](#deployment)
- [Token GitHub Security Note](#token-github-security-note)

---

## Architecture Overview

```
index.html          Boot loader — fetches theme, injects DOM, loads desk.js then app.js
desk.js             Desktop runtime — icons, pages, folders, drag/drop, widgets
app.js              Core logic — panels, sphere registry, P2P, PWA
themes/*.html       Visual layer — CSS + DOM injected by index.html
src/*.js            Core modules — mine.js, build.js, liste.js, profile.js
*.sphere.js         Distributed apps — loaded from author forks via codeUrl in files.json
files.json          Registry — list of published spheres with metadata and codeUrl
```

**Key design constraint:** sphere code is never hosted on the main repo. It lives in the author's GitHub fork. `files.json` contains only the `codeUrl` pointing to the fork. This is the "loader unique" architecture.

---

## Sphere API Specification

A sphere is a self-contained JavaScript module. It must set `window.YM_S['name.sphere.js']` with the following structure:

```js
window.YM_S['mysphere.sphere.js'] = {
  // ── Required ──────────────────────────────────────────────
  name:        'My Sphere',           // Display name
  icon:        '🔮',                  // Emoji or https:// image URL
  category:    'Tools',               // Category string (shown in liste)
  description: 'What it does.',       // Short description (< 140 chars)

  // ── Lifecycle ─────────────────────────────────────────────
  activate(ctx) { /* called once when user activates */ },
  deactivate()  { /* called when user deactivates — cleanup timers, listeners */ },

  // ── Rendering ─────────────────────────────────────────────
  renderPanel(container) { /* builds sphere UI into container div */ },

  // ── Optional ──────────────────────────────────────────────
  profileSection(container) { /* renders compact UI in profile tab */ },
  peerSection(container, ctx) { /* renders UI for a peer's profile card */ },

  // ── Metadata ──────────────────────────────────────────────
  emit:    ['event:type'],  // P2P events this sphere sends
  receive: ['event:type'],  // P2P events this sphere handles
};
```

### Context Object (`ctx`)

The `activate(ctx)` function receives a context object with the following API:

```js
ctx.storage.get(key)          // → value | null    — localStorage scoped to sphere
ctx.storage.set(key, value)   // saves to scoped localStorage
ctx.storage.del(key)          // removes key

ctx.toast(msg, type)          // type: 'success' | 'error' | 'info' | 'warn'
ctx.openPanel(renderFn)       // opens panel-sphere and calls renderFn(container)
ctx.setNotification(n)        // sets badge count on desktop icon

ctx.send(type, data, peerId?) // broadcast or send to specific peer (rate-limited)
ctx.onReceive(callback)       // callback(type, data, peerId) — auto-cleaned on deactivate

ctx.saveProfile(data)         // merges data into YourMine profile
ctx.loadProfile()             // returns current profile object
```

### Runtime Contract

- `activate()` must complete within **8 seconds** (enforced timeout)
- `deactivate()` must be synchronous or return a Promise — used for cleanup
- Spheres **must not** modify `window.YM`, `window.YM_Desk`, `window.fetch` directly
- Spheres **must not** access `localStorage` keys outside their `ym_s|name|*` namespace
- Rate limits: 3 toasts per 5s, 10 P2P sends per second

### P2P Events

```js
// Sending
ctx.send('myevent:action', { payload: 'data' });          // broadcast to all peers
ctx.send('myevent:action', { payload: 'data' }, peerId);  // direct to one peer

// Receiving
ctx.onReceive((type, data, peerId) => {
  if (type === 'myevent:action') { /* handle */ }
});
```

---

## Profile Hooks

Spheres can inject UI into two places in the profile panel.

### `profileSection(container)`

Called when the user opens their own profile → Spheres tab. Use it to show sphere-specific settings, stats, or configuration.

```js
profileSection(container) {
  container.innerHTML = '<div>My sphere settings here</div>';
  // container is a div inside the accordion for this sphere
}
```

### `peerSection(container, ctx)`

Called when the user views another user's profile card, for each sphere in common. Use it to show peer-specific interactions (send message, challenge, trade, etc.).

```js
peerSection(container, ctx) {
  // ctx = { uuid, isNear, isReciproc, profile }
  // uuid      — peer's UUID
  // isNear    — peer is currently nearby (P2P visible)
  // isReciproc — both have each other as contacts
  // profile   — peer's public profile object

  if (!ctx.isNear) {
    container.innerHTML = '<div style="color:var(--text3);font-size:11px">Not nearby</div>';
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'ym-btn ym-btn-ghost';
  btn.textContent = 'Challenge';
  btn.onclick = () => {
    ctx.send?.('mygame:challenge', { from: ctx.uuid });
    // or use window.YM_sphereRegistry to get the sphere ctx
  };
  container.appendChild(btn);
}
```

### Sphere Visibility

Before broadcasting sphere presence to a peer, check if the user allows it:

```js
// In social/P2P code
const visibleSpheres = myProfile.spheres.filter(s =>
  window.YM_canSeeSphere(s, peerId)
);
ctx.send('social:pong', { spheres: visibleSpheres }, peerId);

// API
window.YM_canSeeSphere(sphereName, peerUUID) // → true | false
window.YM_getSphereVisibility(sphereName)    // → 'all' | 'contacts' | uuid[]
```

---

## Multiplayer

YourMine's P2P layer (Nostr) enables real-time multiplayer without any backend.

### Pattern: shared state

```js
window.YM_S['mygame.sphere.js'] = {
  name: 'My Game', icon: '🎮',

  activate(ctx) {
    // Local state
    const state = { players: {}, myPos: { x: 0, y: 0 } };

    // Broadcast my position every 100ms
    const interval = setInterval(() => {
      ctx.send('mygame:pos', state.myPos);
    }, 100);

    // Receive other players' positions
    ctx.onReceive((type, data, peerId) => {
      if (type === 'mygame:pos') {
        state.players[peerId] = data;
        renderPlayers(state.players);
      }
      if (type === 'mygame:action') {
        handleAction(data, peerId);
      }
    });

    // Cleanup
    ctx.deactivate = () => clearInterval(interval);
  },

  renderPanel(container) {
    // Game UI here
  }
};
```

### Pattern: room / lobby

```js
activate(ctx) {
  const myProfile = ctx.loadProfile();

  // Announce presence
  ctx.send('mygame:join', {
    name: myProfile.name,
    avatar: myProfile.avatar,
  });

  // Track who's in the room
  const room = new Map();
  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:join') {
      room.set(peerId, data);
      updateLobby(room);
      // Welcome the new player
      ctx.send('mygame:welcome', { players: [...room.values()] }, peerId);
    }
    if (type === 'mygame:leave') {
      room.delete(peerId);
      updateLobby(room);
    }
  });
}
```

### Pattern: turn-based / authoritative

For games needing a single source of truth, use the **oldest peer** as host:

```js
activate(ctx) {
  let isHost = false;
  let peers = new Map();
  const myJoinTime = Date.now();

  ctx.send('mygame:hello', { joinTime: myJoinTime });

  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:hello') {
      peers.set(peerId, data.joinTime);
      // Host = peer with earliest joinTime
      isHost = myJoinTime <= Math.min(...peers.values());
    }
    if (type === 'mygame:move' && isHost) {
      // Validate and broadcast authoritative state
      const newState = applyMove(gameState, data, peerId);
      ctx.send('mygame:state', newState); // broadcast to all
    }
    if (type === 'mygame:state' && !isHost) {
      applyState(data); // apply host's authoritative state
    }
  });
}
```

### Rate limits

- **10 P2P sends/second** — enforced by `app.js`
- **Payload size** — keep under 4KB per message (Nostr relay limit)
- **No persistent storage** on the network — use `ctx.storage` for local persistence

### Bring your own infrastructure

The default P2P uses public Nostr relays. A sphere can use any real-time infrastructure:

```js
// Custom WebSocket relay
const ws = new WebSocket('wss://my-relay.example.com');
ws.onmessage = e => handleMessage(JSON.parse(e.data));

// Gun.js (decentralized graph DB)
const gun = Gun(['https://gun-relay.example.com/gun']);

// Matrix (federated real-time)
const client = matrixcs.createClient({ baseUrl: 'https://matrix.org' });

// WebRTC (use Nostr for signaling, then direct P2P)
ctx.onReceive((type, data, peerId) => {
  if (type === 'mygame:sdp-offer') {
    const pc = new RTCPeerConnection();
    pc.setRemoteDescription(data.sdp);
    // ... WebRTC handshake via Nostr signaling
  }
});
```

`ctx.send/onReceive` still works for the default Nostr layer alongside any custom transport. The two can coexist in the same sphere.

---

## Theme API Specification

A theme is an HTML fragment (not a full document) injected into `<body>` by `index.html`.

### Required DOM elements

These IDs **must** exist in every theme or `app.js`/`desk.js` will crash:

```html
<!-- Desktop -->
<div id="ym-wp"></div>          <!-- wallpaper layer -->
<div id="ym-bg"></div>          <!-- background effects -->
<div id="ym-loader"></div>      <!-- loading screen -->
<div id="toasts"></div>
<div id="desktop"><div id="desktop-slider"></div></div>
<div id="drag-ghost"></div>
<div id="page-dots"></div>

<!-- Nav -->
<div id="nav-bar">
  <div id="dock">
    <button id="btn-back" class="dbtn"></button>
    <button id="btn-profile" class="dbtn"></button>
    <button id="btn-figure" class="dbtn"></button>
  </div>
</div>

<!-- Panels -->
<div id="panel-overlay" class="ym-overlay"></div>
<div id="panel-spheres"  class="ym-panel">...<div id="panel-spheres-body"></div></div>
<div id="panel-profile"  class="ym-panel">...<div id="panel-profile-body"></div></div>
<div id="panel-build"    class="ym-panel">...<div id="panel-build-body"></div></div>
<div id="panel-mine"     class="ym-panel">
  ...<div id="panel-mine-wallet"></div><div id="panel-mine-build"></div>
  <div id="panel-mine-formula"></div><div id="panel-mine-liste"></div>
  <div id="mine-tabs-bar" class="ym-tabs">...</div>
</div>
<div id="panel-sphere">...<div id="panel-sphere-body"></div>...<h2 id="sphere-panel-title"></h2></div>
<div id="panel-profile-view">...<div id="panel-profile-view-body"></div>...<h2 id="profile-view-title"></h2></div>

<!-- Dialogs -->
<div id="panel-switcher"><div id="switcher-handle"></div><div id="switcher-grid"></div></div>
<div id="folder-dlg" class="dlg">...<input id="folder-name-input">...<button id="folder-confirm"></button><button id="folder-cancel"></button></div>
<div id="bg-dlg" class="dlg">...<div id="bg-presets"></div><div id="theme-list"></div><input id="theme-custom-input"><button id="theme-custom-btn"></button><button id="bg-wp"></button><button id="bg-remove"></button><button id="bg-spheres"></button><button id="bg-del"></button></div>
<div id="ym-sign-dlg">...<div id="ym-sign-sphere"></div><div id="ym-sign-detail"></div><button id="ym-sign-confirm"></button><button id="ym-sign-reject"></button></div>
<button id="pwa-install-btn"></button>
<div id="spheres-build-btn" ...></div>
<button id="profile-share-btn"></button>
```

### Required CSS classes

These class names are used by `desk.js` and must be styled or at minimum declared:

| Class | Used for |
|---|---|
| `.ym-panel` | Panel containers |
| `.ym-panel.open` | Visible panel state |
| `.ym-overlay` | Click-to-close area |
| `.dbtn`, `.dbtn.active` | Dock buttons |
| `.icon-wrap`, `.icon-body`, `.icon-label`, `.icon-notif`, `.icon-del` | Desktop icons |
| `.folder-body`, `.folder-grid`, `.fi` | Folder icons |
| `.desktop-page` | Grid page layout |
| `.cell-hl` | Drop highlight |
| `.ym-btn`, `.ym-btn-accent`, `.ym-btn-ghost`, `.ym-btn-danger` | Buttons |
| `.ym-input` | Input fields |
| `.ym-card`, `.ym-card-title` | Cards |
| `.ym-notice`, `.ym-notice.info/.success/.error/.warn` | Notices |
| `.ym-tabs`, `.ym-tab`, `.ym-tab.active` | Tab bars |
| `.pill`, `.pill.active` | Pill labels |
| `.toast`, `.toast.success/.error/.info/.warn` | Toast notifications |
| `.dlg`, `.dlg.open`, `.dlg-box`, `.dlg-title` | Dialogs |
| `.panel-handle`, `.panel-head`, `.panel-body` | Panel structure |
| `.sw-card`, `.sw-preview`, `.sw-label`, `.sw-clone-wrap` | Switcher cards |
| `.pdot`, `.pdot.active` | Page dots |
| `body.edit-mode .icon-del` | Delete mode |
| `body.edit-mode .folder-body>.icon-del` | Must be `display:none!important` |
| `body.has-wallpaper` | Wallpaper active state |

### Theme Metadata (required)

Every theme **must** declare these JS globals near the top (in a `<script>` tag before any other JS):

```html
<script>
// Required — used by desk.js for desktop icon label and icon
window.YM_THEME_META = {
  name:        "My Theme",
  icon:        "🎨",
  description: "Short description shown in Themes list",
};

// Required — wallpaper presets shown in the background picker
// These URLs are also extracted by merge.js and stored in themes-files.json media.photos
window.YM_WALLPAPER_PRESETS = [
  { label: 'City Night', url: 'https://images.unsplash.com/photo-xxx?w=1400&q=80' },
  { label: 'Aurora',     url: 'https://images.unsplash.com/photo-yyy?w=1400&q=80' },
];
</script>
```

**Important:** `YM_WALLPAPER_PRESETS` must be defined by the theme, **not** by `desk.js`. Each theme owns its wallpaper collection. `desk.js` reads `window.YM_WALLPAPER_PRESETS || []`.

### Theme picker script

The background dialog (`#bg-dlg`) expects a script that:
1. Fetches `src/themes/index.json` from GitHub raw URL
2. Calls `buildList(files)` to populate `#theme-list`
3. Handles `applyTheme(url, label)` — **must** call `history.replaceState(null,'','/')` before `location.reload()` to clear any `.theme` segment from the URL

```js
function applyTheme(url, label) {
  if (!url || url === activeUrl()) return;
  localStorage.setItem('ym_theme_url', url);
  localStorage.removeItem('ym_theme_cache');
  if (location.pathname !== '/') history.replaceState(null, '', '/'); // ← critical
  window.YM_toast && window.YM_toast('✦ ' + label + ' — reloading…', 'success', 1500);
  setTimeout(() => location.reload(), 1500);
}
```

### icon-label--below CSS class

Desktop icon labels appear **above** the icon by default (`order:-1`). For theme icons (which use `type:'theme'`), `desk.js` adds class `icon-label--below` to put the label below. Your theme CSS must include:

```css
.icon-label--below { order: 1 !important; }
```

---

## URL Routing

### Theme routing

Typing `https://yourmine-dapp.web.app/name.theme` in the address bar:

1. `index.html boot()` detects `/name.theme` segment
2. Looks up `name.theme.html` in `themes-files.json` (by filename or name field)
3. Falls back to `HEAD src/themes/name.theme.html` → then `src/themes/name.html`
4. Stores found URL in `ym_theme_url` and reloads on `/`

### Sphere routing

`https://yourmine-dapp.web.app/social.sphere` → activates `social.sphere.js` and opens its panel.

### Combined routing

`https://yourmine-dapp.web.app/neural.theme/social.sphere` — applies neural theme first, then after reload opens social sphere. The sphere segment is preserved in the URL during the theme reload.

### Important constraint

After applying a theme via the background picker or any programmatic change, always call:
```js
if (location.pathname !== '/') history.replaceState(null, '', '/');
```
before `location.reload()`. Otherwise `checkURLRoute` re-runs on reload and overwrites the new theme choice with the old URL segment.

---

## Edge-back Button

`index.html` injects a theme-proof edge button (`#_ym_edge_btn`) at `z-index:10000`, independent of any theme:

**Desktop (hover:hover):** button appears on hover of the 20px left edge zone via CSS `#_ym_edge:hover ~ #_ym_edge_btn`.

**Mobile (touch):**
- Tap on left edge (20px zone) → toggles button visible for 5 seconds
- Swipe right from left edge (dx > 40px) → action immediately
- Swipe left ending near left edge → toggle button

**Action:** always navigates to `default.html` via `localStorage.setItem('ym_theme_url', DEF_THEME)` + `history.replaceState(null,'','/')` + `location.reload()`. Never reads from `themes-files.json` — hardcoded to system default.

---

## Desktop Icon System

### Icon object structure

Icons are stored in `localStorage` key `ym_desktop_v1` as a JSON array:

```json
{
  "id":       "mysphere.sphere.js",
  "icon":     "🔮",
  "label":    "My Sphere",
  "page":     0,
  "col":      3,
  "row":      5,
  "notif":    0,
  "folder":   false,
  "folderItems": null,
  "type":     "theme",      // only for theme icons
  "themeUrl": "https://..."  // only for theme icons
}
```

### Theme icons

Created via `desk.js addIcon(id, icon, label, page, {type:'theme', themeUrl})`. On tap, apply theme + reload. The `type` and `themeUrl` fields **must be preserved** through all copy operations (folder drag, extraction, etc.) — `desk.js` uses `copyIcon()` for this.

### Grid layout

`desk.js GRID()` returns `{cols:8, rows:5}` on desktop and `{cols:4, rows:6}` on mobile. Your theme CSS **must** use matching values:

```css
:root { --cols: 4; --rows: 6; }               /* mobile */
@media (hover:hover) and (pointer:fine) {
  :root { --cols: 8; --rows: 5; }              /* desktop */
  .desktop-page { grid-template-columns: repeat(var(--cols), 1fr); }
}
```

If `--cols` in your CSS doesn't match `GRID()`, the drop ghost will be misaligned.

---

## Sphere Visibility

Profile panel exposes per-sphere visibility settings stored in `ym_sphere_visibility`:

```js
// API — usable by social.sphere.js and other spheres
window.YM_canSeeSphere(sphereName, peerUUID)
// → true if peer can see this sphere is active

window.YM_getSphereVisibility(sphereName)
// → 'all' | 'contacts' | uuid[]
```

Values: `'all'` (default), `'contacts'` (contacts list only), or an array of UUIDs (custom selection). Use in `social.sphere.js` before broadcasting sphere presence:

```js
ctx.onReceive((type, data, peerId) => {
  if (type === 'social:ping') {
    // Only respond with spheres this peer is allowed to see
    const visibleSpheres = myProfile.spheres.filter(s =>
      window.YM_canSeeSphere(s, peerId)
    );
    ctx.send('social:pong', { spheres: visibleSpheres }, peerId);
  }
});
```

---

## Merge Bot

`merge.js` runs as a GitHub Action on PR merge. It:
1. Updates `files.json` for sphere submissions
2. Updates `themes-files.json` for theme submissions, including **auto-extracting media URLs** from the theme HTML via `merge_media_extractor.js`
3. Closes the PR with a comment
4. Syncs the fork with main

`merge_media_extractor.js` scans theme HTML for Unsplash/Pexels URLs, `.jpg/.png/.webp` images, YouTube/Vimeo links, and `.mp4/.webm` files. Results are stored in `themes-files.json → media.{photos, videos}`.

Both files must be in the same directory (`.github/scripts/` or repo root).

---

## Runtime Cycle & Lifecycle

### Boot sequence

```
1. index.html captures beforeinstallprompt → window._pwaPrompt
2. index.html loads WebLLM via <script type="module"> if navigator.gpu → window.__webllm
3. index.html injects edge-back UI (theme-proof)
4. index.html fetches theme HTML → injectTheme() → CSS in <head>, DOM in <body>
5. boot: await desk.js (execScript)
6. boot: await app.js (execScript)
7. app.js: OC() — creates profile if none
8. app.js: deskInit() → applyWP, buildSlider, goPage(0)
9. app.js: loads mine.js, liste.js, build.js, profile.js (sequential, from GitHub raw)
10. app.js: fetchSphereList() — populates sphere registry from files.json
11. app.js: restores active spheres from profile.spheres[]
12. app.js: activates social.sphere.js (mandatory)
13. app.js: activates safety.sphere.js (mandatory)
14. app.js: initP2P() — Trystero via Nostr relays
15. app.js: hides loader on fonts.ready
```

### Sphere activation flow

```
YM.activateSphere(name, obj)
  → dispatch 'ym:sphere-before-activate'  ← Safety listens here
  → mkCtx(name)           — creates scoped context
  → obj.activate(ctx)     — 8s timeout enforced
  → addIcon(name, ...)    — adds to desktop
  → SP({spheres: [...]})  — saves to profile
  → dispatch 'ym:sphere-activated'
```

**Activation timeout:** `activate()` must resolve within **8 seconds**. If it doesn't, `app.js` kills the activation, removes the icon, and shows an error toast. Do not use `await` on slow network calls in `activate()` — use fire-and-forget instead:

```js
activate(ctx) {
  // ✓ Fire-and-forget — doesn't block activation
  fetch('https://api.example.com/init').then(r => r.json()).then(data => {
    ctx.storage.set('data', JSON.stringify(data));
  });
  // ✗ Never do this — will timeout
  // const data = await fetch('...');
}
```

### Mandatory spheres

`social.sphere.js` and `safety.sphere.js` are **mandatory** — loaded automatically at boot, not deactivatable from the list or the desktop. They always appear in the sphere list with a `✓` indicator instead of an `Off` button. To add a sphere to the mandatory list, add it to `MANDATORY_SPHERES` in `app.js`, `desk.js`, and `liste.js`.

---

## Safety System

### Safety Events

`safety.sphere.js` listens to three custom events dispatched by `app.js` and `liste.js`:

```js
// Dispatched by app.js before every non-mandatory sphere activation
window.dispatchEvent(new CustomEvent('ym:sphere-before-activate', {
  detail: {
    filename: 'mysphere.sphere.js',
    author:   'github-username',
    code:     '/* first 500 chars of source */'
  }
}));

// Dispatched by liste.js before loading an external app URL (iframe sphere)
window.dispatchEvent(new CustomEvent('ym:external-app-load', {
  detail: { url: 'https://myapp.bolt.new', name: 'My App' }
}));

// Dispatched by mine.js before signing a Solana transaction
window.dispatchEvent(new CustomEvent('ym:before-transaction', {
  detail: {
    amount:      0.5,
    destination: 'wallet-address',
    program:     'program-id'
  }
}));
```

Safety uses **Llama 3.2 1B** running locally via WebGPU (loaded by `index.html` into `window.__webllm`). Results: `none/low` → silent, `medium` → warning toast (`z-index:10002`), `high` → error toast.

**Note:** Safety cannot block sphere activation — it warns. The user always has final say. Safety is a monitor, not a gatekeeper.

---

## Link Tab

The **Link** tab in the sphere list (`liste.js`) handles loading any URL as a sphere or theme directly, without going through the PR/merge flow.

### Sphere from raw GitHub URL

```
Tab: Link → Type: Sphere → Pill: 🐙 GitHub Raw
Input: theodoreyong9/YourMinedApp/main/src/social.sphere.js
→ resolved: https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/social.sphere.js
```

The sphere JS is fetched, executed, registered in `window.YM_S`, and activated via `YM.activateSphere()`.

### External app as sphere

```
Tab: Link → Type: Sphere → Pill: ⚡ Bolt
Input: sb1-abc123
→ resolved: https://stackblitz.com/edit/sb1-abc123?embed=1&view=preview
```

An iframe sphere is created automatically. The app runs in an isolated frame with access to the YourMine bridge.

### Theme from URL

```
Tab: Link → Type: Theme → Pill: 🐙 GitHub Raw
Input: keanuji/YourMinedApp/main/src/themes/neural.html
→ sets ym_theme_url, reloads
```

**Supported platforms:** Bolt/StackBlitz, Replit, CodeSandbox, GitHub Pages, GitHub Raw, direct URL.

---

## Ownership Transfer

When publishing or updating a sphere/theme via the **Publish** panel, an optional "Transfer ownership to @github-user" field is available.

**Effect:** sets `owner` field in `files.json` (spheres) or `themes-files.json` (themes). The `owner` can modify the entry in future submissions. The `ghAuthor` (original author) is preserved for scoring and ranking — it never changes.

```json
{
  "filename":  "mysphere.sphere.js",
  "ghAuthor":  "original-author",
  "owner":     "new-owner",
  "codeUrl":   "https://raw.githubusercontent.com/new-owner/..."
}
```

**Permission check order:** `ghAuthor === username` OR `owner === username` OR `author (wallet) === pubkey`.

---

### Sphere deactivation flow

```
YM.deactivateSphere(name)
  → obj.deactivate()      — cleanup
  → ctx._cleanup()        — removes all onReceive listeners
  → removeIcon(name)      — removes from desktop
  → SP({spheres: [...]})  — updates profile
  → dispatch 'ym:sphere-deactivated'
  → autoCleanPages()      — removes empty desktop pages
```

---

## Permissions & Security Model

### What spheres CAN do

- Read/write their own `localStorage` namespace (`ym_s|name|*`)
- Render UI in their assigned container (panel body, widget)
- Send/receive P2P messages (rate-limited: 10/s)
- Show toasts (rate-limited: 3/5s)
- Open `panel-sphere` via `ctx.openPanel()`
- Request wallet signature via `window.YM_Mine_sign()` — always shows confirmation dialog
- Access `ctx.loadProfile()` / `ctx.saveProfile()` — only for non-sensitive fields

### What spheres CANNOT do

- Access other spheres' localStorage namespaces
- Intercept or modify `window.fetch` (locked by `Object.defineProperty`)
- Modify `window.YM`, `window.YM_Desk`, `window.YM_P2P` directly
- Write to `ym_profile_v1` localStorage key during activation (`window._ym_sl` guard)
- Sign messages without explicit user confirmation dialog
- Access wallet private key or seed phrase (never exposed outside `mine.js`)

### Token GitHub (build.js)

The GitHub token (`ghp_...`) entered in Build step 1 is:
- **Stored in `sessionStorage`** — cleared when browser tab closes, never in `localStorage`
- **Never sent to any third party** — only to `api.github.com` directly from the browser
- **Never logged or cached** — the token string is not written to any YourMine storage
- **Scoped to `repo`** — the minimum required for fork, push, and PR creation
- **Risk**: the token is visible in browser memory during the session. Use a dedicated token with minimal permissions and revoke it after publishing.

### Profile backup / UUID

The profile JSON backup (`💾` button in Profile) saves:
- `name`, `bio`, `avatar`, `networks`, `pubkey` — user-defined fields
- `spheres` — list of active sphere filenames
- Sphere configurations (`ym_s|*` keys)
- Contacts list

**The `uuid` field is intentionally excluded from restore** — UUID is generated once at first launch and is your permanent Soulnet identity. It is non-transferable and cannot be duplicated. Restoring a backup never overwrites your UUID.

---

## File Format Standards

### `files.json` — Sphere registry

```json
[
  {
    "filename":       "mysphere.sphere.js",
    "author":         "SolanaWalletPubkey...",
    "ghAuthor":       "githubusername",
    "codeUrl":        "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/mysphere.sphere.js",
    "score":          12.345678,
    "laps":           450000,
    "timestamp":      1700000000,
    "merged_at":      1700000100,
    "media": {
      "photos": ["https://images.unsplash.com/photo-xxx", "https://..."],
      "videos": ["https://vimeo.com/xxx"]
    }
  }
]

`media` is optional. Omit entirely for pure visual themes. Add `photos` or `videos` arrays for themes that distribute media content. These appear as previews in the Themes list (Photo/Video pill filter).
```

`codeUrl` is the only field used to load sphere code. It always points to the author's fork, never to the main repo.

### `themes-files.json` — Theme registry

Located at the **root** of the main repo (not in `src/`). Loaded by `liste.js` and `checkURLRoute`.

```json
[
  {
    "filename":    "default.theme.html",
    "name":        "Default",
    "icon":        "🏠",
    "description": "The default YourMine theme.",
    "ghAuthor":    "theodoreyong9",
    "codeUrl":     "https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/src/themes/default.html",
    "wip":         false,
    "score":       0,
    "laps":        0,
    "timestamp":   1700000000,
    "merged_at":   1700000100,
    "media": {
      "photos": ["https://images.unsplash.com/photo-xxx"],
      "videos": []
    }
  }
]
```

**Field notes:**
- `filename` — canonical name in `.theme.html` format, used for URL routing (`/default.theme` → looks up `default.theme.html`)
- `codeUrl` — the **actual file URL**, may use `.html` extension for system themes
- `media.photos` / `media.videos` — extracted automatically by `merge.js` from the theme HTML. Powers the Photo/Video filter in the Themes list
- `wip:true` — shows 🚧 badge in list
- System themes (`default`, `neural`, `hello`) have `ghAuthor: "theodoreyong9"` and `codeUrl` pointing to `src/themes/*.html`
- User themes have `codeUrl` pointing to their fork

**Difference from `files.json`:** themes-files.json lives at root, uses `.theme.html` filenames, has `media` field, no `author` (wallet) field.

---

### Sphere file format

```js
/* jshint esversion:11 */
// mysphere.sphere.js
(function(){
'use strict';
window.YM_S = window.YM_S || {};
window.YM_S['mysphere.sphere.js'] = {
  name: '...',
  icon: '...',
  category: '...',
  description: '...',
  activate(ctx) { },
  deactivate() { },
  renderPanel(container) { },
};
})();
```

**Critical:** the filename in `window.YM_S[...]` must exactly match the filename in `files.json`.

### Minimal sphere (link mode)

Instead of writing full sphere code, you can register a minimal activatable sphere that simply loads code from a GitHub raw URL:

```js
window.YM_S['mysphere.sphere.js'] = {
  name: 'My App',
  icon: '🔗',
  category: 'Tools',
  description: 'My app loaded from GitHub.',
  codeUrl: 'https://raw.githubusercontent.com/user/repo/main/mysphere.sphere.js',
  activate(ctx) { /* minimal stub */ },
  deactivate() { },
  renderPanel(container) { container.innerHTML = '<div>Loading...</div>'; },
};
```

---

## Deployment

YourMine can be deployed on any static file host:

```
Vercel / Netlify / GitHub Pages / Cloudflare Pages / Any CDN
```

### Required files at root

```
index.html          — boot loader (do not rename)
manifest.json       — PWA manifest
sw.js               — service worker (optional but recommended)
ym512.png           — app icon
icon-splash-dark.png
```

### GitHub repository structure

```
/
├── index.html              ← boot loader (do not rename)
├── manifest.json           ← PWA manifest
├── sw.js                   ← service worker
├── ym512.png               ← app icon (used in nav btn-figure — must be at root)
├── icon-splash-dark.png
├── files.json              ← sphere registry
├── themes-files.json       ← theme registry (root, not in src/)
├── events/                 ← submission events (read by merge bot)
├── .github/scripts/
│   ├── merge.js            ← merge bot
│   └── merge_media_extractor.js
└── src/
    ├── app.js
    ├── desk.js
    ├── mine.js
    ├── build.js
    ├── liste.js
    ├── profile.js
    └── themes/
        ├── index.json      ← ["default.html","neural.html","hello.html"]
        ├── default.html    ← system theme (served from src/themes/)
        ├── neural.html
        └── hello.html
```

**Note:** `ym512.png` must be deployed at the root of your web app (e.g. `yourmine-dapp.web.app/ym512.png`). It's referenced with an absolute URL in themes so it works regardless of the current URL path.

### Forking and running your own instance

```bash
# 1. Fork the repo on GitHub
# 2. Enable GitHub Pages (Settings → Pages → Branch: main)
# 3. Your instance runs at https://yourusername.github.io/YourMinedApp
# 4. Customize themes, publish spheres, connect to the same Nostr relays
```

---

## External Apps & Bridge API

Any web app hosted anywhere (Bolt, Replit, Vercel, GitHub Pages, custom URL) can be loaded as a sphere in YourMine. No code changes needed on the main repo.

### How to add an external app

In the Apps list (↗ button), paste any URL or ID:

| Platform | Input | Example |
|---|---|---|
| Bolt / StackBlitz | Project ID | `sb1-abc123` |
| Replit | `@user/repl` | `@alice/my-game` |
| CodeSandbox | Sandbox ID | `r3f-physics-abc` |
| GitHub Pages | `user/repo` | `alice/my-app` |
| Any URL | Full URL | `https://myapp.vercel.app` |

The app opens as a fullscreen panel with a desktop icon, exactly like a native sphere.

### Bridge postMessage API

YourMine automatically sends `ym:ready` to the iframe 300ms after load. The app can then communicate with YourMine via `postMessage`:

```js
// ── Detect YourMine ──────────────────────────────────────────────────────────
const isInYourMine = window.parent !== window;

// ── Receive profile on load (automatic) ─────────────────────────────────────
window.addEventListener('message', e => {
  if (e.data?.type === 'ym:ready') {
    const profile = e.data.profile;
    // profile.uuid, profile.name, profile.avatar, profile.spheres...
  }
  if (e.data?.type === 'ym:profile') {
    // Response to ym:getProfile
  }
  if (e.data?.type === 'ym:storage:value') {
    // Response to ym:storage:get
    const { key, value } = e.data;
  }
  if (e.data?.type === 'ym:p2p:receive') {
    const { msgType, data, from } = e.data;
  }
});

// ── Send commands to YourMine ────────────────────────────────────────────────
// Toast notification
window.parent.postMessage({ type: 'ym:toast', msg: 'Saved!', style: 'success' }, '*');
// style: 'success' | 'error' | 'info' | 'warn'

// Get profile
window.parent.postMessage({ type: 'ym:getProfile' }, '*');

// Storage (isolated per app per user)
window.parent.postMessage({ type: 'ym:storage:set', key: 'score', value: '42' }, '*');
window.parent.postMessage({ type: 'ym:storage:get', key: 'score' }, '*');

// P2P broadcast to all YourMine peers
window.parent.postMessage({ type: 'ym:p2p:broadcast', data: { x: 1, y: 2 } }, '*');

// P2P send to specific peer
window.parent.postMessage({ type: 'ym:p2p:send', to: 'peer-uuid', data: { msg: 'hi' } }, '*');

// Resize iframe height
window.parent.postMessage({ type: 'ym:resize', height: 600 }, '*');
```

The bridge is **silent outside YourMine** — all `postMessage` calls to `window.parent` are no-ops when `window.parent === window`. Your app runs normally everywhere.

### Publishing an external app as a sphere

Submit via Build panel → Quick → Sphere. Set `codeUrl` to your app's URL. The merge bot adds it to `files.json`. It appears in the sphere list with score/ranking, exactly like a native sphere.

---

## URL Routing

YourMine supports direct URL navigation for themes and spheres:

```
/                        → loads theme from localStorage (default.html on first visit)
/default.theme           → applies default theme
/neural.theme            → applies neural theme
/social.sphere           → activates social sphere and opens its panel
/neural.theme/social.sphere → applies theme then opens sphere after reload
```

**Resolution order for `/name.theme`:**
1. Search `themes-files.json` by `filename` or `name` field
2. HEAD check `src/themes/name.theme.html`
3. HEAD check `src/themes/name.html`
4. Toast "not found" if all fail

**Important:** always call `history.replaceState(null, '', '/')` before `location.reload()` when applying a theme programmatically.

**Why:** when a user navigates to `/neural.theme`, `index.html` stores this URL in `localStorage` and reloads on `/neural.theme`. After reload, `app.js` runs `checkURLRoute()` which detects the `.theme` segment and re-applies the theme from the URL — overwriting whatever was just set in `localStorage`.

So if a user on `/neural.theme` uses the background picker to switch to `default`, and the picker does `localStorage.set('ym_theme_url', defaultUrl) + location.reload()` without clearing the URL, `checkURLRoute` will see `/neural.theme` again on reload and overwrite the user's choice with neural again.

`history.replaceState(null, '', '/')` clears the URL before reload so `checkURLRoute` sees no `.theme` segment and leaves `localStorage` untouched.

---

## P2P Network

YourMine uses [Trystero](https://github.com/dmotz/trystero) over Nostr relays for peer discovery and messaging.

**Default relays:**
- `wss://nos.lol`
- `wss://relay.primal.net`
- `wss://relay.nostr.wirednet.jp`
- `wss://nostr.oxtr.dev`

All peers join a shared room `ym-main` on app ID `yourmine-v1`. Messages are scoped by sphere name, so spheres only receive their own events.

---

## Mining, Score & Ranking

### Mining Formula

A user burns an amount **S** of SOL and selects a patience rate **T**. The immediate reward is **S(1−T) YM**. The rest grows over time as a claimable bonus. Every burn or claim resets the miner's personal clock.

```
       S · t^α
─────────────────────────────
[ln(A^β(1−T) + C)]^γ
```

**Computationally safe form** (avoids overflow, identical dynamics):

```
           S · t^α
──────────────────────────────────────────────────────
[β(1−T)·ln(A) + ln(1 + C / A^β(1−T))]^γ
```

| Variable | Meaning |
|----------|---------|
| `S` | Amount of the last burn |
| `t` | Time elapsed since last action (Solana slots) |
| `T` | Patience rate chosen by the user (0–1) |
| `A` | Protocol age (Solana block height) |
| `C` | Stabilisation constant |
| `α` | Temporal growth exponent |
| `β` | Patience / age interaction |
| `γ` | Concentration compression |

The formula integrates four distribution laws:
- **Pareto** — power-law economic distributions, stabilised by the protocol
- **Zipf** — rank hierarchy emerges naturally from participation
- **Boltzmann** — exponential outputs compressed by the logarithm
- **Odum** — time-based damping for long-term sustainability

**Token model:**
- **Soulbound position** — non-transferable; holds burn amount, patience rate, personal clock, production rights
- **Liquid token** — claimed YM rewards become standard transferable tokens, exchangeable and usable across apps

---

### Permission Score

Access to publishing is not granted by an authority — it is earned through participation. The mining formula produces a score that gates new sphere submissions.

**Condition to publish a new sphere:**

```
(score_now + 1) / (laps_now + 1)  >  (score_last + 1) / (laps_last + 1)
```

- `score` = claimable YM at the time of submission
- `laps` = Solana slots elapsed since last action

Rules:
- **First publication**: always allowed (no prior ratio exists)
- **New sphere**: ratio must strictly improve on last publication
- **Updating an existing sphere**: only requires GitHub or wallet ownership — no score check

This prevents spam and rewards consistency. Improvement is always accessible; new slots require demonstrated commitment.

---

### Ranking

Spheres and themes are ordered by **score descending**. No editorial curation, no advertising, no sponsored placement.

```
rank = score / laps
```

The ratio of claimable YM to time elapsed. A high-burn, patient miner who publishes at peak efficiency ranks highest.

Rules:
- Score is computed from the mining formula **at time of publication**
- Score is **frozen at merge time** — it represents effort at the moment of contribution
- Updating a sphere resets its score to the current mining state
- Higher burn + patience + elapsed time = higher score = higher rank
- Gaming is structurally penalised (publishing too early lowers the ratio)

---

*YourMine is open source and open by design. There is no central authority. Fork it, improve it, run it.*
