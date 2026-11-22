<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A step timer's chip (Timers boards), in its four states: not started (outlined, an empty ring, the
whole time), running (the accent, the ring's arc the time left), paused (neutral, the arc stopped,
"Paused" before the time) and finished (outlined in the done green, a full ring, "Finished",
0:00). Its accessible name says the timer's name and state, so the state never rests on color.
-->
<script lang="ts">
  import type { StepTimer } from "@involo/bindings";
  import { chipName, clock, leftAt, stateAt } from "./timers";

  let { timer, now }: { timer: StepTimer; now: number } = $props();

  let left = $derived(leftAt(timer, now));
  let state = $derived(stateAt(timer, now));
  /** The ring's arc, 0 to 1, clockwise from the top: the share of the time left; full at zero. */
  let share = $derived(state === "waiting" ? 0 : state === "finished" ? 1 : left / (timer.seconds * 1000));
</script>

<span class="chip {state}" role="timer" aria-label={chipName(timer, now)}>
  <span class="ring" style="--left: {share}" aria-hidden="true"></span>
  {#if state === "paused"}<span class="word" aria-hidden="true">Paused</span>{:else if state === "finished"}<span class="word" aria-hidden="true">Finished</span>{/if}
  <span class="time" aria-hidden="true">{clock(left)}</span>
</span>

<style>
  /* The boards' chip: 32 tall, 4 10 padding, 8 gaps, a 1.5 px inset ring. */
  .chip {
    --arc: var(--color-accent);
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    min-height: var(--space-8);
    padding: var(--space-1) calc(var(--space-2) + var(--border-thick));
    border-radius: var(--radius-pill);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-border);
    white-space: nowrap;
  }
  .chip.running {
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
  }
  .chip.paused {
    --arc: var(--color-text-muted);
    background: var(--color-surface-2);
  }
  .chip.finished {
    --arc: var(--color-done);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-done);
  }
  /* The ring, 18 across: r 9 and a 3 wide stroke in a 24 box, so 2.25 wide, 1.125 in from the
     edge; the arc in the state's color, the rest in the track color. Drawn in CSS, so the chip
     stays out of the drawing renderer. */
  .ring {
    flex: none;
    width: calc(var(--size-icon) - var(--border-thick));
    height: calc(var(--size-icon) - var(--border-thick));
    border-radius: var(--radius-pill);
    background: conic-gradient(var(--arc) calc(var(--left) * 1turn), var(--color-track) 0);
    mask: radial-gradient(
      farthest-side,
      transparent calc(100% - var(--border-thin) * 3.375),
      var(--color-accent) calc(100% - var(--border-thin) * 3.375) calc(100% - var(--border-thin) * 1.125),
      transparent calc(100% - var(--border-thin) * 1.125)
    );
  }
  .word {
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }
  .finished .word {
    color: var(--color-done);
  }
  .time {
    font-family: var(--font-mono);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }
  .running .time {
    color: var(--color-text-strong);
  }
</style>
