// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Rail, RailPhase } from "@involo/bindings";
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
  stages: [{ title: "Alpha", phases: [phase("p1", "First"), phase("p2", "Second")] }],
  reference: [],
};
/** Invented: five matching steps, four controls, one term matched by its definition. */
const find: FindIndex = {
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
    at: { section: "w", item: 0 },
    step: "s1",
  })),
  terms: [
    {
      term: "Gizmo",
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
};

describe("Find", () => {
  it("before typing: the help line and the Try chips; a chip fills the field (FindDeskStart)", async () => {
    render(Find, base);
    const field = screen.getByRole("combobox", { name: "Find a step, control or term" });
    expect(document.activeElement).toBe(field);
    expect(screen.getByText(/^Search every step, control and term/)).toBeTruthy();
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

  it("moves with ↑ and ↓ and opens with Enter: a step, a control, a term in place", async () => {
    const calls: string[] = [];
    render(Find, {
      ...base,
      onStep: (id: string) => calls.push(`step ${id}`),
      onControl: (c: { id: string }) => calls.push(`control ${c.id}`),
    });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "widget" } });
    await fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.getAttribute("aria-activedescendant")).toBe("find-s-s2");
    await fireEvent.keyDown(field, { key: "Enter" });
    for (let i = 0; i < 2; i++) await fireEvent.keyDown(field, { key: "ArrowDown" });
    await fireEvent.keyDown(field, { key: "Enter" });
    expect(calls).toEqual(["step s2", "control cA"]);
    const term = screen.getByRole("option", { name: /Gizmo/ });
    await fireEvent.click(term);
    expect(term.classList.contains("opened")).toBe(true);
  });

  it("says nothing matches, and closes on Esc and the scrim (FindDeskNone)", async () => {
    let closed = 0;
    render(Find, { ...base, onClose: () => closed++ });
    const field = screen.getByRole("combobox");
    await fireEvent.input(field, { target: { value: "trimm" } });
    expect(screen.getByRole("status").textContent).toContain("Nothing matches “trimm”");
    await fireEvent.keyDown(field, { key: "Escape" });
    await fireEvent.click(document.querySelector(".scrim") as HTMLElement);
    await fireEvent.click(screen.getByRole("button", { name: "Close Find" }));
    expect(closed).toBe(3);
  });
});
