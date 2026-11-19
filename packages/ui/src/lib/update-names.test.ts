// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The update note and What's new name each step exactly as its checklist row does (#105): the
// change list is made in Rust (involo-app-core's update.rs), the checklist's names here
// (sentence.ts), so every step of the iFly pack is compared, as an added step and as a removed one.

import type { FlatPack, PackChanges } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { compare_packs } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { indexPack } from "../pack-index";
import { iflyPack, testPackText } from "../test-pack";
import { stepTitle } from "./sentence";

const text = testPackText("ifly-737-max8");
/** The same pack with no steps at all: against it, every step is added, or removed. */
const empty = (() => {
  const p = JSON.parse(text) as FlatPack;
  for (const list of p.lists) list.steps = [];
  p.manifest.version = "0.0.1";
  return JSON.stringify(p);
})();
const changes = (old: string, next: string) => {
  iflyPack(); // the module is loaded
  const reply = JSON.parse(compare_packs(old, next)) as { ok: PackChanges } | { error: { message: string } };
  if ("error" in reply) throw new Error(reply.error.message);
  return reply.ok;
};

describe("step names in the update note and What's new", () => {
  const index = indexPack(iflyPack());

  it("names each added step exactly as its checklist row does", () => {
    const added = changes(empty, text).added;
    expect(added.length).toBeGreaterThan(300);
    const differ = added.filter((row) => {
      const step = index.step(row.step);
      return !step || row.title !== stepTitle(index, step);
    });
    expect(differ.map((r) => r.title)).toEqual([]);
    // The names the review found in capitals.
    const name = (id: string) => added.find((r) => r.step === id)?.title;
    expect(name("ifly-737-max8.cold-dark.alternate-flaps-switches")).toBe("Alternate flaps master switch");
    expect(name("ifly-737-max8.cold-dark.standby-power-switch")).toBe("STANDBY POWER switch");
  });

  it("names each removed step exactly as its checklist row did", () => {
    const removed = changes(text, empty).removed;
    const differ = removed.filter((row) => {
      const step = index.step(row.step);
      return !step || row.title !== stepTitle(index, step);
    });
    expect(differ.map((r) => r.title)).toEqual([]);
  });
});
