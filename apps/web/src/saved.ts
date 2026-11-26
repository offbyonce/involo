// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Progress, settings and the kept SimBrief plan, saved on this device in browser storage
// (decisions 0012 and 0019). Rust reads what is saved: ready (migrated forward if older), newer or
// unreadable. Saved text the app cannot use is never overwritten or deleted: it stays until the
// pilot starts fresh, and then it is moved aside under its own key. The storage itself (checked
// writes, set-aside, no saving over another window's text, the names) is saved-store.js.

import type { Flight, SavedPlan, Settings } from "@involo/bindings";
import type { Saved, SavedItem } from "@involo/ui";
import { parseFlight, parseSavedPlan, parseSettings } from "./core";
import { browserStorage, names, savedStore } from "./saved-store.js";

const store = savedStore(browserStorage);

/** The name a pack's saved item is kept under; the settings are the same for every pack. */
const itemName = (pack: string, what: "flight" | "settings" | "plan") =>
  what === "settings" ? names.settings : names[what](pack);

export async function readSaved(pack: string): Promise<Saved> {
  const flightText = store.read(names.flight(pack));
  const settingsText = store.read(names.settings);
  return {
    flight: flightText === null ? null : { loaded: await parseFlight(flightText), text: flightText },
    settings:
      settingsText === null ? null : { loaded: await parseSettings(settingsText), text: settingsText },
  };
}

/** The saved settings, read as readSaved reads them. */
export async function readSettings(): Promise<SavedItem<Settings>> {
  const text = store.read(names.settings);
  return text === null ? null : { loaded: await parseSettings(text), text };
}

/** Forgets a pack's saved flight and plan (Remove, with "Also remove its saved flight"). False
 * when storage refused. */
export async function removeSaved(pack: string): Promise<boolean> {
  return store.remove(names.flight(pack)) && store.remove(names.plan(pack));
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
  const result = store.save(itemName(pack, what), JSON.stringify(value));
  if (result !== "saved") return result === "changed" ? "changed" : null;
  // No request for persistent storage here (#69): a first save is no moment to ask, and Firefox
  // asks the pilot with no context. The app asks once a pack is installed and open (#243), and
  // when a flight is logged (decision 0026).
  return Date.now();
}

/** Moves saved text aside; false when its copy couldn't be stored, and then nothing is moved. */
export async function setAside(pack: string, what: "flight" | "settings" | "plan"): Promise<boolean> {
  return store.setAside(itemName(pack, what));
}

/** The kept plan: ready, or newer or unreadable with its text, so it is reported and kept. */
export async function readPlan(pack: string): Promise<SavedItem<SavedPlan>> {
  const text = store.read(names.plan(pack));
  return text === null ? null : { loaded: await parseSavedPlan(text), text };
}

export async function savePlan(pack: string, plan: SavedPlan | null): Promise<void> {
  // Refused (private window, full): the plan lasts for this visit only.
  if (plan) store.write(names.plan(pack), JSON.stringify(plan));
  else store.remove(names.plan(pack));
}

/** The packs with a flight saved on this device, by id; set-aside copies don't count. */
export async function savedPacks(): Promise<string[]> {
  return store.savedPacks();
}
