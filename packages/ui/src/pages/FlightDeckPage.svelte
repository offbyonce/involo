<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The Flight deck page (Deck and PhoneDeck boards), from the pack's panels, controls, lights
and overview map. Its own header: the Checklist button, "Flight deck", "Every area, panel and light"
and Name every panel.
- 1440 px and up (Deck): three columns, the side view over the area list; the area's map, the
  panels in it as a list and its light meanings; the selected panel.
- 900 to 1439 px: the area list and the area; a selected panel opens in a slide-out, drawn as the
  step's slide-out is, not a third column.
- Below 900 px (PhoneDeck): the area picker in the header, the map, the list, the selected panel.
Around the flight deck, last, has no map region: its places are a list, each with its location
line and, where the pack draws it, its drawing; nothing is lit in the side view.
-->
<script lang="ts">
  import { safely } from "../lib/safely";
  import DeckMap from "../lib/DeckMap.svelte";
  import DeckPanel from "../lib/DeckPanel.svelte";
  import { tick } from "svelte";
  import { type DeckArea, areaOf, deckAreas, deckHref, zoneLights, zoneSections } from "../lib/deck";
  import Icon from "../lib/Icon.svelte";
  import Toggle from "../lib/Toggle.svelte";
  import { trapFocus } from "../lib/trap";
  import ViewDrawing from "../lib/ViewDrawing.svelte";
  import type { PackIndex } from "../pack-index";

  let {
    index,
    area: areaId,
    zone: zoneId,
    backHref,
    onStep,
  }: {
    index: PackIndex;
    /** The area and place in the address, if any. */
    area: string | null;
    zone: string | null;
    backHref: string;
    onStep: (id: string) => void;
  } = $props();

  const query = (q: string, fallback: boolean) => (typeof window !== "undefined" ? (window.matchMedia?.(q).matches ?? fallback) : fallback);
  let wide = $state(query("(min-width: 1440px)", true));
  let mid = $state(query("(min-width: 900px)", true));
  $effect(() => {
    const a = window.matchMedia?.("(min-width: 1440px)");
    const b = window.matchMedia?.("(min-width: 900px)");
    if (!a || !b) return;
    const read = () => {
      wide = a.matches;
      mid = b.matches;
    };
    a.addEventListener("change", read);
    b.addEventListener("change", read);
    return () => {
      a.removeEventListener("change", read);
      b.removeEventListener("change", read);
    };
  });

  let areas = $derived(deckAreas(index));
  let area = $derived(areas.find((a) => a.id === areaId) ?? areas[0] ?? null);
  let around = $derived(!!area && !area.region);
  /** The selected place: the address's, if it is in this area; on a wide screen or a phone, the
   * area's first otherwise (the tablet opens it in a slide-out only when chosen). */
  let chosen = $derived(area?.zones.find((z) => z.id === zoneId) ?? null);
  let selected = $derived(around ? null : (chosen ?? (wide || !mid ? (area?.zones[0] ?? null) : null)));
  // A place named under another area (an old link): the address moves to its own area.
  $effect(() => {
    if (!zoneId || chosen || !areas.length) return;
    const home = areaOf(areas, zoneId);
    if (home && home.id !== area?.id) location.replace(deckHref(home.id, zoneId));
  });
  let names = $state(false);
  let listOpen = $state(false);
  let lightsOpen = $state(false);
  let picker = $state(false);
  $effect(() => {
    void area?.id;
    listOpen = false;
    lightsOpen = false;
  });

  const go = (href: string) => location.replace(href);
  const pickArea = (a: DeckArea) => {
    picker = false;
    go(deckHref(a.id));
  };
  const pickZone = (zone: string) => area && go(deckHref(area.id, zone));
  /** The area's light meanings, each once. */
  let areaLights = $derived.by(() => {
    const seen = new Set<string>();
    return (area?.zones ?? []).flatMap((z) =>
      zoneLights(index, z).filter((l) => {
        const k = `${l.label}|${l.meaning}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    );
  });
  const location_ = (z: { area: string; position?: string | null }) => [z.area, z.position].filter(Boolean).join(" · ");
  /** The tablet's slide-out: open, focus moves in; Esc anywhere or the scrim closes it, and focus
   * goes back to the box that opened it (or the map). */
  let slideOpen = $derived(!wide && mid && !!chosen && !around);
  let slideEl = $state<HTMLElement | null>(null);
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (!slideOpen) return;
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    opener = from && !from.closest(".slide") ? from : opener;
    safely(tick(), () => slideEl?.focus());
  });
  function closeSlide() {
    if (!area) return;
    const back = opener;
    opener = null;
    go(deckHref(area.id));
    safely(tick(), () => (back?.isConnected ? back : document.querySelector<HTMLElement>(".deck .map [role='button']"))?.focus());
  }
  /** The phone's area picker closes on Esc, a tap outside, or a choice; focus goes back to it. */
  let pickButton = $state<HTMLButtonElement | null>(null);
  function closePicker() {
    picker = false;
    pickButton?.focus();
  }
  function windowKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (picker) {
      e.preventDefault();
      closePicker();
    } else if (slideOpen) {
      e.preventDefault();
      closeSlide();
    }
  }
  function windowClick(e: MouseEvent) {
    if (picker && e.target instanceof Element && !e.target.closest(".menu, .pick")) picker = false;
  }
</script>

<svelte:window onkeydown={windowKey} onclick={windowClick} />

{#snippet sideView(a: DeckArea | null)}
  {#if index.overview?.views?.side}
    <ViewDrawing
      frame={index.overview.views.side}
      region={a?.side?.region ?? null}
      shape={a?.side?.shape ?? null}
      kind="side"
      title="Side view of the flight deck{a?.side ? ` with the ${a.name.toLowerCase()} highlighted` : ''}"
      bare
    />
  {/if}
{/snippet}

{#snippet areaList()}
  <nav class="areas" aria-label="Flight deck areas">
    <div class="side">{@render sideView(area)}</div>
    {#each areas as a (a.id)}
      <a href={deckHref(a.id)} aria-current={a.id === area?.id ? "true" : undefined} onclick={(e) => (e.preventDefault(), pickArea(a))}
        >{a.name}{#if a.code}<span class="code">{a.code}</span>{/if}</a
      >
    {/each}
  </nav>
{/snippet}

{#snippet aroundList(a: DeckArea)}
  <ul class="places">
    {#each a.zones as z (z.id)}
      {@const sections = zoneSections(index, z)}
      <li class="place">
        <h3>{z.title}</h3>
        <span class="where">{location_(z)}</span>
        {#if sections.length}<DeckPanel {index} zone={z} heading={false} drawingOnly {onStep} />{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet areaBody(a: DeckArea, phone: boolean)}
  {#if a.region}
    <figure class="map">
      <DeckMap boxes={a.boxes} zones={a.zones} region={a.region} selected={selected?.id ?? null} {names} compact={phone} onPick={pickZone} />
      {#if !phone}<figcaption>Select a panel to open it. Turn on Name every panel to label them all.</figcaption>{/if}
    </figure>
    <button class="disclose" type="button" aria-expanded={listOpen} onclick={() => (listOpen = !listOpen)}
      >Panels in this area, as a list<span class="count">{a.zones.length} {listOpen ? "⌃" : "⌄"}</span></button
    >
    {#if listOpen}
      <ul class="list">
        {#each a.zones as z (z.id)}
          <li><button type="button" aria-pressed={z.id === selected?.id} onclick={() => pickZone(z.id)}>{z.title}</button></li>
        {/each}
      </ul>
    {/if}
    {#if !phone}
      <button class="disclose" type="button" aria-expanded={lightsOpen} onclick={() => (lightsOpen = !lightsOpen)}
        >Light meanings for this area<span class="count">{lightsOpen ? "⌃" : "⌄"}</span></button
      >
      {#if lightsOpen}
        <ul class="list lights">
          {#each areaLights as l (l.label + l.meaning)}
            <li><b>{l.label}</b> {l.meaning}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  {:else}
    {@render aroundList(a)}
  {/if}
{/snippet}

<div class="deck" class:wide class:mid class:around data-app-ready="">
  {#if mid}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
      <div class="ttl"><h1>Flight deck</h1><span>Every area, panel and light</span></div>
      <span class="fill"></span>
      {#if area?.region}<Toggle on={names} text="Name every panel" onToggle={() => (names = !names)} />{/if}
    </header>
    <div class="cols">
      {@render areaList()}
      {#if area}
        <section class="area" aria-labelledby="deck-area">
          <div class="area-head">
            <h2 id="deck-area">{area.name}</h2>
            {#if area.locate}<span class="locate">{area.locate}</span>{/if}
          </div>
          {@render areaBody(area, false)}
        </section>
      {/if}
      {#if wide && !around}
        <aside class="panel" aria-label={selected?.title ?? "Selected panel"}>
          {#if selected}{#key selected.id}<DeckPanel {index} zone={selected} {onStep} />{/key}{/if}
        </aside>
      {/if}
    </div>
    {#if slideOpen && chosen && area}
      <button class="scrim" type="button" aria-label="Close the panel" tabindex="-1" onclick={closeSlide}></button>
      <div class="slide" role="dialog" aria-modal="true" aria-labelledby="deck-so-title" tabindex="-1" bind:this={slideEl} use:trapFocus>
        <header class="so-head">
          <div class="so-titles">
            <span class="so-area">{area.name}</span>
            <h2 id="deck-so-title">{chosen.title}</h2>
            {#if chosen.position}<span class="so-where">{location_(chosen)}</span>{/if}
          </div>
          <kbd class="esc" aria-hidden="true">Esc</kbd>
          <button class="close" type="button" aria-label="Close" onclick={closeSlide}><Icon name="x" /></button>
        </header>
        <div class="so-body">{#key chosen.id}<DeckPanel {index} zone={chosen} heading={false} fullSize {onStep} />{/key}</div>
      </div>
    {/if}
  {:else}
    <header class="top phone">
      <a class="icon" href={backHref} aria-label="Back to checklist"><Icon name="chevron-left" /></a>
      <h1>Flight deck</h1>
      <span class="fill"></span>
      <button class="pick" type="button" aria-expanded={picker} aria-controls="deck-areas-menu" bind:this={pickButton} onclick={() => (picker = !picker)}
        >{area?.name ?? "Areas"}<Icon name="chevron-down" /></button
      >
    </header>
    {#if picker}
      <ul class="menu" id="deck-areas-menu" aria-label="Flight deck areas">
        {#each areas as a (a.id)}
          <li><button type="button" aria-current={a.id === area?.id ? "true" : undefined} onclick={() => (pickArea(a), pickButton?.focus())}>{a.name}</button></li>
        {/each}
      </ul>
    {/if}
    <div class="phone-body">
      {#if area}
        {@render areaBody(area, true)}
        {#if selected && !around}{#key selected.id}<DeckPanel {index} zone={selected} compact {onStep} />{/key}{/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .deck {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
  }
  /* Header (Deck): 60 px, the Checklist button, the title and its sub-line, Name every panel. */
  .top {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-4);
    height: var(--size-header);
    padding: 0 var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
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
  .ttl {
    display: flex;
    flex-direction: column;
    line-height: var(--leading-tight);
  }
  .ttl h1 {
    margin: 0;
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .ttl span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .fill {
    flex: 1;
  }
  .cols {
    display: grid;
    flex: 1;
    grid-template-columns: calc(var(--size-map-figure) - var(--space-2)) minmax(0, 1fr);
    min-height: 0;
  }
  /* 1440 and up: 272 | the area | 456 (Deck board). */
  .wide .cols {
    grid-template-columns: calc(var(--size-map-figure) - var(--space-2)) minmax(0, 1fr) calc(var(--size-side-pane-tablet) + var(--space-4));
  }
  /* Around the flight deck has no selected panel: the list takes the width. */
  .wide.around .cols {
    grid-template-columns: calc(var(--size-map-figure) - var(--space-2)) minmax(0, 1fr);
  }
  .areas {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    padding: var(--space-4) var(--space-3);
    overflow-y: auto;
    border-right: var(--border-thin) solid var(--color-line);
  }
  .side {
    margin-bottom: var(--space-2);
  }
  .areas a {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border-radius: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .areas a[aria-current="true"] {
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 calc(var(--border-thin) * 1.5) var(--color-accent);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .code {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  [aria-current="true"] .code {
    font-weight: var(--weight-medium);
  }
  /* The area (Deck's middle column): 20 24 padding, 12 apart. */
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: calc(var(--space-4) + var(--space-1)) var(--space-6);
    overflow-y: auto;
  }
  .area-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .area-head h2 {
    margin: 0;
    line-height: var(--leading-tight);
    font-size: var(--font-size-section-title);
    font-weight: var(--weight-bold);
  }
  .locate {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .map {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-panel);
    background: var(--panel-bg);
  }
  .map figcaption {
    color: var(--panel-label);
    font-size: var(--font-size-caption);
  }
  .disclose {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .count {
    color: var(--color-text-muted);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list button {
    width: 100%;
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: 0;
    border-bottom: var(--border-thin) solid var(--color-line);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .list button[aria-pressed="true"] {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .list.lights li {
    padding: var(--space-2) calc(var(--space-3) + var(--border-thick));
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .list.lights b {
    color: var(--color-text-strong);
  }
  /* The selected panel (Deck's right column): 20 24 padding on surface 2. */
  .panel {
    padding: calc(var(--space-4) + var(--space-1)) var(--space-6);
    overflow-y: auto;
    border-left: var(--border-thin) solid var(--color-line);
    background: var(--color-surface-2);
  }
  /* Around the flight deck: each place, its location line, and its drawing where the pack has one. */
  .places {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .place {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .place h3 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .where {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  /* 900 to 1439 px: the selected panel in a slide-out, drawn as the step's. */
  .scrim {
    position: fixed;
    inset: var(--size-header) 0 0;
    z-index: 40;
    border: 0;
    background: var(--color-scrim);
  }
  .slide {
    position: fixed;
    top: var(--size-header);
    right: 0;
    bottom: 0;
    z-index: 41;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: min(var(--size-slideout-tablet), 100%);
    overflow: hidden;
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-popover) 0 0 0;
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .so-head {
    display: flex;
    flex: none;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-3) var(--space-6);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .so-titles {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thick);
    min-width: 0;
  }
  .so-area {
    color: var(--color-link);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .so-head h2 {
    margin: 0;
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .so-where {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .esc {
    align-self: center;
    padding: 0 var(--space-1);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-small);
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-caption);
  }
  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    margin-top: calc(-1 * var(--space-2));
    border: 0;
    background: none;
    color: var(--color-text-secondary);
  }
  .so-body {
    flex: 1;
    min-height: 0;
    padding: var(--space-4) var(--space-6);
    overflow-y: auto;
  }
  /* Phone (PhoneDeck): 56 px header, the area picker; 12 14 padding, 10 apart. */
  .top.phone {
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3));
    padding: 0 var(--space-2) 0 var(--space-1);
  }
  .top.phone h1 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .pick :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .menu {
    position: absolute;
    top: calc(var(--size-touch-min) + var(--space-3));
    right: var(--space-2);
    z-index: 30;
    margin: 0;
    padding: var(--space-1);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-control);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
    list-style: none;
  }
  .menu button {
    width: 100%;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .menu button[aria-current="true"] {
    background: var(--color-accent-soft);
    color: var(--color-text-strong);
  }
  .phone-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: 0;
    padding: var(--space-3) calc(var(--space-3) + var(--border-thick));
    overflow-y: auto;
  }
  .phone-body .map {
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-2);
    border-radius: var(--radius-control);
  }
</style>
