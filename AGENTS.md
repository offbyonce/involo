<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Working on Involo

A guide for everyone who changes the code or the packs, people and AI agents alike. Read it with
`CONTRIBUTING.md` (sign-off, checks, content rules) and `docs/plan.md` (what we are building and
why). Decision records in `docs/decisions/` explain past choices; a change that would reverse one
starts with a discussion in an issue.

## What this project is

A free training app for flight simulator pilots: checklists, flows, memory items, CDU
walkthroughs and aircraft systems. Web first (decision 0009): a hosted web app on GitHub Pages
that installs and works offline, with the Rust core running as WebAssembly and a Svelte 5
interface; a desktop build (Tauri 2) is parked for later. Aircraft are data packs in `packs/`; the
engine never names an aircraft. **The app never connects to the simulator** (decision 0006).

## Non-negotiable rules

**Content and sources** (full rules in `CONTRIBUTING.md`):

- No per-step citations and no URLs to third-party material (decision 0007). Each list has a
  `basis` tag naming only the kind of material it was checked against. Never link the banned
  sites or second-hand study material; `involo-pack check` enforces this.
- Facts are checked against vendor documentation. No manual text, link or citation enters the
  repo. Facts only: never copy text, tables, diagrams or layout, never closely
  paraphrase, and write from our own flow structure. Never store, upload, link or cite them.
- Second-hand study material (Brainscape, SlideShare, AviationHunt, memory-item compilations) and
  airline SOPs are never used as a basis.
- Never add images, screenshots, PDFs or any files from an aircraft developer, manufacturer or
  simulator. Switch names, positions and values are facts and are fine.
  Open-licensed fonts (such as Geist and Geist Mono under the OFL) are allowed, bundled unmodified with their license.
- Label systems content as real aircraft, simulator model, or both.

**Code:**

- Logic lives in `crates/`. The host crates (`crates/involo-web-host`; the parked Tauri shell) and the
  interface stay thin. No aircraft names in engine code; differences come from pack data.
- Rust types are the single source of truth. Regenerate derived files, never edit them by hand:
  `just schemas` (JSON Schemas) and `just bindings` (TypeScript types).
- Every bug fix comes with a test that would have caught it.
- No `unsafe`. No new dependency without saying why; versions live once, in the root
  `Cargo.toml` and `pnpm-workspace.yaml`.

**Git:**

- Work on a branch, never directly on `main`. Never force-push, rewrite history or delete branches
  you did not create.
- Sign off every commit: `git commit -s`. Conventional Commit messages (`feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `pack(<id>):`).
- Commit messages carry no session links or session ids (no Claude-Session or similar trailers) and
  no machine names. Co-Authored-By lines are fine.
- Run `just ci` before every push. If it fails, fix it; never skip hooks or disable checks.
- Do not edit `.github/workflows/`, `deny.toml`, `lefthook.yml`, licenses or the decision records
  without the maintainer's explicit go-ahead.
- Never commit secrets, keys, tokens, personal names or email addresses, machine names or IP
  addresses. Test fixtures are invented and use generic names ("Pilot"). One exception: a
  copyright notice that a third-party license requires us to keep (for example on the copied
  Tabler icons, recorded in `REUSE.toml`) stays as written, even when it names a person.

**Interface design** (decision 0021, `docs/design/`):

- The boards in `docs/design/boards` are the specification, not inspiration. Every screen,
  overlay, view, label, caption, legend, color, spacing and order matches its board exactly, in both
  themes and at every size the boards show. Values come from `docs/design/tokens.json`.
- One exception: panel control drawings (switches, knobs, selectors, guards, lights). Their layout
  comes from the pack, and the renderer's drawing quality wins where it is better than the board's.
- "Drawn from pack data" means the pack stores what the board draws; it never permits redrawing.
- If a board cannot be matched exactly (missing data, a rule conflict, a page that does not exist
  yet), stop and ask the maintainer before building anything different.
- Every reviewer brief includes a side-by-side of each changed screen against its board, in both
  themes, with every difference listed; any difference the maintainer has not approved is a
  finding.

## Conventions

- **Changes that need agreement first.** Open an issue, or ask in your pull request, before
  changing the data model, the pack format, a public interface, licenses or the plan. Choices
  that matter get a short decision record.
- **Verify, don't guess.** Run the command, read the file, check the docs; say so when unsure.
- American English everywhere: code identifiers, pack field names, error messages, docs and pack content (color, behavior, license as a noun, optimize, pressurization).
  Exceptions keep their exact spelling: SPDX license IDs, file names such as `LICENSE` and `LICENSES/`, and anything quoted from outside sources.

## Repository map

| Path | What it is |
| --- | --- |
| `crates/involo-app-core` | App operations that do not depend on where the app runs; `AppError`, `AppInfo` |
| `crates/involo-checklist-core` | Domain: checklists, steps, sessions. No I/O. |
| `crates/involo-pack` | Pack manifest, strict YAML loading (`serde-saphyr`), validation, schemas |
| `crates/involo-pack-cli` | `involo-pack check <dir>`, `involo-pack schema <dir>`, `involo-pack build <dir>... <out>` (the pack catalog: one `<id>-<version>.involo-pack` per pack and `index.json`), `involo-pack overlap <dir>`, `involo-pack suggest-targets <dir>` (drafts step targets) |
| `crates/involo-pack-overlap` | Text-overlap check against private references, with its allow list (`allow.txt`) |
| `crates/involo-simbrief` | SimBrief OFP parsing |
| `crates/store` | SQLite saved data and migrations. Parked: not in the workspace (0010) |
| `crates/involo-web-host` | Thin WebAssembly glue for the web app; `just wasm` builds it (wasm-bindgen CLI at the crate's pinned version) |
| `apps/web` | Web site: the front page, the app at `app/` (web host in `src/`; `src/core.ts` calls the WebAssembly module; `src/sw/` and `build/` make the offline service worker), the SimBrief probe page and the drawing gallery. `just site` builds it into `apps/web/dist` (decisions 0009, 0010) |
| `apps/desktop` | Tauri shell (`src-tauri`) and its host. Parked: not in the workspace (0010) |
| `packages/ui` | The shared Svelte 5 interface and its host interface (`src/host.ts`) |
| `packages/bindings` | TypeScript types generated from Rust (`src/generated`), and `isAppError` |
| `tools/import-3x` | One-way converter from the 3.0 checklist to pack YAML (retired, kept for reference) |
| `packs/` | Content packs (CC BY-NC-SA 4.0) |
| `schemas/` | Generated JSON Schemas |
| `docs/` | Plan, phase briefs, setup guide, brand, design boards, decision records |

## Commands

```sh
just setup     # pnpm install + cargo fetch (once after cloning)
just dev       # run the web app's dev server
just test      # Rust and interface tests
just packs     # validate every pack
just site      # build the web site into apps/web/dist (WebAssembly, app, then the pack catalog in packs/)
just catalog <out>  # build the published packs' catalog into <out>
just test-packs     # the catalog tests and the dev server read, with the example pack, in target/test-packs
just update-test  # service worker update test in headless Firefox (local; needs Firefox)
just e2e       # end-to-end flows with layout and accessibility checks (Chromium, WebKit)
just review-shots <dir> <screen>...  # review shots of named screens beside their boards
just fuzz <target> [seconds]  # fuzz a pack loader target (nightly and cargo-fuzz; not in just ci)
just ci        # everything; must pass before a push
just overlap   # compare packs with local reference files
```

`just overlap` and parts of `just review-shots` use optional local files named by `INVOLO_*`
variables; without them those extra checks are skipped. `CONTRIBUTING.md` ("Optional local
files") lists each one.

Rust is pinned in `rust-toolchain.toml` (1.99). Newer clippy versions add lints, so always run
`just ci` with the pinned toolchain, not an older one.
