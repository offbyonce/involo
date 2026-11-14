// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export const OLD_PREFIX: string;
export const NEW_PREFIX: string;
export const MARKER: string;
export function migrateStorage(storage: Storage): string;
export function prepareStorage(storage: Storage): string;
export function storageKey(name: string): string;
