// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the Packs page and the menu's pack line say about each pack (decision 0028; Packs boards):
// its aircraft line, its size, its saved flight, a waiting update and the catalog packs not yet on
// this device. All from the pack, the catalog and the flight.

import type { AircraftInfo, CatalogEntry, Rail } from "@involo/bindings";
import type { InstalledPack, PackInstall } from "../host";

const MB = 1024 * 1024;

/** "Boeing 737 · Microsoft Flight Simulator · iFly": the pack's family, simulator and developer. */
export function aircraftLine(aircraft: AircraftInfo | null | undefined): string {
  if (!aircraft) return "";
  return [aircraft.family, aircraft.simulator, aircraft.developer].filter(Boolean).join(" · ");
}

/** A pack file's size, "0.6 MB". */
export function sizeLabel(bytes: number): string {
  return `${Math.max(0.1, Math.round((bytes / MB) * 10) / 10).toFixed(1)} MB`;
}

/** A version's parts: [major, minor, patch] and its pre-release, if any. */
function parts(version: string): { core: number[]; pre: string | null } {
  const [main = "", pre] = version.split("+")[0]?.split(/-(.*)/s) ?? [];
  return { core: main.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
}

/** Whether `candidate` is a later version than `installed` (semantic versioning: a release comes
 * after its own pre-releases). */
export function isNewer(candidate: string, installed: string): boolean {
  const a = parts(candidate);
  const b = parts(installed);
  for (let i = 0; i < 3; i++) {
    const d = (a.core[i] ?? 0) - (b.core[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true;
  if (b.pre === null) return false;
  return a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0;
}

/** Where a saved flight is and how far it has come. */
export type SavedLine = { where: string; done: number; total: number };

/**
 * A saved flight's line: the first phase not yet done ("Departure › Before start"; the last when
 * every phase is done) and the flight's ticks. Null when nothing is ticked yet.
 */
export function savedLine(rail: Rail): SavedLine | null {
  const phases = rail.stages.flatMap((stage) => stage.phases.map((phase) => ({ stage, phase })));
  const done = phases.reduce((n, p) => n + p.phase.progress.done, 0);
  const total = phases.reduce((n, p) => n + p.phase.progress.total, 0);
  if (done === 0) return null;
  const at = phases.find((p) => !p.phase.complete) ?? phases.at(-1);
  return { where: at ? `${at.stage.title} › ${at.phase.title}` : "", done, total };
}

/** The catalog's newer version of an installed catalog pack, or null. A pack from a file is never
 * offered the catalog's version: it may not be the same pack. */
export function updateFor(pack: InstalledPack, catalog: CatalogEntry[]): CatalogEntry | null {
  if (pack.source !== "catalog") return null;
  const entry = catalog.find((e) => e.id === pack.summary.id);
  return entry && isNewer(entry.version, pack.summary.version) ? entry : null;
}

/** The catalog's packs that aren't on this device, in the catalog's order. */
export function morePacks(installed: InstalledPack[], catalog: CatalogEntry[]): CatalogEntry[] {
  const here = new Set(installed.map((p) => p.summary.id));
  return catalog.filter((e) => !here.has(e.id));
}

/** A problem installing a pack, as the Packs page shows it: a title and its lines. */
export type PackNotice = { title: string; lines: string[] };

/** What a refused or unkept install says, or null when the pack was installed. */
export function installNotice(name: string, result: PackInstall): PackNotice | null {
  if (result.state === "installed") return null;
  return result.state === "refused"
    ? { title: `${name} wasn’t added.`, lines: result.reasons }
    : {
        title: `${name} passed its checks, but this device didn’t keep it.`,
        lines: ["Storage is blocked or full here, so the pack can’t be installed."],
      };
}

/** What a catalog download that failed says, with the reason. */
export function downloadFailed(name: string, e: unknown): PackNotice {
  return { title: `${name} couldn’t be downloaded.`, lines: [e instanceof Error ? e.message : String(e)] };
}
