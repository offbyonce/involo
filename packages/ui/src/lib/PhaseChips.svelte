<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The phase track (Checklist board, 60 px): the stage's phases as tabs, each with its progress bar
(a complete phase green with a check, the current one boxed with its count and blue progress), an
amber dot on a phase holding an open step, then the Full · Detailed pill, the overall count and
the saved time. The bars' empty track uses the to-do ring color, 3:1 against the page.
From 600 to 1439 px it is the Tablet board's 56 px row: the tabs scroll sideways under a
fade, with More phases, then the pill; the overall count and saved time move to the menu's header.
Phone has the progress row instead (ProgressRow).
-->
<script lang="ts">
  import type { Detail, Progress, RailPhase } from "@involo/bindings";
  import { phaseHref } from "../route.svelte";
  import Icon from "./Icon.svelte";

  let {
    phases,
    current,
    detail,
    essentials,
    total,
    savedAt,
    saveFailed = false,
    open = [],
  }: {
    phases: RailPhase[];
    current: string | null;
    detail: Detail;
    essentials: boolean;
    total: Progress;
    /** When progress was last saved on this device. */
    savedAt: number | null;
    /** The last save was refused: no save time, and "Not saved" in its place. */
    saveFailed?: boolean;
    /** Phases holding an open step, for the amber dots. */
    open?: string[];
  } = $props();

  let saved = $derived(
    savedAt === null ? null : new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  );
  let tabs = $state<HTMLElement | null>(null);
  const more = () => tabs?.scrollBy({ left: tabs.clientWidth * 0.6, behavior: "smooth" });
  const share = (p: RailPhase) => (p.progress.total ? (100 * p.progress.done) / p.progress.total : 0);
</script>

<div class="rail" class:none={!phases.length}>
  <div class="tabs">
  <nav class="phases" aria-label="Phases" bind:this={tabs}>
    {#each phases as p (p.id)}
      {@const here = p.id === current}
      {@const openHere = open.filter((o) => o === p.id).length}
      <a href={phaseHref(p.id)} class:here class:complete={p.complete} aria-current={here ? "step" : undefined}>
        <span class="label">
          <span class="name"
            >{#if p.complete}<span class="tick"><Icon name="check" /></span>{/if}{p.title}{#if !here}<span class="sr-only"
                >, {p.complete ? "complete" : `${p.progress.done} of ${p.progress.total} done`}</span
              >{/if}{#if openHere}<span
                class="dot"
                aria-label="{openHere} open step{openHere === 1 ? '' : 's'}"
              ></span>{/if}</span
          >
          {#if here}<span class="count">{p.progress.done}/{p.progress.total}</span>{/if}
        </span>
        <span class="bar" aria-hidden="true"><i style:width="{p.complete ? 100 : share(p)}%"></i></span>
      </a>
    {/each}
  </nav>
  <span class="fade" aria-hidden="true"></span>
  </div>
  <button class="more" type="button" aria-label="More phases" onclick={more}><Icon name="chevron-right" /></button>
  <div class="meta">
    <a class="pill" href="#/settings" aria-label="Step mode: {essentials ? 'Essentials' : 'Full'} and {detail === 'expanded' ? 'Detailed' : 'Simple'}, change"
      >{essentials ? "Essentials" : "Full"} · {detail === "expanded" ? "Detailed" : "Simple"}</a
    >
    <span class="count-all" aria-label="{total.done} of {total.total} steps done">{total.done}/{total.total}</span>
    {#if saveFailed}<span class="saved" role="status">Not saved</span>{:else if saved}<span class="saved" role="status">Saved {saved}</span>{/if}
  </div>
</div>

<style>
  .rail {
    position: sticky;
    top: var(--bar-header);
    z-index: 19;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--bar-phase);
    padding: 0 var(--space-6);
    border-bottom: var(--border-thin) solid var(--color-line);
    background: var(--color-bg);
  }
  .rail.none .phases {
    visibility: hidden;
  }
  .tabs {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
  }
  .fade,
  .more {
    display: none;
  }
  .phases {
    display: flex;
    flex: 1;
    gap: var(--space-2);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .phases a {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: calc(var(--space-1) + var(--border-thick));
    min-width: calc(3 * var(--space-6));
    height: calc(var(--size-touch-min) + var(--space-1));
    padding: 0 calc(var(--space-2) + var(--border-thick));
    border-radius: var(--radius-small);
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .phases a.complete {
    color: var(--color-text-secondary);
  }
  .phases a.here {
    min-width: calc(6 * var(--space-6) + var(--space-2));
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 var(--size-focus-ring) var(--color-accent);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    white-space: nowrap;
  }
  .name {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .tick {
    display: inline-flex;
    color: var(--color-done);
  }
  .tick :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .dot {
    width: var(--size-dot);
    height: var(--size-dot);
    border-radius: 50%;
    background: var(--color-open-dot);
  }
  .count {
    color: var(--color-accent-text);
    font-family: var(--font-mono);
    font-weight: var(--weight-medium);
  }
  .bar {
    display: flex;
    height: var(--size-progress-bar);
    border-radius: var(--border-thick);
    background: var(--color-todo-ring);
  }
  .bar i {
    border-radius: var(--border-thick);
    background: var(--color-accent);
  }
  .complete .bar i {
    background: var(--color-done);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    white-space: nowrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    text-decoration: none;
  }
  .count-all {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .saved {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* Tablet (Tablet board): 56 high, the tabs under a fade, More phases, the pill. */
  @media (max-width: 1439px) {
    .rail {
      gap: calc(var(--space-1) + var(--border-thick));
      padding: 0 var(--space-2) 0 var(--space-3);
    }
    .phases {
      gap: calc(var(--space-1) + var(--border-thick));
    }
    .phases a {
      gap: calc(var(--space-1) + var(--border-thick));
      height: var(--size-touch-min);
      padding: 0 calc(var(--space-2) + var(--border-thick));
    }
    .fade {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      display: block;
      width: calc(var(--space-10) + var(--space-2));
      background: linear-gradient(90deg, transparent, var(--color-bg));
      pointer-events: none;
    }
    .more {
      display: grid;
      flex: none;
      place-items: center;
      width: var(--size-touch-min);
      height: var(--size-touch-min);
      color: var(--color-text-secondary);
    }
    .more :global(.icon) {
      width: calc(var(--size-icon) - var(--border-thick));
      height: calc(var(--size-icon) - var(--border-thick));
    }
    .pill {
      padding: 0 var(--space-3);
    }
    .count-all,
    .saved {
      display: none;
    }
  }
  /* Phone: the progress row takes this row's place (Mobile board). */
  @media (max-width: 599px) {
    .rail {
      display: none;
    }
  }
</style>
