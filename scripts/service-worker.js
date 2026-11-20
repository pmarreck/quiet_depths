const scope = self.registration.scope;
const cachePrefix = `quiet-depths:${scope}:`;
const cacheName = cachePrefix + revision;
const urls = new Set(assets.map(asset => new URL(asset, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...urls].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith(cachePrefix) && name !== cacheName)
    .map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!urls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(url.href) || fetch(event.request)));
});
