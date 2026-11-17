<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0029: Pack format 6, the first public format

Date: 2026-11-17. Status: accepted. Extends [0002](0002-pack-format.md) and
[0014](0014-pack-format-3.md). Supersedes the fixed `fill` list and the step id prefix rule in
[0007](0007-pack-content-model.md).

## Context
With packs installed from a catalog or a file (0028), other people will write them, and the
format becomes a promise. The 2026-11-17 design review found what a 737 pack can say that a 777
or Airbus pack cannot, and what the interface still knows about the 737: flight fields, Start
page options, list names, crew roles and several word lists.

## Decision
**Compatibility.** Format 6 is the first public format. An app reads every format from 6 up to
its own and refuses a newer one with "Needs a newer Involo". From 6 on, a later format only adds:
no field is removed or changes meaning. Formats 4 and 5 are not read; the two packs in the
repository move to 6.

**Manifest** (`pack.json`):
- `aircraft`: `family`, `name`, `icaoTypes`, `simulator`, `developer`. Required for aircraft packs.
- `extends`: one parent pack and a version range. `kind: library` packs can be extended but not
  installed on their own.

**Ids.**
- A step id is `<prefix>.<phase>.<short-name>`, where the prefix is the pack's own id or an id it
  extends. Ids are opaque, unique in the built pack and never change once published.
- Stages get a required `id`. Reference phases get a `group` (`memory`, `quick`, `procedures`, or
  a group the pack's labels define) instead of being read by position.
- Panel items get an optional `id`, unique in their section. A target may point at
  `panel/section/#id` as well as by position.
- `positions` is a list.

**Names.** The YAML pack files and their fields are snake_case (`expect_when`, `ask_in`), as
authors write them; the `pack.json` manifest stays camelCase (`schemaVersion`, `icaoTypes`), as
today; the app's own saved data stays camelCase. Bindings convert at the boundary, so the
interface never mixes the two in one expression. `start-states.yaml` becomes `panel-states.yaml`
(`panel_states`), matching what the screen calls it.

**Words the interface shows** (`labels.yaml`, all optional, today's words as defaults): list
kinds, list methods, crew roles, the reference area's title and groups, the seat-view title, the
panel-state picker, position synonyms, Find examples, glossary exceptions and basis tags with
their labels. The app's own words (menus, buttons, the view names, Full, Essentials, Detailed and
Simple) stay app-wide; a pack with no quick steps hides Essentials. The two views are renamed
**List** (every step) and **Step by step** (one step at a time), replacing Checklist and Flow,
because both old words name kinds of list in packs and "flow" means a specific procedure on
Airbus types. Saved settings keep their values; only the words change.

**Who and how.** A list may set `method`: `do`, `read_and_do`, `challenge_response` or
`from_memory`. A step may set `role` and, for a challenge, `respond`, each an id from the pack's
roles. All optional.

**Flight fields** (`flight.yaml`). The pack defines its own fields: id, label, description, kind
(number with a unit kind, text or choice), ranges per unit, choices, where the value goes in the
aircraft, the page and group it shows in, where else it appears (`show_in`: the flight strip, the
arrival box), how it is shown (`display`: a scale such as thousands, and rounding up, down or to
the nearest step), and an optional SimBrief source. SimBrief sources come from the app's list of
plan values, because that list describes SimBrief, not an aircraft. `fill`,
`hint` and the CDU name these fields; `pack check` rejects unknown ones. Saved values keep their
string keys, so saved flights are unaffected.

**Start page options.** `ask_in` may name `start`, with a control style (cards or a row).

**Panels.** New item kinds: `push_pull_knob`, `legend_pushbutton` (legends per state), `rocker`
and `keypad`, and panel outlines other than rectangles. The app draws every kind with its own
tokens; packs name states and light roles, never colors. Every drawn control is focusable and
named.

**Seat views.** The pack's labels list its `seats` (for example `left` and `right`), and each role
may name the seat it sits in (`capt` in `left`, `fo` in `right`); duty roles such as `pf` and `pm`
name none. The overview's `views` may hold a `seat` frame for each seat, keyed by seat id, instead
of one captain-seat frame. "Where is this?" shows the frame for the seat of the step's `role` if it
has one, then the pilot's chosen seat (a setting), then the first frame. A pack with one seat frame
keeps working.

**Messages** (`messages.yaml`): alert-system text (EICAS or ECAM) with a level (`warning`,
`caution`, `advisory`, `memo`, `status`), what it means and the list that deals with it.

**Extending a pack.** A child names one parent. Its `patches` change the parent by id: `set`,
`replace`, `remove`, `insert_before` and `insert_after`, for anything with an id: stages, lists,
steps, panels, panel sections, panel items, flight fields, messages, panel states, glossary terms
and labels. A panel item without an id cannot be patched; a child that needs to change one asks
for the id to be added to the parent. `pack build` resolves the parent and writes one flat pack that records the exact
parent version and a content hash. A conflict or a patch that matches nothing is a build error. A
parent update reaches a child only when the child is rebuilt and released.

## Consequences
- Validation, JSON Schemas, TypeScript bindings and the pack snapshots cover every new field.
- The Flight, Start, How, References, Practice and Flight deck pages read these fields and lose
  their 737 and iFly code. A CI pack with a different stage structure, roles, panels and messages
  fails the build if any of it returns (0030).
- The iFly pack moves to 6: stage ids, a positions list, an aircraft block, its flight fields and
  labels. Its step ids do not change.
- Once a second 737 pack exists, the shared parts can move to a `lib.boeing-737` library that both
  extend, without changing any published step id.
