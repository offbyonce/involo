// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Start page from the pack (decision 0029): each option asked there in its style, the
// panel-state picker in the pack's words, in the pack's order.

import { readFileSync } from "node:fs";
import type { Flight, PanelState, UserOption } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { appLabels, iflyPack } from "../test-pack";
import StartView from "./StartView.svelte";

afterEach(cleanup);

const flight = (options: Record<string, string> = {}) => ({ options, panelState: null }) as unknown as Flight;

describe("the Start page", () => {
  it("with the iFly pack: the same choices, text and order as before", async () => {
    const pack = iflyPack();
    const calls: [string, string][] = [];
    const { container } = render(StartView, {
      flight: flight(),
      options: pack.content.phases?.options ?? [],
      states: pack.content.panelStates?.states ?? [],
      labels: pack.content.labels.panelStates,
      order: pack.content.phases?.startPage ?? [],
      onOption: (o: string, v: string) => calls.push([o, v]),
      onPanelState: () => {},
    });
    const titles = [...container.querySelectorAll(".card .t")].map((t) => t.textContent);
    expect(titles).toEqual(["Exterior inspection", "Power source", "iFly panel state", "Turnaround"]);
    expect(container.textContent).toContain("18 numbered stops on a diagram");
    expect(screen.getByRole("link", { name: "Preview the inspection" }).getAttribute("href")).toBe(
      "#/phase/exterior",
    );
    expect(screen.getByRole("switch", { name: "Exterior inspection" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("switch", { name: "Turnaround" }).getAttribute("aria-checked")).toBe("false");
    const power = screen.getByRole("group", { name: "Power source" });
    expect(
      within(power)
        .getAllByRole("button")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["Ground power at the gate", "No ground power"]);
    await fireEvent.click(screen.getByRole("switch", { name: "Turnaround" }));
    await fireEvent.click(screen.getByRole("switch", { name: "Exterior inspection" }));
    expect(calls).toEqual([
      ["start", "turn"],
      ["exterior", "off"],
    ]);
  });

  it("shows a test pack's own options, styles and words, and no picker without panel states", () => {
    // Invented: a glider's start, by winch or aerotow (cards), and a two-value toggle.
    const options = [
      {
        id: "launch",
        title: "Launch",
        values: ["winch", "aerotow"],
        default: "winch",
        choices: [
          { value: "winch", label: "Winch" },
          { value: "aerotow", label: "Aerotow" },
        ],
        askIn: ["start"],
        start: { style: "cards", description: "How you get airborne." },
      },
      {
        id: "water",
        title: "Water ballast",
        values: ["dry", "full"],
        default: "dry",
        askIn: ["start"],
        start: { style: "toggle", on: "full", title: "Carry water" },
      },
    ] as unknown as UserOption[];
    const calls: [string, string][] = [];
    const labels = { ...appLabels().panelStates, title: "Saved setups" };
    const { container } = render(StartView, {
      flight: flight(),
      options,
      states: [] as PanelState[],
      labels,
      onOption: (o: string, v: string) => calls.push([o, v]),
      onPanelState: () => {},
    });
    expect([...container.querySelectorAll(".card .t")].map((t) => t.textContent)).toEqual([
      "Launch",
      "Carry water",
    ]);
    expect(screen.getByText("How you get airborne.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Launch" })).toBeTruthy();
    expect(screen.queryByText("Saved setups")).toBeNull();
    expect(screen.queryByLabelText("Panel state")).toBeNull();
    screen.getByRole("switch", { name: "Carry water" }).click();
    expect(calls).toEqual([["water", "full"]]);
    cleanup();
    // With panel states, the picker shows the pack's words.
    render(StartView, {
      flight: flight(),
      options,
      states: [{ id: "a", title: "Ready", description: "", phase: "p", done: [] }] as unknown as PanelState[],
      labels,
      onOption: () => {},
      onPanelState: () => {},
    });
    expect(screen.getByText("Saved setups")).toBeTruthy();
  });

  it("shows the chosen panel state's description under the picker, and nothing before (StateNote)", () => {
    const states = [
      {
        id: "gpu",
        title: "GPU Connected",
        description: "The ground power cart is connected.",
        phase: "p",
        done: [],
      },
      { id: "bare", title: "Bare", description: "", phase: "p", done: [] },
    ] as unknown as PanelState[];
    const show = (panelState: string | null) => {
      cleanup();
      const { container } = render(StartView, {
        flight: { options: {}, panelState } as unknown as Flight,
        options: [] as UserOption[],
        states,
        labels: appLabels().panelStates,
        onOption: () => {},
        onPanelState: () => {},
      });
      return container.querySelector(".pick .state-note")?.textContent ?? null;
    };
    // "Choose a panel state": nothing under the picker.
    expect(show(null)).toBeNull();
    expect(show("gpu")).toBe("The ground power cart is connected.");
    // A state without a description shows nothing, not an empty line.
    expect(show("bare")).toBeNull();
  });

  it("holds no option id, option value, phase id or the word iFly", () => {
    const text = readFileSync(`${import.meta.dirname}/StartView.svelte`, "utf8");
    expect(text).not.toMatch(/iFly|"exterior"|"power"|"start"\)|"off"|"turn"|"cold"|phaseHref\("/);
  });
});
