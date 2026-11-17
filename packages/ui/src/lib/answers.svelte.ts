// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// A step's value for the flight's answers (decision 0027): once a decision has answered the option
// a step's value depends on, every view shows that answer's value ("MAIN PUMPS ON · CENTER PUMPS
// OFF"); until then, the step's own. The app keeps `answered` in step with the flight.

import type { Step } from "@involo/bindings";

export const answered = $state<{ options: Record<string, string> }>({ options: {} });

export function stepValue(step: Step, options: Record<string, string> = answered.options): string {
  return (step.expectWhen ?? []).find((e) => options[e.option] === e.equals)?.expect ?? step.expect;
}
