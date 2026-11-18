// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The reference area from the pack's labels (decision 0029): its title, and its tabs by group in
// the labels' order, never by the phases' order or titles.

import { readFileSync } from "node:fs";
import type { RailPhase } from "@involo/bindings";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { appLabels, iflyPack } from "../test-pack";
import { buildFind, findIn } from "./find-index";
import { referenceTabs } from "./reference-tabs";
import TopBar from "./TopBar.svelte";

afterEach(cleanup);

const phase = (id: string, title: string, group: string): RailPhase =>
  ({ id, title, group, progress: { done: 0, total: 1, skipped: 0 }, open: 0 }) as unknown as RailPhase;

describe("the reference area", () => {
  it("with the iFly pack, reads as before: Memory items, Quick reference, Non-normal", () => {
    const pack = iflyPack();
    const rail =
      pack.content.phases?.phases
        .filter((p) => p.reference)
        .map((p) => phase(p.id, p.title, p.group ?? "")) ?? [];
    expect(referenceTabs(pack.content.labels, rail).map((t) => t.title)).toEqual([
      "Memory items",
      "Quick reference",
      "Non-normal",
    ]);
    expect(pack.content.labels.reference.title).toBe("Emergency");
  });

  it("takes four groups in the labels' order, the pack's own included, titled from the labels", () => {
    const labels = appLabels();
    labels.reference.title = "Abnormal";
    labels.reference.groups = [
      { id: "procedures", title: "Procedures" },
      { id: "fire", title: "Fire" },
      { id: "memory", title: "Recall" },
      { id: "quick", title: "QRH" },
    ];
    // The phases in another order, and one in a group the labels don't name.
    const rail = [
      phase("m", "Memory", "memory"),
      phase("q", "Quick", "quick"),
      phase("x", "Extra", "unlisted"),
      phase("f", "Fires", "fire"),
      phase("p", "Non-normal", "procedures"),
    ];
    expect(referenceTabs(labels, rail).map((t) => [t.id, t.title])).toEqual([
      ["p", "Procedures"],
      ["f", "Fire"],
      ["m", "Recall"],
      ["q", "QRH"],
      ["x", "Extra"],
    ]);
  });

  it("names the header button and Find's stage from the labels", () => {
    const pack = structuredClone(iflyPack());
    pack.content.labels.reference.title = "Abnormal";
    render(TopBar, {
      aircraft: "Test Jet",
      reference: pack.content.labels.reference.title,
      open: [],
      rail: { stages: [], reference: [] },
      stage: "",
      view: null,
      menuOpen: false,
      phase: null,
      pickerOpen: false,
      onMenu: () => {},
      onView: () => {},
      onPicker: () => {},
    });
    expect(screen.getByRole("link", { name: "Abnormal" }).getAttribute("href")).toBe("#/reference");
    const find = buildFind(pack, indexPack(pack));
    const memory = pack.content.phases?.phases.find((p) => p.reference) as {
      id: string;
      title: string;
      group?: string | null;
    };
    const rail = { stages: [], reference: [phase(memory.id, memory.title, memory.group ?? "")] };
    const first = pack.lists.find(
      (l) =>
        memory && (pack.content.phases?.phases.find((p) => p.id === memory.id)?.lists ?? []).includes(l.id),
    )?.steps[0];
    const found = findIn(find, first?.text ?? "", rail as never);
    expect(found.steps.length).toBeGreaterThan(0);
    expect(new Set(found.steps.map((s) => s.stage))).toEqual(new Set(["Abnormal"]));
  });

  it("keeps the area's words out of the code: no Emergency literal, no tag names", () => {
    const read = (f: string) => readFileSync(`${import.meta.dirname}/${f}`, "utf8");
    for (const f of ["TopBar.svelte", "../pages/ReferencePage.svelte", "find-index.ts"])
      expect(read(f)).not.toMatch(/"Emergency"|>Emergency</);
    expect(read("references.ts")).not.toMatch(
      /ifly-docs|regulator-docs|prior-release|Source being confirmed|Simulator documentation/,
    );
  });
});
