// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Progress, settings and the kept SimBrief plan, saved on this device in browser storage
// (decisions 0012 and 0019). Rust reads what is saved: ready (migrated forward if older), newer or
// unreadable. Saved text the app cannot use is never overwritten or deleted: it stays until the
// pilot starts fresh, and then it is moved aside under its own key. The storage rules (checked
// writes, set-aside, no saving over another window's text) are in saved-store.js.

import type { Flight, SavedPlan, Settings } from "@involo/bindings";
import type { Saved, SavedItem } from "@involo/ui";
import { parseFlight, parseSavedPlan, parseSettings } from "./core";
import { readText, saveOver, setAsideText, writeText } from "./saved-store.js";
import { storageKey } from "./storage-keys.js";

type What = "flight" | "settings" | "plan";

const key = (pack: string, what: What) => storageKey(what === "settings" ? "settings" : `${what}.${pack}`);

/** Browser storage, or null when the browser blocks it (private windows). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The text this window last read or wrote under each key: a save goes only over that. */
const seen = new Map<string, string | null>();

function readSeen(k: string): string | null {
  const s = storage();
  const text = s ? readText(s, k) : null;
  seen.set(k, text);
  return text;
}

export async function readSaved(pack: string): Promise<Saved> {
  const flightText = readSeen(key(pack, "flight"));
  const settingsText = readSeen(key(pack, "settings"));
  return {
    flight: flightText === null ? null : { loaded: await parseFlight(flightText), text: flightText },
    settings:
      settingsText === null ? null : { loaded: await parseSettings(settingsText), text: settingsText },
  };
}

/** The saved settings, read as readSaved reads them. */
export async function readSettings(): Promise<SavedItem<Settings>> {
  const text = readSeen(key("", "settings"));
  return text === null ? null : { loaded: await parseSettings(text), text };
}

/** Forgets a pack's saved flight and plan (Remove, with "Also remove its saved flight"). False
 * when storage refused. */
export async function removeSaved(pack: string): Promise<boolean> {
  const s = storage();
  if (!s) return false;
  try {
    for (const what of ["flight", "plan"] as const) {
      s.removeItem(key(pack, what));
      seen.set(key(pack, what), null);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves progress or settings. When, in milliseconds; null when storage refused it (blocked, full,
 * or it didn't read back); "changed" when another window saved since this one last read or wrote,
 * and then nothing is written.
 */
export async function save(
  pack: string,
  what: "flight" | "settings",
  value: Flight | Settings,
): Promise<number | null | "changed"> {
  const k = key(pack, what);
  const s = storage();
  if (!s) return null;
  const text = JSON.stringify(value);
  const result = saveOver(s, k, text, seen.get(k) ?? null);
  if (result !== "saved") return result === "changed" ? "changed" : null;
  seen.set(k, text);
  // No request for persistent storage here (#69): a first save is no moment to ask, and Firefox
  // asks the pilot with no context. The app asks once a pack is installed and open (#243), and
  // when a flight is logged (decision 0026).
  return Date.now();
}

/** Moves saved text aside; false when its copy couldn't be stored, and then nothing is moved. */
export async function setAside(pack: string, what: What): Promise<boolean> {
  const k = key(pack, what);
  const s = storage();
  if (!s || !setAsideText(s, k)) return false;
  seen.set(k, null);
  return true;
}

/** The kept plan: ready, or newer or unreadable with its text, so it is reported and kept. */
export async function readPlan(pack: string): Promise<SavedItem<SavedPlan>> {
  const s = storage();
  const text = s ? readText(s, key(pack, "plan")) : null;
  return text === null ? null : { loaded: await parseSavedPlan(text), text };
}

export async function savePlan(pack: string, plan: SavedPlan | null): Promise<void> {
  const s = storage();
  if (!s) return;
  // Refused (private window, full): the plan lasts for this visit only.
  if (plan) writeText(s, key(pack, "plan"), JSON.stringify(plan));
  else {
    try {
      s.removeItem(key(pack, "plan"));
    } catch {
      // Blocked: nothing was saved there either.
    }
  }
}

/** The packs with a flight saved on this device, by id; set-aside copies don't count. */
export async function savedPacks(): Promise<string[]> {
  const s = storage();
  if (!s) return [];
  const prefix = storageKey("flight.");
  const ids: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(prefix) && !k.includes(".kept-")) ids.push(k.slice(prefix.length));
    }
  } catch {
    return [];
  }
  return ids.sort();
}
