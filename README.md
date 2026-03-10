# YourMine — Plugin API

> **Plugin Developer Reference** · v1.0  
> P2P Proximity App · Solana Devnet · WebRTC / Trystero

---

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Plugin Structure](#3-plugin-structure)
4. [The YM Context Object](#4-the-ym-context-object)
5. [YM.peers & YM.contacts](#5-ympeers--ymcontacts)
6. [YM.broadcast() & YM.onHub()](#6-ymbroadcast--ymonhub)
7. [YM.toast() & YM.openProfile()](#7-ymtoast--ymopenprofile)
8. [Naming Convention & Categories](#8-naming-convention--categories)
9. [Styling Guidelines](#9-styling-guidelines)
10. [Publishing a Plugin](#10-publishing-a-plugin)
11. [Mining Protocol (Solana)](#11-mining-protocol-solana)
12. [Complete Examples](#12-complete-examples)
13. [Errors & Debugging](#13-errors--debugging)

---

## 1. Overview

YourMine is a single-page PWA for P2P proximity networking. Users discover each other within ~100 metres via WebRTC (Trystero) and MQTT. On top of this network layer sits a plugin system called **Spheres** — mini-applications that run directly inside the app and share the live P2P context.

| Term | Definition |
|------|-----------|
| **Sphere** | A plugin. "Sphere" in the UI; "plugin" in code. |
| **Near peer** | A user detected within ~100 m via geolocation + WebRTC. |
| **Contact** | A user saved locally (by URL, QR code, or GitHub Gist). |
| **YM** | The context object injected into every plugin's `render()` call. |
| **Hub packet** | Presence broadcast sent every 15 s to all connected peers. |
| **Greet packet** | Richer packet (includes photo) sent once on peer join. |

---

## 2. Architecture

YourMine is a single HTML file (~5700 lines). External scripts loaded at boot:

- `web3-config.js` — Solana network config (RPC endpoint, program IDs)
- `solana-helpers.js` — Transaction builders for burn / claim
- `ui-manager.js` — Handles the Anchor program UI callbacks
- `realtime-updates.js` — Polls on-chain state at regular intervals
- `app.js` — Top-level Solana app state machine
- `room.js` / `peer.js` — Trystero WebRTC primitives

The P2P layer uses Trystero over MQTT. Each user joins a room derived from their geographic coordinates (precision 2 decimal degrees ≈ 1 km²). Peers within the same tile are in the same room.

### State model

```js
// Global singleton — read-only from plugins via the YM context
State = {
  profile:      { uuid, name, photo, photoHub, networks[], website },
  plugins:      [{ name, icon, desc, code, url, pluggedAt, testMode? }],
  contacts:     [{ uuid, name, photo, networks[], plugins[], website }],
  nearCache:    [{ uuid, peerId, profile, location, timestamp, connected }],
  feedItems:    [{ uuid, network, posts[] }],
  geoCoords:    { lat, lng } | null,
  testingPlugin: { name, code } | null,
}
```

> **Note** — State is persisted to `localStorage` under keys: `ym_profile`, `ym_plugins`, `ym_networks`, `ym_contacts`, `ym_folders`.

---

## 3. Plugin Structure

A plugin is a single `.js` file that exposes one object named `plugin`. The file is fetched, evaluated with `new Function()`, and the `plugin` object is extracted.

### Minimal plugin

```js
const plugin = {
  icon:        '🎯',                  // emoji shown in Spheres grid
  description: 'A short description', // shown in Browse

  render(container, YM) {
    // container : HTMLElement — inject your UI here
    // YM        : context object (see section 4)
    container.innerHTML = '<p>Hello YourMine!</p>';
  }
};
```

### Full skeleton

```js
const plugin = {
  icon:        '⚡',
  description: 'Demonstrates every YM API feature',

  render(container, YM) {
    // 1. Build UI
    container.innerHTML = `
      <style>
        .ym-demo { font-family: inherit; padding: 16px; color: #e4e8f4; }
        .ym-demo h2 { color: #00d4aa; margin: 0 0 12px; }
        .ym-btn { background: #00d4aa; color: #070b14; border: none;
                  padding: 8px 16px; border-radius: 8px; cursor: pointer; }
      </style>
      <div class="ym-demo">
        <h2>Demo Plugin</h2>
        <p>Peers nearby: <strong id="peer-count">0</strong></p>
        <button class="ym-btn" id="ping-btn">Ping everyone</button>
        <div id="log"></div>
      </div>`;

    // 2. Read YM data
    container.querySelector('#peer-count').textContent = YM.peers.length;

    // 3. Send a P2P message
    container.querySelector('#ping-btn').onclick = () => {
      YM.broadcast({ type: 'demo_ping', from: YM.profile.name });
      YM.toast('Ping sent!', 'success');
    };

    // 4. Receive P2P messages
    YM.onHub((data, peerId) => {
      if (data.type !== 'demo_ping') return;
      const log = container.querySelector('#log');
      if (log) log.innerHTML += `<p>Ping from ${data.from}</p>`;
    });
  }
};
```

> **Important** — The plugin must be self-contained. No `import`, no `require`, no external `fetch` unless absolutely necessary. All UI must be injected into the `container` element.

---

## 4. The YM Context Object

`YM` is passed as the second argument to `render()`. It is rebuilt fresh every time a plugin is opened.

```ts
YM = {
  // ── Data (read-only snapshots) ────────────────────────────
  profile:    Profile,               // the local user
  peers:      PeerEntry[],           // merged near + contacts
  contacts:   Contact[],             // saved contacts only
  nearPeers:  NearCacheEntry[],      // raw near cache (lower-level)

  // ── Actions ───────────────────────────────────────────────
  broadcast(data: any): void,        // send to all WebRTC peers
  onHub(cb: (data, peerId) => void), // subscribe to incoming data
  toast(msg: string, type?: string), // show notification
  openProfile(uuid, profile, entry), // open profile modal
}
```

### Type: `Profile`

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | UUID v4 generated at first launch. Stable per device. |
| `name` | `string` | Display name chosen by the user. |
| `photo` | `string\|null` | Base64 JPEG, max 160 px, quality 0.85. |
| `photoHub` | `string\|null` | Smaller version (64 px, 0.65 quality) sent in hub packets. |
| `networks` | `Network[]` | Social accounts linked to this profile. |
| `website` | `string` | Optional personal URL. |

### Type: `Network`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | One of: `mastodon`, `bluesky`, `youtube`, `medium`, `reddit`, `tumblr`, `peertube`, `paragraph`, `substack` |
| `handle` | `string` | Username. Leading `@` is stripped on save; `publicFeedUrl` adds it back internally. For mastodon/peertube, stored as `user@instance`. |

### Type: `PeerEntry` (`YM.peers`)

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Unique identifier of the peer. |
| `name` | `string` | Display name (may be empty). |
| `photo` | `string\|null` | Base64 avatar from greet packet. |
| `networks` | `Network[]` | Social accounts from their profile. |
| `plugins` | `{name, icon}[]` | Plugins the peer has installed. |
| `connected` | `boolean` | `true` = direct WebRTC link; `false` = gossip/contact. |
| `source` | `"near"\|"contact"` | How this peer was discovered. |
| `peerId` | `string\|null` | Trystero peer ID. Available only for `source:"near"`. |

---

## 5. YM.peers & YM.contacts

### `YM.peers`

Merged list of near peers and saved contacts, deduplicated by `uuid`. The local user is always excluded.

```js
// List online peers who also have your plugin installed
const myPlugin = 'social.my-plugin';

const shared = YM.peers.filter(p =>
  p.connected && p.plugins.some(pl => pl.name === myPlugin)
);
shared.forEach(p => console.log(p.name, p.uuid));
```

### `YM.contacts`

Saved contacts only. Same shape as `PeerEntry`. Available even when the peer is not nearby.

### `YM.nearPeers` (raw cache)

Lower-level array with geolocation and timing data. Prefer `YM.peers` for most use-cases.

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Peer UUID. |
| `peerId` | `string` | Trystero peer ID. |
| `profile` | `object` | Raw profile from hub/greet packet. |
| `location` | `{lat,lng}\|null` | Position (precision 3 decimal digits ≈ 100 m). |
| `timestamp` | `number` | Unix ms of last hub packet received. |
| `connected` | `boolean` | Active WebRTC connection. |
| `source` | `"direct"\|"gossip"` | `"gossip"` = received via a relay peer. |

> **Expiry** — Direct peers expire after **1 hour** of silence (`NEAR_TTL_MS = 3 600 000`). Gossip peers expire after **5 minutes** (`NEAR_DISC_TTL_MS = 300 000`).

### Hub broadcast cycle

Each user broadcasts a hub packet every **15 seconds** (`HUB_INTERVAL_MS`). Contents:

- `uuid`, `timestamp`
- `profile.name`, `profile.networks` (first 3), `profile.website`
- `profile.plugins` — array of `{name, icon}` for all installed plugins
- `location` — lat/lng rounded to 3 decimal places
- `testPlugin` — set if the user is currently testing a plugin

On peer join, a richer **greet packet** is sent immediately, including the full `photo` and all networks.

---

## 6. YM.broadcast() & YM.onHub()

### `YM.broadcast(data)`

Sends a JSON-serialisable object to all currently connected WebRTC peers via the `plugData` channel. Not stored, not forwarded to gossip peers.

```js
// Signature
YM.broadcast(data: any): void

// Example
YM.broadcast({
  type:    'my_plugin_event',
  payload: { score: 42, player: YM.profile.name },
});
```

> ⚠️ **Always namespace** your messages with a `type` field to avoid conflicts with other plugins.

### `YM.onHub(callback)`

Registers a callback that fires whenever any P2P data is received — hub/greet packets and plugin broadcasts alike.

```js
// Signature
YM.onHub(callback: (data: any, peerId: string) => void): void

// Example
YM.onHub((data, peerId) => {
  if (data.type !== 'my_plugin_event') return;
  console.log('Received from', peerId, data.payload);
});
```

> ⚠️ Callbacks are **cleared when the modal closes**. To avoid stacking listeners across reopens, use a guard:

```js
let _listening = false;

render(container, YM) {
  if (!_listening) {
    _listening = true;
    YM.onHub((data) => { /* ... */ });
  }
}
```

### Message queue

Messages received while no plugin is open are buffered (up to 50, FIFO). When a plugin opens and calls `onHub`, the queue is replayed with a 100 ms delay.

---

## 7. YM.toast() & YM.openProfile()

### `YM.toast(message, type?)`

Displays a short notification. Auto-dismisses after ~3 seconds.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Text to display. |
| `type` | `"success"\|"error"\|"info"` | Optional. Colour coding. |

```js
YM.toast('Saved!', 'success');
YM.toast('Network error.', 'error');
YM.toast('FYI: peer went offline.');
```

### `YM.openProfile(uuid, profile, entry?)`

Opens the read-only profile modal for any peer or contact.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uuid` | `string` | UUID of the peer to show. |
| `profile` | `object` | Profile data (`Profile` type). |
| `entry` | `NearCacheEntry\|null` | Optional raw near cache entry for extra context. |

```js
YM.peers.forEach(peer => {
  const el = document.createElement('div');
  el.textContent = peer.name || 'Anonymous';
  el.style.cursor = 'pointer';
  el.onclick = () => YM.openProfile(peer.uuid, peer, null);
  container.appendChild(el);
});
```

---

## 8. Naming Convention & Categories

### File naming

```
category.plugin-name.plugin.js

// Examples
social.matching.plugin.js
jeux.snake.plugin.js
finance.split-bill.plugin.js
autres.hello-world.plugin.js
```

The slug is derived by:
1. Lowercasing the name
2. Removing accents (NFD normalisation)
3. Replacing all non-alphanumeric characters with `-`
4. Trimming leading/trailing hyphens

*Example: `"Split the Bill!"` → `split-the-bill`*

### Categories

| | | | |
|---|---|---|---|
| `social` | `jeux` | `outils` | `medias` |
| `transport` | `evenements` | `commerce` | `sante` |
| `education` | `nature` | `finance` | `securite` |
| `productivite` | `local` | `autres` | |

> When in doubt, use `autres`. The category only affects Browse filters, not functionality.

---

## 9. Styling Guidelines

Plugins render inside a scrollable modal container. Follow these guidelines to look native.

### Colour palette

| CSS Variable | Hex | Usage |
|---|---|---|
| `--bg` | `#070b14` | Main background |
| `--bg-surface` | `#0d1525` | Cards, panels |
| `--bg-card` | `#131e35` | Items, rows |
| `--accent` | `#00d4aa` | Primary accent (green-teal) |
| `--accent2` | `#5b6af5` | Secondary accent (indigo) |
| `--text` | `#e4e8f4` | Primary text |
| `--text-2` | `#a0aec0` | Secondary text |
| `--text-3` | `#4a5568` | Muted / placeholder |
| `--danger` | `#ef4444` | Errors, destructive |
| `--border` | `rgba(255,255,255,0.08)` | Subtle borders |
| `--radius` | `14px` | Default border radius |

### Typography

Use `font: inherit` to inherit the app's **Figtree** sans-serif. For code, use `font-family: "Courier New", monospace`.

### CSS injection

```js
render(container, YM) {
  const style = document.createElement('style');
  style.textContent = `
    .my-plugin { padding: 16px; color: #e4e8f4; font-family: inherit; }
    .my-plugin button { background: #00d4aa; color: #070b14;
                        border: none; border-radius: 8px; padding: 8px 16px; }
  `;
  container.appendChild(style);
}
```

> Always scope styles to a class unique to your plugin. Avoid global selectors like `body` or `html`.

---

## 10. Publishing a Plugin

### Repository

```
https://github.com/theodoreyong9/YourMinedApp

// Raw CDN (plugin fetch)
https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/{filename}

// GitHub API (Browse listing)
https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/
```

### Method 1 — Build tab (in-app)

1. Write or AI-generate your plugin in the Build editor.
2. Pick a category and enter a plugin name.
3. Click **Tester** to run in test mode (navigates to Spheres).
4. Enter your GitHub personal access token (needs `repo` write scope).
5. Click **Publier sur GitHub** to push directly.

### Method 2 — Browse → URL tab

Paste a direct raw GitHub URL:

```
https://raw.githubusercontent.com/{owner}/{repo}/main/category.name.plugin.js
```

### GitHub push flow (internal)

```
// 1. Validate GitHub token
GET  https://api.github.com/user

// 2. Check if file already exists (to get SHA for update)
GET  https://api.github.com/repos/{owner}/{repo}/contents/{filename}

// 3. Create or update file
PUT  https://api.github.com/repos/{owner}/{repo}/contents/{filename}
{
  message: "Add plugin {filename}",
  content: btoa(code),   // base64-encoded source
  sha:     existing_sha  // required for update, omit for create
}
```

> ⚠️ If the authenticated user is not the repo owner, the push goes to their fork. No PR is created automatically.

---

## 11. Mining Protocol (Solana)

YourMine includes a deflationary mining protocol on Solana devnet. Users burn SOL to receive YRM tokens.

### Program addresses

```
PROGRAM_ID:      6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ
CREATOR_ADDRESS: 7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6
NETWORK:         devnet
RPC:             https://api.devnet.solana.com
```

### Burn / Claim flow

1. User sets burn amount (SOL) and patience rate τ (0–40%) in the Mine card.
2. Mine card injects values into a hidden HTML bridge that `ui-manager.js` reads.
3. `ui-manager.js` calls `executeBurn(amount, taxRate)`.
4. `app.js` calls `SolanaHelpers.createBurnTransaction(amount, taxRate)`.
5. `WalletManager.signAndSendTransaction(tx)` signs with `EmbeddedWallet.keypair`.
6. Transaction submitted to devnet; signature confirmed.

### YRM mining formula

```
// Immediate reward
immediate = x * (1 - T)

// Claimable reward (grows over time)
// Standard form
R = S * t^α / [ln(A^(β(1−T)) + C)]^γ

// Numerically stable form (used on-chain)
R = S * t^α / [β(1−T)*ln(A) + ln(1 + C/A^(β(1−T)))]^γ

// Variables
// S   = last burn amount (SOL)
// t   = slots since last action
// T   = patience rate [0, 0.40]
// A   = protocol age (current Solana block height)
// C   = stabilisation constant
// α β γ = protocol parameters
```

### Creator fee

**0.1%** of every burn is routed to `CREATOR_ADDRESS`. Enforced on-chain.

### EmbeddedWallet

Pure-JS wallet — no Phantom or browser extension required.

- BIP39 mnemonic → PBKDF2-HMAC-SHA512 seed
- SLIP-0010 ed25519 derivation → Solana keypair
- Encrypted with AES-256-GCM (user password) → stored in `localStorage` key `ym_wallet_v1`

---

## 12. Complete Examples

### Example 1: Peer list with profile links

```js
const plugin = {
  icon: '👥',
  description: 'Shows nearby peers with profile links',

  render(container, YM) {
    container.innerHTML = `
      <style>
        .peer-list { padding: 16px; }
        .peer-item { display: flex; align-items: center; gap: 12px;
                     padding: 10px; border-radius: 10px;
                     background: #131e35; margin-bottom: 8px; cursor: pointer; }
        .peer-item:hover { background: #1a2845; }
        .avatar { width: 36px; height: 36px; border-radius: 50%;
                  background: #00d4aa22; display: flex; align-items: center;
                  justify-content: center; font-size: 1rem; }
        .peer-name   { color: #e4e8f4; font-weight: 600; }
        .peer-status { font-size: 0.75rem; color: #00d4aa; }
      </style>
      <div class="peer-list" id="list"></div>`;

    const list = container.querySelector('#list');

    if (!YM.peers.length) {
      list.innerHTML = '<p style="color:#4a5568">No peers nearby yet.</p>';
      return;
    }

    YM.peers.forEach(peer => {
      const item = document.createElement('div');
      item.className = 'peer-item';
      item.innerHTML = `
        <div class="avatar">
          ${peer.photo
            ? `<img src="${peer.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
            : '👤'}
        </div>
        <div>
          <div class="peer-name">${peer.name || 'Anonymous'}</div>
          <div class="peer-status">${peer.connected ? '● online' : '○ contact'}</div>
        </div>`;
      item.onclick = () => YM.openProfile(peer.uuid, peer, null);
      list.appendChild(item);
    });
  }
};
```

### Example 2: Real-time shared vote

```js
const plugin = {
  icon: '🗳',
  description: 'Live vote shared with nearby peers',

  render(container, YM) {
    const votes = { yes: 0, no: 0 };

    container.innerHTML = `
      <style>
        .vote-box { padding: 20px; text-align: center; color: #e4e8f4; }
        .vote-q   { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; }
        .vote-btns { display: flex; gap: 12px; justify-content: center; }
        .btn-yes { background: #00d4aa; color: #070b14; border: none;
                   padding: 12px 24px; border-radius: 10px; cursor: pointer; }
        .btn-no  { background: #ef4444; color: #fff; border: none;
                   padding: 12px 24px; border-radius: 10px; cursor: pointer; }
        .tally   { margin-top: 16px; font-size: 0.9rem; color: #a0aec0; }
      </style>
      <div class="vote-box">
        <div class="vote-q">Is this plugin useful?</div>
        <div class="vote-btns">
          <button class="btn-yes">👍 Yes</button>
          <button class="btn-no">👎 No</button>
        </div>
        <div class="tally" id="tally">Yes: 0  ·  No: 0</div>
      </div>`;

    const tally  = container.querySelector('#tally');
    const update = () => {
      tally.textContent = `Yes: ${votes.yes}  ·  No: ${votes.no}`;
    };

    container.querySelector('.btn-yes').onclick = () => {
      votes.yes++;
      update();
      YM.broadcast({ type: 'vote_cast', choice: 'yes' });
    };
    container.querySelector('.btn-no').onclick = () => {
      votes.no++;
      update();
      YM.broadcast({ type: 'vote_cast', choice: 'no' });
    };

    YM.onHub((data) => {
      if (data.type !== 'vote_cast') return;
      if (data.choice === 'yes') votes.yes++;
      else if (data.choice === 'no') votes.no++;
      update();
    });
  }
};
```

---

## 13. Errors & Debugging

### Common errors

| Error | Cause & Fix |
|-------|-------------|
| `Le code doit exposer un objet 'plugin'` | File evaluated but `window.__ym_plug` was `null`. The object must be named exactly `plugin` and declared at top level. |
| `Plugin has no render() method` | The plugin object exists but `render` is missing or misspelled. |
| `Plugin error: <message>` | Exception thrown inside `render()`. Open DevTools for the full stack trace. |
| `Could not fetch plugin` | The URL returned a non-200 status. Check the raw GitHub URL. |
| `X is already installed` | A plugin with the same name is in `State.plugins`. Rename or unplug first. |

### Test mode

Use **Tester** in the Build tab. Test-mode plugins:
- Are tagged `testMode: true` and show a **TEST** badge in Spheres.
- Broadcast a `test_plugin_signal` to nearby peers so collaborators can see what you're building.
- Persist to `localStorage` but are not published to GitHub.

### AI-assisted generation

The Build tab includes an AI sub-tab. Provide a description and an Anthropic (`sk-ant-…`) or OpenAI (`sk-…`) API key to generate plugin code automatically. The AI receives the full API spec as a system prompt.

### Feed integration

The Feed tab fetches RSS/Atom feeds for nearby peers and contacts.

| Network | Feed URL |
|---------|----------|
| `paragraph` | `https://paragraph.xyz/@{handle}/feed` |
| `substack` | `https://{handle}.substack.com/feed` |
| `medium` | `https://medium.com/feed/@{handle}` |
| `bluesky` | `https://bsky.app/profile/{handle}/rss` |
| `mastodon` | `https://{instance}/@{user}.rss` (handle = `user@instance`) |
| `reddit` | `https://www.reddit.com/user/{handle}.rss?limit=10` |
| `youtube` | ❌ Not supported (requires channel ID, not handle) |

Fetch strategy (tried in order): **rss2json.com** → **allorigins.win** (CORS proxy) → **corsproxy.io**.

---

*YourMine · [github.com/theodoreyong9/YourMinedApp](https://github.com/theodoreyong9/YourMinedApp)*
