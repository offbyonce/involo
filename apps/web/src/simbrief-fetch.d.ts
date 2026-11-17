// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export const TIMEOUT_MS: number;
export function statusMessage(status: number): string;
export function fetchPlanText(
  url: string,
  options?: {
    fetch?: typeof globalThis.fetch;
    timeout?: number;
    own?: (text: string) => Promise<string | null>;
  },
): Promise<string>;
