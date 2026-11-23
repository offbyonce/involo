// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fetchProblem, fileProblem } from "./problems";

describe("import problems", () => {
  const appError = { kind: "FlightPlan", message: "SimBrief says: Error: Unknown UserID" };

  it("a network error or an abort is a connection problem", () => {
    expect(fetchProblem(new TypeError("NetworkError when attempting to fetch resource."))).toMatch(
      /connection/,
    );
    expect(fetchProblem(new DOMException("The operation was aborted.", "AbortError"))).toMatch(/connection/);
  });

  it("offline with a plan already kept, it says that plan is still in use (#244)", () => {
    const last = {
      plan: { origin: { icao: "KSEA" }, destination: { icao: "KSFO" } },
      loadedAt: new Date(2026, 10, 20, 9, 41).getTime(),
    } as never;
    const offline = new TypeError("NetworkError when attempting to fetch resource.");
    expect(fetchProblem(offline, last)).toBe("Offline, using your last plan: KSEA → KSFO, imported 09:41.");
    expect(fetchProblem(new DOMException("The operation was aborted.", "AbortError"), last)).toMatch(
      /^Offline, using/,
    );
    expect(fetchProblem(offline, null)).toBe(
      "Couldn't reach SimBrief. Check your connection, or use a saved OFP file.",
    );
    // SimBrief's own answer is about the request, whatever plan is kept.
    expect(fetchProblem(appError, last)).toBe(appError.message);
  });

  it("the app's tagged error says its own message", () => {
    expect(fetchProblem(appError)).toBe("SimBrief says: Error: Unknown UserID");
    expect(fileProblem(appError)).toBe("SimBrief says: Error: Unknown UserID");
  });

  it("an unexpected error is not reported as a network problem", () => {
    for (const e of [new Error("unreachable"), new RangeError("bad"), "a string", null]) {
      expect(fetchProblem(e)).toBe(
        "Something went wrong importing the plan. Try again, or use a saved OFP file.",
      );
    }
  });

  it("a failed file import never mentions the connection", () => {
    for (const e of [new TypeError("x"), new DOMException("x", "AbortError"), new Error("x"), "x"]) {
      expect(fileProblem(e)).not.toMatch(/connection|reach/i);
    }
  });
});
