// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Labels, ViewFrame } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { seatFrame } from "./seat-frame";

const frame = (width: number): ViewFrame => ({ width, height: 10 });
const labels = {
  seats: [
    { id: "right", title: "Right" },
    { id: "left", title: "Left" },
  ],
} as unknown as Labels;

describe("seatFrame", () => {
  it("draws the one frame, or the first listed seat's frame, or none", () => {
    expect(seatFrame(frame(1), labels)?.width).toBe(1);
    expect(seatFrame({ left: frame(1), right: frame(2) }, labels)?.width).toBe(2);
    expect(seatFrame({ left: frame(1) }, null)?.width).toBe(1);
    expect(seatFrame(null, labels)).toBeNull();
  });
});
