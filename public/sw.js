const CACHE = 'health-diary-__BUILD_VERSION__';
const ASSETS = ['/', '/index.html', '/styles.css', '/theme.js', '/updates.js', '/app.js', '/db.js', '/model.js', '/visits.js', '/visit-model.js', '/icon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // New versions wait for the old app to close, avoiding mixed versions or lost edits.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('health-diary-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'APPLY_UPDATE' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    // Other windows may contain unsaved work or an older app without update handling.
    const accepted = windows.length === 1 && windows[0].id === event.source?.id;
    event.ports[0].postMessage({accepted});
    if (accepted) await self.skipWaiting();
  })());
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate') {
    event.respondWith(caches.match('/index.html').then(cached => cached || fetch(event.request)));
  } else if(ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(event.request)));
  }
});
