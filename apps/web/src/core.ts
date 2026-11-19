// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Typed calls into the WebAssembly module (crates/involo-web-host). Every export answers with a JSON
// Reply; a reply with an error is thrown as the tagged AppError, so callers can branch on `kind`.
// Run `just wasm` to build the module into ./wasm.

import type {
  Action,
  AppInfo,
  CatalogEntry,
  Checklist,
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
  PackCheck,
  PhaseModel,
  Plan,
  PlanSource,
  PlanValues,
  Rail,
  Reply,
  SavedPlan,
  Settings,
  Suggestion,
} from "@involo/bindings";
import init, * as wasm from "./wasm/involo_web_host.js";

let ready: Promise<unknown> | undefined;

/** Loads the module once; later calls wait for the same load. */
function load(): Promise<unknown> {
  ready ??= init();
  return ready;
}

function unwrap<T>(answer: string): T {
  const reply = JSON.parse(answer) as Reply<T>;
  if ("error" in reply) throw reply.error;
  return reply.ok;
}

export async function appInfo(): Promise<AppInfo> {
  await load();
  return unwrap<AppInfo>(wasm.app_info());
}

export async function exampleChecklist(): Promise<Checklist> {
  await load();
  return unwrap<Checklist>(wasm.example_checklist());
}

/** Reads a flattened pack's JSON text, as written by `involo-pack build`; the module keeps it loaded. */
export async function parsePack(json: string): Promise<FlatPack> {
  await load();
  return unwrap<FlatPack>(wasm.parse_pack(json));
}

/**
 * Checks a pack file before it is installed (decision 0028): the summary, or every reason it is
 * refused. `sha256` is the catalog's hash for a download; leave it out for a file the pilot chose.
 */
export async function checkPack(bytes: Uint8Array, sha256 = ""): Promise<PackCheck> {
  await load();
  return unwrap<PackCheck>(wasm.check_pack(bytes, sha256));
}

/** The largest pack file the app reads, in bytes. */
export async function packFileLimit(): Promise<number> {
  await load();
  return wasm.pack_file_limit();
}

/** What changed between two versions of a pack, from their files' text (decision 0028). */
export async function comparePacks(old: string, next: string): Promise<PackChanges> {
  await load();
  return unwrap<PackChanges>(wasm.compare_packs(old, next));
}

/** A saved flight brought in line with the loaded pack's version, through its aliases. */
export async function reconcile(pack: string, flight: Flight): Promise<Flight> {
  await load();
  return unwrap<Flight>(wasm.reconcile_flight(pack, JSON.stringify(flight)));
}

/** Reads the pack catalog, `packs/index.json`. */
export async function parseCatalog(json: string): Promise<CatalogEntry[]> {
  await load();
  return unwrap<CatalogEntry[]>(wasm.parse_catalog(json));
}

export async function newFlight(pack: string): Promise<Flight> {
  await load();
  return unwrap<Flight>(wasm.new_flight(pack));
}

export async function apply(pack: string, flight: Flight, action: Action): Promise<Flight> {
  await load();
  return unwrap<Flight>(wasm.apply(pack, JSON.stringify(flight), JSON.stringify(action)));
}

export async function rail(pack: string, flight: Flight, settings: Settings): Promise<Rail> {
  await load();
  return unwrap<Rail>(wasm.rail(pack, JSON.stringify(flight), JSON.stringify(settings)));
}

export async function openSteps(
  pack: string,
  flight: Flight,
  settings: Settings,
  before?: string,
): Promise<OpenStep[]> {
  await load();
  return unwrap<OpenStep[]>(
    wasm.open_steps(pack, JSON.stringify(flight), JSON.stringify(settings), before ?? ""),
  );
}

/** The answer an option's rule suggests for this flight, or null (decision 0027). */
export async function suggestion(pack: string, flight: Flight, option: string): Promise<Suggestion | null> {
  await load();
  return unwrap<Suggestion | null>(wasm.suggestion(pack, JSON.stringify(flight), option));
}

export async function phaseModel(
  pack: string,
  flight: Flight,
  settings: Settings,
  phase: string,
): Promise<PhaseModel> {
  await load();
  return unwrap<PhaseModel>(wasm.phase_model(pack, JSON.stringify(flight), JSON.stringify(settings), phase));
}

/** Reads a saved flight: ready (migrated if older), newer, or unreadable (decision 0012). */
export async function parseFlight(json: string): Promise<Loaded<Flight>> {
  await load();
  return unwrap<Loaded<Flight>>(wasm.parse_flight(json));
}

/** Reads saved settings: ready (migrated if older), newer, or unreadable (decision 0012). */
export async function parseSettings(json: string): Promise<Loaded<Settings>> {
  await load();
  return unwrap<Loaded<Settings>>(wasm.parse_settings(json));
}

export async function defaultSettings(): Promise<Settings> {
  await load();
  return unwrap<Settings>(wasm.default_settings());
}

/** The address of the latest SimBrief plan for a username or Pilot ID. */
export async function planUrl(user: string): Promise<string> {
  await load();
  return unwrap<string>(wasm.plan_url(user));
}

/** Reads a SimBrief plan: fetched JSON, or a saved JSON or XML file. */
export async function parsePlan(text: string): Promise<Plan> {
  await load();
  return unwrap<Plan>(wasm.parse_plan(text));
}

/** Reads the saved SimBrief plan (decision 0019). */
export async function parseSavedPlan(json: string): Promise<Loaded<SavedPlan>> {
  await load();
  return unwrap<Loaded<SavedPlan>>(wasm.parse_saved_plan(json));
}

/** The saved plan's format number. */
export async function planFormat(): Promise<number> {
  await load();
  return wasm.plan_format();
}

/** A METAR decoded from the code table. */
export async function decodeMetar(text: string): Promise<Decoded> {
  await load();
  return unwrap<Decoded>(wasm.decode_metar(text));
}

/** A TAF decoded from the code table. */
export async function decodeTaf(text: string): Promise<Decoded> {
  await load();
  return unwrap<Decoded>(wasm.decode_taf(text));
}

/** A plan for an aircraft type the pack doesn't cover: what the warning names, or null (0028). */
export async function otherAircraft(pack: string, plan: Plan): Promise<OtherAircraft | null> {
  await load();
  return unwrap<OtherAircraft | null>(wasm.other_aircraft(pack, JSON.stringify(plan)));
}

/** The flight values a plan fills in (decision 0019). */
export async function planValues(pack: string, plan: Plan): Promise<PlanValues> {
  await load();
  return unwrap<PlanValues>(wasm.plan_values(pack, JSON.stringify(plan)));
}

/** An empty flight log (decision 0026). */
export async function newLog(): Promise<Log> {
  await load();
  return unwrap<Log>(wasm.new_log());
}

/** The installed packs whose texts reading this log text needs: any only for a format 1 log, whose
 * entries are named with their pack's glossary. */
export async function logPacks(json: string): Promise<string[]> {
  await load();
  return unwrap<string[]>(wasm.log_packs(json));
}

/** Reads the saved flight log: ready (migrated if older), newer, or unreadable. `packs` are the
 * texts of the installed packs `logPacks` named. */
export async function parseLog(json: string, packs: string[] = []): Promise<Loaded<Log>> {
  await load();
  return unwrap<Loaded<Log>>(wasm.parse_log(json, JSON.stringify(packs)));
}

/** The flight as a log entry, logged at `at`. */
export async function logEntry(
  pack: string,
  flight: Flight,
  settings: Settings,
  plan: PlanSource,
  at: number,
): Promise<LoggedFlight> {
  await load();
  return unwrap<LoggedFlight>(
    wasm.log_entry(
      pack,
      JSON.stringify(flight),
      JSON.stringify(settings),
      JSON.stringify(plan),
      JSON.stringify(at),
    ),
  );
}

/** Applies an edit to the log: add, delete, or merge a log file. `packs` are the texts of the
 * installed packs `logPacks` named for a merged file. */
export async function editLog(log: Log, edit: LogEdit, packs: string[] = []): Promise<LogChange> {
  await load();
  return unwrap<LogChange>(wasm.edit_log(JSON.stringify(log), JSON.stringify(edit), JSON.stringify(packs)));
}

/** The log's flights as CSV. */
export async function logCsv(log: Log): Promise<string> {
  await load();
  return unwrap<string>(wasm.log_csv(JSON.stringify(log)));
}
