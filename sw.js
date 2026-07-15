const CACHE = 'yourmine-v2';
const SHELL = [
  './index.html','./mine.js','./liste.js','./build.js',
  './profile.js','./social.sphere.js','./manifest.json',
  './ym.svg','./ym192.png','./ym512.png'
];

self.__swOverride = self.__swOverride || [];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Pas de clients.claim() — evite le clignotement au retour sur la PWA
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ressources externes → network only
  if (url.origin !== location.origin) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Point d'ancrage plugins : le premier qui matche gagne
  const handler = self.__swOverride.find(p => p.match(url, e.request));
  if (handler) {
    e.respondWith(handler.respond(e.request));
    return;
  }

  // Meme origine, aucun plugin → comportement par défaut inchangé : network first, fallback cache
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
