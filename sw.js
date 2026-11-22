/* Animaminas — service worker
   Precachea el shell y los recursos de juego; cache-first para estáticos.
   La música se cachea la primera vez que se reproduce. */

const VERSION = "animaminas-v3";
const CACHE = `${VERSION}`;

const PRECARGA = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/estilos.css",
  "js/main.js",
  "js/config.js",
  "js/grid.js",
  "js/board.js",
  "js/render.js",
  "js/input.js",
  "js/audio.js",
  "js/score.js",
  "js/storage.js",
  "js/ui.js",
  "data/levels.json",
  "data/grid.json",
  "assets/fondo/nivel1.webp",
  "assets/fondo/nivel2.webp",
  "assets/fondo/nivel3.webp",
  "assets/fondo/nivel4.webp",
  "assets/fichas/limpio@2x.webp",
  "assets/fichas/marca@2x.webp",
  "assets/fichas/seguro@2x.webp",
  "assets/fichas/mina@2x.webp",
  "assets/fichas/numero1@2x.webp",
  "assets/fichas/numero2@2x.webp",
  "assets/fichas/numero3@2x.webp",
  "assets/fichas/numero4@2x.webp",
  "assets/fichas/numero5@2x.webp",
  "assets/fichas/numero6@2x.webp",
  "assets/iconos/icon-192.png",
  "assets/iconos/icon-512.png",
  "assets/iconos/maskable-192.png",
  "assets/iconos/maskable-512.png",
  "assets/iconos/apple-touch-icon.png",
  "assets/iconos/with_sound.webp",
  "assets/iconos/no_sound.webp",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(request).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(request).then((respuesta) => {
        if (!respuesta || respuesta.status !== 200 || respuesta.type === "opaque") return respuesta;
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copia)).catch(() => {});
        return respuesta;
      }).catch(() => caches.match("index.html"));
    }),
  );
});
