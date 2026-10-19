// =========================================================
// Menú Familiar · sw.js
// Funcionamiento sin conexión + notificaciones en segundo plano
// =========================================================
importScripts(
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyAul0xjLe8F2tD8boTQYIWCOAXWsaVOd6A",
  authDomain: "keko-memos.firebaseapp.com",
  projectId: "keko-memos",
  storageBucket: "keko-memos.firebasestorage.app",
  messagingSenderId: "1082679945282",
  appId: "1:1082679945282:web:64c437b653333b19b6e5db"
});
// Los avisos llegan con "notification", así que Firebase los muestra solo
firebase.messaging();

const CACHE = "menu-familiar-v1";
const ARCHIVOS = ["/", "/index.html", "/estilos.css", "/app.js", "/asistente.js", "/manifest.json", "/icono-192.png", "/icono-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Archivos de la app: primero la red (para recibir cambios), si falla, la copia guardada
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/__/")) return;
    e.respondWith(
      fetch(req)
        .then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Librerías de Firebase, tipografías y QR: copia guardada y actualización en segundo plano
  if (/(^|\.)gstatic\.com$|fonts\.googleapis\.com$|cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const guardada = await c.match(req);
        const red = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => guardada);
        return guardada || red;
      })
    );
  }
});

// Al tocar una notificación, abre o enfoca la app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin));
      return abierta ? abierta.focus() : self.clients.openWindow("/");
    })
  );
});
