// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// References (References boards; decision 0007): what each list is based on, as the
// kind of source its pack basis tag stands for, never a citation, title, page or link. Everything
// is counted from the pack.

import type { BasisTagLabel, Checklist, FlatPack, Labels, Rail } from "@involo/bindings";

/** A basis tag's id, as a list names it. */
export type Basis = string;

/** A tag's words: its label, or its id when the pack gives none. */
const nameOf = (labels: BasisTagLabel[], tag: string): string =>
  labels.find((l) => l.id === tag)?.label ?? tag;

export type RefRow = {
  id: string;
  title: string;
  /** The stage that holds it ("Preflight"), or the reference area's title for the reference lists. */
  stage: string;
  kind: string;
  /** The tag it shows: the first source it names, else the first pending tag (Source being
   * confirmed, by default). */
  basis: Basis;
  /** Every source it names, for the counts and the chips (a list may name both). */
  sources: Basis[];
  /** The phase that holds it, for the row's link. */
  phase: string;
  /** The step the row opens: the list's first. */
  first: string | null;
};

export type References = {
  /** Each kind of source the pack's labels describe, in their order, and how many lists name it. */
  sources: { tag: Basis; name: string; about: string; count: number }[];
  /** Each pending tag (a status, not a source) and how many lists show it. */
  pending: { tag: Basis; name: string; count: number }[];
  /** How many lists show a pending tag. */
  confirming: number;
  /** Each tag's words, for its chip. */
  names: Record<Basis, string>;
  rows: RefRow[];
  /** The steps marked as following the simulator's model, in flight order. */
  simulatorModel: string[];
};

/** The list's kind as the page names it, in the pack's words (labels): procedure, checklist,
 * memory items, quick reference or non-normal procedure. A reference list's kind comes from its
 * phase's group (decision 0029). */
function kindOf(labels: Labels, list: Checklist, group: string | null | undefined): string {
  const k = labels.listKinds;
  if (list.kind === "flow") return k.flow;
  if (list.kind === "checklist") return k.checklist;
  if (list.memory) return k.memory;
  return group === "quick" ? k.quick : k.nonNormal;
}

/**
 * The page's contents, from the pack: lists in flight order, then the reference lists. A phase
 * the pack places in two stages (APU start, by power source) takes the stage this flight shows it
 * in (`rail`), else its first.
 */
export function buildReferences(pack: FlatPack, rail: Rail | null = null): References {
  const labels = pack.content.labels;
  const tags = labels.basisTags;
  const sourceTags = tags.filter((t) => !t.pending);
  const pendingTags = tags.filter((t) => t.pending);
  /** The sources a list names, in the labels' order. */
  const sourcesOf = (list: Checklist): Basis[] =>
    sourceTags.filter((t) => list.basis.includes(t.id)).map((t) => t.id);
  /** A list naming no source shows the pending tag it names, else the pack's first. */
  const pendingOf = (list: Checklist): Basis =>
    pendingTags.find((t) => list.basis.includes(t.id))?.id ?? pendingTags[0]?.id ?? list.basis[0] ?? "";
  const onRail = new Map<string, string>();
  for (const st of rail?.stages ?? []) for (const p of st.phases) onRail.set(p.id, st.id);
  const lists = new Map(pack.lists.map((l) => [l.id, l]));
  const phases = new Map((pack.content.phases?.phases ?? []).map((p) => [p.id, p]));
  const order: {
    id: string;
    stage: string;
    phase: string;
    phaseTitle: string;
    group?: string | null | undefined;
  }[] = [];
  for (const stage of pack.content.phases?.stages ?? [])
    for (const sp of stage.phases) {
      // On this flight, only where the rail shows it.
      if (onRail.has(sp.phase) && onRail.get(sp.phase) !== stage.id) continue;
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
      for (const id of p.lists)
        order.push({ id, stage: labels.reference.title, phase: p.id, phaseTitle: p.title, group: p.group });
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
      kind: kindOf(labels, list, o.group),
      basis: sourcesOf(list)[0] ?? pendingOf(list),
      sources: sourcesOf(list),
      phase: o.phase,
      first: list.steps[0]?.id ?? null,
    });
  }
  const marked = new Set<string>();
  for (const o of order)
    for (const step of lists.get(o.id)?.steps ?? []) if (step.simulatorModel) marked.add(step.id);
  return {
    // Counted from the rows, so a card's count is what its chip shows.
    sources: sourceTags.map((t) => ({
      tag: t.id,
      name: t.label,
      about: t.about ?? "",
      count: rows.filter((r) => r.sources.includes(t.id)).length,
    })),
    pending: pendingTags
      .map((t) => ({ tag: t.id, name: t.label, count: rows.filter((r) => r.basis === t.id).length }))
      .filter((t) => t.count > 0),
    confirming: rows.filter((r) => pendingTags.some((t) => t.id === r.basis)).length,
    names: Object.fromEntries(tags.map((t) => [t.id, nameOf(tags, t.id)])),
    rows,
    simulatorModel: [...marked],
  };
}
