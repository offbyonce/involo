// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseRoute } from "./route.svelte";

describe("parseRoute", () => {
  it("reads the Flight deck's area and place, and the Glossary's term", () => {
    expect(parseRoute("#/deck")).toEqual({ screen: "deck", area: null, zone: null });
    expect(parseRoute("#/deck/forward-overhead/fuel")).toEqual({
      screen: "deck",
      area: "forward-overhead",
      zone: "fuel",
    });
    expect(parseRoute("#/glossary/TO%2FGA")).toEqual({ screen: "glossary", term: "TO/GA" });
  });
});
