// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Shared by the browser tools (update-test.mjs, screenshots.mjs): a small file server for a built
// site, and headless Firefox driven over WebDriver BiDi. Needs Firefox: FIREFOX=/path/to/firefox,
// else Playwright's Firefox where PLAYWRIGHT_BROWSERS_PATH points (as in the Playwright image CI
// runs the update test in), else `firefox` on the PATH. Not part of `just ci`.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

/** Serves one built site on localhost until closed. */
export function serve(root, port) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/**
 * The Firefox to start: FIREFOX, else the newest Playwright Firefox build under
 * PLAYWRIGHT_BROWSERS_PATH (`firefox-<build>/firefox/firefox`), else `firefox` from the PATH.
 * Playwright's build speaks WebDriver BiDi as the browser's own does.
 */
export function firefoxCommand(env = process.env, exists = fs.existsSync, list = fs.readdirSync) {
  if (env.FIREFOX) return env.FIREFOX;
  const dir = env.PLAYWRIGHT_BROWSERS_PATH;
  // "0" means the browsers live inside node_modules, where Playwright finds them itself.
  if (dir && dir !== "0" && exists(dir)) {
    const builds = list(dir)
      .filter((name) => /^firefox-\d+$/.test(name))
      .sort((x, y) => Number(y.slice(8)) - Number(x.slice(8)));
    for (const build of builds) {
      const file = path.join(dir, build, "firefox", "firefox");
      if (exists(file)) return file;
    }
  }
  return "firefox";
}

/**
 * Starts headless Firefox with a fresh profile, optional preferences and window size (in headless
 * mode, the viewport), and BiDi on `port`. `extra` adds command-line arguments.
 */
export async function startFirefox(profile, port, prefs = {}, size = null, extra = []) {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const lines = Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`);
  fs.writeFileSync(path.join(profile, "user.js"), `${lines.join("\n")}\n`);
  const firefox = spawn(
    firefoxCommand(),
    [
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      `--remote-debugging-port=${port}`,
      ...(size ? ["--width", String(size.width), "--height", String(size.height)] : []),
      ...extra,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let ready = false;
  firefox.stderr.on("data", (data) => {
    if (String(data).includes("WebDriver BiDi listening")) ready = true;
  });
  for (let i = 0; i < 150 && !ready; i++) await sleep(200);
  if (!ready) {
    firefox.kill();
    throw new Error("Firefox did not start WebDriver BiDi");
  }
  return firefox;
}

/**
 * A value as a WebDriver BiDi argument (its "local value" form): text, numbers, booleans, null,
 * lists and plain objects, nested.
 */
export function bidiValue(v) {
  if (v === null) return { type: "null" };
  if (v === undefined) return { type: "undefined" };
  if (typeof v === "string") return { type: "string", value: v };
  if (typeof v === "boolean") return { type: "boolean", value: v };
  if (typeof v === "number") return { type: "number", value: Number.isFinite(v) ? v : String(v) };
  if (Array.isArray(v)) return { type: "array", value: v.map(bidiValue) };
  if (typeof v === "object") return { type: "object", value: Object.entries(v).map(([k, x]) => [k, bidiValue(x)]) };
  throw new Error(`a page argument can't be a ${typeof v}`);
}

/**
 * A minimal WebDriver BiDi session: `send(method, params)`, `js(expression)` for a fixed script,
 * `call(fn, arg)` for a function run in the page with its data as an argument (never spliced into
 * code), `run(step)` for either, `until(...)`, and `logs()` for the page's console messages.
 */
export async function session(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  // A reply settles only a command this session sent and is still waiting on: its id must be one
  // of those (a whole number this session gave out), and what it finds a function. Events and
  // anything else are ignored.
  // Console messages the page logs, once `logs()` has subscribed to them.
  const logged = [];
  ws.onmessage = (message) => {
    const reply = JSON.parse(message.data);
    if (reply?.type === "event" && reply.method === "log.entryAdded") {
      logged.push({ level: String(reply.params?.level), text: String(reply.params?.text) });
      return;
    }
    if (!Number.isSafeInteger(reply?.id) || !pending.has(reply.id)) return;
    const settle = pending.get(reply.id);
    pending.delete(reply.id);
    if (typeof settle === "function") settle(reply);
  };
  // Every command gives up after `ms`, so a stuck page fails the run instead of hanging it.
  const send = (method, params, ms = 30000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no answer in ${ms} ms`));
      }, ms);
      pending.set(id, (reply) => {
        clearTimeout(timer);
        if (reply.type === "error") reject(new Error(`${method}: ${reply.message}`));
        else resolve(reply.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("session.new", { capabilities: {} });
  const context = (await send("browsingContext.getTree", {})).contexts[0].context;
  const js = async (expression) => {
    const r = await send("script.evaluate", { expression, target: { context }, awaitPromise: true, resultOwnership: "none" });
    if (r.type === "exception") throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const call = async (fn, arg) => {
    const r = await send("script.callFunction", {
      functionDeclaration: String(fn),
      arguments: arg === undefined ? [] : [bidiValue(arg)],
      target: { context },
      awaitPromise: true,
      resultOwnership: "none",
    });
    if (r.type === "exception") throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  /** A scene step (scenes.mjs): a fixed script, or `{ fn, arg }`. */
  const run = (step) => (typeof step === "string" ? js(step) : call(step.fn, step.arg));
  const until = async (step, what, ms = 20000) => {
    for (let t = 0; t < ms; t += 250) {
      if (await run(step).catch(() => false)) return;
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  /** Starts collecting the page's console messages; returns the list, which fills as they come. */
  const logs = async () => {
    await send("session.subscribe", { events: ["log.entryAdded"] });
    return logged;
  };
  return { send, js, call, run, until, logs, context };
}
