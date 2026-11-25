/* Ember Crypt service worker (v0.8.1).
   - The page (index.html) is network-first with a timeout, so a new version shows up on the next open.
   - Hashed build files (assets/) live in their own cache that survives SW updates, and the files a
     page needs are cached at install, before the new worker takes over. A cached page can never
     point at a bundle that was thrown away (the cause of a black screen after an update offline). */
const SHELL = "ember-crypt-shell-v13";
const ASSETS = "ember-crypt-assets";
const KEEP = [SHELL, ASSETS];
const scopeUrl = (p) => new URL(p, self.registration.scope).href;

/** The asset URLs an index.html references. */
function assetsIn(html) {
  const out = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = new URL(m[1], self.registration.scope);
    if (u.origin === self.location.origin && /\/assets\//.test(u.pathname)) out.add(u.href);
  }
  return [...out];
}

/** Rebuild a response so Safari accepts it for a navigation (no "redirected" flag). */
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      const assets = await caches.open(ASSETS);
      const res = await fetch(scopeUrl("./"), { cache: "no-store" });
      if (!res.ok) throw new Error("index " + res.status);
      const html = await res.clone().text();
      // everything the new page needs is cached before this worker takes over (else install fails and the old one stays)
      await assets.addAll(assetsIn(html));
      const page = await clean(res);
      await shell.put(scopeUrl("./"), page.clone());
      await shell.put(scopeUrl("./index.html"), page);
      await shell.add(scopeUrl("./manifest.webmanifest")).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
}

async function page(req) {
  const shell = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req.url, { cache: "no-store", credentials: "same-origin" }), timeout(6000)]);
    if (res && res.ok) {
      const html = await res.clone().text();
      const want = assetsIn(html);
      // fetch the new page's files into the cache now (best effort), then drop files no page uses
      const assets = await caches.open(ASSETS);
      Promise.all(want.map((u) => assets.match(u).then((hit) => hit || assets.add(u)))).then(async () => {
        for (const r of await assets.keys()) if (!want.includes(r.url) && /\.(js|css)$/.test(new URL(r.url).pathname)) await assets.delete(r);
      }).catch(() => {});
      const c = await clean(res);
      await shell.put(scopeUrl("./"), c.clone());
      await shell.put(scopeUrl("./index.html"), c.clone());
      return c;
    }
    if (res) return clean(res);
    throw new Error("no response");
  } catch {
    return (await shell.match(scopeUrl("./"))) || (await shell.match(scopeUrl("./index.html"))) || Response.error();
  }
}

async function asset(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit; // hashed names never change content
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function other(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  const isPage = req.mode === "navigate" || req.destination === "document" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  if (isPage) event.respondWith(page(req));
  else if (url.pathname.includes("/assets/")) event.respondWith(asset(req));
  else event.respondWith(other(req));
});
