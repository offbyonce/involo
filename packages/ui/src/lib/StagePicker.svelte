<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The stage and phase picker (StagePicker.dc.html): opened from the stage
button in the compact header. A bottom sheet on phone (StagesPhone) and tablet portrait
(StagesTabP, two columns), a pop-over under the stage button from 900 to 1439 px (StagesTabL, two
columns, a light scrim below the header). Every stage is a group heading ("Done" or "In
progress") and its phases are rows: done with the green check, the current one boxed with its
count, the rest an empty circle; a phase holding an open step says how many. The stages and phases
come from the pack, in pack order. Picking a phase goes to it (its first open step) and closes.
-->
<script lang="ts">
  import type { Rail, RailPhase, RailStage } from "@involo/bindings";
  import { onMount } from "svelte";
  import check from "../icons/board/picker-check.svg?raw";
  import { phaseHref } from "../route.svelte";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";

  let {
    rail,
    current,
    open = [],
    onClose,
  }: {
    rail: Rail;
    /** The phase on screen. */
    current: string | null;
    /** Phases holding an open step, one entry per step. */
    open?: string[];
    onClose: () => void;
  } = $props();

  /** Every step ticked or skipped. */
  const done = (p: RailPhase) => p.complete || (p.progress.total > 0 && p.progress.toDo === 0);
  const status = (s: RailStage) =>
    s.phases.every(done) ? "Done" : s.phases.some((p) => p.id === current || p.progress.done + p.progress.skipped > 0) ? "In progress" : "";
  const openIn = (id: string) => open.filter((o) => o === id).length;

  /** Two columns (tablet and the pop-over): the first stages until half the rows are in, then the rest. */
  let columns = $derived.by(() => {
    const rows = (s: RailStage) => 1 + s.phases.length;
    const all = rail.stages.reduce((n, s) => n + rows(s), 0);
    let n = 0;
    let cut = rail.stages.length;
    for (const [i, s] of rail.stages.entries()) {
      n += rows(s);
      if (n >= all / 2) {
        cut = i + 1;
        break;
      }
    }
    return [rail.stages.slice(0, cut), rail.stages.slice(cut)];
  });

  let box = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  onMount(() => {
    const back = document.activeElement as HTMLElement | null;
    // Focus moves into the picker, on the current phase (scrolled into view) or Close.
    const here = box?.querySelector<HTMLElement>('[aria-current="step"]') ?? box?.querySelector<HTMLElement>(".close");
    here?.focus({ preventScroll: true });
    here?.scrollIntoView?.({ block: "center" });
    return () => back?.focus();
  });

  // Swipe down on the sheet closes it, when its list is at the top.
  let startY: number | null = null;
  const swipeStart = (e: TouchEvent) => (startY = (list?.scrollTop ?? 0) > 0 ? null : (e.touches[0]?.clientY ?? 0));
  const swipeEnd = (e: TouchEvent) => {
    if (startY !== null && (e.changedTouches[0]?.clientY ?? startY) - startY > 64) onClose();
    startY = null;
  };
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") onClose();
  }}
/>
<button class="scrim" type="button" aria-label="Close" tabindex="-1" onclick={onClose}></button>
<div bind:this={box} class="picker" role="dialog" aria-modal="true" aria-label="Stage and phase" tabindex="-1" use:trapFocus ontouchstart={swipeStart} ontouchend={swipeEnd}>
  <span class="handle" aria-hidden="true"></span>
  <div class="top">
    <div class="words">
      <h2>Stage and phase</h2>
      <span>Pick a phase to go to its first open step.</span>
    </div>
    <button class="close" type="button" aria-label="Close" onclick={onClose}><Icon name="x" /></button>
  </div>
  <div class="scroll" bind:this={list} tabindex="-1">
    <div class="cols">
      {#each columns as col, c (c)}
        <div class="col">
          {#each col as s (s.title)}
            {@const st = status(s)}
            <div class="stage" role="group" aria-label={s.title}>
              <div class="head">
                <h3>{s.title}</h3>
                {#if st}<span>{st}</span>{/if}
              </div>
              {#each s.phases as p (p.id)}
                {@const here = p.id === current}
                {@const n = openIn(p.id)}
                {@const isDone = !here && done(p)}
                <a
                  class="row"
                  class:here
                  href={phaseHref(p.id)}
                  onclick={onClose}
                  aria-current={here ? "step" : undefined}
                  aria-label="{p.title}{here ? `, current, ${p.progress.done}/${p.progress.total}` : isDone ? ', done' : ''}{n
                    ? `, ${n} open step${n === 1 ? '' : 's'}`
                    : ''}"
                >
                  {#if isDone}
                    <span class="tick" aria-hidden="true">{@html check}</span>
                  {:else}
                    <span class="ring" aria-hidden="true"></span>
                  {/if}
                  <span class="name">{p.title}</span>
                  {#if here}
                    <span class="count">{p.progress.done}/{p.progress.total}</span>
                  {:else if n}
                    <span class="open"><i aria-hidden="true"></i>{n} open</span>
                  {/if}
                </a>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  <span class="fade" aria-hidden="true"></span>
</div>

<style>
  /* Phone (StagesPhone): a bottom sheet in the open-steps sheet's style, one column that scrolls. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: var(--color-scrim);
  }
  .picker {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(100dvh - var(--size-header) - 2 * var(--space-8));
    padding: var(--space-2) var(--space-3) 0;
    border-top: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    background: var(--color-sheet);
    color: var(--color-text);
  }
  .handle {
    flex: none;
    align-self: center;
    width: var(--space-10);
    height: var(--space-1);
    border-radius: var(--border-thick);
    background: var(--color-border);
  }
  .top {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    padding-left: var(--space-1);
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  h2 {
    margin: 0;
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .words span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .close {
    display: grid;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .close :global(.icon) {
    width: calc(var(--size-icon) - var(--border-thick));
    height: calc(var(--size-icon) - var(--border-thick));
  }
  .scroll {
    flex: 1;
    min-height: 0;
    /* Room for the focus ring (2 px out, 2 px wide) at the rows' sides. */
    margin: 0 calc(-1 * var(--space-1));
    padding: 0 var(--space-1);
    overflow-y: auto;
    scrollbar-width: none;
  }
  .cols {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-6);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-3) var(--space-1);
  }
  h3 {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .head span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .row {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .row.here {
    background: var(--color-current-row);
    box-shadow: inset 0 0 0 var(--size-focus-ring) var(--color-accent);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .tick {
    display: flex;
    flex: none;
    width: calc(var(--size-icon) - var(--border-thick));
    height: calc(var(--size-icon) - var(--border-thick));
    color: var(--color-done);
  }
  .tick :global(svg) {
    width: 100%;
    height: 100%;
  }
  /* 14 px circles in an 18 px box: not started an empty ring, the current one filled. */
  .ring {
    flex: none;
    box-sizing: border-box;
    width: calc(var(--space-3) + var(--border-thick));
    height: calc(var(--space-3) + var(--border-thick));
    margin: var(--border-thick);
    border: var(--size-focus-ring) solid var(--color-todo-ring);
    border-radius: 50%;
  }
  .here .ring {
    border: var(--border-thick) solid var(--color-accent);
    background: var(--color-accent);
    box-shadow: inset 0 0 0 var(--border-thick) var(--color-sheet);
  }
  .name {
    flex: 1;
  }
  .count {
    color: var(--color-accent-text);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .open {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    color: var(--color-open-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  .open i {
    width: calc(var(--size-dot) - var(--border-thin));
    height: calc(var(--size-dot) - var(--border-thin));
    border-radius: 50%;
    background: var(--color-open-dot);
  }
  .fade {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: calc(var(--space-10) + var(--space-2));
    background: linear-gradient(180deg, transparent, var(--color-sheet));
    pointer-events: none;
  }

  /* Tablet portrait (StagesTabP): the same sheet, two columns, nothing to scroll. */
  @media (min-width: 600px) {
    .picker {
      gap: var(--space-2);
      height: min(calc(2 * var(--size-drawer) + 2 * var(--space-10)), calc(100dvh - var(--size-header)));
      padding: var(--space-2) calc(var(--space-4) + var(--space-1)) var(--space-6);
    }
    .cols {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: var(--space-6);
      padding-bottom: 0;
    }
    .col {
      gap: var(--space-2);
    }
    .fade {
      display: none;
    }
  }

  /* 900 to 1439 px (StagesTabL): a pop-over under the stage button; the scrim leaves the header. */
  @media (min-width: 900px) {
    .scrim {
      top: var(--bar-header);
      background: var(--color-scrim-light);
    }
    .picker {
      top: calc(var(--bar-header) + var(--space-1));
      right: auto;
      bottom: auto;
      left: calc(var(--size-touch-min) + var(--space-3));
      width: calc(var(--size-side-pane) + var(--space-10) * 2);
      height: auto;
      max-height: calc(100dvh - var(--bar-header) - var(--space-4));
      padding: var(--space-3) var(--space-4) var(--space-4);
      border: var(--border-thin) solid var(--color-popover-border);
      border-radius: var(--radius-popover);
      background: var(--color-popover-surface);
      box-shadow: var(--color-overlay-shadow);
    }
    .handle {
      display: none;
    }
    .cols {
      gap: calc(var(--space-4) + var(--space-1));
    }
    .col {
      gap: calc(var(--space-1) + var(--border-thick));
    }
  }
</style>
