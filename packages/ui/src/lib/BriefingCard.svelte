<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A briefing at the top of its phase (Briefings boards, #214), in its three states. To give: a card
with the title, the mnemonic in a chip and "Briefing · <n> lines", each line's word with its
`lead` letters in bold accent text and its `detail` under it, then Briefed and Skip briefing.
Briefed: one line with the done check, the title, the mnemonic and "Briefed at <time>", and Show,
which opens the card again to read, with Mark not briefed. Skipped: one line with the skipped
mark, the title, the Skipped tag and "Brief it now", which opens the card to give. It never blocks
the steps: the current step keeps its own Done and Skip for now. Phone (BriefingsPhone): the
card 12 px in from the screen's edges, the buttons sharing its bottom row; the one-line forms
edge to edge, with the mnemonic and the time, or Skipped, under the title.
-->
<script lang="ts">
  import type { Briefing, BriefingMark } from "@involo/bindings";
  import Icon from "./Icon.svelte";

  let {
    briefing,
    mark,
    onBrief,
    onSkip,
    onUnmark,
  }: {
    briefing: Briefing;
    /** What the pilot did with it; none while it is still to give. */
    mark: BriefingMark | undefined;
    onBrief: () => void;
    onSkip: () => void;
    onUnmark: () => void;
  } = $props();

  /** Opened again from its one-line form, by Show or Brief it now. */
  let shown = $state(false);
  let card = $state<HTMLElement | null>(null);
  let id = $derived(`brief-${briefing.id}`);
  let lines = $derived(briefing.items.length);
  /** The time as the done steps show theirs ("Done 01:30 AM"). */
  let time = $derived(
    mark ? new Date(mark.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
  );

  /** Opens the card, and moves focus into it so the lines are read next. */
  function open(): void {
    shown = true;
    queueMicrotask(() => card?.querySelector<HTMLElement>("h2")?.focus());
  }
</script>

{#if !mark || shown}
  <section class="frame brief" aria-labelledby={id} bind:this={card}>
    <header>
      <h2 {id} tabindex="-1">{briefing.title}</h2>
      {#if briefing.mnemonic}<span class="mn"><span class="sr-only">{"Mnemonic "}</span>{briefing.mnemonic}</span>{/if}
      <span class="fill"></span>
      <span class="count">
        {#if mark?.state === "briefed"}Briefed at {time}{:else if mark?.state === "skipped"}Skipped{:else}Briefing · {lines}
          {lines === 1 ? "line" : "lines"}{/if}
      </span>
      {#if mark}
        <button class="show hide" type="button" aria-expanded="true" aria-controls={`${id}-lines`} onclick={() => (shown = false)}
          >Hide<Icon name="chevron-down" /></button
        >
      {/if}
    </header>
    <ol class="lines" id={`${id}-lines`}>
      {#each briefing.items as item (item.id)}
        <li>
          <span class="word"><b>{item.lead}</b>{item.rest}</span>
          {#if item.detail}<span class="detail">{item.detail}</span>{/if}
        </li>
      {/each}
    </ol>
    <div class="acts">
      {#if mark?.state === "briefed"}
        <button
          class="notb"
          type="button"
          onclick={() => {
            shown = false;
            onUnmark();
          }}>Mark not briefed</button
        >
      {:else}
        <button
          class="briefed"
          type="button"
          onclick={() => {
            shown = false;
            onBrief();
          }}>Briefed</button
        >
        {#if mark?.state !== "skipped"}<button class="skipb" type="button" onclick={onSkip}>Skip briefing</button>{/if}
        <span class="fill"></span>
        <span class="say">Say each line out loud.</span>
      {/if}
    </div>
  </section>
{:else if mark.state === "briefed"}
  <div class="frame one briefed-row">
    <span class="status done" aria-hidden="true"><Icon name="check" /></span>
    <span class="txt">
      <span class="t">{briefing.title}</span>
      <span class="sub">
        {#if briefing.mnemonic}<span class="mn"><span class="sr-only">{"Mnemonic "}</span>{briefing.mnemonic}</span><span
            class="dot"
            aria-hidden="true">{" · "}</span
          >{/if}<span class="when">briefed at {time}</span>
      </span>
    </span>
    <span class="fill"></span>
    <!-- The whole line opens the card (a stretched target), as on the board. -->
    <button class="show" type="button" aria-expanded="false" aria-label={`Show the ${briefing.title} briefing`} onclick={open}
      >Show<Icon name="chevron-down" /></button
    >
  </div>
{:else}
  <div class="frame one skipped-row">
    <span class="status skipped" aria-hidden="true"><i class="dash"></i></span>
    <span class="txt">
      <span class="t">{briefing.title}</span>
      <span class="tag">Skipped</span>
    </span>
    <button class="now" type="button" onclick={open}>Brief it now</button>
    <span class="fill"></span>
    <button class="show" type="button" aria-expanded="false" aria-label={`Show the ${briefing.title} briefing`} onclick={open}
      >Show<Icon name="chevron-down" /></button
    >
  </div>
{/if}

<style>
  /* Desktop and tablet (Briefings): the procedure card's frame, header and rules. Its own class,
     not the lists' .card, so the lists below it keep their own first-list form. */
  .frame {
    margin-bottom: var(--space-4);
    overflow: hidden;
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  header {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    /* The board's 52 px is the content height; its rule adds 1. */
    min-height: calc(var(--size-touch-min) + var(--space-2) + var(--border-thin));
    padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  h2:focus {
    outline: none;
  }
  .mn {
    padding: var(--border-thick) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-chip);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .fill {
    flex: 1;
  }
  .count {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
    white-space: nowrap;
  }
  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lines li {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .word {
    font-size: var(--font-size-body);
    font-weight: var(--weight-medium);
    line-height: var(--leading-tight);
  }
  .word b {
    color: var(--color-accent-text);
    font-weight: var(--weight-bold);
  }
  .detail {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-snug);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + var(--border-thick)) calc(var(--space-4) + var(--space-1));
  }
  .acts button {
    height: var(--size-touch-min);
    border-radius: var(--radius-control);
    font: inherit;
    font-size: var(--font-size-body);
    white-space: nowrap;
  }
  .acts .briefed {
    padding: 0 var(--space-6);
    border: 0;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
  .acts .skipb {
    padding: 0 var(--space-4);
    border: var(--border-thin) solid var(--color-open-border);
    background: var(--color-skip-bg);
    color: var(--color-open-text);
    font-weight: var(--weight-medium);
  }
  .acts .notb {
    padding: 0 var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font-weight: var(--weight-medium);
  }
  .say {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .show {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .show :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .hide :global(svg) {
    transform: rotate(180deg);
  }

  /* The one-line forms: 52 tall, the card's frame, 16 20 in, 12 apart. */
  .one {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--space-1));
  }
  .txt {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .t {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .sub {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
    white-space: nowrap;
  }
  .dot {
    display: none;
  }
  /* "Briefed at 10:42" on its own; after the mnemonic on a phone, "ATCT · briefed at 10:42". */
  .when::first-letter {
    text-transform: uppercase;
  }
  /* The whole briefed line opens the card. */
  .briefed-row .show::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .tag {
    padding: var(--border-thick) var(--space-2);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-pill);
    background: var(--color-open-bg);
    color: var(--color-open-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .now {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-1);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    white-space: nowrap;
  }
  /* The step rows' status circles: 20 across, the done check and the dashed skipped mark. */
  .status {
    display: grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    width: calc(var(--size-status-icon) - var(--border-thick));
    height: calc(var(--size-status-icon) - var(--border-thick));
    border: var(--border-thick) solid var(--color-done);
    border-radius: 50%;
  }
  .status.done {
    background: var(--color-done);
    color: var(--color-on-done);
  }
  .status.done :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .status.skipped {
    border-style: dashed;
    border-color: var(--color-open-dot);
  }
  .dash {
    width: calc(var(--size-status-icon) / 2);
    height: var(--border-thick);
    background: var(--color-open-dot);
  }

  /* Phone (BriefingsPhone). */
  @media (max-width: 599px) {
    /* The card: 12 in from the screen's edges, the header 12 14 10, the lines 10 14. */
    .brief {
      margin: var(--space-3) calc(var(--space-3) - var(--gutter));
    }
    header {
      gap: var(--space-2);
      min-height: 0;
      padding: var(--space-3) calc(var(--space-3) + var(--border-thick)) calc(var(--space-2) + var(--border-thick));
    }
    h2 {
      flex: 1;
    }
    header .fill,
    .count,
    .say {
      display: none;
    }
    .lines li {
      padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    }
    /* The two buttons share the bottom row: Briefed takes the room, 10 apart. */
    .acts {
      flex-wrap: nowrap;
      gap: calc(var(--space-2) + var(--border-thick));
      padding: var(--space-3) calc(var(--space-3) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    }
    .acts .briefed,
    .acts .notb {
      flex: 1;
      padding: 0 var(--space-4);
    }
    .acts .fill {
      display: none;
    }
    /* The one-line forms: edge to edge, 48 tall, 14 in, the mnemonic and time or Skipped under
       the title. */
    .one {
      gap: calc(var(--space-2) + var(--border-thick));
      min-height: calc(var(--size-touch-min) + var(--space-1));
      margin: 0 calc(-1 * var(--gutter));
      padding: 0 calc(var(--space-3) + var(--border-thick));
      border: 0;
      border-bottom: var(--border-thin) solid var(--color-line);
      border-radius: 0;
      background: none;
    }
    .skipped-row {
      padding-right: 0;
    }
    .txt {
      flex: 1;
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
    }
    .t {
      font-size: var(--font-size-value-mono);
    }
    .sub {
      display: block;
      font-size: calc(var(--font-size-caption) + var(--border-thin));
    }
    .sub .mn {
      padding: 0;
      background: none;
      color: inherit;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
    }
    .dot {
      display: inline;
    }
    .tag {
      padding: 0;
      border: 0;
      background: none;
    }
    .now {
      padding: 0 calc(var(--space-3) + var(--border-thick));
    }
    .one > .fill,
    .skipped-row .show {
      display: none;
    }
    .show :global(svg) {
      display: none;
    }
  }
</style>
