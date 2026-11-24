// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop host (decision 0031): the interface's host, built on the desktop app's Tauri commands
// (src-tauri/src/commands.rs). Each command wraps one involo-app-core function, as the web app's
// WebAssembly module does, so both apps decide everything the same way. Saved items and installed
// packs are files in the app's data folder (./files.ts), in the web app's formats. What a webview
// does as a browser does (the SimBrief request, the screen wake lock, the catalog, and the checks
// around installing a pack) is the web app's own code, shared, with the catalog read on the site.

import {
  type Action,
  type AppInfo,
  type BackupRead,
  type CatalogEntry,
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
  type NewerRelease,
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
import { keepingLastDownload } from "../../web/src/pack-fetch";
import {
  downloadPack,
  type InstallDeps,
  installFile,
  installFromCatalog,
  readCatalog,
} from "../../web/src/pack-install.js";
import { fetchPlanText } from "../../web/src/simbrief-fetch.js";
import { canKeepAwake, keepAwake } from "../../web/src/wake-lock";
import * as files from "./files";

/** Calls a command: it answers the value, or rejects with the app's tagged error. */
const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(command, args);

const parseFlight = (json: string) => call<Loaded<Flight>>("parse_flight", { json });
const parseSettings = (json: string) => call<Loaded<Settings>>("parse_settings", { json });
const parsePlan = (text: string) => call<Plan>("parse_plan", { text });
const comparePacks = (old: string, next: string) => call<PackChanges>("compare_packs", { old, new: next });

/** A saved item and Rust's reading of it, or null when nothing is saved under that name. A file
 * that is there but can't be read counts as unreadable, so nothing is saved over it. */
async function readItem<T>(name: string, parse: (json: string) => Promise<Loaded<T>>): Promise<SavedItem<T>> {
  let text: string | null;
  try {
    text = await files.read(name);
  } catch (e) {
    return { loaded: { state: "unreadable", reason: String(e) }, text: "" };
  }
  return text === null ? null : { loaded: await parse(text), text };
}

/** The file for a pack's saved item. */
const itemName = (pack: string, what: "flight" | "settings" | "plan") =>
  what === "settings" ? files.names.settings : files.names[what](pack);

/** The app's site, where the catalog is (decision 0028): the web app reads it beside itself, the
 * desktop app from there. */
export const SITE = "https://offbyonce.github.io/involo/";
/** The browser's fetch, reading the catalog's addresses (`packs/…`) on the site. */
const siteFetch: typeof fetch = (input, init) => fetch(new URL(String(input), SITE), init);
/** Pack downloads, keeping the last one for Update. */
const fetchPack = keepingLastDownload(siteFetch);

/** GitHub's latest release of the app (#116): asked at launch for the update check. */
export const LATEST_RELEASE = "https://api.github.com/repos/offbyonce/involo/releases/latest";

/** The update check: GitHub's latest release, when Rust finds it newer than this app. Null
 * offline, on a reply that isn't 2xx, or one Rust can't read: then nothing shows. The request
 * carries nothing about the pilot: no cookies, no referrer and nothing in the address. */
async function updateAvailable(): Promise<NewerRelease | null> {
  try {
    const response = await fetch(LATEST_RELEASE, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    return await call<NewerRelease | null>("newer_release", { reply: await response.text() });
  } catch {
    return null;
  }
}

/** The texts of the installed packs a log text needs to be read (only a format 1 log needs any). */
async function logPackTexts(text: string): Promise<string[]> {
  const ids = await call<string[]>("log_packs", { json: text });
  const texts = await Promise.all(ids.map((id) => files.packText(id)));
  return texts.filter((t): t is string => t !== null);
}

/** What changed from the installed version of a pack to `text`, another version of it. */
async function changesFrom(summary: PackSummary, text: string): Promise<PackChanges | null> {
  const here = (await files.installedPacks()).find((p) => p.summary.id === summary.id);
  if (!here || here.summary.version === summary.version) return null;
  const old = await files.packText(summary.id);
  return old === null ? null : comparePacks(old, text);
}

/** What installing a pack needs: Rust's check (the file's bytes go as they are), the packs folder,
 * the clock, and the comparison with the version it replaces. */
async function installDeps(): Promise<InstallDeps> {
  return {
    limit: await call<number>("pack_file_limit"),
    check: (bytes, sha256) => invoke<PackCheck>("check_pack", bytes, { headers: { sha256 } }),
    keep: files.keepPack,
    now: Date.now,
    // Files on disk are never cleared by the system, so there is nothing to ask.
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

export const desktopHost: Host = {
  desktop: true,
  appInfo: () => call<AppInfo>("app_info"),
  loadPack: async (id) => {
    const text = await files.packText(id);
    if (text === null) throw new Error(`The pack ${id} is not installed on this computer.`);
    return call<FlatPack>("parse_pack", { json: text });
  },
  catalog: () =>
    readCatalog({ fetch: siteFetch, parse: (json) => call<CatalogEntry[]>("parse_catalog", { json }) }),
  installedPacks: files.installedPacks,
  installPackFile: async (file) => installFile(file, await installDeps()),
  installCatalogPack: async (entry) =>
    installFromCatalog(entry, { ...(await installDeps()), fetch: fetchPack }),
  packChanges: async (entry) => {
    const installed = await files.packText(entry.id);
    if (installed === null) throw new Error(`The pack ${entry.id} is not installed on this computer.`);
    const got = await downloadPack(entry, { ...(await installDeps()), fetch: fetchPack });
    if (got.state === "refused") throw new Error(got.reasons.join(" "));
    return comparePacks(installed, new TextDecoder().decode(got.bytes));
  },
  reconcile: (pack, flight) => call<Flight>("reconcile_flight", { pack, flight }),
  restoreFlight: (pack, flight) => call<Flight>("restore_flight", { pack, flight }),
  removePack: files.removePack,
  removeSaved: async (pack) => {
    try {
      await files.remove(files.names.flight(pack));
      await files.remove(files.names.plan(pack));
      return true;
    } catch {
      return false;
    }
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
    flight: await readItem(files.names.flight(pack), parseFlight),
    settings: await readItem(files.names.settings, parseSettings),
  }),
  savedPacks: () => files.savedPacks().catch(() => []),
  backupText: (parts) => call<string>("backup_text", { parts }),
  readBackup: (text) => call<BackupRead>("read_backup", { text }),
  canKeepAwake,
  keepAwake,
  readSettings: () => readItem(files.names.settings, parseSettings),
  // One window (the single-instance plugin), and nothing else writes these files, so a save never
  // finds another window's text: never "changed".
  save: async (pack, what, value) => {
    try {
      await files.write(itemName(pack, what), JSON.stringify(value));
      return Date.now();
    } catch {
      return null;
    }
  },
  setAside: async (pack, what) => {
    try {
      await files.setAside(itemName(pack, what));
      return true;
    } catch {
      return false;
    }
  },
  defaultSettings: () => call<Settings>("default_settings"),
  fetchPlan: async (user) =>
    compact(await fetchPlanText(await call<string>("plan_url", { user }), { own: simbriefSays })),
  readPlanFile: compact,
  planValues: (pack, plan) => call<PlanValues>("plan_values", { pack, plan: plan.plan }),
  otherAircraft: (pack, plan) => call<OtherAircraft | null>("other_aircraft", { pack, plan: plan.plan }),
  readPlan: (pack) =>
    readItem(files.names.plan(pack), (json) => call<Loaded<SavedPlan>>("parse_saved_plan", { json })),
  // Not kept (the disk refused): the plan lasts while the app is open, as on the web.
  savePlan: async (pack, plan) => {
    const name = files.names.plan(pack);
    await (plan ? files.write(name, JSON.stringify(plan)) : files.remove(name)).catch(() => {});
  },
  decodeMetar: (text) => call<Decoded>("decode_metar", { text }),
  decodeTaf: (text) => call<Decoded>("decode_taf", { text }),
  newLog: () => call<Log>("new_log"),
  readLog: async () => {
    let text: string | null;
    try {
      text = await files.read(files.names.log);
    } catch (e) {
      // Kept as unreadable, so nothing is saved over a log that may be there.
      return { loaded: { state: "unreadable", reason: String(e) }, text: "" };
    }
    if (text === null) return null;
    return {
      loaded: await call<Loaded<Log>>("parse_log", { json: text, packs: await logPackTexts(text) }),
      text,
    };
  },
  saveLog: async (log) => {
    try {
      await files.write(files.names.log, JSON.stringify(log));
      return true;
    } catch {
      return false;
    }
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
  updateAvailable,
  openLink: (url) => call<void>("open_link", { url }),
  saveFile: (name, text) => call<boolean>("save_file", { name, text }),
};
