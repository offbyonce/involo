// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The version-to-version update test (decision 0010), run with `just update-test` after
// `just site`. It drives a real headless Firefox over WebDriver BiDi through seven checks:
//   1. version A: the first visit installs the service worker and caches A;
//   2. offline: with the server stopped, the installed app still loads, in Geist, and a file that
//      isn't saved gets an offline answer, not a network error (#68);
//   3. version B deployed while A is open in two tabs: A keeps running, B waits, the reload offer
//      shows;
//   4. Reload in the first tab: B runs and A's cache is gone;
//   5. the second tab, still on A, moves to B by itself and renders (#68);
//   6. the app's old address (#246): a copy installed from app/ offers the reload when the site
//      moves the app to the front page;
//   7. Reload: it ends on the front page, under the front page's worker, with its saved progress
//      and without the old cache.
// Version B is the built site with a changed page title and its own service worker version. The
// copy at app/ is the built site laid out as before the move: the app's page at app/, with its
// worker at app/sw.js naming its caches as that worker did.
// Needs Firefox (browser.mjs says which it starts). Not part of `just ci`: CI runs it in its own job,
// on the site it built, in the Playwright image, and a failed check fails the run.

import fs from "node:fs";
import path from "node:path";
import { serve as serveOn, session, sleep, startFirefox } from "./browser.mjs";
import { precacheList, writeServiceWorker } from "./precache.js";

const web = path.resolve(import.meta.dirname, "..");
const dist = path.join(web, "dist");
// Under the repo's target folder, not /tmp: a sandboxed Firefox may not reach /tmp.
const work = path.resolve(web, "../../target/update-test");
const PORT = 8771;
const BIDI = 9233;
const serve = (root) => serveOn(root, PORT);

function prepare() {
  if (!fs.existsSync(path.join(dist, "sw.js"))) throw new Error("build the site first: just site");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const a = path.join(work, "A");
  const b = path.join(work, "B");
  fs.cpSync(dist, a, { recursive: true });
  fs.cpSync(dist, b, { recursive: true });
  const page = path.join(b, "index.html");
  fs.writeFileSync(page, fs.readFileSync(page, "utf8").replace("</title>", " B</title>"));
  writeServiceWorker(web, b);
  return { a, b, before: beforeTheMove() };
}

/** The built site laid out as it was before the app moved to the front page (#246): the app's
 * page at app/, the worker at app/sw.js precaching the same files from there, its caches named
 * "involo-<version>", and no worker at the front page. */
function beforeTheMove() {
  const before = path.join(work, "before");
  fs.cpSync(dist, before, { recursive: true });
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  fs.writeFileSync(path.join(before, "app/index.html"), html.replaceAll('="./', '="../'));
  fs.writeFileSync(path.join(before, "index.html"), "<!doctype html><title>Involo</title><p>Coming soon.</p>");
  fs.rmSync(path.join(before, "sw.js"));
  const { files, version } = precacheList(dist);
  const urls = files.map((f) => path.posix.relative("app", f === "index.html" ? "app/index.html" : f));
  const worker = fs
    .readFileSync(path.join(web, "src/sw/sw.js"), "utf8")
    .replace('const PREFIX = "involo-site-";', 'const PREFIX = "involo-";')
    .replace('"__INVOLO_VERSION__"', JSON.stringify(version))
    .replace('["__INVOLO_FILES__"]', JSON.stringify(urls));
  fs.writeFileSync(path.join(before, "app/sw.js"), worker);
  return before;
}

const STATE = `(async () => JSON.stringify({
  title: document.title,
  controlled: !!navigator.serviceWorker.controller,
  caches: (await caches.keys()).sort(),
  waiting: !!(await navigator.serviceWorker.getRegistration())?.waiting,
  offer: !!document.getElementById("update-ready"),
  app: !!document.querySelector("[data-app-ready]"),
}))()`;

/** Opens `url` in a new tab from the page in `opener`, and resolves with the new tab's context. */
async function openTab(send, opener, url) {
  const tabs = async () => (await send("browsingContext.getTree", { maxDepth: 0 })).contexts.map((c) => c.context);
  const before = new Set(await tabs());
  // A page may open a tab only after a click or a key press; userActivation stands in for one.
  await send("script.callFunction", {
    functionDeclaration: "(url) => { window.open(url, '_blank'); }",
    arguments: [{ type: "string", value: url }],
    target: { context: opener },
    awaitPromise: false,
    userActivation: true,
  });
  for (let i = 0; i < 100; i++) {
    const added = (await tabs()).find((c) => !before.has(c));
    if (added) return added;
    await sleep(100);
  }
  throw new Error("the second tab didn't open");
}

async function main() {
  const { a, b, before } = prepare();
  const firefox = await startFirefox(path.join(work, "profile"), BIDI);
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}\n${ok ? "" : `  ${detail}\n`}`);
  };
  let server;
  try {
    const { send, js, until, context } = await session(BIDI);
    const state = async () => JSON.parse(await js(STATE));
    const appShown = `!!document.querySelector("[data-app-ready]")`;

    server = await serve(a);
    await send("browsingContext.navigate", { context, url: `http://localhost:${PORT}/`, wait: "complete" });
    await until("!!navigator.serviceWorker.controller", "the worker to control the page");
    await until(appShown, "the app to render");
    let s = await state();
    const cacheA = s.caches[0];
    check("A: the first visit installs the worker and caches version A", s.controlled && s.app && s.caches.length === 1, JSON.stringify(s));

    await new Promise((resolve) => server.close(resolve));
    server = undefined;
    await send("browsingContext.reload", { context, wait: "complete" });
    await until(appShown, "the app to render offline");
    s = await state();
    const font = await js(`(async () => { await document.fonts.ready; return document.fonts.check("16px Geist"); })()`);
    const unsaved = await js(
      `fetch("./not-saved-here.txt").then((r) => r.status + " " + r.headers.get("content-type"), (e) => "error " + e.message)`,
    );
    check(
      "offline: the installed app loads with no server, in Geist, and a file not saved gets an offline answer",
      s.app && s.caches[0] === cacheA && font && unsaved.startsWith("503 text/plain"),
      JSON.stringify({ ...s, font, unsaved }),
    );

    // A second tab on version A, from the cache: it shares the worker with the first. The first
    // page opens it, as a pilot's link would: in the Playwright image, Firefox never answers
    // browsingContext.create there.
    const second = await openTab(send, context, `http://localhost:${PORT}/`);
    const inSecond = async (expression) => {
      const r = await send("script.evaluate", { expression, target: { context: second }, awaitPromise: true, resultOwnership: "none" });
      if (r.type === "exception") throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    for (let i = 0; i < 100 && !(await inSecond(appShown)); i++) await sleep(100);
    // Each load of the page leaves a mark only that load has, so a reload by itself shows.
    await inSecond(`window.loadedBefore = true; true`);

    server = await serve(b);
    await js("(async () => { await (await navigator.serviceWorker.getRegistration()).update(); return true; })()");
    await until(`!!document.getElementById("update-ready")`, "the reload offer");
    s = await state();
    check(
      "B deployed: A keeps running unchanged, B waits, the reload offer shows",
      !s.title.endsWith(" B") && s.waiting && s.offer && s.caches.length === 2 && s.caches.includes(cacheA),
      JSON.stringify(s),
    );

    await js(`document.querySelector("#update-ready button").click(); true`);
    await sleep(1000);
    await until(`document.title.endsWith(" B")`, "version B to load");
    await until(appShown, "the app to render on version B");
    await until("(async () => (await caches.keys()).length === 1)()", "A's cache to be deleted");
    s = await state();
    check("Reload: B runs and A's cache is gone", s.controlled && !s.offer && s.caches[0] !== cacheA, JSON.stringify(s));

    let moved = false;
    for (let i = 0; i < 100 && !moved; i++) {
      moved = await inSecond(`!window.loadedBefore && document.title.endsWith(" B") && !!document.querySelector("[data-app-ready]")`);
      if (!moved) await sleep(100);
    }
    const secondState = JSON.parse(await inSecond(STATE));
    check(
      "the second tab, still on A, reloads into B by itself and renders",
      moved && secondState.controlled && secondState.app,
      JSON.stringify(secondState),
    );
    await send("browsingContext.close", { context: second });

    // A copy installed from the app's old address, on a fresh start: no worker, no caches.
    await js(`(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      return true;
    })()`);
    server.close();
    server = await serve(before);
    await send("browsingContext.navigate", { context, url: `http://localhost:${PORT}/app/`, wait: "complete" });
    await until("!!navigator.serviceWorker.controller", "the old worker to control the page");
    await until(appShown, "the app to render at app/");
    await js(`localStorage.setItem("update-test.kept", "yes"); true`);
    s = await state();
    const cacheBefore = s.caches[0];
    server.close();
    server = await serve(b);
    await js("(async () => { await (await navigator.serviceWorker.getRegistration()).update(); return true; })()");
    await until(`!!document.getElementById("update-ready")`, "the reload offer at app/");
    s = await state();
    check(
      "the app moved: the copy at app/ keeps running and offers the reload",
      cacheBefore?.startsWith("involo-") && !cacheBefore.startsWith("involo-site-") && s.waiting && s.offer,
      JSON.stringify(s),
    );

    await js(`document.querySelector("#update-ready button").click(); true`);
    await sleep(1500);
    await until(`location.pathname === "/"`, "the front page");
    await until("!!navigator.serviceWorker.controller", "the front page's worker to control it");
    await until(appShown, "the app to render on the front page");
    s = await state();
    const kept = await js(`localStorage.getItem("update-test.kept")`);
    const scope = await js(`(async () => (await navigator.serviceWorker.getRegistration()).scope)()`);
    check(
      "Reload: the front page, its worker, the progress kept and the old cache gone",
      kept === "yes" && scope === `http://localhost:${PORT}/` && !s.caches.includes(cacheBefore) && s.caches.every((k) => k.startsWith("involo-site-")),
      JSON.stringify({ ...s, kept, scope }),
    );
  } catch (e) {
    check("the test ran to the end", false, e.message);
  } finally {
    server?.close();
    firefox.kill();
  }
  const failed = results.filter((ok) => !ok).length;
  process.stdout.write(`update test: ${results.length - failed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
}

await main();
