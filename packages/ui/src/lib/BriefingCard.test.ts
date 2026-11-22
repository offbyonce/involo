// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Briefing, BriefingMark } from "@involo/bindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import BriefingCard from "./BriefingCard.svelte";

afterEach(cleanup);

// An invented briefing, in the pack's shape.
const briefing: Briefing = {
  id: "departure",
  title: "Departure briefing",
  mnemonic: "RW",
  phase: "before-start",
  items: [
    { id: "departure.runway", lead: "R", rest: "UNWAY", detail: "Which runway and which intersection." },
    { id: "departure.weather", lead: "W", rest: "EATHER" },
  ],
};

function card(mark: BriefingMark | undefined) {
  const calls: string[] = [];
  render(BriefingCard, {
    briefing,
    mark,
    onBrief: () => calls.push("brief"),
    onSkip: () => calls.push("skip"),
    onUnmark: () => calls.push("unmark"),
  });
  return calls;
}

const at = new Date(2026, 10, 21, 10, 42).getTime();
const time = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

describe("BriefingCard (Briefings boards)", () => {
  it("to give: the title, the mnemonic, each line with its lead letters and detail, Briefed and Skip briefing", async () => {
    const calls = card(undefined);
    const section = screen.getByRole("region", { name: "Departure briefing" });
    expect(section.querySelector(".mn")?.textContent).toBe("Mnemonic RW");
    expect(section.querySelector(".count")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Briefing · 2 lines",
    );
    const words = [...section.querySelectorAll(".word")];
    expect(words.map((w) => w.textContent)).toEqual(["RUNWAY", "WEATHER"]);
    expect(words.map((w) => w.querySelector("b")?.textContent)).toEqual(["R", "W"]);
    // A line without a detail has none, and no empty line under it.
    expect([...section.querySelectorAll(".detail")].map((d) => d.textContent)).toEqual([
      "Which runway and which intersection.",
    ]);
    expect(screen.getByText("Say each line out loud.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Briefed" }));
    await fireEvent.click(screen.getByRole("button", { name: "Skip briefing" }));
    expect(calls).toEqual(["brief", "skip"]);
  });

  it("briefed: one line with the time; Show opens it to read, with Mark not briefed and Hide", async () => {
    const calls = card({ state: "briefed", at });
    expect(screen.queryByRole("region")).toBeNull();
    const line = document.querySelector(".briefed-row");
    expect(line?.querySelector('[aria-hidden="true"].status.done')).toBeTruthy();
    expect(line?.querySelector(".t")?.textContent).toBe("Departure briefing");
    expect(line?.querySelector(".when")?.textContent).toBe(`briefed at ${time}`);
    const show = screen.getByRole("button", { name: "Show the Departure briefing briefing" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(show);
    const section = screen.getByRole("region", { name: "Departure briefing" });
    expect(section.querySelector(".count")?.textContent?.trim()).toBe(`Briefed at ${time}`);
    // Read-only: no Briefed or Skip briefing, only the way back to give.
    expect(screen.queryByRole("button", { name: "Briefed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip briefing" })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /^Show/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Mark not briefed" }));
    expect(calls).toEqual(["unmark"]);
  });

  it("skipped: one line with the Skipped tag; Brief it now opens the card to give", async () => {
    const calls = card({ state: "skipped", at });
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.querySelector(".skipped-row .tag")?.textContent).toBe("Skipped");
    await fireEvent.click(screen.getByRole("button", { name: "Brief it now" }));
    screen.getByRole("region", { name: "Departure briefing" });
    // Already skipped, so only Briefed to give it.
    expect(screen.queryByRole("button", { name: "Skip briefing" })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Briefed" }));
    expect(calls).toEqual(["brief"]);
  });
});
