// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Message, Rail, RailPhase } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import Find from "./Find.svelte";
import type { FindIndex } from "./find-index";

afterEach(cleanup);

const phase = (id: string, title: string): RailPhase => ({
  id,
  title,
  progress: { done: 0, skipped: 0, toDo: 1, total: 1 },
  complete: false,
  open: 0,
  skipped: 0,
});
const rail: Rail = {
  stages: [{ id: "alpha", title: "Alpha", phases: [phase("p1", "First"), phase("p2", "Second")] }],
  reference: [],
};
/** Invented: five matching steps, four controls, one term matched by its definition. */
const find: FindIndex = {
  reference: "Emergency",
  steps: [
    { id: "s1", title: "Widget pump", value: "ON", phase: "p1" },
    { id: "s2", title: "Widget valve", value: "OPEN", phase: "p1" },
    { id: "s3", title: "Lamp test", value: "WIDGET LIGHT ON", phase: "p2" },
    { id: "s4", title: "Widget heat", value: "AUTO", phase: "p2" },
    { id: "s5", title: "Widget lever", value: "UP", phase: "p2" },
    { id: "s6", title: "Other", value: "OFF", phase: "p2" },
  ],
  controls: ["A", "B", "C", "D"].map((n) => ({
    id: `c${n}`,
    name: `Widget switch ${n}`,
    where: "Overhead · Widget panel",
    location: "Overhead, widget row.",
    at: { section: "w", item: 0 },
    // Switch D is used by no step on this flight: it opens in place.
    usedBy: n === "D" ? [] : [{ step: "s1", phase: "p1", at: { section: "w", item: 0 } }],
    step: null,
  })),
  terms: [
    {
      term: "Gizmo box",
      meaning: "A part of the widget system, explained at length so it can be opened in place.",
    },
  ],
};
const base = {
  find,
  rail,
  done: { s2: 1 },
  current: "s1",
  onStep: () => {},
  onControl: () => {},
  onClose: () => {},
  examples: ["Widget panel", "Gizmo", "MCP"],
};
/** Invented alert messages: four match "widget" (two by their meaning), one does not. */
const messages = [
  { id: "m1", text: "WIDGET FAIL", level: "warning", meaning: "The widget has failed." },
  { id: "m2", text: "PUMP LOW", level: "caution", meaning: "The widget pump pressure is low." },
  { id: "m3", text: "WIDGET HOT", level: "advisory", meaning: "Too warm." },
  { id: "m4", text: "GIZMO", level: "memo", meaning: "The widget gizmo is on." },
  { id: "m5", text: "DOOR", level: "status", meaning: "A door is open." },
] as Message[];

describe("Find", () => {
  it("marks the match in a step's value and a term's definition too", async () => {
    render(Find, base);
    const field = screen.getByRole("combobox", { name: "Find a step, control or term" });
    await fireEvent.input(field, { target: { value: "light" } });
    expect([...document.querySelectorAll(".val mark")].map((m) => m.textContent)).toEqual(["LIGHT"]);
    await fireEvent.input(field, { target: { value: "explained" } });
    expect(document.querySelector(".mean mark")?.textContent).toBe("explained");
  });

  it("before typing: the help line and the Try chips; a chip fills the field (FindDeskStart)", async () => {
    render(Find, base);
    const field = screen.getByRole("combobox", { name: "Find a step, control or term" });
    expect(document.activeElement).toBe(field);
    expect(screen.getByText(/^Search every step, control and term/)).toBeTruthy();
    // The chips are the pack's examples.
    expect([...document.querySelectorAll(".chips button")].map((b) => b.textContent)).toEqual(base.examples);
    await fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    expect((field as HTMLInputElement).value).toBe("MCP");
  });

  it("shows Steps, Controls and Terms with their counts, three each and Show all (FindDesk)", async () => {
    render(Find, base);
    await fireEvent.input(screen.getByRole("combobox"), { target: { value: "widget" } });
    const heads = [...document.querySelectorAll(".head")].map((h) => h.textContent);
    expect(heads).toEqual(["Steps5", "Controls4", "Terms1"]);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3 + 3 + 1);
    // Title matches first; the current step says so; the matched text is marked.
    expect(options[0]?.textContent).toContain("Current");
    expect(options[0]?.querySelector("mark")?.textContent).toBe("Widget");
    expect(within(options[0] as HTMLElement).getByText("Alpha › First")).toBeTruthy();
    expect(within(options[1] as HTMLElement).getByRole("img", { name: "Done" })).toBeTruthy();
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    await fireEvent.click(screen.getByRole("button", { name: "Show all 5 steps" }));
    expect(screen.getAllByRole("option")).toHaveLength(5 + 3 + 1);
    expect(screen.getByRole("button", { name: "Show all 4 controls" })).toBeTruthy();
  });

  it("moves with ↑ and ↓ and opens with Enter: a step, a control, a term in the Glossary", async () => {
    const calls: string[] = [];
    render(Find, {
      ...base,
      onStep: (id: string) => calls.push(`step ${id}`),
      onControl: (c: { id: string }) => calls.push(`control ${c.id}`),
      onTerm: (term: string) => calls.push(`term ${term}`),
    });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "widget" } });
    await fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "Widget valve",
    );
    await fireEvent.keyDown(field, { key: "Enter" });
    for (let i = 0; i < 2; i++) await fireEvent.keyDown(field, { key: "ArrowDown" });
    await fireEvent.keyDown(field, { key: "Enter" });
    expect(calls).toEqual(["step s2", "control cA"]);
    await fireEvent.click(screen.getByRole("option", { name: /Gizmo box/ }));
    expect(calls).toEqual(["step s2", "control cA", "term Gizmo box"]);
    // And with Enter, the term the active result.
    await fireEvent.input(field, { target: { value: "gizmo" } });
    await fireEvent.keyDown(field, { key: "Enter" });
    expect(calls.at(-1)).toBe("term Gizmo box");
  });

  it("says nothing matches, and closes on Esc and the scrim (FindDeskNone)", async () => {
    let closed = 0;
    render(Find, { ...base, onClose: () => closed++ });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "trimm" } });
    expect(screen.getByRole("status").textContent).toContain("Nothing matches “trimm”");
    // The hint names the pack's first two examples.
    expect(document.querySelector(".none .help")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Find looks through every step, control and term for this aircraft. Check the spelling, or try a panel or control name, like Widget panel or Gizmo.",
    );
    await fireEvent.keyDown(field, { key: "Escape" });
    await fireEvent.click(document.querySelector(".scrim") as HTMLElement);
    await fireEvent.click(screen.getByRole("button", { name: "Close Find" }));
    expect(closed).toBe(3);
  });

  it("keeps the keys in Find after Show all, the same result active, and opens an unused control in place", async () => {
    const calls: string[] = [];
    render(Find, { ...base, onControl: (c: { id: string }) => calls.push(c.id) });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "widget" } });
    for (let i = 0; i < 3; i++) await fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "Widget switch A",
    );
    await fireEvent.click(screen.getByRole("button", { name: "Show all 5 steps" }));
    expect(document.activeElement).toBe(field);
    expect(document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "Widget switch A",
    );
    // Keys pressed with focus elsewhere still move in Find (on the window).
    (document.activeElement as HTMLElement).blur();
    await fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.textContent).toContain(
      "Widget switch B",
    );
    await fireEvent.click(screen.getByRole("button", { name: "Show all 4 controls" }));
    const d = screen.getByRole("option", { name: /Widget switch D/ });
    await fireEvent.click(d);
    expect(calls).toEqual([]);
    expect(d.textContent).toContain("Overhead, widget row.");
    // Every result id is a valid id (terms have spaces).
    for (const o of screen.getAllByRole("option")) expect(o.id).toMatch(/^find-r-\d+$/);
    expect(screen.getByRole("status").textContent).toBe("5 steps, 4 controls, 1 term");
  });

  it("shows the pack's alert messages after Steps: marked, with their levels, in the arrow keys, opening the message (FindMsgDesk)", async () => {
    const calls: string[] = [];
    render(Find, { ...base, messages, onMessage: (id: string) => calls.push(`message ${id}`) });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "widget" } });
    expect([...document.querySelectorAll(".head")].map((h) => h.textContent)).toEqual([
      "Steps5",
      "Alert messages4",
      "Controls4",
      "Terms1",
    ]);
    const group = screen.getByRole("listbox", { name: /Alert messages/ });
    const rows = within(group).getAllByRole("option");
    expect(rows).toHaveLength(3);
    // The message as on the alert display, its level badge, its meaning; the match marked in both.
    expect(rows[0]?.querySelector(".msg.warning mark")?.textContent).toBe("WIDGET");
    expect(rows[0]?.querySelector(".badge.warning")?.textContent).toBe("Warning");
    expect(rows[1]?.querySelector(".sub mark")?.textContent).toBe("widget");
    expect(rows[1]?.querySelector(".msg")?.textContent).toBe("PUMP LOW");
    await fireEvent.click(screen.getByRole("button", { name: "Show all 4 alert messages" }));
    expect(within(group).getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("status").textContent).toBe("5 steps, 4 alert messages, 4 controls, 1 term");
    // ↓ past the three steps reaches the first message; Enter opens it.
    for (let i = 0; i < 3; i++) await fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.getAttribute("aria-activedescendant")).toBe(rows[0]?.id);
    await fireEvent.keyDown(field, { key: "Enter" });
    await fireEvent.click(rows[2] as HTMLElement);
    expect(calls).toEqual(["message m1", "message m3"]);
  });

  it("shows no Alert messages section when nothing matches or the pack has none", async () => {
    render(Find, { ...base, messages });
    await fireEvent.input(screen.getByRole("combobox"), { target: { value: "lamp" } });
    expect(screen.queryByRole("listbox", { name: /Alert messages/ })).toBeNull();
    cleanup();
    render(Find, base);
    await fireEvent.input(screen.getByRole("combobox"), { target: { value: "widget" } });
    expect([...document.querySelectorAll(".head")].map((h) => h.textContent)).toEqual([
      "Steps5",
      "Controls4",
      "Terms1",
    ]);
  });
});

describe("Find's message rows", () => {
  it("keep the spaces around a marked match, in the message and its meaning", async () => {
    const one = [
      { id: "m", text: "ENGINE FIRE L", level: "warning", meaning: "Fire is detected." },
    ] as Message[];
    render(Find, { ...base, messages: one });
    await fireEvent.input(screen.getByRole("combobox"), { target: { value: "fire" } });
    const row = screen.getByRole("listbox", { name: /Alert messages/ });
    // The text and its mark sit in one span, so the box's flex layout cannot drop the spaces.
    expect(row.querySelector(".msg > span > mark")?.textContent).toBe("FIRE");
    expect(row.querySelector(".msg > mark")).toBeNull();
    expect(row.querySelector(".msg")?.textContent).toBe("ENGINE FIRE L");
    expect(row.querySelector(".meaning")?.textContent).toBe("Fire is detected.");
  });
});
