<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Content rules

These rules protect the project and other people's work. They apply to every pack, whether it
goes into the Involo catalog or stays on your own device. `involo-pack check` enforces the ones a
program can see (links, images and PDFs, a `basis` on every list); the others depend on you, and
the maintainer reviews every pack that goes into the catalog. The reasoning is in
[decision 0007](../decisions/0007-pack-content-model.md).

## Facts, in your own words

Facts are checked against the aircraft's documentation and written in your own words, from your
own flow structure. Facts and procedures are not protected by copyright; a manual's wording,
tables, diagrams and layout are. So:

- Manuals are never downloaded into, stored in, linked from or cited by the repository or a pack.
- No manual text, tables or diagrams are copied or closely paraphrased.
- Write every step and explanation yourself, from your own flow structure, not line by line
  alongside a manual.
- Draw your own diagrams and panels.

Switch names, positions and values are facts, and are fine.

**Responses state the value.** A step's expected response names the actual value or position the
pilot should see, such as `FLAPS 5`, `ON` or `AUTO`, never just `SET`, so the pilot can check it
against the cockpit.

## No citations and no third-party links

Steps don't cite sources, and packs hold no URLs to third-party material. `involo-pack check`
refuses any link in a pack's text (P1011), and reports the sites below as blocked (P1010); see
[the problem codes](reference/codes.md). A first-party link needs the maintainer's approval.

**Never link,** anywhere in the project: Scribd, Studylib, Brainscape, SlideShare, Manualshive,
archive.org, AviationHunt, NTSB docket documents, or any other second-hand study material.

## The basis of each list

Every list has a `basis`, naming only the kind of material it was checked against, such as
`manufacturer-docs` or `sim-observed`, from the tags the pack declares in `basisTags`. Never a
document's name or a link.

**Never used as a basis:**

- second-hand study material: Brainscape, SlideShare, AviationHunt and memory-item compilations;
- airline SOPs;
- paid or members-only content you would need to copy to reproduce.

**Confirmation records are internal.** A step or a panel light note may carry `confirmed_by`: a
list of `{ kind, date }` entries saying what kind of source it was confirmed against and when
(the kinds are in [decision 0013](../decisions/0013-step-presentation-and-provenance.md), such as
`vendor-docs`). Record only the kind and the date, never who or which document. The app never
shows these records or a list's `basis`, and `involo-pack check` never flags a step without a
record: every step in a pack is presented the same way. A step may also set `sim_simplified` where
the simulator simplifies the real aircraft. Content brought over from the 3.0 checklist starts
with the basis `prior-release`, and each list moves to a real basis when it is reviewed.

## What a pack never holds

- Images, screenshots, PDFs or any other file from an aircraft developer, manufacturer or
  simulator. `involo-pack check` refuses images and PDFs in a pack's folder.
- Text, tables or diagrams copied from a manual or a tutorial.

Panels are drawn from the pack's own data: you place each control yourself, by hand or with
[`involo-pack import-panel`](panels.md#import-a-panel-drawing) from a drawing you made. Packs
never hold SVG.

**Systems content** is labeled as the real aircraft, the simulator model, or both.

**The example packs** in `packs/examples` are invented aircraft, made to show the format. Invented
aircraft appear only there; every other pack is a real aircraft, written by these rules.

**American English** everywhere in a pack: color, behavior, pressurization.

## The overlap check

`just overlap` flags any run of 8 or more words that matches plain-text reference files you keep
outside the repository (see `INVOLO_OVERLAP_REFS` in `CONTRIBUTING.md`, "Optional local files").
It also compares each list's steps joined in order. Standard phrases can be accepted in
`crates/involo-pack-overlap/allow.txt`, each with a reason. It is a safety net for your own
writing, not a substitute for it.

If you're unsure whether something is acceptable, ask in your pull request before writing the
content.
