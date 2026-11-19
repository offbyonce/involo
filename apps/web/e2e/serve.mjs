// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Serves the built site (apps/web/dist, from `just site`) for the end-to-end tests, the catalog
// included: everything the app fetches comes from here, so the tests need no network.

import fs from "node:fs";
import path from "node:path";
import { serve } from "../build/browser.mjs";

const dist = path.resolve(import.meta.dirname, "../dist");
if (!fs.existsSync(path.join(dist, "app/index.html"))) throw new Error("build the site first: just site");
const port = Number(process.env.E2E_PORT ?? 8790);
await serve(dist, port);
process.stdout.write(`serving ${dist} on http://localhost:${port}/\n`);
