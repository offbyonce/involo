// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the interface needs from wherever it runs (decisions 0010 and 0012). The web app passes a
// host built on its WebAssembly module and browser APIs; a desktop build would pass one built on
// Tauri commands. Entry points pass it with hostContext(); components read it with getHost().
// Every rule (what shows, what counts, what an action does) is decided behind the host, in Rust.

import type {
  Action,
  AppInfo,
  BackupParts,
  BackupRead,
  CatalogEntry,
  Decoded,
  FlatPack,
  Flight,
  Loaded,
  Log,
  LogChange,
  LogEdit,
  LoggedFlight,
  OpenStep,
  OtherAircraft,
  PackChanges,
  PackSource,
  PackSummary,
  PhaseModel,
  PlanSource,
  PlanValues,
  PracticeResult,
  Rail,
  SavedPlan,
  Settings,
  StepTimer,
  Suggestion,
  Theme,
  ViewFrame,
} from "@involo/bindings";
import { getContext } from "svelte";

export interface Host {
  /** Basic facts for the About box and the window title. */
  appInfo(): Promise<AppInfo>;
  /** Loads a pack installed on this device; it stays loaded for the calls below. */
  loadPack(id: string): Promise<FlatPack>;
  /**
   * The packs the catalog on the app's own site offers (decision 0028). The request carries
   * nothing about the pilot.
   */
  catalog(): Promise<CatalogEntry[]>;
  /** The packs installed on this device. */
  installedPacks(): Promise<InstalledPack[]>;
  /**
   * Checks a pack file the pilot chose with the same checks as `involo-pack check`, and installs
   * it, replacing any version of that pack. A file over the size limit is refused unread.
   */
  installPackFile(file: Blob): Promise<PackInstall>;
  /** Downloads a catalog pack, checks it and its SHA-256, and installs it in the same way. */
  installCatalogPack(entry: CatalogEntry): Promise<PackInstall>;
  /**
   * What changed between the installed version of a pack and the catalog's update (decision
   * 0028): the update is downloaded and checked, not installed. Rejects when it is refused.
   */
  packChanges(entry: CatalogEntry): Promise<PackChanges>;
  /** A saved flight brought in line with the loaded pack's version, through its aliases; the
   * same flight when the versions match. */
  reconcile(pack: string, flight: Flight): Promise<Flight>;
  /** A flight from a backup (#47), brought in line with the loaded pack as `reconcile` does,
   * with an update note when it was saved with another version of the pack. */
  restoreFlight(pack: string, flight: Flight): Promise<Flight>;
  /** Removes an installed pack. Resolves false when the device refused. Its saved flight and
   * plan stay unless removeSaved is called too. */
  removePack(id: string): Promise<boolean>;
  /** Forgets a pack's saved flight and plan on this device. Resolves false when it refused. */
  removeSaved(pack: string): Promise<boolean>;
  newFlight(pack: string): Promise<Flight>;
  /** Applies an action and returns the changed flight. */
  apply(pack: string, flight: Flight, action: Action): Promise<Flight>;
  /** The phase rail for a flight, for the pilot's settings (Full or Essentials). */
  rail(pack: string, flight: Flight, settings: Settings): Promise<Rail>;
  /** One phase as shown: its lists, step states, progress and neighbors. */
  phaseModel(pack: string, flight: Flight, settings: Settings, phase: string): Promise<PhaseModel>;
  /** Open steps: undone steps of started phases; with `before`, only from phases before it. */
  openSteps(pack: string, flight: Flight, settings: Settings, before?: string): Promise<OpenStep[]>;
  /** The answer an option's rule suggests from the flight's values, or null (decision 0027). */
  suggestion(pack: string, flight: Flight, option: string): Promise<Suggestion | null>;
  /** Every step timer in the pack, with when it started and, if paused, the time it had left
   * (#213). */
  timers(pack: string, flight: Flight): Promise<StepTimer[]>;
  /** The seat frame "Where is this?" draws for a step done by `role`, with the pilot's `chosen`
   * seat: the role's seat, then the chosen one, then the first (decision 0029). Null when the
   * pack draws no seat view. */
  seatFrame(pack: string, role: string | null, chosen: string | null): Promise<ViewFrame | null>;
  /**
   * Reads what is saved on this device for a pack from storage (decision 0012); Rust parses each
   * as ready (migrated if older), newer or unreadable, with the saved text so nothing is lost.
   * Null when none.
   */
  readSaved(pack: string): Promise<Saved>;
  /** The packs with a flight saved on this device, installed or not (a flight stays when its
   * pack is removed, and a restore keeps one for a pack not yet added), by id. */
  savedPacks(): Promise<string[]>;
  /** The text of a backup file (#47) with these parts, stamped with this app's version. */
  backupText(parts: BackupParts): Promise<string>;
  /** Reads a file chosen to restore from: the backup with every part migrated, or why it is
   * refused. Changes nothing. */
  readBackup(text: string): Promise<BackupRead>;
  /** The settings saved on this device, read as readSaved reads them; null when none. They
   * belong to no pack, so the app reads them before it opens one. */
  readSettings(): Promise<SavedItem<Settings>>;
  /**
   * Saves the flight or the settings on this device. Resolves to when, in milliseconds; to null
   * when it wasn't stored (storage blocked or full); or to "changed" when another window saved
   * since this one last read or wrote, and then nothing is written: load what is saved instead.
   */
  save(
    pack: string,
    what: "flight" | "settings",
    value: Flight | Settings,
  ): Promise<number | null | "changed">;
  /**
   * Moves saved text the app cannot use aside (kept, not deleted), so a new save can start.
   * Resolves false when its copy couldn't be stored: then nothing was moved.
   */
  setAside(pack: string, what: Kept): Promise<boolean>;
  defaultSettings(): Promise<Settings>;
  /**
   * The latest SimBrief plan for a username or Pilot ID, fetched from the pilot's browser and
   * read into the compact plan (decision 0019); nothing else is kept.
   */
  fetchPlan(user: string): Promise<SavedPlan>;
  /** A saved OFP file the pilot chose, read once on this device into the compact plan. */
  readPlanFile(text: string): Promise<SavedPlan>;
  /** The flight values a plan fills in. */
  planValues(pack: string, plan: SavedPlan): Promise<PlanValues>;
  /** A plan for an aircraft type the pack doesn't cover: what the warning names, or null when the
   * plan's type is one of the pack's (or the plan has no type). */
  otherAircraft(pack: string, plan: SavedPlan): Promise<OtherAircraft | null>;
  /**
   * Reads the plan kept on this device for a pack from storage; Rust parses it as ready, newer or
   * unreadable, with the saved text, so a plan this version can't use is kept and reported
   * (decision 0019). Null when none.
   */
  readPlan(pack: string): Promise<SavedItem<SavedPlan>>;
  /** Keeps the plan on this device, or forgets it (null). */
  savePlan(pack: string, plan: SavedPlan | null): Promise<void>;
  /** A METAR or TAF decoded from the code table. */
  decodeMetar(text: string): Promise<Decoded>;
  decodeTaf(text: string): Promise<Decoded>;
  /** An empty flight log (decision 0026). */
  newLog(): Promise<Log>;
  /**
   * Reads the flight log saved on this device from storage; Rust parses it as ready (migrated if
   * older), newer or unreadable, with the saved text so nothing is lost. Null when none. Never
   * sent anywhere.
   */
  readLog(): Promise<SavedItem<Log>>;
  /** Saves the log on this device; resolves false if the device refused. With `keep` (a flight was
   * just logged), the host asks once to keep its data from being cleared on its own. */
  saveLog(log: Log, keep?: boolean): Promise<boolean>;
  /** The flight as a log entry, logged at `at`. */
  logEntry(
    pack: string,
    flight: Flight,
    settings: Settings,
    plan: PlanSource,
    at: number,
  ): Promise<LoggedFlight>;
  /** A finished practice test as a log entry, with the pack it was taken in (its version, its
   * name and the aircraft's). */
  practiceResult(pack: string, result: FinishedTest): Promise<PracticeResult>;
  /** Applies an edit to the log: add a flight or a practice result, delete a flight, merge a file. */
  editLog(log: Log, edit: LogEdit): Promise<LogChange>;
  /** The log's flights as CSV, one row per flight. */
  logCsv(log: Log): Promise<string>;
  /** The pilot's theme changed (or the app started): a host with a browser tab sets the favicon
   * and theme-color to match (BRAND.md). Optional: a host without one leaves it out. */
  themeChanged?(theme: Theme): void;
}

/** Where an installed pack came from: the Involo catalog, or a file the pilot chose, which is
 * shown as "Not from the Involo catalog" wherever the pack is named (decision 0028). */
export type { PackSource };
/** A practice test as it ended: its title, the right answers out of those answered, and when. */
export type FinishedTest = { title: string; score: number; total: number; at: number };
export type InstalledPack = { summary: PackSummary; source: PackSource; installedAt: number };
/** What installing a pack did: installed (with what changed, when it replaced another version);
 * passed every check but this device didn't keep it
 * (no storage, or storage refused); or refused, with every reason, and nothing kept. */
export type PackInstall =
  /** `changes`: what changed, when it replaced another installed version of the pack. */
  | { state: "installed"; pack: InstalledPack; changes?: PackChanges }
  | { state: "notKept"; pack: InstalledPack }
  | { state: "refused"; reasons: string[] };
export type SavedItem<T> = { loaded: Loaded<T>; text: string } | null;
/** What is saved on this device that the app may have to keep as it is. */
export type Kept = "flight" | "settings" | "plan";
export type Saved = { flight: SavedItem<Flight>; settings: SavedItem<Settings> };

const HOST = Symbol("host");

/** The context to pass to `mount` (or a test's `render`) so components can find the host. */
export function hostContext(host: Host): Map<symbol, Host> {
  return new Map([[HOST, host]]);
}

/** The host the app was mounted with. */
export function getHost(): Host {
  const host = getContext<Host | undefined>(HOST);
  if (!host) throw new Error("the app was mounted without a host");
  return host;
}
