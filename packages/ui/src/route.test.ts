// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { howHref, parseRoute } from "./route.svelte";

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

  it("reads Practice", () => {
    expect(parseRoute("#/practice")).toEqual({ screen: "practice" });
  });

  it("reads How procedures work and its part (the address carries the part, How README)", () => {
    expect(parseRoute("#/how")).toEqual({ screen: "how", part: null });
    expect(parseRoute("#/how/2")).toEqual({ screen: "how", part: 2 });
    expect(parseRoute("#/how/x")).toEqual({ screen: "how", part: null });
    expect(howHref(3)).toBe("#/how/3");
  });
});
