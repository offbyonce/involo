// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers (#213, Timer board): the time left, the chip on the step's row, the current step's
// words with Pause and Restart, and the running-timers bar. The flights and timers are the ones
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
import { clock, finishedBetween, leftAt, running, spoken, type Timers } from "./timers";

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

function timersAt(list: StepTimer[], now: number, calls: string[] = []): Timers {
  return {
    list,
    of: (step) => list.find((t) => t.step === step),
    now,
    chime: true,
    pause: (step) => calls.push(`pause ${step}`),
    resume: (step) => calls.push(`resume ${step}`),
    restart: (step) => calls.push(`restart ${step}`),
  };
}

function lineUp(flight: Flight, timers: Timers) {
  const settings = ok<Settings>(default_settings());
  const model = ok<PhaseModel>(
    phase_model(pack.manifest.id, JSON.stringify(flight), JSON.stringify(settings), "takeoff"),
  );
  const list = model.lists[0];
  if (!list) throw new Error("takeoff has no list");
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
  return document.querySelector(`li[data-step="${WARM_UP}"]`) as HTMLElement;
}

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
    expect(running(warm, START + 179_000)).toBe(true);
    expect(running(warm, START + 180_000)).toBe(false);
    expect(leftAt(warm, START + 999_000)).toBe(0);
    // Reached zero between two clock ticks: the one to chime for, once.
    expect(finishedBetween(list, START + 179_500, START + 180_500).map((t) => t.step)).toEqual([WARM_UP]);
    expect(finishedBetween(list, START + 180_500, START + 181_500)).toEqual([]);
    // Paused: no chime, whatever the clock says.
    expect(finishedBetween([{ ...warm, pausedLeft: 30_000 }], START + 179_500, START + 180_500)).toEqual([]);
  });

  it("show as a chip before the row's menu while running", () => {
    const { flight, list } = started();
    const row = lineUp(flight, timersAt(list, START + 21_000));
    const chip = within(row).getByRole("timer");
    expect(chip.getAttribute("aria-label")).toBe("Engine warm-up, 2 minutes 39 seconds left");
    expect(chip.textContent?.trim()).toBe("2:39");
    // The chip sits before the menu, after the value.
    const cells = [...row.children];
    const at = (name: string) => cells.findIndex((c) => c.classList.contains(name));
    expect(at("timer")).toBe(at("end") - 1);
    expect(at("timer")).toBeGreaterThan(at("value"));
  });

  it("on the current step: the board's words, then Pause and Restart before Done", async () => {
    const { flight, list } = started();
    const calls: string[] = [];
    const row = lineUp(flight, timersAt(list, START + 21_000, calls));
    expect(row.classList.contains("current")).toBe(true);
    expect(
      within(row).getByText(
        /^Engine warm-up timer started by itself when you ticked .+\. You can carry on with other steps; a chime plays at zero\.$/,
      ),
    ).toBeTruthy();
    const buttons = [...row.querySelectorAll(".actions button")].map((b) => b.textContent?.trim());
    expect(buttons.slice(0, 3)).toEqual(["Pause", "Restart", "Done"]);
    await fireEvent.click(within(row).getByRole("button", { name: "Pause" }));
    await fireEvent.click(within(row).getByRole("button", { name: "Restart" }));
    expect(calls).toEqual([`pause ${WARM_UP}`, `restart ${WARM_UP}`]);
  });

  it("say nothing about the chime when it is off, and show no chip once finished or before started", () => {
    const { flight, list } = started();
    const off = { ...timersAt(list, START + 21_000), chime: false };
    const row = lineUp(flight, off);
    expect(within(row).getByText(/You can carry on with other steps\.$/)).toBeTruthy();
    cleanup();
    expect(within(lineUp(flight, timersAt(list, START + 180_000))).queryByRole("timer")).toBeNull();
    cleanup();
    const fresh = ok<Flight>(new_flight(pack.manifest.id));
    const none = ok<StepTimer[]>(coreTimers(pack.manifest.id, JSON.stringify(fresh)));
    expect(within(lineUp(fresh, timersAt(none, START))).queryByRole("timer")).toBeNull();
  });

  it("list every running timer in the bar, and nothing once none runs", () => {
    const { list } = started();
    render(RunningTimers, { timers: timersAt(list, START + 21_000) });
    const bar = screen.getByRole("region", { name: "Running timers" });
    expect(bar.textContent).toContain("Engine warm-up 2:39");
    expect(bar.textContent).toContain(
      "Timers keep running when you change page and show in this bar until they finish.",
    );
    cleanup();
    render(RunningTimers, { timers: timersAt(list, START + 180_000) });
    expect(screen.queryByRole("region", { name: "Running timers" })).toBeNull();
  });
});
