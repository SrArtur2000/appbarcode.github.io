// Guarda os arquivos no aparelho para o app abrir e ler cartões sem internet.
const V = "ecard-v1";
const ARQUIVOS = ["./", "index.html", "app.js", "manifest.webmanifest", "icone-192.png", "icone-512.png",
  "lib/tesseract.min.js", "lib/worker.min.js", "lib/zxing.min.js", "lib/xlsx.full.min.js",
  "lib/tesseract-core-simd-lstm.wasm.js", "lib/tesseract-core-lstm.wasm.js", "lib/por.traineddata.gz"];

self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
