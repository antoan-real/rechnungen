// Service Worker: App offline startbar machen. Bei jeder Änderung an App-Dateien VERSION erhöhen.
const VERSION = "v5";
const SHELL = `daily-shell-${VERSION}`;
const RUNTIME = "daily-runtime";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/firebase.js", "js/core/data.js", "js/core/ui.js", "js/core/dates.js", "js/core/settings.js", "js/core/reminders.js", "js/core/push.js", "js/core/chart.js",
  "js/modules/registry.js", "js/modules/dashboard.js", "js/modules/einstellungen.js", "js/modules/gewohnheiten.js", "js/modules/habits-core.js", "js/modules/training.js", "js/modules/uni.js",
  "js/modules/reflektor.js", "js/modules/reflect-core.js", "js/modules/rezepte.js", "js/modules/rezepte-core.js", "js/modules/rezepte-data.js",
  "js/modules/news.js", "js/modules/news-core.js", "js/modules/video.js",
  "js/modules/rechnungen/index.js", "js/modules/rechnungen/rechnungen.css",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];
// Bibliotheken von CDNs: einmal geladen, dann aus dem Cache
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs|cdn\.jsdelivr\.net\/npm|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("daily-shell-") && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Eigene Dateien: erst Netz (immer aktuell), offline aus dem Cache
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
    return;
  }
  if (CDN.test(req.url)) {
    e.respondWith(caches.open(RUNTIME).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }))));
  }
  // Firebase-Anfragen (Login, Datenbank) laufen unverändert durchs Netz
});

// Push-Nachricht vom Erinnerungs-Dienst (scripts/send-reminders.js) anzeigen
self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data?.text() } }; }
  const d = p.data || {}, n = p.notification || {};
  e.waitUntil(self.registration.showNotification(d.title || n.title || "Daily Begleiter", {
    body: d.body || n.body || "", tag: d.tag || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    data: { url: d.url || "./#gewohnheiten" }
  }));
});

// Klick auf eine Erinnerung öffnet die App beim richtigen Bereich
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
