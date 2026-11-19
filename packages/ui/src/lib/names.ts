// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The names the app shows for steps and controls. Rust works them out once, when it reads the
// pack (involo-app-core's names.rs), and every screen reads them here, so a step has one name
// everywhere: the checklist, the step pane, Find, Practice, the flight log and the update note.

import type { Control, Step } from "@involo/bindings";
import type { PackIndex } from "../pack-index";

/** A step's name as the app shows it ("Fuel pump switches", "STANDBY POWER switch"). */
export function stepTitle(index: PackIndex, step: Step): string {
  return index.stepName(step.id) ?? step.text;
}

/** A control's name as the app shows it. */
export function controlName(index: PackIndex, control: Control): string {
  return index.controlName(control.id) ?? control.name;
}
