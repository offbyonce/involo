// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Layout and accessibility findings the main screens have today with the example packs open
// (examples.spec.ts, #108). Each is tracked by the issue that fixes it. The check fails on any
// finding not listed here, and on a listed one that no longer happens, so this list only shrinks:
// remove an entry when its fix lands. It must be empty before the v0.1.0 release.

/** One known finding: on which screen, from which check, with which example packs open. */
export type KnownFinding = {
  screen: string;
  /** The check that reports it: the tap size and screen-edge rules (layout), a key element that
   * must show (shown), or an axe rule by its id. */
  check: "layout" | "shown" | "label-content-name-mismatch";
  /** What the check says, without the pack, width or theme. */
  finding: RegExp;
  /** The example packs it happens with. */
  packs: string[];
  /** The issue that fixes it. */
  issue: string;
};

export const KNOWN_FINDINGS: KnownFinding[] = [];

/**
 * Sorts a pack's screen problems (`<screen>, <width> px, <theme>: <finding>`) into the known ones
 * and the new ones, and gives the known findings for this pack that didn't happen.
 */
export function sortFindings(pack: string, problems: { screen: string; problem: string }[]) {
  const seen = new Set<KnownFinding>();
  const fresh: string[] = [];
  for (const { screen, problem } of problems) {
    const finding = problem.replace(/^.*?, \d+ px, (dark|light): /, "");
    const known = KNOWN_FINDINGS.find(
      (k) => k.screen === screen && k.packs.includes(pack) && k.finding.test(finding),
    );
    if (known) seen.add(known);
    else fresh.push(problem);
  }
  const gone = KNOWN_FINDINGS.filter((k) => k.packs.includes(pack) && !seen.has(k)).map(
    (k) => `${k.screen}: ${k.finding} (${k.issue})`,
  );
  return { fresh, gone };
}
