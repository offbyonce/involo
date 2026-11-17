<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0028: Several packs, chosen and installed from the app

Date: 2026-11-17. Status: accepted. Amends [0009](0009-web-first-delivery.md),
[0012](0012-app-state.md) and [0026](0026-flight-log-on-the-device.md).

## Context
Packs exist so that one app can teach any aircraft: a pilot gets the app, adds the packs they
want, and switches between them, with no change to the app. Today the app is built with the iFly
pack inside it, opens only the first aircraft pack it finds, and keeps one flight. The design
review of 2026-11-17 found the rest of the gaps (pack format 6, decision 0029).

## Decision
- **The app ships with no aircraft.** On first launch, and from the menu, a **Packs** page lists
  the official packs. The pilot downloads the ones they want. The app works offline once a pack
  is installed.
- **The catalog is static files published with the app**: `packs/index.json` and one file per
  pack version, on the same site as the web app and attached to each GitHub release. Each entry
  gives the pack id, name, aircraft block, version, the app versions it needs, size and SHA-256.
  No request carries anything about the pilot. The desktop app reads the same catalog (0031).
- **A pack is one file**: the flattened, built pack (`<id>-<version>.involo-pack`, JSON inside).
  Packs are data only. They carry no code, markup, fonts, images or colors, and text is always
  shown as text.
- **Add from file** installs a pack that is not in the catalog. It is marked "Not from the
  Involo catalog" wherever the pack is named.
- **Every pack is checked on install** by the same Rust validation as `pack check`, run in the app.
  A pack that fails, or needs a newer app, is refused with the reason. A catalog download whose
  SHA-256 differs is refused.
- **Updates.** When online, the app reads the catalog at launch and shows "Update available" on
  the Packs page. Nothing updates without the pilot's tap. One version of each pack is installed.
- **Switching.** The current pack is a setting (settings format 7, with a migration). The pilot
  switches from the Packs page and from the pack line at the top of the menu.
- **Each pack keeps its own flight.** One flight per pack (amends 0012's one flight), with its
  ticks, values, plan and notes. Switching packs and back returns to where that flight was.
- **A pack update during a flight** keeps the ticks: saved step ids pass through the pack's
  `aliases`. A note then says what changed (steps added, removed and reworded, and ticks that
  could not be kept) with a list to open. The note stays until dismissed.
- **SimBrief.** A plan whose aircraft type is not one of the pack's `icaoTypes` gets a warning
  naming both. The pilot may continue or cancel.
- **The flight log and practice results** record the pack id, version and aircraft name (log
  format 2, with a migration). The log, Practice and export can filter by pack.
- **Removing a pack** asks first. Its saved flight and plan stay unless the pilot also ticks
  "Remove its saved flight". Export and import of progress (issue #47) cover every pack.

## Consequences
- Pack files are no longer bundled into the app's code. They are separate files published on the
  same site and installed at run time; 0009's "one file per aircraft, built at build time" now
  means one file per pack version, built at release time.
- Install runs the same Rust validation as `pack check`, through an entry point that takes a
  flattened pack instead of a folder.
- Browser storage holds the installed packs (IndexedDB). Clearing site data removes them; the
  Packs page reinstalls in one tap, and the persistent-storage request in 0009 covers them.
- The Packs page, the pack line in the menu, the update note and the SimBrief warning need boards
  before they are built.
- A pack from a file can say anything in its own words. The catalog label, the in-app checks and
  data-only packs limit what it can do, not what it says.
