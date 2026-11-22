<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0033: Calculated flight values

Date: 2026-11-22. Status: accepted. Extends [0029](0029-pack-format-6.md) (flight fields), which
is not released yet.

## Context
The CDU walkthrough (#215) shows values the CDU works out from others:
- **Gross weight** on PERF INIT is zero fuel weight plus plan fuel.
- **Plan fuel** is written in thousands, rounded up to a tenth.
- **Top-of-climb temperature** comes from the cruise level and the ISA deviation.

3.0 calculated these in its page code. Today they stay blank.

Today a flight field gets its value in one of two ways:
- **Typed by the pilot.**
- **Filled from a SimBrief plan.** When a field names several plan sources, their values are
  added. This is how the reserves are filled.

That second way could fill gross weight from the plan (ZFW plus block fuel), but not from what the
pilot entered. Two things go wrong:
- **Hand edits are lost.** If the pilot corrects the fuel or the ZFW on the Flight pages, the gross
  weight would not follow.
- **The tenths can differ.** The CDU adds the two values the pilot typed, each already rounded up to
  a tenth. A plan total rounded once can come out a tenth away from that.

CDU text has no arithmetic on purpose: calculations happen in the app, never in the pack. Packs
can't carry code, and the engine names no aircraft.

## Decision
- **A flight field may be `calculated`.** It names one of the app's calculations and the pack's
  fields that it reads. The list of calculations is the app's, like the SimBrief sources: a pack
  chooses among them but cannot add one. There are no expressions or templates.
- **The app starts with three calculations:**
  - **`sum`**: two or more number fields added together, for example `sum: [zfw, fuel_thousands]`.
    They must share a unit field, and the result keeps the most decimals any input has
    (126.5 + 12.4 = 138.9).
  - **`scale`**: one number field divided and rounded, for example `scale: { field: fuel, scale:
    1000, round: up, step: 0.1 }`. Its rules are the same as `display`, which stores plan numbers
    in thousands today.
  - **`isa_temperature`**: the standard atmosphere's temperature at a flight level, plus a
    deviation, in whole degrees Celsius, for example `isa_temperature: { level: cruise_level,
    deviation: isa_deviation }`. The standard atmosphere is 15 °C at sea level, falling 1.98 °C
    per 1,000 ft, down to −56.5 °C from 36,089 ft.
- **A calculated value is never stored.** The app works it out each time it reads the flight, so it
  follows the pilot's entries and a new plan. When any input is unknown, the value is unknown, and
  CDU text shows its `empty` text.
- **A calculated field is read-only.** It has no `simbrief`, `input` or `display`. It may appear
  on a Flight page, as a read-only row.
- **A calculated field may read another one**, as gross weight reads plan fuel in thousands.
- **`pack check` checks the inputs:**
  - Every input field exists and is a number.
  - The fields in a `sum` share a unit field.
  - A `scale` follows `display`'s rules.
  - No field reads itself, directly or through other calculated fields.
- **The iFly pack** calculates:
  - `fuel_thousands` as `scale` of `fuel`;
  - `gross_weight` as `sum` of `zfw` and `fuel_thousands`;
  - `top_of_climb_oat` as `isa_temperature` of `cruise_level` and `isa_deviation`.
- **Optional, so packs without it still load.** Format 6 is not released yet, so `calculated` joins
  format 6 rather than starting format 7.

## Consequences
- The schemas, the format reference, the guide and `involo-pack describe` cover `calculated`.
- PERF INIT shows gross weight, plan fuel and top-of-climb temperature with or without a plan. They
  are worked out from whatever the Flight pages hold.
- A new calculation is an app change, decided like a new SimBrief source, never a pack's own
  formula.
- Not part of this decision, because they don't raise this question:
  - The plan's departure time and date, and the database dates.
  - How the CDU writes wind and temperatures.
  - The route split.
