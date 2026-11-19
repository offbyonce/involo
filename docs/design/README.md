# Interface design handoff, round 5

This folder is the agreed interface design for Involo. It was reviewed and approved over five rounds of mockups plus an independent design review. Build the interface from it.

## Hard rules

1. **Everything is a design token or a shared component.** No color, size, spacing, radius, font size, shadow or drawing is written on an individual page. Pages use tokens from `tokens.json` and shared components. Panel drawings come from pack data through one renderer, never hand-drawn per screen.
2. **No feature may be removed.** Every 3.0 feature in `coverage.md` must have a reachable home at every size: phone, tablet portrait, tablet landscape, desktop and wide (up to 5K).
3. **Panel layouts cannot change.** Flight deck maps and panel drawings keep the arrangement and proportions from the pack. You may change how they render (color, contrast, label size, sizing), never where things are.
4. **Progressive disclosure is valued.** Reveal detail on demand (tap to open, ?, pop-overs, expandable rows) rather than crowding the screen, but never hide anything a pilot needs to complete the current step.
5. **Dark and light mode are both required** on every screen, including the panel drawings.

## Round 6 (approved 2026-11-13)

[round6/](round6/) changes how a step shows its panel and where it is; read
[round6/ROUND6.md](round6/ROUND6.md) first. Its boards are in `round6/boards/`; its
`Checklist`, `Tablet`, `Mobile` and `Views` sources add an `r6` option (and `preview` on Checklist
and Mobile) and render exactly as round 5 with it off. Where round 6 and round 5 differ, round 6
wins.

**Superseded round 5 boards**, kept below for history only:

- `MapHidden` (Hide map and Show map are removed).
- `WherePop` (replaced by the slide-out's Where it is section, round 6 `Locator`, `R6Where`).
- `TabWhere` and `PhoneWhere` (replaced by the tablet slide-out and the tablet portrait and phone
  sheets, round 6 `R6TabL`, `R6TabP`, `R6Phone*`).
- In `Checklist`, `Wide`, `Tablet`, `Mobile` and `Views` (Flow, Settings): the map figure in the
  side pane, the side pane's controls drawing, the "New panel" tag, "See the whole panel larger",
  the inline drawing in an expanded step, Flow's side pane drawing and Settings › Map in steps.
  The rest of those boards stands, except the header logo: the rename to Involo (decision 0025)
  updated it only in the round 6 copies and Menu, so those copies' header is the specification.

**Round 6 update (approved 2026-11-13).** `Tablet`, `Locator`, `Checklist`, `R6Pane` and
`R6PaneLight` now show the label-free preview card in every side pane (desktop, wide, tablet
landscape and the panes behind the slide-out) and in the tablet portrait expanded step; the Show
panel button is gone from every board. `Decision.dc.html` adds the decision step (decision 0022):
`DecUnanswered`, `DecSuggested`, `DecAnswered`, `DecChanging`, `DecChanged` and `DecPhone`, dark
and light. Its location line ("Main panel (P2) · fuel quantity on the upper display") and "0 lb" were stand-ins until the center tank step was sourced; the pack now gives them (decision 0027). The toast on
`DecChanged` is the one every Undo uses (color.toast-text, color.toast-link, color.toast-shadow).

**Flight sections and the strip (approved 2026-11-13).** `FlightSection.dc.html` (with
`FSOverview`, `FSRoute`, `FSFuel`, `FSCruise`, `FSClearance`, `FSTakeoff` and `FSApproach`, dark and
light) draws the Flight pages' sections with the Approach board's field row and "Find it in your
OFP" beside each; `FSApproach` replaces the round 5 `Descent` board. `Weather.dc.html` (round 6,
with `Winds` for the en route winds tab), `StripOpen` and `StripFreq` (the strip panel with
Frequencies open) supersede their round 5 copies; `SimBrief` and `Start` (round 5) stand. Editable
values are always boxed fields (color.field, outlined in color.field-border), values still needed
are amber, and read-only and cross-section rows are plain text. Values, descriptions, the location
lines and OFP close-ups were stand-ins, checked in the content pass that followed. The center tank
row shows the exact figure once a SimBrief plan gives it (decision 0027).

**Flight additions (approved 2026-11-13).** `WxTabL` and `WindsTabL` (Weather and the en route
winds at tablet landscape, 1180 × 820), `FSTakeoffTabL` (every section page at tablet landscape,
shown with Takeoff) and `FSInvalid` (a value out of range: red border, alert icon and "Enter X to
Y" under the field, for every field 3.0 gave a range), each dark and light, come from the `layout`
and `cruiseInvalid` options added to `Weather.dc.html` and `FlightSection.dc.html`. The gray
location badges are gone: each value says where it goes in a plain muted line under its
description ("Enter on the CDU › PERF INIT"). Takeoff thrust is a pick list (TO, TO-1, TO-2) with
the assumed temperature as its own row. Every boxed field uses color.field and color.field-border;
"From the FMC" is the placeholder for values the FMC gives; SimBrief and OFP file says the import is
the only part of the checklist that uses the internet; Transition reads SUMMA on every board.

**Tablet and phone additions (approved 2026-11-15).** `StagePicker.dc.html` (with `StagesPhone`,
`StagesTabP` and `StagesTabL`, dark and light) draws the stage and phase picker that opens from the
stage button in the compact header: a bottom sheet on phone and tablet portrait (two columns on
tablet), a pop-over under the stage button from 900 to 1439 px. Wide desktop (1440 and wider) keeps
its stage tabs and does not use it. The stages and phases come from the pack, in pack order.
`Views.dc.html` (Settings) moves the version from the old menu to the foot of Settings: "Involo
[version] · What’s new". The menu drawer is the same at every size (Menu, Tablet, Mobile); its items
whose page does not exist yet stay hidden, with any group heading left empty, until that page is
built (2026-11-15).

**Find and panel additions (approved 2026-11-15).** `Find.dc.html` with twelve wrapper boards (`FindDesk`,
`FindDeskNone`, `FindDeskStart`, `FindPhone`, `FindPhoneNone`, `FindPhoneStart`, dark and light)
draws Find: a 640 px dialog 88 px from the top on the pop-over tokens over `color.scrim` from 900 px,
a full-screen sheet below it. It searches every step, control and term in the pack, in sections
(Steps, Controls, Terms) with counts and "Show all N"; the sample results are stand-ins. Ctrl K (⌘K)
opens it from any page. `Tablet.dc.html` and `Mobile.dc.html` add Clear ticks to the menu above
Reset flight plan, and draw no procedure header. `Menu.dc.html` (with `MenuWhere`, in `boards/`)
opens "Where is Flight setup?" on desktop. `StagePicker.dc.html` and `Mobile.dc.html` correct the
dark scrim to 0.55, and `Decision.dc.html` redraws DecPhone to the Mobile board's rules. The
answers: matches are marked in a step's value and a term's definition too, values clamp to two
lines, the header button is named "Find a step, control or term", and the system back closes Find;
Try chips keep the 44 px touch size. At tablet and phone each list after the first starts with a
plain label row (32 px, 12 px semibold, `color.muted`, "Before start checklist · 0 of 6"), with no
Clear ticks.

**Glossary (approved 2026-11-15).** `Glossary.dc.html` with `GlossaryDesk` (desktop and tablet
landscape), `GlossaryPhone` (the term list; tablet portrait uses it) and `GlossaryPhoneTerm` (one
term), dark and light, in `round6/boards`. Built from the pack's terms: a term's expansion is the
first sentence of its definition only when the term is an abbreviation and that sentence is a
short name (no verb, eight words or fewer); "In the steps" lists every step whose terms name it.
Where is this? and Related stay out, as the pack has no data for them. A term in Find opens
the Glossary at that term, each definition in a step's Terms has its own "Open in Glossary", and
the menu shows Glossary under Reference. Two step rows that would read the same also name their
list. No new tokens: a term's text keeps the boards' 640 px reading width (written as
`size.drawer` plus `size.map-figure`) and its definition the 1.55 line height (`leading.normal`
plus 0.05). Terms IGN L, IGN R, PERF INIT and MA take no expansion (deliberate exceptions).

**Flight deck (2026-11-16).** Built from `Deck.dc.html` (1440 px and up: the side view
over the area list, the area's map with "Panels in this area, as a list" and "Light meanings for
this area", the selected panel) and `PhoneDeck.dc.html` (below 900 px: the area picker in the
header, the map, the list and the selected panel, "Used by"). From 900 to 1439 px the page shows the
area list and the area, and a selected panel opens in a slide-out drawn as the step's, not a third
column. The areas are the board's seven, the pack's center console split into the forward
electronic panel (P9), the control stand and the aft electronic panel (P8) by its places' area
names, then "Around the flight deck" last: it has no map region, so its places are a list, each with
its location line and, where the pack draws it, its drawing, and nothing is lit in the side view.
The map is the pack's overview, with the map rules (a box is named only when its name fits
with 6 px either side). The selected panel is an overview fitted to its column (labels may go below
11 px there), with "Full size ›" opening it in the panel sheet at the 11 px minimum, under a
navigator when wider; the 900 to 1439 px slide-out shows it at full size. The slide-out's and Where is this?'s "Whole flight deck" map is gone: "Open
in Flight deck", as the Locator board draws it, opens the page at that panel.

**The tour (2026-11-16).** Built from `Tour.dc.html` (in `round6/boards`): `TourWelcome`,
`TourStep` and `TourEnd`, with their Phone versions, each in dark and light. Seven steps: the welcome
(step 1) and "You're set" (step 7) are centered cards over color.scrim; steps 2 to 6 light up one
real element with a 2 px accent ring 8 px outside it and color.scrim over the rest, the card beside
it (below by default, otherwise wherever fits) with its arrow. Below 900 px the card is a bottom
sheet, except step 3, which lights the Done / Skip for now bar with the card just above it.
The desktop board's whole-header ring is a stand-in for the stage tabs: the tabs at 1440 px,
the stage button below that, and a step with neither on screen is skipped. The welcome opens on a
first visit once the checklist has loaded; "Take the tour" is the last item of "This flight and the
app", as the Menu boards draw it, and starts at step 2. Only whether the welcome has been
seen is stored (Settings.tourSeen; settings saved before format 6 count as seen). The step dots use
color.toggle-off (the board's own grays were an error). While the tour is open no key or click
reaches the page, so it never ticks, skips or changes the flight.

**How procedures work (2026-11-16).** Built from `HowItWorks.dc.html` (in `round6/boards`):
`HowDesk` (desktop and tablet landscape) and `HowPhone` (phone and tablet portrait), each in dark and
light. Every word lives in `packages/ui/src/lib/how-content.ts`, a first draft, to be adjusted
there; the counts (stages, and the lists in each Emergency tab) come from the pack. 900 px and up: the
parts list on the left follows the reading column, and a part picked there scrolls to it and goes in
the address (`#/how/2`). Below: one part per screen, "All seven parts" at the top, Back and Next
naming their parts. Each part ends in an "In Involo" box linking to the real place; "the current
phase" is the one Take the tour opens. Part 2's figure is drawn in panel colors as the Flight deck
map draws its panels and area labels (the board's frame color and label tracking were an
error), and every part uses part 2's 16 px spacing. In the menu it follows Practice under Learn.

**Flight log (2026-11-16).** Built from `FlightLog.dc.html` (in `round6/boards`), completing
round 6's Log view: `LogDesk` (desktop and tablet landscape), `LogPhone` (phone and tablet portrait)
and `LogPhoneFlight` (one earlier flight on phone), each in dark and light. Saved on the device only
(decision 0026). This flight, Earlier flights newest first (the opened one in color.current-row with
the 1.5 px accent ring, shown below the list with the time in each stage as proportional bars),
Practice results, and the actions column; on phone a flight opens on its own page and the export and
import actions open as a sheet from "···". Finished is color.done; Not finished and "open" are
color.open-text (the board's amber stands for the app's amber text token). In the menu it is first
under This flight and the app.

**References (2026-11-16).** Built from `References.dc.html` (in `round6/boards`): `RefsDesk`
(desktop and tablet landscape) and `RefsPhone` (phone and tablet portrait), each in dark and light.
Decision 0007 stands: the page names only the kind of source a list's basis tag stands for
(Simulator documentation, Regulator guidance), never a citation, title, page or link. Lists tagged
prior-release show "Source being confirmed" in a dashed, muted tag: a status, not a source, which
goes away once a list is re-tagged with its basis. The chips are All, each source, then Source being
confirmed (over the board's order), on phone too. The simulation notice uses the
If-not box's amber. Simulator model notes opens Find on those steps; Open-source software opens the
third-party licenses file, made from the app's dependencies at build time. In the menu it follows
the Glossary under Reference.

**Practice (2026-11-16).** Built from `Practice.dc.html` (in `round6/boards`):
`PracticeHome` and `PracticeHomePhone` (the ready-made tests, Build a test, "Earlier this visit"),
`PracticeQuestion` and `PracticeQuestionPhone` (a choice answered wrong, with feedback),
`PracticeOrder` (a step order question) and `PracticeResults` and `PracticeResultsPhone`, each in
dark and light. 900 px and up take the desktop layout (tablet landscape too); below, the phone
layout. Every question is generated from the pack (`lib/practice.ts`) under the README:
exactly one correct answer, three real neighbors as wrong options and never an invented one (a
question that cannot find three is skipped), every question linked to its source. The
answers: faults take the flight deck area as their system; mnemonics ask which mnemonic an item
belongs to, the next item and the order (no letter questions); terms take the system of the
controls of the steps that use them (the others stay in the Glossary only); a control's panel takes
the nearest area's panels when its own area has fewer than four, and every control also asks for
its Flight deck area; Step values only where the control's own positions give a wrong option.
Topics tied to steps follow the chosen stages and the flight's options; memory items count for any
stage; a light, control or term no step uses counts only with every stage. Right and wrong use
color.done, the new color.done-soft, and color.danger, danger-text and danger-soft. The boards set
no line height (the browser's normal one, as the page does) and draw the question at 1.3; the
widths 1100, 820 and 1240 are the column's content inside its padding. Results last only for the
visit.

**Panels as tiles (2026-11-15).** `PanelTiles.dc.html` (dark and light) draws a step whose
controls are on two panels, and the Whole flight deck map (replaced by the Flight deck page). A step draws only the panels that hold
its controls or the lights its Check names, nothing between them; each is its own tile at its own
scale, side by side when they fit at full size, otherwise stacked, 16 px apart, centered, never
the deck's gaps. The side pane's preview card uses the same tiles at thumbnail size. A panel the
pack has no drawing for is a tile with its name and the step's controls on it. The sheet's title
names one panel, or a left and right pair as one ("L and R wiper panels"); otherwise the panel
with the control the step sets (never one holding only lights its Check names), with "Also: …" in
the sub-line. Names are the pack's as they are, in sentence case, with "panel" added only when the
name does not end in a thing ("Control stand", "Captain and first officer displays", "Fuel
panel"). A left and right or numbered pair is named as one ("Radio 1 and 2 panels"), in the title
and in the "Also:" line. Every panel too wide for its room keeps a navigator strip, on single and
multi-panel sheets alike, drawn like the Locator board's figure with "Scroll sideways for the rest
of the panel →" beside it. A step's control the pack does not draw is listed the way a panel with
no drawing is. The map
has no line above it; area labels sit above their area, 8 px clear of the outline and 16 px under
the area before; the dashed outline runs 6 px outside the area's panels; a marked box is labeled
only when the label fits with 6 px either side.

**Several packs (2026-11-18).** `Packs.dc.html` draws decision 0028's screens, dark and light:
`PacksDesktop` and `PacksPhone` (the Packs page), `PacksFirst` (the first launch, with no packs),
`PacksSwitcher` (the pack line at the top of the menu, opened), `PacksRemove` (Remove…),
`PacksUpdate` (the note after a pack update, #105), `PacksSimbrief` (a SimBrief plan for another
aircraft, #106) and `PacksLog` (the Flight log by pack, #107). The build may improve on these
boards but never be worse in any state, theme or size; each change from a board is listed with
before and after shots in its pull request.

- Existing tokens only. Progress bars use color.todo-ring for the track and color.accent for the
  fill. Update bands use the open (amber) set. Change tags: added `done`, reworded `accent`,
  removed neutral. Dialogs use color.popover-surface, color.popover-border, color.overlay-shadow
  and color.scrim.
- **Packs page.** One card per installed pack: its name, the aircraft line (family · simulator ·
  developer, from the pack's `aircraft` block), its version, and the saved flight as a progress bar
  (or "No saved flight yet"). The open pack has the accent outline and "In use". "Use this pack"
  switches; "Remove…" asks first. A waiting update is a band inside the card with "Update";
  nothing updates without that tap. (The board's "What's new" waits for #105's change list.)
- **Not from the catalog.** A pack added from a file shows the neutral "Not from the Involo
  catalog" badge wherever the pack is named, never in a warning color.
- **More packs** lists the catalog's packs not on this device, each with Download, its size and
  version. "Add a pack file…" opens a file picker.
- **First launch** (no packs): the welcome, the three steps and the catalog list; the first
  catalog pack's Download is the primary button.
- **Switcher.** The pack line ("<pack> · saved <time>") opens a menu of the installed packs, a tick
  on the open one, each with its saved flight or catalog label, and "Manage packs", which opens the
  Packs page. It is a real menu: arrow keys, Esc, and focus back on the pack line.
- **Remove.** "Also remove its saved flight" starts unticked; unticked, the flight comes back if
  the pack is added again.
- **Update note** (#105): at the top of the checklist after a pack update during a flight: the
  title with the new version, "Your ticks are kept on every step that's still there", the change
  counts as tags, and "What changed" (opened the first time): one row per change with its tag, the
  step as a link and its phase. A reworded step shows the field that changed, the old wording
  struck through above the new. A removed step that was ticked says so. "Go to the first new step"
  (only when steps were added) and "Dismiss"; a dismissed note doesn't come back.
- **SimBrief warning** (#106): when the plan's aircraft type isn't one of the pack's `icaoTypes`:
  the plan's aircraft and type code against the open pack's name and type code. "Use it anyway" is
  the primary button; Cancel leaves the plan unloaded.
- **Flight log** (#107): filter chips for All packs and each pack with flights, with counts; each
  entry shows the pack name and version it was flown with.

Pack names other than iFly, versions, sizes, step names, the reworded text and the plan's aircraft
on these boards are invented examples; the app builds everything from the pack, the catalog and the
flight.

## Read in this order

1. `rules.md`: what the tokens mean and the rules every screen follows.
2. `tokens.json`: the token values. This is the source of truth.
3. `screens.md`: every screen, what is on it, its states, and which board shows it.
4. `coverage.md`: where every 3.0 feature lives at every size. Use it as a release check.
5. `content-to-validate.md`: wording and data in the mockups that must be sourced and validated before it ships, plus the panel icon work.
6. `boards/`: the round 5 mockup source, one file per board (see Round 6 above for what it supersedes). It is plain HTML with inline styles and `{{t.x}}` / `{{p.x}}` holes that map to `tokens.json`. Use it for layout, hierarchy and behavior. Take values from `tokens.json`, not from the HTML.
7. `review/design-review-r4.md`: the independent review that drove round 5. Every finding (F1 to F22) is addressed in these boards.

## How the boards are built

- Light and dark boards come from the same source with a `theme` prop. Files ending in `Light` are wrappers.
- `Views.dc.html` holds Flow, Emergency, timer, CDU walkthrough, briefing, exterior inspection, approach, Flight log and Settings (`view` prop).
- `Tablet.dc.html` holds both tablet orientations and their overlays (`orient`, `overlay` props). `Mobile.dc.html` holds every phone screen (`screen` prop).
- `Checklist.dc.html` takes `mapHidden`, `w` and `h` props. `Wide.dc.html` renders it at 1600 x 900 scaled 1.6.
- Sample values (KSEA to KSFO, the METAR, fuel numbers, times) are illustration only.

## In this repository

The handoff was moved here unchanged on 2026-11-12. Decisions
[0021](../decisions/0021-design-system-and-layouts.md) (the design system and layouts) and
[0022](../decisions/0022-conditional-controls-and-decision-steps.md) (conditional controls and decision
steps) record it; the proposed 0020 is withdrawn. [audit.md](audit.md) and
[audit-tables.md](audit-tables.md) are the earlier audit that started this work, kept for history.
The boards load a `support.js` canvas runtime that is not part of the handoff, so they are read as
source, not opened in a browser.

### Addendum: control drawings

The switch, button, knob, selector, guard and light drawings in `boards/` are schematic stand-ins.
They define position, states, the ON direction, the OFF and ON labels and the color rules, not the
drawing style. The app's existing control drawings stay wherever they are better, and move into
the shared renderer so they meet `rules.md`: tokens only, both themes, unlit lights outline only,
labels at 11 px or more and light legends at 10 px or more, the real ON direction, and the
changed, resting, conditional and resolved states. Where ours are better, ours win; where a board
shows a state or rule ours lack, it is added. The reviewer brief for the shared drawing
renderer includes a side-by-side for each control type: the current drawing, the board, and the
result.

### Answers on the handoff

- **Center tank:** the pilot answers until the pack has a sourced wing-tank capacity. After that
  the app may suggest an answer from the SimBrief plan, and the pilot confirms it.
- **Drawings that cannot fit 11 px labels** in their space open as a full-width sheet. Labels never
  go below the rule and the geometry never changes.
- **Open my OFP on SimBrief** is a plain link to SimBrief that sends no user data.
- **Qualification:** the wider list in decision 0021 gates any claim of tablet and phone support.

### Token additions

`tokens.json` is the delivered file plus additions approved on 2026-11-12: border
widths, line heights and eight sizes (icons, the tablet side pane, the drawer, the open-step dot,
status icons, the progress bar and the Flow button). Each names its source board in a `$sources`
entry. Approved the same day for the drawing renderer: `radius.popover`, `color.popover-border` and
`color.overlay-shadow` (WherePop's values, for every pop-over, sheet and drawer) and
`size.map-figure` (280, the side pane's map figure on the Checklist and WherePop boards). Round 6 (2026-11-13), from `round6/boards/Locator.dc.html`: `size.slideout` (840), `size.slideout-tablet` (700) and `color.slideout-scrim`. 2026-11-15, from `round6/boards/StagePicker.dc.html`: `color.scrim-light`, the pop-over picker's scrim from 900 to 1439 px. New tokens are proposed with their source first, never added on their own.
