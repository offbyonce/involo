<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

One step in the procedure card (Checklist board): its status icon (which ticks), the name with
its E marker, the value in an aligned mono column, and the row menu (Make this the current step,
Mark done, Skip for now, Add to or Remove from Essentials). The whole row selects the step, a 44 px
target. The current step is larger, with where it is, Done, Skip for now and the keyboard hint; a
skipped step has a Skipped pill and Do it now. States read without color too: the icon's shape
and the words. Every step looks the same (decision 0013). Blanks show in the value column
(BlankFields). Below 900 px (tablet portrait and phone, no side pane) the step the
pane would show opens in place with the pane's content (`inline`), and the current step's Done and
Skip for now sit in the bottom bar (Tablet and Mobile boards).
A decision step (decision 0022, Decision.dc.html) asks its option in the value column: a diamond
icon while unanswered, the choices as secondary buttons (choosing one ticks the step), a plan
suggestion ringed with Confirm, the answer once done, and Change, which reopens the choices on the
row in place. A step that depends on the answer links back to it.
A step timer (Timers boards) adds a chip under the value, a line of text and, once it has started,
Pause or Resume and Restart: under the location line on the desktop's current step, under the chip
on the tablet's and phone's, and on the row's second line elsewhere. Done and Skip for now stay put.
A step that opens a CDU walkthrough (#215, CduWalk boards) has Open CDU walkthrough on its current
row, with how many pages it has, or Continue CDU walkthrough with where it stopped: under the
location line on desktop, under the value on the tablet and phone.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { blankLinks } from "../flight/sections";
  import type { Detail, Step, StepRow } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import BlankFields from "./BlankFields.svelte";
  import Icon from "./Icon.svelte";
  import RoleTag from "./RoleTag.svelte";
  import TimerChip from "./TimerChip.svelte";
  import { stateAt, stepAction, timerWords, type Timers } from "./timers";
  import { stepLine, type Walkthroughs } from "./walkthroughs";
  import { stepTitle } from "./names";
  import { fillParts } from "./value-parts";
  import { SOURCE_WORDS, choices, labelOf, lowerFirst, shortLabel, type Decisions } from "./decision";

  let {
    index,
    step,
    row,
    doneAt,
    detail,
    selected,
    marked,
    large = false,
    full = true,
    pair = false,
    onTick,
    onSkip,
    onUnskip,
    onBlank,
    onSelect,
    onEssentials,
    decisions,
    timers,
    walkthroughs,
    inline,
  }: {
    index: PackIndex;
    step: Step;
    row: StepRow;
    doneAt: number | undefined;
    detail: Detail;
    selected: boolean;
    /** Carries the blue bar: the step the side pane shows. */
    marked: boolean;
    large?: boolean;
    full?: boolean;
    /** A challenge-and-response list (Roles board): who calls and who answers, each in a column
     * of its own. */
    pair?: boolean;
    onTick: () => void;
    onSkip: () => void;
    onUnskip: () => void;
    /** What the pilot typed into the step's n-th blank. */
    onBlank: (index: number, value: string) => void;
    onSelect: () => void;
    /** Adds the step to Essentials (true) or removes it (false). */
    onEssentials?: ((add: boolean) => void) | undefined;
    /** Decision steps and the steps that depend on them (decision 0022). */
    decisions?: Decisions | undefined;
    /** Step timers (#213, Timers boards): the chip under the value, a line of text, and Pause or
     * Resume and Restart once it has started. */
    timers?: Timers | undefined;
    /** CDU walkthroughs (#215): the button on the current step that opens its walkthrough. */
    walkthroughs?: Walkthroughs | undefined;
    /** Below 900 px: the step's details in place (the side pane's content). */
    inline?: Snippet | undefined;
  } = $props();

  let decision = $derived(decisions?.state(step) ?? null);
  let dependent = $derived(decisions?.dependent(step) ?? null);
  /** The choices show: the current, unanswered decision step, or Change open on an answered one. */
  let asking = $derived(!!decision && ((row.state === "current" && decision.answer === null) || decision.changing));
  let options = $derived(decision ? choices(decision.option) : []);
  /** The choice that is ringed: the plan's suggestion while asking, the answer while changing. */
  let ringed = $derived(decision ? (decision.changing ? decision.answer : decision.answer === null ? (decision.suggestion?.value ?? null) : null) : null);
  let suggested = $derived(!!decision && decision.answer === null && !decision.changing && !!decision.suggestion);
  let numbers = $derived(options.length > 1 ? `${options.slice(0, -1).map((_, n) => n + 1).join(", ")} or ${options.length}` : "1");

  let menu = $state(false);
  /** A value with blanks: the parts with blanks first, the rest of the instruction after. */
  let fill = $derived(fillParts(dependent?.value ?? step.expect));
  let place = $derived(index.place(step));
  let title = $derived(stepTitle(index, step));
  let current = $derived(row.state === "current");
  /**
   * The step's timer as the Timers boards show it: on the current step in any state, and on any
   * other row once it has started (running, paused or finished), which is usually a done row.
   * Not while a decision step asks its question.
   */
  let timer = $derived.by(() => {
    const t = timers?.of(row.id);
    if (!t || !timers || (asking && !decision?.changing)) return undefined;
    return current || stateAt(t, timers.now) !== "waiting" ? t : undefined;
  });
  let timerState = $derived(timer && timers ? stateAt(timer, timers.now) : "waiting");
  let timerText = $derived(
    timer && timers
      ? timerWords(timer, timers.now, {
          name: (id) => {
            const s = index.step(id);
            return s ? stepTitle(index, s) : id;
          },
          action: (id) => {
            const s = index.step(id);
            return stepAction(s, s ? stepTitle(index, s) : id);
          },
        }, timers.chime)
      : "",
  );
  /** Where the line of text goes: under the location line on the desktop's current step, under
   * the chip on the tablet's and phone's, and on the row's second line elsewhere. */
  let wordsAt = $derived<"name" | "value" | "line">(!current ? "line" : timers?.layout === "desktop" ? "name" : "value");
  /** The walkthrough the current step opens (#215). */
  let walk = $derived(current && !asking ? walkthroughs?.of(step) : undefined);
  /** A phone's done row puts the chip on its value line, before the menu. */
  let chipAtEnd = $derived(!current && timers?.layout === "phone");
  /** Who does the step, and in a challenge-and-response list who answers (decision 0029). */
  let role = $derived(index.role(step.role));
  let responder = $derived(pair ? index.role(step.respond) : undefined);
  let time = $derived(
    doneAt === undefined ? "" : new Date(doneAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );
  const STATE_WORDS = { to_do: "to do", current: "current", done: "done", skipped: "skipped, still open" };
  let tickLabel = $derived(
    row.state === "done" ? `Clear the tick on ${title}` : decision && decision.answer === null ? `${title}: decision step, to answer` : `Confirm ${title}: ${dependent?.value ?? step.expect}`,
  );
  /** An unanswered decision step ticks only by answering. */
  function tickOrAsk(): void {
    if (decision && decision.answer === null && row.state !== "done") return;
    onTick();
  }

  function act(fn: () => void): void {
    menu = false;
    fn();
  }
  function outside(e: PointerEvent): void {
    if (menu && !(e.target instanceof Element && e.target.closest(`[data-menu="${row.id}"]`))) menu = false;
  }
  function key(e: KeyboardEvent): void {
    if (menu && e.key === "Escape") menu = false;
  }
</script>

<svelte:document onpointerdown={outside} onkeydown={key} />

{#snippet walkButton()}
  {#if walk}
    {@const w = walk}
    <div class="walk {walkthroughs?.layout === 'desktop' ? 'name' : 'value'}">
      <button class="walkb" type="button" onclick={() => walkthroughs?.open(step, row.number)}>
        <span class="wicon"><Icon name="walkthrough" /></span>{w.at === undefined ? "Open CDU walkthrough" : "Continue CDU walkthrough"}
      </button>
      <span class="wline">{stepLine(w)}</span>
    </div>
  {/if}
{/snippet}

{#snippet timerLine()}
  {#if timer}
    {@const t = timer.step}
    <div class="tw {wordsAt}">
      <span class="twords">{timerText}</span>
      {#if timerState !== "waiting"}
        <span class="tbtns">
          {#if timerState === "running"}<button class="timerb" type="button" onclick={() => timers?.pause(t)}>Pause</button>
          {:else if timerState === "paused"}<button class="timerb" type="button" onclick={() => timers?.resume(t)}>Resume</button>{/if}
          <button class="timerb" type="button" onclick={() => timers?.restart(t)}>Restart</button>
        </span>
      {/if}
    </div>
  {/if}
{/snippet}

<li class="it {row.state}" data-step={row.id} class:pair class:sel={selected} class:marked class:large class:current class:changing={decision?.changing} class:timed={!!timer} class:chipend={!!timer && chipAtEnd}>
  <button class="tick" type="button" aria-label={tickLabel} aria-pressed={row.state === "done"} aria-disabled={decision && decision.answer === null && row.state !== "done" ? "true" : undefined} onclick={tickOrAsk}>
    {#if current && asking && !decision?.changing}
      <!-- A decision step to answer: a diamond, not the circle (Decision.dc.html). -->
      <span class="diamond" aria-hidden="true"><Icon name="decision" /></span>
    {:else}
      <span class="status {row.state}" aria-hidden="true">
        {#if row.state === "done"}<Icon name="check" />{:else if row.state === "skipped"}<i class="dash"></i>{:else if current}<i class="pip"></i>{/if}
      </span>
    {/if}
  </button>
  {#if pair}<span class="calls">{#if role}<RoleTag {role} /><span class="sr-only">, calls</span>{/if}</span>{/if}
  <!-- The whole row selects the step (a stretched target over the row); the controls in it sit
       above that target. -->
  <div class="namecol">
    <button class="row" type="button" onclick={onSelect} aria-current={selected ? "true" : undefined}>
      <span class="name">
        <span class="nm">{title}</span>
        {#if !pair && role}<RoleTag {role} />{/if}
        {#if full && row.essential && !large}<span class="ebadge" title="Essentials step" aria-hidden="true">E</span><span class="sr-only">, in Essentials</span>{/if}
        <span class="sr-only">, {STATE_WORDS[row.state]}</span>
        {#if row.state === "skipped"}<span class="pill" aria-hidden="true">Skipped</span>{/if}
        {#if row.state === "done" && time && !decision}<span class="stamp" aria-hidden="true">Done {time}</span>{/if}
        {#if !row.counts}<span class="ns">Not modeled in the simulator</span>{/if}
      </span>
      {#if current && place && !decision?.changing}<span class="where-line">{place.zone.area} · {place.zone.title}</span>{/if}
      {#if decision?.changing}<span class="src">Change your answer</span>
      {:else if suggested && current}<span class="suggest">Suggested from your SimBrief plan: {decision?.suggestion?.amount}</span>
      {:else if decision?.answer !== null && decision?.source && row.state === "done"}<span class="src">{SOURCE_WORDS[decision.source]}</span>{/if}
      {#if detail === "expanded" && step.lookFor}<span class="look"><b>Look for:</b> {step.lookFor}</span>{/if}
    </button>
    {#if row.state === "skipped"}<button class="do-now" type="button" onclick={onSelect}>Do it now</button>{/if}
    {#if walkthroughs?.layout === "desktop"}{@render walkButton()}{/if}
    {#if wordsAt === "name"}{@render timerLine()}{/if}
  </div>
  {#if pair}<span class="answers">{#if responder}<RoleTag role={responder} /><span class="sr-only">, answers</span>{/if}</span>{/if}
  <div class="value" class:asking class:answered={!!decision && decision.answer !== null && !asking} class:dep={!!dependent}>
    {#if decision && asking}
      <span class="val">{step.expect}</span>
      <!-- Phone (DecPhone): the plan's suggestion under the value; elsewhere under the title. -->
      {#if suggested && current}<span class="suggest under">Suggested from your SimBrief plan: {decision?.suggestion?.amount}</span>{/if}
      {#if !decision.changing && decision.option.description}<span class="prompt">{decision.option.description}</span>{/if}
      {#each options as c, n (c.value)}
        <button class="choice" type="button" aria-pressed={ringed === c.value} aria-keyshortcuts={String(n + 1)} onclick={() => decisions?.answer(row.id, c.value)}>
          {#if decision.changing && ringed === c.value}<Icon name="check" />{/if}
          <span class="cl">{c.label}</span>
          {#if suggested && ringed === c.value}<span class="tag">Suggested</span>{/if}
        </button>
      {/each}
      {#if decision.changing}<button class="keep" type="button" onclick={() => decisions?.keep(row.id)}>Keep this answer</button>{/if}
    {:else if decision && decision.answer !== null}
      <span class="val">{step.expect}</span>
      <span class="ans">{labelOf(decision.option, decision.answer)}</span>
    {:else if dependent}
      {#if fill}
        <BlankFields name={step.text} blanks={fill.blanks} rest={fill.rest} values={row.values} links={blankLinks(step.fill ?? [])} {onBlank} />
      {:else}
        <span class="val">{dependent.value ?? step.expect}</span>
      {/if}
      {#if dependent.answer === null}
        <button class="dlink muted" type="button" onclick={() => decisions?.change(dependent.decisionStep)}>Depends on the {lowerFirst(dependent.option.title)} answer</button>
      {:else}
        <button class="dlink" type="button" onclick={() => decisions?.change(dependent.decisionStep)}>{dependent.option.title} {lowerFirst(shortLabel(labelOf(dependent.option, dependent.answer)))}</button>
      {/if}
    {:else if step.expect && fill}
      <BlankFields name={step.text} blanks={fill.blanks} rest={fill.rest} values={row.values} links={blankLinks(step.fill ?? [])} {onBlank} />
    {:else if step.expect}
      <span class="val">{step.expect}</span>
    {/if}
    {#if row.hint}<small class="hint">{row.hint}</small>{/if}
    {#if timer && timers && !chipAtEnd}<TimerChip {timer} now={timers.now} />{/if}
    {#if walkthroughs && walkthroughs.layout !== "desktop"}{@render walkButton()}{/if}
    {#if wordsAt === "value"}{@render timerLine()}{/if}
  </div>
  {#if timer && timers && chipAtEnd}<span class="tchip"><TimerChip {timer} now={timers.now} /></span>{/if}
  <div class="end" data-menu={row.id}>
    <button class="more" class:on={menu} type="button" aria-label="More actions for {title}" aria-expanded={menu} aria-haspopup="menu" onclick={() => (menu = !menu)}>···</button>
    {#if menu}
      <div class="menu" role="menu" aria-label="Actions for {title}">
        <button role="menuitem" type="button" onclick={() => act(onSelect)}>Make this the current step</button>
        {#if decision && decision.answer !== null}<button role="menuitem" type="button" onclick={() => act(() => decisions?.change(row.id))}>Change answer</button>{/if}
        {#if row.state !== "done" && !(decision && decision.answer === null)}<button role="menuitem" type="button" onclick={() => act(onTick)}>Mark done</button>{/if}
        {#if row.state === "skipped"}
          <button role="menuitem" type="button" onclick={() => act(onUnskip)}>Unskip</button>
        {:else if row.state !== "done"}
          <button role="menuitem" class="skip" type="button" onclick={() => act(onSkip)}>Skip for now</button>
        {/if}
        {#if onEssentials && !large}
          <hr />
          <button role="menuitem" type="button" onclick={() => act(() => onEssentials?.(!row.essential))}>{row.essential ? "Remove from Essentials" : "Add to Essentials"}</button>
        {/if}
      </div>
    {/if}
  </div>
  {#if wordsAt === "line"}{@render timerLine()}{/if}
  {#if current}
    <div class="actions">
      {#if decision && asking && !decision.changing}
        <!-- Choosing ticks the step, so only a plan suggestion has a button of its own. -->
        {#if suggested && decision.suggestion}
          {@const value = decision.suggestion.value}
          <button class="donebtn confirm" type="button" onclick={() => decisions?.answer(row.id, value)}>Confirm: {shortLabel(labelOf(decision.option, value))}</button>
        {/if}
        <!-- DecPhone: "Skip" on phone. -->
        <button class="skipb" type="button" aria-label="Skip for now" onclick={onSkip}>Skip<span class="fornow">{" for now"}</span></button>
        <span class="fill"></span>
        <span class="keys">{suggested ? "Space confirm · " : ""}{numbers} answer · S skip</span>
      {:else}
        <button class="donebtn" type="button" onclick={onTick}>Done</button>
        <button class="skipb" type="button" onclick={onSkip}>Skip for now</button>
        <span class="fill"></span>
        <span class="keys">Space done · ← back · S skip</span>
      {/if}
    </div>
  {/if}
  {#if inline}<div class="opened">{@render inline()}</div>{/if}
</li>

<style>
  /* The board's row: status 40, name, value 34%, menu 44. */
  .it {
    position: relative;
    display: grid;
    grid-template-columns: calc(var(--size-touch-min) - var(--space-1)) minmax(0, 1fr) 34% var(--size-touch-min);
    column-gap: var(--space-3);
    align-items: center;
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-1) calc(var(--space-1) + var(--border-thick)) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .it:last-child {
    border-bottom: 0;
  }
  .it.current {
    row-gap: var(--space-3);
    align-items: start;
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-1) calc(var(--space-3) + var(--border-thick)) var(--space-3);
    background: var(--color-current-row);
    box-shadow: inset var(--border-bar) 0 0 var(--color-accent);
  }
  .it.marked:not(.current) {
    box-shadow: inset var(--border-bar) 0 0 var(--color-accent);
  }
  .it.sel:not(.current) {
    background: var(--color-accent-soft);
  }
  .tick {
    display: grid;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    margin-left: calc(-1 * var(--border-thick));
    border: 0;
    background: none;
  }
  /* The boards draw the status circles 20 px across (r 10 in a 22 px box). */
  .status {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: calc(var(--size-status-icon) - var(--border-thick));
    height: calc(var(--size-status-icon) - var(--border-thick));
    border: var(--border-thick) solid var(--color-todo-ring);
    border-radius: 50%;
  }
  .status.current {
    border-color: var(--color-accent);
  }
  .pip {
    width: calc((var(--size-status-icon) - var(--border-thick)) / 2);
    height: calc((var(--size-status-icon) - var(--border-thick)) / 2);
    border-radius: 50%;
    background: var(--color-accent);
  }
  .status.done {
    border-color: var(--color-done);
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
  .namecol {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    min-width: 0;
  }
  /* The row's own target reaches over the whole row; the buttons in it stay on top. */
  .row::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  .tick,
  .do-now,
  .end,
  .actions,
  .value :global(input),
  .opened {
    position: relative;
    z-index: 1;
  }
  .row {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--border-thick);
    min-width: 0;
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text);
    font: inherit;
    text-align: left;
  }
  .current .row {
    gap: var(--space-1);
    padding-top: var(--space-2);
  }
  .row {
    flex: 0 1 auto;
  }
  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) calc(var(--space-2) + var(--border-thick));
  }
  .nm {
    font-size: var(--font-size-body);
    font-weight: var(--weight-medium);
  }
  .done .nm {
    color: var(--color-text-secondary);
  }
  .current .nm {
    line-height: var(--leading-tight);
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .ebadge {
    padding: 0 var(--space-1);
    border: var(--border-thin) solid var(--color-essentials-border);
    border-radius: var(--radius-small);
    color: var(--color-essentials-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-bold);
    line-height: var(--space-4);
  }
  .pill {
    padding: var(--border-thick) var(--space-2);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-pill);
    background: var(--color-open-bg);
    color: var(--color-open-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .stamp,
  .ns {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .where-line,
  .look {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .current .where-line {
    line-height: var(--leading-snug);
  }
  .look b {
    color: var(--color-text);
  }
  .value {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    min-width: 0;
  }
  .current .value {
    padding-top: var(--space-2);
  }
  .val {
    font-family: var(--font-mono);
    font-size: var(--font-size-value-mono);
    line-height: var(--leading-snug);
  }
  .current .val {
    color: var(--color-text-strong);
    font-weight: var(--weight-medium);
  }
  .done .val {
    color: var(--color-text-secondary);
  }
  .hint {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .end {
    position: relative;
    display: flex;
  }
  .end:has(.menu) {
    z-index: 4;
  }
  .more {
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-panel-title);
    line-height: 1;
  }
  .current .more {
    color: var(--color-text-secondary);
  }
  .more.on {
    background: var(--color-chip);
    color: var(--color-text-strong);
  }
  /* The row menu (Checklist board): pop-over tokens. */
  .menu {
    position: absolute;
    top: calc(var(--size-touch-min) + var(--space-1));
    right: 0;
    z-index: 3;
    box-sizing: content-box;
    display: flex;
    flex-direction: column;
    /* The board's 248 px is the content width; padding and border add to it. */
    width: calc(10 * var(--space-6) + var(--space-2));
    padding: calc(var(--space-1) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .menu button {
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .menu button:hover {
    background: var(--color-surface-2);
  }
  .menu .skip {
    color: var(--color-open-text);
  }
  .menu hr {
    height: var(--border-thin);
    margin: var(--space-1) var(--space-2);
    border: 0;
    background: var(--color-line);
  }
  .do-now {
    min-height: var(--size-touch-min);
    padding: 0 var(--space-1);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .actions {
    grid-column: 2 / 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .actions button {
    white-space: nowrap;
  }
  .donebtn {
    height: var(--size-touch-min);
    padding: 0 var(--space-6);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font: inherit;
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .skipb {
    height: var(--size-touch-min);
    padding: 0 var(--space-4);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-control);
    background: var(--color-skip-bg);
    color: var(--color-open-text);
    font: inherit;
    font-size: var(--font-size-body);
    font-weight: var(--weight-medium);
  }
  .donebtn.confirm {
    padding: 0 calc(var(--space-4) + var(--space-1));
  }
  .fill {
    flex: 1;
  }
  .keys {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* Decision steps (Decision.dc.html). */
  .diamond {
    display: grid;
    width: var(--size-status-icon);
    height: var(--size-status-icon);
    color: var(--color-accent);
  }
  .diamond :global(.icon) {
    width: 100%;
    height: 100%;
  }
  .suggest {
    color: var(--color-accent-text);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-tight);
  }
  .suggest.under {
    display: none;
  }
  .src {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-tight);
  }
  .value.asking {
    gap: var(--space-2);
  }
  .value.asking .val {
    color: var(--color-text-strong);
    font-weight: var(--weight-medium);
  }
  .prompt {
    line-height: var(--leading-tight);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .choice {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--space-1) / 2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-value-mono);
    font-weight: var(--weight-medium);
    text-align: left;
  }
  .choice[aria-pressed="true"] {
    border: calc(var(--border-thick) * 3 / 4) solid var(--color-accent);
    background: var(--color-accent-soft);
    box-shadow: 0 0 0 calc(var(--border-thick) * 3 / 4) var(--color-accent);
  }
  .choice :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
    color: var(--color-accent);
  }
  .cl {
    flex: 1;
  }
  .tag {
    color: var(--color-accent-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .keep {
    position: relative;
    z-index: 1;
    align-self: flex-start;
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .value.answered .ans {
    color: var(--color-text);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-tight);
  }
  .value.answered .val {
    line-height: var(--leading-tight);
  }
  .done .value.answered .val {
    color: var(--color-text-secondary);
  }
  .value.dep .val {
    white-space: pre-line;
  }
  .it:not(.current) .value.dep {
    padding: calc(var(--space-1) + var(--border-thick)) 0;
  }
  .current .value.dep {
    gap: var(--space-1);
  }
  /* A text link as the board draws it, its 44 px target reaching above and below the line. */
  .dlink {
    position: relative;
    z-index: 1;
    align-self: flex-start;
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    line-height: var(--leading-tight);
    text-align: left;
  }
  .dlink::before {
    position: absolute;
    inset: calc((var(--font-size-secondary) * var(--leading-tight) - var(--size-touch-min)) / 2) 0;
    content: "";
  }
  .dlink.muted {
    color: var(--color-text-muted);
  }
  /* Change open: the row on the second surface, the choices in place (DecChanging). */
  .it.changing {
    row-gap: calc(var(--space-2) + var(--border-thick));
    align-items: start;
    padding: var(--space-3) var(--space-1) calc(var(--space-3) + var(--border-thick)) var(--space-4);
    background: var(--color-surface-2);
  }
  /* The check sits level with the title (DecChanging: 10 px from the row's top padding). */
  .it.changing .tick {
    align-self: start;
    margin-top: calc(-1 * var(--border-thin));
  }
  .it.changing .row {
    padding-top: var(--space-2);
  }
  .it.changing .value {
    padding-top: var(--space-2);
  }
  .it.changing .nm {
    color: var(--color-text);
    font-weight: var(--weight-semibold);
  }
  /* Tablet and phone rows show no location line; tablet portrait and phone show it in the opened
     step, tablet landscape in the side pane (Tablet and Mobile boards). */
  /* Step timers (Timers boards). The chip sits under the value, 6 px down on a done row and 8 on
     the current step (the value column's own gaps). */
  .value :global(.chip) {
    margin-top: var(--space-1);
  }
  .current .value :global(.chip) {
    margin-top: calc(var(--space-2) - var(--border-thick));
  }
  .tw {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
  }
  .twords {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .tbtns {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--space-2) + var(--border-thick));
  }
  /* The timer's buttons: 36 tall, 12 padding, 8 radius, secondary buttons' colors. */
  .timerb {
    height: calc(var(--size-touch-min) - var(--space-2));
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--space-2);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    white-space: nowrap;
  }
  /* The desktop's current step: the text under the location line, in the name's column. */
  .tw.name {
    flex-basis: 100%;
    margin-top: var(--space-1);
  }
  /* The tablet's and phone's current step: the text under the chip. */
  .tw.value {
    margin-top: var(--space-1);
  }
  /* Any other row: the text and buttons on the row's second line, 6 px under the first. */
  .tw.line {
    grid-column: 2 / 5;
    margin-bottom: var(--space-1);
  }
  /* The step's CDU walkthrough (CduWalk boards): a 44 px secondary button with the walkthrough
     icon in accent, and its line in muted text beside it, 6 px under the location line. */
  .walk {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick)) var(--space-3);
  }
  .walk.name {
    flex-basis: 100%;
    padding-top: calc(var(--space-1) + var(--border-thick));
  }
  .walkb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-value-mono);
    font-weight: var(--weight-medium);
  }
  .wicon {
    display: inline-flex;
    color: var(--color-accent);
  }
  .wicon :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .wline {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  /* The tablet's and phone's current step: under the value, the button across the column and its
     line under it. */
  .walk.value {
    flex-direction: column;
    align-items: stretch;
    padding-top: var(--space-1);
  }
  .it.timed:not(.current) {
    row-gap: calc(var(--space-1) + var(--border-thick));
  }
  @media (max-width: 1439px) {
    .where-line {
      display: none;
    }
    /* A skipped row says "Skipped" at the end of its name, in amber; the row does it now. */
    .pill {
      margin-left: auto;
      padding: 0;
      border: 0;
      background: none;
    }
    .name:has(.pill) {
      flex-wrap: nowrap;
    }
    /* The name takes the row, so "Skipped" sits right beside the value (Tablet board). */
    .it.skipped .row {
      flex: 1 1 auto;
    }
    .do-now {
      display: none;
    }
    /* Rows (Tablet board): 10 px gaps, 2 px above and below the 44 px targets. */
    .it {
      column-gap: calc(var(--space-2) + var(--border-thick));
      padding: var(--border-thick) var(--space-1) var(--border-thick) var(--space-4);
    }
    /* The current step: its title at 18 and its value under it. */
    .it.current {
      row-gap: calc(var(--space-2) + var(--border-thick));
      padding: var(--space-3) var(--space-1) calc(var(--space-3) + var(--border-thick)) var(--space-3);
    }
    .it.current .nm {
      font-size: calc(var(--font-size-body) + var(--border-thick));
      font-weight: var(--weight-bold);
    }
    .it.current {
      row-gap: var(--space-1);
    }
    .it.current .row {
      min-height: 0;
    }
    .it.current .value {
      grid-row: 2;
      grid-column: 2 / 4;
    }
    /* The status and the menu span the title and value rows, so the value sits under the title. */
    .it.current .end {
      grid-row: 1 / span 2;
      grid-column: 4;
      align-self: start;
    }
    .it.current .tick {
      grid-row: 1 / span 2;
      align-self: start;
    }
    .it.current .actions,
    .it.current .opened {
      margin-top: calc(var(--space-1) + var(--border-thick));
    }
    .keys {
      display: none;
    }
    .name:has(.pill) {
      width: 100%;
    }
  }
  /* The opened step: the pane's content under the name, to the row's end. */
  .opened {
    grid-column: 2 / -1;
    padding: var(--space-1) var(--space-4) var(--space-2) 0;
  }
  @media (max-width: 899px) {
    .it {
      grid-template-columns: calc(var(--size-touch-min) - var(--space-1)) minmax(0, 1fr) 34% auto;
    }
    /* Done and Skip for now in the bottom bar (Tablet board, portrait). */
    .actions {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 30;
      flex-wrap: nowrap;
      gap: var(--space-3);
      padding: var(--space-3) calc(var(--space-4) + var(--space-1)) calc(var(--space-4) + var(--space-1));
      border-top: var(--border-thin) solid var(--color-line);
      background: var(--color-surface-2);
    }
    .actions .fill,
    .keys {
      display: none;
    }
    .it {
      padding-top: 0;
      padding-bottom: 0;
    }
    .actions .donebtn {
      flex: 1;
      height: calc(var(--size-touch-min) + var(--space-2));
      border-radius: var(--radius-segment);
      font-size: calc(var(--font-size-body) + var(--border-thin));
    }
    .actions .skipb {
      height: calc(var(--size-touch-min) + var(--space-2));
      padding: 0 calc(var(--space-4) + var(--space-1) + var(--border-thin));
      border-radius: var(--radius-segment);
      font-weight: var(--weight-regular);
    }
  }
  /* Non-normal and reference lists use larger type. */
  .large .nm,
  .large .val {
    font-size: var(--font-size-body);
  }
  @media (max-width: 599px) {
    /* Rows (Mobile board): the 20 px status 14 px in, 10 px to the name; the tick keeps 44 px. */
    .it {
      grid-template-columns: var(--size-icon) minmax(0, 1fr) auto;
      padding-left: calc(var(--space-3) + var(--border-thick));
    }
    .tick {
      justify-self: center;
      margin: 0 calc((var(--size-icon) - var(--size-touch-min)) / 2);
    }
    .value {
      grid-column: 2;
    }
    .actions {
      gap: calc(var(--space-2) + var(--border-thick));
      padding: var(--space-3) calc(var(--space-3) + var(--border-thick)) calc(var(--space-4) + var(--space-1));
    }
    .actions .skipb {
      padding: 0 var(--space-4);
    }
    .opened {
      grid-column: 1 / -1;
      padding: 0;
    }
    /* The current step (Mobile board): no status icon, the title at 18 and its value under it,
       the row menu at the top right, the step's details across the row. */
    .it.current {
      grid-template-columns: minmax(0, 1fr) auto;
      padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-3) + var(--border-thick)) var(--space-3)
        calc(var(--space-3) + var(--border-thick));
    }
    .it.current .tick {
      display: none;
    }
    .it.current .namecol,
    .it.current .value {
      grid-column: 1;
      padding-top: 0;
    }
    /* The menu's 44 px target reaches into the row's top padding (never past it) and over the
       value below, so the value sits right under the title (Mobile board, DecPhone). */
    .it.current .end {
      margin: calc(-1 * (var(--space-2) + var(--border-thick))) 0
        calc((var(--font-size-body) + var(--border-thick)) * var(--leading-tight) - var(--size-touch-min) + var(--space-2) + var(--border-thick));
      align-self: start;
      grid-row: 1;
      grid-column: 2;
    }
    .it.current .nm {
      font-size: calc(var(--font-size-body) + var(--border-thick));
      font-weight: var(--weight-bold);
    }
    .it.current .val {
      font-size: var(--font-size-value-mono);
      font-weight: var(--weight-medium);
    }
    /* Step timers on phone (TimersPhone): the text, then the buttons under it, 44 tall; on a done
       row, across the row under its value. */
    .tw.value,
    .tw.line {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .tw .timerb {
      height: var(--size-touch-min);
    }
    .tbtns {
      gap: var(--space-2);
    }
    .tw.line {
      grid-column: 2 / -1;
      padding-right: calc(var(--space-3) + var(--border-thick));
    }
    .it.chipend {
      grid-template-columns: var(--size-icon) minmax(0, 1fr) auto auto;
      column-gap: calc(var(--space-2) + var(--border-thick));
    }
    /* The phone's done row keeps its value and menu on its second line, so the chip joins that
       line, before the menu. */
    .tchip {
      display: flex;
      grid-row: 2;
      grid-column: 3;
    }
    .it.chipend .namecol {
      grid-row: 1;
      grid-column: 2 / -1;
    }
    .it.chipend .value {
      grid-row: 2;
      grid-column: 2;
    }
    .it.chipend .end {
      grid-row: 2;
      grid-column: 4;
    }
    /* A skipped row shows no value (Mobile board). */
    .it.skipped .value {
      display: none;
    }
    /* On phone the choices take the row's width under the title, the menu at the top right
       (DecPhone); the decision's bar says "Skip". */
    .it.current .value.asking {
      grid-column: 1 / -1;
    }
    .fornow {
      display: none;
    }
    .namecol .suggest {
      display: none;
    }
    .suggest.under {
      display: block;
    }
  }
  /* Challenge and response (Roles board): who calls and who answers, each in a 64 px column of
     its own before the challenge and the response, so the tags line up down the list. */
  .it.pair {
    grid-template-columns:
      calc(var(--size-touch-min) - var(--space-1)) calc(var(--space-8) * 2) minmax(0, 1fr)
      calc(var(--space-8) * 2) 34% var(--size-touch-min);
  }
  .calls,
  .answers {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  /* On the current step, each tag sits level with the first line of its text. */
  .it.pair.current .calls,
  .it.pair.current .answers {
    align-self: start;
    min-height: calc(var(--font-size-panel-title) * var(--leading-tight));
    padding-top: var(--space-2);
  }
  /* Names and values line up in every row (Roles board): the current row keeps the others' left
     padding, its bar drawn over it. */
  .it.pair.current {
    padding-left: var(--space-4);
  }
  /* The current step's name is centered in its 44 px target under 8 px; its caller's tag too. */
  .it.pair.current .calls {
    min-height: var(--size-touch-min);
  }
  .it.pair .actions {
    grid-column: 2 / 6;
  }
  @media (max-width: 1439px) {
    /* RolesDesk (desktop and tablet): the current step keeps every cell in its column, so its value
       and the answerer's tag stay under Answers and Response; each tag level with its text. */
    .it.pair.current .tick {
      grid-row: 1;
      grid-column: 1;
    }
    .it.pair.current .calls,
    .it.pair.current .answers {
      grid-row: 1;
      min-height: calc((var(--font-size-body) + var(--border-thick)) * var(--leading-tight) + var(--space-2));
      padding-top: var(--space-2);
    }
    .it.pair.current .calls {
      grid-column: 2;
    }
    .it.pair.current .namecol {
      grid-row: 1;
      grid-column: 3;
    }
    .it.pair.current .answers {
      grid-column: 4;
    }
    .it.pair.current .value {
      grid-row: 1;
      grid-column: 5;
    }
    .it.pair.current .end {
      grid-row: 1;
      grid-column: 6;
    }
  }
  @media (max-width: 899px) {
    .it.pair {
      grid-template-columns:
        calc(var(--size-touch-min) - var(--space-1)) calc(var(--space-8) * 2) minmax(0, 1fr)
        calc(var(--space-8) * 2) 34% auto;
    }
  }
  /* Phone (Roles board): the caller's tag on the name line, the answerer's on the value line. Every
     row keeps the status column (empty on the current step) and a tag column of one width, so
     names and values line up down the list; a tag longer than five characters widens its row's. */
  @media (max-width: 599px) {
    .it.pair,
    .it.pair.current {
      grid-template-columns: var(--size-icon) minmax(calc(var(--space-8) + var(--space-4)), auto) minmax(0, 1fr) auto;
      padding-left: calc(var(--space-3) + var(--border-thick));
    }
    .it.pair .tick {
      grid-row: 1;
      grid-column: 1;
    }
    .it.pair .calls {
      grid-row: 1;
      grid-column: 2;
    }
    .it.pair .namecol {
      grid-row: 1;
      grid-column: 3;
    }
    .it.pair .end {
      grid-row: 1;
      grid-column: 4;
    }
    .it.pair .answers {
      grid-row: 2;
      grid-column: 2;
    }
    .it.pair .value {
      grid-row: 2;
      grid-column: 3;
    }
    .it.pair.skipped .answers {
      display: none;
    }
    .it.pair.current .calls {
      grid-column: 2;
    }
    .it.pair.current .namecol {
      grid-column: 3;
    }
    .it.pair.current .end {
      grid-column: 4;
    }
    .it.pair.current .answers {
      grid-row: 2;
      grid-column: 2;
      min-height: 0;
      padding-top: 0;
    }
    .it.pair.current .value {
      grid-row: 2;
      grid-column: 3;
      padding-top: 0;
    }
    .it.pair.current .value.asking {
      grid-column: 3 / -1;
    }
  }
</style>
