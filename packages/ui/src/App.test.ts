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
    loadSaved: async () => ({ flight: null, settings: null }),
    save: async () => 0,
    setAside: async () => {},
    defaultSettings: async () =>
      ({ theme: "dark", dimming: 0, detail: "expanded", listView: "checklist" }) as Settings,
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
    ...overrides,
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

    // Nothing entered yet: the strip asks for the flight (owner, batch 3), and opens the panel.
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

  it("gives each list a plain label row with the fold's text, for tablet and phone (owner, batch 6)", async () => {
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
});
