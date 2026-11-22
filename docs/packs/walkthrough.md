<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Walkthrough: your first pack

This page takes you from an empty folder to a pack installed in the app, then through an update
that keeps a pilot's ticks. It uses an invented aircraft, "My Twin", started from the example
packs. Read the [content rules](content-rules.md) before you write a real aircraft.

## 1. Get the command

Download `involo-pack` for Windows, macOS or Linux from a release of the Involo repository,
<https://github.com/offbyonce/involo> (the `involo-pack-SHA256SUMS.txt` beside them lets you check
the download), or build it with Rust:

```sh
cargo install --locked --git https://github.com/offbyonce/involo involo-pack-cli
```

`--locked` builds with the exact versions the app is built with, from the repository's
`Cargo.lock`; without it, Cargo may pick newer versions of the libraries the command uses.

Check it runs:

```sh
involo-pack explain P0205
```

## 2. Start a pack

```sh
involo-pack new my-twin --name "My Twin"
```

```
created my-twin from example-twin (20 files): pack id `my-twin`, name "My Twin"
next: change the aircraft in pack.json and the content in each file, then run `involo-pack check my-twin`
```

The folder's name is the pack id: lower-case letters, digits, dots and dashes. `new` copies the
`example-twin` example (a Boeing-style twin); `--from example-sidestick` starts from the
Airbus-style one instead. You get `pack.json`, a YAML file for each part of the content, the lists
in `lists/`, the panels in `panels/`, and an `AGENTS.md` for whoever writes the pack next.
[How a pack fits together](concepts.md) says what each file is for.

Check it before changing anything:

```sh
involo-pack check my-twin
```

```
ok   my-twin 0.1.0 (4 checklists, 19 steps)
```

## 3. Make it your aircraft

Open `pack.json`. Change the `aircraft` block to your aircraft: its `family` and `name`, its ICAO
type codes in `icaoTypes`, the `simulator` and the add-on's `developer`. Leave `schemaVersion` and
`engine` as they are.

The rest of the manifest is about your pack, not the example's:

- `license` is the license you publish your pack under, as an SPDX identifier. The starter keeps
  the example's, `CC-BY-NC-SA-4.0`, which packs in the Involo catalog use; choose your own for a
  pack you keep elsewhere.
- `attribution` is the line the app shows for the pack: replace the example's note with yours.
- `basisTags` lists the kinds of material your lists may be checked against. The starter's
  `invented-example` marks the example's invented content: replace it with the kinds you check
  against (see [the basis of each list](content-rules.md#the-basis-of-each-list)), here and in
  each list's `basis`.

The pack's files are yours: `new` leaves out the example's copyright lines and its notes that
the content is invented.

Every file says what it takes: `involo-pack describe pack.json` lists the manifest's fields, and
the [format reference](reference/index.md) has a page for each file. With the schemas in an
editor that reads them, you also get autocomplete as you type.

## 4. Write a step

Add a step to the end of `lists/before-start.yaml`:

```yaml
  - id: my-twin.before-start.parking-brake
    number: 6
    text: Parking brake
    expect: SET
    controls: [parking-brake]
```

A step's id is `<pack id>.<phase>.<short name>` and never changes once published. `expect` is the
value the pilot should see, never just "set". `controls` names a control from `controls.yaml`; the
starter already has `parking-brake`. Check again:

```sh
involo-pack check my-twin
```

```
FAIL my-twin 0.1.0 (4 checklists, 20 steps)
  error P0410: lists/before-start.yaml:75: my-twin.before-start.parking-brake: the step's controls are drawn, but it has no `targets`
    hint: Add `targets`. `involo-pack suggest-targets <pack>` drafts them from the wording.
```

Every problem has a code, the file and line, and a hint. `involo-pack explain P0410` says more:
the parking brake is drawn on the pedestal panel, so the step names which item it sets. Let the
command draft the targets from the step's wording:

```sh
involo-pack suggest-targets my-twin
```

It prints, for each step, the targets it read, and flags anything it wasn't sure of. For this
step it finds the lever and its light. Add them under the step:

```yaml
    targets:
      - at: "pedestal/brakes/PARKING BRAKE/1"
        set: SET
      - at: "pedestal/brakes/PARK BRAKE/1"
        light: "on"
```

```sh
involo-pack check my-twin
```

```
ok   my-twin 0.1.0 (4 checklists, 20 steps)
```

Work this way through the pack: change a file, `check`, read each problem's hint, and `explain`
its code when you need more. [Panels](panels.md) shows how to draw your own panels, by hand or
from a drawing.

## 5. Build it

```sh
involo-pack build my-twin dist
```

```
built dist/my-twin-0.1.0.involo-pack (20667 bytes)
wrote dist/index.json (1 packs)
```

`dist/my-twin-0.1.0.involo-pack` is the whole pack in one file. (On Windows, the command prints
paths with `\`: `dist\my-twin-0.1.0.involo-pack`.)

## 6. Install it

Open the Involo app (or run `just dev` in a clone of the repository). Open **Packs** and choose
**Add a pack file…**, then pick `dist/my-twin-0.1.0.involo-pack`. The app checks the pack again,
adds it and opens it: My Twin is the pack in use, and your parking brake step is the sixth in
Before start. On **Packs**, it's marked "Not from the Involo catalog", because it came from a file.

If the app refuses the file, it lists every reason; fix them, `check`, and build again.
[Installing, updating and publishing](publishing.md) says what the app checks.

## 7. Update it

Say you rename the step's id to `my-twin.before-start.park-brake`. A pilot who ticked it would
lose the tick, so add an alias from the old id in `aliases.yaml`:

```yaml
  - {kind: step, from: my-twin.before-start.parking-brake, to: my-twin.before-start.park-brake}
```

Raise `version` in `pack.json` to `0.2.0`, then `check` and `build` again. Tick the parking brake
step in the app, then add the new file in **Packs** the same way. The app updates the pack and
says so ("My Twin updated to version 0.2.0"), with what changed, and the tick is still there, now
on the renamed step.

## Next

- [Content rules](content-rules.md), before you write a real aircraft.
- [How a pack fits together](concepts.md), [Panels](panels.md) and
  [Extending a pack](extending.md), as you go further.
- [Publishing](publishing.md#publishing-to-the-catalog), to get your pack into the Involo catalog.
- [Writing packs with a coding agent](agents.md), to have an agent do the typing.
