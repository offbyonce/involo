// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Glossary (Glossary boards): every term in the pack, A to Z, each with its expansion
// when it has one, its definition and the steps that use it. Built from the pack's terms as they
// are (no pack format change): Where is this? and Related stay out, as the pack has no data for them.

import type { Step } from "@involo/bindings";
import type { PackIndex } from "../pack-index";
import type { FindStep } from "./find-index";

export type GlossaryTerm = {
  term: string;
  /** "Auxiliary power unit" for APU: the definition's first sentence, when it is one (see `split`). */
  expansion: string | null;
  /** The definition, less the expansion when there is one (empty when the expansion is all of it). */
  definition: string;
  /** The steps whose terms name it, in flight order, each once. */
  steps: FindStep[];
  /** For rows that would read the same: what tells each apart, by step id (see `rowTags`). */
  tags: Record<string, string>;
};

/** Words that make a first sentence a statement, not a name (no verb). */
const VERBS = new Set(
  "is are was were be been has have shows shown showing makes means meaning used gives sends tracks stops raises cools joins lists turns comes points supplies moves fires changes sets set lets keeps disables that which where while when".split(
    " ",
  ),
);

/**
 * The rule (Glossary, answer 1): the first sentence is the expansion only when the term is an
 * abbreviation and that sentence is a short name (no verb, eight words or fewer). An abbreviation
 * here is a term in capitals that is not itself one of the sentence's words ("GEN", "Generator";
 * not "DRIVE", "The generator drive light").
 */
export function split(
  term: string,
  meaning: string,
  /** Terms that meet the rule but whose first sentence reads as a description (the pack's
   * labels `glossary_exceptions`): no expansion. */
  exceptions: readonly string[] = [],
): { expansion: string | null; definition: string } {
  const text = meaning.trim();
  const m = /^(.+?)[.!?](?:\s+|$)/.exec(text);
  const first = m?.[1]?.trim() ?? "";
  const rest = m ? text.slice(m[0].length).trim() : "";
  const none = { expansion: null, definition: text };
  if (!first || exceptions.includes(term)) return none;
  if (!/^[A-Z0-9/&.\- ]*[A-Z][A-Z0-9/&.\- ]*$/.test(term)) return none;
  const words = first.split(/\s+/);
  if (words.length > 8) return none;
  const lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9/-]/g, ""));
  if (lower.some((w) => VERBS.has(w))) return none;
  // A word the term itself is (DRIVE: "The generator drive light") is a description, not its name.
  if (lower.includes(term.toLowerCase())) return none;
  return { expansion: first, definition: rest };
}

/** Every term A to Z, with the steps (from Find's index: flight order, each once) that use it. */
export function buildGlossary(
  index: PackIndex,
  terms: { term: string; meaning: string }[],
  steps: FindStep[],
): GlossaryTerm[] {
  const users = new Map<string, FindStep[]>();
  for (const s of steps)
    for (const t of index.step(s.id)?.terms ?? []) {
      const key = t.toLowerCase();
      users.set(key, [...(users.get(key) ?? []), s]);
    }
  return terms
    .map((t) => {
      const used = users.get(t.term.toLowerCase()) ?? [];
      return {
        term: t.term,
        ...split(t.term, t.meaning, index.labels.glossaryExceptions),
        steps: used,
        tags: rowTags(index, used),
      };
    })
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base", numeric: true }));
}

type ShowIf = NonNullable<Step["showIf"]>;
type OptionTest = Exclude<ShowIf, { allOf: unknown } | { anyOf: unknown }>;

/** The option values a step shows for, by option ("power" → ["gpu"]). */
function showsFor(show: ShowIf | null | undefined): Map<string, string[]> {
  const tests: OptionTest[] = !show
    ? []
    : "allOf" in show
      ? show.allOf
      : "anyOf" in show
        ? show.anyOf
        : [show];
  const out = new Map<string, string[]>();
  for (const t of tests)
    out.set(t.option, [...(out.get(t.option) ?? []), ...("equals" in t ? [t.equals] : t.oneOf)]);
  return out;
}

/**
 * Rows that would read the same (title, phase and value) name what tells them apart: their
 * lists when those differ; otherwise the condition each shows for, in the pack's own labels for the
 * option ("Ground power at the gate", "No ground power"); for a step repeated for each engine, the
 * engine the step before it names ("Engine 1"); nothing otherwise.
 */
export function rowTags(index: PackIndex, steps: FindStep[]): Record<string, string> {
  const groups = new Map<string, FindStep[]>();
  for (const s of steps) {
    const key = `${s.title}|${s.phase}|${s.value}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const tags: Record<string, string> = {};
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (new Set(group.map((s) => s.list)).size === group.length) {
      for (const s of group) if (s.list) tags[s.id] = s.list;
      continue;
    }
    const shows = group.map((s) => showsFor(index.step(s.id)?.showIf));
    const option = index.options.find((o) => {
      const sets = shows.map((m) => m.get(o.id));
      if (sets.some((v) => !v)) return false;
      const all = sets.flatMap((v) => v ?? []);
      return new Set(all).size === all.length;
    });
    group.forEach((s, i) => {
      const values = option ? (shows[i]?.get(option.id) ?? []) : [];
      const label = values.map((v) => option?.choices?.find((c) => c.value === v)?.label ?? v).join(" or ");
      if (label) tags[s.id] = label;
    });
    // A step repeated for each engine in one list: the engine, from the step before each.
    if (!option) {
      const engines = group.map((s) => /\bengine (\d+)\b/i.exec(s.before ?? "")?.[1]);
      if (engines.every(Boolean) && new Set(engines).size === engines.length)
        group.forEach((s, i) => {
          tags[s.id] = `Engine ${engines[i]}`;
        });
    }
  }
  return tags;
}

/** The A to Z heading a term sits under. */
export const letterOf = (term: string): string => {
  const c = term.charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

/** Terms whose name or expansion holds the words. */
export function filterTerms(all: GlossaryTerm[], query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((t) => t.term.toLowerCase().includes(q) || (t.expansion ?? "").toLowerCase().includes(q));
}

/** The Glossary's address for a term. */
export const glossaryHref = (term?: string | null): string =>
  term ? `#/glossary/${encodeURIComponent(term)}` : "#/glossary";
