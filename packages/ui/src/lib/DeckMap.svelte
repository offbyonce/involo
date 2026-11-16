<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A Flight deck area's map (Deck and PhoneDeck boards), drawn from the pack's overview: the area's
places as boxes with the region's edge captions ("↑ AFT, TOWARD THE CABIN", "CAPTAIN SIDE"), the
selected place filled and outlined in the accent with its name. Each box selects its place (a
button). Name every panel labels them all. The batch 6 map rules hold: a box is labeled only when
its name fits with 6 px either side, at 11 px or more; otherwise it stays unlabeled (the place's
name shows beside the map). A place drawn as several boxes is one stop for the keyboard and screen
readers (its first box); the others still select it with a tap.
-->
<script lang="ts">
  import type { OverviewArea, OverviewRegion, Zone } from "@involo/bindings";
  import { em } from "./text-width";

  let {
    boxes,
    zones,
    region,
    selected,
    names = false,
    compact = false,
    onPick,
  }: {
    boxes: OverviewArea[];
    zones: Zone[];
    region: OverviewRegion | null;
    selected: string | null;
    /** Name every panel (Deck board's switch). */
    names?: boolean;
    /** Phone (PhoneDeck): the edges take the region's short captions. */
    compact?: boolean;
    onPick: (zone: string) => void;
  } = $props();

  /** The boards' sizes on screen: names 16 px, 12 on the phone (smaller to fit, never under 11),
   * edges 13 px. */
  let NAME = $derived(compact ? 12 : 16);
  const MIN = 11;
  const EDGE = 13;
  const SIDE = 6;

  let byId = $derived(new Map(zones.map((z) => [z.id, z])));
  let edges = $derived({
    top: (compact ? region?.top_short : null) ?? region?.top ?? null,
    bottom: (compact ? region?.bottom_short : null) ?? region?.bottom ?? null,
    left: (compact ? region?.left_short : null) ?? region?.left ?? null,
    right: (compact ? region?.right_short : null) ?? region?.right ?? null,
  });
  let bounds = $derived({
    x0: Math.min(...boxes.map((a) => a.x)),
    y0: Math.min(...boxes.map((a) => a.y)),
    x1: Math.max(...boxes.map((a) => a.x + a.width)),
    y1: Math.max(...boxes.map((a) => a.y + a.height)),
  });
  let width = $state(0);
  /** Room for the captions, in screen pixels, then the scale that fits the boxes in what is left. */
  let pad = $derived({
    top: edges.top ? EDGE * 2 : SIDE,
    bottom: edges.bottom ? EDGE * 2 : SIDE,
    side: edges.left || edges.right ? EDGE * 3 : SIDE,
  });
  let k = $derived(width > 0 ? Math.max(0.1, (width - 2 * pad.side) / (bounds.x1 - bounds.x0)) : 1);
  let w = $derived(width || (bounds.x1 - bounds.x0) * k + 2 * pad.side);
  let h = $derived((bounds.y1 - bounds.y0) * k + pad.top + pad.bottom);
  /** A box's place on screen. */
  const at = (a: OverviewArea) => ({
    x: pad.side + (a.x - bounds.x0) * k,
    y: pad.top + (a.y - bounds.y0) * k,
    w: a.width * k,
    h: a.height * k,
  });
  /** The name a box shows, at the largest size from 16 down to 11 px that fits with 6 px either side. */
  const label = (a: OverviewArea, box: { w: number; h: number }) => {
    const text = (a.label ?? byId.get(a.zone)?.short_title ?? "").toUpperCase();
    if (!text) return null;
    const fs = Math.min(NAME, (box.w - 2 * SIDE) / em(text), box.h - 2 * SIDE);
    return fs >= MIN ? { text, fs } : null;
  };
  function key(e: KeyboardEvent, zone: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(zone);
    }
  }
</script>

<div class="wrap" bind:clientWidth={width}>
  {#if boxes.length}
    <svg class="map" viewBox="0 0 {w} {h}" width={w} height={h} role="group" aria-label="{region?.name ?? 'Area'} layout">
      {#if edges.top}<text class="edge" x={w / 2} y={EDGE}>↑ {edges.top}</text>{/if}
      {#if edges.bottom}<text class="edge" x={w / 2} y={h - EDGE * 0.4}>↓ {edges.bottom}</text>{/if}
      {#if edges.left}<text class="edge" transform="translate({EDGE} {h / 2}) rotate(-90)">{edges.left}</text>{/if}
      {#if edges.right}<text class="edge" transform="translate({w - EDGE} {h / 2}) rotate(90)">{edges.right}</text>{/if}
      {#each boxes as a, n (a.zone + a.x + a.y)}
        {@const box = at(a)}
        {@const first = boxes.findIndex((b) => b.zone === a.zone) === n}
        {@const z = byId.get(a.zone)}
        {@const on = a.zone === selected}
        {@const name = on || names ? label(a, box) : null}
        {#snippet drawn()}
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="2" />
          {#if name}<text class="name" x={box.x + box.w / 2} y={box.y + box.h / 2} style:font-size="{name.fs}px">{name.text}</text>{/if}
        {/snippet}
        {#if first}
          <g class="box" class:on role="button" tabindex="0" aria-pressed={on} aria-label={z?.title ?? a.zone} onclick={() => onPick(a.zone)} onkeydown={(e) => key(e, a.zone)}>
            {@render drawn()}
          </g>
        {:else}
          <!-- The same place's further boxes: a tap selects it; the keyboard stop is its first box. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g class="box" class:on aria-hidden="true" onclick={() => onPick(a.zone)}>{@render drawn()}</g>
        {/if}
      {/each}
    </svg>
  {/if}
</div>

<style>
  .wrap {
    width: 100%;
  }
  .map {
    display: block;
    overflow: visible;
    max-width: 100%;
    height: auto;
  }
  /* Panel palette (decision 0021), the boards' boxes: 1.2 px outline, 2 px corners. */
  rect {
    fill: var(--panel-fill);
    stroke: var(--panel-stroke);
    stroke-width: calc(var(--border-thin) * 1.2);
  }
  .box {
    cursor: pointer;
    outline: none;
  }
  .box:focus-visible rect {
    stroke: var(--color-accent);
    stroke-width: var(--border-thick);
  }
  .on rect {
    fill: var(--panel-changed-fill);
    stroke: var(--panel-changed);
    stroke-width: calc(var(--border-thick) * 1.5);
  }
  text {
    font-family: var(--font-sans);
    text-anchor: middle;
    dominant-baseline: central;
  }
  .edge {
    fill: var(--panel-label);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .name {
    fill: var(--panel-text);
    font-weight: var(--weight-bold);
    pointer-events: none;
  }
  .on .name {
    fill: var(--panel-changed-text);
  }
</style>
