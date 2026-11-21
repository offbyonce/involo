// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The seat view "Where is this?" draws for the step on screen (decision 0029). Rust picks the
// frame (the seat of the step's role, then the pilot's seat, then the first); the app asks it when
// the step or the seat changes and hands the answer down by context.

import type { ViewFrame } from "@involo/bindings";
import { getContext, setContext } from "svelte";

/** The seat frame for the step on screen; null when the pack draws no seat view. */
export type SeatView = { readonly frame: ViewFrame | null };

const KEY = Symbol("seat-view");
const NONE: SeatView = { frame: null };

/** Gives the components below the seat view to draw. */
export function setSeatView(view: SeatView): void {
  setContext(KEY, view);
}

/** The same, as a context map, for a component rendered on its own (tests, galleries). */
export function seatViewContext(view: SeatView): Map<symbol, SeatView> {
  return new Map([[KEY, view]]);
}

/** The seat view the app gave, or none (a component drawn on its own). */
export function getSeatView(): SeatView {
  return getContext<SeatView | undefined>(KEY) ?? NONE;
}
