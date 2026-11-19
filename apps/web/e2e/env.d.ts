// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The one Node global the Playwright config reads (the repo has no @types/node).
declare const process: { env: Record<string, string | undefined> };
