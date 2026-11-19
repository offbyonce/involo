// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { CatalogEntry, Rail } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import type { InstalledPack } from "../host";
import { aircraftLine, isNewer, morePacks, savedLine, sizeLabel, updateFor } from "./packs";

const aircraft = {
  family: "Test family",
  name: "Test jet",
  icaoTypes: ["TJ1"],
  simulator: "Test simulator",
  developer: "Test developer",
};
const installed = (id: string, version: string, source: "catalog" | "file" = "catalog"): InstalledPack => ({
  summary: { id, name: id, version, kind: "aircraft", aircraft },
  source,
  installedAt: 1,
});
const entry = (id: string, version: string): CatalogEntry => ({
  id,
  name: id,
  version,
  aircraft,
  engine: ">=0.1.0",
  size: 1,
  sha256: "",
});
const phase = (id: string, done: number, total: number) => ({
  id,
  title: id,
  progress: { done, skipped: 0, toDo: total - done, total },
  complete: done === total,
  open: total - done,
  skipped: 0,
});

describe("what the Packs page says about a pack", () => {
  it("gives the aircraft line from the pack's family, simulator and developer", () => {
    expect(aircraftLine(aircraft)).toBe("Test family · Test simulator · Test developer");
    expect(aircraftLine(undefined)).toBe("");
  });

  it("gives a file's size in megabytes, one decimal", () => {
    expect(sizeLabel(593_754)).toBe("0.6 MB");
    expect(sizeLabel(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(sizeLabel(10)).toBe("0.1 MB");
  });

  it("compares versions as semantic versions", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("1.0.0", "1.0.0-beta.2")).toBe(true);
    expect(isNewer("1.0.0-beta.10", "1.0.0-beta.2")).toBe(true);
    expect(isNewer("1.0.0-beta.1", "1.0.0")).toBe(false);
  });

  it("says where a saved flight is: the first phase not done, with the flight's ticks", () => {
    const rail = (a: number, b: number): Rail => ({
      stages: [
        { id: "pre", title: "Preflight", phases: [phase("Power up", a, 4)] },
        { id: "dep", title: "Departure", phases: [phase("Before start", b, 6)] },
      ],
      reference: [phase("Memory items", 3, 3)],
    });
    expect(savedLine(rail(4, 2))).toEqual({ where: "Departure › Before start", done: 6, total: 10 });
    expect(savedLine(rail(1, 0))).toEqual({ where: "Preflight › Power up", done: 1, total: 10 });
    expect(savedLine(rail(4, 6))).toEqual({ where: "Departure › Before start", done: 10, total: 10 });
    // Nothing ticked: no saved flight to speak of. Reference phases don't count.
    expect(savedLine(rail(0, 0))).toBeNull();
  });

  it("offers an update only for a newer catalog version of a catalog pack", () => {
    const catalog = [entry("a-jet", "0.2.0"), entry("b-jet", "1.0.0")];
    expect(updateFor(installed("a-jet", "0.1.0"), catalog)?.version).toBe("0.2.0");
    expect(updateFor(installed("a-jet", "0.2.0"), catalog)).toBeNull();
    expect(updateFor(installed("a-jet", "0.3.0"), catalog)).toBeNull();
    expect(updateFor(installed("a-jet", "0.1.0", "file"), catalog)).toBeNull();
    expect(updateFor(installed("c-jet", "0.1.0"), catalog)).toBeNull();
  });

  it("lists the catalog's packs not on this device, in the catalog's order", () => {
    const catalog = [entry("a-jet", "0.1.0"), entry("b-jet", "0.1.0"), entry("c-jet", "0.1.0")];
    expect(morePacks([installed("b-jet", "0.1.0")], catalog).map((e) => e.id)).toEqual(["a-jet", "c-jet"]);
  });
});
