// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The labels a pack carries (decision 0029) start as the words the interface shows today. Until the
// interface reads them, this keeps the two the same: the iFly pack's labels (its labels.yaml over
// the app's defaults) against the strings in the interface's source.

import { describe, expect, it } from "vitest";
import { NO_EXPANSION } from "./lib/glossary";
import { CONFIRMING, SOURCES } from "./lib/references";
import { iflyPack } from "./test-pack";

const source = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("./**/*.svelte", { query: "?raw", import: "default", eager: true }),
  ).map(([f, text]) => [f.replace(/^.*\//, ""), text]),
);
const references = Object.values(
  import.meta.glob<string>("./lib/references.ts", { query: "?raw", import: "default", eager: true }),
)[0] as string;

describe("pack labels", () => {
  const labels = iflyPack().content.labels;

  it("match the words the interface shows today", () => {
    for (const kind of Object.values(labels.listKinds)) expect(references).toContain(`"${kind}"`);
    expect(source["ListCard.svelte"]).toContain(labels.methods.challengeResponse);
    expect(source["TopBar.svelte"]).toContain(`>${labels.reference.title}<`);
    expect(source["ReferencePage.svelte"]).toContain(`<h1>${labels.reference.title}</h1>`);
    expect(source["Slideout.svelte"]).toContain(`title="${labels.seatViewTitle}"`);
    expect(source["Locator.svelte"]).toContain(`title="${labels.seatViewTitle}"`);
    const start = source["StartView.svelte"] ?? "";
    expect(start).toContain(`<span class="t">${labels.panelStates.title}</span>`);
    expect(start.replace(/\s+/g, " ")).toContain(labels.panelStates.description);
    expect(start).toContain(`<option value="">${labels.panelStates.placeholder}</option>`);
    for (const example of labels.findExamples) expect(source["Find.svelte"]).toContain(`"${example}"`);
    expect(labels.glossaryExceptions).toEqual(NO_EXPANSION);
  });

  it("name the basis tags as the References page does", () => {
    const named = Object.fromEntries(labels.basisTags.map((t) => [t.id, t]));
    for (const s of SOURCES) expect(named[s.tag]).toMatchObject({ label: s.name, about: s.about });
    expect(named[CONFIRMING.tag]).toMatchObject({ label: CONFIRMING.name, pending: true });
  });
});
