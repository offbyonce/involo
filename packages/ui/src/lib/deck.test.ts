// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack, sidestickPack } from "../test-pack";
import { areaOf, deckAreas, deckHref, zoneControls, zoneLights, zoneSections, zoneSteps } from "./deck";

const pack = iflyPack();
const index = indexPack(pack);
const zone = (id: string) => {
  const z = index.zones.find((x) => x.id === id);
  if (!z) throw new Error(id);
  return z;
};

describe("the Flight deck's areas (Deck board)", () => {
  const areas = deckAreas(index);

  it("are the board's seven, the console split by the pack's area names, then Around the flight deck", () => {
    expect(areas.map((a) => [a.name, a.code])).toEqual([
      ["Aft overhead", "P5"],
      ["Forward overhead", "P5"],
      ["Glareshield", "P7"],
      ["Main panel", "P1–P3"],
      ["Forward electronic", "P9"],
      ["Control stand", null],
      ["Aft electronic", "P8"],
      ["Around the flight deck", null],
    ]);
    // Each console panel lights only its own outline of the console in the side view.
    expect(areas.slice(4, 7).map((a) => a.side?.shape)).toEqual([0, 1, 2]);
  });

  it("split a region only as the side view draws it, and keep every region without one", () => {
    // The side view draws the console as one outline: one area for it.
    const one = structuredClone(pack);
    const side = one.content.controls?.overview?.views?.side;
    const console = side?.places?.find((p) => p.shapes.length > 1);
    if (!console) throw new Error("no split place");
    console.shapes = console.shapes.slice(0, 1);
    const names = deckAreas(indexPack(one)).map((a) => a.name);
    expect(names).toContain(console.region);
    expect(names).not.toContain("Control stand");
    // No side view: every region is an area of its own, in the pack's order, each with its map.
    const none = structuredClone(pack);
    if (none.content.controls?.overview?.views) none.content.controls.overview.views.side = null;
    const plain = deckAreas(indexPack(none));
    const regions = pack.content.controls?.overview?.regions ?? [];
    expect(plain.map((a) => a.name)).toEqual(regions.map((r) => r.name));
    expect(plain.every((a) => a.region !== null && a.side === null)).toBe(true);
  });

  it("for a pack without regions, are its zones' area names, each listing its zones (#108)", () => {
    // The Airbus-style example pack draws no regions: before, its Flight deck showed no area at all.
    const areas = deckAreas(indexPack(sidestickPack()));
    expect(areas.map((a) => [a.name, a.zones.map((z) => z.title)])).toEqual([
      ["Overhead", ["Fuel panel"]],
      ["Glareshield", ["Flight control unit"]],
    ]);
    expect(areas.every((a) => a.region === null && a.side === null)).toBe(true);
  });

  it("name a split region's areas as the side view names its outlines, else as written", () => {
    expect(areas.slice(4, 7).map((a) => a.name)).toEqual([
      "Forward electronic",
      "Control stand",
      "Aft electronic",
    ]);
    const plain = structuredClone(pack);
    for (const p of plain.content.controls?.overview?.views?.side?.places ?? []) p.names = [];
    expect(
      deckAreas(indexPack(plain))
        .slice(4, 7)
        .map((a) => a.name),
    ).toEqual(["Forward electronic panel", "Control stand", "Aft electronic panel"]);
  });

  it("hold no area names in the code", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(`${import.meta.dirname}/deck.ts`, "utf8");
    const names = (pack.content.controls?.overview?.regions ?? []).map((r) => r.name);
    const areas = [...new Set(index.zones.map((z) => z.area).filter(Boolean))] as string[];
    for (const n of [...names, ...areas, "Forward electronic", "Aft electronic"])
      expect(text, n).not.toContain(n);
  });

  it("give every place one area; Around the flight deck has no map and lights nothing", () => {
    const placed = areas.flatMap((a) => a.zones.map((z) => z.id));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.length).toBe(index.zones.length);
    const around = areas.at(-1);
    expect(around?.region).toBeNull();
    expect(around?.boxes).toEqual([]);
    expect(around?.side).toBeNull();
    expect(around?.zones.filter((z) => zoneSections(index, z).length).length).toBe(2);
  });

  it("finds a place's drawing, lights, controls and steps", () => {
    const fuel = zone("fuel");
    expect(zoneSections(index, fuel).map((s) => s.section.id)).toEqual(["fuel"]);
    expect(zoneLights(index, fuel).some((l) => l.label === "LOW PRESSURE" && l.meaning)).toBe(true);
    const steps = zoneSteps(index, fuel).map((s) => s.id);
    expect(new Set(steps).size).toBe(steps.length);
    expect(steps).toEqual([...steps].sort((a, b) => index.order(a) - index.order(b)));
    expect(steps).toContain("ifly-737-max8.before-start.fuel-pump-switches");
    expect(zoneControls(index, zone("efb")).length).toBeGreaterThan(0);
  });

  it("opens a place by its address, in its area", () => {
    expect(areaOf(areas, "fuel")?.id).toBe("forward-overhead");
    expect(deckHref("forward-overhead", "fuel")).toBe("#/deck/forward-overhead/fuel");
    expect(deckHref()).toBe("#/deck");
  });
});
