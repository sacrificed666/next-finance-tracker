// The installed app's service worker. It keeps the build's static files (scripts,
// styles, fonts, icons) so launches are quick, and shows a short offline note when
// the network is gone. It never stores pages or API responses: those carry
// personal data, and the app only works against the live database anyway.

const CACHE = "finances-static-v1";
const MAX_ENTRIES = 250;

const OFFLINE_TEXT = {
  uk: ["Немає з’єднання", "Фінанси потребують інтернету, щоб показати ваші дані. Спробуйте ще раз, коли зв’язок повернеться.", "Спробувати ще раз"],
  en: ["You’re offline", "Finances needs a connection to show your data. Try again once you’re back online.", "Try again"],
};

function offlinePage() {
  const lang = (self.navigator.language || "en").slice(0, 2) === "uk" ? "uk" : "en";
  const [title, body, retry] = OFFLINE_TEXT[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{margin:0;min-height:100svh;display:grid;place-items:center;background:#0f1112;color:#e8ecea;font:15px/1.5 Montserrat,system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:360px;text-align:center}h1{font-size:20px;margin:16px 0 8px}p{color:#9aa4a0;margin:0 0 20px}
.mark{width:56px;height:56px;border-radius:16px;margin:auto;background:linear-gradient(135deg,#03f0a6,#01a542);display:grid;place-items:center;color:#07130c;font-weight:700;font-size:34px}
button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:10px 20px;background:linear-gradient(135deg,#03f0a6,#01a542);color:#07130c;cursor:pointer}
</style></head><body><main><div class="mark">&#8372;</div><h1>${title}</h1><p>${body}</p>
<button onclick="location.reload()">${retry}</button></main></body></html>`;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map((key) => cache.delete(key)));
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build files carry a content hash in their name, so a stored copy is never stale.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(fromCacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => new Response(offlinePage(), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Finances", {
      body: message.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: message.tag,
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (!open) return self.clients.openWindow(url);
      return open.focus().then((client) => (client.url === url ? client : client.navigate(url)));
    }),
  );
});
