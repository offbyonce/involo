<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

How procedures work, part 2: the flow as a path across the panels (the HowItWorks board), drawn
shape for shape in panel colors. The boxes are drawn as the Flight deck map draws its panels (fill
and stroke), and the labels as its area labels: 11 px, semibold, panel label color, no tracking
. A schematic of the idea, not of any one flight deck.
-->
<script lang="ts">
  import { HOW } from "./how-content";
  import { LABEL_MIN } from "./panel-layout";

  const f = HOW.figure;
</script>

<svg viewBox="0 0 300 234" role="img" aria-label={f.flowLabel}>
  <rect x="20" y="14" width="260" height="46" rx="4" />
  <rect x="20" y="72" width="110" height="30" rx="4" />
  <rect x="140" y="72" width="140" height="30" rx="4" />
  <rect x="20" y="114" width="260" height="46" rx="4" />
  <rect x="110" y="172" width="80" height="52" rx="4" />
  <text class="label" x="26" y="27" style:font-size="{LABEL_MIN}px">{f.panels.first}</text>
  <text class="label" x="26" y="85" style:font-size="{LABEL_MIN}px">{f.panels.second}</text>
  <text class="label" x="26" y="127" style:font-size="{LABEL_MIN}px">{f.panels.third}</text>
  <text class="label" x="116" y="185" style:font-size="{LABEL_MIN}px">{f.panels.fourth}</text>
  <path d="M40 50 H290 V96 H10 V150 H290 V210 H150" stroke-width="2.5" />
  <circle cx="40" cy="50" r="4" />
  <circle cx="150" cy="210" r="4" />
  <text class="end" x="48" y="45">{f.start}</text>
  <text class="end" x="141" y="214" text-anchor="end">{f.end}</text>
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
    width: calc(var(--size-map-figure) + var(--space-4) + var(--space-1));
    max-width: 100%;
    height: auto;
  }
  /* The Flight deck map's panels (DeckMap, OverviewMap). */
  rect {
    fill: var(--panel-fill);
    stroke: var(--panel-stroke);
    stroke-width: 1;
  }
  text {
    font-family: var(--font-sans);
  }
  /* The map's area labels. */
  .label {
    fill: var(--panel-label);
    font-weight: var(--weight-semibold);
  }
  path {
    fill: none;
    stroke: var(--panel-changed);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  circle {
    fill: var(--panel-changed);
  }
  .end {
    fill: var(--panel-changed);
    font-size: 10px;
    font-weight: var(--weight-bold);
  }
</style>
