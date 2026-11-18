// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the interface needs from wherever it runs (decisions 0010 and 0012). The web app passes a
// host built on its WebAssembly module and browser APIs; a desktop build would pass one built on
// Tauri commands. Entry points pass it with hostContext(); components read it with getHost().
// Every rule (what shows, what counts, what an action does) is decided behind the host, in Rust.

import type {
  Action,
  AppInfo,
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
  PackSummary,
  PhaseModel,
  PlanSource,
  PlanValues,
  Rail,
  SavedPlan,
  Settings,
  Suggestion,
  Theme,
} from "@involo/bindings";
import { getContext } from "svelte";

export interface Host {
  /** Basic facts for the About box and the window title. */
  appInfo(): Promise<AppInfo>;
  /** The packs this build offers. */
  packs(): Promise<PackSummary[]>;
  /** Loads a pack; it stays loaded for the calls below. */
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
  /** Removes an installed pack. Resolves false when the device refused. */
  removePack(id: string): Promise<boolean>;
  /** Loads an installed pack from this device; it stays loaded for the calls below. */
  loadInstalledPack(id: string): Promise<FlatPack>;
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
  /**
   * Reads what is saved on this device for a pack from storage (decision 0012); Rust parses each
   * as ready (migrated if older), newer or unreadable, with the saved text so nothing is lost.
   * Null when none.
   */
  readSaved(pack: string): Promise<Saved>;
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
export type PackSource = "catalog" | "file";
export type InstalledPack = { summary: PackSummary; source: PackSource; installedAt: number };
/** What installing a pack did: installed; passed every check but this device didn't keep it
 * (no storage, or storage refused); or refused, with every reason, and nothing kept. */
export type PackInstall =
  | { state: "installed"; pack: InstalledPack }
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
