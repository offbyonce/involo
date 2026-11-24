// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import KeptNotice from "./KeptNotice.svelte";

afterEach(cleanup);

describe("KeptNotice (#69)", () => {
  it("makes the copy's address in an effect and frees each one when the text changes or it closes", async () => {
    const made: string[] = [];
    const freed: string[] = [];
    URL.createObjectURL = () => {
      made.push(`blob:${made.length + 1}`);
      return made[made.length - 1] as string;
    };
    URL.revokeObjectURL = (url: string) => freed.push(url);
    const props = {
      what: "flight" as const,
      state: "unreadable" as const,
      text: "{",
      onSave: () => {},
      onFresh: () => {},
    };
    const { rerender, unmount } = render(KeptNotice, props);
    const link = () => screen.getByRole("link", { name: /Save a copy/ }).getAttribute("href");
    expect(made).toEqual(["blob:1"]);
    expect(link()).toBe("blob:1");
    await rerender({ ...props, text: "{{" });
    expect(freed).toEqual(["blob:1"]);
    expect(link()).toBe("blob:2");
    unmount();
    expect(freed).toEqual(["blob:1", "blob:2"]);
  });
});
