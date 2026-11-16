// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export const DB_NAME: string;
export const STORE: string;
export const KEY: string;
export function readLog(idb?: IDBFactory): Promise<string | null>;
export function writeLog(text: string, idb?: IDBFactory): Promise<boolean>;
