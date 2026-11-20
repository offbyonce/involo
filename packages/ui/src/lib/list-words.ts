// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// A list's kind and method as the interface names them, in the pack's words (labels, decision
// 0029).

import type { Checklist, Labels, ListMethod } from "@involo/bindings";

/** The list's kind: procedure, checklist, memory items, quick reference or non-normal procedure.
 * A reference list's kind comes from its phase's group. */
export function kindOf(labels: Labels, list: Checklist, group: string | null | undefined): string {
  const k = labels.listKinds;
  if (list.kind === "flow") return k.flow;
  if (list.kind === "checklist") return k.checklist;
  if (list.memory) return k.memory;
  return group === "quick" ? k.quick : k.nonNormal;
}

/** How the list is used ("Challenge and response"), or null when the list sets no method. */
export function methodOf(labels: Labels, method: ListMethod | null | undefined): string | null {
  const m = labels.methods;
  switch (method) {
    case "do":
      return m.do;
    case "read_and_do":
      return m.readAndDo;
    case "challenge_response":
      return m.challengeResponse;
    case "from_memory":
      return m.fromMemory;
    default:
      return null;
  }
}
