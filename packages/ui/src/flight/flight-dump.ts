// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight pages as data, for a test that holds them to what they showed before they were drawn
// from the pack's flight fields: every page, group and row, with each function evaluated in a few
// flights (with and without a plan, in pounds and kilograms), the range messages, the fields Still
// to enter counts and the step links' names.

import type { FieldId, Plan, SavedPlan } from "@involo/bindings";
import type { Ctx, Section } from "./sections";

/** Values every row can show: a stand-in for each field the pages name. */
export const SAMPLE_VALUES: Record<string, string> = {
  origin: "KSEA",
  destination: "KSFO",
  alternate: "KOAK",
  flight_number: "ASA123",
  route: "SUMMA2 SUMMA J1 BTG BTG3",
  fuel: "18400",
  reserves: "6.2",
  minimum_takeoff_fuel: "12345",
  zfw: "128.4",
  cg: "24.5",
  passengers: "162",
  cargo: "3.4",
  takeoff_weight: "146.8",
  cruise_level: "360",
  cost_index: "35",
  cruise_wind: "270/045",
  isa_deviation: "2",
  transition_altitude: "18000",
  transition_level: "180",
  runway: "16L",
  sid: "SUMMA2",
  transition: "SEA",
  initial_altitude: "5000",
  squawk: "4521",
  ground_frequency: "121.7",
  tower_frequency: "119.9",
  departure_frequency: "125.2",
  heading: "163",
  takeoff_flaps: "5",
  thrust_rating: "TO-1",
  assumed_temperature: "42",
  v1: "145",
  vr: "150",
  v2: "155",
  takeoff_trim: "5.25",
  arrival_runway: "28R",
  star: "BDEGA3",
  minimums: "200",
  minimums_type: "BARO",
  vref: "141",
  landing_flaps: "30",
  autobrake: "2",
  landing_altitude: "13",
  qnh: "30.12",
  qnh_unit: "inHg",
  destination_qnh: "29.98",
  weight_unit: "LB",
};

/** The iFly pack's option whose suggestion its Center tank row shows (a test's own knowledge). */
const SUGGESTING = "center_tank";

/** The flights each function is read in. */
export function contexts(plan: Plan): Ctx[] {
  const saved = { format: 1, plan, loadedAt: 0 } as SavedPlan;
  return [
    { values: {}, plan: null, notes: "", unit: "lb", suggested: {} },
    {
      values: SAMPLE_VALUES as Partial<Record<FieldId, string>>,
      plan: null,
      notes: "Climb via SID\nExpect FL360",
      unit: "lb",
      suggested: {},
    },
    {
      values: { ...SAMPLE_VALUES, weight_unit: "KG", qnh_unit: "hPa", qnh: "1013" } as Partial<
        Record<FieldId, string>
      >,
      plan: saved,
      notes: "",
      unit: "kg",
      suggested: { [SUGGESTING]: "1,262 kg" },
    },
  ];
}

/** Values a row's `show` is read with. */
const SHOW = ["", "5", "-3", "18000", "abc"];
/** Values the range checks are read with, per field. */
const PROBES = [
  "-100000",
  "-1000",
  "-60",
  "-1",
  "0",
  "0.5",
  "1",
  "10",
  "28",
  "31",
  "50",
  "60",
  "80",
  "100",
  "250",
  "251",
  "360",
  "400",
  "401",
  "410",
  "500",
  "600",
  "948",
  "1050",
  "9999",
  "14000",
  "20000",
  "41000",
  "99999",
];

/** Every page as plain data. */
export function dumpSections(sections: Section[], ctxs: Ctx[]): unknown {
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    sub: s.sub,
    selected: s.selected,
    groups: s.groups.map((g) => ({
      title: g.title,
      units: g.units ?? false,
      note: ctxs.map((c) => g.note?.(c) ?? null),
      rows: g.rows.map((r) => ({
        label: r.label,
        field: r.field ?? null,
        link: r.link ?? null,
        phase: r.phase ?? null,
        chip: r.chip ?? null,
        notes: r.notes ?? false,
        placeholder: r.placeholder ?? null,
        weight: r.weight ?? null,
        max: r.max ?? null,
        mode: r.mode ?? null,
        desc: r.desc,
        loc: r.loc ?? null,
        firstName: r.firstName ?? null,
        choices: r.choices ?? null,
        second: r.second ?? null,
        seg: r.seg ?? null,
        read: r.read ? ctxs.map((c) => r.read?.(c)) : null,
        show: r.show ? SHOW.map((x) => r.show?.(x)) : null,
        ofp: {
          section: r.ofp.section,
          title: r.ofp.title,
          body: r.ofp.body,
          notin: r.ofp.notin ?? false,
          cap: r.ofp.cap,
          note: r.ofp.note,
          close: ctxs.map((c) => r.ofp.close(c)),
        },
      })),
    })),
  }));
}

/** Each field's range message for each probe, in each flight. */
export function dumpRanges(
  fields: string[],
  message: (field: FieldId, c: Ctx) => string | null,
  ctxs: Ctx[],
): unknown {
  return Object.fromEntries(
    fields.map((f) => [
      f,
      ctxs.flatMap((c) =>
        PROBES.map((p) => message(f as FieldId, { ...c, values: { ...c.values, [f]: p } })),
      ),
    ]),
  );
}
