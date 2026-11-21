<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Extending a pack

A pack may build on one parent: another aircraft pack, or a library (`"kind": "library"`) that
holds what several variants share. The child changes the parent by id rather than copying it, so
a fix in the parent reaches every variant. `packs/examples/example-twin-lr` extends
`example-twin`; see it beside this page. The design is in
[decision 0029](../decisions/0029-pack-format-6.md).

## Naming the parent

`extends` in `pack.json` names the parent's id with the versions the child accepts, as a semver
range:

```json
"extends": { "example-twin": ">=0.1.0, <0.2.0" }
```

A library is checked like any pack but is never written as an installable pack: it is only ever a
parent, so it needs no lists, phases or aircraft block.

## Patches

`patches.yaml` (manifest `patches`) changes the parent. Each patch has an `op` and names exactly
one target:

| `op` | What it does | Takes |
| --- | --- | --- |
| `set` | Changes fields of the target; a field set to null is removed | `to`: the fields |
| `replace` | Replaces the target | `with`: one entry or a list |
| `remove` | Removes the target | |
| `insert_before`, `insert_after` | Adds entries next to the target | `with`: one entry or a list |

The target is one of `stage`, `list`, `step`, `panel`, `section` (`panel/section`), `item`
(`panel/section/item`), `flight_field`, `panel_state`, `message`, `glossary_term` or `label` (a
dotted path into `labels.yaml`, with list entries by id). An item can be patched only if it has an
`id` in the parent; give the parent's items ids before a child needs them. Every field is in the
[`patches.yaml` reference](reference/patches.md).

```yaml
patches:
  - op: set
    step: example-twin.before-start.battery
    to:
      check: Battery voltage at least 24 volts.
  - op: insert_after
    item: overhead/fuel/crossfeed
    with:
      id: aux-pump
      kind: toggle_switch
      label: AUX PUMP
      x: 120
      y: 40
      positions: ["OFF", "ON"]
      description: Runs the auxiliary pump.
```

## What the child adds

The child's own lists and panels come after the parent's, and its `labels.yaml` applies over the
parent's words. Any other content file the parent has (phases, controls, flight fields and the
rest) is changed only with patches. Attribution notes and basis tags are the parents' first, then
the child's, each once.

## Building over the parent

`involo-pack check` and `involo-pack build` look for the parent beside the child (in the same
folder of packs), or in a folder given with `--parents`. The built pack records each parent's exact
version (`resolved`) and a `contentHash` of the result, so the app knows what it was built from.
Don't write those two fields yourself; `check` refuses them.

The build fails, with a code saying why, when:

- a patch matches nothing, or two patches name the same target;
- `extends` makes a cycle, or a chain longer than the build allows;
- the parent is of another format, or its version is outside the range;
- a pack has `patches` but extends nothing.
