// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Practice: questions generated from the pack (Practice README and answers,
// 2026-11-16). Every question has exactly one correct answer, and every wrong option is a real
// neighbor from the pack (never invented); a question that cannot find three wrong options that
// differ from the answer and from each other is skipped. Each records its source and links there.
//
// Topics and their wrong options:
// - Memory items: the next item (other items of the list, then of the other memory lists), and
//   4 to 6 items in order.
// - Light meanings: a drawn light → its meaning, and a meaning → its light (other lights of the
//   same panel, then the same panel drawing, then the same flight deck area).
// - Faults: a symptom → the action or a cause (other faults' in the same flight deck area, the
//   system).
// - Mnemonics: which mnemonic an item belongs to (the other mnemonics), the next item and the
//   items in order (the mnemonic's own other items).
// - Step values: a step → its value, only where the control's own other positions give a wrong
//   option (then the values of the nearest steps).
// - Step order: 4 to 6 steps of one list in order, and which step comes next (the list's others).
// - Where controls are: a control → its panel (the area's other panels by distance, then the
//   nearest area's), and → its Flight deck area (the other areas, nearest first).
// - Challenge and response: a checklist challenge → its response (the checklist's others).
// - Terms: a term → its definition, and back (terms of the same system, taken from the controls
//   of the steps that use the term). Terms no step with a control uses stay out.

import type { FlatPack, OverviewArea, Step } from "@involo/bindings";
import type { PackIndex } from "../pack-index";
import { phaseHref } from "../route.svelte";
import { areaOf, deckAreas, deckHref, zoneSections } from "./deck";
import { glossaryHref, split } from "./glossary";
import { stepTitle as titleOfStep } from "./sentence";

/** A showIf condition, as the pack declares it. */
type ShowIf = NonNullable<Step["showIf"]>;
type OptionTest = Exclude<ShowIf, { allOf: unknown } | { anyOf: unknown }>;

export type Topic =
  | "memory"
  | "lights"
  | "faults"
  | "mnemonics"
  | "values"
  | "order"
  | "where"
  | "challenge"
  | "terms";

/** The topics in the boards' order, with their names. */
export const TOPICS: { id: Topic; title: string }[] = [
  { id: "memory", title: "Memory items" },
  { id: "lights", title: "Light meanings" },
  { id: "faults", title: "Faults" },
  { id: "mnemonics", title: "Mnemonics" },
  { id: "values", title: "Step values" },
  { id: "order", title: "Step order" },
  { id: "where", title: "Where controls are" },
  { id: "challenge", title: "Challenge and response" },
  { id: "terms", title: "Terms" },
];
export const topicTitle = (t: Topic): string => TOPICS.find((x) => x.id === t)?.title ?? t;

/** Where a question came from, for its feedback and the results: the step, the Flight deck
 * place, the Glossary term or the briefing's phase. A step link carries the step for onStep. */
export type Link = { label: string; href: string; step?: string };

/** What the question shows above its options. */
export type Stem =
  | { kind: "light"; label: string; color: string; caption: string }
  | { kind: "card"; title: string; body: string | null };

type Base = {
  /** Unique in the pack. */
  id: string;
  topic: Topic;
  prompt: string;
  stem: Stem | null;
  /** The question in a line, for the results' missed list. */
  short: string;
  /** What it asks about: one question per source in a test. */
  source: string;
  why: string | null;
  links: Link[];
  /** The phases it comes from (its steps', its briefing's, or those of the steps that use its
   * light, control or term): null for any stage (memory items), [] for every stage only. */
  phases: string[] | null;
  /** The steps it is built from: it is skipped when one of them does not show on this flight. */
  steps: string[];
};
/** A choice question before it is dealt: the answer and its wrong options' tiers, nearest first. */
export type ChoiceSeed = Base & {
  kind: "choice";
  answer: string;
  /** `sides`: a control's own positions, where the side is what is asked (IGN L or IGN R), so the
   * pair rule doesn't apply. */
  tiers: { items: string[]; shuffle: boolean; sides?: boolean }[];
  /** What each wrong option really is, for the feedback ("That’s the VALVE OPEN light…"); `why`
   * then says the right one, as the board's feedback does. */
  about: Record<string, string>;
};
export type OrderSeed = Base & { kind: "order"; items: string[] };
export type Seed = ChoiceSeed | OrderSeed;

/** A question as dealt into a test: four options A to D in random order, or steps to order. */
export type Question =
  | (Base & { kind: "choice"; options: string[]; answer: number; about: Record<string, string> })
  | (Base & { kind: "order"; items: string[]; shown: number[] });

/** "No two options that mean the same thing": the same words, or one inside the other. */
export function sameMeaning(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}
/** How many different items a list has. */
const distinct = (xs: string[]) => new Set(xs.map((x) => norm(x))).size;
/** A step's title, remembered per pack index: the generator asks for the same step's many times. */
const titles = new WeakMap<PackIndex, Map<Step, string>>();
function stepTitle(index: PackIndex, step: Step): string {
  let known = titles.get(index);
  if (!known) {
    known = new Map();
    titles.set(index, known);
  }
  let t = known.get(step);
  if (t === undefined) {
    t = titleOfStep(index, step);
    known.set(step, t);
  }
  return t;
}

/** Upper case, words only; remembered, as the generator compares the same texts many times. */
const norms = new Map<string, string>();
const norm = (s: string) => {
  let n = norms.get(s);
  if (n === undefined) {
    n = s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
    norms.set(s, n);
  }
  return n;
};

/** A text with its engine number, side or seat taken out ("ENGINE # FUEL VALVE"), so twins
 * ("engine 1" and "engine 2", left and right, captain and F/O) read the same; null when nothing but
 * the side is left ("L", "R"). */
const twinKeys = new Map<string, string | null>();
export function twinKey(text: string): string | null {
  const known = twinKeys.get(text);
  if (known !== undefined) return known;
  const key = norm(text)
    .replace(
      /\b(ENGINE|ENG|GENERATOR|GEN|BUS|TANK|PUMP|BLEED|EEC|IRS|PACK|IDG|FMC|CDU|NAV|VHF|ADF|DME|START) [12]\b/g,
      "$1 #",
    )
    .replace(/\b(LEFT|RIGHT|L|R)\b/g, "SIDE")
    .replace(/\b(CAPTAIN|CAPT|FIRST OFFICER|F O|FO)\b/g, "SEAT");
  const out = /^(?:SIDE|SEAT|#| )*$/.test(key) ? null : key;
  twinKeys.set(text, out);
  return out;
}
/** Whether two texts are the same item for another engine, side or seat. */
export function twins(a: string, b: string): boolean {
  const k = twinKey(a);
  return k !== null && a !== b && k === twinKey(b) && norm(a) !== norm(b);
}

/** Whether the right option's length gives it away: it is the only shortest or the only
 * longest, by more than 40%. */
export function standsOut(answer: string, wrong: string[]): boolean {
  const a = answer.length;
  const lengths = wrong.map((w) => w.length);
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  return (a < shortest && shortest > a * 1.4) || (a > longest && a > longest * 1.4);
}

/** The three wrong options: from each tier in turn, skipping any that means the answer or an option
 * already taken. When the right option's length would stand out, the last one taken gives way to
 * the nearest valid option of a length like the answer's. Fewer than three means the question is
 * skipped. */
export function pickWrong(
  answer: string,
  tiers: { items: string[]; shuffle: boolean; sides?: boolean }[],
  rng?: () => number,
): string[] {
  // Every tier is shuffled first, so a seeded deal draws the same numbers; the valid options are
  // then found only as far as needed.
  const order = tiers.map((tier) => ({
    tier,
    items: rng && tier.shuffle ? shuffled(tier.items, rng) : tier.items,
  }));
  const valid: string[] = [];
  function* candidates() {
    for (const { tier, items } of order)
      for (const x of items) {
        // Never the answer's twin, and never two wrong options that differ only by engine or side
        //.
        const pair = (o: string) => !tier.sides && twins(o, x);
        if (!x || sameMeaning(x, answer) || pair(answer)) continue;
        if (valid.some((o) => sameMeaning(o, x) || pair(o))) continue;
        valid.push(x);
        yield x;
      }
  }
  const more = candidates();
  const upTo = (n: number) => {
    while (valid.length < n && !more.next().done);
    return valid.length >= n;
  };
  upTo(3);
  const out = valid.slice(0, 3);
  if (out.length < 3 || !standsOut(answer, out)) return out;
  for (const keep of [2, 1, 0]) {
    const others = out.filter((_, i) => i !== keep);
    for (let i = 3; upTo(i + 1); i++) {
      const tried = [...others.slice(0, keep), valid[i] as string, ...others.slice(keep)];
      if (!standsOut(answer, tried)) return tried;
    }
  }
  return out.slice(0, 2);
}

/** A seeded random number generator (mulberry32), so a test can be dealt again the same way. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** 4 to 6 items at a time: a list of n gives this many order questions, of even sizes (a list of 7
 * gives one, of its first 6). */
export function windows<T>(items: T[]): T[][] {
  const n = items.length;
  if (n < 4) return [];
  let k = Math.ceil(n / 6);
  if (n / k < 4) k = Math.floor(n / 4);
  const out: T[][] = [];
  for (let i = 0; i < k; i++)
    out.push(items.slice(Math.round((i * n) / k), Math.round(((i + 1) * n) / k)).slice(0, 6));
  return out;
}

/** Whether a showIf holds for the flight's options (an option not set holds for nothing). */
export function holds(show: ShowIf | null | undefined, options: Record<string, string>): boolean {
  if (!show) return true;
  if ("allOf" in show) return show.allOf.every((t: OptionTest) => holds(t, options));
  if ("anyOf" in show) return show.anyOf.some((t: OptionTest) => holds(t, options));
  const value = options[show.option];
  if (value === undefined) return false;
  return "equals" in show ? value === show.equals : show.oneOf.includes(value);
}

const ordinal = ["first", "second", "third", "fourth", "fifth", "sixth"];
/** The results' line for a missed order question: the first place it went wrong. */
export function orderMiss(items: string[], yours: string[]): { yours: string; right: string } | null {
  const at = items.findIndex((x, i) => yours[i] !== x);
  if (at < 0) return null;
  const nth = ordinal[at] ?? `number ${at + 1}`;
  return { yours: `${yours[at]} ${nth}`, right: `${items[at]} ${nth}` };
}

/** Every question the pack can produce, before the flight's options and stages filter them. */
/** The question bank, built once per pack on first use and kept: the home counts, the "available"
 * line and every test read from it. */
const banks = new WeakMap<FlatPack, { index: PackIndex; seeds: Seed[] }>();
export function bank(pack: FlatPack, index: PackIndex): Seed[] {
  const known = banks.get(pack);
  if (known && known.index === index) return known.seeds;
  const built = seeds(pack, index);
  banks.set(pack, { index, seeds: built });
  return built;
}

/** Every question the pack can produce (`bank` keeps them). */
export function seeds(pack: FlatPack, index: PackIndex): Seed[] {
  const out: Seed[] = [];
  const phases = pack.content.phases;
  const lists = new Map(pack.lists.map((l) => [l.id, l]));
  const phaseOfList = new Map<string, string>();
  for (const p of phases?.phases ?? []) for (const l of p.lists) phaseOfList.set(l, p.id);
  const phaseTitle = (id: string | undefined) => phases?.phases.find((p) => p.id === id)?.title ?? "";
  const zones = new Map(index.zones.map((z) => [z.id, z]));
  const zoneOf = (s: Step) =>
    (s.controls ?? []).map((c) => index.control(c)?.zone).find((z) => !!z && zones.has(z));
  const memory = new Set((phases?.phases ?? []).filter((p) => p.id === "memory").flatMap((p) => p.lists));
  const stepLink = (s: Step): Link => {
    const phase = index.phaseOf(s.id);
    return {
      label: `${stepTitle(index, s)} · ${phaseTitle(phase)}`,
      href: phase ? phaseHref(phase) : "#/",
      step: s.id,
    };
  };
  const stepPhases = (s: Step): string[] => {
    const p = index.phaseOf(s.id);
    return p ? [p] : [];
  };
  const union = (xs: string[][]) => [...new Set(xs.flat())];
  /** What each option is, first come first kept, for the feedback. */
  const tell = (pairs: [string, string][]) => {
    const m: Record<string, string> = {};
    for (const [k, v] of pairs) if (!(k in m)) m[k] = v;
    return m;
  };

  // Memory items.
  const memLists = [...memory].flatMap((id) => lists.get(id) ?? []);
  const item = (s: Step) => (s.expect ? `${s.text} … ${s.expect}` : s.text);
  /** A branch ("IF RUNAWAY STOPS …") opens its own run of items: the order between branches depends on
   * the case, so no next-item question crosses into one and order questions stay within one. */
  const branch = (s: Step) => /^IF\b/i.test(s.text);
  for (const list of memLists) {
    const others = memLists.filter((l) => l !== list).flatMap((l) => l.steps.map(item));
    list.steps.forEach((s, i) => {
      const next = list.steps[i + 1];
      if (!next || branch(next)) return;
      if (list.steps.filter((x) => sameMeaning(item(x), item(s))).length > 1) return;
      out.push({
        id: `memory:next:${s.id}`,
        topic: "memory",
        kind: "choice",
        prompt: "What comes next?",
        stem: { kind: "card", title: list.title, body: item(s) },
        short: `${list.title}: after ${s.text}`,
        source: `step:${next.id}`,
        why: `After ${s.text} comes ${next.text}.`,
        about: tell([
          ...list.steps.map((x, k): [string, string] => [item(x), `That’s item ${k + 1} of ${list.title}.`]),
          ...memLists
            .filter((l) => l !== list)
            .flatMap((l) => l.steps.map((x): [string, string] => [item(x), `That’s from ${l.title}.`])),
        ]),
        links: [stepLink(next)],
        phases: null,
        steps: [s.id, next.id],
        answer: item(next),
        tiers: [
          { items: list.steps.filter((x) => x !== s && x !== next && !branch(x)).map(item), shuffle: true },
          { items: others, shuffle: true },
        ],
      });
    });
    const runs: Step[][] = [];
    for (const x of list.steps) {
      if (branch(x) || !runs.length) runs.push([]);
      runs.at(-1)?.push(x);
    }
    runs.flatMap(windows).forEach((w, n) => {
      if (distinct(w.map(item)) < w.length) return;
      out.push(
        orderSeed(
          "memory",
          `memory:order:${list.id}:${n}`,
          `Put these ${list.title} items in order`,
          w.map(item),
          list.why ?? null,
          w[0] ? [stepLink(w[0])] : [],
          null,
          w.map((s) => s.id),
        ),
      );
    });
  }

  // Light meanings. A light's place is the zone its section is drawn for (as the Flight deck).
  const zoneOfSection = new Map<string, (typeof index.zones)[number]>();
  for (const z of index.zones)
    for (const { section } of zoneSections(index, z))
      if (!zoneOfSection.has(section.id)) zoneOfSection.set(section.id, z);
  const notes = pack.content.lights?.lights ?? [];
  const lights = notes.flatMap((l) => {
    const [panel = "", section = "", label = "", nth = "1"] = l.locator.split("/");
    const zone = zones.get(section) ?? zoneOfSection.get(section);
    const items = index.section(section)?.items ?? [];
    const drawn = items.filter((x) => x.kind === "light" && x.label === label)[Number(nth) - 1];
    const users = pack.lists.flatMap((li) =>
      li.steps.filter((s) => (s.targets ?? []).some((t) => t.at === l.locator)),
    );
    return [
      { ...l, panel, section, label, zone, area: zone?.area ?? panel, color: drawn?.color ?? "amber", users },
    ];
  });
  // Which one of a pair: the engine, side, seat or system its meaning names, where another
  // light with its label on the same panel names a different one.
  const sideIn = (meaning: string) => {
    // A switch named in brackets ("The left aft pump (AFT 1) …") says which one exactly.
    const named = /\(([A-Z][A-Z0-9]*(?: [A-Z0-9]+)?)\)/.exec(meaning);
    if (named?.[1]) return named[1];
    const m =
      /\b(?:transfer bus|engine|generator|tank|electric hydraulic pump|pump|IRS|bus) [12]\b/i.exec(meaning) ??
      /\bsystem [AB]\b/i.exec(meaning) ??
      /\b(?:left|right)(?: (?:side|forward|IRS|engine))?\b/i.exec(meaning) ??
      /\b(?:captain|first officer)\b/i.exec(meaning);
    return m ? lowerFirst(m[0]) : "";
  };
  const sides = new Map(lights.map((l) => [l, sideIn(l.meaning)]));
  const pairs = new Map(
    lights.map((l) => {
      const side = sides.get(l) ?? "";
      const paired = lights.some(
        (x) =>
          x !== l && x.section === l.section && x.label === l.label && sides.get(x) && sides.get(x) !== side,
      );
      return [l, side && paired ? side : ""];
    }),
  );
  const which = (l: (typeof lights)[number]) => pairs.get(l) ?? "";

  for (const l of lights) {
    // The same light again, meaning the same word for word, with nothing to say which it is: asked
    // once.
    if (
      lights.some(
        (x) =>
          lights.indexOf(x) < lights.indexOf(l) &&
          x.section === l.section &&
          x.label === l.label &&
          norm(x.meaning) === norm(l.meaning),
      )
    )
      continue;
    // Another light with the same label could be the one meant: never an option.
    const o = lights.filter((x) => x !== l && !sameMeaning(x.label, l.label));
    const groups = [
      o.filter((x) => x.section === l.section),
      o.filter((x) => x.section !== l.section && x.panel === l.panel && x.area === l.area),
      o.filter((x) => x.area === l.area && x.panel !== l.panel),
    ];
    const side = which(l);
    const place = l.zone ? `${l.zone.title} · ${l.zone.area}` : (index.panelOf(l.section)?.title ?? "");
    const where = side ? `${side.charAt(0).toUpperCase()}${side.slice(1)} · ${place}` : place;
    const area = l.zone ? areaOf(deckAreasOnce(index), l.zone.id) : undefined;
    const links: Link[] = [
      ...(l.zone && area
        ? [{ label: `${l.zone.title} on the Flight deck`, href: deckHref(area.id, l.zone.id) }]
        : []),
      ...l.users.slice(0, 1).map(stepLink),
    ];
    const phases = union(l.users.map(stepPhases));
    const base = { phases, steps: [], links, source: `light:${l.locator}` };
    // The light and its panel by name, never by an id or short title.
    const named = (x: (typeof lights)[number]) => `${x.label}${which(x) ? `, ${which(x)}` : ""}`;
    const label = `${named(l)}${l.zone ? `, on the ${l.zone.title}` : ""}`;
    const on = (x: (typeof lights)[number]) =>
      `${which(x) ? `, ${which(x)}` : ""}${x.zone ? `, on the ${x.zone.title}` : ""}`;
    out.push({
      ...base,
      id: `lights:meaning:${l.locator}`,
      topic: "lights",
      kind: "choice",
      prompt: "What does this light mean when it’s lit?",
      stem: { kind: "light", label: l.label, color: l.color, caption: where },
      short: `What does this light mean when it’s lit? ${label}`,
      why: `${named(l)} means: ${afterColon(l.meaning)}`,
      about: tell(o.map((x) => [x.meaning, `That’s the ${x.label} light${on(x)}: ${afterColon(x.meaning)}`])),
      answer: l.meaning,
      tiers: groups.map((g) => ({ items: g.map((x) => x.meaning), shuffle: true })),
    });
    if (notes.filter((x) => sameMeaning(x.meaning, l.meaning)).length === 1)
      out.push({
        ...base,
        id: `lights:light:${l.locator}`,
        topic: "lights",
        kind: "choice",
        prompt: "Which light means this when it’s lit?",
        stem: { kind: "card", title: where, body: l.meaning },
        short: `Which light means this? ${l.meaning}`,
        why: `${named(l)} means: ${afterColon(l.meaning)}`,
        about: tell(o.map((x) => [x.label, `${x.label}${on(x)} means: ${afterColon(x.meaning)}`])),
        answer: l.label,
        tiers: groups.map((g) => ({
          items: g.filter((x) => !sameMeaning(x.meaning, l.meaning)).map((x) => x.label),
          shuffle: true,
        })),
      });
  }

  // Faults: the flight deck area is the system.
  const faults = (pack.content.faults?.faults ?? []).flatMap((f) => {
    const step = f.steps[0] ? index.step(f.steps[0]) : undefined;
    if (!step) return [];
    const zone = zoneOf(step);
    return [{ ...f, step, area: zone ? zones.get(zone)?.area : undefined }];
  });
  /** A fault's step and what it shows ("Ground power switch, GRD POWER AVAILABLE out"). */
  const symptom = (x: Step) => `${stepTitle(index, x)}${x.ifNot ? `, ${x.ifNot}` : ""}`;
  for (const f of faults) {
    if (!f.step.ifNot || !f.area) continue;
    const o = faults.filter((x) => x !== f && x.area === f.area);
    const title = stepTitle(index, f.step);
    const stem: Stem = {
      kind: "card",
      title: `${title} · ${phaseTitle(index.phaseOf(f.step.id))}`,
      body: f.step.ifNot,
    };
    const base = {
      topic: "faults" as const,
      kind: "choice" as const,
      stem,
      phases: stepPhases(f.step),
      steps: [f.step.id],
      links: [stepLink(f.step)],
    };
    out.push({
      ...base,
      id: `faults:action:${f.step.id}`,
      prompt: "What should you do?",
      short: `${title}: ${f.step.ifNot}. What should you do?`,
      source: `fault:${f.step.id}:action`,
      // The action only: a cause would give away the fault's cause question.
      why: `${title}, ${f.step.ifNot}. What to do: ${afterColon(f.action)}.`,
      about: tell(o.map((x) => [x.action, `That’s what to do for ${symptom(x.step)}.`])),
      answer: f.action,
      tiers: [{ items: o.map((x) => x.action), shuffle: true }],
    });
    f.causes.forEach((cause, n) => {
      out.push({
        ...base,
        id: `faults:cause:${f.step.id}:${n}`,
        prompt: "What is a likely cause?",
        short: `${title}: ${f.step.ifNot}. What is a likely cause?`,
        source: `fault:${f.step.id}:cause`,
        why: `${title}, ${f.step.ifNot}. Likely cause: ${afterColon(cause)}.`,
        about: tell(
          o.flatMap((x) =>
            x.causes.map((c): [string, string] => [c, `That’s a likely cause for ${symptom(x.step)}.`]),
          ),
        ),
        answer: cause,
        tiers: [
          {
            items: o.flatMap((x) => x.causes).filter((x) => !f.causes.some((y) => sameMeaning(x, y))),
            shuffle: true,
          },
        ],
      });
    });
  }

  // Mnemonics: which mnemonic an item belongs to; the next item and the order, within one.
  const briefings = (pack.content.briefings?.briefings ?? []).filter((b) => b.mnemonic);
  const word = (i: { lead: string; rest: string }) => `${i.lead}${i.rest}`;
  for (const b of briefings) {
    const link: Link = { label: `${b.title} · ${phaseTitle(b.phase)}`, href: phaseHref(b.phase) };
    const phases = [b.phase];
    const base = { topic: "mnemonics" as const, phases, steps: [], links: [link] };
    b.items.forEach((it, i) => {
      out.push({
        ...base,
        id: `mnemonics:which:${it.id}`,
        kind: "choice",
        prompt: "Which mnemonic does this item belong to?",
        stem: { kind: "card", title: "Briefing item", body: word(it) },
        short: `Which mnemonic does ${word(it)} belong to?`,
        source: `brief:${it.id}`,
        why: `${word(it)} is part of ${b.mnemonic}, the ${b.title} briefing.`,
        about: tell(briefings.map((x) => [x.mnemonic, `${x.mnemonic} is the ${x.title} briefing.`])),
        answer: b.mnemonic,
        // A mnemonic that also has this item would be right too: never an option.
        tiers: [
          {
            items: briefings
              .filter((x) => x !== b && !x.items.some((y) => sameMeaning(word(y), word(it))))
              .map((x) => x.mnemonic),
            shuffle: true,
          },
        ],
      });
      const next = b.items[i + 1];
      if (next)
        out.push({
          ...base,
          id: `mnemonics:next:${it.id}`,
          kind: "choice",
          prompt: "What comes next?",
          stem: { kind: "card", title: `${b.mnemonic} · ${b.title}`, body: word(it) },
          short: `${b.mnemonic}: after ${word(it)}`,
          source: `brief:${next.id}`,
          why: `In ${b.mnemonic}, after ${word(it)} comes ${word(next)}.`,
          about: tell(b.items.map((x, k) => [word(x), `That’s item ${k + 1} of ${b.mnemonic}.`])),
          answer: word(next),
          tiers: [{ items: b.items.filter((x) => x !== it && x !== next).map(word), shuffle: true }],
        });
    });
    if (b.items.length >= 4 && b.items.length <= 6 && distinct(b.items.map(word)) === b.items.length)
      out.push(
        orderSeed(
          "mnemonics",
          `mnemonics:order:${b.id}`,
          `Put the ${b.title} briefing items in order`,
          b.items.map(word),
          null,
          [link],
          phases,
          [],
        ),
      );
  }

  // Positions drawn for each control, for Step values.
  const positions = new Map<string, string[]>();
  for (const panel of index.panels)
    for (const section of panel.sections)
      for (const it of section.items)
        if (it.positions)
          for (const c of it.controls ?? [])
            positions.set(c, [...(positions.get(c) ?? []), ...String(it.positions).split(/,\s*/)]);

  for (const list of pack.lists) {
    if (memory.has(list.id)) continue;
    const phase = phaseOfList.get(list.id);
    const phases = phase ? [phase] : [];
    // Step values: only where the control's own positions give a wrong option.
    list.steps.forEach((s, i) => {
      if (!s.expect) return;
      const own = (s.controls ?? []).flatMap((c) => positions.get(c) ?? []);
      if (own.length < 2) return;
      // Two steps of the list with this title and different values: the stem can't tell them apart.
      const title = stepTitle(index, s);
      if (
        list.steps.some(
          (x) =>
            x !== s &&
            x.expect &&
            norm(stepTitle(index, x)) === norm(title) &&
            !sameMeaning(x.expect, s.expect),
        )
      )
        return;
      const nearSteps = list.steps
        .map((x, j) => ({ x, d: Math.abs(j - i) }))
        .filter((o) => o.x !== s && o.x.expect)
        .sort((a, b) => a.d - b.d)
        .map((o) => o.x);
      const near = nearSteps.map((x) => x.expect);
      const tiers = [
        { items: own, shuffle: true, sides: true },
        { items: near, shuffle: false },
      ];
      const wrong = pickWrong(s.expect, tiers);
      if (!wrong.some((w) => own.includes(w))) return;
      out.push({
        id: `values:${list.id}:${s.id}`,
        topic: "values",
        kind: "choice",
        prompt: "What does this step call for?",
        stem: { kind: "card", title, body: list.title },
        short: `${title}, ${phaseTitle(phase) || list.title}`,
        source: `value:${norm(s.text)}:${norm(s.expect)}`,
        why: `In the ${list.title}, the ${title}: ${afterColon(s.expect)}.`,
        about: tell([
          ...own.map((p): [string, string] => [p, `${p} is another position of the ${title}.`]),
          ...nearSteps.map((x): [string, string] => [
            x.expect,
            `That’s the value for the ${stepTitle(index, x)}.`,
          ]),
        ]),
        links: [stepLink(s)],
        phases,
        steps: [s.id],
        answer: s.expect,
        tiers,
      });
    });
    // Step order: windows of 4 to 6 steps, and which comes next.
    const title = (s: Step) => stepTitle(index, s);
    windows(list.steps).forEach((w, n) => {
      if (new Set(w.map((s) => norm(title(s)))).size < w.length) return;
      out.push(
        orderSeed(
          "order",
          `order:${list.id}:${n}`,
          `Put these ${list.title} steps in order`,
          w.map(title),
          list.why ?? null,
          w[0] ? [stepLink(w[0])] : [],
          phases,
          w.map((s) => s.id),
        ),
      );
    });
    list.steps.forEach((s, i) => {
      const next = list.steps[i + 1];
      if (!next || list.steps.filter((x) => norm(title(x)) === norm(title(s))).length > 1) return;
      out.push({
        id: `order:next:${list.id}:${s.id}`,
        topic: "order",
        kind: "choice",
        prompt: "Which step comes next?",
        stem: { kind: "card", title: list.title, body: `After: ${title(s)}` },
        short: `${list.title}: after ${title(s)}`,
        source: `next:${next.id}`,
        why: `After ${title(s)} comes ${title(next)}.`,
        about: tell(list.steps.map((x, k) => [title(x), `That’s step ${k + 1} of the ${list.title}.`])),
        links: [stepLink(next)],
        phases,
        steps: [s.id, next.id],
        answer: title(next),
        tiers: [{ items: list.steps.filter((x) => x !== s && x !== next).map(title), shuffle: true }],
      });
    });
    // Challenge and response: the checklist's other responses.
    if (list.kind === "checklist")
      for (const s of list.steps) {
        if (!s.expect) continue;
        out.push({
          id: `challenge:${s.id}`,
          topic: "challenge",
          kind: "choice",
          prompt: "What is the response?",
          stem: { kind: "card", title: list.title, body: s.text },
          short: `${list.title}: ${s.text}`,
          source: `challenge:${s.id}`,
          why: `${s.text}: ${afterColon(s.expect)}.`,
          about: tell(list.steps.map((x) => [x.expect, `That’s the response to ${x.text}.`])),
          links: [stepLink(s)],
          phases,
          steps: [s.id],
          answer: s.expect,
          tiers: [{ items: list.steps.filter((x) => x !== s).map((x) => x.expect), shuffle: true }],
        });
      }
  }

  // Where controls are: → panel, and → Flight deck area.
  const areas = deckAreasOnce(index);
  const boxes = new Map<string, OverviewArea[]>();
  for (const a of index.overview?.areas ?? []) boxes.set(a.zone, [...(boxes.get(a.zone) ?? []), a]);
  const gap = (a: OverviewArea[], b: OverviewArea[]) => {
    let best = Number.POSITIVE_INFINITY;
    for (const p of a)
      for (const q of b) {
        const dx = Math.max(0, p.x - (q.x + q.width), q.x - (p.x + p.width));
        const dy = Math.max(0, p.y - (q.y + q.height), q.y - (p.y + p.height));
        best = Math.min(best, Math.hypot(dx, dy));
      }
    return best;
  };
  const usersOf = (control: string) =>
    pack.lists.flatMap((l) => l.steps.filter((s) => (s.controls ?? []).includes(control)));
  for (const c of index.controls) {
    const zone = c.zone ? zones.get(c.zone) : undefined;
    if (!zone) continue;
    const own = boxes.get(zone.id) ?? [];
    const phases = union(usersOf(c.id).map(stepPhases));
    const area = areaOf(areas, zone.id);
    const links: Link[] = area
      ? [{ label: `${zone.title} on the Flight deck`, href: deckHref(area.id, zone.id) }]
      : [];
    const base = { topic: "where" as const, kind: "choice" as const, phases, steps: [], links };
    const name = /^[A-Z0-9/]{2,}\b/.test(c.name) ? c.name : c.name.charAt(0).toLowerCase() + c.name.slice(1);
    // "Where are" for a plural name.
    const plural = /[^su]s$/i.test(c.name.split(/\s+/).at(-1) ?? "");
    const prompt = `Where ${plural ? "are" : "is"} the ${name}?`;
    // Its panel: the area's other panels, nearest first; then the nearest area's panels.
    const byGap = (zs: typeof index.zones) =>
      [...zs].sort((a, b) => gap(own, boxes.get(a.id) ?? []) - gap(own, boxes.get(b.id) ?? []));
    const same = byGap(index.zones.filter((z) => z.id !== zone.id && z.area === zone.area));
    const otherAreas = [...new Set(index.zones.map((z) => z.area))]
      .filter((a) => a !== zone.area)
      .map((a) => ({ a, zs: index.zones.filter((z) => z.area === a) }))
      .map((x) => ({ ...x, d: Math.min(...x.zs.map((z) => gap(own, boxes.get(z.id) ?? []))) }))
      .filter((x) => Number.isFinite(x.d))
      .sort((p, q) => p.d - q.d);
    // A panel whose name shares a word with the control's gives it away: no panel question.
    if (!sharesWord(c.name, zone.title))
      out.push({
        ...base,
        id: `where:panel:${c.id}`,
        prompt,
        stem: null,
        short: prompt,
        source: `where:${c.id}:panel`,
        why: `The ${name} ${plural ? "are" : "is"} on the ${zone.title}: ${afterColon(c.location)}`,
        about: tell(
          index.zones.map((z) => [
            z.title,
            `The ${z.title} is on the ${z.area}${z.position ? `, ${lowerFirst(z.position)}` : ""}.`,
          ]),
        ),
        answer: zone.title,
        tiers: [
          { items: same.map((z) => z.title), shuffle: false },
          ...otherAreas.map((x) => ({ items: byGap(x.zs).map((z) => z.title), shuffle: false })),
        ],
      });
    // Its Flight deck area: the other areas, nearest first (by the map; in the page's order
    // where a place has no box on it).
    if (area && !sharesWord(c.name, areaName(area))) {
      const at = areas.indexOf(area);
      const ranked = areas
        .filter((a) => a !== area)
        .map((a, n) => ({
          a,
          d:
            own.length && a.boxes.length
              ? gap(own, a.boxes)
              : 1e6 + Math.abs(areas.indexOf(a) - at) * 1e3 + n,
        }))
        .sort((p, q) => p.d - q.d)
        .map((x) => areaName(x.a));
      out.push({
        ...base,
        id: `where:area:${c.id}`,
        prompt,
        stem: null,
        short: prompt,
        source: `where:${c.id}:area`,
        why: `The ${name} ${plural ? "are" : "is"} in the ${areaName(area)}, on the ${zone.title}.`,
        about: tell(
          areas.map((a) => [
            areaName(a),
            `That’s the ${areaName(a)}${a.locate ? `: ${afterColon(a.locate)}` : "."}`,
          ]),
        ),
        answer: areaName(area),
        tiers: [{ items: ranked, shuffle: false }],
      });
    }
  }

  // Terms: the system is the flight deck area of the controls of the steps that use the term.
  const systemVotes = new Map<string, Map<string, number>>();
  for (const l of pack.lists)
    for (const s of l.steps) {
      const z = zoneOf(s);
      const a = z ? zones.get(z)?.area : undefined;
      if (!a) continue;
      for (const t of s.terms ?? []) {
        const m = systemVotes.get(t) ?? new Map<string, number>();
        m.set(a, (m.get(a) ?? 0) + 1);
        systemVotes.set(t, m);
      }
    }
  const systemOf = (term: string) => {
    const m = systemVotes.get(term);
    return m ? [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] : undefined;
  };
  const termUsers = (term: string) =>
    pack.lists.flatMap((l) => l.steps.filter((s) => (s.terms ?? []).includes(term)));
  const terms = pack.content.glossary?.terms ?? [];
  for (const t of terms) {
    const system = systemOf(t.term);
    if (!system) continue;
    const o = terms.filter((x) => x !== t && systemOf(x.term) === system);
    const base = {
      topic: "terms" as const,
      kind: "choice" as const,
      phases: union(termUsers(t.term).map(stepPhases)),
      steps: [],
      links: [{ label: `${t.term} in the Glossary`, href: glossaryHref(t.term) }],
      source: `term:${t.term}`,
      why: `${t.term} means: ${afterColon(t.meaning)}`,
    };
    out.push({
      ...base,
      id: `terms:meaning:${t.term}`,
      prompt: `What does ${t.term} mean?`,
      stem: null,
      short: `What does ${t.term} mean?`,
      answer: t.meaning,
      about: tell(o.map((x) => [x.meaning, `That’s what ${x.term} means.`])),
      tiers: [{ items: o.map((x) => x.meaning), shuffle: true }],
    });
    const definition = split(t.term, t.meaning).definition || t.meaning;
    if (!spellsOut(t.term, definition))
      out.push({
        ...base,
        id: `terms:term:${t.term}`,
        prompt: "Which term means this?",
        stem: { kind: "card", title: "Definition", body: definition },
        short: `Which term means this? ${definition}`,
        answer: t.term,
        about: tell(o.map((x) => [x.term, `${x.term} means: ${afterColon(x.meaning)}`])),
        tiers: [
          { items: o.filter((x) => !sameMeaning(x.meaning, t.meaning)).map((x) => x.term), shuffle: true },
        ],
      });
  }

  // The rules: exactly one correct answer and three real wrong options, or the question is skipped.
  return out.filter((q) => q.kind === "order" || pickWrong(q.answer, q.tiers).length === 3);
}

/** A sentence after a colon starts in lowercase, unless it starts with a name ("Hydraulic system A"
 * → "hydraulic system A", but "APU", "Federal Aviation Administration"). */
const afterColon = (s: string) =>
  /^(?:A|[A-Z][a-z]+)(?:[\s,]+[a-z0-9("“]|[.,]?$)/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Words that say nothing about where a control is, and words found on panels all over the deck
 *. */
const PLAIN = new Set([
  "AND",
  "THE",
  "OF",
  "FOR",
  "WITH",
  "ON",
  "IN",
  "TO",
  "PANEL",
  "PANELS",
  "SWITCH",
  "SWITCHES",
  "SELECTOR",
  "SELECTORS",
  "LIGHT",
  "LIGHTS",
  "CONTROL",
  "CONTROLS",
  "INDICATOR",
  "INDICATORS",
  "DISPLAY",
  "DISPLAYS",
  "UNIT",
  "UNITS",
  "LEVER",
  "LEVERS",
]);
/** Whether two names share a meaningful word ("Fuel pump switches" and "Fuel panel"), singular or
 * plural. */
export function sharesWord(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      norm(s)
        .split(" ")
        .filter((w) => w.length >= 3 && !PLAIN.has(w))
        .map((w) => w.replace(/(?<=[^S])S$/, "")),
    );
  const x = words(a);
  return [...words(b)].some((w) => x.has(w));
}

/** Whether a definition gives its term away: it holds the term ("BARO" in "Barometric"), or its first
 * words' initials spell it ("Passenger address" for PA). */
export function spellsOut(term: string, definition: string): boolean {
  const t = norm(term).replace(/ /g, "");
  if (!t) return false;
  const words = norm(definition).split(" ");
  if (words.some((w) => w.startsWith(t))) return true;
  const initials = words.map((w) => w[0] ?? "").join("");
  return initials.startsWith(t);
}

function orderSeed(
  topic: Topic,
  id: string,
  prompt: string,
  items: string[],
  why: string | null,
  links: Link[],
  phases: string[] | null,
  steps: string[],
): OrderSeed {
  return {
    id,
    topic,
    kind: "order",
    prompt,
    stem: null,
    short: prompt,
    source: id,
    why,
    links,
    phases,
    steps,
    items,
  };
}

const areaName = (a: { name: string; code: string | null }) => (a.code ? `${a.name} (${a.code})` : a.name);
let areasCache: { index: PackIndex; areas: ReturnType<typeof deckAreas> } | null = null;
function deckAreasOnce(index: PackIndex) {
  if (areasCache?.index !== index) areasCache = { index, areas: deckAreas(index) };
  return areasCache.areas;
}

/** What a test is drawn from: the topics, the phases (null: every stage, so every question) and
 * the flight's options. */
export type Choice = { topics: Topic[]; phases: string[] | null; options: Record<string, string> };

/** The questions a choice can draw on: its topics, the steps this flight shows, its phases. */
export function available(all: Seed[], choice: Choice, shows: (step: string) => boolean): Seed[] {
  const want = choice.phases;
  return all.filter(
    (q) =>
      choice.topics.includes(q.topic) &&
      q.steps.every(shows) &&
      (q.phases === null || want === null || q.phases.some((p) => want.includes(p))),
  );
}

/** The phases of some stages, by title, in the pack's order. */
export function phasesOf(pack: FlatPack, stages: string[]): string[] {
  return [
    ...new Set(
      (pack.content.phases?.stages ?? [])
        .filter((s) => stages.includes(s.title))
        .flatMap((s) => s.phases.map((p) => p.phase)),
    ),
  ];
}

/** "Before engine start": every phase of the stage holding the phase `preflight`, then the
 * phases of the stage holding `engine-start`, up to and including it. By the pack's phase ids. */
export function beforeEngineStart(pack: FlatPack): { stages: string[]; phases: string[] } {
  const all = pack.content.phases?.stages ?? [];
  const pre = all.find((s) => s.phases.some((p) => p.phase === "preflight"));
  const dep = all.find((s) => s.phases.some((p) => p.phase === "engine-start"));
  const upTo = dep ? dep.phases.slice(0, dep.phases.findIndex((p) => p.phase === "engine-start") + 1) : [];
  return {
    stages: [pre?.title, dep?.title].filter((t): t is string => !!t),
    phases: [...new Set([...(pre?.phases ?? []), ...upTo].map((p) => p.phase))],
  };
}

/** Whether a step shows on this flight: its own condition, and its phase's in a stage. */
export function stepShows(pack: FlatPack, options: Record<string, string>): (id: string) => boolean {
  const merged = {
    ...Object.fromEntries(
      (pack.content.phases?.options ?? []).flatMap((o) => (o.default ? [[o.id, o.default]] : [])),
    ),
    ...options,
  };
  const steps = new Map<string, { step: Step; list: string }>();
  for (const l of pack.lists) for (const s of l.steps) steps.set(s.id, { step: s, list: l.id });
  const phaseOfList = new Map<string, string>();
  for (const p of pack.content.phases?.phases ?? []) for (const l of p.lists) phaseOfList.set(l, p.id);
  const stagePhases = (pack.content.phases?.stages ?? []).flatMap((s) => s.phases);
  return (id) => {
    const found = steps.get(id);
    if (!found || !holds(found.step.showIf, merged)) return false;
    const phase = phaseOfList.get(found.list);
    const entries = stagePhases.filter((p) => p.phase === phase);
    return entries.length === 0 || entries.some((p) => holds(p.showIf, merged));
  };
}

/** Deals a test: up to `count` questions spread across the topics in turn, one per source, each
 * with its options in random order (order questions start out of order). */
export function deal(pool: Seed[], count: number, rng: () => number): Question[] {
  const byTopic = new Map<Topic, Seed[]>();
  for (const q of shuffled(pool, rng)) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
  const queues = shuffled([...byTopic.values()], rng);
  const picked: Seed[] = [];
  const sources = new Set<string>();
  while (picked.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (picked.length >= count) break;
      let q = queue.shift();
      while (q && sources.has(q.source)) q = queue.shift();
      if (!q) continue;
      sources.add(q.source);
      picked.push(q);
    }
  }
  return shuffled(picked, rng).map((q) => dealOne(q, rng));
}

export function dealOne(q: Seed, rng: () => number): Question {
  if (q.kind === "order") {
    let shown = shuffled(
      q.items.map((_, i) => i),
      rng,
    );
    if (shown.every((v, i) => v === i)) shown = [...shown.slice(1), shown[0] as number];
    return { ...q, shown };
  }
  let wrong = pickWrong(q.answer, q.tiers, rng);
  if (wrong.length < 3) wrong = pickWrong(q.answer, q.tiers);
  const options = shuffled([q.answer, ...wrong], rng);
  const { tiers: _tiers, answer, ...rest } = q;
  return { ...rest, options, answer: options.indexOf(answer) };
}

/** The number of distinct sources a pool covers: how many questions a test can hold. */
export const sourcesIn = (pool: Seed[]): number => new Set(pool.map((q) => q.source)).size;
