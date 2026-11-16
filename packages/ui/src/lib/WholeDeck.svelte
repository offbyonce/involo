<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The whole flight deck from the pack's overview, the zone's area outlined and the zone marked:
behind the slide-out's "Whole flight deck" disclosure until the Flight deck page (batch 6, owner).
Panel palette; map units are about one to a pixel here, so labels stay at 11 px or more.

Owner, batch 6 (PanelTiles board): area labels sit above their area, outside any outline, at least
8 px clear above the outline and 16 px below the area before them; the dashed outline runs 6 px
outside the area's panels; a marked control is labeled only when its box fits the label with 6 px
either side (the sheet's title names it otherwise).
-->
<script lang="ts">
  import type { Zone } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import { em } from "./text-width";

  let { index, zone }: { index: PackIndex; zone: Zone } = $props();

  /** The caption type: 11.5 px, its ascent and descent. */
  const CAP = 11.5;
  const ASCENT = 9;
  const DESCENT = 3;
  /** Clear space above the outline, the outline's margin, and the space under the area before. */
  const CLEAR = 8;
  const OUTSET = 6;
  const BELOW = 16;
  const PAD = 6;

  let overview = $derived(index.overview);
  let region = $derived(index.region(zone)?.region ?? null);
  let byId = $derived(new Map(index.zones.map((z) => [z.id, z])));

  /** Each caption row moved down as far as the spacing rules need, and its areas with it. */
  let laid = $derived.by(() => {
    const o = overview;
    if (!o) return null;
    const rows = [...new Set((o.captions ?? []).map((c) => c.y))].sort((a, b) => a - b);
    const rowOf = (y: number) => rows.reduce((r, cy, i) => (cy <= y ? i : r), 0);
    const dys: number[] = [];
    const captionBase: number[] = [];
    let carried = 0;
    let prevBottom = Number.NEGATIVE_INFINITY;
    rows.forEach((cy, r) => {
      const areas = o.areas.filter((a) => rowOf(a.y) === r);
      const top = Math.min(...areas.map((a) => a.y));
      const bottom = Math.max(...areas.map((a) => a.y + a.height));
      const base = Math.max(cy + carried, prevBottom + BELOW + ASCENT);
      const dy = Math.max(carried, base + DESCENT + CLEAR + OUTSET - top);
      dys[r] = dy;
      captionBase[r] = base;
      carried = dy;
      if (areas.length) prevBottom = bottom + dy;
    });
    const areas = o.areas.map((a) => ({ ...a, y: a.y + (dys[rowOf(a.y)] ?? 0), orig: a }));
    const captions = (o.captions ?? []).map((c) => ({ ...c, y: captionBase[rows.indexOf(c.y)] ?? c.y }));
    const height = Math.max(o.height, ...areas.map((a) => a.y + a.height)) + PAD;
    // The outline: the zone's area (its region) 6 px outside its panels.
    const inRegion = region
      ? areas.filter((a) => {
          const cx = a.orig.x + a.orig.width / 2;
          const cy = a.orig.y + a.orig.height / 2;
          return cx >= region.x && cx <= region.x + region.width && cy >= region.y && cy <= region.y + region.height;
        })
      : [];
    const outline = inRegion.length
      ? {
          x: Math.min(...inRegion.map((a) => a.x)) - OUTSET,
          y: Math.min(...inRegion.map((a) => a.y)) - OUTSET,
          right: Math.max(...inRegion.map((a) => a.x + a.width)) + OUTSET,
          bottom: Math.max(...inRegion.map((a) => a.y + a.height)) + OUTSET,
        }
      : null;
    return { areas, captions, height, outline };
  });
  /** A marked box's label, if it fits with 6 px either side. */
  const markOf = (a: { zone: string; label?: string | null; width: number }) => {
    const text = a.label ?? byId.get(a.zone)?.short_title ?? "";
    return text && em(text) * CAP + 2 * 6 <= a.width ? text : null;
  };
</script>

{#if overview && laid}
  <div class="card">
  <svg class="deck" style:max-width="{overview.width}px" viewBox="0 0 {overview.width} {laid.height}" role="img" aria-label="The whole flight deck, {zone.title} marked">
    {#if laid.outline}
      <rect class="region" x={laid.outline.x} y={laid.outline.y} width={laid.outline.right - laid.outline.x} height={laid.outline.bottom - laid.outline.y} rx="6" />
    {/if}
    {#each laid.areas as area (area.zone + area.x + area.orig.y)}
      <rect class="area" class:on={area.zone === zone.id} x={area.x} y={area.y} width={area.width} height={area.height} rx="2" />
    {/each}
    {#each laid.captions as caption (caption.text)}
      <text class="cap" x={caption.x} y={caption.y}>{caption.text}</text>
    {/each}
    {#each laid.areas.filter((a) => a.zone === zone.id) as area (area.x + area.orig.y)}
      {@const text = markOf(area)}
      {#if text}<text class="mark" x={area.x + area.width / 2} y={area.y + area.height / 2}>{text}</text>{/if}
    {/each}
  </svg>
  </div>
{/if}

<style>
  /* The map's card (PanelTiles board): the panel background, framed, the map one unit to a pixel. */
  .card {
    padding: var(--space-4) var(--space-4) var(--space-3);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-panel);
    background: var(--panel-bg);
  }
  .deck {
    display: block;
    width: 100%;
    margin: 0 auto;
  }
  .area {
    fill: var(--panel-fill);
    stroke: var(--panel-stroke);
  }
  .area.on {
    fill: var(--panel-changed);
    stroke: var(--panel-changed);
  }
  .region {
    fill: none;
    stroke: var(--panel-changed);
    stroke-width: 2.5;
    stroke-dasharray: 6 4;
  }
  text {
    font-family: var(--font-sans);
    font-weight: var(--weight-bold);
  }
  .cap {
    font-size: 11.5px;
    fill: var(--panel-label);
  }
  .mark {
    font-size: 11.5px;
    fill: var(--color-on-accent);
    text-anchor: middle;
    dominant-baseline: central;
  }
</style>
