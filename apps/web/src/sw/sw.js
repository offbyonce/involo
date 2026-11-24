// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The service worker (decision 0010). This is a template: the build (apps/web/build/precache.js)
// fills in VERSION, derived from the built files, and FILES, the list to precache, and writes it
// to sw.js, so its scope is the whole site. Each version gets its own cache, so a deploy never
// mixes old and new files.
//
// Never swap mid-session: a new version installs in the background and then waits. It takes over
// only when the pilot presses Reload (the page sends "reload-to-update"), or on the next launch
// once every window of the old version is closed.

const VERSION = "__INVOLO_VERSION__";
const FILES = ["__INVOLO_FILES__"];
// "involo-site-" since the app moved to the front page (#246): the worker that was at app/ named
// its caches "involo-<version>", and app/sw.js, which retires it, deletes those.
const PREFIX = "involo-site-";
const OLD_PREFIX = "chocktochock-";
const CACHE = PREFIX + VERSION;

self.addEventListener("install", (event) => {
  // `cache: "reload"` skips the browser's HTTP cache, so a new version never stores old files.
  const requests = FILES.map((file) => new Request(new URL(file, self.location), { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        // Also the caches from before the rename (decision 0025), which held the same files.
        if ((key.startsWith(PREFIX) && key !== CACHE) || key.startsWith(OLD_PREFIX)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "reload-to-update") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only this site's files; SimBrief requests go straight to the network.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const navigate = request.mode === "navigate";
      const scope = self.registration.scope;
      const page = navigate ? new URL(request.url).pathname : "";
      const root = new URL(scope).pathname;
      // The app's old address (#246) goes to the app here, offline too.
      if (page === `${root}app/` || page === `${root}app/index.html`) return Response.redirect(scope, 302);
      // Only the app's own address falls back to the app: the design pages, the probe page and
      // the catalog are other pages of this site.
      const app = page === root || page === `${root}index.html`;
      const hit =
        (await cache.match(request, { ignoreSearch: navigate })) ??
        (app ? await cache.match(new URL("index.html", self.location)) : undefined);
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch {
        // Neither saved here nor reachable (offline): an answer, not a network error (#68).
        return offline();
      }
    })(),
  );
});

/** What a request gets offline when the file isn't saved here. */
function offline() {
  return new Response("Involo is offline, and this file isn't saved on this device.", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
