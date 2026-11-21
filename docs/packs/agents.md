<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Writing packs with a coding agent

A coding agent can write a pack the way a person does: learn the format, write files, check them,
fix what `check` reports, and build. It can't skip the checks, because the app runs the same ones
when it installs a pack. The content rules still apply in full: `check` can't tell copied text from
your own words, so you stay responsible for what the agent writes
([content rules](content-rules.md)).

## The MCP server

`involo-pack mcp <folder>` is an MCP server over standard input and output. It's part of the
`involo-pack` command, so there's nothing else to install. Give it the folder the agent should
work in: it reads and writes only inside that folder, refuses paths that lead out of it (absolute
paths, `..`, and symlinks pointing outside), and makes no network requests.

In a client's configuration:

```json
{ "command": "involo-pack", "args": ["mcp", "."] }
```

In Claude Code, from the folder:

```sh
claude mcp add involo -- involo-pack mcp .
```

The server speaks the current MCP revision (2026-07-28) and, for older clients, the revisions
before it that open with an `initialize` handshake.

### Tools

| Tool | What it does |
| --- | --- |
| `format_overview` | Each pack file and what it's for; read it first |
| `file_schema` | One file's JSON Schema |
| `describe` | One file's fields, in words |
| `panel_item_kinds` | Every kind of panel item, with what it is |
| `simbrief_sources` | The SimBrief values a flight field can name |
| `new` | Starts a pack from an example, in a new folder |
| `check` | Checks a pack; each problem with its code, file, line, message and fix hint |
| `explain` | What a problem code means and how to fix it |
| `import_panel` | Turns an SVG panel drawing into a panel file ([panels](panels.md#import-a-panel-drawing)) |
| `build` | Checks the packs and writes the catalog files |

### Resources

- `involo://guide/<page>`: every page of this guide, including the [format reference](reference/index.md).
- `involo://examples/<id>/<file>`: every file of the example packs.

## The loop

1. `new` a pack, and read its `AGENTS.md`.
2. Read `format_overview`, then `describe` each file before writing it.
3. Write a file, then `check`. For each problem, read its `file`, `line` and `hint`, and
   `explain` its code when the hint isn't enough. Repeat until `ok` is true.
4. `build`, and install the file in the app to see it ([publishing](publishing.md)).

The same loop works from a terminal: `involo-pack check --json <pack>` gives the same structured
problems as the `check` tool.

## The starter pack's AGENTS.md

Every pack `involo-pack new` starts has an `AGENTS.md`, for whoever writes it next: how to check
the pack, the MCP server, where this guide is, and the content rules in short. Keep it in the pack;
the app ignores it, and `check` allows it.
