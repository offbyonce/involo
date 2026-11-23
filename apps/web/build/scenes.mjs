// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The app states the review shots and the end-to-end tests set up, shared so both start from the
// same flights, packs and plans. Each scene is a step (or a list of them) run in the app's page,
// returning true, or a promise of true once the page has settled. A step is a fixed script with no
// data in it, or `call(fn, arg)`: a function run in the page with its data passed as its argument,
// never spliced into code. Such a function runs in the page, so it uses only its argument and
// the page's own globals.

import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
/** A step that runs `fn` in the page with `arg` as its one argument. */
export const call = (fn, arg) => ({ fn, arg });
export const click = (selector, n = 0) =>
  call(({ selector, n }) => {
    document.querySelectorAll(selector)[n].click();
    return true;
  }, { selector, n });
/** Practice (boards): plays tests until the screen is in a board's state. "light": a light
 * meaning answered wrong with feedback after each; "order": a step order question with its second
 * step picked up; "results": a custom test without memory items, every question answered;
 * "earlier": the Lights test finished, back home with "Earlier this visit"; "engine": the Before
 * engine start test's first choice question, answered (option C). */
export const practice = (goal) =>
  call(async (goal) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    const one = (s) => document.querySelector(s);
    const all = (s) => [...document.querySelectorAll(s)];
    const btn = (t) => all("button").find((b) => b.textContent.trim().startsWith(t));
    if (goal === "engine") {
      all("button.ready")[2].click();
      await wait(300);
      for (let n = 0; n < 20 && one("ol.order"); n++) {
        btn("Check order").click();
        await wait(120);
        btn("Next question").click();
        await wait(150);
      }
      all(".opt")[2]?.click();
      await wait(200);
      return true;
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      if (btn("New test")) {
        btn("New test").click();
        await wait(250);
      }
      if (goal === "earlier" || goal === "pair") {
        all("button.ready")[1].click();
        await wait(300);
      } else if (btn("Start test")) {
        if (goal === "results") {
          const m = all("button.chip").find((b) => b.textContent.startsWith("Memory items"));
          if (m && m.getAttribute("aria-pressed") === "true") {
            m.click();
            await wait(150);
          }
        }
        btn("Start test").click();
        await wait(300);
      }
      for (let n = 0; n < 45; n++) {
        if (!one(".tag")) break;
        const tag = one(".tag").textContent;
        const h = one(".question h2").textContent;
        if (goal === "order" && one("ol.order") && !one("ol.checked")) {
          const li = all("ol.order li")[1];
          li.focus();
          li.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
          await wait(250);
          return true;
        }
        if (one("ol.order")) {
          btn("Check order")?.click();
          await wait(120);
        } else if (goal === "pair" && h.startsWith("What does this light mean") && (one(".light figcaption")?.textContent ?? "").split("·").length === 3) {
          all(".opt")[2].click();
          await wait(200);
          if (one(".opt.wrong")) return true;
        } else if (goal === "light" && tag === "Light meanings" && h.startsWith("What does this light mean")) {
          all(".opt")[2].click();
          await wait(200);
          if (one(".opt.wrong")) return true;
        } else {
          all(".opt")[n % 5 === 0 ? 1 : 0]?.click();
          await wait(100);
        }
        (btn("Next question") || btn("See results"))?.click();
        await wait(150);
        if (one(".results")) {
          if (goal === "results") return true;
          if (goal === "earlier") {
            btn("New test").click();
            await wait(300);
            return true;
          }
          break;
        }
      }
      if (one(".results") && goal === "results") return true;
      btn("End test")?.click();
      await wait(250);
    }
    return true;
  }, goal);
/** Clicks `part` (".row" or ".chev") of the list step whose text contains `title`. */
export const stepNamed = (title, part) =>
  call(({ title, part }) => {
    [...document.querySelectorAll(".it")].find((it) => it.textContent.trim().toUpperCase().includes(title)).querySelector(part).click();
    return true;
  }, { title, part });
/** Clicks `part` of the list step whose name is exactly `name`. */
export const stepExact = (name, part) =>
  call(({ name, part }) => {
    [...document.querySelectorAll(".it")].find((it) => (it.querySelector(".nm")?.textContent ?? "").trim().toUpperCase() === name).querySelector(part).click();
    return true;
  }, { name, part });
/** Scrolls the side pane `pane` so its controls drawing starts at the top. */
export const paneToControls = (pane) =>
  call((pane) => {
    const p = document.querySelector(pane);
    const h = [...p.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim().toUpperCase().startsWith("THE CONTROLS"));
    p.scrollTop += h.getBoundingClientRect().top - p.getBoundingClientRect().top;
    return true;
  }, pane);
/** Types `value` into the input `selector`, as the pilot would. */
export const typeInto = (selector, value) =>
  call(({ selector, value }) => {
    const el = document.querySelector(selector);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { selector, value });
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
  call((text) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text).click();
    return true;
  }, text);
export const go = (hash) =>
  call((hash) => {
    location.hash = hash;
    return true;
  }, hash);

/**
 * The screens to capture: a name, and for each app the address after `#` and an optional script
 * to run first. `base` is the matching 3.0 screen.
 */
/** Skips the list step `title`: opens it if it is closed, then presses Skip for now. */
export const skipStep = (title) =>
  call((title) => {
    const it = [...document.querySelectorAll(".it")].find((i) => i.textContent.toUpperCase().includes(title));
    const skip = () => [...it.querySelectorAll("button")].find((b) => b.textContent.includes("Skip for now"));
    if (!skip()) it.querySelector(".chev").click();
    return new Promise((go) =>
      setTimeout(() => {
        skip().click();
        go(true);
      }, 300),
    );
  }, title);
/**
 * The Flight pages in the boards' state: the invented KSEA to KSFO OFP dropped on SimBrief
 * and OFP file, as a pilot would, then the values the boards show typed in. The import's Undo toast
 * is left to time out (10 s) so it is not in the shot.
 */
export const OFP = fs.readFileSync(path.join(import.meta.dirname, "fixtures/board-ofp.json"), "utf8");
export const dropOfp = call((ofp) => {
  const dt = new DataTransfer();
  dt.items.add(new File([ofp], "ofp.json", { type: "application/json" }));
  document.querySelector(".drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  return new Promise((go) => setTimeout(() => go(true), 1200));
}, OFP);
export const typed = (pairs) =>
  call(async (pairs) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    for (const [section, field, value] of pairs) {
      if (!location.hash.startsWith(`#/flight/${section}`)) {
        location.hash = `#/flight/${section}`;
        await wait(400);
      }
      const el = [...document.querySelectorAll("[data-field]")].find((e) => e.dataset.field === field);
      if (!el) continue;
      if (el.tagName === "BUTTON") {
        el.click();
        await wait(100);
        [...document.querySelectorAll('[role="option"] button')].find((b) => b.textContent.trim() === value)?.click();
      } else {
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await wait(120);
    }
    return true;
  }, pairs);
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
  call(async ({ id, then }) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    location.hash = `#/phase/${id}`;
    await wait(500);
    for (let i = 0; i < 200; i++) {
      const b = [...document.querySelectorAll(".it .tick")].find((t) => t.getAttribute("aria-pressed") !== "true");
      if (!b) break;
      b.click();
      await wait(80);
    }
    location.hash = `#/phase/${then}`;
    await wait(500);
    return true;
  }, { id, then });
/** Ticks every step of phase `id` but its last (its checklist's, once the procedure is done and it
 * opens), then skips that one (S): the phase done, one step open. */
export const finishSkippingLast = (id) =>
  call(async (id) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    location.hash = `#/phase/${id}`;
    await wait(500);
    for (let i = 0; i < 200; i++) {
      const left = [...document.querySelectorAll(".it button.tick")].filter((t) => t.getAttribute("aria-pressed") !== "true");
      if (left.length === 1 && document.body.textContent.includes("opens when the procedure is done")) {
        left[0].click();
        await wait(500);
        continue;
      }
      if (left.length <= 1) break;
      left[0].click();
      await wait(80);
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    await wait(300);
    return true;
  }, id);
/** Goes to a phase (or emergency reference list) and opens step `id` there, its folded list first. */
export const openStep = (kind, phase, id) =>
  call(async ({ at, id }) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    location.hash = at;
    await wait(700);
    for (const b of document.querySelectorAll("button.card.folded")) b.click();
    await wait(300);
    const row = [...document.querySelectorAll("[data-step]")].find((e) => e.dataset.step === id)?.querySelector("button.row");
    if (!row) {
      const b = document.createElement("div");
      b.textContent = `Not on screen for this flight: ${id}`;
      b.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:99;background:#b00;color:#fff;font:16px sans-serif;padding:8px");
      document.body.append(b);
      return true;
    }
    row.click();
    await wait(400);
    return true;
  }, { at: `${kind === "reference" ? "#/reference/" : "#/phase/"}${phase}`, id });
/** Picks the option choice labeled `label` on the phase page that asks it. */
export const pickChoice = (phase, label) =>
  call(async ({ phase, label }) => {
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));
    location.hash = `#/phase/${phase}`;
    await wait(700);
    [...document.querySelectorAll('[role="radiogroup"] button, .cards button')].find((b) => b.textContent.trim().startsWith(label))?.click();
    await wait(300);
    return true;
  }, { phase, label });
export const rowMenu = (name) =>
  call((name) => {
    [...document.querySelectorAll(".it")].find((it) => it.querySelector(".nm")?.textContent.trim() === name).querySelector("button.more").click();
    return true;
  }, name);
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
  call((selector) => {
    document.querySelector(selector).dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true }));
    return true;
  }, selector);
/** Opens the checklists still folded until their procedure is done. */
export const unfold = `[...document.querySelectorAll("button.folded")].forEach((b) => b.click()); true`;
/** Presses a key on the page, as the pilot would. */
/** A panel control's hit target by its label, whether or not the step uses it (", in this step"). */
export const hitOf = (label, within) =>
  [`${label}: what it is`, `${label}, in this step: what it is`].map((l) => `${within} .hit[aria-label="${l}"]`).join(", ");
/** Picks a panel control by its label, as a pointer tap (an SVG element has no click()). */
export const pick = (label, within = ".deck-panel") =>
  call((selector) => {
    document.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, hitOf(label, within));
/** Picks a panel control from the keyboard (focused, then Enter), so its focus ring shows. */
export const pickByKey = (label) => [
  { keys: ["\uE008"] },
  call((selector) => {
    document.querySelector(selector).focus();
    return true;
  }, hitOf(label, ".deck-panel")),
  { keys: ["\uE007"] },
];
export const press = (key) =>
  call((key) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    return true;
  }, key);
/** The Step by step view button in the top bar. */
export const toFlow = `[...document.querySelectorAll("header.top .seg button")].find((b) => b.textContent.trim() === "Step by step").click(); true`;

/** The tour's welcome opens on a first visit (each shot starts from nothing saved): it is closed
 * before every step, so the steps reach the page. */
export const closeWelcome = `sessionStorage.getItem("notice-shot") || document.querySelector('.sim-notice button.primary')?.click(); sessionStorage.getItem("tour-shot") || document.querySelector('[role="dialog"][aria-label="Welcome to Involo"] button.secondary')?.click(); true`;
/** Opens the simulator-only notice again over the current state, as on a first visit (#241):
 * marks it unseen, reloads. */
export const reopenNotice = [
  `(() => { sessionStorage.setItem("notice-shot", "1"); const k = Object.keys(localStorage).find((x) => /settings$/.test(x)); const s = JSON.parse(localStorage.getItem(k)); s.noticeSeen = false; localStorage.setItem(k, JSON.stringify(s)); setTimeout(() => location.reload(), 50); return true; })()`,
  `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector(".sim-notice") || ++n > 80) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`,
];
/** Opens the welcome again over the current state, as on a first visit: marks it unseen, reloads. */
export const reopenWelcome = [
  `(() => { sessionStorage.setItem("tour-shot", "1"); const k = Object.keys(localStorage).find((x) => /settings$/.test(x)); const s = JSON.parse(localStorage.getItem(k)); s.tourSeen = false; localStorage.setItem(k, JSON.stringify(s)); setTimeout(() => location.reload(), 50); return true; })()`,
  `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector('[aria-label="Welcome to Involo"]') || ++n > 80) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`,
];
/** Take the tour from the menu, then → `n` times. */
export const takeTour = (n = 0) => [
  `document.querySelector("header.top .menu").click(); true`,
  `[...document.querySelectorAll("#drawer button")].find((b) => b.textContent.trim() === "Take the tour").click(); true`,
  call(
    (n) =>
      new Promise((done) =>
        setTimeout(() => {
          for (let i = 0; i < n; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
          setTimeout(() => done(true), 600);
        }, 400),
      ),
    n,
  ),
];
/**
 * Writes a log to the app's IndexedDB as a logged log would be, then reloads the page to read it.
 * `log` describes it as data (`{ format, flights, practice }`, each entry from `loggedFlight` or
 * `loggedResult`); the page builds the entries, so their times are in the browser's time zone.
 */
const writeLog = (log) => [
  // At the version the app left the database (it installs its pack there first), not one of
  // our own: an older version would never open.
  call(
    (log) =>
      new Promise((done) => {
        const when = ([d, h, m]) => new Date(2026, 10, d, h, m).getTime();
        const names = ["Preflight", "Departure", "Enroute", "Arrival", "Post-flight"];
        const flight = (f) => {
          const { format, p } = f;
          const off = when(f.at);
          let t = off;
          const stages = f.minutes.map((m, i) => {
            t += m * 60000;
            return { ...(format === 3 ? { id: names[i].toLowerCase() } : {}), title: names[i], ms: m * 60000 };
          });
          return {
            id: `${p.id}@${f.id}`,
            loggedAt: t + 60000,
            pack: p.id,
            packVersion: p.version,
            ...(format === 3 ? { packName: p.name, aircraft: p.aircraft } : { aircraft: p.name }),
            origin: f.from,
            destination: f.to,
            offBlocks: off,
            onBlocks: t,
            stages,
            done: f.done,
            total: p.total,
            skipped: f.skipped,
            plan: "simbrief",
            finished: f.finished,
            ticks: [
              { at: off, step: `${p.id}.before-start.door-lights`, text: "DOOR LIGHTS", ...(format >= 2 ? { name: "Door lights" } : {}), value: "ALL OUT" },
              { at: t, step: `${p.id}.secure.parking-brake`, text: "PARKING BRAKE", ...(format >= 2 ? { name: "Parking brake" } : {}), value: "SET" },
            ],
          };
        };
        const result = (r) => ({
          id: `${r.p.id}@${when(r.at)}`,
          at: when(r.at),
          pack: r.p.id,
          ...(r.format === 3 ? { packVersion: r.p.version, packName: r.p.name, aircraft: r.p.aircraft } : {}),
          title: r.title,
          score: r.score,
          total: r.total,
        });
        const text = JSON.stringify({ format: log.format, flights: log.flights.map(flight), practice: log.practice.map(result) });
        const r = indexedDB.open("involo");
        r.onupgradeneeded = () => r.result.createObjectStore("log");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("log", "readwrite");
          tx.objectStore("log").put(text, "log");
          tx.oncomplete = () => {
            db.close();
            window.seeding = true;
            setTimeout(() => location.reload(), 50);
            done(true);
          };
        };
      }),
    log,
  ),
  // Until the reloaded page (which has no "seeding" mark) is ready.
  `new Promise((done) => { let n = 0; const t = setInterval(() => { if ((!window.seeding && document.querySelector("[data-app-ready]")) || ++n > 100) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`,
];
const IFLY = { id: "ifly-737-max8", name: "iFly 737 MAX 8", version: "0.1.0", aircraft: "737 MAX 8", total: 366 };
const EXAMPLE = { id: "example-sidestick", name: "Example Sidestick Twin", version: "0.1.0", aircraft: "Example Sidestick Twin", total: 13 };
/** A date as day, hour and minute in November 2026, worked out in the page (its time zone). */
const day = (d, h, m) => [d, h, m];
/** A logged flight of pack `p`, in log format 1 (no step names), 2 (step names; the pack's name
 * still as `aircraft`) or 3, described for `writeLog`. */
const loggedFlight = (format, p, id, at, from, to, minutes, done, finished, skipped) => ({ format, p, id, at, from, to, minutes, done, finished, skipped });
/** A practice result of pack `p`, in log format 1, 2 (the same) or 3, described for `writeLog`. */
const loggedResult = (format, p, d, h, title, score, total) => ({ format, p, at: day(d, h, 0), title, score, total });
const terr = (format) => ({ step: `${IFLY.id}.before-start.terr-efis-control-panel`, text: "TERR (EFIS CONTROL PANEL)", ...(format >= 2 ? { name: "TERR (EFIS control panel)" } : {}), value: "ON", stage: "Departure", phase: "before-start", phaseTitle: "Before start" });
const oxy = (format) => ({ step: `${IFLY.id}.preflight.crew-oxygen`, text: "CREW OXYGEN", ...(format >= 2 ? { name: "Crew oxygen" } : {}), value: "VERIFY", stage: "Preflight", phase: "preflight", phaseTitle: "Preflight" });
/** The Log boards' three iFly flights and three practice results, in log format `format`. */
const boardEntries = (format) => ({
  flights: [
    loggedFlight(format, IFLY, 1, day(15, 14, 10), "KSFO", "KSEA", [30, 35, 40, 15, 5], 366, true, []),
    loggedFlight(format, IFLY, 2, day(14, 9, 48), "KSEA", "KSFO", [38, 41, 52, 24, 6], 359, true, [terr(format), oxy(format)]),
    loggedFlight(format, IFLY, 3, day(12, 7, 30), "KPDX", "KSEA", [20, 28], 118, false, [oxy(format)]),
  ],
  practice: [
    loggedResult(format, IFLY, 15, 18, "Lights of the flight deck", 17, 20),
    loggedResult(format, IFLY, 15, 17, "Custom test · 5 topics", 16, 20),
    loggedResult(format, IFLY, 13, 12, "Memory items", 9, 10),
  ],
});
/**
 * The Log boards' stand-in log (LogDesk, LogPhone): three earlier flights and three practice
 * results, saved by an earlier version (log format 1), then the page reloads to read it. Times
 * are the boards', in the browser's time zone.
 */
export const seedLog = (() => {
  const { flights, practice } = boardEntries(1);
  return writeLog({ format: 1, flights, practice });
})();
/**
 * The Flight log by pack (PacksLog, decision 0028): the Log boards' iFly entries and two flights
 * and a practice result from the example pack, in today's log format (3), each with its pack's
 * name and version.
 */
const byPack = (format) => {
  const { flights, practice } = boardEntries(format);
  const example = [
    loggedFlight(format, EXAMPLE, 4, day(14, 16, 5), "XAAA", "XBBB", [12, 9], 13, true, []),
    loggedFlight(format, EXAMPLE, 5, day(11, 10, 20), "XAAA", "XCCC", [15], 7, false, []),
  ];
  const all = [flights[0], flights[1], example[0], flights[2], example[1]];
  const results = [...practice.slice(0, 2), loggedResult(format, EXAMPLE, 14, 17, "Memory items", 3, 4), practice[2]];
  return writeLog({ format, flights: all, practice: results });
};
export const seedLogByPack = byPack(3);
/**
 * The same entries saved by the version before (log format 2): each flight's pack name as
 * `aircraft`, no stage ids, and practice results with only the pack's id. The app migrates it to
 * format 3 when it reads it.
 */
export const seedLogByPackFormat2 = byPack(2);
/** The example pack's name, as the log names it. */
export const EXAMPLE_PACK_NAME = EXAMPLE.name;
/** The id of the stand-in flight the LogDesk board opens (Sat 14 Nov). */
export const LOG_OPEN = "ifly-737-max8@2";

export const TOUR_STATE = [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE];

/** Chooses a file in the file input `selector`: `text`, or "big" for one just over 64 MB. */
export const chooseFile = (selector, text, name) =>
  call(({ selector, text, name }) => {
    const input = document.querySelector(selector);
    const body = text === "big" ? new Uint8Array(64 * 1024 * 1024 + 1) : text;
    const dt = new DataTransfer();
    dt.items.add(new File([body], name, { type: "application/json" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { selector, text, name });
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
  call((how) => {
    const real = window.fetch;
    window.fetch = (url, init) => {
      if (!String(url).includes("simbrief")) return real(url, init);
      if (how === "reply503") return Promise.resolve(new Response("<html>Service unavailable</html>", { status: 503 }));
      if (how === "hang") return new Promise((_, fail) => init.signal.addEventListener("abort", () => fail(new DOMException("aborted", "AbortError"))));
      return Promise.reject(new Error("unexpected"));
    };
    return true;
  }, how),
  typeInto("form.row input", "Pilot"),
  pressText("Import latest flight"),
];
/** Makes every save to this device's storage fail as a full storage does. */
export const refuseSaves = `(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.startsWith("involo.")) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); }; return true; })()`;
/** Saves `what` ("flight" or "plan") in a format from a newer version, then reloads. */
export const savedAs = (what) => [
  call((what) => {
    localStorage.setItem(`involo.${what}.ifly-737-max8`, '{"format":99}');
    setTimeout(() => location.reload(), 50);
    return true;
  }, what),
  "new Promise((done) => { const t = setInterval(() => { if (document.querySelector('[data-app-ready]') && document.querySelector('.kept')) { clearInterval(t); done(true); } }, 100); })",
];
/** An example pack's built file (`just test-packs`), by id, to add from a file on the Packs page. */
export function exampleFile(id) {
  const dir = path.resolve(web, "../../target/test-packs");
  if (!fs.existsSync(path.join(dir, "index.json")))
    throw new Error("the example packs' files aren't built: run `just test-packs` (`just e2e` does)");
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const e = index.find((x) => x.id === id);
  return fs.readFileSync(path.join(dir, `${e.id}-${e.version}.involo-pack`), "utf8");
}
/** The Airbus-style example pack's file (crew roles, seats, alert messages), added from a file. */
export const examplePack = exampleFile("example-sidestick");
/** Until the app has started again on a pack (after an install, a switch or a reload). */
export const restarted = `new Promise((done) => { let n = 0; const t = setInterval(() => { if (document.querySelector("#drawer") || ++n > 150) { clearInterval(t); setTimeout(() => done(true), 300); } }, 100); })`;
/** Adds the example pack from a file on the Packs page; installing opens it. */
export const addExample = [go("#/packs"), `new Promise((d) => setTimeout(() => d(true), 300))`, chooseFile('input[type="file"]', examplePack, "example-sidestick.involo-pack"), restarted];
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
/** The frozen format 2 flight log, as a backup's log with entries this device doesn't have. */
const logFixture = JSON.parse(
  fs.readFileSync(path.resolve(web, "../../crates/involo-app-core/tests/fixtures/log-format-2.json"), "utf8"),
);
/** The Backup boards' time: Nov 18, 2026 at 10:14, in the browser's time zone. */
const BACKUP_AT = [2026, 10, 18, 10, 14];
/** Settings that say this device last saved a backup at the boards' time (BackupSetting). */
export const lastBackupSaved = [
  call((at) => {
    const k = "involo.settings";
    const s = JSON.parse(localStorage.getItem(k) ?? "null");
    if (!s) return true;
    s.lastBackup = new Date(...at).getTime();
    localStorage.setItem(k, JSON.stringify(s));
    location.reload();
    return true;
  }, BACKUP_AT),
  restarted,
];
/**
 * Chooses a backup file in Settings › Restore from a file… (RestoreReview): this device's example
 * flight saved with an older version of the pack, an iFly flight (a catalog pack this device
 * doesn't have), a flight not started for a pack added from a file elsewhere, the settings, and a
 * log with entries this device doesn't have. `newer`: the file a newer Involo saved
 * (RestoreRefused); "big": a file just over the size limit, refused unread.
 */
export const chooseBackup = (newer = false) =>
  call(
    ({ at, log, newer }) => {
      const mine = JSON.parse(localStorage.getItem("involo.flight.example-sidestick"));
      const settings = JSON.parse(localStorage.getItem("involo.settings"));
      // Each backed-up flight with its first step ticked, whatever this device's flight has.
      const flight = (pack, packVersion) => ({ ...mine, pack, packVersion, session: { done: { "example-sidestick.before-start.briefing": new Date(...at).getTime() }, skipped: {} } });
      const backup = {
        kind: "involo-backup",
        format: newer === true ? 2 : 1,
        appVersion: newer === true ? "0.3.0" : "0.1.0",
        savedAt: new Date(...at).getTime(),
        flights: [
          { pack: "example-sidestick", name: "Example Sidestick Twin", version: "0.0.9", source: "file", place: { place: "Preparation › Before start", done: 4, total: 15 }, flight: flight("example-sidestick", "0.0.9"), plan: null },
          { pack: "ifly-737-max8", name: "iFly 737 MAX 8", version: "0.1.0", source: "catalog", place: { place: "Departure › Before taxi", done: 30, total: 357 }, flight: flight("ifly-737-max8", "0.1.0"), plan: null },
          { pack: "example-twin", name: "Example twin-jet", version: "0.1.0", source: "file", place: null, flight: { ...flight("example-twin", "0.1.0"), session: { done: {}, skipped: {} } }, plan: null },
        ],
        settings,
        log,
      };
      const input = document.querySelector('.set.backup input[type="file"]');
      const dt = new DataTransfer();
      const body = newer === "big" ? new Uint8Array(96 * 1024 * 1024 + 1) : JSON.stringify(backup);
      dt.items.add(new File([body], "involo-backup-2026-11-18.json", { type: "application/json" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return new Promise((done) => setTimeout(() => done(true), 600));
    },
    { at: BACKUP_AT, log: logFixture, newer },
  );
/** Settings scrolled to Back up and restore, in the middle of the screen. */
export const scrollToBackup = `new Promise((done) => setTimeout(() => { document.querySelector(".set.backup")?.scrollIntoView({ block: "center" }); setTimeout(() => done(true), 300); }, 300))`;
/** Download in the restore review, with the pack's download failing as if the connection
 * dropped: the row says why, as the Packs page does. */
export const failedDownload = [
  `(() => { const real = window.fetch; window.fetch = (input, init) => (String(input).endsWith(".involo-pack") ? Promise.reject(new TypeError("Failed to fetch")) : real(input, init)); return true; })()`,
  click("button.get"),
  `new Promise((d) => setTimeout(() => d(true), 600))`,
];
/** The same device, its flight saved with nothing ticked (its first step ticked, then unticked). */
export const exampleUntouched = [
  ...noPacks,
  ...addExample,
  go("#/phase/before-start"),
  click('[data-step="example-sidestick.before-start.briefing"] .tick'),
  `new Promise((d) => setTimeout(() => d(true), 300))`,
  click('[data-step="example-sidestick.before-start.briefing"] .tick'),
  go("#/settings"),
];
/** A device with only the example pack, added from a file, its first step ticked, on Settings
 * (the Backup boards: Your seat shows, then Back up and restore). */
export const exampleOnly = [
  ...noPacks,
  ...addExample,
  go("#/phase/before-start"),
  click('[data-step="example-sidestick.before-start.briefing"] .tick'),
  go("#/settings"),
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


/**
 * A step timer in one of its states (#213, Timers boards): the preflight's IRS, whose ten-minute
 * timer starts from its own tick. "waiting": the step before it ticked, so the IRS is the current
 * step; "running", "paused" and "finished": the IRS ticked too, and the page's clock then held at
 * the board's time (7:12 left, paused with 4:31 left, or at zero).
 */
export const timerIn = (state) =>
  call(
    async (state) => {
      const wait = (ms) => new Promise((go) => setTimeout(go, ms));
      const tick = (id) => document.querySelector(`li[data-step="ifly-737-max8.preflight.${id}"] button.tick`)?.click();
      location.hash = "#/phase/preflight";
      await wait(600);
      tick("panel-and-flood-lights");
      await wait(400);
      if (state === "waiting") return true;
      const at = Date.now();
      tick("irs");
      await wait(400);
      const ahead = { running: 168_000, paused: 329_000, finished: 600_000 }[state];
      Date.now = () => at + ahead;
      await wait(1_400);
      if (state === "paused") {
        [...document.querySelectorAll("button.timerb")].find((b) => b.textContent.trim() === "Pause")?.click();
        await wait(400);
      }
      return true;
    },
    state,
  );

/**
 * The Briefings boards' states (#214) on a fresh flight's Before start: "open", the takeoff
 * briefing to give; "briefed", given at 10:42 by the page's clock; "skipped", skipped.
 */
export const briefingIn = (state) =>
  call(
    async (state) => {
      const wait = (ms) => new Promise((go) => setTimeout(go, ms));
      location.hash = "#/phase/before-start";
      await wait(600);
      if (state === "open") return true;
      const at = new Date();
      at.setHours(10, 42, 0, 0);
      const real = Date.now;
      Date.now = () => at.getTime();
      const name = state === "briefed" ? "Briefed" : "Skip briefing";
      [...document.querySelectorAll("section.brief button")].find((b) => b.textContent.trim() === name)?.click();
      await wait(600);
      Date.now = real;
      return true;
    },
    state,
  );

/**
 * The CduWalk boards' states (#215) on Preliminary preflight, with every step before the CDU step
 * done so it is current: "start", not opened yet; "resume", stopped at page 10 (PERF INIT) and
 * closed; "values", open on page 10; "novalues", open on page 2 with no flight; "last", open on
 * the last page; "pos" and "route", open on POS INIT's position (page 3) and the route (page 6).
 * Run after the board flight for every state but "novalues".
 */
export const cduIn = (state) =>
  call(
    async (state) => {
      const wait = (ms) => new Promise((go) => setTimeout(go, ms));
      location.hash = "#/phase/preflight";
      await wait(700);
      const cdu = 'li[data-step="ifly-737-max8.preflight.cdu"]';
      for (let i = 0; i < 60; i++) {
        const rows = [...document.querySelectorAll(".it")];
        const at = rows.findIndex((r) => r.matches(cdu));
        const b = rows.slice(0, at).map((r) => r.querySelector("button.tick")).find((t) => t && t.getAttribute("aria-pressed") !== "true");
        if (!b) break;
        b.click();
        await wait(120);
      }
      const show = () => {
        document.querySelector(cdu)?.scrollIntoView({ block: "start" });
        window.scrollBy(0, -(innerWidth < 600 ? 200 : 260));
      };
      show();
      await wait(300);
      if (state === "start") return true;
      const open = () => [...document.querySelectorAll(`${cdu} button.walkb`)][0]?.click();
      open();
      await wait(500);
      const next = () => [...document.querySelectorAll(".walk .foot button")].find((b) => b.textContent.trim() === "Next")?.click();
      const pages = { resume: 9, values: 9, novalues: 1, last: 14, pos: 2, route: 5, ident: 0 }[state];
      for (let i = 0; i < pages; i++) {
        next();
        await wait(150);
      }
      if (state === "resume") {
        document.querySelector('.walk button[aria-label="Close the CDU walkthrough"]')?.click();
        await wait(400);
        show();
      }
      await wait(400);
      return true;
    },
    state,
  );

/**
 * The walkaround boards' states (#216) on the exterior inspection: "first", the first stop current;
 * "mid", stop 5 current with stops 1, 2 and 4 done and 3 skipped.
 */
export const walkIn = (state) =>
  call(
    async (state) => {
      const wait = (ms) => new Promise((go) => setTimeout(go, ms));
      const show = async () => {
        if (innerWidth >= 600) return;
        document.querySelector("li.it.current")?.scrollIntoView({ block: "start" });
        window.scrollBy(0, -150);
        await wait(300);
      };
      location.hash = "#/phase/exterior";
      await wait(700);
      if (state === "first") {
        await show();
        return true;
      }
      const stop = (id) => document.querySelector(`li.it[data-step="ifly-737-max8.exterior.${id}"]`);
      const tick = (id) => stop(id)?.querySelector("button.tick")?.click();
      const skip = () => [...document.querySelectorAll("li.it.current button")].find((b) => b.textContent.trim().startsWith("Skip for now"))?.click();
      tick("left-forward-fuselage");
      await wait(250);
      tick("nose");
      await wait(250);
      skip();
      await wait(250);
      tick("right-wing-root");
      await wait(500);
      await show();
      return true;
    },
    state,
  );
