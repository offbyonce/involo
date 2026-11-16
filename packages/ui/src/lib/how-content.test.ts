// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fill, HOW, runs } from "./how-content";

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

  it("names only the counts the pack gives, and closes every bold mark", () => {
    const names = new Set<string>();
    for (const p of HOW.parts) {
      for (const b of p.blocks) {
        if (!("p" in b)) continue;
        for (const m of b.p.matchAll(/\{(\w+)\}/g)) names.add(m[1] ?? "");
        expect(b.p.split("**").length % 2, b.p).toBe(1);
      }
    }
    expect([...names].sort()).toEqual(["memory", "procedures", "qrh", "stages"]);
  });

  it("fills counts and splits bold runs", () => {
    expect(fill("{stages} stages, {nope}", { stages: 5 })).toBe("5 stages, {nope}");
    expect(runs("They do a **flow**: a sweep")).toEqual([
      { text: "They do a ", bold: false },
      { text: "flow", bold: true },
      { text: ": a sweep", bold: false },
    ]);
  });
});
