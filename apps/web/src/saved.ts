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

let persistAsked = false;

export async function readSaved(pack: string): Promise<Saved> {
  const flightText = readSeen(key(pack, "flight"));
  const settingsText = readSeen(key(pack, "settings"));
  return {
    flight: flightText === null ? null : { loaded: await parseFlight(flightText), text: flightText },
    settings:
      settingsText === null ? null : { loaded: await parseSettings(settingsText), text: settingsText },
  };
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
  // Ask once for storage the browser will not clear on its own.
  if (!persistAsked) {
    persistAsked = true;
    void navigator.storage?.persist?.().catch(() => false);
  }
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
