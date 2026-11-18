// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The reference area's tabs (decision 0029): its phases by `group`, in the order the pack's labels
// list the groups, then any group the labels don't name. Never by the phases' order or titles.

import type { Labels, RailPhase } from "@involo/bindings";

export type ReferenceTab = { id: string; title: string; group: string | null };

/**
 * One tab per reference phase, in group order. A phase alone in its group takes the group's title
 * from the labels; phases sharing a group, or in a group the labels don't name, keep their own.
 */
export function referenceTabs(labels: Labels, phases: RailPhase[]): ReferenceTab[] {
  const groups = labels.reference.groups;
  const rank = (g: string | null | undefined) => {
    const n = groups.findIndex((x) => x.id === g);
    return n < 0 ? groups.length : n;
  };
  const inGroup = (g: string | null | undefined) => phases.filter((p) => p.group === g).length;
  return phases
    .map((p, n) => ({ p, n }))
    .sort((a, b) => rank(a.p.group) - rank(b.p.group) || a.n - b.n)
    .map(({ p }) => {
      const label = groups.find((g) => g.id === p.group);
      const title = label && inGroup(p.group) === 1 ? label.title : p.title;
      return { id: p.id, title, group: p.group ?? null };
    });
}
