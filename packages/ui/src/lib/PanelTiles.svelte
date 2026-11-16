<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A step's panels as tiles (owner, batch 6; PanelTiles board). Every tile shares one scale, the
largest at which each of them fits, so their labels are the same size (owner, replacing "each tile
at its own scale"): side by side when they fit that way, otherwise stacked, 16 px apart, centered;
never the deck's gaps between them (the map shows where things are). Several tiles are titled with their
panel's name. A panel the pack has no drawing for is a tile too: its name and the step's controls
on it, as a list. One drawn panel alone is drawn as before.
-->
<script lang="ts">
  import type { ItemTarget } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import { sharedScale } from "./panel-layout";
  import { panelName } from "./panel-name";
  import PanelNavigator from "./PanelNavigator.svelte";
  import PanelSchematic from "./PanelSchematic.svelte";
  import type { Tile } from "./step-tiles";

  let {
    tiles,
    targets,
    guardClosed = false,
    index,
    room,
    large = false,
    ownCard = true,
    picked = $bindable(),
    wider = $bindable(),
    scroller = $bindable(),
  }: {
    tiles: Tile[];
    targets: ItemTarget[];
    guardClosed?: boolean;
    index?: PackIndex | undefined;
    /** The room the slide-out gives the drawing (every tile fits it, at the shared scale). */
    room?: { width: number; height: number } | undefined;
    large?: boolean;
    ownCard?: boolean;
    picked?: { section: string; item: number } | null | undefined;
    /** Out, for one drawn panel alone: wider than its room, and its scroller (the navigator). */
    wider?: boolean | undefined;
    scroller?: HTMLDivElement | null | undefined;
  } = $props();

  /** 16 px (space-4) at the default text size, scaled with the root font size as the CSS gap is. */
  let page = $state(1);
  $effect(() => {
    const read = () => (page = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  });
  let GAP = $derived(16 * page);
  let single = $derived(tiles.length === 1 && tiles[0]?.kind === "drawn" ? tiles[0] : null);
  let naturals = $state<Record<string, number>>({});
  /** Each drawn tile's box in panel units, and the one scale they share. */
  let extents = $state<Record<string, { w: number; h: number }>>({});
  let drawnIds = $derived(tiles.flatMap((t) => (t.kind === "drawn" ? [t.id] : [])));
  let boxes = $derived(drawnIds.flatMap((id) => (extents[id] ? [extents[id]] : [])));
  /** Each tile wider than its room, and the element that scrolls it: a navigator strip above it
   * (owner, batch 6: every wide panel, on single and multi-panel sheets alike). */
  let wides = $state<Record<string, boolean>>({});
  let scrollers = $state<Record<string, HTMLDivElement | null>>({});
  let width = $state(0);
  let shared = $derived(boxes.length === drawnIds.length ? sharedScale(boxes, { width, room, page }) : undefined);
  /** Side by side when every tile fits that way at the shared scale; stacked otherwise. */
  let row = $derived.by(() => {
    const room_ = room?.width ?? width;
    if (!room_ || shared == null) return false;
    const sum = boxes.reduce((n, b) => n + Math.floor(b.w * shared), 0);
    return tiles.every((t) => t.kind === "drawn") && sum + GAP * (tiles.length - 1) <= room_;
  });
  $effect(() => {
    if (!single) wider = false;
  });
</script>

{#if single}
  <PanelSchematic panel={single.panel} focus={[single.id]} {targets} {guardClosed} {index} {large} {ownCard} {room} bind:picked bind:wider bind:scroller />
{:else}
  <div class="tiles" class:row bind:clientWidth={width}>
    {#each tiles as t (t.id)}
      {#if t.kind === "drawn"}
        {@const strip = wides[t.id] ? scrollers[t.id] : null}
        <div class="tile" style:width={row ? `${naturals[t.id] ?? 0}px` : undefined}>
          {#if strip}<PanelNavigator panel={t.panel} focus={[t.id]} {targets} {guardClosed} scroller={strip} title={panelName(t.title)} />{/if}
          <PanelSchematic
            panel={t.panel}
            focus={[t.id]}
            {targets}
            {guardClosed}
            {index}
            {large}
            {ownCard}
            {room}
            tile
            {shared}
            bind:extent={() => extents[t.id], (v) => v && (extents[t.id] = v)}
            bind:picked
            bind:natural={() => naturals[t.id], (v) => (naturals[t.id] = v ?? 0)}
            bind:wider={() => wides[t.id], (v) => (wides[t.id] = v ?? false)}
            bind:scroller={() => scrollers[t.id], (v) => (scrollers[t.id] = v ?? null)}
          />
        </div>
      {:else}
        <!-- A panel the pack does not draw: its name and the step's controls on it. -->
        <div class="listed" role="group" aria-label={panelName(t.title)}>
          <span class="name">{panelName(t.title)}</span>
          <ul>
            {#each t.controls as c (c)}<li>{c}</li>{/each}
          </ul>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .tiles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }
  .tiles.row {
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 100%;
  }
  .tiles:not(.row) .tile {
    width: 100%;
  }
  .listed {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-fill);
    color: var(--panel-text);
  }
  .name {
    color: var(--panel-label);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .listed ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-secondary);
  }
</style>
