// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Rail } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import { buildFind, findIn, findOnly, foundValue, marked } from "./find-index";

const pack = iflyPack();
const index = indexPack(pack);
const find = buildFind(pack, index);
const titles = new Map((pack.content.phases?.phases ?? []).map((p) => [p.id, p.title]));
const phase = (id: string) => ({
  id,
  title: titles.get(id) ?? id,
  progress: { done: 0, skipped: 0, toDo: 1, total: 1 },
  complete: false,
  open: 0,
  skipped: 0,
});
/** The pack's stages as a flight with the default options shows them. */
const rail: Rail = {
  stages: [
    { title: "Preflight", phases: ["cold-dark", "gpu-power", "exterior", "preflight"].map(phase) },
    { title: "Departure", phases: ["apu-power", "before-start", "pushback", "engine-start"].map(phase) },
  ],
  reference: [],
};

describe("find", () => {
  it("finds steps by title or value, in the flight's order, with their stage and phase", () => {
    const { steps } = findIn(find, "fuel pump", rail);
    const pumps = steps.find((s) => s.id === "ifly-737-max8.before-start.fuel-pump-switches");
    expect(pumps).toMatchObject({ stage: "Departure", phaseTitle: "Before start" });
    // From the phase on screen onward, the current step first (FindDesk).
    const here = findIn(find, "fuel", rail, { phase: "before-start", step: pumps?.id ?? null }).steps;
    expect(here[0]?.id).toBe(pumps?.id);
    expect(here.findIndex((s) => s.phase === "preflight")).toBeGreaterThan(
      here.findIndex((s) => s.phase === "engine-start"),
    );
    // Only the phases this flight shows.
    expect(findIn(find, "fuel", { stages: [], reference: [] }).steps).toHaveLength(0);
  });

  it("finds controls by name or panel, with 'Panel area · Panel', and the step that sets them", () => {
    const { controls } = findIn(find, "fuel panel", rail);
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) expect(c.where).toBe("Forward overhead (P5) · Fuel panel");
    const ctr = findIn(find, "fuel pump switches", rail).controls[0];
    expect(ctr?.at?.section).toBe("fuel");
    // The first step this flight shows that uses it (not Cruise, whose item comes first).
    expect(ctr?.step).toMatch(/\.(apu-power|before-start)\./);
  });

  it("finds terms by the term first, then by their definition", () => {
    const { terms } = findIn(find, "crossfeed", rail);
    expect(terms[0]?.term).toBe("crossfeed");
    expect(findIn(find, "fuel", rail).terms.map((t) => t.term)).toContain("crossfeed");
  });

  it("marks the first match in a title, ignoring case", () => {
    expect(marked("Fuel pump switches", "fuel")).toEqual(["", "Fuel", " pump switches"]);
    expect(marked("Battery", "fuel")).toBeNull();
    expect(findIn(find, "   ", rail).steps).toHaveLength(0);
  });
});

describe("Find opened on a set of steps (References' simulator model notes)", () => {
  const marked16 = pack.lists.flatMap((l) => l.steps.filter((s) => s.simulatorModel).map((s) => s.id));

  it("shows those steps only, in the order given, controls and terms left out", () => {
    const backwards = [...marked16].reverse();
    const found = findOnly(find, backwards, "", rail);
    expect(found.steps.map((s) => s.id)).toEqual(backwards);
    expect(found.controls).toEqual([]);
    expect(found.terms).toEqual([]);
    expect(found.steps.every((s) => s.stage && s.phaseTitle)).toBe(true);
  });

  it("names each step's place as this flight shows it, and a hidden phase's from the pack", () => {
    const where = (r: Rail | null, phaseId: string) =>
      findOnly(find, marked16, "", r).steps.find((s) => s.phase === phaseId);
    // APU start sits in Departure on a ground-power flight (the rail) ...
    expect(where(rail, "apu-power")?.stage).toBe("Departure");
    // ... and in Preflight on one without ground power.
    const noGpu: Rail = {
      ...rail,
      stages: [{ title: "Preflight", phases: ["cold-dark", "apu-power", "preflight"].map(phase) }],
    };
    expect(where(noGpu, "apu-power")?.stage).toBe("Preflight");
    // A turnaround hides Power up: its steps are still listed, placed as the pack places them.
    const turn: Rail = {
      ...rail,
      stages: rail.stages.map((st) => ({ ...st, phases: st.phases.filter((p) => p.id !== "cold-dark") })),
    };
    expect(where(turn, "cold-dark")).toMatchObject({
      stage: "Preflight",
      phaseTitle: titles.get("cold-dark"),
    });
  });

  it("narrows them by the words typed", () => {
    const some = findOnly(find, marked16, "battery", rail);
    expect(some.steps.length).toBeGreaterThan(0);
    expect(some.steps.length).toBeLessThan(marked16.length);
    expect(some.steps.every((s) => /battery/i.test(`${s.title} ${s.value}`))).toBe(true);
  });
});

describe("a found step's value (decision 0027)", () => {
  it("shows the answer's value once the decision is answered", () => {
    const fuel = find.steps.find((s) => s.id === "ifly-737-max8.before-start.fuel-pump-switches");
    expect(fuel?.when).toHaveLength(2);
    if (!fuel) return;
    expect(foundValue(fuel, {})).toBe(fuel.value);
    expect(foundValue(fuel, { center_tank: "more" })).toBe("MAIN PUMPS ON · CENTER PUMPS ON");
  });
});
