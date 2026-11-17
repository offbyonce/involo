// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The iFly pack as the interface receives it, for tests: the built pack file read through the
// WebAssembly module, as the web host reads it, so field names arrive in camelCase (decision 0029,
// Names) by the same Rust code. `just test` builds the module first.

import { readFileSync } from "node:fs";
import type { FlatPack } from "@involo/bindings";
import { initSync, load_pack } from "../../../apps/web/src/wasm/involo_web_host.js";

const root = `${import.meta.dirname}/../../..`;
let ready = false;

/** A built pack's JSON text as the interface receives it. */
export function packAsReceived(json: string): FlatPack {
  if (!ready) {
    initSync({ module: readFileSync(`${root}/apps/web/src/wasm/involo_web_host_bg.wasm`) });
    ready = true;
  }
  const reply = JSON.parse(load_pack(json)) as { ok: FlatPack } | { error: { message: string } };
  if ("error" in reply) throw new Error(reply.error.message);
  return reply.ok;
}

let ifly: FlatPack | undefined;

/** The built iFly pack, read once. */
export function iflyPack(): FlatPack {
  ifly ??= packAsReceived(readFileSync(`${root}/apps/web/public/packs/ifly-737-max8.json`, "utf8"));
  return ifly;
}
