// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Back up and restore (#47; Backup board): the words the Settings card and the restore dialogs
// show, worked out from the backup and this device.

import type { BackupFlight, BackupRefusal, CatalogEntry, EarlierFile, FlightPlace } from "@involo/bindings";
import type { InstalledPack } from "../host";

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/** "Nov 18 at 10:14", with the year when `year` ("Nov 18, 2026 at 10:14"). */
export function when(ms: number, year = false): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
  });
  return `${day} at ${d.toLocaleTimeString([], TIME)}`;
}

/** The Settings card's last line: when this device last saved a backup file. */
export function lastBackupLine(ms: number | null): string {
  return `Last backup: ${ms === null ? "never" : when(ms)}`;
}

/** How long the backup reminder waits (#243): a backup older than this, or none, is due, and Not
 * now hides the reminder for as long. */
export const REMINDER_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Whether logging a flight now should show the backup reminder (#243, RelReminder): the last
 * backup is more than 30 days old or there has never been one, and Not now isn't still holding it. */
export function reminderDue(lastBackup: number | null, after: number | null, now: number): boolean {
  if (after !== null && now < after) return false;
  return lastBackup === null || now - lastBackup > REMINDER_DAYS * DAY;
}

/** The reminder's line: "Your last backup was on Oct 21, a month ago." or "You haven't saved a
 * backup yet.", then why it matters: in a browser, that clearing site data removes it all; on
 * desktop, that a backup moves progress to another computer or keeps it if this one fails. */
export function reminderLine(lastBackup: number | null, now: number, desktop = false): string {
  const why = desktop
    ? "A backup is how you move your progress to another computer, or keep it if this one fails."
    : "Clearing this browser’s site data removes everything saved here.";
  if (lastBackup === null) return `You haven’t saved a backup yet. ${why}`;
  const day = new Date(lastBackup).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const days = Math.max(0, Math.floor((now - lastBackup) / DAY));
  const months = Math.round(days / 30);
  const years = Math.floor(days / 365);
  const ago =
    years >= 1
      ? years === 1
        ? "a year"
        : `${years} years`
      : months >= 1
        ? months === 1
          ? "a month"
          : `${months} months`
        : days === 1
          ? "a day"
          : `${days} days`;
  return `Your last backup was on ${day}, ${ago} ago. ${why}`;
}

/** The backup file's name, by the day it was saved. */
export function backupFileName(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `involo-backup-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.json`;
}

/** The line under the review's title. */
export function savedByLine(savedAt: number, appVersion: string): string {
  return `Backup saved ${when(savedAt, true)} by Involo ${appVersion}. Untick anything you want to leave as it is.`;
}

/** The line under the title for a file the 3.0 checklist exported, with the file's exported time. */
export function earlierSavedLine(savedAt: number): string {
  return `Saved ${when(savedAt, true)} by the 3.0 checklist.`;
}

/** The muted line under Also in the file for a 3.0 file: what it holds that isn't restored. */
export const EARLIER_LEFT_OUT = "Not brought across: 3.0’s flight log, practice scores and timers.";

/** Where a flight is, as the Packs page shows it: "Departure › Before start, 12 of 40". */
export function placeLine(place: FlightPlace): string {
  return `${place.place}, ${place.done} of ${place.total}`;
}

/** The refusal's first line for a file over the size limit, which is refused unread. */
export const TOO_LARGE = "This file is too large to be an Involo backup.";

/** The refusal's first line; the dialog always adds that nothing changed. */
export function refusalLine(refusal: BackupRefusal): string {
  switch (refusal.kind) {
    case "newer":
      return `It was saved by a newer version of Involo (${refusal.version}). Update Involo, then try again.`;
    case "logFile":
      return "This is a flight log file. Load it from the Flight log page.";
    case "noPackForEarlier":
      return "This file is from the 3.0 checklist, and none of your packs can read it. Add the pack for its aircraft, then try again.";
    default:
      return "This file isn’t an Involo backup, or it’s damaged.";
  }
}

/** The Flight log row's line, or null when the backup adds nothing (then the row is left out). */
export function logLine(flights: number, practice: number): string | null {
  if (flights + practice === 0) return null;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    flights ? n(flights, "flight", "flights") : "",
    practice ? n(practice, "practice result", "practice results") : "",
  ].filter(Boolean);
  const verb = flights + practice === 1 ? "isn’t" : "aren’t";
  return `Adds ${parts.join(" and ")} that ${verb} on this device. Nothing is removed.`;
}

/** One flight in the review: the backup's, and what restoring it does on this device. */
export type ReviewFlight = {
  pack: string;
  name: string;
  /** The pack version the flight was saved with, as the badge shows it ("v0.0.9"); null for a
   * file the 3.0 checklist exported, which has none. */
  version: string | null;
  /** The neutral badge in its place for a 3.0 file: "From the 3.0 checklist". */
  badge: string | null;
  /** "In the backup: …" ("not started" before the first tick), "In the file: …" for a 3.0 file,
   * or null when the device that saved it didn't have the pack. */
  inBackup: string | null;
  /** The flight on this device it replaces ("Replaces the flight on this device: …"), the line
   * that says nothing is replaced, or, for a pack not installed, that it is kept. */
  device: { text: string; replaces: boolean };
  /** "Brought up to version …" when the installed pack is another version. */
  upgrade: string | null;
  installed: boolean;
  /** The catalog entry to download a pack that isn't installed but is in the catalog. */
  download: CatalogEntry | null;
};

/**
 * The review's row for one of the backup's flights. `here` is this device's flight for the pack:
 * where it is, true when one is saved with nothing ticked yet (not started), or null for none.
 */
export function rowFor(
  entry: BackupFlight,
  installed: InstalledPack | undefined,
  here: FlightPlace | true | null,
  catalog: CatalogEntry[],
  earlier: EarlierFile | null = null,
): ReviewFlight {
  const version = entry.flight.packVersion;
  const steps = (n: number) => `${n} ${n === 1 ? "step" : "steps"}`;
  const device = !installed
    ? { text: "Not on this device. The flight is kept and appears when you add the pack.", replaces: false }
    : here === null
      ? { text: "No flight on this device yet, so nothing is replaced.", replaces: false }
      : {
          text: `Replaces the flight on this device: ${here === true ? "not started" : placeLine(here)}`,
          replaces: true,
        };
  return {
    pack: entry.pack,
    name: installed?.summary.name ?? entry.name,
    version: earlier ? null : version,
    badge: earlier ? "From the 3.0 checklist" : null,
    inBackup: earlier
      ? `In the file: ${steps(earlier.ticked)} ticked, ${earlier.skipped} skipped.`
      : Object.keys(entry.flight.session.done).length === 0
        ? "In the backup: not started"
        : entry.place
          ? `In the backup: ${placeLine(entry.place)}`
          : null,
    device,
    upgrade:
      installed && installed.summary.version !== version
        ? `Brought up to version ${installed.summary.version}, with a note on what changed.`
        : null,
    installed: !!installed,
    download:
      installed || entry.source !== "catalog" ? null : (catalog.find((c) => c.id === entry.pack) ?? null),
  };
}
