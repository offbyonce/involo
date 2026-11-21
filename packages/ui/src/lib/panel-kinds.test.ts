// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The format 6 panel controls (New panel controls board): each kind in each state, outlines that
// are not rectangles, every control reachable by keyboard and named, and colors from tokens only.

import { readFileSync } from "node:fs";
import type { ItemTarget, PanelItem, PanelSection as Section } from "@involo/bindings";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { sidestickPack, twinPack } from "../test-pack";
import PanelSchematic from "./PanelSchematic.svelte";
import PanelSection from "./PanelSection.svelte";
import { outline, positionsOf } from "./panel-layout";

afterEach(cleanup);

const K = 1.8;

/** One control on its own section, with the step's targets on it. */
function draw(more: Partial<PanelItem>, targets: Partial<ItemTarget>[] = []) {
  const item = { kind: "rocker", label: "TEST", x: 80, y: 60, description: "", ...more } as PanelItem;
  const section: Section = { id: "s", title: "Test", x: 0, y: 0, width: 200, height: 120, items: [item] };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  render(PanelSection, {
    target: svg,
    props: {
      section,
      targets: targets.map((t) => ({
        section: "s",
        item: 0,
        position: null,
        lit: false,
        open: false,
        resolved: false,
        ...t,
      })),
      guardClosed: false,
      band: { y0: 0, y1: 120, x0: 0, x1: 200 },
      k: K,
    },
  });
  return svg;
}
const texts = (svg: Element, selector: string) =>
  [...svg.querySelectorAll(selector)].map((t) => t.textContent);

describe("a push/pull knob", () => {
  const knob: Partial<PanelItem> = {
    kind: "push_pull_knob",
    label: "ALT",
    positions: ["PUSH", "PULL"],
    rest: "PUSH",
  };

  it("rests pushed in: a dot in its center, no ring", () => {
    const svg = draw(knob);
    expect(svg.querySelector("circle.dot.rest")?.getAttribute("r")).toBe("2.6");
    expect(svg.querySelector(".pull-ring")).toBeNull();
  });

  it("pulled out by the step: a second ring, the body in blue, PULL in bold without ◆", () => {
    const svg = draw(knob, [{ position: 1 }]);
    expect(svg.querySelector(".pull-ring.set-ring")?.getAttribute("r")).toBe("14.5");
    expect(svg.querySelector("circle.body.changed")).not.toBeNull();
    expect(svg.querySelector(".dot")).toBeNull();
    expect(texts(svg, ".pos.target")).toEqual(["PULL"]);
  });

  it("pushed in by the step: the larger dot; resolved by an answer, ◆", () => {
    expect(
      draw(knob, [{ position: 0 }])
        .querySelector("circle.dot.set")
        ?.getAttribute("r"),
    ).toBe("3");
    cleanup();
    expect(texts(draw(knob, [{ position: 0, resolved: true }]), ".pos.target")).toEqual(["◆ PUSH"]);
  });

  it("depending on a choice: dashed, no position drawn", () => {
    const svg = draw(knob, [{ open: true }]);
    expect(svg.querySelector("circle.body.conditional")).not.toBeNull();
    expect(svg.querySelector(".dot, .pull-ring")).toBeNull();
  });
});

describe("a pushbutton with legends", () => {
  const button = {
    kind: "legend_pushbutton",
    label: "PUMP 1",
    positions: ["ON (PUSHED OUT)", "OFF (PUSHED IN)"],
    legends: [
      { text: "FAULT", light: "amber" },
      { text: "OFF", light: "white", litIn: ["OFF (PUSHED IN)"] },
    ],
  } as const;

  it("rests with no legend lit and its name above the key", () => {
    const svg = draw(button as unknown as Partial<PanelItem>);
    expect(svg.querySelector(".legend-lit")).toBeNull();
    expect(texts(svg, ".legend")).toEqual(["FAULT", "OFF"]);
    expect(Number(svg.querySelector("text.label")?.getAttribute("y"))).toBeLessThan(-15);
  });

  it("set by the step: its legend lit in the position, white in the panel's text color, the state under it", () => {
    const svg = draw(button as unknown as Partial<PanelItem>, [{ position: 1 }]);
    expect(svg.querySelector("rect.body.key.changed")).not.toBeNull();
    expect(svg.querySelectorAll(".legend-lit")).toHaveLength(1);
    expect(svg.querySelector(".legend-lit.white")).not.toBeNull();
    expect(texts(svg, ".legend.lit.white")).toEqual(["OFF"]);
    expect(texts(svg, ".caption-target")).toEqual(["OFF (PUSHED IN)"]);
  });

  it("a legend the step expects on: lit in its light's color, EXPECTED ON under the key", () => {
    const svg = draw(button as unknown as Partial<PanelItem>, [{ lit: true }]);
    // The key itself stays resting: the step sets nothing.
    expect(svg.querySelector("rect.body.key.changed, .split.step")).toBeNull();
    expect(texts(svg, ".legend.lit.amber")).toEqual(["FAULT"]);
    expect(texts(svg, ".set-to")).toEqual(["EXPECTED ON"]);
  });

  it("depending on a choice: dashed, nothing lit", () => {
    const svg = draw(button as unknown as Partial<PanelItem>, [{ open: true }]);
    expect(svg.querySelector("rect.body.conditional")).not.toBeNull();
    expect(svg.querySelector(".legend-lit, .set-to")).toBeNull();
  });
});

describe("a rocker", () => {
  const rocker: Partial<PanelItem> = {
    kind: "rocker",
    label: "SEAT BELTS",
    positions: ["ON", "OFF"],
    rest: "OFF",
  };

  it("rests with its pressed end outlined; set by the step, that end filled", () => {
    const end = draw(rocker).querySelector("rect.end.rest");
    expect(end?.getAttribute("y")).toBe("1");
    cleanup();
    const svg = draw(rocker, [{ position: 0 }]);
    expect(svg.querySelector("rect.end.set")?.getAttribute("y")).toBe("-13");
    expect(texts(svg, ".pos.target")).toEqual(["ON"]);
  });

  it("depending on a choice: dashed, no end pressed", () => {
    const svg = draw(rocker, [{ open: true }]);
    expect(svg.querySelector("rect.body.conditional")).not.toBeNull();
    expect(svg.querySelector(".end")).toBeNull();
  });
});

describe("a keypad", () => {
  const keypad: Partial<PanelItem> = {
    kind: "keypad",
    label: "RADIO",
    positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "ENT"],
  };

  it("draws every key, row by row, the step's keys in its state and the rest resting", () => {
    const svg = draw(keypad, [{ position: 0 }, { position: 11 }]);
    expect(svg.querySelectorAll("rect.keycap")).toHaveLength(12);
    expect(texts(svg, ".keycap-text.pressed")).toEqual(["1", "ENT"]);
    const ent = svg.querySelectorAll("rect.keycap")[11] as Element;
    // Three to a row, on a 22 by 15 grid around the keypad's center.
    expect([ent.getAttribute("x"), ent.getAttribute("y")]).toEqual(["12.5", "16.5"]);
  });

  it("a key that depends on a choice is dashed", () => {
    const svg = draw(keypad, [{ position: 11, open: true }]);
    expect(svg.querySelectorAll("rect.keycap.conditional")).toHaveLength(1);
    expect(svg.querySelector("rect.keycap.changed")).toBeNull();
  });
});

describe("a panel in the Airbus-style example pack (invented)", () => {
  const pack = sidestickPack();
  const panel = pack.content.panels.find((p) => p.id === "glareshield");
  if (!panel) throw new Error("glareshield");
  const section = panel.sections.find((s) => s.id === "fcu") as Section;

  /** Whether a point lies inside a closed outline or on its edge. */
  function inside(points: [number, number][], [x, y]: [number, number]) {
    let odd = false;
    for (const [n, [x1, y1]] of points.entries()) {
      const [x2, y2] = points[(n + 1) % points.length] as [number, number];
      const along = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
      const within =
        Math.min(x1, x2) <= x && x <= Math.max(x1, x2) && Math.min(y1, y2) <= y && y <= Math.max(y1, y2);
      if (Math.abs(along) < 1e-6 && within) return true;
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) odd = !odd;
    }
    return odd;
  }

  it("draws its section's angled outline, and every control stays inside it", () => {
    const { container } = render(PanelSchematic, { panel, focus: ["fcu"], targets: [] });
    const points = (section.outline ?? []) as [number, number][];
    expect(points.length).toBeGreaterThan(4);
    const frame = container.querySelector("path.frame");
    expect(frame?.getAttribute("d")).toBe(`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`);
    for (const item of section.items) {
      // The control's own outline at every position it can be in.
      for (const at of [-1, ...positionsOf(item).keys()]) {
        const o = outline(item, { guardOpen: false, at });
        const [x0, y0, x1, y1] =
          o.kind === "circle" ? [-o.r, -o.r, o.r, o.r] : [o.x, o.y, o.x + o.w, o.y + o.h];
        for (const [cx, cy] of [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ] as [number, number][])
          expect(inside(points, [item.x + cx, item.y + cy]), `${item.label} at ${at}`).toBe(true);
      }
    }
  });
});

describe("a panel in the Boeing-style example pack (invented)", () => {
  const pack = twinPack();
  const panel = pack.content.panels.find((p) => p.id === "pedestal");
  if (!panel) throw new Error("pedestal");

  it("puts every control in the tab order, named, the step's first, even with no current step", () => {
    const index = indexPack(pack);
    const hits = (targets: ItemTarget[]) => {
      const { container } = render(PanelSchematic, {
        panel,
        focus: ["displays", "cabin", "brakes"],
        targets,
        index,
      });
      const all = [...container.querySelectorAll("svg.schematic [role=button]")];
      cleanup();
      return all;
    };
    const count = panel.sections.reduce((n, s) => n + s.items.length, 0);
    // No current step: still every control, each a tab stop with its name.
    const none = hits([]);
    expect(none).toHaveLength(count);
    for (const hit of none) {
      expect(hit.getAttribute("tabindex")).toBe("0");
      expect(hit.getAttribute("aria-label")).toMatch(/^\S.*: what it is$/);
    }
    expect(none.map((h) => h.getAttribute("aria-label"))).toContain("DISPLAY: what it is");
    // The step sets SEAT BELTS, in the second section: it comes first, marked as the step's.
    const seatBelts = panel.sections[1]?.items.findIndex((i) => i.label === "SEAT BELTS") ?? -1;
    const step = hits([
      { section: "cabin", item: seatBelts, position: 0, lit: false, open: false, resolved: false },
    ]);
    expect(step).toHaveLength(count);
    expect(step[0]?.getAttribute("aria-label")).toBe("SEAT BELTS, in this step: what it is");
    expect(step.filter((h) => h.getAttribute("aria-label")?.includes("in this step"))).toHaveLength(1);
  });
});

describe("the renderer's colors", () => {
  it("come from tokens only: no color value in the panel components", () => {
    const files = ["PanelSection.svelte", "PanelSchematic.svelte"].map((f) =>
      readFileSync(`${import.meta.dirname}/${f}`, "utf8"),
    );
    for (const text of files) {
      expect(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(text.match(/\b(rgba?|hsla?|oklch|lab|lch|color-mix)\(/g) ?? []).toEqual([]);
      const named =
        /\b(fill|stroke|color|background(-color)?)\s*[:=]\s*["']?(white|black|red|green|blue|amber|orange|yellow|gr[ae]y)\b/g;
      expect(text.match(named) ?? []).toEqual([]);
    }
  });
});
