// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parse_pack } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { iflyPack } from "../test-pack";
import { PACK } from "./decision-fixture";

/** The interface's camelCase field names back to Rust's snake_case (map keys keep their case; the
 * manifest is camelCase in Rust too). */
const snake = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(snake)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k.replace(/([a-z0-9])([A-Z])/g, (_, a, b) => `${a}_${b.toLowerCase()}`),
            snake(x),
          ]),
        )
      : v;

describe("the decision gallery's pack", () => {
  it("carries the names Rust gives its steps and controls, as a pack the app reads does", () => {
    iflyPack(); // the module is loaded
    const { names: _given, ...unnamed } = PACK;
    const reply = JSON.parse(
      parse_pack(JSON.stringify({ ...(snake(unnamed) as object), manifest: unnamed.manifest })),
    );
    expect(reply.error?.message).toBeUndefined();
    expect(PACK.names).toEqual(reply.ok.names);
  });
});
