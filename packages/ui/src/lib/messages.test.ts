// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Alert messages (Alert messages boards), from the invented Airbus-style example pack: the Flight deck page's
// tab, the list and its details, the step's and the list's rows, and nothing of it for a pack
// without messages (the iFly pack).

import type { Detail, FlatPack, Flight, PhaseList } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexPack } from "../pack-index";
import FlightDeckPage from "../pages/FlightDeckPage.svelte";
import { iflyPack, sidestickPack } from "../test-pack";
import ListCard from "./ListCard.svelte";
import MessagesView from "./MessagesView.svelte";
import StepPane from "./StepPane.svelte";

const example = indexPack(sidestickPack());
const ifly = indexPack(iflyPack());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = "";
});
const width = (w: number) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: w >= Number(/(\d+)px/.exec(q)?.[1] ?? 0),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
const deck = (index = example, more = {}) => ({
  index,
  area: null,
  zone: null,
  backHref: "#/",
  onStep: () => {},
  ...more,
});

describe("the Alert messages tab", () => {
  it("lists every message with its level and meaning, the selected one's details beside", () => {
    render(MessagesView, { index: example, selected: "smoke-cabin", onStep: () => {} });
    const rows = document.querySelectorAll(".row");
    expect([...rows].map((r) => r.querySelector(".msg")?.textContent)).toEqual([
      "SMOKE CABIN",
      "ENG FIRE",
      "FUEL PUMP FAULT",
      "A/THR OFF",
      "SEAT BELTS",
      "RADAR INOP",
    ]);
    const smoke = rows[0] as HTMLElement;
    expect(smoke.getAttribute("aria-current")).toBe("true");
    expect(within(smoke).getByText("Warning").classList.contains("warning")).toBe(true);
    expect(within(smoke).getByText("Smoke is detected in the cabin.")).toBeTruthy();
    const details = screen.getByRole("complementary", { name: "Message details" });
    expect(within(details).getByText("As shown on the alert display")).toBeTruthy();
    expect(within(details).getByRole("button", { name: /Smoke in the cabin/ })).toBeTruthy();
    expect(within(details).getByText("Smoke in the cabin · Step 1, Oxygen masks")).toBeTruthy();
  });

  it("a linked message opens its list; one without a list says why none is needed", async () => {
    const opened: string[] = [];
    render(MessagesView, {
      index: example,
      selected: "smoke-cabin",
      onStep: (id: string) => opened.push(id),
    });
    await fireEvent.click(screen.getByRole("button", { name: /Smoke in the cabin/ }));
    expect(opened).toEqual(["example-sidestick.smoke.masks"]);
    cleanup();
    render(MessagesView, { index: example, selected: "seat-belts", onStep: () => {} });
    const details = screen.getByRole("complementary", { name: "Message details" });
    expect(within(details).getByText("A reminder only; nothing to do.")).toBeTruthy();
    expect(within(details).getByText("No steps mention it.")).toBeTruthy();
  });

  it("has a filter for each level the pack uses, after All, with counts", async () => {
    // A pack using only warning and memo has those two filters.
    const pack = structuredClone(sidestickPack()) as FlatPack;
    const messages = pack.content.messages?.messages ?? [];
    if (pack.content.messages)
      pack.content.messages.messages = messages.filter((m) => m.level === "warning" || m.level === "memo");
    render(MessagesView, { index: indexPack(pack), selected: null, onStep: () => {} });
    const filters = screen.getByRole("group", { name: "Show messages by level" });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((b) => b.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual(["All 3", "Warning 2", "Memo 1"]);
    await fireEvent.click(within(filters).getByRole("button", { name: /Memo/ }));
    expect([...document.querySelectorAll(".row .msg")].map((m) => m.textContent)).toEqual(["SEAT BELTS"]);
  });

  it("finds a message by its text or what it means", async () => {
    render(MessagesView, { index: example, selected: null, onStep: () => {} });
    await fireEvent.input(screen.getByPlaceholderText("Message text or meaning"), {
      target: { value: "radar" },
    });
    expect([...document.querySelectorAll(".row .msg")].map((m) => m.textContent)).toEqual(["RADAR INOP"]);
    await fireEvent.input(screen.getByPlaceholderText("Message text or meaning"), {
      target: { value: "pressure" },
    });
    expect([...document.querySelectorAll(".row .msg")].map((m) => m.textContent)).toEqual([
      "FUEL PUMP FAULT",
    ]);
  });

  it("on a phone, a tapped message opens in place", () => {
    render(MessagesView, { index: example, selected: "eng-fire", phone: true, onStep: () => {} });
    const open = screen.getByRole("button", { expanded: true });
    expect(open.textContent).toContain("ENG FIRE");
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(5);
    expect(screen.getByText("Mentioned in 1 step")).toBeTruthy();
  });
});

describe("the Flight deck page", () => {
  it("with messages: the Panels and lights | Alert messages control, at every size", () => {
    for (const w of [1440, 900, 390]) {
      width(w);
      render(FlightDeckPage, deck());
      const tabs = screen.getByRole("group", { name: "Show" });
      expect(
        within(tabs)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Panels and lights", "Alert messages"]);
      cleanup();
    }
    width(1440);
    render(FlightDeckPage, deck(example, { messages: true, message: "fuel-pump-fault" }));
    expect(screen.getByText("Every area, panel, light and alert message")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alert messages" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Name every panel")).toBeNull();
  });

  it("a pack with no messages shows no tab and its header as before", () => {
    for (const w of [1440, 900, 390]) {
      width(w);
      render(FlightDeckPage, deck(ifly));
      expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
      expect(screen.queryByText(/Alert messages/)).toBeNull();
      cleanup();
    }
    width(1440);
    render(FlightDeckPage, deck(ifly));
    expect(screen.getByText("Every area, panel and light")).toBeTruthy();
  });
});

describe("rows linking messages and steps", () => {
  it("a step a message calls for shows the message, linking to it; others show none", () => {
    const masks = example.step("example-sidestick.smoke.masks");
    if (!masks) throw new Error("masks");
    render(StepPane, { index: example, step: masks, targets: [], number: 1, total: 2, onOpen: () => {} });
    const row = screen.getByRole("link", { name: /The message that calls for this step/ });
    expect(row.getAttribute("href")).toBe("#/messages/smoke-cabin");
    expect(row.textContent).toContain("SMOKE CABIN");
    cleanup();
    const ifStep = ifly.step("ifly-737-max8.before-start.fuel-pump-switches");
    if (!ifStep) throw new Error("fuel");
    render(StepPane, { index: ifly, step: ifStep, targets: [], number: 1, total: 2, onOpen: () => {} });
    expect(screen.queryByText("The message that calls for this step")).toBeNull();
  });

  it("a list a message calls for opens with Called for by, linking to what it means", () => {
    const list = {
      id: "smoke",
      title: "Smoke in the cabin",
      progress: { done: 0, total: 2, skipped: 0 },
      steps: [],
      current: null,
    } as unknown as PhaseList;
    const props = {
      index: example,
      list,
      source: undefined,
      flight: { blanks: {}, values: {} } as unknown as Flight,
      detail: "full" as unknown as Detail,
      selected: null,
      onTick: () => {},
      onSkip: () => {},
      onUnskip: () => {},
      onBlank: () => {},
      onSelect: () => {},
      onClear: () => {},
    };
    render(ListCard, props);
    expect(screen.getByText("Called for by")).toBeTruthy();
    expect(screen.getByRole("link", { name: /What it means/ }).getAttribute("href")).toBe(
      "#/messages/smoke-cabin",
    );
    cleanup();
    render(ListCard, { ...props, list: { ...list, id: "cockpit-prep", title: "Cockpit preparation" } });
    expect(screen.queryByText("Called for by")).toBeNull();
  });
});
