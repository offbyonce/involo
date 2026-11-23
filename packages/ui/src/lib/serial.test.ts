// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { serial } from "./serial";

describe("serial (#267)", () => {
  it("runs each task after the one before it has finished, in the order they came", async () => {
    const run = serial();
    const order: string[] = [];
    let release = () => {};
    const first = run(async () => {
      order.push("first starts");
      await new Promise<void>((done) => (release = done));
      order.push("first ends");
      return 1;
    });
    const second = run(async () => {
      order.push("second starts");
      return 2;
    });
    await Promise.resolve();
    expect(order).toEqual(["first starts"]);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(["first starts", "first ends", "second starts"]);
  });

  it("starts a task at once when nothing is running", () => {
    const run = serial();
    let started = false;
    void run(async () => {
      started = true;
    });
    expect(started).toBe(true);
  });

  it("rejects only the task that failed, and the next one still runs", async () => {
    const run = serial();
    const failed = run(async () => {
      throw new Error("no");
    });
    const next = run(async () => "ran");
    await expect(failed).rejects.toThrow("no");
    expect(await next).toBe("ran");
  });
});
