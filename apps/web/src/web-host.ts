// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The web host: the interface's host, built on the WebAssembly module (./core.ts) and browser
// APIs (decisions 0010 and 0012). Packs and their index are files beside the app, written by
// `involo-pack build`; this page is app/index.html, so they are one folder up.

import { isAppError, type PackSummary, type SavedPlan } from "@involo/bindings";
import type { Host } from "@involo/ui";
import { applyBrandTheme } from "./brand-theme";
import {
  appInfo,
  apply,
  checkPack,
  decodeMetar,
  decodeTaf,
  defaultSettings,
  editLog,
  logCsv,
  logEntry,
  newFlight,
  newLog,
  openSteps,
  packFileLimit,
  parseCatalog,
  parseLog,
  parsePack,
  parsePlan,
  phaseModel,
  planFormat,
  planUrl,
  planValues,
  rail,
  suggestion,
} from "./core";
import { readLog as readLogText, writeLog } from "./log-store.js";
import {
  type InstallDeps,
  installFile,
  installFromCatalog,
  openFromCatalog,
  readCatalog,
} from "./pack-install.js";
import { deletePack, readPacks, readPackText, writePack } from "./pack-store.js";
import { readPlan, readSaved, save, savePlan, setAside } from "./saved";
import { fetchPlanText } from "./simbrief-fetch.js";

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

/** What installing a pack needs: Rust's check, the pack store, the clock. */
async function installDeps(): Promise<InstallDeps> {
  return { limit: await packFileLimit(), check: checkPack, keep: writePack, now: Date.now, askToKeep };
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

export const webHost: Host = {
  appInfo,
  // Until the Packs page (#103): the installed packs, or else the catalog's.
  packs: async () => {
    const installed = await readPacks().catch(() => []);
    if (installed.length > 0) return installed.map((p) => p.summary);
    return (await readCatalog({ fetch: fetchOwn, parse: parseCatalog })).map(
      (e): PackSummary => ({
        id: e.id,
        name: e.name,
        version: e.version,
        kind: "aircraft",
        aircraft: e.aircraft,
      }),
    );
  },
  loadPack: async (id) => {
    const text = await readPackText(id).catch(() => null);
    if (text !== null) return parsePack(text);
    const entry = (await readCatalog({ fetch: fetchOwn, parse: parseCatalog })).find((e) => e.id === id);
    if (!entry) throw new Error(`The pack ${id} is not in the catalog.`);
    const opened = await openFromCatalog(entry, { ...(await installDeps()), fetch: fetchOwn });
    if (opened.outcome.state === "refused" || opened.text === null)
      throw new Error(
        `${entry.name} could not be installed: ${opened.outcome.state === "refused" ? opened.outcome.reasons.join(" ") : ""}`,
      );
    return parsePack(opened.text);
  },
  catalog: () => readCatalog({ fetch: fetchOwn, parse: parseCatalog }),
  installedPacks: () => readPacks(),
  installPackFile: async (file) => installFile(file, await installDeps()),
  installCatalogPack: async (entry) =>
    installFromCatalog(entry, { ...(await installDeps()), fetch: fetchOwn }),
  removePack: (id) => deletePack(id),
  loadInstalledPack: async (id) => {
    const text = await readPackText(id);
    if (text === null) throw new Error(`The pack ${id} is not installed on this device.`);
    return parsePack(text);
  },
  newFlight,
  apply,
  rail,
  phaseModel,
  openSteps,
  suggestion,
  readSaved,
  save,
  setAside,
  defaultSettings,
  themeChanged: (theme) => applyBrandTheme(theme),
  fetchPlan: async (user) => compact(await fetchPlanText(await planUrl(user), { own: simbriefSays })),
  readPlanFile: compact,
  planValues: (pack, plan) => planValues(pack, plan.plan),
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
    return text === null ? null : { loaded: await parseLog(text), text };
  },
  saveLog: async (log, keep) => {
    const saved = await writeLog(JSON.stringify(log));
    // The first time a flight is logged, ask the browser not to clear the log on its own. If it
    // refuses, nothing changes: the log page's note says to export now and then.
    if (keep) askToKeep();
    return saved;
  },
  logEntry,
  editLog,
  logCsv,
};
