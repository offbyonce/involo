// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The privacy note (#52, Privacy board): its title, the five sections in order, each item the app
// stores, and its two links.

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "./PrivacyPage.svelte";

afterEach(cleanup);

describe("PrivacyPage", () => {
  it("has the title, the lead and the five sections in the board's order", () => {
    render(PrivacyPage, { version: "0.1.0" });
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(screen.getByText("Involo keeps everything on this device. Here’s what that means.")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What’s stored",
      "Where it’s kept",
      "What’s sent",
      "Where the app comes from",
      "Keep a copy",
    ]);
    expect(screen.getByText("Involo 0.1.0")).toBeTruthy();
  });

  it("lists each item the app stores", () => {
    render(PrivacyPage, { version: "0.1.0" });
    const stored = screen.getByRole("region", { name: "What’s stored" });
    expect(
      within(stored)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Your progress on each flight: ticks, skips, timers, briefings and where you are.",
      "Your settings, including the SimBrief username or pilot ID you typed.",
      "The flight plan you imported, in short form: route, numbers and weather, with no names or other personal fields.",
      "Your flight log and practice results.",
      "The packs you installed.",
    ]);
    expect(within(stored).getByText("Nothing else that could identify you.")).toBeTruthy();
  });

  it("links GitHub's privacy statement in a new tab, and Back up and restore in Settings", () => {
    render(PrivacyPage, { version: "0.1.0" });
    const github = screen.getByRole("link", { name: "GitHub’s privacy statement" }) as HTMLAnchorElement;
    expect(github.href).toMatch(/^https:\/\/docs\.github\.com\/.*privacy-statement$/);
    expect(github.target).toBe("_blank");
    expect(github.rel).toBe("noopener noreferrer");
    const backup = screen.getByRole("link", { name: "Settings › Back up and restore" }) as HTMLAnchorElement;
    expect(backup.getAttribute("href")).toBe("#/settings/backup");
    expect(backup.target).toBe("");
  });
});
