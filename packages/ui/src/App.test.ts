// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type {
  Action,
  FlatPack,
  Flight,
  Loaded,
  PhaseView,
  Rail,
  RailPhase,
  SavedPlan,
  Settings,
  StepState,
} from "@involo/bindings";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.svelte";
import { type Host, hostContext } from "./host";

function phase(id: string, title: string, done: number, skipped: number, total: number): RailPhase {
  const progress = { done, skipped, toDo: total - done - skipped, total };
  return { id, title, progress, complete: done === total, open: total - done, skipped };
}

const rail: Rail = {
  stages: [
    {
      title: "Preflight",
      phases: [phase("power-up", "Power up", 0, 1, 2), phase("exterior", "Exterior", 18, 0, 18)],
    },
    { title: "Departure", phases: [phase("taxi", "Taxi", 0, 0, 9)] },
  ],
  reference: [phase("memory", "Memory items", 0, 0, 12)],
};

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
          ask_in: ["power-up"],
        },
      ],
      stages: [],
      phases: [],
    },
    controls: {
      zones: [{ id: "elec", area: "Forward overhead", title: "Electrical", short_title: "ELEC" }],
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
} as unknown as FlatPack;

function view(states: [StepState, StepState]): PhaseView {
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

function host(overrides: Partial<Host> = {}): Host {
  return {
    appInfo: async () => ({ name: "Involo", version: "0.1.0", packSchemaVersion: 2 }),
    packs: async () => [{ id: "demo", name: "Demo", version: "0.1.0", kind: "aircraft" }],
    loadPack: async () => pack,
    newFlight: async () =>
      ({
        pack: "demo",
        options: { power: "gpu" },
        session: { done: {}, skipped: {} },
        values: {},
      }) as unknown as Flight,
    apply: async (_pack, flight) => flight,
    rail: async () => rail,
    phaseView: async () => view(["skipped", "current"]),
    openSteps: async () => [],
    suggestion: async () => null,
    loadSaved: async () => ({ flight: null, settings: null }),
    save: async () => 0,
    setAside: async () => {},
    defaultSettings: async () =>
      ({ theme: "dark", dimming: 0, detail: "expanded", listView: "checklist", tourSeen: true }) as Settings,
    fetchPlan: async () => {
      throw new Error("no network in tests");
    },
    readPlanFile: async () => {
      throw new Error("no plan file in tests");
    },
    planValues: async () => ({ values: {}, filled: 0, origin: "", destination: "", checkClearance: false }),
    loadPlan: async () => null,
    savePlan: async () => {},
    decodeMetar: async () => ({ station: null, time: null, groups: [], rows: [] }),
    decodeTaf: async () => ({ station: null, time: null, groups: [], rows: [] }),
    ...fakeLog(),
    ...overrides,
  };
}

/** The Flight log's host calls, with the log's rules reduced to what these tests need (the real
 * ones are Rust's, tested there): entries newest first, added or deleted by id. */
function fakeLog(): Pick<Host, "newLog" | "loadLog" | "saveLog" | "logEntry" | "editLog" | "logCsv"> {
  return {
    newLog: async () => ({ format: 1, flights: [], practice: [] }),
    loadLog: async () => null,
    saveLog: async () => true,
    logEntry: async (pack, flight, _settings, plan, at) => ({
      id: `${pack}@${at}`,
      loggedAt: at,
      pack,
      packVersion: "0.1.0",
      aircraft: "Demo",
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
      ticks: Object.entries(flight.session.done).map(([step, at]) => ({ at, step, text: step, value: "ON" })),
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
      phaseView: async () => view(states),
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
    render(App, { context: hostContext(host({ phaseView: async () => view(states) })) });

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
      phaseView: async () => view(["skipped", "current"]),
    });
    render(App, { context: hostContext(h) });

    // Nothing entered yet: the strip asks for the flight (batch 3), and opens the panel.
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
    expect(document.querySelector<HTMLElement>(".fsline")?.textContent).toMatch(/— → —.*Runway—.*Squawk7000/);
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
      phaseView: async () => shown,
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
    const h = host({ phaseView: async () => ({ ...view(["current", "to_do"]), arrival: true }) });
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

  it("shows the current step in a large box in Flow view", async () => {
    render(App, { context: hostContext(host()) });
    await screen.findByRole("heading", { level: 1, name: "Power up" });
    await fireEvent.click(
      within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Flow" }),
    );

    expect(await screen.findByRole("heading", { level: 1, name: "STANDBY POWER" })).toBeTruthy();
    expect(screen.getByText("Power up · Step 2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmed, next step" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(false);
    // The standby step's control has a place, so Flow view offers "Where is this?" (in the step on
    // narrow screens, and on the side pane's location line).
    expect(screen.getAllByText("Where is this?").length).toBeGreaterThan(0);
    // Nor does the step set a control, so the hint does not ask to set it.
    expect(screen.getByText("Check it, then confirm.")).toBeTruthy();
    expect(screen.queryByText("Set it, check it, then confirm.")).toBeNull();
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
      loadSaved: async () => ({
        flight: {
          loaded: { state: "ready", value: savedFlight, migratedFrom: null } as Loaded<Flight>,
          text: "{}",
        },
        settings: null,
      }),
      phaseView: async (_p, f) => {
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
      loadSaved: async () => ({
        flight: { loaded: { state: "newer", format: 9 } as Loaded<Flight>, text: '{"format":9}' },
        settings: null,
      }),
      save: async (_p, what) => {
        saves.push(what);
        return 0;
      },
      setAside: async (_p, what) => {
        asides.push(what);
      },
    });
    render(App, { context: hostContext(h) });

    expect(await screen.findByText("Your saved progress is from a newer version of the app.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Save a copy" })).toBeTruthy();
    await fireEvent.click(await screen.findByRole("button", { name: "Confirm Standby power: AUTO" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(saves).not.toContain("flight");

    await fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(asides).toEqual(["flight"]);
    expect(saves).toContain("flight");
    expect(screen.queryByText(/newer version of the app/)).toBeNull();
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

  it("gives each list a plain label row with the fold's text, for tablet and phone (batch 6)", async () => {
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
        phaseView: async () => view(["current", "to_do"]),
        loadSaved: async () =>
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
        loadPlan: async () => (withPlan ? ({ plan: {} } as unknown as SavedPlan) : null),
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
            expect_when: [
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
      phaseView: async (_p, f) =>
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
            ? { ...st, note: "The simulator powers it at once.", simulator_model: true }
            : st,
        ),
      })),
      content: {
        ...pack.content,
        phases: {
          ...pack.content.phases,
          stages: [{ title: "Preflight", phases: [{ phase: "power-up" }] }],
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
    const lists = (id: string, n: number) => ({
      id,
      title: id,
      reference: true,
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
            lists("memory", 2),
            lists("qrh", 3),
            lists("nnc", 4),
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

  it("How procedures work's current phase is the phase last open, over the first with steps to do (review)", async () => {
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

  it("moves between steps with the arrow keys and ticks with Space in Checklist view", async () => {
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
          }) as Settings,
        ...more,
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
            loadSaved: async () =>
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
      loadSaved: async () => ({
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

  it("keeps a saved log this version can't read as it is, and saves nothing over it", async () => {
    const saved: unknown[] = [];
    window.location.hash = "#/log";
    const h = host({
      loadSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      loadLog: async () => ({ loaded: { state: "newer", format: 7 }, text: '{"format":7}' }),
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
      loadSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      rail: async () => last(),
      apply: async (_pack, flight, action) => {
        if (action.type === "tick") finished = true;
        if (action.type === "untick") finished = false;
        return flight;
      },
      phaseView: async () => view(["done", "current"]),
    });
    render(App, { context: hostContext(h) });
    await waitFor(() => expect(document.querySelector(".it.current")).toBeTruthy());
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
    await fireEvent.click(document.querySelector(".it.current .done, .it.current button") as HTMLElement);
    expect(await screen.findByText("Flight complete. Log it and start new?")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
  });

  it("keeps the flight when the log can't be saved, and says so (review)", async () => {
    const actions: Action[] = [];
    window.location.hash = "#/log";
    const h = host({
      loadSaved: async () => ({
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

  it("starts each change from the log as saved, so another tab's flights are kept (review)", async () => {
    const other = {
      id: "other@1",
      loggedAt: 1,
      pack: "demo",
      packVersion: "0.1.0",
      aircraft: "Demo",
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
      loadSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      // Opened empty; by the time this tab logs, another tab has saved a flight.
      loadLog: async () =>
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

  it("doesn't offer to log a flight that was already finished when it loaded (review)", async () => {
    const done = {
      ...rail,
      stages: rail.stages.map((s, i) =>
        i === rail.stages.length - 1 ? { ...s, phases: [phase("taxi", "Taxi", 9, 0, 9)] } : s,
      ),
    };
    window.location.hash = "#/phase/taxi";
    const h = host({
      loadSaved: async () => ({
        flight: { loaded: { state: "ready", value: ticked(), migratedFrom: null }, text: "{}" },
        settings: null,
      }),
      rail: async () => done,
      phaseView: async () => view(["done", "current"]),
    });
    render(App, { context: hostContext(h) });
    await waitFor(() => expect(document.querySelector(".it.current")).toBeTruthy());
    expect(screen.queryByText("Flight complete. Log it and start new?")).toBeNull();
  });

  it("shows on Practice home only this aircraft's latest saved result (review)", async () => {
    window.location.hash = "#/practice";
    const result = (pack: string, title: string, at: number) => ({
      id: `${pack}@${at}`,
      pack,
      at,
      title,
      score: 3,
      total: 4,
    });
    const h = host({
      loadLog: async () => ({
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
