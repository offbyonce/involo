// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight sections (FlightSection boards), built from the pack's flight fields and pages
// (decision 0029): each row's label, the flight field it edits (or a read-only value, or a link
// to the section that holds it), its description, destination line and where the OFP prints it.
// The app keeps only how SimBrief's flight plan is laid out and the rendering; every word about
// an aircraft comes from the pack.

import type {
  FieldId,
  FieldOfp,
  FieldRange,
  FieldShow,
  FlatPack,
  Flight,
  FlightField,
  FlightOverviewRow,
  FlightPage,
  SavedPlan,
  SimbriefSource,
} from "@involo/bindings";
import type { FlightSection } from "../route.svelte";

/** What a row's OFP panel reads. */
export type Ctx = {
  values: Partial<Record<FieldId, string>>;
  plan: SavedPlan | null;
  notes: string;
  /** "lb" or "kg". */
  unit: string;
  /** Each option's suggestion, as its row shows it ("1,262 kg"), by option id; none without a
   * plan (decision 0027). */
  suggested?: Record<string, string | null>;
};

/** A stretch of a close-up, marked when it is the value. */
export type Part = { text: string; hi?: boolean; br?: boolean };

/** The OFP's sections, in SimBrief's default order. */
export const OFP_SECTIONS = [
  "Header and times",
  "Fuel plan",
  "Weights",
  "Navigation log, with the wind at each fix",
  "Alternate",
  "Weather: METAR and TAF",
  "NOTAMs",
] as const;

export type Ofp = {
  /** Index into OFP_SECTIONS, or null for a panel without the page outline. */
  section: number | null;
  title: string;
  body: string;
  /** Not set from the OFP (Clearance, Takeoff, Approach's chart values). */
  notin?: boolean | undefined;
  cap: string;
  close: (c: Ctx) => Part[];
  note: string;
};

export type Row = {
  id: string;
  label: string;
  /** The field this row edits. */
  field?: FieldId | undefined;
  /** A read-only value (plain mono text, no box). */
  read?: ((c: Ctx) => string) | undefined;
  /** A row that belongs to another section: its value is read-only and the chip is a link. */
  link?: FlightSection | undefined;
  /** A read-only row whose chip links to the phase that uses it ("Before start ›"). */
  phase?: string | undefined;
  /** A second field in the same row (Passengers and cargo). */
  second?:
    | {
        field: FieldId;
        placeholder: string;
        /** Its own accessible name ("assumed temperature"). */
        name: string;
        max: number;
        mode?: "numeric" | "decimal" | undefined;
        weight?: "thousands" | undefined;
      }
    | undefined;
  /** The first box's own name when a row has two ("rating", "passengers"). */
  firstName?: string | undefined;
  /** The flight's notes from ATC (Clearance), not a fill field. */
  notes?: boolean | undefined;
  /** How a value reads: "FL180", "163°". */
  show?: ((value: string) => string) | undefined;
  /** Choice values: a field-styled button that opens a menu. */
  choices?: string[] | undefined;
  /** The empty box's placeholder; amber while empty. */
  placeholder?: string | undefined;
  /** A weight in the flight's unit: shown in full with the unit ("12,400 lb"); `thousands`
   * when the flight stores thousands (its `display` scale). */
  weight?: "full" | "thousands" | undefined;
  max?: number | undefined;
  mode?: "numeric" | "decimal" | "text" | undefined;
  desc: string;
  /** Where the value goes in the cockpit, a plain muted line under the description (the field's
   * `location`). */
  loc?: string | undefined;
  /** The link text of a row whose value belongs to a phase ("Before start ›"). */
  chip?: string | undefined;
  /** A two-way control under the description (Minimums: BARO / RADIO). */
  seg?: { field: FieldId; values: [string, string]; label: string } | undefined;
  ofp: Ofp;
};

export type Group = {
  title: string;
  note?: ((c: Ctx) => string) | undefined;
  units?: boolean | undefined;
  /** The choice field the units toggle sets, and the words before it. */
  unitField?: string | undefined;
  unitLabel?: string | undefined;
  rows: Row[];
};
export type Section = { id: FlightSection; title: string; sub: string; groups: Group[]; selected: string };

const v = (c: Ctx, f: FieldId) => c.values[f] ?? "";
const dash = (s: string | undefined | null) => (s ? s : "—");
const grouped = (n: number) => Math.round(n).toLocaleString("en-US");
/** "+2" for a positive deviation, as the boards print it. */
const signed = (x: string) => (x && Number(x) > 0 && !x.startsWith("+") ? `+${x}` : x);

/** A plan figure in the flight's unit, or a dash without a plan. */
const planWeight = (c: Ctx, n: number | undefined) => (c.plan && n != null ? `${grouped(n)} ${c.unit}` : "—");

function minutes(s: number | undefined): string {
  if (s == null) return "—";
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Close-ups, built from the flight's own values (the boards' stand-ins in shape).
const routeLine = (c: Ctx, hi: "route" | "sid" | "arrival"): Part[] => {
  const dep = `${dash(v(c, "origin"))}/${dash(v(c, "runway"))} `;
  const route = v(c, "route") || "—";
  const arr = ` ${dash(v(c, "destination"))}/${dash(v(c, "arrival_runway"))}`;
  if (hi === "sid") {
    const [first, ...rest] = route.split(" ");
    return [{ text: dep }, { text: first ?? "—", hi: true }, { text: ` ${rest.slice(0, 3).join(" ")} …` }];
  }
  if (hi === "arrival") {
    const words = route.split(" ");
    return [
      { text: `… ${words.at(-2) ?? ""} ` },
      // The STAR, the destination and its runway are one marked stretch: a no-break space keeps
      // them on one line.
      { text: `${words.at(-1) ?? "—"}${arr.replace(" ", "\u00a0")}`, hi: true },
    ];
  }
  return [{ text: dep }, { text: route, hi: true }, { text: arr }];
};
const header = (
  c: Ctx,
  hi: "level" | "ci" | "wind" | "isa" | "ta" | "tl" | "fn" | "airports" | "alt" | "dist" | "time",
): Part[] => {
  // The close-up shows what the OFP prints: the plan's figures, or the flight's without a plan.
  const g = c.plan?.plan.general;
  const three = (n: number) => String(Math.round(n)).padStart(3, "0");
  const level =
    g?.cruiseAltitudeFt != null ? String(Math.round(g.cruiseAltitudeFt / 100)) : v(c, "cruise_level");
  const ci = g?.costIndex != null ? String(g.costIndex) : v(c, "cost_index");
  const wind =
    g?.avgWindDir != null && g.avgWindSpeed != null
      ? `${three(g.avgWindDir)}/${three(g.avgWindSpeed)}`
      : v(c, "cruise_wind");
  const isa = g?.avgIsaDeviation != null ? String(g.avgIsaDeviation) : v(c, "isa_deviation");
  const parts: [string, string][] = [
    ["level", `FL${dash(level)}`],
    ["ci", `CI ${dash(ci)}`],
    ["wind", `AVG WIND ${dash(wind)}`],
    ["isa", `ISA ${dash(signed(isa))}`],
  ];
  if (["level", "ci", "wind", "isa"].includes(hi))
    return parts.flatMap(([k, text], n): Part[] => [...(n ? [{ text: "  " }] : []), { text, hi: k === hi }]);
  if (hi === "ta" || hi === "tl")
    return [
      { text: `TRANS ALT ${dash(v(c, "transition_altitude"))}`, hi: hi === "ta" },
      { text: "   " },
      { text: `TRANS LVL FL${dash(v(c, "transition_level"))}`, hi: hi === "tl" },
    ];
  if (hi === "fn")
    return [
      { text: dash(v(c, "flight_number")), hi: true },
      { text: `  ${dash(v(c, "origin"))}-${dash(v(c, "destination"))}` },
    ];
  if (hi === "alt") return [{ text: "ALTN " }, { text: dash(v(c, "alternate")), hi: true }];
  if (hi === "dist")
    return [
      { text: "AIR DIST " },
      {
        text: c.plan?.plan.general.airDistanceNm != null ? `${c.plan.plan.general.airDistanceNm} NM` : "—",
        hi: true,
      },
    ];
  if (hi === "time")
    return [{ text: "EST TIME ENR " }, { text: minutes(c.plan?.plan.times.enrouteS), hi: true }];
  return [
    { text: dash(v(c, "origin")), hi: true },
    { text: " → " },
    { text: dash(v(c, "destination")), hi: true },
  ];
};
const fuelPlan = (c: Ctx, hi: "trip" | "reserve" | "taxi" | "block" | "min"): Part[] => {
  const f = c.plan?.plan.fuel;
  const line = (k: string, label: string, n: number | string | undefined, last = false): Part => ({
    text: `${label.padEnd(9)}${String(n ?? "—").padStart(6)}`,
    hi: k === hi || (hi === "reserve" && k === "altn"),
    br: !last,
  });
  return [
    line("trip", "TRIP", f?.trip),
    line("altn", "ALTN", f?.alternate),
    line("reserve", "RESERVE", f?.reserve),
    line("taxi", "TAXI", f?.taxi),
    line("min", "MIN T/O", f?.minTakeoff),
    line("block", "BLOCK", f?.planRamp ?? v(c, "fuel"), true),
  ];
};
const weights = (c: Ctx, hi: "zfw" | "tow" | "law" | "pax"): Part[] => {
  const w = c.plan?.plan.weights;
  const k = (n: number | undefined) => (n != null ? (n / 1000).toFixed(1) : "—");
  if (hi === "pax")
    return [
      { text: "PAX " },
      { text: `${w?.passengers ?? "—"}`, hi: true },
      { text: `   CARGO ${w?.cargo ?? "—"}` },
    ];
  return [
    { text: `ZFW ${k(w?.zfw)}`, hi: hi === "zfw" },
    { text: "   " },
    { text: `TOW ${k(w?.takeoff)}`, hi: hi === "tow" },
    { text: "   " },
    { text: `LAW ${k(w?.landing)}`, hi: hi === "law" },
  ];
};

const fromHeader = (title: string, close: Ofp["close"], note: string): Ofp => ({
  section: 0,
  title,
  body: "The header has the flight number, the airports, the route as filed, the distance and the times.",
  cap: "Close-up, the header",
  close,
  note,
});
const fromFuel = (title: string, hi: Parameters<typeof fuelPlan>[1], note: string): Ofp => ({
  section: 1,
  title,
  body: "The fuel plan lists each part of the fuel, then the total you board.",
  cap: "Close-up, the fuel plan",
  close: (c) => fuelPlan(c, hi),
  note,
});
const fromWeights = (title: string, hi: Parameters<typeof weights>[1], note: string): Ofp => ({
  section: 2,
  title,
  body: "The weights section gives the planned zero fuel, takeoff and landing weights.",
  cap: "Close-up, the weights section",
  close: (c) => weights(c, hi),
  note,
});
const clearanceOfp = (title = "Your clearance comes from ATC"): Ofp => ({
  section: 0,
  title,
  body: "The OFP shows what was planned and filed. ATC's clearance can differ, so enter what ATC gives you here.",
  notin: true,
  cap: "Close-up, the filed route",
  close: (c) => routeLine(c, "sid"),
  note: "The filed SID is first in the route. Check it against your clearance.",
});
const approachRoute: Ofp = {
  section: 0,
  title: "The arrival runway and STAR end the route",
  body: "The header's route line ends with the arrival: the STAR, then the destination and its runway. The destination's elevation is in the header too.",
  cap: "Close-up, the end of the route",
  close: (c) => routeLine(c, "arrival"),
  note: "Check the planned runway against the ATIS before you brief; it often changes.",
};
const cruiseHeader = (hi: "level" | "ci"): Ofp => ({
  ...fromHeader(
    "Cost index and cruise level are in the header",
    (c) => header(c, hi),
    "The navigation log repeats the level and wind at each fix.",
  ),
  body: "The header gives the cruise level, the cost index, and the average wind and temperature for the flight.",
});

/**
 * Where the OFP prints each SimBrief source the app reads, and what the panel says about it: the
 * app's knowledge of SimBrief's flight plan, for any aircraft. A pack changes a row's panel with
 * its field's `ofp`, or a page's.
 */
const SOURCE_OFP: Partial<Record<SimbriefSource, Ofp>> = {
  origin: fromHeader(
    "The airports are in the header",
    (c) => header(c, "airports"),
    "The header names both airports first, in ICAO codes.",
  ),
  destination: fromHeader(
    "The airports are in the header",
    (c) => header(c, "airports"),
    "The header names both airports first, in ICAO codes.",
  ),
  alternate: {
    section: 4,
    title: "The alternate has its own section",
    body: "The alternate section gives the alternate airport, the route there and the fuel to get there.",
    cap: "Close-up, the alternate section",
    close: (c) => header(c, "alt"),
    note: "The header names the alternate too.",
  },
  flight_number: fromHeader(
    "The flight number opens the header",
    (c) => header(c, "fn"),
    "It comes before the airports in most layouts.",
  ),
  route: {
    ...fromHeader(
      "The route is in the header",
      (c) => routeLine(c, "route"),
      "The route sits between the departure and the destination, each with its runway.",
    ),
    cap: "Close-up, the header's route line",
  },
  air_distance: fromHeader(
    "The distance is in the header",
    (c) => header(c, "dist"),
    "Air distance allows for the winds along the route.",
  ),
  enroute_time: fromHeader(
    "The planned time is in the header",
    (c) => header(c, "time"),
    "Estimated time en route, from takeoff to landing.",
  ),
  block_fuel: fromFuel(
    "Block fuel is in the fuel plan",
    "block",
    "Block is the total: everything on board before engine start.",
  ),
  trip_fuel: fromFuel("Trip fuel is in the fuel plan", "trip", "Trip is the burn from takeoff to landing."),
  reserve_fuel: fromFuel(
    "Reserves are in the fuel plan",
    "reserve",
    "Reserve is the final reserve; the alternate fuel is listed beside it.",
  ),
  alternate_fuel: fromFuel(
    "Reserves are in the fuel plan",
    "reserve",
    "Reserve is the final reserve; the alternate fuel is listed beside it.",
  ),
  taxi_fuel: fromFuel("Taxi fuel is in the fuel plan", "taxi", "Taxi is the planned burn before takeoff."),
  minimum_takeoff_fuel: fromFuel(
    "Minimum takeoff fuel is in the fuel plan",
    "min",
    "The least fuel to start the takeoff with.",
  ),
  zero_fuel_weight: fromWeights(
    "Zero fuel weight is in the weights section",
    "zfw",
    "The weights section gives it in full.",
  ),
  passengers: fromWeights("The payload is in the weights section", "pax", "Passengers, then cargo."),
  cargo: fromWeights("The payload is in the weights section", "pax", "Passengers, then cargo."),
  takeoff_weight: fromWeights(
    "The takeoff weight is in the weights section",
    "tow",
    "Zero fuel weight plus the fuel at takeoff.",
  ),
  cruise_level: cruiseHeader("level"),
  cost_index: cruiseHeader("ci"),
  cruise_wind: fromHeader(
    "The average wind is in the header",
    (c) => header(c, "wind"),
    "Each fix's own wind is in the navigation log.",
  ),
  isa_deviation: fromHeader(
    "The ISA deviation is in the header",
    (c) => header(c, "isa"),
    "Plus is warmer than standard.",
  ),
  transition_altitude: fromHeader(
    "The transition altitude is in the header",
    (c) => header(c, "ta"),
    "The departure airport's transition altitude.",
  ),
  transition_level: fromHeader(
    "The transition level is in the header",
    (c) => header(c, "tl"),
    "The destination's transition level.",
  ),
  runway: clearanceOfp(),
  sid: clearanceOfp(),
  transition: clearanceOfp(),
  arrival_runway: approachRoute,
  star: approachRoute,
  destination_elevation: {
    ...approachRoute,
    title: "The destination elevation is in the header",
    note: "The header gives each airport's elevation.",
  },
};

/** The panel of a value the plan doesn't give. */
const NOT_IN_PLAN: Ofp = {
  section: null,
  title: "Not in the flight plan",
  body: "The OFP doesn't give this value. Enter it from the source your procedures name.",
  notin: true,
  cap: "Close-up, the header",
  close: (c) => header(c, "airports"),
  note: "",
};

/** A panel changed by a pack's parts. */
function withParts(base: Ofp, parts: FieldOfp | null | undefined): Ofp {
  if (!parts) return base;
  const from = parts.from ? SOURCE_OFP[parts.from] : undefined;
  const b = from ?? base;
  return {
    ...b,
    title: parts.title ?? b.title,
    body: parts.body ?? b.body,
    note: parts.note ?? b.note,
    notin: parts.notInPlan ?? b.notin,
    section: parts.outline === false ? null : b.section,
  };
}

/** The Flight pages that hold fields, and their names when a pack gives no `pages`. */
const PAGE_NAMES: Record<string, string> = {
  route: "Route",
  fuel: "Fuel and weights",
  cruise: "Cruise and levels",
  clearance: "Clearance",
  takeoff: "Takeoff",
  approach: "Approach",
};
/** The card that holds a pack's fields with no page, when it gives no `pages`. */
const DEFAULT_GROUP = "Flight values";

/** What the Flight pages are built from: the pack's fields, pages and phases. */
type Model = {
  sections: Section[];
  fields: Map<string, FlightField>;
  needed: FieldId[];
  /** The choice field that holds the flight's unit (a units toggle names it). */
  unitField: FlightField | null;
  /** The pack's Overview rows. */
  overview: FlightOverviewRow[];
  /** Each Flight page's title, in order, with the SimBrief values its fields and plan note use. */
  fed: { title: string; sources: Set<string> }[];
};

let model: Model = buildModel(null);

/** Builds the Flight pages from a pack (`App` does when the pack loads); none without one. */
export function useFlightPack(pack: FlatPack | null): void {
  model = buildModel(pack);
}

/** The Flight pages of the pack in use. */
export function sections(): Section[] {
  return model.sections;
}

/** The titles of the pack's Flight pages that use any of these SimBrief values, in page order: for
 * "where the app uses it" beside each part of the OFP. */
export function pagesFedBy(sources: readonly string[]): string[] {
  return model.fed.filter((p) => sources.some((s) => p.sources.has(s))).map((p) => p.title);
}

/** A flight field of the pack in use. */
export function fieldOf(id: string): FlightField | undefined {
  return model.fields.get(id);
}

/** Fields the steps' blanks use, and any the pack marks `needed`: what "N to enter" counts. */
export function needed(): FieldId[] {
  return model.needed;
}

function buildModel(pack: FlatPack | null): Model {
  const file = pack?.content.flight;
  const all = file?.fields ?? [];
  const fields = new Map(all.map((f) => [f.id, f]));
  const phases = new Map((pack?.content.phases?.phases ?? []).map((p) => [p.id, p.title]));
  const filled = new Set((pack?.lists ?? []).flatMap((l) => l.steps.flatMap((s) => s.fill ?? [])));
  const needed = all.filter((f) => f.needed || filled.has(f.id)).map((f) => f.id);
  // Fields shown inside another's row: a second box, or a toggle.
  const inside = new Set(all.flatMap((f) => [f.with, f.toggle].filter((x): x is string => !!x)));
  const pages: FlightPage[] = file?.pages?.length
    ? file.pages
    : Object.keys(PAGE_NAMES).map((id) => ({
        id,
        title: PAGE_NAMES[id] ?? id,
        groups: [
          ...new Set(
            all
              .filter((f) => !inside.has(f.id) && (f.page ?? "route") === id)
              .map((f) => (f.page ? (f.group ?? DEFAULT_GROUP) : DEFAULT_GROUP)),
          ),
        ].map((title) => ({ title })),
      }));
  const placed = (f: FlightField, page: string) =>
    file?.pages?.length ? f.page === page : (f.page ?? "route") === page;
  const groupOf = (f: FlightField) =>
    file?.pages?.length ? f.group : f.page ? (f.group ?? DEFAULT_GROUP) : DEFAULT_GROUP;
  const titleOf = (page: string) => pages.find((p) => p.id === page)?.title ?? PAGE_NAMES[page] ?? page;
  const unitField =
    pages
      .flatMap((p) => p.groups)
      .map((g) => (g.units ? fields.get(g.units.field) : undefined))
      .find(Boolean) ?? null;

  const rowOf = (f: FlightField, page: FlightPage): Row => {
    const w = f.with ? fields.get(f.with) : undefined;
    const t = f.toggle ? fields.get(f.toggle) : undefined;
    const base = f.simbrief?.[0] ? SOURCE_OFP[f.simbrief[0]] : undefined;
    const ofp = withParts(base ?? withParts(NOT_IN_PLAN, page.ofp), f.ofp);
    const read = readOf(f);
    return {
      id: f.id,
      label: f.label,
      field: read ? undefined : (f.id as FieldId),
      read,
      phase: f.phase ?? undefined,
      chip: f.phase ? `${phases.get(f.phase) ?? f.phase} ›` : undefined,
      show: f.show ? showOf(f.show) : undefined,
      choices: f.kind === "choice" ? f.choices?.map((c) => c.value) : undefined,
      placeholder: f.input?.placeholder ?? undefined,
      weight: read ? undefined : weightOf(f),
      max: f.input?.maxLength ?? undefined,
      mode: f.input?.mode ?? undefined,
      desc: f.description ?? "",
      loc: f.location ?? undefined,
      firstName: w ? spokenOf(f) : undefined,
      second: w
        ? {
            field: w.id as FieldId,
            placeholder: w.input?.placeholder ?? w.label,
            name: spokenOf(w),
            max: w.input?.maxLength ?? 0,
            mode: w.input?.mode === "text" ? undefined : (w.input?.mode ?? undefined),
            weight: weightOf(w) === "thousands" ? "thousands" : undefined,
          }
        : undefined,
      seg: t
        ? {
            field: t.id as FieldId,
            values: [t.choices?.[0]?.value ?? "", t.choices?.[1]?.value ?? ""],
            label: t.label,
          }
        : undefined,
      ofp,
    };
  };

  const sections: Section[] = pages.flatMap((page) => {
    const groups: Group[] = page.groups.map((g) => {
      const rows: Row[] = [];
      // The group's own order first, then the rest in the file's order.
      const listed = g.fields ?? [];
      const ordered = [
        ...listed.map((id) => fields.get(id)).filter((f): f is FlightField => !!f),
        ...all.filter((f) => !listed.includes(f.id)),
      ];
      for (const f of ordered) {
        if (inside.has(f.id)) continue;
        if (placed(f, page.id) && groupOf(f) === g.title) rows.push(rowOf(f, page));
        for (const also of f.also ?? [])
          if (also.page === page.id && also.group === g.title && f.page) {
            const home = rowOf(f, page);
            rows.push({
              ...home,
              id: `${f.id}@${page.id}`,
              label: also.label ?? f.label,
              field: f.id as FieldId,
              read: undefined,
              link: f.page as FlightSection,
              chip: `${titleOf(f.page)} ›`,
              placeholder: undefined,
              weight: undefined,
              max: undefined,
              mode: undefined,
              loc: undefined,
              choices: undefined,
              desc: also.description ?? f.description ?? "",
              ofp: also.ofp ? withParts(home.ofp, also.ofp) : home.ofp,
            });
          }
      }
      if (g.notes)
        rows.push({
          id: "notes",
          label: g.notes.label,
          notes: true,
          desc: g.notes.description ?? "",
          ofp: withParts(NOT_IN_PLAN, page.ofp),
        });
      const note = g.notes
        ? (c: Ctx) => {
            const n = c.notes.split("\n").filter((l) => l.trim()).length;
            return n ? `${n} ${n === 1 ? "note" : "notes"}` : "";
          }
        : g.note
          ? () => g.note ?? ""
          : undefined;
      return {
        title: g.title,
        note,
        units: g.units ? true : undefined,
        unitField: g.units?.field,
        unitLabel: g.units?.label ?? undefined,
        rows,
      };
    });
    const rows = groups.flatMap((g) => g.rows);
    if (!rows.length) return [];
    return [
      {
        id: page.id as FlightSection,
        title: page.title,
        sub: page.sub ?? "",
        groups: groups.filter((g) => g.rows.length),
        selected: page.selected ?? rows[0]?.id ?? "",
      },
    ];
  });
  // What each page takes from a plan: its fields' SimBrief values, and those of the field its plan
  // note is taken from.
  const sourcesOf = (f: FlightField | undefined) => f?.simbrief ?? [];
  const fed = pages.map((page) => ({
    title: page.title,
    sources: new Set([
      ...all.filter((f) => placed(f, page.id)).flatMap(sourcesOf),
      ...sourcesOf(page.ofp?.from ? fields.get(page.ofp.from) : undefined),
    ]),
  }));
  return { sections, fields, needed: needed as FieldId[], unitField, overview: file?.overview ?? [], fed };
}

/** How a field's value reads, from its `show`. */
function showOf(s: FieldShow): (value: string) => string {
  return (x) => {
    const body = s.grouped && Number.isFinite(Number(x)) ? grouped(Number(x)) : s.signed ? signed(x) : x;
    return `${s.prefix ?? ""}${body}${s.suffix ?? ""}`;
  };
}

/** A weight in the flight's unit: in full, or in thousands as the field stores it. */
function weightOf(f: FlightField): Row["weight"] {
  if (!f.unit) return undefined;
  return f.display && f.display.scale === 1000 ? "thousands" : "full";
}

/** What a link or a second box calls a field. */
const spokenOf = (f: FlightField) => f.spoken ?? f.id.replace(/_/g, " ");

/** The value of a row shown, not typed: an option's suggestion, a plan figure the plan alone
 * gives, or a stored value. */
function readOf(f: FlightField): Row["read"] {
  if (f.suggestedBy) {
    const option = f.suggestedBy;
    return (c) => c.suggested?.[option] ?? "—";
  }
  if (!f.readOnly) return undefined;
  switch (f.simbrief?.[0]) {
    case "air_distance":
      return (c) =>
        c.plan?.plan.general.airDistanceNm != null ? `${c.plan.plan.general.airDistanceNm} nm` : "—";
    case "enroute_time":
      return (c) => minutes(c.plan?.plan.times.enrouteS);
    case "trip_fuel":
      return (c) => planWeight(c, c.plan?.plan.fuel.trip);
    case "taxi_fuel":
      return (c) => planWeight(c, c.plan?.plan.fuel.taxi);
    default: {
      const show = f.show ? showOf(f.show) : (x: string) => x;
      return (c) => {
        const x = v(c, f.id as FieldId);
        if (!x) return "—";
        return f.unit ? `${grouped(Number(x))} ${c.unit}` : show(x);
      };
    }
  }
}

/** The altimeter settings the Weather page edits, found by their SimBrief source: the departure's
 * and the destination's fields, and the choice field their unit names (inHg or hPa). */
export function altimeters(): {
  departure: FieldId | null;
  destination: FieldId | null;
  unit: FieldId | null;
} {
  const by = (source: SimbriefSource) =>
    [...model.fields.values()].find((f) => (f.simbrief ?? []).includes(source)) ?? null;
  const departure = by("origin_altimeter");
  const destination = by("destination_altimeter");
  const unit = departure?.unit ?? destination?.unit ?? null;
  return {
    departure: (departure?.id as FieldId) ?? null,
    destination: (destination?.id as FieldId) ?? null,
    unit: (unit as FieldId) ?? null,
  };
}

/** One "This flight" row on the Overview: its label, value, description and the page it links to. */
export type OverviewRow = { label: string; value: string; desc: string; page: FlightSection; title: string };

/** A field's value as the pages show it: typed, or read from the plan or a suggestion; "" when
 * there is none. */
function shownValue(id: string, c: Ctx): string {
  const f = model.fields.get(id);
  const read = f ? readOf(f) : undefined;
  const x = read ? read(c) : v(c, id as FieldId);
  return x === "—" ? "" : (x ?? "");
}

/** A template part with its placeholders filled, or "" when none of its fields has a value. */
function fillPart(part: string, c: Ctx): string {
  let any = false;
  const text = part.replace(/\{([a-z0-9_]+)(?::(grouped))?\}/g, (_, id: string, how?: string) => {
    if (id === "unit" && !how) return c.unit;
    const x = shownValue(id, c);
    if (!x) return "—";
    any = true;
    return how === "grouped" ? grouped(Number(x)) : x;
  });
  return any ? text : "";
}

/** The Overview's "This flight" rows: the pack's own, or one per page with fields (its title,
 * its first two values and its sub-line). */
export function overviewRows(c: Ctx): OverviewRow[] {
  const title = (page: string) => model.sections.find((s) => s.id === page)?.title ?? page;
  if (model.overview.length)
    return model.overview.map((row) => {
      const desc = (row.description ?? [])
        .map((p) => fillPart(p, c))
        .filter(Boolean)
        .join(" ");
      return {
        label: row.label,
        value:
          (row.value ?? [])
            .map((p) => fillPart(p, c))
            .filter(Boolean)
            .join(" · ") || "—",
        desc: desc || row.empty || "",
        page: row.page as FlightSection,
        title: title(row.page),
      };
    });
  return model.sections
    .map((s) => ({ s, fields: s.groups.flatMap((g) => g.rows).filter((r) => r.field && !r.link) }))
    .filter(({ fields }) => fields.length)
    .map(({ s, fields }) => ({
      label: s.title,
      value:
        fields
          .slice(0, 2)
          .map((r) => shownValue(r.field ?? "", c))
          .filter(Boolean)
          .join(" · ") || "—",
      desc: s.sub,
      page: s.id,
      title: s.title,
    }));
}

/** The section that holds a field, and its row, for "— enter …" links and Still to enter. */
export function home(field: FieldId): { section: FlightSection; row: Row } | null {
  for (const s of model.sections)
    for (const g of s.groups)
      for (const r of g.rows) if (r.field === field && !r.link) return { section: s.id, row: r };
  return null;
}

/** Empty fields the steps need, per section ("2 to enter"). */
export function toEnter(values: Partial<Record<FieldId, string>>, section?: FlightSection): Row[] {
  return model.sections
    .filter((s) => !section || s.id === section)
    .flatMap((s) => s.groups.flatMap((g) => g.rows))
    .filter((r) => r.field && !r.link && model.needed.includes(r.field) && !values[r.field]);
}

/** The flight's unit, lower case, for labels: the value of the field a units toggle sets. */
export function unitOf(flight: Flight): string {
  const f = model.unitField;
  if (!f) return "";
  return (flight.values?.[f.id] ?? f.choices?.[0]?.value ?? "").toLowerCase();
}

/**
 * For each of a step's blanks, the Flight field it links to (Checklist board: "— enter takeoff
 * trim"), or null for a blank typed in place: the pilot's own, or a value the Flight pages only
 * show. The altimeter settings live on Weather's Departure and Destination tabs.
 */
export function blankLinks(fill: FieldId[]): ({ href: string; name: string } | null)[] {
  return fill.map((field) => {
    if (field === "manual") return null;
    const def = model.fields.get(field);
    const name = def ? spokenOf(def) : field.replace(/_/g, " ");
    const alt = altimeters();
    if (field === alt.departure || field === alt.destination)
      return { href: `#/flight/weather/${field}`, name };
    const at = home(field);
    return at ? { href: `#/flight/${at.section}/${field}`, name } : null;
  });
}

/** A number from a field's text, or NaN. */
const number = (x: string) => (x.trim() === "" ? Number.NaN : Number(x));

/** The range that applies to a field's value: the one for the flight's unit, or for every unit. */
function rangeFor(f: FlightField, c: Ctx): FieldRange | undefined {
  const ranges = f.ranges ?? [];
  if (!ranges.length) return undefined;
  if (f.unit) {
    const unitField = model.fields.get(f.unit);
    const unit = c.values[f.unit as FieldId] ?? unitField?.choices?.[0]?.value;
    return ranges.find((r) => r.unit === unit) ?? ranges.find((r) => !r.unit) ?? ranges[0];
  }
  return ranges.find((r) => !r.unit) ?? ranges[0];
}

/** "Enter {min} to {max}", in the values as the page shows them, or the pack's own words. */
function messageOf(f: FlightField, r: FieldRange, c: Ctx): string {
  if (r.message) return r.message.replace(/\{unit\}/g, c.unit);
  const scale = f.display?.scale ?? 1;
  const shown = (n: number) => grouped(n * scale);
  return `Enter ${shown(r.min)} to ${shown(r.max)}${f.unit ? ` ${c.unit}` : ""}`;
}

/** The message for a field's value, or null when it's in range or empty. */
export function rangeMessage(field: FieldId, c: Ctx): string | null {
  const value = c.values[field] ?? "";
  const f = model.fields.get(field);
  const r = f ? rangeFor(f, c) : undefined;
  if (!value || !f || !r) return null;
  const n = number(value);
  return Number.isFinite(n) && n >= r.min && n <= r.max ? null : messageOf(f, r, c);
}
