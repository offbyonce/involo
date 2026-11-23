// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The web host: the interface's host, built on the WebAssembly module (./core.ts) and browser
// APIs (decisions 0010 and 0012). Packs and their index are files beside the app, written by
// `involo-pack build`, in packs/ beside this page, the site's front page.

import { isAppError, type PackChanges, type PackSummary, type SavedPlan } from "@involo/bindings";
import { downloadFile, type Host } from "@involo/ui";
import { applyBrandTheme } from "./brand-theme";
import {
  appInfo,
  apply,
  backupText,
  calculated,
  cduWalkthrough,
  checkPack,
  comparePacks,
  decodeMetar,
  decodeTaf,
  defaultSettings,
  editLog,
  logCsv,
  logEntry,
  logPacks,
  newFlight,
  newLog,
  openSteps,
  otherAircraft,
  packFileLimit,
  parseCatalog,
  parseLog,
  parsePack,
  parsePlan,
  phaseModel,
  planFormat,
  planUrl,
  planValues,
  practiceResult,
  rail,
  readBackup,
  reconcile,
  restoreFlight,
  seatFrame,
  suggestion,
  timers,
} from "./core";
import { readLog as readLogText, writeLog } from "./log-store.js";
import {
  downloadPack,
  type InstallDeps,
  installFile,
  installFromCatalog,
  readCatalog,
} from "./pack-install.js";
import { deletePack, readPacks, readPackText, writePack } from "./pack-store.js";
import {
  readPlan,
  readSaved,
  readSettings,
  removeSaved,
  save,
  savedPacks,
  savePlan,
  setAside,
} from "./saved";
import { fetchPlanText } from "./simbrief-fetch.js";
import { canKeepAwake, keepAwake } from "./wake-lock";

/** Whether the browser has been asked this visit to keep the site's data: the log (decision
 * 0026) and the installed packs (decision 0028). */
let keepAsked = false;

function askToKeep(): void {
  if (keepAsked) return;
  keepAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** The browser's fetch, called on its own (it refuses to run as another object's method). */
const fetchOwn: typeof fetch = (input, init) => fetch(input, init);

/** The last pack file downloaded, by address: What's new downloads an update to compare it, and
 * Update then installs the same bytes without downloading them again. Each pack version has its
 * own address, so the bytes never go stale. */
let lastDownload: { url: string; bytes: ArrayBuffer } | null = null;
const fetchPack: typeof fetch = async (input, init) => {
  const url = String(input);
  if (lastDownload?.url === url) return new Response(lastDownload.bytes.slice(0));
  const response = await fetch(input, init);
  if (!response.ok) return response;
  const bytes = await response.arrayBuffer();
  lastDownload = { url, bytes };
  return new Response(bytes.slice(0), { status: response.status, headers: response.headers });
};

/** The texts of the installed packs a log text needs to be read (`logPacks`: only a format 1 log
 * needs any). A pack that isn't installed, or can't be read, is left out: its entries are named
 * without its glossary. */
async function logPackTexts(text: string): Promise<string[]> {
  const ids = await logPacks(text);
  const texts = await Promise.all(ids.map((id) => readPackText(id).catch(() => null)));
  return texts.filter((t): t is string => t !== null);
}

/** What changed from the installed version of a pack to `text`, another version of it. */
async function changesFrom(summary: PackSummary, text: string): Promise<PackChanges | null> {
  const installed = await readPacks().catch(() => []);
  const here = installed.find((p) => p.summary.id === summary.id);
  if (!here || here.summary.version === summary.version) return null;
  const old = await readPackText(summary.id);
  return old === null ? null : comparePacks(old, text);
}

/** What installing a pack needs: Rust's check, the pack store, the clock, and the comparison
 * with the version it replaces. */
async function installDeps(): Promise<InstallDeps> {
  return {
    limit: await packFileLimit(),
    check: checkPack,
    keep: writePack,
    now: Date.now,
    askToKeep,
    changes: changesFrom,
  };
}

/** The compact plan from a SimBrief reply or a saved file (decision 0019): the raw text is dropped. */
async function compact(text: string): Promise<SavedPlan> {
  return { format: await planFormat(), plan: await parsePlan(text), loadedAt: Date.now() };
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

/** Asks the browser to keep this site's data (#243): already kept, or kept now. */
async function persistStorage(): Promise<boolean> {
  const storage = navigator.storage;
  if (!storage?.persist) return false;
  return (await storage.persisted?.()) || (await storage.persist());
}

export const webHost: Host = {
  appInfo,
  catalog: () => readCatalog({ fetch: fetchOwn, parse: parseCatalog }),
  installedPacks: () => readPacks(),
  installPackFile: async (file) => installFile(file, await installDeps()),
  installCatalogPack: async (entry) =>
    installFromCatalog(entry, { ...(await installDeps()), fetch: fetchPack }),
  packChanges: async (entry) => {
    const installed = await readPackText(entry.id);
    if (installed === null) throw new Error(`The pack ${entry.id} is not installed on this device.`);
    const got = await downloadPack(entry, { ...(await installDeps()), fetch: fetchPack });
    if (got.state === "refused") throw new Error(got.reasons.join(" "));
    return comparePacks(installed, new TextDecoder().decode(got.bytes));
  },
  reconcile,
  restoreFlight,
  removePack: (id) => deletePack(id),
  removeSaved,
  loadPack: async (id) => {
    const text = await readPackText(id);
    if (text === null) throw new Error(`The pack ${id} is not installed on this device.`);
    return parsePack(text);
  },
  newFlight,
  apply,
  rail,
  phaseModel,
  openSteps,
  seatFrame,
  suggestion,
  calculated,
  timers,
  cduWalkthrough,
  readSaved,
  savedPacks,
  backupText,
  readBackup,
  persistStorage,
  canKeepAwake,
  keepAwake,
  readSettings,
  save,
  setAside,
  defaultSettings,
  themeChanged: (theme) => applyBrandTheme(theme),
  fetchPlan: async (user) => compact(await fetchPlanText(await planUrl(user), { own: simbriefSays })),
  readPlanFile: compact,
  planValues: (pack, plan) => planValues(pack, plan.plan),
  otherAircraft: (pack, plan) => otherAircraft(pack, plan.plan),
  readPlan,
  savePlan,
  decodeMetar,
  decodeTaf,
  newLog,
  readLog: async () => {
    let text: string | null;
    try {
      text = await readLogText();
    } catch (e) {
      // Kept as unreadable, so nothing is saved over a log that may be there.
      return {
        loaded: { state: "unreadable", reason: e instanceof Error ? e.message : String(e) },
        text: "",
      };
    }
    return text === null ? null : { loaded: await parseLog(text, await logPackTexts(text)), text };
  },
  saveLog: async (log, keep) => {
    const saved = await writeLog(JSON.stringify(log));
    // The first time a flight is logged, ask the browser not to clear the log on its own. If it
    // refuses, nothing changes: the log page's note says to export now and then.
    if (keep) askToKeep();
    return saved;
  },
  logEntry,
  practiceResult,
  editLog: async (log, edit) =>
    editLog(log, edit, edit.type === "merge" ? await logPackTexts(edit.text) : []),
  logCsv,
  openLink: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  saveFile: async (name, text, type) => downloadFile(name, text, type),
};
