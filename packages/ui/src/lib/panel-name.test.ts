// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { panelName, panelTitle } from "./panel-name";

describe("panel names (owner, batch 6)", () => {
  it("names one panel from the pack's title, in sentence case, once", () => {
    expect(panelName("Electrical meters")).toBe("Electrical meters panel");
    expect(panelName("Doors panel")).toBe("Doors panel");
    expect(panelName("ground power and generators")).toBe("Ground power and generators panel");
    expect(panelTitle(["Fuel panel"])).toEqual({ title: "Fuel panel", also: null });
  });

  it("names a left and right pair as one", () => {
    expect(panelTitle(["L wiper", "R wiper"]).title).toBe("L and R wiper panels");
    expect(panelTitle(["Captain EFIS", "First officer EFIS"]).title).toBe(
      "Captain and first officer EFIS panels",
    );
    expect(panelTitle(["Left CDU", "Right CDU"]).title).toBe("Left and right CDU panels");
  });

  it("otherwise names the main panel and adds the others as Also, never chained with 'and'", () => {
    expect(panelTitle(["Fuel", "Hydraulic"])).toEqual({ title: "Fuel panel", also: "Hydraulic panel" });
    expect(panelTitle(["Ground power and generators", "Electrical meters", "L wiper"])).toEqual({
      title: "Ground power and generators panel",
      also: "Electrical meters panel, L wiper panel",
    });
  });
});
