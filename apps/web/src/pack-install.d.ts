// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { CatalogEntry, PackChanges, PackCheck, PackSummary } from "@involo/bindings";
import type { PackInstall } from "@involo/ui";
import type { PackRecord } from "./pack-store.js";

export type InstallDeps = {
  /** The largest pack file, in bytes. */
  limit: number;
  check: (bytes: Uint8Array, sha256: string) => Promise<PackCheck>;
  keep: (record: PackRecord) => Promise<boolean>;
  now: () => number;
  /** Asks once for storage the browser won't clear on its own. */
  askToKeep: () => void;
  /** What changed from the installed version of the pack to this one, or null when none is
   * installed or it is the same version. */
  changes?: (summary: PackSummary, text: string) => Promise<PackChanges | null>;
};

export function catalogFile(entry: Pick<CatalogEntry, "id" | "version">): string;
export function readCatalog(deps: {
  fetch: typeof fetch;
  parse: (text: string) => Promise<CatalogEntry[]>;
}): Promise<CatalogEntry[]>;
export function installFile(file: Blob, deps: InstallDeps): Promise<PackInstall>;
export function installFromCatalog(
  entry: CatalogEntry,
  deps: InstallDeps & { fetch: typeof fetch },
): Promise<PackInstall>;
export function downloadPack(
  entry: CatalogEntry,
  deps: InstallDeps & { fetch: typeof fetch },
): Promise<{ state: "refused"; reasons: string[] } | { state: "ready"; bytes: Uint8Array }>;
