// Guarda os arquivos no aparelho para o app abrir sem internet.
const V = "ecard5-1";
const ARQUIVOS = ["./", "index.html", "app.js", "manifest.webmanifest", "icone-192.png", "icone-512.png",
  "lib/zxing.min.js", "lib/xlsx.full.min.js"];

self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ecard5-") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const leve = !url.pathname.includes("/lib/");   // páginas e código: rede primeiro, para sempre pegar a versão nova
  if(leve){
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(k => k.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request)));
  }else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
