// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { parseRoute } from "../route.svelte";
import { deckAreas } from "./deck";
import {
  available,
  beforeEngineStart,
  deal,
  dealOne,
  holds,
  orderMiss,
  phasesOf,
  pickWrong,
  random,
  type Seed,
  sameMeaning,
  seeds,
  sourcesIn,
  spellsOut,
  stepShows,
  TOPICS,
  type Topic,
  windows,
} from "./practice";

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
const index = indexPack(pack);
const all = seeds(pack, index);
const count = (topic: Topic, id = "") =>
  all.filter((q) => q.topic === topic && q.id.startsWith(`${topic}:${id}`)).length;

describe("the question generator", () => {
  it("deals every question with four options, none meaning the same as another, exactly one correct", () => {
    const rng = random(7);
    for (const seed of all) {
      const q = dealOne(seed, rng);
      if (q.kind !== "choice" || seed.kind !== "choice") continue;
      expect(q.options, q.id).toHaveLength(4);
      expect(q.options[q.answer], q.id).toBe(seed.answer);
      for (const [i, a] of q.options.entries())
        for (const [j, b] of q.options.entries())
          if (i < j) expect(sameMeaning(a, b), `${q.id}: ${a} / ${b}`).toBe(false);
    }
  });

  it("never invents an option: every wrong option is one of the pack's neighbors", () => {
    const rng = random(3);
    for (const seed of all) {
      if (seed.kind !== "choice") continue;
      const q = dealOne(seed, rng);
      if (q.kind !== "choice") continue;
      const real = new Set(seed.tiers.flatMap((t) => t.items));
      for (const [i, o] of q.options.entries())
        if (i !== q.answer) expect(real.has(o), `${q.id}: ${o}`).toBe(true);
    }
  });

  it("gives order questions 4 to 6 steps, dealt out of order", () => {
    const rng = random(11);
    for (const seed of all.filter((q) => q.kind === "order")) {
      const q = dealOne(seed, rng);
      if (q.kind !== "order") continue;
      expect(q.items.length, q.id).toBeGreaterThanOrEqual(4);
      expect(q.items.length, q.id).toBeLessThanOrEqual(6);
      expect(new Set(q.items).size, q.id).toBe(q.items.length);
      expect([...q.shown].sort(), q.id).toEqual(q.items.map((_, i) => i));
      expect(
        q.shown.some((v, i) => v !== i),
        q.id,
      ).toBe(true);
    }
  });

  it("links every question to a source that resolves: a step, a Flight deck place, a Glossary term or a phase", () => {
    const areas = deckAreas(index);
    const terms = new Set((pack.content.glossary?.terms ?? []).map((t) => t.term));
    const phases = new Set((pack.content.phases?.phases ?? []).map((p) => p.id));
    for (const q of all) {
      expect(q.links.length, q.id).toBeGreaterThan(0);
      for (const link of q.links) {
        if (link.step) expect(index.step(link.step), q.id).toBeTruthy();
        const r = parseRoute(link.href);
        if (r.screen === "phase") expect(phases.has(r.id), `${q.id}: ${link.href}`).toBe(true);
        else if (r.screen === "glossary") expect(terms.has(r.term ?? ""), q.id).toBe(true);
        else if (r.screen === "deck") {
          const area = areas.find((a) => a.id === r.area);
          expect(
            area?.zones.some((z) => z.id === r.zone),
            `${q.id}: ${link.href}`,
          ).toBe(true);
        } else throw new Error(`${q.id}: ${link.href} does not resolve`);
      }
      for (const id of q.steps) expect(index.step(id), q.id).toBeTruthy();
    }
  });

  it("produces the counts from today's pack (2026-11-16; reported to the owner, then refined as the generator applies the rules)", () => {
    expect(count("memory", "next")).toBe(20);
    expect(count("memory", "order")).toBe(5);
    expect(count("lights", "meaning")).toBe(163);
    expect(count("lights", "light")).toBe(130);
    expect(count("faults", "action")).toBe(9);
    expect(count("faults", "cause")).toBe(24);
    // 256: 8 steps whose other drawn positions all mean the value, and 17 whose list has a second
    // step of the same title with another value, are left out.
    expect(count("values")).toBe(256);
    expect(count("order", "next")).toBe(365);
    expect(all.filter((q) => q.topic === "order" && q.kind === "order").length).toBe(80);
    expect(count("challenge")).toBe(55);
    expect(count("terms", "meaning")).toBe(103);
    expect(count("terms", "term")).toBe(84);
    expect(count("where", "area")).toBe(151);
    expect(count("where", "panel")).toBe(151);
  });

  it("asks which mnemonic an item belongs to, its next item and its order, with no letter questions (owner)", () => {
    expect(count("mnemonics", "which")).toBe(24);
    expect(count("mnemonics", "next")).toBe(8);
    expect(count("mnemonics", "order")).toBe(5);
  });

  it("skips a question that cannot find three wrong options, rather than padding it", () => {
    expect(pickWrong("ON", [{ items: ["ON", "OFF", "ON, GUARD CLOSED"], shuffle: false }])).toEqual(["OFF"]);
    // The Climb checklist has three steps: none of its challenges can be asked.
    const climb = pack.lists.find((l) => l.title === "Climb checklist");
    expect(climb).toBeTruthy();
    expect(
      all.some((q) => q.topic === "challenge" && q.steps.some((s) => climb?.steps.some((c) => c.id === s))),
    ).toBe(false);
  });

  it("follows the flight's options and the chosen stages", () => {
    const gated = all.find((q) => q.steps.some((s) => index.step(s)?.show_if));
    expect(gated).toBeTruthy();
    const step = gated?.steps.map((s) => index.step(s)).find((s) => s?.show_if);
    const off = stepShows(pack, {});
    const choice = { topics: TOPICS.map((t) => t.id), phases: null, options: {} };
    if (step && !off(step.id)) expect(available(all, choice, off)).not.toContain(gated);
    const pre = phasesOf(pack, ["Preflight"]);
    const preflight = available(all, { ...choice, phases: pre }, () => true);
    expect(preflight.every((q) => q.phases === null || q.phases.some((p) => pre.includes(p)))).toBe(true);
    expect(preflight.some((q) => q.topic === "memory")).toBe(true);
    expect(holds({ option: "x", equals: "a" }, {})).toBe(false);
    expect(
      holds(
        {
          any_of: [
            { option: "x", equals: "a" },
            { option: "y", one_of: ["b"] },
          ],
        },
        { y: "b" },
      ),
    ).toBe(true);
  });

  it("deals a test across the topics, one question per source", () => {
    const pool = available(
      all,
      { topics: ["lights", "values", "order", "where"], phases: null, options: {} },
      () => true,
    );
    const test = deal(pool, 20, random(1));
    expect(test).toHaveLength(20);
    expect(new Set(test.map((q) => q.source)).size).toBe(20);
    expect(new Set(test.map((q) => q.topic)).size).toBe(4);
    const few = pool.filter((q) => q.topic === "faults" || q.id.startsWith("lights:meaning:oh/fuel"));
    expect(deal(few, 40, random(2))).toHaveLength(sourcesIn(few));
  });

  it("Before engine start: the Preflight stage, then Departure up to and including Engine start, by phase id (owner)", () => {
    const b = beforeEngineStart(pack);
    expect(b.stages).toEqual(["Preflight", "Departure"]);
    expect(b.phases).toContain("preflight");
    expect(b.phases.at(-1)).toBe("engine-start");
    for (const later of ["before-taxi", "taxi", "before-takeoff", "takeoff"])
      expect(b.phases).not.toContain(later);
    const pool = available(
      all,
      { topics: ["values", "order", "where"], phases: b.phases, options: {} },
      () => true,
    );
    expect(
      pool.some((q) => q.phases?.includes("before-taxi") && !q.phases.some((p) => b.phases.includes(p))),
    ).toBe(false);
    expect(pool.some((q) => q.phases?.includes("engine-start"))).toBe(true);
  });

  it("splits a list into order questions of 4 to 6", () => {
    expect(windows([1, 2, 3]).length).toBe(0);
    expect(windows([1, 2, 3, 4, 5, 6, 7]).map((w) => w.length)).toEqual([6]);
    expect(windows(Array.from({ length: 13 }, (_, i) => i)).map((w) => w.length)).toEqual([4, 5, 4]);
    expect(windows(Array.from({ length: 11 }, (_, i) => i)).map((w) => w.length)).toEqual([6, 5]);
  });

  it("says where a missed order went wrong first", () => {
    expect(orderMiss(["A", "B", "C", "D"], ["B", "A", "C", "D"])).toEqual({
      yours: "B first",
      right: "A first",
    });
    expect(orderMiss(["A", "B"], ["A", "B"])).toBeNull();
  });

  it("never offers a light with the same label as the one drawn (review: two right answers)", () => {
    for (const q of all.filter((x) => x.id.startsWith("lights:meaning:"))) {
      if (q.kind !== "choice") continue;
      const label = q.id.split("/")[2] ?? "";
      const notes = pack.content.lights?.lights ?? [];
      const sameLabel = notes.filter(
        (l) => l.locator.split("/")[2] === label && `lights:meaning:${l.locator}` !== q.id,
      );
      for (const w of q.tiers.flatMap((t) => t.items))
        expect(
          sameLabel.some((l) => l.meaning === w),
          q.id,
        ).toBe(false);
    }
  });

  it("never offers a mnemonic that also has the item (review: ATCT and ACTT share items)", () => {
    const briefs = pack.content.briefings?.briefings ?? [];
    for (const q of all.filter((x) => x.id.startsWith("mnemonics:which:"))) {
      if (q.kind !== "choice") continue;
      const word = q.stem?.kind === "card" ? (q.stem.body ?? "") : "";
      for (const w of q.tiers.flatMap((t) => t.items)) {
        const b = briefs.find((x) => x.mnemonic === w);
        expect(
          b?.items.some((i) => sameMeaning(`${i.lead}${i.rest}`, word)),
          `${q.id}: ${w}`,
        ).toBe(false);
      }
    }
  });

  it("asks no step value whose list has another step of the same title with another value (review)", () => {
    const fireTest = all.filter(
      (q) =>
        q.topic === "values" &&
        q.stem?.kind === "card" &&
        /^FIRE TEST switch$/i.test(q.stem.title) &&
        q.stem.body === "Establishing APU power",
    );
    expect(fireTest).toEqual([]);
  });

  it("asks no next item across a branch, and orders items within one branch (review)", () => {
    for (const q of all.filter((x) => x.topic === "memory")) {
      if (q.kind === "choice") expect(/^IF\b/.test(q.answer), q.id).toBe(false);
      else
        expect(
          q.items.slice(1).some((i) => /^IF\b/.test(i)),
          q.id,
        ).toBe(false);
    }
  });

  it("asks no term whose definition spells it out (review)", () => {
    expect(spellsOut("PA", "Passenger address.")).toBe(true);
    expect(spellsOut("BARO", "Barometric altitude.")).toBe(true);
    expect(spellsOut("APU", "A small turbine in the tail.")).toBe(false);
    for (const q of all.filter((x) => x.id.startsWith("terms:term:")))
      if (q.kind === "choice" && q.stem?.kind === "card")
        expect(spellsOut(q.answer, q.stem.body ?? ""), q.id).toBe(false);
  });

  it("keeps every seed's id unique", () => {
    const ids = all.map((q: Seed) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
