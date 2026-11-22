// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import StepPane from "./StepPane.svelte";

const pack = iflyPack();
const index = indexPack(pack);
const step = (id: string) => {
  const found = index.step(`ifly-737-max8.${id}`);
  if (!found) throw new Error(`no step ${id} in the pack`);
  return found;
};

afterEach(cleanup);

describe("StepPane", () => {
  const fuel = () => ({
    index,
    step: step("before-start.fuel-pump-switches"),
    targets: [{ section: "fuel", item: 17, position: 1, lit: false, open: false, resolved: false }],
    number: 6,
    total: 9,
  });

  it("shows the round 6 pane in order: value, Check, If not, Why, location line, panel preview", () => {
    render(StepPane, { ...fuel(), onOpen: () => {} });
    expect(screen.getByText("Step 6 of 9 · Fuel pump switches")).toBeTruthy();
    const order = [...document.querySelectorAll(".pane-step > *, .pane-step > .cells > *")].map((e) =>
      ["head", "check", "ifnot", "why", "line", "preview"].find((c) => e.classList.contains(c)),
    );
    expect(order.filter(Boolean)).toEqual(["head", "check", "ifnot", "why", "line", "preview"]);
    // No map figure, no labeled drawing, no "New panel" tag (round 6).
    expect(document.querySelector(".map, .controls")).toBeNull();
    expect(screen.queryByText(/New panel/)).toBeNull();
    expect(document.querySelectorAll(".preview text").length).toBeGreaterThan(0);
    expect(document.querySelector(".preview g")?.classList.contains("textless")).toBe(true);
  });

  it("opens the slide-out on Where it is from the location line and on the panel from the preview", async () => {
    const opened: unknown[] = [];
    render(StepPane, { ...fuel(), onOpen: (how: unknown) => opened.push(how) });
    await fireEvent.click(screen.getByRole("button", { name: /Where is this\?/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Show panel: the whole Fuel panel" }));
    expect(opened).toEqual([{ entry: "where" }, { entry: "panel" }]);
  });

  it("shows Show panel instead of the preview when Panel preview in steps is off", async () => {
    const opened: unknown[] = [];
    render(StepPane, { ...fuel(), preview: false, onOpen: (how: unknown) => opened.push(how) });
    expect(document.querySelector(".preview")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /Show panel/ }));
    expect(opened).toEqual([{ entry: "panel" }]);
  });

  it("lists the step's terms with their glossary meanings", async () => {
    const withTerms = pack.lists.flatMap((l) => l.steps).find((s) => (s.terms ?? []).length > 1);
    if (!withTerms) throw new Error("no step with terms");
    render(StepPane, {
      index,
      step: withTerms,
      targets: [],
      number: 1,
      total: 1,
      onOpen: () => {},
    });
    const button = screen.getByRole("button", { name: /^Terms:/ });
    await fireEvent.click(button);
    for (const t of withTerms.terms ?? []) expect(screen.getByText(t)).toBeTruthy();
    // Each definition stays here, with its own link into the Glossary.
    for (const t of withTerms.terms ?? [])
      expect(screen.getByRole("link", { name: `Open in Glossary: ${t}` }).getAttribute("href")).toBe(
        `#/glossary/${encodeURIComponent(t)}`,
      );
  });

  it("shows a stop on the exterior inspection with Look for, its own location line and the top view (walkaround boards)", () => {
    const at = step("exterior.engine-2");
    const stops = [
      "left-forward-fuselage",
      "nose",
      "right-forward-fuselage",
      "right-wing-root",
      "engine-2",
      "right-wing-and-leading-edge",
    ].map((id, n) => {
      const s = step(`exterior.${id}`);
      const state = (["done", "done", "skipped", "done", "here", "to_do"] as const)[n] ?? "to_do";
      return {
        id: s.id,
        number: String(s.number),
        name: s.text,
        x: s.walkaround?.x ?? 0,
        y: s.walkaround?.y ?? 0,
        state,
      };
    });
    render(StepPane, { index, step: at, targets: [], number: 5, total: 18, stops, onOpen: () => {} });
    const order = [...document.querySelectorAll(".pane-step > *")].map((e) =>
      ["head", "lookcard", "line", "top"].find((c) => e.classList.contains(c)),
    );
    expect(order.filter(Boolean)).toEqual(["head", "lookcard", "line", "top"]);
    expect(document.querySelector(".lookcard")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      `Look for ${at.lookFor}`,
    );
    expect(document.querySelector(".line")?.textContent?.trim()).toBe("Right engine, front and sides.");
    // The top view replaces the panel preview and Where is this?: a stop has nothing to locate on the flight deck.
    expect(screen.queryByRole("button", { name: /Where is this\?/ })).toBeNull();
    expect(document.querySelector(".preview, .show-panel, .note")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /^Top view of the airplane with 6 numbered stops\. Stop 5, ENGINE 2, is current\. 3 done, 1 skipped\.$/,
    );
  });

  it("opened in the row, puts the top view before the location line", () => {
    const at = step("exterior.nose");
    const stops = [
      {
        id: at.id,
        number: "2",
        name: "Nose",
        x: at.walkaround?.x ?? 0,
        y: at.walkaround?.y ?? 0,
        state: "here" as const,
      },
    ];
    render(StepPane, {
      index,
      step: at,
      targets: [],
      number: 2,
      total: 18,
      stops,
      inline: true,
      onOpen: () => {},
    });
    const order = [...document.querySelectorAll(".pane-step > *")].map((e) =>
      ["head", "lookcard", "here-line", "top"].find((c) => e.classList.contains(c)),
    );
    expect(order.filter(Boolean)).toEqual(["lookcard", "top", "here-line"]);
  });

  it("keeps the ordinary pane for a step with a walkaround point when nothing gives its stops", () => {
    render(StepPane, {
      index,
      step: step("exterior.nose"),
      targets: [],
      number: 2,
      total: 18,
      onOpen: () => {},
    });
    expect(document.querySelector(".lookcard, .top")).toBeNull();
  });
});
