# YourMine — Sphere Developer API

> Version 2 · Architecture loader + code · Devnet Solana

---

## Table des matières

1. [Qu'est-ce qu'une Sphere ?](#1-quest-ce-quune-sphere)
2. [Architecture des fichiers](#2-architecture-des-fichiers)
3. [Enregistrement](#3-enregistrement)
4. [Lifecycle hooks](#4-lifecycle-hooks)
5. [Context API (ctx)](#5-context-api-ctx)
6. [P2P Messaging](#6-p2p-messaging)
7. [CSS Variables & Design System](#7-css-variables--design-system)
8. [Composants UI réutilisables](#8-composants-ui-réutilisables)
9. [Intégration Panel & Desktop](#9-intégration-panel--desktop)
10. [Profile Sections](#10-profile-sections)
11. [Desktop Widget](#11-desktop-widget)
12. [Build Eligibility & Soumission](#12-build-eligibility--soumission)
13. [Bonnes pratiques & erreurs communes](#13-bonnes-pratiques--erreurs-communes)
14. [Exemple complet](#14-exemple-complet)

---

## 1. Qu'est-ce qu'une Sphere ?

Une **sphere** est un module JavaScript auto-contenu qui s'intègre dans YourMine. Une fois activée, elle :

- Ajoute une **icône** sur le bureau
- Ouvre un **panel** au tap
- Peut communiquer avec les pairs proches via **P2P WebRTC**
- Peut stocker des données persistantes dans **localStorage** (namespaced)
- Peut afficher des sections dans le **profil** utilisateur

Les spheres tournent dans le **contexte JS principal** (pas d'iframe sandbox). Elles peuvent accéder à `window`, au DOM, aux APIs des autres spheres, au P2P et à leur namespace localStorage. Elles ne peuvent **pas** accéder aux clés privées du wallet.

---

## 2. Architecture des fichiers

Lors d'une soumission, **deux fichiers** sont créés :

```
mysphere.sphere.js        ← tiny loader (~400 bytes) — mergé dans le repo principal
mysphere.sphere.code.js   ← ton code réel — reste dans TON fork
```

Le loader fetch ton code depuis ton fork GitHub au runtime :

```js
// mysphere.sphere.js (auto-généré par build.js — ne pas écrire soi-même)
fetch('https://raw.githubusercontent.com/YOU/YourMinedApp/main/mysphere.sphere.code.js')
  .then(r => r.text())
  .then(code => { /* exécute ton code */ });
```

**Tu n'écris que le fichier code.** Le loader est généré automatiquement.

> ⚠️ Le filename **doit** se terminer par `.sphere.js`. Le suffixe est ajouté automatiquement par le formulaire de build — tape juste le nom de base (ex. `mysphere`).

---

## 3. Enregistrement

Ton fichier code doit s'enregistrer sur `window.YM_S` au **niveau module** (pas dans `activate()`) :

```js
/* jshint esversion:11, browser:true */
(function(){
'use strict';
window.YM_S = window.YM_S || {};

window.YM_S['mysphere.sphere.js'] = {
  // ── Requis ──────────────────────────────────────────────────
  name:        'MySphere',         // Nom affiché dans l'UI
  icon:        '⬡',               // Emoji OU URL https:// (image 40×40)
  category:    'Utility',         // Affiché dans le filtre de la liste
  description: 'What it does.',   // Description courte (1–2 phrases)

  // ── Types de messages P2P (optionnel, pour documentation) ───
  emit:    ['myevent:ping'],       // Types que cette sphere envoie
  receive: ['myevent:pong'],       // Types que cette sphere gère

  // ── Lifecycle ───────────────────────────────────────────────
  activate(ctx)  { /* appelé quand l'utilisateur active */ },
  deactivate()   { /* appelé quand l'utilisateur désactive — NETTOYER ICI */ },

  // ── UI ──────────────────────────────────────────────────────
  renderPanel(container) { /* remplit le panel */ },

  // ── Optionnel ───────────────────────────────────────────────
  profileSection(container)       { /* affiché dans son propre profil */ },
  peerSection(container, peerCtx) { /* affiché sur le profil d'un autre */ },
  broadcastData()                 { /* données injectées dans le heartbeat de présence */ },
};
})();
```

### Icône

```js
icon: '⬡'                             // emoji
icon: 'https://example.com/icon.png'  // image distante (36×36px, arrondie)
icon: 'data:image/png;base64,...'      // base64 inline
icon: '/my-icon.svg'                   // chemin local
```

---

## 4. Lifecycle hooks

### `activate(ctx)`

Appelé une fois quand l'utilisateur active la sphere. Reçoit l'objet context. Utiliser pour restaurer l'état, démarrer les intervalles, enregistrer les listeners P2P.

```js
activate(ctx) {
  _ctx = ctx;

  // Restaurer l'état depuis le storage scopé
  const saved = ctx.storage.get('mydata');

  // Enregistrer un listener P2P (auto-nettoyé par ctx au deactivate)
  ctx.onReceive((type, data, peerId) => {
    if (type !== 'myevent:pong') return;
    console.log('Got pong from', peerId, data);
  });
},
```

### `deactivate()`

Appelé quand l'utilisateur supprime la sphere. **Doit nettoyer** — clearInterval, nullifier les références, supprimer les listeners DOM.

```js
deactivate() {
  clearInterval(_myInterval);
  _ctx = null;
  // Les listeners ctx.onReceive() sont auto-nettoyés via ctx._cleanup()
},
```

> ⚠️ Les listeners enregistrés via `ctx.onReceive()` sont nettoyés automatiquement. Mais tes propres `setInterval`, `addEventListener` et références doivent être nettoyés manuellement.

### `renderPanel(container)`

Appelé chaque fois que l'utilisateur ouvre le panel de ta sphere.

```js
renderPanel(container) {
  container.innerHTML = ''; // Toujours vider en premier
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';

  // Zone scrollable
  const scroll = document.createElement('div');
  scroll.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px';
  container.appendChild(scroll);

  // Barre fixe en bas (optionnel)
  const bar = document.createElement('div');
  bar.style.cssText = 'flex-shrink:0;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06)';
  container.appendChild(bar);
},
```

### `broadcastData()` — Optionnel ⚡

Appelé par `social.sphere.js` toutes les **5 secondes** dans `buildProfilePacket()`. Ce que tu retournes est mergé dans le payload de présence broadcasté à tous les pairs proches.

```js
// Ce que tu retournes est spread dans social:presence
// Les pairs le reçoivent dans : YM_Social._nearUsers.get(uuid).profile.ta_clé
broadcastData() {
  return {
    td_invite: _currentInvite,    // ex: invitation de jeu
    td_towers: _myTowerPositions, // ex: état du jeu pour l'espionnage
  };
},
```

> ✅ **`broadcastData()` contourne le rate limiter de 3s** car il voyage dans `social:presence`, qui est whitelisté dans `index.html`. C'est le canal privilégié pour partager de la donnée en temps réel sans blocage.

---

## 5. Context API (`ctx`)

L'objet `ctx` est passé à `activate()` et donne accès à toutes les fonctionnalités YourMine.

### Profil

```js
// Charger le profil de l'utilisateur courant
const profile = ctx.loadProfile();
// → { uuid, name, bio, avatar, spheres, created, pubkey, ... }

// Sauvegarder / merger des champs (seules les clés spécifiées sont mergées)
ctx.saveProfile({ myField: 'value' });
```

> ⚠️ `ctx.saveProfile()` est **local uniquement** — il ne se propage PAS sur le réseau vers les autres utilisateurs. Pour partager de la donnée avec les pairs, utiliser `broadcastData()` ou `ctx.send()`.

### Storage persistant

Scopé à ta sphere. Les autres spheres ne peuvent pas lire tes clés. Stocké comme `ym_s|mysphere.sphere.js|key` dans localStorage.

```js
ctx.storage.get('key')          // → value | null
ctx.storage.set('key', value)   // value : tout type JSON-serializable
ctx.storage.del('key')          // supprime la clé
```

> ⚠️ Ne pas utiliser `localStorage` directement — utiliser `ctx.storage` pour le namespacing correct.

### Badge desktop

```js
ctx.setNotification(3)   // affiche "3" sur l'icône desktop
ctx.setNotification(0)   // efface le badge

// Bonne pratique : effacer à l'ouverture du panel
renderPanel(container) {
  ctx.setNotification(0);
  // ...
}
```

### Toast

```js
ctx.toast('Sauvegardé !', 'success')
ctx.toast('Erreur', 'error')
ctx.toast('Info', 'info')
ctx.toast('Attention', 'warn')
```

### Ouvrir le panel

```js
ctx.openPanel()                    // ouvre ton panel (= taper l'icône)
ctx.openPanel(container => {       // override renderPanel pour cette ouverture
  container.innerHTML = '<p>Contenu custom</p>';
})

// Aussi disponible globalement :
window.YM.openSpherePanel('mysphere.sphere.js')
```

### Tab Badge

Si ton panel utilise `.ym-tabs` :

```js
ctx.setTabBadge(container, 'messages', 3)  // affiche "3" sur l'onglet
ctx.setTabBadge(container, 'messages', 0)  // efface
```

---

## 6. P2P Messaging

YourMine utilise un mesh WebRTC via **Trystero** (relais Nostr). Tous les utilisateurs proches qui ont YourMine ouvert sont des pairs potentiels.

### Envoyer

```js
// Broadcast à TOUS les pairs
ctx.send('myevent:ping', { text: 'hello everyone' })

// Envoi à UN pair spécifique (peerId reçu via onReceive)
ctx.send('myevent:ping', { text: 'hello you' }, peerId)

// Retourne false si P2P indisponible ou rate-limité
const sent = ctx.send('myevent:update', data)
if (!sent) { /* gérer gracieusement */ }
```

### Recevoir

```js
ctx.onReceive((type, data, peerId) => {
  if (type !== 'myevent:pong') return; // Toujours vérifier le type
  console.log('Reçu de', peerId, data);
});
```

> ✅ `ctx.onReceive()` est **cumulatif** — chaque appel ajoute un listener, il ne remplace pas les précédents. Tous les handlers enregistrés reçoivent chaque message.

### Format interne des messages

```js
// Les messages sont wrappés automatiquement :
{ sphere: 'mysphere.sphere.js', type: 'myevent:ping', data: { ... } }

// Seuls les messages où sphere === 'mysphere.sphere.js' sont délivrés à ton handler
```

### Rate limiting — ⚠️ CRITIQUE

Le layer P2P enforce `GAP = 3000ms` — **1 message par pair par 3 secondes maximum**. Les messages en excès sont silencieusement droppés.

| Type de message | Comportement |
|---|---|
| `social:presence` (heartbeat) | Toujours délivré — whitelisté dans `index.html` |
| Tous les autres types | Max 1 / pair / 3s — excès droppés sans erreur |
| `broadcastData()` retourne | Injecté dans `social:presence` — pas de rate limit |
| `ctx.send()` retourne `false` | Bloqué par rate limit ou pas de P2P |

**Contournements du rate limit :**

- Utiliser `broadcastData()` pour la donnée qui doit se mettre à jour toutes les 5s
- Délayer les envois avec `setTimeout(..., 4000)` pour être sûr que > GAP s'est écoulé
- Batcher plusieurs événements dans un seul payload
- Utiliser les DOM events (`window.dispatchEvent`) pour la communication sur le même device

### Communication inter-spheres (même device)

```js
// Émettre un événement custom
window.dispatchEvent(new CustomEvent('ym:mysphere:event', { detail: data }));

// Écouter dans une autre sphere
window.addEventListener('ym:mysphere:event', ({ detail }) => { ... });

// Ou exposer une API publique sur ton objet sphere
window.YM_S['mysphere.sphere.js'].myPublicMethod = (arg) => { ... };
```

---

## 7. CSS Variables & Design System

Toutes les CSS variables de l'app hôte sont disponibles dans l'UI de ta sphere.

### Couleurs

```css
--bg          #06060e        /* fond sombre principal */
--text        #e4e6f4        /* texte primaire */
--text2       rgba(228,230,244,.52)  /* texte secondaire */
--text3       rgba(228,230,244,.26)  /* muted / placeholder */
--gold        #f0a830        /* accent principal — utiliser pour CTAs */
--cyan        #08e0f8        /* accent secondaire */
--red         #ff4560        /* erreur / danger */
--green       #22d98a        /* succès */
```

### Polices

```css
--font-d      'Syne', sans-serif          /* display / titres */
--font-b      'Space Grotesk', sans-serif /* corps de texte */
--font-m      'JetBrains Mono', monospace /* code / nombres */
```

### Effets glass

```css
--glass-heavy  rgba(6,6,18,.84)
--blur-heavy   blur(56px) saturate(200%) brightness(.9)
--blur-mid     blur(36px) saturate(180%)
```

### Utilisation en inline styles

```js
container.innerHTML = `
  <div style="color:var(--gold);font-family:var(--font-d)">Titre</div>
  <div style="color:var(--text2);font-family:var(--font-b)">Corps</div>
  <div style="color:var(--text3);font-family:var(--font-m)">Monospace</div>
  <div style="background:rgba(240,168,48,.1);border:1px solid rgba(240,168,48,.3)">Card</div>
`;
```

---

## 8. Composants UI réutilisables

Ces classes CSS sont disponibles globalement dans YourMine.

### Cards

```html
<div class="ym-card">
  <div class="ym-card-title">LABEL DE SECTION</div>
  <!-- contenu -->
</div>
```

### Stat rows

```html
<div class="ym-stat-row">
  <span class="ym-stat-label">Balance</span>
  <span class="ym-stat-value gold">42.00</span>
  <!-- modifiers: gold | cyan | green -->
</div>
```

### Notices / alertes

```html
<div class="ym-notice info">Message informatif</div>
<div class="ym-notice success">Succès</div>
<div class="ym-notice error">Erreur</div>
<div class="ym-notice warn">Avertissement</div>
```

### Boutons

```html
<button class="ym-btn ym-btn-accent">Action primaire</button>
<button class="ym-btn ym-btn-ghost">Action secondaire</button>
<button class="ym-btn ym-btn-danger">Action destructive</button>
<button class="ym-btn" disabled>Désactivé</button>
```

### Inputs

```html
<input class="ym-input" placeholder="Saisir…">
<textarea class="ym-input ym-textarea" rows="4"></textarea>
```

### Tabs

```html
<div class="ym-tabs">
  <div class="ym-tab active" data-tab="a">Onglet A</div>
  <div class="ym-tab" data-tab="b">Onglet B</div>
</div>
```

```js
container.querySelectorAll('.ym-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    container.querySelectorAll('.ym-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    switchTab(tab.dataset.tab);
  });
});
```

### Pills / tags

```html
<span class="pill">Tag</span>
<span class="pill active">Tag actif</span>
```

### Séparateur

```html
<div class="ym-separator"></div>
```

---

## 9. Intégration Panel & Desktop

### `renderPanel(container)`

Appelé à chaque ouverture du panel. Le `container` est un `div.panel-body` que tu remplis complètement.

> ⚠️ Toujours commencer par `container.innerHTML = ''` — `renderPanel` peut être appelé plusieurs fois.

### Notification badge

```js
ctx.setNotification(3)   // affiche "3" sur l'icône desktop
ctx.setNotification(0)   // efface

// Effacer à l'ouverture du panel :
renderPanel(container) {
  ctx.setNotification(0);
  // ...
}
```

---

## 10. Profile Sections

### `profileSection(container)`

Affiché dans le panel profil de **l'utilisateur lui-même** (onglet ⬡ Spheres). Utile pour les settings, stats, actions liées à ta sphere.

```js
profileSection(container) {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">⬡</span>
      <div style="flex:1;font-size:12px;color:var(--text2)">Statut de ma sphere</div>
      <button class="ym-btn ym-btn-ghost" id="my-btn" style="font-size:11px">Paramètres</button>
    </div>
  `;
  el.querySelector('#my-btn').addEventListener('click', () => {
    if (_ctx) _ctx.openPanel();
  });
  container.appendChild(el);
},
```

### `peerSection(container, peerCtx)`

Affiché quand on consulte le profil d'**un autre utilisateur**. `peerCtx` contient :

```js
peerCtx = {
  uuid:       'peer-uuid',    // UUID YourMine du pair
  peerId:     'p2p-peer-id',  // ID WebRTC (pour ctx.send() ciblé)
  isNear:     true,           // est-il actuellement en ligne à proximité ?
  isReciproc: true,           // vous êtes-vous mutuellement ajoutés ?
  profile: {
    name, bio, avatar, spheres,
    // + tout ce que son broadcastData() retourne :
    td_invite: { ... },       // exemple : invitation de jeu
    td_towers: [ ... ],       // exemple : positions des tours pour l'espionnage
  }
}
```

> ✅ `peerCtx.profile` est mis à jour **en temps réel** (toutes les 5s via le heartbeat `social:presence`). C'est là que tu lis les données exposées par `broadcastData()` du pair.

```js
peerSection(container, peerCtx) {
  if (!peerCtx.isNear) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text3)">Pas à proximité</div>';
    return;
  }

  // Lire les données live du pair (incluant broadcastData())
  const invite = peerCtx.profile?.td_invite;
  if (invite && invite.toUUID === _myUUID()) {
    // Ce pair m'a invité !
    const btn = document.createElement('button');
    btn.className = 'ym-btn ym-btn-accent';
    btn.textContent = '✓ Accepter le défi';
    btn.onclick = () => acceptInvite(invite);
    container.appendChild(btn);
  }
},
```

---

## 11. Desktop Widget

Les spheres peuvent créer des éléments DOM flottants et déplaçables sur le bureau.

```js
let _widget = null;
const WIDGET_ID = 'mysphere';
const POS_KEY   = 'ym_mysphere_pos_v1';

function createWidget() {
  if (_widget && document.body.contains(_widget)) return;
  const pos = JSON.parse(localStorage.getItem(POS_KEY) || '{"right":12,"bottom":90,"page":0}');

  _widget = document.createElement('div');
  _widget.style.cssText =
    'position:fixed;z-index:250;right:'+pos.right+'px;bottom:'+pos.bottom+'px;'+
    'background:rgba(8,8,15,.92);backdrop-filter:blur(20px);'+
    'border:1px solid rgba(240,168,48,.35);border-radius:14px;'+
    'width:180px;touch-action:none;user-select:none';
  _widget.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text)">Mon Widget</div>';
  document.body.appendChild(_widget);

  if (window.YM_Desk) window.YM_Desk.registerWidgetPage(WIDGET_ID, pos.page || 0);

  // Drag (pointer events)
  let dragging=false, ox=0, oy=0, wx=0, wy=0;
  _widget.addEventListener('pointerdown', e => {
    dragging=true; const r=_widget.getBoundingClientRect();
    wx=r.left; wy=r.top; ox=e.clientX; oy=e.clientY;
    _widget.style.left=wx+'px'; _widget.style.top=wy+'px';
    _widget.style.right=''; _widget.style.bottom='';
    try { _widget.setPointerCapture(e.pointerId); } catch(_) {}
  }, { passive:true });
  _widget.addEventListener('pointermove', e => {
    if (!dragging) return;
    wx+=e.clientX-ox; wy+=e.clientY-oy; ox=e.clientX; oy=e.clientY;
    wx=Math.max(0, Math.min(window.innerWidth-_widget.offsetWidth, wx));
    wy=Math.max(0, Math.min(window.innerHeight-90-_widget.offsetHeight, wy));
    _widget.style.left=wx+'px'; _widget.style.top=wy+'px';
  }, { passive:true });
  _widget.addEventListener('pointerup', () => {
    if (!dragging) return; dragging=false;
    const r=_widget.getBoundingClientRect();
    const right=Math.max(0,window.innerWidth-r.right);
    const bottom=Math.max(0,window.innerHeight-r.bottom);
    const page=window._deskCurPage||0;
    localStorage.setItem(POS_KEY, JSON.stringify({right,bottom,page}));
    if(window.YM_Desk)window.YM_Desk.registerWidgetPage(WIDGET_ID,page);
  }, { passive:true });

  window.addEventListener('ym:page-change', _syncPage);
  _syncPage();
}

function _syncPage() {
  if (!_widget) return;
  const pos=JSON.parse(localStorage.getItem(POS_KEY)||'{}');
  const visible=(window._deskCurPage||0)===(pos.page||0);
  _widget.style.opacity=visible?'1':'0';
  _widget.style.pointerEvents=visible?'all':'none';
}

function removeWidget() {
  if (_widget) {
    window.removeEventListener('ym:page-change', _syncPage);
    _widget.remove(); _widget=null;
  }
  if (window.YM_Desk) window.YM_Desk.unregisterWidget(WIDGET_ID);
}

// Dans activate()  : createWidget()
// Dans deactivate(): removeWidget()
```

---

## 12. Build Eligibility & Soumission

### Score de build (nouveau fichier uniquement)

Publier un **nouveau** nom de fichier requiert que ton ratio de score ait progressé depuis la dernière publication :

```
(score_last_pub + 1) / (laps_last_pub + 1)  <  (score_now + 1) / (laps_now + 1)

// score = score YRM accumulé
// laps  = slots Solana écoulés depuis le dernier burn (~0.4s/slot)
```

> ✅ **Upgrade** d'une sphere existante (même filename, même compte GitHub) : **aucune restriction de score**. Tu peux pousser des mises à jour librement.

### Workflow de soumission

1. **Connecter le wallet** — déverrouiller dans l'onglet Wallet
2. **Connecter GitHub** — fournir un Personal Access Token (scope : `repo`)
3. **Écrire le code** — coller dans la textarea Submit
4. **Sign & Submit** — l'app hash en SHA-256, signe et pousse vers ton fork
5. Un bot GitHub Actions valide et ouvre une Pull Request vers le repo principal
6. En cas de succès : le loader est mergé, `files.json` est mis à jour avec ton `codeUrl`

### Validations du bot

| Vérification | Nouveau | Upgrade |
|---|---|---|
| Filename se termine par `.sphere.js` | ✓ | ✓ |
| Hash du code correspond à l'événement signé | ✓ | — |
| Signature wallet valide | ✓ | ✓ |
| Score éligible | ✓ | — |
| Pas de replay (nonce unique) | ✓ | ✓ |
| Fichier non possédé par un autre utilisateur | ✓ | — |
| Fichier non protégé du repo | ✓ | — |
| Rate limit (5 min entre soumissions) | ✓ | — |

---

## 13. Bonnes pratiques & erreurs communes

| ❌ Faux | ✅ Correct |
|---|---|
| Enregistrer `window.YM_S[...] = {}` dans `activate()` | Enregistrer au **niveau module**, en dehors de `activate()` |
| Ne pas nettoyer dans `deactivate()` | Toujours `clearInterval()`, nullifier les refs, supprimer les listeners |
| `container.innerHTML +=` (append) | Toujours `container.innerHTML = ''` puis reconstruire |
| Utiliser `localStorage` directement | Utiliser `ctx.storage.get/set/del` (namespaced) |
| Couleurs hardcodées (`#fff`, `#000`) | Utiliser les CSS variables (`var(--text)`, `var(--bg)`, `var(--gold)`) |
| Envoyer des messages en boucle | Respecter le GAP=3s / pair · batcher les payloads · utiliser `broadcastData()` |
| Utiliser `ctx.saveProfile()` pour partager | `saveProfile()` est **local only** — utiliser `broadcastData()` pour partager |
| Ne pas vérifier le type dans `onReceive` | Toujours : `if (type !== 'myevent:x') return;` |
| Mauvaise clé : `'wrong-name.sphere.js'` | La clé doit exactement correspondre au filename incl. `.sphere.js` |
| Accéder au profil d'un pair via contacts (snapshot) | Utiliser `YM_Social._nearUsers.get(uuid).profile` (live, mis à jour toutes les 5s) |

---

## 14. Exemple complet

```js
/* jshint esversion:11, browser:true */
// counter.sphere.js — Compteur partagé entre pairs proches
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;
let _count = 0;

window.YM_S['counter.sphere.js'] = {
  name:        'Counter',
  icon:        '🔢',
  category:    'Demo',
  description: 'Un compteur synchronisé avec les pairs proches via P2P.',
  emit:    ['counter:inc'],
  receive: ['counter:inc'],

  activate(ctx) {
    _ctx = ctx;
    _count = ctx.storage.get('count') || 0;

    ctx.onReceive((type, data) => {
      if (type !== 'counter:inc') return;
      _count = data.count;
      ctx.storage.set('count', _count);
      ctx.setNotification(_count);
    });
  },

  deactivate() {
    _ctx = null; // listeners ctx.onReceive auto-nettoyés
  },

  renderPanel(container) {
    if (_ctx) _ctx.setNotification(0);

    container.innerHTML = '';
    container.style.cssText =
      'display:flex;flex-direction:column;align-items:center;'+
      'justify-content:center;height:100%;gap:20px;padding:24px';

    const display = document.createElement('div');
    display.style.cssText =
      'font-family:var(--font-m);font-size:72px;color:var(--gold);font-weight:700;line-height:1';
    display.textContent = _count;

    const btn = document.createElement('button');
    btn.className = 'ym-btn ym-btn-accent';
    btn.style.cssText = 'font-size:18px;padding:14px 32px';
    btn.textContent = '+ Incrémenter';
    btn.addEventListener('click', () => {
      _count++;
      display.textContent = _count;
      if (_ctx) {
        _ctx.storage.set('count', _count);
        _ctx.send('counter:inc', { count: _count });
        _ctx.toast('Count : ' + _count, 'success');
      }
    });

    const reset = document.createElement('button');
    reset.className = 'ym-btn ym-btn-ghost';
    reset.textContent = 'Réinitialiser';
    reset.addEventListener('click', () => {
      _count = 0;
      display.textContent = _count;
      if (_ctx) _ctx.storage.set('count', _count);
    });

    container.appendChild(display);
    container.appendChild(btn);
    container.appendChild(reset);
  }
};
})();
```

---

## Référence rapide — APIs globales (`window.YM`)

| API | Description |
|---|---|
| `window.YM.getProfile()` | Retourne le profil de l'utilisateur courant |
| `window.YM.saveProfile(data)` | Merge data dans le profil (local uniquement) |
| `window.YM.openSpherePanel(id)` | Ouvre le panel d'une sphere par filename |
| `window.YM.openPanel(panelId)` | `'panel-sphere'`, `'panel-profile'`, etc. |
| `window.YM.toast(msg, type)` | Affiche un toast |
| `window.YM.setIconNotif(id, count)` | Badge sur une icône sphere |
| `window.YM.loadSphereFromURL(url, name)` | Chargement dynamique d'une sphere |
| `window.YM_Social._nearUsers` | `Map<uuid, {profile, ts, peerId}>` — pairs proches en live |
| `window.YM_Social.isReciprocal(uuid)` | `true` si les deux utilisateurs se sont mutuellement ajoutés |
| `window.YM_sphereRegistry.get(name)` | Retourne l'objet d'une sphere enregistrée |

---

## Liens

- **Repo :** `https://github.com/theodoreyong9/YourMinedApp`
- **files.json :** `https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/files.json`
- **Solana Devnet faucet :** `https://faucet.solana.com`

---

*YourMine — Proof of Sacrifice · Devnet · Build with intent.*
