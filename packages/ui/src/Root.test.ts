// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Root from "./Root.svelte";
import { mounts } from "./test-stubs/CountingApp.svelte";

vi.mock("./App.svelte", async () => ({ default: (await import("./test-stubs/CountingApp.svelte")).default }));

describe("Root", () => {
  it("starts the app again from the start screen when the current pack changes", async () => {
    window.location.hash = "#/packs";
    render(Root);
    await fireEvent.click(screen.getByRole("button", { name: "Mount 1" }));
    // A fresh app: nothing of the pack that was open stays, and it opens at the start.
    expect(await screen.findByRole("button", { name: "Mount 2" })).toBeTruthy();
    expect(mounts.count).toBe(2);
    expect(window.location.hash).toBe("");
  });
});
