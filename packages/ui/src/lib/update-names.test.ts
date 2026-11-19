// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The update note and What's new name each step exactly as its checklist row does (#105), for
// every pack in the repo: each pack's steps are made added steps and then removed ones, and each
// row's name is compared with the step's name on the checklist (stepTitle, which reads the names
// Rust gives a pack when the app reads it).

import type { FlatPack, PackChanges } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { compare_packs } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { indexPack } from "../pack-index";
import { packAsReceived, testPackText } from "../test-pack";
import { stepTitle } from "./names";

/** Every pack in the repo's packs/ folder, by id (its folder's name). */
const PACKS = Object.keys(import.meta.glob("../../../../packs/*/pack.json"))
  .map((path) => path.split("/").at(-2) ?? "")
  .sort();

/** The same pack with no steps at all: against it, every step is added, or removed. */
const withoutSteps = (text: string) => {
  const p = JSON.parse(text) as FlatPack;
  for (const list of p.lists) list.steps = [];
  p.manifest.version = "0.0.1";
  return JSON.stringify(p);
};
const changes = (old: string, next: string) => {
  const reply = JSON.parse(compare_packs(old, next)) as { ok: PackChanges } | { error: { message: string } };
  if ("error" in reply) throw new Error(reply.error.message);
  return reply.ok;
};

describe("step names in the update note and What's new", () => {
  it("covers every pack in the repo", () => {
    expect(PACKS).toEqual(expect.arrayContaining(["ifly-737-max8", "example-trainer"]));
  });

  for (const id of PACKS) {
    it(`names every step of ${id} exactly as its checklist row does, added and removed`, () => {
      // A pack missing from the test catalog fails here: run `just test-packs`.
      const text = testPackText(id);
      const pack = packAsReceived(text);
      const index = indexPack(pack);
      const empty = withoutSteps(text);
      const added = changes(empty, text).added;
      const removed = changes(text, empty).removed;
      const steps = pack.lists.flatMap((l) => l.steps);
      expect(added.length).toBe(new Set(steps.map((s) => s.id)).size);
      expect(removed.length).toBe(steps.length);
      const differ = [...added, ...removed].filter((row) => {
        const step = index.step(row.step);
        return !step || row.title !== stepTitle(index, step);
      });
      expect(differ.map((r) => `${r.step}: ${r.title}`)).toEqual([]);
    });
  }

  it("names the steps the review found in capitals as the checklist does", () => {
    const added = changes(withoutSteps(testPackText("ifly-737-max8")), testPackText("ifly-737-max8")).added;
    const name = (id: string) => added.find((r) => r.step === id)?.title;
    expect(name("ifly-737-max8.cold-dark.alternate-flaps-switches")).toBe("Alternate flaps master switch");
    expect(name("ifly-737-max8.cold-dark.standby-power-switch")).toBe("STANDBY POWER switch");
  });
});
