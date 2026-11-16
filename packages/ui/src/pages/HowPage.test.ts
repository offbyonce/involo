// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fill, HOW, runs } from "../lib/how-content";
import HowPage from "./HowPage.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "#/");
});

const counts = { stages: 5, memory: 3, qrh: 13, procedures: 11 };
const base = {
  part: null,
  counts,
  phase: { id: "before-start", title: "Before start" },
  step: { id: "s9", title: "Fuel pumps" },
  backHref: "#/phase/before-start",
  onStep: () => {},
};
/** A phone-sized screen: below 900 px. */
const phone = () =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
/** A line as the page shows it: counts filled, bold marks gone. */
const shown = (text: string) =>
  runs(fill(text, counts))
    .map((r) => r.text)
    .join("");

describe("How procedures work, desktop (HowDesk)", () => {
  it("has the header, the seven parts in the list, and every part in the reading column, word for word", () => {
    const { container } = render(HowPage, base);
    expect(screen.getByRole("link", { name: "Checklist" }).getAttribute("href")).toBe("#/phase/before-start");
    expect(screen.getByRole("heading", { level: 1, name: "How procedures work" })).toBeTruthy();
    expect(screen.getByText("The ideas behind the checklist, in seven short parts")).toBeTruthy();
    const list = screen.getByRole("navigation", { name: "Parts" });
    expect([...list.querySelectorAll("a")].map((a) => a.textContent)).toEqual(
      HOW.parts.map((p, i) => `${i + 1}${p.title}`),
    );
    expect(list.querySelector('[aria-current="true"]')?.textContent).toBe("1The shape of a flight");
    const h2 = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(h2).toEqual(HOW.parts.map((p, i) => `${i + 1}${p.title}`));
    const text = container.querySelector("article")?.textContent ?? "";
    for (const p of HOW.parts) {
      for (const b of p.blocks) if ("p" in b) expect(text).toContain(shown(b.p));
      expect(text).toContain(shown(p.inInvolo.text));
    }
    // Every count filled from the pack; no placeholder or bold mark left.
    expect(text).toContain("Involo splits a flight into 5 stages:");
    expect(text).toContain("Involo has 3 memory-item lists, 13 quick reference lists and 11 procedures,");
    expect(text).not.toMatch(/[{}]|\*\*/);
  });

  it("shows the bold words, part 3's terms, and part 2's figure as the board draws it", () => {
    const { container } = render(HowPage, base);
    const bold = [...container.querySelectorAll("p b")].map((b) => b.textContent);
    expect(bold.slice(0, 2)).toEqual(["flow", "checklist"]);
    expect(bold).toContain("memory items");
    expect([...container.querySelectorAll(".terms li")].map((li) => li.textContent)).toEqual([
      "Checkwhat to look at to know it worked",
      "If notwhat to do when it didn’t",
      "Whythe reason the step exists",
      "Where is this?the panel, with the control in blue",
    ]);
    const fig = container.querySelector("figure");
    expect(fig?.querySelector("svg")?.getAttribute("aria-label")).toBe(HOW.figure.flowLabel);
    expect([...(fig?.querySelectorAll("svg text") ?? [])].map((t) => t.textContent)).toEqual([
      "OVERHEAD",
      "GLARESHIELD",
      "MAIN PANEL",
      "PEDESTAL",
      "start",
      "end",
    ]);
    expect([...(fig?.querySelectorAll(".pair:not(.head)") ?? [])].map((r) => r.textContent)).toEqual([
      "Fuel____ kg, pumps ON",
      "Hydraulic pumpsON",
      "Anti-collision lightON",
      "Stabilizer trim____ units",
    ]);
    expect(fig?.querySelector("figcaption")?.textContent).toBe(
      "Do the flow, then use the checklist to confirm nothing was missed.",
    );
  });

  it("links each In Involo box to the real place: the current phase, the current step, Emergency, Settings, Open steps, Flight", async () => {
    const onStep = vi.fn();
    const { container } = render(HowPage, { ...base, onStep });
    const links = [...container.querySelectorAll(".inv a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Before start ›", "#/phase/before-start"],
      ["Before start ›", "#/phase/before-start"],
      ["Fuel pumps ›", "#/phase/before-start"],
      ["Emergency ›", "#/reference"],
      ["Settings ›", "#/settings"],
      ["Open steps ›", "#/open"],
      ["Flight › Overview ›", "#/flight/overview"],
    ]);
    // The current step opens that step.
    await fireEvent.click(links[2] as HTMLElement);
    expect(onStep).toHaveBeenCalledWith("s9");
  });

  it("with no phase at all, the phase links are left out rather than empty (review)", () => {
    const { container } = render(HowPage, { ...base, phase: null, step: null });
    expect([...container.querySelectorAll(".inv a")].map((a) => a.textContent)).toEqual([
      "Emergency ›",
      "Settings ›",
      "Open steps ›",
      "Flight › Overview ›",
    ]);
  });

  it("with no current step (the phase done), the step's link goes to the current phase", () => {
    const { container } = render(HowPage, { ...base, step: null });
    expect(container.querySelectorAll(".inv a")[2]?.textContent).toBe("Before start ›");
  });

  it("a part picked in the list scrolls to it, is marked, and goes in the address", async () => {
    render(HowPage, base);
    await fireEvent.click(screen.getByRole("link", { name: "Reading a step" }));
    expect(location.hash).toBe("#/how/3");
    expect(screen.getByRole("link", { name: "Reading a step" }).getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("link", { name: "The shape of a flight" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("opens at the part in the address", async () => {
    render(HowPage, { ...base, part: 5 });
    await tick();
    await tick();
    expect(screen.getByRole("link", { name: "How much you see" }).getAttribute("aria-current")).toBe("true");
  });

  it("names the parts in the list by title alone, the number hidden from screen readers (review)", () => {
    render(HowPage, base);
    const list = screen.getByRole("navigation", { name: "Parts" });
    expect(within(list).getByRole("link", { name: "Reading a step" })).toBeTruthy();
  });

  it("puts a part out of range at part 1, and the address with it (review)", async () => {
    history.replaceState(null, "", "#/how/9");
    render(HowPage, { ...base, part: 9 });
    await tick();
    expect(location.hash).toBe("#/how/1");
    expect(screen.getByRole("link", { name: "The shape of a flight" }).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("keeps a picked part marked when the column ends before its heading reaches the top; the reader's own scrolling follows the column (review)", async () => {
    const { container } = render(HowPage, base);
    const col = container.querySelector("main.read") as HTMLElement;
    // A column 900 px tall, scrolled to its end; headings 600 px apart, part 6 below the top third.
    Object.defineProperties(col, {
      clientHeight: { configurable: true, value: 900 },
      scrollHeight: { configurable: true, value: 4500 },
    });
    col.scrollTop = 3600;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const m = /^how-h-(\d)$/.exec(this.id);
      const top = m ? Number(m[1]) * 600 - 3600 + 60 : 60;
      return {
        top,
        bottom: top + 30,
        left: 0,
        right: 0,
        width: 0,
        height: 30,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
    await fireEvent.click(screen.getByRole("link", { name: "Skipping and coming back" }));
    await fireEvent.scroll(col);
    expect(location.hash).toBe("#/how/6");
    expect(screen.getByRole("link", { name: "Skipping and coming back" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(document.activeElement?.id).toBe("how-h-6");
    // Now the reader scrolls: at the column's end, the last part. (jsdom has no layout, so the
    // column is put back at its end.)
    col.scrollTop = 3600;
    await fireEvent.wheel(col);
    await fireEvent.scroll(col);
    expect(location.hash).toBe("#/how/7");
    expect(screen.getByRole("link", { name: "Your flight’s numbers" }).getAttribute("aria-current")).toBe(
      "true",
    );
    vi.restoreAllMocks();
  });
});

describe("How procedures work, between the layouts", () => {
  it("keeps the part being read when a tablet turns from landscape to portrait (review)", async () => {
    let change = (): void => {};
    const mq = {
      matches: true,
      addEventListener: (_: string, f: () => void) => (change = f),
      removeEventListener: () => {},
    };
    vi.stubGlobal("matchMedia", () => mq);
    render(HowPage, { ...base, part: 2 });
    await fireEvent.click(screen.getByRole("link", { name: "How much you see" }));
    mq.matches = false;
    change();
    await tick();
    expect(screen.getByText("Part 5 of 7")).toBeTruthy();
  });
});

describe("How procedures work, phone (HowPhone)", () => {
  it("shows one part, its place, All seven parts, and Back and Next naming their parts", () => {
    phone();
    const { container } = render(HowPage, { ...base, part: 2 });
    expect(screen.getByRole("link", { name: "Back to checklist" }).getAttribute("href")).toBe(
      "#/phase/before-start",
    );
    expect(screen.getByText("Part 2 of 7")).toBeTruthy();
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
      "2Flows, then checklists",
    ]);
    expect(screen.getByRole("link", { name: "‹ 1 · The shape of a flight" }).getAttribute("href")).toBe(
      "#/how/1",
    );
    expect(screen.getByRole("link", { name: "3 · Reading a step ›" }).getAttribute("href")).toBe("#/how/3");
  });

  it("has no Back on part 1 and no Next on part 7", () => {
    phone();
    const { container, unmount } = render(HowPage, base);
    expect(screen.getByText("Part 1 of 7")).toBeTruthy();
    expect(container.querySelector(".foot .prev")).toBeNull();
    expect(container.querySelector(".foot .next")?.textContent).toBe("2 · Flows, then checklists ›");
    unmount();
    const last = render(HowPage, { ...base, part: 7 });
    expect(last.container.querySelector(".foot .next")).toBeNull();
    expect(last.container.querySelector(".foot .prev")?.textContent).toBe("‹ 6 · Skipping and coming back");
  });

  it("closes the parts list on Esc, and on picking the part already shown (review)", async () => {
    phone();
    render(HowPage, { ...base, part: 4 });
    const all = screen.getByRole("button", { name: "All seven parts" });
    await fireEvent.click(all);
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(all.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(all);
    await fireEvent.click(all);
    await fireEvent.click(
      within(screen.getByRole("navigation", { name: "Parts" })).getByRole("link", {
        name: "When something goes wrong",
      }),
    );
    expect(all.getAttribute("aria-expanded")).toBe("false");
  });

  it("All seven parts opens the list of parts, each going to its address", async () => {
    phone();
    render(HowPage, { ...base, part: 4 });
    const all = screen.getByRole("button", { name: "All seven parts" });
    expect(all.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Parts" })).toBeNull();
    await fireEvent.click(all);
    const list = screen.getByRole("navigation", { name: "Parts" });
    expect(list.querySelectorAll("a")).toHaveLength(7);
    expect(list.querySelector('[aria-current="true"]')?.getAttribute("href")).toBe("#/how/4");
  });
});
