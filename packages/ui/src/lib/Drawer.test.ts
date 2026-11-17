// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import Drawer from "./Drawer.svelte";

afterEach(cleanup);

const base = {
  open: true,
  aircraft: "Test Jet",
  savedAt: null,
  total: { done: 41, skipped: 0, toDo: 325, total: 366 },
  view: "checklist" as const,
  detail: "expanded" as const,
  essentials: false,
  onView: () => {},
  onDetail: () => {},
  onEssentials: () => {},
  onReset: () => {},
  onClose: () => {},
};

describe("Drawer", () => {
  it("shows the logo and the sub-line, the saved time only once this visit has saved (Menu, Tablet, Mobile boards)", () => {
    const { container, rerender } = render(Drawer, base);
    expect(container.querySelector(".name")?.textContent?.trim()).toBe("involo");
    expect(container.querySelector(".mark svg")).toBeTruthy();
    // The count shows on tablet only (CSS); the saved time is left out before the first save.
    expect(container.querySelector(".who small")?.textContent).toBe("Test Jet · 41/366");
    rerender({ ...base, savedAt: new Date(2026, 10, 15, 10, 14).getTime() });
    expect(container.querySelector(".who small")?.textContent).toBe("Test Jet · saved 10:14 · 41/366");
  });

  it("shows every item of the Menu boards, each going to its page (References was the last to come)", () => {
    const { container } = render(Drawer, base);
    // Take the tour is a button, not a link.
    expect(screen.queryByRole("link", { name: "Take the tour" })).toBeNull();
    expect(screen.getByText("Learn")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Practice" }).getAttribute("href")).toBe("#/practice");
    // How procedures work: after Practice under Learn, as the Menu boards place it.
    const learn = [...container.querySelectorAll(".group")].find(
      (g) => g.querySelector(".label")?.textContent === "Learn",
    );
    expect(
      [...(learn?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")]),
    ).toEqual([
      ["Practice", "#/practice"],
      ["How procedures work", "#/how"],
    ]);
    expect(screen.getByText("Reference")).toBeTruthy();
    // Reference: Flight deck, Glossary, then References (Menu, Tablet and Mobile boards).
    const reference = [...container.querySelectorAll(".group")].find(
      (g) => g.querySelector(".label")?.textContent === "Reference",
    );
    expect([...(reference?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
      "#/deck",
      "#/glossary",
      "#/references",
    ]);
    expect(screen.getByRole("link", { name: "References" }).getAttribute("href")).toBe("#/references");
    expect(screen.getByText("This flight and the app")).toBeTruthy();
    // Flight log first in its group, then Settings (Menu, Tablet and Mobile boards).
    const flight = [...container.querySelectorAll(".group")].find(
      (g) => g.querySelector(".label")?.textContent === "This flight and the app",
    );
    expect(
      [...(flight?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")]),
    ).toEqual([
      ["Flight log", "#/log"],
      ["Settings", "#/settings"],
    ]);
    // The old menu's items have their homes elsewhere now (owner, batch 5).
    expect(screen.queryByText(/Continue|Version/)).toBeNull();
  });

  it("changes the step settings and the view in place, and resets the flight plan", async () => {
    const calls: string[] = [];
    render(Drawer, {
      ...base,
      onView: (v) => calls.push(`view ${v}`),
      onDetail: (d) => calls.push(`detail ${d}`),
      onEssentials: (on) => calls.push(`essentials ${on}`),
      onReset: () => calls.push("reset"),
      onClose: () => calls.push("close"),
    });
    await fireEvent.click(screen.getByRole("button", { name: "Flow" }));
    await fireEvent.click(screen.getByRole("button", { name: "Essentials" }));
    await fireEvent.click(screen.getByRole("button", { name: "Simple" }));
    await fireEvent.click(screen.getByRole("button", { name: /Reset flight plan/ }));
    expect(calls).toEqual(["view flow", "essentials true", "detail quick", "close", "reset"]);
    expect(screen.getByRole("button", { name: "Full" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers Clear ticks for the ticked procedure above Reset flight plan, with its tick count (Tablet and Mobile boards)", async () => {
    const calls: string[] = [];
    const { rerender } = render(Drawer, {
      ...base,
      onClearTicks: () => calls.push("clear"),
      onClose: () => calls.push("close"),
    });
    expect(screen.queryByRole("button", { name: /^Clear ticks/ })).toBeNull();
    await rerender({
      ...base,
      clear: { title: "Before start procedure", ticks: 5 },
      onClearTicks: () => calls.push("clear"),
      onClose: () => calls.push("close"),
    });
    const clear = screen.getByRole("button", { name: /^Clear ticks/ });
    expect(clear.textContent).toContain("Before start procedure: 5 ticks. Undo right after.");
    expect(clear.textContent).toContain("Before start procedure · Undo right after");
    const buttons = screen.getAllByRole("button").map((b) => b.querySelector("b")?.textContent);
    expect(buttons.indexOf("Clear ticks")).toBe(buttons.indexOf("Reset flight plan") - 1);
    await fireEvent.click(clear);
    expect(calls).toEqual(["close", "clear"]);
  });

  it("folds 'Where is Flight setup?' and opens it to the Flight pages (Menu board, MenuWhere)", async () => {
    render(Drawer, base);
    const where = screen.getByRole("button", { name: /^Where is Flight setup\?/ });
    expect(where.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Open Flight ›" })).toBeNull();
    await fireEvent.click(where);
    expect(where.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/^Flight setup is now the Flight pages\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Flight ›" }).getAttribute("href")).toBe(
      "#/flight/overview",
    );
  });
});
