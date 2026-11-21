// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Panel } from "@involo/bindings";
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PanelSchematic from "./PanelSchematic.svelte";

// A drawing's height follows its room's width, and the room holds the drawing. Rescaling it while
// the browser is still reporting sizes resizes the observed room again in the same report, which
// WebKit logs as a ResizeObserver loop (#199). So a size report only schedules the rescale, for
// the next frame. Its own file, so this fake observer is the only one any binding sees.

type Watcher = { callback: ResizeObserverCallback; targets: Element[] };
let watchers: Watcher[] = [];
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  watchers = [];
  frames = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly w: Watcher;
      constructor(callback: ResizeObserverCallback) {
        this.w = { callback, targets: [] };
        watchers.push(this.w);
      }
      observe(target: Element) {
        this.w.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.w.targets = [];
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const panel = {
  id: "oh",
  title: "Overhead",
  width: 600,
  height: 300,
  sections: [
    {
      id: "elec",
      title: "Electrical",
      name: "Electrical panel",
      x: 0,
      y: 0,
      width: 400,
      height: 120,
      items: [
        {
          kind: "toggle_switch",
          label: "BATTERY",
          x: 40,
          y: 50,
          controls: ["bat"],
          positions: ["OFF", "ON"],
          description: "",
        },
      ],
    },
  ],
} as unknown as Panel;

/** Reports a new size for `el` to every observer watching it, as the browser does. */
function report(el: Element) {
  for (const w of watchers.filter((w) => w.targets.includes(el))) {
    w.callback([{ target: el } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  }
}

it("rescales a drawing in the frame after its room's size is reported, not during the report (#199)", async () => {
  const { container } = render(PanelSchematic, { panel, focus: ["elec"], targets: [] });
  const wrap = container.querySelector<HTMLDivElement>(".wrap");
  const svg = container.querySelector<SVGSVGElement>("svg.schematic");
  if (!wrap || !svg) throw new Error("no drawing");
  let width = 0;
  Object.defineProperty(wrap, "clientWidth", { get: () => width });
  await tick();
  const before = svg.style.width;

  width = 160;
  report(wrap);
  await tick();
  expect(svg.style.width, "rescaled while the size was being reported").toBe(before);

  for (const f of frames.splice(0)) f(0);
  await tick();
  expect(svg.style.width).not.toBe(before);
  expect(Number.parseFloat(svg.style.width)).toBeLessThanOrEqual(160);
});
