// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers (#213, Timers boards): the time left, the chip in its four states, the line of text
// with its buttons, and the running-timers bar. The flights and timers are the ones
// Rust builds, for iFly's engine warm-up, which starts from the later start lever tick.

import type { Checklist, Flight, PhaseModel, Settings, StepTimer } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
  apply,
  timers as coreTimers,
  default_settings,
  new_flight,
  phase_model,
} from "../../../../apps/web/src/wasm/involo_web_host.js";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import ListCard from "./ListCard.svelte";
import RunningTimers from "./RunningTimers.svelte";
import { clock, finishedBetween, leftAt, spoken, stateAt, type Timers, timerWords } from "./timers";

const ok = <T>(reply: string): T => (JSON.parse(reply) as { ok: T }).ok;
const WARM_UP = "ifly-737-max8.takeoff.engine-warm-up";
const LEVERS = [
  "ifly-737-max8.engine-start.engine-2-start-lever",
  "ifly-737-max8.engine-start.engine-1-start-lever",
];
const START = 1_763_400_000_000;

afterEach(() => cleanup());

const pack = iflyPack();

/** A flight with both start levers ticked, the later at START, and the core's timers for it. */
function started(): { flight: Flight; list: StepTimer[] } {
  let flight = ok<Flight>(new_flight(pack.manifest.id));
  LEVERS.forEach((step, i) => {
    flight = ok<Flight>(
      apply(
        pack.manifest.id,
        JSON.stringify(flight),
        JSON.stringify({ type: "tick", step, at: START - 60_000 + i * 60_000 }),
      ),
    );
  });
  return { flight, list: ok<StepTimer[]>(coreTimers(pack.manifest.id, JSON.stringify(flight))) };
}

function timersAt(
  list: StepTimer[],
  now: number,
  calls: string[] = [],
  layout: Timers["layout"] = "desktop",
): Timers {
  return {
    list,
    of: (step) => list.find((t) => t.step === step),
    now,
    chime: true,
    layout,
    pause: (step) => calls.push(`pause ${step}`),
    resume: (step) => calls.push(`resume ${step}`),
    restart: (step) => calls.push(`restart ${step}`),
  };
}

const act = (flight: Flight, action: object): Flight =>
  ok<Flight>(apply(pack.manifest.id, JSON.stringify(flight), JSON.stringify(action)));
const timersOf = (flight: Flight): StepTimer[] =>
  ok<StepTimer[]>(coreTimers(pack.manifest.id, JSON.stringify(flight)));

const IRS = "ifly-737-max8.preflight.irs";
const LIGHTS = "ifly-737-max8.preflight.panel-and-flood-lights";

/** The phase's first list as a card, and the row of `step` in it. */
function lineUp(flight: Flight, timers: Timers, phase = "takeoff", step = WARM_UP) {
  const settings = ok<Settings>(default_settings());
  const model = ok<PhaseModel>(
    phase_model(pack.manifest.id, JSON.stringify(flight), JSON.stringify(settings), phase),
  );
  const list = model.lists[0];
  if (!list) throw new Error(`${phase} has no list`);
  render(ListCard, {
    index: indexPack(pack),
    list,
    source: pack.lists.find((l) => l.id === list.id) as Checklist,
    flight,
    detail: "expanded",
    selected: null,
    onTick: () => {},
    onSkip: () => {},
    onUnskip: () => {},
    onBlank: () => {},
    onSelect: () => {},
    onClear: () => {},
    timers,
  });
  return document.querySelector(`li[data-step="${step}"]`) as HTMLElement;
}

/** The preflight with its first step and the IRS ticked, the IRS at START. */
function irsTicked(): Flight {
  let flight = ok<Flight>(new_flight(pack.manifest.id));
  flight = act(flight, { type: "tick", step: LIGHTS, at: START - 60_000 });
  return act(flight, { type: "tick", step: IRS, at: START });
}

const texts = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((b) => b.textContent?.trim());

describe("step timers (#213)", () => {
  it("count down from when they started, never below zero, and read as the chip shows them", () => {
    const { list } = started();
    const warm = list.find((t) => t.step === WARM_UP) as StepTimer;
    expect(warm.startedAt).toBe(START);
    expect(leftAt(warm, START + 21_000)).toBe(159_000);
    expect(clock(159_000)).toBe("2:39");
    expect(clock(158_100)).toBe("2:39");
    expect(spoken(159_000)).toBe("2 minutes 39 seconds left");
    expect(spoken(60_000)).toBe("1 minute left");
    expect(stateAt(warm, START + 179_000)).toBe("running");
    expect(stateAt(warm, START + 180_000)).toBe("finished");
    expect(stateAt({ ...warm, pausedLeft: 30_000 }, START + 999_000)).toBe("paused");
    expect(stateAt({ ...warm, startedAt: null }, START)).toBe("waiting");
    expect(leftAt(warm, START + 999_000)).toBe(0);
    // Reached zero between two clock ticks: the one to chime for, once.
    expect(finishedBetween(list, START + 179_500, START + 180_500).map((t) => t.step)).toEqual([WARM_UP]);
    expect(finishedBetween(list, START + 180_500, START + 181_500)).toEqual([]);
    // Paused: no chime, whatever the clock says.
    expect(finishedBetween([{ ...warm, pausedLeft: 30_000 }], START + 179_500, START + 180_500)).toEqual([]);
  });

  it("not started on the current step: an outlined chip with the whole time under the value, and the words under the location", () => {
    const flight = act(ok<Flight>(new_flight(pack.manifest.id)), { type: "tick", step: LIGHTS, at: START });
    const row = lineUp(flight, timersAt(timersOf(flight), START), "preflight", IRS);
    expect(row.classList.contains("current")).toBe(true);
    const chip = within(row).getByRole("timer");
    expect(chip.getAttribute("aria-label")).toBe("IRS alignment timer, 10 minutes, not started");
    expect(chip.textContent?.replace(/\s+/g, "")).toBe("10:00");
    expect(chip.classList.contains("waiting")).toBe(true);
    // Under the value, in its column; the words in the name's column, with no buttons.
    expect(row.querySelector(".value")?.contains(chip)).toBe(true);
    const words = within(row).getByText("Timer: 10 minutes. It starts when you tick this step.");
    expect(row.querySelector(".namecol")?.contains(words)).toBe(true);
    expect(texts(row, ".tw button")).toEqual([]);
    // Done and Skip for now as ever.
    expect(texts(row, ".actions button")).toEqual(["Done", "Skip for now"]);
  });

  it("an auto-start timer not started names its trigger steps", () => {
    const fresh = ok<Flight>(new_flight(pack.manifest.id));
    const warm = timersOf(fresh).find((t) => t.step === WARM_UP) as StepTimer;
    const words = timerWords(
      warm,
      START,
      { name: (id) => id.split(".").pop() ?? id, action: () => "" },
      true,
    );
    expect(words).toBe(
      "Timer: 3 minutes. It starts when you tick engine-2-start-lever or engine-1-start-lever.",
    );
  });

  it("running on its done row: the chip, the words naming what the step set, Pause and Restart; out of the done fold", async () => {
    const calls: string[] = [];
    const flight = irsTicked();
    const row = lineUp(flight, timersAt(timersOf(flight), START + 168_000, calls), "preflight", IRS);
    expect(row.classList.contains("done")).toBe(true);
    const chip = within(row).getByRole("timer");
    expect(chip.getAttribute("aria-label")).toBe("IRS alignment timer, 7 minutes 12 seconds left");
    expect(chip.textContent?.trim()).toBe("7:12");
    expect(row.querySelector(".value")?.contains(chip)).toBe(true);
    const line = row.querySelector(".tw.line") as HTMLElement;
    expect(line.textContent).toContain(
      "Timer started when you set NAV. Carry on with other steps; a chime plays at zero.",
    );
    expect(texts(line, "button")).toEqual(["Pause", "Restart"]);
    await fireEvent.click(within(line).getByRole("button", { name: "Pause" }));
    await fireEvent.click(within(line).getByRole("button", { name: "Restart" }));
    expect(calls).toEqual([`pause ${IRS}`, `restart ${IRS}`]);
    // Two done steps at the top, but the timed one stays out of the fold.
    expect(document.querySelector(".done-group")).toBeNull();
  });

  it("paused: Paused before the time left, the words, Resume and Restart", () => {
    let flight = irsTicked();
    flight = act(flight, { type: "pauseTimer", step: IRS, at: START + 329_000 });
    const row = lineUp(flight, timersAt(timersOf(flight), START + 999_000), "preflight", IRS);
    const chip = within(row).getByRole("timer");
    expect(chip.getAttribute("aria-label")).toBe("IRS alignment timer, paused, 4 minutes 31 seconds left");
    expect(chip.textContent?.replace(/\s+/g, " ").trim()).toBe("Paused 4:31");
    const line = row.querySelector(".tw.line") as HTMLElement;
    expect(line.textContent).toContain("Timer paused with 4:31 left.");
    expect(texts(line, "button")).toEqual(["Resume", "Restart"]);
  });

  it("finished: Finished at 0:00, the words and Restart; it stays on the row", () => {
    const flight = irsTicked();
    const row = lineUp(flight, timersAt(timersOf(flight), START + 600_000), "preflight", IRS);
    const chip = within(row).getByRole("timer");
    expect(chip.getAttribute("aria-label")).toBe("IRS alignment timer, finished");
    expect(chip.textContent?.replace(/\s+/g, " ").trim()).toBe("Finished 0:00");
    const line = row.querySelector(".tw.line") as HTMLElement;
    expect(line.textContent).toContain("Timer finished.");
    expect(texts(line, "button")).toEqual(["Restart"]);
  });

  it("on the tablet's and phone's current step, the words follow the chip; on a phone's done row the chip comes before the menu", () => {
    const { flight, list } = started();
    let row = lineUp(flight, timersAt(list, START + 21_000, [], "tablet"));
    expect(row.classList.contains("current")).toBe(true);
    const value = row.querySelector(".value") as HTMLElement;
    expect(value.querySelector(".tw")?.textContent).toMatch(/^Timer started when you set IDLE\. Carry on/);
    expect(texts(value, ".tw button")).toEqual(["Pause", "Restart"]);
    expect(texts(row, ".actions button")).toEqual(["Done", "Skip for now"]);
    cleanup();
    const done = irsTicked();
    row = lineUp(done, timersAt(timersOf(done), START + 1_000, [], "phone"), "preflight", IRS);
    const cells = [...row.children];
    const at = (name: string) => cells.findIndex((c) => c.classList.contains(name));
    expect(at("tchip")).toBe(at("end") - 1);
    expect(row.querySelector(".value [role=timer]")).toBeNull();
  });

  it("say nothing about the chime when it is off, and show nothing on a row that isn't current before it starts", () => {
    const { flight, list } = started();
    const row = lineUp(flight, { ...timersAt(list, START + 21_000), chime: false });
    expect(within(row).getByText(/Carry on with other steps\.$/)).toBeTruthy();
    cleanup();
    const fresh = ok<Flight>(new_flight(pack.manifest.id));
    const irs = lineUp(fresh, timersAt(timersOf(fresh), START), "preflight", IRS);
    expect(irs.classList.contains("current")).toBe(false);
    expect(within(irs).queryByRole("timer")).toBeNull();
  });

  it("list every running or paused timer in the bar, and nothing when none is", () => {
    const { list } = started();
    const warm = list.find((t) => t.step === WARM_UP) as StepTimer;
    render(RunningTimers, { timers: timersAt(list, START + 21_000) });
    const bar = screen.getByRole("region", { name: "Running timers" });
    expect(bar.textContent).toContain("Engine warm-up 2:39");
    expect(bar.textContent).toContain("Timers keep running when you change page.");
    cleanup();
    render(RunningTimers, { timers: timersAt([{ ...warm, pausedLeft: 271_000 }], START) });
    expect(screen.getByRole("region", { name: "Running timers" }).textContent).toContain(
      "Engine warm-up 4:31 · Paused",
    );
    cleanup();
    render(RunningTimers, { timers: timersAt(list, START + 180_000) });
    expect(screen.queryByRole("region", { name: "Running timers" })).toBeNull();
  });
});
