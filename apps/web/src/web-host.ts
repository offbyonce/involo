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
  decodeMetar,
  decodeTaf,
  defaultSettings,
  editLog,
  loadLog,
  loadPack,
  logCsv,
  logEntry,
  newFlight,
  newLog,
  openSteps,
  parsePlan,
  phaseView,
  planFormat,
  planUrl,
  planValues,
  rail,
  suggestion,
} from "./core";
import { readLog, writeLog } from "./log-store.js";
import { loadPlan, loadSaved, save, savePlan, setAside } from "./saved";
import { fetchPlanText } from "./simbrief-fetch.js";

/** Whether the browser has been asked this visit to keep the log (decision 0026). */
let keepAsked = false;

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

async function fetchText(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.text();
}

export const webHost: Host = {
  appInfo,
  packs: async () => JSON.parse(await fetchText("../packs/index.json")) as PackSummary[],
  loadPack: async (id) => loadPack(await fetchText(`../packs/${encodeURIComponent(id)}.json`)),
  newFlight,
  apply,
  rail,
  phaseView,
  openSteps,
  suggestion,
  loadSaved,
  save,
  setAside,
  defaultSettings,
  themeChanged: (theme) => applyBrandTheme(theme),
  fetchPlan: async (user) => compact(await fetchPlanText(await planUrl(user), { own: simbriefSays })),
  readPlanFile: compact,
  planValues: (pack, plan) => planValues(pack, plan.plan),
  loadPlan,
  savePlan,
  decodeMetar,
  decodeTaf,
  newLog,
  loadLog: async () => {
    let text: string | null;
    try {
      text = await readLog();
    } catch (e) {
      // Kept as unreadable, so nothing is saved over a log that may be there.
      return {
        loaded: { state: "unreadable", reason: e instanceof Error ? e.message : String(e) },
        text: "",
      };
    }
    return text === null ? null : { loaded: await loadLog(text), text };
  },
  saveLog: async (log, keep) => {
    const saved = await writeLog(JSON.stringify(log));
    // The first time a flight is logged, ask the browser not to clear the log on its own. If it
    // refuses, nothing changes: the log page's note says to export now and then.
    if (keep && !keepAsked) {
      keepAsked = true;
      void navigator.storage?.persist?.().catch(() => false);
    }
    return saved;
  },
  logEntry,
  editLog,
  logCsv,
};
