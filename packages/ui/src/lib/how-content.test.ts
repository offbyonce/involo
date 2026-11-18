// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { examplePack, iflyPack } from "../test-pack";
import { fill, flowAreas, flowLabelOf, HOW, runs } from "./how-content";

describe("How procedures work's text", () => {
  it("has seven parts, each with a title, blocks and an In Involo box; part 2 holds the figure", () => {
    expect(HOW.parts).toHaveLength(7);
    for (const p of HOW.parts) {
      expect(p.title).toBeTruthy();
      expect(p.blocks.length).toBeGreaterThan(0);
      expect(p.inInvolo.text).toBeTruthy();
    }
    expect(HOW.parts[1]?.blocks.some((b) => "figure" in b)).toBe(true);
  });

  it("names only the values the pack gives, and closes every bold mark", () => {
    const names = new Set<string>();
    for (const p of HOW.parts) {
      for (const b of p.blocks) {
        if (!("p" in b)) continue;
        for (const m of b.p.matchAll(/\{(\w+)\}/g)) names.add(m[1] ?? "");
        expect(b.p.split("**").length % 2, b.p).toBe(1);
      }
    }
    expect([...names].sort()).toEqual(["groups", "reference", "stageNames", "stages"]);
  });

  it("fills counts and splits bold runs", () => {
    expect(fill("{stages} stages, {nope}", { stages: 5 })).toBe("5 stages, {nope}");
    expect(runs("They do a **flow**: a sweep")).toEqual([
      { text: "They do a ", bold: false },
      { text: "flow", bold: true },
      { text: ": a sweep", bold: false },
    ]);
  });

  it("names the figure's boxes after the pack's flight deck areas, by short name", () => {
    // The iFly pack: both overhead regions are Overhead, the center console is Pedestal.
    const areas = flowAreas(iflyPack());
    expect(areas).toEqual(["OVERHEAD", "GLARESHIELD", "MAIN PANEL", "PEDESTAL"]);
    expect(flowLabelOf(areas)).toBe(
      "A flow sweeps across the panels in a fixed pattern: overhead, glareshield, main panel, then pedestal",
    );
    // A pack with no regions (the example pack) names none: the fallback.
    expect(flowAreas(examplePack())).toEqual(["AREA 1", "AREA 2", "AREA 3", "AREA 4"]);
    // A region without a short name gives its name; only regions with panels on the map count.
    const p = structuredClone(iflyPack());
    const regions = p.content.controls?.overview?.regions ?? [];
    for (const r of regions) delete r.short;
    expect(flowAreas(p)).toEqual(["AFT OVERHEAD", "FORWARD OVERHEAD", "GLARESHIELD", "MAIN PANEL"]);
  });
});
