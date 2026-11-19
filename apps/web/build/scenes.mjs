// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The app states the review shots and the end-to-end tests set up, shared so both start from the
// same flights, packs and plans. Each scene is a script (or a list of them) run in the app's page:
// an expression that returns true, or a promise of true once the page has settled.

import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
export const click = (selector, n = 0) => `document.querySelectorAll(${JSON.stringify(selector)})[${n}].click(); true`;
/** Practice (boards): plays tests until the screen is in a board's state. "light": a light
 * meaning answered wrong with feedback after each; "order": a step order question with its second
 * step picked up; "results": a custom test without memory items, every question answered;
 * "earlier": the Lights test finished, back home with "Earlier this visit"; "engine": the Before
 * engine start test's first choice question, answered (option C). */
export const practice = (goal) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); const one = (s) => document.querySelector(s); const all = (s) => [...document.querySelectorAll(s)]; const btn = (t) => all("button").find((b) => b.textContent.trim().startsWith(t)); const goal = ${JSON.stringify(goal)};
  if (goal === "engine") { all("button.ready")[2].click(); await wait(300); for (let n = 0; n < 20 && one("ol.order"); n++) { btn("Check order").click(); await wait(120); btn("Next question").click(); await wait(150); } all(".opt")[2]?.click(); await wait(200); return true; }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (btn("New test")) { btn("New test").click(); await wait(250); }
    if (goal === "earlier" || goal === "pair") { all("button.ready")[1].click(); await wait(300); }
    else if (btn("Start test")) { if (goal === "results") { const m = all("button.chip").find((b) => b.textContent.startsWith("Memory items")); if (m && m.getAttribute("aria-pressed") === "true") { m.click(); await wait(150); } } btn("Start test").click(); await wait(300); }
    for (let n = 0; n < 45; n++) {
      if (!one(".tag")) break;
      const tag = one(".tag").textContent; const h = one(".question h2").textContent;
      if (goal === "order" && one("ol.order") && !one("ol.checked")) { const li = all("ol.order li")[1]; li.focus(); li.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); await wait(250); return true; }
      if (one("ol.order")) { btn("Check order")?.click(); await wait(120); }
      else if (goal === "pair" && h.startsWith("What does this light mean") && (one(".light figcaption")?.textContent ?? "").split("·").length === 3) { all(".opt")[2].click(); await wait(200); if (one(".opt.wrong")) return true; }
      else if (goal === "light" && tag === "Light meanings" && h.startsWith("What does this light mean")) { all(".opt")[2].click(); await wait(200); if (one(".opt.wrong")) return true; }
      else { all(".opt")[n % 5 === 0 ? 1 : 0]?.click(); await wait(100); }
      (btn("Next question") || btn("See results"))?.click(); await wait(150);
      if (one(".results")) { if (goal === "results") return true; if (goal === "earlier") { btn("New test").click(); await wait(300); return true; } break; }
    }
    if (one(".results") && goal === "results") return true;
    btn("End test")?.click(); await wait(250);
  }
  return true; })()`;
/** Clicks `part` (".row" or ".chev") of the list step whose text contains `title`. */
export const stepNamed = (title, part) =>
  `[...document.querySelectorAll(".it")].find((it) => it.textContent.trim().toUpperCase().includes(${JSON.stringify(title)})).querySelector(${JSON.stringify(part)}).click(); true`;
/** Clicks `part` of the list step whose name is exactly `name`. */
export const stepExact = (name, part) =>
  `[...document.querySelectorAll(".it")].find((it) => (it.querySelector(".nm")?.textContent ?? "").trim().toUpperCase() === ${JSON.stringify(name)}).querySelector(${JSON.stringify(part)}).click(); true`;
/** Scrolls the side pane `pane` so its controls drawing starts at the top. */
export const paneToControls = (pane) =>
  `(() => { const p = document.querySelector(${JSON.stringify(pane)}); const h = [...p.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim().toUpperCase().startsWith("THE CONTROLS")); p.scrollTop += h.getBoundingClientRect().top - p.getBoundingClientRect().top; })(); true`;
/** Types `value` into the input `selector`, as the pilot would. */
export const typeInto = (selector, value) =>
  `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })(); true`;
/** The same takeoff data typed into Flight setup, with each app's field ids. */
export const TAKEOFF = [
  ["runway", "rwy", "16L"],
  ["takeoff_flaps", "toflaps", "5"],
  ["v2", "v2", "152"],
  ["takeoff_trim", "trim", "5.25"],
];
/** The same arrival data typed into the Arrival data box, with each app's field ids. */
export const ARRIVAL = [
  ["landing_altitude", "landalt", "13"],
  ["vref", "vref", "142"],
  ["autobrake", "ab", "2"],
  ["minimums", "mins", "213"],
];
/** The same clearance typed into Flight setup, with each app's field ids. */
export const CLEARANCE = [
  ["runway", "rwy", "16L"],
  ["sid", "sid", "SUMMA2"],
  ["transition", "trans", "SUMMA"],
  ["initial_altitude", "alt", "5000"],
  ["squawk", "sq", "4521"],
];
/** Where each field lives in the Flight pages, for typing the same data as 3.0. */
export const SECTION_OF = {
  runway: "clearance",
  sid: "clearance",
  transition: "clearance",
  initial_altitude: "clearance",
  squawk: "clearance",
  takeoff_flaps: "takeoff",
  v2: "takeoff",
  takeoff_trim: "takeoff",
  landing_altitude: "approach",
  vref: "approach",
  autobrake: "approach",
  minimums: "approach",
};
/** Our side: the values typed in their Flight sections. */
export const inFlight = (list) => typed(list.map(([ours, , v]) => [SECTION_OF[ours], ours, v]));
export const pressText = (text) =>
  `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)}).click(); true`;
export const go = (hash) => `location.hash = ${JSON.stringify(hash)}; true`;

/**
 * The screens to capture: a name, and for each app the address after `#` and an optional script
 * to run first. `base` is the matching 3.0 screen.
 */
/** Skips the list step `title`: opens it if it is closed, then presses Skip for now. */
export const skipStep = (title) =>
  `(() => { const it = [...document.querySelectorAll(".it")].find((i) => i.textContent.toUpperCase().includes(${JSON.stringify(title)})); const skip = () => [...it.querySelectorAll("button")].find((b) => b.textContent.includes("Skip for now")); if (!skip()) it.querySelector(".chev").click(); return new Promise((go) => setTimeout(() => { skip().click(); go(true); }, 300)); })()`;
/**
 * The Flight pages in the boards' state: the invented KSEA to KSFO OFP dropped on SimBrief
 * and OFP file, as a pilot would, then the values the boards show typed in. The import's Undo toast
 * is left to time out (10 s) so it is not in the shot.
 */
export const OFP = fs.readFileSync(path.join(import.meta.dirname, "fixtures/board-ofp.json"), "utf8");
export const dropOfp = `(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(OFP)}], "ofp.json", { type: "application/json" })); document.querySelector(".drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return new Promise((go) => setTimeout(() => go(true), 1200)); })()`;
export const typed = (pairs) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); for (const [section, field, value] of ${JSON.stringify(pairs)}) { if (!location.hash.startsWith("#/flight/" + section)) { location.hash = "#/flight/" + section; await wait(400); } const el = document.querySelector('[data-field="' + field + '"]'); if (!el) continue; if (el.tagName === "BUTTON") { el.click(); await wait(100); [...document.querySelectorAll('[role="option"] button')].find((b) => b.textContent.trim() === value)?.click(); } else { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); } await wait(120); } return true; })()`;
export const BOARD_FLIGHT = [
  go("#/flight/simbrief"),
  dropOfp,
  typed([
    ["clearance", "initial_altitude", "5000"],
    ["clearance", "squawk", "4521"],
    ["clearance", "ground_frequency", "121.700"],
    ["clearance", "tower_frequency", "119.900"],
    ["takeoff", "heading", "163"],
    ["takeoff", "takeoff_flaps", "5"],
    ["takeoff", "thrust_rating", "TO-1"],
    ["takeoff", "assumed_temperature", "45"],
    ["takeoff", "v1", "142"],
    ["takeoff", "vr", "144"],
    ["approach", "landing_flaps", "30"],
    ["approach", "autobrake", "2"],
    ["fuel", "cg", "24.0"],
  ]),
  `(() => { location.hash = "#/flight/clearance"; return new Promise((go) => setTimeout(() => { const el = document.querySelector('[data-row="notes"] input'); el.value = "Expect FL370 ten minutes after departure"; el.dispatchEvent(new Event("change", { bubbles: true })); go(true); }, 400)); })()`,
  "new Promise((go) => setTimeout(() => go(true), 10500))",
];

/** Ticks every step of phase `id`, its checklist too once it unfolds, then goes to phase `then`. */
export const finishPhase = (id, then) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); location.hash = "#/phase/${id}"; await wait(500); for (let i = 0; i < 200; i++) { const b = [...document.querySelectorAll(".it .tick")].find((t) => t.getAttribute("aria-pressed") !== "true"); if (!b) break; b.click(); await wait(80); } location.hash = "#/phase/${then}"; await wait(500); return true; })()`;
/** Ticks every step of phase `id` but its last (its checklist's, once the procedure is done and it
 * opens), then skips that one (S): the phase done, one step open. */
export const finishSkippingLast = (id) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); location.hash = "#/phase/${id}"; await wait(500); for (let i = 0; i < 200; i++) { const left = [...document.querySelectorAll(".it button.tick")].filter((t) => t.getAttribute("aria-pressed") !== "true"); if (left.length === 1 && document.body.textContent.includes("opens when the procedure is done")) { left[0].click(); await wait(500); continue; } if (left.length <= 1) break; left[0].click(); await wait(80); } window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true })); await wait(300); return true; })()`;
/** Goes to a phase (or emergency reference list) and opens step `id` there, its folded list first. */
export const openStep = (kind, phase, id) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); location.hash = ${JSON.stringify(kind === "reference" ? "#/reference/" : "#/phase/")} + ${JSON.stringify(phase)}; await wait(700); for (const b of document.querySelectorAll("button.card.folded")) b.click(); await wait(300); const row = document.querySelector('[data-step="' + ${JSON.stringify(id)} + '"] button.row'); if (!row) { const b = document.createElement("div"); b.textContent = "Not on screen for this flight: " + ${JSON.stringify(id)}; b.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:99;background:#b00;color:#fff;font:16px sans-serif;padding:8px"); document.body.append(b); return true; } row.click(); await wait(400); return true; })()`;
/** Picks the option choice labeled `label` on the phase page that asks it. */
export const pickChoice = (phase, label) =>
  `(async () => { const wait = (ms) => new Promise((go) => setTimeout(go, ms)); location.hash = "#/phase/" + ${JSON.stringify(phase)}; await wait(700); [...document.querySelectorAll('[role="radiogroup"] button, .cards button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click(); await wait(300); return true; })()`;
export const rowMenu = (name) =>
  `[...document.querySelectorAll(".it")].find((it) => it.querySelector(".nm")?.textContent.trim() === ${JSON.stringify(name)}).querySelector("button.more").click(); true`;
/**
 * The approved boards' state for Before start: Landing gear pins to Door lights done, TERR skipped,
 * so the fuel pump switches are the current step (the boards' center tank step comes before them).
 */
export const BOARD_STATE = [
  finishPhase("apu-power", "before-start"),
  stepNamed("LANDING GEAR PINS", ".tick"),
  stepNamed("N1 BUGS", ".tick"),
  stepNamed("MCP", ".tick"),
  stepNamed("DOOR LIGHTS", ".tick"),
  skipStep("TERR (EFIS"),
  // Center tank fuel, as the Checklist boards answer it (1,000 lb or less: center pumps OFF), when
  // the pack asks it.
  `[...document.querySelectorAll("button.choice")].find((b) => b.textContent.includes("1,000 lb (450 kg) or less"))?.click(); true`,
];
/** Opens the list step `title` and its narrow-screen details (its chevron first if it is closed). */
/** Show map on the pane's location line (where the drawing took the map figure's room). */
export const showMap = `[...document.querySelectorAll("aside.pane .line button")].find((b) => b.textContent.trim() === "Show map")?.click(); true`;
/** Taps an element as a pointer does (detail 1): an SVG control's tap target, or a button whose focus
 * differs for the keyboard (element.click() reports detail 0, which the app reads as a keyboard press). */
export const tap = (selector) =>
  `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true })); true`;
/** Opens the checklists still folded until their procedure is done. */
export const unfold = `[...document.querySelectorAll("button.folded")].forEach((b) => b.click()); true`;
/** Presses a key on the page, as the pilot would. */
/** A panel control's hit target by its label, whether or not the step uses it (", in this step"). */
export const hitOf = (label, within) =>
  [`${label}: what it is`, `${label}, in this step: what it is`].map((l) => `${within} .hit[aria-label="${l}"]`).join(", ");
/** Picks a panel control by its label, as a pointer tap (an SVG element has no click()). */
export const pick = (label, within = ".deck-panel") =>
  `document.querySelector(${JSON.stringify(hitOf(label, within))}).dispatchEvent(new MouseEvent("click", { bubbles: true })); true`;
/** Picks a panel control from the keyboard (focused, then Enter), so its focus ring shows. */
export const pickByKey = (label) => [
  { keys: ["\uE008"] },
  `document.querySelector(${JSON.stringify(hitOf(label, ".deck-panel"))}).focus(); true`,
  { keys: ["\uE007"] },
];
export const press = (key) => `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); true`;
/** The Step by step view button in the top bar. */
export const toFlow = `[...document.querySelectorAll("header.top .seg button")].find((b) => b.textContent.trim() === "Step by step").click(); true`;

/** The tour's welcome opens on a first visit (each shot starts from nothing saved): it is closed
 * before every step, so the steps reach the page. */
export const closeWelcome = `sessionStorage.getItem("tour-shot") || document.querySelector('[role="dialog"][aria-label="Welcome to Involo"] button.secondary')?.click(); true`;
/** Opens the welcome again over the current state, as on a first visit: marks it unseen, reloads. */
export const reopenWelcome = [
  `(() => { sessionStorage.setItem("tour-shot", "1"); const k = Object.keys(localStorage).find((x) => /settings$/.test(x)); const s = JSON.parse(localStorage.getItem(k)); s.tourSeen = false; localStorage.setItem(k, JSON.stringify(s)); setTimeout(() => location.reload(), 50); return true; })()`,
  `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-label="Welcome to Involo"]') || ++n > 80) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`,
];
/** Take the tour from the menu, then → `n` times. */
export const takeTour = (n = 0) => [
  `document.querySelector("header.top .menu").click(); true`,
  `[...document.querySelectorAll("#drawer button")].find((b) => b.textContent.trim() === "Take the tour").click(); true`,
  `new Promise((done) => setTimeout(() => { for (let i = 0; i < ${n}; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); setTimeout(() => done(true), 600); }, 400))`,
];
/**
 * The Log boards' stand-in log (LogDesk, LogPhone): three earlier flights and three practice
 * results, written to the app's IndexedDB as a logged log would be, then the page reloads to read
 * it. Times are the boards', in the browser's time zone.
 */
export const seedLog = (() => {
  const P = "ifly-737-max8";
  const flight = (id, at, from, to, minutes, done, finished, skipped) => `(() => {
    const off = ${at}; const mins = ${JSON.stringify(minutes)}; let t = off; const stages = [];
    const names = ["Preflight", "Departure", "Enroute", "Arrival", "Post-flight"];
    mins.forEach((m, i) => { stages.push({ title: names[i], ms: m * 60000 }); t += m * 60000; });
    return { id: "${P}@" + ${id}, loggedAt: t + 60000, pack: "${P}", packVersion: "0.1.0", aircraft: "iFly 737 MAX 8",
      origin: "${from}", destination: "${to}", offBlocks: off, onBlocks: t, stages, done: ${done}, total: 366,
      skipped: ${JSON.stringify(skipped)}, plan: "simbrief", finished: ${finished},
      ticks: [{ at: off, step: "${P}.before-start.door-lights", text: "DOOR LIGHTS", value: "ALL OUT" }, { at: t, step: "${P}.secure.parking-brake", text: "PARKING BRAKE", value: "SET" }] };
  })()`;
  const terr = { step: `${P}.before-start.terr-efis-control-panel`, text: "TERR (EFIS CONTROL PANEL)", value: "ON", stage: "Departure", phase: "before-start", phaseTitle: "Before start" };
  const oxy = { step: `${P}.preflight.crew-oxygen`, text: "CREW OXYGEN", value: "VERIFY", stage: "Preflight", phase: "preflight", phaseTitle: "Preflight" };
  const day = (d, h, m) => `new Date(2026, 10, ${d}, ${h}, ${m}).getTime()`;
  const result = (d, h, title, score, total) => `{ id: "${P}@" + ${day(d, h, 0)}, at: ${day(d, h, 0)}, pack: "${P}", title: ${JSON.stringify(title)}, score: ${score}, total: ${total} }`;
  const log = `{ format: 1, flights: [
    ${flight(1, day(15, 14, 10), "KSFO", "KSEA", [30, 35, 40, 15, 5], 366, true, [])},
    ${flight(2, day(14, 9, 48), "KSEA", "KSFO", [38, 41, 52, 24, 6], 359, true, [terr, oxy])},
    ${flight(3, day(12, 7, 30), "KPDX", "KSEA", [20, 28], 118, false, [oxy])}],
    practice: [${result(15, 18, "Lights of the flight deck", 17, 20)}, ${result(15, 17, "Custom test · 5 topics", 16, 20)}, ${result(13, 12, "Memory items", 9, 10)}] }`;
  return [
    // At the version the app left the database (it installs its pack there first), not one of
    // our own: an older version would never open.
    `new Promise((done) => { const r = indexedDB.open("involo"); r.onupgradeneeded = () => r.result.createObjectStore("log");
      r.onsuccess = () => { const db = r.result; const tx = db.transaction("log", "readwrite"); tx.objectStore("log").put(JSON.stringify(${log}), "log");
        tx.oncomplete = () => { db.close(); window.seeding = true; setTimeout(() => location.reload(), 50); done(true); }; }; })`,
    // Until the reloaded page (which has no "seeding" mark) is ready.
    `new Promise((done) => { let n = 0; const t = setInterval(() => { if ((!window.seeding && document.querySelector("[data-app-ready]")) || ++n > 100) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`,
  ];
})();
/** The id of the stand-in flight the LogDesk board opens (Sat 14 Nov). */
export const LOG_OPEN = "ifly-737-max8@2";

export const TOUR_STATE = [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE];

/** Chooses a file in the file input `selector`: `text`, or "big" for one just over 64 MB. */
export const chooseFile = (selector, text, name) =>
  `(() => { const input = document.querySelector(${JSON.stringify(selector)}); const body = ${JSON.stringify(text)} === "big" ? new Uint8Array(64 * 1024 * 1024 + 1) : ${JSON.stringify(text)}; const dt = new DataTransfer(); dt.items.add(new File([body], ${JSON.stringify(name)}, { type: "application/json" })); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
/** A logged flight dated past the year 9999, which a merge leaves out. */
export const IMPOSSIBLE = {
  id: "ifly-737-max8@999999999999999",
  loggedAt: 999999999999999,
  pack: "ifly-737-max8",
  packVersion: "0.1.0",
  aircraft: "iFly 737 MAX 8",
  origin: "KSEA",
  destination: "KSFO",
  offBlocks: null,
  onBlocks: null,
  stages: [],
  done: 0,
  total: 0,
  skipped: [],
  plan: "manual",
  finished: false,
  ticks: [],
};
/** Imports from SimBrief with the request answered as `how`: a 503 reply, no answer, or a
 * failure that is neither the network nor SimBrief. */
export const simbrief = (how) => [
  `(() => { const real = window.fetch; window.fetch = (url, init) => { if (!String(url).includes("simbrief")) return real(url, init); if (${JSON.stringify(how)} === "reply503") return Promise.resolve(new Response("<html>Service unavailable</html>", { status: 503 })); if (${JSON.stringify(how)} === "hang") return new Promise((_, fail) => init.signal.addEventListener("abort", () => fail(new DOMException("aborted", "AbortError")))); return Promise.reject(new Error("unexpected")); }; return true; })()`,
  typeInto("form.row input", "Pilot"),
  pressText("Import latest flight"),
];
/** Makes every save to this device's storage fail as a full storage does. */
export const refuseSaves = `(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.startsWith("involo.")) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); }; return true; })()`;
/** Saves `what` ("flight" or "plan") in a format from a newer version, then reloads. */
export const savedAs = (what) => [
  `(() => { localStorage.setItem("involo.${what}.ifly-737-max8", '{"format":99}'); setTimeout(() => location.reload(), 50); return true; })()`,
  "new Promise((done) => { const t = setInterval(() => { if (document.querySelector('[data-app-ready]') && document.querySelector('.kept')) { clearInterval(t); done(true); } }, 100); })",
];
/** The example pack's built file (`just test-packs`), added from a file on the Packs page. */
export const examplePack = (() => {
  const dir = path.resolve(web, "../../target/test-packs");
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const e = index.find((x) => x.id === "example-trainer");
  return fs.readFileSync(path.join(dir, `${e.id}-${e.version}.involo-pack`), "utf8");
})();
/** Until the app has started again on a pack (after an install, a switch or a reload). */
export const restarted = `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector("#drawer") || ++n > 150) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`;
/** Adds the example pack from a file on the Packs page; installing opens it. */
export const addExample = [go("#/packs"), `new Promise((d) => setTimeout(() => d(true), 300))`, chooseFile('input[type="file"]', examplePack, "example-trainer.involo-pack"), restarted];
/** Makes the installed iFly pack an older version, so the catalog's is an update (PacksDesktop's band). */
export const olderIfly = [
  `new Promise((done) => { const r = indexedDB.open("involo"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("packs", "readwrite"); const store = tx.objectStore("packs"); const g = store.get("ifly-737-max8"); g.onsuccess = () => { const rec = g.result; rec.summary.version = "0.0.9"; store.put(rec, "ifly-737-max8"); }; tx.oncomplete = () => { db.close(); location.reload(); done(true); }; }; })`,
  restarted,
];
/** No pack on this device: the first launch (PacksFirst). */
export const noPacks = [
  `new Promise((done) => { const r = indexedDB.open("involo"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("packs", "readwrite"); tx.objectStore("packs").clear(); tx.oncomplete = () => { db.close(); location.reload(); done(true); }; }; })`,
  `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector(".packs.first [data-app-ready], .packs.first") || ++n > 150) { clearInterval(t); setTimeout(() => done(true), 600); } }, 100); })`,
];

/**
 * Makes the installed iFly pack an older version that differs from the catalog's (PacksUpdate):
 * the first list has an extra step, "Window heat test", its second step's value reads "SET", and
 * its third step is missing. The catalog's version then adds one step, rewords one and removes one.
 */
export const olderIflyWithChanges = [
  `new Promise((done) => { const r = indexedDB.open("involo"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("packs", "readwrite"); const store = tx.objectStore("packs"); const g = store.get("ifly-737-max8"); g.onsuccess = () => { const rec = g.result; const p = JSON.parse(rec.text); const steps = p.lists[0].steps; const extra = { ...steps[0], id: "ifly-737-max8.preflight.window-heat-test", text: "Window heat test", expect: "PASSED" }; delete extra.targets; delete extra.controls; steps[1].expect = "SET"; steps.splice(2, 1); steps.splice(1, 0, extra); p.manifest.version = "0.0.9"; rec.text = JSON.stringify(p); rec.summary.version = "0.0.9"; store.put(rec, "ifly-737-max8"); }; tx.oncomplete = () => { db.close(); location.hash = ""; location.reload(); done(true); }; }; })`,
  restarted,
  stepNamed("WINDOW HEAT TEST", ".tick"),
  go("#/packs"),
  `new Promise((d) => setTimeout(d, 600, true))`,
];
/** Opens What's new for the waiting update. */
/** The board OFP as a plan for another aircraft (PacksSimbrief's stand-in, an A320neo), chosen on
 * SimBrief and OFP file; then the warning, Use this plan anyway?, is open. */
const otherAircraftOfp = (() => {
  const ofp = JSON.parse(OFP);
  ofp.aircraft = { ...ofp.aircraft, icaocode: "A20N", name: "Airbus A320neo" };
  return JSON.stringify(ofp);
})();
export const importOtherAircraft = [
  go("#/flight/simbrief"),
  `new Promise((d) => setTimeout(d, 400, true))`,
  chooseFile('.choose ~ input[type="file"]', otherAircraftOfp, "ofp.json"),
  `new Promise((d) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-labelledby="other-title"]') || ++n > 100) { clearInterval(t); setTimeout(d, 300, true); } }, 100); })`,
];
/** Marks the installed iFly pack as added from a file, then reloads. */
export const iflyFromFile = [
  `new Promise((done) => { const r = indexedDB.open("involo"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("packs", "readwrite"); const store = tx.objectStore("packs"); const g = store.get("ifly-737-max8"); g.onsuccess = () => { const rec = g.result; rec.source = "file"; store.put(rec, "ifly-737-max8"); }; tx.oncomplete = () => { db.close(); location.reload(); done(true); }; }; })`,
  restarted,
];
export const openWhatsNew = [click('button[aria-label^="What’s new in"]'), `new Promise((d) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-labelledby="new-title"]') || ++n > 100) { clearInterval(t); setTimeout(d, 300, true); } }, 100); })`];
/** Updates from What's new: the app opens again on the new version, with its note. */
export const updateFromWhatsNew = [
  `[...document.querySelectorAll('[aria-labelledby="new-title"] button')].find((b) => b.textContent.trim() === "Update").click(); true`,
  restarted,
  `new Promise((d) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-label="Pack updated"]') || ++n > 100) { clearInterval(t); setTimeout(d, 300, true); } }, 100); })`,
];
/** Adds the catalog's iFly pack as a pack file (the newer version, from a file): the app opens
 * again on it, with its note. */
export const addCatalogIflyAsFile = [
  `(async () => { const index = await (await fetch("../packs/index.json")).json(); const e = index.find((x) => x.id === "ifly-737-max8"); const text = await (await fetch(\`../packs/\${e.id}-\${e.version}.involo-pack\`)).text(); const input = document.querySelector('input[type="file"]'); const dt = new DataTransfer(); dt.items.add(new File([text], \`\${e.id}-\${e.version}.involo-pack\`, { type: "application/json" })); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`,
  restarted,
  `new Promise((d) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-label="Pack updated"]') || ++n > 100) { clearInterval(t); setTimeout(d, 300, true); } }, 100); })`,
];

