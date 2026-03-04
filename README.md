# YourMine - Las Action Crypto

Whitepaper : https://yourmine-dapp.web.app/WPYourMine.pdf

# FRODON Plugin SDK

Guide complet pour développer des plugins pour FRODON — application P2P géolocalisée WebRTC.

---

## Table des matières

1. [Architecture](#1-architecture)
2. [Structure d'un plugin](#2-structure-dun-plugin)
3. [API complète](#3-api-complète)
   - 3.1 [Identité & pairs](#31-identité--pairs)
   - 3.2 [Messagerie P2P (DM)](#32-messagerie-p2p-dm)
   - 3.3 [Stockage local](#33-stockage-local)
   - 3.4 [UI & navigation](#34-ui--navigation)
   - 3.5 [Panneau SPHERE](#35-panneau-sphere-registerbottompanel)
   - 3.6 [Fiche d'un pair](#36-fiche-dun-pair-registerpeeraction)
   - 3.7 [Widget de profil](#37-widget-de-profil-registerprofilewidget)
   - 3.8 [Hooks de cycle de vie](#38-hooks-de-cycle-de-vie)
   - 3.9 [Feed SPHERE](#39-feed-sphere)
4. [CSS — classes et variables](#4-css--classes-et-variables)
5. [Patterns par type de plugin](#5-patterns-par-type-de-plugin)
   - 5.1 [Jeu P2P](#51-jeu-p2p)
   - 5.2 [Badge & présence](#52-badge--présence)
   - 5.3 [Messagerie](#53-messagerie)
   - 5.4 [Média & contenu](#54-média--contenu)
   - 5.5 [Jeu temps-réel](#55-jeu-temps-réel)
6. [Pièges courants](#6-pièges-courants)
7. [Checklist de validation](#7-checklist-de-validation)

---

## 1. Architecture

FRODON est une app web P2P géolocalisée. Les pairs se découvrent par GPS (rayon configurable) et communiquent via WebRTC (PeerJS). Les DMs transitent par un Hub PeerJS — si un pair est hors ligne, le message est **perdu** (pas de queue).

```
┌─────────────────────────────────────────────────────────┐
│  FRODON App                                             │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Radar GPS  │  │  SPHERE tab  │  │  Fiche pair  │  │
│  │  (pairs)     │  │  (plugins)   │  │  (actions)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                           │                             │
│                    frodon (SDK)                         │
│                           │                             │
│            ┌──────────────┼──────────────┐             │
│            │              │              │             │
│         plugin A       plugin B       plugin C         │
│         (store A)      (store B)      (store C)        │
└─────────────────────────────────────────────────────────┘
```

**Points d'intégration d'un plugin :**

| Zone | API | Visibilité |
|------|-----|-----------|
| Onglet SPHERE | `registerBottomPanel` | Toujours visible |
| Config plugin | `registerBottomPanel` + `settings: true` | Dans ⚙ Installés seulement |
| Fiche d'un pair | `registerPeerAction` | Si les deux ont le plugin |
| Modal de profil | `registerProfileWidget` | Propre profil |
| Feed SPHERE | `addFeedEvent` / `_label` | Feed global |

---

## 2. Structure d'un plugin

```js
frodon.register(
  {
    id: 'mon-plugin',          // OBLIGATOIRE — kebab-case unique
    name: 'Mon Plugin',        // OBLIGATOIRE — nom affiché
    version: '1.0.0',
    author: 'pseudo',
    description: 'Ce que fait le plugin.',
    icon: '🎯',
  },
  () => {
    const PLUGIN_ID = 'mon-plugin'; // doit correspondre à manifest.id
    const store = frodon.storage(PLUGIN_ID);

    // 1. Toujours déclarer onDM EN PREMIER
    frodon.onDM(PLUGIN_ID, (fromId, payload) => { });

    // 2. Actions dans la fiche d'un pair
    frodon.registerPeerAction(PLUGIN_ID, '🎯 Mon action', (peerId, container) => { });

    // 3. Widget profil
    frodon.registerProfileWidget(PLUGIN_ID, (container) => { });

    // 4. Panneau SPHERE
    frodon.registerBottomPanel(PLUGIN_ID, [
      { id: 'main', label: '🎯 Principal', render(container) { } },
      { id: 'config', label: '⚙ Config', settings: true, render(container) { } },
    ]);

    // 5. Hooks
    frodon.onPeerAppear(peer => { });
    frodon.onPeerLeave(peerId => { });

    // 6. Retourner l'instance — OBLIGATOIRE
    return { destroy() { } };
  }
);
```

### Contraintes fondamentales

- Fichier JS **autonome** — zéro `import` / `export` / `require`
- Tout le code vit dans la closure de `initFn`
- `frodon` est le seul accès à l'application
- `initFn` est appelée **une seule fois** à l'installation
- Les callbacks enregistrés sont actifs **jusqu'à `destroy()`**

---

## 3. API complète

### 3.1 Identité & pairs

```js
frodon.getMyProfile()
// → { name, avatar, peerId, stableId, network, handle, website }
// avatar = data URI base64 JPEG (80×80 px)
// stableId = identifiant persistant (peerId peut changer à la reconnexion)

frodon.getMyId()
// → string — PeerJS ID local courant

frodon.getPosition()
// → { lat, lng, acc } | null

frodon.getPeer(peerId)
// → { peerId, name, avatar, network, handle, website,
//     lat, lng, dist, plugins, pluginUrls, lastSeen } | null
// dist = mètres (peut être null sans GPS)
// plugins = array des IDs installés chez ce pair

frodon.getAllPeers()
// → PeerInfo[]  — tous les pairs visibles sur le radar
```

> **Note :** Toujours tester `peer !== null` dans `registerPeerAction` — un pair peut se déconnecter pendant que la fiche est ouverte.

> **`peerId` vs `stableId` :** `peerId` peut changer après reconnexion. `stableId` est stable mais **aucun plugin actuel ne l'utilise** — les plugins gèrent les reconnexions via `onPeerAppear` et la correspondance par nom (`peer.name`). Utiliser `stableId` uniquement si votre plugin doit identifier un utilisateur de façon strictement persistante.

---

### 3.2 Messagerie P2P (DM)

```js
// Envoi
frodon.sendDM(peerId, pluginId, payload)

// Réception
frodon.onDM(pluginId, (fromId, payload) => { })
```

**Champs spéciaux du payload :**

| Champ | Type | Effet |
|-------|------|-------|
| `_silent: true` | bool | Aucun événement dans le feed SPHERE |
| `_label: 'texte'` | string | Texte affiché dans le feed du récepteur |

**Règle :** Messages de protocole interne → toujours `_silent: true`. Messages visibles → `_label` (sans `_silent`, ou `_silent: false` explicite).

> ⚠️ **Règle de priorité :** `_silent:true` supprime l'événement feed **même si `_label` est présent dans le même payload**. Pour garantir la visibilité, utiliser `_silent:false` explicitement avec `_label`, ou simplement omettre `_silent`.

> ⚠️ **Wrapper `send()` :** Si votre wrapper intègre `_silent:true` après un spread (`{type, ...payload, _silent:true}`), tout `_label` dans `payload` sera ignoré car `_silent:true` prend le dessus. Solution : mettre `_silent:true` avant le spread, ou exclure le `_label` du payload pour les messages que vous voulez silencieux.

```js
// ✅ Protocole interne — silencieux garanti
frodon.sendDM(peerId, PLUGIN_ID, { type: 'sync', state: {...}, _silent: true });

// ✅ Visible — _silent omis (visible par défaut) 
frodon.sendDM(peerId, PLUGIN_ID, { type: 'challenge', _label: '🎯 Défi reçu !' });

// ✅ Visible — _silent:false explicite (pattern défensif recommandé)
frodon.sendDM(peerId, PLUGIN_ID, { type: 'carousel_header', _label: '🖼 Portfolio', _silent: false });

// ⚠️ Piège wrapper : _silent:true dans le wrapper rend TOUT silencieux
function send(pid, type, payload) {
  frodon.sendDM(pid, PLUGIN_ID, { type, ...payload, _silent: true }); // _label dans payload ignoré !
}
// Solution si certains messages du wrapper doivent être visibles :
function send(pid, type, payload, silent = true) {
  frodon.sendDM(pid, PLUGIN_ID, { type, ...payload, _silent: silent });
}
send(peerId, 'invite', { players, _label: '🃏 Invitation !' }, false); // visible

// ✅ Notification visible
frodon.sendDM(peerId, PLUGIN_ID, { type: 'challenge', _label: '🎯 Défi reçu !' });
```

**Taille des DMs :** Les payloads passent par WebRTC DataChannel. Pour envoyer des images (base64), compresser avant envoi (max ~800×800 px, qualité 0.75 JPEG) et envoyer une image par DM séparé si plusieurs.

```js
// Pattern split DM pour contenu volumineux
frodon.sendDM(peerId, PLUGIN_ID, { type: 'media_header', title, total: images.length, _silent: true });
images.forEach((img, i) => {
  setTimeout(() => {
    frodon.sendDM(peerId, PLUGIN_ID, { type: 'media_item', idx: i, url: img.url, _silent: true });
  }, i * 200); // 200ms entre chaque pour éviter la saturation
});
```

---

### 3.3 Stockage local

```js
const store = frodon.storage(PLUGIN_ID);

store.get(key)          // → valeur désérialisée | null
store.set(key, value)   // sérialise en JSON + stocke dans localStorage
store.del(key)          // supprime
```

**Isolation :** namespace `frd_plug_{id}_` — les plugins ne partagent pas leurs données.

**Limites :** ~5 Mo total localStorage, max ~1 Mo par clé.

```js
// ✅ Sérialiser Set → Array avant store.set
store.set('invited', [...mySet]);

// ✅ Désérialiser Array → Set après store.get
const mySet = new Set(store.get('invited') || []);

// ✅ Nettoyer dans destroy()
return { destroy() { store.del('active_game'); } };
```

---

### 3.4 UI & navigation

#### Création d'éléments

```js
frodon.makeElement(tag, className, innerHTML?)
// → HTMLElement — innerHTML est safe (pas d'injection)
// Pour inputs : toujours document.createElement (voir ci-dessous)

frodon.safeImg(src, fallback, className?)
// → <img> avec fallback automatique si src échoue

frodon.formatTime(timestamp)  // → "à l'instant" | "5min" | "2h" | "3 jan"
frodon.distStr(metres)        // → "42 m" | "1.2 km"
frodon.showToast(message, isError?)  // notification 3s en bas d'écran
```

> **Inputs, textarea, select** : toujours créer avec `document.createElement`, pas `makeElement`.

```js
const input = document.createElement('input');
input.className = 'f-input';
input.type = 'text';
input.placeholder = '…';

const ta = document.createElement('textarea');
ta.className = 'f-input';
ta.rows = 4;

const sel = document.createElement('select');
sel.className = 'f-input';
['A', 'B'].forEach(v => {
  const opt = document.createElement('option');
  opt.value = v; opt.textContent = v;
  sel.appendChild(opt);
});
```

#### Navigation

```js
frodon.focusPlugin(pluginId)
// Ferme la modal ouverte → navigue vers SPHERE → ouvre+scroll vers le bloc du plugin

frodon.focusSphere()
// Navigue vers l'onglet SPHERE sans ouvrir de plugin spécifique

frodon.openPeer(peerId)
// Ouvre la modal de fiche d'un pair

frodon.refreshSphereTab(pluginId)
// Re-rend le panneau du plugin dans SPHERE + feed global
// ⚠ EFFET DE BORD : ferme aussi le panneau de config (settings:true)
//   → à appeler UNIQUEMENT après une action finale, pas pendant l'édition

frodon.refreshPeerModal(peerId)
// Re-rend la modal du pair si elle est ouverte

frodon.refreshProfileModal()
// Re-rend la modal de profil si elle est ouverte
```

> **Piège `refreshSphereTab` :** appeler cette fonction depuis un formulaire de config (`settings: true`) **ferme ce panneau**. Solution : mettre à jour le DOM localement pendant l'édition, et appeler `refreshSphereTab` + `refreshProfileModal` uniquement au **bouton Enregistrer final**.

---

### 3.5 Panneau SPHERE (`registerBottomPanel`)

```js
frodon.registerBottomPanel(PLUGIN_ID, [
  {
    id: 'main',             // identifiant unique dans ce plugin
    label: '🎯 Principal',  // texte de l'onglet
    settings: false,        // true = visible seulement dans ⚙ Installés
    render(container) {
      // container = div vide
      // CONSTRUIRE le DOM ici et l'appender à container
      // Appelé à chaque refreshSphereTab ou ouverture du bloc
      // ⚠ Ne PAS garder de référence à container entre les appels
    }
  }
]);
```

**Comportement :**
- **1 seul tab** : rendu direct, sans barre d'onglets
- **Plusieurs tabs** : barre d'onglets automatique
- **`settings: true`** : caché dans SPHERE, visible dans la modale ⚙ Installés

**`render()` est appelé à chaque re-render** — reconstruire le DOM depuis zéro, sans supposer que des éléments précédents existent.

**Mise à jour partielle sans re-render complet :** Pour les éléments qui changent fréquemment (scores, timer), mettre à jour le DOM directement par `getElementById` au lieu d'appeler `refreshSphereTab`.

```js
// ✅ Mise à jour directe pour les scores temps-réel
const el = document.getElementById('my-score');
if (el) el.textContent = score;

// ✅ Re-render complet pour les changements d'état importants
store.set('phase', 'result');
frodon.refreshSphereTab(PLUGIN_ID);
```

---

### 3.6 Fiche d'un pair (`registerPeerAction`)

```js
frodon.registerPeerAction(PLUGIN_ID, 'Label section', (peerId, container) => {
  // Affiché dans la fiche du pair UNIQUEMENT si les deux ont le plugin installé
  const peer = frodon.getPeer(peerId);
  if (!peer) { container.appendChild(frodon.makeElement('div', 'no-posts', 'Pair non disponible.')); return; }

  // Construire le DOM dans container
});
```

**Cas d'usage :** défi, échange, voir le profil étendu, envoyer quelque chose.

---

### 3.7 Widget de profil (`registerProfileWidget`)

```js
frodon.registerProfileWidget(PLUGIN_ID, (container) => {
  // Affiché dans la modal de VOTRE propre profil (en bas)
  // Ne rien appender = widget invisible
  const data = store.get('my_data');
  if (!data) return; // widget masqué si pas de données
  container.appendChild(/* ... */);
});
```

**Cas d'usage :** afficher son badge actif, ses stats, son statut.

---

### 3.8 Hooks de cycle de vie

```js
// Pair connecté ou reconnecté au radar
frodon.onPeerAppear(peer => {
  // Utiliser pour : resync, renvoyer des données, relancer une partie
});

// Pair disparu du radar (timeout 90s ou déconnexion)
frodon.onPeerLeave(peerId => {
  // Utiliser pour : marquer "away", gérer abandon, fold auto au poker
});

// Plugin installé depuis la fiche d'un pair
frodon.registerPeerInstallHook(PLUGIN_ID, peerId => {
  // Envoyer un challenge automatique, initier un échange
});

// Avant désinstallation
frodon.registerUninstallHook(PLUGIN_ID, () => {
  // Envoyer les forfaits en cours, nettoyer les données partagées
});
```

---

### 3.9 Feed SPHERE

Le feed global agrège les événements de tous les plugins.

**Événement automatique (côté récepteur) :** un DM avec `_label` génère automatiquement un événement dans le feed du pair qui reçoit.

**Événement manuel :**

```js
frodon.addFeedEvent(peerId, {
  pluginId,
  pluginName: 'Mon Plugin',
  pluginIcon: '🎯',
  peerName: peer.name,
  text: 'Vous avez envoyé un défi',
});
```

**En pratique :** Tous les plugins existants utilisent uniquement `_label`. `addFeedEvent` est disponible pour les événements **sortants** que vous voulez explicitement logguer dans votre propre feed, mais c'est optionnel.

---

## 4. CSS — classes et variables

### Variables globales

```css
/* Fonds */
--bg, --bg2               /* Fond principal / modal */
--sur, --sur2             /* Surfaces */
--bdr, --bdr2             /* Bordures */

/* Couleurs */
--acc    : #00f5c8        /* Cyan — accent principal */
--acc2   : #7c4dff        /* Violet — accent secondaire */
--ok     : #00e87a        /* Vert — succès */
--warn   : #ff6b35        /* Orange — danger/alerte */

/* Texte */
--txt    : #e8e8f8        /* Texte principal */
--txt2   : #7070a0        /* Texte secondaire */
--txt3   : #2e2e55        /* Texte tertiaire / désactivé */

/* Typo & décoration */
--mono   : 'Space Mono', monospace
--sans   : 'Syne', sans-serif
--r      : 12px           /* Radius standard */
--r2     : 20px           /* Radius large */
--glow   : 0 0 28px rgba(0,245,200,.22)
```

### Classes utilitaires

```
Texte         section-label, no-posts, mini-card-ts
Cartes        mini-card, mini-card-img, mini-card-title, mini-card-body
              post-card, post-img, post-title, post-body, post-meta, post-link
Boutons       plugin-action-btn (violet), plugin-action-btn acc (cyan)
Formulaires   f-input, f-btn, f-btn.secondary, f-btn.danger, f-hint, field
Plugin        plugin-card, plugin-card-head, plugin-icon, plugin-name,
              plugin-author, plugin-actions-row, plugin-widget-area
Autres        loading-bar
```

### Styles inline courants

```js
// Fond violet translucide (info, badge)
'background:rgba(124,77,255,.10);border:1px solid rgba(124,77,255,.25);border-radius:var(--r);padding:10px 12px'

// Fond cyan translucide (actif, confirmé)
'background:rgba(0,245,200,.08);border:1px solid rgba(0,245,200,.20);border-radius:var(--r);padding:10px 12px'

// Fond orange translucide (alerte, danger)
'background:rgba(255,107,53,.08);border:1px solid rgba(255,107,53,.25);border-radius:var(--r);padding:10px 12px'

// Fond vert translucide (succès)
'background:rgba(0,229,122,.07);border:1px solid rgba(0,229,122,.20);border-radius:var(--r);padding:10px 12px'

// Carte standard
'background:var(--sur);border:1px solid var(--bdr2);border-radius:var(--r);padding:12px 14px;margin-bottom:8px'

// Bulle de message (soi)
'align-self:flex-end;background:rgba(0,245,200,.1);border:1px solid rgba(0,245,200,.2);color:var(--acc);border-radius:10px 10px 2px 10px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word'

// Bulle de message (autre)
'align-self:flex-start;background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);color:var(--txt);border-radius:10px 10px 10px 2px;padding:5px 10px;font-size:.72rem;max-width:85%;word-break:break-word'
```

### Injection CSS personnalisée

```js
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .mon-element { animation: spulse 1s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}
// Appeler depuis render() avant de construire le DOM
```

---

## 5. Patterns par type de plugin

### 5.1 Jeu P2P

**Principe :** un pair est hôte, il valide toutes les actions. Les clients envoient leurs actions à l'hôte, l'hôte resync tout le monde.

```
Challenger → sendDM 'challenge' → Adversaire
Adversaire → sendDM 'accept'   → Challenger (devient hôte)
Hôte : hostSync() → sendDM 'state_sync' à tous les joueurs
Client : onDM 'state_sync' → mettre à jour + refreshSphereTab
Client : action locale → sendDM 'action' à l'hôte
Hôte : onDM 'action' → valider → hostSync()
onPeerLeave → hôte : marquer joueur "away", gérer le tour
onPeerAppear → hôte : re-sync le pair | client : envoyer 'resync' à l'hôte
```

**Persistance :**

```js
function persist() {
  if (!game) { store.del('game'); return; }
  store.set('game', {
    ...game,
    pendingInvites: [...(game.pendingInvites || [])], // Set → Array
    deck: game.isHost ? game.deck : [],               // données hôte seulement
  });
}

function restore() {
  const saved = store.get('game');
  if (!saved) return;
  game = { ...saved, pendingInvites: new Set(saved.pendingInvites || []) };
  setTimeout(() => {
    if (game.isHost) hostSync();
    else sendToHost('resync', {});
  }, 3500); // attendre que le P2P s'établisse
}
restore();
```

---

### 5.2 Badge & présence

**Principe :** les données = le badge actif. Pas de toggle. Distribution automatique à l'apparition d'un pair.

```js
// Distribution automatique
frodon.onPeerAppear(peer => {
  const data = store.get('my_badge');
  if (data) frodon.sendDM(peer.peerId, PLUGIN_ID, { type: 'badge_data', ...data, _silent: true });
});

// Réception
frodon.onDM(PLUGIN_ID, (fromId, payload) => {
  if (payload.type === 'badge_data') {
    store.set('peer_badge_' + fromId, payload);
    frodon.refreshPeerModal(fromId);
  }
  if (payload.type === 'request_badge') {
    const data = store.get('my_badge');
    if (data) frodon.sendDM(fromId, PLUGIN_ID, { type: 'badge_data', ...data, _silent: true });
  }
});

// Affichage dans la fiche d'un pair
frodon.registerPeerAction(PLUGIN_ID, '🏷 Badge', (peerId, container) => {
  const badge = store.get('peer_badge_' + peerId);
  if (!badge) {
    frodon.sendDM(peerId, PLUGIN_ID, { type: 'request_badge', _silent: true });
    container.appendChild(frodon.makeElement('div', 'no-posts', 'Chargement…'));
    return;
  }
  // Afficher le badge
});

// Config dans ⚙ Installés
frodon.registerBottomPanel(PLUGIN_ID, [
  { id: 'view', label: '🏷 Badges', render(container) { /* liste des badges reçus */ } },
  { id: 'config', label: '⚙ Mon badge', settings: true, render(container) { /* formulaire */ } },
]);
```

---

### 5.3 Messagerie

**Principe :** le `convId` est l'identifiant de la conversation. Un même `convId` = un même fil, un même "Inconnu". Générer le `convId` **une seule fois** à la création de la conversation.

```js
// Expéditeur — création d'une conversation
const convId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
// Stocker convId → persiste la conversation
store.set('conv_' + convId, { convId, peerId, messages: [{ text, fromMe:true, ts:Date.now() }] });
frodon.sendDM(peerId, PLUGIN_ID, { type: 'message', convId, text, _label: '💬 Nouveau message' });

// Pour envoyer un message supplémentaire DANS la même conversation
// → réutiliser le même convId, NE PAS en générer un nouveau
const conv = store.get('conv_' + convId);
conv.messages.push({ text, fromMe:true, ts:Date.now() });
store.set('conv_' + convId, conv);
frodon.sendDM(peerId, PLUGIN_ID, { type: 'message', convId, text, _silent: true });

// Récepteur — groupement par convId
frodon.onDM(PLUGIN_ID, (fromId, payload) => {
  if (payload.type === 'message') {
    const key = 'conv_' + payload.convId;
    let conv = store.get(key) || { convId: payload.convId, routeTo: fromId, messages: [] };
    conv.messages.push({ text: payload.text, fromMe: false, ts: Date.now() });
    store.set(key, conv);
    frodon.refreshSphereTab(PLUGIN_ID);
  }
});
```

**Mise à jour DOM sans re-render** (réponse dans une conversation ouverte) :

```js
// Ajouter une bulle directement dans le DOM existant
const bubblesEl = document.getElementById('bubbles-' + convId);
if (bubblesEl) {
  const b = frodon.makeElement('div', '');
  b.style.cssText = '/* style bulle */';
  b.textContent = text;
  bubblesEl.appendChild(b);
  bubblesEl.scrollTop = bubblesEl.scrollHeight;
} else {
  frodon.refreshSphereTab(PLUGIN_ID); // fallback si DOM absent
}
```

---

### 5.4 Média & contenu

**Compression d'image avant envoi :**

```js
function compressImage(dataUrl, maxW, maxH, quality, cb) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxW || h > maxH) {
      const ratio = Math.min(maxW / w, maxH / h);
      w = Math.round(w * ratio); h = Math.round(h * ratio);
    }
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    cvs.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(cvs.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

// Utilisation
compressImage(rawDataUrl, 800, 800, 0.75, compressed => {
  store.set('image_' + id, compressed);
});
```

**Config avec sauvegarde différée (pattern "Enregistrer tout") :**

Utiliser un état local dans `render()` pour toutes les modifications intermédiaires, et n'appeler `refreshSphereTab` + `refreshProfileModal` qu'au bouton Enregistrer final. Cela évite que le panneau de config se referme à chaque interaction.

```js
render(container) {
  // État local — JAMAIS de refreshSphereTab intermédiaire
  let editItems = [...(store.get('items') || [])];

  const list = frodon.makeElement('div', '');
  function renderList() {
    list.textContent = '';
    editItems.forEach((item, i) => {
      const row = frodon.makeElement('div', '');
      const del = frodon.makeElement('button', 'plugin-action-btn', '✕');
      del.addEventListener('click', () => { editItems.splice(i, 1); renderList(); }); // DOM local
      row.appendChild(del); list.appendChild(row);
    });
  }
  renderList();
  container.appendChild(list);

  const save = frodon.makeElement('button', 'plugin-action-btn acc', '💾 Enregistrer');
  save.addEventListener('click', () => {
    store.set('items', editItems);
    frodon.refreshSphereTab(PLUGIN_ID); // ferme le panel settings → voulu
    frodon.refreshProfileModal();
  });
  container.appendChild(save);
}
```

---

### 5.5 Jeu temps-réel

Pour les jeux où le score évolue très vite (tap, clics rapides), ne pas appeler `refreshSphereTab` à chaque action — mettre à jour le DOM directement.

> **Zone tapable mobile :** utiliser un `div` (pas un `button`) + `pointerdown` (pas `click`). Ajouter `touch-action:manipulation` pour empêcher le double-tap zoom sur iOS/Android, et `user-select:none` pour éviter la sélection de texte pendant un tap intensif.

```js
// Créer la zone tapable comme div (plus réactif que button sur mobile)
const tapBtn = document.createElement('div');
tapBtn.style.cssText = '...;touch-action:manipulation;user-select:none;-webkit-user-select:none';

// pointerdown (pas click) pour la réactivité maximale
tapBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!game || game.phase !== 'playing') return;
  game.score++;

  // Mise à jour DOM directe — sans re-render
  const el = document.getElementById('score-display');
  if (el) el.textContent = game.score;

  // Animation locale
  tapBtn.style.transform = 'scale(.85)';
  setTimeout(() => { tapBtn.style.transform = ''; }, 75);

  // Sync réseau
  frodon.sendDM(game.peerId, PLUGIN_ID, { type: 'score_update', score: game.score, _silent: true });
});

// Timer avec mise à jour DOM de la barre de progression
const barInterval = setInterval(() => {
  const bar = document.getElementById('timer-bar');
  if (!bar) { clearInterval(barInterval); return; }
  const elapsed = (Date.now() - game.startTs) / 10000;
  bar.style.width = Math.round((1 - elapsed) * 100) + '%';
}, 250);
```

---

### 5.6 Jeu visuel avec Canvas

Pour les jeux avec rendu graphique (snake, arcade), utiliser un `<canvas>` géré directement.

```js
// Création du canvas
const cvs = document.createElement('canvas');
cvs.width  = COLS * CELL;
cvs.height = ROWS * CELL;
cvs.style.cssText = 'border-radius:8px;border:1.5px solid rgba(0,245,200,.25);cursor:pointer;outline:none;display:block';
cvs.setAttribute('tabindex', '0'); // OBLIGATOIRE pour recevoir les keydown

// Conserver une référence module-level pour les mises à jour depuis le game loop
let canvas = null;
// Dans render() :
canvas = cvs;

// Game loop avec setInterval
let loop = null;
function startGame() {
  clearInterval(loop);
  state = newState();
  loop = setInterval(tick, state.speed);
}

// Contrôles clavier sur le canvas
cvs.addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  // ...
});

// Contrôles tactile : clic canvas → calculer la direction depuis la tête
cvs.addEventListener('click', e => {
  const rect = cvs.getBoundingClientRect();
  const scaleX = cvs.width / rect.width;
  const cx = (e.clientX - rect.left) * scaleX;
  const hx = snake[0].x * CELL + CELL / 2;
  const dx = cx - hx;
  // Vecteur dominant = direction, demi-tour interdit
});

// D-pad DOM pour mobile (flex sans cellules vides)
const dpad = frodon.makeElement('div','');
dpad.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:10px';
const mkBtn = (sym, key) => {
  const b = frodon.makeElement('button','plugin-action-btn');
  b.style.cssText = 'width:44px;height:44px;font-size:.9rem;padding:0;display:flex;align-items:center;justify-content:center';
  b.textContent = sym;
  b.addEventListener('click', () => { simulateKey(key); cvs.focus(); });
  return b;
};
const rowH = frodon.makeElement('div','');
rowH.style.cssText = 'display:flex;gap:4px';
rowH.appendChild(mkBtn('◀','ArrowLeft'));
rowH.appendChild(mkBtn('▼','ArrowDown'));
rowH.appendChild(mkBtn('▶','ArrowRight'));
dpad.appendChild(mkBtn('▲','ArrowUp'));
dpad.appendChild(rowH);

// Nettoyage dans destroy() et registerUninstallHook
return { destroy() { clearInterval(loop); loop = null; } };
frodon.registerUninstallHook(PLUGIN_ID, () => { clearInterval(loop); loop = null; });

// Focus automatique après render
container.appendChild(cvs);
setTimeout(() => cvs.focus(), 100);
```

**Dessin sur canvas :**
```js
function draw() {
  if (!canvas || !state) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d1a'; // fond
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Utiliser les variables CSS via getComputedStyle ou hardcoder les couleurs FRODON
  // --acc = #00f5c8 | --acc2 = #7c4dff | --warn = #ff6b35 | --ok = #00e87a
}
```
---

### 5.7 Techniques DOM avancées

**Hover sur éléments dynamiques (sans CSS injection) :**
```js
// :hover ne fonctionne pas sur les éléments créés dynamiquement sans classe CSS
// → Utiliser mouseenter/mouseleave
sq.addEventListener('mouseenter', () => {
  sq.style.background = 'var(--bdr)';
  if (!cell) sq.innerHTML = '<span style="color:rgba(255,107,53,.25)">✕</span>';
});
sq.addEventListener('mouseleave', () => {
  sq.style.background = 'var(--sur2)';
  if (!cell) sq.innerHTML = '';
});
```

**innerHTML pour le HTML statique complexe :**
```js
// Acceptable pour les blocs de HTML statique qui ne contiennent pas d'événements
const w = frodon.makeElement('div', '');
w.innerHTML = `
  <div style="font-size:2rem;margin-bottom:8px">🃏</div>
  <div style="font-size:.88rem;font-weight:700">${peer.name} vous invite</div>
  <div style="font-size:.68rem;color:var(--txt2)">Texas Hold'em · ${sb}/${bb}</div>
`;
// ⚠️ Ne pas attacher d'événements sur des éléments créés via innerHTML → utiliser
//    container.querySelector() après insertion, ou créer ces éléments séparément.
```

**Grille 4 colonnes pour boutons emoji :**
```js
const grid = frodon.makeElement('div', '');
grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px';

reactions.forEach(({ emoji, label }) => {
  const btn = frodon.makeElement('button', 'plugin-action-btn');
  btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;font-size:1.3rem;line-height:1';
  btn.innerHTML = emoji; // emoji en grand
  const lbl = frodon.makeElement('span', '', label);
  lbl.style.cssText = 'font-size:.52rem;color:var(--txt2);font-weight:400;line-height:1.2';
  btn.appendChild(lbl);
  grid.appendChild(btn);
});
```

**Ratio 1:1 pour les cases de jeu :**
```js
sq.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;...';
```

**Capture de variables de closure avant mutation d'état :**
```js
// ⚠️ Capturer AVANT toute mutation — les handlers asynchrones liront la valeur au moment du clic
function renderResult(container) {
  const savedPeerId   = game.peerId;   // capturé ici
  const savedPeerName = game.peerName; // avant cleanGame() ou innerHTML
  
  const again = frodon.makeElement('button', 'plugin-action-btn acc', '🔄 Rejouer');
  again.addEventListener('click', () => {
    newGame(savedPeerId, savedPeerName, ''); // utilise les copies
    frodon.sendDM(savedPeerId, PLUGIN_ID, { type: 'challenge', _silent: false, _label: '👆 Revanche !' });
  });
}
```

**Ouvrir le profil d'un pair depuis une liste :**
```js
const nameEl = frodon.makeElement('div', '');
nameEl.style.cssText = 'font-size:.74rem;font-weight:700;color:var(--acc2);cursor:pointer';
nameEl.textContent = peerName;
nameEl.addEventListener('click', () => frodon.openPeer(peerId));
```

**Zone tapable mobile (div, pas button) :**
```js
// Pour les zones de tap intensif sur mobile, utiliser div + pointerdown (pas button + click)
const tapZone = document.createElement('div');
tapZone.style.cssText = 'width:120px;height:120px;border-radius:50%;cursor:pointer;' +
  'touch-action:manipulation;' +          // ← empêche le double-tap zoom sur iOS/Android
  'user-select:none;-webkit-user-select:none;' +  // ← empêche la sélection de texte
  'overflow:hidden;border:4px solid var(--warn)';
tapZone.addEventListener('pointerdown', e => {
  e.preventDefault(); // empêche le comportement par défaut (sélection, scroll)
  // traiter le tap
});
```

**Réception progressive avec placeholders :**
```js
// Réception de N items envoyés en DMs séparés — préparer un tableau de N null
function onHeader(total, fromId) {
  store.set('item_' + fromId, {
    items: new Array(total).fill(null), // indices fixes, remplis au fur et à mesure
    total,
  });
}

function onItem(idx, data, fromId) {
  const rec = store.get('item_' + fromId);
  if (!rec) return;
  while (rec.items.length <= idx) rec.items.push(null); // sécurité taille
  rec.items[idx] = data;
  store.set('item_' + fromId, rec);
  const received = rec.items.filter(Boolean).length;
  frodon.refreshSphereTab(PLUGIN_ID);
  if (received === rec.total) {
    frodon.showToast('✅ Tous les éléments reçus !');
    setTimeout(() => frodon.focusPlugin(PLUGIN_ID), 300);
  }
}
```

**`plugin-actions-row` pour une rangée de boutons :**
```js
const row = frodon.makeElement('div', 'plugin-actions-row');
row.appendChild(frodon.makeElement('button', 'plugin-action-btn', '🔄 Revanche'));
row.appendChild(frodon.makeElement('button', 'plugin-action-btn acc', '▶ Ouvrir'));
container.appendChild(row);
// plugin-actions-row applique : display:flex; gap; flex-wrap:wrap
```

**Anti-boucle refreshPeerModal depuis onDM :**
```js
frodon.onDM(PLUGIN_ID, (fromId, payload) => {
  if (payload.type === 'meta') {
    const prevMeta = store.get('peer_meta_' + fromId);
    store.set('peer_meta_' + fromId, payload);
    // Refresh SEULEMENT si c'est la première réception
    // → évite boucle infinie : refreshPeerModal → render → sendDM → refreshPeerModal
    if (!prevMeta) frodon.refreshPeerModal(fromId);
  }
});
// Dans registerPeerAction :
// if (!meta) sendDM(request) ← guard côté envoi
// → la boucle est cassée par les deux guards combinés
```

**registerUninstallHook avec plusieurs parties actives :**
```js
frodon.registerUninstallHook(PLUGIN_ID, () => {
  Object.entries(games).forEach(([gameId, game]) => {
    if (!game.done) {
      game.done = true;
      addScore('loss', game.opponentId); // enregistrer la défaite
      frodon.sendDM(game.opponentId, PLUGIN_ID, { type: 'forfeit', gameId, _silent: true });
    }
  });
});
```


---

## 6. Pièges courants

### `refreshSphereTab` ferme le panneau de config

`refreshSphereTab` supprime le panneau `.plug-panel` dans la modale ⚙. Ne jamais l'appeler depuis un bouton intermédiaire d'un formulaire `settings: true`. Utiliser la mise à jour DOM locale, et réserver `refreshSphereTab` pour la sauvegarde finale.

### Scope de variables dans les closures imbriquées

```js
// ❌ Bug : ctr déclaré dans un if, utilisé dans un autre if séparé → ReferenceError
if (items.length > 1) { const ctr = makeElement('div', ''); /* ... */ }
if (items.length > 1) { ctr.textContent = '…'; } // ReferenceError

// ✅ Déclarer avant, assigner dans le if
let ctr = null;
if (items.length > 1) { ctr = makeElement('div', ''); /* ... */ }
if (items.length > 1) { ctr && (ctr.textContent = '…'); }
```

### Nouveau `convId` à chaque message

```js
// ❌ Chaque envoi crée un nouvel "Inconnu" chez le destinataire
btn.addEventListener('click', () => {
  const convId = Date.now().toString(36); // nouveau à chaque clic !
  frodon.sendDM(peerId, PLUGIN_ID, { type: 'message', convId, text });
});

// ✅ Réutiliser le convId existant, n'en créer un que si aucun n'existe
let convId = getExistingConvId(peerId) || createNewConvId();
```


### Pattern helpers utilitaires

```js
// Raccourcis courants dans la closure du plugin
const me = () => frodon.getMyProfile().peerId;
const peerName = id => frodon.getPeer(id)?.name || 'Pair inconnu';

// Avatar avec initiales fallback (HTML inline)
function avatarHTML(peer, size = 32) {
  const colors = ['#00f5c8','#7c4dff','#ff6b35','#00e87a'];
  const name = peer?.name || '?';
  const color = colors[name.charCodeAt(0) % colors.length];
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;
    background:var(--sur2);display:flex;align-items:center;justify-content:center;
    font-size:${size*.38}px;color:${color};font-weight:700">
    ${name[0].toUpperCase()}</div>`;
}
```

### Gestion de plusieurs parties simultanées

```js
// Pattern poker/tictactoe : objet keyed par ID de partie
const games = {};

function getGameByPeer(peerId) {
  return Object.values(games).find(g => g.opponentId === peerId);
}

// persist : économiser localStorage pour les clients
function persist() {
  const save = {};
  for (const [id, g] of Object.entries(games)) {
    save[id] = { ...g, deck: g.isHost ? g.deck : [] }; // pas de deck côté client
  }
  if (!Object.keys(save).length) store.del('games');
  else store.set('games', save);
}
```

### Actions destructives

```js
// confirm() natif pour les actions irréversibles
del.addEventListener('click', () => {
  if (!confirm('Supprimer cette image ?')) return;
  editImages.splice(i, 1);
  renderImageList();
});
```

### DMs séquentiels asynchrones

```js
// Envoyer plusieurs DMs en séquence avec délai (évite saturation WebRTC)
(async () => {
  for (let i = 0; i < items.length; i++) {
    const data = await processItem(items[i]); // compression, etc.
    await new Promise(r => setTimeout(r, 400)); // délai entre envois
    frodon.sendDM(peerId, PLUGIN_ID, { type: 'item', idx: i, data, _silent: true });
  }
})();
```


### `Set` non sérialisable

```js
// ❌ JSON.stringify(new Set([1,2])) = '{}'
store.set('data', { invited: mySet });

// ✅
store.set('data', { invited: [...mySet] });
const { invited } = store.get('data');
const mySet = new Set(invited);
```

### DMs perdus si pair hors ligne

Les DMs ne sont pas mis en queue. Toujours utiliser `onPeerAppear` pour resynchroniser l'état après une reconnexion.

### `peerId` vs `stableId`

`peerId` peut changer après reconnexion. Pour identifier un utilisateur de façon persistante (historique, scores), utiliser `stableId`.

### Images trop lourdes dans les DMs

Une image 1920×1080 en base64 ≈ 7 Mo — trop lourd pour un DM WebRTC. Toujours compresser avant envoi (800×800 px max, qualité 0.75 JPEG ≈ 150–300 Ko).

---

## 7. Checklist de validation

**Structure**
- [ ] `frodon.register({ id, name }, initFn)` — deux champs obligatoires
- [ ] `PLUGIN_ID === manifest.id` dans tout le code
- [ ] `return { destroy() {} }` présent
- [ ] Aucun `import` / `export` / `require`

**Messagerie**
- [ ] `frodon.onDM` déclaré en **premier** dans `initFn`
- [ ] Tous les DMs de protocole ont `_silent: true`
- [ ] Tous les DMs visibles ont `_label`
- [ ] Contenu volumineux (images) compressé et envoyé en DMs séparés

**UI**
- [ ] `refreshSphereTab` appelé après chaque changement d'état important
- [ ] `refreshSphereTab` **non** appelé depuis un formulaire de config en cours d'édition
- [ ] `render()` reconstruit le DOM depuis zéro, sans référence stale
- [ ] Cas `peer === null` géré dans `registerPeerAction`
- [ ] Inputs créés avec `document.createElement`
- [ ] CSS injecté une seule fois (`_cssInjected` flag)

**Persistance**
- [ ] `Set` → `Array` avant `store.set()`
- [ ] `stableId` utilisé pour les identifiants persistants (pas `peerId`)
- [ ] `convId` fixe pour toute la durée d'une conversation

**Cycle de vie**
- [ ] `onPeerAppear` : resync si partie en cours / renvoi de badge
- [ ] `onPeerLeave` : état "away" ou fold auto si applicable
- [ ] `registerUninstallHook` : forfaits envoyés, données partagées nettoyées
- [ ] `store.del()` dans `destroy()` si des données temporaires doivent être supprimées
