<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The panel sheet: a drawing at full size in a sheet from the bottom, its name and the standard
sheet close (×; Esc closes it too, as a modal dialog) in a head that stays in view (owner). The drawing's own "See the whole panel larger" opens it, and so does the Flight
deck page's "Full size ›". It opens scrolled so the step's controls are in sight (the owner,
batch 2), centering again while the drawing takes its size in the first half second.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let { caption, children }: { caption: string; children: Snippet } = $props();
  let sheet = $state<HTMLDialogElement | null>(null);
  /** Opens the sheet. */
  export function open() {
    const el = sheet;
    if (!el) return;
    el.showModal();
    const center = () => {
      const ons = [...el.querySelectorAll("g.item.on")].map((g) => g.getBoundingClientRect());
      if (!ons.length) return;
      const top = Math.min(...ons.map((r) => r.top));
      const bottom = Math.max(...ons.map((r) => r.bottom));
      const box = el.getBoundingClientRect();
      el.scrollTop += (top + bottom) / 2 - (box.top + box.height / 2);
    };
    requestAnimationFrame(center);
    const watch = new ResizeObserver(center);
    for (const svg of el.querySelectorAll("svg")) watch.observe(svg);
    setTimeout(() => watch.disconnect(), 500);
  }
</script>

<dialog class="sheet" bind:this={sheet} aria-label={caption}>
  <div class="sheet-head">
    <span>{caption}</span>
    <button type="button" class="close" aria-label="Close" onclick={() => sheet?.close()}><Icon name="x" /></button>
  </div>
  {@render children()}
</dialog>

<style>
  .sheet {
    width: 100vw;
    max-width: 100vw;
    max-height: 100dvh;
    margin: auto 0 0;
    padding: var(--space-4) var(--gutter) var(--space-6);
    border: 0;
    border-top: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    background: var(--color-sheet);
    color: var(--color-text);
  }
  .sheet::backdrop {
    background: var(--color-scrim);
  }
  /* Stays in view (with Close) when the sheet opens scrolled to the step's controls. */
  .sheet-head {
    position: sticky;
    top: calc(-1 * var(--space-4));
    z-index: 1;
    padding: var(--space-2) 0;
    background: var(--color-sheet);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-semibold);
  }
  /* The standard sheet close (Stage picker, Locator): 44 px, the × at the icon size less 2. */
  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) calc(-1 * var(--space-2)) 0;
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .close :global(.icon) {
    width: calc(var(--size-icon) - var(--border-thick));
    height: calc(var(--size-icon) - var(--border-thick));
  }
</style>
