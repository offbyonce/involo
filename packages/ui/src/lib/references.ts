// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// References (References boards; decision 0007): what each list is based on, as the
// kind of source its pack basis tag stands for, never a citation, title, page or link. Everything
// is counted from the pack.

import type { Checklist, FlatPack, Rail } from "@involo/bindings";

/** The kinds of source a basis tag can stand for (References README), in the page's order. */
export const SOURCES = [
  {
    tag: "ifly-docs",
    name: "Simulator documentation",
    about: "How the aircraft model in the simulator works: its panels, its switches and its own procedures.",
  },
  {
    tag: "regulator-docs",
    name: "Regulator guidance",
    about: "General practice published by aviation authorities, such as how checklists are used.",
  },
] as const;

/** A status, not a source: lists whose text came from an earlier release and are being checked
 * against the sources above. The content batch re-tags them, and the status then goes away. */
export const CONFIRMING = { tag: "prior-release", name: "Source being confirmed" } as const;

export type Basis = (typeof SOURCES)[number]["tag"] | typeof CONFIRMING.tag;

/** What a list's "Based on" tag reads. */
export const basisName = (b: Basis): string => SOURCES.find((s) => s.tag === b)?.name ?? CONFIRMING.name;

export type RefRow = {
  id: string;
  title: string;
  /** The stage that holds it ("Preflight"), or "Emergency" for the reference lists. */
  stage: string;
  kind: string;
  /** The tag it shows: the first source it names, else Source being confirmed. */
  basis: Basis;
  /** Every source it names, for the counts and the chips (a list may name both). */
  sources: Basis[];
  /** The phase that holds it, for the row's link. */
  phase: string;
  /** The step the row opens: the list's first. */
  first: string | null;
};

export type References = {
  /** Each kind of source and how many lists name it. */
  sources: { tag: Basis; name: string; about: string; count: number }[];
  /** How many lists are still Source being confirmed. */
  confirming: number;
  rows: RefRow[];
  /** The steps marked as following the simulator's model, in flight order. */
  simulatorModel: string[];
};

/** The list's kind as the page names it: procedure, checklist, memory items, quick reference or
 * non-normal procedure. */
function kindOf(list: Checklist, phaseTitle: string): string {
  if (list.kind === "flow") return "Procedure";
  if (list.kind === "checklist") return "Checklist";
  if (list.memory) return "Memory items";
  return phaseTitle === "Quick reference" ? "Quick reference" : "Non-normal procedure";
}

/** The sources a list names, in the page's order. */
const sourcesOf = (list: Checklist): Basis[] =>
  SOURCES.filter((s) => list.basis.includes(s.tag)).map((s) => s.tag);

/**
 * The page's contents, from the pack: lists in flight order, then the reference lists. A phase
 * the pack places in two stages (APU start, by power source) takes the stage this flight shows it
 * in (`rail`), else its first.
 */
export function buildReferences(pack: FlatPack, rail: Rail | null = null): References {
  const onRail = new Map<string, string>();
  for (const st of rail?.stages ?? []) for (const p of st.phases) onRail.set(p.id, st.title);
  const lists = new Map(pack.lists.map((l) => [l.id, l]));
  const phases = new Map((pack.content.phases?.phases ?? []).map((p) => [p.id, p]));
  const order: { id: string; stage: string; phase: string; phaseTitle: string }[] = [];
  for (const stage of pack.content.phases?.stages ?? [])
    for (const sp of stage.phases) {
      // On this flight, only where the rail shows it.
      if (onRail.has(sp.phase) && onRail.get(sp.phase) !== stage.title) continue;
      for (const id of phases.get(sp.phase)?.lists ?? [])
        order.push({
          id,
          stage: stage.title,
          phase: sp.phase,
          phaseTitle: phases.get(sp.phase)?.title ?? "",
        });
    }
  for (const p of phases.values())
    if (p.reference)
      for (const id of p.lists) order.push({ id, stage: "Emergency", phase: p.id, phaseTitle: p.title });
  const seen = new Set<string>();
  const rows: RefRow[] = [];
  for (const o of order) {
    const list = lists.get(o.id);
    if (!list || seen.has(o.id)) continue;
    seen.add(o.id);
    rows.push({
      id: list.id,
      title: list.title,
      stage: o.stage,
      kind: kindOf(list, o.phaseTitle),
      basis: sourcesOf(list)[0] ?? CONFIRMING.tag,
      sources: sourcesOf(list),
      phase: o.phase,
      first: list.steps[0]?.id ?? null,
    });
  }
  const marked = new Set<string>();
  for (const o of order)
    for (const step of lists.get(o.id)?.steps ?? []) if (step.simulator_model) marked.add(step.id);
  return {
    // Counted from the rows, so a card's count is what its chip shows.
    sources: SOURCES.map((s) => ({ ...s, count: rows.filter((r) => r.sources.includes(s.tag)).length })),
    confirming: rows.filter((r) => r.basis === CONFIRMING.tag).length,
    rows,
    simulatorModel: [...marked],
  };
}
