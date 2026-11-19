// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import { controlName, stepTitle } from "./names";

const pack = iflyPack();
const index = indexPack(pack);
const step = (id: string) => {
  const found = index.step(`ifly-737-max8.${id}`);
  if (!found) throw new Error(`no step ${id} in the pack`);
  return found;
};

describe("step and control names, as Rust gave them when it read the pack", () => {
  it("keeps cockpit text in capitals and the rest as a sentence", () => {
    // "STAB out of trim light": the light's label lost its capitals.
    expect(stepTitle(index, step("preflight.stab-out-of-trim-light"))).toBe("STAB OUT OF TRIM light");
    expect(stepTitle(index, step("before-start.fuel-pump-switches"))).toBe("Fuel pump switches");
    expect(stepTitle(index, step("preflight.crossfeed-selector"))).toBe("CROSSFEED selector");
  });

  it("names every step and control of the pack", () => {
    for (const s of pack.lists.flatMap((l) => l.steps)) expect(index.stepName(s.id)).toBeTruthy();
    for (const c of pack.content.controls?.controls ?? []) expect(controlName(index, c)).toBeTruthy();
  });
});
