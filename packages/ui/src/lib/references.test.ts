// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack, Phase } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { iflyPack } from "../test-pack";
import { buildReferences } from "./references";

const pack = iflyPack();

describe("References, counted from the pack (decision 0007)", () => {
  const refs = buildReferences(pack);

  it("counts each kind of source and the lists still being confirmed", () => {
    expect(refs.sources.map((s) => [s.name, s.count])).toEqual([
      ["Simulator documentation", 36],
      ["Regulator guidance", 8],
    ]);
    expect(refs.confirming).toBe(21);
    expect(refs.rows).toHaveLength(pack.lists.length);
  });

  it("knows every basis tag the pack's lists use, so none shows unnamed", () => {
    const known = new Set<string>(pack.content.labels.basisTags.map((t) => t.id));
    for (const l of pack.lists)
      for (const tag of l.basis) expect(known.has(tag), `${l.id}: ${tag}`).toBe(true);
  });

  it("lists in flight order, then the reference lists, each with its stage and kind", () => {
    const row = (title: string) => refs.rows.find((r) => r.title === title);
    expect(refs.rows[0]).toMatchObject({ stage: "Preflight", kind: "Procedure", basis: "ifly-docs" });
    expect(row("Before start checklist")).toMatchObject({ stage: "Departure", kind: "Checklist" });
    expect(row("Runaway stabilizer")).toMatchObject({
      stage: "Emergency",
      kind: "Memory items",
      basis: "regulator-docs",
    });
    expect(row("APU fire")).toMatchObject({
      stage: "Emergency",
      kind: "Quick reference",
      basis: "prior-release",
    });
    expect(row("Go-around")).toMatchObject({ stage: "Emergency", kind: "Non-normal procedure" });
    const emergency = refs.rows.findIndex((r) => r.stage === "Emergency");
    expect(refs.rows.slice(emergency).every((r) => r.stage === "Emergency")).toBe(true);
    // Each row opens its list at the first step.
    for (const r of refs.rows) expect(r.first).toBe(pack.lists.find((l) => l.id === r.id)?.steps[0]?.id);
  });

  it("finds the steps that follow the simulator's model, each once", () => {
    expect(refs.simulatorModel).toHaveLength(16);
    expect(new Set(refs.simulatorModel).size).toBe(16);
    const marked = new Set(
      pack.lists.flatMap((l) => l.steps.filter((s) => s.simulatorModel).map((s) => s.id)),
    );
    expect(new Set(refs.simulatorModel)).toEqual(marked);
  });

  it("drops the status once no list needs it (the content batch re-tags them)", () => {
    const retagged = {
      ...pack,
      lists: pack.lists.map((l) => ({
        ...l,
        basis: l.basis.map((b) => (b === "prior-release" ? "ifly-docs" : b)),
      })),
    };
    const after = buildReferences(retagged);
    expect(after.confirming).toBe(0);
    expect(after.sources[0]?.count).toBe(57);
    expect(after.rows.some((r) => r.basis === "prior-release")).toBe(false);
  });

  it("takes the reference title, groups and basis tags from a pack's labels", () => {
    // Invented: a reference area called Abnormal, its lists in four groups, and two tags of its own.
    const p = structuredClone(pack) as FlatPack;
    const labels = p.content.labels;
    labels.reference.title = "Abnormal";
    labels.listKinds.quick = "QRH";
    labels.basisTags = [
      { id: "own-tests", label: "Our own tests", about: "Flown and checked by the authors." },
      { id: "draft", label: "Draft", pending: true },
    ];
    for (const l of p.lists) l.basis = l.kind === "flow" ? ["own-tests"] : ["draft"];
    const phases = p.content.phases?.phases as Phase[];
    for (const ph of phases) if (ph.reference) ph.group = ph.group === "quick" ? "quick" : "extra";
    const r = buildReferences(p);
    expect(r.sources).toEqual([
      {
        tag: "own-tests",
        name: "Our own tests",
        about: "Flown and checked by the authors.",
        count: p.lists.filter((l) => l.kind === "flow").length,
      },
    ]);
    expect(r.pending).toEqual([
      { tag: "draft", name: "Draft", count: p.lists.filter((l) => l.kind !== "flow").length },
    ]);
    expect(r.names).toEqual({ "own-tests": "Our own tests", draft: "Draft" });
    expect(r.rows.find((row) => row.title === "APU fire")).toMatchObject({
      stage: "Abnormal",
      kind: "QRH",
      basis: "draft",
    });
  });
});
