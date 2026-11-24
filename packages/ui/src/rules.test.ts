// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The rules over every pack (#146): Practice's questions and the names Find, the panels, the
// Flight deck and the labels make, for the iFly pack and every example pack.

import type { FlatPack } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { seeds } from "./lib/practice";
import { indexPack } from "./pack-index";
import { EXAMPLE_PACKS, examplePackById, iflyPack, testPackText, twinPack } from "./test-pack";
import { checkBank, checkNames } from "./test-rules";

type Light = NonNullable<FlatPack["content"]["lights"]>["lights"][number];
type Item = NonNullable<FlatPack["content"]["panels"]>[number]["sections"][number]["items"][number];

/** Invented: the Example Twin as a four-engine airplane whose sides are port and starboard, with a
 * fire light for each engine, a port and a starboard fuel light, and two lights labeled LOW
 * PRESSURE on different panels. Small, with the pairs the rules are about. */
function pairsFixture(): FlatPack {
  const pack = structuredClone(twinPack());
  pack.content.labels.sideWords = ["PORT", "STBD"];
  const overhead = pack.content.panels?.find((p) => p.id === "overhead");
  const electrical = overhead?.sections.find((s) => s.id === "electrical");
  const fuel = overhead?.sections.find((s) => s.id === "fuel");
  const lights = pack.content.lights?.lights;
  if (!overhead || !electrical || !fuel || !lights) throw new Error("the Example Twin's overhead and lights");
  const add = (section: typeof electrical, label: string, which: string | null, meaning: string) => {
    section.items.push({
      kind: "light",
      label,
      color: "amber",
      x: 10,
      y: 10,
      controls: [],
      description: meaning,
    } as unknown as Item);
    const nth = section.items.filter((i) => i.label === label).length;
    lights.push({
      locator: `${overhead.id}/${section.id}/${label}/${nth}`,
      which,
      meaning,
      when: "Abnormal at any time.",
      action: "Follow the checklist.",
      confirmedBy: [{ kind: "vendor-docs", date: "2026-11-08" }],
    } as unknown as Light);
  };
  for (const n of [1, 2, 3, 4]) add(electrical, "FIRE", `engine ${n}`, `A fire is detected in engine ${n}.`);
  add(electrical, "PORT FUEL", null, "The port fuel pump pressure is low.");
  add(electrical, "STBD FUEL", null, "The starboard fuel pump pressure is low.");
  add(electrical, "LOW PRESSURE", "hydraulics", "The hydraulic pressure is low.");
  add(fuel, "LOW PRESSURE", "fuel crossfeed", "The crossfeed pressure is low.");
  return pack;
}

const PACKS = [
  { id: "ifly-737-max8", pack: iflyPack },
  ...EXAMPLE_PACKS.map((id) => ({ id, pack: () => examplePackById(id) })),
];

describe("the rules over every pack (#146)", () => {
  it("each pack has questions to check", () => {
    for (const { id, pack } of PACKS) expect(seeds(pack(), indexPack(pack())).length, id).toBeGreaterThan(0);
  });

  for (const { id, pack } of PACKS) {
    it(`${id}: every Practice question keeps the rules`, () => {
      expect(checkBank(pack(), testPackText(id)).slice(0, 20)).toEqual([]);
    }, 60_000);
    it(`${id}: every name Find, the panels, the Flight deck and the labels make keeps the rules`, () => {
      expect(checkNames(pack(), testPackText(id)).slice(0, 20)).toEqual([]);
    });
  }

  it("catch what they are for: broken text, an id, an aircraft word the pack doesn't have, a missing explanation", () => {
    const twin = structuredClone(twinPack());
    const source = testPackText("example-twin");
    const step = twin.lists[0]?.steps[0];
    const control = twin.content.controls?.controls[0];
    const zone = twin.content.controls?.zones[0];
    if (!step || !control || !zone) throw new Error("the example pack has steps, controls and zones");
    step.text = "BATTERY  SWITCH";
    control.name = `${control.name} (Boeing)`;
    const names = checkNames(twin, source).join("\n");
    expect(names).toContain('a doubled space in "BATTERY  SWITCH"');
    expect(names).toContain('"Boeing", which the pack doesn\'t have');
    zone.title = `${zone.title} ${zone.id}-x`;
    const id = `${zone.id}-x`;
    // An id shows only once it is no ordinary word of the pack's own text.
    expect(checkNames(twin, source).join("\n")).not.toContain(id);
    // Practice: a question whose explanation reads "undefined", or an option left unexplained.
    const pack = iflyPack();
    const all = seeds(pack, indexPack(pack));
    const q = all.find((x) => x.kind === "choice" && Object.keys(x.about).length > 0);
    if (q?.kind !== "choice") throw new Error("a choice question");
    q.why = "It means undefined.";
    q.about = {};
    {
      const bank = checkBank(pack, testPackText("ifly-737-max8"), all).join("\n");
      expect(bank).toContain(`${q.id}: "undefined" in "It means undefined."`);
      expect(bank).toMatch(
        new RegExp(`${q.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: ".*" isn't explained`),
      );
    }
  });

  it("hold for the invented pairs fixture, which names each of a pair as a pilot would read it", () => {
    const pack = pairsFixture();
    // The fixture's own words beside the Example Twin's file: none is an aircraft word.
    const source = testPackText("example-twin");
    expect(checkBank(pack, source).slice(0, 20)).toEqual([]);
    expect(checkNames(pack, source).slice(0, 20)).toEqual([]);
    const lights = seeds(pack, indexPack(pack)).filter(
      (q) => q.topic === "lights" && q.id.startsWith("lights:meaning:"),
    );
    // Hand-written: what each light question names, which of a pair included.
    expect(lights.map((q) => q.short.replace("What does this light mean when it’s lit? ", ""))).toEqual([
      "BATT LOW, battery, on the Electrical panel",
      "FIRE, engine 1, on the Electrical panel",
      "FIRE, engine 2, on the Electrical panel",
      "FIRE, engine 3, on the Electrical panel",
      "FIRE, engine 4, on the Electrical panel",
      "PORT FUEL, on the Electrical panel",
      "STBD FUEL, on the Electrical panel",
      "LOW PRESSURE, hydraulics, on the Electrical panel",
      "LOW PRESSURE, fuel crossfeed, on the Fuel panel",
    ]);
    // Four fire lights read the same, so none is asked as "which light means this?".
    expect(
      seeds(pack, indexPack(pack)).some((q) => q.id.startsWith("lights:light:overhead/electrical/FIRE")),
    ).toBe(false);
    // The port light's question never offers the starboard one, by this pack's own side words.
    const port = seeds(pack, indexPack(pack)).find(
      (q) => q.id === "lights:light:overhead/electrical/PORT FUEL/1",
    );
    if (port?.kind !== "choice") throw new Error("the port fuel light's question");
    expect(port.twins.pair("PORT FUEL", "STBD FUEL")).toBe(true);
  });
});
