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
- Keep logic in `crates/`. The host crates (`crates/involo-web-host`, the desktop shell in `apps/desktop/src-tauri`) and the interface stay thin.
- Never put an aircraft name in engine code. Aircraft differences belong in pack data.
- American English everywhere: code identifiers, pack field names, error messages, docs and pack content (color, behavior, license as a noun, optimize, pressurization).
  Exceptions keep their exact spelling: SPDX license IDs, file names such as `LICENSE` and `LICENSES/`, and anything quoted from outside sources.

### What each check covers

| Check | What it catches | Run it |
| --- | --- | --- |
| Token rules (`packages/ui/src/theme/design-tokens.test.ts`) | A raw color (hex, `rgb()`, `hsl()` or a named color), font family, font size, size, radius or shadow anywhere in the interface outside the token files. The few exceptions (the generated token files, the drawing renderer's SVG units) are listed in one place in that file, each with its reason. | `just test`, part of `just ci` |
| Token table (`packages/ui/src/theme/token-table.md`) | A token whose value changed without the table changing. The table lists every token in `docs/design/tokens.json` with its value in both themes; when the test fails it names each token that differs and the row to write. Change the table only when you mean to change the token. | `just test`, part of `just ci` |
| End-to-end flows (`apps/web/e2e`) | The built site in Chromium and WebKit, with the catalog served locally and every request off the machine refused: the first run, ticks and notes surviving a reload, switching packs, updating a pack, adding and refusing pack files, importing a plan, working offline, and the flight log. Each test says what it expected to see or find saved. | `just e2e` (builds the site first); `just e2e --project=chromium ticks` runs one browser and one file |
| Layout and accessibility (`apps/web/e2e/layout.ts`) | On every screen a flow visits, at 390 and 1440 px, in dark and light: sideways scrolling, a control overlapping another or off the side of the screen, a tap target under 44 by 44 px on a phone, a key element missing, and any serious or critical finding of an axe scan (contrast included). A failure names the screen, width, theme and element. | part of `just e2e` |
| Broken packs (`crates/involo-pack/tests/broken.rs`, and the pack file tests in `crates/involo-app-core/src/packs.rs`) | A broken pack that isn't refused with a message an author can act on: empty, cut-off and non-UTF-8 files, very large files, deep nesting, alias bombs, `extends` cycles and missing parents, duplicate, malformed and unknown ids, wrong format numbers, paths outside the pack folder, and packs over the limits in `docs/packs/limits.md`. | `just test`, part of `just ci` |
| Pack authoring commands (`crates/involo-pack-cli/tests/authoring.rs`, and the code table's tests in `crates/involo-pack/src/codes.rs`) | `involo-pack new` making a pack that fails `check`; a problem `check` reports without a known code, a file, a line and a hint; a code in the table that no check raises; a change to the `check --json` or `explain --json` output (snapshots); `describe` listing other fields than the file's schema. | `just test`, part of `just ci` |
| Panel importer (`crates/involo-pack-cli/tests/import_panel.rs`, with drawings saved the way two drawing tools save them in `tests/svg`) | A control more than one unit from where it is drawn, once group transforms are applied; an imported panel that fails `check` once positions are filled in; a group the naming rule does not cover left out without a warning naming it; a drawing read although it links outside itself, holds a script, or is over the size or nesting limit. | `just test`, part of `just ci` |
| MCP server (`crates/involo-pack-cli/tests/mcp.rs`, and the path tests in `src/workspace.rs`) | An agent's round through the server failing (list, `new`, break, `check` with code, file, line and hint, fix, `build`); version negotiation off the MCP specification in either era (`_meta` on every request in 2026-07-28, `initialize` in 2025-11-25 and earlier); a path with `..`, an absolute path or a symlink leading out of the folder accepted; the schema tool serving anything but the committed `schemas/`; networking code or a networking crate in the server. The run with the network turned off needs `unshare -rn`, and is skipped where the system doesn't allow it. | `just test`, part of `just ci` |
| Pack guide and format reference (`docs/packs`; `crates/involo-pack/src/reference.rs` and `crates/involo-pack-cli/tests/walkthrough.rs`) | A schema description or problem code changed without `just pack-docs` (`generated-check` fails on any difference, or a generated page not added to git); a type, field or enum value in the pack format without a doc comment; a pack file or code missing from the reference; the walkthrough's commands printing something other than the page shows. | `just test` and `generated-check`, part of `just ci` |
| Fuzzing (`fuzz/fuzz_targets`) | A pack file, data file or pack folder that makes the loader panic, hang or run out of memory. Four targets: `pack_file` (a built pack file, checked and opened), `pack_edits` (a valid pack with fuzzer-chosen edits), `data_file` (`pack.json` and each YAML file) and `pack_folder` (a whole folder, with `extends` and patches). An input that fails is saved in `target/fuzz-artifacts/<target>/`; fix it and keep it as a test. | `just fuzz <target> [seconds]` (needs a nightly compiler and cargo-fuzz); weekly in CI |
| Dependencies (`deny.toml`, and `audit` in `pnpm-workspace.yaml`) | A Rust crate with a security advisory, yanked, or under a license outside the list in `deny.toml`, or from a source other than crates.io; two versions of one crate (reported, not failed). A JavaScript package the app ships with a high or critical advisory. | `just deny`, part of `just ci` |
| Size budget (`apps/web/size-budget.json`) | The built app (every file but the pack catalog), the WebAssembly module or the largest script growing past its limit. Each run prints the three sizes against their limits. | the last step of `just site`, part of `just ci` |
| The desktop app (`just desktop-check`, `just desktop-build`; the `desktop` job) | Clippy warnings and failing tests in the desktop app's Rust crate, and an installer that doesn't build, on Windows and macOS. `just ci` leaves the crate out (it needs the system webview to compile); the desktop host's TypeScript tests are in `just test`. | in CI on pull requests that touch the app, on main and on release tags; not a required check |
| Code scanning (CodeQL) | Security problems in the JavaScript, TypeScript and Rust, such as unsafe use of input or a weak pattern. Findings appear on the pull request. | in CI on every pull request and on main |
| Review shots (`just review-shots <out> <screen>...`) | Nothing by itself: they are for design review. Each named screen is shot at its sizes in both themes and put beside its approved board (`apps/web/build/review-boards.mjs`). | by hand, for the screens a pull request adds or changes |

The end-to-end tests need their browsers once:
`pnpm --filter @involo/web exec playwright install --with-deps chromium webkit`. On Linux without
administrator rights, `--with-deps` can't install the system libraries; install the browsers
without it and add the libraries Playwright names. A new flow goes in `apps/web/e2e`, starts from
`fixtures.ts` (a fresh browser, no network, helpers that act as a pilot does), sets up its state
with the scenes in `apps/web/build/scenes.mjs`, and calls `checkScreen` on each screen it reaches.

**When to include review shots.** A pull request that adds or changes a screen includes review
shots of those screens, each beside its board in both themes, and lists every difference from the
board. Other pull requests include none: the flows, the layout checks and the token rules cover
side effects. Add a row to `review-boards.mjs` when a new screen comes with its board.

**When a dependency or size check fails.**

- **An advisory** (`cargo deny` or `pnpm audit`): update to a fixed version (`cargo update -p <crate>`, or the version in the catalog in `pnpm-workspace.yaml`). If none exists yet, or the code the advisory names can't be reached from the app, add it to the ignore list (`[advisories] ignore` in `deny.toml`, `audit.ignore` in `pnpm-workspace.yaml`) with a comment saying what it is, why it is safe here and when to look again, and say so in the pull request. Remove it once a fix is in.
- **A license:** choose another crate, or a version under an allowed license. The list in `deny.toml` holds permissive licenses only, compatible with the app's MIT license; adding one is a change that needs agreement first (an issue, or a question in the pull request).
- **Two versions of one crate:** a warning, not a failure. Align the versions when an update allows it.
- **The size budget:** find what grew (the step prints each size and the file). If the growth is meant, raise the limit in `apps/web/size-budget.json` a little above the new size, and say in the pull request what grew and why.

Dependabot proposes updates every Monday: all minor and patch updates of each kind (Cargo, npm, GitHub Actions) in one pull request, and each major update on its own.

## 3. Pack content rules

Packs have their own guide, [`docs/packs/`](docs/packs/README.md): how to write one, the full
[content rules](docs/packs/content-rules.md), how the files fit together, panels, extending,
publishing, and a format reference generated from the code. The rules that are never broken:

- **Facts, in your own words.** Facts are checked against the aircraft's documentation and written
  in your own words. Manuals are never downloaded into, stored in, linked from or cited by the
  repository or a pack, and no manual text, tables or diagrams are copied or closely
  paraphrased.
- **No citations and no third-party links.** Each list has a `basis` naming only the kind of
  material it was checked against.
- **Never used as a basis:** second-hand study material and airline SOPs.
- **No files from aircraft developers, manufacturers or simulators:** no images, screenshots or
  PDFs.
- **Systems content** is labeled as the real aircraft, the simulator model, or both.

`involo-pack check` enforces the rules a program can see, and the maintainer reviews every content
change. If you are unsure whether something is acceptable, ask in your pull request before writing
the content.

## 4. Optional local files

A few checks read files that stay on your own computer and are never committed, uploaded or
synced anywhere public. Each is named by an environment variable. Without them everything else
works; the extra check is just skipped.

| Variable | Names | Used by | Without it |
| --- | --- | --- | --- |
| `INVOLO_OVERLAP_REFS` | a folder of plain-text reference files | `just overlap`, which flags pack text matching them | the check prints "not run"; it is run before merging content |
| `INVOLO_BASELINE` | a local copy of the earlier single-file HTML checklist (3.0) | `just review-shots`, which also shoots the same screens of it and writes side-by-side images | only the app's screenshots are taken |
| `INVOLO_STEPS` | a list of steps, one per line: `phase` or `reference`, the phase id and the step id, tab-separated, with an optional number | `just review-shots … tiles-01 …`, which shoots each named step's panel sheet and preview card | those shots don't exist |
| `INVOLO_PLAN` | a real SimBrief plan file (with `INVOLO_PLAN_OUT`, where to write its compact form) | the ignored test `measures_a_real_plan` in `crates/involo-simbrief` (`cargo test -p involo-simbrief -- --ignored`) | the test is ignored, as it is by default |

`just review-shots` shows every page one fixed time and one seeded random sequence, so two runs of
a build are pixel-identical and can be compared directly. Its Firefox profiles go in
`target/screenshots`, or in `~/involo-screenshots` when the checkout is under the system's
temporary folder (a sandboxed Firefox may not read there); `SCREENSHOTS_WORK` names another
folder. `SCREENSHOTS_ONLY` (shot key prefixes such as `board-log-phone`, comma-separated) names
screens by size or theme, and `SCREENSHOTS_THEME` (`dark` or `light`) shoots one theme.

## 5. Changelog and versions

- **Changelog.** A change a pilot or a pack writer would notice gets a line in `CHANGELOG.md`,
  under `## [Unreleased]` at the top (add the heading if it isn't there), in the section that
  fits: Added, Changed, Fixed or Removed. Say what changed for them, not how the code changed.
  A release renames that heading to its version and date.
- **Versions** are plain `0.x.y`, with no pre-release suffix such as `-beta.1`: a `0.x` version
  already marks the app as early. The app's version is `version` in the root `Cargo.toml`, and
  each pack has its own in its `pack.json`. A pack's `engine` range (`>=0.1.0, <1.0.0`) admits
  every plain `0.x` version of the app; a suffixed one would fall outside it under semver rules.
- **A release** is a `v<version>` tag on `main` (for example `v0.1.0`). Its GitHub release takes
  the notes in `docs/releases/<version>.md`, and the Pages workflow attaches the packs and the
  `involo-pack` command to it.

## Reporting problems

Open an issue with the aircraft, the checklist and step, what you expected, and your
source. For security problems, see [SECURITY.md](SECURITY.md) instead.
