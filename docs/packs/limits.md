<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Pack limits

A pack is a file anyone can add to the app, so the app and `involo-pack check` read every pack
within these limits. Each one is many times what the largest pack today needs: the iFly 737 MAX 8
is a 0.6 MB built file with 527 steps and 152 glossary terms, and none of its files is over
62 KB. A pack over a limit is refused with a message that names the limit and where the pack goes
over it; nothing else in the pack is checked until it fits.

The limits are set in one place, `crates/involo-pack/src/limits.rs`, and a test checks that this
page gives the same values.

## Files

| Limit | Value | Refused with, for example |
| --- | --- | --- |
| A built pack file (`.involo-pack`) | 16 MB | The file is over 16 MB, the most a pack file may be. |
| `pack.json` or any YAML file in a pack folder | 4 MB | `glossary.yaml: the file is 4.1 MB, over the 4.0 MB a pack may use for it` |
| A file a manifest names | inside the pack folder | `the path must stay inside the pack folder (no ..)`, `the path must be relative to the pack folder` |
| Text | UTF-8 | `smoke.yaml: the file is not UTF-8 text (an invalid byte at 200)` |

## Inside a file

| Limit | Value |
| --- | --- |
| How deeply maps and lists nest in a YAML file | 64 levels |
| How deeply maps and lists nest in a JSON file (`pack.json`, a built pack) | 128 levels |
| Values in one YAML file (each map, list and value in them) | 250,000 |
| Aliases (`*name`) in one YAML file | 10,000 |

A file past one of these says so with its line and column, for example `smoke.yaml: line 17 column
75: maps and lists nest too deeply; a pack file may nest them at most 64 deep`.

## What a pack holds

| Limit | Value | Refused with |
| --- | --- | --- |
| Steps, over all of a pack's lists | 5,000 | `lists: the pack has 5013 steps; the most a pack may have is 5000` |
| Glossary terms | 2,000 | `glossary: the glossary has 2001 terms; the most a pack may have is 2000` |
| A step's text, or a control's name | 300 characters | `<step id>: its text is 389 characters; the most is 300` |
| Packs in one `extends` chain, the pack itself included | 8 | `the extends chain … is longer than 8 packs, the most a pack may build on` |

The app names every step and control when it reads a pack, looking each word up in the glossary:
at these limits, naming a whole pack takes a few hundredths of a second.
An `extends` chain may not loop back on itself (`extends makes a cycle: a → b → a`).
