// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop app's saved items and installed packs, as files in its data folder (decision 0031,
// "Files on disk"), through the shell's files commands (src-tauri/src/files.rs): each write is a
// whole new file or none, and nothing is deleted that the app can't use. The items are the web
// app's, in the same saved formats, one file each.

import type { InstalledPack } from "@involo/ui";
import { invoke } from "@tauri-apps/api/core";

/** The file each saved item is kept in. */
export const names = {
  settings: "settings.json",
  flight: (pack: string) => `flight.${pack}.json`,
  plan: (pack: string) => `plan.${pack}.json`,
  log: "log.json",
  pack: (id: string) => `packs/${id}.involo-pack`,
  installed: "packs/installed.json",
};

/** The text saved under a name, or null. Rejects when the file is there but can't be read. */
export const read = (name: string) => invoke<string | null>("files_read", { name });
/** Saves text under a name. Rejects when it couldn't be written; the old file is then unchanged. */
export const write = (name: string, text: string) => invoke<void>("files_write", { name, text });
export const remove = (name: string) => invoke<void>("files_remove", { name });
/** Moves what is saved under a name aside, to `<name>.kept-<time>`. */
export const setAside = (name: string) => invoke<void>("files_set_aside", { name });
export const list = (folder: "" | "packs") => invoke<string[]>("files_list", { folder });

/** The packs with a flight saved, by id; set-aside copies don't count. */
export async function savedPacks(): Promise<string[]> {
  return (await list("")).flatMap((n) => {
    const m = /^flight\.(.+)\.json$/.exec(n);
    return m?.[1] ? [m[1]] : [];
  });
}

/** The installed packs, with where each came from and when; none when the list can't be read. A
 * pack whose file is missing isn't listed. */
export async function installedPacks(): Promise<InstalledPack[]> {
  let listed: InstalledPack[];
  try {
    listed = JSON.parse((await read(names.installed)) ?? "[]");
  } catch {
    return [];
  }
  const files = new Set(await list("packs").catch(() => []));
  return listed.filter((p) => files.has(names.pack(p.summary.id).slice("packs/".length)));
}

/** Keeps a pack: its file first, then the list, so a failure never lists a pack without its file.
 * False when either couldn't be written. */
export async function keepPack(pack: InstalledPack & { text: string }): Promise<boolean> {
  const { text, ...entry } = pack;
  try {
    await write(names.pack(entry.summary.id), text);
    const others = (await installedPacks()).filter((p) => p.summary.id !== entry.summary.id);
    await write(names.installed, JSON.stringify([...others, entry]));
    return true;
  } catch {
    return false;
  }
}

/** Removes an installed pack: from the list, then its file. False when the list couldn't be
 * written. */
export async function removePack(id: string): Promise<boolean> {
  try {
    const others = (await installedPacks()).filter((p) => p.summary.id !== id);
    await write(names.installed, JSON.stringify(others));
    await remove(names.pack(id)).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** An installed pack's file text, or null when it isn't installed or can't be read. */
export async function packText(id: string): Promise<string | null> {
  return read(names.pack(id)).catch(() => null);
}
