// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The design system's enforcement (decision 0021): no raw size, color, font size, radius or
// shadow outside the token files, media queries only at the layout breakpoints, and no
// hand-drawn SVG outside the shared drawing renderer.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Every stylesheet and component under src, by its path from src. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../**/*.{svelte,css}", { query: "?raw", import: "default", eager: true }),
  ).map(
    // Paths come relative to this folder: "../lib/x.svelte", or "./tokens.css" beside it.
    ([path, text]) => [path.startsWith("./") ? `theme/${path.slice(2)}` : path.slice(3), text],
  ),
);

/**
 * Every exception to the token rules, in one place, each with its reason. Nothing else in src may
 * use a raw color, font family, font size, size, radius or shadow.
 */
export const EXCEPTIONS = {
  /** Files the rules don't read. */
  files: {
    "theme/tokens.generated.css": "the generated token file: where the values live",
    "theme/tokens.generated.ts": "the generated color sets: where the values live",
  } as Record<string, string>,
  /** The shared drawing renderer (decision 0021): the only files that may draw SVG. Their sizes
   * inside a drawing come from their templates in SVG units (panel-layout.ts); their colors and
   * every size outside the drawing are tokens, like everywhere else. */
  drawings: {
    "lib/PanelSection.svelte": "draws a panel section",
    "lib/PanelSchematic.svelte": "draws a panel schematic",
    "lib/PanelPreview.svelte": "draws a panel preview",
    "lib/PanelNavigator.svelte": "draws the panel navigator",
    "lib/Locator.svelte": "draws the locator map",
    "lib/OverviewMap.svelte": "draws the flight deck overview",
    "lib/ViewDrawing.svelte": "draws the side and seat views",
    "lib/DeckMap.svelte": "draws the flight deck map",
    "lib/FlowFigure.svelte": "draws the flow figure",
  } as Record<string, string>,
  /** Values allowed inside drawing stylesheets: font sizes in SVG units ("11.5px" in Locator),
   * which scale with the drawing, not the screen. */
  svgUnits: /^(font-size: \d+(\.\d+)?px)$/,
};

const DRAWINGS = new Set(Object.keys(EXCEPTIONS.drawings));
const EXEMPT = new Set(Object.keys(EXCEPTIONS.files));
const SVG_UNITS = EXCEPTIONS.svgUnits;

/** CSS named colors (CSS Color 4), which are raw colors too. `transparent` and `currentColor`
 * name no color of their own and are allowed. */
const NAMED_COLORS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );
const NAMED = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join("|")})(?![\\w-])`, "gi");
/** Properties whose value can hold a color. */
const COLORED =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?|stop-color|flood-color|lighting-color)$/;
/** Font-size keywords, which are raw sizes too. */
const SIZE_WORDS =
  /(?<![\w-])(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)(?![\w-])/g;

/** Every script under src, by its path from src. */
const SCRIPTS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../**/*.ts", { query: "?raw", import: "default", eager: true }),
  ).map(([path, text]) => [path.startsWith("./") ? `theme/${path.slice(2)}` : path.slice(3), text]),
);

/** The first width of each layout class above phone (docs/design/tokens.json). */
export const BREAKPOINTS = [600, 900, 1440];

/** The CSS of a file: a stylesheet, or a component's <style> blocks, without comments. `given` reads
 * that text as if it were the file at `path`. */
function css(path: string, given?: string): string {
  // A raw CSS import is empty under Vitest, so stylesheets are read from disk.
  const text =
    given ??
    (path.endsWith(".css")
      ? readFileSync(`${import.meta.dirname}/../${path}`, "utf8")
      : (SOURCES[path] ?? ""));
  const styles = path.endsWith(".svelte")
    ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
    : text;
  return styles.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Raw sizes and colors in some CSS, and media queries off the breakpoints. */
export function violations(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\((min|max)-width:\s*(\d+)px\s*\)/g)) {
    const w = Number(m[2]);
    // min-width sits on a breakpoint; max-width one pixel under it, so the two never overlap.
    const ok = m[1] === "min" ? BREAKPOINTS.includes(w) : BREAKPOINTS.includes(w + 1);
    if (!ok) out.push(`breakpoint ${m[1]}-width ${w}px`);
  }
  const body = source.replace(/@media[^{]*\{/g, "{");
  for (const m of body.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
    const [, prop = "", value = ""] = m;
    if (prop.startsWith("--")) continue;
    for (const raw of value.matchAll(/(?<![\w-])-?\d*\.?\d+(px|rem|em)\b/g)) {
      if (Number.parseFloat(raw[0]) !== 0) out.push(`${prop}: ${raw[0]}`);
    }
    for (const raw of value.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi)) {
      out.push(`${prop}: ${raw[0]}`);
    }
    if (COLORED.test(prop)) for (const raw of value.matchAll(NAMED)) out.push(`${prop}: ${raw[0]}`);
    // A family only through a token (or inherited); a size keyword is a raw size.
    if (prop === "font-family" && !/^\s*(var\(--font-[a-z-]+\)|inherit)\s*$/.test(value))
      out.push(`${prop}: ${value.trim()}`);
    if (
      prop === "font" &&
      !/^\s*inherit\s*$/.test(value) &&
      /["']|(?<![\w-])(?:serif|sans-serif|monospace|system-ui|cursive|fantasy)(?![\w-])/.test(value)
    )
      out.push(`${prop}: ${value.trim()}`);
    if (prop === "font-size" || prop === "font")
      for (const raw of value.matchAll(SIZE_WORDS)) out.push(`${prop}: ${raw[0]}`);
    if (/^font(-weight)?$/.test(prop)) {
      for (const raw of value.matchAll(/(?<![\w.-])(?:[1-9]00|bold|bolder|lighter)(?![\w.-])/g)) {
        out.push(`${prop}: ${raw[0]}`);
      }
    }
  }
  return out;
}

describe("design tokens", () => {
  const all = Object.keys(SOURCES);

  it("finds raw sizes, raw colors and off-scale breakpoints", () => {
    expect(violations("a { padding: 0.6rem; color: #fff; }")).toEqual(["padding: 0.6rem", "color: #fff"]);
    expect(violations("a { font-weight: 600; font: 500 var(--font-size-body) var(--font-sans); }")).toEqual([
      "font-weight: 600",
      "font: 500",
    ]);
    expect(violations("@media (max-width: 760px) { a { gap: var(--space-2); } }")).toEqual([
      "breakpoint max-width 760px",
    ]);
    // A max-width on the breakpoint itself overlaps the min-width query at that width.
    expect(violations("@media (max-width: 600px) { a { gap: var(--space-2); } }")).toEqual([
      "breakpoint max-width 600px",
    ]);
    expect(violations("@media (max-width: 899px) { a { margin: 0; gap: var(--space-2); } }")).toEqual([]);
    // Named colors, font families and font-size keywords are raw values too.
    expect(
      violations("a { color: white; border: var(--border-thin) solid Red; white-space: nowrap; }"),
    ).toEqual(["color: white", "border: Red"]);
    expect(violations("a { background: transparent; color: currentColor; }")).toEqual([]);
    expect(violations("a { font-family: Geist, sans-serif; font-size: larger; }")).toEqual([
      "font-family: Geist, sans-serif",
      "font-size: larger",
    ]);
    expect(violations("a { font-family: var(--font-mono); font: inherit; }")).toEqual([]);
  });

  it("finds a raw value added to any interface file", () => {
    for (const raw of [
      "color: #fff",
      "font-size: 13px",
      "border-radius: 7px",
      "box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2)",
    ]) {
      const component = `<div class="x"></div>\n<style>\n  .x { ${raw}; }\n</style>`;
      expect(violations(css("lib/New.svelte", component)), raw).not.toEqual([]);
    }
  });

  it("lists a reason for every exception", () => {
    for (const reason of [...Object.values(EXCEPTIONS.files), ...Object.values(EXCEPTIONS.drawings)]) {
      expect(reason.length).toBeGreaterThan(10);
    }
    // Every exception names a file that exists.
    for (const f of [...DRAWINGS, "theme/tokens.generated.css"]) expect(Object.keys(SOURCES)).toContain(f);
  });

  it("keeps raw colors out of the interface's scripts too", () => {
    const found = Object.entries(SCRIPTS)
      .filter(([f]) => !EXEMPT.has(f) && !f.endsWith(".test.ts"))
      .flatMap(([f, text]) =>
        [...text.matchAll(/["'`][^"'`\n]*?(#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\()/gi)].map(
          (m) => `${f}: ${m[1]}`,
        ),
      );
    expect(found).toEqual([]);
  });

  it("keeps every size and color in the token files", () => {
    const found = all
      .filter((f) => !EXEMPT.has(f))
      .flatMap((f) =>
        violations(css(f))
          .filter((v) => !(DRAWINGS.has(f) && SVG_UNITS.test(v)))
          .map((v) => `${f}: ${v}`),
      );
    expect(found).toEqual([]);
  });

  it("uses only tokens that exist", () => {
    const tokens = css("theme/tokens.generated.css");
    const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    // Set at runtime by tokens.ts.
    for (const name of ["--scale", "--text-scale"]) defined.add(name);
    // The bars' heights per size, set once on :root in app.css.
    for (const m of css("app.css").matchAll(/(--bar-[a-z-]+):/g)) defined.add(m[1] ?? "");
    const found = all.flatMap((f) => {
      const text = f.endsWith(".css") ? css(f) : (SOURCES[f] ?? "");
      const local = new Set([...text.matchAll(/(--[a-z0-9-]+)(?:\s*:|=)/g)].map((m) => m[1]));
      return [...text.matchAll(/var\((--[a-z0-9-]+)/g)]
        .map((m) => m[1] ?? "")
        .filter((name) => !defined.has(name) && !local.has(name))
        .map((name) => `${f}: ${name}`);
    });
    expect([...new Set(found)]).toEqual([]);
  });

  it("never lists a shadow token that can be none beside another shadow", () => {
    // "inset … , none" is invalid CSS, so the browser drops the whole box-shadow (the dark
    // segment control lost its accent ring this way).
    const none = [...css("theme/tokens.generated.css").matchAll(/(--[a-z0-9-]+):\s*none;/g)].map(
      (m) => m[1] ?? "",
    );
    const found = all.flatMap((f) =>
      [...css(f).matchAll(/box-shadow:([^;]*);/g)]
        .filter((m) => (m[1] ?? "").includes(",") && none.some((n) => m[1]?.includes(`var(${n})`)))
        .map(() => f),
    );
    expect(none.length).toBeGreaterThan(0);
    expect(found).toEqual([]);
  });

  it("draws SVG only in the drawing renderer", () => {
    const found = all.filter(
      (f) => f.endsWith(".svelte") && !DRAWINGS.has(f) && /<svg[\s>]/.test(SOURCES[f] ?? ""),
    );
    expect(found).toEqual([]);
  });

  it("puts no raw sizes or colors in style attributes", () => {
    const found = all
      .filter((f) => f.endsWith(".svelte") && !DRAWINGS.has(f))
      .flatMap((f) =>
        [...(SOURCES[f] ?? "").matchAll(/\sstyle="([^"]*)"/g)].flatMap((m) =>
          violations(`a { ${m[1]}; }`).map((v) => `${f}: ${v}`),
        ),
      );
    expect(found).toEqual([]);
  });
});
