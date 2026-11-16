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

  it("hides the items whose page does not exist yet, and their empty groups", () => {
    render(Drawer, base);
    for (const name of [
      "Practice",
      "How procedures work",
      "Flight deck",
      "Glossary",
      "References",
      "Flight log",
      "Take the tour",
    ]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByText("Learn")).toBeNull();
    expect(screen.queryByText("Reference")).toBeNull();
    expect(screen.getByText("This flight and the app")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("#/settings");
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
});
