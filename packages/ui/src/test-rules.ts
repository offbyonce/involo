// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The rules every pack's generated text must keep (issue 146), as the standing protection: run over the
// iFly pack, the example packs and an invented fixture, so a change that breaks them for any pack
// fails, not only for the pack it was written against. Each returns the problems it finds, as
// lines that name the question or text, so a failure says where. For tests only.

import type { FlatPack } from "@involo/bindings";
import { deckAreas } from "./lib/deck";
import { buildFind } from "./lib/find-index";
import { controlName, stepTitle } from "./lib/names";
import { panelName, sectionName } from "./lib/panel-name";
import { dealOne, pickItems, random, type Seed, sameMeaning, seeds } from "./lib/practice";
import { indexPack, type PackIndex } from "./pack-index";
import { parseRoute } from "./route.svelte";

/** What never belongs in text the app shows: a value that wasn't filled in, an object printed as
 * text, empty brackets and doubled spaces. */
const BROKEN: [RegExp, string][] = [
  [/\bundefined\b/, '"undefined"'],
  [/\bnull\b/, '"null"'],
  [/\[object/, '"[object"'],
  [/\(\s*\)/, 'empty "()"'],
  [/ {2}/, "a doubled space"],
  [/\{[a-z_]+\}/i, "a placeholder left in"],
];

/** The problems in one text. */
export function textProblems(where: string, text: string): string[] {
  return BROKEN.filter(([pattern]) => pattern.test(text)).map(([, what]) => `${where}: ${what} in "${text}"`);
}

/** Keys whose values name things by id, not words a pilot reads. */
const ID_KEYS = new Set([
  "id",
  "zone",
  "section",
  "panel",
  "phase",
  "list",
  "step",
  "locator",
  "group",
  "option",
  "source",
]);

/** Every word of the pack's own text: each string in it but its ids. */
function packWords(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return ID_KEYS.has(key) || key.endsWith("Id") ? [] : value.toLowerCase().split(/[^a-z0-9]+/);
  if (Array.isArray(value)) return value.flatMap((v) => packWords(v, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => packWords(v, k));
  return [];
}

/** Every id in the pack that isn't also an ordinary word of its own text: none may show. */
export function packIds(pack: FlatPack, index: PackIndex): Set<string> {
  const words = new Set(packWords(pack));
  return new Set(
    [
      ...index.zones.map((z) => z.id),
      ...index.controls.map((c) => c.id),
      ...index.panels.flatMap((p) => [p.id, ...p.sections.map((x) => x.id)]),
      ...pack.lists.flatMap((l) => [l.id, ...l.steps.map((x) => x.id)]),
      ...(pack.content.phases?.phases ?? []).map((p) => p.id),
      ...(pack.content.briefings?.briefings ?? []).flatMap((b) => [b.id, ...b.items.map((i) => i.id)]),
    ].filter((id) => id.length >= 3 && !words.has(id.toLowerCase())),
  );
}

/** The pack ids found in one text. */
function idProblems(where: string, text: string, ids: Set<string>): string[] {
  return text
    .split(/[^A-Za-z0-9.-]+/)
    .filter((token) => ids.has(token))
    .map((token) => `${where}: the pack id "${token}" in "${text}"`);
}

/** Words that name one aircraft or simulator product. Generated text may hold one only when the
 * pack's own file does: never from the app's code or defaults. */
export const AIRCRAFT_WORDS = [
  "737",
  "MAX 8",
  "Boeing",
  "iFly",
  "Airbus",
  "A320",
  "A20N",
  "B38M",
  "PMDG",
  "Fenix",
];

/** The aircraft words the pack's own file (`source`) doesn't have, each with its pattern. */
function foreignWords(source: string): [string, RegExp][] {
  const own = source.toLowerCase();
  return AIRCRAFT_WORDS.filter((w) => !own.includes(w.toLowerCase())).map((w) => [
    w,
    new RegExp(`\\b${w}\\b`, "i"),
  ]);
}

/** The aircraft words in `text` that the pack doesn't have. */
function aircraftProblems(where: string, text: string, foreign: [string, RegExp][]): string[] {
  return foreign
    .filter(([, p]) => p.test(text))
    .map(([w]) => `${where}: "${w}", which the pack doesn't have, in "${text}"`);
}

/** The problems in each text, each distinct text checked once. */
function checkTexts(
  texts: [string, string][],
  ids: Set<string>,
  foreign: [string, RegExp][],
  skip = (_where: string, _problem: string) => false,
): string[] {
  const seen = new Map<string, string[]>();
  const problems: string[] = [];
  for (const [where, text] of texts) {
    let found = seen.get(text);
    if (!found) {
      found = [
        ...textProblems("", text),
        ...idProblems("", text, ids),
        ...aircraftProblems("", text, foreign),
      ];
      seen.set(text, found);
    }
    for (const f of found) if (!skip(where, f)) problems.push(`${where}${f}`);
  }
  return problems;
}

/** The texts a question shows: its prompt, stem, options, explanations and links. */
function questionTexts(seed: Seed): string[] {
  const texts = [
    seed.prompt,
    seed.short,
    seed.why ?? "",
    ...seed.links.map((l) => l.label),
    seed.stem?.kind === "card" ? `${seed.stem.title} ${seed.stem.body ?? ""}` : (seed.stem?.caption ?? ""),
    seed.stem?.kind === "light" ? seed.stem.label : "",
  ];
  if (seed.kind === "choice")
    texts.push(seed.answer, ...seed.tiers.flatMap((t) => t.items), ...Object.values(seed.about));
  else texts.push(...seed.items);
  return texts.filter((t) => t !== "");
}

/**
 * Practice's question bank for a pack, against every rule (issue 146): four options, none meaning the
 * same as another, exactly one of them right; every wrong option one of the pack's own; no twin of
 * the answer or two twins (the pack's own pair rules); every light offered or drawn an item the
 * pack draws, by its whole label; every option explained, and the question too; order questions of 4 to 6 steps, dealt out of order; every link resolving; and no pack id,
 * broken text or aircraft word the pack doesn't have. `source` is the pack's built file.
 */
export function checkBank(pack: FlatPack, source: string, questions?: Seed[]): string[] {
  const index = indexPack(pack);
  // The pack's own questions, unless a test passes some of them changed.
  const all = questions ?? seeds(pack, index);
  const ids = packIds(pack, index);
  const areas = deckAreas(index);
  const terms = new Set((pack.content.glossary?.terms ?? []).map((t) => t.term));
  const phases = new Set((pack.content.phases?.phases ?? []).map((p) => p.id));
  const problems: string[] = [];
  const add = (...found: string[]) => problems.push(...found);
  if (new Set(all.map((q) => q.id)).size !== all.length) add("two questions share an id");
  const foreign = foreignWords(source);
  add(
    ...checkTexts(
      all.flatMap((seed) => questionTexts(seed).map((t): [string, string] => [seed.id, t])),
      ids,
      foreign,
    ),
  );
  // Every light a question names or offers is an item the pack draws (a light, or a button that
  // lights), by its whole label.
  const drawn = new Set(
    index.panels.flatMap((p) => p.sections.flatMap((x) => x.items.map((i) => i.label ?? ""))),
  );
  for (const seed of all) {
    if (seed.id.startsWith("lights:light:") && seed.kind === "choice")
      for (const label of [seed.answer, ...seed.tiers.flatMap((t) => t.items)])
        if (!drawn.has(label)) add(`${seed.id}: offers the light "${label}", which the pack doesn't draw`);
    if (seed.stem?.kind === "light" && !drawn.has(seed.stem.label))
      add(`${seed.id}: draws the light "${seed.stem.label}", which the pack doesn't draw`);
    if (!seed.links.length) add(`${seed.id}: no link to where it comes from`);
    for (const link of seed.links) {
      if (link.step && !index.step(link.step)) add(`${seed.id}: a link to a step that isn't there`);
      const r = parseRoute(link.href);
      const resolves =
        r.screen === "phase"
          ? phases.has(r.id)
          : r.screen === "glossary"
            ? terms.has(r.term ?? "")
            : r.screen === "deck"
              ? !!areas.find((a) => a.id === r.area)?.zones.some((z) => z.id === r.zone)
              : false;
      if (!resolves) add(`${seed.id}: the link ${link.href} doesn't resolve`);
    }
    for (const id of seed.steps) if (!index.step(id)) add(`${seed.id}: built from a step that isn't there`);
    for (const n of [1, 2, 3]) {
      const q = dealOne(seed, random(n));
      if (seed.kind === "order" && q.kind === "order") {
        if (q.items.length < 4 || q.items.length > 6) add(`${seed.id}: ${q.items.length} steps to order`);
        if (new Set(q.items).size !== q.items.length) add(`${seed.id}: a step to order twice`);
        if (!q.shown.some((v, i) => v !== i)) add(`${seed.id}: dealt already in order`);
        continue;
      }
      if (seed.kind !== "choice" || q.kind !== "choice") continue;
      if (q.options.length !== 4) add(`${seed.id}: ${q.options.length} options`);
      if (q.options[q.answer] !== seed.answer) add(`${seed.id}: the right option isn't the answer`);
      if (q.options.filter((o) => o === seed.answer).length !== 1)
        add(`${seed.id}: the answer offered twice`);
      for (const [i, a] of q.options.entries())
        for (const b of q.options.slice(i + 1))
          if (sameMeaning(a, b)) add(`${seed.id}: "${a}" and "${b}" mean the same`);
      const real = new Set(seed.tiers.flatMap((t) => t.items));
      const wrong = q.options.filter((_, i) => i !== q.answer);
      for (const w of wrong) {
        if (!real.has(w)) add(`${seed.id}: "${w}" isn't one of the pack's own`);
        if (!q.about[w]) add(`${seed.id}: "${w}" isn't explained`);
      }
      // A control's own positions keep their sides (IGN L against IGN R is the question).
      if (seed.topic !== "values" && !seed.tiers.some((t) => t.sides)) {
        for (const w of wrong)
          if (seed.twins.pair(w, seed.answer)) add(`${seed.id}: offers "${w}", a twin of the answer`);
        for (const [i, a] of wrong.entries())
          for (const b of wrong.slice(i + 1))
            if (seed.twins.pair(a, b)) add(`${seed.id}: offers twins "${a}" and "${b}"`);
      }
    }
    if (seed.kind === "choice") {
      if (!seed.why) add(`${seed.id}: no explanation`);
      for (const w of pickItems(seed.answer, seed.tiers, seed.twins))
        if (!seed.about[w.key]) add(`${seed.id}: "${w.text}" isn't explained`);
    }
  }
  return [...new Set(problems)];
}

/**
 * The names the rest of the app makes from a pack (issue 146): Find's steps, controls and terms, each
 * step's name and the text its row shows, the panel and section names, the Flight deck's areas and
 * places, and the pack's labels. No pack id,
 * broken text or aircraft word the pack doesn't have. `source` is the pack's built file.
 */
export function checkNames(pack: FlatPack, source: string): string[] {
  const index = indexPack(pack);
  const ids = packIds(pack, index);
  const find = buildFind(pack, index);
  const texts: [string, string][] = [
    ...find.steps.flatMap((s): [string, string][] => [
      [`find step ${s.id}`, s.title],
      [`find step ${s.id}`, s.value],
    ]),
    ...find.controls.flatMap((c): [string, string][] => [
      [`find control ${c.id}`, c.name],
      [`find control ${c.id}`, c.where],
      [`find control ${c.id}`, c.location],
    ]),
    ...find.terms.map((t): [string, string] => [`find term ${t.term}`, `${t.term} ${t.meaning}`]),
    ...index.controls.map((c): [string, string] => [`control ${c.id}`, controlName(index, c)]),
    // Each step's name, and the text, value and reason its row shows.
    ...pack.lists.flatMap((l) =>
      l.steps.flatMap((s): [string, string][] =>
        [stepTitle(index, s), s.text, s.expect, s.why ?? ""]
          .filter((t) => t !== "")
          .map((t) => [`step ${s.id}`, t]),
      ),
    ),
    ...index.panels.flatMap((p) =>
      p.sections.flatMap((s): [string, string][] => [
        [`section ${s.id}`, sectionName(s)],
        [`section ${s.id}`, panelName(sectionName(s))],
      ]),
    ),
    ...deckAreas(index).flatMap((a) => [
      [`area ${a.id}`, a.name] as [string, string],
      ...a.zones.map((z): [string, string] => [`place ${z.id}`, z.title]),
    ]),
    ...labelTexts(pack.content.labels).map((t): [string, string] => ["labels", t]),
  ];
  // Labels may hold placeholders on purpose ({count}): the text they fill is checked where shown.
  const problems = checkTexts(
    texts,
    ids,
    foreignWords(source),
    (where, p) => where === "labels" && p.includes("placeholder"),
  );
  return [...new Set(problems)];
}

/** Every string in the pack's labels. */
function labelTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(labelTexts);
  if (value && typeof value === "object") return Object.values(value).flatMap(labelTexts);
  return [];
}
