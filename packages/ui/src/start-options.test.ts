// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Start page's options and their text are in the pack (decision 0029): the iFly pack's
// phases.yaml asks exterior, power and the start type there. Until the Start page draws them from
// the pack, this keeps the pack's text and the page's the same.

import { describe, expect, it } from "vitest";
import { iflyPack } from "./test-pack";

const page = Object.values(
  import.meta.glob<string>("./flight/StartView.svelte", { query: "?raw", import: "default", eager: true }),
)[0] as string;
const flat = page.replace(/\s+/g, " ");

describe("Start page options", () => {
  const options = iflyPack().content.phases?.options ?? [];
  const onStart = options.filter((o) => o.askIn?.includes("start"));

  it("are the pack's exterior, power and start type, each with a style", () => {
    expect(onStart.map((o) => o.id).sort()).toEqual(["exterior", "power", "start"]);
    for (const o of onStart) expect(o.start?.style).toBe("row");
  });

  it("carry the text the Start page shows today", () => {
    for (const o of onStart) {
      const title = o.start?.title ?? o.title;
      if (o.id !== "power") expect(page).toContain(`>${title}</span>`);
      expect(flat).toContain(o.start?.description ?? "none");
    }
    const exterior = onStart.find((o) => o.id === "exterior");
    expect(exterior?.start?.link).toEqual({ phase: "exterior", text: "Preview the inspection" });
    expect(page).toContain(`phaseHref("exterior")}>Preview the inspection</a>`);
  });
});
