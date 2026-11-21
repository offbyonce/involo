// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight pages drawn from the pack's flight fields (decision 0029). With the iFly pack they
// show exactly what they showed before: the fixture was written from the old hand-written table
// before the change, and is kept as it was, never regenerated.

import { readFileSync } from "node:fs";
import type { FieldId, FlatPack, FlightFile, Plan } from "@involo/bindings";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync, parse_plan } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { examplePack, iflyPack } from "../test-pack";
import fixture from "./fixtures/flight-pages-ifly.json";
import { contexts, dumpRanges, dumpSections, SAMPLE_VALUES } from "./flight-dump";
import { blankLinks, home, needed, rangeMessage, sections, toEnter, unitOf, useFlightPack } from "./sections";

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

describe("the Flight pages with the iFly pack, as before", () => {
  it("show the same pages, groups, rows, labels, choices, formats and side panels", () => {
    const ctxs = contexts(plan);
    const now = dumpSections(sections(), ctxs) as typeof fixture.sections;
    expect(now.map((s) => s.id)).toEqual(fixture.sections.map((s) => s.id));
    for (const [n, s] of fixture.sections.entries()) expect(now[n], s.id).toEqual(s);
  });

  it("check the same ranges with the same messages", () => {
    const fields = Object.keys(SAMPLE_VALUES);
    expect(dumpRanges(fields, rangeMessage, contexts(plan))).toEqual(fixture.ranges);
  });

  it("count the same fields to enter and link the same blanks", () => {
    const ctxs = contexts(plan);
    expect([...needed()].sort()).toEqual([...fixture.needed].sort());
    expect(ctxs.map((c) => toEnter(c.values).map((r) => r.field))).toEqual(fixture.toEnter);
    const fields = Object.keys(SAMPLE_VALUES);
    expect(blankLinks([...fields, "manual"] as FieldId[])).toEqual(fixture.links);
    expect(Object.fromEntries(fields.map((f) => [f, home(f as FieldId)?.section ?? null]))).toEqual(
      fixture.homes,
    );
  });
});

describe("the Flight pages for any pack", () => {
  const ctx = (values: Record<string, string>) => ({
    values,
    plan: null,
    notes: "",
    unit: "lb",
    suggested: {},
  });

  it("keep the arrival close-up's marked stretch on one line: the STAR, then the destination and runway", () => {
    const close = home("arrival_runway")?.row.ofp.close(
      ctx({
        route: "SUMMA2 SEA J1 OAK BDEGA4",
        origin: "KSEA",
        runway: "16L",
        destination: "KSFO",
        arrival_runway: "28L",
      }),
    );
    expect(close).toEqual([
      { text: "… OAK " },
      // A no-break space between the STAR and the destination, so the marked text never wraps.
      { text: "BDEGA4\u00a0KSFO/28L", hi: true },
    ]);
  });

  it("give a pack with only ids, labels and kinds a usable page", () => {
    // The example pack names no pages, groups or presentation: its fields go on the first page.
    useFlightPack(examplePack());
    const pages = sections();
    expect(pages.map((p) => p.id)).toEqual(["route"]);
    const rows = pages[0]?.groups.flatMap((g) => g.rows) ?? [];
    expect(pages[0]?.groups.map((g) => g.title)).toEqual(["Flight values"]);
    expect(rows.map((r) => r.field)).toEqual(examplePack().content.flight?.fields.map((f) => f.id));
    expect(rows.find((r) => r.field === "takeoff_flaps")?.choices).toEqual(["1", "5"]);
    expect(rows.every((r) => r.ofp.title && r.desc !== undefined)).toBe(true);
    // A range without words of its own says "Enter {min} to {max}".
    expect(rangeMessage("v1", ctx({ v1: "300" }))).toBe("Enter 80 to 250");
    useFlightPack(iflyPack());
  });

  it("show a test pack's own rows and accept its own range limits", () => {
    // Invented: a heavier aircraft, its weights up to 600,000, and flaps it names in degrees.
    const pack = structuredClone(examplePack()) as FlatPack;
    const flight: FlightFile = {
      pages: [
        {
          id: "fuel",
          title: "Weights",
          groups: [{ title: "Weights", units: { field: "weight_unit", label: "Weights in" } }],
        },
        { id: "takeoff", title: "Departure", groups: [{ title: "Settings" }] },
      ],
      fields: [
        {
          id: "weight_unit",
          label: "Weight unit",
          kind: "choice",
          choices: [{ value: "LB" }, { value: "KG" }],
        },
        {
          id: "zfw",
          label: "Zero fuel weight",
          kind: "number",
          unit: "weight_unit",
          ranges: [{ min: 0, max: 600 }],
          display: { scale: 1000, round: "up", step: 0.1 },
          page: "fuel",
          group: "Weights",
        },
        {
          id: "takeoff_flaps",
          label: "Flap setting",
          kind: "choice",
          choices: [{ value: "8" }, { value: "18" }, { value: "28" }],
          page: "takeoff",
          group: "Settings",
        },
      ],
    } as FlightFile;
    pack.content.flight = flight;
    useFlightPack(pack);
    expect(sections().map((p) => [p.id, p.title])).toEqual([
      ["fuel", "Weights"],
      ["takeoff", "Departure"],
    ]);
    const zfw = sections()[0]?.groups[0]?.rows[0];
    expect(zfw).toMatchObject({ field: "zfw", weight: "thousands" });
    expect(sections()[1]?.groups[0]?.rows[0]?.choices).toEqual(["8", "18", "28"]);
    // 550,000 lb is inside this pack's range, though above the iFly pack's 400,000.
    expect(rangeMessage("zfw", ctx({ zfw: "550" }))).toBeNull();
    expect(rangeMessage("zfw", ctx({ zfw: "650" }))).toBe("Enter 0 to 600,000 lb");
    expect(unitOf({ values: { weight_unit: "KG" } } as never)).toBe("kg");
    useFlightPack(iflyPack());
  });

  it("keep aircraft knowledge out of the interface code", () => {
    const read = (f: string) => readFileSync(`${import.meta.dirname}/${f}`, "utf8");
    const sections = read("sections.ts");
    // No page names of an aircraft's computer, no flap, thrust or autobrake values, no ranges.
    expect(sections).not.toMatch(/CDU|FMC|MCP|EFIS|PERF INIT|TAKEOFF REF|APPROACH REF|DEP\/ARR|› RTE/);
    expect(sections).not.toMatch(/"TO-1"|"MAX"|\["1", "5", "10"|FLAPS|AUTOBRAKE|THRUST/);
    expect(sections).not.toMatch(/within\(\d|Enter FL|41,000|400,000/);
    // No interface code reads the option ids center_tank or approach, or the altimeter field ids.
    const files = import.meta.glob<string>(
      ["../**/*.svelte", "../**/*.ts", "!../**/*.test.ts", "!./flight-dump.ts", "!../**/*fixture*.ts"],
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    );
    for (const [file, text] of Object.entries(files)) {
      expect(text, file).not.toMatch(/center_tank|options\.approach\b|\.id === "approach"/);
      // Nor the altimeter fields' ids: they are found by their SimBrief source.
      expect(text, file).not.toMatch(/\bqnh|destination_qnh|qnh_unit/);
    }
  });
});
