// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Log, LoggedFlight } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { clock, dayLabel, duration, ends, htmlCopy, stageTimes, summary } from "./flight-log";

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

  it("rounds the stage minutes so they add up to the flight's total", () => {
    const st = (title: string, ms: number) => ({ title, ms });
    // 38:40 + 50:40 + 71:40 is 161 min; rounded one by one it would be 39 + 51 + 72 = 162.
    const stages = [
      st("Preflight", 38 * 60_000 + 40_000),
      st("Departure", 50 * 60_000 + 40_000),
      st("Arrival", 71 * 60_000 + 40_000),
    ];
    expect(stageTimes(stages)).toEqual(["39 min", "51 min", "71 min"]);
    expect(duration(stages.reduce((a, s) => a + s.ms, 0))).toBe("2 h 41 min");
    const even = [
      st("A", 20 * 60_000 + 20_000),
      st("B", 20 * 60_000 + 20_000),
      st("C", 20 * 60_000 + 20_000),
    ];
    expect(stageTimes(even)).toEqual(["21 min", "20 min", "20 min"]);
    expect(stageTimes([st("A", 610_000), st("B", 650_000), st("C", 600_000)])).toEqual([
      "10 min",
      "11 min",
      "10 min",
    ]);
    expect(stageTimes([])).toEqual([]);
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
