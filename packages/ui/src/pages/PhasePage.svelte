<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A phase in List view (Checklist board): where the phase sits and its title, "N open steps"
with the open-steps list, the phase's briefings (Briefings boards), the lists as cards (a challenge-and-response checklist folded until
the procedure is done), and buttons to the phases either side. Step by step view shows the same phase one
step at a time (lib/FlowView.svelte).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Checklist, Detail, FieldId, Flight, OpenStep, PhaseModel } from "@involo/bindings";
  import OpenStepsPop from "../lib/OpenStepsPop.svelte";
  import { openSteps } from "../lib/open-steps.svelte";
  import Icon from "../lib/Icon.svelte";
  import ListCard from "../lib/ListCard.svelte";
  import OptionChoices from "../lib/OptionChoices.svelte";
  import type { PackIndex } from "../pack-index";
  import { flightHref, phaseHref } from "../route.svelte";
  import { decisionKey, type Decisions } from "../lib/decision";
  import RunningTimers from "../lib/RunningTimers.svelte";
  import BriefingCard from "../lib/BriefingCard.svelte";
  import type { Timers } from "../lib/timers";
  import type { Walkthroughs } from "../lib/walkthroughs";

  let {
    index,
    view,
    lists,
    flight,
    detail,
    selected,
    onTick,
    onSkip,
    onUnskip,
    onBlank,
    onSelect,
    onClear,
    full = true,
    fullView = null,
    onOption,
    onValue,
    open = [],
    onGo,
    onEssentials,
    decisions,
    timers,
    walkthroughs,
    inline,
    inlineStep = null,
    notice,
    onBriefing,
  }: {
    index: PackIndex;
    view: PhaseModel;
    lists: Map<string, Checklist>;
    flight: Flight;
    detail: Detail;
    selected: string | null;
    onTick: (id: string, done: boolean) => void;
    onSkip: (id: string) => void;
    onUnskip: (id: string) => void;
    onBlank: (id: string, index: number, value: string) => void;
    onSelect: (id: string) => void;
    onClear: (list: string) => void;
    full?: boolean;
    /** In Essentials, this phase in Full. */
    fullView?: PhaseModel | null;
    onOption: (option: string, value: string) => void;
    /** A flight value typed in a box on the page, such as Arrival data. */
    onValue: (field: FieldId, value: string) => void;
    /** Every open step, for "N open steps". */
    open?: OpenStep[];
    /** Goes to a step (the open-steps list). */
    onGo?: ((id: string) => void) | undefined;
    onEssentials?: ((id: string, add: boolean) => void) | undefined;
    /** Decision steps and the steps that depend on them (decision 0022). */
    decisions?: Decisions | undefined;
    /** Step timers (#213): each step's timer, the clock and the pilot's controls. */
    timers?: Timers | undefined;
    /** CDU walkthroughs (#215): the current step's button that opens its walkthrough. */
    walkthroughs?: Walkthroughs | undefined;
    /** Below 900 px: the opened step's details, shown in the row of `inlineStep`. */
    inline?: Snippet | undefined;
    inlineStep?: string | null;
    /** Shown under the title, above the lists: the note after a pack update (PacksUpdate). */
    notice?: Snippet | undefined;
    /** Marks a briefing Briefed or skipped, or takes the mark away (#214). */
    onBriefing?: ((briefing: string, change: "brief" | "skip" | "unmark") => void) | undefined;
  } = $props();
  /** The phase's briefings, above its lists (Briefings boards). */
  let briefings = $derived(onBriefing ? index.briefings(view.id) : []);
  /** The phase's procedure is not done yet: its checklist stays folded (Checklist board). */
  let procedureOpen = $derived(view.lists.some((l) => l.kind === "flow" && !l.complete));

  let asked = $derived(index.options.filter((o) => (o.askIn ?? []).includes(view.id)));

  /**
   * Keys, as in 3.0's Flow view: Down and Up arrows move between steps, Space ticks the selected
   * step (the current one if none is selected). Ignored while typing or on a control.
   */
  let rows = $derived(view.lists.flatMap((l) => l.steps));
  function onKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof Element && t.closest("input, textarea, select, button, a, summary, [contenteditable]")) return;
    // Keys never act on the list under the menu, the stage picker or a sheet.
    if (t instanceof Element && t.closest('[role="dialog"], #drawer')) return;
    if (document.querySelector('#drawer.open, .picker, .find[role="dialog"]') || openSteps.shown) return;
    const at = rows.findIndex((r) => r.id === (selected ?? view.lists.find((l) => l.current)?.current));
    // A decision step that asks takes 1, 2 … and Space (Decision.dc.html).
    const asking = at >= 0 ? index.step(rows[at]?.id ?? "") : undefined;
    if (asking && decisions && decisionKey(e.key, asking, decisions)) {
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
      // ← back, as the current step's hint says: the step before.
      const next = rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        e.preventDefault();
        onSelect(next.id);
      }
    } else if ((e.key === "s" || e.key === "S") && at >= 0) {
      const row = rows[at];
      if (row && row.state !== "done") {
        e.preventDefault();
        onSkip(row.id);
      }
    } else if (e.key === " " && at >= 0) {
      const row = rows[at];
      if (row) {
        e.preventDefault();
        onTick(row.id, row.state === "done");
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="title">
  <div>
    {#if view.stage && view.position}
      <p class="crumb">{view.stage} · Phase {view.position[0]} of {view.position[1]}</p>
    {/if}
    <h1>{view.title}</h1>
  </div>
  {#if onGo}<OpenStepsPop {index} {open} {onGo} />{/if}
</div>

{#if notice}{@render notice()}{/if}

{#each asked as option (option.id)}
  <OptionChoices
    {option}
    value={flight.options[option.id] ?? option.default}
    onChoose={(value) => onOption(option.id, value)}
  />
{/each}

{#if view.arrival}
  <!-- Arrival values live only in Flight › Approach (decision 0019, amended). -->
  <a class="arrival" href={flightHref("approach")}>Arrival data is in Flight › Approach <Icon name="chevron-right" /></a>
{/if}

{#each briefings as b (b.id)}
  <BriefingCard
    briefing={b}
    mark={flight.briefings?.[b.id]}
    onBrief={() => onBriefing?.(b.id, "brief")}
    onSkip={() => onBriefing?.(b.id, "skip")}
    onUnmark={() => onBriefing?.(b.id, "unmark")}
  />
{/each}

{#each view.lists as list, n (list.id)}
  <ListCard
    next={view.lists[n + 1] ?? null}
    {index}
    {list}
    source={lists.get(list.id)}
    {flight}
    {detail}
    {selected}
    large={list.kind === "non-normal"}
    {full}
    fullList={fullView?.lists.find((l) => l.id === list.id) ?? null}
    {onTick}
    {onSkip}
    {onUnskip}
    {onBlank}
    {onSelect}
    {onClear}
    {onEssentials}
    folded={list.kind === "checklist" && procedureOpen}
    {decisions}
    {timers}
    {walkthroughs}
    {inline}
    {inlineStep}
  />
{/each}
{#if timers}<RunningTimers {timers} />{/if}

<nav class="nav" aria-label="Phases either side">
  {#if view.previous}
    <a class="btn secondary" href={phaseHref(view.previous.id)}><Icon name="arrow-left" /> {view.previous.title}</a>
  {:else}
    <!-- The first phase leads back to Flight setup, as in 3.0. -->
    <a class="btn secondary" href="#/flight/overview"><Icon name="arrow-left" /> Flight</a>
  {/if}
  {#if view.next}
    <a class="btn secondary" href={phaseHref(view.next.id)}>{view.next.title} <Icon name="arrow-right" /></a>
  {/if}
</nav>

<style>
  .title {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .crumb {
    margin: 0 0 var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-page-title);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }
  .arrival {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--size-touch-min);
    margin-bottom: var(--space-2);
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .nav {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
  /* Tablet (Tablet board): no crumb, the title at 24. Phone (Mobile board): no title block; the
     header names the stage and phase, the progress row has "2 open". */
  @media (max-width: 1439px) {
    .crumb {
      display: none;
    }
    h1 {
      font-size: var(--font-size-section-title);
    }
    .title {
      align-items: center;
    }
  }
  /* Phone: the title is for screen readers only; the open-steps sheet stays in this block, so
     only the heading is clipped. */
  @media (max-width: 599px) {
    .title {
      margin: 0;
    }
    .title h1 {
      position: absolute;
      width: var(--border-thin);
      height: var(--border-thin);
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
