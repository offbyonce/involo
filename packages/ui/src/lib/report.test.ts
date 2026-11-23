// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { stepProblemUrl } from "./report";

describe("Report a problem with a step (#242)", () => {
  it("opens the step-problem form with the pack, list, step and app version, and nothing else", () => {
    const url = new URL(
      stepProblemUrl({
        pack: "ifly-737-max8",
        packVersion: "0.1.0",
        list: "before-start-before-start-procedure",
        step: "ifly-737-max8.before-start.anti-collision-light",
        appVersion: "0.1.0",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/offbyonce/involo/issues/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: "step-problem.yml",
      pack: "ifly-737-max8 0.1.0",
      list: "before-start-before-start-procedure",
      step: "ifly-737-max8.before-start.anti-collision-light",
      app: "0.1.0",
    });
  });

  it("encodes what it carries", () => {
    const url = stepProblemUrl({
      pack: "a&b",
      packVersion: "1",
      list: "l=1",
      step: "s#2",
      appVersion: "0.1.0",
    });
    expect(new URL(url).searchParams.get("step")).toBe("s#2");
    expect(new URL(url).searchParams.get("pack")).toBe("a&b 1");
    expect(url).not.toContain("#2");
  });
});
