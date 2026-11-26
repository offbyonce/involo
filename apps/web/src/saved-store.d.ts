// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export function readText(storage: Storage, key: string): string | null;
export function writeText(storage: Storage, key: string, text: string): boolean;
export function saveOver(
  storage: Storage,
  key: string,
  text: string,
  seen: string | null,
): "saved" | "failed" | "changed";
export function setAsideText(storage: Storage, key: string, now?: () => string): boolean;

export function browserStorage(): Storage | null;

export const names: {
  readonly settings: string;
  flight(pack: string): string;
  plan(pack: string): string;
};

export interface SavedStore {
  read(name: string): string | null;
  save(name: string, text: string): "saved" | "failed" | "changed";
  write(name: string, text: string): boolean;
  remove(name: string): boolean;
  setAside(name: string): boolean;
  savedPacks(): string[];
}

export function savedStore(storage: () => Storage | null, now?: () => string): SavedStore;
