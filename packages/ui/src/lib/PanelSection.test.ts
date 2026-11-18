// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { ItemTarget, PanelItem, PanelSection as Section } from "@involo/bindings";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import PanelSection from "./PanelSection.svelte";
import { RING_PAD } from "./panel-layout";

afterEach(cleanup);

type Box = [number, number, number, number];
const item = (kind: PanelItem["kind"], n: number, more: Partial<PanelItem> = {}): PanelItem => ({
  kind,
  label: `ITEM ${n}`,
  x: 60 + 90 * n,
  y: 60,
  description: "",
  ...more,
});
// Every kind of control, and each guard both shut and open (the step sets the third toggle, so its
// guard is raised), and a handle pulled out.
const items: PanelItem[] = [
  item("toggle_switch", 0, { positions: ["ON", "OFF"], rest: "OFF" }),
  item("toggle_switch", 1, { positions: ["ON", "OFF"], rest: "OFF", guarded: true }),
  item("toggle_switch", 2, { positions: ["ON", "OFF"], rest: "OFF", guarded: true }),
  item("selector", 3, { positions: ["OFF", "AUTO", "ON"], rest: "OFF" }),
  item("push_button", 4),
  item("push_button", 5, { guarded: true }),
  item("light", 6, { color: "amber" }),
  item("lever", 7, { positions: ["UP", "DOWN"], rest: "UP" }),
  item("handle", 8, { positions: ["IN", "OUT"], rest: "OUT" }),
  item("gauge", 9),
  item("display_unit", 10, { width: 60, height: 34 }),
];
const section: Section = { id: "s", title: "Every control", x: 0, y: 0, width: 1100, height: 120, items };
const targets: ItemTarget[] = [
  { section: "s", item: 2, position: 0, lit: false, open: false, resolved: false },
];
const K = 2;

function draw(selected: number) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  render(PanelSection, {
    target: svg,
    props: {
      section,
      targets,
      guardClosed: false,
      band: { y0: 0, y1: 120, x0: 0, x1: 1100 },
      k: K,
      hit: 22,
      onPick: () => {},
      selected,
    },
  });
  return svg;
}

const num = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0);
/** An element's box from its attributes, around its control's center. */
function boxOf(el: Element): Box {
  if (el.tagName === "circle") {
    const [cx, cy, r] = [num(el, "cx"), num(el, "cy"), num(el, "r")];
    return [cx - r, cy - r, cx + r, cy + r];
  }
  if (el.tagName === "path") {
    const n = (el.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const [x, y] = [num(el, "x"), num(el, "y")];
  return [x, y, x + num(el, "width"), y + num(el, "height")];
}
const union = (boxes: Box[]): Box => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];
const grown = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
/** The control as drawn: every shape of its glyph (body, knob, guard, cover), no text or rings. */
const controlBox = (g: Element) =>
  union(
    [
      ...g.querySelectorAll(
        "rect:not(.hit, .selection, .focusring), circle:not(.selection, .focusring), path.cover",
      ),
    ].map(boxOf),
  );
const expectBox = (actual: Box, expected: Box) => {
  for (const [n, v] of actual.entries()) expect(v).toBeCloseTo(expected[n] ?? NaN, 5);
};

describe("the selected control's ring (one ring, following the control)", () => {
  it.each(
    items.map((it, n) => [`${it.kind}${it.guarded ? (n === 2 ? " (guard open)" : " (guard shut)") : ""}`, n]),
  )("rings a %s with its own box plus the padding, and nothing else", (_, n) => {
    const svg = draw(n as number);
    const rings = svg.querySelectorAll(".selection");
    expect(rings).toHaveLength(1);
    const g = svg.querySelectorAll("g.item")[n as number] as Element;
    expect(g.querySelector(".selection")).toBe(rings[0]);
    const ring = boxOf(rings[0] as Element);
    expectBox(ring, grown(controlBox(g), RING_PAD));
    // The focus ring: the same shape, 2 px outside the selection ring (strokes included).
    const focus = g.querySelector(".focusring") as Element;
    expect(focus.tagName).toBe((rings[0] as Element).tagName);
    expectBox(boxOf(focus), grown(ring, 2 / 2 + (2 + 1.5 / 2) / K));
  });

  it("draws a focus ring after each tap target, which draws no outline of its own", () => {
    const svg = draw(4);
    const hits = svg.querySelectorAll(".hit");
    expect(hits).toHaveLength(items.length);
    for (const hit of hits) expect(hit.nextElementSibling?.classList.contains("focusring")).toBe(true);
    expect(svg.querySelectorAll(".focusring")).toHaveLength(items.length);
  });
});
