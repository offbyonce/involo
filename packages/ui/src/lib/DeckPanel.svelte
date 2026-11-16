<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The selected place on the Flight deck page (Deck board's right column; PhoneDeck under the map;
the tablet's slide-out): its drawing at rest, "Resting positions. Tap a light for its meaning.",
its light meanings, and the steps that use it, each going to its step. A place the pack does not
draw lists its controls instead, as a panel with no drawing does elsewhere.
-->
<script lang="ts">
  import type { Zone } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import { zoneControls, zoneLights, zoneSections, zoneSteps } from "./deck";
  import PanelNavigator from "./PanelNavigator.svelte";
  import PanelSchematic from "./PanelSchematic.svelte";
  import PanelSheet from "./PanelSheet.svelte";
  import PanelTiles from "./PanelTiles.svelte";
  import { phaseHref } from "../route.svelte";
  import { stepTitle } from "./sentence";
  import type { Tile } from "./step-tiles";

  let {
    index,
    zone,
    compact = false,
    heading = true,
    drawingOnly = false,
    fullSize = false,
    onStep,
  }: {
    index: PackIndex;
    zone: Zone;
    /** Phone (PhoneDeck): the name alone above, "Used by:" before each step. */
    compact?: boolean;
    /** Shows "Selected panel" and the name (the slide-out names it in its own header). */
    heading?: boolean;
    /** Only the drawing, no caption (Around the flight deck's list). */
    drawingOnly?: boolean;
    /** At full size in place (the 900 to 1439 px slide-out, which is the full-size view). */
    fullSize?: boolean;
    onStep: (id: string) => void;
  } = $props();

  let tiles = $derived<Tile[]>(
    zoneSections(index, zone).map(({ panel, section }) => ({ kind: "drawn", id: section.id, panel, section, title: section.title })),
  );
  /** Each light once: the pack repeats a meaning for each of a row of lights (LOW PRESSURE). */
  let lights = $derived.by(() => {
    const seen = new Set<string>();
    return zoneLights(index, zone).filter((l) => {
      const k = `${l.label}|${l.meaning}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
  let steps = $derived(
    zoneSteps(index, zone).flatMap((s) => {
      const step = index.step(s.id);
      const phase = index.phaseOf(s.id);
      return step ? [{ id: s.id, title: stepTitle(index, step), phase: s.phase, href: phase ? phaseHref(phase) : "#/" }] : [];
    }),
  );
  let controls = $derived(zoneControls(index, zone));
  /** Full size, in the panel sheet: the sheet's width, any height; a panel wider than that at the
   * 11 px label floor scrolls sideways under a navigator strip (owner). */
  let sheet = $state<PanelSheet | null>(null);
  let sheetWidth = $state(0);
  let room = $derived(sheetWidth ? { width: sheetWidth, height: sheetWidth * 8 } : undefined);
  let wider = $state(false);
  let scroller = $state<HTMLDivElement | null>(null);
</script>

<div class="deck-panel" class:compact>
  {#if heading}
    <div class="head">
      {#if !compact}<span class="over">Selected panel</span>{/if}
      <h3>{zone.title}</h3>
    </div>
  {/if}
  {#if tiles.length}
    {#snippet full()}
      <div class="full-room" bind:clientWidth={sheetWidth}>
        {#if wider && scroller && tiles.length === 1 && tiles[0]?.kind === "drawn"}
          <PanelNavigator panel={tiles[0].panel} focus={[tiles[0].id]} targets={[]} {scroller} title={zone.title} />
        {/if}
        <PanelTiles {tiles} targets={[]} {index} {room} large bind:wider bind:scroller />
      </div>
    {/snippet}
    {#if fullSize}
      <figure class="drawing">
        {@render full()}
        <figcaption><span>Resting positions. Tap a light for its meaning.</span></figcaption>
      </figure>
    {:else}
      <!-- An overview fitted to the column, never scrolling (owner); Full size opens the panel sheet. -->
      <figure class="drawing">
        {#each tiles as t (t.id)}
          {#if t.kind === "drawn"}
            <PanelSchematic panel={t.panel} focus={[t.id]} targets={[]} {index} overview tile={tiles.length > 1} ownButton={false} />
          {/if}
        {/each}
        <figcaption>
          {#if !compact && !drawingOnly}<span>Resting positions. Tap a light for its meaning.</span>{/if}
          <button class="full" type="button" onclick={() => sheet?.open()}>Full size ›</button>
        </figcaption>
      </figure>
      <PanelSheet caption={zone.title} bind:this={sheet}>{@render full()}</PanelSheet>
    {/if}
  {:else if controls.length && !drawingOnly}
    <div class="listed" role="group" aria-label={zone.title}>
      <ul>
        {#each controls as c (c)}<li>{c}</li>{/each}
      </ul>
    </div>
  {/if}
  {#if lights.length && !drawingOnly}
    <section class="lights" aria-label="Light meanings">
      {#if !compact}<span class="label">Light meanings</span>{/if}
      {#each lights as l (l.label + l.meaning)}
        <div class="light">
          <span class="chip {l.color ?? 'amber'}">{l.label}</span>
          <span class="meaning">{l.meaning}</span>
        </div>
      {/each}
    </section>
  {/if}
  {#if steps.length && !drawingOnly}
    <section class="steps" aria-label="Steps that use this panel">
      {#if !compact}<span class="label">Steps that use this panel</span>{/if}
      <div class="links">
        {#each steps as s (s.id)}
          <a
            href={s.href}
            onclick={(e) => {
              e.preventDefault();
              onStep(s.id);
            }}>{compact ? "Used by: " : ""}{s.title} · {s.phase}</a
          >
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .deck-panel {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    min-width: 0;
  }
  .compact {
    gap: calc(var(--space-2) + var(--border-thick));
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .over {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .compact h3 {
    font-size: var(--font-size-body);
  }
  /* The drawing's card (panel palette): 10 px corners, 10 12 padding. */
  .drawing {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    margin: 0;
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-3);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-bg);
  }
  figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--panel-label);
    font-size: var(--font-size-caption);
  }
  /* "Full size ›": a 44 px link at the caption's end. */
  .full {
    min-height: var(--size-touch-min);
    margin-left: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .full-room {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .listed ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-fill);
    color: var(--panel-text);
    font-size: var(--font-size-secondary);
    list-style: none;
  }
  .lights,
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .label {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .light {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .compact .light {
    gap: calc(var(--space-2) + var(--border-thick));
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-3);
  }
  /* A lit light's chip, in its own color (as the drawings light it). */
  .chip {
    flex: none;
    max-width: calc(var(--size-touch-min) * 2);
    padding: var(--space-1) calc(var(--space-1) + var(--border-thick));
    border-radius: calc(var(--radius-small) / 2);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    text-align: center;
  }
  .chip.amber {
    background: var(--color-lit-amber);
    color: var(--color-on-lit-amber);
  }
  .chip.red {
    background: var(--color-danger);
    color: var(--color-on-accent);
  }
  .chip.green {
    background: var(--color-done);
    color: var(--color-on-done);
  }
  .chip.blue {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .meaning {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .links {
    display: flex;
    flex-direction: column;
  }
  .links a {
    display: flex;
    align-items: center;
    min-height: var(--size-touch-min);
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
</style>
