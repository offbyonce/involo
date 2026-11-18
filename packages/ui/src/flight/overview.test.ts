// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Overview's "This flight" rows from the pack (decision 0029). With the iFly pack they read as
// the page wrote them before: `before` below is that page's code, kept as it was.

import { readFileSync } from "node:fs";
import type { FieldId, FlatPack, FlightFile, Plan } from "@involo/bindings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initSync, parse_plan } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { examplePack, iflyPack } from "../test-pack";
import { contexts, SAMPLE_VALUES } from "./flight-dump";
import { type Ctx, overviewRows, useFlightPack } from "./sections";

const root = `${import.meta.dirname}/../../../..`;
let plan: Plan;
beforeAll(() => {
  initSync({ module: readFileSync(`${root}/apps/web/src/wasm/involo_web_host_bg.wasm`) });
  plan = (
    JSON.parse(
      parse_plan(readFileSync(`${root}/crates/involo-simbrief/tests/fixtures/ofp-sample.json`, "utf8")),
    ) as { ok: Plan }
  ).ok;
  useFlightPack(iflyPack());
});
afterAll(() => useFlightPack(iflyPack()));

/** The rows OverviewView wrote before they came from the pack, as it wrote them. */
function before(ctx: Ctx) {
  const v = (k: string) => ctx.values[k as FieldId] ?? "";
  const grouped = (n: number) => Math.round(n).toLocaleString("en-US");
  const t = ctx.plan?.plan.times.enrouteS;
  const planned = t != null ? `${Math.floor(t / 3600)} h ${Math.round((t % 3600) / 60)} min planned.` : "";
  return [
    {
      label: "Route",
      value: v("origin") || v("destination") ? `${v("origin") || "—"} → ${v("destination") || "—"}` : "—",
      desc:
        [v("alternate") ? `Alternate ${v("alternate")}.` : "", planned].filter(Boolean).join(" ") ||
        "Where you're going.",
      page: "route",
      title: "Route",
    },
    {
      label: "Block fuel",
      value: v("fuel") ? `${grouped(Number(v("fuel")))} ${ctx.unit}` : "—",
      desc: "All the fuel on board before engine start.",
      page: "fuel",
      title: "Fuel and weights",
    },
    {
      label: "Cruise level",
      value: v("cruise_level") ? `FL${v("cruise_level")}` : "—",
      desc: v("cost_index") ? `Cost index ${v("cost_index")}.` : "The level you plan to cruise at.",
      page: "cruise",
      title: "Cruise and levels",
    },
    {
      label: "Departure",
      value: [v("runway"), v("sid")].filter(Boolean).join(" · ") || "—",
      desc:
        [
          v("initial_altitude") ? `Initial altitude ${v("initial_altitude")}.` : "",
          v("squawk") ? `Squawk ${v("squawk")}.` : "",
        ]
          .filter(Boolean)
          .join(" ") || "The runway and SID ATC cleared.",
      page: "clearance",
      title: "Clearance",
    },
  ];
}

describe("the Overview's This flight rows", () => {
  it("with the iFly pack, read as before in every flight, each field set or blank", () => {
    const keys = [
      "origin",
      "destination",
      "alternate",
      "fuel",
      "cruise_level",
      "cost_index",
      "runway",
      "sid",
      "initial_altitude",
      "squawk",
    ];
    for (const ctx of contexts(plan)) {
      expect(overviewRows(ctx)).toEqual(before(ctx));
      // Each field alone, and all but each.
      for (const k of keys) {
        const only = { ...ctx, values: { [k]: SAMPLE_VALUES[k] } };
        expect(overviewRows(only), `only ${k}`).toEqual(before(only));
        const values = { ...SAMPLE_VALUES } as Record<string, string>;
        delete values[k];
        const without = { ...ctx, values };
        expect(overviewRows(without), `without ${k}`).toEqual(before(without));
      }
    }
  });

  it("follow a test pack's own rows and field names", () => {
    // Invented: a pack whose airports are dep and arr, and whose fuel is ramp_fuel.
    const pack = structuredClone(examplePack()) as FlatPack;
    pack.content.flight = {
      pages: [{ id: "route", title: "Trip", groups: [{ title: "Trip" }] }],
      fields: [
        { id: "dep", label: "From", kind: "text", page: "route", group: "Trip" },
        { id: "arr", label: "To", kind: "text", page: "route", group: "Trip" },
        { id: "ramp_fuel", label: "Ramp fuel", kind: "number", page: "route", group: "Trip" },
      ],
      overview: [
        {
          label: "Trip",
          page: "route",
          value: ["{dep} to {arr}"],
          description: ["{ramp_fuel:grouped} kg ramp."],
          empty: "Where to.",
        },
      ],
    } as unknown as FlightFile;
    useFlightPack(pack);
    const ctx = (values: Record<string, string>): Ctx => ({
      values,
      plan: null,
      notes: "",
      unit: "kg",
      suggested: {},
    });
    expect(overviewRows(ctx({}))).toEqual([
      { label: "Trip", value: "—", desc: "Where to.", page: "route", title: "Trip" },
    ]);
    expect(overviewRows(ctx({ arr: "EGLL", ramp_fuel: "12500" }))[0]).toMatchObject({
      value: "— to EGLL",
      desc: "12,500 kg ramp.",
    });
    useFlightPack(iflyPack());
  });

  it("without overview rows, give one row per page with fields: its title, first two values and sub-line", () => {
    const pack = structuredClone(examplePack()) as FlatPack;
    pack.content.flight = {
      pages: [
        { id: "route", title: "Trip", sub: "Where you fly.", groups: [{ title: "Trip" }] },
        { id: "fuel", title: "Fuel", groups: [{ title: "Fuel" }] },
      ],
      fields: [
        { id: "dep", label: "From", kind: "text", page: "route", group: "Trip" },
        { id: "arr", label: "To", kind: "text", page: "route", group: "Trip" },
        { id: "alt", label: "Alternate", kind: "text", page: "route", group: "Trip" },
      ],
    } as unknown as FlightFile;
    useFlightPack(pack);
    const ctx: Ctx = {
      values: { dep: "KSEA", alt: "KOAK" } as never,
      plan: null,
      notes: "",
      unit: "kg",
      suggested: {},
    };
    expect(overviewRows(ctx)).toEqual([
      { label: "Trip", value: "KSEA", desc: "Where you fly.", page: "route", title: "Trip" },
    ]);
    useFlightPack(iflyPack());
  });

  it("are written in the page's code with no field id or aircraft word", () => {
    const text = readFileSync(`${import.meta.dirname}/OverviewView.svelte`, "utf8");
    expect(text).not.toMatch(
      /origin|destination|alternate|"fuel"|cruise_level|cost_index|runway|"sid"|squawk|Block fuel|Fuel and weights|FL\$/,
    );
  });
});
