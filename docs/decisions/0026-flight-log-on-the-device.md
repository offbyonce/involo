<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0026: The flight log is saved on the device, never sent

Date: 2026-11-16. Status: accepted (2026-11-16). Builds on [0012](0012-app-state.md).

## Context
0012 planned a log of filed flights and left saving past flights and practice results open. The Log boards
settle it: pilots keep their past flights and
practice scores, and nothing about them leaves the device. A full log is large: every tick of
500 flights is several megabytes, more than the browser storage the flight and settings use
(about 5 MB per site).

## Decision
- **Saved locally only, never sent.** The log holds the flights the pilot logs and each finished
  practice test's date, name and score. It never goes to a server; exports (HTML copy, CSV,
  JSON, print) are files made on the device that the pilot keeps.
- **Where.** On the web, in IndexedDB under the app's own name (`involo`); the flight, settings
  and plan stay in browser storage. The first time a flight is logged, the app asks the browser
  to keep its data (`navigator.storage.persist()`); if it refuses, nothing changes and the log
  page's note says to export now and then. The desktop app keeps the log in its own data folder,
  like its other saved data.
- **A versioned format with migrations.** `app-core` owns the `Log` type (format 1): flights and
  practice results, newest first. It is read like the flight (0012): an older format migrates
  forward, and a newer or unreadable log is kept as it is and reported, and nothing is saved over
  it. A frozen format 1 file is tested, so data saved today keeps loading after later changes.
- **Each entry stands alone.** A logged flight copies in what it shows: date, route, aircraft,
  off-blocks and on-blocks (the first and last tick), the time in each stage, steps done of the
  total, the skipped steps with where they were, every tick with its value, where the plan came
  from (SimBrief or entered by hand) and whether the last phase was done. It reads the same after
  the pack changes or on another device.
- **The pilot decides what is logged.** "Log flight and start new" logs the flight; finishing the
  last phase only offers it, once. Reset flight plan never logs. Only "Delete this flight" removes
  an entry, with Undo.
- **Bounded.** The newest 500 flights and 500 practice results are kept; saving more drops the
  oldest, and the log page says so. Loading a log file merges it, skipping entries already there
  (by id), under the same limit.

## Consequences
- Rules (entries, merging, the limit, CSV) are in Rust and tested there; the interface stores the
  text and shows it.
- Clearing the browser's site data still removes the log, as with all saved data. The export note
  says so.
