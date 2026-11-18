// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Settings } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import SettingsPage from "./SettingsPage.svelte";

afterEach(cleanup);

const settings = {
  theme: "dark",
  dimming: 0,
  detail: "expanded",
  listView: "flow",
  tourSeen: true,
} as Settings;

describe("SettingsPage", () => {
  it("names the views List and Step by step, keeping the saved values", async () => {
    const changed: Settings[] = [];
    render(SettingsPage, { settings, version: null, onChange: (s: Settings) => changed.push(s) });
    const view = screen.getByRole("radiogroup", { name: "View" });
    expect(
      within(view)
        .getAllByRole("radio")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["List", "Step by step"]);
    // Saved as `flow`: Step by step is the one chosen.
    expect(within(view).getByRole("radio", { name: "Step by step" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.queryByText(/\b(Checklist|Flow)\b/)).toBeNull();
    await fireEvent.click(within(view).getByRole("radio", { name: "List" }));
    expect(changed.at(-1)?.listView).toBe("checklist");
  });
});
