<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

One list as a card (Checklist board): the title with its done and skipped counts and, once a step
is ticked, Clear ticks (Undo after); the steps, the done ones at the top folded to one line
with Show; and at the end the completion call (3.0). A challenge-and-response checklist stays
folded to one line with its count until the phase's procedure is done.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Checklist, Detail, Flight, PhaseList } from "@involo/bindings";
  import { marksStep } from "./marked-step";
  import type { PackIndex } from "../pack-index";
  import Icon from "./Icon.svelte";
  import LevelBadge from "./LevelBadge.svelte";
  import MessageText from "./MessageText.svelte";
  import { messageHref } from "./messages";
  import { stepTitle } from "./names";
  import StepItem from "./StepItem.svelte";
  import { stateAt, type Timers } from "./timers";
  import type { Decisions } from "./decision";

  let {
    index,
    list,
    source,
    flight,
    detail,
    selected,
    large = false,
    full = true,
    fullList = null,
    onTick,
    onSkip,
    onUnskip,
    onBlank,
    onSelect,
    onClear,
    onEssentials,
    folded = false,
    decisions,
    timers,
    inline,
    inlineStep = null,
    next = null,
  }: {
    index: PackIndex;
    list: PhaseList;
    source: Checklist | undefined;
    flight: Flight;
    detail: Detail;
    selected: string | null;
    large?: boolean;
    /** Every step shows (not Essentials only): Essentials steps carry an E. */
    full?: boolean;
    /** In Essentials, this list in Full, for "Show N more steps from Full". */
    fullList?: PhaseList | null;
    onTick: (id: string, done: boolean) => void;
    onSkip: (id: string) => void;
    onUnskip: (id: string) => void;
    onBlank: (id: string, index: number, value: string) => void;
    onSelect: (id: string) => void;
    onClear: (list: string) => void;
    /** Adds a step to Essentials or removes it (the row menu). */
    onEssentials?: ((id: string, add: boolean) => void) | undefined;
    /** A checklist whose procedure is not done yet: folded to one line until opened. */
    folded?: boolean;
    /** Decision steps and the steps that depend on them (decision 0022). */
    decisions?: Decisions | undefined;
    /** Step timers (#213). */
    timers?: Timers | undefined;
    /** Below 900 px: the opened step's details, shown in the row of `inlineStep`. */
    inline?: Snippet | undefined;
    inlineStep?: string | null;
    /** The list after this one, for the phone's "3 more steps · then Before start checklist, 0 of 6". */
    next?: PhaseList | null;
  } = $props();

  let touched = $derived(list.progress.done + list.progress.skipped > 0);
  /** Showing the whole list in Essentials, as 3.0's "Show 3 more steps from Full". */
  let more = $state(false);
  let rows = $derived(more && fullList ? fullList.steps : list.steps);

  /**
   * The done steps at the top fold into one line, with Show (Checklist board). A decision step
   * stays out of the fold, so its answer shows (Decision.dc.html), and so does a step whose timer
   * has started (running, paused or finished), so the timer stays in view (Timers boards).
   */
  let lead = $derived.by(() => {
    const timed = (id: string) => {
      const t = timers?.of(id);
      return !!t && stateAt(t, timers?.now ?? 0) !== "waiting";
    };
    let n = 0;
    while (rows[n]?.state === "done" && !index.step(rows[n]?.id ?? "")?.decide && !timed(rows[n]?.id ?? "")) n++;
    return n;
  });
  let showDone = $state(false);
  let shown = $derived(showDone || lead < 2 ? rows : rows.slice(lead));
  let first = $derived(lead ? index.step(rows[0]?.id ?? "") : undefined);
  let last = $derived(lead ? index.step(rows[lead - 1]?.id ?? "") : undefined);
  /** Phone (Mobile board): the steps after the current one fold into one row until opened. */
  let rest = $state(false);
  let currentAt = $derived(shown.findIndex((r) => r.state === "current"));
  let after = $derived(large || currentAt < 0 ? 0 : shown.length - currentAt - 1);
  /** The fold opens by itself when the step chosen is one of the folded ones (Go to step). */
  let unfolded = $derived(rest || large || (selected !== null && shown.findIndex((r) => r.id === selected) > currentAt));
  // svelte-ignore state_referenced_locally
  let openList = $state(!folded);
  $effect(() => {
    if (!folded) openList = true;
  });
  /** The alert messages that call for this list (MsgEmergency); none without messages. */
  let calledBy = $derived(index.messagesCalling(list.id));
  /** How the list is used, in the pack's words, and its kind (Roles board); no method, no line. */
  let method = $derived(index.listMethod(list.id));
  let kind = $derived(index.listKind(list.id) ?? "");
  /** Challenge and response: who calls and who answers, in columns of their own. */
  let pair = $derived(source?.method === "challenge_response");
  let counts = $derived(
    `${list.progress.done} of ${list.progress.total} done${list.progress.skipped ? ` · ${list.progress.skipped} skipped` : ""}`,
  );
</script>

{#if !openList}
  <!-- Folded until the procedure is done (Checklist board): one line with its count. -->
  <button class="card folded" type="button" aria-expanded="false" onclick={() => (openList = true)}>
    <span class="ft">{list.title}</span>
    <span class="fd">{method ? `${method} · opens when the procedure is done` : "Opens when the procedure is done"}</span>
    <span class="fill"></span>
    <span class="fd">{list.progress.done} of {list.progress.total} ⌄</span>
  </button>
{:else}
<section class="card" class:large aria-labelledby="list-{list.id}">
  <header>
    <span class="ttl">
      <h2 id="list-{list.id}">{list.title}</h2>
      {#if method}<span class="how">{kind} · {method}</span>{/if}
    </span>
    <span class="count">{counts}</span>
    {#if touched}<button class="clear" type="button" onclick={() => onClear(list.id)}>Clear ticks</button>{/if}
  </header>
  <!-- Tablet and phone: a later list starts with a plain label, the fold's text. -->
  {#if method}
    <!-- Tablet and phone (Roles board): how the list is used and its count; a later list names
         itself first, as its label row did. -->
    <p class="strip" aria-hidden="true"><span><span class="st">{`${list.title} · `}</span>{method}</span><span>{counts}</span></p>
  {:else}
    <p class="label" aria-hidden="true">{list.title} · {list.progress.done} of {list.progress.total}</p>
  {/if}
  {#each calledBy as m (m.id)}
    <div class="called">
      <span class="bell"><Icon name="bell" /></span>
      <span class="by">Called for by</span>
      <MessageText text={m.text} level={m.level} />
      <LevelBadge level={m.level} />
      <a class="means" href={messageHref(m.id)}>What it means<Icon name="chevron-right" /></a>
    </div>
  {/each}
  {#if source?.when || source?.why}
    <div class="when">
      {#if source?.when}<p><b>When</b> · {source.when}</p>{/if}
      {#if source?.why}<p><b>Why</b> · {source.why}</p>{/if}
    </div>
  {/if}
  {#if lead >= 2}
    <div class="done-group">
      <span class="ok"><Icon name="check" /></span>
      <span class="dg">{lead} done · {first ? stepTitle(index, first) : ""} to {last ? stepTitle(index, last) : ""}</span>
      <button class="show" type="button" aria-expanded={showDone} onclick={() => (showDone = !showDone)}>{showDone ? "Hide" : "Show"}</button>
    </div>
  {/if}
  {#if pair}
    <div class="heads" aria-hidden="true"><span></span><span>Calls</span><span>Challenge</span><span>Answers</span><span>Response</span></div>
  {/if}
  <ol class="items" class:rest={unfolded}>
    {#each shown as row (row.id)}
      {@const step = index.step(row.id)}
      {#if step}
        <StepItem
          {index}
          {step}
          {row}
          {detail}
          {large}
          full={full || more}
          {pair}
          doneAt={flight.session.done[row.id]}
          selected={selected === row.id}
          marked={marksStep(selected, row.id, row.state)}
          onTick={() => onTick(row.id, row.state === "done")}
          onSkip={() => onSkip(row.id)}
          onUnskip={() => onUnskip(row.id)}
          onBlank={(n, v) => onBlank(row.id, n, v)}
          onSelect={() => onSelect(row.id)}
          onEssentials={onEssentials ? (add) => onEssentials(row.id, add) : undefined}
          {decisions}
          {timers}
          inline={inlineStep === row.id ? inline : undefined}
        />
      {/if}
    {/each}
  </ol>
  {#if after > 0 && !unfolded}
    <button class="after" type="button" aria-expanded="false" onclick={() => (rest = true)}
      ><span>{after} more {after === 1 ? "step" : "steps"}</span><span class="fill"></span>{#if next}<span class="then"
          >then {next.title}, {next.progress.done} of {next.progress.total}</span
        >{/if}</button
    >
  {/if}
  {#if list.hidden > 0 && fullList}
    <button class="more" type="button" aria-expanded={more} onclick={() => (more = !more)}>
      {more ? "Show Essentials only" : `Show ${list.hidden} more ${list.hidden === 1 ? "step" : "steps"} from Full`}
    </button>
  {/if}
  {#if list.complete}
    <p class="call done" role="status"><Icon name="check" /> {list.title} complete</p>
  {:else if list.progress.toDo === 0 && list.progress.skipped > 0}
    <p class="call open" role="status">
      <Icon name="alert-triangle" />
      {list.progress.skipped} skipped {list.progress.skipped === 1 ? "step" : "steps"} still open. {list.title} is not complete.
    </p>
  {/if}
</section>
{/if}

<style>
  /* An open row menu reaches past the card's bottom (the Checklist board), so the card stops
     clipping while one is open. */
  section.card:has(:global(.menu)) {
    overflow: visible;
  }
  /* The card header (Checklist board): 52 tall, title and counts. */
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    /* The board's 52 px is the content height; its rule adds 1. */
    min-height: calc(var(--size-touch-min) + var(--space-2) + var(--border-thin));
    padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .ttl {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thick);
    min-width: 0;
  }
  .how {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .count {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .clear {
    min-height: var(--size-touch-min);
    padding: 0 var(--space-1);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .done-group {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .ok {
    display: inline-flex;
    color: var(--color-done);
  }
  .ok :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .dg {
    flex: 1;
  }
  .show {
    min-height: var(--size-touch-min);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
  }
  .folded {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--space-1));
    color: var(--color-text);
    font: inherit;
    text-align: left;
  }
  .ft {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .fd {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .fill {
    flex: 1;
  }
  .when {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-border);
    background: var(--color-bg);
    font-size: var(--font-size-secondary);
  }
  .when p {
    margin: 0;
  }
  .when p + p {
    margin-top: var(--space-1);
  }
  .items {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .more {
    min-height:  var(--size-touch-min);
    padding: 0 var(--space-4) var(--space-2);
    color: var(--color-accent);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-medium);
    text-align: left;
  }
  .call {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-4) var(--space-4);
    border-top: var(--border-thin) solid var(--color-border);
    font-weight: var(--weight-semibold);
  }
  .call.done {
    background: var(--color-surface-2);
    color: var(--color-done);
    font-size: var(--font-size-body);
    text-transform: uppercase;
  }
  .call.open {
    background: var(--color-open-bg);
    color: var(--color-open-text);
  }
  .after {
    display: none;
  }
  /* Tablet and phone (Tablet and Mobile boards): no procedure header; the header names the phase,
     the menu has Clear ticks. The list keeps its name for screen readers. An emergency list keeps
     its header. */
  @media (max-width: 1439px) {
    section.card:not(.large) > header {
      position: absolute;
      width: var(--border-thin);
      height: var(--border-thin);
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    section.card:not(.large) > header :is(.count, .clear) {
      display: none;
    }
    /* A list after the first starts with a plain label row: 32 px, 12 px semibold, muted. */
    :global(.card) ~ section.card:not(.large) > .label {
      display: flex;
    }
  }
  .label {
    display: none;
    align-items: center;
    min-height: var(--space-8);
    margin: 0;
    padding: 0 calc(var(--space-3) + var(--border-thick));
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  /* Phone (Mobile board): no card frame, rows edge to edge, the steps after the current one folded. */
  @media (max-width: 599px) {
    section.card {
      margin-right: calc(-1 * var(--gutter));
      margin-left: calc(-1 * var(--gutter));
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }
    .items:not(.rest) :global(.it.current ~ .it) {
      display: none;
    }
    /* The fold names the next list ("then …"), so the lists below it wait until it opens. */
    section.card:has(> .after) ~ :global(.card:not(.large)) {
      display: none;
    }
    .after {
      display: flex;
      align-items: center;
      gap: calc(var(--space-2) + var(--border-thick));
      width: 100%;
      min-height: calc(var(--size-touch-min) + var(--space-1));
      padding: 0 calc(var(--space-3) + var(--border-thick));
      border: 0;
      border-bottom: var(--border-thin) solid var(--color-line);
      background: none;
      color: var(--color-text);
      font: inherit;
      font-size: var(--font-size-value-mono);
      text-align: left;
    }
    .after .then {
      color: var(--color-text-muted);
      font-size: var(--font-size-secondary);
    }
  }
  /* The message that calls for this list (MsgEmergency), linking to what it means. */
  .called {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-3) var(--space-3) var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .called .bell {
    display: flex;
    color: var(--color-text-muted);
  }
  .called .bell :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .called .by {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .called .means {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--size-touch-min);
    margin-left: auto;
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .called .means :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  /* How the list is used, on tablet and phone (Roles board): method left, count right. */
  .strip {
    display: none;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .strip .st {
    display: none;
  }
  @media (max-width: 1439px) {
    section.card:not(.large) > .strip {
      display: flex;
    }
    :global(.card) ~ section.card:not(.large) > .strip .st {
      display: inline;
    }
  }
  /* Column headings over a challenge-and-response list (Roles board), on the rows' own grid. */
  .heads {
    display: grid;
    grid-template-columns:
      calc(var(--size-touch-min) - var(--space-1)) calc(var(--space-8) * 2) minmax(0, 1fr)
      calc(var(--space-8) * 2) 34% var(--size-touch-min);
    column-gap: var(--space-3);
    padding: var(--space-2) var(--space-1) var(--space-2) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  @media (max-width: 1439px) {
    .heads {
      column-gap: calc(var(--space-2) + var(--border-thick));
    }
  }
  @media (max-width: 599px) {
    .heads {
      display: none;
    }
  }
</style>
