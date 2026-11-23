<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0031: A desktop app beside the web app, for Windows and macOS

Date: 2026-11-17. Status: accepted. Amends [0009](0009-web-first-delivery.md); brings
[0005](0005-updates-and-signing.md) back into force for the desktop build.

## Context
0009 put the desktop app aside so the beta could reach tablets and consoles with nothing to
install. That still holds for those pilots. For pilots on a computer, a desktop app keeps packs and
progress as files the browser cannot clear, and lets pack authors see a pack change as they save
it. The shell is parked, not deleted (`apps/desktop/PARKED.md`).

## Decision
- **Both ship in the beta**: the web app, unchanged in purpose, and a desktop app for **Windows and
  macOS**. Linux follows later. Both use the same interface (`packages/ui`) and Rust crates; the
  desktop app is a Tauri 2 host that implements the same host interface as the web host.
- **One version number** for both. A GitHub release carries the desktop builds, the pack files and
  the catalog. From the first release, the web site is deployed from release tags (after CI
  passes), so the site, the catalog and the desktop builds always match; until then it deploys from
  `main` after CI passes.
- **Files on disk.** Settings, flights, plans and the flight log are JSON files in the app's data
  folder (`com.offbyonce.involo`), in the same saved formats as the web app, each written to a
  temporary file and then renamed into place. Installed packs are files in a `packs` folder there.
  The export file is the same format in both apps, so progress moves between them. `crates/store`
  (an earlier SQLite design for the old session model, already outside the workspace) is removed.
- **Packs** come from the same catalog and Add from file (0028). The desktop app also offers
  **Open a pack folder for authoring**: it builds an unbuilt pack in place and reloads it when a
  file is saved, showing `check` errors on screen.
  Amended 2026-11-23: authoring mode comes in 0.2.0; the beta's desktop app ships without it.
- **Updates** stay notify-only (0005): the app checks the latest release and links to it. The
  updater key is generated and backed up before the first desktop release.
- **Signing.** Windows builds are signed through the SignPath Foundation once approved; until
  then they ship unsigned with a note about the SmartScreen warning. macOS beta builds ship
  unsigned, with instructions for opening them; signing and notarizing with an Apple Developer ID
  comes later.
- **No simulator connection** (0006), on desktop as on the web.

## Consequences
- The steps in `PARKED.md` are done: the shell rejoins the workspace, CI builds on Windows and
  macOS, Tauri's licenses return to `deny.toml`, and the advisories are reviewed. No desktop build
  was released under the old identifier, so the data-folder move in step 7 is not needed.
- The shell rejoins the workspace as a member but not a default member, so `just ci` and the
  Linux job do not build it and Linux CI needs no WebKit. A separate desktop job builds it on
  Windows and macOS for pull requests that change the desktop host, `packages/ui` or the shared
  crates, and for release tags.
- SECURITY.md covers both apps (issue #48).
- Tablet and console pilots keep the web app; nothing they use depends on the desktop app.
