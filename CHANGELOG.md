<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Changelog

Every release of the Involo app and its packs, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are plain `0.x.y`
(CONTRIBUTING.md, "Changelog and versions").

## [0.1.0] - 2026-11-23

The first public beta: Involo as a web app that installs and works offline, and a desktop app
for Windows and macOS, with the iFly 737 MAX 8 pack. It replaces the single-file 3.0 checklist and keeps every one of its 510 steps.

### Added

- **The web app** at <https://offbyonce.github.io/involo/>. It installs from the browser and
  keeps working offline. Updates download in the background and wait for Reload.
- **The desktop app** for Windows and macOS, attached to the release as unsigned installers with
  a SHA-256 sum for each. The same app, keeping your progress, settings, log and packs as files on
  your computer; a backup file moves them between the two apps. When Involo starts, it checks
  GitHub for a newer release and says so (Settings › Check for updates turns it off); it never installs
  anything by itself.
- **The iFly 737 MAX 8 pack** (0.1.0): 65 checklists and 527 steps across five stages, from cold
  and dark or a turnaround, with the exterior inspection's 18 stops and a top view of the
  airplane.
- **Two ways through a phase:** List, or Step by step with one large step at a time. Full or
  Essentials, and Essentials you can make your own.
- **Step details:** what to check, what to do if it isn't so, why it matters and how to do it,
  each control's place on a drawing of its panel, and a Flight deck page with every panel.
- **Your flight:** import the latest SimBrief plan, or a saved OFP file offline. The plan's values
  fill the steps that need them, and the flight strip keeps the clearance and your notes.
- **CDU walkthroughs** for the flight computer's set-up pages, with the plan's values.
- **Decision steps, step timers and briefings** in the flow.
- **An Emergency reference**, with non-normal lists in larger type.
- **Practice, How procedures work, the Glossary and References.**
- **A flight log** of every flight you log, kept on the device, with export as CSV or JSON, and
  printing.
- **Back up and restore** your progress, settings and log as one file. A restore also reads a file
  exported by the 3.0 checklist. After a logged flight the app offers a backup reminder, and it
  asks the browser to keep the site's data.
- **Settings:** light and dark, dimming, step info, seat, Keep screen awake, Your Essentials,
  Start (cold and dark or a turnaround) and Clear all progress, each with Undo where it removes
  something.
- **A guided tour**, Find (Ctrl+K), open steps across pages and keyboard keys (Space, ←, S).
- **A privacy note** in Settings › Privacy: what the app stores, where, and what it sends.
- **Report a problem with a step**, from every step's menu, as a GitHub issue form with the step
  filled in.
- **Packs:** add a pack from a file, and update installed packs from this site's catalog.
- **The `involo-pack` command** for pack writers: `new`, `check`, `explain`, `describe`, `build`,
  and an MCP server for coding agents. Release builds for Windows, macOS and Linux are attached to
  the release.

### Notes

- **For simulator use only.** Never use these checklists for real-world flight.
- The app never connects to the simulator and sends nothing about you anywhere. Everything is
  stored in your browser on this device (SECURITY.md).
- Tested in Chromium and WebKit at phone and desktop sizes, and the update path in Firefox.

[0.1.0]: https://github.com/offbyonce/involo/releases/tag/v0.1.0
