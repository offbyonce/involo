<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The running-timers bar under a phase's lists (Timer board): every step timer running in the
flight, wherever its step is, with its time left, until it finishes. Nothing while none runs.
-->
<script lang="ts">
  import { clock, leftAt, running, type Timers } from "./timers";

  let { timers }: { timers: Timers } = $props();
  let shown = $derived(timers.list.filter((t) => running(t, timers.now)));
</script>

{#if shown.length}
  <section class="bar" aria-label="Running timers">
    <span class="t">Running timers</span>
    {#each shown as t (t.step)}<span class="one">{t.label} {clock(leftAt(t, timers.now))}</span>{/each}
    <span class="fill"></span>
    <span class="note">Timers keep running when you change page and show in this bar until they finish.</span>
  </section>
{/if}

<style>
  /* The board's bar: 12 16 padding, surface, 10 radius, the procedure card's width (1040). */
  .bar {
    max-width: var(--size-content-max);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .t {
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .one {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .fill {
    flex: 1;
  }
  .note {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* Drawn at 1440 (Timer board); tablet and phone wait for their boards. */
  @media (max-width: 1439px) {
    .bar {
      display: none;
    }
  }
</style>
