// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Find (batch 6, Find.dc.html): every step, control and term in the pack, searched by plain text.

import type { FlatPack, Rail } from "@involo/bindings";
import type { PackIndex } from "../pack-index";
import { stepTitle } from "./sentence";

/** A step, with the title of the first list that holds it (to tell apart rows that read the same). */
export type FindStep = {
  id: string;
  title: string;
  value: string;
  phase: string;
  list?: string | undefined;
  /** The text of the step before it in that list (the Glossary tells repeated steps apart by it). */
  before?: string | undefined;
};
export type FindControl = {
  id: string;
  name: string;
  /** "Panel area · Panel" (Find board). */
  where: string;
  /** Where it is, in words, for a control no step on this flight uses (shown in place). */
  location: string;
  /** Where the control is drawn, and the steps (in flight order, with their phases) that use it;
   * findIn picks the first one this flight shows. */
  at: { section: string; item: number } | null;
  usedBy: { step: string; phase: string; at: { section: string; item: number } }[];
  step: string | null;
};
export type FindTerm = { term: string; meaning: string };
export type FindIndex = { steps: FindStep[]; controls: FindControl[]; terms: FindTerm[] };

/** The searchable text of a pack, built once when it loads. */
export function buildFind(pack: FlatPack, index: PackIndex): FindIndex {
  const lists = new Map(pack.lists.map((l) => [l.id, l]));
  const steps: FindStep[] = [];
  const seen = new Set<string>();
  for (const phase of pack.content.phases?.phases ?? []) {
    for (const id of phase.lists) {
      const all = lists.get(id)?.steps ?? [];
      for (const [n, step] of all.entries()) {
        if (seen.has(step.id)) continue;
        seen.add(step.id);
        steps.push({
          id: step.id,
          title: stepTitle(index, step),
          value: step.expect,
          phase: phase.id,
          list: lists.get(id)?.title,
          before: all[n - 1]?.text,
        });
      }
    }
  }
  const drawn = new Map<string, { panel: string; section: string; item: number }[]>();
  for (const panel of pack.content.panels ?? []) {
    for (const section of panel.sections) {
      section.items.forEach((item, i) => {
        for (const c of item.controls ?? [])
          drawn.set(c, [...(drawn.get(c) ?? []), { panel: panel.id, section: section.id, item: i }]);
      });
    }
  }
  const order = new Map(steps.map((s, i) => [s.id, i]));
  const zones = new Map((pack.content.controls?.zones ?? []).map((z) => [z.id, z]));
  const controls = (pack.content.controls?.controls ?? []).map((c): FindControl => {
    const zone = c.zone ? zones.get(c.zone) : undefined;
    const items = drawn.get(c.id) ?? [];
    const first = items[0];
    return {
      id: c.id,
      name: c.name,
      where: zone ? `${zone.area} · ${zone.title}` : c.location,
      location: c.location,
      at: first ? { section: first.section, item: first.item } : null,
      // Every step that uses one of its drawn items, in flight order.
      usedBy: items
        .flatMap((it) =>
          index.usedIn(it.panel, it.section, it.item).flatMap((u) => {
            const phase = index.phaseOf(u.step.id);
            return phase ? [{ step: u.step.id, phase, at: { section: it.section, item: it.item } }] : [];
          }),
        )
        .sort((a, b) => (order.get(a.step) ?? 0) - (order.get(b.step) ?? 0)),
      step: null,
    };
  });
  const terms = (pack.content.glossary?.terms ?? []).map((t) => ({ term: t.term, meaning: t.meaning }));
  return { steps, controls, terms };
}

export type FoundStep = FindStep & { stage: string; phaseTitle: string };
export type Found = { steps: FoundStep[]; controls: FindControl[]; terms: FindTerm[] };

const norm = (s: string) => s.toLowerCase();

/** Matches in each section, those whose title holds the words first, in pack order otherwise.
 * Steps come only from the phases this flight shows (the rail): the current step first, then from
 * the phase on screen onward, then the phases before it (FindDesk). */
export function findIn(
  find: FindIndex,
  query: string,
  rail: Rail | null,
  here: { phase?: string | null; step?: string | null } = {},
): Found {
  const q = norm(query.trim());
  if (!q) return { steps: [], controls: [], terms: [] };
  const phases = new Map<string, { stage: string; title: string; at: number }>();
  let n = 0;
  for (const s of rail?.stages ?? [])
    for (const p of s.phases) phases.set(p.id, { stage: s.title, title: p.title, at: n++ });
  for (const p of rail?.reference ?? []) phases.set(p.id, { stage: "Emergency", title: p.title, at: n++ });
  const rank = <T>(items: T[], title: (t: T) => string, rest: (t: T) => string[]) => {
    const first: T[] = [];
    const then: T[] = [];
    for (const it of items) {
      if (norm(title(it)).includes(q)) first.push(it);
      else if (rest(it).some((r) => norm(r).includes(q))) then.push(it);
    }
    return [...first, ...then];
  };
  const total = n;
  const start = here.phase ? (phases.get(here.phase)?.at ?? 0) : 0;
  const steps = find.steps
    .filter((s) => phases.has(s.phase))
    .map((s) => {
      const p = phases.get(s.phase);
      return { ...s, stage: p?.stage ?? "", phaseTitle: p?.title ?? "", at: p?.at ?? 0 };
    })
    .sort(
      (a, b) =>
        (a.id === here.step ? -1 : b.id === here.step ? 1 : 0) ||
        ((a.at - start + total) % total) - ((b.at - start + total) % total),
    )
    .map(({ at: _, ...s }) => s);
  return {
    steps: rank(
      steps,
      (s) => s.title,
      (s) => [s.value],
    ),
    controls: rank(
      find.controls,
      (c) => c.name,
      (c) => [c.where],
    ).map((c) => {
      const u = c.usedBy.find((x) => phases.has(x.phase));
      return { ...c, step: u?.step ?? null, at: u?.at ?? c.at };
    }),
    terms: rank(
      find.terms,
      (t) => t.term,
      (t) => [t.meaning],
    ),
  };
}

/** The text split around its first match, for the mark (Find board). */
export function marked(text: string, query: string): [string, string, string] | null {
  const q = norm(query.trim());
  const at = q ? norm(text).indexOf(q) : -1;
  if (at < 0) return null;
  return [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)];
}
