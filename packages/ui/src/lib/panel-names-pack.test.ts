// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Every panel name in the packs as reviewed, when the interface added "panel" by an English word
// list: a name ending in a thing was used as it was, any other took "panel". Names now come from
// the pack (a section's `name`, else its title), so each section reads as reviewed here, and a new
// name fails until it is added to the right list.

import type { FlatPack } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { packAsReceived } from "../test-pack";
import { sectionName } from "./panel-name";

/** The published packs in the test catalog, by file, as the interface receives them. The example
 * pack is a format demo that is never published, so it is left out. */
const packs: Record<string, FlatPack> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../../../target/test-packs/*.involo-pack", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  )
    .filter(([file]) => !file.includes("/example-trainer-"))
    .map(([file, text]) => [file, packAsReceived(text)]),
);

/** Names that end in a thing: used as they are. */
const AS_IS = [
  "Captain displays",
  "Cockpit voice recorder microphone monitor",
  "Control column and rudder pedals",
  "Control display units",
  "Control stand",
  "Control wheel",
  "Displays",
  "Electronic flight bag",
  "Engine start levers",
  "Fire, caution and system annunciators",
  "First officer displays",
  "Flap lever",
  "Ground proximity panel, below the F/O displays",
  "Integrated standby flight display",
  "Left CDU",
  "Left annunciators",
  "MAX Display System display units",
  "Oxygen mask",
  "Parking brake and start levers",
  "Right CDU",
  "Right annunciators",
  "Speedbrake lever",
  "Thrust and reverse levers",
];
/** Names that already say "panel" or "panels": used as they are. */
const SAYS_PANEL = [
  "ADF panel",
  "ATC/TCAS panel",
  "Aileron, rudder and stab trim panel",
  "Air conditioning panel",
  "Anti-ice panel",
  "Audio control panels",
  "Bleed air panel",
  "Cabin pressure panel",
  "Cargo fire panel",
  "Cockpit voice recorder panel",
  "Display select and lighting panels",
  "Door warning panel",
  "EFIS control panels",
  "ELT panel",
  "Engine panel",
  "Engine start panel",
  "Flight control panel",
  "Flight deck door panel",
  "Flight recorder panel",
  "Fuel flow, autobrake and display control panel",
  "Fuel panel",
  "Hydraulic panel",
  "Landing gear panel",
  "Mode control panel",
  "Navigation and ADF panels",
  "Observer audio panel",
  "Overheat/fire protection panel",
  "Oxygen panel",
  "Radio tuning panel",
  "Weather radar panel",
];
/** Every other name: "<name> panel". */
const TAKES_PANEL = [
  "ADF",
  "APU",
  "APU lights",
  "APU switch",
  "ATC/TCAS",
  "Air temperature",
  "Anti-ice",
  "Audio 1",
  "Audio 2",
  "Behind the first officer seat",
  "Bleed air",
  "Broadband system",
  "Cabin altitude",
  "Cabin pressure",
  "Captain EFIS",
  "Captain display select and lighting",
  "Captain lights",
  "Cargo fire",
  "Cooling, exit lights and signs",
  "Dome light",
  "Doors",
  "ELT",
  "Electrical meters",
  "Electrical, lower section",
  "Electrical, upper section",
  "Elevator jam",
  "Elevator jam landing assist",
  "Engine",
  "Engine display and autobrake",
  "Engine start",
  "Exterior light switches",
  "Exterior lights",
  "Fire protection",
  "First officer EFIS",
  "First officer lights",
  "Flight control",
  "Flight recorder and Mach test",
  "Fuel",
  "Gear lights",
  "Generator drive and standby",
  "Ground and external items",
  "Ground power and generators",
  "Ground proximity, display select and air",
  "Hydraulic pumps",
  "IRS",
  "IRS display and mode selectors",
  "L wiper",
  "LE devices",
  "Landing and taxi lights",
  "Landing, turnoff and taxi lights",
  "Lighting",
  "Lights and service",
  "Lights test and warning lights",
  "Maintenance",
  "NAV 1",
  "NAV 2",
  "Navigation",
  "Navigation and display source",
  "Overhead gear lights",
  "Oxygen",
  "Parking brake",
  "R wiper",
  "Radio 1",
  "Radio 2",
  "Radio 3",
  "Service interphone",
  "Stab override and door",
  "Stab trim override switch",
  "Stabilizer trim",
  "Stall warning test",
  "Standby and gear",
  "Status lights and gear indicators",
  "Test switches and elevator jam",
  "Trim",
  "Voice recorder",
  "Voice recorder switch",
  "Weather radar",
  "Window and probe heat",
  "Windows and oxygen masks",
  "Wiper selectors",
];

describe("every panel name in the packs reads as reviewed", () => {
  const sections = Object.values(packs).flatMap((pack) =>
    (pack.content.panels ?? []).flatMap((p) => p.sections),
  );
  const zones = Object.values(packs).flatMap((pack) => pack.content.controls?.zones ?? []);

  it("knows every name (a new one is reviewed and added to a list here)", () => {
    const known = new Set([...AS_IS, ...SAYS_PANEL, ...TAKES_PANEL]);
    const titles = new Set([...sections.map((s) => s.title), ...zones.map((z) => z.title)]);
    expect([...titles].filter((t) => !known.has(t))).toEqual([]);
  });

  it("names each section as reviewed, from its name or title", () => {
    const takes = new Set(TAKES_PANEL);
    for (const s of sections)
      expect(sectionName(s), s.id).toBe(takes.has(s.title) ? `${s.title} panel` : s.title);
  });
});
