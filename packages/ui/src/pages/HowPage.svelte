<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

How procedures work (HowDesk and HowPhone boards). Every word comes from lib/how-content.ts,
the counts from the pack. From 900 px (desktop and tablet landscape): the header with the Checklist
button, the parts list on the left, and all seven parts in one 640 px reading column; the list
follows the reading position, and a part picked there scrolls to it and goes in the address
(#/how/2). Below 900 px (phone and tablet portrait): one part per screen, "All seven parts" at the
top to open the list, Back and Next at the foot naming the parts they go to.
Each part ends in an "In Involo" box whose link goes to the real place: the pilot's current phase
(as Take the tour finds it), the current step, the Emergency list, Settings, Open steps or Flight.
-->
<script lang="ts">
  import { safely } from "../lib/safely";
  import { HOW, type HowBlock, type HowCounts, type HowLink, fill, runs } from "../lib/how-content";
  import FlowFigure from "../lib/FlowFigure.svelte";
  import Icon from "../lib/Icon.svelte";
  import { flightHref, howHref, phaseHref } from "../route.svelte";
  import { tick, untrack } from "svelte";

  let {
    part,
    counts,
    phase,
    step,
    backHref,
    onStep,
  }: {
    /** The part in the address, if any. */
    part: number | null;
    counts: HowCounts;
    /** The pilot's current phase: the last one open this visit, else the first with steps to do. */
    phase: { id: string; title: string } | null;
    /** That phase's current step, if it has one. */
    step: { id: string; title: string } | null;
    backHref: string;
    onStep: (id: string) => void;
  } = $props();

  const parts = HOW.parts;
  const total = parts.length;

  const wideQuery = "(min-width: 900px)";
  let wide = $state(typeof window !== "undefined" && (window.matchMedia?.(wideQuery).matches ?? true));
  $effect(() => {
    const mq = window.matchMedia?.(wideQuery);
    if (!mq) return;
    const read = () => (wide = mq.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  });

  /** The part on screen: from the address, then as the desktop column is read or a part picked.
   * Kept here, not only in the address, so it survives a change between the layouts. */
  let at = $state(1);
  /** Phone: the parts list, open. */
  let listOpen = $state(false);
  /** Desktop: the part just picked or opened, kept marked while the column scrolls to it, even if
   * the column ends before its heading reaches the top; the reader's own scrolling releases it. */
  let pinned: number | null = null;

  let column = $state<HTMLElement | null>(null);
  let phoneScroll = $state<HTMLElement | null>(null);

  /** Desktop: scrolls the reading column to a part's heading, and marks it. */
  function scrollTo(n: number): void {
    at = n;
    pinned = n;
    const h = column?.querySelector<HTMLElement>(`#how-h-${n}`);
    if (!column || !h) return;
    column.scrollTop = n === 1 ? 0 : h.offsetTop - column.offsetTop - Number.parseFloat(getComputedStyle(column).paddingTop);
  }
  /** Shows a part: scrolled to on desktop, from its top on phone, its heading focused if asked. */
  function show(focus: boolean): void {
    safely(tick(), () => {
      // The part on screen by then: one picked meanwhile wins.
      if (wide) scrollTo(at);
      else if (phoneScroll) phoneScroll.scrollTop = 0;
      if (focus) document.getElementById(`how-h-${at}`)?.focus({ preventScroll: true });
    });
  }
  // The address picks the part; a part out of range is part 1, and the address says so.
  $effect(() => {
    const n = part && part <= total ? part : 1;
    if (part !== null && part !== n) history.replaceState(history.state, "", howHref(n));
    at = n;
    listOpen = false;
    show(part !== null && !untrack(() => wide));
  });
  // Between the layouts (a tablet turned), the same part stays on screen.
  let wasWide = untrack(() => wide);
  $effect(() => {
    if (wide === wasWide) return;
    wasWide = wide;
    show(false);
  });
  /** Desktop: the part whose heading was last scrolled past the top third, or the last part at the
   * end of the column; the address follows without adding to Back. */
  function spy(): void {
    if (!column || pinned !== null) return;
    const top = column.getBoundingClientRect().top + column.clientHeight / 3;
    let n = 1;
    for (let i = 1; i <= total; i++) {
      const h = column.querySelector<HTMLElement>(`#how-h-${i}`);
      if (h && h.getBoundingClientRect().top <= top) n = i;
    }
    if (column.scrollTop > 0 && column.scrollTop + column.clientHeight >= column.scrollHeight - 2) n = total;
    if (n !== at) {
      at = n;
      history.replaceState(history.state, "", howHref(n));
    }
  }
  // The reader scrolls the column themselves: the picked part is no longer held.
  $effect(() => {
    const c = column;
    if (!c) return;
    const release = () => {
      pinned = null;
    };
    const kinds = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const k of kinds) c.addEventListener(k, release, { passive: true });
    return () => {
      for (const k of kinds) c.removeEventListener(k, release);
    };
  });

  const values = $derived<Record<string, string | number>>({ ...counts });

  /** Where an "In Involo" link goes, and its words. */
  function linkOf(link: HowLink): { href: string; text: string; step?: string } | null {
    const phaseLink = phase ? { href: phaseHref(phase.id), text: fill(HOW.links.phase, { phase: phase.title }) } : null;
    switch (link) {
      case "phase":
        return phaseLink;
      case "step":
        return step && phase ? { href: phaseHref(phase.id), text: fill(HOW.links.step, { step: step.title }), step: step.id } : phaseLink;
      case "emergency":
        return { href: "#/reference", text: HOW.links.emergency };
      case "settings":
        return { href: "#/settings", text: HOW.links.settings };
      case "open":
        return { href: "#/open", text: HOW.links.open };
      case "flight":
        return { href: flightHref("overview"), text: HOW.links.flight };
    }
  }
</script>

{#snippet line(text: string)}
  {#each runs(fill(text, values)) as r, i (i)}{#if r.bold}<b>{r.text}</b>{:else}{r.text}{/if}{/each}
{/snippet}

{#snippet figure()}
  {@const f = HOW.figure}
  <figure class="figure">
    <div class="fig">
      <div class="col">
        <span class="fh">{f.flowHeading}</span>
        <FlowFigure />
      </div>
      <div class="col">
        <span class="fh">{f.checklistHeading}</span>
        <div class="pairs">
          <div class="pair head"><span>{f.challenge}</span><span>{f.response}</span></div>
          {#each f.rows as r (r.challenge)}
            <div class="pair"><span class="ch">{r.challenge}</span><span class="re">{r.response}</span></div>
          {/each}
        </div>
      </div>
    </div>
    <figcaption>{f.caption}</figcaption>
  </figure>
{/snippet}

{#snippet block(b: HowBlock)}
  {#if "p" in b}
    <p>{@render line(b.p)}</p>
  {:else if "terms" in b}
    <ul class="terms">
      {#each b.terms as t (t.term)}
        <li><span class="term">{t.term}</span><span class="what">{t.text}</span></li>
      {/each}
    </ul>
  {:else}
    {@render figure()}
  {/if}
{/snippet}

{#snippet partBody(n: number)}
  {@const p = parts[n - 1]}
  {#if p}
    {@const l = linkOf(p.inInvolo.link)}
    <section class="part" aria-labelledby="how-h-{n}">
      <h2 id="how-h-{n}" tabindex="-1"><span class="num">{n}</span>{p.title}</h2>
      {#each p.blocks as b, i (i)}{@render block(b)}{/each}
      <div class="inv">
        <span class="lab">{HOW.inInvolo}</span>
        <span class="txt">{@render line(p.inInvolo.text)}</span>
        {#if l}
          <a
            href={l.href}
            onclick={(e) => {
              if (l.step) {
                e.preventDefault();
                onStep(l.step);
              }
            }}>{l.text} ›</a
          >
        {/if}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet partList(current: number)}
  {#each parts as p, i (p.title)}
    <a
      class="pick"
      href={howHref(i + 1)}
      aria-current={current === i + 1 ? "true" : undefined}
      onclick={(e) => {
        listOpen = false;
        if (!wide) return;
        e.preventDefault();
        scrollTo(i + 1);
        document.getElementById(`how-h-${i + 1}`)?.focus({ preventScroll: true });
        if (location.hash !== howHref(i + 1)) history.pushState(history.state, "", howHref(i + 1));
      }}><span class="pn" aria-hidden="true">{i + 1}</span>{p.title}</a
    >
  {/each}
{/snippet}

<svelte:window
  onkeydown={(e) => {
    // Phone: Esc closes the parts list, back to its button.
    if (e.key === "Escape" && listOpen) {
      listOpen = false;
      document.querySelector<HTMLElement>(".how .all")?.focus();
    }
  }}
/>

<div class="how" class:wide data-app-ready="">
  {#if wide}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />{HOW.checklist}</a>
      <div class="ttl"><h1>{HOW.title}</h1><span>{HOW.sub}</span></div>
    </header>
    <div class="cols">
      <div class="side"><nav aria-label="Parts">{@render partList(at)}</nav></div>
      <main class="read" bind:this={column} onscroll={spy}>
        <article>
          {#each parts as _, i (i)}{@render partBody(i + 1)}{/each}
        </article>
      </main>
    </div>
  {:else}
    <header class="top">
      <a class="icon" href={backHref} aria-label={HOW.backToChecklist}><Icon name="chevron-left" /></a>
      <div class="ttl"><h1>{HOW.title}</h1><span>{fill(HOW.partOf, { n: at, total })}</span></div>
    </header>
    <main class="page" bind:this={phoneScroll}>
      <button class="all" type="button" aria-expanded={listOpen} aria-controls="how-parts" onclick={() => (listOpen = !listOpen)}
        ><span>{HOW.allParts}</span><span class="chev" aria-hidden="true">{listOpen ? "⌃" : "⌄"}</span></button
      >
      {#if listOpen}<nav id="how-parts" class="plist" aria-label="Parts">{@render partList(at)}</nav>{/if}
      {@render partBody(at)}
    </main>
    <div class="foot">
      {#if at > 1}
        {@const p = parts[at - 2]}
        <a class="prev" href={howHref(at - 1)}>{fill(HOW.back, { n: at - 1, title: p?.title ?? "" })}</a>
      {:else}<span class="gap"></span>{/if}
      {#if at < total}
        {@const p = parts[at]}
        <a class="next" href={howHref(at + 1)}>{fill(HOW.next, { n: at + 1, title: p?.title ?? "" })}</a>
      {:else}<span class="gap"></span>{/if}
    </div>
  {/if}
</div>

<style>
  /* The boards' lines are at the font's normal height, but for the paragraphs. */
  .how {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: normal;
  }
  /* The parts list, the column and the phone's page keep the browser's scrollbar, as the Glossary
     does (How review): desktop shows it in the theme's colors (app.css), phones draw their own. */
  /* Phone header (HowPhone): 56 px and its rule, the back icon, the title and "Part n of 7". */
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
  /* Desktop header (HowDesk): 60 px and its rule, the Checklist button, the 20 px title. */
  .wide .top {
    gap: var(--space-4);
    height: calc(var(--size-header) + var(--border-thin));
    padding: 0 var(--space-4);
  }
  .wide .ttl {
    flex: none;
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
  .cols {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  /* The parts list (HowDesk): 320 px, 24 16 padding, 44 px rows 2 px apart; the part being read on
     color.current with the 1.5 px inset accent ring. */
  .side {
    flex: none;
    box-sizing: border-box;
    width: calc(var(--size-map-figure) + var(--space-10));
    padding: var(--space-6) var(--space-4);
    border-right: var(--border-thin) solid var(--color-line);
    overflow-y: auto;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    box-sizing: border-box;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-decoration: none;
  }
  .pick[aria-current="true"] {
    background: var(--color-current-row);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .pn {
    flex: none;
    width: calc(var(--space-4) + var(--border-thick));
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  /* The reading column (HowDesk): 32 48 padding, 640 px wide, 16 px between lines; each part after
     the first under a rule, 8 px above its heading. */
  .read {
    flex: 1;
    min-width: 0;
    padding: var(--space-8) calc(var(--space-8) + var(--space-4));
    overflow-y: auto;
  }
  article {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: calc(var(--size-drawer) + var(--size-map-figure));
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .wide .part + .part {
    padding-top: var(--space-2);
    border-top: var(--border-thin) solid var(--color-line);
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: calc(var(--space-2) + var(--border-thick));
    margin: 0;
    outline: none;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-panel-title) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .num {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-medium);
  }
  p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-body);
    line-height: calc(var(--leading-normal) + 0.05);
  }
  b {
    font-weight: var(--weight-bold);
  }
  /* Part 3's terms: 140 px names, a rule under each row. */
  .terms {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .terms li {
    display: grid;
    grid-template-columns: calc(var(--size-map-figure) / 2) minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: var(--border-thin) solid var(--color-line);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .term {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .what {
    color: var(--color-text-secondary);
  }
  /* Part 2's figure: the flow beside the checklist on desktop, one above the other on phone. */
  .figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
  }
  .fig {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .col {
    display: contents;
  }
  /* Side by side where both columns fit (the 300 px flow and at least 280 px of checklist, as at
     1440 px); one above the other in a narrower column, as on tablet landscape. */
  .wide .fig {
    flex-flow: row wrap;
    align-items: flex-start;
    gap: calc(var(--space-4) + var(--space-1));
    padding: var(--space-4);
  }
  .wide .col {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
  }
  .wide .col + .col {
    flex: 1 1 var(--size-map-figure);
    min-width: 0;
  }
  .fh {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .pairs {
    display: flex;
    flex-direction: column;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: var(--border-thin) dashed var(--color-line);
    font-size: var(--font-size-secondary);
  }
  .pair.head {
    padding: 0;
    border-bottom: 0;
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .ch {
    color: var(--color-text);
  }
  .re {
    color: var(--color-text-strong);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  figcaption {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  /* "In Involo": a small box, its label, the line and the link. */
  .inv {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: calc(var(--space-2) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .lab {
    flex: none;
    color: var(--color-accent-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .txt {
    flex: 1;
    min-width: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .inv a {
    display: flex;
    flex: none;
    align-items: center;
    min-height: var(--size-touch-min);
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
    white-space: nowrap;
  }
  /* Phone (HowPhone): one part, 16 px padding, 14 px between lines. */
  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    min-height: 0;
    padding: var(--space-4);
    overflow-y: auto;
  }
  .page .part {
    gap: calc(var(--space-3) + var(--border-thick));
  }
  .all {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-align: left;
  }
  .all span:first-child {
    flex: 1;
  }
  .chev {
    color: var(--color-text-muted);
  }
  .plist {
    flex: none;
  }
  /* The foot (HowPhone): Back and Next, 48 px, naming the parts they go to. */
  .foot {
    display: flex;
    flex: none;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + var(--space-1));
    border-top: var(--border-thin) solid var(--color-line);
    background: var(--color-surface-2);
  }
  .foot a,
  .gap {
    display: flex;
    flex: 1;
    align-items: center;
    box-sizing: border-box;
    min-width: 0;
    height: calc(var(--size-touch-min) + var(--space-1));
    padding: 0 var(--space-3);
    border-radius: var(--radius-panel);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-decoration: none;
  }
  .prev {
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-button-bg);
    color: var(--color-text);
  }
  .next {
    justify-content: flex-end;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
</style>
