// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The iFly pack as the interface receives it, for tests: the built pack file read through the
// WebAssembly module, as the web host reads it, so field names arrive in camelCase (decision 0029,
// Names) by the same Rust code. `just test` builds the module first.

import { readFileSync } from "node:fs";
import type { FlatPack, Labels } from "@involo/bindings";
import { initSync, parse_pack } from "../../../apps/web/src/wasm/involo_web_host.js";

const root = `${import.meta.dirname}/../../..`;
let ready = false;

/** A built pack's JSON text as the interface receives it. */
export function packAsReceived(json: string): FlatPack {
  if (!ready) {
    initSync({ module: readFileSync(`${root}/apps/web/src/wasm/involo_web_host_bg.wasm`) });
    ready = true;
  }
  const reply = JSON.parse(parse_pack(json)) as { ok: FlatPack } | { error: { message: string } };
  if ("error" in reply) throw new Error(reply.error.message);
  return reply.ok;
}

/** A built pack's file text from the test catalog (`just test-packs` writes it, as `just catalog`
 * writes the published one), found by id through its index.json. */
export function testPackText(id: string): string {
  const dir = `${root}/target/test-packs`;
  const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { id: string; version: string }[];
  const entry = index.find((e) => e.id === id);
  if (!entry) throw new Error(`${id} is not in the test catalog; run just test-packs`);
  return readFileSync(`${dir}/${entry.id}-${entry.version}.involo-pack`, "utf8");
}

let ifly: FlatPack | undefined;

/** The built iFly pack, read once. */
export function iflyPack(): FlatPack {
  ifly ??= packAsReceived(testPackText("ifly-737-max8"));
  return ifly;
}

let example: FlatPack | undefined;

/** The built example pack (invented, in the test catalog only), read once. */
export function examplePack(): FlatPack {
  example ??= packAsReceived(testPackText("example-trainer"));
  return example;
}

/** The app's own words (decision 0029), as Rust gives a pack without a labels file: the example
 * pack's, which has none. For packs a test builds by hand. */
export function appLabels(): Labels {
  return structuredClone(examplePack().content.labels);
}
