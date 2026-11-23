// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Written to app/sw.js (#246). The app moved from app/ to the site's front page, and a copy
// installed from app/ checks app/sw.js for updates. This worker is that update: like any new
// version it waits until the pilot presses Reload (the page sends "reload-to-update"), or every
// window of the old version is closed. Then it deletes the old version's caches, unregisters
// itself and reloads its windows, which app/index.html sends to the front page. The front page's
// own worker takes over from there; saved progress is untouched, being the same site.

// The old worker named its caches "involo-<version>"; the front page's are "involo-site-<version>".
const OLD = (key) => key.startsWith("involo-") && !key.startsWith("involo-site-");

self.addEventListener("message", (event) => {
  if (event.data?.type === "reload-to-update") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (OLD(key)) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
