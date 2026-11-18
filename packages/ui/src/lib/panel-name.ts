// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

/**
 * Panel names, the same way everywhere: a section's `name` when the pack gives one, else its title,
 * as the pack writes it. A sheet or card names one panel, or a pair as one: a left and right pair
 * by the pack's side words ("L and R wiper panels"), or a numbered pair ("Radio 1 and 2 panels");
 * otherwise the panel with the step's main control, and the others in an "Also:" line. Names are
 * never chained with "and".
 */
import type { PanelSection } from "@involo/bindings";

/** What a section is called in titles and captions. */
export const sectionName = (section: Pick<PanelSection, "title" | "name">): string =>
  (section.name ?? section.title).trim();

const sentence = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One panel's name, as the pack writes it. */
export function panelName(name: string): string {
  return name.trim();
}

/** A shared name in the plural: "wiper panels", or an "s" added. */
function plural(name: string): string {
  return /s$/i.test(name) ? name : `${name}s`;
}

const NUMBERED = /^(.+?)\s+(\d+)((?:\s+.+)?)$/;

/** Two panels named as one: a pair by side words ("L and R wiper panels"), in the order the side
 * words list them, or a numbered pair ("Radio 1 and 2 panels"); null when they are not a pair. */
function pairName(a: string, b: string, sides: readonly string[]): string | null {
  // Longer words first, so a word is never read as a shorter one it starts with.
  const words = [...sides].sort((x, y) => y.length - x.length);
  const side = (name: string) => {
    if (!words.length) return null;
    const m = new RegExp(`^(${words.map(escapeRe).join("|")})\\s+(.+)$`, "i").exec(name);
    if (!m) return null;
    const rank = sides.findIndex((w) => w.toLowerCase() === (m[1] ?? "").toLowerCase());
    return { word: m[1] ?? "", rest: m[2] ?? "", rank };
  };
  const sa = side(a);
  const sb = side(b);
  if (
    sa &&
    sb &&
    sa.word.toLowerCase() !== sb.word.toLowerCase() &&
    sa.rest.toLowerCase() === sb.rest.toLowerCase()
  ) {
    const [first, second] = sa.rank <= sb.rank ? [sa, sb] : [sb, sa];
    // An abbreviation keeps its capitals ("L and R"); a word takes sentence case ("left and right").
    const lower = (w: string) => (w.length <= 3 ? w : w.toLowerCase());
    return `${sentence(first.word)} and ${lower(second.word)} ${plural(first.rest)}`;
  }
  const na = NUMBERED.exec(a);
  const nb = NUMBERED.exec(b);
  if (na && nb && na[1] === nb[1] && na[3] === nb[3] && Number(nb[2]) === Number(na[2]) + 1) {
    const both = `${sentence(na[1] ?? "")} ${na[2]} and ${nb[2]}`;
    return na[3] ? `${both}${plural(na[3])}` : both;
  }
  return null;
}

/** One title for a step's panels, main panel first, with the others as an "Also:" line; pairs
 * side by side in the list are named as one, in the title and in the Also line. `sides` are the
 * pack's side words and role names. */
export function panelTitle(
  names: string[],
  sides: readonly string[] = [],
): { title: string; also: string | null } {
  const all = names.map((t) => t.trim());
  const groups: string[] = [];
  for (let i = 0; i < all.length; i++) {
    const a = all[i] ?? "";
    const b = all[i + 1];
    const pair = b !== undefined ? pairName(a, b, sides) : null;
    if (pair) {
      groups.push(pair);
      i++;
    } else groups.push(panelName(a));
  }
  return { title: groups[0] ?? "", also: groups.length > 1 ? groups.slice(1).join(", ") : null };
}

/** The title alone (card captions and labels). */
export function panelCaption(names: string[], sides: readonly string[] = []): string {
  return panelTitle(names, sides).title;
}
