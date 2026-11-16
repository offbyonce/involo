// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { openSteps } from "./open-steps.svelte";
import ProgressRow from "./ProgressRow.svelte";

afterEach(() => {
  cleanup();
  openSteps.shown = false;
});

describe("ProgressRow", () => {
  it('shows the phase\'s count and opens the open-steps sheet from "2 open" (Mobile board)', async () => {
    render(ProgressRow, { progress: { done: 5, skipped: 1, toDo: 4, total: 10 }, open: 2 });
    expect(screen.getByText("5/10")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "2 open" }));
    expect(openSteps.shown).toBe(true);
  });

  it("says nothing about open steps when there are none", () => {
    render(ProgressRow, { progress: { done: 0, skipped: 0, toDo: 3, total: 3 }, open: 0 });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
