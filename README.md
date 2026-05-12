# YourMine

**A Soulnet for apps and value.**

> Give to receive. Build and deploy instantly. Fork it. Run it. Break it. Improve it.

YourMine is a distributed layer for applications and value, built on Solana. It is not a platform — it is an open, forkable system where participation generates value, identity is non-transferable, and anyone can run their own instance instantly.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Sphere API Specification](#sphere-api-specification)
- [Theme API Specification](#theme-api-specification)
- [External Apps & Bridge API](#external-apps--bridge-api)
- [Runtime Cycle & Lifecycle](#runtime-cycle--lifecycle)
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
ctx.send('myevent:action', { payload: 'data' });          // broadcast
ctx.send('myevent:action', { payload: 'data' }, peerId);  // direct

// Receiving
ctx.onReceive((type, data, peerId) => {
  if (type === 'myevent:action') { /* handle */ }
});
```

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
2. index.html injects edge-back UI (theme-proof)
3. index.html fetches theme HTML → injectTheme() → CSS in <head>, DOM in <body>
4. boot: await desk.js (execScript)
5. boot: await app.js (execScript)
6. app.js: OC() — creates profile if none
7. app.js: deskInit() → applyWP, buildSlider, goPage(0)
8. app.js: loads mine.js, liste.js, build.js, profile.js (sequential, from GitHub raw)
9. app.js: fetchSphereList() — populates sphere registry from files.json
10. app.js: restores active spheres from profile.spheres[]
11. app.js: activates social.sphere.js (mandatory)
12. app.js: initP2P() — Trystero via Nostr relays
13. app.js: hides loader on fonts.ready
```

### Sphere activation flow

```
YM.activateSphere(name, obj)
  → mkCtx(name)           — creates scoped context
  → obj.activate(ctx)     — 8s timeout enforced
  → addIcon(name, ...)    — adds to desktop
  → SP({spheres: [...]})  — saves to profile
  → dispatch 'ym:sphere-activated'
```

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

**Important:** always call `history.replaceState(null, '', '/')` before `location.reload()` when applying a theme programmatically, to prevent `checkURLRoute` from re-applying the old URL on the next load.

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

*YourMine is open source and open by design. There is no central authority. Fork it, improve it, run it.*
