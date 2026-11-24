// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop wording board (#114): each place that talks about the browser says "this computer"
// or "the disk" when the host is the desktop app, and keeps the web app's words otherwise.

import type { Log, Settings } from "@involo/bindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { type Host, hostContext } from "./host";
import { reminderLine } from "./lib/backup";
import KeptNotice from "./lib/KeptNotice.svelte";
import SaveFailedNotice from "./lib/SaveFailedNotice.svelte";
import SimNotice from "./lib/SimNotice.svelte";
import LogPage from "./pages/LogPage.svelte";
import PrivacyPage from "./pages/PrivacyPage.svelte";
import SettingsPage from "./pages/SettingsPage.svelte";

afterEach(cleanup);

const desktop = { context: hostContext({ desktop: true } as Host) };
const web = { context: hostContext({} as Host) };
/** The page's words, its markup's spaces folded. */
const words = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const settings = {
  theme: "dark",
  dimming: 0,
  detail: "expanded",
  listView: "flow",
  tourSeen: true,
  noticeSeen: true,
} as Settings;

describe("the desktop wording", () => {
  it("first-launch notice, second line", () => {
    render(SimNotice, { props: { onUnderstood: () => {} }, ...desktop });
    expect(words()).toContain(
      "Everything you do here is saved on this computer only. Nothing is sent to us.",
    );
    expect(words()).not.toContain("browser");
    cleanup();
    render(SimNotice, { props: { onUnderstood: () => {} }, ...web });
    expect(words()).toContain(
      "Everything you do here is saved in this browser, on this device only. Nothing is sent to us.",
    );
  });

  it("Settings › Back up and restore, and Keep screen awake when unavailable", () => {
    const props = { settings, version: null, canKeepAwake: false, onChange: () => {} };
    render(SettingsPage, { props, ...desktop });
    expect(words()).toContain(
      "One file holds every pack’s flight and plan, your settings and the flight log. Keep a copy somewhere safe, and use it to move your progress to another computer or to the web app.",
    );
    expect(words()).toContain("This computer can’t keep the screen on.");
    expect(words()).not.toContain("site data");
    cleanup();
    render(SettingsPage, { props, ...web });
    expect(words()).toContain(
      "Keep a copy somewhere safe: clearing this browser’s site data removes everything saved here.",
    );
    expect(words()).toContain("This browser can’t keep the screen on.");
  });

  it("Settings › Keep screen awake, when available", () => {
    const props = { settings, version: null, canKeepAwake: true, onChange: () => {} };
    render(SettingsPage, { props, ...desktop });
    expect(words()).toContain("Where the screen can’t be kept on, this row says so.");
    expect(words()).not.toContain("Where the browser");
    cleanup();
    render(SettingsPage, { props, ...web });
    expect(words()).toContain("Where the browser can’t keep the screen on, this row says so.");
  });

  it("backup reminder, second sentence", () => {
    expect(reminderLine(null, 0, true)).toBe(
      "You haven’t saved a backup yet. A backup is how you move your progress to another computer, or keep it if this one fails.",
    );
    expect(reminderLine(null, 0)).toBe(
      "You haven’t saved a backup yet. Clearing this browser’s site data removes everything saved here.",
    );
  });

  it("flight log, the note under the list", () => {
    const props = {
      log: { format: 3, flights: [], practice: [] } as unknown as Log,
      current: null,
      entry: null,
      name: (t: string) => t,
      canGo: () => true,
      backHref: "#/",
      onLog: async () => {},
      onDelete: async () => true,
      onRestore: async () => {},
      onImport: async () => "",
      onSaveCopy: () => {},
      onCsv: () => {},
      onJson: () => {},
      onStep: () => {},
    };
    render(LogPage, { props, ...desktop });
    expect(words()).toContain(
      "Logs stay on this computer unless you export them. Export now and then to keep a copy.",
    );
    cleanup();
    render(LogPage, { props, ...web });
    expect(words()).toContain(
      "Logs stay on this device unless you export them. Clearing your browser’s site data removes them, so export now and then to keep a copy.",
    );
  });

  it("the notice when saving fails", () => {
    render(SaveFailedNotice, desktop);
    expect(words()).toContain(
      "Involo can’t write to its data folder, so your ticks last only while the app is open. Check that the disk has free space, then restart Involo.",
    );
    cleanup();
    render(SaveFailedNotice, web);
    expect(words()).toContain(
      "This browser is blocking site data or is out of space for it, so your ticks last only while this page is open. Check that this browser allows saving site data.",
    );
  });

  it("Start fresh, when the copy can't be set aside", () => {
    const props = {
      what: "flight" as const,
      state: "unreadable" as const,
      text: "x",
      stuck: true,
      onSave: () => {},
      onFresh: () => {},
    };
    render(KeptNotice, { props, ...desktop });
    expect(words()).toContain("This computer may be out of disk space. Save a copy, then try again.");
    cleanup();
    render(KeptNotice, { props, ...web });
    expect(words()).toContain("This browser may be out of space for site data. Save a copy, then try again.");
  });

  it("Settings › Check for updates: desktop only, after Keep screen awake, on by default (#116)", async () => {
    const changed: Settings[] = [];
    render(SettingsPage, {
      props: { settings, version: null, onChange: (s: Settings) => changed.push(s) },
      ...desktop,
    });
    const row = screen.getByRole("switch", { name: "Check for updates" });
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(words()).toContain(
      "Check for updates When Involo starts, it asks GitHub whether a newer version is out, and tells you if there is. Nothing about you is sent. It never installs anything by itself.",
    );
    const titles = [...document.querySelectorAll(".set b")].map((b) => b.textContent);
    expect(titles.indexOf("Check for updates")).toBe(titles.indexOf("Keep screen awake") + 1);
    await fireEvent.click(row);
    expect(changed.at(-1)?.checkUpdates).toBe(false);
    cleanup();
    render(SettingsPage, {
      props: { settings: { ...settings, checkUpdates: false }, version: null, onChange: () => {} },
      ...desktop,
    });
    expect(screen.getByRole("switch", { name: "Check for updates" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    cleanup();
    render(SettingsPage, { props: { settings, version: null, onChange: () => {} }, ...web });
    expect(screen.queryByRole("switch", { name: "Check for updates" })).toBeNull();
  });

  it("the Privacy page's desktop text, the web page unchanged (#116)", () => {
    render(PrivacyPage, { props: { version: "0.1.0" }, ...desktop });
    for (const line of [
      "Involo keeps everything on this computer. Here’s what that means.",
      "In Involo’s data folder on this computer. There’s no account and nothing is copied anywhere else. Deleting that folder removes all of it.",
      "Nothing is sent to us: no analytics, no tracking and no cookies.",
      "When you import a plan, Involo asks SimBrief for it directly, with the username you typed.",
      "When it starts, Involo asks GitHub whether a newer version is out, unless you turn off Settings › Check for updates. It also reads the pack catalog from the Involo site when you add or update a pack. Neither request carries anything about you.",
      "Report a problem with a step opens GitHub’s issue form in your browser. Nothing is sent unless you submit it there.",
      "You downloaded Involo from its GitHub releases. Like any website host, GitHub records visitors’ IP addresses, for downloads and the update check too, under GitHub’s privacy statement.",
      "Your data is files on this computer. Save a backup file to keep a copy, or to move your progress to another computer or the web app: Settings › Back up and restore.",
    ])
      expect(words(), line).toContain(line);
    // The same title, sections and links as the web page.
    expect([...document.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
      "What’s stored",
      "Where it’s kept",
      "What’s sent",
      "Where the app comes from",
      "Keep a copy",
    ]);
    expect(screen.getByRole("link", { name: "Settings › Back up and restore" }).getAttribute("href")).toBe(
      "#/settings/backup",
    );
    expect(words()).not.toMatch(/browser’s|this browser|GitHub Pages/);
    cleanup();
    render(PrivacyPage, { props: { version: "0.1.0" }, ...web });
    expect(words()).toContain("Involo keeps everything on this device. Here’s what that means.");
    expect(words()).toContain("Involo is served by GitHub Pages.");
    expect(words()).not.toContain("update check");
  });

  it("keeps the web words with no host at all, as in a component's own tests", () => {
    render(SaveFailedNotice);
    expect(words()).toContain("Check that this browser allows saving site data.");
  });
});
