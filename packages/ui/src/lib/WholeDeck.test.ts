// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import WholeDeck from "./WholeDeck.svelte";

const packs = import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
  eager: true,
  import: "default",
});
const index = indexPack(Object.values(packs)[0] as FlatPack);
const zone = (id: string) => {
  const z = index.zones.find((x) => x.id === id);
  if (!z) throw new Error(id);
  return z;
};
afterEach(cleanup);

describe("WholeDeck (owner, batch 6)", () => {
  it("keeps every area label clear of the outline and of the area before it", () => {
    const { container } = render(WholeDeck, { index, zone: zone("wipe") });
    expect(container.textContent).not.toContain("marked on the map");
    const outline = container.querySelector("rect.region");
    const top = Number(outline?.getAttribute("y"));
    const bottom = top + Number(outline?.getAttribute("height"));
    const areas = [...container.querySelectorAll("rect.area")].map((r) => ({
      y: Number(r.getAttribute("y")),
      bottom: Number(r.getAttribute("y")) + Number(r.getAttribute("height")),
    }));
    for (const cap of container.querySelectorAll("text.cap")) {
      const base = Number(cap.getAttribute("y"));
      // Never inside the outline's band, and 8 px clear above it when it sits above it.
      expect(base + 3 <= top - 8 || base - 9 >= bottom).toBe(true);
      // 16 px under any area above the label.
      for (const a of areas.filter((x) => x.bottom <= base))
        expect(base - 9 - a.bottom >= 16 || a.bottom > base - 9).toBe(true);
    }
  });

  it("labels a marked box only when its label fits with 6 px either side", () => {
    render(WholeDeck, { index, zone: zone("wipe") });
    // "L WIPER" fits its 100 wide box; "R WIPER" does not fit its 52.
    expect(screen.queryByText("L WIPER")).toBeTruthy();
    expect(screen.queryByText("R WIPER")).toBeNull();
  });
});
