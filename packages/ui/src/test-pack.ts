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

const examples = new Map<string, FlatPack>();

/** A built example pack (packs/examples, decision 0030; in the test catalog only), read once. */
function example(id: string): FlatPack {
  let pack = examples.get(id);
  if (!pack) {
    pack = packAsReceived(testPackText(id));
    examples.set(id, pack);
  }
  return pack;
}

/** The invented Boeing-style example pack: checklists and flows, one seat frame, quick reference,
 * every control kind but the Airbus-style ones, and no labels file. */
export const twinPack = () => example("example-twin");

/** The invented Airbus-style example pack: its own stages, crew roles and list methods, legend
 * pushbuttons and push-pull knobs, alert messages, flight pages and labels. */
export const sidestickPack = () => example("example-sidestick");

/** The variant of the Example Twin, built over it with patches. */
export const twinLrPack = () => example("example-twin-lr");

/** Every example pack, by id, for tests that run against each. */
export const EXAMPLE_PACKS = ["example-twin", "example-sidestick", "example-twin-lr"] as const;
export const examplePackById = (id: (typeof EXAMPLE_PACKS)[number]) => example(id);

/** The app's own words (decision 0029), as Rust gives a pack without a labels file: the Example
 * Twin has none. For packs a test builds by hand. */
export function appLabels(): Labels {
  return structuredClone(twinPack().content.labels);
}
