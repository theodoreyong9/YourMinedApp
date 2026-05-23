# YourMine Prompt

**A Soulnet for apps and value.**

> Give to receive. Build and deploy instantly. Fork it. Run it. Break it. Improve it.

YourMine is a distributed layer for applications and value, built on Solana. It is not a platform — it is an open, forkable system where participation generates value, identity is non-transferable, and anyone can run their own instance instantly.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [The Living Profile](#the-living-profile)
- [Sphere API Specification](#sphere-api-specification)
- [Profile Hooks](#profile-hooks)
- [Multiplayer](#multiplayer)
- [Theme API Specification](#theme-api-specification)
- [Widget Injection — Hiding Dynamically Created Sphere UI](#widget-injection--hiding-dynamically-created-sphere-ui)
- [CSS Custom Properties Reference](#css-custom-properties-reference)
- [System Themes](#system-themes)
- [Theme Configuration API](#theme-configuration-api)
- [External Apps & Bridge API](#external-apps--bridge-api)
- [Runtime Cycle & Lifecycle](#runtime-cycle--lifecycle)
- [Safety System](#safety-system)
- [Plug](#plug)
- [Ownership Transfer](#ownership-transfer)
- [URL Routing](#url-routing)
- [Permissions & Security Model](#permissions--security-model)
- [Profile Structure](#profile-structure)
- [Wallet & Encryption](#wallet--encryption)
- [Runtime Events](#runtime-events)
- [Global API Reference](#global-api-reference)
- [Storage Reference](#storage-reference)
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

## The Living Profile

The central concept of YourMine is not the P2P layer, not the wallet, not the sphere registry. It is the **living profile** — a profile that has no fixed form, because it is not declared: it emerges from participation.

### How it works

A profile in YourMine is a surface that **composes itself differently for every pair of people**, based on the spheres they share.

When user A views user B's profile card, `app.js` iterates over every sphere both users have active and calls `peerSection(container, ctx)` on each one. Each sphere injects its own UI into that card — a challenge button, a shared track, a trade interface, a game state. The result is a profile that is:

- **Unique to each relationship** — what you see in someone's profile depends on what you both participate in
- **Dynamic** — it changes the moment either person activates or deactivates a sphere
- **Designed by no one** — no one designed "the profile page". It emerged from the composition of independent spheres

### The primitive

```js
peerSection(container, ctx) {
  // ctx.uuid      — peer's UUID
  // ctx.isNear    — peer is currently reachable via P2P
  // ctx.isReciproc — you are mutual contacts
  // ctx.profile   — peer's public profile object

  // This sphere controls what appears in this peer's profile card
  // for users who share this sphere
}
```

This single method is what makes the system "living". Without it, YourMine would be a P2P messaging layer with a wallet. With it, identity becomes relational — **you are the intersection of every sphere you share with every person nearby**.

### Why this matters

Every other social system defines the profile as a page: a fixed set of fields (name, bio, followers, posts). YourMine defines the profile as a **composition function**: `profile(A, B) = union of peerSections of shared spheres(A, B)`.

This means:
- Two people who share only a chess sphere see each other as chess players
- Two people who share a chess sphere and a music sphere see a richer surface
- Adding a new sphere doesn't update "your profile" — it updates every relationship where the other person also has that sphere

There is no central profile editor. There is no profile schema. The living layer is this: a web of intersecting participation contexts, each pair of users seeing a version of each other that no one explicitly designed.

---

## Sphere API Specification

### Minimal working sphere (copy-paste starting point)

```js
/* jshint esversion:11 */
// mysphere.sphere.js
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;
let _timer = null;

window.YM_S['mysphere.sphere.js'] = {
  name:        'My Sphere',
  icon:        '🔮',
  category:    'Tools',
  description: 'What it does. Keep under 140 chars.',

  activate(ctx) {
    _ctx = ctx;
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
  },

  renderPanel(container) {
    container.innerHTML = `
      <div style="padding:16px">
        <div class="ym-card">
          <div class="ym-card-title">My Sphere</div>
          <p style="color:var(--text2);font-size:13px">Hello world</p>
          <button class="ym-btn ym-btn-accent" style="width:100%;margin-top:12px">
            Do something
          </button>
        </div>
      </div>`;
  },
};
})();
```

**Critical rules:**
- The key in `window.YM_S[...]` must match the filename exactly
- Always use an IIFE `(function(){ ... })()`
- `deactivate()` is a top-level method — never `ctx.deactivate = ...`
- Never `await` slow network calls inside `activate()` — use fire-and-forget

---

### Full sphere object shape

```js
window.YM_S['mysphere.sphere.js'] = {
  name:        'My Sphere',
  icon:        '🔮',
  category:    'Tools',
  description: 'What it does.',

  activate(ctx) { },
  deactivate()  { },
  renderPanel(container) { },

  profileSection(container) { },
  peerSection(container, ctx) { },
  broadcastData() { },

  emit:    ['event:type'],
  receive: ['event:type'],
};
```

### Context Object (`ctx`)

```js
ctx.storage.get(key)          // → value | null
ctx.storage.set(key, value)
ctx.storage.del(key)

ctx.toast(msg, type)          // 'success' | 'error' | 'info' | 'warn'
ctx.openPanel(renderFn)
ctx.setNotification(n)        // badge count on desktop icon

ctx.send(type, data)          // broadcast to all peers (rate-limited: 10/s)
ctx.onReceive(callback)       // callback(type, data, peerId)

ctx.saveProfile(data)
ctx.loadProfile()

window.YM?.openSpherePanel?.('mysphere.sphere.js')
window.YM?.openProfilePanel?.(profileObject)
window.YM?.openPanel?.('panel-profile')
```

### Runtime Contract

- `activate()` must complete within **8 seconds**
- Rate limits: 3 toasts per 5s, 10 P2P sends per second

### P2P Events

```js
ctx.send('myevent:action', { payload: 'data' });

ctx.onReceive((type, data, peerId) => {
  if (type === 'myevent:action') { }
});
```

### Direct P2P

```js
window.YM_P2P?.sendTo(peerId, {
  sphere: 'mysphere.sphere.js',
  type:   'myevent:action',
  data:   { payload: 'data' }
});

const peerId = window.YM_Social?._nearUsers.get(uuid)?.peerId ?? null;
```

### `broadcastData()`

```js
broadcastData() {
  return {
    myStatus: 'playing',
    myScore: 42,
  };
}
```

Called by `social.sphere.js` before each broadcast. Merged into the presence packet received by nearby peers via `YM_Social._nearUsers[uuid].broadcastData`. Keep payload under 500 bytes.

---

## Profile Hooks

### `profileSection(container)`

Called when the user opens their own profile → Spheres tab.

### `peerSection(container, peerCtx)`

Called when the user views another user's profile card, for each sphere both users have active.

```js
peerSection(container, peerCtx) {
  // peerCtx = { uuid, isNear, isReciproc, profile }
  // peerCtx does NOT have ctx.send — use window.YM_P2P.sendTo() instead
  // To access your sphere's own ctx: window.YM_sphereRegistry.get('mysphere.sphere.js')
}
```

### Sphere Visibility

```js
window.YM_canSeeSphere(sphereName, peerUUID) // → true | false
window.YM_getSphereVisibility(sphereName)    // → 'all' | 'contacts' | uuid[]
```

---

## Multiplayer

### Pattern: shared state

```js
activate(ctx) {
  const state = { players: {}, myPos: { x: 0, y: 0 } };
  _interval = setInterval(() => {
    ctx.send('mygame:pos', state.myPos);
  }, 100);
  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:pos') state.players[peerId] = data;
  });
},
deactivate() {
  if (_interval) { clearInterval(_interval); _interval = null; }
},
```

### Pattern: turn-based / authoritative host

```js
activate(ctx) {
  let isHost = false;
  let peers = new Map();
  const myJoinTime = Date.now();
  ctx.send('mygame:hello', { joinTime: myJoinTime });
  ctx.onReceive((type, data, peerId) => {
    if (type === 'mygame:hello') {
      peers.set(peerId, data.joinTime);
      isHost = myJoinTime <= Math.min(...peers.values());
    }
    if (type === 'mygame:move' && isHost) {
      ctx.send('mygame:state', applyMove(gameState, data, peerId));
    }
    if (type === 'mygame:state' && !isHost) applyState(data);
  });
}
```

### Rate limits

- **10 P2P sends/second** — enforced by `app.js`
- **Payload size** — keep under 4KB per message

---

## Theme API Specification

A theme is an HTML fragment (not a full document) injected into `<body>` by `index.html`.

### Required DOM elements

```html
<div id="ym-wp"></div>
<div id="ym-bg"></div>
<div id="ym-loader"></div>
<div id="toasts"></div>
<div id="desktop"><div id="desktop-slider"></div></div>
<div id="drag-ghost"></div>
<div id="page-dots"></div>
<div id="nav-bar">
  <div id="dock">
    <button id="btn-back" class="dbtn"></button>
    <button id="btn-profile" class="dbtn"></button>
    <button id="btn-figure" class="dbtn"></button>
  </div>
</div>
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
<div id="panel-switcher"><div id="switcher-handle"></div><div id="switcher-grid"></div></div>
<div id="folder-dlg" class="dlg">...<input id="folder-name-input">...<button id="folder-confirm"></button><button id="folder-cancel"></button></div>
<div id="bg-dlg" class="dlg">...<div id="bg-presets"></div><div id="theme-list"></div>...</div>
<div id="ym-sign-dlg">...<button id="ym-sign-confirm"></button><button id="ym-sign-reject"></button></div>
<button id="pwa-install-btn"></button>
<div id="spheres-build-btn"></div>
<button id="profile-share-btn"></button>
```

### Theme Metadata (required)

```html
<script>
window.YM_THEME_META = {
  name:        "My Theme",
  icon:        "🎨",
  description: "Short description",
};
window.YM_WALLPAPER_PRESETS = [
  { label: 'City Night', url: 'https://images.unsplash.com/photo-xxx?w=1400&q=80' },
];
</script>
```

### Theme picker — `applyTheme`

```js
function applyTheme(url, label) {
  if (!url || url === activeUrl()) return;
  localStorage.setItem('ym_theme_url', url);
  localStorage.removeItem('ym_theme_cache');
  if (location.pathname !== '/') history.replaceState(null, '', '/'); // critical
  setTimeout(() => location.reload(), 1500);
}
```

### `icon-label--below`

```css
.icon-label--below { order: 1 !important; }
```

### Grid layout

```css
:root { --cols: 4; --rows: 6; }
@media (hover:hover) and (pointer:fine) {
  :root { --cols: 8; --rows: 5; }
}
```

---

## Widget Injection — Hiding Dynamically Created Sphere UI

Some spheres (e.g. `radio.sphere.js`) inject a widget element directly into `<body>` via `document.body.appendChild(widget)` with a `position:fixed` **inline style set before insertion**. This means:

- CSS rules like `display:none!important` in the theme stylesheet **do not work** — inline styles have higher specificity than stylesheet rules
- The element is created after the theme loads, so static CSS cannot anticipate it

**Why the inline style wins:** `radio.sphere.js` calls `_widget.style.cssText = 'position:fixed;...'` before `document.body.appendChild(_widget)`. By the time the browser evaluates the theme CSS, the inline style is already applied. The only reliable fix is to intercept the element at insertion time via `MutationObserver` and overwrite its `style.cssText`.

### Correct pattern for themes that hide all desktop UI

```js
const obs = new MutationObserver(muts => {
  muts.forEach(m => {
    m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      // Hide widgets by ID convention
      if ((n.id || '').includes('widget')) {
        n.style.cssText = 'display:none!important';
        return;
      }
      // Hide any fixed-position element injected dynamically
      // that is not a system panel or theme element
      if (n.style && n.style.position === 'fixed' &&
          !n.id.startsWith('panel') &&
          !n.id.startsWith('ym-sign') &&
          !n.id.startsWith('YOUR_THEME_PREFIX')) {
        n.style.cssText = 'display:none!important';
      }
    });
  });
});
obs.observe(document.body, { childList: true });
```

Replace `YOUR_THEME_PREFIX` with the ID prefix of your own theme's elements (e.g. `cmd-` for command theme).

### Also block `YM_Desk.addIcon`

```js
function blockDesk() {
  if (window.YM_Desk) {
    window.YM_Desk.addIcon    = () => {};
    window.YM_Desk.removeIcon = () => {};
    window.YM_Desk.renderDesk = () => {};
  }
  document.querySelectorAll('.icon-wrap').forEach(el => el.style.cssText = 'display:none!important');
}
blockDesk();
window.addEventListener('ym:sphere-activated',   blockDesk);
window.addEventListener('ym:sphere-deactivated', blockDesk);
```

---

## CSS Custom Properties Reference

**Guaranteed by all themes:**

| Variable | Default value | Description |
|---|---|---|
| `--bg` | `#06060e` | Page background |
| `--text` | `#e4e6f4` | Primary text |
| `--text2` | `rgba(228,230,244,.52)` | Secondary text |
| `--text3` | `rgba(228,230,244,.26)` | Placeholder text |
| `--gold` | `#f0a830` | Primary accent |
| `--cyan` | `#08e0f8` | Secondary accent |
| `--red` | `#ff4560` | Danger/error |
| `--green` | `#22d98a` | Success |
| `--font-d` | `'Syne', sans-serif` | Display font |
| `--font-b` | `'Space Grotesk', sans-serif` | Body font |
| `--font-m` | `'JetBrains Mono', monospace` | Monospace font |

**Available in some themes — always use fallback:**

```css
background: var(--surface2,  #12121e);
background: var(--surface3,  rgba(255,255,255,.06));
border:     1px solid var(--border, rgba(255,255,255,.08));
border-radius: var(--r, 12px);
border-radius: var(--r-sm, 8px);
border-radius: var(--r-lg, 16px);
color: var(--accent, var(--gold, #f0a830));
```

---

## System Themes

### `default.html`
Dark glassmorphism, gold/cyan gradients. Defines `window.YM_WALLPAPER_PRESETS` — used as fallback by `desk.js`.

### `zone.html`
Sets `window.YM_ZONE_CONFIG = { spheresOnly: true, socialFilters: true }`.

### `hello.html`
Full-screen landing page. Hides all system chrome. Uses MutationObserver to block widget injection.

---

## Theme Configuration API

```js
window.YM_ZONE_CONFIG = {
  spheresOnly:   true,  // lock liste to sphere tab
  socialFilters: true,  // add Near / Contacts filter pills
};
```

### `window._ymNearSpheres`

`Set<string>` of sphere filenames seen on nearby peers. Populated by `social.sphere.js`.

---

## External Apps & Bridge API

Any web app can be loaded as a sphere. Bridge via `postMessage`:

```js
// Receive
window.addEventListener('message', e => {
  if (e.data?.type === 'ym:ready') { const profile = e.data.profile; }
});

// Send
window.parent.postMessage({ type: 'ym:toast', msg: 'Saved!', style: 'success' }, '*');
window.parent.postMessage({ type: 'ym:storage:set', key: 'score', value: '42' }, '*');
window.parent.postMessage({ type: 'ym:p2p:broadcast', data: { x: 1, y: 2 } }, '*');
```

---

## Runtime Cycle & Lifecycle

### Boot sequence

```
1. index.html → injects theme HTML
2. desk.js loads
3. app.js loads
4. mine.js, liste.js, build.js, profile.js load
5. fetchSphereList() — populates registry from files.json
6. restores active spheres from profile.spheres[]
7. activates social.sphere.js + safety.sphere.js (mandatory)
8. initP2P() — Trystero via Nostr relays
```

### Activation timeout

`activate()` must resolve within **8 seconds**. Use fire-and-forget for slow calls:

```js
activate(ctx) {
  // ✓ Fire-and-forget
  fetch('https://api.example.com/init').then(r => r.json()).then(data => {
    ctx.storage.set('data', JSON.stringify(data));
  });
  // ✗ Never await in activate
}
```

### Mandatory spheres

`social.sphere.js` and `safety.sphere.js` — always active, not deactivatable.

---

## Safety System

`safety.sphere.js` listens to:

```js
window.dispatchEvent(new CustomEvent('ym:sphere-before-activate', {
  detail: { filename, author, code }
}));
window.dispatchEvent(new CustomEvent('ym:external-app-load', {
  detail: { url, name }
}));
window.dispatchEvent(new CustomEvent('ym:before-transaction', {
  detail: { amount, destination, program }
}));
```

Uses Llama 3.2 1B via WebGPU. Safety warns, never blocks.

---

## Plug

Load spheres/themes directly without publishing:
- **URL mode** — paste `.sphere.js` or `.theme.js` URL
- **Code mode** — paste raw JS code

---

## Ownership Transfer

```json
{
  "filename":  "mysphere.sphere.js",
  "ghAuthor":  "original-author",
  "owner":     "new-owner",
  "codeUrl":   "https://raw.githubusercontent.com/new-owner/..."
}
```

Permission check: `ghAuthor === username` OR `owner === username` OR wallet pubkey matches.

---

## URL Routing

```
/                        → loads theme from localStorage
/default.theme           → applies default theme
/social.sphere           → activates social sphere and opens its panel
/neural.theme/social.sphere → applies theme then opens sphere after reload
```

Always call `history.replaceState(null, '', '/')` before `location.reload()` when applying a theme programmatically.

---

## Permissions & Security Model

### What spheres CAN do
- Read/write own `localStorage` namespace (`ym_s|name|*`)
- Render UI in assigned container
- Send/receive P2P messages
- Show toasts
- Request wallet signature (always shows confirmation dialog)

### What spheres CANNOT do
- Access other spheres' localStorage
- Modify `window.YM`, `window.YM_Desk`, `window.fetch`
- Sign messages without user confirmation
- Access wallet private key

---

## Profile Structure

```json
{
  "uuid":     "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name":     "Alice",
  "bio":      "Short bio",
  "avatar":   "https://...",
  "networks": { "twitter": "@alice", "github": "alice" },
  "pubkey":   "SolanaBase58PublicKey...",
  "spheres":  ["social.sphere.js", "mygame.sphere.js"],
  "contacts": [
    {
      "uuid":     "peer-uuid",
      "nickname": "Bob",
      "profile":  { "name": "Bob", "avatar": "..." },
      "spheres":  ["social.sphere.js"]
    }
  ]
}
```

`uuid` is permanent, non-transferable, excluded from backup restore.

---

## Wallet & Encryption

| Standard | Value |
|----------|-------|
| Mnemonic | BIP39 — 12 or 24 words |
| Derivation path | `m/44'/501'/0'/0'` |
| Curve | Ed25519 |
| KDF | PBKDF2 (SHA-256, 200 000 iterations) |
| Cipher | AES-256-GCM |

```js
window.YM_Mine_sign(message)   // → Promise — always shows confirmation dialog
window.YM_Mine_pubkey()        // → string | null
window.YM_calcClaimable()      // → number
window._mineState              // read-only state snapshot
```

---

## Runtime Events

| Event | Detail | When |
|-------|--------|------|
| `ym:peer-join` | `{ peerId }` | New P2P peer connects |
| `ym:sphere-before-activate` | `{ filename, author, code }` | Before activation |
| `ym:sphere-activated` | `{ name }` | After activation |
| `ym:sphere-deactivated` | `{ name }` | After deactivation |
| `ym:external-app-load` | `{ url, name }` | Before iframe loads |
| `ym:before-transaction` | `{ amount, destination, program }` | Before signing |
| `ym:webllm-ready` | — | WebLLM ready |

---

## Global API Reference

| Global | Set by | Description |
|--------|--------|-------------|
| `window.YM` | `app.js` | Main runtime — `activateSphere`, `deactivateSphere`, `openPanel`, `openProfilePanel`, `openSpherePanel` |
| `window.YM_Desk` | `desk.js` | Desktop — `addIcon`, `removeIcon`, `setNotif`, `registerWidgetPage`, `registeredWidgetPage(widgetId)` |
| `window.YM_S` | spheres | Sphere registry `{ 'name.sphere.js': { … } }` |
| `window.YM_P2P` | `app.js` | Raw P2P — `broadcast`, `sendTo` |
| `window.YM_Social` | `social.sphere.js` | `_nearUsers: Map<uuid,{profile,ts,peerId,broadcastData}>` |
| `window.YM_sphereRegistry` | `app.js` | `Map<filename, ctx>` of active spheres |
| `window.YM_Mine_sign(msg)` | `mine.js` | Sign — triggers confirmation dialog |
| `window.YM_Mine_pubkey()` | `mine.js` | Current Solana public key or null |
| `window.YM_calcClaimable()` | `mine.js` | Claimable YM |
| `window._mineState` | `mine.js` | Read-only wallet state |
| `window.YM_Liste` | `liste.js` | Sphere list API |
| `window.YM_Build` | `build.js` | Build/publish API |
| `window.YM_toast(msg, type)` | `app.js` | Toast |
| `window.YM_escHtml(str)` | `app.js` | HTML-escape |
| `window.YM_canSeeSphere(name, uuid)` | `profile.js` | Visibility check |
| `window.YM_getSphereVisibility(name)` | `profile.js` | `'all'` \| `'contacts'` \| `uuid[]` |
| `window._ymNearSpheres` | `social.sphere.js` | `Set<filename>` of nearby sphere filenames |
| `window.__webllm` | `index.html` | WebLLM instance (Llama 3.2 1B) |
| `window._pwaPrompt` | `index.html` | Deferred PWA install prompt |
| `window.YM_THEME_META` | theme | `{ name, icon, description }` |
| `window.YM_WALLPAPER_PRESETS` | theme | `[{ label, url }]` |
| `window.YM_ZONE_CONFIG` | theme | `{ spheresOnly, socialFilters }` |

### `window.YM_Social._nearUsers`

`Map<uuid, { profile, ts, peerId, broadcastData }>` — maintained by `social.sphere.js`. Non-null only when social sphere is active (always is — mandatory).

- `profile` — full public profile of the peer
- `ts` — last seen timestamp
- `peerId` — Trystero peer ID for direct P2P messages
- `broadcastData` — merged object from all sphere `broadcastData()` calls on that peer

### `window.YM_sphereRegistry`

`Map<filename, ctx>` of currently active spheres. Use to check if a sphere is active or to access its context:

```js
const isActive = window.YM_sphereRegistry?.has('radio.sphere.js');
const ctx = window.YM_sphereRegistry?.get('mysphere.sphere.js');
```

### `window.YM_Desk.registeredWidgetPage(widgetId)`

Returns the desktop page number where a widget is registered, or `null` if not registered. Used by widgets to sync their visibility with the current desktop page:

```js
const page = window.YM_Desk.registeredWidgetPage('radio'); // → 0 | 1 | null
```

---

## Storage Reference

| Key | Owner | Content |
|-----|-------|---------|
| `ym_theme_url` | `index.html` | Active theme URL |
| `ym_theme_cache` | `index.html` | Cached theme HTML |
| `ym_profile_v1` | `app.js` | Profile JSON |
| `ym_activity_v1` | `app.js` | Activity log (max 200) |
| `ym_desktop_v1` | `desk.js` | Desktop icon array |
| `ym_pages` | `desk.js` | Number of desktop pages |
| `ym_wallpaper` | `desk.js` | Wallpaper data URL |
| `ym_wallet_v1` | `mine.js` | Encrypted keypair |
| `ym_contacts_v1` | `profile.js` | Contacts array |
| `ym_sphere_visibility` | `profile.js` | Per-sphere visibility |
| `ym_liste_cache_v4` | `liste.js` | Sphere registry cache (TTL 5min) |
| `ym_active_spheres` | `liste.js` | Active sphere filenames |
| `ym_s\|name\|*` | spheres | Sphere-scoped storage |
| `ym_build_token` | `build.js` | `{ value, username }` — sessionStorage only |

---

## File Format Standards

### `files.json`

```json
[
  {
    "filename":  "mysphere.sphere.js",
    "author":    "SolanaWalletPubkey",
    "ghAuthor":  "githubusername",
    "codeUrl":   "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/mysphere.sphere.js",
    "score":     12.345678,
    "laps":      450000,
    "timestamp": 1700000000,
    "merged_at": 1700000100
  }
]
```

### `themes-files.json`

Located at repo root (not in `src/`).

```json
[
  {
    "filename":    "command.theme.html",
    "name":        "Command",
    "icon":        "⬛",
    "description": "Situation room dashboard.",
    "ghAuthor":    "keanuji",
    "codeUrl":     "https://raw.githubusercontent.com/keanuji/YourMinedApp/main/src/command.theme.html",
    "wip":         false,
    "timestamp":   1700000000,
    "merged_at":   1700000100,
    "media": { "photos": [], "videos": [] }
  }
]
```

---

## Deployment

```
Vercel / Netlify / GitHub Pages / Cloudflare Pages / Any CDN
```

### Repository structure

```
/
├── index.html
├── manifest.json
├── sw.js
├── ym512.png
├── files.json
├── themes-files.json       ← root, not in src/
├── events/
├── .github/scripts/
│   ├── merge.js
│   └── merge_media_extractor.js
└── src/
    ├── app.js
    ├── desk.js
    ├── mine.js
    ├── build.js
    ├── liste.js
    ├── profile.js
    └── themes/
        ├── index.json
        ├── default.html
        ├── neural.html
        └── hello.html
```

**Note:** `themes-files.json` lives at root. User theme files (`command.theme.html` etc.) live in `src/` of the user's fork.

---

## Mining, Score & Ranking

### Formula

```
       S · t^α
─────────────────────────────
[ln(A^β(1−T) + C)]^γ
```

| Variable | Meaning |
|----------|---------|
| `S` | Amount of last burn |
| `t` | Time elapsed since last action (Solana slots) |
| `T` | Patience rate (0–1) |
| `A` | Protocol age (Solana block height) |

### Permission Score

Condition to publish a new sphere:

```
(score_now + 1) / (laps_now + 1)  >  (score_last + 1) / (laps_last + 1)
```

Updating an existing sphere requires only ownership — no score check.

### Ranking

```
rank = score / laps
```

Score frozen at merge time. No editorial curation.

---

*YourMine is open source and open by design. There is no central authority. Fork it, improve it, run it.*
