// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexPack } from "../pack-index";
import { parseRoute } from "../route.svelte";
import { iflyPack, packAsReceived, testPackText } from "../test-pack";
import { deckAreas } from "./deck";
import { howCountsOf } from "./how-content";
import {
  available,
  bank,
  beforeEngineStart,
  deal,
  dealOne,
  holds,
  orderMiss,
  phasesOf,
  pickWrong,
  random,
  type Seed,
  sameMeaning,
  seeds,
  sharesWord,
  sourcesIn,
  spellsOut,
  stepShows,
  TOPICS,
  type Topic,
  Twins,
  twinsOf,
  windows,
} from "./practice";

const pack = iflyPack();
const index = indexPack(pack);
const all = seeds(pack, index);
/** Whether two texts are twins by the iFly pack's rules. */
const twins = (a: string, b: string) => twinsOf(pack).pair(a, b);
/** The pack's words that say nothing about place (labels `plain_words`). */
const PLAIN_WORDS = pack.content.labels.plainWords;
const count = (topic: Topic, id = "") =>
  all.filter((q) => q.topic === topic && q.id.startsWith(`${topic}:${id}`)).length;

describe("items named by id (decision 0029)", () => {
  it("asks about a light whose note names its item as panel/section/#id", () => {
    const raw = JSON.parse(testPackText("ifly-737-max8"));
    const note = raw.content.lights.lights[0];
    const [panel, section, label] = note.locator.split("/");
    const items = raw.content.panels
      .flatMap((p: { sections: { id: string; items: { label: string }[] }[] }) => p.sections)
      .find((x: { id: string }) => x.id === section).items;
    const item = items.find((x: { label: string; id?: string }) => x.label === label);
    item.id = "noted";
    const positional = note.locator;
    note.locator = `${panel}/${section}/#noted`;
    const byId = packAsReceived(JSON.stringify(raw));
    expect(byId.content.lights?.lights[0]?.locator).toBe(positional);
    const lightIds = (p: typeof pack) =>
      bank(p, indexPack(p))
        .filter((x) => x.topic === "lights")
        .map((x) => x.id);
    expect(lightIds(byId)).toEqual(lightIds(pack));
    expect(lightIds(byId).some((id) => id.includes(positional))).toBe(true);
  });
});

describe("reference groups (decision 0029)", () => {
  it("counts memory items and the How page's lists by group, whatever the order or phase ids", () => {
    const moved = structuredClone(pack);
    const file = moved.content.phases;
    if (!file) throw new Error("no phases");
    // The reference phases in the reverse order, under other ids.
    const refs = file.phases.filter((p) => p.reference).reverse();
    for (const p of refs) p.id = `ref-${p.id}`;
    file.phases = [...file.phases.filter((p) => !p.reference), ...refs];
    const stages = (pack.content.phases?.stages ?? []).map((st) => st.title);
    expect(howCountsOf(moved, stages)).toEqual(howCountsOf(pack, stages));
    expect(howCountsOf(pack, stages).groups).toMatch(
      /^\d+ memory-item lists, \d+ quick reference lists and \d+ procedures$/,
    );
    expect(howCountsOf(pack, stages)).toMatchObject({
      stages: "5 stages",
      stageNames: "Preflight, Departure, Enroute, Arrival and Post-flight",
      reference: "Emergency",
    });
    const memory = (p: typeof pack) => bank(p, indexPack(p)).filter((s) => s.topic === "memory").length;
    expect(memory(moved)).toBe(memory(pack));
    expect(memory(pack)).toBeGreaterThan(0);
  });
});

describe("the question generator", () => {
  it("deals every question with four options, none meaning the same as another, exactly one correct", () => {
    const rng = random(7);
    for (const seed of all) {
      const q = dealOne(seed, rng);
      if (q.kind !== "choice" || seed.kind !== "choice") continue;
      expect(q.options, q.id).toHaveLength(4);
      expect(q.options[q.answer], q.id).toBe(seed.answer);
      for (const [i, a] of q.options.entries())
        for (const [j, b] of q.options.entries())
          if (i < j) expect(sameMeaning(a, b), `${q.id}: ${a} / ${b}`).toBe(false);
    }
  });

  it("never invents an option: every wrong option is one of the pack's neighbors", () => {
    const rng = random(3);
    for (const seed of all) {
      if (seed.kind !== "choice") continue;
      const q = dealOne(seed, rng);
      if (q.kind !== "choice") continue;
      const real = new Set(seed.tiers.flatMap((t) => t.items));
      for (const [i, o] of q.options.entries())
        if (i !== q.answer) expect(real.has(o), `${q.id}: ${o}`).toBe(true);
    }
  });

  it("gives order questions 4 to 6 steps, dealt out of order", () => {
    const rng = random(11);
    for (const seed of all.filter((q) => q.kind === "order")) {
      const q = dealOne(seed, rng);
      if (q.kind !== "order") continue;
      expect(q.items.length, q.id).toBeGreaterThanOrEqual(4);
      expect(q.items.length, q.id).toBeLessThanOrEqual(6);
      expect(new Set(q.items).size, q.id).toBe(q.items.length);
      expect([...q.shown].sort(), q.id).toEqual(q.items.map((_, i) => i));
      expect(
        q.shown.some((v, i) => v !== i),
        q.id,
      ).toBe(true);
    }
  });

  it("links every question to a source that resolves: a step, a Flight deck place, a Glossary term or a phase", () => {
    const areas = deckAreas(index);
    const terms = new Set((pack.content.glossary?.terms ?? []).map((t) => t.term));
    const phases = new Set((pack.content.phases?.phases ?? []).map((p) => p.id));
    for (const q of all) {
      expect(q.links.length, q.id).toBeGreaterThan(0);
      for (const link of q.links) {
        if (link.step) expect(index.step(link.step), q.id).toBeTruthy();
        const r = parseRoute(link.href);
        if (r.screen === "phase") expect(phases.has(r.id), `${q.id}: ${link.href}`).toBe(true);
        else if (r.screen === "glossary") expect(terms.has(r.term ?? ""), q.id).toBe(true);
        else if (r.screen === "deck") {
          const area = areas.find((a) => a.id === r.area);
          expect(
            area?.zones.some((z) => z.id === r.zone),
            `${q.id}: ${link.href}`,
          ).toBe(true);
        } else throw new Error(`${q.id}: ${link.href} does not resolve`);
      }
      for (const id of q.steps) expect(index.step(id), q.id).toBeTruthy();
    }
  });

  it("produces the counts from today's pack (2026-11-16, refined as the generator applies the rules)", () => {
    expect(count("memory", "next")).toBe(20);
    expect(count("memory", "order")).toBe(5);
    expect(count("lights", "meaning")).toBe(159);
    expect(count("lights", "light")).toBe(145);
    expect(count("faults", "action")).toBe(11);
    expect(count("faults", "cause")).toBe(27);
    // Left out: steps whose other drawn positions all mean the value, steps whose list has a second
    // step of the same title with another value, and those whose right value's length stands out.
    expect(count("values")).toBe(223);
    expect(count("order", "next")).toBe(338);
    expect(all.filter((q) => q.topic === "order" && q.kind === "order").length).toBe(80);
    expect(count("challenge")).toBe(43);
    expect(count("terms", "meaning")).toBe(100);
    expect(count("terms", "term")).toBe(80);
    expect(count("where", "area")).toBe(149);
    expect(count("where", "panel")).toBe(77);
  });

  it("asks which mnemonic an item belongs to, its next item and its order, with no letter questions", () => {
    expect(count("mnemonics", "which")).toBe(24);
    expect(count("mnemonics", "next")).toBe(6);
    expect(count("mnemonics", "order")).toBe(5);
  });

  it("skips a question that cannot find three wrong options, rather than padding it", () => {
    expect(
      pickWrong("ON", [{ items: ["ON", "OFF", "ON, GUARD CLOSED"], shuffle: false }], twinsOf(pack)),
    ).toEqual(["OFF"]);
    // The Climb checklist has three steps: none of its challenges can be asked.
    const climb = pack.lists.find((l) => l.title === "Climb checklist");
    expect(climb).toBeTruthy();
    expect(
      all.some((q) => q.topic === "challenge" && q.steps.some((s) => climb?.steps.some((c) => c.id === s))),
    ).toBe(false);
  });

  it("follows the flight's options and the chosen stages", () => {
    const gated = all.find((q) => q.steps.some((s) => index.step(s)?.showIf));
    expect(gated).toBeTruthy();
    const step = gated?.steps.map((s) => index.step(s)).find((s) => s?.showIf);
    const off = stepShows(pack, {});
    const choice = { topics: TOPICS.map((t) => t.id), phases: null, options: {} };
    if (step && !off(step.id)) expect(available(all, choice, off)).not.toContain(gated);
    const pre = phasesOf(pack, ["Preflight"]);
    const preflight = available(all, { ...choice, phases: pre }, () => true);
    expect(preflight.every((q) => q.phases === null || q.phases.some((p) => pre.includes(p)))).toBe(true);
    expect(preflight.some((q) => q.topic === "memory")).toBe(true);
    expect(holds({ option: "x", equals: "a" }, {})).toBe(false);
    expect(
      holds(
        {
          anyOf: [
            { option: "x", equals: "a" },
            { option: "y", oneOf: ["b"] },
          ],
        },
        { y: "b" },
      ),
    ).toBe(true);
  });

  it("deals a test across the topics, one question per source", () => {
    const pool = available(
      all,
      { topics: ["lights", "values", "order", "where"], phases: null, options: {} },
      () => true,
    );
    const test = deal(pool, 20, random(1));
    expect(test).toHaveLength(20);
    expect(new Set(test.map((q) => q.source)).size).toBe(20);
    expect(new Set(test.map((q) => q.topic)).size).toBe(4);
    const few = pool.filter((q) => q.topic === "faults" || q.id.startsWith("lights:meaning:oh/fuel"));
    expect(deal(few, 40, random(2))).toHaveLength(sourcesIn(few));
  });

  it("Before engine start: the flight up to and including the phase the pack marks engine_start", () => {
    const b = beforeEngineStart(pack);
    expect(b.stages).toEqual(["Preflight", "Departure"]);
    expect(b.phases).toContain("preflight");
    expect(b.phases.at(-1)).toBe("engine-start");
    for (const later of ["before-taxi", "taxi", "before-takeoff", "takeoff"])
      expect(b.phases).not.toContain(later);
    const pool = available(
      all,
      { topics: ["values", "order", "where"], phases: b.phases, options: {} },
      () => true,
    );
    expect(
      pool.some((q) => q.phases?.includes("before-taxi") && !q.phases.some((p) => b.phases.includes(p))),
    ).toBe(false);
    expect(pool.some((q) => q.phases?.includes("engine-start"))).toBe(true);
  });

  it("splits a list into order questions of 4 to 6", () => {
    expect(windows([1, 2, 3]).length).toBe(0);
    expect(windows([1, 2, 3, 4, 5, 6, 7]).map((w) => w.length)).toEqual([6]);
    expect(windows(Array.from({ length: 13 }, (_, i) => i)).map((w) => w.length)).toEqual([4, 5, 4]);
    expect(windows(Array.from({ length: 11 }, (_, i) => i)).map((w) => w.length)).toEqual([6, 5]);
  });

  it("says where a missed order went wrong first", () => {
    expect(orderMiss(["A", "B", "C", "D"], ["B", "A", "C", "D"])).toEqual({
      yours: "B first",
      right: "A first",
    });
    expect(orderMiss(["A", "B"], ["A", "B"])).toBeNull();
  });

  it("never offers a light with the same label as the one drawn, which would make two answers right", () => {
    for (const q of all.filter((x) => x.id.startsWith("lights:meaning:"))) {
      if (q.kind !== "choice") continue;
      const label = q.id.split("/")[2] ?? "";
      const notes = pack.content.lights?.lights ?? [];
      const sameLabel = notes.filter(
        (l) => l.locator.split("/")[2] === label && `lights:meaning:${l.locator}` !== q.id,
      );
      for (const w of q.tiers.flatMap((t) => t.items))
        expect(
          sameLabel.some((l) => l.meaning === w),
          q.id,
        ).toBe(false);
    }
  });

  it("never offers a mnemonic that also has the item (ATCT and ACTT share items)", () => {
    const briefs = pack.content.briefings?.briefings ?? [];
    for (const q of all.filter((x) => x.id.startsWith("mnemonics:which:"))) {
      if (q.kind !== "choice") continue;
      const word = q.stem?.kind === "card" ? (q.stem.body ?? "") : "";
      for (const w of q.tiers.flatMap((t) => t.items)) {
        const b = briefs.find((x) => x.mnemonic === w);
        expect(
          b?.items.some((i) => sameMeaning(`${i.lead}${i.rest}`, word)),
          `${q.id}: ${w}`,
        ).toBe(false);
      }
    }
  });

  it("asks no step value whose list has another step of the same title with another value", () => {
    const fireTest = all.filter(
      (q) =>
        q.topic === "values" &&
        q.stem?.kind === "card" &&
        /^FIRE TEST switch$/i.test(q.stem.title) &&
        q.stem.body === "Establishing APU power",
    );
    expect(fireTest).toEqual([]);
  });

  it("asks no next item across a branch, and orders items within one branch", () => {
    for (const q of all.filter((x) => x.topic === "memory")) {
      if (q.kind === "choice") expect(/^IF\b/.test(q.answer), q.id).toBe(false);
      else
        expect(
          q.items.slice(1).some((i) => /^IF\b/.test(i)),
          q.id,
        ).toBe(false);
    }
  });

  it("asks no term whose definition spells it out", () => {
    expect(spellsOut("PA", "Passenger address.")).toBe(true);
    expect(spellsOut("BARO", "Barometric altitude.")).toBe(true);
    expect(spellsOut("APU", "A small turbine in the tail.")).toBe(false);
    for (const q of all.filter((x) => x.id.startsWith("terms:term:")))
      if (q.kind === "choice" && q.stem?.kind === "card")
        expect(spellsOut(q.answer, q.stem.body ?? ""), q.id).toBe(false);
  });

  it("never lets the right option's length stand out: not the only shortest or longest by more than 40%", () => {
    for (const seed of all) {
      if (seed.kind !== "choice") continue;
      for (const n of [1, 2, 3]) {
        const q = dealOne(seed, random(n));
        if (q.kind !== "choice") continue;
        const right = q.options[q.answer] ?? "";
        const wrong = q.options.filter((_, i) => i !== q.answer);
        const short = Math.min(...wrong.map((w) => w.length));
        const long = Math.max(...wrong.map((w) => w.length));
        expect(right.length < short && short > right.length * 1.4, `${q.id}: ${right}`).toBe(false);
        expect(right.length > long && right.length > long * 1.4, `${q.id}: ${right}`).toBe(false);
      }
    }
  }, 30_000); // Walks every question (the exhaustive tests may take longer).

  it("shows no pack id in any question or option (GEN OFF BUS named its panel by a short title)", () => {
    // Every id in the pack that is not also an ordinary word of its own text.
    const words = new Set(
      [
        ...index.zones.flatMap((z) => [z.title, z.area]),
        ...index.controls.flatMap((c) => [c.name, c.location]),
        ...pack.lists.flatMap((l) => [l.title, ...l.steps.flatMap((x) => [x.text, x.expect, x.why ?? ""])]),
        ...(pack.content.glossary?.terms ?? []).map((t) => t.meaning),
      ]
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/),
    );
    const ids = [
      ...index.zones.map((z) => z.id),
      ...index.controls.map((c) => c.id),
      ...index.panels.flatMap((p) => [p.id, ...p.sections.map((x) => x.id)]),
      ...pack.lists.flatMap((l) => [l.id, ...l.steps.map((x) => x.id)]),
      ...(pack.content.phases?.phases ?? []).map((p) => p.id),
      ...(pack.content.briefings?.briefings ?? []).flatMap((b) => [b.id, ...b.items.map((i) => i.id)]),
    ].filter((id) => id.length >= 3 && !words.has(id));
    const shortTitles = index.zones.map((z) => `(${z.shortTitle.toLowerCase()})`);
    const idSet = new Set(ids);
    const found: string[] = [];
    for (const seed of all) {
      const texts = [
        seed.prompt,
        seed.short,
        seed.stem?.kind === "card"
          ? `${seed.stem.title} ${seed.stem.body ?? ""}`
          : (seed.stem?.caption ?? ""),
      ];
      if (seed.kind === "choice") texts.push(seed.answer, ...seed.tiers.flatMap((t) => t.items));
      else texts.push(...seed.items);
      for (const text of texts) {
        for (const token of text.split(/[^A-Za-z0-9.-]+/))
          if (idSet.has(token)) found.push(`${seed.id}: "${token}" in ${text}`);
        for (const t of shortTitles) if (text.includes(t)) found.push(`${seed.id}: ${t}`);
      }
    }
    expect([...new Set(found)].slice(0, 10)).toEqual([]);
  });

  it("explains every wrong option, then the right one, never with a raw action line", () => {
    const actions = new Set((pack.content.lights?.lights ?? []).map((l) => l.action));
    for (const seed of all) {
      if (seed.kind !== "choice") continue;
      expect(seed.why, seed.id).toBeTruthy();
      expect(actions.has(seed.why ?? ""), seed.id).toBe(false);
      for (const w of pickWrong(seed.answer, seed.tiers, seed.twins))
        expect(seed.about[w], `${seed.id}: ${w}`).toBeTruthy();
    }
    // Each fuel pump's light is named by its switch, so no two read the same ("left" was both CTR L
    // and AFT 1).
    const why = (n: number) => {
      const q = all.find((x) => x.id === `lights:meaning:oh/fuel/LOW PRESSURE/${n}`);
      expect(q?.kind, `LOW PRESSURE/${n}`).toBe("choice");
      return q?.kind === "choice" ? (q.why ?? "") : "";
    };
    expect(why(1)).toMatch(/^LOW PRESSURE, CTR L means: the left center tank pump/);
    expect(why(3)).toMatch(/^LOW PRESSURE, AFT 1 means: the left aft pump/);
    expect(new Set([1, 2, 3, 4, 5, 6].map((n) => why(n).split(" means")[0])).size).toBe(6);
  });

  it("Where controls are: no panel or area that shares a word with the control; Where are for plurals", () => {
    expect(sharesWord("Fuel pump switches", "Fuel panel", PLAIN_WORDS)).toBe(true);
    expect(sharesWord("Flight deck windows", "Windows and oxygen masks", PLAIN_WORDS)).toBe(true);
    expect(sharesWord("Battery switch", "Electrical panel, upper section", PLAIN_WORDS)).toBe(false);
    // Words on panels all over the deck give nothing away.
    for (const w of [
      "light",
      "lights",
      "control",
      "controls",
      "indicator",
      "indicators",
      "display",
      "displays",
      "unit",
      "units",
      "lever",
      "levers",
    ])
      expect(sharesWord(`Test ${w}`, `Other ${w}`, PLAIN_WORDS), w).toBe(false);
    expect(sharesWord("Hydraulic pump switches", "Hydraulic panel", PLAIN_WORDS), "giveaways stay").toBe(
      true,
    );
    for (const q of all.filter((x) => x.topic === "where")) {
      if (q.kind !== "choice") continue;
      const name = q.prompt.replace(/^Where (is|are) the /, "").replace(/\?$/, "");
      expect(sharesWord(name, q.answer, PLAIN_WORDS), q.id).toBe(false);
      if (/[^su]s$/i.test(name.split(" ").at(-1) ?? ""))
        expect(q.prompt.startsWith("Where are"), q.id).toBe(true);
    }
  });

  it("builds the question bank once per pack and keeps it", () => {
    const first = bank(pack, index);
    expect(bank(pack, index)).toBe(first);
    expect(first.length).toBe(all.length);
  });

  it("keeps every seed's id unique", () => {
    const ids = all.map((q: Seed) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says which one of a pair, and never offers its twin or two twins", () => {
    expect(twins("Engine 1 start switch", "Engine 2 start switch")).toBe(true);
    expect(twins("L ELEV PITOT", "R ELEV PITOT")).toBe(true);
    expect(twins("The captain’s pitot probe", "The first officer’s pitot probe")).toBe(true);
    expect(twins("L", "R"), "nothing but the side").toBe(false);
    expect(twins("FLAPS 1", "FLAPS 2"), "a flap setting is not a side").toBe(false);
    const light = all.find((q) => q.id === "lights:meaning:oh/fuel/FILTER BYPASS/1");
    expect(light?.short).toBe(
      "What does this light mean when it’s lit? FILTER BYPASS, engine 1, on the Fuel panel",
    );
    if (light?.stem?.kind === "light") expect(light.stem.caption).toMatch(/^Engine 1 · Fuel panel/);
    // Every light that shares its label with another on the same panel, for another engine or side,
    // says which.
    for (const id of [
      "oh/elecl/GEN OFF BUS/2",
      "aft/irs/ALIGN/1",
      "oh/hyd/LOW PRESSURE/4",
      "oh/heat/OVERHEAT/2",
    ]) {
      const q = all.find((x) => x.id === `lights:meaning:${id}`);
      expect(q?.short, id).toMatch(/, (engine 2|left IRS|left forward), on the /);
    }
    for (const rng of [random(1), random(2), random(3)])
      for (const seed of all) {
        if (seed.kind !== "choice") continue;
        const q = dealOne(seed, rng);
        if (q.kind !== "choice" || q.topic === "values") continue;
        const wrong = q.options.filter((_, i) => i !== q.answer);
        for (const w of wrong) expect(twins(w, seed.answer), `${q.id}: ${w}`).toBe(false);
        for (const [i, a] of wrong.entries())
          for (const b of wrong.slice(i + 1)) expect(twins(a, b), `${q.id}: ${a} / ${b}`).toBe(false);
      }
    // A control's own positions keep their sides: IGN L against IGN R is the question.
    expect(
      pickWrong("IGN L", [{ items: ["IGN R", "BOTH", "OFF"], shuffle: false, sides: true }], twinsOf(pack)),
    ).toContain("IGN R");
  }, 30_000); // Walks every question (the exhaustive tests may take longer).

  it("starts each line after its colon in lowercase, unless it starts with a name", () => {
    const light = all.find((q) => q.id === "lights:meaning:oh/fuel/FILTER BYPASS/1");
    expect(light?.why).toBe(
      "FILTER BYPASS, engine 1 means: the engine 1 fuel filter is clogging, often from contamination or ice, and fuel may soon go around it.",
    );
    for (const q of all) {
      if (q.kind !== "choice") continue;
      for (const line of [q.why ?? "", ...Object.values(q.about)])
        for (const m of line.matchAll(/(?:means|on the [^:]+|light[^:]*): ([A-Z][a-z]+) ([a-z]\w*)/g))
          expect.soft(`${m[1]} ${m[2]}`, `${q.id}: ${line}`).toBe("");
    }
  });
});

describe("Practice for any pack", () => {
  it("names a light by the pack's which, and asks across no step the pack marks a branch", () => {
    const own = structuredClone(pack);
    for (const l of own.content.lights?.lights ?? [])
      if (l.locator === "oh/elecl/TRANSFER BUS OFF/1") l.which = "bus one";
    // The runaway's second case is no longer a branch, and one of its first items is.
    for (const l of own.lists)
      for (const st of l.steps) {
        if (st.text === "IF RUNAWAY CONTINUES") st.branch = false;
        if (st.id === "ifly-737-max8.memory.column-and-thrust-levers") st.branch = true;
      }
    const qs = seeds(own, indexPack(own));
    const light = qs.find((q) => q.id === "lights:meaning:oh/elecl/TRANSFER BUS OFF/1");
    expect(light?.why).toMatch(/^TRANSFER BUS OFF, bus one means: /);
    const memory = qs.flatMap((q) => (q.topic === "memory" && q.kind === "choice" ? [q] : []));
    expect(memory.some((q) => q.answer.startsWith("IF RUNAWAY CONTINUES"))).toBe(true);
    expect(memory.some((q) => q.answer.startsWith("COLUMN AND THRUST LEVERS"))).toBe(false);
    expect(
      all.some(
        (q) => q.topic === "memory" && q.kind === "choice" && q.answer.startsWith("COLUMN AND THRUST LEVERS"),
      ),
    ).toBe(true);
  });

  it("asks Where is or Where are as the pack's control says, and skips the pack's own plain words", () => {
    const own = structuredClone(pack);
    const c = own.content.controls?.controls.find((x) => x.id === "apugen");
    if (c) c.plural = false;
    expect(all.find((x) => x.id === `where:panel:${c?.id}`)?.prompt).toBe(
      "Where are the APU generator switches?",
    );
    const q = seeds(own, indexPack(own)).find((x) => x.id === `where:panel:${c?.id}`);
    expect(q?.prompt).toBe("Where is the APU generator switches?");
    // Invented: a pack in another language, whose plain words are its own.
    expect(sharesWord("Pumpe Schalter", "Pumpe Feld", ["SCHALTER"])).toBe(true);
    expect(sharesWord("Licht Schalter", "Feld Schalter", ["SCHALTER"])).toBe(false);
    expect(sharesWord("Licht Schalter", "Feld Schalter", [])).toBe(true);
  });

  it("counts a numbered item only where two names differ by the number alone", () => {
    const t = new Twins(
      [],
      ["AUDIO PANEL 1", "AUDIO PANEL 2", "AUDIO CONTROL PANEL 3", "MACH TEST 1", "MACH TEST 2"],
    );
    expect(t.pair("AUDIO PANEL 1", "AUDIO PANEL 2")).toBe(true);
    expect(t.pair("MACH TEST 2", "MACH TEST 1")).toBe(true);
    // PANEL and TEST only end longer numbered names: on their own they are not numbered items.
    expect(t.pair("SIDE PANEL 1", "SIDE PANEL 2")).toBe(false);
    expect(t.pair("LAMP TEST 1", "LAMP TEST 2")).toBe(false);
  });

  it("holds no aircraft nouns or English word rules in Practice's code", () => {
    const text = readFileSync(`${import.meta.dirname}/practice.ts`, "utf8");
    expect(text).not.toMatch(
      /transfer bus|generator\||IRS\||system \[AB\]|\^IF\\b|\[\^su\]s\$|"SWITCHES"|"PANELS"/,
    );
  });

  it("finds twins by the pack's numbered items (engines 1 to 4) and its own side words", () => {
    // Invented: a four-engine airplane whose sides are port and starboard.
    const t = new Twins(["PORT", "STBD"], ["ENG 1 FIRE", "ENG 2 FIRE", "ENG 3 FIRE", "ENG 4 FIRE", "FLAPS"]);
    expect(t.pair("ENG 1 FIRE", "ENG 4 FIRE")).toBe(true);
    expect(t.pair("ENG 3 FIRE", "ENG 2 FIRE")).toBe(true);
    expect(t.pair("PORT WING LIGHT", "STBD WING LIGHT")).toBe(true);
    // Its words, not another pack's: left and right are not this pack's sides.
    expect(t.pair("LEFT WING LIGHT", "RIGHT WING LIGHT")).toBe(false);
    // A setting that is a number is never a pair.
    expect(t.pair("FLAPS 1", "FLAPS 5")).toBe(false);
  });

  it("deals each pack's questions by its own twin rules, whichever pack was built last (#144)", () => {
    // Invented: a copy of the pack whose sides are port and starboard, built after the iFly pack.
    const other = structuredClone(pack);
    other.content.labels.sideWords = ["PORT", "STBD"];
    const theirs = seeds(other, indexPack(other));
    const choice = (qs: Seed[]) => qs.flatMap((q) => (q.kind === "choice" ? [q] : []));
    expect(choice(all)[0]?.twins.pair("L ELEV PITOT", "R ELEV PITOT")).toBe(true);
    expect(choice(theirs)[0]?.twins.pair("L ELEV PITOT", "R ELEV PITOT")).toBe(false);
    expect(choice(theirs)[0]?.twins.pair("PORT ELEV PITOT", "STBD ELEV PITOT")).toBe(true);
    // Dealt after the other pack was built, the iFly pack's questions still never offer an iFly
    // twin, and the other pack's never offer one of its own.
    for (const [qs, rules] of [
      [all, twinsOf(pack)],
      [theirs, twinsOf(other)],
    ] as const)
      for (const seed of choice(qs)) {
        if (seed.topic === "values") continue;
        const q = dealOne(seed, random(7));
        if (q.kind !== "choice") continue;
        const wrong = q.options.filter((_, i) => i !== q.answer);
        for (const w of wrong) expect(rules.pair(w, seed.answer), `${q.id}: ${w}`).toBe(false);
        for (const [i, a] of wrong.entries())
          for (const b of wrong.slice(i + 1)) expect(rules.pair(a, b), `${q.id}: ${a} / ${b}`).toBe(false);
      }
    // A dumped question holds no rules.
    expect(JSON.stringify(choice(all)[0])).not.toContain("twins");
  });

  it("Before engine start in a pack with three stages and its own phase names", () => {
    const three = structuredClone(pack);
    const phases = three.content.phases;
    if (!phases) throw new Error("phases");
    phases.stages = [
      { id: "ground", title: "On the ground", phases: [{ phase: "preflight" }, { phase: "before-start" }] },
      { id: "air", title: "In the air", phases: [{ phase: "engine-start" }, { phase: "taxi" }] },
      { id: "after", title: "After", phases: [{ phase: "shutdown" }] },
    ] as typeof phases.stages;
    for (const p of phases.phases) p.engineStart = p.id === "before-start";
    expect(beforeEngineStart(three)).toEqual({
      stages: ["On the ground"],
      phases: ["preflight", "before-start"],
    });
    for (const p of phases.phases) p.engineStart = false;
    expect(beforeEngineStart(three)).toEqual({ stages: [], phases: [] });
  });

  it("the How page reads three stages and the pack's own reference words", () => {
    const three = structuredClone(pack);
    three.content.labels.reference.title = "Abnormal";
    three.content.labels.reference.groups = [{ id: "fire", title: "fire" }];
    for (const p of three.content.phases?.phases ?? []) if (p.reference) p.group = "fire";
    const n = (three.content.phases?.phases ?? [])
      .filter((p) => p.reference)
      .reduce((k, p) => k + p.lists.length, 0);
    expect(howCountsOf(three, ["Ground", "Air", "Ground again"])).toEqual({
      stages: "3 stages",
      stageNames: "Ground, Air and Ground again",
      groups: `${n} fire lists`,
      reference: "Abnormal",
    });
  });
});
