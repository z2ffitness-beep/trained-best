// Service worker: lets the app OPEN with no signal.
//
// The offline log queue already covered "you lost signal mid-session" - the
// page was loaded, so logging kept working and flushed later. It could do
// nothing about "you arrived at a gym with no bars and tapped the icon", which
// is the common case in a basement weight room: with no cached shell the phone
// has nothing to render and the athlete gets Safari's error page.
//
// Deliberately conservative, because a bad service worker is worse than none -
// it can pin a stale build on every phone with no way to push a fix:
//   * navigations are NETWORK-FIRST, so an online athlete always gets the
//     newest index.html and therefore the newest hashed asset names. The cache
//     is only consulted when the network actually fails.
//   * /api/ is never touched. Those are authenticated, money-spending, no-store
//     requests, and a cached AI response would be wrong in every case.
//   * cross-origin (Supabase, Google Fonts) is left alone entirely.
//   * Vite fingerprints /assets/ filenames, so those are immutable and safe to
//     serve cache-first forever; a new build simply asks for new names.
//
// Bump VERSION to force every client to drop its caches on next load.
const VERSION = "v1";
const SHELL = `tb-shell-${VERSION}`;
const ASSETS = `tb-assets-${VERSION}`;
const KEEP = new Set([SHELL, ASSETS]);

// addAll() rejects the whole install if any single request 404s, which would
// leave the app with no service worker at all. Fetch them independently.
const PRECACHE = ["/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

// The install MUST pull the JS and CSS itself, and cannot rely on catching
// them as the page requests them. On a first visit the page has already asked
// for its bundle before this worker exists, so those fetches never pass
// through here - the app then appeared to work offline purely because the
// browser's own HTTP cache still had the bundle, which is evicted whenever
// the phone feels like it. Vite fingerprints the filenames, so the only
// reliable way to learn them is to read them out of index.html.
async function precacheBuild(shellCache) {
  const res = await fetch("/", { cache: "reload" });
  if (!res.ok) return;
  await shellCache.put("/", res.clone());

  const html = await res.text();
  const urls = [...new Set([...html.matchAll(/["'(](\/assets\/[^"')\s]+)/g)].map(m => m[1]))];
  if (!urls.length) return;

  const assets = await caches.open(ASSETS);
  await Promise.allSettled(urls.map(async (url) => {
    const r = await fetch(url, { cache: "reload" });
    if (r.ok) await assets.put(url, r);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.allSettled([
      precacheBuild(cache),
      ...PRECACHE.map(async (url) => {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      }),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => (n.startsWith("tb-") && !KEEP.has(n)) ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

// Let the page tell a waiting worker to take over immediately.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // Supabase, fonts, etc.
  if (url.pathname.startsWith("/api/")) return;      // never cache the AI proxy

  // HTML navigations: network first, cached shell only as a fallback.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(SHELL);
          cache.put("/", fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match("/", { cacheName: SHELL });
        return cached || Response.error();
      }
    })());
    return;
  }

  // Fingerprinted build output: immutable, so cache-first is safe and fast.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { cacheName: ASSETS });
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(ASSETS);
        cache.put(req, res.clone());
      }
      return res;
    })());
    return;
  }

  // Icons, manifest, favicon: serve what we have, refresh it in the background.
  event.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: SHELL });
    const network = fetch(req).then(async (res) => {
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(SHELL);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
