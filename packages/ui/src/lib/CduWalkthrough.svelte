<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A CDU walkthrough in the slide-out (#215, CduWalk boards; the slide-out's geometry, scrim, Esc and
close are the existing one's). The header has the step in link color, the walkthrough's title and,
on desktop, "<list> · <n> pages, <first> to <last>", Esc and close. Then the progress: one pill
per CDU page on desktop (done ones checked, the current one accent with "<n>/<count>" when it spans
several walkthrough pages), a segmented bar with "<n>/<total>" on a phone. The page: its CDU page
name and "page <n> of <total>", its title, Do, Check and Note, with flight values in mono semibold,
and the schematic CDU beside them on desktop or between Do and Check on a phone. Without a flight,
a line at the top says each page reads what to type instead, with Add your flight. Back (not on the
first page) and Next; on the last page Next is Done, which ticks the step and closes. On desktop
← and → change pages and Esc closes.
-->
<script lang="ts">
  import type { CduSpan, CduWalk } from "@involo/bindings";
  import CduScreen from "./CduScreen.svelte";
  import Icon from "./Icon.svelte";
  import { cduPages, pagesWords } from "./walkthroughs";

  let {
    walk,
    page,
    step,
    list,
    onPage,
    onClose,
    onDone,
    onAddFlight,
  }: {
    walk: CduWalk;
    /** The page shown, from 0. */
    page: number;
    /** "Step 12 · CDU". */
    step: string;
    /** The list the step is in, for the desktop header's line. */
    list: string;
    onPage: (page: number) => void;
    onClose: () => void;
    /** Done on the last page: ticks the step and closes. */
    onDone: () => void;
    /** The flight strip's own action. */
    onAddFlight: () => void;
  } = $props();

  let at = $derived(Math.min(Math.max(page, 0), walk.pages.length - 1));
  let p = $derived(walk.pages[at]);
  let total = $derived(walk.pages.length);
  let last = $derived(at === total - 1);
  let pills = $derived(cduPages(walk));

  /** The body scrolls with no scrollbar, fading at an edge with more beyond it, as the slide-out. */
  let body = $state<HTMLElement | null>(null);
  let more = $state({ up: false, down: false });
  function edges(): void {
    const el = body;
    if (el) more = { up: el.scrollTop > 1, down: el.scrollTop + el.clientHeight < el.scrollHeight - 1 };
  }
  $effect(() => {
    void at;
    const el = body;
    if (!el) return;
    el.scrollTop = 0;
    edges();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(edges);
    watch.observe(el);
    return () => watch.disconnect();
  });

  let head = $state<HTMLElement | null>(null);
  $effect(() => {
    head?.focus();
  });
  function key(e: KeyboardEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (t?.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    } else if (e.key === "ArrowRight" && !last) {
      e.preventDefault();
      onPage(at + 1);
    } else if (e.key === "ArrowLeft" && at > 0) {
      e.preventDefault();
      onPage(at - 1);
    }
  }
</script>

{#snippet prose(spans: CduSpan[])}{#each spans as s, n (n)}{#if s.value}<span class="v">{s.text}</span>{:else}{s.text}{/if}{/each}{/snippet}

<div class="walk" role="dialog" aria-labelledby="cdu-title" tabindex="-1" onkeydown={key}>
  <span class="handle" aria-hidden="true"></span>
  <header class="head">
    <div class="titles">
      <span class="step">{step}</span>
      <h2 id="cdu-title" tabindex="-1" bind:this={head}>{walk.title}</h2>
      <span class="where">{list} · {pagesWords(walk)}</span>
    </div>
    <kbd class="esc" aria-hidden="true">Esc</kbd>
    <button class="close" type="button" aria-label="Close the CDU walkthrough" onclick={onClose}><Icon name="x" /></button>
  </header>
  <nav class="pills" aria-label="Walkthrough pages">
    <ol>
      {#each pills as pill (pill.from)}
        {@const done = pill.to < at}
        {@const here = pill.from <= at && at <= pill.to}
        <li class="pill" class:done class:here aria-current={here ? "step" : undefined}>
          {#if done}<span class="tick"><Icon name="check" /></span>{/if}{pill.page}{#if done}<span class="sr-only">{", done"}</span>{/if}
          {#if here && pill.to > pill.from}<span class="of">{at - pill.from + 1}/{pill.to - pill.from + 1}</span>{/if}
        </li>
      {/each}
    </ol>
  </nav>
  <div class="bar">
    <span class="segs" aria-hidden="true">
      {#each walk.pages as _, n (n)}<span class="seg" class:done={n < at} class:here={n === at}></span>{/each}
    </span>
    <span class="nofn" aria-hidden="true">{at + 1}/{total}</span>
  </div>
  <!-- It scrolls when the page is taller than the room, so it takes focus to scroll by keyboard. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="body" role="region" aria-label="Page {at + 1} of {total}" tabindex="0" class:more-up={more.up} class:more-down={more.down} bind:this={body} onscroll={edges}>
    {#if !walk.flightAdded}
      <div class="noflight">
        <span>No flight added: each page says what to type instead of your values.</span>
        <button class="add" type="button" onclick={onAddFlight}>Add your flight</button>
      </div>
    {/if}
    {#key at}
      {#if p}
      <div class="page">
        <div class="fig"><CduScreen page={p} /></div>
        <div class="text">
          <div class="ph">
            <span class="where-page">{p.page} · page {at + 1} of {total}</span>
            <h3>{p.title}</h3>
          </div>
          <section class="do" aria-labelledby="cdu-do">
            <h4 id="cdu-do">Do</h4>
            <p>{@render prose(p.action)}</p>
          </section>
          <div class="fig phone"><CduScreen page={p} caption={false} /></div>
          {#if p.check.length}
            <section class="check" aria-labelledby="cdu-check">
              <h4 id="cdu-check">Check</h4>
              <p>{@render prose(p.check)}</p>
            </section>
          {/if}
          {#if p.note.length}
            <section class="note" aria-labelledby="cdu-note">
              <h4 id="cdu-note">Note</h4>
              <p>{@render prose(p.note)}</p>
            </section>
          {/if}
        </div>
      </div>
      {/if}
    {/key}
  </div>
  <footer class="foot">
    {#if at > 0}<button class="back" type="button" onclick={() => onPage(at - 1)}>Back</button>{/if}
    {#if last}
      <button class="next" type="button" onclick={onDone}>Done</button>
    {:else}
      <button class="next" type="button" onclick={() => onPage(at + 1)}>Next</button>
    {/if}
    <span class="fill"></span>
    <span class="hint">{last ? "Ticks the CDU step and closes." : "← → pages · Esc close"}</span>
  </footer>
</div>

<style>
  /* The slide-out's frame (Slideout.svelte, Locator board), filled with the walkthrough. */
  .walk {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-popover) 0 0 0;
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
    color: var(--color-text);
    /* The boards' text sits at the font's normal line height, except the page's paragraphs. */
    line-height: var(--leading-tight);
    outline: none;
  }
  .head {
    flex: none;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4) calc(var(--space-4) + var(--space-1)) var(--space-3) var(--space-6);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .step {
    color: var(--color-link);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
    outline: none;
  }
  .where {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .esc {
    align-self: center;
    margin-top: calc(-1 * (var(--space-1) + var(--border-thick)));
    padding: var(--border-thin) calc(var(--space-1) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--space-1);
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-caption);
  }
  .close {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    border: 0;
    background: none;
    color: var(--color-text-secondary);
  }
  /* Desktop: one pill per CDU page, 28 tall, 5 px apart. */
  .pills {
    flex: none;
    padding: var(--space-3) var(--space-6);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .pills ol {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: calc(var(--space-1) + var(--border-thin));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thin));
    box-sizing: border-box;
    height: calc(var(--space-8) - var(--border-thick));
    padding: 0 calc(var(--space-2) + var(--border-thin));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .pill.done {
    color: var(--color-text-secondary);
  }
  .tick {
    display: inline-flex;
    color: var(--color-done);
  }
  .tick :global(.icon) {
    width: var(--space-3);
    height: var(--space-3);
  }
  .tick :global(svg) {
    stroke-width: 3.5;
  }
  .pill.here {
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--space-8) - var(--space-1));
    border: 0;
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 var(--size-focus-ring) var(--color-accent);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .of {
    color: var(--color-accent-text);
    font-weight: var(--weight-regular);
  }
  /* Phone: a bar with one segment per page. */
  .bar {
    display: none;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: var(--space-4) var(--space-6);
    scrollbar-width: none;
    outline-offset: calc(-1 * var(--border-thick));
  }
  .body::-webkit-scrollbar {
    display: none;
  }
  .body.more-up {
    mask-image: linear-gradient(180deg, transparent, black var(--space-10));
  }
  .body.more-down {
    mask-image: linear-gradient(180deg, black calc(100% - var(--space-10)), transparent);
  }
  .body.more-up.more-down {
    mask-image: linear-gradient(180deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent);
  }
  .noflight {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .noflight span {
    flex: 1 1 calc(var(--space-10) * 6 + var(--space-4) + var(--space-1));
  }
  .add {
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
  }
  /* Desktop: the schematic CDU on the left, 380 wide, the page's text on the right. */
  .page {
    display: grid;
    grid-template-columns: calc(var(--space-10) * 9 + var(--space-4) + var(--space-1)) minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
  }
  .fig.phone {
    display: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding-top: var(--border-thick);
  }
  .ph {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .where-page {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  h3 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  h4 {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-body);
    line-height: var(--leading-normal);
  }
  .note p {
    font-size: var(--font-size-secondary);
  }
  .v {
    color: var(--color-text-strong);
    font-family: var(--font-mono);
    font-weight: var(--weight-semibold);
  }
  .foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-6) calc(var(--space-3) + var(--border-thick));
    border-top: var(--border-thin) solid var(--color-line);
  }
  .back,
  .next {
    height: var(--size-touch-min);
    border-radius: var(--radius-control);
    font: inherit;
    font-size: var(--font-size-body);
  }
  .back {
    padding: 0 calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
  }
  .next {
    padding: 0 calc(var(--space-6) + var(--space-1));
    border: 0;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
  .fill {
    flex: 1;
  }
  .hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .handle {
    display: none;
  }
  /* Below 900 px: the existing bottom sheet (Slideout.svelte), with its handle and no Esc. */
  @media (max-width: 899px) {
    .walk {
      border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    }
    .handle {
      display: block;
      flex: none;
      align-self: center;
      width: var(--space-10);
      height: var(--space-1);
      margin-top: var(--space-2);
      border-radius: var(--border-thick);
      background: var(--color-border);
    }
    .esc,
    .hint {
      display: none;
    }
  }
  /* Phone (CduWalkPhone): no header line, the bar for progress, the CDU between Do and Check, and
     Back and Next in a bottom row like the phone's Done/Skip bar. */
  @media (max-width: 599px) {
    .walk {
      border-width: var(--border-thin) 0 0;
    }
    .head {
      padding: var(--space-2) var(--space-2) calc(var(--space-2) + var(--border-thick)) var(--space-4);
    }
    h2 {
      font-size: calc(var(--font-size-body) + var(--border-thick));
    }
    .where,
    .pills {
      display: none;
    }
    .bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: calc(var(--space-2) + var(--border-thick));
      min-height: var(--size-touch-min);
      padding: 0 var(--space-4);
      border-bottom: var(--border-thin) solid var(--color-line);
    }
    .segs {
      flex: 1;
      display: flex;
      gap: calc(var(--border-thick) + var(--border-thin));
    }
    .seg {
      flex: 1;
      height: var(--space-1);
      border-radius: var(--border-thick);
      background: var(--color-track);
    }
    .seg.done {
      background: var(--color-accent);
    }
    .seg.here {
      background: var(--color-accent-text);
    }
    .nofn {
      flex: none;
      color: var(--color-accent-text);
      font-family: var(--font-mono);
      font-size: var(--font-size-caption);
    }
    .body {
      gap: var(--space-3);
      padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    }
    .page {
      display: flex;
      flex-direction: column;
    }
    .fig {
      display: none;
    }
    .fig.phone {
      display: block;
    }
    .text {
      gap: var(--space-3);
      padding-top: 0;
    }
    h3 {
      font-size: calc(var(--font-size-body) + var(--border-thick) + var(--border-thin));
    }
    .foot {
      gap: calc(var(--space-2) + var(--border-thick));
      padding: var(--space-3) calc(var(--space-3) + var(--border-thick)) calc(var(--space-4) + var(--space-1));
      background: var(--color-surface-2);
    }
    .back,
    .next {
      height: calc(var(--size-touch-min) + var(--space-2));
      border-radius: var(--radius-segment);
    }
    .back {
      padding: 0 calc(var(--space-4) + var(--space-1));
    }
    .next {
      flex: 1;
      font-size: calc(var(--font-size-body) + var(--border-thin));
    }
    .fill {
      display: none;
    }
  }
</style>
