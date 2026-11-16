<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The phone's progress row (Mobile board, 44 px, under the strip): the phase's progress bar and count,
and "2 open", which opens the open-steps sheet. Only below 600 px; wider windows have the phase
track.
-->
<script lang="ts">
  import type { Progress } from "@involo/bindings";
  import { openSteps } from "./open-steps.svelte";

  let { progress, open }: { progress: Progress | null; open: number } = $props();
  let share = $derived(progress?.total ? (100 * progress.done) / progress.total : 0);
</script>

{#if progress}
  <div class="prow">
    <span class="bar" aria-hidden="true"><i style:width="{share}%"></i></span>
    <span class="count" aria-label="{progress.done} of {progress.total} steps done in this phase">{progress.done}/{progress.total}</span>
    {#if open}
      <button class="open" type="button" aria-haspopup="dialog" onclick={() => (openSteps.shown = true)}>{open} open</button>
    {/if}
  </div>
{/if}

<style>
  .prow {
    display: none;
  }
  @media (max-width: 599px) {
    .prow {
      position: sticky;
      top: calc(var(--bar-header) + var(--bar-strip));
      z-index: 18;
      display: flex;
      align-items: center;
      gap: calc(var(--space-2) + var(--border-thick));
      height: var(--bar-phase);
      padding: 0 var(--space-2) 0 calc(var(--space-3) + var(--border-thick));
      border-bottom: var(--border-thin) solid var(--color-line);
      background: var(--color-bg);
    }
  }
  .bar {
    display: flex;
    flex: 1;
    height: var(--space-1);
    border-radius: var(--border-thick);
    background: var(--color-todo-ring);
  }
  .bar i {
    border-radius: var(--border-thick);
    background: var(--color-accent);
  }
  .count {
    color: var(--color-accent-text);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .open {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-1) + var(--border-thick));
    border: 0;
    background: transparent;
    color: var(--color-open-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
</style>
