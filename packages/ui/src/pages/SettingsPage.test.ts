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

  it("Timer chime (#213): on or off, saying what it does", async () => {
    const changed: Settings[] = [];
    render(SettingsPage, {
      settings: { ...settings, chime: true },
      version: null,
      onChange: (s: Settings) => changed.push(s),
    });
    const chime = screen.getByRole("switch", { name: "Timer chime" });
    expect(chime.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Plays when a step timer reaches zero.")).toBeTruthy();
    await fireEvent.click(chime);
    expect(changed.map((s) => s.chime)).toEqual([false]);
  });

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
    expect(group.closest(".set")?.querySelector("p")?.textContent).toBe(
      "Panel views show what you see from this seat.",
    );
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

  it("backs up and restores from after Your seat, saying when this device last saved a backup (#47)", async () => {
    const backups: number[] = [];
    const chosen: File[] = [];
    const seats = [
      { id: "left", label: "Left seat · Captain" },
      { id: "right", label: "Right seat · First officer" },
    ];
    const { container } = render(SettingsPage, {
      settings: { ...settings, lastBackup: null },
      version: null,
      seats,
      onChange: () => {},
      onBackup: () => backups.push(1),
      onRestore: (f: File) => chosen.push(f),
    });
    const titles = [...container.querySelectorAll(".set b")].map((b) => b.textContent);
    // Then Timer chime (#213), before Dimming.
    expect(titles.slice(titles.indexOf("Your seat"), titles.indexOf("Your seat") + 4)).toEqual([
      "Your seat",
      "Back up and restore",
      "Timer chime",
      "Dimming",
    ]);
    expect(screen.getByText("Last backup: never")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Save a backup file" }));
    expect(backups).toEqual([1]);
    const file = new File(["{}"], "involo-backup.json", { type: "application/json" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);
    expect(chosen).toEqual([file]);
  });

  it("puts Back up and restore after Panel preview when there is no seat setting, with the last backup's time", () => {
    const at = new Date(2026, 10, 18, 10, 14).getTime();
    const { container } = render(SettingsPage, {
      settings: { ...settings, lastBackup: at },
      version: null,
      onChange: () => {},
    });
    const titles = [...container.querySelectorAll(".set b")].map((b) => b.textContent);
    expect(titles[titles.indexOf("Panel preview in steps") + 1]).toBe("Back up and restore");
    expect(screen.getByText("Last backup: Nov 18 at 10:14")).toBeTruthy();
  });
});
