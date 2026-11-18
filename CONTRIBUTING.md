<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Contributing to Involo

Thanks for helping. This page covers the three things every contribution needs:
a sign-off, passing checks, and (for checklist content) following the content rules.

## 1. Sign off every commit (DCO)

By signing off, you certify the
[Developer Certificate of Origin](https://developercertificate.org/): you wrote the change
or have the right to submit it, under this project's licenses. Add the line with:

```sh
git commit -s
```

That appends `Signed-off-by: Your Name <you@example.com>`. Commits without it are rejected
by the git hook and in review. Your contribution is licensed under MIT (code) or
CC BY-NC-SA 4.0 (checklist content in `packs/`), the same as the rest of the project.

## 2. Pass the checks

Run `just ci` before opening a pull request. It formats, lints, tests, validates packs and
checks dependencies. The git hooks (installed by `pnpm install`) run the quick parts for you.

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat: …`, `fix: …`, `docs: …`, `pack(ifly-737-max8): …`.
- Every bug fix comes with a test that would have caught it.
- Keep logic in `crates/`. The host crates (`crates/involo-web-host`) and the interface stay thin.
- Never put an aircraft name in engine code. Aircraft differences belong in pack data.
- American English everywhere: code identifiers, pack field names, error messages, docs and pack content (color, behavior, license as a noun, optimize, pressurization).
  Exceptions keep their exact spelling: SPDX license IDs, file names such as `LICENSE` and `LICENSES/`, and anything quoted from outside sources.

## 3. Checklist content rules

These protect the project and other people's work. `involo-pack check` enforces most of them
automatically, and the maintainer reviews every content change. The reasoning is in
[decision 0007](docs/decisions/0007-pack-content-model.md).

**No citations and no third-party links.** Steps do not cite sources, and packs contain no URLs
to third-party material. A first-party link needs the maintainer's approval.

**Every list has a `basis`** naming only the kind of material it was checked against, such as
`manufacturer-docs` or `sim-observed`, from the tags the pack declares. Never a document name or
link.

**Confirmation records are internal.** A step or panel light note may carry `confirmed_by`, a
list of `{ kind, date }` entries saying what kind of source it was confirmed against and when
(kinds defined in [decision 0013](docs/decisions/0013-step-presentation-and-provenance.md),
for example `vendor-docs`). Record only the kind and the date, never who or which document. The
app never shows these records or the list `basis`, and `involo-pack check` never flags a step without a
record: every step in a pack is presented the same way. Steps may also set `sim_simplified` where
the simulator simplifies the real aircraft. Content imported from the 3.0 checklist starts with
basis `prior-release`; each list moves to a real basis when the maintainer reviews it.

**Responses state the value.** A step's expected response names the actual value or position the
pilot should see, such as `FLAPS 5`, `ON` or `AUTO`, never just `SET`, so the pilot can check it
against the cockpit.

**Manufacturer manuals (FCOM, FCTM, QRH).** Facts are checked against vendor documentation. No manual text, link or citation enters the repo. Facts and procedures (switch positions, the order of steps, how a system works)
are not protected by copyright, but a manual's wording, tables, diagrams and layout are. So:

- use facts only, and write every step and explanation in your own words;
- never copy text, tables, diagrams or layout, and never closely paraphrase;
- write from our own flow structure, not line by line alongside a manual;
- draw your own diagrams;
- never store, upload, link or cite a manual.

**Never used as a basis:**

- Second-hand study material: Brainscape, SlideShare, AviationHunt and memory-item compilations
- Airline SOPs
- Paid or members-only content you would need to copy to reproduce

**Never link,** anywhere in the project: Scribd, Studylib, Brainscape, SlideShare, Manualshive,
archive.org, AviationHunt, NTSB docket documents, or any other second-hand study material.

**Never include:**

- Images, screenshots, PDFs or any files from an aircraft developer, manufacturer or simulator
- Text, tables or diagrams copied from a manual or tutorial. Switch names, positions and
  values are facts and are fine.

**Field names.** The pack's YAML files and their fields are snake_case (`expect_when`, `ask_in`),
as authors write them. The manifest, `pack.json`, is camelCase (`schemaVersion`), as is the app's
own saved data. The app hands pack content to its interface with camelCase field names, so the
interface reads one case (decision 0029).

**Step ids** are `<prefix>.<phase>.<short-name>`, where the prefix is the pack's own id or the id
of the pack it extends, for example `ifly-737-max8.preflight.irs-mode`. An id never changes once
published, even if the step is reworded or moved. A removed step's id is retired and never
reused. Stages have an `id` too, reference phases a `group` (`memory`, `quick` or `procedures`),
and a panel item may have an `id` so a step target or light note can name it
`panel/section/#id` (decision 0029).

**Overlap check.** `just overlap` flags any run of 8 or more words matching plain-text reference
files (see `INVOLO_OVERLAP_REFS` under "Optional local files" below). It also compares each list's
steps joined in order. Standard phrases can be accepted in `crates/involo-pack-overlap/allow.txt`
with a reason.

If you are unsure whether something is acceptable, ask in your pull request before writing the
content.

## 4. Optional local files

A few checks read files that stay on your own computer and are never committed, uploaded or
synced anywhere public. Each is named by an environment variable. Without them everything else
works; the extra check is just skipped.

| Variable | Names | Used by | Without it |
| --- | --- | --- | --- |
| `INVOLO_OVERLAP_REFS` | a folder of plain-text reference files | `just overlap`, which flags pack text matching them | the check prints "not run"; it is run before merging content |
| `INVOLO_BASELINE` | a local copy of the earlier single-file HTML checklist (3.0) | `just screenshots`, which also shoots the same screens of it and writes side-by-side images | only the app's screenshots are taken |
| `INVOLO_STEPS` | a list of steps, one per line: `phase` or `reference`, the phase id and the step id, tab-separated, with an optional number | `just screenshots`, which shoots each step's panel sheet and preview card | those shots are left out |
| `INVOLO_PLAN` | a real SimBrief plan file (with `INVOLO_PLAN_OUT`, where to write its compact form) | the ignored test `measures_a_real_plan` in `crates/involo-simbrief` (`cargo test -p involo-simbrief -- --ignored`) | the test is ignored, as it is by default |

## Reporting problems

Open an issue with the aircraft, the checklist and step, what you expected, and your
source. For security problems, see [SECURITY.md](SECURITY.md) instead.
