<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Writing Involo packs

Involo is a free training app for flight simulator pilots. Everything it knows about an aircraft
(its checklists and flows, panels, flight values, systems notes) comes from a **pack**: a folder of
data files. The app's code never names an aircraft, so a new aircraft is a new pack, written by
anyone, with no change to the app. The app never connects to the simulator.

This guide is for anyone writing a pack: pilots who know an aircraft, contributors to the
project, and coding agents working for either.

## A pack in one paragraph

A pack is a folder holding `pack.json` (the manifest: what the pack is, which aircraft, and which
files it has) and YAML files, one for each part of the content. The `involo-pack` command starts a
pack from an example, checks it with the same checks the app runs, explains each problem, and builds
it into one `.involo-pack` file that the app installs. Packs are data only: no code, no images, no
copied text.

## Pages

| Page | Read it when |
| --- | --- |
| [Walkthrough](walkthrough.md) | You're writing your first pack: from an empty folder to a pack installed in the app |
| [Content rules](content-rules.md) | Always, before writing content: facts in your own words, no copied manuals, the basis of each list |
| [How a pack fits together](concepts.md) | You know the basics and want to see how the files relate |
| [Panels](panels.md) | You're drawing panels, by hand or from a drawing with `import-panel` |
| [Extending a pack](extending.md) | You're writing a variant of an aircraft, or a library several packs share |
| [Installing, updating and publishing](publishing.md) | You want pilots to use your pack, or to update it without losing their flights |
| [Writing packs with a coding agent](agents.md) | You're using an agent, through the MCP server |
| [Limits](limits.md) | You want to know how big a pack can be |
| [Format reference](reference/index.md) | You need every field of a file, or what a problem code means (generated from the code) |

## The tools

- **`involo-pack`**, the command: `new`, `check`, `explain`, `describe`, `import-panel`, `build`
  and `mcp`. Download it for Windows, macOS or Linux from a release of the Involo repository, or
  install it with `cargo install --git <the Involo repository> involo-pack-cli`.
- **JSON Schemas** in `schemas/`, which give an editor autocomplete and checking as you type. The
  example packs show how to point a file at its schema.
- **The example packs** in `packs/examples`: invented aircraft that use every part of the format.
  `example-twin` and `example-sidestick` are two styles of aircraft; `example-twin-lr` extends the
  first.
