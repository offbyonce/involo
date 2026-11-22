// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";

// Svelte components run code when they are imported, so a gallery exported from the main entry
// ends up in the app's script even though only the design pages show it.
it("the main entry leaves the galleries to their own entry", async () => {
  const main = Object.keys(await import("./index"));
  const gallery = Object.keys(await import("./gallery/index"));
  expect(gallery.sort()).toEqual(["DecisionGallery", "DrawingGallery", "GateGallery"]);
  expect(main.filter((name) => gallery.includes(name))).toEqual([]);
});
