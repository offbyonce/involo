// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Review shots of named screens of the built app, for design review: `just review-shots <out-dir>
// <screen>...` after `just site`, with each screen's name as SHOTS gives it below. Each screen is
// shot at the sizes it lists (the five review sizes when it lists none: phone, tablet portrait,
// tablet landscape, 1440 and 2560 by 1440; decision 0021), in the dark and light themes, and each
// shot with an approved board, as review-boards.mjs lists, is put beside that board in
// <out-dir>/side-by-side. The theme comes from a Firefox preference, so the app needs no test hook.
// Writes PNG files to <out-dir>, which should be outside the repo. Needs Firefox on the PATH (or
// FIREFOX=/path/to/firefox). There is no run of every screen: the end-to-end tests check every
// flow (apps/web/e2e), and review shots are for the screens a pull request adds or changes.
//
// Optionally (CONTRIBUTING.md, "Optional local files"): with INVOLO_BASELINE set to a local copy of
// the 3.0 checklist's HTML file, it also shoots
// the same screens of 3.0 into <out-dir>/baseline and writes side-by-side images (3.0 left, new
// right, same size and theme) into <out-dir>/compare. The 3.0 copy is never part of the repo.
// SCREENSHOTS_ONLY=phase-desktop-dark,flow names screens by key prefix instead (name-size-theme).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { serve, session, sleep, startFirefox } from "./browser.mjs";
import { REVIEW_BOARDS } from "./review-boards.mjs";
import {
  addCatalogIflyAsFile,
  addExample,
  chooseBackup,
  scrollToBackup,
  exampleOnly,
  lastBackupSaved,
  ARRIVAL,
  BOARD_FLIGHT,
  BOARD_STATE,
  chooseFile,
  CLEARANCE,
  click,
  closeWelcome,
  finishPhase,
  finishSkippingLast,
  go,
  hitOf,
  iflyFromFile,
  IMPOSSIBLE,
  importOtherAircraft,
  inFlight,
  LOG_OPEN,
  noPacks,
  olderIfly,
  olderIflyWithChanges,
  openStep,
  openWhatsNew,
  paneToControls,
  pick,
  pickByKey,
  pickChoice,
  practice,
  press,
  pressText,
  refuseSaves,
  reopenWelcome,
  rowMenu,
  savedAs,
  seedLog,
  seedLogByPack,
  simbrief,
  stepExact,
  stepNamed,
  TAKEOFF,
  takeTour,
  tap,
  toFlow,
  TOUR_STATE,
  typed,
  typeInto,
  unfold,
  updateFromWhatsNew,
} from "./scenes.mjs";

const web = path.resolve(import.meta.dirname, "..");
const dist = path.join(web, "dist");
/** Firefox profiles and scratch pages: the repository's target folder, unless that is under the
 * system's temporary folder (a checkout there), which a sandboxed Firefox may not read; then a
 * folder in the home directory. SCREENSHOTS_WORK names another. */
const inTarget = path.resolve(web, "../../target/screenshots");
const work =
  process.env.SCREENSHOTS_WORK ??
  (inTarget.startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`) || inTarget.startsWith(`${os.tmpdir()}${path.sep}`)
    ? path.join(os.homedir(), "involo-screenshots")
    : inTarget);
/** Every page sees one fixed time and one seeded random sequence, so two runs of a build compare
 * pixel for pixel (save and import times, Practice's dealt questions). */
const FROZEN = `() => {
  const T = Date.UTC(2026, 10, 18, 9, 30);
  const Real = Date;
  class Fixed extends Real {
    constructor(...a) { if (a.length) super(...a); else super(T); }
    static now() { return T; }
  }
  globalThis.Date = Fixed;
  let seed = 20261118;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}`;
const BIDI = 9234;

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
  wide: { width: 2560, height: 1440 },
  // A phone held sideways (R6PhoneL); shot only by the screens that name it.
  "phone-sideways": { width: 844, height: 390, named: true },
  // The Flight deck page between its board sizes (900 to 1439 px); shot only when named.
  laptop: { width: 1280, height: 800, named: true },
};
// layout.css.prefers-color-scheme.content-override: 0 dark, 1 light.
const THEMES = { dark: 0, light: 1 };

function stepShots() {
  const file = process.env.INVOLO_STEPS;
  if (!file) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line, n) => {
      // An optional fourth column numbers the shot (to retake some of a list under their numbers).
      // A fifth, "<phase>|<choice>", first picks an option asked in that phase (a step shown only for
      // a visual approach, say).
      const [kind, phase, id, number, choose] = line.split("\t");
      const [askedIn, choice] = (choose ?? "").split("|");
      const open = [...(choice ? [pickChoice(askedIn, choice)] : []), openStep(kind, phase, id), press("p")];
      const at = number ? Number(number) - 1 : n;
      const tag = String(at + 1).padStart(2, "0");
      return [
        { name: `tiles-${tag}`, only: ["desktop"], app: { hash: "#/", before: open } },
      ];
    });
}
/** Opens the row menu ("···") of the list step whose name is exactly `name`. */
const SHOTS = [
  { name: "phase", app: { hash: "" }, base: { hash: "#cold-dark" } },
  {
    // The same steps on both sides: two ticked, Wipers skipped, Alternate flaps selected and opened.
    name: "states",
    app: {
      hash: "",
      before: [
        click(".it .tick", 0),
        click(".it .tick", 1),
        // The two done steps fold into one line; Show keeps every row in place.
        `[...document.querySelectorAll(".done-group .show")][0]?.click(); true`,
        click(".it .more", 3),
        `[...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.trim() === "Skip for now").click(); true`,
        click(".it .row", 2),
      ],
    },
    base: {
      hash: "#cold-dark",
      before: [
        click(".it .tick", 0),
        click(".it .tick", 1),
        click(".it .chev", 3),
        `[...document.querySelectorAll(".dskip .btn")][0].click(); true`,
        // 3.0 opens a step when its row is clicked.
        click(".it .row", 2),
      ],
    },
  },
  {
    // N1 BUGS opened on both sides (the pack lists Landing gear pins first).
    name: "detail",
    app: { hash: "#/phase/before-start", before: [click(".it .row", 1)] },
    base: { hash: "#before-start", before: [click(".it .chev", 0)] },
  },
  { name: "checklist", app: { hash: "#/phase/before-start" }, base: { hash: "#before-start" } },
  {
    // N1 BUGS in Step by step on both sides: the app ticks Landing gear pins first.
    name: "flow",
    app: { hash: "#/phase/before-start", before: [click(".it .tick", 0), toFlow] },
    base: { hash: "#before-start", before: [click("#flowb")] },
  },
  {
    name: "essentials",
    app: { hash: "#/settings", before: [pressText("Essentials"), go("")] },
    base: { hash: "#settings", before: [pressText("Essentials"), go("#cold-dark")] },
  },
  {
    name: "open",
    app: { hash: "", before: [click(".it .tick", 0), go("#/phase/gpu-power"), click(".opener")] },
    base: { hash: "#cold-dark", before: [click(".it .tick", 0), go("#gpu-power"), click("#opbtn")] },
  },
  { name: "emergency", app: { hash: "#/reference" }, base: { hash: "#memory" } },
  {
    // The first memory item opened and its first step chosen, so the drawing shows.
    name: "emergency-step",
    app: { hash: "#/reference", before: [click("details summary", 0), click(".it .row", 0)] },
    base: { hash: "#memory", before: [click("details summary", 0)] },
  },
  { name: "settings", app: { hash: "#/settings" }, base: { hash: "#settings" } },
  // Flight setup, empty on both sides.
  // Flight setup's place: the Flight pages' Overview on our side.
  { name: "setup", app: { hash: "#/flight/overview" }, base: { hash: "#setup" } },
  {
    // Before takeoff with takeoff data from Flight setup: the blanks filled in on both sides.
    name: "values",
    app: {
      hash: "#/flight/overview",
      before: [inFlight(TAKEOFF), go("#/phase/before-takeoff")],
    },
    base: {
      hash: "#setup",
      before: [...TAKEOFF.map(([, theirs, v]) => typeInto(`#s-${theirs}`, v)), go("#before-takeoff")],
    },
  },
  {
    // Descent with the same arrival data: in Flight › Approach on our side (the Arrival data box
    // is a link there), in 3.0's box on the other.
    name: "arrival",
    only: "desktop",
    app: { hash: "#/flight/approach", before: [inFlight(ARRIVAL), go("#/phase/descent")] },
    base: { hash: "#descent", before: ARRIVAL.map(([, theirs, v]) => typeInto(`#s-${theirs}`, v)) },
  },
  {
    // The flight strip with a clearance, its panel (3.0's pop-out) open on both sides.
    name: "strip",
    app: {
      hash: "#/flight/clearance",
      before: [inFlight(CLEARANCE), go("#/phase/cold-dark"), tap(".fsline")],
    },
    base: {
      hash: "#setup",
      before: [...CLEARANCE.map(([, theirs, v]) => typeInto(`#s-${theirs}`, v)), go("#cold-dark"), click("#fsbtn")],
    },
  },
  {
    // Before start: MCP (glareshield). The app lists Landing gear pins first, so its rows run one ahead.
    // Both sides show the step opened.
    name: "panel-mcp",
    only: ["desktop", "wide"],
    app: { hash: "#/phase/before-start", before: [click(".it .row", 2), press("p")] },
    base: { hash: "#before-start", before: [click(".it .chev", 1)] },
  },
  {
    // Before start: door lights (overhead). The app lists Landing gear pins first, so its rows run one ahead.
    // Both sides show the step opened.
    name: "panel-doors",
    only: "desktop",
    app: { hash: "#/phase/before-start", before: [click(".it .row", 3), press("p")] },
    base: { hash: "#before-start", before: [click(".it .chev", 2)] },
  },
  {
    // Before start: TERR (main panel). The app lists Landing gear pins first, so its rows run one ahead.
    // Both sides show the step opened.
    name: "panel-terr",
    only: "desktop",
    app: { hash: "#/phase/before-start", before: [click(".it .row", 4), press("p")] },
    base: { hash: "#before-start", before: [click(".it .chev", 3)] },
  },
  {
    // Before start: fuel pumps (overhead). The app lists Landing gear pins first, so its rows run one ahead.
    // Both sides show the step opened.
    name: "panel-fuel",
    only: ["desktop", "wide", "tablet-landscape"],
    app: { hash: "#/phase/before-start", before: [click(".it .row", 5), press("p")] },
    base: { hash: "#before-start", before: [click(".it .chev", 4)] },
  },
  {
    // Preflight: the electrical warning lights, with the side pane scrolled to the meter dials.
    name: "panel-elec",
    only: "desktop",
    app: {
      hash: "#/phase/preflight",
      before: [
        stepNamed("BAT DISCHARGE, TR UNIT", ".row"),
        press("p"),
      ],
    },
    base: { hash: "#preflight", before: [stepNamed("BAT DISCHARGE, TR UNIT", ".chev"), paneToControls("#pane")] },
  },
  {
    // The widest sections in the pack: the captain's lights (main panel, 918 units across) and the
    // parking brake and start levers (control stand, 725).
    name: "panel-lights",
    only: ["desktop", "wide"],
    app: { hash: "#/phase/preflight", before: [stepNamed("STAB OUT OF TRIM LIGHT", ".row"), press("p")] },
    base: { hash: "#preflight", before: [stepNamed("STAB OUT OF TRIM LIGHT", ".chev"), paneToControls("#pane")] },
  },
  {
    // The aft overhead (IRS mode selectors; the pane unscrolled, title and Check in frame) and the pilot station (oxygen mask), so every panel in
    // the pack has a drawing in the review set. No 3.0 counterpart is shot for these.
    name: "panel-aft",
    only: ["desktop", "wide"],
    app: { hash: "#/phase/preflight", before: [stepExact("IRS", ".row"), press("p")] },
  },
  {
    name: "panel-seat",
    only: ["desktop", "wide"],
    app: { hash: "#/phase/preflight", before: [unfold, stepExact("OXYGEN", ".row"), press("p")] },
  },
  {
    // Tablet portrait and phone: Where is this? opens the panel sheet on Where it is.
    name: "where-narrow",
    only: ["phone", "tablet"],
    app: { hash: "#/phase/before-start", before: [stepNamed("FUEL PUMP SWITCHES", ".row"), press("w")] },
  },
  {
    name: "panel-brake",
    only: ["desktop", "wide"],
    app: { hash: "#/phase/gpu-power", before: [stepNamed("PARKING BRAKE", ".row"), press("p")] },
    base: { hash: "#gpu-power", before: [stepNamed("PARKING BRAKE", ".chev"), paneToControls("#pane")] },
  },
  // Board pairs: each screen in its board's step and state, shot at the board's size and whole
  // (the full page and the side pane top to bottom), for docs/design/boards side-by-sides.
  // The Checklist board also draws the row menu open on Anti-collision light.
  {
    name: "board-checklist",
    full: true,
    only: ["desktop", "wide"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE, rowMenu("Anti-collision light")] },
  },
  // The flight strip with values and a note: its Notes chip against the Checklist board's (color.chip).
  {
    name: "board-strip",
    full: true,
    only: ["desktop"],
    app: {
      hash: "#/phase/before-start",
      before: [
        ...BOARD_FLIGHT,
        go("#/phase/before-start"),
        ...BOARD_STATE,
        tap(".fsline"),
        typeInto("#sp-notes", "Expect runway 16L"),
        tap(".fsline"),
        "document.activeElement?.blur(); true",
      ],
    },
  },
  // A step's blank linked to its Flight field: Before takeoff's stabilizer trim, still empty,
  // reads "— enter takeoff trim" (Checklist board), with the board flight imported.
  {
    name: "board-blanks",
    full: true,
    only: ["desktop"],
    app: { hash: "#/phase/before-takeoff", before: [...BOARD_FLIGHT, go("#/phase/before-takeoff"), unfold] },
  },
  // The Flight pages, each section in the boards' state.
  ...["overview", "route", "fuel", "cruise", "weather", "clearance", "takeoff", "approach", "start", "simbrief"].map((section) => ({
    name: `board-flight-${section}`,
    full: true,
    only: ["desktop", "wide", "tablet-landscape"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go(`#/flight/${section}`)] },
  })),
  // Every placeholder fits at the narrow sizes too.
  ...["takeoff", "approach"].map((section) => ({
    name: `flight-${section}`,
    full: true,
    only: ["phone", "tablet"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go(`#/flight/${section}`)] },
  })),
  // A value out of range (FSInvalid): Cruise level at FL450.
  {
    name: "board-flight-invalid",
    full: true,
    only: ["desktop", "tablet-landscape", "phone"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, typed([["cruise", "cruise_level", "FL450"]]), click('[data-row="cruise_level"] .label')] },
  },
  {
    name: "board-flight-winds",
    full: true,
    only: ["desktop", "tablet-landscape"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/flight/weather"), click('[role="tab"]', 3)] },
  },
  // The strip panel, open, with the plan imported (StripOpen) and with Frequencies open (StripFreq).
  {
    name: "board-strip-open",
    full: true,
    only: ["desktop", "wide", "tablet-landscape", "phone"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE, tap(".fsline")] },
  },
  {
    name: "board-strip-freq",
    full: true,
    only: ["desktop"],
    app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE, tap(".fsline"), click("button.freq")] },
  },
  // The tablet and phone boards draw no menu; tablet portrait and phone open the step in place.
  // Center tank fuel still asking, with the plan's suggestion (DecSuggested): the boards' state
  // without its answer.
  { name: "center-tank-suggested", only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE.slice(0, -1)] } },
  { name: "board-checklist", full: true, only: ["tablet-landscape", "tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE] } },
  // The menu drawer at every size (Menu, Tablet and Mobile boards), the stage and phase
  // picker (StagePicker), the tablet portrait and phone panel sheets, and phone's open-steps sheet.
  { name: "board-menu", only: ["desktop", "tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click('[aria-controls="drawer"]')] } },
  // StagePicker's state: the flight loaded, Preflight done with one step still open, Before start
  // under way (Done, "1 open" and the stage button's amber dot).
  {
    name: "board-stages",
    only: ["tablet-landscape", "tablet", "phone"],
    app: {
      hash: "#/phase/before-start",
      before: [
        ...BOARD_FLIGHT,
        ...["cold-dark", "gpu-power", "exterior"].map((id) => finishPhase(id, "preflight")),
        finishSkippingLast("preflight"),
        go("#/phase/before-start"),
        ...BOARD_STATE,
        click("header.top .pick"),
      ],
    },
  },
  { name: "board-sheet", only: ["tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("p")] } },
  // Keyboard focus at tablet and phone sizes: the app's 2 px ring, 2 px out. Focus goes
  // to the control before, then a real Tab (or Shift Tab) moves it on.
  { name: "focus-done", only: ["tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, { keys: ["\uE008"] }, `document.querySelector(".actions .donebtn").focus(); true`] } },
  { name: "focus-menu", only: ["tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click('[aria-controls="drawer"]'), `document.querySelector("#drawer .close").focus(); true`, { keys: ["\uE004"] }] } },
  { name: "focus-stages", only: ["tablet", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click("header.top .pick"), `document.querySelector(".picker .close").focus(); true`, { keys: ["\uE004"] }] } },
  // The phone held sideways: the panel sheet with its labels and no pinned Check (R6PhoneL).
  { name: "board-sheet", only: ["phone-sideways"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("p")] } },
  // The decision step on phone (DecPhone), from the design gallery's invented fixture (the pack has
  // no decision step yet).
  { name: "board-decision", only: ["phone"], app: { hash: "", page: "design/?view=decision&state=phone&theme={theme}" } },
  // Panels: a step's sheet and side-pane preview card, opened by P, for each step in the optional
  // local INVOLO_STEPS file (CONTRIBUTING.md, "Optional local files"), named tiles-<n>; none
  // without it.
  ...stepShots(),
  // The PanelTiles board's step: the wiper selectors, their sheet and the deck map open.
  { name: "board-tiles", only: ["desktop"], app: { hash: "#/phase/cold-dark", before: [openStep("phase", "cold-dark", "ifly-737-max8.cold-dark.wiper-selectors"), press("p")] } },
  // The same sheet with the L WIPER selector picked: its one round selection ring (fix).
  { name: "tiles-picked", only: ["desktop"], app: { hash: "#/phase/cold-dark", before: [openStep("phase", "cold-dark", "ifly-737-max8.cold-dark.wiper-selectors"), press("p"), pick("L WIPER", ".slideout")] } },
  // Each phone-sized panel sheet once (upright and sideways), for a row of tiles and a stack.
  ...["ifly-737-max8.cold-dark.wiper-selectors", "ifly-737-max8.landing.speedbrake-lever"].flatMap((id, n) => [
    { name: `tiles-phone-${n}`, only: ["phone", "phone-sideways"], app: { hash: "#/", before: [openStep("phase", id.split(".")[1], id), press("p")] } },
  ]),
  // Find (results for "fuel", no match, before typing) over the boards' state, opened
  // from the header; the desktop menu's "Where is Flight setup?" opened.
  ...[
    ["board-find", "fuel"],
    ["board-find-none", "trimmx"],
    ["board-find-start", null],
  ].map(([name, word]) => ({
    name,
    only: ["desktop", "phone"],
    app: {
      hash: "#/phase/before-start",
      before: [...BOARD_FLIGHT, go("#/phase/before-start"), ...BOARD_STATE, click("header.top .find"), ...(word ? [typeInto(".find .field input", word)] : [])],
    },
  })),
  { name: "board-menu-where", only: ["desktop"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click('[aria-controls="drawer"]'), click("#drawer .wlink")] } },
  // The Flight deck (Deck, PhoneDeck): the forward overhead with the fuel panel selected, as
  // the boards show; at 1280 px, the area list and the area, the panel in its slide-out.
  { name: "board-deck", only: ["desktop", "phone", "laptop"], app: { hash: "#/deck/forward-overhead/fuel" } },
  // The panel-highlight bug: the aft overhead's test switches with MACH TEST 1 picked, by
  // pointer and from the keyboard (its focus ring shown).
  { name: "deck-picked", only: ["desktop"], app: { hash: "#/deck/aft-overhead/atest", before: [pick("MACH TEST 1")] } },
  { name: "deck-picked-key", only: ["desktop"], app: { hash: "#/deck/aft-overhead/atest", before: pickByKey("MACH TEST 1") } },
  // The selected panel's "Full size ›": the panel sheet at full size, with its navigator when wider.
  { name: "board-deck-full", only: ["desktop", "phone"], app: { hash: "#/deck/forward-overhead/fuel", before: [click(".deck-panel .full")] } },
  // Practice (PracticeHome, PracticeQuestion, PracticeOrder, PracticeResults), each in its
  // board's state; the desktop home after a finished test shows "Earlier this visit", as PracticeHome.
  { name: "board-practice-home", only: ["desktop"], app: { hash: "#/practice", before: [practice("earlier")] } },
  { name: "board-practice-home-phone", only: ["phone"], app: { hash: "#/practice" } },
  { name: "board-practice-question", only: ["desktop", "phone"], app: { hash: "#/practice", before: [practice("light")] } },
  { name: "board-practice-order", only: ["desktop"], app: { hash: "#/practice", before: [practice("order")] } },
  { name: "board-practice-results", only: ["desktop", "phone"], app: { hash: "#/practice", before: [practice("results")] } },
  // Before engine start: Preflight and Departure up to and including Engine start.
  // The tour (Tour boards): the welcome over the Checklist board's state, step 2, the end; and steps
  // 3 to 6 at desktop.
  { name: "board-tour-welcome", tour: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...reopenWelcome] } },
  { name: "board-tour-step", tour: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...takeTour(0)] } },
  { name: "board-tour-end", tour: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...takeTour(5)] } },
  ...[3, 4, 5, 6].map((n) => ({ name: `tour-step-${n}`, tour: true, only: n <= 4 ? ["desktop", "phone"] : ["desktop"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...takeTour(n - 2)] } })),
  { name: "practice-paired-light", only: ["desktop"], app: { hash: "#/practice", before: [practice("pair")] } },
  { name: "practice-engine-start", only: ["desktop"], app: { hash: "#/practice", before: [practice("engine")] } },
  // The Glossary: desktop at APU as the boards show, the phone's list, and APU on phone.
  { name: "board-glossary", only: ["desktop"], app: { hash: "#/glossary/APU" } },
  { name: "board-glossary-list", only: ["phone"], app: { hash: "#/glossary" } },
  { name: "board-glossary-term", only: ["phone"], app: { hash: "#/glossary/APU" } },
  // How procedures work (HowDesk, HowPhone): part 2 as the boards show it, whole; and each
  // part at desktop.
  // From Before start, the boards' phase, so the In Involo links name it.
  { name: "board-how", full: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, go("#/how/2")] } },
  // The Flight log (LogDesk, LogPhone, LogPhoneFlight): the board's flight ticked as the
  // boards show it, the stand-in log, the Sat 14 Nov flight opened on desktop and on its own page on
  // phone; and an empty log (round 6's Log view).
  { name: "board-log", full: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...seedLog, go(`#/log/${LOG_OPEN}`)] } },
  { name: "board-log-list", full: true, only: ["phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...seedLog, go("#/log")] } },
  // The Flight log by pack (PacksLog, #107): every pack, then the example pack's chip chosen.
  { name: "board-log-packs", full: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...seedLogByPack, go("#/log")] } },
  { name: "board-log-pack", full: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...seedLogByPack, go("#/log"), `new Promise((done) => setTimeout(() => { [...document.querySelectorAll(".chip")].find((b) => b.textContent.startsWith("Example trainer")).click(); setTimeout(() => done(true), 300); }, 300))`] } },
  // References (RefsDesk, RefsPhone): the whole page, and Find opened on its simulator
  // model steps.
  { name: "board-refs", full: true, only: ["desktop", "phone", "tablet", "tablet-landscape"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, go("#/references")] } },
  { name: "refs-sim-find", only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, go("#/references"), click(".sim .more")] } },
  { name: "board-log-empty", only: ["desktop"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, go("#/log")] } },
  // Packs (Packs boards): the page with the open pack's saved flight; two packs, one from a file,
  // with an update waiting; the switcher; Remove…; and the first launch. `fresh`: the shot changes
  // the installed packs, so iFly is installed again after it.
  { name: "board-packs", full: true, only: ["desktop", "phone", "tablet"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, go("#/packs")] } },
  {
    name: "board-packs-two",
    full: true,
    fresh: true,
    only: ["desktop", "phone"],
    app: { hash: "#/phase/before-start", before: [...BOARD_STATE, ...olderIfly, ...addExample, go("#/packs")] },
  },
  {
    name: "board-packs-switcher",
    fresh: true,
    only: ["desktop", "phone"],
    app: { hash: "#/phase/before-start", before: [...BOARD_STATE, ...addExample, click('button[aria-label="Menu"]'), click("#drawer .packline")] },
  },
  // Crew roles and list methods (#133, Roles.dc.html): the example pack (invented) sets list methods,
  // crew roles and a view for each of two seats; the iFly pack sets none. Its Before start is a
  // challenge-and-response checklist, its Start a read-and-do procedure; the first step is done,
  // as on the boards.
  {
    name: "board-roles",
    full: true,
    fresh: true,
    only: ["desktop", "tablet-landscape", "tablet", "phone"],
    app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...addExample, go("#/phase/before-start"), click('[data-step="example-trainer.before-start.battery"] .tick')] },
  },
  {
    name: "board-roles-procedure",
    full: true,
    fresh: true,
    only: ["desktop", "phone"],
    app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...addExample, go("#/phase/start"), click('[data-step="example-trainer.start.walkaround"] .tick')] },
  },
  // Step by step with roles (no board; agreed as on the phone's board): the caller's tag before
  // the name, the answerer's before the value.
  {
    name: "roles-step-by-step",
    fresh: true,
    only: ["desktop", "phone"],
    app: {
      hash: "#/phase/before-start",
      before: [
        ...TOUR_STATE,
        ...addExample,
        go("#/phase/before-start"),
        click('[data-step="example-trainer.before-start.battery"] .tick'),
        click('button[aria-label="Menu"]'),
        `[...document.querySelectorAll("#drawer .seg.view button")].find((b) => b.textContent.trim() === "Step by step").click(); true`,
        click("#drawer .close"),
        `new Promise((d) => setTimeout(() => d(true), 400))`,
      ],
    },
  },
  // Settings › Your seat (SeatSetting): offered for the example pack's two seat views.
  { name: "board-seat", full: true, fresh: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...TOUR_STATE, ...addExample, go("#/settings")] } },
  // Back up and restore (#47, Backup.dc.html): the Settings card, the review and the refusal.
  { name: "board-backup-setting", full: true, fresh: true, only: ["desktop", "phone"], app: { hash: "#/settings", before: [...exampleOnly, ...lastBackupSaved, go("#/settings"), scrollToBackup] } },
  { name: "board-restore-review", full: true, fresh: true, only: ["desktop", "phone"], app: { hash: "#/settings", before: [...exampleOnly, chooseBackup()] } },
  { name: "board-restore-refused", fresh: true, only: ["desktop", "phone"], app: { hash: "#/settings", before: [...exampleOnly, chooseBackup(true)] } },
  { name: "board-packs-remove", only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, go("#/packs"), click('button[aria-label^="Remove "]')] } },
  { name: "board-packs-first", full: true, fresh: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: noPacks } },
  // A pack update during a flight (PacksUpdate): What's new on the Packs page, then the note
  // after Update, at the top of the checklist.
  { name: "board-update-whatsnew", fresh: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: [...olderIflyWithChanges, ...openWhatsNew] } },
  {
    name: "board-update-note",
    full: true,
    fresh: true,
    only: ["desktop", "tablet", "phone"],
    app: { hash: "#/phase/before-start", before: [...olderIflyWithChanges, ...openWhatsNew, ...updateFromWhatsNew] },
  },
  // The same newer version added from a file: the same list of changes and the same note.
  {
    name: "board-update-file-note",
    full: true,
    fresh: true,
    only: ["desktop", "phone"],
    app: { hash: "#/phase/before-start", before: [...olderIflyWithChanges, ...addCatalogIflyAsFile] },
  },
  // A SimBrief plan for another aircraft (PacksSimbrief): the warning at desktop, and on a phone
  // in the Remove dialog's form; then with a pack added from a file, its row marked so.
  { name: "board-simbrief-other", fresh: true, only: ["desktop", "phone"], app: { hash: "#/phase/before-start", before: importOtherAircraft } },
  { name: "board-simbrief-other-file", fresh: true, only: ["desktop"], app: { hash: "#/phase/before-start", before: [...iflyFromFile, ...importOtherAircraft] } },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: `how-part-${n}`, only: ["desktop"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, go(`#/how/${n}`)] } })),
  // The phone list with its fold opened: each later list starts with its label row.
  { name: "board-phone-fold", only: ["phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click("button.after"), click("button.card.folded"), `(() => { [...document.querySelectorAll("section.card > p.label")].find((p) => p.offsetParent)?.scrollIntoView({ block: "center" }); return true; })()`] } },
  { name: "board-phone-open", only: ["phone"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click(".prow .open")] } },
  // Round 6's slide-out: Show panel (P), Where is this? (W), and a control's card (tap CTR L).
  { name: "board-panel", full: true, only: ["desktop", "wide", "tablet-landscape"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("p")] } },
  { name: "board-where", full: true, only: ["desktop", "tablet-landscape"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("w")] } },
  {
    name: "board-control",
    full: true,
    only: ["desktop", "tablet-landscape"],
    app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("p"), tap(hitOf("CTR L", ".slide-box"))] },
  },
  { name: "board-open", full: true, only: ["desktop"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, click(".opener")] } },
  { name: "board-flow", full: true, only: ["desktop"], app: { hash: "#/phase/before-start", before: [...BOARD_STATE, toFlow] } },
  { name: "board-settings", full: true, only: ["desktop"], app: { hash: "#/settings" } },
  {
    name: "board-phonewhere",
    full: true,
    only: ["phone"],
    app: { hash: "#/phase/before-start", before: [...BOARD_STATE, press("w")] },
  },
  {
    name: "menu",
    only: "tablet",
    app: { hash: "", before: [click('[aria-controls="drawer"]')] },
    base: { hash: "#cold-dark", before: [click("#menu")] },
  },
  // Saving (decisions 0012 and 0019): saves refused, with the notice and "Not saved"; the menu's
  // sub-line on a phone; Start fresh that can't set saved data aside; a kept SimBrief plan.
  { name: "unsaved", only: ["desktop", "phone"], app: { hash: "", before: [refuseSaves, click(".it .tick", 0)] } },
  {
    name: "unsaved-menu",
    only: "phone",
    app: { hash: "", before: [refuseSaves, click(".it .tick", 0), click('[aria-controls="drawer"]')] },
  },
  {
    name: "kept-stuck",
    only: "desktop",
    app: { hash: "", before: [...savedAs("flight"), refuseSaves, pressText("Start fresh")] },
  },
  { name: "kept-plan", only: "desktop", app: { hash: "", before: savedAs("plan") } },
  // Imports: a file over the size limit, a merged log with an entry that can't be real, and the
  // SimBrief request's failures (a 5xx reply, no answer in time, an unexpected error).
  { name: "log-too-large", only: "desktop", app: { hash: "#/log", before: [chooseFile("input.file", "big", "log.json")] } },
  {
    name: "log-left-out",
    only: "desktop",
    app: { hash: "#/log", before: [chooseFile("input.file", JSON.stringify({ format: 1, flights: [IMPOSSIBLE], practice: [] }), "log.json")] },
  },
  {
    name: "ofp-too-large",
    only: "desktop",
    app: { hash: "#/flight/simbrief", before: [chooseFile('.choose ~ input[type="file"]', "big", "ofp.json")] },
  },
  { name: "simbrief-503", only: "desktop", app: { hash: "#/flight/simbrief", before: simbrief("reply503") } },
  { name: "simbrief-timeout", only: "desktop", app: { hash: "#/flight/simbrief", before: [...simbrief("hang"), "new Promise((done) => setTimeout(() => done(true), 21000))"] } },
  { name: "simbrief-unexpected", only: "desktop", app: { hash: "#/flight/simbrief", before: simbrief("odd") } },
];

/**
 * Starts Firefox and sets the page's viewport to exactly `viewport` with WebDriver BiDi's
 * setViewport, since a window cannot get narrower than 500 px and phones are narrower. That command
 * needs `-remote-allow-system-access`, acceptable here: a local, headless browser with a throwaway
 * profile, opening only the pages served for these screenshots. The start page is privileged, so
 * `firstUrl` (one of those pages) is opened before the viewport is set.
 */
async function openAt(profile, prefs, viewport, firstUrl) {
  const window = { width: Math.max(viewport.width, 800), height: viewport.height + 100 };
  const firefox = await startFirefox(profile, BIDI, prefs, window, ["-remote-allow-system-access"]);
  try {
    const browser = await session(BIDI);
    await browser.send("script.addPreloadScript", { functionDeclaration: FROZEN });
    await browser.send("browsingContext.navigate", { context: browser.context, url: firstUrl, wait: "complete" });
    await browser.send("browsingContext.setViewport", { context: browser.context, viewport });
    const got = await browser.js("[innerWidth, innerHeight].join('x')");
    if (got !== `${viewport.width}x${viewport.height}`) {
      throw new Error(`viewport ${got}, wanted ${viewport.width}x${viewport.height}`);
    }
    return { firefox, browser };
  } catch (e) {
    firefox.kill();
    throw e;
  }
}

/** On the first launch (no packs on this device), downloads the iFly pack from the catalog, as a
 * pilot does; the app then starts on it. */
async function installIfly(browser, target) {
  await visit(browser, target.url(""), target.ready);
  const first = await browser.js(`!!document.querySelector(".packs.first")`);
  if (!first) return;
  await browser.until(`!!document.querySelector('button[aria-label="Download iFly 737 MAX 8"]')`, "the catalog");
  await browser.run(click('button[aria-label="Download iFly 737 MAX 8"]'));
  await browser.until(`!!document.querySelector("#drawer")`, "the iFly pack to open");
}

async function visit(browser, url, ready) {
  await browser.send("browsingContext.navigate", { context: browser.context, url, wait: "complete" });
  await browser.until(ready, "the page to be ready");
}

async function shoot(browser, url, ready, steps, file, full = false, tour = false) {
  const { send, js, call, run, until, context } = browser;
  await send("browsingContext.navigate", { context, url, wait: "complete" });
  await until(ready, "the page to be ready");
  await js("document.fonts.ready.then(() => true)");
  await sleep(300);
  for (const step of steps ?? []) {
    await js(closeWelcome).catch(() => true);
    // A step is a scene step (a fixed script or a function with its data, scenes.mjs), or { keys }
    // pressed as real keys (WebDriver BiDi input), so keyboard focus shows as it does for a pilot.
    if (typeof step === "object" && "keys" in step) {
      // Each entry is one key, or a chord such as ["\uE008", "\uE004"] (Shift Tab).
      const actions = step.keys.flatMap((k) => {
        const chord = Array.isArray(k) ? k : [k];
        return [...chord.map((value) => ({ type: "keyDown", value })), ...chord.toReversed().map((value) => ({ type: "keyUp", value }))];
      });
      await send("input.performActions", { context, actions: [{ type: "key", id: "keyboard", actions }] });
    } else await run(step);
    await sleep(350);
  }
  if (!tour) await js(closeWelcome).catch(() => true);
  await sleep(300);
  if (await js("!!document.getElementById('update-ready')")) process.stderr.write(`update offer showing: ${file}\n`);
  // SCREENSHOTS_IF: keep only the shots where this selector matches (a wide tile among several, say).
  const only = process.env.SCREENSHOTS_IF;
  if (only && !(await call((selector) => !!document.querySelector(selector), only))) return;
  const { data } = await send("browsingContext.captureScreenshot", { context });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  if (full) await shootWhole(browser, file);
}

/**
 * The whole screen, not only what the viewport shows: the full page (`-page.png`) and the side
 * pane from top to bottom in viewport-high slices (`-pane-<n>.png`, with `-pane.json` giving each
 * slice's scroll offset), so a drawing or legend below the fold shows up in review.
 */
async function shootWhole(browser, file) {
  const { send, js, call, context } = browser;
  const base = file.replace(/\.png$/, "");
  // The whole page only when it is taller than the screen: otherwise it is the shot itself.
  if (await js("document.documentElement.scrollHeight > innerHeight + 1")) {
    const page = await send("browsingContext.captureScreenshot", { context, origin: "document" });
    fs.writeFileSync(`${base}-page.png`, Buffer.from(page.data, "base64"));
  }
  // What scrolls on its own: the side pane, or on the Flight pages the section column (the whole
  // body on narrow screens), or How procedures work's reading column or phone page, sliced top to
  // bottom.
  const sel = await js(
    `["aside.pane", "main.fmain", ".flight .cols", ".how main.read", ".how main.page", ".log .body", ".log main.list", ".log main.page", ".refs .body"].find((s) => { const e = document.querySelector(s); return e && e.clientHeight > 0 && (s === "aside.pane" || e.scrollHeight > e.clientHeight + 1); }) ?? null`,
  );
  if (!sel) return;
  const box = await call((sel) => {
    const p = document.querySelector(sel);
    const r = p.getBoundingClientRect();
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, scroll: p.scrollHeight, view: p.clientHeight, top: p.scrollTop });
  }, sel);
  /** Scrolls the pane to `top`, and answers where it ended up. */
  const scrollTo = (top) =>
    call(({ sel, top }) => {
      const p = document.querySelector(sel);
      p.scrollTop = top;
      return p.scrollTop;
    }, { sel, top });
  const pane = JSON.parse(box);
  if (!pane.w || !pane.h) return;
  const offsets = [];
  for (let at = 0; ; at += pane.view) {
    const top = Math.min(at, pane.scroll - pane.view);
    await scrollTo(top);
    await sleep(250);
    const real = await scrollTo(top);
    const shot = await send("browsingContext.captureScreenshot", {
      context,
      clip: { type: "box", x: pane.x, y: pane.y, width: pane.w, height: pane.h },
    });
    fs.writeFileSync(`${base}-pane-${offsets.length}.png`, Buffer.from(shot.data, "base64"));
    offsets.push(real);
    if (top >= pane.scroll - pane.view) break;
  }
  fs.writeFileSync(`${base}-pane.json`, JSON.stringify({ offsets, height: pane.scroll, view: pane.view, what: sel }));
  await scrollTo(pane.top);
}

/**
 * One side-by-side image per pair, each image at its own size: `left` (a board, or the 3.0 screen)
 * and `right` (the app's shot), labeled, into `dir`.
 */
async function compose(pairs) {
  if (!pairs.length) return [];
  const work2 = path.join(work, "compose");
  fs.rmSync(work2, { recursive: true, force: true });
  fs.mkdirSync(work2, { recursive: true });
  fs.writeFileSync(path.join(work2, "index.html"), "<!doctype html><title>compose</title>");
  const size = (file) => {
    // A PNG's width and height are bytes 16 to 24 of its header.
    const head = fs.readFileSync(file).subarray(16, 24);
    return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
  };
  const sized = pairs.map((p) => ({ ...p, l: size(p.left), r: size(p.right) }));
  const canvas = {
    width: Math.max(...sized.map((p) => p.l.width + p.r.width + 16)),
    height: Math.max(...sized.map((p) => Math.max(p.l.height, p.r.height) + 28)),
  };
  const server = await serve(work2, 8774);
  const written = [];
  try {
    const { firefox, browser } = await openAt(path.join(work, "profile-compose"), {}, canvas, "http://localhost:8774/");
    try {
      for (const [n, p] of sized.entries()) {
        fs.copyFileSync(p.left, path.join(work2, `${n}-left.png`));
        fs.copyFileSync(p.right, path.join(work2, `${n}-right.png`));
        const half = (label, src, { width, height }) =>
          `<div style="width:${width}px"><p>${label}</p><img src="${src}" width="${width}" height="${height}"></div>`;
        fs.writeFileSync(
          path.join(work2, `${n}.html`),
          `<!doctype html><meta charset="utf-8"><style>body{margin:0;display:inline-flex;gap:16px;align-items:flex-start;background:#7a7f87}` +
            `p{margin:0;padding-left:12px;font:600 14px/28px sans-serif;color:#fff}img{display:block}</style>` +
            half(p.leftLabel, `${n}-left.png`, p.l) +
            half(p.rightLabel, `${n}-right.png`, p.r),
        );
        await browser.send("browsingContext.navigate", { context: browser.context, url: `http://localhost:8774/${n}.html`, wait: "complete" });
        await browser.until("[...document.images].every((i) => i.complete)", "the images");
        const box = JSON.parse(await browser.js("JSON.stringify(document.body.getBoundingClientRect())"));
        const { data } = await browser.send("browsingContext.captureScreenshot", {
          context: browser.context,
          clip: { type: "box", x: 0, y: 0, width: box.width, height: box.height },
        });
        fs.mkdirSync(p.dir, { recursive: true });
        fs.writeFileSync(path.join(p.dir, `${p.key}.png`), Buffer.from(data, "base64"));
        written.push(path.join(path.basename(p.dir), `${p.key}.png`));
      }
    } finally {
      firefox.kill();
      await sleep(500);
    }
  } finally {
    server.close();
  }
  return written;
}

/** The approved boards for the shots written, rendered by board-shots.mjs, each beside its shot. */
async function besideBoards(out, written) {
  const pairs = [];
  const alone = [];
  for (const file of written) {
    // Sizes have dashes too ("tablet-landscape"), so the longest that ends the name wins.
    const theme = file.endsWith("-dark.png") ? "dark" : file.endsWith("-light.png") ? "light" : null;
    const size = Object.keys(VIEWPORTS)
      .sort((a, b) => b.length - a.length)
      .find((v) => theme && file.endsWith(`-${v}-${theme}.png`));
    if (!theme || !size) continue;
    const name = file.slice(0, -`-${size}-${theme}.png`.length);
    const board = REVIEW_BOARDS[name]?.[size];
    if (!board) {
      alone.push(file);
      continue;
    }
    pairs.push({ key: `${name}-${size}-${theme}`, board, theme });
  }
  const boards = [...new Set(pairs.map((p) => p.board))];
  if (boards.length) {
    const dir = path.join(out, "boards");
    const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "board-shots.mjs"), dir, ...boards], { stdio: ["ignore", "ignore", "inherit"] });
    if (run.status !== 0) throw new Error("board-shots.mjs failed");
  }
  const made = await compose(
    pairs.map((p) => ({
      key: p.key,
      left: path.join(out, "boards", `${p.board}-${p.theme}.png`),
      leftLabel: `Board: ${p.board}`,
      right: path.join(out, `${p.key}.png`),
      rightLabel: "App",
      dir: path.join(out, "side-by-side"),
    })),
  );
  return { made, alone };
}

async function main() {
  const out = path.resolve(process.argv[2] ?? "");
  const names = process.argv.slice(3);
  const prefixes = (process.env.SCREENSHOTS_ONLY ?? "").split(",").filter(Boolean);
  if (!process.argv[2] || (!names.length && !prefixes.length)) {
    throw new Error("usage: screenshots.mjs <out-dir> <screen>... (name the screens a pull request adds or changes)");
  }
  const unknown = names.filter((n) => !SHOTS.some((s) => s.name === n));
  if (unknown.length) throw new Error(`no screen named ${unknown.join(", ")} (the names are in SHOTS in screenshots.mjs)`);
  if (!fs.existsSync(path.join(dist, "app/index.html"))) throw new Error("build the site first: just site");
  const baseline = process.env.INVOLO_BASELINE ? path.resolve(process.env.INVOLO_BASELINE) : null;
  if (baseline && !fs.existsSync(baseline)) throw new Error(`INVOLO_BASELINE: no such file ${baseline}`);
  fs.mkdirSync(out, { recursive: true });

  const targets = [
    {
      side: "app",
      root: dist,
      port: 8772,
      // A fresh query each time, so each screen is a new page load and starts from a new flight.
      url: (hash) => `http://localhost:8772/app/?shot=${Date.now()}${hash}`,
      ready: "!!document.querySelector('[data-app-ready]')",
      dir: out,
      // The app saves progress on the device: each screen starts from nothing saved. The Flight log
      // lives in IndexedDB: cleared too, with any pack but the iFly pack the browser installed.
      reset: `localStorage.clear(); sessionStorage.clear(); new Promise((done) => { const r = indexedDB.open("involo"); r.onerror = () => done(true); r.onsuccess = () => { const db = r.result; const stores = ["log", "packs"].filter((x) => db.objectStoreNames.contains(x)); if (!stores.length) { db.close(); return done(true); } const tx = db.transaction(stores, "readwrite"); if (stores.includes("log")) tx.objectStore("log").clear(); if (stores.includes("packs")) { const all = tx.objectStore("packs").getAllKeys(); all.onsuccess = () => { for (const k of all.result) if (k !== "ifly-737-max8") tx.objectStore("packs").delete(k); }; } tx.oncomplete = () => { db.close(); done(true); }; }; })`,
    },
  ];
  if (baseline) {
    fs.mkdirSync(path.join(out, "baseline"), { recursive: true });
    targets.push({
      side: "base",
      root: path.dirname(baseline),
      port: 8773,
      url: (hash) => `http://localhost:8773/${encodeURIComponent(path.basename(baseline))}?${Date.now()}${hash}`,
      ready: "document.readyState === 'complete'",
      dir: path.join(out, "baseline"),
      reset: "localStorage.clear(); true",
    });
  }

  const servers = await Promise.all(targets.map((t) => serve(t.root, t.port)));
  const written = [];
  const pairs = [];
  try {
    for (const [theme, override] of Object.entries(THEMES)) {
      // SCREENSHOTS_THEME=dark (or light) shoots one theme only.
      if (process.env.SCREENSHOTS_THEME && process.env.SCREENSHOTS_THEME !== theme) continue;
      for (const [size, viewport] of Object.entries(VIEWPORTS)) {
        for (const target of targets) {
          const prefs = { "layout.css.prefers-color-scheme.content-override": override };
          const wanted = (s) =>
            names.includes(s.name) || prefixes.some((o) => `${s.name}-${size}-${theme}`.startsWith(o) || `${theme}-${size}`.endsWith(o));
          const fits = (s) => (!s.only ? !viewport.named : [s.only].flat().includes(size));
          const shots = SHOTS.filter((s) => fits(s) && wanted(s));
          if (!shots.length) continue;
          const profile = path.join(work, `profile-${target.side}-${theme}-${size}`);
          const { firefox, browser } = await openAt(profile, prefs, { width: viewport.width, height: viewport.height }, target.url(""));
          // The settings a pilot has after answering the tour's welcome ("Not now"), saved once per
          // browser: each shot starts from them, so no shot shows the welcome or a fresh save time.
          let seen = "";
          if (target.side === "app") {
            await installIfly(browser, target);
            await visit(browser, target.url(""), target.ready);
            await browser.js(`localStorage.clear(); sessionStorage.clear(); true`);
            await visit(browser, target.url(""), target.ready);
            await browser.until(`!!document.querySelector('[aria-label="Welcome to Involo"]')`, "the welcome").catch(() => {});
            await browser.js(closeWelcome);
            await sleep(500);
            seen = await browser.js(`JSON.stringify(Object.entries(localStorage).filter(([k]) => /settings$/.test(k)))`);
          }
          try {
            for (const shot of shots) {
              if (!shot[target.side]) continue;
              const { hash, before, page } = shot[target.side];
              const full = target.side === "app" && !!shot.full;
              const key = `${shot.name}-${size}-${theme}`;
              // One retry, in case a page stalls once.
              for (let attempt = 1; ; attempt++) {
                try {
                  if (target.reset) {
                    await visit(browser, target.url(hash), target.ready);
                    await browser.js(target.reset);
                    if (seen)
                      await browser.call((entries) => {
                        for (const [k, v] of entries) localStorage.setItem(k, v);
                        return true;
                      }, JSON.parse(seen));
                  }
                  // A design gallery page (with the theme in its query) instead of the app.
                  const at = page ? `http://localhost:${target.port}/${page.replace("{theme}", theme)}` : target.url(hash);
                  await shoot(browser, at, page ? "document.readyState === 'complete'" : target.ready, before, path.join(target.dir, `${key}.png`), full, !!shot.tour);
                  break;
                } catch (e) {
                  if (attempt === 2) throw e;
                  process.stderr.write(`retrying ${target.side} ${key}: ${e.message}\n`);
                }
              }
              // The shot changed the installed packs: back to iFly alone, installed as a pilot does.
              if (shot.fresh && target.side === "app") {
                await browser.js(`new Promise((done) => { const r = indexedDB.deleteDatabase("involo"); r.onsuccess = r.onerror = r.onblocked = () => done(true); })`);
                await installIfly(browser, target);
              }
              if (target.side === "app") written.push(`${key}.png`);
              else pairs.push(key);
            }
          } finally {
            firefox.kill();
            await sleep(500);
          }
        }
      }
    }
  } finally {
    for (const s of servers) s.close();
  }
  if (baseline) {
    written.push(...pairs.map((k) => `baseline/${k}.png`));
    written.push(
      ...(await compose(
        pairs.map((k) => ({
          key: k,
          left: path.join(out, "baseline", `${k}.png`),
          leftLabel: "3.0",
          right: path.join(out, `${k}.png`),
          rightLabel: "New",
          dir: path.join(out, "compare"),
        })),
      )),
    );
  }
  const { made, alone } = await besideBoards(out, written.filter((f) => !f.includes("/")));
  written.push(...made);
  if (alone.length) process.stdout.write(`no board in review-boards.mjs for: ${alone.join(", ")}\n`);
  process.stdout.write(`screenshots: ${written.length} files in ${out}\n${written.join("\n")}\n`);
}

await main();
