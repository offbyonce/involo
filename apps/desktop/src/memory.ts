// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the desktop app keeps, held in memory for now: saved items and installed packs last until
// the window closes. Files on disk replace this (#114); until then the desktop host reads and
// writes here as the web host does browser storage, under the same names.

import type { InstalledPack } from "@involo/ui";

/** Saved text by name: "settings", "flight.<pack>", "plan.<pack>", "log", and set-aside copies
 * ("<name>.kept-<time>"). */
export const saved = new Map<string, string>();

/** Installed packs by id, with their files' text. */
export const packs = new Map<string, InstalledPack & { text: string }>();

/** Moves saved text aside under its own name, so a new save can start. */
export function setAside(name: string, now: number): void {
  const text = saved.get(name);
  if (text === undefined) return;
  saved.set(`${name}.kept-${now}`, text);
  saved.delete(name);
}

/** The packs with a flight saved, by id; set-aside copies don't count. */
export function savedPacks(): string[] {
  return [...saved.keys()]
    .filter((k) => k.startsWith("flight.") && !k.includes(".kept-"))
    .map((k) => k.slice("flight.".length))
    .sort();
}
