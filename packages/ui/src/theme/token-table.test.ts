// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The committed token table (token-table.md) holds every token in docs/design/tokens.json with its
// value, in both themes: a token's value changes only when a pull request changes the table too.

import { describe, expect, it } from "vitest";
import tokens from "../../../../docs/design/tokens.json";
import { readTable, tableLines, tokenRows } from "./token-table";
import table from "./token-table.md?raw";

/** What differs between the committed table and the token file, one line per token. */
function differences(text: string, source: Parameters<typeof tokenRows>[0]): string[] {
  const committed = readTable(text);
  const rows = tokenRows(source);
  const wanted = new Map(rows.map((r, i) => [r[0], tableLines(rows)[i] ?? ""]));
  const out: string[] = [];
  for (const [name, line] of wanted) {
    const has = committed.get(name);
    if (has === undefined) out.push(`${name} is missing from token-table.md; add: ${line}`);
    else if (has !== line)
      out.push(`${name} changed: token-table.md has "${has}", tokens.json gives "${line}"`);
  }
  for (const name of committed.keys())
    if (!wanted.has(name)) out.push(`${name} is in token-table.md but not in tokens.json`);
  return out;
}

describe("the token table", () => {
  it("lists every token with the value tokens.json gives it", () => {
    expect(differences(table, tokens as never)).toEqual([]);
  });

  it("fails, naming the token, when a value changes without the table", () => {
    const changed = structuredClone(tokens) as {
      color: { light: Record<string, string> };
      radius: Record<string, number>;
    };
    changed.color.light.accent = "#000000";
    changed.radius.control = 11;
    const found = differences(table, changed as never);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(
      /^color\.accent changed: token-table\.md has .*#2563eb.*tokens\.json gives .*#000000/,
    );
    expect(found[1]).toMatch(/^radius\.control changed/);
  });
});
