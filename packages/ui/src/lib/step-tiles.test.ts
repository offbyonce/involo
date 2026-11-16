// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack, ItemTarget } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { stepTiles, tilesTitle } from "./step-tiles";

const packs = import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
  eager: true,
  import: "default",
});
const pack = Object.values(packs)[0] as FlatPack;
const index = indexPack(pack);
/** A step's targets as Rust resolves them: its "panel/section/label/n" locators. */
function targetsOf(id: string): ItemTarget[] {
  const step = index.step(id);
  return (step?.targets ?? []).flatMap((t) => {
    const [, section, label, n] = (t.at ?? "").split("/");
    const items = index.section(section ?? "")?.items ?? [];
    let seen = 0;
    const item = items.findIndex((it) => it.label === label && ++seen === Number(n));
    return item < 0
      ? []
      : [
          {
            section: section ?? "",
            item,
            position: t.set ? 0 : null,
            lit: t.light === "on",
            open: false,
            resolved: false,
          },
        ];
  });
}
const tiles = (id: string) => {
  const step = index.step(`ifly-737-max8.${id}`);
  if (!step) throw new Error(id);
  return stepTiles(index, step, targetsOf(step.id));
};

describe("stepTiles (owner, batch 6)", () => {
  it("draws only the panel that holds the control, never its zone's or a neighbor", () => {
    // STANDBY POWER is drawn on the meters' section, not on its zone's (ground power and generators);
    // the wiper panel between them was drawn before.
    const t = tiles("cold-dark.standby-power-switch");
    expect(t.map((x) => x.id)).toEqual(["elecm"]);
  });

  it("gives each panel its own tile and names a left and right pair as one", () => {
    const t = tiles("cold-dark.wiper-selectors");
    expect(t.map((x) => x.id)).toEqual(["wipe", "rwip"]);
    expect(tilesTitle(t)).toEqual({ title: "L and R wiper panels", also: null });
  });

  it("keeps a panel the pack does not draw, as a tile listing the step's controls on it", () => {
    const t = tiles("gpu-power.ground-power-cart-efb");
    expect(t.some((x) => x.kind === "listed" && x.controls.length > 0)).toBe(true);
    expect(t.length).toBeGreaterThan(1);
    expect(tilesTitle(t).also).toBeTruthy();
  });

  it("never lists a control whose panel is drawn under another id (the fire test switch on the fire panel)", () => {
    const t = tiles("apu-power.fire-switch-and-overheat-detector");
    expect(t.every((x) => x.kind === "drawn")).toBe(true);
  });

  it("titles the panel with the control the step sets, never one holding only a light its Check names", () => {
    // The speedbrake lever's ARMED light is on the captain's lights; the lever is on the control stand.
    expect(tilesTitle(tiles("landing.speedbrake-lever"))).toEqual({
      title: "Control stand",
      also: "Captain lights panel",
    });
    expect(tilesTitle(tiles("landing.speedbrake-lever-before-landing"))).toEqual({
      title: "Control stand",
      also: "Captain lights panel",
    });
  });

  it("counts a light the Check expects out as a check too", () => {
    const step = index.step("ifly-737-max8.landing.speedbrake-lever");
    if (!step) throw new Error("step");
    // The same step, its light expected out (lit false, no position): still not the main panel.
    const out = targetsOf(step.id).map((t) => (t.section === "cl" ? { ...t, lit: false } : t));
    expect(tilesTitle(stepTiles(index, step, out)).title).toBe("Control stand");
  });

  it("draws a control the pack targets on its panel, and lists one with no drawing (owner, batch 6)", () => {
    // The oxygen mask is drawn on the side panel, now a target of crew communications.
    expect(tiles("memory.crew-communications").map((t) => t.id)).toContain("side");
    // The fuel pumps are set, so the fuel panel leads; the display it reads comes after.
    expect(tilesTitle(tiles("before-start.fuel")).title).toBe("Fuel panel");
    // The control column has no drawing: a listed tile, though its zone is drawn.
    const column = tiles("memory.control-column").find((t) => t.kind === "listed");
    expect(column?.kind === "listed" && column.controls.length).toBeTruthy();
  });
});
