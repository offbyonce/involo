<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# How a pack fits together

This page explains how the parts of a pack relate, once you've made your first one with the
[walkthrough](walkthrough.md). For every field each file takes, see the
[format reference](reference/index.md); `involo-pack describe <file>` prints the same.

## The files

`pack.json` is the manifest: the pack's id, name, version, format (`schemaVersion`), the aircraft
it covers, its license and attribution, the basis tags its lists may use, and the path of every
data file. Only the files `pack.json` names are read; anything else in the folder is ignored,
except that images and PDFs are refused ([content rules](content-rules.md)).

The data files are YAML. Each holds one part of the content:

| File | What it holds |
| --- | --- |
| `lists/*.yaml` | The checklists, flows and non-normal procedures: ordered steps |
| `phases.yaml` | The flight's stages and phases, the options a pilot answers, and the Start page |
| `controls.yaml` | The controls steps refer to, the flight deck zones, and the overview map |
| `panels/*.yaml` | The panel drawings: sections and the controls in them ([panels](panels.md)) |
| `lights.yaml` | What each annunciator light means, when it comes on and what to do |
| `flight.yaml` | The flight's values (fields) and the Flight pages |
| `cdu.yaml` | CDU walkthroughs, screen by screen |
| `notes.yaml` | The Explain and How notes on steps |
| `briefings.yaml` | Briefings, item by item |
| `faults.yaml`, `glossary.yaml`, `messages.yaml` | Faults, glossary terms, and the alert display's messages |
| `panel-states.yaml` | Panel states a pilot can start from, such as cold and dark |
| `labels.yaml` | The aircraft's own words for parts of the interface |
| `aliases.yaml` | Old step ids and values, so an update keeps a pilot's flight |
| `patches.yaml` | Changes to a parent pack ([extending](extending.md)) |

An aircraft pack needs `pack.json`, at least one list and `phases.yaml`; every other file is
optional, and the app shows only what a pack has. A library ([extending](extending.md)) is only
ever a parent, so it needs neither.

## Field names

The YAML files and their fields are snake_case (`expect_when`, `ask_in`), as authors write them.
The manifest, `pack.json`, is camelCase (`schemaVersion`), as is the app's own saved data. The app
hands pack content to its interface with camelCase names, so the interface reads one case
([decision 0029](../decisions/0029-pack-format-6.md)).

## Ids

**Step ids** are `<prefix>.<phase>.<short-name>`, where the prefix is the pack's own id or the id
of the pack it extends, for example `my-twin.preflight.irs-mode`. An id never changes once
published, even if the step is reworded or moved, and a removed step's id is retired and never
reused: pilots' saved flights refer to steps by id. When you do rename or move one, add an alias
(see [publishing](publishing.md#updating-a-pack)).

Stages have an `id` too, reference phases have a `group` (`memory`, `quick` or `procedures`), and
a panel item may have an `id`, so a step target or a light note can name it as
`panel/section/#id` ([decision 0029](../decisions/0029-pack-format-6.md)).

## Flight fields and the Flight pages

The values steps fill in (`fill`, `hint`, CDU text) are fields the pack defines in `flight.yaml`,
listed in `pack.json` as `flight`. Each has its label, kind (number, text or choice), unit and
ranges, where it goes in the aircraft, where else it shows (the flight strip, the Arrival data
box), how a plan's number is stored (`display`), and the SimBrief values that fill it. The SimBrief
sources are the app's list (see the [`flight.yaml` reference](reference/flight.md)); a pack picks
among them but can't add one.

The Flight pages are built from the same file. An optional `pages` list gives each page's title,
sub-line and cards (with a card's row order, a unit toggle, or the notes from ATC), and each field
may add how its box takes input (`input`), how its value reads (`show`), a range's own words
(`message`), a second box (`with`), a two-choice toggle (`toggle`), read-only copies on other pages
(`also`), `read_only` with the `phase` that uses it, an option whose suggestion it shows
(`suggested_by`), `needed`, and the side panel's words (`ofp`). Every one is optional: a field with
only an id, label and kind still gets a row. The pack gives content and grouping only; the app
decides how it looks.

An option is asked on a Flight page with `ask_in: [flight:approach]`. The Overview's "This flight"
card is `flight.yaml`'s optional `overview`: rows with a `label`, the `page` they link to, and
`value` and `description` parts written with `{field}`, `{field:grouped}` (thousands grouped) and
`{unit}` (the flight's unit), plus an `empty` description. A part shows when any field it names
has a value. Without `overview`, the card has one row per Flight page with fields. The Weather page
finds the altimeter settings by their SimBrief source (`origin_altimeter`,
`destination_altimeter`) and their `unit`.

## The Start page

An option whose `ask_in` names `start` shows on the Start page with its `start` block: a `style`
(`row`, `cards`, or `toggle` with `on`, the value its on position sets, for an option of two
values), and optionally its own `title`, `description` and a `link` to a phase. The page's order
is `phases.yaml`'s `start_page`: option ids, and `panel_state` for the panel-state picker, whose
words are the labels' `panel_states`. Without it, the options come in file order, then the picker.

## Alert messages

An aircraft with an alert display (EICAS or ECAM) lists its messages in `messages.yaml` (manifest
`messages`): each with an `id`, its `text` as the display shows it, a `level` (`warning`,
`caution`, `advisory`, `memo`, `status`), what it means (`meaning`), the `list` that deals with it
or, without one, why none is needed (`no_list`), and the `steps` that deal with it. A pack never
sets their colors. Without `messages.yaml`, the app shows no Alert messages tab and no message
rows. See `packs/examples/example-sidestick/messages.yaml`.

## Step timers

A step may have a `timer`: a wait the pilot shouldn't cut short, such as an engine warm-up, with
its `label` and `seconds`. It starts by itself: from its own step's tick, or, with `auto_start`,
from the tick of one of the steps it names, the `earliest` or the `latest` as `pick` says. Its
step shows a chip under its value: before it starts (on the current step, with the steps whose
tick starts it), while it runs, paused, and finished, with Pause or Resume and Restart once it has
started. A step whose timer has started stays out of the folded done steps, and a bar shows every
timer running or paused. Settings › Timer chime plays a chime at zero. The words under a running
timer say what the step that started it set, from that step's `targets` ("set NAV"), or that it
was ticked. The `note` is for whoever writes the pack; the app doesn't show it.

## Briefings

`briefings.yaml` lists crew briefings, each with a `title`, a `mnemonic`, its `phase` and its
lines (`items`). A line is the mnemonic's letters (`lead`) and the rest of the word (`rest`), with
an optional `detail`: what to cover. A briefing shows at the top of its phase, above the phase's
lists, as its own card, each line's word with its `lead` in bold and its `detail` under it; a
phase with several shows them in the file's order. The pilot marks it Briefed, which folds it to
one line with the time, or skips it: a skipped briefing is open, like a skipped step, until it is
given. It never holds up the steps. Practice asks about a briefing's mnemonic and its lines, and
leaves out a briefing whose `mnemonic` is empty. A briefing has no flight values. Its `id` is
saved with the flight, so it never changes once published.

## CDU walkthroughs

`cdu.yaml` holds page-by-page CDU walkthroughs. A step opens one by naming its `id` in `opens`;
that step, when it's current, has Open CDU walkthrough, and the walkthrough opens in the
slide-out. Each page has the CDU page's name, a `title`, what to do (`action`), what to `check`,
an optional `note`, an optional function `key` to press, and the `screen`: its title line and
page count, six line select rows, the line select keys to `highlight` and the scratchpad. Pages
that share a CDU page show as one in the progress, so give them the same `page`.

Text is a list of parts, joined in order. A field part shows the flight's value, with its
`before` and `after` text, and when the value isn't known it shows `empty` instead, or nothing.
Write `empty` as words the pilot can act on ("the departure airport ICAO code"), since with no
flight added every page reads them. A `when_known` part shows one group of parts or the other.
On the screen, `data` is what the airplane shows, `accent` what it calculated or accepted, and
`user` what the pilot types; the app draws a legend for them. The app calculates nothing a pack
doesn't name: the only numbers it works out are a route's rows (`route_leg`), split from the
flight's route as 3.0 did, and the counts made from them (`route_legs`). The page the pilot is on
is saved with the flight by the walkthrough's `id`, so it never changes once published.

## The exterior inspection

A step with a `walkaround` point is a stop on the exterior inspection. Its step pane, and on a
phone its card when it's current, shows the step's `look_for` as Look for, its `location` line, and
a top view of the airplane with every stop of the list numbered by its step `number`: the current
one, done, skipped and to do, with a legend.

The airplane comes from the overview's `top` view in `controls.yaml`, beside `side` and `seat`
(decision 0032): the airplane from above, nose up, as `structure` and `glass` shapes, each of three
points or more, in the view's own units. Give a curve or an ellipse as many points. The walkaround
points are in the same units, and each must lie inside the view. Without a top view, `check` warns
and the steps show as an ordinary list.

## Labels

Words the interface shows that belong to the aircraft (list kind names, the reference area's title
and groups, crew roles and seats, the panel-state picker, basis tag labels) can go in an optional
`labels.yaml`, listed in `pack.json` as `labels`. Every key is optional, and a key left out keeps
the app's own word, so write only what differs.

- Reference tabs follow the order of `reference.groups`.
- `side_words` are the words that tell one of a pair from the other (left and right, captain and
  first officer). Practice uses them so it never offers a twin as a wrong answer, and, with the
  seated roles' names, they name two panels as a pair ("L and R wiper panels"), in the order the
  words are listed. Practice also counts as twins the numbered items: where two names differ by a
  number alone (ENGINE 1, ENGINE 2).
- `plain_words` are words that say nothing about where a control is (`AND`, `PANEL`, `SWITCH`),
  which Practice's where questions ignore; the app's default list is replaced as a whole.
- `find_examples` are Find's Try chips, and its first two are the no-match hint's examples.
- `glossary_exceptions` are terms whose first sentence is not shown as their expansion.
- `position_words` (`DN: [DOWN]`) are other words for a position, merged over the defaults;
  `check` and `suggest-targets` read a step's wording with them.

## Other things Practice and the overview read

- A panel section's optional `name` is what card titles, captions and "Also" lines call it ("Fuel
  panel") when that is not its drawn `title`; the interface adds nothing to a name.
- On the Flight deck page, a region the side view draws as several outlines is split into that
  many areas by its places' `area` names, top to bottom on the map, each named by the side view
  place's `names` (one per outline, front to back) or else its area name as written. With a side
  view, a region it doesn't draw lists the places with no region of their own, last.
- In `lights.yaml`, every light that shares its label with another on the same section carries
  `which` ("transfer bus 1"), each different, and Practice names it with that.
- In `controls.yaml`, a control whose name is plural carries `plural: true` (Practice asks "Where
  are the …?").
- A step that opens a case of its own ("IF RUNAWAY CONTINUES") carries `branch: true`, so Practice
  never asks across it; never on a list's first step.
- The phase that starts the engines carries `engine_start: true` in `phases.yaml`, for Practice's
  "Before engine start".
- An overview region's optional `short` name ("Overhead", shared by both overhead regions) names
  that area in the How page's flow figure.
