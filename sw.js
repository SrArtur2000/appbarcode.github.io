// Este endereço (raiz) não usa mais service worker: ele se remove e limpa o cache antigo.
// O app com funcionamento offline fica em v2/.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("ecard-")) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type: "window"})) c.navigate(c.url);
})()));
