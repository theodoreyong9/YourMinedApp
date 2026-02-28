# YourMine - Las Action Crypto

Whitepaper : https://yourmine-dapp.web.app/WPYourMine.pdf

# FRODON — Système de Plugins SPHERE

> Documentation complète pour créer, héberger et distribuer des plugins pour l'interface FRODON.

---

## Table des matières

1. [C'est quoi un plugin FRODON ?](#1-cest-quoi-un-plugin-frodon-)
2. [Installer un plugin](#2-installer-un-plugin)
3. [Héberger son plugin sur GitHub](#3-héberger-son-plugin-sur-github)
4. [Structure d'un plugin](#4-structure-dun-plugin)
5. [Le manifest](#5-le-manifest)
6. [API complète — référence](#6-api-complète--référence)
   - [Identité & pairs](#61-identité--pairs)
   - [Messagerie privée P2P](#62-messagerie-privée-p2p)
   - [Hooks UI — fiche d'un pair](#63-hooks-ui--fiche-dun-pair)
   - [Panneau SPHERE — onglet bas d'écran](#64-panneau-sphere--onglet-bas-décran)
   - [Widget profil](#65-widget-profil)
   - [Stockage persistant](#66-stockage-persistant)
   - [Utilitaires](#67-utilitaires)
   - [Hooks de cycle de vie](#68-hooks-de-cycle-de-vie)
   - [Refresh UI](#69-refresh-ui)
7. [Propagation automatique aux pairs](#7-propagation-automatique-aux-pairs)
8. [Classes CSS disponibles](#8-classes-css-disponibles)
9. [Exemples complets](#9-exemples-complets)
   - [Plugin minimal](#91-plugin-minimal)
   - [Livre d'Or (message libre)](#92-livre-dor-message-libre)
   - [Réactions rapides (messages prédéfinis)](#93-réactions-rapides-messages-prédéfinis)
   - [TicTacToe (mini-jeu P2P)](#94-tictactoe-mini-jeu-p2p)
10. [Cas d'usage avancés](#10-cas-dusage-avancés)
11. [Limites et bonnes pratiques](#11-limites-et-bonnes-pratiques)

---

## 1. C'est quoi un plugin FRODON ?

FRODON est une interface radar P2P géolocalisée qui permet de découvrir des pairs proches et de voir leurs publications sociales. Le système **SPHERE** étend cette interface avec des plugins : des fichiers JavaScript hébergés publiquement (GitHub, jsDelivr, votre CDN…) qu'un utilisateur peut installer en collant une URL.

Un plugin peut :

- **Envoyer et recevoir des messages privés P2P** entre deux utilisateurs (DMs routés par le hub FRODON)
- **Ajouter des interactions dans la fiche d'un pair** : boutons, formulaires, mini-jeux, réactions…
- **Afficher un panneau dans l'onglet ⬡ SPHERE** en bas d'écran, avec ses propres sous-onglets
- **Ajouter un widget dans votre profil** : stats, historique, configuration…
- **Réagir aux événements** : arrivée/départ d'un pair, messages reçus, changements de position…
- **Stocker des données localement** dans un espace namespaced par plugin

Un pair qui vous découvre et qui **n'a pas le plugin** voit un bouton **"Installer et jouer"** dans votre fiche. Un clic suffit — installation automatique, sans quitter l'écran.

---

## 2. Installer un plugin

1. Dans FRODON, cliquer sur le bouton **⬡ SPHERE** dans le header
2. Coller l'URL raw du fichier `.js` dans le champ
3. Cliquer **Installer**

Le plugin est chargé, exécuté, et persisté dans le `localStorage`. Il se réinstalle automatiquement à chaque rechargement de la page.

Pour **désinstaller** : ⬡ SPHERE → liste des plugins installés → **Désinstaller**.

---

## 3. Héberger son plugin sur GitHub

### Créer le fichier

1. Créer un repo GitHub (public) ou utiliser un repo existant
2. Upload votre fichier `monplugin.plugin.js` via l'interface GitHub ou `git push`

### Obtenir l'URL raw

Sur GitHub, ouvrez votre fichier puis cliquez **Raw**. L'URL ressemble à :

```
https://raw.githubusercontent.com/VOTRE_PSEUDO/VOTRE_REPO/main/monplugin.plugin.js
```

⚠️ **Erreur fréquente** : ne pas inclure `/blob/` dans l'URL. GitHub l'affiche dans son interface mais il ne doit **pas** apparaître dans l'URL raw.

| ❌ Interface GitHub | ✅ URL raw à utiliser |
|---|---|
| `github.com/user/repo/blob/main/plugin.js` | `raw.githubusercontent.com/user/repo/main/plugin.js` |

### Mettre à jour le plugin

Un simple `git push` suffit. Comme FRODON recharge le fichier depuis l'URL à chaque démarrage, tous les utilisateurs ayant installé le plugin récupèrent automatiquement la nouvelle version au prochain chargement de page.

---

## 4. Structure d'un plugin

Un plugin est un fichier JS autonome. Il reçoit en argument l'objet `frodon` qui expose toute l'API. Il doit appeler `frodon.register()` exactement une fois.

```js
frodon.register(manifest, initFn)
```

- **`manifest`** — objet décrivant le plugin (voir section 5)
- **`initFn`** — fonction appelée une fois lors de l'installation, peut retourner `{ destroy() }` pour le nettoyage

```js
// Structure minimale
frodon.register({
  id      : 'mon_plugin',
  name    : 'Mon Plugin',
  version : '1.0.0',
  icon    : '🔌',
}, () => {

  const PLUGIN_ID = 'mon_plugin';

  // Enregistrer les handlers DM
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    console.log('Message reçu de', fromId, payload);
  });

  // Enregistrer les zones UI
  frodon.registerPeerAction(PLUGIN_ID, 'Mon action', (peerId, container) => {
    const btn = frodon.makeElement('button', 'plugin-action-btn acc', 'Envoyer');
    btn.onclick = () => frodon.sendDM(peerId, PLUGIN_ID, { type: 'salut' });
    container.appendChild(btn);
  });

  // Retourner destroy() si nécessaire
  return {
    destroy() {
      // nettoyer timers, event listeners, etc.
    }
  };
});
```

---

## 5. Le manifest

```js
{
  id          : 'tictactoe',       // OBLIGATOIRE — identifiant unique, snake_case
  name        : 'TicTacToe',       // OBLIGATOIRE — nom affiché dans l'UI
  version     : '1.0.0',           // recommandé  — semver
  author      : 'mon_pseudo',      // optionnel
  description : 'Défiez vos pairs en TicTacToe P2P.',  // optionnel, ~120 chars max
  icon        : '⊞',               // optionnel   — emoji ou caractère unicode
}
```

L'`id` est la clé principale. Si vous publiez une mise à jour avec le même `id`, l'ancienne version est automatiquement remplacée.

---

## 6. API complète — référence

### 6.1 Identité & pairs

```js
frodon.getMyId()
// → string  — votre peerId local (identifiant unique de session P2P)

frodon.getMyProfile()
// → { name, avatar, network, handle, peerId }

frodon.getPeer(peerId)
// → { peerId, name, avatar, network, handle, dist, plugins, pluginUrls, lat, lng }
// → null si le pair n'est pas connu

frodon.getAllPeers()
// → tableau de tous les pairs actuellement découverts dans la zone

frodon.getPosition()
// → { lat, lng, acc }  ou  null si GPS non disponible
```

---

### 6.2 Messagerie privée P2P

Les DMs sont des paquets JSON routés via le hub FRODON en P2P. **Le destinataire doit avoir le même plugin installé** pour les recevoir (sinon ils sont ignorés). Si l'autre utilisateur n'a pas le plugin, il verra un bouton "Installer et jouer" dans votre fiche.

#### Envoyer un DM

```js
frodon.sendDM(peerId, pluginId, payload)
```

| Paramètre | Type | Description |
|---|---|---|
| `peerId` | string | Identifiant P2P du destinataire |
| `pluginId` | string | ID de votre plugin (pour le routing) |
| `payload` | object | Données libres sérialisées en JSON |

```js
// Exemple
frodon.sendDM(peerId, 'mon_plugin', {
  type : 'move',
  cell : 4,
  data : { score: 3 },
});
```

#### Recevoir des DMs

```js
frodon.onDM(pluginId, handler)
// handler: (fromPeerId: string, payload: object) => void
```

À appeler dans votre `initFn`. Un seul handler par plugin. Les DMs arrivent même si la modale du pair est fermée — ils sont notifiés via toast et badge.

```js
frodon.onDM('mon_plugin', (fromId, payload) => {
  if(payload.type === 'move') {
    // Mettre à jour l'état du jeu
    applyMove(fromId, payload.cell);
    frodon.refreshPeerModal(fromId);
    frodon.refreshSphereTab('mon_plugin');
  }
});
```

---

### 6.3 Hooks UI — fiche d'un pair

Cette zone s'affiche dans la modale qui s'ouvre quand on clique sur un pair dans le radar ou le fil social. **Elle n'apparaît que si les deux utilisateurs ont le plugin installé.**

```js
frodon.registerPeerAction(pluginId, sectionLabel, actionFn)
// actionFn: (peerId: string, containerEl: HTMLElement) => void
```

| Paramètre | Type | Description |
|---|---|---|
| `pluginId` | string | ID de votre plugin |
| `sectionLabel` | string | Titre de la section (ex: `'⊞ TicTacToe'`) |
| `actionFn` | function | Appelée à chaque ouverture de la modale du pair |

`containerEl` est un `<div>` vide dans lequel vous pouvez injecter n'importe quel HTML. La fonction est re-appelée à chaque `frodon.refreshPeerModal()`.

```js
frodon.registerPeerAction('mon_plugin', '🎮 Jouer', (peerId, container) => {
  const peer = frodon.getPeer(peerId);

  // Afficher l'état actuel
  const status = frodon.makeElement('div', '', `Partie contre ${peer.name}`);
  container.appendChild(status);

  // Bouton d'action
  const btn = frodon.makeElement('button', 'plugin-action-btn acc', '🎯 Jouer un coup');
  btn.onclick = () => {
    frodon.sendDM(peerId, 'mon_plugin', { type: 'move', cell: 4 });
    frodon.showToast('Coup envoyé !');
    frodon.refreshPeerModal(peerId);
  };
  container.appendChild(btn);
});
```

---

### 6.4 Panneau SPHERE — onglet bas d'écran

L'onglet **⬡ SPHERE** en bas de l'écran affiche un panneau par plugin installé. Chaque plugin peut déclarer plusieurs **sous-onglets** (ex: "Parties en cours" / "Scores").

```js
frodon.registerBottomPanel(pluginId, tabs)
```

```js
// tabs: tableau d'onglets
[
  {
    id    : 'games',              // identifiant unique de l'onglet
    label : '⊞ Parties en cours', // texte affiché dans la barre
    render: (containerEl) => {   // appelé à chaque activation de l'onglet
      // injecter du contenu dans containerEl
    }
  },
  {
    id    : 'scores',
    label : '🏆 Scores',
    render: (containerEl) => {
      // ...
    }
  },
]
```

Pour déclencher un re-render de votre panneau (après réception d'un DM par exemple) :

```js
frodon.refreshSphereTab(pluginId)
```

Exemple complet avec deux onglets :

```js
frodon.registerBottomPanel('mon_plugin', [
  {
    id    : 'live',
    label : '⚡ En direct',
    render: (container) => {
      const parties = getActiveGames();
      if(!parties.length) {
        container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--txt2)">Aucune partie en cours</p>';
        return;
      }
      parties.forEach(g => {
        const card = frodon.makeElement('div', 'mini-card');
        // ... construire la carte
        container.appendChild(card);
      });
    }
  },
  {
    id    : 'history',
    label : '📋 Historique',
    render: (container) => {
      // afficher les dernières parties terminées
    }
  }
]);
```

---

### 6.5 Widget profil

S'affiche dans **votre propre modale de profil**, après les champs nom/réseau. Utile pour afficher des stats, une config, ou un récapitulatif de votre activité sur le plugin.

```js
frodon.registerProfileWidget(pluginId, renderFn)
// renderFn: (containerEl: HTMLElement) => void
```

```js
frodon.registerProfileWidget('mon_plugin', (container) => {
  const wins = store.get('wins') || 0;
  container.appendChild(frodon.makeElement('div', 'section-label', '🏆 Mes stats'));
  container.appendChild(frodon.makeElement('div', '', `${wins} victoires`));
});
```

---

### 6.6 Stockage persistant

Chaque plugin dispose d'un espace `localStorage` namespaced. Les clés sont automatiquement préfixées par `frd_plug_{pluginId}_` pour éviter les collisions.

```js
const store = frodon.storage(pluginId)

store.get(key)          // → valeur (désérialisée depuis JSON) | null
store.set(key, value)   // stocke value sérialisée en JSON
store.del(key)          // supprime la clé
```

```js
// Exemple : compteur de victoires
const store = frodon.storage('mon_plugin');
const wins = store.get('wins') || 0;
store.set('wins', wins + 1);

// Exemple : stocker un objet complexe
store.set('game_state', {
  board  : [null, 'X', null, 'O', null, null, null, null, null],
  myTurn : false,
});
const state = store.get('game_state');
```

---

### 6.7 Utilitaires

Ces fonctions exposent les utilitaires internes de FRODON directement dans vos plugins.

```js
frodon.showToast(message, isError?)
// Affiche un toast natif en bas de l'écran
// isError = true → toast rouge/orange

frodon.makeElement(tag, className?, textContent?)
// Crée un élément HTML DOM
// Équivalent à: const el = document.createElement(tag); el.className = ...; el.textContent = ...

frodon.formatTime(timestamp)
// Formate un timestamp en texte relatif
// → "à l'instant" | "3min" | "2h" | "12 jan"

frodon.distStr(meters)
// Formate une distance en texte lisible
// → "340 m" | "1.2 km"

frodon.safeImg(src, fallbackSrc, className?)
// Crée un <img> avec fallback automatique si l'image ne charge pas
```

---

### 6.8 Hooks de cycle de vie

Ces callbacks sont déclenchés par les événements du réseau P2P.

```js
frodon.onPeerAppear(callback)
// callback: (peer: PeerObject) => void
// Appelé quand un nouveau pair entre dans la zone GPS

frodon.onPeerLeave(callback)
// callback: (peerId: string) => void
// Appelé quand un pair quitte la zone (TTL expiré ou déconnexion)
```

```js
// Exemple : notifier quand un adversaire revient
frodon.onPeerAppear(peer => {
  const game = getGameWithPeer(peer.peerId);
  if(game && !game.done && !game.myTurn) {
    frodon.showToast(`${peer.name} est de retour — à lui de jouer !`);
  }
});

frodon.onPeerLeave(peerId => {
  const game = getGameWithPeer(peerId);
  if(game && !game.done) {
    frodon.showToast('Votre adversaire a quitté la zone.');
  }
});
```

---

### 6.9 Refresh UI

Ces fonctions forcent le re-render des zones UI après un changement d'état.

```js
frodon.refreshPeerModal(peerId)
// Re-render la modale d'un pair si elle est actuellement ouverte
// Sans effet si la modale n'est pas ouverte

frodon.refreshSphereTab(pluginId)
// Re-render le panneau de votre plugin dans l'onglet SPHERE
// Sans effet si l'onglet SPHERE n'est pas actif

frodon.refreshProfileModal()
// Re-render la modale de profil si elle est ouverte
```

**Règle d'usage :** appelez `refreshSphereTab` et `refreshPeerModal` après chaque changement d'état important (réception d'un DM, coup joué, vote reçu…).

---

## 7. Propagation automatique aux pairs

Quand vous installez un plugin, votre `pluginId` **et son URL** sont automatiquement inclus dans chaque broadcast P2P (`hello` / `pos`). Résultat :

- Tous les pairs dans la zone reçoivent la liste de vos plugins et leurs URLs
- Quand quelqu'un ouvre votre fiche et ne possède pas un de vos plugins, il voit :

```
⬡ Plugins disponibles chez ce pair
─────────────────────────────────────
  ⬡  tictactoe     [disponible]
     Ce pair utilise ce plugin. Installez-le en un clic.

     [ ⬡ Installer et jouer ]
```

Un clic installe le plugin depuis l'URL diffusée, puis rouvre automatiquement la fiche pour lancer l'interaction. **L'utilisateur n'a jamais besoin de chercher ou copier-coller quoi que ce soit.**

---

## 8. Classes CSS disponibles

Ces classes FRODON peuvent être utilisées directement dans vos `containerEl` :

| Classe | Usage |
|---|---|
| `plugin-action-btn` | Bouton standard (fond violet) |
| `plugin-action-btn acc` | Bouton accentué (fond cyan) |
| `mini-card` | Carte compacte avec fond légèrement contrasté |
| `mini-card-title` | Titre dans une mini-card |
| `mini-card-body` | Corps de texte dans une mini-card |
| `mini-card-ts` | Timestamp petit format dans une mini-card |
| `section-label` | Label de section en petites capitales |
| `no-posts` | Texte centré en italique pour état vide |
| `loading-bar` | Barre de chargement animée (shimmer) |
| `plugin-widget-area` | Conteneur avec fond et bordure violette légère |
| `plugin-actions-row` | Rangée de boutons côte à côte |
| `f-input` | Input/textarea stylisé FRODON |

Variables CSS disponibles :

```css
var(--acc)   /* cyan   #00f5c8 — couleur principale    */
var(--acc2)  /* violet #7c4dff — couleur secondaire    */
var(--warn)  /* orange #ff6b35 — avertissements        */
var(--ok)    /* vert   #00e87a — succès                */
var(--txt)   /* blanc  #e8e8f8 — texte principal       */
var(--txt2)  /* gris   #7070a0 — texte secondaire      */
var(--sur)   /* fond   #0f0f22 — surface               */
var(--sur2)  /* fond   #161630 — surface secondaire    */
var(--bdr)   /* bord   #1e1e40                         */
var(--bdr2)  /* bord   #2a2a58                         */
var(--mono)  /* 'Space Mono', monospace                */
var(--sans)  /* 'Syne', sans-serif                     */
var(--r)     /* border-radius: 12px                    */
var(--glow)  /* box-shadow cyan glow                   */
```

---

## 9. Exemples complets

### 9.1 Plugin minimal

Le strict minimum pour un plugin fonctionnel.

```js
frodon.register({
  id   : 'hello',
  name : 'Hello World',
  icon : '👋',
}, () => {
  const PLUGIN_ID = 'hello';

  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    const peer = frodon.getPeer(fromId);
    frodon.showToast(`👋 ${peer?.name || fromId} vous dit : ${payload.text}`);
  });

  frodon.registerPeerAction(PLUGIN_ID, '👋 Dire bonjour', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const btn = frodon.makeElement('button', 'plugin-action-btn acc', `👋 Dire bonjour à ${peer?.name}`);
    btn.onclick = () => {
      frodon.sendDM(peerId, PLUGIN_ID, { text: 'Bonjour !' });
      frodon.showToast('Bonjour envoyé !');
    };
    container.appendChild(btn);
  });
});
```

---

### 9.2 Livre d'Or (message libre)

Un visiteur peut signer votre livre d'or en laissant un message libre. Vous voyez toutes les signatures dans votre profil.

```js
frodon.register({
  id          : 'guestbook',
  name        : "Livre d'Or",
  version     : '1.0.0',
  description : 'Laissez un message à chaque pair que vous croisez.',
  icon        : '📖',
}, () => {

  const PLUGIN_ID = 'guestbook';
  const store     = frodon.storage(PLUGIN_ID);

  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type !== 'sign') return;
    const entries = store.get('entries') || [];
    entries.unshift({ from: fromId, name: payload.authorName, text: payload.text, ts: Date.now() });
    if(entries.length > 50) entries.length = 50;
    store.set('entries', entries);
    frodon.showToast(`📖 ${payload.authorName} a signé votre livre !`);
    frodon.refreshProfileModal();
    frodon.refreshSphereTab(PLUGIN_ID);
  });

  frodon.registerPeerAction(PLUGIN_ID, '📖 Livre d\'Or', (peerId, container) => {
    const peer = frodon.getPeer(peerId);

    const textarea = document.createElement('textarea');
    textarea.className   = 'f-input';
    textarea.rows        = 3;
    textarea.maxLength   = 280;
    textarea.placeholder = `Signez le livre de ${peer?.name}…`;
    container.appendChild(textarea);

    const btn = frodon.makeElement('button', 'plugin-action-btn acc', '✍ Signer');
    btn.onclick = () => {
      const text = textarea.value.trim();
      if(!text) { frodon.showToast('Écrivez quelque chose !', true); return; }
      frodon.sendDM(peerId, PLUGIN_ID, {
        type       : 'sign',
        authorName : frodon.getMyProfile().name,
        text,
      });
      btn.textContent = '✓ Signé !';
      btn.disabled    = true;
    };
    container.appendChild(btn);
  });

  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id    : 'inbox',
      label : '📖 Messages reçus',
      render: (container) => {
        const entries = store.get('entries') || [];
        if(!entries.length) {
          container.innerHTML = '<p class="no-posts">Personne n\'a encore signé votre livre.</p>';
          return;
        }
        entries.slice(0, 20).forEach(e => {
          const card = frodon.makeElement('div', 'mini-card');
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <strong style="font-size:.78rem">${e.name}</strong>
              <span class="mini-card-ts">${frodon.formatTime(e.ts)}</span>
            </div>
            <div class="mini-card-body">"${e.text}"</div>`;
          container.appendChild(card);
        });
      }
    }
  ]);

  frodon.registerProfileWidget(PLUGIN_ID, (container) => {
    const count = (store.get('entries') || []).length;
    const lbl   = frodon.makeElement('div', 'section-label', `📖 Livre d'Or — ${count} signature(s)`);
    container.appendChild(lbl);
  });
});
```

---

### 9.3 Réactions rapides (messages prédéfinis)

Une palette d'emojis à envoyer en un tap.

```js
frodon.register({
  id          : 'reactions',
  name        : 'Réactions',
  version     : '1.0.0',
  description : 'Envoyez des réactions emoji à vos pairs.',
  icon        : '⚡',
}, () => {

  const PLUGIN_ID = 'reactions';
  const store     = frodon.storage(PLUGIN_ID);

  const EMOJIS = [
    {emoji:'👋',label:'Salut'}, {emoji:'🔥',label:'Hot'},
    {emoji:'❤️',label:'Love'},  {emoji:'😂',label:'Lol'},
    {emoji:'👏',label:'Bravo'}, {emoji:'🤔',label:'Hmm'},
    {emoji:'⚡',label:'Vite'},  {emoji:'🎉',label:'Fête'},
  ];

  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    if(payload.type !== 'react') return;
    const peer  = frodon.getPeer(fromId);
    const key   = 'recv_' + payload.emoji.codePointAt(0);
    store.set(key, (store.get(key) || 0) + 1);
    frodon.showToast(`${payload.emoji} ${peer?.name || '?'} vous envoie une réaction`);
    frodon.refreshSphereTab(PLUGIN_ID);
  });

  frodon.registerPeerAction(PLUGIN_ID, '⚡ Réactions', (peerId, container) => {
    const peer  = frodon.getPeer(peerId);
    const grid  = frodon.makeElement('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:7px';
    EMOJIS.forEach(({emoji, label}) => {
      const btn = frodon.makeElement('button', 'plugin-action-btn');
      btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;font-size:1.2rem';
      btn.innerHTML = `${emoji}<span style="font-size:.55rem;color:var(--txt2)">${label}</span>`;
      btn.onclick = () => {
        frodon.sendDM(peerId, PLUGIN_ID, { type: 'react', emoji });
        frodon.showToast(`${emoji} envoyé à ${peer?.name}`);
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = '', 250);
      };
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  });

  frodon.registerBottomPanel(PLUGIN_ID, [
    {
      id    : 'stats',
      label : '⚡ Réactions reçues',
      render: (container) => {
        const grid = frodon.makeElement('div', '');
        grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:10px';
        let any = false;
        EMOJIS.forEach(({emoji, label}) => {
          const count = store.get('recv_' + emoji.codePointAt(0)) || 0;
          if(!count) return;
          any = true;
          const chip = frodon.makeElement('div', '');
          chip.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:20px';
          chip.innerHTML = `${emoji} <strong style="font-family:var(--mono)">${count}</strong>`;
          chip.title = label;
          grid.appendChild(chip);
        });
        if(!any) grid.innerHTML = '<p class="no-posts">Aucune réaction reçue.</p>';
        container.appendChild(grid);
      }
    }
  ]);
});
```

---

### 9.4 TicTacToe (mini-jeu P2P)

Voir le fichier `tictactoe.plugin.js` joint pour l'implémentation complète. Ci-dessous, l'architecture générale.

**Paquets échangés :**

| `payload.type` | Envoyé par | Contenu | Description |
|---|---|---|---|
| `challenge` | Joueur X | `{ gameId }` | Lance une nouvelle partie |
| `move` | Les deux | `{ gameId, cell }` | Jouer sur la case `cell` (0–8) |
| `forfeit` | N'importe | `{ gameId }` | Abandonner la partie |
| `rematch` | N'importe | `{ gameId }` | Demander une revanche |

**Symboles :** le créateur du défi joue toujours **X** (commence en premier). L'adversaire joue **O**.

**Structure d'une partie :**
```js
{
  board      : Array(9).fill(null),  // null | 'X' | 'O'
  mySymbol   : 'X',                  // mon symbole
  opponentId : 'peer-abc123',        // peerId de l'adversaire
  myTurn     : true,                 // est-ce mon tour ?
  done       : false,                // partie terminée ?
  winner     : null,                 // null | 'X' | 'O' | 'draw'
}
```

---

## 10. Cas d'usage avancés

### État partagé multi-tours

Pour un jeu complexe, stocker l'état complet dans `localStorage` et le reconstituez à chaque render :

```js
frodon.onDM(PLUGIN_ID, (fromId, payload) => {
  // Récupérer l'état
  const state = store.get('game_' + fromId) || createNewGame();
  // Appliquer la mutation
  applyPayload(state, payload);
  // Persister
  store.set('game_' + fromId, state);
  // Rafraîchir l'UI
  frodon.refreshPeerModal(fromId);
  frodon.refreshSphereTab(PLUGIN_ID);
});
```

### Notifications persistantes

Les DMs non lus s'accumulent dans `S.dmQueue[pluginId]`. Ils sont affichés comme badges dans l'onglet SPHERE. Pour les marquer comme lus, videz le tableau dans votre `render()` :

```js
// Dans registerPeerAction ou registerBottomPanel render
const unread = (S.dmQueue[PLUGIN_ID] || []).filter(m => m.from === peerId);
// ... afficher les messages
// Marquer comme lus
if(S.dmQueue[PLUGIN_ID]) {
  S.dmQueue[PLUGIN_ID] = S.dmQueue[PLUGIN_ID].filter(m => m.from !== peerId);
}
```

### Timer et intervalles

Si votre plugin utilise `setInterval` ou `setTimeout`, nettoyez-les dans `destroy()` :

```js
frodon.register({ id: 'timer', name: 'Timer', icon: '⏱' }, () => {
  const interval = setInterval(() => {
    frodon.refreshSphereTab('timer');
  }, 5000);

  return {
    destroy() {
      clearInterval(interval);
    }
  };
});
```

---

## 11. Limites et bonnes pratiques

### Ce que vous pouvez faire

- Injecter n'importe quel HTML dans les containers
- Utiliser `fetch()` pour appeler des APIs externes
- Utiliser n'importe quelle API Web standard (Canvas, Web Audio, etc.)
- Stocker autant de données que vous voulez dans `localStorage` (attention à la limite ~5 Mo par domaine)

### Limites actuelles

- **Pas de persistance des DMs** : si le destinataire est hors ligne, le message est perdu. Prévoyez une logique de "en attente" côté expéditeur si nécessaire.
- **Pas de chiffrement** : les DMs passent en clair via le hub P2P. Ne transmettez pas de données sensibles.
- **Confiance totale** : le code du plugin s'exécute avec un accès complet au DOM et au réseau. Installez uniquement des plugins dont vous avez lu le code source.
- **Pas d'isolation** : deux plugins peuvent modifier les mêmes éléments DOM si leurs `containerEl` se superposent. Utilisez des IDs uniques préfixés par votre `pluginId`.
- **Un seul handler DM par plugin** : `frodon.onDM()` écrase le handler précédent si appelé plusieurs fois.

### Bonnes pratiques

- **Nommez vos paquets** avec un champ `type` pour distinguer les différents messages dans votre handler DM
- **Versionnez vos paquets** si vous faites évoluer le protocole : `{ type: 'move', version: 2, ... }`
- **Gérez les pairs absents** : `frodon.getPeer(id)` peut retourner `null` — toujours vérifier
- **Débouncer les refreshes** si vous recevez beaucoup de DMs en rafale
- **Testez en solo** en ouvrant deux onglets avec des profils différents sur `localhost`

---

*FRODON Plugin SDK — documenté avec ❤️*

Licence
MIT License - See LICENSE file for details
