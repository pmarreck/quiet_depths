// The offline build prepends the exact installed files and their digests.
declare const revision: string;
declare const assets: [string, string][];
const worker = self as unknown as ServiceWorkerGlobalScope;
const scope = worker.registration.scope;
const cachePrefix = `quiet-depths:${scope}:`;
const cacheName = cachePrefix + revision;
const urls = new Map(assets.map(([path, integrity]) => [new URL(path, scope).href, integrity]));

worker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(Array.from(urls, ([url, integrity]) => new Request(url, { cache: 'reload', integrity })));
    await worker.skipWaiting();
  })());
});

worker.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith(cachePrefix) && name !== cacheName)
    .map(name => caches.delete(name)))).then(() => worker.clients.claim()));
});

worker.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!urls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(url.href) || fetch(event.request)));
});
