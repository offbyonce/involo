// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { OverviewArea, Zone } from "@involo/bindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import DeckMap from "./DeckMap.svelte";

afterEach(cleanup);

/** Invented places: one wide box, one too narrow for its name, one place drawn twice. */
const zones = [
  { id: "wide", title: "Wide panel", shortTitle: "WIDE", area: "Top", position: "Left" },
  { id: "thin", title: "Thin panel", shortTitle: "THIN PANEL NAME", area: "Top", position: "Middle" },
  { id: "twin", title: "Twin panel", shortTitle: "TW", area: "Top", position: "Right" },
] as Zone[];
const boxes = [
  { zone: "wide", x: 0, y: 0, width: 200, height: 60 },
  { zone: "thin", x: 210, y: 0, width: 30, height: 60 },
  { zone: "twin", x: 250, y: 0, width: 60, height: 60 },
  { zone: "twin", x: 320, y: 0, width: 60, height: 60 },
] as OverviewArea[];
const base = { boxes, zones, region: null, selected: "wide", onPick: () => {} };

describe("DeckMap map rules", () => {
  it("names the selected box when its name fits with 6 px either side, and no other unless asked", () => {
    const { container } = render(DeckMap, base);
    expect([...container.querySelectorAll("text.name")].map((t) => t.textContent)).toEqual(["WIDE"]);
  });

  it("with Name every panel, names each box whose name fits at 11 px or more, never the one that does not", () => {
    const { container } = render(DeckMap, { ...base, names: true });
    const names = [...container.querySelectorAll("text.name")].map((t) => t.textContent);
    expect(names).toContain("WIDE");
    expect(names).not.toContain("THIN PANEL NAME");
  });

  it("is one keyboard stop per place, and selects it with Enter or a tap on any of its boxes", async () => {
    const picked: string[] = [];
    const { container } = render(DeckMap, { ...base, onPick: (z: string) => picked.push(z) });
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Wide panel",
      "THIN PANEL NAME, Thin panel",
      "TW, Twin panel",
    ]);
    await fireEvent.keyDown(screen.getByRole("button", { name: /Thin panel$/ }), { key: "Enter" });
    await fireEvent.click(container.querySelectorAll("g.box")[3] as Element);
    expect(picked).toEqual(["thin", "twin"]);
  });

  it("leads each box's name with the name it shows, when its place's title doesn't hold its words (#198)", () => {
    const short = [
      { id: "elec", title: "Electrical panel", shortTitle: "ELEC", area: "Top", position: "Left" },
      { id: "fuel", title: "Fuel panel", shortTitle: "FUEL", area: "Top", position: "Right" },
    ] as Zone[];
    const two = [
      { zone: "elec", x: 0, y: 0, width: 200, height: 60 },
      { zone: "fuel", x: 210, y: 0, width: 200, height: 60, label: "FUEL" },
    ] as OverviewArea[];
    const { container } = render(DeckMap, {
      ...base,
      boxes: two,
      zones: short,
      selected: "elec",
      names: true,
    });
    for (const g of container.querySelectorAll("g.box[role=button]")) {
      const shown = g.querySelector("text.name")?.textContent ?? "";
      expect(shown, "the box shows its name").not.toBe("");
      expect(g.getAttribute("aria-label")?.toUpperCase()).toContain(shown);
    }
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "ELEC, Electrical panel",
      "Fuel panel",
    ]);
  });

  it("names the full-size control that selects the same places, for every box (#198)", () => {
    const { container } = render(DeckMap, { ...base, equivalent: "deck-list" });
    const named = [...container.querySelectorAll("g.box[role=button]")].map((g) =>
      g.getAttribute("data-equivalent"),
    );
    expect(named).toEqual(["deck-list", "deck-list", "deck-list"]);
  });
});
