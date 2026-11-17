// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import Locator from "./Locator.svelte";

afterEach(cleanup);
const pack = iflyPack();
const index = indexPack(pack);

describe("Locator", () => {
  it("offers Open in Flight deck at this panel, in place of the Whole flight deck map", () => {
    const zone = index.zones.find((z) => z.id === "fuel");
    if (!zone) throw new Error("fuel");
    render(Locator, { index, zone });
    const link = screen.getByRole("link", { name: "Open in Flight deck", hidden: true });
    expect(link.getAttribute("href")).toBe("#/deck/forward-overhead/fuel");
    expect(screen.queryByText(/Whole flight deck/)).toBeNull();
  });
});
