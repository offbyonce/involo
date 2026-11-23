// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Report a problem with a step (#242; Release board, RelReport): the address of the repository's
// issue form for a step, with the step filled in. There is no backend: the pilot's browser opens
// GitHub, and the address carries the pack and its version, the list, the step id and the app
// version, and nothing else (no flight values, no username).

/** The repository's issue form for one step, `.github/ISSUE_TEMPLATE/step-problem.yml`. */
export const STEP_PROBLEM_FORM = "https://github.com/offbyonce/involo/issues/new";

export type StepProblem = {
  pack: string;
  packVersion: string;
  list: string;
  step: string;
  appVersion: string;
};

/** The issue form's address for this step: each field's id with its value. */
export function stepProblemUrl(p: StepProblem): string {
  const query = new URLSearchParams({
    template: "step-problem.yml",
    pack: `${p.pack} ${p.packVersion}`,
    list: p.list,
    step: p.step,
    app: p.appVersion,
  });
  return `${STEP_PROBLEM_FORM}?${query}`;
}
