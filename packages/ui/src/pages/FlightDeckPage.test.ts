// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexPack } from "../pack-index";
import FlightDeckPage from "./FlightDeckPage.svelte";

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
const index = indexPack(pack);
const base = {
  index,
  area: "forward-overhead",
  zone: "fuel",
  backHref: "#/phase/before-start",
  onStep: () => {},
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = "";
});
/** A screen width: the page asks for 1440 and 900 px. */
const width = (w: number) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: w >= Number(/(\d+)px/.exec(q)?.[1] ?? 0),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("FlightDeckPage", () => {
  it("1440 and up (Deck): the area list, the area's map and lists, the selected panel", () => {
    width(1440);
    render(FlightDeckPage, base);
    expect(screen.getByRole("link", { name: "Checklist" }).getAttribute("href")).toBe("#/phase/before-start");
    const areas = screen.getByRole("navigation", { name: "Flight deck areas" });
    const links = within(areas).getAllByRole("link");
    expect(links.at(-1)?.textContent).toBe("Around the flight deck");
    expect(within(areas).getByRole("link", { current: true }).textContent).toMatch(/^Forward overhead/);
    expect(screen.getByRole("heading", { level: 2, name: "Forward overhead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fuel panel" }).getAttribute("aria-pressed")).toBe("true");
    const panel = screen.getByRole("complementary", { name: "Fuel panel" });
    expect(within(panel).getByText("Selected panel")).toBeTruthy();
    expect(within(panel).getByText("Light meanings")).toBeTruthy();
    expect(within(panel).getAllByRole("link", { name: /^Fuel pump switches · / }).length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: /Name every panel/ })).toBeTruthy();
  });

  it("selects a place from the map, and lists the area's places and lights", async () => {
    width(1440);
    render(FlightDeckPage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Panels in this area, as a list\s*20/ }));
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(20);
    await fireEvent.click(screen.getByRole("button", { name: /^Light meanings for this area/ }));
    expect(screen.getAllByText(/LOW PRESSURE/).length).toBeGreaterThan(0);
    await fireEvent.keyDown(screen.getAllByRole("button", { name: "Hydraulic panel" })[0] as Element, {
      key: "Enter",
    });
    expect(location.hash).toBe("#/deck/forward-overhead/hyd");
  });

  it("Around the flight deck: its places as a list with their location lines, no map, nothing lit", () => {
    width(1440);
    const { container } = render(FlightDeckPage, { ...base, area: "around-the-flight-deck", zone: null });
    expect(screen.queryByRole("group", { name: /layout/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Electronic flight bag" })).toBeTruthy();
    expect(container.querySelectorAll(".places > li").length).toBe(5);
    expect(container.querySelectorAll(".places > li .drawing").length).toBe(2);
    expect(container.querySelector(".areas path.here")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("900 to 1439 px: no third column; a chosen place opens in a slide-out, and Esc closes it", async () => {
    width(1280);
    render(FlightDeckPage, base);
    expect(screen.queryByRole("complementary")).toBeNull();
    const slide = screen.getByRole("dialog", { name: "Fuel panel" });
    expect(within(slide).getByText("Forward overhead")).toBeTruthy();
    expect(slide.getAttribute("aria-modal")).toBe("true");
    await tick();
    expect(document.activeElement).toBe(slide);
    // Esc closes it from anywhere on the page.
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(location.hash).toBe("#/deck/forward-overhead");
    cleanup();
    render(FlightDeckPage, { ...base, zone: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("below 900 px (PhoneDeck): the area picker, the map, the panel with Used by", async () => {
    width(390);
    render(FlightDeckPage, base);
    expect(screen.getByRole("link", { name: "Back to checklist" })).toBeTruthy();
    const pick = screen.getByRole("button", { name: /^Forward overhead/ });
    await fireEvent.click(pick);
    const menu = screen.getByRole("list", { name: "Flight deck areas" });
    expect(within(menu).getAllByRole("button").length).toBe(8);
    // Esc closes it, and focus goes back to the picker.
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Flight deck areas" })).toBeNull();
    expect(document.activeElement).toBe(pick);
    expect(screen.getByRole("heading", { level: 3, name: "Fuel panel" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^Used by: Fuel pump switches/ }).length).toBeGreaterThan(0);
  });

  it("moves an address that names a place under another area to the place's own area", () => {
    width(1440);
    location.hash = "#/deck/glareshield/fuel";
    render(FlightDeckPage, { ...base, area: "glareshield", zone: "fuel" });
    expect(location.hash).toBe("#/deck/forward-overhead/fuel");
  });

  it("draws the selected panel fitted to the column, with Full size opening the panel sheet", async () => {
    width(1440);
    const opened: string[] = [];
    const was = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      opened.push(this.getAttribute("aria-label") ?? "");
      this.setAttribute("open", "");
    };
    render(FlightDeckPage, base);
    const panel = screen.getByRole("complementary", { name: "Fuel panel" });
    // An overview: no navigator strip, no "See the whole panel larger".
    expect(within(panel).queryByRole("slider")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "See the whole panel larger" })).toBeNull();
    expect(within(panel).getByText("Resting positions. Tap a light for its meaning.")).toBeTruthy();
    await fireEvent.click(within(panel).getByRole("button", { name: "Full size ›" }));
    expect(opened).toEqual(["Fuel panel"]);
    HTMLDialogElement.prototype.showModal = was;
  });

  it("900 to 1439 px: the slide-out stays the full-size view, with no Full size link", () => {
    width(1280);
    render(FlightDeckPage, base);
    const slide = screen.getByRole("dialog", { name: "Fuel panel" });
    expect(within(slide).queryByRole("button", { name: "Full size ›" })).toBeNull();
  });
});
