<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The Glossary (GlossaryDesk, GlossaryPhone and GlossaryPhoneTerm boards). Its own header: the
Checklist back button, "Glossary" and "Every term in the steps, A to Z". From 900 px (desktop and
tablet landscape) a 360 px term list on the left, the filter field with the count, A to Z headings
and 44 px rows, the chosen term open on the right. Below 900 px (phone, tablet portrait) the list is
a page of its own and a term opens on its own page; back returns to the list where it was.
A term's page: the name and its expansion, the definition, and "In the steps" with every step that
uses it, each going to that step. Where is this? and Related stay out: the pack has no data for
them.
-->
<script module lang="ts">
  /** Where the phone's list was scrolled, and the term opened from it, for the way back (cleared
   * when the Glossary is left). */
  let listScroll = 0;
  let lastTerm: string | null = null;
</script>

<script lang="ts">
  import { safely } from "../lib/safely";
  import type { Rail } from "@involo/bindings";
  import { type GlossaryTerm, filterTerms, glossaryHref, letterOf } from "../lib/glossary";
  import Icon from "../lib/Icon.svelte";
  import { phaseHref } from "../route.svelte";
  import { onDestroy, tick } from "svelte";

  let {
    terms,
    term,
    rail,
    referenceTitle = "",
    backHref,
    onStep,
  }: {
    terms: GlossaryTerm[];
    /** The term in the address, if any. */
    term: string | null;
    rail: Rail | null;
    /** The reference area's title, from the pack's labels. */
    referenceTitle?: string;
    backHref: string;
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

  let query = $state("");
  let shown = $derived(filterTerms(terms, query));
  let groups = $derived.by(() => {
    const out: { letter: string; terms: GlossaryTerm[] }[] = [];
    for (const t of shown) {
      const letter = letterOf(t.term);
      const last = out.at(-1);
      if (last?.letter === letter) last.terms.push(t);
      else out.push({ letter, terms: [t] });
    }
    return out;
  });
  let named = $derived(term ? (terms.find((t) => t.term.toLowerCase() === term.toLowerCase()) ?? null) : null);
  /** The term open: the one in the address; on a wide screen with none, the first. A name the
   * Glossary does not hold opens nothing. */
  let open = $derived(named ?? (wide && !term ? (shown[0] ?? terms[0] ?? null) : null));

  /** Each phase's stage and title, for a step's "Stage › Phase". */
  let phases = $derived.by(() => {
    const m = new Map<string, string>();
    for (const s of rail?.stages ?? []) for (const p of s.phases) m.set(p.id, `${s.title} › ${p.title}`);
    for (const p of rail?.reference ?? []) m.set(p.id, `${referenceTitle} › ${p.title}`);
    return m;
  });

  let list = $state<HTMLElement | null>(null);
  let pane = $state<HTMLElement | null>(null);
  let phoneScroll = $state<HTMLElement | null>(null);
  // The phone's list comes back where it was, focus on the term it opened; a wide list keeps the
  // open term in view, its page from the top.
  $effect(() => {
    void open?.term;
    if (!list) return;
    if (!wide) {
      list.scrollTop = listScroll;
      if (lastTerm) list.querySelector<HTMLElement>(`a[href="${glossaryHref(lastTerm)}"]`)?.focus({ preventScroll: true });
    } else list.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  });
  // A term opened by its address (a row, Find, a step's Terms): its page from the top, its name focused.
  $effect(() => {
    const t = term;
    if (!t) return;
    safely(tick(), () => {
      if (pane) pane.scrollTop = 0;
      if (phoneScroll) phoneScroll.scrollTop = 0;
      document.getElementById("g-term")?.focus({ preventScroll: true });
    });
  });
  onDestroy(() => {
    listScroll = 0;
    lastTerm = null;
  });
  const keep = (opened?: string) => {
    if (list && !wide) {
      listScroll = list.scrollTop;
      if (opened) lastTerm = opened;
    }
  };
</script>

{#snippet field()}
  <div class="field" role="search">
    <Icon name="find" />
    <input type="search" bind:value={query} placeholder="Filter terms" aria-label="Filter terms" autocomplete="off" spellcheck="false" />
    <span class="count">{shown.length} {shown.length === 1 ? "term" : "terms"}</span>
  </div>
{/snippet}

{#snippet termList()}
  <nav aria-label="Terms" class="list" bind:this={list} onscroll={() => keep()}>
    {#if wide}{@render field()}{/if}
    {#each groups as g (g.letter)}
      <div class="letter" role="presentation">{g.letter}</div>
      {#each g.terms as t (t.term)}
        <a class="row" href={glossaryHref(t.term)} aria-current={wide && open?.term === t.term ? "true" : undefined} onclick={() => keep(t.term)}
          ><span class="names"><span class="nm">{t.term}</span>{#if t.expansion}<span class="ex">{t.expansion}</span>{/if}</span>{#if !wide}<Icon
              name="chevron-right"
            />{/if}</a
        >
      {/each}
    {/each}
  </nav>
{/snippet}

{#snippet termPage(t: GlossaryTerm)}
  <main class="term" aria-labelledby="g-term" bind:this={pane}>
    <div class="head">
      <h2 id="g-term" tabindex="-1">{t.term}</h2>
      {#if t.expansion}<span class="expansion">{t.expansion}</span>{/if}
    </div>
    {#if t.definition}<p class="definition">{t.definition}</p>{/if}
    {#if t.steps.length}
      <section class="steps" aria-labelledby="g-steps">
        <span class="label" id="g-steps">In the steps · {t.steps.length}</span>
        <div class="card">
          {#each t.steps as s (s.id)}
            <a
              class="step"
              href={phaseHref(s.phase)}
              onclick={(e) => {
                e.preventDefault();
                onStep(s.id);
              }}
              ><span class="txt"
                ><span class="st">{s.title}</span><span class="sub"
                  ><span>{phases.get(s.phase) ?? ""}{#if t.tags[s.id]}{" "}· {t.tags[s.id]}{/if}</span><span class="val">{s.value}</span></span
                ></span
              ><Icon name="chevron-right" /></a
            >
          {/each}
        </div>
      </section>
    {/if}
  </main>
{/snippet}

<div class="glossary" class:wide data-app-ready="">
  {#if wide}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
      <div class="ttl"><h1>Glossary</h1><span>Every term in the steps, A to Z</span></div>
    </header>
    <div class="cols">
      {@render termList()}
      {#if open}{@render termPage(open)}{/if}
    </div>
  {:else if open}
    <header class="top">
      <a class="icon" href={glossaryHref()} aria-label="Back to all terms"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>Glossary</h1><span>{open.term}</span></div>
    </header>
    <div class="scroll" bind:this={phoneScroll}>{@render termPage(open)}</div>
  {:else}
    <header class="top">
      <a class="icon" href={backHref} aria-label="Back to checklist"><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>Glossary</h1><span>Every term in the steps, A to Z</span></div>
    </header>
    <div class="filter">{@render field()}</div>
    {@render termList()}
  {/if}
</div>

<style>
  .glossary {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
  }
  /* Phone header (GlossaryPhone): 56 px, the back icon, "Glossary" and its sub-line. */
  .top {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3));
    padding: 0 var(--space-2) 0 var(--space-1);
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
    color: var(--color-text);
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
  /* Desktop header (GlossaryDesk): 60 px, the Checklist button, the 20 px title. */
  .wide .top {
    gap: var(--space-4);
    height: var(--size-header);
    padding: 0 var(--space-4);
  }
  .wide .ttl h1 {
    color: var(--color-text-strong);
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
  .cols {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  /* The filter field: 44 px, the search icon, "Filter terms" and the count. */
  .filter {
    flex: none;
    padding: var(--space-3) var(--space-4) var(--space-1);
  }
  .field {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-field-border);
    border-radius: var(--radius-control);
    background: var(--color-field);
    color: var(--color-text-muted);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .field input::placeholder {
    color: var(--color-text-muted);
  }
  .field input::-webkit-search-cancel-button {
    appearance: none;
  }
  .field:focus-within {
    outline: var(--border-thick) solid var(--color-accent);
    outline-offset: var(--border-thin);
  }
  .count {
    flex: none;
    font-size: var(--font-size-caption);
  }
  /* The list (phone): A to Z headings, 52 px rows with a rule under each and a chevron. */
  .list {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
  .letter {
    padding: var(--space-3) var(--space-4) var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .row {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    box-sizing: border-box;
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text);
    text-decoration: none;
  }
  .row :global(.icon) {
    flex: none;
    color: var(--color-text-muted);
  }
  .names {
    line-height: normal;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thin);
    min-width: 0;
  }
  .nm {
    font-size: var(--font-size-body);
  }
  .ex {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  /* Desktop list (GlossaryDesk): 360 px, the field inside, 44 px rows with rounded corners; the open
     term on color.current with the 1.5 px inset accent ring. */
  .wide .list {
    flex: none;
    gap: var(--space-1);
    box-sizing: border-box;
    width: var(--size-drawer);
    padding: var(--space-4) var(--space-3);
    border-right: var(--border-thin) solid var(--color-line);
  }
  .wide .letter {
    padding: var(--space-3) var(--space-3) var(--space-1);
  }
  .wide .row {
    min-height: var(--size-touch-min);
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-3);
    border-bottom: 0;
    border-radius: var(--radius-control);
  }
  .wide .row[aria-current="true"] {
    background: var(--color-current-row);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
  }
  .row[aria-current="true"] .nm {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  /* A term (GlossaryPhoneTerm): 20 16 padding, 18 px apart; the name 24 px, its expansion 15 px. */
  .term {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-4) + var(--border-thick));
    padding: calc(var(--space-4) + var(--space-1)) var(--space-4);
  }
  .head {
    line-height: normal;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .head h2 {
    margin: 0;
    outline: none;
    color: var(--color-text-strong);
    font-size: var(--font-size-section-title);
    font-weight: var(--weight-bold);
  }
  .expansion {
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .definition {
    max-width: calc(var(--size-drawer) + var(--size-map-figure));
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-body);
    line-height: calc(var(--leading-normal) + 0.05);
  }
  /* Desktop term (GlossaryDesk): 32 48 padding, 20 px apart, the name 28 px. */
  .wide .term {
    flex: 1;
    min-width: 0;
    gap: calc(var(--space-4) + var(--space-1));
    padding: var(--space-8) calc(var(--space-8) + var(--space-4));
    overflow-y: auto;
  }
  .wide .head h2 {
    font-size: calc(var(--font-size-section-title) + var(--space-1));
  }
  /* In the steps: the 12 px label, then one card of 56 px rows, a rule between them. */
  .steps {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thin) * 2);
    max-width: calc(var(--size-drawer) + var(--size-map-figure));
  }
  .label {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .card {
    overflow: hidden;
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .step {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    width: 100%;
    min-height: calc(var(--size-touch-min) + var(--space-3));
    padding: var(--space-2) calc(var(--space-3) + var(--border-thick));
    border: 0;
    border-bottom: var(--border-thin) solid var(--color-line);
    background: none;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    text-decoration: none;
  }
  .step:last-child {
    border-bottom: 0;
  }
  .step :global(.icon) {
    flex: none;
    color: var(--color-text-muted);
  }
  .txt {
    line-height: normal;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thick);
    min-width: 0;
  }
  .st {
    font-size: var(--font-size-body);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .val {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
</style>
