// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { thirdPartyText } from "./build/licenses.js";
import { writeServiceWorker } from "./build/precache.js";
import { serveTestCatalog } from "./build/test-catalog.js";

// The site's content security policy (decision 0009): everything from this site only, except
// SimBrief, which the browser calls directly. 'wasm-unsafe-eval' lets the WebAssembly module
// compile; it allows no JavaScript eval. GitHub Pages cannot send headers, so it goes in a <meta>
// tag, added to the built pages only, because the dev server injects inline styles.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'self' https://www.simbrief.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ],
  };
}

// After the build, write the service worker with the list of files to precache and a version
// derived from them (decision 0010; see build/precache.js).
function serviceWorker(): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "service-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const { version, files } = writeServiceWorker(root, outDir);
      this.info(`service worker ${version}: ${files.length} files to precache`);
    },
  };
}

// The third-party licenses file the References page opens (References README): made from what the
// app ships, so it is never out of date. Written beside the app, so the service worker precaches it.
function thirdPartyLicenses(): Plugin {
  let root = "";
  return {
    name: "third-party-licenses",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_, bundle) {
      const ids = Object.values(bundle).flatMap((out) =>
        out.type === "chunk" && !out.fileName.startsWith("assets/design-") ? Object.keys(out.modules) : [],
      );
      this.emitFile({
        type: "asset",
        fileName: "third-party-licenses.txt",
        source: thirdPartyText(root, ids),
      });
    },
  };
}

// The dev server's packs: the test catalog (build/test-catalog.js). The built site gets its
// catalog from `just site` instead.
function testCatalog(): Plugin {
  return {
    name: "test-catalog",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/packs", serveTestCatalog(server.config.root));
    },
  };
}

// `base: "./"` keeps paths relative, so the built site works under the Pages project path
// (decision 0010). `just site` builds the WebAssembly module first, and writes the pack catalog
// into packs/ after this build, so no pack is in the app's code or its precache list. Pages: the
// app as the front page, the page at app/ that sends the app's old address there (#246), the
// SimBrief probe page and the drawing gallery. The manifest's `id` is the old address, so a copy
// installed from there is the same app to the browser and moves with the manifest.
export default defineConfig({
  plugins: [svelte(), contentSecurityPolicy(), thirdPartyLicenses(), serviceWorker(), testCatalog()],
  base: "./",
  server: { port: 1420, strictPort: true },
  build: {
    target: "es2022",
    rollupOptions: {
      // Relative to this folder, where the build runs.
      input: {
        index: "index.html",
        app: "app/index.html",
        "simbrief-probe": "simbrief-probe.html",
        design: "design/index.html",
      },
    },
  },
});
