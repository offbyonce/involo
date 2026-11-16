// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Practice for this visit only: the test in progress and the last result. Nothing is saved across
// visits; that needs the owner's decision (the same question as the Flight log).

import type { Question, Topic } from "./practice";

export type Feedback = "each" | "end";
/** A test as taken: what it was drawn from, its questions and the answers so far (an option's
 * index, or the order as the indexes of the question's items). */
export type Test = {
  title: string;
  custom: boolean;
  topics: Topic[];
  stages: string[];
  allStages: boolean;
  count: number;
  feedback: Feedback;
  questions: Question[];
  answers: (number | number[] | null)[];
  at: number;
  started: number;
  ended: number | null;
};

export const visit = $state<{ test: Test | null; last: Test | null }>({ test: null, last: null });

export function correct(q: Question, a: number | number[] | null | undefined): boolean {
  if (a === null || a === undefined) return false;
  if (q.kind === "choice") return a === q.answer;
  return Array.isArray(a) && a.length === q.items.length && a.every((v, i) => v === i);
}
