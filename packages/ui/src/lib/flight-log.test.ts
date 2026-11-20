// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Log, LoggedFlight } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import {
  clock,
  dayLabel,
  duration,
  ends,
  htmlCopy,
  logOf,
  logPacks,
  packLine,
  stageTimes,
  summary,
} from "./flight-log";

/** Shared with involo-app-core (crates/involo-app-core/tests/fixtures/stage-minutes.json). */
const fixture = Object.values(
  import.meta.glob<{ cases: { name: string; ms: number[]; minutes: number[] }[] }>(
    "../../../../crates/involo-app-core/tests/fixtures/stage-minutes.json",
    { eager: true, import: "default" },
  ),
)[0] as { cases: { name: string; ms: number[]; minutes: number[] }[] };

const off = new Date(2026, 10, 14, 9, 48).getTime();
const f: LoggedFlight = {
  id: "a",
  loggedAt: off + 200 * 60_000,
  pack: "demo",
  packVersion: "1",
  packName: "Test <Jet>",
  aircraft: "Test aircraft",
  origin: "KSEA",
  destination: "",
  offBlocks: off,
  onBlocks: off + 161 * 60_000,
  stages: [{ id: "preflight", title: "Preflight", ms: 38 * 60_000 }],
  done: 359,
  total: 366,
  skipped: [
    {
      step: "s",
      text: "TERR",
      name: "TERR",
      value: "ON",
      stage: "Departure",
      phase: "p",
      phaseTitle: "Before start",
    },
  ],
  plan: "manual",
  finished: false,
  ticks: [{ at: off, step: "t", text: "DOOR LIGHTS", name: "DOOR LIGHTS", value: "ALL OUT" }],
};

describe("the Flight log's words", () => {
  it("writes dates, times and durations as the Log boards do", () => {
    expect(dayLabel(off)).toBe("Sat 14 Nov");
    expect(clock(off)).toBe("09:48");
    expect(duration(48 * 60_000)).toBe("48 min");
    expect(duration(125 * 60_000)).toBe("2 h 05 min");
    expect(summary(f)).toBe("2 h 41 min · 359 of 366 steps · 1 skipped");
    expect(ends(f)).toEqual(["KSEA", "—"]);
  });

  it.each(fixture.cases)(
    "rounds the stage minutes so they add up to the flight's total: $name",
    ({ ms, minutes }) => {
      // The cases involo-app-core's stage_minutes test reads too, so the two copies cannot drift.
      const stages = ms.map((t) => ({ id: null, title: "Stage", ms: t }));
      expect(stageTimes(stages)).toEqual(minutes.map((m) => `${m} min`));
      const total = ms.reduce((a, t) => a + t, 0);
      expect(minutes.reduce((a, m) => a + m, 0)).toBe(Math.floor((total + 30_000) / 60_000));
    },
  );

  it("reads the shared stage-minute cases", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(5);
    // The 161-minute flight shows "2 h 41 min", and its stages add up to it.
    expect(duration(2_320_000 + 3_040_000 + 4_300_000)).toBe("2 h 41 min");
  });

  it("saves a copy that stands alone, with what the pilot typed escaped", () => {
    const log: Log = { format: 1, flights: [f], practice: [] };
    const html = htmlCopy(log, off, (t) => t.toLowerCase());
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("Test &lt;Jet&gt;");
    expect(html).not.toContain("<Jet>");
    expect(html).toContain("<h2>KSEA → —</h2>");
    expect(html).toContain("terr (Departure › Before start)");
    expect(html).toContain("<td>09:48</td><td>door lights</td><td>ALL OUT</td>");
    expect(html).toContain("No practice results.");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("shows a real date for the latest moment a merged entry can hold (involo-app-core's MAX_TIME)", () => {
    // The last millisecond of the year 9999; Rust refuses anything later on merge.
    const last = 253_402_300_799_999;
    const late: LoggedFlight = {
      ...f,
      loggedAt: last,
      offBlocks: last,
      onBlocks: last,
      ticks: f.ticks.map((t) => ({ ...t, at: last })),
    };
    const html = htmlCopy(
      {
        format: 1,
        flights: [late],
        practice: [
          {
            id: "r",
            at: last,
            pack: "p",
            packVersion: null,
            packName: null,
            aircraft: null,
            title: "T",
            score: 1,
            total: 1,
          },
        ],
      },
      last,
      (t) => t,
    );
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("NaN");
    // Past JavaScript's own limit a date can't be shown at all, which is why it is refused.
    expect(String(new Date(8.64e15 + 1))).toBe("Invalid Date");
  });
});

describe("the Flight log by pack (decision 0028)", () => {
  const result = (id: string, pack: string, packName: string | null) => ({
    id,
    at: off,
    pack,
    packVersion: packName ? "1" : null,
    packName,
    aircraft: null,
    title: "T",
    score: 1,
    total: 1,
  });
  const log: Log = {
    format: 3,
    flights: [
      { ...f, id: "a2", packName: "Demo 2" },
      { ...f, id: "a1", packName: "Demo 1" },
      { ...f, id: "g1", pack: "glider", packVersion: "2.3.0", packName: "Glider trainer" },
    ],
    practice: [result("r1", "demo", null), result("r2", "old", null)],
  };

  it("lists each pack with its newest name and its count, most entries first", () => {
    expect(logPacks(log)).toEqual([
      // The newest entry's name, for a pack renamed between versions.
      { id: "demo", name: "Demo 2", count: 3 },
      { id: "glider", name: "Glider trainer", count: 1 },
      // A pack only in results saved before log format 3 has no saved name: its id, unless it
      // is installed.
      { id: "old", name: "old", count: 1 },
    ]);
    expect(logPacks(log, { old: "Old trainer" }).at(-1)).toEqual({
      id: "old",
      name: "Old trainer",
      count: 1,
    });
  });

  it("keeps only a pack's flights and results, or the whole log", () => {
    expect(logOf(log, null)).toBe(log);
    const glider = logOf(log, "glider");
    expect(glider.flights.map((x) => x.id)).toEqual(["g1"]);
    expect(glider.practice).toEqual([]);
    expect(logOf(log, "demo").practice.map((r) => r.id)).toEqual(["r1"]);
    expect(glider.format).toBe(3);
  });

  it("names an entry's pack and version, or the version alone under one pack", () => {
    expect(packLine("0.1.0", "iFly 737 MAX 8", false)).toBe("iFly 737 MAX 8 · 0.1.0");
    expect(packLine("0.1.0", "iFly 737 MAX 8", true)).toBe("0.1.0");
    expect(packLine(null, "iFly 737 MAX 8", false)).toBe("iFly 737 MAX 8");
    expect(packLine(null, "iFly 737 MAX 8", true)).toBe("");
  });

  it("saves a copy of one pack's entries that says so", () => {
    const html = htmlCopy(logOf(log, "glider"), off, (t) => t, {}, "Glider trainer");
    expect(html).toContain("Flights and practice results with Glider trainer only.");
    expect(html).toContain("Earlier flights · 1,");
    expect(html).toContain("Sat 14 Nov · Glider trainer · 2.3.0 · 2 h 41 min");
    const all = htmlCopy(log, off, (t) => t);
    expect(all).not.toContain(" only.");
    expect(all).toContain("<td>T</td><td>Demo 2</td><td>1 of 1</td>");
  });
});
