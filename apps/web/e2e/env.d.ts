// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Node global the Playwright config reads (the repo has no @types/node).
declare const process: { env: Record<string, string | undefined> };

// And the one Node function the format-6 briefing flow reads its frozen flight with.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
