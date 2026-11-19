// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Packs are data only, and their text is always shown as text (decision 0028): a pack from a file
// can say anything. `{@html}` renders markup, so it may only render the app's own icons and marks,
// the SVG files under icons/ that a component imports as text.

import { describe, expect, it } from "vitest";

/** Every component's source. */
const SOURCES = import.meta.glob("./**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Names a component imports from the app's own SVG files. */
function iconImports(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+"([^"]+)"/g))
    if (/^\.\.?\/(?:.*\/)?icons\/.+\.svg\?raw$/.test(m[2] as string)) names.add(m[1] as string);
  return names;
}

/** Names of objects whose every value is one of the app's icons (Icon.svelte's `ICONS`). */
function iconTables(source: string, icons: Set<string>): Set<string> {
  const tables = new Set<string>();
  for (const m of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^}]*)\}/g)) {
    const values = (m[2] as string)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split(":").pop()?.trim() ?? "");
    if (values.length > 0 && values.every((v) => icons.has(v))) tables.add(m[1] as string);
  }
  return tables;
}

/** Each `{@html}` in a component that renders anything but the app's own icons. */
export function htmlProblems(source: string): string[] {
  const icons = iconImports(source);
  const tables = iconTables(source, icons);
  const problems: string[] = [];
  for (const m of source.matchAll(/\{@html\s+([^}]*)\}/g)) {
    const expr = (m[1] as string).trim();
    const plain = /^[A-Za-z_$][\w$]*$/.test(expr) && icons.has(expr);
    const table = /^([A-Za-z_$][\w$]*)\[[A-Za-z_$][\w$]*\]$/.exec(expr);
    if (!plain && !(table && tables.has(table[1] as string))) problems.push(expr);
  }
  return problems;
}

describe("data-only packs", () => {
  it("renders markup only from the app's own icons and marks", () => {
    const found = Object.entries(SOURCES).flatMap(([path, source]) =>
      htmlProblems(source).map((expr) => `${path}: {@html ${expr}}`),
    );
    expect(found).toEqual([]);
    // The check sees the app's own uses.
    const uses = Object.values(SOURCES).filter((s) => s.includes("{@html")).length;
    expect(uses).toBeGreaterThanOrEqual(5);
  });

  it("catches markup from anywhere else", () => {
    const icon = 'import mark from "../icons/brand/header-mark.svg?raw";';
    expect(htmlProblems(`${icon}\n{@html mark}`)).toEqual([]);
    expect(htmlProblems(`${icon}\n{@html step.note}`)).toEqual(["step.note"]);
    expect(htmlProblems(`${icon}\n{@html mark + step.note}`)).toEqual(["mark + step.note"]);
    expect(htmlProblems('import text from "./notes.md?raw";\n{@html text}')).toEqual(["text"]);
    expect(htmlProblems(`${icon}\nconst T = { a: mark, b: pack };\n{@html T[name]}`)).toEqual(["T[name]"]);
  });
});
