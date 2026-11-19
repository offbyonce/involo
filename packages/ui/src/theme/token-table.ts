// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The rows of the token table (token-table.md), worked out from docs/design/tokens.json: every
// color with its dark and light value, then every other token with its value. The table is
// committed and checked against these rows, so a token changes only when a pull request changes
// the table too, on purpose.

type Json = { [key: string]: unknown };

/** One row: the token's name, then its value in dark and light (one value when both are the same). */
export type TokenRow = [name: string, dark: string, light: string | null];

const own = (o: Json) => Object.entries(o).filter(([k]) => !k.startsWith("$"));

/** Every leaf under `o`, as dotted names. */
function leaves(prefix: string, o: Json): [string, string][] {
  return own(o).flatMap(([k, v]) =>
    v !== null && typeof v === "object"
      ? leaves(`${prefix}.${k}`, v as Json)
      : [[`${prefix}.${k}`, String(v)]],
  );
}

export function tokenRows(tokens: Json): TokenRow[] {
  const rows: TokenRow[] = [];
  for (const set of ["color", "panel"]) {
    const both = tokens[set] as Json;
    const dark = Object.fromEntries(leaves(set, both.dark as Json));
    const light = Object.fromEntries(leaves(set, both.light as Json));
    for (const name of [...new Set([...Object.keys(dark), ...Object.keys(light)])]) {
      rows.push([name, dark[name] ?? "", light[name] ?? ""]);
    }
  }
  for (const [k, v] of own(tokens)) {
    if (k === "color" || k === "panel") continue;
    if (v !== null && typeof v === "object")
      for (const [name, value] of leaves(k, v as Json)) rows.push([name, value, null]);
  }
  return rows;
}

/** The table as Markdown rows: `| name | dark | light |`, or `| name | value | |`. */
export function tableLines(rows: TokenRow[]): string[] {
  const cell = (s: string) => s.replaceAll("|", "\\|");
  return rows.map(
    ([name, dark, light]) => `| \`${name}\` | ${cell(dark)} | ${light === null ? "" : cell(light)} |`,
  );
}

/** The rows a committed table holds (its lines that start with a token name in backticks). */
export function readTable(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^\| `([^`]+)` \|/.exec(line);
    if (m?.[1]) out.set(m[1], line.trimEnd());
  }
  return out;
}
