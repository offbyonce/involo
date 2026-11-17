// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { areaOf, deckAreas, deckHref, zoneControls, zoneLights, zoneSections, zoneSteps } from "./deck";

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
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
