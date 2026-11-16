// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { available, dealOne, phasesOf, random, seeds, sourcesIn, stepShows } from "../lib/practice";
import { visit } from "../lib/practice-visit.svelte";
import { indexPack } from "../pack-index";
import PracticePage from "./PracticePage.svelte";

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
const index = indexPack(pack);
const steps: string[] = [];
const base = {
  pack,
  index,
  options: {},
  backHref: "#/phase/before-start",
  onStep: (id: string) => steps.push(id),
};
const width = (w: number) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: w >= Number(/(\d+)px/.exec(q)?.[1] ?? 0),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

beforeEach(() => {
  visit.test = null;
  visit.last = null;
  steps.length = 0;
  width(1440);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The question on screen's options, and which is right. */
const current = () => {
  const q = visit.test?.questions[visit.test.at];
  if (!q) throw new Error("no question");
  return q;
};

describe("PracticePage", () => {
  it("home (PracticeHome): the ready-made tests, Build a test with counts from the pack, and the available line", () => {
    render(PracticePage, base);
    expect(screen.getByRole("heading", { level: 1, name: "Practice" })).toBeTruthy();
    for (const name of [
      "every item, in order",
      "Lights of the flight deck",
      "Before engine start",
      "Check ride",
    ])
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    expect(screen.getByText("Topics · 5 chosen")).toBeTruthy();
    const memory = screen.getByRole("button", { name: /^Memory items[\d,]+$/ });
    expect(memory.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^20 questions from [\d,]+ in these topics and stages$/)).toBeTruthy();
    // Chips count sources, what a test can draw (owner): a light's meaning and its reverse are one.
    const phases = phasesOf(pack, ["Preflight", "Departure"]);
    const lights = sourcesIn(
      available(seeds(pack, index), { topics: ["lights"], phases, options: {} }, stepShows(pack, {})),
    );
    expect(screen.getByRole("button", { name: new RegExp(`^Light meanings${lights}$`) })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preflight" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Earlier this visit/)).toBeNull();
  });

  it("a question answered wrong, with feedback after each: Your answer, the correct one, the source's words and links", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    expect(screen.getByText("Question 1 of 20")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    const q = current();
    if (q.kind !== "choice") throw new Error("choice expected");
    const wrong = (q.answer + 1) % 4;
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);
    await fireEvent.click(options[wrong] as HTMLElement);
    expect(within(options[wrong] as HTMLElement).getByText("Your answer")).toBeTruthy();
    expect(within(options[q.answer] as HTMLElement).getByText("Correct answer")).toBeTruthy();
    const box = screen.getByRole("status");
    expect(within(box).getByText("Not this one")).toBeTruthy();
    expect(within(box).getAllByRole("link").length).toBeGreaterThan(0);
    // Locked: another choice changes nothing.
    await fireEvent.click(options[q.answer] as HTMLElement);
    expect(visit.test?.answers[0]).toBe(wrong);
    expect(screen.getByText(/^Score/).textContent).toBe("Score 0 of 1");
    // Enter for the next question.
    await fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByText("Question 2 of 20")).toBeTruthy();
  });

  it("keys 1 to 4 choose an option; a right answer is marked Correct answer with no feedback box", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    const q = current();
    if (q.kind !== "choice") throw new Error("choice expected");
    await fireEvent.keyDown(document.body, { key: String(q.answer + 1) });
    expect(screen.getByText("Correct answer")).toBeTruthy();
    // Announced, with no feedback box.
    expect(screen.getByRole("status").textContent).toMatch(/Correct answer/);
    expect(screen.queryByText("Not this one")).toBeNull();
  });

  it("Enter on the option just clicked moves on, and the arrow keys move between the options (review)", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    const options = screen.getAllByRole("radio");
    (options[0] as HTMLElement).focus();
    await fireEvent.keyDown(options[0] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    await fireEvent.click(options[1] as HTMLElement);
    await fireEvent.keyDown(options[1] as HTMLElement, { key: "Enter" });
    expect(screen.getByText("Question 2 of 20")).toBeTruthy();
  });

  it("End test with answers moves focus to the results' heading; with none, back home (review)", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    await fireEvent.click(screen.getByRole("button", { name: "End test" }));
    expect(screen.getByText("Build a test")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    await fireEvent.keyDown(document.body, { key: "1" });
    await fireEvent.click(screen.getByRole("button", { name: "End test" }));
    await new Promise((go) => setTimeout(go, 0));
    expect(document.activeElement?.textContent).toBe("Practice");
    expect(screen.getByRole("heading", { name: "By topic" })).toBeTruthy();
  });

  it("feedback at the end (Check ride): a choice moves straight on, with no marking and no score", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Check ride/ }));
    expect(screen.getByText("Question 1 of 40")).toBeTruthy();
    expect(screen.queryByText(/^Score/)).toBeNull();
    const q = current();
    if (q.kind === "choice") await fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    else await fireEvent.click(screen.getByRole("button", { name: "Check order" }));
    expect(screen.getByText("Question 2 of 40")).toBeTruthy();
    expect(screen.queryByText("Your answer")).toBeNull();
  });

  it("an order question: the arrows move a step, Check order marks each step, and the right order counts", async () => {
    const seed = seeds(pack, index).find((q) => q.kind === "order" && q.topic === "order");
    if (!seed) throw new Error("no order question");
    const q = dealOne(seed, random(5));
    if (q.kind !== "order") throw new Error("order expected");
    visit.test = {
      title: "Custom test",
      custom: true,
      topics: ["order"],
      stages: [],
      allStages: true,
      count: 1,
      feedback: "each",
      questions: [q],
      answers: [null],
      at: 0,
      started: Date.now(),
      ended: null,
    };
    render(PracticePage, base);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Put these .* steps in order$/);
    expect(screen.getByRole("list", { name: "Steps, in your order" })).toBeTruthy();
    // Put it right with the arrows: move each step up to its place.
    for (let want = 0; want < q.items.length; want++) {
      const rows = screen.getAllByRole("listitem");
      const at = rows.findIndex((r) => r.querySelector(".o-text")?.textContent === q.items[want]);
      for (let i = at; i > want; i--)
        await fireEvent.click(screen.getByRole("button", { name: `Move ${q.items[want]} up` }));
    }
    await fireEvent.click(screen.getByRole("button", { name: "Check order" }));
    expect(screen.getByRole("list", { name: "The correct order" })).toBeTruthy();
    expect(screen.getAllByText("In place")).toHaveLength(q.items.length);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/^Score/).textContent).toBe("Score 1 of 1");
  });

  it("an order question with Space: picks a step up, the arrow keys move it, a wrong order is marked step by step", async () => {
    const seed = seeds(pack, index).find((q) => q.kind === "order" && q.topic === "order");
    if (!seed) throw new Error("no order question");
    const q = { ...dealOne(seed, random(5)), shown: (seed as { items: string[] }).items.map((_, i) => i) };
    if (q.kind !== "order") throw new Error("order expected");
    visit.test = {
      title: "Custom test",
      custom: true,
      topics: ["order"],
      stages: [],
      allStages: true,
      count: 1,
      feedback: "each",
      questions: [q],
      answers: [null],
      at: 0,
      started: Date.now(),
      ended: null,
    };
    render(PracticePage, base);
    // Space on a row's ↓ button is the button's, not a pick-up (review).
    const down = screen.getByRole("button", { name: `Move ${q.items[0]} down` });
    await fireEvent.keyDown(down, { key: " " });
    expect(screen.getAllByRole("listitem")[0]?.classList.contains("grabbed")).toBe(false);
    const first = screen.getAllByRole("listitem")[0] as HTMLElement;
    await fireEvent.keyDown(first, { key: " " });
    await fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getAllByRole("listitem")[1]?.querySelector(".o-text")?.textContent).toBe(q.items[0]);
    await fireEvent.click(screen.getByRole("button", { name: "Check order" }));
    expect(screen.getAllByText(/^You had it/)).toHaveLength(2);
    expect(within(screen.getByRole("status")).getByText("Not this order")).toBeTruthy();
  });

  it("End test shows the results for the questions answered; Retry the missed and Earlier this visit", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Lights of the flight deck/ }));
    for (let n = 0; n < 3; n++) {
      const q = current();
      if (q.kind !== "choice") throw new Error("choice expected");
      await fireEvent.click(
        screen.getAllByRole("radio")[n === 0 ? q.answer : (q.answer + 1) % 4] as HTMLElement,
      );
      await fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    }
    await fireEvent.click(screen.getByRole("button", { name: "End test" }));
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByText(/^Light meanings · Every stage · /)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "By topic" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Missed · 2" })).toBeTruthy();
    expect(screen.getAllByText(/^Your answer:/)).toHaveLength(2);
    await fireEvent.click(screen.getByRole("button", { name: "New test" }));
    expect(screen.getByText(/Earlier this visit:/).textContent).toMatch(/Lights of the flight deck, 1 of 3/);
    await fireEvent.click(screen.getByRole("button", { name: /^Retry the 2 missed/ }));
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  });

  it("a feedback link to a step opens it in the checklist", async () => {
    render(PracticePage, base);
    await fireEvent.click(screen.getByRole("button", { name: /^Before engine start/ }));
    let guard = 0;
    while (guard++ < 20) {
      const q = current();
      if (q.kind === "choice" && q.links.some((l) => l.step)) {
        await fireEvent.click(screen.getAllByRole("radio")[(q.answer + 1) % 4] as HTMLElement);
        const link = within(screen.getByRole("status"))
          .getAllByRole("link")
          .find((a) => a.getAttribute("href")?.startsWith("#/phase/"));
        await fireEvent.click(link as HTMLElement);
        expect(steps.length).toBe(1);
        return;
      }
      if (q.kind === "choice") await fireEvent.keyDown(document.body, { key: "1" });
      else await fireEvent.click(screen.getByRole("button", { name: "Check order" }));
      await fireEvent.keyDown(document.body, { key: "Enter" });
    }
  });

  it("phone (PracticeQuestionPhone): the back icon, End, and the phone sub-line", async () => {
    width(390);
    render(PracticePage, base);
    expect(screen.getByRole("link", { name: "Back to checklist" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /every item, in order/ }));
    expect(screen.getByText("Memory items · 10 questions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "End" })).toBeTruthy();
  });
});
