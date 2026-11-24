// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, REVOKE_AFTER_MS } from "./save-file";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadFile (#69)", () => {
  it("keeps the download's file reachable for a few seconds after the click, then frees it", () => {
    vi.useFakeTimers();
    const revoked: string[] = [];
    URL.createObjectURL = () => "blob:copy";
    URL.revokeObjectURL = (url: string) => revoked.push(url);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(downloadFile("involo-log.csv", "a,b", "text/csv")).toBe(true);
    // Not on the next tick: Safari and Firefox may start the download later than that.
    vi.advanceTimersByTime(1000);
    expect(revoked).toEqual([]);
    expect(REVOKE_AFTER_MS).toBeGreaterThanOrEqual(5000);
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revoked).toEqual(["blob:copy"]);
  });
});
