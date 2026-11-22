// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { ViewFrame } from "@involo/bindings";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import TopView, { type Stop } from "./TopView.svelte";

afterEach(cleanup);

// An invented top view, 320 by 420 as the boards draw it: a fuselage and one wing.
const frame: ViewFrame = {
  width: 320,
  height: 420,
  shapes: [
    {
      role: "structure",
      closed: true,
      points: [
        [160, 6],
        [182, 60],
        [160, 410],
        [138, 60],
      ],
    },
    {
      role: "structure",
      closed: true,
      points: [
        [138, 140],
        [0, 222],
        [138, 200],
      ],
    },
  ],
};
const stop = (n: number, state: Stop["state"]): Stop => ({
  id: `s${n}`,
  number: String(n),
  name: `Stop ${n} name`,
  x: 20 * n,
  y: 30 * n,
  state,
});

describe("TopView (walkaround boards)", () => {
  it("draws the airplane and every stop, numbered, in its state, with a legend", () => {
    render(TopView, {
      frame,
      stops: [
        stop(1, "done"),
        stop(2, "done"),
        stop(3, "skipped"),
        stop(4, "done"),
        stop(5, "here"),
        stop(6, "to_do"),
      ],
    });
    expect(document.querySelector(".title")?.textContent).toBe("The walkaround · stop 5 of 6");
    expect(document.querySelectorAll("path.shape.structure")).toHaveLength(2);
    const marks = [...document.querySelectorAll(".stops .mark")].map((m) =>
      [...m.classList].find((c) => c !== "mark"),
    );
    expect(marks).toEqual(["done", "done", "skipped", "done", "here", "to_do"]);
    expect([...document.querySelectorAll(".stops .num")].map((t) => t.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    // The stop shown has its ring; a skipped stop's ring is dashed.
    expect(document.querySelectorAll(".stops .ring")).toHaveLength(1);
    expect(document.querySelector(".stops .mark.skipped")?.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(document.querySelector(".legend")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "You are here Done Skipped To do",
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Top view of the airplane with 6 numbered stops. Stop 5, Stop 5 name, is current. 3 done, 1 skipped.",
    );
  });

  it("says nothing of done or skipped stops when there are none, and leaves room for a stop at the edge", () => {
    render(TopView, { frame, stops: [stop(1, "here"), stop(2, "to_do")] });
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Top view of the airplane with 2 numbered stops. Stop 1, Stop 1 name, is current.",
    );
    expect(screen.getByRole("img").getAttribute("viewBox")).toBe("-24 -14 368 446");
  });
});
