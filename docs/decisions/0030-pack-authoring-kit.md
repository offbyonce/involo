<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0030: A pack authoring kit for people and agents

Date: 2026-11-17. Status: accepted.

## Context
Packs only help if people can write them. The format has JSON Schemas for every file and a `pack`
command that checks and builds, but no guide, no starting point and no way for a coding agent to
learn the format and check its work as it writes.

## Decision
- **A guide** in `docs/packs/`: what a pack is, a walkthrough from an empty folder to an installed
  pack, the content rules (our own words, no copied manuals, basis tags) and how to publish to
  the catalog. The **format reference is generated from the JSON Schemas** (`just pack-docs`) and
  CI fails if it is out of date.
- **Example packs**, invented aircraft only, in `packs/examples/`: one with Boeing-style
  conventions, one with Airbus-style conventions (roles, list methods, legend pushbuttons,
  alert messages, different stages), and a small variant that `extends` the first. All three are
  built and checked in CI, and the interface tests run against them, so the app cannot quietly
  depend on one aircraft.
- **The `involo-pack` command** (today's `pack-cli`): `new` (a starter pack from an example),
  `check`, `build`, `explain <code>` (what an error means and how to fix it) and `describe <file>`
  (the fields one pack file takes; the existing `schema <dir>`, which writes every JSON Schema,
  keeps its name). Errors carry a stable code, the file and line, and a fix hint. Released as
  binaries for Windows, macOS and Linux, and with `cargo install`.
- **Crate names.** Every crate is renamed with an `involo-` prefix, because generic names such
  as `pack` are already taken on crates.io, which `cargo install` uses. The pack library is
  `involo-pack`; the command's crate is `involo-pack-cli` and builds a binary named `involo-pack`
  (`cargo install involo-pack-cli`).
- **A panel importer**: `involo-pack import-panel <file.svg>` turns a panel drawn in any vector
  drawing tool into a panel file. Groups named by a simple rule (`toggle_switch:FUEL PUMP L`,
  `section:fuel`) become sections and controls at their drawn positions; everything else in the
  drawing is ignored. The output is ordinary panel YAML for the author to finish (positions,
  resting positions, descriptions) and check. Packs still never contain SVG.
- **An MCP server**: `involo-pack mcp`, over standard input and output. Tools: the format
  overview, a file's schema, the panel item kinds, the SimBrief sources, `new`, `check` and
  `build` on a folder (with structured errors), `import-panel`, `describe` and `explain`. Resources: the guide and the
  example packs. It reads and writes only inside the pack folder it is given, and makes no
  network requests.
- **A starter pack includes an `AGENTS.md`** that points an agent at the MCP server, the guide and
  the content rules.

## Consequences
- An agent can write a pack the way a person does: read the format, write files, check, fix,
  build. It cannot skip the checks, because the app runs the same ones on install (0028).
- The content rules are explained, not enforced: `check` cannot tell copied text from our own
  words. Catalog packs are reviewed by people; packs from a file are labeled (0028).
- Each new format field needs its schema, its generated reference entry, a use in an example
  pack, and its MCP tool output kept in step.
