# YourMine - Las Action Crypto

Whitepaper : https://yourmine-dapp.web.app/WPYourMine.pdf

# # FRODON Plugin SDK — Documentation complète

# Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Structure d'un plugin](#2-structure-dun-plugin)
3. [FrodonAPI — référence complète](#3-frodonapi--référence-complète)
   - 3.1 Identité & pairs
   - 3.2 Messagerie P2P (DM)
   - 3.3 Stockage local
   - 3.4 UI — toasts, éléments, navigation
   - 3.5 Panneaux SPHERE (`registerBottomPanel`)
   - 3.6 Fiche d'un pair (`registerPeerAction`)
   - 3.7 Widget profil (`registerProfileWidget`)
   - 3.8 Hooks de cycle de vie
4. [Système d'événements du feed SPHERE](#4-système-dévénements-du-feed-sphere)
5. [CSS disponible — classes et variables](#5-css-disponible--classes-et-variables)
6. [Patterns avancés](#6-patterns-avancés)
7. [Prompt système IA — version corrigée](#7-prompt-système-ia--version-corrigée)
8. [Checklist de validation d'un plugin](#8-checklist-de-validation-dun-plugin)

---

## 1. Architecture générale

FRODON est une application web P2P géolocalisée. Les pairs se découvrent par GPS dans un rayon configurable et communiquent via PeerJS (WebRTC).

Un **plugin** est un fichier `.js` autonome chargé dynamiquement à l'exécution. Il reçoit un objet `frodon` (le SDK) et s'enregistre via `frodon.register()`. Il peut :

- Envoyer/recevoir des messages directs entre pairs (DM P2P)
- Afficher une interface interactive dans le panneau **SPHERE**
- Ajouter des actions dans la **fiche d'un pair**
- Ajouter un **widget** dans la modal de profil
- Persister des données localement (localStorage isolé)
- Accéder aux informations des pairs visibles sur le radar

**Cycle de vie d'un plugin :**

```
install(url)
  → fetch JS
  → exécution : frodon.register(manifest, initFn)
  → initFn() appelée → retourne { destroy() }
  → mountPluginPanels() → panels SPHERE rendus
  → destroy() appelée à la désinstallation
```

---

## 2. Structure d'un plugin

```js
frodon.register(
  {
    id: 'mon-plugin',          // Identifiant unique, kebab-case, OBLIGATOIRE
    name: 'Mon Plugin',        // Nom affiché, OBLIGATOIRE
    version: '1.0.0',          // Semver
    author: 'pseudo',          // Optionnel
    description: 'Ce que fait le plugin.',  // Optionnel (max ~80 chars)
    icon: '🎯',                // Emoji affiché partout
  },
  () => {
    // === CODE DU PLUGIN ===

    const PLUGIN_ID = 'mon-plugin';  // doit correspondre à manifest.id
    const store = frodon.storage(PLUGIN_ID);

    // 1. Handler DM (toujours déclarer en premier)
    frodon.onDM(PLUGIN_ID, (fromId, payload) => {
      // traitement des messages reçus
    });

    // 2. Actions dans la fiche d'un pair
    frodon.registerPeerAction(PLUGIN_ID, '🎯 Mon action', (peerId, container) => {
      // construire le DOM dans container
    });

    // 3. Widget profil (optionnel)
    frodon.registerProfileWidget(PLUGIN_ID, (container) => {
      // construire le DOM dans container
    });

    // 4. Panneau SPHERE (l'UI principale)
    frodon.registerBottomPanel(PLUGIN_ID, [
      {
        id: 'main',
        label: '🎯 Principal',
        render(container) {
          // construire le DOM dans container
        }
      },
      {
        id: 'settings',
        label: '⚙ Config',
        settings: true,  // ← tab masquée dans SPHERE, visible dans ⚙ Installés
        render(container) { /* ... */ }
      }
    ]);

    // 5. Retourner l'objet d'instance
    return {
      destroy() {
        // nettoyage : forfaits, DMs d'au revoir, etc.
      }
    };
  }
);
```

### Règles importantes

- `id` doit être **unique**, en kebab-case, sans espaces
- Le plugin est un **fichier JS autonome**, sans `import`/`export`
- Pas de `require()`, pas de modules ES — tout est dans la closure
- L'objet `frodon` est le seul point d'entrée vers l'application
- `initFn` est appelée **une seule fois** à l'installation
- Les callbacks (`onDM`, `registerPeerAction`, etc.) sont rattachés **à vie** jusqu'à `destroy()`

---

## 3. FrodonAPI — référence complète

### 3.1 Identité & pairs

```js
frodon.getMyProfile()
// → { name, avatar, network, handle, website, peerId, stableId }
// avatar = data URI base64 JPEG (80×80px max)
// network = clé NETS : 'mastodon' | 'bluesky' | 'youtube' | etc.

frodon.getMyId()
// → string  PeerJS ID du peer local (peut changer après reconnexion)

frodon.getPosition()
// → { lat, lng, acc } | null  Position GPS actuelle

frodon.getPeer(peerId)
// → { peerId, name, avatar, network, handle, website, lat, lng,
//     dist,  plugins, pluginUrls, lastSeen } | null
// dist = distance en mètres depuis notre position GPS

frodon.getAllPeers()
// → Array<PeerInfo>  Tous les pairs actuellement visibles sur le radar
```

**Notes :**
- `peerId` peut changer après une reconnexion ; utiliser `stableId` pour identifier un utilisateur de façon persistante
- `dist` peut être `null` si la position GPS n'est pas disponible
- `plugins` = tableau des IDs de plugins installés chez ce pair

---

### 3.2 Messagerie P2P (DM)

```js
// Envoyer un DM à un pair
frodon.sendDM(peerId, pluginId, payload)
// payload = objet JS arbitraire + champs spéciaux optionnels :
//   _silent: true   → ne génère PAS d'événement dans le feed SPHERE
//   _label: 'texte' → texte affiché dans le feed SPHERE (côté récepteur)

// Recevoir des DMs
frodon.onDM(pluginId, (fromId, payload) => {
  // fromId = peerId de l'expéditeur
  // payload = objet envoyé
})
```

**Convention payload :**
```js
// Messages de protocole interne → toujours _silent: true
frodon.sendDM(peerId, PLUGIN_ID, { type: 'move', cell: 4, _silent: true });

// Messages visibles par l'utilisateur → fournir _label
frodon.sendDM(peerId, PLUGIN_ID, { type: 'challenge', _label: '⊞ Défi reçu !' });
```

**Acheminement :** Les DMs transitent par le Hub PeerJS. Si le destinataire est hors ligne, le message est **perdu** (pas de file persistante). Gérer les reconnexions avec `onPeerAppear`.

---

### 3.3 Stockage local

```js
const store = frodon.storage(PLUGIN_ID);

store.get(key)          // → valeur | null  (JSON.parse automatique)
store.set(key, value)   // stocke en localStorage (JSON.stringify)
store.del(key)          // supprime la clé
```

**Isolation :** chaque plugin a son propre namespace `frd_plug_{id}_`. Les données persistent entre les sessions.

**Recommandations :**
- Clés courtes et descriptives : `'badge'`, `'history'`, `'inbox'`
- Valeurs max ~1 Mo par clé (localStorage global ~5 Mo)
- Sérialiser les `Set` en `Array` avant `store.set()`

---

### 3.4 UI — toasts, éléments, navigation

```js
frodon.showToast(message, isError?)
// Affiche une notification en bas de l'écran (3 secondes)
// isError = true → couleur rouge/warn

frodon.makeElement(tag, className, innerHTML?)
// Raccourci document.createElement avec innerHTML safe
// Retourne l'élément DOM
// Exemple : frodon.makeElement('button', 'plugin-action-btn', '🎯 Go')

frodon.safeImg(src, fallback, className?)
// Crée un <img> avec fallback automatique si src échoue

frodon.formatTime(timestamp)
// → "à l'instant" | "5min" | "2h" | "3 jan"

frodon.distStr(metres)
// → "42 m" | "1.2 km"
```

**Navigation :**
```js
frodon.focusPlugin(pluginId)
// Ferme la modal ouverte + navigue vers SPHERE + ouvre le panneau du plugin

frodon.focusSphere()
// Navigue vers l'onglet SPHERE (sans ouvrir de plugin spécifique)

frodon.openPeer(peerId)
// Ouvre la modal de fiche d'un pair

frodon.refreshSphereTab(pluginId)
// Re-rend le panneau du plugin dans SPHERE + le feed global
// ⚠ Appeler après toute modification d'état qui affecte l'UI

frodon.refreshPeerModal(peerId)
// Re-rend la modal d'un pair si elle est ouverte
// (utile après réception d'un DM qui enrichit la fiche)

frodon.refreshProfileModal()
// Re-rend la modal de profil si elle est ouverte
```

---

### 3.5 Panneaux SPHERE (`registerBottomPanel`)

Le panneau SPHERE est la zone d'interaction principale. Chaque plugin peut y enregistrer plusieurs **tabs**.

```js
frodon.registerBottomPanel(PLUGIN_ID, [
  {
    id: 'main',           // identifiant unique dans ce plugin
    label: '🎯 Principal', // texte de l'onglet
    settings: false,       // false (défaut) = visible dans SPHERE
                           // true = visible dans ⚙ modal Installés seulement
    render(container) {
      // container = div vide
      // Construire le DOM et l'appender dans container
      // Cette fonction est appelée à chaque fois que le tab s'affiche
      // ⚠ Ne PAS garder de référence à container entre les appels
    }
  }
]);
```

**Cycle render :** `render()` est appelé à chaque `refreshSphereTab()` ou ouverture du bloc. Ne pas supposer que le DOM précédent existe encore.

**Tab `settings: true` :** Permet d'exposer une configuration dans la modal ⚙ sans encombrer l'onglet SPHERE principal. Idéal pour les formulaires de configuration (voir plugin `jobseeker`).

---

### 3.6 Fiche d'un pair (`registerPeerAction`)

```js
frodon.registerPeerAction(PLUGIN_ID, label, (peerId, container) => {
  // label = titre de la section dans la fiche (ex: '⚡ Message rapide')
  // peerId = ID du pair affiché
  // container = div vide dans la section du plugin

  const peer = frodon.getPeer(peerId);
  // peer peut être null si le pair s'est déconnecté entre temps

  // Construire le DOM et l'appender dans container
});
```

**Comportement :** La section est affichée dans la modal du pair, **uniquement si les deux pairs ont le plugin installé** (plugin en commun). Le titre de la section correspond au `label` passé.

**Pattern recommandé :**
```js
frodon.registerPeerAction(PLUGIN_ID, '🎯 Action', (peerId, container) => {
  const peer = frodon.getPeer(peerId);
  if(!peer) {
    container.appendChild(frodon.makeElement('div', 'no-posts', 'Pair non disponible.'));
    return;
  }

  // Cas : aucun contexte partagé
  const btn = frodon.makeElement('button', 'plugin-action-btn acc', '🎯 Démarrer');
  btn.addEventListener('click', () => {
    // ...
    frodon.refreshPeerModal(peerId);
    frodon.refreshSphereTab(PLUGIN_ID);
  });
  container.appendChild(btn);
});
```

---

### 3.7 Widget profil (`registerProfileWidget`)

```js
frodon.registerProfileWidget(PLUGIN_ID, (container) => {
  // Affiché dans la modal de profil personnel (en bas)
  // S'affiche uniquement si le plugin ajoute quelque chose
  // Ne rien appender = widget invisible
});
```

Exemple : le plugin `quickmsg` affiche les réactions reçues. Le plugin `jobseeker` affiche le badge "En recherche".

---

### 3.8 Hooks de cycle de vie

```js
// Quand un pair apparaît sur le radar (nouvelle connexion ou reconnexion)
frodon.onPeerAppear((peer) => {
  // peer = { peerId, name, avatar, network, handle, ... }
  // Utiliser pour : resync de partie, renvoi de données, etc.
});

// Quand un pair disparaît du radar (timeout >90s ou déconnexion)
frodon.onPeerLeave((peerId) => {
  // Utiliser pour : marquer "away", gérer abandon de partie, etc.
});

// Quand ce plugin est installé depuis la fiche d'un pair
frodon.registerPeerInstallHook(PLUGIN_ID, (peerId) => {
  // peerId = pair depuis lequel on a installé le plugin
  // Exemple : envoyer un défi automatique (TicTacToe)
});

// Avant désinstallation du plugin
frodon.registerUninstallHook(PLUGIN_ID, () => {
  // Envoyer les forfaits, DMs d'adieu, nettoyer le state
  // Appelé AVANT destroy()
});
```

---

## 4. Système d'événements du feed SPHERE

Le feed global SPHERE agrège les événements de tous les plugins. Il y a deux façons de créer des événements :

### 4.1 Événement automatique via `_label` dans sendDM

Côté **récepteur** : si le payload contient `_label` et que l'expéditeur est connu, un événement apparaît automatiquement dans le feed.

```js
// Expéditeur
frodon.sendDM(peerId, PLUGIN_ID, {
  type: 'challenge',
  _label: '⊞ Défi TicTacToe reçu !'  // ← affiché dans le feed du récepteur
});
```

### 4.2 Événement manuel via `addFeedEvent`

```js
frodon.addFeedEvent(peerId, {
  pluginId   : PLUGIN_ID,       // pour le filtre
  pluginName : 'Mon Plugin',    // affiché dans le feed
  pluginIcon : '🎯',
  peerName   : peer.name,
  text       : 'Message décrivant l\'action',  // ex: "→ Opportunité envoyée"
});
```

Utiliser `addFeedEvent` pour les actions **sortantes** (je fais quelque chose vers un pair), et `_label` pour les actions **entrantes** (je reçois quelque chose d'un pair).

### 4.3 Quand utiliser `_silent: true`

Toujours `_silent: true` pour les messages de protocole interne qui ne représentent pas une action visible par l'utilisateur :
- Synchronisations d'état (`state_sync`, `resync`)
- Échanges de données (`badge_data`, `request_badge`)
- Mouvements de jeu silencieux
- Réponses techniques (`hand`, `avatar`)

---

## 5. CSS disponible — classes et variables

### 5.1 Variables CSS globales

```css
/* Couleurs */
--bg      : #04040c   /* Fond principal */
--bg2     : #080816   /* Fond modal */
--sur     : #0f0f22   /* Surface 1 */
--sur2    : #161630   /* Surface 2 */
--bdr     : #1e1e40   /* Bordure principale */
--bdr2    : #2a2a58   /* Bordure secondaire */

--acc     : #00f5c8   /* Cyan / accent principal */
--acc2    : #7c4dff   /* Violet / accent secondaire */
--warn    : #ff6b35   /* Orange / avertissement */
--ok      : #00e87a   /* Vert / succès */

--txt     : #e8e8f8   /* Texte principal */
--txt2    : #7070a0   /* Texte secondaire */
--txt3    : #2e2e55   /* Texte tertiaire / désactivé */

--glow    : 0 0 28px rgba(0,245,200,.22)  /* Ombre cyan */
--r       : 12px      /* Radius standard */
--r2      : 20px      /* Radius large */
--mono    : 'Space Mono', monospace
--sans    : 'Syne', sans-serif
```

### 5.2 Classes utilitaires

```
/* Texte et labels */
.section-label     Titre de section (caps, monospace, txt2)
.no-posts          Message vide (centré, italique, txt2)

/* Cartes */
.mini-card         Carte compacte (fond sur, bordure bdr)
.mini-card-img     Image dans mini-card (max-h 90px, cover)
.mini-card-title   Titre d'un article (txt, bold)
.mini-card-body    Corps texte (txt2, 3 lignes clampées)
.mini-card-ts      Timestamp (txt3, monospace, .6rem)

.post-card         Carte plus grande (sur2, hover bdr2)
.post-img          Image post (max-h 140px)
.post-title        Titre post
.post-body         Corps post (3 lignes)
.post-meta         Ligne de métadonnées (flex, .6rem)
.post-link         Lien ↗ (acc2, bordure)

/* Boutons */
.plugin-action-btn            Bouton standard violet (acc2)
.plugin-action-btn.acc        Bouton cyan (acc)
/* Inline style pour danger : color:var(--warn) */

/* Formulaires */
.f-input           Input standard
.f-btn             Bouton pleine largeur (acc)
.f-btn.secondary   Bouton secondaire (acc2, outline)
.f-btn.danger      Bouton danger (warn, outline)
.f-hint            Texte d'aide sous un champ
.field             Wrapper de champ avec label

/* Layout plugin */
.plugin-card       Carte de plugin (sur, bdr2, r)
.plugin-card-head  Header de carte (flex, gap, items-center)
.plugin-icon       Icône de plugin (38px, fond violet)
.plugin-name       Nom du plugin (.85rem, bold)
.plugin-author     Auteur/description (.6rem, txt2, mono)
.plugin-desc       Description longue
.plugin-actions-row Rangée de boutons (flex, gap, wrap)
.plugin-widget-area Zone interne violet translucide

/* Loading */
.loading-bar       Barre de chargement animée (shimmer, acc)
```

### 5.3 Construire une UI avec `makeElement` + styles inline

Pour les éléments non couverts par les classes, utiliser des styles inline :

```js
const card = frodon.makeElement('div', '');
card.style.cssText = `
  background: var(--sur);
  border: 1px solid var(--bdr2);
  border-radius: var(--r);
  padding: 12px 14px;
  margin-bottom: 8px;
`;
```

**Couleurs à utiliser dans les styles inline :**
- Texte important : `color: var(--acc)` (cyan) ou `color: var(--acc2)` (violet)
- Texte secondaire : `color: var(--txt2)`
- Fond subtil violet : `background: rgba(124,77,255,.10)` + `border: 1px solid rgba(124,77,255,.25)`
- Fond subtil cyan : `background: rgba(0,245,200,.08)` + `border: 1px solid rgba(0,245,200,.20)`
- Succès : `color: var(--ok)` + `background: rgba(0,229,122,.07)`
- Danger : `color: var(--warn)` + `background: rgba(255,107,53,.08)`

---

## 6. Patterns avancés

### 6.1 Plugin de jeu P2P (pattern poker/tictactoe)

```
État centralisé chez l'hôte :
  hostSync() → envoie state_sync à tous + hand privée à chacun
  hostAction(fromId, action) → validé, puis hostSync()

Côté client :
  onDM 'state_sync' → met à jour l'état local + refreshSphereTab
  onDM 'hand' → cartes privées
  action locale → envoie DM 'action' à l'hôte (+ mise à jour optimiste)

Reconnexion :
  onPeerAppear → si hôte : re-sync, si client : envoie 'resync' à l'hôte
  onPeerLeave  → si hôte : marquer 'away', gérer le tour
```

### 6.2 Plugin de badge/données (pattern jobseeker)

```
Activation implicite : badge actif dès que les données sont renseignées
Pas de toggle — la présence de données = badge actif

Distribution :
  onPeerAppear → envoyer mes données à ce pair (_silent)
  onDM 'request_badge' → répondre avec mes données si actif
  onDM 'badge_data' → stocker + refreshPeerModal

Affichage :
  registerPeerAction → demander le badge si pas encore reçu
  registerProfileWidget → afficher mes propres données
```

### 6.3 Gestion de l'état avec persistance

```js
// Sauvegarder (convertir Set → Array)
function persist() {
  if(!T) { store.del('table'); return; }
  store.set('table', {
    ...T,
    pendingInvites: [...(T.pendingInvites || [])],  // Set → Array
    deck: T.isHost ? (T.deck || []) : [],            // données hôte seulement
  });
}

// Restaurer (convertir Array → Set)
function restore() {
  const s = store.get('table');
  if(!s) return;
  T = { ...s, pendingInvites: new Set(s.pendingInvites || []) };
  setTimeout(() => {
    if(T.isHost) hostSync();
    else toHost('resync', {});
  }, 3500);  // délai pour laisser le temps au P2P de s'établir
}
```

### 6.4 Pattern IU réactive avec re-render complet

```js
frodon.registerBottomPanel(PLUGIN_ID, [{
  id: 'main', label: '🎯 Jeu',
  render(container) {
    // Lire l'état
    const data = store.get('state');

    // Sélection du rendu selon l'état
    if(!data) { renderEmpty(container); return; }
    if(data.phase === 'waiting') { renderWaiting(container, data); return; }
    renderGame(container, data);
  }
}]);

// Déclencher un re-render :
store.set('state', newState);
frodon.refreshSphereTab(PLUGIN_ID);
```

### 6.5 Injection CSS

```js
let _cssInjected = false;
function injectCSS() {
  if(_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `.my-class { ... }`;
  document.head.appendChild(s);
}

// Appeler dans render() :
frodon.registerBottomPanel(PLUGIN_ID, [{
  id: 'main', label: '🎯',
  render(container) {
    injectCSS();
    // ...
  }
}]);
```

### 6.6 Inputs natifs (pas de makeElement)

`frodon.makeElement` supporte `innerHTML` — pour les inputs, créer les éléments directement :

```js
const input = document.createElement('input');
input.className = 'f-input';
input.type = 'text';
input.placeholder = '…';
input.maxLength = 100;
container.appendChild(input);

const ta = document.createElement('textarea');
ta.className = 'f-input';
ta.rows = 3;
container.appendChild(ta);

const sel = document.createElement('select');
sel.className = 'f-input f-select';
['Option 1', 'Option 2'].forEach(o => {
  const opt = document.createElement('option');
  opt.value = o; opt.textContent = o;
  sel.appendChild(opt);
});
container.appendChild(sel);
```

---

## 7. Prompt système IA — version corrigée

Le prompt ci-dessous remplace celui de la section **Build** du modal SPHERE. Il est beaucoup plus précis sur l'API, les patterns et les contraintes.

```
Tu es un expert en plugins FRODON — une application P2P géolocalisée qui permet
à des utilisateurs proches de se connecter via WebRTC.

GÉNÈRE UN FICHIER PLUGIN JAVASCRIPT AUTONOME ET COMPLET.

=== STRUCTURE OBLIGATOIRE ===

frodon.register({
  id: 'mon-plugin',        // kebab-case unique, OBLIGATOIRE
  name: 'Mon Plugin',      // OBLIGATOIRE
  version: '1.0.0',
  author: 'pseudo',
  description: 'Description courte.',
  icon: '🎯',
}, () => {
  const PLUGIN_ID = 'mon-plugin';  // identique à manifest.id
  const store = frodon.storage(PLUGIN_ID);

  // ... code du plugin ...

  return { destroy() { /* nettoyage */ } };
});

=== API FRODON DISPONIBLE ===

--- IDENTITÉ ---
frodon.getMyProfile()   → { name, avatar, peerId, stableId, network, handle, website }
frodon.getMyId()        → string (peerId local)
frodon.getPosition()    → { lat, lng, acc } | null
frodon.getPeer(id)      → { peerId, name, avatar, network, handle, dist, plugins } | null
frodon.getAllPeers()     → tableau de tous les pairs visibles

--- MESSAGERIE P2P ---
frodon.sendDM(peerId, pluginId, payload)
  payload spéciaux : _silent:true (pas de feed), _label:'texte' (affiché dans le feed récepteur)
frodon.onDM(pluginId, (fromId, payload) => { })

--- STOCKAGE ---
const store = frodon.storage(PLUGIN_ID)
store.get(key)     → valeur | null
store.set(key, v)  → stocke
store.del(key)     → supprime

--- UI ---
frodon.makeElement(tag, className, innerHTML?)  → HTMLElement
frodon.safeImg(src, fallback, className?)       → <img>
frodon.showToast(msg, isError?)
frodon.formatTime(timestamp)  → "à l'instant" | "5min" | "2h"
frodon.distStr(metres)        → "42 m" | "1.2 km"

--- NAVIGATION ---
frodon.focusPlugin(pluginId)    → naviguer vers SPHERE + ouvrir ce plugin
frodon.focusSphere()            → naviguer vers SPHERE
frodon.openPeer(peerId)         → ouvrir modal du pair
frodon.refreshSphereTab(pluginId)   → re-rendre le panneau du plugin (APPELER après chaque update d'état)
frodon.refreshPeerModal(peerId)     → re-rendre la modal d'un pair si ouverte
frodon.refreshProfileModal()        → re-rendre la modal de profil si ouverte

--- FEED SPHERE ---
frodon.addFeedEvent(peerId, { pluginId, pluginName, pluginIcon, peerName, text })
  → pour les événements SORTANTS

--- ENREGISTREMENT ---
frodon.registerBottomPanel(PLUGIN_ID, tabs)
  tabs = [{ id, label, settings?, render(container){} }]
  settings:true → tab dans ⚙ seulement, pas dans SPHERE

frodon.registerPeerAction(PLUGIN_ID, label, (peerId, container) => { })
  → section dans la fiche d'un pair (seulement si les deux ont le plugin)

frodon.registerProfileWidget(PLUGIN_ID, (container) => { })
  → widget dans la modal de profil

--- HOOKS ---
frodon.onPeerAppear((peer) => { })     → pair connecté/reconnecté
frodon.onPeerLeave((peerId) => { })    → pair déconnecté
frodon.registerPeerInstallHook(PLUGIN_ID, (peerId) => { })   → installé depuis fiche d'un pair
frodon.registerUninstallHook(PLUGIN_ID, () => { })           → avant désinstallation

=== CSS — CLASSES DISPONIBLES ===

Variables : --acc #00f5c8 (cyan), --acc2 #7c4dff (violet), --ok #00e87a (vert),
            --warn #ff6b35 (orange), --txt #e8e8f8, --txt2 #7070a0, --txt3 #2e2e55
            --sur #0f0f22, --sur2 #161630, --bdr #1e1e40, --bdr2 #2a2a58
            --mono 'Space Mono', --sans 'Syne'

Classes : plugin-action-btn (bouton violet), plugin-action-btn acc (bouton cyan),
          mini-card, mini-card-img, mini-card-title, mini-card-body, mini-card-ts,
          section-label, no-posts, loading-bar,
          f-input (champ texte), f-btn, f-btn.secondary, f-hint, field

=== RÈGLES STRICTES ===

1. PAS d'import, export, require — fichier JS autonome dans une closure
2. TOUJOURS appeler frodon.refreshSphereTab(PLUGIN_ID) après toute modification d'état
3. Les DMs de protocole interne → TOUJOURS _silent:true
4. Les DMs visibles par l'utilisateur → fournir _label
5. render(container) est appelé à chaque re-render — NE PAS garder de référence au container
6. Inputs (input, textarea, select) → créer avec document.createElement, pas makeElement
7. Sérialiser Set → Array avant store.set(), désérialiser après store.get()
8. Toujours gérer le cas peer=null dans registerPeerAction
9. Pour les jeux multijoueurs : un pair est hôte, il valide toutes les actions
10. Injecter le CSS personnalisé UNE SEULE FOIS avec un flag _cssInjected

=== STRUCTURE PAR TYPE DE PLUGIN ===

Plugin RÉACTION/COMMUNICATION simple :
  onDM → stocker dans inbox, refreshSphereTab
  registerPeerAction → boutons d'envoi
  registerBottomPanel → liste des reçus + stats

Plugin JEU P2P :
  État centralisé chez l'hôte (isHost:true)
  hostSync() → envoie state_sync à tous
  onDM 'action' → hostAction(fromId, ...) → hostSync()
  onPeerLeave → fold/abandon automatique
  onPeerAppear → resync
  registerBottomPanel → plateau de jeu complet

Plugin BADGE/PRÉSENCE :
  store.get('badge') → données de profil
  onPeerAppear → envoyer mon badge (_silent)
  onDM 'request_badge' → répondre avec mon badge
  registerPeerAction → afficher badge + formulaire de contact
  registerProfileWidget → afficher mon propre badge
  tab settings:true → formulaire de configuration du badge

Réponds UNIQUEMENT avec le code JavaScript brut du plugin, sans balises markdown, sans commentaires de structure.
```

---

## 8. Checklist de validation d'un plugin

Avant de publier un plugin, vérifier :

**Structure**
- [ ] `frodon.register({ id, name }, initFn)` — les deux champs obligatoires présents
- [ ] `PLUGIN_ID` = `manifest.id` dans tout le code
- [ ] `return { destroy() {} }` présent à la fin de `initFn`
- [ ] Pas d'`import`/`export`/`require`

**Messagerie**
- [ ] `frodon.onDM(PLUGIN_ID, ...)` déclaré en premier dans `initFn`
- [ ] Tous les DMs de protocole ont `_silent: true`
- [ ] Les DMs destinés à l'utilisateur ont un `_label`

**UI**
- [ ] `frodon.refreshSphereTab(PLUGIN_ID)` appelé après chaque changement d'état
- [ ] `render(container)` n'utilise pas de référence stale au container
- [ ] Cas `peer = null` géré dans `registerPeerAction`
- [ ] Inputs créés avec `document.createElement`, pas `makeElement`

**Persistance**
- [ ] `Set` → `Array` avant `store.set()`
- [ ] `Array` → `new Set()` après `store.get()`
- [ ] `store.del()` appelé dans `destroy()` si nécessaire

**Cycle de vie**
- [ ] `registerUninstallHook` : forfaits envoyés, DMs de départ
- [ ] `onPeerLeave` : état "away" géré si applicable
- [ ] `onPeerAppear` : resync envoyé si applicable

**Qualité**
- [ ] CSS injecté une seule fois (`_cssInjected` flag)
- [ ] Pas de `console.log` en production
- [ ] Pas d'accès réseau externe sauf via DM FRODON
- [ ] Tailles de données raisonnables (pas d'images full-size dans les DMs)
