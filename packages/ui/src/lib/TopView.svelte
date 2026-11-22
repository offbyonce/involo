<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The exterior inspection's top view (#216, walkaround boards; decision 0032): a panel drawing titled
"The walkaround · stop <n> of <total>" with "↑ Nose", the airplane from the pack's top view, and
every stop of the list at its walkaround point, numbered: the one shown filled in accent with its
number in on-accent (the Done button's pairing) and a ring, done ones in the done colors, skipped
ones with a dashed amber ring, the rest outlined. A legend names each state, so color is never the
only cue. One image, whose text alternative names the stop shown and how many are done and skipped.
-->
<script lang="ts" module>
  /** One stop: its number, its step's name, its point in the top view's units, and its state. */
  export type Stop = { id: string; number: string; name: string; x: number; y: number; state: "here" | "done" | "skipped" | "to_do" };
</script>

<script lang="ts">
  import type { ViewFrame } from "@involo/bindings";

  let { frame, stops }: { frame: ViewFrame; stops: Stop[] } = $props();

  /** The boards' marker sizes are for a top view 420 units long; a larger or smaller view scales
   * them, so a stop is the same size on screen whatever units the pack uses. */
  let s = $derived(Math.max(frame.width, frame.height) / 420);
  /** Room around the frame for the markers at its edges (a stop on a wingtip), as the boards draw. */
  let box = $derived(`${-24 * s} ${-14 * s} ${frame.width + 48 * s} ${frame.height + 26 * s}`);
  let here = $derived(stops.find((t) => t.state === "here"));
  let done = $derived(stops.filter((t) => t.state === "done").length);
  let skipped = $derived(stops.filter((t) => t.state === "skipped").length);
  let alt = $derived.by(() => {
    const parts = [`Top view of the airplane with ${stops.length} numbered stops.`];
    if (here) parts.push(`Stop ${here.number}, ${here.name}, is current.`);
    const counts = [done ? `${done} done` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean);
    if (counts.length) parts.push(`${counts.join(", ")}.`);
    return parts.join(" ");
  });
  const path = (points: number[][], closed: boolean) =>
    `M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")}${closed ? " Z" : ""}`;
</script>

<figure class="top">
  <div class="head">
    <span class="title">The walkaround{here ? ` · stop ${here.number} of ${stops.length}` : ""}</span>
    <span>↑ Nose</span>
  </div>
  <svg viewBox={box} role="img" aria-label={alt}>
    {#each frame.shapes ?? [] as shape, n (n)}
      <path class="shape {shape.role}" d={path(shape.points, shape.closed ?? false)} />
    {/each}
    {#each frame.labels ?? [] as label (label.text + label.x)}
      <text class="tag" x={label.x} y={label.y} style:font-size="{14 * s}px" style:text-anchor={label.anchor ?? "middle"}>{label.text}</text>
    {/each}
    <g class="stops" style:font-size="{13 * s}px">
      {#each stops as t (t.id)}
        {#if t.state === "here"}
          <circle class="ring" cx={t.x} cy={t.y} r={19 * s} stroke-width={2 * s} />
          <circle class="mark here" cx={t.x} cy={t.y} r={14 * s} />
        {:else}
          <circle class="mark {t.state}" cx={t.x} cy={t.y} r={12 * s} stroke-width={2 * s} stroke-dasharray={t.state === "skipped" ? `${4 * s} ${3 * s}` : undefined} />
        {/if}
        <text class="num {t.state}" x={t.x} y={t.y + 4.5 * s}>{t.number}</text>
      {/each}
    </g>
  </svg>
  <div class="legend" aria-hidden="true">
    <span><svg viewBox="0 0 14 14"><circle class="mark here key" cx="7" cy="7" r="5.5" /></svg>You are here</span>
    <span><svg viewBox="0 0 14 14"><circle class="mark done" cx="7" cy="7" r="5.5" /></svg>Done</span>
    <span><svg viewBox="0 0 14 14"><circle class="mark skipped" cx="7" cy="7" r="5.5" stroke-dasharray="3 2" /></svg>Skipped</span>
    <span><svg viewBox="0 0 14 14"><circle class="mark to_do" cx="7" cy="7" r="5.5" /></svg>To do</span>
  </div>
</figure>

<style>
  /* The walkaround boards' panel drawing: 8 px above, 12 at the sides, 10 below, 6 between. */
  .top {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    margin: 0;
    padding: var(--space-2) var(--space-3) calc(var(--space-2) + var(--border-thick));
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-bg);
    color: var(--panel-label);
    font-size: var(--font-size-caption);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .title {
    font-weight: var(--weight-semibold);
  }
  /* 440 tall in the step pane, 300 in the phone's step card; never wider than the card. */
  .top > svg {
    display: block;
    align-self: center;
    height: calc(var(--size-side-pane) - 2 * var(--space-10));
    max-width: 100%;
  }
  .shape {
    stroke: var(--panel-stroke);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .structure {
    fill: var(--panel-fill);
  }
  .glass {
    fill: var(--panel-glass);
  }
  .tag {
    fill: var(--panel-label);
    font-family: var(--font-sans);
    font-weight: var(--weight-semibold);
  }
  .stops {
    font-family: var(--font-sans);
    font-weight: var(--weight-bold);
    text-anchor: middle;
  }
  .ring {
    fill: none;
    stroke: var(--color-accent);
    opacity: 0.5;
  }
  .legend .mark {
    stroke-width: 2;
  }
  .mark.here {
    fill: var(--color-accent);
    stroke: none;
  }
  .mark.here.key {
    stroke: var(--color-accent);
  }
  .mark.done {
    fill: var(--color-done-soft);
    stroke: var(--color-done);
  }
  .mark.skipped {
    fill: var(--panel-bg);
    stroke: var(--color-open-text);
  }
  .mark.to_do {
    fill: var(--panel-bg);
    stroke: var(--panel-stroke);
  }
  .num.here {
    fill: var(--color-on-accent);
  }
  .num.done {
    fill: var(--color-done);
  }
  .num.skipped {
    fill: var(--color-open-text);
  }
  .num.to_do {
    fill: var(--panel-label);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) calc(var(--space-3) + var(--border-thick));
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .legend svg {
    width: calc(var(--space-3) + var(--border-thick));
    height: calc(var(--space-3) + var(--border-thick));
  }
  @media (max-width: 599px) {
    .top > svg {
      height: calc(var(--space-10) * 7.5);
    }
  }
</style>
