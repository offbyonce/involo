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
