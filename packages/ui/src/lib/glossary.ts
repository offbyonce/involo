// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Glossary (owner, Glossary boards): every term in the pack, A to Z, each with its expansion
// when it has one, its definition and the steps that use it. Built from the pack's terms as they
// are (no pack format change): Where is this? and Related stay out, as the pack has no data for them.

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
};

/** Words that make a first sentence a statement, not a name (owner: no verb). */
const VERBS = new Set(
  "is are was were be been has have shows shown showing makes means meaning used gives sends tracks stops raises cools joins lists turns comes points supplies moves fires changes sets set lets keeps disables that which where while when".split(
    " ",
  ),
);

/**
 * The owner's rule (Glossary, answer 1): the first sentence is the expansion only when the term is an
 * abbreviation and that sentence is a short name (no verb, eight words or fewer). An abbreviation
 * here is a term in capitals that is not itself one of the sentence's words ("GEN", "Generator";
 * not "DRIVE", "The generator drive light").
 */
export function split(term: string, meaning: string): { expansion: string | null; definition: string } {
  const text = meaning.trim();
  const m = /^(.+?)[.!?](?:\s+|$)/.exec(text);
  const first = m?.[1]?.trim() ?? "";
  const rest = m ? text.slice(m[0].length).trim() : "";
  const none = { expansion: null, definition: text };
  if (!first) return none;
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
    .map((t) => ({ term: t.term, ...split(t.term, t.meaning), steps: users.get(t.term.toLowerCase()) ?? [] }))
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base", numeric: true }));
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
