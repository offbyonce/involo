// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

/**
 * Panel names, the same way everywhere (owner, batch 6): the pack's section title in sentence case,
 * as a panel ("Electrical meters panel"). A sheet or card names one panel, or a left and right
 * pair as one ("L and R wiper panels"); otherwise the panel with the step's main control, and the
 * others in an "Also:" line. Names are never chained with "and".
 */
export function panelName(title: string): string {
  const name = title.trim().replace(/\s+panels?$/i, "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} panel`;
}

const LEFT = /^(L|Left|Captain)\s+(.+)$/;
const RIGHT = /^(R|Right|First officer|F\/O)\s+(.+)$/i;
const strip = (t: string) => t.trim().replace(/\s+panels?$/i, "");

/** One title for a step's panels, main panel first, with the others as an "Also:" line. */
export function panelTitle(titles: string[]): { title: string; also: string | null } {
  const names = titles.map(strip);
  const [first, second] = names;
  if (names.length === 2 && first && second) {
    const l = LEFT.exec(first) ?? LEFT.exec(second);
    const r = RIGHT.exec(first === l?.[0] ? second : first);
    if (l && r && l[2]?.toLowerCase() === r[2]?.toLowerCase()) {
      // An abbreviation keeps its capitals ("L and R"); a word takes sentence case ("left and right").
      const side = (w: string) => (w.length <= 3 ? w : w.toLowerCase());
      const lead = l[1] ?? "";
      return {
        title: `${lead.charAt(0).toUpperCase()}${lead.slice(1)} and ${side(r[1] ?? "")} ${l[2]} panels`,
        also: null,
      };
    }
  }
  return {
    title: first !== undefined ? panelName(first) : "",
    also: names.length > 1 ? names.slice(1).map(panelName).join(", ") : null,
  };
}

/** The title alone (card captions and labels). */
export function panelCaption(titles: string[]): string {
  return panelTitle(titles).title;
}
