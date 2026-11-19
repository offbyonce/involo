<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The note after a pack update during a flight (decision 0028; PacksUpdate board), at the top of the
checklist until dismissed: the title with the new version, the promise about ticks, the change
counts as tags, and What changed (open by itself the first time it shows): one row per change.
"Go to the first new step" when steps were added, and Dismiss; a dismissed note doesn't come back.
-->
<script lang="ts">
  import type { UpdateNote } from "@involo/bindings";
  import ChangeList from "./ChangeList.svelte";
  import Icon from "./Icon.svelte";

  let {
    note,
    onStep,
    stepHref = () => null,
    onSeen,
    onDismiss,
  }: {
    note: UpdateNote;
    onStep: (id: string) => void;
    /** The address of a step's phase, for its link. */
    stepHref?: (id: string) => string | null;
    /** The note has shown once: its list then stays folded until opened. */
    onSeen: () => void;
    onDismiss: () => void;
  } = $props();

  // What changed is open the first time the note shows.
  // svelte-ignore state_referenced_locally
  let open = $state(!note.seen);
  $effect(() => {
    if (!note.seen) onSeen();
  });
  let first = $derived(note.changes.added[0]?.step ?? null);
</script>

<section class="note" aria-label="Pack updated">
  <div class="head">
    <span class="ic"><Icon name="download" /></span>
    <div class="txt">
      <h2>{`${note.changes.packName} updated to version ${note.changes.toVersion}`}</h2>
      <p>Your ticks are kept on every step that’s still there.</p>
      {#if note.changes.lostTicks}
        {@const n = note.changes.lostTicks}
        <p class="lost">{n === 1 ? "1 tick couldn’t be kept: its step is no longer in the pack." : `${n} ticks couldn’t be kept: their steps are no longer in the pack.`}</p>
      {/if}
      <ChangeList changes={note.changes} tags />
    </div>
    <button class="x" type="button" aria-label="Dismiss" onclick={onDismiss}><Icon name="x" /></button>
  </div>
  <div class="more">
    <button class="fold" type="button" aria-expanded={open} onclick={() => (open = !open)}>{open ? "Hide what changed" : "What changed"}<Icon name={open ? "chevron-down" : "chevron-right"} /></button>
    {#if open}<ChangeList changes={note.changes} {onStep} {stepHref} />{/if}
    <div class="acts">
      {#if first}<button class="btn primary" type="button" onclick={() => first && onStep(first)}>Go to the first new step</button>{/if}
      <button class="btn" type="button" onclick={onDismiss}>Dismiss</button>
    </div>
  </div>
</section>

<style>
  .note {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: calc(var(--space-4) + var(--space-1));
    padding: calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-popover);
    background: var(--color-surface);
    box-shadow: var(--color-button-shadow);
    line-height: var(--leading-tight);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-3) + var(--border-thick));
  }
  .ic {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: calc(var(--space-8) + var(--space-1));
    height: calc(var(--space-8) + var(--space-1));
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .ic :global(svg),
  .fold :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .fold :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .txt {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-wordmark);
    font-weight: var(--weight-bold);
  }
  p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .lost {
    color: var(--color-text);
  }
  .x {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .more {
    display: flex;
    flex-direction: column;
    padding-left: calc(var(--space-8) + var(--space-4) + var(--border-thick));
  }
  .fold {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-1);
    min-height: var(--space-10);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: var(--border-thin) solid var(--color-line);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    cursor: pointer;
  }
  .btn.primary {
    padding: 0 var(--space-4);
    border: 0;
    background: var(--color-accent);
    box-shadow: none;
    color: var(--color-on-accent);
    font-weight: var(--weight-semibold);
  }
  @media (max-width: 599px) {
    .more {
      padding-left: 0;
    }
  }
</style>
