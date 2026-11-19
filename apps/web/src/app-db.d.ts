// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export const DB_NAME: string;
export const DB_VERSION: number;
export const LOG_STORE: string;
export const PACK_STORE: string;
export function open(idb: IDBFactory): Promise<IDBDatabase>;
export function run<T>(
  idb: IDBFactory,
  store: string,
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T>;
