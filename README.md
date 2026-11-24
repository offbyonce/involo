<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Involo (formerly Chock to Chock)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/involo-lockup-on-dark.svg">
  <img src="assets/brand/involo-lockup-on-light.svg" alt="Involo" height="48">
</picture>

A procedures trainer for flight sim pilots. Involo is Italian for "takeoff".

Involo is a free training app for flight simulator pilots. It teaches the
procedures: checklists, flows, memory items and how the aircraft's systems work, and it
imports your SimBrief flight plan. It never connects to the simulator, so it works
alongside MSFS on a PC, a Mac, an Xbox or a PlayStation. Aircraft are data packs, so new
aircraft can be added without changing the app.

> **Status:** public beta, version 0.1.0. Open the app at
> **[offbyonce.github.io/involo](https://offbyonce.github.io/involo/)**: it installs from your
> browser and works offline. It starts with the iFly 737 MAX 8 and replaces the single-file 3.0
> checklist. A desktop app for Windows and macOS comes with each release. What changed in each
> release is in [CHANGELOG.md](CHANGELOG.md).

**For simulator use only.** Never use these checklists for real-world flight.

## The desktop app

The same app for Windows and macOS, keeping your progress as files on your computer. Download it
from the [latest release](https://github.com/offbyonce/involo/releases/latest):

| System | File |
| --- | --- |
| Windows (64-bit) | `Involo_<version>_x64-setup.exe` |
| macOS, Apple silicon (M1 and later) | `Involo_<version>_aarch64.dmg` |
| macOS, Intel | `Involo_<version>_x64.dmg` |

Each file has a SHA-256 sum beside it on the release; check your download against it. A backup
file (Settings › Back up and restore) moves your progress between the web app and the desktop app.

**The builds are not signed yet,** so your system warns before opening them the first time:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info**, then **Run
  anyway**. If Smart App Control is on, it blocks unsigned apps and has no such choice; the web
  app works without installing anything.
- **macOS:** Gatekeeper says the app can't be checked. Open the disk image, drag Involo to
  Applications, then Control-click Involo there and choose **Open**, and **Open** again. If macOS
  offers only **Done**, open **System Settings › Privacy & Security**, find the message about
  Involo near the bottom, and choose **Open Anyway**.

The app checks GitHub for a newer release when it starts and says so; it never installs anything
by itself (Settings › Check for updates turns this off).

## Repository layout

| Path | What it is |
| --- | --- |
| `crates/involo-app-core` | App operations shared by every host |
| `crates/involo-checklist-core` | The checklist domain: steps and sessions. No I/O. |
| `crates/involo-pack` | Pack loading (YAML), validation and schemas |
| `crates/involo-pack-cli` | The `involo-pack` command for writing, checking and building packs |
| `crates/involo-pack-overlap` | The text-overlap check against local reference files |
| `crates/involo-simbrief` | SimBrief flight plan parsing |
| `crates/involo-web-host` | WebAssembly glue for the web app |
| `apps/web` | The web app (GitHub Pages) |
| `apps/desktop` | The desktop app for Windows and macOS (Tauri 2) |
| `packages/ui` | The shared interface (Svelte 5) |
| `packages/bindings` | TypeScript types generated from Rust |
| `packs/` | Aircraft packs (checklist content), and invented example packs in `packs/examples` |
| `schemas/` | JSON Schemas for pack authors (generated) |
| `fuzz/` | Fuzz targets for the pack loader (`just fuzz`) |
| `tools/` | Repository checks and the retired 3.0 converter |
| `assets/` | The brand: logo, lockups and icons |
| `LICENSES/` | The license texts (REUSE) |
| `docs/` | The plan, phase briefs, setup guide, pack guide, design boards and decision records |

## Getting started

See [docs/setup.md](docs/setup.md) to install the tools, then:

```sh
just setup   # install packages
just dev     # run the app
just ci      # run every check
```

## Contributing

Contributions are welcome, especially checklist fixes and new aircraft. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) first: every commit needs a sign-off, and checklist
content has strict rules about sources. This is a hobby project, so responses are
best-effort.

## Licenses

- **Code** is MIT ([LICENSE](LICENSE)).
- **Checklist content** in `packs/` is
  [CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt): share and adapt it with credit, but
  not commercially, and keep the same license on anything you make from it.
  Want to use the checklists commercially? Contact the maintainer.
- **The Involo name and logo** (`assets/brand/`, the app icons) are all rights reserved, with
  permission to use the logo unmodified to refer to Involo
  ([LicenseRef-Involo-Brand](LICENSES/LicenseRef-Involo-Brand.txt); see
  [docs/brand/BRAND.md](docs/brand/BRAND.md)).

Each file's license is recorded with [REUSE](https://reuse.software).

Aircraft and product names belong to their owners. Involo is not affiliated with
Microsoft, iFly, PMDG, Navigraph/SimBrief or any aircraft developer, and ships none of
their files, images or manuals.
