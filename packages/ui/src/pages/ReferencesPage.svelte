<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

References (References boards: RefsDesk from 900 px, RefsPhone below; decision 0007):
the simulation notice, what each list is based on (the kinds of source, never a citation, title,
page or link), the lists with their "Based on" tag, the simulator model notes and about this pack
and app. Everything is counted from the pack. Lists still marked "Source being confirmed" show a
status, not a source; once a list is re-tagged with its basis, the status goes away on its own.
-->
<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { phaseHref } from "../route.svelte";
  import type { Basis, References } from "../lib/references";

  let {
    refs,
    pack,
    version,
    backHref,
    licensesHref,
    onList,
    onSimulatorModel,
  }: {
    refs: References;
    /** The pack's name, version, license and attribution, as the pack states them. */
    pack: { name: string; version: string; license: string; attribution: string[] };
    /** The app's version (null until it is known). */
    version: string | null;
    backHref: string;
    /** The third-party licenses file, made from the dependencies at build time. */
    licensesHref: string;
    /** Opens a list, at its first step. */
    onList: (step: string) => void;
    /** Opens Find, showing only the steps that follow the simulator's model. */
    onSimulatorModel: () => void;
  } = $props();

  /** The first rows shown before "Show all" (RefsDesk: six). */
  const FIRST = 6;
  const wideQuery = "(min-width: 900px)";
  let wide = $state(typeof window !== "undefined" && (window.matchMedia?.(wideQuery).matches ?? true));
  $effect(() => {
    const mq = window.matchMedia?.(wideQuery);
    if (!mq) return;
    const read = () => (wide = mq.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  });

  /** The chips: All, each source, then each pending tag while any list shows it. */
  let chips = $derived<{ id: "all" | Basis; name: string }[]>([
    { id: "all", name: "All" },
    ...refs.sources.map((s) => ({ id: s.tag, name: s.name })),
    ...refs.pending.map((p) => ({ id: p.tag, name: p.name })),
  ]);
  const isPending = (tag: Basis) => refs.pending.some((p) => p.tag === tag);
  const basisName = (tag: Basis) => refs.names[tag] ?? tag;
  let filter = $state<"all" | Basis>("all");
  let all = $state(false);
  let matching = $derived.by(() => {
    const f = filter;
    if (f === "all") return refs.rows;
    return refs.rows.filter((r) => (isPending(f) ? r.basis === f : r.sources.includes(f)));
  });
  let shown = $derived(all ? matching : matching.slice(0, FIRST));
  const lists = (n: number) => `${n} ${n === 1 ? "list" : "lists"}`;
  const steps = (n: number) => `${n} ${n === 1 ? "step" : "steps"}`;
  function pick(id: "all" | Basis): void {
    filter = id;
    all = false;
  }
</script>

{#snippet tag(basis: Basis)}
  <span class="tag" class:confirming={isPending(basis)}>{basisName(basis)}</span>
{/snippet}

{#snippet sources()}
  <div class="note" role="note">
    <span><b>For flight simulation only.</b> Involo follows the simulator’s model of the aircraft. It isn’t approved for, and must never be used in, a real aircraft.</span>
  </div>
  <div class="hd">
    <h2>What each list is based on</h2>
    <span
      >{wide ? "Every list is written fresh for Involo. Each one names the kind of source it’s based on; no manuals are copied or linked." : "Each list names the kind of source it’s based on; no manuals are copied or linked."}</span
    >
  </div>
  <div class="kinds">
    {#each refs.sources as s (s.tag)}
      <div class="kind">
        <span class="kt"><span class="kn">{s.name}</span><span class="kc">{lists(s.count)}</span></span>
        <span class="ka">{s.about}</span>
      </div>
    {/each}
  </div>
  {#each refs.pending as p (p.tag)}
    <span class="line"
      >{lists(p.count)}
      {p.count === 1 ? "is" : "are"} marked <b>{p.name}</b>: {p.count === 1 ? "it came" : "they came"} from an earlier release and {p.count ===
      1
        ? "is"
        : "are"} being checked against the sources above.</span
    >
  {/each}
  <div class="chips" role="group" aria-label="Show lists based on">
    {#each chips as c (c.id)}
      <button type="button" aria-pressed={filter === c.id} onclick={() => pick(c.id)}>{c.name}</button>
    {/each}
  </div>
{/snippet}

{#snippet more()}
  {#if matching.length > FIRST && !all}
    <button class="all" type="button" onclick={() => (all = true)}>Show all {lists(matching.length)}</button>
  {/if}
{/snippet}

{#snippet notes()}
  {#if refs.simulatorModel.length}
    <section class="sim" aria-labelledby="refs-sim">
      <div class="hd">
        <h2 id="refs-sim">Simulator model notes</h2>
        <span>{steps(refs.simulatorModel.length)} follow the simulator’s model where it differs from the real aircraft. Each is marked in its step with a note.</span>
      </div>
      <button class="more" type="button" onclick={onSimulatorModel}>See the {steps(refs.simulatorModel.length)} ›</button>
    </section>
  {/if}
  <section class="about" aria-labelledby="refs-about">
    <div class="hd"><h2 id="refs-about">About this pack and app</h2></div>
    <dl>
      <div><dt>Procedures pack</dt><dd>{pack.name} · pack {pack.version}</dd></div>
      <div><dt>Pack license</dt><dd>{[pack.license, ...pack.attribution].join(" · ")}</dd></div>
      <div><dt>App</dt><dd>Involo{version ? ` ${version}` : ""} · open source</dd></div>
      <div>
        <dt>Open-source software</dt>
        <dd><a href={licensesHref} target="_blank" rel="noopener">Licenses of the libraries Involo uses</a></dd>
      </div>
    </dl>
  </section>
{/snippet}

<div class="refs" class:wide data-app-ready="">
  {#if wide}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
      <div class="ttl"><h1>References</h1><span>What the procedures are based on</span></div>
    </header>
    <div class="body">
      <main class="main">
        {@render sources()}
        <div class="table">
          <!-- The column heads, for sight; each row's link names its list, stage, kind and source. -->
          <div class="row th" aria-hidden="true"><span>List</span><span>Stage</span><span>Kind</span><span>Based on</span></div>
          <ul class="rows" aria-label="Lists">
            {#each shown as r (r.id)}
              <li>
                <a
                  class="row"
                  href={phaseHref(r.phase)}
                  aria-label="{r.title}, {r.stage}, {r.kind}, based on: {basisName(r.basis)}"
                  onclick={(e) => {
                    if (!r.first) return;
                    e.preventDefault();
                    onList(r.first);
                  }}><span class="name">{r.title}</span><span>{r.stage}</span><span>{r.kind}</span><span>{@render tag(r.basis)}</span></a
                >
              </li>
            {/each}
          </ul>
          {@render more()}
        </div>
        <div class="foot">{@render notes()}</div>
      </main>
    </div>
  {:else}
    <header class="top">
      <a class="icon" href={backHref} aria-label="Back to checklist"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>References</h1><span>What the procedures are based on</span></div>
    </header>
    <main class="page">
      {@render sources()}
      <ul class="prows" aria-label="Lists">
        {#each shown as r (r.id)}
          <li><a
            class="prow"
            href={phaseHref(r.phase)}
            onclick={(e) => {
              if (!r.first) return;
              e.preventDefault();
              onList(r.first);
            }}
            ><span class="name">{r.title}</span><span class="psub">{r.stage} · {r.kind} {@render tag(r.basis)}</span></a
          ></li>
        {/each}
      </ul>
      {@render more()}
      {@render notes()}
    </main>
  {/if}
</div>

<style>
  .refs {
    /* The table's columns (RefsDesk): stage and kind 140, based on 220; the About labels 180. */
    --refs-col: calc(3 * var(--space-10) + var(--space-4) + var(--space-1));
    --refs-basis: calc(5 * var(--space-10) + var(--space-4) + var(--space-1));
    --refs-label: calc(4 * var(--space-10) + var(--space-4) + var(--space-1));
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: normal;
  }
  .refs.wide {
    height: 100dvh;
  }
  /* Phone header (RefsPhone): 56 px and its rule, the back icon, "References" and its sub-line. */
  .top {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3) + var(--border-thin));
    padding: 0 var(--space-3) 0 var(--space-1);
    border-bottom: var(--border-thin) solid var(--color-line);
    box-sizing: border-box;
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
  /* Desktop header (RefsDesk): 60 px, the Checklist button, the 20 px title. */
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
  /* The boards' 18 px chevron. */
  .back :global(.icon),
  .back :global(svg),
  .icon :global(.icon),
  .icon :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  /* Desktop: the page scrolls under the header, with the browser's scrollbar. */
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-4) + var(--space-1));
    /* 1100 px of content (RefsDesk), its padding outside it. */
    box-sizing: content-box;
    max-width: calc(var(--size-content-max) + var(--size-header));
    padding: calc(var(--space-6) + var(--space-1)) calc(var(--space-10) + var(--space-2));
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: var(--space-4);
  }
  /* The simulation notice: the If-not box's amber. */
  .note {
    display: flex;
    gap: var(--space-3);
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-panel);
    background: var(--color-open-bg);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .note b {
    color: var(--color-text-strong);
  }
  .hd {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .hd h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .hd span,
  .line {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .line b {
    color: var(--color-text);
  }
  .kinds {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .wide .kinds {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kind {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .kt {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .kn {
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .kc {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .ka {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-snug);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chips button {
    min-height: calc(var(--size-touch-min) - var(--space-2));
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .chips button[aria-pressed="true"] {
    border: var(--size-focus-ring) solid var(--color-accent);
    background: var(--color-accent-soft);
    box-shadow: none;
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  /* The list table (RefsDesk). */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--refs-col) var(--refs-col) var(--refs-basis);
    gap: var(--space-4);
    align-items: center;
    box-sizing: border-box;
    min-height: calc(var(--space-10) + var(--space-2));
    padding: 0 var(--space-3);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-decoration: none;
  }
  .row .name {
    color: var(--color-text);
  }
  .row.th {
    min-height: 0;
    padding: 0 var(--space-3) var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    min-height: var(--space-6);
    padding: 0 var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    white-space: nowrap;
  }
  /* A status, not a source: dashed and muted. */
  .tag.confirming {
    border-style: dashed;
    color: var(--color-text-muted);
  }
  .all,
  .more {
    display: flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
    cursor: pointer;
  }
  .more {
    padding: 0;
  }
  /* Phone rows (RefsPhone): stacked, edge to edge. */
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .prows {
    margin: 0 calc(-1 * var(--space-4));
    padding: 0;
    list-style: none;
    border-top: var(--border-thin) solid var(--color-line);
  }
  .prow {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-1);
    box-sizing: border-box;
    min-height: var(--size-phase-row);
    padding: var(--space-2) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
    text-decoration: none;
  }
  .prow .name {
    color: var(--color-text);
    line-height: var(--leading-normal);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .psub {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .page .all {
    padding: 0;
  }
  /* Simulator model notes and About, side by side on desktop. */
  .foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-8);
    padding-top: var(--space-2);
  }
  .sim,
  .about {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  dl {
    margin: 0;
  }
  dl div {
    display: grid;
    grid-template-columns: var(--refs-label) minmax(0, 1fr);
    gap: var(--space-3);
    align-items: center;
    min-height: var(--size-touch-min);
    border-bottom: var(--border-thin) solid var(--color-line);
    font-size: var(--font-size-secondary);
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    color: var(--color-text);
  }
  dd a {
    color: var(--color-link);
    text-decoration: none;
  }
  /* The phone's About labels take less room. */
  .page dl div {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  }
</style>
