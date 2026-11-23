// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type {
  Action,
  CduWalk,
  ControlsFile,
  FlatPack,
  Flight,
  Loaded,
  Overview,
  PackChanges,
  PhaseModel,
  PracticeResult,
  Rail,
  RailPhase,
  SavedPlan,
  Settings,
  Step,
  StepState,
  ViewFrame,
} from "@involo/bindings";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.svelte";
import { type Host, hostContext, type InstalledPack } from "./host";
import { visit } from "./lib/practice-visit.svelte";
import Root from "./Root.svelte";
import { appLabels, iflyPack } from "./test-pack";

function phase(id: string, title: string, done: number, skipped: number, total: number): RailPhase {
  const progress = { done, skipped, toDo: total - done - skipped, total };
  return { id, title, progress, complete: done === total, open: total - done, skipped };
}

const rail: Rail = {
  stages: [
    {
      id: "preflight",
      title: "Preflight",
      phases: [phase("power-up", "Power up", 0, 1, 2), phase("exterior", "Exterior", 18, 0, 18)],
    },
    { id: "departure", title: "Departure", phases: [phase("taxi", "Taxi", 0, 0, 9)] },
  ],
  reference: [phase("memory", "Memory items", 0, 0, 12)],
};

/** The iFly pack's flight file, each field its steps fill marked `needed`. */
function neededAsInIfly() {
  const ifly = iflyPack();
  const filled = new Set(ifly.lists.flatMap((l) => l.steps.flatMap((st) => st.fill ?? [])));
  const file = structuredClone(ifly.content.flight);
  for (const f of file?.fields ?? []) if (filled.has(f.id)) f.needed = true;
  return file;
}

const pack = {
  manifest: { name: "Demo aircraft" },
  lists: [
    {
      id: "power-up-flow",
      title: "Power up flow",
      kind: "flow",
      when: "Cold and dark.",
      why: "Power comes first.",
      steps: [
        {
          id: "battery",
          number: 1,
          text: "BATTERY",
          expect: "ON",
          why: "First power.",
          check: "Voltage shows",
        },
        // No number in the pack, as for some real steps; the shown number comes from Rust.
        { id: "standby", text: "STANDBY POWER", expect: "AUTO", controls: ["stby"] },
      ],
    },
  ],
  content: {
    labels: appLabels(),
    // The iFly pack's flight fields and pages, for the Flight pages; the fields its steps fill
    // count as needed, as they do there (these invented steps fill none).
    flight: neededAsInIfly(),
    // An invented term, for the Glossary.
    glossary: { terms: [{ term: "WGT", meaning: "Widget gate timer. Times the widget gate." }] },
    phases: {
      options: [
        {
          id: "power",
          title: "Power source",
          values: ["gpu", "apu"],
          default: "gpu",
          choices: [
            { value: "gpu", label: "Ground power at the gate", description: "Start the APU later." },
            { value: "apu", label: "No ground power", description: "Start the APU now." },
          ],
          askIn: ["power-up"],
        },
        // The iFly pack's Start page options.
        ...(iflyPack().content.phases?.options ?? []).filter((o) => o.id === "exterior" || o.id === "start"),
      ],
      startPage: ["exterior", "panel_state", "start"],
      stages: [],
      phases: [],
    },
    controls: {
      zones: [{ id: "elec", area: "Forward overhead", title: "Electrical", shortTitle: "ELEC" }],
      controls: [
        {
          id: "stby",
          name: "Standby power switch",
          zone: "elec",
          location: "Forward overhead.",
          function: "Powers the standby bus.",
        },
      ],
    },
    panels: [],
  },
  // As the app receives a pack: with the names Rust gives its steps and controls when it reads it.
  names: {
    steps: { battery: "Battery", standby: "Standby power" },
    controls: { stby: "Standby power switch" },
  },
} as unknown as FlatPack;

function view(states: [StepState, StepState]): PhaseModel {
  const done = states.filter((s) => s === "done").length;
  const skipped = states.filter((s) => s === "skipped").length;
  const progress = { done, skipped, toDo: 2 - done - skipped, total: 2 };
  const ids = ["battery", "standby"];
  const current = ids[states.indexOf("current")] ?? null;
  return {
    id: "power-up",
    title: "Power up",
    reference: false,
    stage: "Preflight",
    position: [1, 2],
    previous: null,
    next: { id: "exterior", title: "Exterior" },
    lists: [
      {
        id: "power-up-flow",
        title: "Power up flow",
        kind: "flow",
        steps: ids.map((id, i) => ({
          id,
          number: i + 1,
          state: states[i] as StepState,
          counts: true,
          targets: [],
          essential: i === 0,
          values: [],
          hint: "",
        })),
        hidden: 0,
        progress,
        complete: done === 2,
        current,
      },
    ],
    progress,
    complete: done === 2,
    strip: [],
    note: "",
    arrival: false,
  };
}

/** The pack the tests' device has installed. */
const DEMO: InstalledPack = {
  summary: { id: "demo", name: "Demo", version: "0.1.0", kind: "aircraft" },
  source: "catalog",
  installedAt: 1,
};

function host(overrides: Partial<Host> = {}): Host {
  const h: Omit<Host, "readSettings"> & Partial<Pick<Host, "readSettings">> = {
    appInfo: async () => ({ name: "Involo", version: "0.1.0", packSchemaVersion: 2 }),
    installedPacks: async () => [DEMO],
    loadPack: async () => pack,
    catalog: async () => [],
    installPackFile: async () => ({ state: "refused", reasons: ["no packs in tests"] }),
    installCatalogPack: async () => ({ state: "refused", reasons: ["no packs in tests"] }),
    removePack: async () => false,
    removeSaved: async () => true,
    packChanges: async () => {
      throw new Error("no updates in tests");
    },
    reconcile: async (_p, f) => f,
    restoreFlight: async (_p, f) => f,
    newFlight: async () =>
      ({
        pack: "demo",
        options: { power: "gpu" },
        session: { done: {}, skipped: {} },
        values: {},
      }) as unknown as Flight,
    apply: async (_pack, flight) => flight,
    rail: async () => rail,
    phaseModel: async () => view(["skipped", "current"]),
    openSteps: async () => [],
    suggestion: async () => null,
    calculated: async () => ({}),
    seatFrame: async () => null,
    timers: async () => [],
    cduWalkthrough: async () => null,
    readSaved: async () => ({ flight: null, settings: null }),
    savedPacks: async () => [],
    backupText: async () => "{}",
    readBackup: async () => ({ state: "refused", refusal: { kind: "notBackup" } }),
    save: async () => 0,
    setAside: async () => true,
    defaultSettings: async () =>
      ({
        theme: "dark",
        dimming: 0,
        detail: "expanded",
        listView: "checklist",
        tourSeen: true,
        noticeSeen: true,
      }) as Settings,
    fetchPlan: async () => {
      throw new Error("no network in tests");
    },
    readPlanFile: async () => {
      throw new Error("no plan file in tests");
    },
    planValues: async () => ({ values: {}, filled: 0, origin: "", destination: "", checkClearance: false }),
    otherAircraft: async () => null,
    readPlan: async () => null,
    savePlan: async () => {},
    decodeMetar: async () => ({ station: null, time: null, groups: [], rows: [] }),
    decodeTaf: async () => ({ station: null, time: null, groups: [], rows: [] }),
    ...fakeLog(),
    ...overrides,
  };
  // Settings are read on their own now; a test that saves them with the flight reads them there.
  return { ...h, readSettings: h.readSettings ?? (async () => (await h.readSaved("demo")).settings) };
}

/** The Flight log's host calls, with the log's rules reduced to what these tests need (the real
 * ones are Rust's, tested there): entries newest first, added or deleted by id. */
function fakeLog(): Pick<
  Host,
  "newLog" | "readLog" | "saveLog" | "logEntry" | "practiceResult" | "editLog" | "logCsv"
> {
  return {
    newLog: async () => ({ format: 1, flights: [], practice: [] }),
    readLog: async () => null,
    saveLog: async () => true,
    logEntry: async (pack, flight, _settings, plan, at) => ({
      id: `${pack}@${at}`,
      loggedAt: at,
      pack,
      packVersion: "0.1.0",
      packName: "Demo",
      aircraft: "Demo jet",
      origin: flight.values.origin ?? "",
      destination: flight.values.destination ?? "",
      offBlocks: Object.values(flight.session.done)[0] ?? null,
      onBlocks: Object.values(flight.session.done).at(-1) ?? null,
      stages: [],
      done: Object.keys(flight.session.done).length,
      total: 4,
      skipped: [],
      plan,
      finished: false,
      ticks: Object.entries(flight.session.done).map(([step, at]) => ({
        at,
        step,
        text: step,
        name: step,
        value: "ON",
      })),
    }),
    practiceResult: async (pack, r) => ({
      id: `${pack}@${r.at}`,
      pack,
      packVersion: "0.1.0",
      packName: "Demo",
      aircraft: "Demo jet",
      ...r,
    }),
    editLog: async (log, edit) => {
      const next = { ...log, flights: [...log.flights], practice: [...log.practice] };
      if (edit.type === "addFlight") next.flights.unshift(edit.flight);
      if (edit.type === "addPractice") next.practice.unshift(edit.result);
      if (edit.type === "deleteFlight") next.flights = next.flights.filter((f) => f.id !== edit.id);
      return {
        log: next,
        addedFlights: 0,
        addedPractice: 0,
        already: 0,
        droppedFlights: 0,
        droppedPractice: 0,
        refused: edit.type === "merge" && edit.text.includes("impossible") ? 2 : 0,
      };
    },
    logCsv: async () => "",
  };
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // A practice visit lasts for the module (practice-visit.svelte): each test starts with none.
  visit.test = null;
  visit.last = null;
});

/** A window `width` px wide, for the media queries the app reads (min-width, max-width). */
function screenWidth(width: number): void {
  vi.stubGlobal("matchMedia", (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])) && !!(min || max);
    return {
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  });
}

async function waitForElement(selector: string): Promise<Element> {
  for (let n = 0; n < 50; n++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`no ${selector}`);
}

describe("App", () => {
  it("shows the header logo: the decorative mark, then the live wordmark; tells the host the theme", async () => {
    const themes: string[] = [];
    render(App, { context: hostContext(host({ themeChanged: (t) => themes.push(t) })) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const name = document.querySelector<HTMLElement>("header.top .brand .name");
    expect(name?.textContent?.trim()).toBe("involo");
    const mark = name?.querySelector(".mark");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.querySelector("svg path")?.getAttribute("fill")).toBe("var(--color-text-strong)");
    expect(themes).toContain("dark");
  });

  it("lays out stages, phase chips and steps, with states in words", async () => {
    render(App, { context: hostContext(host()) });

    expect(await screen.findByRole("heading", { level: 1, name: "Power up" })).toBeTruthy();
    const stages = screen.getByRole("navigation", { name: "Stages" });
    expect(
      within(stages)
        .getByRole("link", { name: /^Preflight/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: "Exterior, complete" })).toBeTruthy();
    // The current phase is boxed with its count.
    const phase = screen.getByRole("link", { name: /^Power up/ });
    expect(phase.getAttribute("aria-current")).toBe("step");
    expect(phase.querySelector(".count")?.textContent).toMatch(/^\d+\/\d+$/);
    expect(
      screen.getByRole("button", { name: /^Battery , in Essentials , skipped, still open/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Standby power , current/ })).toBeTruthy();
    const top = document.querySelector<HTMLElement>("header.top");
    expect(
      top &&
        within(top)
          .getByRole("link", { name: /Emergency/ })
          .getAttribute("href"),
    ).toBe("#/reference");
  });

  it("ticks through the host and gives the completion call only when nothing is open", async () => {
    const actions: Action[] = [];
    const after: [StepState, StepState][] = [
      ["skipped", "done"],
      ["done", "done"],
    ];
    let states: [StepState, StepState] = ["skipped", "current"];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        states = after.shift() ?? states;
        return { ...flight };
      },
      phaseModel: async () => view(states),
    });
    render(App, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    expect(await screen.findByText("1 skipped step still open. Power up flow is not complete.")).toBeTruthy();
    expect(screen.queryByText("Power up flow complete")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Confirm Battery: ON" }));
    expect(await screen.findByText("Power up flow complete")).toBeTruthy();
    expect(actions.map((a) => a.type === "tick" && a.step)).toEqual(["standby", "battery"]);
  });

  it("puts the version at the foot of Settings, with What's new linking to the release notes", async () => {
    window.location.hash = "#/settings";
    render(App, { context: hostContext(host()) });
    const line = await screen.findByText(/Involo 0\.1\.0/);
    const link = screen.getByRole("link", { name: "What’s new" });
    expect(line.contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe("https://github.com/offbyonce/involo/releases");
  });

  it("never acts on the list under the stage picker or the menu (Space, S, P)", async () => {
    screenWidth(820);
    const actions: Action[] = [];
    render(App, {
      context: hostContext(
        host({
          apply: async (_pack, flight, action) => {
            actions.push(action);
            return { ...flight };
          },
        }),
      ),
    });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: /^Stage and phase: Preflight/ }));
    expect(screen.getByRole("dialog", { name: "Stage and phase" })).toBeTruthy();
    for (const key of [" ", "s", "p"]) await fireEvent.keyDown(window, { key });
    await fireEvent.keyDown(window, { key: "Escape" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    for (const key of [" ", "s", "p"]) await fireEvent.keyDown(window, { key });
    expect(actions).toEqual([]);
    expect(document.querySelector(".slide-box")).toBeNull();
  });

  it("opens an emergency step in place below 900 px, as a phase step does", async () => {
    screenWidth(390);
    window.location.hash = "#/reference";
    render(App, { context: hostContext(host()) });
    const row = (await waitForElement(".it")) as HTMLElement;
    await fireEvent.click(row.querySelector("button.row") as HTMLElement);
    await vi.waitFor(() => expect(row.querySelector(".opened .pane-step")).toBeTruthy());
  });

  it("opens the current step in place on tablet portrait, with Skip for now in its row menu", async () => {
    screenWidth(820);
    let states: [StepState, StepState] = ["current", "to_do"];
    render(App, { context: hostContext(host({ phaseModel: async () => view(states) })) });

    await screen.findByRole("heading", { level: 1, name: "Power up" });
    // No side pane below 900 px: the pane's content opens in the current step's row, once.
    const inline = (await waitForElement(".it .opened")) as HTMLElement;
    expect(within(inline).getAllByText(/First power\./)).toHaveLength(1);
    expect(document.querySelectorAll(".pane-step")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Show details for/ })).toBeNull();
    // The current step's Skip for now (the bottom bar), and every row's menu, skip it.
    expect(screen.getAllByRole("button", { name: "Skip for now" }).length).toBeGreaterThan(0);
    await fireEvent.click(screen.getByRole("button", { name: "More actions for Battery" }));
    expect(screen.getByRole("menuitem", { name: "Skip for now" })).toBeTruthy();
    states = ["skipped", "current"];
  });

  describe("Settings rows from 3.0 (#245)", () => {
    it("Keep screen awake asks the host to hold the screen, and Start sets the flight's start option", async () => {
      const held: boolean[] = [];
      const actions: Action[] = [];
      const h = host({
        canKeepAwake: () => true,
        keepAwake: async (on) => {
          held.push(on);
          return on;
        },
        apply: async (_p, flight, action) => {
          actions.push(action);
          return flight;
        },
      });
      render(App, { context: hostContext(h) });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      window.location.hash = "#/settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await fireEvent.click(await screen.findByRole("switch", { name: "Keep screen awake" }));
      await waitFor(() => expect(held.at(-1)).toBe(true));
      const start = screen.queryByRole("radiogroup", { name: "Start" });
      if (start) {
        const radios = within(start).getAllByRole("radio");
        await fireEvent.click(radios.at(-1) as HTMLElement);
        expect(actions.at(-1)?.type).toBe("setOption");
      }
    });

    it("Clear all progress clears every pack's saved flight and plan at once, and Undo puts them back", async () => {
      const actions: Action[] = [];
      const removed: string[] = [];
      const savedFlights: [string, unknown][] = [];
      const plans: [string, SavedPlan | null][] = [];
      const other = { pack: "other", session: { done: { x: 1 }, skipped: {} } } as unknown as Flight;
      const h = host({
        savedPacks: async () => ["demo", "other"],
        readSaved: async (id) =>
          id === "other"
            ? {
                flight: { loaded: { state: "ready", value: other, migratedFrom: null }, text: "{}" },
                settings: null,
              }
            : { flight: null, settings: null },
        removeSaved: async (id) => {
          removed.push(id);
          return true;
        },
        apply: async (_p, flight, action) => {
          actions.push(action);
          return flight;
        },
        save: async (id, what, value) => {
          if (what === "flight") savedFlights.push([id, value]);
          return 0;
        },
        savePlan: async (id, plan) => {
          plans.push([id, plan]);
        },
      });
      render(App, { context: hostContext(h) });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      window.location.hash = "#/settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await fireEvent.click(await screen.findByRole("button", { name: "Clear all progress" }));
      await waitFor(() => expect(actions.at(-1)).toEqual({ type: "clear" }));
      expect(removed).toEqual(["other"]);
      await waitFor(() => expect(plans).toContainEqual(["demo", null]));
      expect(await screen.findByText("All progress cleared.")).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await waitFor(() => expect(savedFlights.some(([id, f]) => id === "other" && f === other)).toBe(true));
    });
  });

  it("ends every step's menu with Report a problem, opening the issue form for that step in a new tab (#242)", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "More actions for Battery" }));
    const menu = screen.getByRole("menu", { name: "Actions for Battery" });
    const items = within(menu).getAllByRole("menuitem");
    const report = items.at(-1) as HTMLAnchorElement;
    expect(report.textContent?.trim()).toBe("Report a problem with this step");
    expect(report.target).toBe("_blank");
    expect(report.rel).toBe("noopener noreferrer");
    expect(report.getAttribute("aria-describedby")).toBeTruthy();
    expect(within(menu).getByText("Opens a GitHub issue form with this step filled in.")).toBeTruthy();
    const url = new URL(report.href);
    expect(url.searchParams.get("template")).toBe("step-problem.yml");
    expect(url.searchParams.get("pack")).toBe("demo 0.1.0");
    expect(url.searchParams.get("step")).toMatch(/battery/);
    expect(url.searchParams.get("app")).toBe("0.1.0");
    expect([...url.searchParams.keys()].sort()).toEqual(["app", "list", "pack", "step", "template"]);
  });

  it("a pack with no quick steps offers no Essentials: not in the menu, nor in a row's menu, and shows in Full (#133)", async () => {
    const plain = structuredClone(pack);
    for (const list of plain.lists) for (const step of list.steps) step.quick = null;
    const asked: Settings[] = [];
    const saved = {
      theme: "dark",
      dimming: 0,
      detail: "expanded",
      listView: "checklist",
      tourSeen: true,
      noticeSeen: true,
      essentials: true,
    } as Settings;
    render(App, {
      context: hostContext(
        host({
          loadPack: async () => plain,
          readSaved: async () => ({
            flight: null,
            settings: {
              loaded: { state: "ready", value: saved, migratedFrom: null } as Loaded<Settings>,
              text: "{}",
            },
          }),
          phaseModel: async (_p, _f, s) => {
            asked.push(s);
            return view(["skipped", "current"]);
          },
        }),
      ),
    });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "More actions for Battery" }));
    expect(screen.queryByRole("menuitem", { name: /Essentials/ })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.queryByRole("group", { name: "Steps shown" })).toBeNull();
    // Saved as Essentials, but the pack has none: no second, Full list is fetched to compare with.
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.some((s) => !s.essentials)).toBe(false);
  });

  it("shows the options the pack asks for on a phase as cards, and applies a choice", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight, options: { power: "apu" } };
      },
    });
    render(App, { context: hostContext(h) });

    const gpu = await screen.findByRole("button", { name: /Ground power at the gate/ });
    expect(gpu.getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: /No ground power/ }));
    expect(actions[0]).toEqual({ type: "setOption", option: "power", value: "apu" });
    expect(
      (await screen.findByRole("button", { name: /No ground power/ })).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps flight values in the Flight pages and leads there from the first phase", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        if (action.type === "setValue")
          return { ...flight, values: { ...flight.values, [action.field]: action.value } };
        if (action.type === "setOption")
          return { ...flight, options: { ...flight.options, [action.option]: action.value } };
        return flight;
      },
    });
    render(App, { context: hostContext(h) });

    const back = await screen.findByRole("link", { name: "Flight" });
    expect(back.getAttribute("href")).toBe("#/flight/overview");
    window.location.hash = "#/setup";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    // Flight setup's address leads to the Flight pages' Overview.
    expect(await screen.findByRole("heading", { level: 1, name: "Flight" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Flight sections" });
    expect(within(nav).getByRole("link", { name: /^Takeoff/ }).textContent).toMatch(/to enter/);

    window.location.hash = "#/flight/clearance";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { level: 2, name: "Clearance" })).toBeTruthy();
    await fireEvent.change(screen.getByLabelText("Runway"), { target: { value: "16l" } });
    expect(actions.at(-1)).toEqual({ type: "setValue", field: "runway", value: "16L" });

    window.location.hash = "#/flight/start";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await fireEvent.click(await screen.findByRole("switch", { name: "Turnaround" }));
    expect(actions.at(-1)).toEqual({ type: "setOption", option: "start", value: "turn" });
    // An option the flight has no value for yet reads as on (the pack's default in Rust).
    await fireEvent.click(screen.getByRole("switch", { name: "Exterior inspection" }));
    expect(actions.at(-1)).toEqual({ type: "setOption", option: "exterior", value: "off" });
  });

  it("shows the clearance in the flight strip, edits it in the strip panel, and resets with Undo", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        if (action.type === "setValue")
          return { ...flight, values: { ...flight.values, [action.field]: action.value } };
        if (action.type === "clear") return { ...flight, values: {} };
        return flight;
      },
      phaseModel: async () => view(["skipped", "current"]),
    });
    render(App, { context: hostContext(h) });

    // Nothing entered yet: the strip asks for the flight, and opens the panel.
    const prompt = await screen.findByRole("button", {
      name: "Add your flight: import from SimBrief or enter the clearance",
    });
    await fireEvent.click(prompt);
    expect(screen.getByRole("region", { name: "Clearance and notes" })).toBeTruthy();
    await fireEvent.input(screen.getByLabelText("Squawk"), { target: { value: "7000" } });
    expect(actions.at(-1)).toEqual({ type: "setValue", field: "squawk", value: "7000" });
    // Frequencies open in place: ground, tower and departure (StripFreq).
    await fireEvent.click(screen.getByRole("button", { name: /^Frequencies: ground, tower, departure/ }));
    expect(screen.getByLabelText("Tower")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^All flight data/ }).getAttribute("href")).toBe(
      "#/flight/overview",
    );
    // Reset flight plan resets at once and offers Undo, which brings the flight back.
    await fireEvent.click(screen.getByRole("button", { name: "Reset flight plan" }));
    expect(actions.at(-1)).toEqual({ type: "clear" });
    await fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(document.querySelector<HTMLElement>(".fsline")?.textContent).toMatch(
      /— → —.*Runway —.*Squawk 7000/,
    );
  });

  it("fills a step's blanks from flight values, keeps what the pilot types, and shows hints", async () => {
    const actions: Action[] = [];
    const withBlank = structuredClone(pack);
    const first = withBlank.lists[0]?.steps[0];
    if (!first) throw new Error("a step");
    first.expect = "V2 ___ SET";
    const shown = view(["current", "to_do"]);
    const [battery, standby] = shown.lists[0]?.steps ?? [];
    if (!battery || !standby) throw new Error("two steps");
    battery.values = ["152"];
    standby.hint = "GND 121.700";
    const h = host({
      loadPack: async () => withBlank,
      phaseModel: async () => shown,
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return flight;
      },
    });
    render(App, { context: hostContext(h) });

    const v2 = (await screen.findByLabelText("BATTERY V2")) as HTMLInputElement;
    expect(v2.value).toBe("152");
    expect(screen.getByText("SET")).toBeTruthy();
    await fireEvent.input(v2, { target: { value: "150" } });
    expect(actions.at(-1)).toEqual({ type: "setBlank", step: "battery", index: 0, value: "150" });
    expect(screen.getByText("GND 121.700")).toBeTruthy();
  });

  it("leads to Flight › Approach for arrival data on the phase the core names", async () => {
    const h = host({ phaseModel: async () => ({ ...view(["current", "to_do"]), arrival: true }) });
    render(App, { context: hostContext(h) });
    const link = await screen.findByRole("link", { name: /^Arrival data is in Flight › Approach/ });
    expect(link.getAttribute("href")).toBe("#/flight/approach");
  });

  it("opens a chosen step in place below 900 px, with what the side pane would show", async () => {
    // The opened step carries the side pane's content (Tablet and Mobile boards): here, a control
    // with a place but no drawing says so.
    screenWidth(820);
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const row = [...document.querySelectorAll(".it")].find((el) =>
      el.textContent?.includes("Standby power"),
    ) as HTMLElement;
    await fireEvent.click(row.querySelector("button.row") as HTMLElement);
    expect(await within(row).findByText("Standby power switch isn't drawn among the controls.")).toBeTruthy();
    expect(document.querySelectorAll(".it .opened")).toHaveLength(1);
  });

  it("says when a step's control is not drawn, rather than show nothing", async () => {
    // The control column has a place on the map but no drawing.
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    expect(await screen.findByText("Standby power switch isn't drawn among the controls.")).toBeTruthy();
  });

  it("shows a list's When and Why above its steps, as 3.0 does", async () => {
    // Emergency lists carried a Why in the pack that the card never showed.
    const { container } = render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const intro = container.querySelector(".when")?.textContent ?? "";
    expect(intro).toContain("When · Cold and dark.");
    expect(intro).toContain("Why · Power comes first.");
  });

  it("asks Rust for the seat view with the step's role and the pilot's seat, again when either changes, and draws it (#133)", async () => {
    // The demo pack with two seat views and crew roles; its standby step is done by the first officer.
    const frame = (text: string) =>
      ({ width: 100, height: 50, labels: [{ text, x: 50, y: 25 }] }) as ViewFrame;
    const crewed = structuredClone(pack);
    crewed.content.labels.seats = [
      { id: "left", title: "Left seat" },
      { id: "right", title: "Right seat" },
    ];
    crewed.content.labels.roles = [
      { id: "capt", title: "Captain", short: "CAPT", seat: "left" },
      { id: "fo", title: "First officer", short: "F/O", seat: "right" },
    ];
    (crewed.lists[0]?.steps[1] as Step).role = "fo";
    (crewed.content.controls as ControlsFile).overview = {
      width: 100,
      height: 50,
      areas: [],
      regions: [],
      views: { seat: { left: frame("LEFT"), right: frame("RIGHT") } },
    } as unknown as Overview;
    const asked: [string, string | null, string | null][] = [];
    const saved = {
      theme: "dark",
      dimming: 0,
      detail: "expanded",
      listView: "checklist",
      tourSeen: true,
      noticeSeen: true,
      seat: "left",
    } as Settings;
    render(App, {
      context: hostContext(
        host({
          loadPack: async () => crewed,
          readSaved: async () => ({
            flight: null,
            settings: {
              loaded: { state: "ready", value: saved, migratedFrom: null } as Loaded<Settings>,
              text: "{}",
            },
          }),
          seatFrame: async (id, role, chosen) => {
            asked.push([id, role, chosen]);
            return frame(`${role ?? "none"} from ${chosen ?? "none"}`);
          },
        }),
      ),
    });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    // The current step, standby, is the first officer's: Rust is asked with its role and the seat.
    await waitFor(() => expect(asked.at(-1)).toEqual(["demo", "fo", "left"]));
    // Where it is draws what Rust picked, titled from the labels.
    await fireEvent.keyDown(window, { key: "w" });
    await waitFor(() => expect(screen.getByText("fo from left")).toBeTruthy());
    expect(screen.getByText(crewed.content.labels.seatViewTitle)).toBeTruthy();
    await fireEvent.keyDown(window, { key: "Escape" });
    // A step with no role: asked with none.
    await fireEvent.click(screen.getByRole("button", { name: /^Battery/ }));
    await waitFor(() => expect(asked.at(-1)).toEqual(["demo", null, "left"]));
    // Settings › Your seat: the other seat, and Rust is asked again.
    window.location.hash = "#/settings";
    const seat = await screen.findByRole("radiogroup", { name: "Your seat" });
    await fireEvent.click(within(seat).getByRole("radio", { name: "Right seat · First officer" }));
    await waitFor(() => expect(asked.some(([, , chosen]) => chosen === "right")).toBe(true));
  });

  it("shows the current step in a large box in Step by step view", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(
      within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Step by step" }),
    );

    expect(await screen.findByRole("heading", { level: 1, name: "STANDBY POWER" })).toBeTruthy();
    expect(screen.getByText("Power up · Step 2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmed, next step" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(false);
    // The standby step's control has a place, so Step by step view offers "Where is this?" (in the step on
    // narrow screens, and on the side pane's location line).
    expect(screen.getAllByText("Where is this?").length).toBeGreaterThan(0);
    // Nor does the step set a control, so the hint does not ask to set it.
    expect(screen.getByText("Check it, then confirm.")).toBeTruthy();
    expect(screen.queryByText("Set it, check it, then confirm.")).toBeNull();
  });

  it("names the views List and Step by step, and settings saved as flow open in Step by step", async () => {
    // Settings saved before the views were renamed keep their value (`flow`), and open the same view.
    const saved = {
      theme: "dark",
      dimming: 0,
      detail: "expanded",
      listView: "flow",
      tourSeen: true,
      noticeSeen: true,
    } as Settings;
    const loaded = {
      loaded: { state: "ready", value: saved, migratedFrom: null } as Loaded<Settings>,
      text: "{}",
    };
    render(App, {
      context: hostContext(host({ readSaved: async () => ({ flight: null, settings: loaded }) })),
    });
    const views = await screen.findByRole("group", { name: "View" });
    expect(
      within(views)
        .getAllByRole("button")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["List", "Step by step"]);
    expect(within(views).getByRole("button", { name: "Step by step" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(views).queryByRole("button", { name: /^(Checklist|Flow)$/ })).toBeNull();
  });

  it("shows a tagged error from Rust", async () => {
    const failing = host({
      loadPack: vi.fn(() => Promise.reject({ kind: "PackInvalid", message: "pack format 3 is newer" })),
    });
    render(App, { context: hostContext(failing) });

    expect((await screen.findByRole("alert")).textContent).toBe("PackInvalid: pack format 3 is newer");
  });

  it("saves a tick on the device and shows when", async () => {
    const saves: string[] = [];
    const h = host({
      save: async (_p, what) => {
        saves.push(what);
        return new Date(2026, 10, 11, 14, 5).getTime();
      },
    });
    render(App, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    expect(await screen.findByText(/^Saved /)).toBeTruthy();
    expect(saves).toContain("flight");
  });

  it("restores saved progress", async () => {
    const savedFlight = {
      pack: "demo",
      options: { power: "apu" },
      session: { done: {}, skipped: {} },
    } as unknown as Flight;
    let given: Flight | null = null;
    const h = host({
      readSaved: async () => ({
        flight: {
          loaded: { state: "ready", value: savedFlight, migratedFrom: null } as Loaded<Flight>,
          text: "{}",
        },
        settings: null,
      }),
      phaseModel: async (_p, f) => {
        given = f;
        return view(["skipped", "current"]);
      },
    });
    render(App, { context: hostContext(h) });

    await screen.findByRole("heading", { level: 1, name: "Power up" });
    expect(given).toEqual(savedFlight);
  });

  it("keeps newer saved progress, saves nothing over it, and sets it aside on Start fresh", async () => {
    const saves: string[] = [];
    const asides: string[] = [];
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "newer", format: 9 } as Loaded<Flight>, text: '{"format":9}' },
        settings: null,
      }),
      save: async (_p, what) => {
        saves.push(what);
        return 0;
      },
      setAside: async (_p, what) => {
        asides.push(what);
        return true;
      },
    });
    render(App, { context: hostContext(h) });

    expect(await screen.findByText("Your saved progress is from a newer version of the app.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Save a copy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start fresh" }).classList.contains("primary")).toBe(true);
    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(saves).not.toContain("flight");

    await fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(asides).toEqual(["flight"]);
    expect(saves).toContain("flight");
    expect(screen.queryByText(/newer version of the app/)).toBeNull();
  });

  it("says progress isn't being saved when a save is refused, until a save works again", async () => {
    let refuse = true;
    const h = host({ save: async () => (refuse ? null : new Date(2026, 10, 11, 14, 5).getTime()) });
    render(App, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    expect(await screen.findByText("Progress isn’t being saved on this device.")).toBeTruthy();
    expect(screen.queryByText(/^Saved /)).toBeNull();
    expect(screen.getByText("Not saved")).toBeTruthy();
    expect(document.querySelector("#drawer .packline > span")?.textContent).toMatch(/ · not saved · /);

    refuse = false;
    await fireEvent.click(screen.getByRole("button", { name: "Confirm Standby power: AUTO" }));
    expect(await screen.findByText("Saved 14:05")).toBeTruthy();
    expect(screen.queryByText("Progress isn’t being saved on this device.")).toBeNull();
    expect(document.querySelector("#drawer .packline > span")?.textContent).toMatch(/saved 14:05/);
  });

  it("keeps the notice when Start fresh can't set saved data aside, and saves nothing", async () => {
    const saves: string[] = [];
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "newer", format: 9 } as Loaded<Flight>, text: '{"format":9}' },
        settings: null,
      }),
      save: async (_p, what) => {
        saves.push(what);
        return 0;
      },
      setAside: async () => false,
    });
    render(App, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Start fresh" }));
    expect(await screen.findByText("It couldn’t be set aside, so nothing was moved.")).toBeTruthy();
    expect(screen.getByText("Your saved progress is from a newer version of the app.")).toBeTruthy();
    expect(screen.getByText(/starting fresh sets it aside rather than deleting it/)).toBeTruthy();
    expect(saves).not.toContain("flight");
    // Saving a copy comes first now: it is the primary button.
    expect(screen.getByRole("link", { name: "Save a copy" }).classList.contains("primary")).toBe(true);
    expect(screen.getByRole("button", { name: "Start fresh" }).classList.contains("primary")).toBe(false);
  });

  describe("two windows (the installed app beside a tab)", () => {
    const flightWith = (values: Record<string, string>, done: Record<string, number> = {}) =>
      ({
        pack: "demo",
        options: { power: "gpu" },
        session: { done, skipped: {} },
        values,
      }) as unknown as Flight;
    const ready = (f: Flight) => ({
      flight: {
        loaded: { state: "ready", value: f, migratedFrom: null } as Loaded<Flight>,
        text: JSON.stringify(f),
      },
      settings: null,
    });
    const ticking: Host["apply"] = async (_p, f, action) =>
      action.type === "tick"
        ? { ...f, session: { ...f.session, done: { ...f.session.done, [action.step]: action.at } } }
        : f;

    it("shows what another window saved when the storage event comes", async () => {
      let stored = flightWith({});
      const h = host({ readSaved: async () => ready(stored) });
      render(App, { context: hostContext(h) });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      expect(document.querySelector(".fsline")?.textContent).not.toMatch(/EGLL/);

      stored = flightWith({ origin: "EGLL", destination: "LFPG" });
      window.dispatchEvent(new StorageEvent("storage", { key: "involo.flight.demo" }));
      await waitFor(() => expect(document.querySelector(".fsline")?.textContent).toMatch(/EGLL → LFPG/));
    });

    it("never saves over another window's ticks: loads them and adds this window's tick to them", async () => {
      const other = flightWith({}, { battery: 1 });
      let loads = 0;
      const saved: Flight[] = [];
      const h = host({
        apply: ticking,
        readSettings: async () => null,
        readSaved: async () => (loads++ === 0 ? ready(flightWith({})) : ready(other)),
        save: async (_p, what, value) => {
          if (what !== "flight") return 0;
          // The first save finds the other window's text: nothing is written.
          if (saved.length === 0 && loads === 1) {
            saved.push({} as Flight);
            return "changed";
          }
          saved.push(value as Flight);
          return 1;
        },
      });
      render(App, { context: hostContext(h) });

      await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
      await waitFor(() => expect(saved).toHaveLength(2));
      expect(Object.keys((saved[1] as Flight).session.done).sort()).toEqual(["battery", "standby"]);
    });

    it("doesn't save over progress another window saved in a newer format", async () => {
      let loads = 0;
      const saves: Flight[] = [];
      const h = host({
        apply: ticking,
        readSettings: async () => null,
        readSaved: async () =>
          loads++ === 0
            ? ready(flightWith({}))
            : {
                flight: { loaded: { state: "newer", format: 9 } as Loaded<Flight>, text: '{"format":9}' },
                settings: null,
              },
        save: async (_p, what, value) => {
          if (what !== "flight") return 0;
          saves.push(value as Flight);
          return loads === 1 ? "changed" : 1;
        },
      });
      render(App, { context: hostContext(h) });

      await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
      expect(await screen.findByText("Your saved progress is from a newer version of the app.")).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Confirm Standby power: AUTO" }));
      await new Promise((r) => setTimeout(r, 20));
      expect(saves).toHaveLength(1);
    });
  });

  describe("a saved SimBrief plan this version can't read (decision 0019)", () => {
    for (const [state, words] of [
      ["newer", "Your saved SimBrief plan is from a newer version of the app."],
      ["unreadable", "Your saved SimBrief plan could not be read."],
    ] as const) {
      it(`keeps a ${state} plan with the notice, saves no import over it, and sets it aside on Start fresh`, async () => {
        const plans: (SavedPlan | null)[] = [];
        const asides: string[] = [];
        const text = '{"format":9}';
        const imported = { format: 1, plan: {}, loadedAt: 5 } as unknown as SavedPlan;
        const h = host({
          readPlan: async () => ({
            loaded: (state === "newer"
              ? { state, format: 9 }
              : { state, reason: "bad" }) as Loaded<SavedPlan>,
            text,
          }),
          savePlan: async (_p, plan) => {
            plans.push(plan);
          },
          defaultSettings: async () =>
            ({
              theme: "dark",
              dimming: 0,
              detail: "expanded",
              listView: "checklist",
              tourSeen: true,
              noticeSeen: true,
              simbriefUser: "Pilot",
            }) as Settings,
          fetchPlan: async () => imported,
          setAside: async (_p, what) => {
            asides.push(what);
            return true;
          },
        });
        render(App, { context: hostContext(h) });

        expect(await screen.findByText(words)).toBeTruthy();
        const copy = screen.getByRole("link", { name: "Save a copy" });
        expect(copy.getAttribute("download")).toBe("involo-plan.json");
        // An import fills the flight for this visit; nothing is saved over the kept plan.
        await fireEvent.click(
          await screen.findByRole("button", {
            name: "Add your flight: import from SimBrief or enter the clearance",
          }),
        );
        await fireEvent.click(
          screen.getAllByRole("button", { name: "Import latest from SimBrief" })[0] as HTMLElement,
        );
        expect(await screen.findByText(/^Imported /)).toBeTruthy();
        expect(plans).toEqual([]);
        expect(screen.getByText(words)).toBeTruthy();
        // Start fresh sets it aside first, then keeps the plan just imported.
        await fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
        await waitFor(() => expect(asides).toEqual(["plan"]));
        expect(screen.queryByText(words)).toBeNull();
        expect(plans).toEqual([imported]);
      });
    }
  });

  describe("a SimBrief plan for another aircraft type (#106, decision 0028)", () => {
    const imported = { format: 1, plan: {}, loadedAt: 5 } as unknown as SavedPlan;
    const OTHER_TYPE = {
      planName: "A320neo",
      planType: "A20N",
      packName: "Demo",
      packTypes: ["B38M", "B39M"],
    };
    function setup(other: typeof OTHER_TYPE | null, source: InstalledPack["source"] = "catalog") {
      const actions: Action[] = [];
      const plans: (SavedPlan | null)[] = [];
      const h = host({
        installedPacks: async () => [{ ...DEMO, source }],
        defaultSettings: async () =>
          ({
            theme: "dark",
            dimming: 0,
            detail: "expanded",
            listView: "checklist",
            tourSeen: true,
            noticeSeen: true,
            simbriefUser: "Pilot",
          }) as Settings,
        fetchPlan: async () => imported,
        readPlanFile: async () => imported,
        otherAircraft: async () => other,
        planValues: async () => ({
          values: { fuel: "8001" },
          filled: 1,
          origin: "EGLL",
          destination: "EHAM",
          checkClearance: false,
        }),
        savePlan: async (_p, plan) => {
          plans.push(plan);
        },
        apply: async (_pack, flight, action) => {
          actions.push(action);
          return { ...flight };
        },
      });
      render(App, { context: hostContext(h) });
      return { actions, plans };
    }
    const importLatest = async () => {
      await fireEvent.click(
        await screen.findByRole("button", {
          name: "Add your flight: import from SimBrief or enter the clearance",
        }),
      );
      const button = screen.getAllByRole("button", { name: "Import latest from SimBrief" })[0] as HTMLElement;
      button.focus();
      await fireEvent.click(button);
      return button;
    };

    it("imports a plan for one of the pack's types with no warning", async () => {
      const { actions, plans } = setup(null);
      await importLatest();
      expect(await screen.findByText(/^Imported EGLL → EHAM/)).toBeTruthy();
      expect(screen.queryByRole("dialog", { name: "Use this plan anyway?" })).toBeNull();
      expect(actions).toContainEqual({ type: "setValues", values: { fuel: "8001" } });
      expect(plans).toEqual([imported]);
    });

    it("names both aircraft, and Cancel leaves the flight and the kept plan unchanged", async () => {
      const { actions, plans } = setup(OTHER_TYPE);
      const button = await importLatest();
      const dialog = await screen.findByRole("dialog", { name: "Use this plan anyway?" });
      expect(dialog.textContent).toContain("A320neo A20N");
      expect(dialog.textContent).toContain("Demo B38M, B39M");
      expect(within(dialog).queryByText("Not from the Involo catalog")).toBeNull();
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
      await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog", { name: "Use this plan anyway?" })).toBeNull();
      await new Promise((r) => setTimeout(r, 20));
      expect(actions.filter((a) => a.type === "setValues")).toEqual([]);
      expect(plans).toEqual([]);
      expect(screen.queryByText(/^Imported /)).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it("Use it anyway imports as before; Esc cancels", async () => {
      const { actions, plans } = setup(OTHER_TYPE);
      await importLatest();
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Use this plan anyway?" })).toBeNull();
      await fireEvent.click(
        screen.getAllByRole("button", { name: "Import latest from SimBrief" })[0] as HTMLElement,
      );
      const dialog = await screen.findByRole("dialog", { name: "Use this plan anyway?" });
      await fireEvent.click(within(dialog).getByRole("button", { name: "Use it anyway" }));
      expect(await screen.findByText(/^Imported EGLL → EHAM: 1 values\./)).toBeTruthy();
      expect(actions).toContainEqual({ type: "setValues", values: { fuel: "8001" } });
      expect(plans).toEqual([imported]);
    });

    it("warns for an OFP file too, and marks a pack added from a file", async () => {
      const { actions } = setup(
        { ...OTHER_TYPE, planName: undefined } as unknown as typeof OTHER_TYPE,
        "file",
      );
      window.location.hash = "#/flight/simbrief";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      const picker = (await waitFor(() => {
        const input = document.querySelector('input[type="file"]');
        if (!input) throw new Error("no file input yet");
        return input;
      })) as HTMLInputElement;
      const file = new File(["{}"], "ofp.json", { type: "application/json" });
      await fireEvent.change(picker, { target: { files: [file] } });
      const dialog = await screen.findByRole("dialog", { name: "Use this plan anyway?" });
      // A plan with no aircraft name shows its type code alone.
      expect(dialog.textContent).toMatch(/This plan\s*A20N/);
      expect(within(dialog).getByText("Not from the Involo catalog")).toBeTruthy();
      await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await new Promise((r) => setTimeout(r, 20));
      expect(actions.filter((a) => a.type === "setValues")).toEqual([]);
    });
  });

  it("clears a list's ticks at once and offers Undo", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Clear ticks" }));
    expect(actions).toEqual([{ type: "clearList", list: "power-up-flow" }]);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("clears the ticked list from the menu too (tablet and phone), with the same Undo", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: /^Clear ticks\s*Power up flow: \d+ ticks?\./ }));
    expect(actions).toEqual([{ type: "clearList", list: "power-up-flow" }]);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("opens Find from the header and with Ctrl K, finds a control, and gives focus back on Esc", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const button = screen.getByRole("button", { name: "Find a step, control or term" });
    button.focus();
    await fireEvent.click(button);
    const field = await screen.findByRole("combobox", { name: "Find a step, control or term" });
    await fireEvent.input(field, { target: { value: "standby" } });
    expect(screen.getByRole("option", { name: /Standby power switch/ }).textContent).toContain(
      "Forward overhead · Electrical",
    );
    await fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Find" })).toBeNull();
    expect(document.activeElement).toBe(button);
    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: "Find" })).toBeTruthy();
  });

  it("gives each list a plain label row with the fold's text, for tablet and phone", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const labels = [...document.querySelectorAll("section.card > p.label")].map((p) => p.textContent);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).toMatch(/^.+ · \d+ of \d+$/);
  });

  it("opens the Glossary at a term chosen in Find, and from the menu", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Find a step, control or term" }));
    const field = await screen.findByRole("combobox", { name: "Find a step, control or term" });
    await fireEvent.input(field, { target: { value: "widget gate" } });
    await fireEvent.click(screen.getByRole("option", { name: /^WGT/ }));
    await waitFor(() => expect(location.hash).toBe("#/glossary/WGT"));
    expect(await screen.findByRole("heading", { level: 2, name: "WGT" })).toBeTruthy();
    expect(screen.getByText("Widget gate timer", { selector: ".expansion" })).toBeTruthy();
    location.hash = "#/";
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("link", { name: "Glossary" }).getAttribute("href")).toBe("#/glossary");
  });

  describe("the plan's suggestion on a decision (decision 0027)", () => {
    const decided = {
      ...pack,
      lists: pack.lists.map((l) => ({ ...l, steps: [{ ...l.steps[0], decide: "tank" }, l.steps[1]] })),
      content: {
        ...pack.content,
        phases: {
          ...pack.content.phases,
          options: [
            ...(pack.content.phases?.options ?? []),
            {
              id: "tank",
              title: "Tank",
              values: ["full", "empty"],
              default: "empty",
              description: "The tank holds",
              choices: [
                { value: "full", label: "Full" },
                { value: "empty", label: "Empty" },
              ],
            },
          ],
        },
      },
    } as unknown as FlatPack;
    const SUGGESTED = "Suggested from your SimBrief plan: 263 kg. Close to the line: check the gauge";
    /** A flight whose block fuel came from a loaded plan (8,001 kg), unless `typed` replaces it. */
    function setup(opts: { plan?: boolean; typed?: string } = {}) {
      const actions: Action[] = [];
      const withPlan = opts.plan ?? true;
      const h = host({
        loadPack: async () => decided,
        phaseModel: async () => view(["current", "to_do"]),
        readSaved: async () =>
          ({
            flight: {
              loaded: {
                state: "ready",
                value: {
                  pack: "demo",
                  options: { power: "gpu" },
                  session: { done: {}, skipped: {} },
                  values: { fuel: opts.typed ?? "8001", weight_unit: "KG" },
                  answers: {},
                },
                migratedFrom: null,
              },
              text: "{}",
            },
            settings: null,
          }) as never,
        readPlan: async () =>
          withPlan
            ? {
                loaded: { state: "ready", value: { plan: {} } as unknown as SavedPlan, migratedFrom: null },
                text: "{}",
              }
            : null,
        planValues: async () => ({
          values: { fuel: "8001", weight_unit: "KG" },
          filled: 2,
          origin: "",
          destination: "",
          checkClearance: false,
        }),
        suggestion: async (_p, _f, option) =>
          option === "tank" ? { value: "empty", amount: 263, unit: "kg", near: true } : null,
        apply: async (_pack, flight, action) => {
          actions.push(action);
          if (action.type === "answer")
            return {
              ...flight,
              options: { ...flight.options, [action.option]: action.value },
              answers: { ...flight.answers, [action.option]: action.by },
            };
          if (action.type === "tick")
            return {
              ...flight,
              session: { ...flight.session, done: { ...flight.session.done, [action.step]: action.at } },
            };
          if (action.type === "clear")
            return { ...flight, values: {}, options: { power: "gpu" }, answers: {} };
          return flight;
        },
      });
      render(App, { context: hostContext(h) });
      return actions;
    }
    const row = () => document.querySelector('li[data-step="battery"]') as HTMLElement;

    it("offers it from the plan's figures, and confirming it is saved as from the plan", async () => {
      const actions = setup();
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      expect(await within(row()).findAllByText(SUGGESTED)).not.toHaveLength(0);
      expect(within(row()).getByText("The tank holds")).toBeTruthy();
      expect(within(row()).getByText("Suggested")).toBeTruthy();
      await fireEvent.click(within(row()).getByRole("button", { name: /^Confirm/ }));
      await waitFor(() =>
        expect(actions[0]).toEqual({ type: "answer", option: "tank", value: "empty", by: "plan" }),
      );
    });

    it("saves the other answer as the pilot's own", async () => {
      const actions = setup();
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await within(row()).findAllByText(SUGGESTED);
      await fireEvent.click(within(row()).getByRole("button", { name: /^Full/ }));
      await waitFor(() =>
        expect(actions[0]).toEqual({ type: "answer", option: "tank", value: "full", by: "you" }),
      );
    });

    it("suggests nothing with no plan, or once the block fuel is not the plan's", async () => {
      setup({ plan: false });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await within(row()).findByText("The tank holds");
      expect(within(row()).queryByText(/Suggested from your SimBrief plan/)).toBeNull();
      cleanup();
      setup({ typed: "9000" });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await within(row()).findByText("The tank holds");
      expect(within(row()).queryByText(/Suggested from your SimBrief plan/)).toBeNull();
    });

    it("drops the suggestion on Reset flight plan", async () => {
      setup();
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await within(row()).findAllByText(SUGGESTED);
      await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
      await fireEvent.click(screen.getByRole("button", { name: /^Reset flight plan/ }));
      await waitFor(() => expect(within(row()).queryByText(/Suggested from your SimBrief plan/)).toBeNull());
    });
  });

  it("asks a decision in its row, saves how it was answered, and shows the dependent step's value for the answer (decision 0027)", async () => {
    // Invented: Battery asks "Tank" (full or empty); Standby power's switch depends on it.
    const decided = {
      ...pack,
      lists: pack.lists.map((l) => ({
        ...l,
        steps: [
          { ...l.steps[0], decide: "tank" },
          {
            ...l.steps[1],
            expect: "AUTO OR OFF FROM YOUR TANK ANSWER",
            targets: [
              { at: "oh/elec/STBY/1", open: true },
              { at: "oh/elec/STBY/1", set: "AUTO", when: { option: "tank", equals: "full" } },
              { at: "oh/elec/STBY/1", set: "OFF", when: { option: "tank", equals: "empty" } },
            ],
            expectWhen: [
              { option: "tank", equals: "full", expect: "AUTO" },
              { option: "tank", equals: "empty", expect: "OFF" },
            ],
          },
        ],
      })),
      content: {
        ...pack.content,
        phases: {
          ...pack.content.phases,
          options: [
            ...(pack.content.phases?.options ?? []),
            {
              id: "tank",
              title: "Tank",
              values: ["full", "empty"],
              default: "empty",
              choices: [
                { value: "full", label: "Full" },
                { value: "empty", label: "Empty" },
              ],
            },
          ],
        },
      },
    } as unknown as FlatPack;
    const actions: Action[] = [];
    const h = host({
      loadPack: async () => decided,
      phaseModel: async (_p, f) =>
        view([f.session.done.battery ? "done" : "current", f.session.done.battery ? "current" : "to_do"]),
      apply: async (_pack, flight, action) => {
        actions.push(action);
        if (action.type === "answer")
          return {
            ...flight,
            options: { ...flight.options, [action.option]: action.value },
            answers: { ...flight.answers, [action.option]: action.by },
          };
        if (action.type === "tick")
          return {
            ...flight,
            session: { ...flight.session, done: { ...flight.session.done, [action.step]: action.at } },
          };
        return flight;
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const row = (id: string) => document.querySelector(`li[data-step="${id}"]`) as HTMLElement;
    // Before the answer, the dependent step shows its own value and what it depends on.
    expect(within(row("standby")).getByText("AUTO OR OFF FROM YOUR TANK ANSWER")).toBeTruthy();
    await fireEvent.click(within(row("battery")).getByRole("button", { name: "Empty" }));
    await waitFor(() => expect(actions.some((a) => a.type === "tick")).toBe(true));
    expect(actions[0]).toEqual({ type: "answer", option: "tank", value: "empty", by: "you" });
    // Answered: the source line under the name, and the dependent step's value for the answer.
    expect(await within(row("battery")).findByText("Answered by you")).toBeTruthy();
    expect(within(row("standby")).getByText("OFF")).toBeTruthy();
    // A changed answer is saved as changed, and offers Undo.
    await fireEvent.click(within(row("standby")).getByRole("button", { name: /^Tank empty/ }));
    await fireEvent.click(within(row("battery")).getByRole("button", { name: /Full/ }));
    await waitFor(() =>
      expect(actions.at(-1)).toEqual({ type: "answer", option: "tank", value: "full", by: "changed" }),
    );
    expect(await within(row("battery")).findByText("Changed by you")).toBeTruthy();
    expect(within(row("standby")).getByText("AUTO")).toBeTruthy();
    // Undo puts the whole flight back, the answer and how it was given too.
    await fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await within(row("battery")).findByText("Answered by you")).toBeTruthy();
    expect(within(row("standby")).getByText("OFF")).toBeTruthy();
  });

  it("opens References from the menu, and Find on the steps that follow the simulator's model (References README)", async () => {
    const withBasis = {
      ...pack,
      manifest: {
        ...pack.manifest,
        version: "0.1.0",
        license: "CC-BY-NC-SA-4.0",
        attribution: ["Invented for tests."],
      },
      lists: pack.lists.map((l) => ({
        ...l,
        basis: ["ifly-docs"],
        steps: l.steps.map((st) =>
          st.id === "standby"
            ? { ...st, note: "The simulator powers it at once.", simulatorModel: true }
            : st,
        ),
      })),
      content: {
        ...pack.content,
        // The pack names its tag, as the iFly pack's labels do.
        labels: {
          ...appLabels(),
          basisTags: [{ id: "ifly-docs", label: "Simulator documentation", about: "How the model works." }],
        },
        phases: {
          ...pack.content.phases,
          stages: [{ id: "preflight", title: "Preflight", phases: [{ phase: "power-up" }] }],
          phases: [{ id: "power-up", title: "Power up", lists: ["power-up-flow"] }],
        },
      },
    } as unknown as FlatPack;
    render(App, { context: hostContext(host({ loadPack: async () => withBasis })) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const link = screen.getByRole("link", { name: "References" });
    expect(link.getAttribute("href")).toBe("#/references");
    location.hash = "#/references";
    expect(await screen.findByRole("heading", { level: 1, name: "References" })).toBeTruthy();
    expect(screen.getByText("Involo 0.1.0 · open source")).toBeTruthy();
    expect(screen.getByText("Demo aircraft · pack 0.1.0")).toBeTruthy();
    expect(screen.queryByText(/Source being confirmed/)).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "See the 1 step ›" }));
    const find = screen.getByRole("dialog", { name: "Find" });
    expect(within(find).getByText("Simulator model notes")).toBeTruthy();
    const options = within(find).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("Standby power");
    // × leaves the set: Find searches everything again, from its start.
    await fireEvent.click(within(find).getByRole("button", { name: "Search every step, control and term" }));
    expect(within(find).queryByRole("option")).toBeNull();
    expect(within(find).getByText(/Search every step, control and term for this aircraft/)).toBeTruthy();
    location.hash = "#/";
  });

  it("opens How procedures work from the menu, with the pack's counts and links to the pilot's phase and step (How README)", async () => {
    const lists = (id: string, n: number, group: string) => ({
      id,
      title: id,
      reference: true,
      group,
      lists: Array.from({ length: n }, (_, i) => `${id}-${i}`),
    });
    const withRef = {
      ...pack,
      content: {
        ...pack.content,
        phases: {
          ...pack.content.phases,
          phases: [
            { id: "power-up", title: "Power up", lists: ["power-up-flow"] },
            lists("memory", 2, "memory"),
            lists("qrh", 3, "quick"),
            lists("nnc", 4, "procedures"),
          ],
        },
      },
    } as unknown as FlatPack;
    const refRail = {
      ...rail,
      reference: [
        phase("memory", "Memory items", 0, 0, 2),
        phase("qrh", "Quick reference", 0, 0, 3),
        phase("nnc", "Non-normal", 0, 0, 4),
      ],
    };
    render(App, { context: hostContext(host({ loadPack: async () => withRef, rail: async () => refRail })) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const link = screen.getByRole("link", { name: "How procedures work" });
    expect(link.getAttribute("href")).toBe("#/how");
    location.hash = "#/how";
    expect(await screen.findByRole("heading", { level: 1, name: "How procedures work" })).toBeTruthy();
    const text = document.querySelector("article")?.textContent ?? "";
    expect(text).toContain("Involo splits a flight into 2 stages:");
    expect(text).toContain("Involo has 2 memory-item lists, 3 quick reference lists and 4 procedures,");
    // The current phase: the phase last open (Power up), and its current step.
    const inv = () => [...document.querySelectorAll(".inv a")];
    expect(inv()[0]?.textContent).toBe("Power up ›");
    expect(inv()[0]?.getAttribute("href")).toBe("#/phase/power-up");
    await waitFor(() => expect(inv()[2]?.textContent).not.toBe("Power up ›"));
    await fireEvent.click(inv()[2] as HTMLElement);
    await waitFor(() => expect(location.hash).toBe("#/phase/power-up"));
  });

  it("How procedures work's current phase is the phase last open, over the first with steps to do", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    location.hash = "#/phase/taxi";
    // The hashchange event comes after the address changes.
    await new Promise((r) => setTimeout(r, 50));
    location.hash = "#/how";
    await screen.findByRole("heading", { level: 1, name: "How procedures work" });
    const first = document.querySelector(".inv a");
    expect(first?.textContent).toBe("Taxi ›");
    expect(first?.getAttribute("href")).toBe("#/phase/taxi");
  });

  it("closes Find on the system back, as any full-screen sheet", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Find a step, control or term" }));
    expect(await screen.findByRole("dialog", { name: "Find" })).toBeTruthy();
    expect(history.state?.find).toBe(true);
    history.replaceState({ ...history.state, find: false }, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Find" })).toBeNull());
  });

  it("never ticks the step behind Find, even with focus outside its field (Space after Show all)", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Find" });
    (document.activeElement as HTMLElement).blur();
    await fireEvent.keyDown(document.body, { key: " " });
    await fireEvent.keyDown(document.body, { key: "s" });
    expect(actions).toEqual([]);
  });

  it("lists open steps and puts one back to do", async () => {
    window.location.hash = "#/open";
    const actions: Action[] = [];
    const h = host({
      openSteps: async () => [
        {
          step: "battery",
          phase: "power-up",
          phaseTitle: "Power up",
          listTitle: "Power up flow",
          skipped: true,
          briefing: false,
        },
      ],
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });

    expect(await screen.findByRole("heading", { level: 1, name: "Open steps" })).toBeTruthy();
    expect(await screen.findByText("BATTERY")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Unskip" }));
    expect(actions).toEqual([{ type: "unskip", step: "battery" }]);
  });

  // #214: briefings at the top of their phase, and a skipped one in Open steps.
  const withBriefing = {
    ...pack,
    content: {
      ...pack.content,
      briefings: {
        briefings: [
          {
            id: "power",
            title: "Power briefing",
            mnemonic: "GB",
            phase: "power-up",
            items: [
              { id: "power.ground", lead: "G", rest: "ROUND", detail: "Ground power or the APU." },
              { id: "power.battery", lead: "B", rest: "ATTERY" },
            ],
          },
        ],
      },
    },
  } as unknown as FlatPack;

  it("shows the phase's briefing above its lists and marks it Briefed", async () => {
    const actions: Action[] = [];
    const h = host({
      loadPack: async () => withBriefing,
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    const card = await screen.findByRole("region", { name: "Power briefing" });
    // Above the phase's lists, which keep their own Done and Skip for now.
    const list = document.querySelector("section.card");
    expect(list && card.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Briefed" }));
    expect(actions[0]).toMatchObject({ type: "brief", briefing: "power" });
    await fireEvent.click(screen.getByRole("button", { name: "Skip briefing" }));
    expect(actions[1]).toMatchObject({ type: "skipBriefing", briefing: "power" });
  });

  // #215: the current step that opens a CDU walkthrough, and the walkthrough in the slide-out.
  const withCdu = {
    ...pack,
    lists: pack.lists.map((l) => ({
      ...l,
      steps: l.steps.map((s) => (s.id === "standby" ? { ...s, opens: "setup" } : s)),
    })),
    content: {
      ...pack.content,
      cdu: { walkthroughs: [{ id: "setup", title: "CDU walkthrough", pages: [] }] },
    },
  } as unknown as FlatPack;
  const span = (text: string) => ({ text, value: false });
  const cduPage = (name: string, title: string) => ({
    page: name,
    title,
    action: [span(`Do ${title}.`)],
    check: [],
    note: [],
    screen: { title: [span(name)], page: [], rows: [], highlight: [], scratchpad: [] },
  });
  const cduWalk = (at?: number): CduWalk => ({
    id: "setup",
    title: "CDU walkthrough",
    flightAdded: false,
    pages: [cduPage("IDENT", "Check the database"), cduPage("RTE", "Enter the route")],
    ...(at === undefined ? {} : { at }),
  });

  it("opens the current step's CDU walkthrough, saves its page, and ticks the step with Done", async () => {
    const actions: Action[] = [];
    let at: number | undefined;
    const h = host({
      loadPack: async () => withCdu,
      cduWalkthrough: async (_pack, _flight, id) => (id === "setup" ? cduWalk(at) : null),
      apply: async (_pack, flight, action) => {
        actions.push(action);
        if (action.type === "walkthroughPage") at = action.page;
        if (action.type === "endWalkthrough") at = undefined;
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    const open = await screen.findByRole("button", { name: "Open CDU walkthrough" });
    expect(screen.getByText("2 pages, IDENT to RTE.")).toBeTruthy();
    await fireEvent.click(open);
    const dialog = await screen.findByRole("dialog", { name: "CDU walkthrough" });
    expect(within(dialog).getByText("Step 2 · Standby power")).toBeTruthy();
    expect(within(dialog).getByText("Power up flow · 2 pages, IDENT to RTE")).toBeTruthy();
    expect(actions[0]).toEqual({ type: "walkthroughPage", walkthrough: "setup", page: 0 });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(actions[1]).toEqual({ type: "walkthroughPage", walkthrough: "setup", page: 1 });
    // Closed part way, the step says where it stopped.
    await fireEvent.click(within(dialog).getByRole("button", { name: "Close the CDU walkthrough" }));
    expect(await screen.findByRole("button", { name: "Continue CDU walkthrough" })).toBeTruthy();
    expect(screen.getByText("Stopped at page 2 of 2, RTE.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Continue CDU walkthrough" }));
    const again = await screen.findByRole("dialog", { name: "CDU walkthrough" });
    expect(within(again).getByText("Enter the route")).toBeTruthy();
    await fireEvent.click(within(again).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "CDU walkthrough" })).toBeNull());
    await waitFor(() => expect(actions.at(-1)?.type).toBe("tick"));
    expect(actions.slice(-2)).toEqual([
      { type: "endWalkthrough", walkthrough: "setup" },
      expect.objectContaining({ type: "tick", step: "standby" }),
    ]);
  });

  it("lists a skipped briefing in Open steps, to give or put back", async () => {
    window.location.hash = "#/open";
    const actions: Action[] = [];
    const h = host({
      loadPack: async () => withBriefing,
      openSteps: async () => [
        {
          step: "power",
          phase: "power-up",
          phaseTitle: "Power up",
          listTitle: "Power briefing",
          skipped: true,
          briefing: true,
        },
      ],
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    expect(await screen.findByText("Power briefing")).toBeTruthy();
    expect(screen.getByText("GB")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Unskip" }));
    await fireEvent.click(screen.getByRole("button", { name: "Briefed" }));
    expect(actions).toEqual([
      { type: "unmarkBriefing", briefing: "power" },
      expect.objectContaining({ type: "brief", briefing: "power" }),
    ]);
  });

  it('lists a skipped briefing under its phase in "N open steps", with Go to briefing', async () => {
    const h = host({
      loadPack: async () => withBriefing,
      openSteps: async () => [
        {
          step: "power",
          phase: "exterior",
          phaseTitle: "Exterior",
          listTitle: "Power briefing",
          skipped: true,
          briefing: true,
        },
      ],
    });
    render(App, { context: hostContext(h) });
    await fireEvent.click(await screen.findByRole("button", { name: "1 open step" }));
    expect(screen.getByText("Exterior · Briefing")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Go to briefing" }));
    expect(window.location.hash).toBe("#/phase/exterior");
    expect(screen.queryByRole("dialog", { name: "1 open step" })).toBeNull();
  });

  it("moves between steps with the arrow keys and ticks with Space in List view", async () => {
    const actions: Action[] = [];
    const h = host({
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });

    await fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByRole("button", { name: /^Battery/ }).getAttribute("aria-current")).toBe("true");
    await fireEvent.keyDown(window, { key: " " });
    expect(actions[0]).toMatchObject({ type: "tick", step: "battery" });
  });

  it('shows every open step from "N open steps" and goes to one', async () => {
    const actions: Action[] = [];
    const h = host({
      openSteps: async () => [
        {
          step: "standby",
          phase: "earlier",
          phaseTitle: "Earlier",
          listTitle: "Earlier flow",
          skipped: false,
          briefing: false,
        },
      ],
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return { ...flight };
      },
    });
    render(App, { context: hostContext(h) });

    // "1 open step" (OpenSteps board) lists it with its phase and list, and goes to it.
    await fireEvent.click(await screen.findByRole("button", { name: "1 open step" }));
    expect(screen.getByText("Earlier · Earlier flow")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Go to step" }));
    expect(screen.queryByRole("dialog", { name: "1 open step" })).toBeNull();
  });

  describe("the tour (Tour boards)", () => {
    afterEach(() => vi.restoreAllMocks());
    const firstVisit = (more: Partial<Host> = {}) =>
      host({
        defaultSettings: async () =>
          ({
            theme: "dark",
            dimming: 0,
            detail: "expanded",
            listView: "checklist",
            tourSeen: false,
            noticeSeen: true,
          }) as Settings,
        ...more,
      });

    it("opens the simulator-only notice before anything else; I understand saves it and the welcome follows (#241)", async () => {
      const saved: Settings[] = [];
      const h = host({
        defaultSettings: async () =>
          ({
            theme: "dark",
            dimming: 0,
            detail: "expanded",
            listView: "checklist",
            tourSeen: false,
            noticeSeen: false,
          }) as Settings,
        save: async (_p, what, value) => {
          if (what === "settings") saved.push(value as Settings);
          return 0;
        },
      });
      render(App, { context: hostContext(h) });
      const notice = await screen.findByRole("dialog", { name: "Simulator training only" });
      const understood = within(notice).getByRole("button", { name: "I understand" });
      await waitFor(() => expect(document.activeElement).toBe(understood));
      // The welcome waits, Esc doesn't close the notice, and nothing else can be closed with it.
      expect(screen.queryByRole("dialog", { name: "Welcome to Involo" })).toBeNull();
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("dialog", { name: "Simulator training only" })).toBeTruthy();
      expect(within(notice).getAllByRole("button")).toHaveLength(1);
      await fireEvent.click(understood);
      expect(screen.queryByRole("dialog", { name: "Simulator training only" })).toBeNull();
      await waitFor(() => expect(saved.at(-1)?.noticeSeen).toBe(true));
      expect(await screen.findByRole("dialog", { name: "Welcome to Involo" })).toBeTruthy();
    });

    it("opens the welcome on a first visit once the checklist has loaded; Not now remembers it", async () => {
      const saved: Settings[] = [];
      const h = firstVisit({
        save: async (_p, what, value) => {
          if (what === "settings") saved.push(value as Settings);
          return 0;
        },
      });
      render(App, { context: hostContext(h) });
      const welcome = await screen.findByRole("dialog", { name: "Welcome to Involo" });
      expect(within(welcome).getByRole("button", { name: "Take the tour" })).toBeTruthy();
      await fireEvent.click(within(welcome).getByRole("button", { name: "Not now" }));
      expect(screen.queryByRole("dialog", { name: "Welcome to Involo" })).toBeNull();
      await waitFor(() => expect(saved.at(-1)?.tourSeen).toBe(true));
    });

    it("doesn't open the welcome once it has been seen", async () => {
      render(App, { context: hostContext(host()) });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("dialog", { name: "Welcome to Involo" })).toBeNull();
    });

    it("never ticks or skips while open, whatever is pressed; Esc ends it", async () => {
      const actions: Action[] = [];
      const h = firstVisit({
        apply: async (_pack, flight, action) => {
          actions.push(action);
          return { ...flight };
        },
      });
      render(App, { context: hostContext(h) });
      await screen.findByRole("dialog", { name: "Welcome to Involo" });
      for (const key of [" ", "s", "S", "w", "p", "ArrowUp", "Enter"])
        await fireEvent.keyDown(window, { key });
      await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(actions).toEqual([]);
      expect(screen.queryByRole("dialog", { name: /Find/ })).toBeNull();
      // The page is inert underneath, so not even a screen reader can press Done.
      expect((document.querySelector(".shell") as HTMLElement).inert).toBe(true);
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Welcome to Involo" })).toBeNull();
      expect((document.querySelector(".shell") as HTMLElement).inert).toBe(false);
    });

    it("doesn't open the welcome when a flight was saved before (settings are saved only once changed)", async () => {
      const saved = host();
      const flight = await saved.newFlight("demo");
      render(App, {
        context: hostContext(
          firstVisit({
            readSaved: async () =>
              ({
                flight: { loaded: { state: "ready", value: flight }, text: "{}" },
                settings: null,
              }) as never,
          }),
        ),
      });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("dialog", { name: "Welcome to Involo" })).toBeNull();
    });

    it("lights the current step with its card; ← and → move; steps with nothing on screen are skipped", async () => {
      // Only the current row is laid out (jsdom draws nothing): steps 2, 4, 5 and 6 are skipped.
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const on = this.matches("li.it.current");
        return {
          top: 100,
          left: 20,
          bottom: on ? 200 : 100,
          right: on ? 600 : 20,
          width: on ? 580 : 0,
          height: on ? 100 : 0,
          x: 20,
          y: 100,
          toJSON: () => ({}),
        } as DOMRect;
      });
      const actions: Action[] = [];
      render(App, {
        context: hostContext(
          firstVisit({
            apply: async (_pack, flight, action) => {
              actions.push(action);
              return { ...flight };
            },
          }),
        ),
      });
      const welcome = await screen.findByRole("dialog", { name: "Welcome to Involo" });
      await fireEvent.click(within(welcome).getByRole("button", { name: "Take the tour" }));
      const step3 = await screen.findByRole(
        "dialog",
        { name: "Tour, step 3 of 7: The current step" },
        { timeout: 2000 },
      );
      expect(within(step3).getByText("Step 3 of 7")).toBeTruthy();
      expect(within(step3).getByRole("button", { name: "End tour" })).toBeTruthy();
      expect(within(step3).getByRole("button", { name: "Back" })).toBeTruthy();
      // Space and S on a lit step: still nothing reaches the flight.
      for (const key of [" ", "s"]) await fireEvent.keyDown(window, { key });
      expect(actions).toEqual([]);
      // → skips 4, 5 and 6, which aren't on screen, to "You're set".
      await fireEvent.keyDown(window, { key: "ArrowRight" });
      const end = await screen.findByRole("dialog", { name: "You’re set" }, { timeout: 3000 });
      expect(within(end).getByRole("button", { name: "Start the checklist" })).toBeTruthy();
      // ← goes back, skipping again, to the current step.
      await fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(await screen.findByRole("dialog", { name: /step 3 of 7/ }, { timeout: 3000 })).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "End tour" }));
      expect(screen.queryByRole("dialog", { name: /step 3 of 7/ })).toBeNull();
    });

    it("from another page, opens the checklist where the pilot left it, or at the first phase with steps to do, resetting nothing", async () => {
      const actions: Action[] = [];
      const h = host({
        apply: async (_pack, flight, action) => {
          actions.push(action);
          return { ...flight };
        },
      });
      const take = async () => {
        await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        await fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
      };
      // Straight to Settings on this visit: the first phase with steps still to do.
      window.location.hash = "#/settings";
      render(App, { context: hostContext(h) });
      await screen.findByRole("button", { name: "Menu" });
      await waitFor(() => expect(screen.getByRole("button", { name: "Take the tour" })).toBeTruthy());
      await take();
      await waitFor(() => expect(window.location.hash).toBe("#/phase/power-up"));
      await fireEvent.keyDown(window, { key: "Escape" });
      // After Taxi, from Settings: back to Taxi.
      window.location.hash = "#/phase/taxi";
      await waitFor(() => expect(window.location.hash).toBe("#/phase/taxi"));
      await new Promise((r) => setTimeout(r, 20));
      window.location.hash = "#/settings";
      await screen.findByRole("heading", { level: 1, name: "Settings" });
      await take();
      await waitFor(() => expect(window.location.hash).toBe("#/phase/taxi"));
      expect(actions).toEqual([]);
    });

    it("starts from the menu's Take the tour, the last item of This flight and the app, and gives focus back to the menu button", async () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const on = this.matches('[data-tour="stage-button"], [data-tour="stages"]');
        return {
          top: 4,
          left: 4,
          bottom: on ? 52 : 4,
          right: on ? 300 : 4,
          width: on ? 296 : 0,
          height: on ? 48 : 0,
          x: 4,
          y: 4,
          toJSON: () => ({}),
        } as DOMRect;
      });
      render(App, { context: hostContext(host()) });
      await screen.findByRole("heading", { level: 1, name: "Power up" });
      await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
      const group = screen.getByText("This flight and the app").parentElement as HTMLElement;
      const items = [...group.querySelectorAll("a, button")].map((e) => e.textContent?.trim());
      expect(items.at(-1)).toBe("Take the tour");
      expect(items.at(-2)).toBe("Settings");
      await fireEvent.click(within(group).getByRole("button", { name: "Take the tour" }));
      const step2 = await screen.findByRole(
        "dialog",
        { name: /step 2 of 7: Stages and phases/ },
        { timeout: 2000 },
      );
      await waitFor(() => expect(step2.contains(document.activeElement)).toBe(true));
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: /step 2 of 7/ })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" })));
    });
  });
});

describe("the Flight log (decision 0026)", () => {
  it("says how many entries of a loaded log file were left out because they couldn't be real", async () => {
    window.location.hash = "#/log";
    const { container } = render(App, { context: hostContext(host()) });
    const input = (await waitForElement('input[type="file"]')) as HTMLInputElement;
    const file = new File(['{"format":1,"impossible":true}'], "log.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);
    expect(
      await screen.findByText("Nothing new to add. 2 entries were left out because they couldn’t be real."),
    ).toBeTruthy();
    expect(container).toBeTruthy();
  });

  /** A flight with one tick, so there is something to log. */
  const ticked = () =>
    ({
      pack: "demo",
      options: { power: "gpu" },
      session: { done: { battery: 1_000 }, skipped: {} },
      values: { origin: "KSEA", destination: "KSFO" },
    }) as unknown as Flight;

  it("Log flight and start new saves the flight in the log on this device, asking once to keep it, then starts a new flight", async () => {
    const actions: Action[] = [];
    const saved: [unknown, boolean | undefined][] = [];
    window.location.hash = "#/log";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return action.type === "clear"
          ? ({ ...flight, session: { done: {}, skipped: {} }, values: {} } as Flight)
          : flight;
      },
      saveLog: async (log, keep) => {
        saved.push([log, keep]);
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    const go = await screen.findByRole("button", { name: "Log flight and start new" });
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(go);
    await waitFor(() => expect(actions.at(-1)).toEqual({ type: "clear" }));
    expect(saved).toHaveLength(1);
    const [log, keep] = saved[0] as [
      { flights: { origin: string; destination: string; plan: string }[] },
      boolean,
    ];
    expect(keep).toBe(true);
    expect(log.flights[0]).toMatchObject({ origin: "KSEA", destination: "KSFO", plan: "manual" });
    // The flight is in Earlier flights, This flight starts again, and no Undo is offered.
    await waitFor(() =>
      expect(document.querySelector(".earlier h2")?.textContent).toBe("Earlier flights · 1"),
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  describe("the backup reminder (#243)", () => {
    function logged(settings: Partial<Settings>, more: Partial<Host> = {}) {
      const saved: Settings[] = [];
      const persisted: number[] = [];
      window.location.hash = "#/log";
      const h = host({
        readSaved: async () => ({
          flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
          settings: null,
        }),
        defaultSettings: async () =>
          ({
            theme: "dark",
            dimming: 0,
            detail: "expanded",
            listView: "checklist",
            tourSeen: true,
            noticeSeen: true,
            ...settings,
          }) as Settings,
        apply: async (_pack, flight, action) =>
          action.type === "clear"
            ? ({ ...flight, session: { done: {}, skipped: {} }, values: {} } as Flight)
            : flight,
        saveLog: async () => true,
        save: async (_p, what, value) => {
          if (what === "settings") saved.push(value as Settings);
          return 0;
        },
        persistStorage: async () => {
          persisted.push(1);
          return true;
        },
        ...more,
      });
      render(App, { context: hostContext(h) });
      return { saved, persisted };
    }
    async function logIt(): Promise<void> {
      const go = await screen.findByRole("button", { name: "Log flight and start new" });
      await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
      await fireEvent.click(go);
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await screen.findByRole("heading", { level: 1, name: "Power up" });
    }

    it("shows after a logged flight with no backup yet; Not now hides it for 30 days", async () => {
      const { saved, persisted } = logged({ lastBackup: null });
      await logIt();
      const band = await screen.findByRole("region", { name: "Backup reminder" });
      expect(within(band).getByText("Save a backup?")).toBeTruthy();
      expect(
        within(band).getByText(
          "You haven’t saved a backup yet. Clearing this browser’s site data removes everything saved here.",
        ),
      ).toBeTruthy();
      const before = Date.now();
      await fireEvent.click(within(band).getByRole("button", { name: "Not now" }));
      expect(screen.queryByRole("region", { name: "Backup reminder" })).toBeNull();
      await waitFor(() =>
        expect(saved.at(-1)?.backupReminderAfter).toBeGreaterThanOrEqual(before + 30 * 24 * 3600 * 1000),
      );
      // The browser was asked once to keep the site's data, with no screen of its own.
      expect(persisted).toHaveLength(1);
    });

    it("doesn't show when the last backup is recent, or Not now is still holding it", async () => {
      logged({ lastBackup: Date.now() - 24 * 3600 * 1000 });
      await logIt();
      expect(screen.queryByRole("region", { name: "Backup reminder" })).toBeNull();
      cleanup();
      logged({ lastBackup: null, backupReminderAfter: Date.now() + 1000 * 3600 });
      await logIt();
      expect(screen.queryByRole("region", { name: "Backup reminder" })).toBeNull();
    });
  });

  it("keeps a saved log this version can't read as it is, and saves nothing over it", async () => {
    const saved: unknown[] = [];
    window.location.hash = "#/log";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      readLog: async () => ({ loaded: { state: "newer", format: 7 }, text: '{"format":7}' }),
      saveLog: async (log) => {
        saved.push(log);
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    expect(await screen.findByText(/from a newer version of Involo/)).toBeTruthy();
    const go = screen.getByRole("button", { name: "Log flight and start new" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(saved).toEqual([]);
  });

  it("offers once, in place, to log the flight when its last phase is done", async () => {
    let finished = false;
    const last = () => ({
      ...rail,
      stages: rail.stages.map((s, i) =>
        i === rail.stages.length - 1 ? { ...s, phases: [phase("taxi", "Taxi", finished ? 9 : 8, 0, 9)] } : s,
      ),
    });
    window.location.hash = "#/phase/taxi";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      rail: async () => last(),
      apply: async (_pack, flight, action) => {
        if (action.type === "tick") finished = true;
        if (action.type === "untick") finished = false;
        return flight;
      },
      phaseModel: async () => view(["done", "current"]),
    });
    render(App, { context: hostContext(h) });
    await waitFor(() => expect(document.querySelector(".it.current")).toBeTruthy());
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
    await fireEvent.click(document.querySelector(".it.current .done, .it.current button") as HTMLElement);
    expect(await screen.findByText("Flight complete. Log it and start new?")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
  });

  it("keeps the flight when the log can't be saved, and says so", async () => {
    const actions: Action[] = [];
    window.location.hash = "#/log";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      apply: async (_pack, flight, action) => {
        actions.push(action);
        return flight;
      },
      saveLog: async () => false,
    });
    render(App, { context: hostContext(h) });
    const go = await screen.findByRole("button", { name: "Log flight and start new" });
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(go);
    expect(await screen.findByText(/The log couldn’t be saved on this device/)).toBeTruthy();
    expect(actions.some((a) => a.type === "clear")).toBe(false);
    expect(document.querySelector(".earlier h2")?.textContent).toBe("Earlier flights");
  });

  it("starts each change from the log as saved, so another tab's flights are kept", async () => {
    const other = {
      id: "other@1",
      loggedAt: 1,
      pack: "demo",
      packVersion: "0.1.0",
      packName: "Demo",
      aircraft: "Demo jet",
      origin: "EGLL",
      destination: "LFPG",
      offBlocks: null,
      onBlocks: null,
      stages: [],
      done: 0,
      total: 4,
      skipped: [],
      plan: "manual" as const,
      finished: false,
      ticks: [],
    };
    let stored: { format: number; flights: (typeof other)[]; practice: [] } | null = null;
    window.location.hash = "#/log";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      // Opened empty; by the time this tab logs, another tab has saved a flight.
      readLog: async () =>
        stored ? { loaded: { state: "ready", value: stored, migratedFrom: null }, text: "" } : null,
      saveLog: async (log) => {
        stored = log as typeof stored;
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    const go = await screen.findByRole("button", { name: "Log flight and start new" });
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    stored = { format: 1, flights: [other], practice: [] };
    await fireEvent.click(go);
    await waitFor(() =>
      expect(document.querySelector(".earlier h2")?.textContent).toBe("Earlier flights · 2"),
    );
    expect((stored as unknown as { flights: { id: string }[] }).flights.map((f) => f.id)).toContain(
      "other@1",
    );
  });

  it("exports only the chosen pack's flights and practice results, and keeps the choice on coming back", async () => {
    const logged = (id: string, pack: string, packName: string) => ({
      id,
      loggedAt: 1_000,
      pack,
      packVersion: "0.1.0",
      packName,
      aircraft: null,
      origin: "EGLL",
      destination: "LFPG",
      offBlocks: null,
      onBlocks: null,
      stages: [],
      done: 0,
      total: 4,
      skipped: [],
      plan: "manual" as const,
      finished: false,
      ticks: [],
    });
    const result = {
      id: "g@2",
      at: 2_000,
      pack: "glider",
      packVersion: "2.3.0",
      packName: "Glider trainer",
      aircraft: null,
      title: "T",
      score: 1,
      total: 2,
    };
    const saved = {
      format: 3,
      flights: [logged("demo@1", "demo", "Demo"), logged("glider@1", "glider", "Glider trainer")],
      practice: [result],
    };
    const csv: unknown[] = [];
    const files: Blob[] = [];
    URL.createObjectURL = (b: Blob | MediaSource) => {
      files.push(b as Blob);
      return "blob:log";
    };
    URL.revokeObjectURL = () => {};
    window.location.hash = "#/log";
    const h = host({
      readLog: async () => ({ loaded: { state: "ready", value: saved, migratedFrom: null }, text: "" }),
      logCsv: async (log) => {
        csv.push(log);
        return "csv";
      },
    });
    render(App, { context: hostContext(h) });
    await fireEvent.click(await screen.findByRole("button", { name: "Glider trainer 2" }));
    expect(document.querySelector(".earlier h2")?.textContent).toBe("Earlier flights · 1");
    await fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(csv).toHaveLength(1));
    expect(csv[0]).toMatchObject({ flights: [{ id: "glider@1" }], practice: [{ id: "g@2" }] });
    await fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    const json = JSON.parse(await (files.at(-1) as Blob).text());
    expect(json.flights.map((f: { id: string }) => f.id)).toEqual(["glider@1"]);
    expect(json.practice.map((r: { id: string }) => r.id)).toEqual(["g@2"]);
    await fireEvent.click(screen.getByRole("button", { name: "Save copy (HTML file)" }));
    expect(await (files.at(-1) as Blob).text()).toContain("with Glider trainer only.");
    // Opening a flight and coming back keeps the chosen pack.
    window.location.hash = "#/log/glider%401";
    window.location.hash = "#/log";
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Glider trainer 2" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
    // All packs exports everything again.
    await fireEvent.click(screen.getByRole("button", { name: "All packs 3" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(JSON.parse(await (files.at(-1) as Blob).text()).flights).toHaveLength(2);
  });

  it("doesn't offer to log a flight that was already finished when it loaded", async () => {
    const done = {
      ...rail,
      stages: rail.stages.map((s, i) =>
        i === rail.stages.length - 1 ? { ...s, phases: [phase("taxi", "Taxi", 9, 0, 9)] } : s,
      ),
    };
    window.location.hash = "#/phase/taxi";
    const h = host({
      readSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      rail: async () => done,
      phaseModel: async () => view(["done", "current"]),
    });
    render(App, { context: hostContext(h) });
    await waitFor(() => expect(document.querySelector(".it.current")).toBeTruthy());
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
  });

  it("saves a finished practice test in the log as practiceResult builds it, with the open pack (#107)", {
    timeout: 15_000,
  }, async () => {
    const asked: [string, unknown][] = [];
    const saved: { practice: PracticeResult[] }[] = [];
    window.location.hash = "#/practice";
    const h = host({
      // A pack with practice questions: the demo pack has none.
      loadPack: async () => iflyPack(),
      practiceResult: async (pack, r) => {
        asked.push([pack, r]);
        return {
          id: `${pack}@${r.at}`,
          pack,
          packVersion: "0.1.0",
          packName: "Demo",
          aircraft: "Demo jet",
          ...r,
        };
      },
      saveLog: async (log) => {
        saved.push(log as { practice: PracticeResult[] });
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    // Lights of the flight deck deals only choice questions, whichever it draws. Check ride's
    // random deal could start with a step order question, which has no answers to choose.
    // Each wait has room for a busy machine (1 s by default); the test's own limit still ends it.
    const slow = { timeout: 5_000 };
    await fireEvent.click(await screen.findByRole("button", { name: /^Lights of the flight deck/ }, slow));
    // The first question is on screen once its answers are.
    const answers = await screen.findByRole("radiogroup", { name: "Answers" }, slow);
    await fireEvent.click(within(answers).getAllByRole("radio")[0] as HTMLElement);
    await fireEvent.click(screen.getByRole("button", { name: "End test" }));
    // The interface hands Rust the finished test and the open pack; what it saves is what
    // practiceResult made, with the pack's version, its name and the aircraft.
    await waitFor(() => expect(saved).toHaveLength(1), slow);
    expect(asked).toHaveLength(1);
    const [pack, finished] = asked[0] as [
      string,
      { title: string; score: number; total: number; at: number },
    ];
    expect(pack).toBe("demo");
    expect(finished).toMatchObject({ total: 1 });
    expect(Object.keys(finished).sort()).toEqual(["at", "score", "title", "total"]);
    expect(saved[0]?.practice).toEqual([
      {
        id: `demo@${finished.at}`,
        pack: "demo",
        packVersion: "0.1.0",
        packName: "Demo",
        aircraft: "Demo jet",
        ...finished,
      },
    ]);
  });

  it("shows on Practice home only this aircraft's latest saved result", async () => {
    window.location.hash = "#/practice";
    const result = (pack: string, title: string, at: number) => ({
      id: `${pack}@${at}`,
      pack,
      packVersion: "0.1.0",
      packName: pack,
      aircraft: null,
      at,
      title,
      score: 3,
      total: 4,
    });
    const h = host({
      readLog: async () => ({
        loaded: {
          state: "ready",
          value: {
            format: 1,
            flights: [],
            practice: [result("other", "Other jet test", 9), result("demo", "Memory items", 5)],
          },
          migratedFrom: null,
        },
        text: "",
      }),
    });
    render(App, { context: hostContext(h) });
    expect((await screen.findByText(/^Last result, /)).textContent).toMatch(/Memory items, 3 of 4$/);
  });

  it("puts Flight log in the menu, first under This flight and the app", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("link", { name: "Flight log" }).getAttribute("href")).toBe("#/log");
  });
});

describe("packs (decision 0028; Packs boards)", () => {
  const aircraft = {
    family: "Test family",
    name: "Test jet",
    icaoTypes: ["TJ1"],
    simulator: "Test sim",
    developer: "Test dev",
  };
  const OTHER: InstalledPack = {
    summary: { id: "other", name: "Other jet", version: "0.1.0", kind: "aircraft", aircraft },
    source: "file",
    installedAt: 2,
  };
  const entry = (id: string, name: string, version = "0.1.0") => ({
    id,
    name,
    version,
    aircraft,
    engine: ">=0.1.0",
    size: 600_000,
    sha256: "",
  });
  const settingsWith = (currentPack: string | null) =>
    ({
      theme: "dark",
      dimming: 0,
      detail: "expanded",
      listView: "checklist",
      tourSeen: true,
      noticeSeen: true,
      currentPack,
      seat: null,
    }) as Settings;
  const savedSettings = (s: Settings) => ({
    loaded: { state: "ready", value: s, migratedFrom: null } as Loaded<Settings>,
    text: "",
  });

  it("opens a fresh device on the Packs page, and installing a pack opens it", async () => {
    const saves: Settings[] = [];
    const restart = vi.fn();
    const installCatalogPack = vi.fn(async () => ({ state: "installed" as const, pack: DEMO }));
    const h = host({
      installedPacks: async () => [],
      catalog: async () => [entry("demo", "Demo"), entry("other", "Other jet")],
      installCatalogPack,
      save: async (_p, what, value) => {
        if (what === "settings") saves.push(value as Settings);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    expect(await screen.findByRole("heading", { level: 1, name: "Choose your first aircraft" })).toBeTruthy();
    // The first catalog pack's Download is the primary button.
    const first = await screen.findByRole("button", { name: "Download Demo" });
    expect(first.classList.contains("primary")).toBe(true);
    expect(screen.getByRole("button", { name: "Download Other jet" }).classList.contains("primary")).toBe(
      false,
    );
    await fireEvent.click(first);
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(installCatalogPack).toHaveBeenCalledWith(expect.objectContaining({ id: "demo" }));
    expect(saves.at(-1)?.currentPack).toBe("demo");
  });

  it("says a connection is needed once when a fresh device is offline", async () => {
    const h = host({
      installedPacks: async () => [],
      catalog: async () => {
        throw new Error("offline");
      },
    });
    render(App, { context: hostContext(h) });
    expect(
      await screen.findByText("Involo needs a connection once, to download a pack. Connect, then try again."),
    ).toBeTruthy();
  });

  it("shows why a pack file was refused, and keeps the page", async () => {
    const restart = vi.fn();
    const h = host({
      installedPacks: async () => [],
      installPackFile: async () => ({ state: "refused", reasons: ["This is not an Involo pack file."] }),
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Choose your first aircraft" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "x.involo-pack")] });
    await fireEvent.change(input);
    expect(await screen.findByText("That file wasn’t added.")).toBeTruthy();
    expect(screen.getByText("This is not an Involo pack file.")).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
  });

  it("opens the pack the settings name, so a switch survives a reload", async () => {
    const loaded: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => savedSettings(settingsWith("other")),
      loadPack: async (id) => {
        loaded.push(id);
        return pack;
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    expect(loaded[0]).toBe("other");
  });

  it("opens the pack with a saved flight when the settings name none (saved before packs were chosen)", async () => {
    const loaded: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => savedSettings(settingsWith(null)),
      readSaved: async (id) => ({
        flight:
          id === "other"
            ? {
                loaded: {
                  state: "ready",
                  value: { pack: "other", options: {}, session: { done: {}, skipped: {} }, values: {} },
                  migratedFrom: 3,
                } as unknown as Loaded<Flight>,
                text: "",
              }
            : null,
        settings: null,
      }),
      loadPack: async (id) => {
        loaded.push(id);
        return pack;
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    expect(loaded[0]).toBe("other");
  });

  it("switches packs from the menu's pack line, a real menu", async () => {
    const saves: Settings[] = [];
    const restart = vi.fn();
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      save: async (_p, what, value) => {
        if (what === "settings") saves.push(value as Settings);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const line = document.querySelector<HTMLButtonElement>("#drawer .packline");
    if (!line) throw new Error("no pack line");
    await fireEvent.click(line);
    const menu = await screen.findByRole("menu", { name: "Switch pack" });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    // A pack from a file says so wherever it is named.
    expect(within(items[1] as HTMLElement).getByText("Not from the Involo catalog")).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Manage packs" }).getAttribute("href")).toBe("#/packs");
    // Arrow keys move; Esc closes and gives the pack line focus back.
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    await fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(line);
    expect(document.querySelector("#drawer")?.classList.contains("open")).toBe(true);
    await fireEvent.click(line);
    await fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /Other jet/ }),
    );
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(saves.at(-1)?.currentPack).toBe("other");
  });

  it("switches from the Packs page, and offers an update only for a newer catalog version", async () => {
    window.location.hash = "#/packs";
    const restart = vi.fn();
    const installCatalogPack = vi.fn(async () => ({ state: "installed" as const, pack: DEMO }));
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      // The open pack has a newer version; the file pack's id has one too, but it isn't offered.
      catalog: async () => [
        entry("demo", "Demo", "0.2.0"),
        entry("other", "Other jet", "9.0.0"),
        entry("third", "Third jet"),
      ],
      installCatalogPack,
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    const demo = await screen.findByRole("article", { name: "Demo" });
    expect(within(demo).getByText("In use")).toBeTruthy();
    expect(await within(demo).findByText("Version 0.2.0 is available.")).toBeTruthy();
    const other = screen.getByRole("article", { name: "Other jet" });
    expect(within(other).queryByText(/is available/)).toBeNull();
    expect(within(other).getByText("Not from the Involo catalog")).toBeTruthy();
    // More packs: the catalog's packs not on this device.
    expect(screen.getByRole("button", { name: "Download Third jet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download Demo" })).toBeNull();
    // Nothing updates without the tap.
    expect(installCatalogPack).not.toHaveBeenCalled();
    await fireEvent.click(within(demo).getByRole("button", { name: "Update Demo to version 0.2.0" }));
    await waitFor(() =>
      expect(installCatalogPack).toHaveBeenCalledWith(expect.objectContaining({ version: "0.2.0" })),
    );
    // The open pack's update opens it again.
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    await fireEvent.click(within(other).getByRole("button", { name: "Use this pack" }));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(2));
  });

  it("removes a pack and keeps its saved flight unless asked; with the tick, removes that too", async () => {
    window.location.hash = "#/packs";
    const removed: string[] = [];
    const forgotten: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      removePack: async (id) => {
        removed.push(id);
        return true;
      },
      removeSaved: async (id) => {
        forgotten.push(id);
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    const other = await screen.findByRole("article", { name: "Other jet" });
    await fireEvent.click(within(other).getByRole("button", { name: "Remove Other jet…" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Other jet?" });
    const tick = within(dialog).getByRole("checkbox", {
      name: /Also remove its saved flight/,
    }) as HTMLInputElement;
    expect(tick.checked).toBe(false);
    await fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removed).toEqual(["other"]));
    expect(forgotten).toEqual([]);

    await fireEvent.click(
      within(await screen.findByRole("article", { name: "Other jet" })).getByRole("button", {
        name: "Remove Other jet…",
      }),
    );
    const again = screen.getByRole("dialog", { name: "Remove Other jet?" });
    await fireEvent.click(within(again).getByRole("checkbox", { name: /Also remove its saved flight/ }));
    await fireEvent.click(within(again).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(forgotten).toEqual(["other"]));
    expect(removed).toEqual(["other", "other"]);
  });

  it("removing the open pack opens another, or the first launch when none is left", async () => {
    window.location.hash = "#/packs";
    const saves: Settings[] = [];
    const restart = vi.fn();
    const h = host({
      removePack: async () => true,
      save: async (_p, what, value) => {
        if (what === "settings") saves.push(value as Settings);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    const demo = await screen.findByRole("article", { name: "Demo" });
    await fireEvent.click(within(demo).getByRole("button", { name: "Remove Demo…" }));
    await fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(saves.at(-1)?.currentPack).toBeNull();
  });
});

describe("one flight per pack (decision 0028)", () => {
  const OTHER: InstalledPack = {
    summary: { id: "other", name: "Other jet", version: "0.1.0", kind: "aircraft" },
    source: "catalog",
    installedAt: 2,
  };
  const fresh = (id: string) =>
    ({
      pack: id,
      options: { power: "gpu" },
      session: { done: {}, skipped: {} },
      values: {},
      notes: "",
    }) as unknown as Flight;
  const plan = (origin: string) =>
    ({ format: 1, loadedAt: 1, plan: { origin: { icao: origin } } }) as unknown as SavedPlan;

  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  /** A device that keeps each pack's flight and plan under its own key, as the web host does. */
  function device() {
    const flights = new Map<string, Flight>();
    const plans = new Map<string, SavedPlan>();
    let settings: Settings | null = null;
    const railed: Flight[] = [];
    const ready = <T>(value: T) => ({
      loaded: { state: "ready", value, migratedFrom: null } as Loaded<T>,
      text: "",
    });
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      newFlight: async (id) => fresh(id),
      apply: async (_p, f, action) => {
        if (action.type === "tick")
          return { ...f, session: { ...f.session, done: { ...f.session.done, [action.step]: action.at } } };
        if (action.type === "setNotes") return { ...f, notes: action.notes };
        return f;
      },
      rail: async (_p, f) => {
        railed.push(copy(f));
        return rail;
      },
      readSaved: async (id) => {
        const f = flights.get(id);
        return { flight: f ? ready(f) : null, settings: null };
      },
      readSettings: async () => (settings ? ready(settings) : null),
      save: async (id, what, value) => {
        if (what === "flight") flights.set(id, copy(value as Flight));
        else settings = copy(value as Settings);
        return 1;
      },
      readPlan: async (id) => {
        const p = plans.get(id);
        return p ? ready(p) : null;
      },
      savePlan: async (id, p) => {
        if (p) plans.set(id, p);
        else plans.delete(id);
      },
    });
    return { h, flights, plans, railed };
  }

  async function switchTo(name: RegExp): Promise<void> {
    await fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const line = document.querySelector<HTMLButtonElement>("#drawer .packline");
    if (!line) throw new Error("no pack line");
    await fireEvent.click(line);
    await fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name }));
  }

  it("ticks in one pack, switches, ticks in the other, and finds the first as it was left", async () => {
    const { h, flights, plans, railed } = device();
    // Pack A's flight already has values and a plan.
    flights.set("demo", {
      ...fresh("demo"),
      values: { origin: "EGLL", destination: "LFPG" },
    } as unknown as Flight);
    plans.set("demo", plan("EGLL"));
    const loadedPlans: string[] = [];
    const readPlan = h.readPlan;
    h.readPlan = async (id) => {
      loadedPlans.push(id);
      return readPlan(id);
    };
    render(Root, { context: hostContext(h) });

    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    await waitFor(() => expect(Object.keys(flights.get("demo")?.session.done ?? {})).toEqual(["standby"]));
    await switchTo(/Other jet/);

    // Pack B: its own new flight, its own tick; A's are untouched.
    await waitFor(() => expect(railed.at(-1)?.pack).toBe("other"));
    expect(railed.at(-1)?.session.done).toEqual({});
    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Battery: ON" }));
    await waitFor(() => expect(Object.keys(flights.get("other")?.session.done ?? {})).toEqual(["battery"]));
    expect(Object.keys(flights.get("demo")?.session.done ?? {})).toEqual(["standby"]);
    expect(plans.has("other")).toBe(false);

    await switchTo(/Demo/);
    await waitFor(() => expect(railed.at(-1)?.pack).toBe("demo"));
    const back = railed.at(-1) as Flight;
    expect(Object.keys(back.session.done)).toEqual(["standby"]);
    expect(back.values).toEqual({ origin: "EGLL", destination: "LFPG" });
    await waitFor(() => expect(document.querySelector(".fsline")?.textContent).toMatch(/EGLL → LFPG/));
    expect(loadedPlans).toEqual(["demo", "other", "demo"]);
    expect(plans.get("demo")).toEqual(plan("EGLL"));
  });

  it("keeps notes typed just before a switch with their pack", async () => {
    const { h, flights } = device();
    render(Root, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    const strip = document.querySelector<HTMLButtonElement>(".fsline");
    if (strip) await fireEvent.click(strip);
    const notes = await waitFor(() => {
      const t = document.querySelector<HTMLTextAreaElement>("#sp-notes");
      if (!t) throw new Error("no notes");
      return t;
    });
    await fireEvent.input(notes, { target: { value: "Climb FL240" } });
    await switchTo(/Other jet/);
    await waitFor(() =>
      expect((flights.get("demo") as unknown as { notes: string }).notes).toBe("Climb FL240"),
    );
    expect(flights.get("other")).toBeUndefined();
  });

  it("opens the pack a switch chose even when the settings can't be saved", async () => {
    const loaded: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      // Settings this version can't read: kept as they are, never saved over.
      readSettings: async () => ({
        loaded: { state: "newer", format: 99 } as Loaded<Settings>,
        text: '{"format":99}',
      }),
      loadPack: async (id) => {
        loaded.push(id);
        return pack;
      },
    });
    render(Root, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await switchTo(/Other jet/);
    await waitFor(() => expect(loaded).toEqual(["demo", "other"]));
  });

  // The saving rules (#38, #39, #40, #45) hold per pack: each case opens the second pack.
  const settingsFor = (id: string) => ({
    loaded: {
      state: "ready",
      value: {
        theme: "dark",
        dimming: 0,
        detail: "expanded",
        listView: "checklist",
        tourSeen: true,
        noticeSeen: true,
        currentPack: id,
        seat: null,
      },
      migratedFrom: null,
    } as unknown as Loaded<Settings>,
    text: "",
  });

  it("sets aside only the open pack's unusable flight on Start fresh (#38)", async () => {
    const asides: string[] = [];
    const read: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => settingsFor("other"),
      newFlight: async (id) => fresh(id),
      readSaved: async (id) => {
        read.push(id);
        return {
          flight:
            id === "other"
              ? { loaded: { state: "newer", format: 9 } as Loaded<Flight>, text: '{"format":9}' }
              : null,
          settings: null,
        };
      },
      setAside: async (id, what) => {
        asides.push(`${id}:${what}`);
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    expect(await screen.findByText("Your saved progress is from a newer version of the app.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    await waitFor(() => expect(asides).toEqual(["other:flight"]));
    // The first pack's saved flight is read only for its line in the switcher.
    expect(read[0]).toBe("other");
  });

  it("says the open pack's progress isn't being saved, and saves under that pack (#39)", async () => {
    const saved: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => settingsFor("other"),
      newFlight: async (id) => fresh(id),
      save: async (id, what) => {
        saved.push(`${id}:${what}`);
        return null;
      },
    });
    render(App, { context: hostContext(h) });
    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    expect(await screen.findByText("Progress isn’t being saved on this device.")).toBeTruthy();
    expect(saved).toContain("other:flight");
    expect(saved).not.toContain("demo:flight");
  });

  it("ignores another window's save of a different pack's flight (#40)", async () => {
    const stored = new Map<string, Flight>([
      ["other", { ...fresh("other"), values: { origin: "KSEA" } } as unknown as Flight],
    ]);
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => settingsFor("other"),
      newFlight: async (id) => fresh(id),
      readSaved: async (id) => {
        const f = stored.get(id);
        return {
          flight: f
            ? { loaded: { state: "ready", value: f, migratedFrom: null } as Loaded<Flight>, text: "" }
            : null,
          settings: null,
        };
      },
    });
    render(App, { context: hostContext(h) });
    await waitFor(() => expect(document.querySelector(".fsline")?.textContent).toMatch(/KSEA/));
    // Another window ticks in the first pack: this window's pack and flight stay as they are.
    stored.set("demo", { ...fresh("demo"), values: { origin: "EGLL" } } as unknown as Flight);
    window.dispatchEvent(new StorageEvent("storage", { key: "involo.flight.demo" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector(".fsline")?.textContent).toMatch(/KSEA/);
    expect(document.querySelector(".fsline")?.textContent).not.toMatch(/EGLL/);
  });

  it("reads and keeps only the open pack's unreadable plan (#45)", async () => {
    const plansRead: string[] = [];
    const asides: string[] = [];
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      readSettings: async () => settingsFor("other"),
      newFlight: async (id) => fresh(id),
      readPlan: async (id) => {
        plansRead.push(id);
        return id === "other"
          ? { loaded: { state: "unreadable", reason: "bad" } as Loaded<SavedPlan>, text: "x" }
          : null;
      },
      setAside: async (id, what) => {
        asides.push(`${id}:${what}`);
        return true;
      },
    });
    render(App, { context: hostContext(h) });
    expect(await screen.findByText("Your saved SimBrief plan could not be read.")).toBeTruthy();
    expect(plansRead).toEqual(["other"]);
    await fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    await waitFor(() => expect(asides).toEqual(["other:plan"]));
  });
});

describe("a pack update during a flight (decision 0028; PacksUpdate)", () => {
  const changes = {
    packName: "Demo",
    fromVersion: "0.1.0",
    toVersion: "0.2.0",
    added: [{ step: "battery", title: "Cabin pressure check", place: "Departure › Before start" }],
    reworded: [
      {
        step: "standby",
        title: "Standby power",
        place: "Preflight › Power up",
        fields: [{ field: "Value", before: "AUTO", after: "AUTO, CHECK" }],
      },
    ],
    removed: [
      { step: "old-step", title: "Window heat test", place: "Departure › Before start", wasTicked: true },
    ],
  } as unknown as PackChanges;
  const flightV = (version: string, update: unknown = undefined) =>
    ({
      pack: "demo",
      packVersion: version,
      options: { power: "gpu" },
      session: { done: {}, skipped: {} },
      values: {},
      notes: "",
      ...(update ? { update } : {}),
    }) as unknown as Flight;
  const readyFlight = (f: Flight) => ({
    flight: { loaded: { state: "ready", value: f, migratedFrom: null } as Loaded<Flight>, text: "" },
    settings: null,
  });
  /** The note's actions, as Rust applies them. */
  const noting: Host["apply"] = async (_p, f, action) => {
    if (action.type === "noteUpdate")
      return { ...f, update: { changes: action.changes, seen: false } } as Flight;
    if (action.type === "seeUpdateNote")
      return { ...f, update: f.update ? { ...f.update, seen: true } : null } as Flight;
    if (action.type === "dismissUpdateNote") {
      const { update: _gone, ...rest } = f as Flight & { update?: unknown };
      return rest as Flight;
    }
    return f;
  };

  it("brings a flight saved with another version in line, and saves it so; the same version is left alone", async () => {
    const saved: Flight[] = [];
    const reconciled: string[] = [];
    const h = host({
      readSaved: async () => readyFlight(flightV("0.0.9")),
      reconcile: async (_p, f) => {
        reconciled.push(f.packVersion);
        return { ...f, packVersion: "0.1.0" };
      },
      save: async (_p, what, value) => {
        if (what === "flight") saved.push(value as Flight);
        return 1;
      },
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await waitFor(() => expect(saved.at(-1)?.packVersion).toBe("0.1.0"));
    expect(reconciled).toEqual(["0.0.9"]);
    cleanup();

    const again: Flight[] = [];
    const same = host({
      readSaved: async () => readyFlight(flightV("0.1.0")),
      save: async (_p, what, value) => {
        if (what === "flight") again.push(value as Flight);
        return 1;
      },
    });
    render(App, { context: hostContext(same) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await new Promise((r) => setTimeout(r, 30));
    expect(again).toEqual([]);
    expect(screen.queryByRole("region", { name: "Pack updated" })).toBeNull();
  });

  it("shows the note at the top of the checklist, open the first time, until it is dismissed", async () => {
    const applied: string[] = [];
    window.location.hash = "#/phase/power-up";
    const h = host({
      readSaved: async () => readyFlight(flightV("0.2.0", { changes, seen: false })),
      apply: async (p, f, action) => {
        applied.push(action.type);
        return noting(p, f, action);
      },
    });
    render(App, { context: hostContext(h) });
    const note = await screen.findByRole("region", { name: "Pack updated" });
    expect(within(note).getByRole("heading", { name: "Demo updated to version 0.2.0" })).toBeTruthy();
    expect(within(note).getByText("+1 added")).toBeTruthy();
    expect(within(note).getByText("1 reworded")).toBeTruthy();
    expect(within(note).getByText("−1 removed")).toBeTruthy();
    // Open by itself the first time; marked as shown.
    expect(
      within(note).getByRole("button", { name: "Hide what changed" }).getAttribute("aria-expanded"),
    ).toBe("true");
    await waitFor(() => expect(applied).toContain("seeUpdateNote"));
    expect(within(note).getByText("You had ticked this step; the tick is gone with it.")).toBeTruthy();
    expect(within(note).getByText("AUTO, CHECK")).toBeTruthy();
    // A removed step is named, not linked; a step still there is a link.
    expect(within(note).queryByRole("button", { name: "Window heat test" })).toBeNull();
    await fireEvent.click(within(note).getByRole("button", { name: "Go to the first new step" }));
    await waitFor(() => expect(location.hash).toBe("#/phase/power-up"));
    await fireEvent.click(within(note).getAllByRole("button", { name: "Dismiss" })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Pack updated" })).toBeNull());
    expect(applied).toContain("dismissUpdateNote");
  });

  it("keeps a seen note's list folded until opened", async () => {
    window.location.hash = "#/phase/power-up";
    render(App, {
      context: hostContext(
        host({
          readSaved: async () => readyFlight(flightV("0.2.0", { changes, seen: true })),
          apply: noting,
        }),
      ),
    });
    const note = await screen.findByRole("region", { name: "Pack updated" });
    const fold = within(note).getByRole("button", { name: "What changed" });
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(within(note).queryByText("Window heat test")).toBeNull();
    await fireEvent.click(fold);
    expect(within(note).getByText("Window heat test")).toBeTruthy();
  });

  it("shows What's new from the Packs page, and Update keeps those changes as the open flight's note", async () => {
    window.location.hash = "#/packs";
    const restart = vi.fn();
    const saved: Flight[] = [];
    const packChanges = vi.fn(async () => changes);
    const installCatalogPack = vi.fn(async () => ({ state: "installed" as const, pack: DEMO }));
    const entry = {
      id: "demo",
      name: "Demo",
      version: "0.2.0",
      aircraft: { family: "", name: "", icaoTypes: [], simulator: "", developer: "" },
      engine: ">=0.1.0",
      size: 1,
      sha256: "",
    };
    const h = host({
      catalog: async () => [entry],
      packChanges,
      installCatalogPack,
      apply: noting,
      save: async (_p, what, value) => {
        if (what === "flight") saved.push(value as Flight);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await fireEvent.click(await screen.findByRole("button", { name: "What’s new in Demo 0.2.0" }));
    const dialog = await screen.findByRole("dialog", { name: "What’s new in Demo 0.2.0" });
    expect(within(dialog).getByText("Cabin pressure check")).toBeTruthy();
    expect(within(dialog).getByText("+1 added")).toBeTruthy();
    // Nothing is installed until Update.
    expect(installCatalogPack).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(packChanges).toHaveBeenCalledTimes(1);
    expect((saved.at(-1) as Flight & { update?: { changes: PackChanges } }).update?.changes).toEqual(changes);
  });

  it("updating another pack keeps the note with that pack's saved flight", async () => {
    window.location.hash = "#/packs";
    const OTHER: InstalledPack = {
      summary: { id: "other", name: "Other jet", version: "0.1.0", kind: "aircraft" },
      source: "catalog",
      installedAt: 2,
    };
    const entry = {
      id: "other",
      name: "Other jet",
      version: "0.2.0",
      aircraft: { family: "", name: "", icaoTypes: [], simulator: "", developer: "" },
      engine: ">=0.1.0",
      size: 1,
      sha256: "",
    };
    const saves: [string, Flight][] = [];
    const restart = vi.fn();
    const h = host({
      installedPacks: async () => [DEMO, OTHER],
      // The first pack is open.
      readSettings: async () => ({
        loaded: {
          state: "ready",
          value: {
            theme: "dark",
            dimming: 0,
            detail: "expanded",
            listView: "checklist",
            tourSeen: true,
            noticeSeen: true,
            currentPack: "demo",
            seat: null,
          },
          migratedFrom: null,
        } as unknown as Loaded<Settings>,
        text: "",
      }),
      catalog: async () => [entry],
      packChanges: async () => ({ ...changes, packName: "Other jet" }),
      installCatalogPack: async () => ({ state: "installed", pack: OTHER }),
      readSaved: async (id) =>
        id === "other"
          ? readyFlight({ ...flightV("0.1.0"), pack: "other" } as Flight)
          : { flight: null, settings: null },
      apply: noting,
      save: async (id, what, value) => {
        if (what === "flight") saves.push([id, value as Flight]);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    const other = await screen.findByRole("article", { name: "Other jet" });
    await fireEvent.click(
      await within(other).findByRole("button", { name: "Update Other jet to version 0.2.0" }),
    );
    await waitFor(() => expect(saves.some(([id]) => id === "other")).toBe(true));
    const [, kept] = saves.find(([id]) => id === "other") as [
      string,
      Flight & { update?: { changes: PackChanges } },
    ];
    expect(kept.update?.changes.packName).toBe("Other jet");
    expect(restart).not.toHaveBeenCalled();
  });

  it("a pack file with a newer version keeps what changed as the note, as an update from the catalog does", async () => {
    window.location.hash = "#/packs";
    const restart = vi.fn();
    const saved: Flight[] = [];
    const h = host({
      readSaved: async () => readyFlight(flightV("0.1.0")),
      installPackFile: async () => ({ state: "installed", pack: { ...DEMO, source: "file" }, changes }),
      apply: noting,
      save: async (_p, what, value) => {
        if (what === "flight") saved.push(value as Flight);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("article", { name: "Demo" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "demo-0.2.0.involo-pack")] });
    await fireEvent.change(input);
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect((saved.at(-1) as Flight & { update?: { changes: PackChanges } }).update?.changes).toEqual(changes);
  });

  it("counts ticks it couldn't keep when there was no list of changes, and never shows a step id", async () => {
    window.location.hash = "#/phase/power-up";
    const lost = { ...changes, added: [], reworded: [], removed: [], lostTicks: 2 } as unknown as PackChanges;
    render(App, {
      context: hostContext(
        host({
          readSaved: async () => readyFlight(flightV("0.2.0", { changes: lost, seen: false })),
          apply: noting,
        }),
      ),
    });
    const note = await screen.findByRole("region", { name: "Pack updated" });
    expect(
      within(note).getByText("2 ticks couldn’t be kept: their steps are no longer in the pack."),
    ).toBeTruthy();
    expect(note.textContent).not.toMatch(/old-step|\.[a-z-]+\.[a-z-]+/);
  });
});

describe("back up and restore (#47)", () => {
  const ticked = {
    pack: "demo",
    packVersion: "0.1.0",
    options: {},
    session: { done: { battery: 5 }, skipped: {} },
    values: {},
  } as unknown as Flight;
  const ready = <T>(value: T) => ({
    loaded: { state: "ready", value, migratedFrom: null } as Loaded<T>,
    text: "{}",
  });
  const stored = {
    theme: "dark",
    dimming: 0,
    detail: "expanded",
    listView: "checklist",
    tourSeen: true,
    noticeSeen: true,
    lastBackup: null,
  } as unknown as Settings;

  it("saves every pack's flight, the settings and the log in one file, then says when", async () => {
    const files: Blob[] = [];
    URL.createObjectURL = (b: Blob | MediaSource) => {
      files.push(b as Blob);
      return "blob:backup";
    };
    URL.revokeObjectURL = () => {};
    const parts: unknown[] = [];
    const saves: Settings[] = [];
    window.location.hash = "#/settings";
    const h = host({
      readSaved: async () => ({ flight: ready(ticked), settings: ready(stored) }),
      backupText: async (p) => {
        parts.push(p);
        return "the backup";
      },
      save: async (_p, what, value) => {
        if (what === "settings") saves.push(value as Settings);
        return 1;
      },
    });
    render(App, { context: hostContext(h) });
    expect(await screen.findByText("Last backup: never")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Save a backup file" }));
    await waitFor(() => expect(files).toHaveLength(1));
    expect(await files[0]?.text()).toBe("the backup");
    const p = parts[0] as {
      flights: { pack: string; source: string; place: unknown }[];
      settings: Settings;
      savedAt: number;
    };
    expect(p.flights.map((f) => [f.pack, f.source])).toEqual([["demo", "catalog"]]);
    // Where the flight is, as the Packs page says it.
    expect(p.flights[0]?.place).toEqual({ place: "Preflight › Power up", done: 18, total: 29 });
    await waitFor(() => expect(saves.at(-1)?.lastBackup).toBe(p.savedAt));
    expect(screen.getByText(/^Last backup: \w{3} \d+ at \d\d:\d\d$/)).toBeTruthy();
  });

  it("restores only what the review leaves ticked, after Restore, and starts again", async () => {
    const restart = vi.fn();
    const saved: [string, string, unknown][] = [];
    const restored = vi.fn(async (_p: string, f: Flight) => ({ ...f, packVersion: "0.1.0" }));
    const backup = {
      kind: "involo-backup",
      format: 1,
      appVersion: "0.1.0",
      savedAt: new Date(2026, 10, 18, 10, 14).getTime(),
      flights: [
        {
          pack: "demo",
          name: "Demo",
          version: "0.0.9",
          source: "catalog",
          place: { place: "Departure › Taxi", done: 12, total: 40 },
          flight: { ...ticked, packVersion: "0.0.9" },
          plan: null,
        },
      ],
      settings: { ...stored, theme: "light", lastBackup: 1, currentPack: "other" },
      log: { format: 3, flights: [], practice: [] },
    };
    window.location.hash = "#/settings";
    const h = host({
      readSaved: async () => ({ flight: ready(ticked), settings: ready({ ...stored, lastBackup: 7 }) }),
      readBackup: async () => ({ state: "ready", backup: backup as never, earlier: null }),
      restoreFlight: restored,
      save: async (p, what, value) => {
        saved.push([p, what, value]);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("button", { name: "Restore from a file…" });
    const input = document.querySelector('.set.backup input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "b.json")], configurable: true });
    await fireEvent.change(input);
    const dialog = await screen.findByRole("dialog", { name: "Restore from this backup?" });
    expect(
      within(dialog).getByText(
        "Backup saved Nov 18, 2026 at 10:14 by Involo 0.1.0. Untick anything you want to leave as it is.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("In the backup: Departure › Taxi, 12 of 40")).toBeTruthy();
    expect(
      within(dialog).getByText("Replaces the flight on this device: Preflight › Power up, 18 of 29"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Brought up to version 0.1.0, with a note on what changed."),
    ).toBeTruthy();
    // Nothing is saved while the review is open.
    expect(saved).toEqual([]);
    // Settings unticked: only the flight is restored.
    await fireEvent.click(within(dialog).getAllByRole("checkbox")[1] as HTMLElement);
    await fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restart).toHaveBeenCalledWith("demo"));
    expect(restored).toHaveBeenCalledWith("demo", expect.objectContaining({ packVersion: "0.0.9" }));
    expect(saved.filter(([, what]) => what === "settings")).toEqual([]);
    expect(saved.find(([, what]) => what === "flight")?.[2]).toMatchObject({
      pack: "demo",
      packVersion: "0.1.0",
    });
  });

  it("restores settings keeping this device's last backup and open pack", async () => {
    const restart = vi.fn();
    const saved: Settings[] = [];
    const backup = {
      kind: "involo-backup",
      format: 1,
      appVersion: "0.1.0",
      savedAt: 1,
      flights: [],
      settings: { ...stored, theme: "light", lastBackup: 1, currentPack: "other" },
      log: { format: 3, flights: [], practice: [] },
    };
    window.location.hash = "#/settings";
    const h = host({
      readSaved: async () => ({
        flight: null,
        settings: ready({ ...stored, lastBackup: 7, currentPack: "demo" }),
      }),
      readBackup: async () => ({ state: "ready", backup: backup as never, earlier: null }),
      save: async (_p, what, value) => {
        if (what === "settings") saved.push(value as Settings);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("button", { name: "Restore from a file…" });
    const input = document.querySelector('.set.backup input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "b.json")], configurable: true });
    await fireEvent.change(input);
    const dialog = await screen.findByRole("dialog", { name: "Restore from this backup?" });
    // No flights in the file, and nothing new for the log: only Settings.
    expect(within(dialog).queryByText("Flights")).toBeNull();
    expect(within(dialog).queryByText("Flight log")).toBeNull();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(saved.at(-1)).toMatchObject({ theme: "light", lastBackup: 7, currentPack: "demo" });
  });

  it("says on its row why a Download in the review failed, as the Packs page does, and still keeps the flight", async () => {
    const restart = vi.fn();
    const saved: [string, string][] = [];
    const listed = {
      id: "jet",
      name: "Other jet",
      version: "0.2.0",
      aircraft: { family: "Jet", name: "Other jet", icaoTypes: [] },
      size: 1,
      sha256: "",
    };
    const backup = {
      kind: "involo-backup",
      format: 1,
      appVersion: "0.1.0",
      savedAt: 1,
      flights: [
        {
          pack: "jet",
          name: "Other jet",
          version: "0.2.0",
          source: "catalog",
          place: null,
          flight: { ...ticked, pack: "jet", packVersion: "0.2.0" },
          plan: null,
        },
      ],
      settings: stored,
      log: { format: 3, flights: [], practice: [] },
    };
    window.location.hash = "#/settings";
    const h = host({
      catalog: async () => [listed as never],
      readBackup: async () => ({ state: "ready", backup: backup as never, earlier: null }),
      installCatalogPack: async () => {
        throw new Error("The connection dropped.");
      },
      save: async (p, what) => {
        saved.push([p, what]);
        return 1;
      },
    });
    render(App, { props: { onRestart: restart }, context: hostContext(h) });
    await screen.findByRole("button", { name: "Restore from a file…" });
    const input = document.querySelector('.set.backup input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "b.json")], configurable: true });
    await fireEvent.change(input);
    const dialog = await screen.findByRole("dialog", { name: "Restore from this backup?" });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    const alert = await within(dialog).findByRole("alert");
    // The Packs page's words for a failed catalog download.
    expect(alert.textContent).toContain("Other jet couldn’t be downloaded.");
    expect(alert.textContent).toContain("The connection dropped.");
    const row = within(dialog).getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(row.checked).toBe(true);
    // Restored anyway: the flight is kept for when the pack is added.
    await fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(saved).toContainEqual(["jet", "flight"]);
  });

  it("refuses a file over the size limit unread, with its own line", async () => {
    const read = vi.fn(async () => ({ state: "refused" as const, refusal: { kind: "notBackup" as const } }));
    window.location.hash = "#/settings";
    render(App, { context: hostContext(host({ readBackup: read })) });
    await screen.findByRole("button", { name: "Restore from a file…" });
    const big = new File(["{}"], "huge.json");
    Object.defineProperty(big, "size", { value: 96 * 1024 * 1024 + 1 });
    const input = document.querySelector('.set.backup input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    await fireEvent.change(input);
    const dialog = await screen.findByRole("dialog", { name: "This backup can’t be restored" });
    expect(within(dialog).getByText("This file is too large to be an Involo backup.")).toBeTruthy();
    expect(within(dialog).getByText("Nothing on this device was changed.")).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a file it can't restore and changes nothing", async () => {
    const saves = vi.fn(async () => 1);
    window.location.hash = "#/settings";
    const h = host({
      readBackup: async () => ({ state: "refused", refusal: { kind: "logFile" } }),
      save: saves,
    });
    render(App, { context: hostContext(h) });
    await screen.findByRole("button", { name: "Restore from a file…" });
    const before = saves.mock.calls.length;
    const input = document.querySelector('.set.backup input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "log.json")], configurable: true });
    await fireEvent.change(input);
    const dialog = await screen.findByRole("dialog", { name: "This backup can’t be restored" });
    expect(
      within(dialog).getByText("This is a flight log file. Load it from the Flight log page."),
    ).toBeTruthy();
    expect(within(dialog).getByText("Nothing on this device was changed.")).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saves.mock.calls.length).toBe(before);
  });
});
