# YourMine

**A Soulnet for apps and value.**

> Give to receive. Build and deploy instantly. Fork it. Run it. Break it. Improve it.

YourMine is a distributed layer for applications and value, built on Solana. It is not a platform — it is an open, forkable system where participation generates value, identity is non-transferable, and anyone can run their own instance instantly.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Sphere API Specification](#sphere-api-specification)
- [Theme API Specification](#theme-api-specification)
- [Runtime Cycle & Lifecycle](#runtime-cycle--lifecycle)
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

### Theme Metadata (recommended)

Add a comment block at the top of your theme for discovery:

```html
<!--
  theme: My Theme Name
  author: @yourgithub
  description: A short description of the visual style
  preview: https://link-to-screenshot.png
-->
```

### Theme Picker Script

Include the standard theme picker script from `default.html` to populate the theme selector in the background dialog. The script must:
1. Fetch `themes/index.json` from the GitHub raw URL
2. Render a list of theme options with apply/active state
3. Support a custom URL input field

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
    "merged_at":      1700000100
  }
]
```

`codeUrl` is the only field used to load sphere code. It always points to the author's fork, never to the main repo.

### `themes/index.json` — Theme registry

```json
["default.html", "neural.html", "hello.html"]
```

Simple array of filenames. Themes are loaded from `themes/[filename]` on the main repo.

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
├── index.html
├── manifest.json
├── sw.js
├── files.json          ← sphere registry
├── events/             ← submission events (read by merge bot)
├── src/
│   ├── app.js
│   ├── desk.js
│   ├── mine.js
│   ├── build.js
│   ├── liste.js
│   ├── profile.js
│   └── themes/
│       ├── index.json  ← ["default.html","neural.html","hello.html"]
│       ├── default.html
│       ├── neural.html
│       └── hello.html
```

### Forking and running your own instance

```bash
# 1. Fork the repo on GitHub
# 2. Enable GitHub Pages (Settings → Pages → Branch: main)
# 3. Your instance runs at https://yourusername.github.io/YourMinedApp
# 4. Customize themes, publish spheres, connect to the same Nostr relays
```

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
