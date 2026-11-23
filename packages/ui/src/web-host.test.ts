// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The web host's links and files: a new tab, and a download.

import { afterEach, describe, expect, it, vi } from "vitest";
import { webHost } from "../../../apps/web/src/web-host";

describe("the web host", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens a link in a new tab, with no opener or referrer", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await webHost.openLink("https://github.com/offbyonce/involo/releases/tag/v0.1.0");
    expect(open).toHaveBeenCalledWith(
      "https://github.com/offbyonce/involo/releases/tag/v0.1.0",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("saves a file as a download of its text, named as asked", async () => {
    const files: Blob[] = [];
    URL.createObjectURL = (b: Blob | MediaSource) => {
      files.push(b as Blob);
      return "blob:file";
    };
    URL.revokeObjectURL = () => {};
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    expect(await webHost.saveFile("involo-log-1.csv", "a,b", "text/csv")).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(names).toEqual(["involo-log-1.csv"]);
    expect(files[0]?.type).toBe("text/csv");
    expect(await files[0]?.text()).toBe("a,b");
    // The link is gone once clicked.
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
