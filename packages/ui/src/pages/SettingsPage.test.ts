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

  const seats = [
    { id: "left", label: "Left seat · Captain" },
    { id: "right", label: "Right seat · First officer" },
  ];

  it("Your seat (#133): after Panel preview, the pack's seats, the first chosen until the pilot picks", async () => {
    const changed: Settings[] = [];
    const { rerender } = render(SettingsPage, {
      settings: { ...settings, seat: null },
      version: null,
      seats,
      onChange: (s: Settings) => changed.push(s),
    });
    const group = screen.getByRole("radiogroup", { name: "Your seat" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((b) => [b.textContent, b.getAttribute("aria-checked")]),
    ).toEqual([
      ["Left seat · Captain", "true"],
      ["Right seat · First officer", "false"],
    ]);
    // Right after Panel preview in steps.
    const rows = [...document.querySelectorAll(".set")];
    const preview = rows.findIndex((r) => r.textContent?.includes("Panel preview in steps"));
    expect(rows[preview + 1]?.contains(group)).toBe(true);
    expect(screen.getByText(/^“Where is this\?” shows the view from this seat/)).toBeTruthy();
    await fireEvent.click(within(group).getByRole("radio", { name: "Right seat · First officer" }));
    expect(changed.at(-1)?.seat).toBe("right");
    await rerender({ settings: { ...settings, seat: "right" }, version: null, seats, onChange: () => {} });
    expect(
      within(group).getByRole("radio", { name: "Right seat · First officer" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("no Your seat for a pack with one seat view or none", () => {
    render(SettingsPage, { settings, version: null, onChange: () => {} });
    expect(screen.queryByRole("radiogroup", { name: "Your seat" })).toBeNull();
    cleanup();
    render(SettingsPage, { settings, version: null, seats: seats.slice(0, 1), onChange: () => {} });
    expect(screen.queryByRole("radiogroup", { name: "Your seat" })).toBeNull();
  });

  it("no Steps choice (Full or Essentials) for a pack with no quick steps (#133)", () => {
    render(SettingsPage, { settings, version: null, onChange: () => {} });
    expect(screen.getByRole("radiogroup", { name: "Steps" })).toBeTruthy();
    cleanup();
    render(SettingsPage, { settings, version: null, hasEssentials: false, onChange: () => {} });
    expect(screen.queryByRole("radiogroup", { name: "Steps" })).toBeNull();
    expect(screen.queryByText("Essentials")).toBeNull();
  });
});
