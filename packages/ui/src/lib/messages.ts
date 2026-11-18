// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Alert messages (Alert messages boards): their levels in order, and where a step that deals
// with one sits. What a pack says comes from the pack; these are only the app's words for it.

import type { Message, MessageLevel } from "@involo/bindings";
import type { PackIndex } from "../pack-index";

/** Levels in the boards' order, most serious first. */
export const LEVELS: MessageLevel[] = ["warning", "caution", "advisory", "memo", "status"];

/** A level's name, as its badge and filter write it. */
export const levelName = (level: MessageLevel): string => level.charAt(0).toUpperCase() + level.slice(1);

/** The levels a pack's messages use, in order, each with its count: the filters after All. */
export function levelCounts(messages: Message[]): { level: MessageLevel; count: number }[] {
  return LEVELS.map((level) => ({ level, count: messages.filter((m) => m.level === level).length })).filter(
    (l) => l.count > 0,
  );
}

/** A message matching a search: in its text or what it means, ignoring case. */
export const matches = (m: Message, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || m.text.toLowerCase().includes(q) || m.meaning.toLowerCase().includes(q);
};

/** Where a step sits, as the details write it: "Smoke in the cabin · Step 1, Oxygen masks". */
export function stepPlace(index: PackIndex, stepId: string): string | null {
  const step = index.step(stepId);
  if (!step) return null;
  const list = index.list(index.listOf(stepId) ?? "");
  if (!list) return step.text;
  return `${list.title} · Step ${list.steps.findIndex((s) => s.id === stepId) + 1}, ${step.text}`;
}

/** A message's address on the Flight deck page's Alert messages tab. */
export const messageHref = (id?: string | null): string =>
  `#/messages${id ? `/${encodeURIComponent(id)}` : ""}`;
