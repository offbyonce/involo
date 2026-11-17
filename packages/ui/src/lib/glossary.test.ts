// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import { buildFind } from "./find-index";
import { buildGlossary, filterTerms, letterOf, NO_EXPANSION, split } from "./glossary";

const pack = iflyPack();

describe("the expansion (Glossary answer 1)", () => {
  it("is the first sentence of an abbreviation's definition when it is a short name", () => {
    expect(split("APU", "Auxiliary power unit. A small turbine in the tail.")).toEqual({
      expansion: "Auxiliary power unit",
      definition: "A small turbine in the tail.",
    });
    expect(split("ATC", "Air traffic control.")).toEqual({
      expansion: "Air traffic control",
      definition: "",
    });
  });

  it("is left out for a statement, a long sentence, a word that is not an abbreviation, or a term not in capitals", () => {
    const none = (term: string, meaning: string) =>
      expect(split(term, meaning)).toEqual({ expansion: null, definition: meaning });
    none("SPEEDBRAKE", "Lever that raises the spoilers.");
    none("QNH", "Altimeter setting that makes the altimeter show height above sea level.");
    none("DRIVE", "The generator drive light.");
    none("N1", "Fan speed, shown as a percentage.");
    none("Bleed air", "Air taken from the engines.");
    none("POS INIT", "CDU page to set the IRS starting position.");
    none("PACK", "Air conditioning unit that cools bleed air for the cabin.");
  });
});

describe("the Glossary", () => {
  const index = indexPack(pack);
  const find = buildFind(pack, index);
  const all = buildGlossary(index, find.terms, find.steps);

  it("lists every term in the pack A to Z, case aside", () => {
    expect(all.length).toBe(find.terms.length);
    const names = all.map((t) => t.term.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
    expect(letterOf("apu")).toBe("A");
  });

  it("names the steps that use a term, each once, in flight order", () => {
    const speedbrake = all.find((t) => t.term === "SPEEDBRAKE");
    const ids = speedbrake?.steps.map((s) => s.id) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("ifly-737-max8.landing.speedbrake-lever");
  });

  it("tells apart rows that read the same: by list, or else by the condition in the pack's labels", () => {
    const apu = all.find((t) => t.term === "APU");
    const pumps = apu?.steps.filter((s) => s.title === "One left fuel pump") ?? [];
    expect(pumps.length).toBe(2);
    expect(pumps.map((s) => apu?.tags[s.id])).toEqual(["Ground power at the gate", "No ground power"]);
    // A step repeated for each engine in one list: the engine, from the step before each.
    const egt = all.find((t) => t.term === "EGT");
    const repeated =
      egt?.steps.filter((x) => x.title === "Fuel flow and EGT" && x.phase === "engine-start") ?? [];
    expect(repeated.map((s) => egt?.tags[s.id])).toEqual(["Engine 1", "Engine 2"]);
    // Only rows that would read the same carry one.
    const key = (s: { title: string; phase: string; value: string }) => `${s.title}|${s.phase}|${s.value}`;
    for (const s of apu?.steps ?? [])
      if (apu?.tags[s.id])
        expect((apu?.steps ?? []).filter((x) => key(x) === key(s)).length).toBeGreaterThan(1);
  });

  it("filters by name or expansion", () => {
    expect(filterTerms(all, "auxiliary").map((t) => t.term)).toContain("APU");
    expect(filterTerms(all, "")).toBe(all);
  });
});

describe("the reviewed exceptions", () => {
  it("gives no expansion to the terms whose first sentence reads as a description, each still in the pack", () => {
    const terms = pack.content.glossary?.terms ?? [];
    for (const name of NO_EXPANSION) {
      const t = terms.find((x) => x.term === name);
      expect(t, name).toBeTruthy();
      expect(split(name, t?.meaning ?? "")).toEqual({ expansion: null, definition: t?.meaning });
    }
  });
});
