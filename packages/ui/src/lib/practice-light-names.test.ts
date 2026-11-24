// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Every iFly light as Practice's light questions word it: its locator, its name (the label, and
// which one of a pair it is) and the caption on the light. Written from the questions before the
// names came from the pack (decision 0029), and kept as it was, except the four labels holding a
// slash (F/O PITOT, REVERSER AIR/GRD, BELOW G/S, OVHT/DET), which were cut at it until issue 146.

import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { iflyPack } from "../test-pack";
import { sectionName } from "./panel-name";
import { seeds } from "./practice";

/** [locator, name, caption], one per light Practice asks about, in the questions' order. */
const LIGHTS: [string, string, string][] = [
  ["oh/fctl/LOW QUANTITY/1", "LOW QUANTITY", "Flight control panel · Forward overhead (P5)"],
  [
    "oh/fctl/LOW PRESSURE/1",
    "LOW PRESSURE, standby hydraulic pump",
    "Standby hydraulic pump · Flight control panel · Forward overhead (P5)",
  ],
  ["oh/fctl/STBY RUD ON/1", "STBY RUD ON", "Flight control panel · Forward overhead (P5)"],
  [
    "oh/fctl/LOW PRESSURE/2",
    "LOW PRESSURE, system A",
    "System A · Flight control panel · Forward overhead (P5)",
  ],
  [
    "oh/fctl/LOW PRESSURE/3",
    "LOW PRESSURE, system B",
    "System B · Flight control panel · Forward overhead (P5)",
  ],
  ["oh/fctl/FEEL DIFF PRESS/1", "FEEL DIFF PRESS", "Flight control panel · Forward overhead (P5)"],
  ["oh/fctl/SPEED TRIM FAIL/1", "SPEED TRIM FAIL", "Flight control panel · Forward overhead (P5)"],
  ["oh/fctl/MACH TRIM FAIL/1", "MACH TRIM FAIL", "Flight control panel · Forward overhead (P5)"],
  ["oh/fctl/AUTO SLAT FAIL/1", "AUTO SLAT FAIL", "Flight control panel · Forward overhead (P5)"],
  ["oh/fctl/SPOILERS/1", "SPOILERS", "Flight control panel · Forward overhead (P5)"],
  ["oh/fctl/YAW DAMPER/1", "YAW DAMPER", "Flight control panel · Forward overhead (P5)"],
  ["oh/fuel/FILTER BYPASS/1", "FILTER BYPASS, engine 1", "Engine 1 · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/FILTER BYPASS/2", "FILTER BYPASS, engine 2", "Engine 2 · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/1", "LOW PRESSURE, CTR L", "CTR L · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/2", "LOW PRESSURE, CTR R", "CTR R · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/3", "LOW PRESSURE, AFT 1", "AFT 1 · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/4", "LOW PRESSURE, FWD 1", "FWD 1 · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/5", "LOW PRESSURE, FWD 2", "FWD 2 · Fuel panel · Forward overhead (P5)"],
  ["oh/fuel/LOW PRESSURE/6", "LOW PRESSURE, AFT 2", "AFT 2 · Fuel panel · Forward overhead (P5)"],
  [
    "oh/fuel/ENG VALVE CLOSED/1",
    "ENG VALVE CLOSED, engine 1",
    "Engine 1 · Fuel panel · Forward overhead (P5)",
  ],
  [
    "oh/fuel/SPAR VALVE CLOSED/1",
    "SPAR VALVE CLOSED, engine 1",
    "Engine 1 · Fuel panel · Forward overhead (P5)",
  ],
  [
    "oh/fuel/ENG VALVE CLOSED/2",
    "ENG VALVE CLOSED, engine 2",
    "Engine 2 · Fuel panel · Forward overhead (P5)",
  ],
  [
    "oh/fuel/SPAR VALVE CLOSED/2",
    "SPAR VALVE CLOSED, engine 2",
    "Engine 2 · Fuel panel · Forward overhead (P5)",
  ],
  ["oh/fuel/VALVE OPEN/1", "VALVE OPEN", "Fuel panel · Forward overhead (P5)"],
  ["oh/elecu/BAT DISCHARGE/1", "BAT DISCHARGE", "Electrical, upper section · Forward overhead (P5)"],
  ["oh/elecu/TR UNIT/1", "TR UNIT", "Electrical, upper section · Forward overhead (P5)"],
  ["oh/elecu/ELEC/1", "ELEC", "Electrical, upper section · Forward overhead (P5)"],
  ["oh/elecm/DRIVE 1/1", "DRIVE 1", "Electrical, lower section · Forward overhead (P5)"],
  ["oh/elecm/DRIVE 2/1", "DRIVE 2", "Electrical, lower section · Forward overhead (P5)"],
  ["oh/elecm/STANDBY PWR OFF/1", "STANDBY PWR OFF", "Electrical, lower section · Forward overhead (P5)"],
  [
    "oh/elecl/TRANSFER BUS OFF/1",
    "TRANSFER BUS OFF, transfer bus 1",
    "Transfer bus 1 · Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/TRANSFER BUS OFF/2",
    "TRANSFER BUS OFF, transfer bus 2",
    "Transfer bus 2 · Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/SOURCE OFF/1",
    "SOURCE OFF, transfer bus 1",
    "Transfer bus 1 · Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/SOURCE OFF/2",
    "SOURCE OFF, transfer bus 2",
    "Transfer bus 2 · Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/GRD POWER AVAILABLE/1",
    "GRD POWER AVAILABLE",
    "Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/GEN OFF BUS/1",
    "GEN OFF BUS, engine 1",
    "Engine 1 · Electrical, lower section · Forward overhead (P5)",
  ],
  [
    "oh/elecl/GEN OFF BUS/2",
    "GEN OFF BUS, engine 2",
    "Engine 2 · Electrical, lower section · Forward overhead (P5)",
  ],
  ["oh/elecl/APU GEN OFF BUS/1", "APU GEN OFF BUS", "Electrical, lower section · Forward overhead (P5)"],
  ["oh/col/LAVATORY SMOKE/1", "LAVATORY SMOKE", "Cooling, exit lights and signs · Forward overhead (P5)"],
  [
    "oh/col/EQUIP OFF/1",
    "EQUIP OFF, fan that supplies cooling air",
    "Fan that supplies cooling air · Cooling, exit lights and signs · Forward overhead (P5)",
  ],
  [
    "oh/col/EQUIP OFF/2",
    "EQUIP OFF, fan that pulls warm air out",
    "Fan that pulls warm air out · Cooling, exit lights and signs · Forward overhead (P5)",
  ],
  ["oh/col/EQUIP SMOKE/1", "EQUIP SMOKE", "Cooling, exit lights and signs · Forward overhead (P5)"],
  ["oh/col/NOT ARMED/1", "NOT ARMED", "Cooling, exit lights and signs · Forward overhead (P5)"],
  ["oh/heat/OVERHEAT/1", "OVERHEAT, left side", "Left side · Window and probe heat · Forward overhead (P5)"],
  [
    "oh/heat/OVERHEAT/2",
    "OVERHEAT, left forward",
    "Left forward · Window and probe heat · Forward overhead (P5)",
  ],
  [
    "oh/heat/OVERHEAT/3",
    "OVERHEAT, right forward",
    "Right forward · Window and probe heat · Forward overhead (P5)",
  ],
  [
    "oh/heat/OVERHEAT/4",
    "OVERHEAT, right side",
    "Right side · Window and probe heat · Forward overhead (P5)",
  ],
  ["oh/heat/ON/1", "ON, left side", "Left side · Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/ON/2", "ON, left forward", "Left forward · Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/ON/3", "ON, right forward", "Right forward · Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/ON/4", "ON, right side", "Right side · Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/CAPT PITOT/1", "CAPT PITOT", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/L ELEV PITOT/1", "L ELEV PITOT", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/L ALPHA VANE/1", "L ALPHA VANE", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/TEMP PROBE/1", "TEMP PROBE", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/F/O PITOT/1", "F/O PITOT", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/R ELEV PITOT/1", "R ELEV PITOT", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/R ALPHA VANE/1", "R ALPHA VANE", "Window and probe heat · Forward overhead (P5)"],
  ["oh/heat/AUX PITOT/1", "AUX PITOT", "Window and probe heat · Forward overhead (P5)"],
  ["oh/aice/ICE DETECTOR/1", "ICE DETECTOR", "Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/L VALVE/1", "L VALVE", "Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/R VALVE/1", "R VALVE", "Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/ENG 1 ANTI-ICE/1", "ENG 1 ANTI-ICE", "Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/ENG 2 ANTI-ICE/1", "ENG 2 ANTI-ICE", "Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/COWL ANTI-ICE/1", "COWL ANTI-ICE, engine 1", "Engine 1 · Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/COWL ANTI-ICE/2", "COWL ANTI-ICE, engine 2", "Engine 2 · Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/COWL VALVE/1", "COWL VALVE, engine 1", "Engine 1 · Anti-ice panel · Forward overhead (P5)"],
  ["oh/aice/COWL VALVE/2", "COWL VALVE, engine 2", "Engine 2 · Anti-ice panel · Forward overhead (P5)"],
  [
    "oh/hyd/OVERHEAT/1",
    "OVERHEAT, electric hydraulic pump 2",
    "Electric hydraulic pump 2 · Hydraulic panel · Forward overhead (P5)",
  ],
  [
    "oh/hyd/OVERHEAT/2",
    "OVERHEAT, electric hydraulic pump 1",
    "Electric hydraulic pump 1 · Hydraulic panel · Forward overhead (P5)",
  ],
  ["oh/hyd/LOW PRESSURE/1", "LOW PRESSURE, engine 1", "Engine 1 · Hydraulic panel · Forward overhead (P5)"],
  [
    "oh/hyd/LOW PRESSURE/2",
    "LOW PRESSURE, electric hydraulic pump 2",
    "Electric hydraulic pump 2 · Hydraulic panel · Forward overhead (P5)",
  ],
  [
    "oh/hyd/LOW PRESSURE/3",
    "LOW PRESSURE, electric hydraulic pump 1",
    "Electric hydraulic pump 1 · Hydraulic panel · Forward overhead (P5)",
  ],
  ["oh/hyd/LOW PRESSURE/4", "LOW PRESSURE, engine 2", "Engine 2 · Hydraulic panel · Forward overhead (P5)"],
  ["oh/door/EQUIP/1", "EQUIP", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/FWD ENTRY/1", "FWD ENTRY", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/LEFT FWD OVERWING/1", "LEFT FWD OVERWING", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/LEFT AFT OVERWING/1", "LEFT AFT OVERWING", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/AFT ENTRY/1", "AFT ENTRY", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/FWD SERVICE/1", "FWD SERVICE", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/RIGHT FWD OVERWING/1", "RIGHT FWD OVERWING", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/RIGHT AFT OVERWING/1", "RIGHT AFT OVERWING", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/AFT SERVICE/1", "AFT SERVICE", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/FWD CARGO/1", "FWD CARGO", "Door warning panel · Forward overhead (P5)"],
  ["oh/door/AFT CARGO/1", "AFT CARGO", "Door warning panel · Forward overhead (P5)"],
  [
    "oh/air/ZONE TEMP/1",
    "ZONE TEMP, flight deck",
    "Flight deck · Air conditioning panel · Forward overhead (P5)",
  ],
  [
    "oh/air/ZONE TEMP/2",
    "ZONE TEMP, forward cabin",
    "Forward cabin · Air conditioning panel · Forward overhead (P5)",
  ],
  [
    "oh/air/ZONE TEMP/3",
    "ZONE TEMP, rear cabin",
    "Rear cabin · Air conditioning panel · Forward overhead (P5)",
  ],
  ["oh/bleed/DUAL BLEED/1", "DUAL BLEED", "Bleed air panel · Forward overhead (P5)"],
  ["oh/bleed/PACK/1", "PACK, left", "Left · Bleed air panel · Forward overhead (P5)"],
  ["oh/bleed/PACK/2", "PACK, right", "Right · Bleed air panel · Forward overhead (P5)"],
  [
    "oh/bleed/WING-BODY OVERHEAT/1",
    "WING-BODY OVERHEAT, left side",
    "Left side · Bleed air panel · Forward overhead (P5)",
  ],
  [
    "oh/bleed/WING-BODY OVERHEAT/2",
    "WING-BODY OVERHEAT, right side",
    "Right side · Bleed air panel · Forward overhead (P5)",
  ],
  ["oh/bleed/BLEED/1", "BLEED, engine 1", "Engine 1 · Bleed air panel · Forward overhead (P5)"],
  ["oh/bleed/BLEED/2", "BLEED, engine 2", "Engine 2 · Bleed air panel · Forward overhead (P5)"],
  ["oh/press/AUTO FAIL/1", "AUTO FAIL", "Cabin pressure panel · Forward overhead (P5)"],
  ["oh/press/OFF SCHED DESCENT/1", "OFF SCHED DESCENT", "Cabin pressure panel · Forward overhead (P5)"],
  ["oh/press/ALTN/1", "ALTN", "Cabin pressure panel · Forward overhead (P5)"],
  ["oh/press/MANUAL/1", "MANUAL", "Cabin pressure panel · Forward overhead (P5)"],
  ["aft/elt/ELT/1", "ELT", "ELT panel · Aft overhead (P5)"],
  ["aft/irs/GPS/1", "GPS", "IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/ILS/1", "ILS", "IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/GLS/1", "GLS", "IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/ALIGN/1", "ALIGN, left IRS", "Left IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/ALIGN/2", "ALIGN, right IRS", "Right IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/ON DC/1", "ON DC, left IRS", "Left IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/ON DC/2", "ON DC, right IRS", "Right IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/FAULT/1", "FAULT, left IRS", "Left IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/FAULT/2", "FAULT, right IRS", "Right IRS · IRS display and mode selectors · Aft overhead (P5)"],
  ["aft/irs/DC FAIL/1", "DC FAIL, left IRS", "Left IRS · IRS display and mode selectors · Aft overhead (P5)"],
  [
    "aft/irs/DC FAIL/2",
    "DC FAIL, right IRS",
    "Right IRS · IRS display and mode selectors · Aft overhead (P5)",
  ],
  ["aft/eng/REVERSER COMMAND/1", "REVERSER COMMAND", "Engine panel · Aft overhead (P5)"],
  ["aft/eng/REVERSER AIR/GRD/1", "REVERSER AIR/GRD", "Engine panel · Aft overhead (P5)"],
  ["aft/eng/REVERSER LIMITED/1", "REVERSER LIMITED, engine 1", "Engine 1 · Engine panel · Aft overhead (P5)"],
  ["aft/eng/REVERSER LIMITED/2", "REVERSER LIMITED, engine 2", "Engine 2 · Engine panel · Aft overhead (P5)"],
  ["aft/oxy/PASS OXY ON/1", "PASS OXY ON", "Oxygen panel · Aft overhead (P5)"],
  ["aft/rec/OFF/1", "OFF", "Flight recorder panel · Aft overhead (P5)"],
  ["aft/gear/LEFT GEAR/1", "LEFT GEAR", "Landing gear panel · Center panel (P2)"],
  ["aft/gear/RIGHT GEAR/1", "RIGHT GEAR", "Landing gear panel · Center panel (P2)"],
  ["aft/gear/NOSE GEAR/1", "NOSE GEAR", "Landing gear panel · Center panel (P2)"],
  ["mn/cl/BELOW G/S/1", "BELOW G/S", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/fl/BELOW G/S/1", "BELOW G/S", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/cl/TAKEOFF CONFIG/1", "TAKEOFF CONFIG", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/fl/TAKEOFF CONFIG/1", "TAKEOFF CONFIG", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/cl/CABIN ALTITUDE/1", "CABIN ALTITUDE", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/fl/CABIN ALTITUDE/1", "CABIN ALTITUDE", "Lights test and warning lights · Captain panel (P1)"],
  [
    "mn/cl/SPEED BRAKE DO NOT ARM/1",
    "SPEED BRAKE DO NOT ARM",
    "Lights test and warning lights · Captain panel (P1)",
  ],
  ["mn/cl/STAB OUT OF TRIM/1", "STAB OUT OF TRIM", "Lights test and warning lights · Captain panel (P1)"],
  ["mn/cl/SPEED BRAKE ARMED/1", "SPEED BRAKE ARMED", "Lights test and warning lights · Captain panel (P1)"],
  [
    "mn/ctr/LEFT GEAR/1",
    "LEFT GEAR, moving",
    "Moving · Integrated standby flight display · Center panel (P2)",
  ],
  [
    "mn/ctr/LEFT GEAR/2",
    "LEFT GEAR, down and locked",
    "Down and locked · Integrated standby flight display · Center panel (P2)",
  ],
  [
    "mn/ctr/NOSE GEAR/1",
    "NOSE GEAR, moving",
    "Moving · Integrated standby flight display · Center panel (P2)",
  ],
  [
    "mn/ctr/NOSE GEAR/2",
    "NOSE GEAR, down and locked",
    "Down and locked · Integrated standby flight display · Center panel (P2)",
  ],
  [
    "mn/ctr/RIGHT GEAR/1",
    "RIGHT GEAR, moving",
    "Moving · Integrated standby flight display · Center panel (P2)",
  ],
  [
    "mn/ctr/RIGHT GEAR/2",
    "RIGHT GEAR, down and locked",
    "Down and locked · Integrated standby flight display · Center panel (P2)",
  ],
  ["con/fi/ENG 1 OVERHEAT/1", "ENG 1 OVERHEAT", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  ["con/fi/ENG 2 OVERHEAT/1", "ENG 2 OVERHEAT", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  ["con/fi/APU DET INOP/1", "APU DET INOP", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  [
    "con/fi/APU BOTTLE DISCHARGE/1",
    "APU BOTTLE DISCHARGE",
    "Overheat/fire protection panel · Aft electronic panel (P8)",
  ],
  [
    "con/fi/L BOTTLE DISCHARGE/1",
    "L BOTTLE DISCHARGE",
    "Overheat/fire protection panel · Aft electronic panel (P8)",
  ],
  [
    "con/fi/R BOTTLE DISCHARGE/1",
    "R BOTTLE DISCHARGE",
    "Overheat/fire protection panel · Aft electronic panel (P8)",
  ],
  ["con/fi/L/1", "L", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  ["con/fi/R/1", "R", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  ["con/fi/APU/1", "APU", "Overheat/fire protection panel · Aft electronic panel (P8)"],
  ["con/cf/EXT FWD/1", "EXT FWD", "Cargo fire panel · Aft electronic panel (P8)"],
  ["con/cf/EXT AFT/1", "EXT AFT", "Cargo fire panel · Aft electronic panel (P8)"],
  ["con/cf/DETECTOR FAULT/1", "DETECTOR FAULT", "Cargo fire panel · Aft electronic panel (P8)"],
  ["gl/annl/FLT CONT/1", "FLT CONT", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annl/IRS/1", "IRS", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annl/FUEL/1", "FUEL", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annl/ELEC/1", "ELEC", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annl/APU/1", "APU", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annl/OVHT/DET/1", "OVHT/DET", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/ANTI-ICE/1", "ANTI-ICE", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/HYD/1", "HYD", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/DOORS/1", "DOORS", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/ENG/1", "ENG", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/OVERHEAD/1", "OVERHEAD", "Fire, caution and system annunciators · Glareshield (P7)"],
  ["gl/annr/AIR COND/1", "AIR COND", "Fire, caution and system annunciators · Glareshield (P7)"],
];

describe("Practice's light names with the iFly pack", () => {
  it("name every light and its caption as before", () => {
    const pack = iflyPack();
    const rows = seeds(pack, indexPack(pack))
      .filter((s) => s.id.startsWith("lights:meaning:"))
      .map((s) => [
        s.source.replace(/^light:/, ""),
        (s.why ?? "").split(" means: ")[0],
        s.stem?.kind === "light" ? s.stem.caption : "",
      ]);
    expect(rows).toEqual(LIGHTS);
  });

  it("place a light in no zone by its section, as the app names panels elsewhere (#211)", () => {
    // Panels have no title of their own any more: with no zones, every light's caption is its
    // section's name.
    const pack = iflyPack();
    const index = { ...indexPack(pack), zones: [] };
    const seed = seeds(pack, index).find((s) => s.source === "light:oh/fctl/LOW QUANTITY/1");
    const section = index.section("fctl");
    if (seed?.stem?.kind !== "light" || !section) throw new Error("no LOW QUANTITY question");
    expect(seed.stem.caption).toBe(sectionName(section));
    expect(seed.stem.caption).not.toBe("");
  });
});
