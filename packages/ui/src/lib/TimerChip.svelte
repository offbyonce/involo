<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A running step timer on its step's row (Timer board): a ring whose accent arc is the time left,
and the time left in mono, in a pill ringed in the accent color.
-->
<script lang="ts">
  import type { StepTimer } from "@involo/bindings";
  import { clock, leftAt, spoken } from "./timers";

  let { timer, now }: { timer: StepTimer; now: number } = $props();

  let left = $derived(leftAt(timer, now));
  /** The share of its time left, 0 to 1: the ring's accent arc, clockwise from the top. */
  let share = $derived(left / (timer.seconds * 1000));
</script>

<span class="chip" role="timer" aria-label="{timer.label}, {spoken(left)}">
  <span class="ring" style="--left: {share}" aria-hidden="true"></span>
  <span class="time">{clock(left)}</span>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
    white-space: nowrap;
  }
  /* The ring: the time left in the accent, the rest in the track color, 3 wide. Drawn in CSS,
     so the chip stays out of the drawing renderer. */
  .ring {
    width: var(--size-status-icon);
    height: var(--size-status-icon);
    border-radius: var(--radius-pill);
    background: conic-gradient(var(--color-accent) calc(var(--left) * 1turn), var(--color-track) 0);
    mask: radial-gradient(
      farthest-side,
      transparent calc(100% - var(--size-progress-bar) - var(--border-thin)),
      var(--color-accent) calc(100% - var(--size-progress-bar) - var(--border-thin)) calc(100% - var(--border-thin)),
      transparent calc(100% - var(--border-thin))
    );
  }
  .time {
    font-family: var(--font-mono);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
</style>
