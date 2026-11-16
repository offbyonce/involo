// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Rail } from "@involo/bindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlossaryTerm } from "../lib/glossary";
import GlossaryPage from "./GlossaryPage.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rail: Rail = {
  stages: [
    {
      title: "Alpha",
      phases: [
        {
          id: "p1",
          title: "First",
          progress: { done: 0, skipped: 0, toDo: 1, total: 1 },
          complete: false,
          open: 0,
          skipped: 0,
        },
      ],
    },
  ],
  reference: [],
};
/** Invented terms: one with an expansion and steps, one without either. */
const terms: GlossaryTerm[] = [
  {
    term: "WGT",
    expansion: "Widget gate timer",
    definition: "Times the widget gate.",
    steps: [{ id: "s1", title: "Widget gate", value: "OPEN", phase: "p1" }],
  },
  { term: "Zap valve", expansion: null, definition: "A valve that zaps.", steps: [] },
];
const base = { terms, term: null, rail, backHref: "#/phase/p1", onStep: () => {} };
/** A phone-sized screen: below 900 px. */
const phone = () =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("GlossaryPage", () => {
  it("desktop: the list with its filter and count, A to Z, and the first term open (GlossaryDesk)", () => {
    render(GlossaryPage, base);
    expect(screen.getByRole("link", { name: "Checklist" }).getAttribute("href")).toBe("#/phase/p1");
    expect(screen.getByRole("heading", { level: 1, name: "Glossary" })).toBeTruthy();
    expect(screen.getByText("2 terms")).toBeTruthy();
    const rows = screen.getAllByRole("link", { name: /WGT|Zap valve/ });
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["#/glossary/WGT", "#/glossary/Zap%20valve"]);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "WGT" })).toBeTruthy();
    expect(screen.getByText("Widget gate timer", { selector: ".expansion" })).toBeTruthy();
    expect(screen.getByText("In the steps · 1")).toBeTruthy();
    // No Where is this? and no Related: the pack has no data for them (owner).
    expect(screen.queryByText("Related")).toBeNull();
    expect(screen.queryByText("Where is this?")).toBeNull();
  });

  it("opens the term in the address, shows only the sections it has, and a step goes to that step", async () => {
    const onStep = vi.fn();
    render(GlossaryPage, { ...base, term: "wgt", onStep });
    await fireEvent.click(screen.getByRole("link", { name: /^Widget gate\s*Alpha/ }));
    expect(onStep).toHaveBeenCalledWith("s1");
    cleanup();
    render(GlossaryPage, { ...base, term: "Zap valve" });
    expect(screen.getByText("A valve that zaps.")).toBeTruthy();
    expect(screen.queryByText(/In the steps/)).toBeNull();
  });

  it("filters by name or expansion, with the count", async () => {
    render(GlossaryPage, base);
    await fireEvent.input(screen.getByRole("searchbox", { name: "Filter terms" }), {
      target: { value: "timer" },
    });
    expect(screen.getByText("1 term")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Zap valve/ })).toBeNull();
  });

  it("phone: the list on its own page, then a term on its own page with back to all terms (GlossaryPhone)", () => {
    phone();
    render(GlossaryPage, base);
    expect(screen.getByRole("link", { name: "Back to checklist" }).getAttribute("href")).toBe("#/phase/p1");
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    cleanup();
    render(GlossaryPage, { ...base, term: "WGT" });
    expect(screen.getByRole("link", { name: "Back to all terms" }).getAttribute("href")).toBe("#/glossary");
    expect(screen.queryByRole("navigation", { name: "Terms" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "WGT" })).toBeTruthy();
  });

  it("opens a term with a slash from its address, and opens nothing for a name it does not hold", () => {
    render(GlossaryPage, {
      ...base,
      terms: [...terms, { term: "TO/GA", expansion: "Takeoff/go-around", definition: "", steps: [] }],
      term: "TO/GA",
    });
    expect(screen.getByRole("heading", { level: 2, name: "TO/GA" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /TO\/GA/ }).getAttribute("href")).toBe("#/glossary/TO%2FGA");
    cleanup();
    render(GlossaryPage, { ...base, term: "XYZ" });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByRole("link", { current: true })).toBeNull();
  });

  it("phone: back from a term returns to the list where it was, focus on that term", async () => {
    phone();
    const { rerender } = render(GlossaryPage, base);
    const list = screen.getByRole("navigation", { name: "Terms" });
    list.scrollTop = 120;
    await fireEvent.scroll(list);
    await fireEvent.click(screen.getByRole("link", { name: /WGT/ }));
    await rerender({ ...base, term: "WGT" });
    expect(document.activeElement?.textContent).toBe("WGT");
    await rerender({ ...base, term: null });
    const back = screen.getByRole("navigation", { name: "Terms" });
    expect(back.scrollTop).toBe(120);
    expect(document.activeElement?.getAttribute("href")).toBe("#/glossary/WGT");
  });

  it("switches between the two layouts as the screen crosses 900 px", async () => {
    let change = () => {};
    const mq = {
      matches: true,
      addEventListener: (_: string, f: () => void) => (change = f),
      removeEventListener: () => {},
    };
    vi.stubGlobal("matchMedia", () => mq);
    render(GlossaryPage, base);
    expect(screen.getByRole("link", { name: "Checklist" })).toBeTruthy();
    mq.matches = false;
    change();
    await tick();
    expect(screen.getByRole("link", { name: "Back to checklist" })).toBeTruthy();
  });

  it("names the list on rows that would read the same, and only on those (owner)", () => {
    const twin = { title: "Pump", value: "ON", phase: "p1" };
    render(GlossaryPage, {
      ...base,
      terms: [
        {
          term: "PMP",
          expansion: null,
          definition: "A pump.",
          steps: [
            { id: "a", ...twin, list: "Start flow" },
            { id: "b", ...twin, list: "Start checklist" },
            { id: "c", title: "Valve", value: "OPEN", phase: "p1", list: "Start flow" },
          ],
        },
      ],
      term: "PMP",
    });
    const subs = [...document.querySelectorAll(".step .sub > span:first-child")].map((e) => e.textContent);
    expect(subs).toEqual(["Alpha › First · Start flow", "Alpha › First · Start checklist", "Alpha › First"]);
  });
});
