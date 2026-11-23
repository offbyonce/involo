// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { BackupFlight, CatalogEntry, Flight } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import type { InstalledPack } from "../host";
import { backupFileName, lastBackupLine, logLine, refusalLine, rowFor, savedByLine } from "./backup";

// Back up and restore (#47, Backup board): the words the card and the dialogs show.

const at = new Date(2026, 10, 18, 10, 14).getTime();

const entry = (more: Partial<BackupFlight> = {}): BackupFlight => ({
  pack: "ifly",
  name: "iFly 737 MAX 8",
  version: "0.0.9",
  source: "catalog",
  place: { place: "Departure › Before start", done: 12, total: 40 },
  flight: {
    pack: "ifly",
    packVersion: "0.0.9",
    session: { done: { battery: 1 }, skipped: {} },
  } as unknown as Flight,
  plan: null,
  ...more,
});
const installed = (version: string): InstalledPack => ({
  summary: { id: "ifly", name: "iFly 737 MAX 8", version, kind: "aircraft" },
  source: "catalog",
  installedAt: 1,
});
const listed = { id: "ifly", name: "iFly 737 MAX 8", version: "0.1.0" } as CatalogEntry;

describe("back up and restore words", () => {
  it("says when the last backup was saved, or never", () => {
    expect(lastBackupLine(null)).toBe("Last backup: never");
    expect(lastBackupLine(at)).toBe("Last backup: Nov 18 at 10:14");
    expect(backupFileName(at)).toBe("involo-backup-2026-11-18.json");
  });

  it("names when and by which version the backup was saved", () => {
    expect(savedByLine(at, "0.1.0")).toBe(
      "Backup saved Nov 18, 2026 at 10:14 by Involo 0.1.0. Untick anything you want to leave as it is.",
    );
  });

  it("gives each refusal its first line", () => {
    expect(refusalLine({ kind: "newer", version: "0.3.0" })).toBe(
      "It was saved by a newer version of Involo (0.3.0). Update Involo, then try again.",
    );
    expect(refusalLine({ kind: "notBackup" })).toBe("This file isn’t an Involo backup, or it’s damaged.");
    expect(refusalLine({ kind: "logFile" })).toBe(
      "This is a flight log file. Load it from the Flight log page.",
    );
    expect(refusalLine({ kind: "noPackForEarlier" })).toBe(
      "This file is from the 3.0 checklist, and none of your packs can read it. Add the pack for its aircraft, then try again.",
    );
  });

  it("counts what the log merge adds, and leaves the row out when it adds nothing", () => {
    expect(logLine(3, 2)).toBe(
      "Adds 3 flights and 2 practice results that aren’t on this device. Nothing is removed.",
    );
    expect(logLine(1, 0)).toBe("Adds 1 flight that isn’t on this device. Nothing is removed.");
    expect(logLine(0, 4)).toBe("Adds 4 practice results that aren’t on this device. Nothing is removed.");
    expect(logLine(0, 0)).toBeNull();
  });

  it("says what each flight replaces, and when it is brought up to the installed version", () => {
    const row = rowFor(entry(), installed("0.1.0"), { place: "Preflight › Power up", done: 3, total: 357 }, [
      listed,
    ]);
    expect(row).toMatchObject({
      name: "iFly 737 MAX 8",
      version: "0.0.9",
      inBackup: "In the backup: Departure › Before start, 12 of 40",
      device: { text: "Replaces the flight on this device: Preflight › Power up, 3 of 357", replaces: true },
      upgrade: "Brought up to version 0.1.0, with a note on what changed.",
      installed: true,
      download: null,
    });
    const fresh = rowFor(
      entry({
        flight: {
          pack: "ifly",
          packVersion: "0.1.0",
          session: { done: { battery: 1 }, skipped: {} },
        } as unknown as Flight,
      }),
      installed("0.1.0"),
      null,
      [],
    );
    expect(fresh.device).toEqual({
      text: "No flight on this device yet, so nothing is replaced.",
      replaces: false,
    });
    expect(fresh.upgrade).toBeNull();
  });

  it("keeps a flight for a pack that isn't installed, offering Download only for a catalog pack", () => {
    const missing = rowFor(entry(), undefined, null, [listed]);
    expect(missing.device).toEqual({
      text: "Not on this device. The flight is kept and appears when you add the pack.",
      replaces: false,
    });
    expect(missing.installed).toBe(false);
    expect(missing.download).toBe(listed);
    expect(rowFor(entry({ source: "file" }), undefined, null, [listed]).download).toBeNull();
    expect(rowFor(entry(), undefined, null, []).download).toBeNull();
    expect(rowFor(entry({ place: null }), undefined, null, []).inBackup).toBeNull();
  });

  it("says a flight on this device with no ticks is not started, as the backup line does", () => {
    expect(rowFor(entry(), installed("0.0.9"), true, []).device).toEqual({
      text: "Replaces the flight on this device: not started",
      replaces: true,
    });
  });

  it("says a flight with no ticks is not started", () => {
    const untouched = entry({
      place: null,
      flight: { pack: "ifly", packVersion: "0.0.9", session: { done: {}, skipped: {} } } as unknown as Flight,
    });
    expect(rowFor(untouched, installed("0.0.9"), null, []).inBackup).toBe("In the backup: not started");
    expect(rowFor(untouched, undefined, null, []).inBackup).toBe("In the backup: not started");
  });
});
