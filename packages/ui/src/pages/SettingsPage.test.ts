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
  noticeSeen: true,
} as Settings;

describe("SettingsPage", () => {
  it("shows the version, and What's new opens that version's release in a new tab (#54)", () => {
    render(SettingsPage, { settings, version: "0.1.0", onChange: () => {} });
    const line = screen.getByText(/^Involo 0\.1\.0/);
    expect(line.textContent).toBe("Involo 0.1.0 · What’s new");
    const link = within(line).getByRole("link", { name: "What’s new" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/offbyonce/involo/releases/tag/v0.1.0");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

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

  describe("the rows from 3.0 (#245)", () => {
    it("Keep screen awake: switches, or is off and disabled where the browser can't", async () => {
      const changed: Settings[] = [];
      render(SettingsPage, { settings, version: null, onChange: (s: Settings) => changed.push(s) });
      const awake = screen.getByRole("switch", { name: "Keep screen awake" }) as HTMLButtonElement;
      expect(awake.getAttribute("aria-checked")).toBe("false");
      await fireEvent.click(awake);
      expect(changed.at(-1)?.keepAwake).toBe(true);
      cleanup();
      render(SettingsPage, {
        settings: { ...settings, keepAwake: true },
        version: null,
        canKeepAwake: false,
        onChange: () => {},
      });
      const off = screen.getByRole("switch", { name: "Keep screen awake" }) as HTMLButtonElement;
      expect(off.disabled).toBe(true);
      expect(off.getAttribute("aria-checked")).toBe("false");
      expect(screen.getByText(/This browser can’t keep the screen on\.$/)).toBeTruthy();
    });

    it("Your Essentials: the count and Reset, or the pack's own and Reset disabled", async () => {
      let reset = 0;
      render(SettingsPage, {
        settings,
        version: null,
        essentialsChanged: { added: 2, removed: 1 },
        onResetEssentials: () => reset++,
        onChange: () => {},
      });
      expect(
        screen.getByText(
          "You’ve changed 3 steps: 2 added, 1 removed. Reset puts back the pack’s own Essentials.",
        ),
      ).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
      expect(reset).toBe(1);
      cleanup();
      render(SettingsPage, {
        settings,
        version: null,
        essentialsChanged: { added: 0, removed: 0 },
        onChange: () => {},
      });
      expect(screen.getByText("You’re using the pack’s own Essentials.")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Reset to default" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it("Start, before Back up and restore, and Clear all progress last", async () => {
      const chosen: string[] = [];
      let cleared = 0;
      render(SettingsPage, {
        settings,
        version: null,
        start: {
          title: "Start type",
          choices: [
            { value: "cold", label: "Cold and dark" },
            { value: "turn", label: "Turnaround" },
          ],
          value: "cold",
        },
        onStart: (v: string) => chosen.push(v),
        onClearAll: () => cleared++,
        onChange: () => {},
      });
      const start = screen.getByRole("radiogroup", { name: "Start" });
      expect(within(start).getByRole("radio", { name: "Cold and dark" }).getAttribute("aria-checked")).toBe(
        "true",
      );
      await fireEvent.click(within(start).getByRole("radio", { name: "Turnaround" }));
      expect(chosen).toEqual(["turn"]);
      const titles = [...document.querySelectorAll(".set b")].map((b) => b.textContent);
      expect(titles.indexOf("Start")).toBe(titles.indexOf("Back up and restore") - 1);
      expect(titles.at(-1)).toBe("Clear all progress");
      await fireEvent.click(screen.getByRole("button", { name: "Clear all progress" }));
      expect(cleared).toBe(1);
      cleanup();
      render(SettingsPage, { settings, version: null, onChange: () => {} });
      expect(screen.queryByRole("radiogroup", { name: "Start" })).toBeNull();
    });
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
