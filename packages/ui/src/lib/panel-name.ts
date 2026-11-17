// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

/**
 * Panel names, the same way everywhere (batch 6): the pack's section title as it is, in
 * sentence case, with "panel" added only when it does not already end in a thing ("Electrical
 * meters panel", "Control stand"). A sheet or card names one panel, or a left and right
 * pair as one ("L and R wiper panels"); otherwise the panel with the step's main control, and the
 * others in an "Also:" line. Names are never chained with "and".
 */
/**
 * Words that name the thing itself, not what a panel is for (batch 6): a name ending in one
 * is used as it is ("Control stand", "Captain displays"); any other name is a panel ("Fuel panel").
 */
const THINGS = new Set([
  "annunciators",
  "bag",
  "cdu",
  "column",
  "console",
  "display",
  "displays",
  "lever",
  "levers",
  "mask",
  "monitor",
  "pedals",
  "stand",
  "unit",
  "units",
  "wheel",
]);
const lastWord = (name: string) => name.split(/\s+/).at(-1)?.toLowerCase() ?? "";
const sentence = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
/** The name ends in a thing, or already says "panel". */
const named = (name: string) => THINGS.has(lastWord(name)) || /^panels?$/.test(lastWord(name));

export function panelName(title: string): string {
  const name = title.trim();
  return named(name) ? sentence(name) : `${sentence(name)} panel`;
}

const LEFT = /^(L|Left|Captain)\s+(.+)$/i;
const RIGHT = /^(R|Right|First officer|F\/O)\s+(.+)$/i;
const NUMBERED = /^(.+?)\s+(\d+)$/;

/** A pair's shared name in the plural: "wiper panels", "displays", "CDUs". */
function plural(name: string): string {
  const last = lastWord(name);
  if (/^panels?$/.test(last)) return name.replace(/panel$/i, "panels");
  if (!THINGS.has(last)) return `${name} panels`;
  return last.endsWith("s") ? name : `${name}s`;
}

/** Two panels named as one: a left and right pair ("L and R wiper panels") or a numbered pair
 * ("Radio 1 and 2 panels"); null when they are not a pair. */
function pairName(a: string, b: string): string | null {
  const l = LEFT.exec(a) ?? LEFT.exec(b);
  const r = RIGHT.exec(a === l?.[0] ? b : a);
  if (l && r && l[2]?.toLowerCase() === r[2]?.toLowerCase()) {
    // An abbreviation keeps its capitals ("L and R"); a word takes sentence case ("left and right").
    const side = (w: string) => (w.length <= 3 ? w : w.toLowerCase());
    return `${sentence(l[1] ?? "")} and ${side(r[1] ?? "")} ${plural(l[2] ?? "")}`;
  }
  const na = NUMBERED.exec(a);
  const nb = NUMBERED.exec(b);
  if (na && nb && na[1] === nb[1] && Number(nb[2]) === Number(na[2]) + 1)
    return plural(`${sentence(na[1] ?? "")} ${na[2]} and ${nb[2]}`);
  return null;
}

/** One title for a step's panels, main panel first, with the others as an "Also:" line; pairs
 * side by side in the list are named as one, in the title and in the Also line. */
export function panelTitle(titles: string[]): { title: string; also: string | null } {
  const names = titles.map((t) => t.trim());
  const groups: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const a = names[i] ?? "";
    const b = names[i + 1];
    const pair = b !== undefined ? pairName(a, b) : null;
    if (pair) {
      groups.push(pair);
      i++;
    } else groups.push(panelName(a));
  }
  return { title: groups[0] ?? "", also: groups.length > 1 ? groups.slice(1).join(", ") : null };
}

/** The title alone (card captions and labels). */
export function panelCaption(titles: string[]): string {
  return panelTitle(titles).title;
}
