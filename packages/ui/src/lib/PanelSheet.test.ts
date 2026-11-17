// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import PanelSheet from "./PanelSheet.svelte";

afterEach(cleanup);
const children = createRawSnippet(() => ({ render: () => "<p>Drawing</p>" }));

describe("PanelSheet", () => {
  it("has the standard sheet head: the panel's name and the × close, not a Close text button", async () => {
    render(PanelSheet, { caption: "Fuel panel", children });
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    dialog.setAttribute("open", "");
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.textContent?.trim()).toBe("");
    expect(close.querySelector("svg")).toBeTruthy();
    dialog.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    await fireEvent.click(close);
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});
