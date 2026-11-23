// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop host (decision 0031): the interface's host, built on the desktop app's Tauri commands
// (src-tauri/src/commands.rs). Each command wraps one involo-app-core function, as the web app's
// WebAssembly module does, so both apps decide everything the same way. What a webview does as a
// browser does (the SimBrief request, the screen wake lock, the checks around installing a pack
// file) is the web app's own code, shared. Saved items and packs are kept in memory until files on
// disk replace them (#114); the catalog is read with them.

import {
  type Action,
  type AppInfo,
  type BackupRead,
  type CduWalk,
  type Decoded,
  type FieldId,
  type FlatPack,
  type Flight,
  isAppError,
  type Loaded,
  type Log,
  type LogChange,
  type LoggedFlight,
  type OpenStep,
  type OtherAircraft,
  type PackChanges,
  type PackCheck,
  type PackSummary,
  type PhaseModel,
  type Plan,
  type PlanValues,
  type PracticeResult,
  type Rail,
  type SavedPlan,
  type Settings,
  type StepTimer,
  type Suggestion,
  type ViewFrame,
} from "@involo/bindings";
import type { Host, SavedItem } from "@involo/ui";
import { invoke } from "@tauri-apps/api/core";
import { type InstallDeps, installFile } from "../../web/src/pack-install.js";
import { fetchPlanText } from "../../web/src/simbrief-fetch.js";
import { canKeepAwake, keepAwake } from "../../web/src/wake-lock";
import * as memory from "./memory";

/** Calls a command: it answers the value, or rejects with the app's tagged error. */
const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(command, args);

const parseFlight = (json: string) => call<Loaded<Flight>>("parse_flight", { json });
const parseSettings = (json: string) => call<Loaded<Settings>>("parse_settings", { json });
const parsePlan = (text: string) => call<Plan>("parse_plan", { text });
const comparePacks = (old: string, next: string) => call<PackChanges>("compare_packs", { old, new: next });

/** A saved item and Rust's reading of it, or null when nothing is saved under that name. */
async function readItem<T>(name: string, parse: (json: string) => Promise<Loaded<T>>): Promise<SavedItem<T>> {
  const text = memory.saved.get(name);
  return text === undefined ? null : { loaded: await parse(text), text };
}

const flightName = (pack: string) => `flight.${pack}`;
const planName = (pack: string) => `plan.${pack}`;

/** The texts of the installed packs a log text needs to be read (only a format 1 log needs any). */
async function logPackTexts(text: string): Promise<string[]> {
  const ids = await call<string[]>("log_packs", { json: text });
  return ids.flatMap((id) => memory.packs.get(id)?.text ?? []);
}

/** What changed from the installed version of a pack to `text`, another version of it. */
async function changesFrom(summary: PackSummary, text: string): Promise<PackChanges | null> {
  const here = memory.packs.get(summary.id);
  if (!here || here.summary.version === summary.version) return null;
  return comparePacks(here.text, text);
}

/** What installing a pack file needs: Rust's check (the file's bytes go as they are), the packs
 * kept here, the clock, and the comparison with the version it replaces. */
async function installDeps(): Promise<InstallDeps> {
  return {
    limit: await call<number>("pack_file_limit"),
    check: (bytes, sha256) => invoke<PackCheck>("check_pack", bytes, { headers: { sha256 } }),
    keep: async (pack) => {
      memory.packs.set(pack.summary.id, pack);
      return true;
    },
    now: Date.now,
    askToKeep: () => {},
    changes: changesFrom,
  };
}

/** The compact plan from a SimBrief reply or a saved file (decision 0019): the raw text is dropped. */
async function compact(text: string): Promise<SavedPlan> {
  return { format: await call<number>("plan_format"), plan: await parsePlan(text), loadedAt: Date.now() };
}

/** SimBrief's own message in a reply that isn't 2xx (an unknown username, say), or null. */
async function simbriefSays(text: string): Promise<string | null> {
  try {
    await parsePlan(text);
    return null;
  } catch (e) {
    return isAppError(e) && e.message.startsWith("SimBrief says") ? e.message : null;
  }
}

/** The catalog is read from the app's site with files on disk (#114). */
const noCatalog = async (): Promise<never> => {
  throw new Error("The desktop app doesn't read the pack catalog yet.");
};

export const desktopHost: Host = {
  appInfo: () => call<AppInfo>("app_info"),
  loadPack: async (id) => {
    const pack = memory.packs.get(id);
    if (!pack) throw new Error(`The pack ${id} is not installed on this device.`);
    return call<FlatPack>("parse_pack", { json: pack.text });
  },
  catalog: noCatalog,
  installedPacks: async () => [...memory.packs.values()].map(({ text: _, ...pack }) => pack),
  installPackFile: async (file) => installFile(file, await installDeps()),
  installCatalogPack: noCatalog,
  packChanges: noCatalog,
  reconcile: (pack, flight) => call<Flight>("reconcile_flight", { pack, flight }),
  restoreFlight: (pack, flight) => call<Flight>("restore_flight", { pack, flight }),
  removePack: async (id) => {
    memory.packs.delete(id);
    return true;
  },
  removeSaved: async (pack) => {
    memory.saved.delete(flightName(pack));
    memory.saved.delete(planName(pack));
    return true;
  },
  newFlight: (pack) => call<Flight>("new_flight", { pack }),
  apply: (pack, flight, action: Action) => call<Flight>("apply", { pack, flight, action }),
  rail: (pack, flight, settings) => call<Rail>("rail", { pack, flight, settings }),
  phaseModel: (pack, flight, settings, phase) =>
    call<PhaseModel>("phase_model", { pack, flight, settings, phase }),
  openSteps: (pack, flight, settings, before) =>
    call<OpenStep[]>("open_steps", { pack, flight, settings, before: before ?? null }),
  suggestion: (pack, flight, option) => call<Suggestion | null>("suggestion", { pack, flight, option }),
  calculated: (pack, flight) => call<Partial<Record<FieldId, string>>>("calculated", { pack, flight }),
  timers: (pack, flight) => call<StepTimer[]>("timers", { pack, flight }),
  cduWalkthrough: (pack, flight, id) => call<CduWalk | null>("cdu_walkthrough", { pack, flight, id }),
  seatFrame: (pack, role, chosen) => call<ViewFrame | null>("seat_frame", { pack, role, chosen }),
  readSaved: async (pack) => ({
    flight: await readItem(flightName(pack), parseFlight),
    settings: await readItem("settings", parseSettings),
  }),
  savedPacks: async () => memory.savedPacks(),
  backupText: (parts) => call<string>("backup_text", { parts }),
  readBackup: (text) => call<BackupRead>("read_backup", { text }),
  canKeepAwake,
  keepAwake,
  readSettings: () => readItem("settings", parseSettings),
  // One window, and nothing else writes these, so a save never finds another's text.
  save: async (pack, what, value) => {
    memory.saved.set(what === "settings" ? "settings" : flightName(pack), JSON.stringify(value));
    return Date.now();
  },
  setAside: async (pack, what) => {
    memory.setAside(
      what === "settings" ? "settings" : what === "plan" ? planName(pack) : flightName(pack),
      Date.now(),
    );
    return true;
  },
  defaultSettings: () => call<Settings>("default_settings"),
  fetchPlan: async (user) =>
    compact(await fetchPlanText(await call<string>("plan_url", { user }), { own: simbriefSays })),
  readPlanFile: compact,
  planValues: (pack, plan) => call<PlanValues>("plan_values", { pack, plan: plan.plan }),
  otherAircraft: (pack, plan) => call<OtherAircraft | null>("other_aircraft", { pack, plan: plan.plan }),
  readPlan: (pack) =>
    readItem(planName(pack), (json) => call<Loaded<SavedPlan>>("parse_saved_plan", { json })),
  savePlan: async (pack, plan) => {
    if (plan) memory.saved.set(planName(pack), JSON.stringify(plan));
    else memory.saved.delete(planName(pack));
  },
  decodeMetar: (text) => call<Decoded>("decode_metar", { text }),
  decodeTaf: (text) => call<Decoded>("decode_taf", { text }),
  newLog: () => call<Log>("new_log"),
  readLog: async () => {
    const text = memory.saved.get("log");
    if (text === undefined) return null;
    return {
      loaded: await call<Loaded<Log>>("parse_log", { json: text, packs: await logPackTexts(text) }),
      text,
    };
  },
  saveLog: async (log) => {
    memory.saved.set("log", JSON.stringify(log));
    return true;
  },
  logEntry: (pack, flight, settings, plan, at) =>
    call<LoggedFlight>("log_entry", { pack, flight, settings, plan, at }),
  practiceResult: (pack, result) => call<PracticeResult>("practice_result", { pack, result }),
  editLog: async (log, edit) =>
    call<LogChange>("edit_log", {
      log,
      edit,
      packs: edit.type === "merge" ? await logPackTexts(edit.text) : [],
    }),
  logCsv: (log) => call<string>("log_csv", { log }),
  openLink: (url) => call<void>("open_link", { url }),
  saveFile: (name, text) => call<boolean>("save_file", { name, text }),
};
