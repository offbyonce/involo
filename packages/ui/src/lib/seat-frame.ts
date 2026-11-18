// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The seat view to draw (decision 0029). A pack gives one frame, or one per seat. Until the
// interface shows crew roles and the chosen seat, it draws the one frame, or the frame of the
// first seat the labels list (Rust's `OverviewViews::seat_frame` with no role and no choice).

import type { Labels, SeatViews, ViewFrame } from "@involo/bindings";

const isFrame = (s: SeatViews): s is ViewFrame => typeof (s as ViewFrame).width === "number";

/** The seat frame to draw, or null when the pack has none. */
export function seatFrame(
  seat: SeatViews | null | undefined,
  labels: Labels | null | undefined,
): ViewFrame | null {
  if (!seat) return null;
  if (isFrame(seat)) return seat;
  for (const s of labels?.seats ?? []) if (seat[s.id]) return seat[s.id] ?? null;
  return Object.values(seat)[0] ?? null;
}
