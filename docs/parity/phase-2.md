<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Phase 2 parity report

The Phase 2 brief's step 11, before v0.1.0: what the web app does of everything 3.0 does,
installed and offline, checked on 2026-11-22 against `main` at 712178b. Each row is marked
**passes**, **fails** or **not built**. Each gives the evidence that shows it, and the issue it
needs, if any.

## Summary

- **Passes:** every 3.0 feature in the feature coverage table ([coverage.md](../design/coverage.md))
  has a home at every size, apart from the Settings rows listed below. All 510 3.0 steps are in
  the iFly pack (527 steps now). The app installs, works offline after the first visit and offers
  a reload for a new version. Backups restore with the pack's aliases and say what they replace.
- **Fails or not built:**
  - The 3.0 import (step 9).
  - The first-launch notice and Report a problem with a step (step 10).
  - The persistent storage request and the export reminder (step 8).
  - Parts of the SimBrief requirements (step 7).
  - Four Settings rows from 3.0.
  - The privacy note ([#52](https://github.com/offbyonce/involo/issues/52)).
  - The front page, which is still the placeholder.
- **Not automated:** tablet sizes and Firefox are outside the e2e suite, and were checked ad hoc
  for this report. Installed (standalone) mode on a real device needs a person.

## How it was checked

| Check | How | Browsers | Sizes |
| --- | --- | --- | --- |
| `just ci` | Automated: Rust, interface and build tests, pack checks, the size budget | Node (jsdom) | — |
| `just e2e` (56 flows) | Automated: the flows below, and every main screen's layout and accessibility (axe) in both themes | Chromium, WebKit | 390 × 844 and 1440 × 900 |
| Tablet and wide layout | Automated, for this report only: the e2e main-screens check run at other sizes with the iFly pack, both themes. No findings. Not part of the suite. | Chromium, WebKit | 768 × 1024, 1180 × 820, 2560 × 1440 |
| `just update-test` | Automated, not in CI: first visit installs the service worker; the installed app loads with no server, in Geist; a new version waits with the reload offer; Reload brings it in and the old cache goes. 4 of 4 pass. | Firefox (headless) | Desktop |
| Installed (standalone) mode | By hand only. Not done for this report; it needs a desktop browser and a tablet (maintainer step 7 below). | — | — |

## Step 7: interface parity (3.0 features)

Rows follow the feature coverage table. "Unit" means the interface tests in `packages/ui`; "Rust"
means the crate tests.

| 3.0 feature | Status | Evidence | Issue |
| --- | --- | --- | --- |
| Five stages, phases, procedures and checklists | passes | e2e main screens (a phase in List); unit `screens.test.ts`, `StagePicker.test.ts` | |
| List or Step by step | passes | e2e main screens (a phase in Step by step); unit `App.test.ts` (views named List and Step by step) | |
| Full or Essentials, and making Essentials your own | passes | Unit `App.test.ts` (Essentials in the menu and row menu, #133) | |
| Essentials marker (E) | passes | In the code (the step row); no test names the marker | |
| Detailed or Simple | passes | Settings › Step info and the menu; unit `Drawer.test.ts` | |
| Step map and panel views | passes | Unit `PanelPreview.test.ts`, `PanelSheet.test.ts`, `Slideout.test.ts`; e2e `layout.spec.ts` | |
| Flight deck page | passes | e2e main screens (Flight deck); unit `FlightDeckPage.test.ts`, `DeckPanel.test.ts` | |
| Light meanings and control details | passes | Unit `DeckPanel.test.ts`, `PanelSchematic.test.ts` | |
| Where is this? | passes | Unit `Slideout.test.ts` | |
| Map on or off | passes | Settings › Panel preview in steps; unit `SettingsPage.test.ts` | |
| Check, If not, Why; How to do it; Terms | passes | Unit `StepPane.test.ts`, `StepDetail.test.ts` | |
| Exterior inspection (18 stops) | passes | e2e `exterior.spec.ts` (desktop and phone) | |
| Ground power or APU; panel states (7); Turnaround | passes | Unit `start-view.test.ts`; Rust `phase_model` tests | |
| Flight strip, clearance, notes | passes | e2e `flight.spec.ts` (notes and values survive a reload); unit `FlightStrip.test.ts`, `App.test.ts` | |
| Step values from flight data | passes | Rust `values` tests (blanks); unit `flight.test.ts` | |
| Clear flight with Undo | passes | Reset flight plan and Clear ticks, each with Undo: unit `App.test.ts`. Settings' Clear all progress is in the Settings row below. | |
| SimBrief import and the offline OFP file | passes | e2e `flight.spec.ts` (plan from a file is kept; another aircraft asks first); unit `flight.test.ts` | |
| CDU walkthrough | passes | e2e `cdu.spec.ts` (3 flows); unit `CduWalkthrough.test.ts`; Rust `cdu` tests | |
| Decision steps (new) | passes | Unit `answers.test.ts`, `App.test.ts` | |
| Step timers | passes | e2e `timers.spec.ts` | |
| Emergency reference | passes | e2e main screens (Emergency); unit `reference-tabs.test.ts` | |
| Briefings in the flow | passes | e2e `briefings.spec.ts` (2 flows); unit `BriefingCard.test.ts` | |
| Practice | passes | e2e main screens (Practice); unit `PracticePage.test.ts`, `practice.test.ts` | |
| How procedures work | passes | e2e main screens (How); unit `HowPage.test.ts` | |
| Glossary | passes | Unit `GlossaryPage.test.ts` | |
| Light and dark mode, with dimming | passes | e2e: every main screen in both themes; Settings › Appearance and Dimming; unit `tokens.test.ts` (contrast for both themes) | |
| Flight log | passes | e2e `log.spec.ts` (3 flows); unit `LogPage.test.ts`, `flight-log.test.ts` | |
| Open steps across pages | passes | Unit `App.test.ts` (lists open steps and puts one back) | |
| Skip a step | passes | Unit `App.test.ts`; e2e `briefings.spec.ts` (skipped as an open item) | |
| Find | passes | e2e main screens (Find); unit `Find.test.ts` | |
| Keyboard (Space, ←, S) | passes | Unit `App.test.ts` (arrow keys and Space; never under the picker or Find) | |
| Settings | passes | e2e main screens open Settings; unit `SettingsPage.test.ts` | |
| Tour | passes | Unit `tour.test.ts`, `App.test.ts` (Take the tour) | |
| References | passes | e2e main screens (References); unit `ReferencesPage.test.ts` | |
| Flight setup (all flight data) | passes | e2e main screens (Flight); unit `flight-pages.test.ts` | |
| Approach type and arrival data | passes | Unit `flight-pages.test.ts` | |
| Progress saves | passes | e2e `ticks.spec.ts` (ticks survive a reload) | |
| Used in chips and Coming up | passes | Used in: unit `Slideout.test.ts`, `FlightDeckPage.test.ts`. Coming up: in the code (the side pane), no test | |
| Settings: Keep screen awake, Your Essentials (Reset to default and the count), Start (Cold and dark or Turnaround), Clear all progress | not built | Coverage marks these homes "to review", and no board draws them. Settings has none of the four rows; the Start choice is in Flight › Start options only. | [#245](https://github.com/offbyonce/involo/issues/245) |

### The 3.0 content (Phase 1 parity report)

| Item | Status | Evidence | Issue |
| --- | --- | --- | --- |
| Every 3.0 step (510) | passes | `involo-pack check packs/ifly-737-max8`: 65 checklists, 527 steps, no errors; the snapshot tests | [#75](https://github.com/offbyonce/involo/issues/75) (11 warnings) |
| Fault causes, section headings | passes | Pack snapshot tests | |
| Guided tour | passes | Built in Phase 2 (see Tour above) | |
| Practice text and per-area scores | not built | Phase 3 (decision 0008), as the Phase 1 report says | |

### The brief's interface requirements

| Requirement | Status | Evidence | Issue |
| --- | --- | --- | --- |
| One presentation, no status marker | passes | In the code: the pack format has no status field (decision 0013) | |
| Item states by shape and text; skipped stays open | passes | Unit `ProgressRow.test.ts`, `App.test.ts` (open steps) | |
| Current-item box with a large Check button | passes | Unit `App.test.ts` (current step in a large box) | |
| Detail levels | passes | Detailed or Simple, above | |
| Touch targets of 44 px | passes | e2e: every main screen's tap check | |
| Dark and light, contrast checked in CI | passes | e2e both themes; unit `tokens.test.ts` | |
| Geist and Geist Mono bundled and precached | passes | `just update-test` (offline, in Geist); `licenses.test.js` | |
| Non-normal lists in larger type | passes | The Emergency reference's list style (`ReferencePage.svelte`) | |
| Completion call only with no open item | passes | Unit `App.test.ts` ("Power up flow complete" shows only once the flow is done) | |
| Tabler icons and our own glyphs | passes | `packages/ui/src/icons`; `LICENSES/MIT.txt`; REUSE lint | |
| LEGS with no departure, CDU with part of the flight filled | passes | Rust `cdu` tests (`route_rows_and_counts_come_from_the_flights_route`, `perf_init_and_pos_init_show_the_board_flight_in_the_cdus_forms`) | |

### SimBrief requirements

| Requirement | Status | Evidence | Issue |
| --- | --- | --- | --- |
| Remember the username on the device | passes | Saved in the settings on this device; unit `flight.test.ts` | |
| An option to forget the username | not built | No control clears the saved username | [#244](https://github.com/offbyonce/involo/issues/244) |
| One-tap refresh | passes | Strip › Import latest from SimBrief; unit `FlightStrip.test.ts` | |
| Load the plan automatically when the app opens (optional) | not built | Optional in the brief | Same issue |
| Show which plan is loaded, its route and age | passes | SimBrief and OFP file: "KSEA → KSFO, imported …" | |
| Keep the last plan for offline use | passes | The compact plan is saved with the flight (decision 0019); e2e `flight.spec.ts` | |
| Friendly errors | fails | An unknown username or a missing plan shows SimBrief's own message ("SimBrief says: …"). Offline shows "Couldn't reach SimBrief. Check your connection, or use a saved OFP file.", which doesn't say the last plan is still in use. | Same issue |
| Saved file as a secondary route, drag and drop | passes | The SimBrief board's drop zone and Choose file; e2e `flight.spec.ts`. The board puts the drop zone in its section, not anywhere on the page. | |

## Steps 6, 8, 9 and 10

| Item | Status | Evidence | Issue |
| --- | --- | --- | --- |
| Installable: manifest, icons, service worker | passes | `app/manifest.webmanifest` (standalone, four icons); `precache.test.js`; `just update-test` | |
| Works offline after the first visit | passes | e2e `offline.spec.ts` (Chromium, WebKit); `just update-test` (Firefox) | |
| A new version never replaces content mid-session | passes | `just update-test` (B waits, reload offer, Reload) | |
| Progress in browser storage behind the host adapter | passes | `saved-store.test.js`, `log-store.test.js`, `pack-store.test.js` | |
| Ask the browser for persistent storage | not built | No call to `navigator.storage.persist()` | [#243](https://github.com/offbyonce/involo/issues/243) |
| Export in a versioned format defined in Rust | passes | Rust `backup` tests (format frozen, older parts migrated, newer refused) | |
| Import validates, applies aliases and says what it replaces | passes | e2e `backup.spec.ts`; unit `RestoreDialog.test.ts`, `backup.test.ts`; the restored flight goes through the pack's aliases (`restore_flight`) | |
| Remind pilots to export from time to time | not built | No reminder anywhere | Same issue |
| 3.0 import from a 3.0 export file, tested with an invented export | not built | Restore refuses a 3.0 file as not a backup | [#240](https://github.com/offbyonce/involo/issues/240) |
| First-launch notice covering the whole app | not built | The notice is a line at the foot of the app page and in References; nothing covers the app at first launch | [#241](https://github.com/offbyonce/involo/issues/241) |
| No status or verification marker | passes | See One presentation above | |
| Privacy note | not built | No privacy note in the app | [#52](https://github.com/offbyonce/involo/issues/52) |
| The app replaces the placeholder front page | not built | `index.html` still says "The web beta is coming soon." | [#53](https://github.com/offbyonce/involo/issues/53) (wording); [#246](https://github.com/offbyonce/involo/issues/246) |
| The temporary `app/` address and its interim notice line go | not built | The app is at `app/`, marked `noindex`, with its footer line | Same two issues |
| Report a problem with a step: a prefilled issue form | not built | No link on a step. `.github/ISSUE_TEMPLATE` has `procedure-problem.yml`, with nothing prefilled, and no `step-problem.yml` | [#242](https://github.com/offbyonce/involo/issues/242) |

## Gaps in the automated checks

| Gap | Issue |
| --- | --- |
| The e2e suite checks only phone (390) and desktop (1440) widths; tablet portrait, tablet landscape and wide were checked ad hoc for this report | [#247](https://github.com/offbyonce/involo/issues/247) |
| Firefox runs only `just update-test`, by hand, not the e2e flows or CI | Same issue; adding the update test to CI is [#41](https://github.com/offbyonce/involo/issues/41) |

## Maintainer steps for v0.1.0

Listed in order. This report does none of them; step 4 was already done.

1. **Choose what blocks v0.1.0**, from the issues above. The brief's gate needs the 3.0 import,
   the first-launch notice and the privacy note.
2. **Decide on the front page.** Either the app replaces the placeholder now
   ([#246](https://github.com/offbyonce/involo/issues/246), with
   [#53](https://github.com/offbyonce/involo/issues/53)), or v0.1.0 ships at `app/` with only
   #53's wording.
3. **Workflow changes** (`.github/workflows/`):
   - Run `just update-test` in CI on Linux ([#41](https://github.com/offbyonce/involo/issues/41);
     Pages already publishes only after a green CI run).
   - Optionally, pin the actions ([#64](https://github.com/offbyonce/involo/issues/64)).
4. **Repository settings:** done. A repository ruleset protects `main`, requiring CI's `ci` job
   on all three systems, `reuse`, `e2e` and CodeQL. Pages is set to GitHub Actions, with HTTPS
   enforced.
5. **Release text:** the changelog and its 0.1.0 entry
   ([#54](https://github.com/offbyonce/involo/issues/54)), which also serve as the release notes;
   SECURITY.md for the web app ([#48](https://github.com/offbyonce/involo/issues/48)); the README
   status ([#53](https://github.com/offbyonce/involo/issues/53),
   [#77](https://github.com/offbyonce/involo/issues/77)).
6. **Set `SITE_FROM` to `tags` before pushing the tag.** The Pages workflow builds the site, and
   attaches the pack files, `index.json` and the `involo-pack` binaries to the release, only for a
   `v*` tag's CI run while `SITE_FROM` is `tags`. A run by hand never attaches them. If the variable
   is switched after the tag, the tag's run skips both, and the tag has to be pushed again. From
   then on, merges to `main` no longer publish the site; only tags do.
7. **Tag `v0.1.0`** on a green `main` (the workspace and the iFly pack are already 0.1.0). Then
   check that the release has the catalog files and the three binaries with their SHA-256 sums, and
   that the site serves the tag's build. Paste the changelog entry into the release notes.
8. **Check by hand on the live site** (step 6, once per release): install the app on a desktop
   browser and a tablet, deploy a new version, and check the reload offer and the new version.
