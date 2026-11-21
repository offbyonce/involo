<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Panels

A panel file (`panels/<name>.yaml`, listed in `pack.json`'s `panels`) is a drawing the app makes
from data: the panel's sections, and the controls in each, where they sit. The app draws every
control itself, in its own style, at its standard size; the pack says what each control is and
where it is. Every field is in the [`panels/<name>.yaml` reference](reference/panels.md).

## Placing things

A panel has a `width` and `height` in panel units, which you choose; the app scales the drawing to
fit. It has no title of its own: the app names what it shows by its sections (their `title`, or
`name`) and by the zones in `controls.yaml`. Each section is a box inside it: `x` and `y` are its top-left corner from the panel's
top-left, then its `width` and `height`. Each item's `x` and `y` are the item's center, from its
section's top-left corner. Only a display unit or a readout takes a `width` and `height` of its
own; every other kind is drawn at its one standard size.

A panel or a section may give an `outline` in place of its rectangle: three points or more, inside
its box, holding everything drawn in it (a section's items, a panel's sections). A section's
outline is in the section's units.

```yaml
id: overhead
width: 400
height: 200
sections:
  - id: fuel
    title: Fuel
    name: Fuel panel
    x: 200
    y: 10
    width: 190
    height: 90
    items:
      - id: crossfeed
        kind: toggle_switch
        label: CROSSFEED
        x: 60
        y: 40
        controls: [crossfeed]
        positions: ["OFF", "ON"]
        rest: "OFF"
        description: Lets one tank feed both engines.
```

`controls` ties an item to the controls in `controls.yaml` that steps name, so a step about the
crossfeed shows this switch. `positions` are what it can be set to, in order, written as the
placard reads, in capitals; `rest` is where it sits when the airplane is cold and dark.

## Item kinds

Besides toggle switches, selectors, push buttons, lights, gauges, readouts, display units, levers
and handles, an item may be:

- a `push_pull_knob`: two positions, pushed in first;
- a `rocker`: two positions, the top end first;
- a `legend_pushbutton`: its `positions`, and one or two `legends`, each with its `text`, its
  `light` role and the positions it is `lit_in`. A legend without `lit_in` is lit by the airplane,
  not the button, and shows lit when a step expects the button's light on;
- a `keypad`: its keys as `positions`, `columns` to a row. A step has one target per key it
  presses.

A light names its `color` as a role (`amber`, `red`, `green`, `blue`, `white`), never a color
value: each theme draws each role in its own lit color. `involo-pack describe panels/x.yaml` and
the MCP server's `panel_item_kinds` tool list every kind with what it is. See the example packs'
panels, such as `packs/examples/example-sidestick/panels/glareshield.yaml`.

## Import a panel drawing

Placing controls by typed coordinates is slow. `involo-pack import-panel` turns a panel you drew
in any vector drawing tool (Inkscape, Illustrator, Figma and others) into a panel file to finish.
The pack still never holds the drawing.

```sh
involo-pack import-panel overhead.svg --out my-twin/panels/overhead.yaml
```

Options: `--id` (the panel id; the drawing's file name otherwise), `--width` (how many panel units
wide the panel is; one drawing unit is one panel unit otherwise) and `--out` (the file to write,
never over one that is there; without it, the file is printed).

### Naming the groups

Name the groups (or single shapes) in your drawing tool's layers panel:

| Name | Becomes |
| --- | --- |
| `section:<id>`, such as `section:fuel` | A section, at the box around what the group draws |
| `<kind>:<LABEL>`, such as `toggle_switch:FUEL PUMP L` | A control of that kind, at the center of what the group draws |
| `outline` | The panel's outline; inside a section group, that section's outline |

A control belongs to the section group it's in, or else to the section it's drawn over. Group
transforms, nested groups, symbols (`<use>`) and every path shape are applied. The name is read
from the tool's layer name (`inkscape:label`, `data-name`) or the element's id, with the escapes
some tools write into ids (`_x3A_` for a colon, `_` for a space) decoded. Hidden layers and
everything without a name in this form are ignored.

### What it fills in, and what you write

The importer writes each section's id, title, box and outline, and each control's id (from its
label: `FUEL PUMP L` becomes `fuel-pump-l`), kind, label and center, rounded to a tenth. A display
unit or readout also gets its drawn `width` and `height`. You write, for each control, its
`positions` (and `rest`), its `controls` and its `description`; the file says so at the top, and
leaves `positions: []` and `description: ""` to fill. Then list the file in `pack.json`'s `panels`
and run `involo-pack check`.

### Values read from the drawing

Two kinds of value are read from what you drew, and each is marked in the file with
`# from the drawing; check it`:

- a light's `color`: the light role nearest the light's fill color;
- a legend pushbutton's `legends`: the top two texts drawn in it, each lit in its text's color.

When the drawing has no color the importer can read, it writes `white`, marked
`# not readable in the drawing; set it`, and warns.

### Warnings

The importer warns, naming the group by its id, and still writes the rest, when a name uses an
unknown kind (the warning lists the kinds), a group in a section has no name in this form, a
control is in no section, a control or section draws nothing, a section has no controls, or a
section id had to be rewritten or was used twice.

### Limits

A drawing is read as untrusted. It is refused, and nothing is written, when it:

- is over 4 MB;
- is nested more than 64 levels deep;
- links outside itself: an `href` that isn't `#…` or a `data:` URI, a `url(…)` to another file or
  site, an `@import`, or an external entity;
- holds a script: a `<script>` element or an `on…` attribute.

`<use>` links are followed at most 8 deep and 10,000 times in all, so a drawing whose links
multiply can't make it hang.
