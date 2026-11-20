// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight log's words and numbers as the Log boards write them (dates "Sun 15 Nov", times
// "09:48", durations "2 h 41 min"), and its files: the HTML copy and downloads. The log itself
// (entries, the 500 limit, merging, CSV) is Rust's (crates/involo-app-core/src/log.rs, decision 0026).

import type { Log, LoggedFlight, PracticeResult, StageTime } from "@involo/bindings";

/** How many flights, and how many practice results, the log keeps (involo-app-core's LOG_LIMIT). */
export const LOG_LIMIT = 500;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "Sun 15 Nov", in the pilot's time zone. */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "09:48", in the pilot's time zone. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whole minutes, rounded to the nearest (half a minute up, as involo-app-core's `minutes`). */
const minutes = (ms: number) => Math.floor((ms + 30_000) / 60_000);

/** "48 min", or "2 h 05 min" from an hour up. */
export function duration(ms: number): string {
  const m = minutes(ms);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

/**
 * Each stage's time under its bar, "38 min" (Log boards: minutes only), rounded so the stages add
 * up to the flight's rounded total: every stage gets its whole minutes, then the stages with the
 * largest leftover seconds get one more each, earlier stages first on a tie (the largest remainder
 * method; involo-app-core's `stage_minutes` does the same for the CSV, and both are tested against
 * crates/involo-app-core/tests/fixtures/stage-minutes.json).
 */
export function stageTimes(stages: readonly StageTime[]): string[] {
  const out = stages.map((s) => Math.floor(s.ms / 60_000));
  const short = minutes(stages.reduce((sum, s) => sum + s.ms, 0)) - out.reduce((a, b) => a + b, 0);
  stages
    .map((s, i) => ({ i, left: s.ms % 60_000 }))
    .sort((a, b) => b.left - a.left || a.i - b.i)
    .slice(0, Math.max(short, 0))
    .forEach(({ i }) => {
      out[i] = (out[i] ?? 0) + 1;
    });
  return out.map((m) => `${m} min`);
}

/** When a flight happened: its first tick, else when it was logged. */
export const flightDay = (f: LoggedFlight) => f.offBlocks ?? f.loggedAt;

/** The flight's time from first to last tick, or null with no ticks. */
export const flightTime = (f: LoggedFlight) =>
  f.offBlocks !== null && f.onBlocks !== null ? f.onBlocks - f.offBlocks : null;

/** The route's two ends: "KSEA", "KSFO", with a dash for one not entered. */
export const ends = (f: Pick<LoggedFlight, "origin" | "destination">): [string, string] => [
  f.origin || "—",
  f.destination || "—",
];

/** The route in words, for screen readers and files: "KSEA to KSFO". */
export const routeWords = (f: Pick<LoggedFlight, "origin" | "destination">) => {
  const [a, b] = ends(f);
  return `${a} to ${b}`;
};

/** "2 h 41 min · 359 of 366 steps · 2 skipped" (the list rows). */
export function summary(f: LoggedFlight): string {
  const t = flightTime(f);
  return [
    t === null ? null : duration(t),
    `${f.done} of ${f.total} steps`,
    f.skipped.length ? `${f.skipped.length} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const planLabel = (f: LoggedFlight) => (f.plan === "simbrief" ? "SimBrief" : "Entered by hand");

/** A result's score as the boards write it: "17 of 20". */
export const score = (r: PracticeResult) => `${r.score} of ${r.total}`;

/** A date for file names: "2026-11-16". */
export function fileDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const html = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** A pack in the log, for its filter chip: its id, its name, and how many of its flights and
 * practice results the log holds. */
export type LogPack = { id: string; name: string; count: number };

/**
 * The packs the log's flights and practice results were saved with (decision 0028), most entries
 * first, then by name. A pack's name is its newest entry's (entries are newest first), else the
 * installed pack's (`installed`, by id), else its id: practice results saved before log format 3
 * didn't record the pack's name.
 */
export function logPacks(log: Log, installed: Readonly<Record<string, string>> = {}): LogPack[] {
  const packs = new Map<string, { names: (string | null)[]; count: number }>();
  const add = (id: string, name: string | null) => {
    const p = packs.get(id) ?? { names: [], count: 0 };
    p.names.push(name);
    p.count += 1;
    packs.set(id, p);
  };
  for (const f of log.flights) add(f.pack, f.packName || null);
  for (const r of log.practice) add(r.pack, r.packName || null);
  return [...packs]
    .map(([id, p]) => ({ id, name: p.names.find((n) => n !== null) ?? installed[id] ?? id, count: p.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The log with only `pack`'s flights and practice results; the whole log when `pack` is null. */
export function logOf(log: Log, pack: string | null): Log {
  if (pack === null) return log;
  return {
    ...log,
    flights: log.flights.filter((f) => f.pack === pack),
    practice: log.practice.filter((r) => r.pack === pack),
  };
}

/**
 * The pack an entry was saved with, as its row shows it: "iFly 737 MAX 8 · 0.1.0", or only the
 * version while the log shows one pack (`onePack`), since the name would repeat on every row.
 * What an older entry didn't record is left out; `name` is the pack's name from `logPacks`.
 */
export function packLine(version: string | null, name: string, onePack: boolean): string {
  return [onePack ? null : name, version].filter(Boolean).join(" · ");
}

/**
 * Save copy: the log as one HTML file that opens anywhere, with no app and no network. Plain
 * tables, so it prints and reads well; step names come as the page shows them (`name`).
 */
export function htmlCopy(
  log: Log,
  savedAt: number,
  name: (name: string, step: string) => string,
  installed: Readonly<Record<string, string>> = {},
  only: string | null = null,
): string {
  const e = html;
  const packName = new Map(logPacks(log, installed).map((p) => [p.id, p.name]));
  const flights = log.flights
    .map((f) => {
      const t = flightTime(f);
      const times = stageTimes(f.stages);
      const stages = f.stages.map((s, i) => `${e(s.title)} ${times[i]}`).join(" · ");
      const skipped = f.skipped
        .map((s) => `<li>${e(name(s.name, s.step))} (${e(s.stage)} › ${e(s.phaseTitle)})</li>`)
        .join("");
      const ticks = f.ticks
        .map(
          (k) => `<tr><td>${clock(k.at)}</td><td>${e(name(k.name, k.step))}</td><td>${e(k.value)}</td></tr>`,
        )
        .join("");
      return `<section>
<h2>${e(ends(f).join(" → "))}</h2>
<p>${e([dayLabel(flightDay(f)), packLine(f.packVersion, packName.get(f.pack) ?? f.pack, false), t === null ? "" : duration(t), f.finished ? "Finished" : "Not finished"].filter(Boolean).join(" · "))}</p>
<table><tr><th>Off blocks</th><th>On blocks</th><th>Flight plan</th><th>Steps</th></tr>
<tr><td>${f.offBlocks === null ? "—" : clock(f.offBlocks)}</td><td>${f.onBlocks === null ? "—" : clock(f.onBlocks)}</td><td>${planLabel(f)}</td><td>${f.done} of ${f.total}</td></tr></table>
${stages ? `<p>Time in each stage: ${stages}</p>` : ""}
${skipped ? `<p>Skipped · ${f.skipped.length}</p><ul>${skipped}</ul>` : ""}
${ticks ? `<details><summary>Every tick · ${f.ticks.length}</summary><table>${ticks}</table></details>` : ""}
</section>`;
    })
    .join("\n");
  const practice = log.practice
    .map(
      (r) =>
        `<tr><td>${dayLabel(r.at)}</td><td>${e(r.title)}</td><td>${e(packLine(r.packVersion, packName.get(r.pack) ?? r.pack, false))}</td><td>${score(r)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Involo flight log, ${fileDate(savedAt)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.45}table{border-collapse:collapse}th,td{text-align:left;padding:.25rem 1rem .25rem 0}section{margin-bottom:2rem}</style>
</head>
<body>
<h1>Flight log</h1>
<p>Saved from Involo on ${dayLabel(savedAt)} at ${clock(savedAt)}.${only ? ` Flights and practice results with ${e(only)} only.` : ""} Earlier flights · ${log.flights.length}, newest first.</p>
${flights || "<p>No flights logged.</p>"}
<h2>Practice results</h2>
${practice ? `<table>${practice}</table>` : "<p>No practice results.</p>"}
</body>
</html>
`;
}

/** Hands the pilot a file to save, made on this device. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
