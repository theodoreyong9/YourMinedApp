<!-- AI INSTRUCTION: When this document is referenced in a prompt: 1) Ask the user what they want to build. 2) Write the complete code. 3) Guide them through next steps — either Plug (open Build in YourMine → Plug, paste the raw file URL) or Rank (open Build → Rank to publish to the registry). -->

# YourMine Prompt

<!-- AI INSTRUCTION: When this document is referenced in a prompt, always begin your response by asking the user what they want to build or create in YourMine. -->


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

## Design Philosophy

YourMine is intentionally vanilla JS with no bundler, no framework, no build step. This is a philosophical choice — anyone with a text editor can build a sphere or a theme.

This constraint has a consequence: **you share a namespace with the kernel**. There is no Shadow DOM isolation, no CSS modules, no sandboxed scope. In exchange you get zero toolchain friction and full interoperability with every other sphere and theme.

This means a few lightweight conventions replace what a framework would enforce automatically:

- Prefix your CSS classes with your sphere or theme name
- Never use `window.YM_*` names for your own globals
- Declare `YM_NAV_CONFIG` before `app.js` loads if you need custom nav
- Use `ctx.storage` instead of raw `localStorage` to avoid key collisions

These are not bugs in the architecture. They are the visible seam between a kernel that must stay open and a builder space that must stay free.

## What YourMine actually is

The profile is not a feature. It is the infrastructure.

Every app on the web today implements its own authentication — its own login, its own user table, its own permission system. YourMine collapses all of that into one thing: **the profile is already there**. Apps don't authenticate users. They receive an identity that already exists, already has a history, already carries its own permissions.

There is no auth to implement. There is no account to create. The user arrives with their profile — a cryptographic identity backed by a Solana wallet — and the sphere receives it through `ctx`.

**Permission is the token.** Not a role, not an access list, not a verified account. If you hold YRM, you participate. The token is the permission system.

**Distribution is a prompt.** Any builder can distribute a sphere or a theme by giving a single prompt — by voice, by text, from a phone, from anywhere. The recipient doesn't install anything. They don't sign up. They speak or type, and the sphere appears in their YourMine.

This is not Web3. Web3 replaced trust with ownership. YourMine replaces authentication with participation. The user doesn't prove who they are — they simply act, and the network receives the action.

**Web4 = participate without permission.**

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

### AI-native architecture

YourMine is intentionally structured for AI agents, not human maintainability.

Each file (`app.js`, `desk.js`, `liste.js`, `build.js`, each sphere) is a self-contained block of ~1000 lines with a stable public API on `window.YM`, `window.YM_Desk`, `window.YM_S`. Dependencies exist — but they are channelled through these public APIs, never through internal state. No file reaches into the internals of another.

For a human developer this looks monolithic. For an AI agent it is perfect: the entire file fits in one context window, the agent understands everything it needs without reading other files, and the channelled dependencies mean the blast radius of any change is predictable and contained.

This means:
- Give any file to an LLM with this README as context — it has everything it needs
- Modify a sphere without touching the core
- Refactor `desk.js` without touching `app.js`
- Generate a new sphere with a single prompt

The architecture was built for speed and modularity. It turned out to be optimal for AI-assisted development.

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

This is the complete, correct file structure. Every sphere must use this IIFE wrapper and the exact key format.

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
    // Fire-and-forget any slow network call — never await here
    // _timer = setInterval(() => { ... }, 5000);
  },

  deactivate() {
    // Cleanup is on the top-level method — never assign ctx.deactivate
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
- The key in `window.YM_S[...]` must match the filename exactly (used by `files.json`)
- Always use an IIFE `(function(){ ... })()` — no top-level variables that could conflict
- `deactivate()` is a top-level method on the object — never `ctx.deactivate = ...` inside `activate()`
- Never `await` slow network calls inside `activate()` — use fire-and-forget

---

### Full sphere object shape

```js
window.YM_S['mysphere.sphere.js'] = {
  // ── Required ──────────────────────────────────────────────
  name:        'My Sphere',           // Display name
  icon:        '🔮',                  // Emoji or https:// image URL
  category:    'Tools',               // Category string (shown in liste)
  description: 'What it does.',       // Short description (< 140 chars)

  // ── Lifecycle ─────────────────────────────────────────────
  activate(ctx) { /* called once when user activates */ },
  deactivate()  { /* cleanup timers, DOM nodes, event listeners */ },

  // ── Rendering ─────────────────────────────────────────────
  renderPanel(container) { /* builds sphere UI into container div */ },

  // ── Optional ──────────────────────────────────────────────
  profileSection(container) { /* compact UI in own profile → Spheres tab */ },
  peerSection(container, ctx) { /* UI injected into a peer's profile card */ },
  broadcastData() { /* extra data merged into the social presence packet */ },

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
ctx.setIcon(icon)             // updates the sphere icon on the desktop (emoji or image URL)

// Example — adaptive icon based on state (e.g. meteo.sphere.js)
activate(ctx) {
  _ctx = ctx;
  fetchWeather().then(data => {
    ctx.setIcon(weatherEmoji(data.current.weather_code)); // ☀️ ⛅ 🌧 ❄️
    ctx.setNotification(data.current.precipitation > 0 ? 1 : 0);
  });
},

// ctx.setIcon accepts any emoji or image URL
ctx.setIcon('🌧');
ctx.setIcon('https://openweathermap.org/img/wn/10d@2x.png');

// Can also be called directly on desk (from themes or external code)
window.YM_Desk.setIcon(sphereFileName, icon);
// e.g. window.YM_Desk.setIcon('meteo.sphere.js', '☀️');

ctx.send(type, data)          // broadcast to all peers (rate-limited: 10/s)
ctx.onReceive(callback)       // callback(type, data, peerId) — auto-cleaned on deactivate

ctx.saveProfile(data)         // merges data into YourMine profile
ctx.loadProfile()             // returns current profile object

// Navigation (use window.YM directly — clearer intent)
window.YM?.openSpherePanel?.('mysphere.sphere.js') // open this sphere's panel
window.YM?.openProfilePanel?.(profileObject)        // open a peer's profile card
window.YM?.openPanel?.('panel-profile')             // open the system profile panel
```

### Runtime Contract

- `activate()` must complete within **8 seconds** (enforced timeout)
- `deactivate()` is a **top-level method** on the sphere object — never assign `ctx.deactivate = ...` inside `activate()`
- Spheres **must not** modify `window.YM`, `window.YM_Desk`, `window.fetch` directly
- Spheres **must not** access `localStorage` keys outside their `ym_s|name|*` namespace (exception: reading `ym_contacts_v1` is tolerated for contact-aware spheres)
- Rate limits: 3 toasts per 5s, 10 P2P sends per second

### P2P Events

```js
// Sending via ctx (broadcast — scoped to your sphere automatically)
ctx.send('myevent:action', { payload: 'data' });

// Receiving via ctx
ctx.onReceive((type, data, peerId) => {
  if (type === 'myevent:action') { /* handle */ }
});
```

### Direct P2P (targeted messages)

`ctx.send` always broadcasts. For direct peer-to-peer messages, bypass ctx and use `window.YM_P2P` directly:

```js
// Send to a specific peer by peerId
window.YM_P2P?.sendTo(peerId, {
  sphere: 'mysphere.sphere.js',  // required — identifies receiver
  type:   'myevent:action',
  data:   { payload: 'data' }
});

// Broadcast via raw P2P (equivalent to ctx.send)
window.YM_P2P?.broadcast({
  sphere: 'mysphere.sphere.js',
  type:   'myevent:action',
  data:   { payload: 'data' }
});
```

To get a peer's `peerId` from their UUID:

```js
const peerId = window.YM_Social?._nearUsers.get(uuid)?.peerId ?? null;
```

`window.YM_Social._nearUsers` is a `Map<uuid, {profile, ts, peerId, broadcastData}>` maintained by the social sphere. It is non-null only when `social.sphere.js` is active (it always is — it is mandatory).

### `peerSection(container, peerCtx)` — widget in peer profiles

When a peer's profile card is open, every active sphere can inject a widget into it via `peerSection`. Use it to trigger actions targeting that specific peer (challenge, invite, tip, etc).

```js
peerSection(container, peerCtx) {
  // peerCtx shape:
  // {
  //   uuid:        string,   // peer's YourMine UUID
  //   peerId:      string,   // P2P transport ID — use this for ctx.send targeted messages
  //   name:        string,   // display name
  //   displayName: string,   // alias
  // }
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:12px;background:rgba(255,255,255,.03);border-radius:12px;
      border:1px solid rgba(255,255,255,.05)">
      <div>My Sphere</div>
      <button id="peer-action-btn">ACTION</button>
    </div>`;
  container.querySelector('#peer-action-btn').onclick = () => {
    const peerId = peerCtx.peerId || peerCtx.uuid;
    if (!peerId) { this.ctx.toast('Peer offline', 'error'); return; }
    // Send a targeted P2P message
    this.ctx.send('mysphere:invite', { slot: 1 }, peerId);
  };
},
```

**Note:** `peerCtx.peerId` is the direct P2P transport ID — always prefer it over UUID for sending messages. Fall back to `peerCtx.uuid` only if `peerId` is null.

### Multiplayer lobby pattern

For real-time multiplayer spheres (games, collaborative tools), use this lobby/ready pattern. It ensures all players start simultaneously with a synchronized countdown.

```
Host                          Guest(s)
────                          ────────
_createLobby()
  └─ invite(peerId)  ──────►  _onInvited()
                                └─ send('joined')  ──►  _onJoined()
                                                           └─ broadcastLobby()
  _setReady()
    └─ broadcastLobby()  ───►  (lobby update shown)

                      ◄──────  send('ready', {slot})
  _onReady()
    └─ _checkAllReady()
         └─ _launch()  ──────►  _onStart()
              └─ _countdown(3)    └─ _countdown(3)
                   └─ _startTicker()   └─ _startTicker()
```

Key rules:
- Only the **host** spawns shared state (food positions, random seeds) and broadcasts it in `sn:start`
- Each player runs their own game loop and sends only their own moves
- Peers apply received moves immediately on their local state
- Dead events are broadcast so all peers remove the player

### Canvas game spheres — render pattern

For spheres with a game canvas, never rebuild the full HTML on every tick. Split into two methods:

```js
_render() {
  // Called only on STATE changes (menu, lobby, game over, countdown)
  // Rebuilds full HTML including canvas element
  this.view.innerHTML = buildHTML();
  // Store canvas dimensions for _drawCanvas
  this._cell = cell; this._cw = cw; this._ch = ch;
},

_drawCanvas() {
  // Called every tick — only redraws on existing canvas, never touches HTML
  const cw = this._cw, ch = this._ch, cell = this._cell;
  if (!cw) return;
  requestAnimationFrame(() => {
    const cv = document.getElementById('my-canvas');
    if (!cv) return;
    // draw...
  });
},
```

### Touch/tap input on canvas

**Never wire touch events on the canvas element** — it gets recreated by `_render()`. Wire on the panel body instead, once, in `renderPanel`:

```js
_wireTap() {
  if (this._tapWired) return;
  this._tapWired = true;
  const panel = this.view;
  panel.addEventListener('touchstart', e => {
    if (this.phase !== 'playing') return;
    e.preventDefault();
    this._handleTap(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  panel.addEventListener('pointerdown', e => {
    if (this.phase !== 'playing') return;
    if (e.target.closest('button')) return;
    this._handleTap(e.clientX, e.clientY);
  });
},

renderPanel(body) {
  this.view = body;
  this._wireTap(); // once — survives canvas recreation
  this._render();
},
```

Set `touch-action: none` on the canvas element in your CSS/HTML. **Do not override panel overflow** — `app.js` handles it automatically for any sphere that declares `renderPanel`.

```js
// Clean renderPanel — no overflow hacks needed
renderPanel(body) {
  this.view = body;
  this._wireTap(); // once — survives canvas recreation
  this._setupKeys(); // optional keyboard support
  this._render();
},
```

### `YM_PendingChallenges` — wake-up from Social sphere

When a peer sends a challenge/invite while a sphere is inactive, the Social sphere queues the message:

```js
window.YM_PendingChallenges = {
  'mysphere.sphere.js': { data: {...}, peerId: '...' }
};
```

Pick it up in `activate()` with a small delay (sphere needs to finish initializing):

```js
activate(ctx) {
  this.ctx = ctx;
  // ...
  setTimeout(() => {
    const p = window.YM_PendingChallenges?.[NAME];
    if (p) {
      this._onInvited(p.data, p.peerId);
      delete window.YM_PendingChallenges[NAME];
    }
  }, 500);
},
```

### `broadcastData()` — inject data into social presence

If your sphere wants to attach extra data to the user's social presence packet (broadcast to nearby peers every 5s by `social.sphere.js`), implement `broadcastData()`:

```js
window.YM_S['mysphere.sphere.js'] = {
  // ...
  broadcastData() {
    // Called by social.sphere.js before each broadcast
    // Return an object — it is merged into the presence packet
    return {
      myStatus: 'playing',
      myScore: 42,
    };
  },
};
```

Peers receive this merged data in `YM_Social._nearUsers[uuid].broadcastData`. Keep the payload small (< 500 bytes).

---

## Profile Hooks

Spheres can inject UI into two places in the profile panel.

### `profileSection(container)`

Called when the user opens their own profile → Spheres tab. Use it to show sphere-specific stats, history, leaderboard, or settings. Combine `ctx.storage` for personal data and `window.YM_Social._nearUsers` for peer scores.

```js
profileSection(container) {
  // Personal best from storage
  const best = this.ctx.storage.get('mygame_best') || '0';
  const hist = JSON.parse(this.ctx.storage.get('mygame_history') || '[]').slice(0, 5);

  // Peer scores from broadcastData
  const peers = [];
  window.YM_Social?._nearUsers.forEach((peer, uuid) => {
    if (peer.broadcastData?.mygame_best !== undefined) {
      peers.push({
        name: peer.profile?.name || uuid.slice(0, 8),
        best: peer.broadcastData.mygame_best
      });
    }
  });
  peers.sort((a, b) => b.best - a.best);

  container.innerHTML = `
    <div style="padding:14px">
      <div style="font-size:24px;font-weight:700;color:var(--accent)">${best}</div>
      <div style="font-size:9px;color:var(--text3);letter-spacing:.1em">BEST SCORE</div>
      ${peers.length ? `
        <div style="margin-top:12px">
          ${peers.map(p => `<div>${p.name} — ${p.best}</div>`).join('')}
        </div>` : ''}
    </div>`;
}
```

### `peerSection(container, ctx)`

Called when the user views another user's profile card, for each sphere both users have active.

```js
peerSection(container, peerCtx) {
  // peerCtx = { uuid, isNear, isReciproc, profile }
  // uuid      — peer's UUID
  // isNear    — peer is currently nearby (P2P visible)
  // isReciproc — both have each other as contacts
  // profile   — peer's public profile object

  if (!peerCtx.isNear) {
    container.innerHTML = '<div style="color:var(--text3);font-size:11px">Not nearby</div>';
    return;
  }

  const btn = document.createElement('button');
  btn.className = 'ym-btn ym-btn-ghost';
  btn.style.cssText = 'width:100%;font-size:12px';
  btn.textContent = '⚡ Challenge';
  btn.addEventListener('click', () => {
    const peerId = peerCtx.peerId || peerCtx.uuid;
    if (!peerId) return;
    // Use ctx.send — NOT window.YM_P2P.sendTo (peerSection has no ctx)
    // Access your sphere's ctx via the registry
    const mySphere = window.YM_sphereRegistry?.get('mysphere.sphere.js');
    mySphere?.ctx?.send('mygame:challenge', {}, peerId);
    window.YM?.openSpherePanel?.('mysphere.sphere.js');
  });
  container.appendChild(btn);
}
```

**Important:** `peerCtx` in `peerSection` is **not** the `ctx` from `activate()`. It has no `.send()`, no `.storage`, no `.toast()`. To send a P2P message from peerSection, use `window.YM_P2P.sendTo()`. To access your sphere's own ctx, use `window.YM_sphereRegistry.get('mysphere.sphere.js')`.

### Sphere Visibility

```js
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
    const state = { players: {}, myPos: { x: 0, y: 0 } };
    _interval = setInterval(() => {
      ctx.send('mygame:pos', state.myPos);
    }, 100);

    ctx.onReceive((type, data, peerId) => {
      if (type === 'mygame:pos') {
        state.players[peerId] = data;
        renderPlayers(state.players);
      }
      if (type === 'mygame:action') {
        handleAction(data, peerId);
      }
    });
  },

  deactivate() {
    if (_interval) { clearInterval(_interval); _interval = null; }
  },

  renderPanel(container) { }
};
```

### Pattern: room / lobby

```js
activate(ctx) {
  const myProfile = ctx.loadProfile();

  ctx.send('mygame:join', {
    name: myProfile.name,
    avatar: myProfile.avatar,
  });

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
}
```

### Pattern: turn-based / authoritative

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
      const newState = applyMove(gameState, data, peerId);
      ctx.send('mygame:state', newState);
    }
    if (type === 'mygame:state' && !isHost) {
      applyState(data);
    }
  });
}
```

### Rate limits

- **10 P2P sends/second** — enforced by `app.js`
- **Payload size** — keep under 4KB per message (Nostr relay limit)

### Pluggable transport — `window.YM_TRANSPORT`

The P2P transport is fully swappable. Any theme or sphere can replace Trystero with any backend — WebRTC, Socket.io, a blockchain, a centralized server, anything — by declaring `window.YM_TRANSPORT` before `app.js` boots:

```js
window.YM_TRANSPORT = {
  // Called once at startup — connect to the network
  async connect(roomId, appId) { /* ... */ },

  // Send a message — peerId=null means broadcast to all
  send(peerId, data) { /* ... */ },

  // Receive messages — callback(peerId, data)
  onMessage(callback) { /* ... */ },

  // Peer lifecycle
  onPeerJoin(callback)  { /* ... */ },  // callback(peerId)
  onPeerLeave(callback) { /* ... */ },  // callback(peerId)
};
```

If `YM_TRANSPORT` is defined, app.js uses it instead of Trystero. If it fails, it falls back to Trystero automatically.

**Examples of what you can plug in:**

| Backend | Use case |
|---------|----------|
| WebRTC (native) | No relay dependency |
| Socket.io | Centralized, simple |
| Gun.js | Decentralized graph DB |
| Matrix | Federated, E2E encrypted |
| Solana programs | On-chain messages |
| `localStorage` events | Local tab testing |

**Minimal example — centralized Socket.io transport:**

```js
window.YM_TRANSPORT = (function() {
  const socket = io('https://my-server.com');
  let _onMsg, _onJoin, _onLeave;
  socket.on('msg',   (d) => _onMsg   && _onMsg(d.from, d.data));
  socket.on('join',  (id) => _onJoin  && _onJoin(id));
  socket.on('leave', (id) => _onLeave && _onLeave(id));
  return {
    async connect(roomId, appId) { socket.emit('join', { room: roomId, app: appId }); },
    send(peerId, data)           { socket.emit('msg', { to: peerId, data }); },
    onMessage(cb)                { _onMsg = cb; },
    onPeerJoin(cb)               { _onJoin = cb; },
    onPeerLeave(cb)              { _onLeave = cb; },
  };
})();
```



```js
const YM_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr.oxtr.dev'
];
```

To use your own relay infrastructure, override `window.YM_RELAYS` before `app.js` initializes P2P:

```js
// In your theme or index.html, before app.js boots:
window.YM_RELAYS_OVERRIDE = [
  'wss://my-relay.example.com',
  'wss://backup-relay.example.com'
];
```

To create an isolated private network (your own YourMine instance):

```js
// Override both relay URLs and appId
window.YM_APPID_OVERRIDE = 'myapp-v1';   // isolates your network from the public YourMine network
window.YM_ROOM_OVERRIDE  = 'my-room';    // optional: custom room name
```

**Run your own Nostr relay:**
Any Nostr-compatible relay works. Lightweight options:
- [nostream](https://github.com/Cameri/nostream) — Node.js, PostgreSQL
- [strfry](https://github.com/hoytech/strfry) — C++, minimal
- [nostr-rs-relay](https://github.com/scsibug/nostr-rs-relay) — Rust

**Add your relay to the default pool** (contributes to the public YourMine network): open a PR to add your `wss://` URL to `YM_RELAYS` in `app.js`.

---

## Theme API Specification

A theme is an HTML fragment (not a full document) injected into `<body>` by `index.html`.

### Required DOM elements

These IDs **must** exist in every theme or `app.js`/`desk.js` will crash:

```html
<!-- Desktop -->
<div id="ym-wp"></div>
<div id="ym-bg"></div>
<div id="ym-loader"></div>
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
<div id="spheres-build-btn"></div>
<button id="profile-share-btn"></button>
```

### Required CSS classes

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

```html
<script>
window.YM_THEME_META = {
  name:        "My Theme",
  icon:        "🎨",
  description: "Short description shown in Themes list",
  requiredSpheres: ["safety.sphere.js", "status.sphere.js"],
};
</script>
```

**`requiredSpheres`** — optional array of sphere filenames that the theme needs. app.js activates them automatically at startup, after social.sphere.js. The user can deactivate them later — required means auto-activated on first load, not permanently mandatory (only social.sphere.js is permanently mandatory).

```js
// Examples
requiredSpheres: []                          // default — no extra spheres
requiredSpheres: ["safety.sphere.js"]        // safety hub theme
requiredSpheres: ["radio.sphere.js", "status.sphere.js"]  // ambient theme
```



window.YM_WALLPAPER_PRESETS = [
  { label: 'City Night', url: 'https://images.unsplash.com/photo-xxx?w=1400&q=80' },
];
</script>
```

`YM_WALLPAPER_PRESETS` must be defined by the theme, not by `desk.js`. Each theme owns its wallpaper collection.

### Event listeners in themes

Themes are injected dynamically into the DOM. Scripts run before the HTML is fully parsed. Any `getElementById` or `addEventListener` must be deferred:

```js
// Always wrap DOM listeners in setTimeout(0) in themes
setTimeout(function(){
  var btn = document.getElementById('my-btn');
  if (btn) btn.addEventListener('click', function(){ /* ... */ });
}, 0);
```

Without this, `getElementById` returns `null` because the elements don't exist yet when the script executes.

### Theme picker script

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

### `icon-label--below`

```css
.icon-label--below { order: 1 !important; }
```

### Grid layout

```css
:root { --cols: 4; --rows: 6; }
@media (hover:hover) and (pointer:fine) {
  :root { --cols: 8; --rows: 5; }
  .desktop-page { grid-template-columns: repeat(var(--cols), 1fr); }
}
```

---

## Desktop Page Width Hook

By default `desk.js` calculates page width as `calc(100vw - 64px)` on desktop and `100vw` on mobile. Themes that add persistent sidebars or panels that reduce the available desktop space can override this via `window.YM_Desk_pageUnit`:

```js
// In your theme script — define BEFORE desk.js renders
window.YM_Desk_pageUnit = function() {
  const isDesktop = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (!isDesktop) return '100vw';
  const sidebarVisible = !document.getElementById('my-sidebar')?.classList.contains('hidden');
  const sidebarW = sidebarVisible ? 260 : 0;
  return 'calc(100vw - 64px - ' + sidebarW + 'px)';
};
```

`desk.js` calls this function every time it creates or rebuilds pages. If not defined, it falls back to the default calculation.

When the sidebar visibility changes, call `window.YM_Desk.buildSlider()` to rebuild all pages with the new unit:

```js
document.getElementById('my-sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
  window.YM_Desk.buildSlider();
});
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

Replace `YOUR_THEME_PREFIX` with the ID prefix of your own theme's elements.

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

**Guaranteed by all themes (safe to use without fallback):**

| Variable | Default value | Description |
|---|---|---|
| `--bg` | `#06060e` | Page background |
| `--text` | `#e4e6f4` | Primary text |
| `--text2` | `rgba(228,230,244,.52)` | Secondary/muted text |
| `--text3` | `rgba(228,230,244,.26)` | Placeholder/disabled text |
| `--gold` | `#f0a830` | Primary gold accent |
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
border:     1px solid var(--border,  rgba(255,255,255,.08));
border-radius: var(--r,    12px);
border-radius: var(--r-sm, 8px);
border-radius: var(--r-lg, 16px);
color:      var(--accent, var(--gold, #f0a830));
```

**`--accent` vs `--gold`:** `--accent` is defined by the zone theme as blue-purple (`#5b78f5`). The default theme has no `--accent` — use `var(--accent, var(--gold))` so spheres work correctly on both themes.

---

## Desktop Icon System

### Icon object structure

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
  "type":     "theme",
  "themeUrl": "https://..."
}
```

### Widget page registry

`desk.js` exposes two methods for spheres that create desktop widgets:

```js
// Register widget on a specific page
window.YM_Desk.registerWidgetPage(widgetId, page, posKey?);
// posKey: optional localStorage key where the widget stores its position
// When provided, desk.js updates it automatically when pages are remapped by autoCleanPages

// Unregister on deactivate
window.YM_Desk.unregisterWidget(widgetId);

// Get the page a widget is registered on (returns null if not registered)
window.YM_Desk.registeredWidgetPage(widgetId); // → 0 | 1 | null
```

Use `registeredWidgetPage` in `_syncWidgetPage` to read the page from the Desk registry as source of truth, instead of localStorage which can be stale:

```js
function _syncWidgetPage() {
  let widgetPage = 0;
  if (window.YM_Desk?.registeredWidgetPage) {
    const rp = window.YM_Desk.registeredWidgetPage(WIDGET_ID);
    if (rp != null) widgetPage = rp;
    else widgetPage = loadPos().page || 0;
  }
  const curPage = window._deskCurPage ?? 0;
  const visible = curPage === widgetPage;
  _widget.style.opacity = visible ? '1' : '0';
  _widget.style.pointerEvents = visible ? 'all' : 'none';
}
```

**Important:** do NOT clamp `targetPage` to `pageCount - 1` at spawn. `registerWidgetPage` creates the page if needed. Clamping would reset the widget to page 0 on reload when `pageCount=1` at boot.

### Widget drag and page change

The correct drag pattern for a desktop widget uses the **Pointer Events API** — not `mousedown`/`touchstart`. Using mouse/touch events causes the widget to disappear from under the finger during drag because pointer capture is not guaranteed.

```js
// Required helpers
function _getNavBounds(){
  const navBar = document.getElementById('nav-bar');
  if (!navBar) return { maxRight: window.innerWidth, maxBottom: window.innerHeight };
  const r = navBar.getBoundingClientRect();
  if (_isPC()) return { maxRight: r.left, maxBottom: window.innerHeight };
  else return { maxRight: window.innerWidth, maxBottom: r.top };
}
function _clampPos(wx, wy){
  const bounds = _getNavBounds();
  const ww = _widget ? _widget.offsetWidth : 160;
  const wh = _widget ? _widget.offsetHeight : 60;
  return {
    x: Math.max(0, Math.min(bounds.maxRight - ww, wx)),
    y: Math.max(0, Math.min(bounds.maxBottom - wh, wy))
  };
}
```

```js
// Drag with edge-scroll page change
let dragging = false, ox = 0, oy = 0, wx = 0, wy = 0, _edgeT = null;

const onMove = (cx, cy) => {
  if (!dragging) return;
  const rawX = wx + (cx - ox);
  const rawY = wy + (cy - oy);
  ox = cx; oy = cy;
  const clamped = _clampPos(rawX, rawY);
  wx = clamped.x; wy = clamped.y;
  _widget.style.left = wx + 'px'; _widget.style.top = wy + 'px';
  _widget.style.right = ''; _widget.style.bottom = '';

  // Edge scroll: drag to screen edge to change page
  const vw = _isPC() ? window.innerWidth - 72 : window.innerWidth;
  const ew = vw * 0.15;
  const curPage = window._deskCurPage || 0;
  if (cx < ew && curPage > 0) {
    if (!_edgeT) _edgeT = setTimeout(() => {
      _edgeT = null;
      const tp = curPage - 1;
      window.YM_Desk?.goPage(tp);
      _registerPage(tp);
      savePos(Object.assign({}, loadPos(), { page: tp }));
    }, 500);
  } else if (cx > vw - ew) {
    if (!_edgeT) _edgeT = setTimeout(() => {
      _edgeT = null;
      const tp = (window._deskCurPage || 0) + 1;
      window.YM_Desk?.goPageOrCreate(tp);
      _registerPage(tp);
      savePos(Object.assign({}, loadPos(), { page: tp }));
    }, 500);
  } else { clearTimeout(_edgeT); _edgeT = null; }
};

const onEnd = () => {
  if (!dragging) return;
  dragging = false; _widget._dragging = false;
  clearTimeout(_edgeT); _edgeT = null;
  const ww = _widget.offsetWidth, wh = _widget.offsetHeight;
  const r = Math.max(0, window.innerWidth - wx - ww);
  const b = Math.max(0, window.innerHeight - wy - wh);
  const curPage = window._deskCurPage || 0;
  _registerPage(curPage);
  savePos({ right: r, bottom: b, page: curPage });
  _syncWidgetPage();
  setTimeout(() => window.YM_Desk?.autoCleanPages(), 100);
};

// Use Pointer Events — setPointerCapture keeps widget under finger
_widget.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  dragging = true; _widget._dragging = true;
  const rect = _widget.getBoundingClientRect();
  wx = rect.left; wy = rect.top;
  _widget.style.left = wx + 'px'; _widget.style.top = wy + 'px';
  _widget.style.right = ''; _widget.style.bottom = '';
  ox = e.clientX; oy = e.clientY;
  e.preventDefault();
  _widget.setPointerCapture(e.pointerId); // critical — prevents losing the pointer
}, { passive: false });
_widget.addEventListener('pointermove', e => { if (dragging) onMove(e.clientX, e.clientY); }, { passive: false });
_widget.addEventListener('pointerup', onEnd);
_widget.addEventListener('pointercancel', onEnd);
```

**Key rules:**
- Use `pointerdown`/`pointermove`/`pointerup` — never `mousedown`/`touchstart` for widget drag
- Call `_widget.setPointerCapture(e.pointerId)` in `pointerdown` — this prevents the widget from losing the pointer when the finger moves fast
- Convert `right/bottom` to `left/top` immediately at drag start — avoids the visual jump
- Use `opacity:0/1` + `pointerEvents:none/all` in `_syncWidgetPage`, never `display:none` — `display:none` breaks pointer capture during page transitions
- Set `_widget._dragging = true` during drag and check it in `_syncWidgetPage` to prevent hiding during page change
- Edge scroll threshold: 15% of viewport width on each side, 500ms delay

---

## Sphere Visibility

```js
window.YM_canSeeSphere(sphereName, peerUUID) // → true | false
window.YM_getSphereVisibility(sphereName)    // → 'all' | 'contacts' | uuid[]
```

Values: `'all'` (default), `'contacts'`, or an array of UUIDs.

---

## System Themes

### `default.html`
Dark glassmorphism, gold/cyan gradients, icon skew animations. Defines `window.YM_WALLPAPER_PRESETS` — used as fallback by `desk.js`.

### `zone.html`
Sets `window.YM_ZONE_CONFIG = { spheresOnly: true, socialFilters: true }`. Mine panel: Wallet tab only.

### `hello.html`
Full-screen landing page. Hides all system chrome via CSS. Uses MutationObserver to block widget injection from spheres.

---

## Theme Configuration API

```js
window.YM_ZONE_CONFIG = {
  spheresOnly:   true,
  socialFilters: true,
};
```

### `spheresOnly`

When `true`, `liste.js` forces `_listType = 'spheres'` and hides type pills, WIP row, add button.

### `socialFilters`

Two extra filter pills: **Near** and **Contacts**.

| Filter | Data source |
|--------|-------------|
| **Near** | `window._ymNearSpheres` (`Set<filename>`) |
| **Contacts** | `ym_profile_v1 → contacts[].spheres[]` |

### `window._ymNearSpheres`

```js
window._ymNearSpheres = window._ymNearSpheres || new Set();
ctx.onReceive((type, data) => {
  if (type === 'social:pong') {
    (data.spheres || []).forEach(s => window._ymNearSpheres.add(s));
  }
});
```

---

## External Apps & Bridge API

Any web app hosted anywhere can be loaded as a sphere.

### How to add an external app

| Platform | Input | Example |
|---|---|---|
| Bolt / StackBlitz | Project ID | `sb1-abc123` |
| Replit | `@user/repl` | `@alice/my-game` |
| GitHub Pages | `user/repo` | `alice/my-app` |
| Any URL | Full URL | `https://myapp.vercel.app` |

### Bridge postMessage API

```js
// Detect YourMine
const isInYourMine = window.parent !== window;

// Receive
window.addEventListener('message', e => {
  if (e.data?.type === 'ym:ready') {
    const profile = e.data.profile;
  }
  if (e.data?.type === 'ym:storage:value') {
    const { key, value } = e.data;
  }
  if (e.data?.type === 'ym:p2p:receive') {
    const { msgType, data, from } = e.data;
  }
});

// Send
window.parent.postMessage({ type: 'ym:toast', msg: 'Saved!', style: 'success' }, '*');
window.parent.postMessage({ type: 'ym:getProfile' }, '*');
window.parent.postMessage({ type: 'ym:storage:set', key: 'score', value: '42' }, '*');
window.parent.postMessage({ type: 'ym:storage:get', key: 'score' }, '*');
window.parent.postMessage({ type: 'ym:p2p:broadcast', data: { x: 1, y: 2 } }, '*');
window.parent.postMessage({ type: 'ym:p2p:send', to: 'peer-uuid', data: { msg: 'hi' } }, '*');
window.parent.postMessage({ type: 'ym:resize', height: 600 }, '*');
```

---

## Merge Bot

`merge.js` runs as a GitHub Action on PR merge:
1. Updates `files.json` for sphere submissions
2. Updates `themes-files.json` for theme submissions
3. Auto-extracts media URLs via `merge_media_extractor.js`
4. Closes the PR with a comment
5. Syncs the fork with main

---

## Runtime Cycle & Lifecycle

### Boot sequence

```
1. index.html captures beforeinstallprompt → window._pwaPrompt
2. index.html loads WebLLM via <script type="module"> if navigator.gpu → window.__webllm
3. index.html injects edge-back UI
4. index.html fetches theme HTML → injectTheme()
5. boot: await desk.js
6. boot: await app.js
7. app.js: OC() — creates profile if none
8. app.js: deskInit()
9. app.js: loads mine.js, liste.js, build.js, profile.js
10. app.js: fetchSphereList() — populates sphere registry from files.json
11. app.js: restores active spheres from profile.spheres[]
12. app.js: activates social.sphere.js (mandatory)
13. app.js: activates requiredSpheres from YM_THEME_META (optional, user can deactivate later)
14. app.js: initP2P() — Trystero via Nostr relays
15. app.js: hides loader on fonts.ready
```

### Sphere activation flow

```
YM.activateSphere(name, obj)
  → dispatch 'ym:sphere-before-activate'
  → mkCtx(name)
  → obj.activate(ctx)     — 8s timeout enforced
  → addIcon(name, ...)
  → SP({spheres: [...]})
  → dispatch 'ym:sphere-activated'
```

### Activation timeout

`activate()` must resolve within **8 seconds**:

```js
activate(ctx) {
  // ✓ Fire-and-forget
  fetch('https://api.example.com/init').then(r => r.json()).then(data => {
    ctx.storage.set('data', JSON.stringify(data));
  });
  // ✗ Never do this
  // const data = await fetch('...');
}
```

### Mandatory spheres

`social.sphere.js` is the only permanently mandatory sphere — always active, not deactivatable.

`safety.sphere.js` is optional and deactivatable like any other sphere.

---

## Safety System

`safety.sphere.js` listens to three events:

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

Uses Llama 3.2 1B via WebGPU. Results: `none/low` → silent, `medium` → warning toast, `high` → error toast. Safety warns, never blocks.

---

## Plug

Two modes:

### URL mode

```
https://raw.githubusercontent.com/user/repo/main/mysphere.sphere.js  → Sphere
https://raw.githubusercontent.com/user/repo/main/mytheme.theme.js    → Theme
```

### Code mode

Paste raw JS code. Sphere: executed inline via Blob URL. Theme: Blob URL stored in `localStorage.ym_theme_url`, page reloads.

### Plug vs Rank

| | Plug | Rank |
|---|---|---|
| Registry entry | No | Yes |
| Direct activation URL | No | Yes |
| Score / ranking | No | Yes |
| Mining score required | No | Yes (new spheres only) |

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

Permission check: `ghAuthor === username` OR `owner === username` OR `author (wallet) === pubkey`.

---

## URL Routing

```
/                        → loads theme from localStorage
/default.theme           → applies default theme
/social.sphere           → activates social sphere and opens its panel
/neural.theme/social.sphere → applies theme then opens sphere after reload
```

**Resolution order for `/name.theme`:**
1. Search `themes-files.json` by `filename` or `name`
2. HEAD check `src/themes/name.theme.html`
3. HEAD check `src/themes/name.html`

Always call `history.replaceState(null, '', '/')` before `location.reload()` when applying a theme programmatically.

---

## Edge-back Button

`index.html` injects `#_ym_edge_btn` at `z-index:10000`, independent of any theme.

**Desktop:** appears on hover of 20px left edge.
**Mobile:** tap on left edge toggles button for 5s. Swipe right → action immediately.
**Action:** always navigates to `default.html`.

---

## Permissions & Security Model

### What spheres CAN do

- Read/write own `localStorage` namespace (`ym_s|name|*`)
- Render UI in assigned container
- Send/receive P2P messages (rate-limited: 10/s)
- Show toasts (rate-limited: 3/5s)
- Open `panel-sphere` via `ctx.openPanel()`
- Request wallet signature — always shows confirmation dialog
- Access `ctx.loadProfile()` / `ctx.saveProfile()`

### What spheres CANNOT do

- Access other spheres' localStorage
- Intercept or modify `window.fetch`
- Modify `window.YM`, `window.YM_Desk`, `window.YM_P2P` directly
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
      "spheres":  ["social.sphere.js", "chess.sphere.js"]
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
| Derivation path | SLIP-10: `m/44'/501'/0'/0'` |
| Curve | Ed25519 |
| Encoding | Base58 |
| KDF | PBKDF2 (SHA-256, 200 000 iterations) |
| Cipher | AES-256-GCM |

### Constants

| Constant | Value |
|----------|-------|
| `MIN_BURN` | 0.0001 SOL |
| Network | Solana Devnet |
| `YRM_DECIMALS` | 1e18 |

### Exposed wallet APIs

```js
window.YM_Mine_sign(message)   // → Promise — always shows confirmation dialog
window.YM_Mine_pubkey()        // → string | null
window.YM_calcClaimable()      // → number
window._mineState              // read-only state snapshot
```

---

## Runtime Events

| Event | Detail | Dispatched by | When |
|-------|--------|---------------|------|
| `ym:peer-join` | `{ peerId }` | `app.js` | New P2P peer connects |
| `ym:sphere-before-activate` | `{ filename, author, code }` | `app.js` | Before activation |
| `ym:sphere-activated` | `{ name }` | `app.js` | After activation |
| `ym:sphere-deactivated` | `{ name }` | `app.js` | After deactivation |
| `ym:external-app-load` | `{ url, name }` | `liste.js` | Before iframe loads |
| `ym:before-transaction` | `{ amount, destination, program }` | `mine.js` | Before signing |
| `ym:webllm-ready` | — | `index.html` | WebLLM ready |

```js
activate(ctx) {
  const onPeerJoin = (e) => {
    const { peerId } = e.detail;
    window.YM_P2P?.sendTo(peerId, {
      sphere: 'mysphere.sphere.js',
      type: 'mygame:sync',
      data: getCurrentState()
    });
  };
  window.addEventListener('ym:peer-join', onPeerJoin);
  this._onPeerJoin = onPeerJoin;
},
deactivate() {
  window.removeEventListener('ym:peer-join', this._onPeerJoin);
},
```

---

## Global API Reference

| Global | Set by | Description |
|--------|--------|-------------|
| `window.YM` | `app.js` | Main runtime — `activateSphere`, `deactivateSphere`, `openPanel`, `openProfilePanel`, `openSpherePanel` |
| `window.YM_Desk` | `desk.js` | Desktop — `addIcon`, `removeIcon`, `setNotif`, `registerWidgetPage`, `unregisterWidget`, `registeredWidgetPage(id)` |
| `window.YM_S` | spheres | Sphere registry `{ 'name.sphere.js': { … } }` |
| `window.YM_P2P` | `app.js` | Raw P2P — `broadcast`, `sendTo` |
| `window.YM_Social` | `social.sphere.js` | `_nearUsers: Map<uuid,{profile,ts,peerId,broadcastData}>` |
| `window.YM_sphereRegistry` | `app.js` | `Map<filename, ctx>` of active spheres |
| `window.YM_Messenger` | `messenger.sphere.js` | `openConv(uuid)` |
| `window.YM_Call` | `call.sphere.js` | `startVoiceCall(uuid)`, `hangUp()` |
| `window.YM_Mine_sign(msg)` | `mine.js` | Sign — triggers confirmation dialog |
| `window.YM_Mine_pubkey()` | `mine.js` | Current Solana public key or null |
| `window.YM_calcClaimable()` | `mine.js` | Claimable YM |
| `window._mineState` | `mine.js` | Read-only wallet state |
| `window.YM_Liste` | `liste.js` | Sphere list API — fully independent, usable in any theme |

`liste.js` has no dependency on `panel-mine` or `mine.js`. To embed the full sphere/theme list with filters, pills and search in your own theme:

```js
const container = document.getElementById('my-list-container');
window.YM_Liste.render(container);
```
| `window.YM_Build` | `build.js` | Build/publish API |
| `window.YM_toast(msg, type)` | `app.js` | Toast |
| `window.YM.setTheme(url, prevUrl?)` | `app.js` | Switch theme — prefetches HTML, caches, reloads. `prevUrl` optional, stored as `ym_prev_theme` |

## SVG illustrations in themes

Use inline SVG for abstract decorative illustrations — no external assets, no loading. Keep viewBox at `0 0 600 N` for consistent scaling. Animate with CSS `IntersectionObserver` for scroll reveal.

```js
// Minimal pattern — append after section title
const wrap = document.createElement('div');
wrap.className = 'my-illo-wrap'; // NOT ym-* prefix
wrap.innerHTML = `<svg viewBox="0 0 600 80" style="width:100%;height:80px">
  <circle cx="300" cy="40" r="20" fill="none" stroke="rgba(91,120,245,0.4)" stroke-width="1.5">
    <animate attributeName="r" values="20;28;20" dur="3s" repeatCount="indefinite"/>
  </circle>
</svg>`;
container.appendChild(wrap);

// Reveal on scroll
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) e.target.style.opacity = '1';
}, { threshold: 0.2 }).observe(wrap);
```

**Notes:**
- Use `rgba` colors from your theme's CSS variables for consistency
- Keep animations subtle — `dur` ≥ 2s, never on critical content
- SVG elements don't need class prefixes (they're not CSS-targeted by YourMine)
- If the SVG is inside a `.reveal` element, tie visibility to the parent observer rather than a separate one

## Theme CSS isolation

Every theme hides the YourMine DOM with:

```css
.ym-overlay,.ym-tabs,.ym-input,.ym-btn,.ym-card,.ym-notice,.pill{display:none!important}
```

**The only risk:** your element gets `display:none!important` — invisible but still in the DOM. No crash, no functional bug, just invisible.

**The fix is simple:** prefix all your classes with your theme name.

```css
/* ✗ will be hidden */
<button class="ym-btn">click</button>

/* ✓ safe */
<button class="nasa-btn">click</button>
<button class="book-close">click</button>
<button class="lp-cta">click</button>
```

That's it. One rule, no exceptions.

## Nav Button Config

Themes can remap `btn-figure` and `btn-wallet` by declaring `window.YM_NAV_CONFIG` **before** `app.js` loads:

```js
window.YM_NAV_CONFIG = {
  'btn-figure': {
    panel: 'panel-spheres', // which panel to toggle (default: 'panel-mine')
    tab:   null,            // mine tab to activate — null = skip (default: 'liste')
    onOpen: function() { if(window.YM_Liste) window.YM_Liste.render(); }
  },
  'btn-wallet': {
    panel: 'panel-mine',
    tab:   'wallet'         // default: 'wallet'
  }
};
```

All keys are optional — omit any to keep the default behaviour.

### Full reference

```js
window.YM_NAV_CONFIG = {
  'btn-back': {
    onSwitcher: fn, // switcher open — default: close it
    onPanel:    fn, // panel open + history — default: reduce + open switcher
    onEmpty:    fn, // nothing open — default: panel-spheres + liste
  },
  'btn-profile': {
    panel:  'panel-profile', // default
    onOpen: fn,
  },
  'btn-figure': {
    panel:  'panel-mine',  // default
    tab:    'liste',       // mine tab — null to skip
    onOpen: fn,
  },
  'btn-wallet': {
    panel:  'panel-mine',  // default
    tab:    'wallet',
    onOpen: fn,
  },
  liste: {
    defaultType:   'spheres', // 'spheres' | 'themes' | 'photo' | 'video'
    spheresOnly:   false,     // hide type toggle, lock to spheres
    socialFilters: false,     // add Near / Contacts pills
  }
};
```

`YM_NAV_CONFIG.liste` supersedes the legacy `window.YM_ZONE_CONFIG` — use the new form.
| `window.YM_escHtml(str)` | `app.js` | HTML-escape |
| `window.YM_canSeeSphere(name, uuid)` | `profile.js` | Visibility check |
| `window.YM_getSphereVisibility(name)` | `profile.js` | `'all'` \| `'contacts'` \| `uuid[]` |
| `window.YM_THEME_META` | theme | `{ name, icon, description, requiredSpheres? }` |
| `window.YM_WALLPAPER_PRESETS` | theme | `[{ label, url }]` |
| `window.YM_ZONE_CONFIG` | theme | `{ spheresOnly, socialFilters }` |
| `window._ymNearSpheres` | `social.sphere.js` | `Set<filename>` of nearby sphere filenames |
| `window.__webllm` | `index.html` | WebLLM instance (Llama 3.2 1B) |
| `window._pwaPrompt` | `index.html` | Deferred PWA install prompt |
| `window._YM_GH_RAW` | `index.html` | GitHub raw base URL |
| `window.app_switchMineTab(tab)` | `app.js` | Switch Mine panel tab |

### `window.YM_Social._nearUsers`

`Map<uuid, { profile, ts, peerId, broadcastData }>`:

- `profile` — full public profile of the peer (name, bio, avatar, spheres)
- `ts` — last seen timestamp
- `peerId` — Trystero peer ID for direct P2P
- `broadcastData` — merged object from all sphere `broadcastData()` calls on that peer

### `window.YM_sphereRegistry`

`Map<filename, ctx>` of currently active spheres:

```js
const isActive = window.YM_sphereRegistry?.has('radio.sphere.js');
const ctx = window.YM_sphereRegistry?.get('mysphere.sphere.js');
```

---

## Storage Reference

### `localStorage` keys

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
| `ym_fav_contacts` | `profile.js` | Favourite contact UUIDs |
| `ym_sphere_visibility` | `profile.js` | Per-sphere visibility |
| `ym_liste_cache_v4` | `liste.js` | Sphere registry cache (TTL 5min) |
| `ym_active_spheres` | `liste.js` | Active sphere filenames |
| `ym_s\|name\|*` | spheres | Sphere-scoped storage |

### `sessionStorage` keys

| Key | Owner | Content |
|-----|-------|---------|
| `ym_build_token` | `build.js` | `{ value, username }` — cleared on tab close |

---

## File Format Standards

### `files.json`

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
      "photos": [],
      "videos": []
    }
  }
]
```


### `themes-files.json`

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
      "photos": [],
      "videos": []
    }
  }
]
```



---

## Test Environment

YourMine has a built-in test environment that runs **inside production** — no staging server, no separate deployment.

Any theme can override the sphere registry and theme registry by declaring two variables before the app boots:

```js
window.YM_REGISTRY_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/YourFork/YourMinedApp/main/test.json'
};
window.YM_THEMES_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/YourFork/YourMinedApp/main/test-theme.json'
};
localStorage.removeItem('ym_liste_cache_v4'); // clear cache so override takes effect
```

`liste.js` reads `YM_REGISTRY_OVERRIDE.url` as the sphere list source, and `YM_THEMES_OVERRIDE.url` as the theme list source — instead of the default `files.json` and `themes-files.json` from the main repo.

### What this means

- **Runs in the same runtime as production** — same P2P peers, same wallet, same sphere API
- **Completely cloisonné** — your test spheres and themes are only visible to users running your test theme
- **No permission required** — any fork can have its own registry
- **Zero configuration** — two lines in a theme is all it takes

### `test.json` format

Same format as `files.json`:

```json
[
  {
    "filename": "mysphere.sphere.js",
    "author": "SolanaWalletPubkey...",
    "ghAuthor": "githubusername",
    "codeUrl": "https://raw.githubusercontent.com/githubusername/YourMinedApp/main/mysphere.sphere.js",
    "score": 0,
    "laps": 0,
    "timestamp": 0,
    "merged_at": 0
  }
]
```

### `test-theme.json` format

Same format as `themes-files.json`. Can be an empty array `[]` to show no themes.

### Example: `test.html`

```html
<script>
window.YM_THEME_META = {"name":"Test","icon":"🧪","description":"Test theme"};
window.YM_REGISTRY_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/Keanuji/YourMinedApp/main/test.json'
};
window.YM_THEMES_OVERRIDE = {
  url: 'https://raw.githubusercontent.com/Keanuji/YourMinedApp/main/test-theme.json'
};
localStorage.removeItem('ym_liste_cache_v4');
</script>
```

This pattern is used by the `test.html` theme in the main repo — it loads spheres from Keanuji's fork while running on the same production P2P network.

---



```
Vercel / Netlify / GitHub Pages / Cloudflare Pages / Any CDN
```

### Required files at root

```
index.html
manifest.json
sw.js
ym512.png
icon-splash-dark.png
```

### GitHub repository structure

```
/
├── index.html
├── manifest.json
├── sw.js
├── ym512.png
├── icon-splash-dark.png
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

---

## Token GitHub Security Note

The GitHub token (`ghp_...`) entered in Build:
- **Stored in `sessionStorage`** — cleared when tab closes, never in `localStorage`
- **Never sent to any third party** — only to `api.github.com` directly
- **Scoped to `repo`** — minimum required for fork, push, PR
- **Risk**: visible in browser memory during the session. Use a dedicated token and revoke after publishing.

---

## Mining, Score & Ranking

### Mining Formula

```
       S · t^α
─────────────────────────────
[ln(A^β(1−T) + C)]^γ
```

**Computationally safe form:**

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

### Permission Score

```
(score_now + 1) / (laps_now + 1)  >  (score_last + 1) / (laps_last + 1)
```

- First publication: always allowed
- New sphere: ratio must improve on last publication
- Updating existing sphere: ownership check only, no score required

### Ranking

```
rank = score / laps
```

Score frozen at merge time. No editorial curation.

### Direct activation URLs

```
/name.theme           → applies that theme
/name.sphere          → activates that sphere
/neural.theme/social.sphere  → composable
```

---

## New Spheres (Session 6)

### `career.sphere.js`
CV and job board. Publish via GitHub + Solana wallet. Browse candidates ranked by AI. Adapt your CV to any offer.

- `cv.json` at repo root — CV registry
- `jobs.json` at repo root — job registry
- `src/cv/username.cv.js` — CV file in user's fork
- `src/jobs/username-slug.job.js` — job file in user's fork
- First publish requires wallet signature. Updates require GitHub token only.
- CV/job files must expose `window.YM_renderCV(container)` / `window.YM_renderJob(container)`

### `journal.sphere.js`
Social journal. One file per person, evolving over time. Publish via GitHub + wallet, update via GitHub only.

- `journals.json` at repo root — journal registry
- `src/journals/username.journal.js` — journal file in user's fork
- Feed tab shows Near (P2P peers), Contacts (Social sphere), Top (registry)
- Journal files must expose `window.YM_renderJournal(container)`

### `status.sphere.js`
Battery level and network status widget. Uses `navigator.getBattery()` (Chrome Android) and `navigator.connection`.

---

## Widget Rules

### Build widget immediately in `activate()`

Never build a widget inside an async Promise — it breaks `_syncWidgetPage`:

```js
// ✗ WRONG — widget built after async delay
activate(ctx) {
  _ctx = ctx;
  getBattery().then(bat => {
    _buildWidget(); // too late — _syncWidgetPage already ran
  });
}

// ✓ CORRECT — widget built immediately
activate(ctx) {
  _ctx = ctx;
  _buildWidget(); // sync — registers page immediately
  getBattery().then(bat => {
    if (!bat) return;
    _battery = bat;
    _refreshWidget(); // enrich after
  }).catch(() => {});
}
```

### Required widget pattern

Every widget sphere must implement:

```js
const _onPageChange = () => _syncWidgetPage();

function _syncWidgetPage() {
  if (!_widget || !document.body.contains(_widget)) return;
  if (_widget._dragging) return;
  let widgetPage = 0;
  if (window.YM_Desk && window.YM_Desk.registeredWidgetPage) {
    const rp = window.YM_Desk.registeredWidgetPage(WIDGET_ID);
    if (rp != null) widgetPage = rp;
    else widgetPage = _loadPos().page || 0;
  } else { widgetPage = _loadPos().page || 0; }
  const curPage = window._deskCurPage != null ? window._deskCurPage : 0;
  const visible = curPage === widgetPage;
  _widget.style.transition = 'opacity .25s ease';
  _widget.style.opacity = visible ? '1' : '0';
  _widget.style.pointerEvents = visible ? 'all' : 'none';
}

function _registerPage(page) {
  if (window.YM_Desk && window.YM_Desk.registerWidgetPage)
    window.YM_Desk.registerWidgetPage(WIDGET_ID, page, POS_KEY);
}
```

Attach the listener inside `_buildWidget`, not in `activate`:

```js
window.addEventListener('ym:page-change', _onPageChange);
```

Remove it in `deactivate`:

```js
window.removeEventListener('ym:page-change', _onPageChange);
```

---

## Bot `merge.js` — Metadata extraction

Since session 6, `merge.js` automatically extracts `name`, `icon`, `category`, `description` from sphere code at merge time and writes them into `files.json`. No manual metadata required.

The bot reads these fields from the sphere's `window.YM_S['name.sphere.js'] = { name, icon, category, description }` declaration.

This means `liste.js` can use metadata directly from `files.json` without fetching each sphere file individually — faster load, more robust.

### Profile isolation — `window.YM_PROFILE_KEY`

The test theme uses a completely isolated profile — separate active spheres, bureau layout, contacts, and config — without changing the UUID.

The isolation key is derived from the registry owner's GitHub username:

```js
var _owner = base.replace('https://raw.githubusercontent.com/','').split('/')[0];
var _hash  = btoa(_owner).replace(/[^a-z0-9]/gi,'').slice(0,10);
localStorage.setItem('ym_profile_key', 'ym_profile_test_' + _hash);
```

`app.js`, `liste.js`, and `desk.js` all read `ym_profile_key` from localStorage to derive their storage keys:

| Component | Default key | Test key (example) |
|-----------|-------------|-------------------|
| Profile | `ym_profile_v1` | `ym_profile_test_S2VhbnVqaQ` |
| Active spheres | `ym_active_v1` | `ym_active_test_S2VhbnVqaQ` |
| Bureau layout | `ym_desktop_default` | `ym_desktop_test_S2VhbnVqaQ` |
| Wallpaper | `ym_wallpaper_default` | `ym_wallpaper_test_S2VhbnVqaQ` |
| Pages | `ym_pages_default` | `ym_pages_test_S2VhbnVqaQ` |

When switching away from the test theme, `setTheme()` clears `ym_profile_key` — the next boot uses `ym_profile_v1`.

Two different test registries (e.g. Keanuji and another fork) have different hashes and therefore completely separate profiles and bureaux.

---

## Cross-Registry Sphere Loading

When a theme uses `YM_REGISTRY_OVERRIDE`, spheres already activated in the user's profile may come from a different registry. `liste.js` handles this with a 3-level fallback in `activateSphereByName`:

1. **Current registry** — looks in `_sphereList` (the active registry, overridden or default)
2. **Theodore fallback** — if override is active and sphere not found, fetches `files.json` from `theodoreyong9/YourMinedApp` to find the sphere
3. **`ym_sphere_codeurls` cache** — at every activation, the sphere's `codeUrl` is stored in localStorage under this key. Used as ultimate fallback across registry switches.

This means spheres from Theodore and Keanuji (or any fork) coexist without bugs — each sphere loads from its real origin regardless of the active registry.

---

## Nav Button Active State — `YM_NAV_CONFIG` Aware

`updateActiveDbtn(panelId, tab)` now scans all `.dbtn` elements and reads their `YM_NAV_CONFIG` entry to find which button matches the current panel+tab combination.

This fixes themes like Zone where `btn-figure` opens `panel-spheres` and `btn-wallet` opens `panel-mine/wallet` — the correct button is activated in both cases.

Themes that declare custom `YM_NAV_CONFIG` get correct active states automatically without any extra code.

---

## Profile — Live Sphere Config

`renderSphereProfiles` now listens to `ym:sphere-activated` and re-renders automatically when a sphere is activated after the profile panel is already open. This fixes the missing configuration sections when a sphere loads asynchronously after the profile is opened.

---

## Interplanetary Proof of Will

Bitcoin cannot mine across planets. The speed of light introduces 3–22 minutes of latency between Earth and Mars, which breaks global consensus. Any chain would fork irreversibly.

Proof of Will is geographically independent by design. Mining happens where you are, with who you are. Your will does not travel — it acts locally. No global synchronisation required.

This makes YourMine the first participation protocol that works at interplanetary scale.

---

*YourMine is open source and open by design. There is no central authority. Fork it, improve it, run it.*


---

## Name Registry — `name.json`

Any user can publish their name to a registry via the 📡 button in the profile panel. This creates or updates a `name.json` file on the active registry repo.

The repo is derived automatically from `YM_REGISTRY_OVERRIDE` — no manual input required. Only a GitHub token with write access is needed.

### Format

```json
{
  "Jean": "uuid-xxxx-xxxx",
  "Alice": "uuid-yyyy-yyyy"
}
```

### Rules enforced client-side

- **One name per UUID** — publishing a new name automatically removes the previous entry for the same UUID.
- **Unique names** — if the name is already taken by a different UUID, the publish is blocked.
- **UUID from local profile only** — the UUID is read from the local profile, never from a user-editable field. You can only publish your own identity.

### Limitation

The `name.json` file is stored on GitHub. Anyone with a write token can modify it directly via the API. The rules above are enforced client-side only — they are a social contract, not a cryptographic guarantee.

---

## Book Theme — Deep Links & Position Restore

The book theme supports direct URL access to any book and chapter via query params:

```
yourmine-dapp.web.app?book=book2&chapter=5
```

- `book` — the book ID as defined in `YM_BOOK_CONFIG.books[].id`
- `chapter` — the chapter index (0-based position in the index)

The URL updates automatically as you navigate. On restart, the theme restores the last position from localStorage. Priority order: URL params → localStorage → chapter 0.

---

## Theme Router — `window.YM_ROUTER`

Themes can declare their own URL routing by registering a router with app.js:

```js
window.YM.registerRouter({
  onPop(event) {
    // Return true to prevent app.js from handling the event
    return true;
  }
});
```

App.js calls `YM_ROUTER.onPop` before its own popstate handler. Combined with `history.pushState` and `history.replaceState`, a theme can implement its own navigation without interference from the core.

---

## Profile Sphere — Custom Public Profile

Any user can design and publish a custom public profile via the ⚙ menu in the profile panel → "Profile sphere".

### Editor features
- **Accent color** — applied to all generated elements
- **Keywords** — searchable tags shown in the Social Search tab
- **Spheres config** — per-sphere: visible/hidden in public profile, auto-open, order (design visibility, independent from system activation)
- **Sections order** — visible only when custom code is present
- **Before/After** — preview classic vs custom layout before publishing
- **Copy Prompt** — copies the YourMine AI prompt to clipboard
- **Unpublish** — removes the entry from `profile.json`

### Published files
- `uuid.profile.js` — the sphere code, hosted on the registry repo
- Entry in `profile.json` — uuid, name, keywords, spheres, accent, profileSphere URL, score

### Custom code field
Paste the body of `renderPanel(container)` directly. Variables available:
- `cfg` — your config (accent, keywords, sections, sphereConfig, autoOpen…)
- `container` — the panel DOM element
- `window.YM.getProfile()` — your live profile data

The sphere layer (sphere accordions) is always injected **after** your custom code, in the order and visibility you defined. It is priority and cannot be overridden by code.

### Two levels of sphere visibility
- **System visibility** — sphere active or not in the interface (bureau, liste). Managed by app.js/liste.js
- **Design visibility** — sphere shown or hidden in the public profile view. Managed by `cfg.sphereConfig[id].visible`

---

## Sphere Card Customization

Spheres can declare visual properties for their card in the liste:

```js
window.YM_S['mysphere.sphere.js'] = {
  name: 'My Sphere',
  cardBackground: 'https://...image.jpg',  // watermark behind the card
  cardGif: 'https://...anim.gif',           // animated gif as card background
  fullscreen: true,                          // open in fullscreen panel
  ...
}
```

- `cardBackground` — shown at 12% opacity, blurred, as a stylized watermark
- `cardGif` — shown at 18% opacity as animated background
- `fullscreen` — when true, the sphere panel opens edge-to-edge

---

## Profile Menu (⚙)

Single button in the profile panel header opens a bottom sheet with:
- **Edit identity** — avatar, name, bio, website
- **Backup** — export identity as JSON
- **Recovery** — P2P identity recovery
- **Publish name** — link name → UUID in name.json
- **Profile sphere** — design and publish custom public profile
