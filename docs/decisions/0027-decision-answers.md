<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0027: A value per answer, suggestion rules and saved answers

Date: 2026-11-16. Status: accepted (2026-11-16); the center tank suggestion waits for a simulator
check. Builds on [0022](0022-conditional-controls-and-decision-steps.md) and
[0014](0014-pack-format-3.md).

## Context
0022 added decision steps and targets that depend on their answer, for the center tank question
before Fuel pump switches. Three things it left open stopped that step from shipping:
- **One value per step.** A step has one `expect`, so the fuel step could not read "MAIN PUMPS ON ·
  CENTER PUMPS OFF" once answered.
- **No suggestion rule.** 0022 let an option name a flight field that suggests its answer, but
  nothing turns a plan's figure into an answer. A SimBrief plan gives block fuel, not fuel per tank.
- **Answers not saved.** How an answer was given (by the pilot, from the plan, or changed) lasted
  only for the session.

## Decision
- **A value per answer.** A step may carry `expect_when: [{ option, equals, expect }]`. Once the
  option is answered, the matching `expect` shows; until then the step's own `expect`. `pack check`
  holds each to a real option and value, once each, on a step with targets that depend on that
  answer. Each value must name the position its targets set, and where two answers set an item
  differently, the parts of their values that differ must each name their own answer's position
  (0018's wording rule).
- **A suggestion rule.** An option's `suggests` may be a rule: a fuel weight from the flight
  (`field`), less `minus_lb`, above `more_than_lb` suggests `then`, otherwise `otherwise`. kg are
  converted to lb. With no value, or with `minus_lb` at 0, nothing is suggested and the pilot
  answers. A bare field, as format 4 allowed, suggests nothing. `pack check` holds the field to a
  fuel weight and the values to the option's own.
- **The center tank.** Its rule subtracts what the two wing tanks hold. That capacity is checked in
  the simulator before it ships; until then `minus_lb` is 0 and there is no suggestion.
- **Pack format 5.** A format 4 app would refuse these fields as unknown, so `SCHEMA_VERSION` is 5.
  Packs at 3 and 4 still load; every new field is optional.
- **Flight format 3.** A flight records how each decided option was answered (`answers`: `you`,
  `plan` or `changed`). A format 2 flight loads with no records; an answered option with no record
  reads as answered by the pilot. Only an option a decision step asks takes an answer, and Reset
  flight plan clears the answers, so the next flight asks again.

## Consequences
- Before start asks the center tank question; the fuel step then shows its value for the answer
  and draws the center switches at it, marked ◆.
- The suggestion appears once the wing tanks' capacity is in the pack, with no further format change.
- Any later decision with a numeric suggestion uses the same rule.
