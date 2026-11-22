<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The running-timers bar (Timers boards): every step timer running or paused in the flight,
wherever its step is, with its time left ("IRS alignment 4:31 · Paused"). Under the lists on
desktop; below 900 px, where Done and Skip for now sit in the bottom bar, a strip just above that
bar (TimersPhone). Nothing while none runs or is paused.
-->
<script lang="ts">
  import { clock, leftAt, stateAt, type Timers } from "./timers";

  let { timers }: { timers: Timers } = $props();
  let shown = $derived(
    timers.list.filter((t) => {
      const s = stateAt(t, timers.now);
      return s === "running" || s === "paused";
    }),
  );
</script>

{#if shown.length}
  <section class="run-bar" aria-label="Running timers">
    <span class="t">Running timers</span>
    {#each shown as t (t.step)}<span class="one"
        >{t.label} {clock(leftAt(t, timers.now))}{stateAt(t, timers.now) === "paused" ? " · Paused" : ""}</span
      >{/each}
    <span class="fill"></span>
    <span class="note">Timers keep running when you change page.</span>
  </section>
{/if}

<style>
  /* Desktop (Timers): 12 16 padding, the surface, 10 radius, 16 under the lists. */
  .run-bar {
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
  /* Below 900 px (TimersPhone): a 44 px strip on the surface, edge to edge, right above the
     bottom bar (12 + 52 + 20 and its rule); at the foot of the screen when there's no bar. */
  @media (max-width: 899px) {
    .run-bar {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 30;
      max-width: none;
      flex-wrap: nowrap;
      gap: calc(var(--space-2) + var(--border-thick));
      min-height: var(--size-touch-min);
      box-sizing: border-box;
      margin: 0;
      padding: 0 calc(var(--space-3) + var(--border-thick));
      border: 0;
      border-top: var(--border-thin) solid var(--color-line);
      border-radius: 0;
      overflow-x: auto;
    }
    :global(body:has(.it.current .actions)) .run-bar {
      bottom: calc(var(--space-3) + var(--size-touch-min) + var(--space-2) + var(--space-4) + var(--space-1) + var(--border-thin));
    }
    .one {
      white-space: nowrap;
    }
    .fill,
    .note {
      display: none;
    }
    /* Room for the strip under the page, as the page keeps room for the bottom bar (the doubled
       :has outranks the page's own rule). */
    :global(main:has(.run-bar):has(.run-bar)) {
      padding-bottom: calc(
        var(--size-touch-min) + var(--space-2) + var(--space-3) + var(--space-4) + var(--space-1) + var(--space-6) + var(--size-touch-min)
      );
    }
  }
</style>
