// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The labels a pack carries (decision 0029) start as the words the interface shows today. Until the
// interface reads them, this keeps the two the same: the iFly pack's labels (its labels.yaml over
// the app's defaults) against the strings in the interface's source.

import { describe, expect, it } from "vitest";
import { iflyPack } from "./test-pack";

const source = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("./**/*.svelte", { query: "?raw", import: "default", eager: true }),
  ).map(([f, text]) => [f.replace(/^.*\//, ""), text]),
);

describe("pack labels", () => {
  const labels = iflyPack().content.labels;

  it("match the words the interface shows today", () => {
    // The seat view's title comes from the labels (#133); the iFly pack's is the title shown before.
    expect(source["Slideout.svelte"]).toContain("title={index.labels.seatViewTitle}");
    expect(source["Locator.svelte"]).toContain("title={index.labels.seatViewTitle}");
    expect(labels.seatViewTitle).toBe("From the captain seat: which side");
    // The examples Find showed before it read them from the labels.
    expect(labels.findExamples).toEqual(["Fuel panel", "Parking brake", "MCP", "Transponder"]);
  });

  it("name the basis tags as the References page does", () => {
    const named = Object.fromEntries(labels.basisTags.map((t) => [t.id, t]));
    // The words the References page showed before it read them from the labels.
    expect(named["ifly-docs"]).toMatchObject({
      label: "Simulator documentation",
      about:
        "How the aircraft model in the simulator works: its panels, its switches and its own procedures.",
    });
    expect(named["regulator-docs"]).toMatchObject({
      label: "Regulator guidance",
      about: "General practice published by aviation authorities, such as how checklists are used.",
    });
    expect(named["prior-release"]).toMatchObject({ label: "Source being confirmed", pending: true });
  });
});
