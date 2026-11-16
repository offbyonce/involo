// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Log, LoggedFlight } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { clock, dayLabel, duration, ends, htmlCopy, stageTimes, summary } from "./flight-log";

/** Shared with app-core (crates/app-core/tests/fixtures/stage-minutes.json). */
const fixture = Object.values(
  import.meta.glob<{ cases: { name: string; ms: number[]; minutes: number[] }[] }>(
    "../../../../crates/app-core/tests/fixtures/stage-minutes.json",
    { eager: true, import: "default" },
  ),
)[0] as { cases: { name: string; ms: number[]; minutes: number[] }[] };

const off = new Date(2026, 10, 14, 9, 48).getTime();
const f: LoggedFlight = {
  id: "a",
  loggedAt: off + 200 * 60_000,
  pack: "demo",
  packVersion: "1",
  aircraft: "Test <Jet>",
  origin: "KSEA",
  destination: "",
  offBlocks: off,
  onBlocks: off + 161 * 60_000,
  stages: [{ title: "Preflight", ms: 38 * 60_000 }],
  done: 359,
  total: 366,
  skipped: [
    { step: "s", text: "TERR", value: "ON", stage: "Departure", phase: "p", phaseTitle: "Before start" },
  ],
  plan: "manual",
  finished: false,
  ticks: [{ at: off, step: "t", text: "DOOR LIGHTS", value: "ALL OUT" }],
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
      // The cases app-core's stage_minutes test reads too, so the two copies cannot drift.
      const stages = ms.map((t) => ({ title: "Stage", ms: t }));
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
});
