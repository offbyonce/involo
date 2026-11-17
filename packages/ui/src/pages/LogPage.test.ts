// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Log, LoggedFlight } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LOG_FILE_BYTES } from "../lib/file-limits";
import { LOG_LIMIT } from "../lib/flight-log";
import LogPage from "./LogPage.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "#/");
});

const MIN = 60_000;
const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();
function flight(id: string, off: number, minutes: number[], over: Partial<LoggedFlight> = {}): LoggedFlight {
  const names = ["Preflight", "Departure", "Enroute", "Arrival", "Post-flight"];
  const stages = minutes.map((m, i) => ({ title: names[i] ?? "", ms: m * MIN }));
  const on = off + minutes.reduce((a, b) => a + b, 0) * MIN;
  return {
    id,
    loggedAt: on + MIN,
    pack: "demo",
    packVersion: "0.1.0",
    aircraft: "Test Jet",
    origin: "KSEA",
    destination: "KSFO",
    offBlocks: off,
    onBlocks: on,
    stages,
    done: 359,
    total: 366,
    skipped: [],
    plan: "simbrief",
    finished: true,
    ticks: [
      { at: off, step: "demo.a", text: "BATTERY SWITCH", value: "ON" },
      { at: on, step: "demo.b", text: "DOOR LIGHTS", value: "ALL OUT" },
    ],
    ...over,
  };
}
const terr = {
  step: "demo.terr",
  text: "TERR (EFIS CONTROL PANEL)",
  value: "ON",
  stage: "Departure",
  phase: "before-start",
  phaseTitle: "Before start",
};
const log: Log = {
  format: 1,
  flights: [
    flight("f1", at(15, 14, 10), [30, 35, 40, 15, 5], { origin: "KSFO", destination: "KSEA", done: 366 }),
    flight("f2", at(14, 9, 48), [38, 41, 52, 24, 6], {
      skipped: [
        terr,
        {
          ...terr,
          step: "demo.oxy",
          text: "CREW OXYGEN",
          stage: "Preflight",
          phase: "preflight",
          phaseTitle: "Preflight",
        },
      ],
    }),
    flight("f3", at(12, 7, 30), [20, 28], {
      origin: "KPDX",
      destination: "KSEA",
      done: 118,
      finished: false,
      plan: "manual",
      skipped: [terr],
    }),
  ],
  practice: [
    { id: "r1", at: at(15, 18, 0), pack: "demo", title: "Lights of the flight deck", score: 17, total: 20 },
    { id: "r2", at: at(13, 12, 0), pack: "demo", title: "Memory items", score: 9, total: 10 },
  ],
};
const current = flight("now", at(16, 9, 48), [26], {
  done: 41,
  finished: false,
  skipped: [{ ...terr, step: "demo.oxy", text: "CREW OXYGEN" }],
  ticks: [
    { at: at(16, 9, 48), step: "demo.a", text: "BATTERY SWITCH", value: "ON" },
    { at: at(16, 10, 10), step: "demo.m", text: "MCP", value: "SET" },
    { at: at(16, 10, 11), step: "demo.b", text: "DOOR LIGHTS", value: "ALL OUT" },
    { at: at(16, 10, 14), step: "demo.c", text: "CENTER TANK FUEL", value: "CHECK QUANTITY" },
  ],
});
const name = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
const base = {
  log,
  current,
  entry: null,
  name,
  canGo: (id: string) => id !== "demo.oxy",
  backHref: "#/phase/before-start",
  onLog: async () => {},
  onDelete: async () => true,
  onRestore: async () => {},
  onImport: async () => "",
  onSaveCopy: () => {},
  onCsv: () => {},
  onJson: () => {},
  onStep: () => {},
};
/** An element's words, its markup's spaces folded. */
const words = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const phone = () =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("Flight log, desktop (LogDesk)", () => {
  it("shows This flight: its latest three ticks newest first, then its open steps, and every tick on asking", async () => {
    const { container } = render(LogPage, base);
    expect(screen.getByRole("heading", { level: 1, name: "Flight log" })).toBeTruthy();
    expect(
      screen.getByText("This flight, earlier flights and practice results, saved on this device"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Checklist" }).getAttribute("href")).toBe("#/phase/before-start");
    const card = container.querySelector(".this") as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe("This flight · KSEA → KSFO");
    expect(within(card).getByText("41 of 366 steps · started 09:48")).toBeTruthy();
    const rows = () =>
      [...card.querySelectorAll(".tick")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows()).toEqual([
      ["10:14", "Center tank fuel", "CHECK QUANTITY"],
      ["10:11", "Door lights", "ALL OUT"],
      ["10:10", "Mcp", "SET"],
      // An open step keeps its value, as the boards show it.
      ["open", "Crew oxygen", "ON"],
    ]);
    await fireEvent.click(within(card).getByRole("button", { name: "Show every tick ⌄" }));
    expect(rows()).toHaveLength(5);
    expect(rows()[3]?.[0]).toBe("09:48");
  });

  it("lists the earlier flights newest first with their date, route, summary and Finished or Not finished", () => {
    const { container } = render(LogPage, base);
    expect(container.querySelector(".earlier h2")?.textContent).toBe("Earlier flights · 3");
    expect(screen.getByText("Newest first")).toBeTruthy();
    const rows = [...container.querySelectorAll(".row")].map((r) =>
      [...r.querySelectorAll(".date, .rte, .sum, .st")].map((s) => s.textContent),
    );
    expect(rows).toEqual([
      ["Sun 15 Nov", "KSFO → KSEA", "2 h 05 min · 366 of 366 steps", "Finished"],
      ["Sat 14 Nov", "KSEA → KSFO", "2 h 41 min · 359 of 366 steps · 2 skipped", "Finished"],
      ["Thu 12 Nov", "KPDX → KSEA", "48 min · 118 of 366 steps · 1 skipped", "Not finished"],
    ]);
    expect(container.querySelector(".row .st.fin")?.textContent).toBe("Finished");
    expect(container.querySelectorAll(".row .st:not(.fin)")).toHaveLength(1);
    // Each row opens its flight in the address; none is opened yet.
    expect(container.querySelector(".row")?.getAttribute("href")).toBe("#/log/f1");
    expect(container.querySelector(".detail")).toBeNull();
  });

  it("opens the flight in the address below the list: its facts, the stages in proportion, the skipped steps each going to its step", async () => {
    const onStep = vi.fn();
    const { container } = render(LogPage, { ...base, entry: "f2", onStep });
    const opened = container.querySelector('.row[aria-current="true"]');
    expect(opened?.getAttribute("href")).toBe("#/log");
    const d = container.querySelector(".detail") as HTMLElement;
    expect(d.querySelector("h3")?.textContent).toBe("KSEA → KSFO");
    expect(within(d).getByText("Sat 14 Nov · Test Jet · 2 h 41 min")).toBeTruthy();
    expect([...d.querySelectorAll(".facts div")].map(words)).toEqual([
      "Off blocks09:48",
      "On blocks12:29",
      "Flight planSimBrief",
      "Steps359 of 366",
    ]);
    const stages = [...d.querySelectorAll(".stage")] as HTMLElement[];
    expect(stages.map(words)).toEqual([
      "Preflight 38 min",
      "Departure 41 min",
      "Enroute 52 min",
      "Arrival 24 min",
      "Post-flight 6 min",
    ]);
    expect(stages.map((s) => s.style.flex.split(" ")[0])).toEqual([
      "2280000",
      "2460000",
      "3120000",
      "1440000",
      "360000",
    ]);
    expect(within(d).getByText("Skipped · 2")).toBeTruthy();
    // TERR is in this pack, so it goes to its step; a step no longer in the pack is only named.
    await fireEvent.click(within(d).getByRole("link", { name: /Terr/ }));
    expect(onStep).toHaveBeenCalledWith("demo.terr");
    expect(within(d).queryByRole("link", { name: /Crew oxygen/ })).toBeNull();
    expect(within(d).getByText("Preflight › Preflight")).toBeTruthy();
    await fireEvent.click(within(d).getByRole("button", { name: "Show every tick" }));
    expect([...d.querySelectorAll(".every .tick")].map(words)).toEqual([
      "09:48Battery switchON",
      "12:29Door lightsALL OUT",
    ]);
  });

  it("deletes a flight with an Undo toast that puts it back", async () => {
    const onDelete = vi.fn(async () => true);
    const onRestore = vi.fn(async () => {});
    render(LogPage, { ...base, entry: "f2", onDelete, onRestore });
    await fireEvent.click(screen.getByRole("button", { name: "Delete this flight" }));
    expect(onDelete).toHaveBeenCalledWith("f2");
    expect(screen.getByText("Flight deleted.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onRestore).toHaveBeenCalledWith(log.flights[1]);
  });

  it("has the actions column, logs the flight, and loads a log file, saying what it added", async () => {
    const onLog = vi.fn(async () => {});
    const onImport = vi.fn(async () => "Added 2 flights.");
    const onCsv = vi.fn();
    const { container } = render(LogPage, { ...base, onLog, onImport, onCsv });
    const acts = screen.getByRole("complementary", { name: "Log actions" });
    expect([...acts.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Log flight and start new",
      "Save copy (HTML file)",
      "Export CSV",
      "Export JSON",
      "Load log file",
      "Print or save as PDF",
    ]);
    expect(within(acts).getByText(/Logs stay on this device unless you export them/)).toBeTruthy();
    await fireEvent.click(within(acts).getByRole("button", { name: "Log flight and start new" }));
    expect(onLog).toHaveBeenCalled();
    await fireEvent.click(within(acts).getByRole("button", { name: "Export CSV" }));
    expect(onCsv).toHaveBeenCalled();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"format":1}'], "log.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);
    await vi.waitFor(() => expect(screen.getByText("Added 2 flights.")).toBeTruthy());
    expect(onImport).toHaveBeenCalledWith('{"format":1}');
  });

  it("refuses a log file over the limit without reading it", async () => {
    const onImport = vi.fn(async () => "Added 2 flights.");
    const { container } = render(LogPage, { ...base, onImport });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{}"], "log.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: MAX_LOG_FILE_BYTES + 1 });
    const read = vi.spyOn(file, "text");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);
    expect(
      await screen.findByText(
        "That file is too large to be an Involo log file (over 64 MB), so it wasn’t read.",
      ),
    ).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("can't log a flight with nothing ticked, and shows the empty log as round 6's Log view", () => {
    const { container } = render(LogPage, {
      ...base,
      current: null,
      log: { format: 1, flights: [], practice: [] },
    });
    expect(
      (screen.getByRole("button", { name: "Log flight and start new" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(container.querySelector(".earlier h2")?.textContent).toBe("Earlier flights");
    expect(screen.getByText("Flights you log appear here, newest first.")).toBeTruthy();
  });

  it("says so when the log is full, and when the saved log can't be changed", () => {
    const many = Array.from({ length: LOG_LIMIT }, (_, n) => flight(`f${n}`, at(1, 0, 0) + n * MIN, [1]));
    render(LogPage, { ...base, log: { ...log, flights: many }, blocked: "Kept as it is." });
    expect(screen.getByText(/keeps the newest 500 flights/)).toBeTruthy();
    expect(screen.getByText("Kept as it is.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load log file" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Log flight and start new" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("offers Undo only once a delete is saved", async () => {
    render(LogPage, { ...base, entry: "f2", onDelete: async () => false, problem: "Not saved." });
    await fireEvent.click(screen.getByRole("button", { name: "Delete this flight" }));
    expect(screen.queryByText("Flight deleted.")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Not saved.");
  });

  it("with a saved log kept as it is, offers only Export JSON, which saves that copy", () => {
    render(LogPage, { ...base, blocked: "Kept as it is." });
    expect(
      [...screen.getByRole("complementary", { name: "Log actions" }).querySelectorAll("button.act")].map(
        (b) => b.textContent,
      ),
    ).toEqual(["Export JSON"]);
  });

  it("leaves out Practice results until there is one, as round 6's empty Log view does", () => {
    const { container } = render(LogPage, { ...base, log: { ...log, practice: [] } });
    expect(container.querySelector(".practice")).toBeNull();
  });

  it("shows a hand-edited log file with a step twice, rather than failing", () => {
    const twice = flight("dup", at(14, 9, 0), [5, 5], { skipped: [terr, terr] });
    twice.ticks.push(twice.ticks[0] as LoggedFlight["ticks"][number]);
    const { container } = render(LogPage, { ...base, log: { ...log, flights: [twice] }, entry: "dup" });
    expect(container.querySelectorAll(".skips .skip")).toHaveLength(2);
  });

  it("lists practice results newest first with their date and score", () => {
    const { container } = render(LogPage, base);
    expect([...container.querySelectorAll(".result")].map(words)).toEqual([
      "Sun 15 NovLights of the flight deck 17 of 20",
      "Fri 13 NovMemory items 9 of 10",
    ]);
    expect(screen.getByRole("link", { name: "Practice ›" }).getAttribute("href")).toBe("#/practice");
  });
});

describe("Flight log, phone (LogPhone, LogPhoneFlight)", () => {
  it("lists This flight, the earlier flights and practice results, with the bottom bar", () => {
    phone();
    const { container } = render(LogPage, base);
    expect(screen.getByRole("link", { name: "Back to checklist" }).getAttribute("href")).toBe(
      "#/phase/before-start",
    );
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    const rows = [...container.querySelectorAll(".prow")];
    expect(rows[0]?.getAttribute("href")).toBe("#/log/current");
    expect(words(rows[0])).toBe("This flightKSEA → KSFO41 of 366 steps · started 09:48");
    expect(words(rows[2])).toBe("KSEA → KSFOFinishedSat 14 Nov · 2 h 41 min · 359 of 366 steps · 2 skipped");
    expect(rows[2]?.getAttribute("href")).toBe("#/log/f2");
    expect(container.querySelector(".plabel")?.textContent).toBe("Earlier flights · 3");
    expect([...container.querySelectorAll(".pad .result")].map(words)).toEqual([
      "Lights of the flight deckSun 15 Nov 17 of 20",
      "Memory itemsFri 13 Nov 9 of 10",
    ]);
    expect(screen.getByRole("button", { name: "Log flight and start new" })).toBeTruthy();
  });

  it("opens the export and import actions as a sheet from ···, closing on Esc", async () => {
    phone();
    render(LogPage, base);
    const dots = screen.getByRole("button", { name: "Export and import" });
    await fireEvent.click(dots);
    const sheet = screen.getByRole("dialog", { name: "Export and import" });
    expect([...sheet.querySelectorAll("button.act")].map((b) => b.textContent)).toEqual([
      "Save copy (HTML file)",
      "Export CSV",
      "Export JSON",
      "Load log file",
      "Print or save as PDF",
    ]);
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(dots);
  });

  it("opens an earlier flight on its own page, and This flight on its own", () => {
    phone();
    const { container, unmount } = render(LogPage, { ...base, entry: "f2" });
    expect(screen.getByRole("link", { name: "Back to all flights" }).getAttribute("href")).toBe("#/log");
    expect(container.querySelector(".ttl span")?.textContent).toBe("Sat 14 Nov");
    expect(container.querySelector(".detail h3")?.textContent).toBe("KSEA → KSFO");
    unmount();
    const now = render(LogPage, { ...base, entry: "current" });
    expect(now.container.querySelector(".ttl span")?.textContent).toBe("This flight");
    expect(now.container.querySelectorAll(".tick")).toHaveLength(4);
  });
});
