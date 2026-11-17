// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Every panel name in the pack against the naming rule (batch 6): a name ending in a thing
// is used as it is, any other takes "panel". The lists below are the names as reviewed; a new name
// in the pack fails here until it is added to the right list, so a word the rule does not know
// ("quadrant", say) is caught before it reads wrong.

import type { FlatPack } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { panelName } from "./panel-name";

const packs = import.meta.glob<FlatPack>("../../../../apps/web/public/packs/*.json", {
  eager: true,
  import: "default",
});

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

describe("every panel name in the pack follows the naming rule", () => {
  const titles = new Set<string>();
  for (const [file, pack] of Object.entries(packs)) {
    if (file.endsWith("index.json")) continue;
    for (const p of pack.content.panels ?? []) for (const s of p.sections) titles.add(s.title);
    for (const z of pack.content.controls?.zones ?? []) titles.add(z.title);
  }

  it("knows every name (a new one is reviewed and added to a list here)", () => {
    const known = new Set([...AS_IS, ...SAYS_PANEL, ...TAKES_PANEL]);
    expect([...titles].filter((t) => !known.has(t))).toEqual([]);
  });

  it("names each as reviewed", () => {
    const sentence = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
    for (const t of [...AS_IS, ...SAYS_PANEL]) expect(panelName(t)).toBe(sentence(t));
    for (const t of TAKES_PANEL) expect(panelName(t)).toBe(`${sentence(t)} panel`);
  });
});
