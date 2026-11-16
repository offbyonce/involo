// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

/**
 * Panel names, the same way everywhere (owner, batch 6): the pack's section title as it is, in
 * sentence case, with "panel" added only when it does not already end in a thing ("Electrical
 * meters panel", "Control stand"). A sheet or card names one panel, or a left and right
 * pair as one ("L and R wiper panels"); otherwise the panel with the step's main control, and the
 * others in an "Also:" line. Names are never chained with "and".
 */
/**
 * Words that name the thing itself, not what a panel is for (owner, batch 6): a name ending in one
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

/** A pair's shared name in the plural: "wiper panels", "displays", "CDUs". */
function plural(name: string): string {
  const last = lastWord(name);
  if (/^panels?$/.test(last)) return name.replace(/panel$/i, "panels");
  if (!THINGS.has(last)) return `${name} panels`;
  return last.endsWith("s") ? name : `${name}s`;
}

/** One title for a step's panels, main panel first, with the others as an "Also:" line. */
export function panelTitle(titles: string[]): { title: string; also: string | null } {
  const names = titles.map((t) => t.trim());
  const [first, second] = names;
  if (names.length === 2 && first && second) {
    const l = LEFT.exec(first) ?? LEFT.exec(second);
    const r = RIGHT.exec(first === l?.[0] ? second : first);
    if (l && r && l[2]?.toLowerCase() === r[2]?.toLowerCase()) {
      // An abbreviation keeps its capitals ("L and R"); a word takes sentence case ("left and right").
      const side = (w: string) => (w.length <= 3 ? w : w.toLowerCase());
      return { title: `${sentence(l[1] ?? "")} and ${side(r[1] ?? "")} ${plural(l[2] ?? "")}`, also: null };
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
