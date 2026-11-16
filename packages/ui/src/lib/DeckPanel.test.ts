// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexPack } from "../pack-index";
import DeckPanel from "./DeckPanel.svelte";
import { K } from "./panel-layout";

afterEach(cleanup);

// jsdom measures nothing: every observed element reports a 300 px wide content box (the column).
vi.hoisted(() => {
  globalThis.ResizeObserver = class {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width: 300, height: 0 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
});

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
const index = indexPack(pack);

describe("the Flight deck's selected panel (owner's panel-highlight fixes)", () => {
  it("rings one control across its tiles, and shows one card", async () => {
    // Test switches and elevator jam: two tiles of one panel, each with its own picked control,
    // so MACH TEST 1 and then STALL TEST 1 left both ringed, each with a card.
    const zone = index.zones.find((z) => z.id === "atest");
    if (!zone) throw new Error("atest");
    const { container: page } = render(DeckPanel, { index, zone, onStep: () => {} });
    // The overview in the column (the Full size sheet draws its own copy).
    const container = page.querySelector("figure.drawing") as Element;
    expect(container.querySelectorAll("svg.schematic")).toHaveLength(2);
    const hit = (label: string) =>
      container.querySelector(`.hit[aria-label="${label}: what it is"]`) as Element;
    await fireEvent.click(hit("MACH TEST 1"));
    expect(container.querySelectorAll(".selection")).toHaveLength(1);
    await fireEvent.click(hit("STALL TEST 1"));
    expect(container.querySelectorAll(".selection")).toHaveLength(1);
    expect(container.querySelector(".selection")?.closest("g.item")).toBe(
      hit("STALL TEST 1").closest("g.item"),
    );
    const cards = container.querySelectorAll(".control-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("STALL TEST 1");
  });

  it("draws its tiles at one scale, the largest at which both fit the column", async () => {
    // Each tile fitted the column on its own: the wide Flight recorder section came out far smaller
    // than Stall warning test beside it, labels and all.
    const zone = index.zones.find((z) => z.id === "atest");
    if (!zone) throw new Error("atest");
    const { container: page } = render(DeckPanel, { index, zone, onStep: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    const svgs = [...(page.querySelector("figure.drawing") as Element).querySelectorAll("svg.schematic")];
    const scale = (svg: Element) =>
      Number.parseFloat((svg as SVGElement).style.width) / Number(svg.getAttribute("viewBox")?.split(" ")[2]);
    const widths = svgs.map((svg) => Number(svg.getAttribute("viewBox")?.split(" ")[2]));
    const [a, b] = svgs.map(scale);
    // The wider section fills the 300 px column; the narrower takes the same scale.
    expect(a).toBeCloseTo(b ?? NaN, 2);
    expect(Math.min(a ?? 0, b ?? 0)).toBeCloseTo(Math.min(300 / Math.max(...widths), K), 2);
  });
});
