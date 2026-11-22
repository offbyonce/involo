<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0032: A top view of the airplane for the exterior inspection

Date: 2026-11-22. Status: accepted. Extends [0023](0023-side-and-seat-views.md); part of pack
format 6 ([0029](0029-pack-format-6.md)), which is not released yet.

## Context
The exterior inspection (the walkaround boards, which replace the Exterior boards) draws a top view
of the airplane with a numbered marker at each stop. Packs already place the stops: a step's
`walkaround` has an `x` and `y`. But those points belong to no frame, and the format has no outline
to draw them on. Packs cannot hold images, and the renderer names no aircraft, so the outline has to
come from pack data. The side and seat views (0023) already solve this for the flight deck: frames
of shapes in their own units, colored by role.

## Decision
- The overview's `views` may have a **`top`** frame beside `side` and `seat`: the airplane seen
  from above, nose up. It is the same kind of frame: a `width` and `height`, `shapes` and
  `labels`, all in its own units.
- Its shapes use the roles `structure` (fuselage, wings, tail, engines) and `glass`. A curve or an
  ellipse is given as many points, as in the side view. A top view has no `places`, `seat` or
  `eye`.
- **Walkaround points are in the top view's units.** `x` and `y` keep their meaning and type; the
  frame now says what they are measured against. The renderer leaves room around the frame for the
  stop markers, as the boards draw them, so a stop on a wingtip is not cut off.
- A stop's number is its step's `number`, and its marker shows the stop shown, done, skipped or to
  do from the step's state. Nothing about the stops is added to the format.
- `pack check` holds the frame to the pack: every shape and label lies inside it, shapes have three
  points or more, and every walkaround point in the pack lies inside it. A pack with walkaround
  points and no top view gets a warning, not an error. Its inspection then stays an ordinary list,
  as it is today.
- The iFly pack's top view is the walkaround boards' drawing, carried over shape for shape in the
  board's units, so the 18 stops stay where they are (curves and engine ellipses as points). The
  design is the reference, never a manual or image. The example packs get invented outlines.
- Optional, so packs without it still load. Format 6 is not released yet, so it joins format 6
  rather than starting format 7.

## Consequences
- The schemas, the format reference, the guide and `involo-pack describe` cover `views.top`. The
  guide drops walkaround points from "Accepted but not shown yet".
- The top view is drawn in the step pane and the phone's step card (the walkaround boards) with no
  further format change. Stops are the list's steps, so their ticks and skips save with the flight
  as they do today.
- Another aircraft pack draws its own top view with the same roles; a high wing, a T-tail or a
  twin boom are only different points.
