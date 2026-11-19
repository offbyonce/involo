// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstalledPack } from "../host";
import PacksPage, { type PackRow } from "./PacksPage.svelte";

const aircraft = {
  family: "Test family",
  name: "Test jet",
  icaoTypes: ["TJ1"],
  simulator: "Test sim",
  developer: "Test dev",
};
const pack = (id: string, name: string, source: "catalog" | "file" = "catalog"): InstalledPack => ({
  summary: { id, name, version: "0.1.0", kind: "aircraft", aircraft },
  source,
  installedAt: 1,
});
const rows: PackRow[] = [
  {
    pack: pack("a", "A jet"),
    saved: { where: "Departure › Before start", done: 12, total: 40 },
    update: null,
  },
  { pack: pack("b", "B jet", "file"), saved: null, update: null },
];
const handlers = () => ({
  onUse: vi.fn(),
  onDownload: vi.fn(),
  onUpdate: vi.fn(),
  onFile: vi.fn(),
  onRemove: vi.fn(),
  onRetry: vi.fn(),
});

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

function phone(): void {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe("the Packs page", () => {
  it("shows each pack's aircraft line, version and saved flight, the open one in use", () => {
    render(PacksPage, { props: { rows, more: [], current: "a", backHref: "#/", ...handlers() } });
    const a = screen.getByRole("article", { name: "A jet" });
    expect(within(a).getByText("In use")).toBeTruthy();
    expect(within(a).getByText("Test family · Test sim · Test dev")).toBeTruthy();
    expect(within(a).getByText("v0.1.0")).toBeTruthy();
    const bar = within(a).getByRole("progressbar", { name: "Saved flight: Departure › Before start" });
    expect(bar.getAttribute("aria-valuenow")).toBe("12");
    expect(within(a).queryByRole("button", { name: "Use this pack" })).toBeNull();
    const b = screen.getByRole("article", { name: "B jet" });
    expect(within(b).getByText("No saved flight yet")).toBeTruthy();
    expect(within(b).getByText("Not from the Involo catalog")).toBeTruthy();
  });

  it("on a phone says how many packs are here, with the actions under each card", () => {
    phone();
    render(PacksPage, { props: { rows, more: [], current: "a", backHref: "#/", ...handlers() } });
    expect(screen.getByText("2 on this device")).toBeTruthy();
    expect(screen.getByText("Each pack keeps its own flight.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("#/");
  });

  it("asks before removing; Esc cancels and gives Remove… its focus back", async () => {
    const h = handlers();
    render(PacksPage, { props: { rows, more: [], current: "a", backHref: "#/", ...h } });
    const remove = screen.getByRole("button", { name: "Remove B jet…" });
    remove.focus();
    await fireEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "Remove B jet?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(remove);
    expect(h.onRemove).not.toHaveBeenCalled();
  });
});
