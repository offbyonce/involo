// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Every iFly practice question as text, for `just practice-diff`: it writes them to the file
// PRACTICE_DUMP names and runs only then. Nothing it writes is committed.

import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import { seeds } from "./practice";

const out = process.env.PRACTICE_DUMP;

it.runIf(!!out)("writes every iFly practice question", () => {
  const pack = iflyPack();
  writeFileSync(out ?? "", `${JSON.stringify(seeds(pack, indexPack(pack)), null, 1)}\n`);
});
