// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Connect } from "vite";

/** A middleware for packs/ that serves the test catalog in target/test-packs. */
export function serveTestCatalog(root: string): Connect.NextHandleFunction;
