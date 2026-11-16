<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The Flight log (owner; LogDesk, LogPhone and LogPhoneFlight boards, completing round 6's Log view;
decision 0026). Saved on this device only.
From 900 px (desktop and tablet landscape): This flight (its latest ticks and open steps, Show
every tick), Earlier flights newest first with the opened one marked and shown below the list
(its facts, the time in each stage as proportional bars, the skipped steps, each going to its
step, Show every tick, Delete this flight), Practice results, and the actions column: Log flight
and start new, Save copy (HTML file), Export CSV, Export JSON, Load log file, Print or save as PDF
and the note. Below 900 px (phone and tablet portrait): This flight, Earlier flights and
Practice results as a list; a flight opens on its own page; Log flight and start new sits in the
bottom bar, and "···" opens the export and import actions as a sheet.
-->
<script lang="ts">
  import type { Log, LoggedFlight } from "@involo/bindings";
  import {
    clock,
    dayLabel,
    duration,
    ends,
    flightDay,
    flightTime,
    LOG_LIMIT,
    planLabel,
    routeWords,
    score,
    stageTime,
    summary,
  } from "../lib/flight-log";
  import Icon from "../lib/Icon.svelte";
  import Toast from "../lib/Toast.svelte";
  import { trapFocus } from "../lib/trap";
  import { logHref } from "../route.svelte";
  import { tick } from "svelte";

  let {
    log,
    current,
    entry,
    name,
    canGo,
    backHref,
    blocked = null,
    problem = null,
    onLog,
    onDelete,
    onRestore,
    onImport,
    onSaveCopy,
    onCsv,
    onJson,
    onStep,
  }: {
    log: Log;
    /** This flight as it would be logged now, or null before anything is ticked. */
    current: LoggedFlight | null;
    /** The flight in the address: an earlier flight's id, "current" for This flight, or none. */
    entry: string | null;
    /** A step's name as the app shows it. */
    name: (text: string, step: string) => string;
    /** Whether a logged step is in this flight's pack, so its link can open it. */
    canGo: (step: string) => boolean;
    backHref: string;
    /** Why the saved log can't be changed (it is newer or unreadable, and kept as it is). */
    blocked?: string | null;
    /** Why the last change wasn't saved. */
    problem?: string | null;
    onLog: () => Promise<void>;
    /** Resolves true once the flight is deleted and the log saved. */
    onDelete: (id: string) => Promise<boolean>;
    onRestore: (flight: LoggedFlight) => Promise<void>;
    /** Merges a log file; resolves with what to tell the pilot. */
    onImport: (text: string) => Promise<string>;
    onSaveCopy: () => void;
    onCsv: () => void;
    onJson: () => void;
    onStep: (id: string) => void;
  } = $props();

  const wideQuery = "(min-width: 900px)";
  let wide = $state(typeof window !== "undefined" && (window.matchMedia?.(wideQuery).matches ?? true));
  $effect(() => {
    const mq = window.matchMedia?.(wideQuery);
    if (!mq) return;
    const read = () => (wide = mq.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  });

  let opened = $derived(entry && entry !== "current" ? (log.flights.find((f) => f.id === entry) ?? null) : null);
  /** This flight's every tick, or only its latest. */
  let allTicks = $state(false);
  /** An earlier flight's every tick. */
  let ticksOf = $state<string | null>(null);
  let sheet = $state(false);
  let notice = $state<string | null>(null);
  let undo = $state<{ text: string; flight: LoggedFlight } | null>(null);
  let file = $state<HTMLInputElement | null>(null);
  let busy = $state(false);
  let full = $derived(log.flights.length >= LOG_LIMIT || log.practice.length >= LOG_LIMIT);
  /** This flight's rows: the latest three ticks (or every tick), newest first, then its open steps. */
  let rows = $derived.by(() => {
    if (!current) return [];
    const ticks = [...current.ticks].reverse();
    return [
      ...(allTicks ? ticks : ticks.slice(0, 3)).map((t) => ({ key: t.step, time: clock(t.at), open: false, name: name(t.text, t.step), value: t.value })),
      ...current.skipped.map((s) => ({ key: s.step, time: "open", open: true, name: name(s.text, s.step), value: s.value })),
    ];
  });
  let currentLine = $derived(current ? `${current.done} of ${current.total} steps${current.offBlocks === null ? "" : ` · started ${clock(current.offBlocks)}`}` : "");

  async function logFlight(): Promise<void> {
    if (busy || !current) return;
    busy = true;
    try {
      await onLog();
      sheet = false;
    } finally {
      busy = false;
    }
  }
  async function remove(f: LoggedFlight): Promise<void> {
    if (!(await onDelete(f.id))) return;
    undo = { text: "Flight deleted.", flight: f };
    if (!wide) location.hash = logHref();
  }
  async function load(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    notice = await onImport(await chosen.text());
    sheet = false;
  }
  function print(): void {
    sheet = false;
    void tick().then(() => window.print());
  }
  const route = (f: Pick<LoggedFlight, "origin" | "destination">) => ends(f).join(" → ");
  let sheetBox = $state<HTMLElement | null>(null);
  let sheetOpener = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (sheet) sheetBox?.querySelector<HTMLElement>("button")?.focus();
  });
  function closeSheet(): void {
    sheet = false;
    sheetOpener?.focus();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (sheet && e.key === "Escape") closeSheet();
  }}
/>

{#snippet thisFlight()}
  {#if current}
    <div class="ticks" role="list" aria-label="Ticks">
      {#each rows as r, i (i)}
        <div class="tick" role="listitem"><span class="t mono" class:open={r.open}>{r.time}</span><span>{r.name}</span><span class="mono v">{r.value}</span></div>
      {/each}
    </div>
    {#if current.ticks.length > 3 || allTicks}
      <button class="more" type="button" aria-expanded={allTicks} onclick={() => (allTicks = !allTicks)}
        >{allTicks ? "Show the latest ticks ⌃" : "Show every tick ⌄"}</button
      >
    {/if}
  {:else}
    <p class="empty">Nothing ticked yet. Ticks show here with their times as you go.</p>
  {/if}
{/snippet}

{#snippet stepLink(id: string, text: string, where: string)}
  {#if canGo(id)}
    <a
      class="skip"
      href={logHref()}
      onclick={(e) => {
        e.preventDefault();
        onStep(id);
      }}><span class="sn">{text}</span><span class="sw">{where}</span></a
    >
  {:else}
    <div class="skip"><span class="sn">{text}</span><span class="sw">{where}</span></div>
  {/if}
{/snippet}

{#snippet details(f: LoggedFlight)}
  {@const t = flightTime(f)}
  <div class="detail">
    <div class="dh">
      <h3 class="mono" aria-label={routeWords(f)}>{route(f)}</h3>
      <span>{[dayLabel(flightDay(f)), f.aircraft, t === null ? null : duration(t)].filter(Boolean).join(" · ")}</span>
    </div>
    <dl class="facts">
      <div><dt>Off blocks</dt><dd class="mono">{f.offBlocks === null ? "—" : clock(f.offBlocks)}</dd></div>
      <div><dt>On blocks</dt><dd class="mono">{f.onBlocks === null ? "—" : clock(f.onBlocks)}</dd></div>
      <div><dt>Flight plan</dt><dd class="mono">{planLabel(f)}</dd></div>
      <div><dt>Steps</dt><dd class="mono">{f.done} of {f.total}</dd></div>
    </dl>
    {#if f.stages.length}
      <div class="stages">
        <span class="lbl" id="stages-{f.id}">Time in each stage</span>
        <div class="bars" role="list" aria-labelledby="stages-{f.id}">
          {#each f.stages as s, i (i)}
            <div class="stage" role="listitem" style:flex={Math.max(s.ms, 1)}>
              <div class="bar" style:opacity={0.55 + 0.09 * i}></div>
              <span class="sname">{s.title}</span>
              <span class="mono stime">{stageTime(s.ms)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if f.skipped.length}
      <div class="skips">
        <span class="lbl">Skipped · {f.skipped.length}</span>
        {#each f.skipped as s, i (i)}
          {@render stepLink(s.step, name(s.text, s.step), `${s.stage} › ${s.phaseTitle}`)}
        {/each}
      </div>
    {/if}
    {#if ticksOf === f.id}
      <div class="ticks every" role="list" aria-label="Every tick">
        {#each f.ticks as k, i (i)}
          <div class="tick" role="listitem"><span class="t mono">{clock(k.at)}</span><span>{name(k.text, k.step)}</span><span class="mono v">{k.value}</span></div>
        {/each}
      </div>
    {/if}
    <div class="btns">
      {#if f.ticks.length}
        <button class="bt" type="button" aria-expanded={ticksOf === f.id} onclick={() => (ticksOf = ticksOf === f.id ? null : f.id)}
          >{ticksOf === f.id ? "Hide every tick" : "Show every tick"}</button
        >
      {/if}
      {#if !blocked}<button class="bt danger" type="button" onclick={() => void remove(f)}>Delete this flight</button>{/if}
    </div>
  </div>
{/snippet}

{#snippet status(f: LoggedFlight)}
  <span class="st" class:fin={f.finished}>{f.finished ? "Finished" : "Not finished"}</span>
{/snippet}

{#snippet practice(pad: boolean)}
  <section class="box practice" class:pad aria-labelledby="log-practice">
    <div class="sh">
      <h2 id="log-practice">Practice results</h2>
      <a class="link" href="#/practice">Practice ›</a>
    </div>
    <div>
        {#each log.practice as r, i (i)}
          <div class="result">
            {#if wide}<span class="rd">{dayLabel(r.at)}</span><span class="rt">{r.title}</span>
            {:else}<span class="rt">{r.title}<span class="rd">{dayLabel(r.at)}</span></span>{/if}
            <span class="mono rs">{score(r)}</span>
          </div>
        {/each}
    </div>
  </section>
{/snippet}

{#snippet actions()}
  <!-- A saved log this version can't use: only Export JSON, which saves it as it is. -->
  {#if !blocked}<button class="bt act" type="button" onclick={onSaveCopy}>Save copy (HTML file)</button>
    <button class="bt act" type="button" onclick={onCsv}>Export CSV</button>{/if}
  <button class="bt act" type="button" onclick={onJson}>Export JSON</button>
  {#if !blocked}<button class="bt act" type="button" onclick={() => file?.click()}>Load log file</button>
    <button class="bt act" type="button" onclick={print}>Print or save as PDF</button>{/if}
  <span class="note">Logs stay on this device unless you export them. Clearing your browser’s site data removes them, so export now and then to keep a copy.</span>
{/snippet}

{#snippet notices()}
  {#if blocked}<p class="notice" role="status">{blocked}</p>{/if}
  {#if full}<p class="notice">The log keeps the newest {LOG_LIMIT} flights and {LOG_LIMIT} practice results. Logging more drops the oldest; export to keep them.</p>{/if}
  {#if problem}<p class="notice" role="alert">{problem}</p>{/if}
  {#if notice && notice !== problem}<p class="notice" role="status">{notice}</p>{/if}
{/snippet}

<input class="file" type="file" accept=".json,application/json" bind:this={file} onchange={(e) => void load(e)} tabindex="-1" aria-hidden="true" />

<div class="log" class:wide data-app-ready="">
  {#if wide}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
      <div class="ttl"><h1>Flight log</h1><span>This flight, earlier flights and practice results, saved on this device</span></div>
    </header>
    <div class="body">
      <main class="main">
        {@render notices()}
        <section class="box this" aria-labelledby="log-this">
          <div class="sh">
            <h2 id="log-this">This flight{#if current}{" · "}<span aria-label={routeWords(current)}>{route(current)}</span>{/if}</h2>
            {#if current}<span class="meta">{currentLine}</span>{/if}
          </div>
          {@render thisFlight()}
        </section>
        <section class="box earlier" aria-labelledby="log-earlier">
          <div class="sh">
            <h2 id="log-earlier">Earlier flights{#if log.flights.length}{` · ${log.flights.length}`}{/if}</h2>
            {#if log.flights.length}<span class="meta small">Newest first</span>{/if}
          </div>
          {#if log.flights.length}
            <div class="rows">
              {#each log.flights as f (f.id)}
                <a class="row" href={opened?.id === f.id ? logHref() : logHref(f.id)} aria-current={opened?.id === f.id ? "true" : undefined} aria-expanded={opened?.id === f.id}
                  ><span class="date">{dayLabel(flightDay(f))}</span><span class="mono rte" aria-label={routeWords(f)}>{route(f)}</span><span class="sum">{summary(f)}</span>{@render status(f)}<Icon
                    name="chevron-right"
                  /></a
                >
              {/each}
            </div>
            {#if opened}{@render details(opened)}{/if}
          {:else}
            <p class="none">Flights you log appear here, newest first.</p>
          {/if}
        </section>
        {#if log.practice.length}{@render practice(false)}{/if}
      </main>
      <aside class="acts" aria-label="Log actions">
        <button class="primary" type="button" disabled={!current || busy || !!blocked} onclick={() => void logFlight()}>Log flight and start new</button>
        {@render actions()}
      </aside>
    </div>
  {:else if entry === "current"}
    <header class="top">
      <a class="icon" href={logHref()} aria-label="Back to all flights"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>Flight log</h1><span>This flight</span></div>
    </header>
    <main class="page">
      <div class="dh">
        <h3 class="mono">{current ? route(current) : "This flight"}</h3>
        {#if current}<span>{currentLine}</span>{/if}
      </div>
      {@render thisFlight()}
    </main>
  {:else if opened}
    <header class="top">
      <a class="icon" href={logHref()} aria-label="Back to all flights"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>Flight log</h1><span>{dayLabel(flightDay(opened))}</span></div>
    </header>
    <main class="page">{@render details(opened)}</main>
  {:else}
    <header class="top">
      <a class="icon" href={backHref} aria-label="Back to checklist"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>Flight log</h1><span>Saved on this device</span></div>
    </header>
    <main class="list">
      {#if blocked || full || notice || problem}<div class="pnotes">{@render notices()}</div>{/if}
      <a class="prow this" href={logHref("current")}
        ><span class="pt"><span class="pl">This flight</span>{#if current}<span class="mono pr" aria-label={routeWords(current)}>{route(current)}</span><span class="ps">{currentLine}</span>{:else}<span class="ps">Nothing ticked yet</span>{/if}</span><Icon
          name="chevron-right"
        /></a
      >
      <div class="plabel">Earlier flights{#if log.flights.length}{` · ${log.flights.length}`}{/if}</div>
      {#each log.flights as f (f.id)}
        <a class="prow" href={logHref(f.id)}
          ><span class="pt"><span class="pline"><span class="mono pr" aria-label={routeWords(f)}>{route(f)}</span>{@render status(f)}</span><span class="ps"
                >{[dayLabel(flightDay(f)), summary(f)].join(" · ")}</span
              ></span
            ><Icon name="chevron-right" /></a
        >
      {:else}
        <p class="none pnone">Flights you log appear here, newest first.</p>
      {/each}
      {#if log.practice.length}<div class="pwrap">{@render practice(true)}</div>{/if}
    </main>
    <div class="bar-foot">
      <button class="primary" type="button" disabled={!current || busy || !!blocked} onclick={() => void logFlight()}>Log flight and start new</button>
      <button class="dots" type="button" aria-label="Export and import" aria-haspopup="dialog" aria-expanded={sheet} bind:this={sheetOpener} onclick={() => (sheet = true)}>···</button>
    </div>
    {#if sheet}
      <button class="scrim" type="button" aria-label="Close" tabindex="-1" onclick={closeSheet}></button>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="log-sheet" bind:this={sheetBox} use:trapFocus={true}>
        <div class="shead">
          <h2 id="log-sheet">Export and import</h2>
          <button class="x" type="button" aria-label="Close" onclick={closeSheet}><Icon name="x" /></button>
        </div>
        {@render actions()}
      </div>
    {/if}
  {/if}
  {#if undo}
    {#key undo}
      <Toast
        text={undo.text}
        onUndo={() => {
          const f = undo?.flight;
          undo = null;
          if (f) void onRestore(f);
        }}
        onExpire={() => (undo = null)}
      />
    {/key}
  {/if}
</div>

<style>
  .log {
    /* The list's columns (LogDesk): date 110, route 150, status 110. */
    --log-date: calc(var(--space-10) * 2 + var(--space-6) + var(--space-1) + var(--border-thick));
    --log-route: calc(var(--log-date) + var(--space-10));
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: normal;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .file {
    display: none;
  }
  /* Phone header (LogPhone): 56 px and its rule, the back icon, "Flight log" and its sub-line. */
  .top {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3) + var(--border-thin));
    padding: 0 var(--space-3) 0 var(--space-1);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .ttl {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: var(--leading-tight);
  }
  .ttl h1 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .ttl span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .icon {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  /* Desktop header (LogDesk): 60 px, the Checklist button, the 20 px title. */
  .wide .top {
    gap: var(--space-4);
    height: calc(var(--size-header) + var(--border-thin));
    padding: 0 var(--space-4);
  }
  .wide .ttl h1 {
    font-size: var(--font-size-panel-title);
  }
  .back {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  /* The board's 18 px chevron. */
  .back :global(.icon),
  .back :global(svg),
  .icon :global(.icon),
  .icon :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  /* Desktop: the log on the left, the 360 px actions column on the right. */
  .body {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-6);
    min-height: 0;
    padding: var(--space-6) var(--space-8);
    overflow-y: auto;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .this {
    gap: var(--space-3);
  }
  .sh {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .this .sh {
    align-items: center;
  }
  .sh h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .this .sh h2 {
    font-size: var(--font-size-panel-title);
  }
  .meta {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .meta.small {
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .link {
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  /* This flight's rows: the time (or "open" in amber), the step, its value. */
  .ticks {
    display: grid;
    grid-template-columns: calc(var(--space-10) * 2) minmax(0, 1fr) calc(var(--space-10) * 4);
    gap: var(--space-2) var(--space-4);
    font-size: var(--font-size-secondary);
  }
  .tick {
    display: contents;
  }
  .t {
    color: var(--color-text-muted);
  }
  .t.open {
    color: var(--color-open-text);
  }
  .more {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .empty,
  .none {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  /* Earlier flights: 56 px rows, the opened one marked with the accent ring. */
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    margin: 0 calc(-1 * var(--space-2));
  }
  .row {
    display: grid;
    grid-template-columns: var(--log-date) var(--log-route) minmax(0, 1fr) var(--log-date) var(--size-icon-small);
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    min-height: calc(var(--size-touch-min) + var(--space-3));
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    color: var(--color-text);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .row[aria-current="true"] {
    background: var(--color-current-row);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
  }
  .row :global(.icon),
  .row :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
    color: var(--color-text-muted);
  }
  .date {
    color: var(--color-text-secondary);
  }
  .rte {
    color: var(--color-text-strong);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .sum {
    overflow: hidden;
    color: var(--color-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st {
    color: var(--color-open-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .st.fin {
    color: var(--color-done);
  }
  /* The opened flight, below the list. */
  .detail {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding-top: var(--space-4);
    border-top: var(--border-thin) solid var(--color-line);
  }
  .dh {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
  }
  .dh h3 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-semibold);
  }
  .dh span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
  }
  .facts div {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .facts dt {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .facts dd {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-secondary);
  }
  .lbl {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .stages {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .bars {
    display: flex;
    gap: var(--space-1);
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .bar {
    height: var(--space-2);
    border-radius: var(--space-1);
    background: var(--color-accent);
  }
  .sname {
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stime {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .skips {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .skip {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: calc(var(--size-touch-min) + var(--border-thin));
    padding: 0 var(--border-thick);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .sn {
    flex: 1;
  }
  .sw {
    color: var(--color-text-muted);
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .bt {
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .bt.danger {
    color: var(--color-danger-text);
  }
  /* Practice results: date, test, score. */
  .result {
    display: grid;
    grid-template-columns: var(--log-date) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: calc(var(--size-touch-min) + var(--border-thin));
    border-bottom: var(--border-thin) solid var(--color-line);
    font-size: var(--font-size-secondary);
  }
  .rd {
    color: var(--color-text-secondary);
  }
  .rt {
    color: var(--color-text);
  }
  .rs {
    color: var(--color-text-strong);
  }
  .notice {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-panel);
    background: var(--color-open-bg);
    color: var(--color-text);
    font-size: var(--font-size-secondary);
  }
  /* The actions column (LogDesk): Log flight and start new, then the export and import buttons. */
  .acts {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    width: var(--size-drawer);
  }
  .primary {
    height: calc(var(--size-touch-min) + var(--space-1));
    border: 0;
    border-radius: var(--radius-control);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font: inherit;
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .act {
    padding: 0 calc(var(--space-3) + var(--border-thick));
    text-align: left;
  }
  .note {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    line-height: var(--leading-normal);
  }
  /* Phone: the list (LogPhone). */
  .list {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
  .pnotes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) 0;
  }
  .prow {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    min-height: calc(var(--size-touch-min) + var(--space-4) + var(--space-1));
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text);
    text-decoration: none;
  }
  .prow.this {
    background: var(--color-surface);
  }
  .prow :global(.icon),
  .prow :global(svg) {
    flex: none;
    width: var(--size-icon-small);
    height: var(--size-icon-small);
    color: var(--color-text-muted);
  }
  .pt {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--border-thin) + var(--border-thick));
    min-width: 0;
  }
  .pl {
    color: var(--color-accent-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .pr {
    color: var(--color-text-strong);
    font-size: var(--font-size-value-mono);
    font-weight: var(--weight-semibold);
  }
  .pline {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .ps {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .plabel {
    padding: var(--space-4) var(--space-4) calc(var(--space-1) + var(--border-thick));
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .pnone {
    padding: 0 var(--space-4) var(--space-3);
  }
  .pwrap {
    padding: var(--space-4);
  }
  .practice.pad {
    padding: var(--space-4);
  }
  .pad .result {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .pad .rd {
    display: block;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* The bottom bar: Log flight and start new, and "···" for the export and import actions. */
  .bar-foot {
    display: flex;
    flex: none;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + var(--space-1));
    border-top: var(--border-thin) solid var(--color-line);
    background: var(--color-surface-2);
  }
  .bar-foot .primary {
    flex: 1;
    height: calc(var(--size-touch-min) + var(--space-2));
    border-radius: var(--radius-panel);
  }
  .dots {
    width: calc(var(--size-touch-min) + var(--space-2));
    height: calc(var(--size-touch-min) + var(--space-2));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-button-bg);
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-body) + var(--border-thick));
    cursor: pointer;
  }
  /* Phone: one flight on its own page (LogPhoneFlight), and This flight. */
  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-4) + var(--border-thick));
    min-height: 0;
    padding: calc(var(--space-4) + var(--space-1)) var(--space-4);
    overflow-y: auto;
  }
  .page .detail {
    gap: calc(var(--space-4) + var(--border-thick));
    padding-top: 0;
    border-top: 0;
  }
  .page .facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .page .ticks {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  /* The export and import sheet. */
  .scrim {
    position: fixed;
    inset: 0;
    border: 0;
    background: var(--color-scrim);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    padding: var(--space-2) var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    background: var(--color-sheet);
    box-shadow: var(--color-overlay-shadow);
  }
  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .shead h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .x {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    margin-right: calc(-1 * var(--space-3));
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  @media print {
    .acts,
    .bar-foot,
    .back,
    .btns,
    .more {
      display: none;
    }
    .log {
      height: auto;
    }
    .body,
    .list,
    .page {
      overflow: visible;
    }
  }
</style>
