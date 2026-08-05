const CACHE_NAME = "cdg-v2";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  // No interceptar NADA — dejar pasar todo al servidor
  // Esto evita que el SW bloquee llamadas a Supabase
  return;
});
