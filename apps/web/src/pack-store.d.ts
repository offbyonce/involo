// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { PackSummary } from "@involo/bindings";

export type PackRecord = {
  summary: PackSummary;
  source: "catalog" | "file";
  installedAt: number;
  text: string;
};

export const DB_NAME: string;
export const STORE: string;
export function readPacks(idb?: IDBFactory): Promise<Omit<PackRecord, "text">[]>;
export function readPackText(id: string, idb?: IDBFactory): Promise<string | null>;
export function writePack(record: PackRecord, idb?: IDBFactory): Promise<boolean>;
export function deletePack(id: string, idb?: IDBFactory): Promise<boolean>;
