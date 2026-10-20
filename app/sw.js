// Service worker: funciona offline. AO ALTERAR QUALQUER ARQUIVO, incremente VERSAO.
const VERSAO = "rumo-v8";
const ARQUIVOS = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "data/edital.js", "data/questoes.js", "data/flashcards.js", "data/discursivas.js", "data/materiais.js", "data/recados.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/maskable-512.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (pega atualizações), cache como reserva offline
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { if (r && r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
