<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The label-free panel preview (round 6, ROUND6.md): the whole panel the step uses, drawn by the same
renderer from the same pack data as the full panel, with the same glyphs and states (changed
filled blue, conditional dashed, lights outline only), simply without text, and a thick solid blue
halo around the step's controls so they read at small sizes. The whole
panel is scaled to fit a box, its card's width and at most `size.preview-max` tall (gate
review), and centered in it; it is never cropped or stretched.
-->
<script lang="ts">
  import type { ItemTarget, Panel, PanelSection as PanelSectionT } from "@involo/bindings";
  import { K } from "./panel-layout";
  import PanelSection from "./PanelSection.svelte";

  let {
    panel,
    focus,
    targets,
    guardClosed = false,
    label,
    view,
    marker,
    ringed = null,
    tiles,
    svg = $bindable(),
  }: {
    panel: Panel;
    /** Ids of the sections that hold the step's controls: the panel the preview shows. */
    focus: string[];
    targets: ItemTarget[];
    guardClosed?: boolean;
    /** What the preview shows, for screen readers ("The whole fuel panel"). */
    label: string;
    /** The view box to show, in panel units, when it must match another drawing's (the
     * navigator matches the labeled panel's); by default the sections' own box. */
    view?: { x: number; y: number; w: number; h: number } | undefined;
    /** A frame over part of the drawing, as fractions of the view box (the navigator's view). */
    marker?: { x0: number; y0: number; x1: number; y1: number } | undefined;
    /** A control tapped in the phone's controls list: it alone keeps the halo (R6PhoneCtl). */
    ringed?: { section: string; item: number } | null | undefined;
    /** The step's panels as tiles: each section on its own, side by side when that
     * draws them larger than stacked, 16 px apart, never the deck's gaps; `panel` and `focus` are
     * then ignored. */
    tiles?: PanelSectionT[] | undefined;
    /** Out: the svg element, for mapping pointer positions. */
    svg?: SVGSVGElement | null | undefined;
  } = $props();

  let sections = $derived(tiles ?? panel.sections.filter((s) => focus.includes(s.id)));
  let cardWidth = $state(0);
  let cardHeight = $state(0);
  /** Where each tile goes, in panel units: side by side or stacked, whichever draws larger in the
   * card (its width, and at most size.preview-max tall), a 16 px gap between them. */
  /** The root font size against 16 px: size.preview-max and space-4 are rem, so the math follows. */
  let page = $state(1);
  $effect(() => {
    const read = () => (page = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  });
  let packed = $derived.by(() => {
    if (!tiles || tiles.length < 2) return null;
    const W = cardWidth || 320 * page;
    const H = 240 * page;
    const ws = tiles.map((t) => t.width + 4);
    const hs = tiles.map((t) => t.height + 4);
    const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);
    const gapPx = 16 * page;
    const n = tiles.length;
    const kRow = Math.min((W - gapPx * (n - 1)) / sum(ws), H / Math.max(...hs));
    const kCol = Math.min(W / Math.max(...ws), (H - gapPx * (n - 1)) / sum(hs));
    const rowWay = kRow >= kCol;
    const k = Math.max(kRow, kCol);
    const gap = gapPx / k;
    const at: { dx: number; dy: number }[] = [];
    let cursor = 0;
    const w = rowWay ? sum(ws) + gap * (n - 1) : Math.max(...ws);
    const h = rowWay ? Math.max(...hs) : sum(hs) + gap * (n - 1);
    tiles.forEach((t, i) => {
      const tw = ws[i] ?? 0;
      const th = hs[i] ?? 0;
      // Each tile centered across the other way.
      const x = rowWay ? cursor : (w - tw) / 2;
      const y = rowWay ? (h - th) / 2 : cursor;
      at.push({ dx: x + 2 - t.x, dy: y + 2 - t.y });
      cursor += (rowWay ? tw : th) + gap;
    });
    return { at, box: { x: 0, y: 0, w, h } };
  });
  let box = $derived.by(() => {
    if (view) return view;
    if (packed) return packed.box;
    const x = Math.min(...sections.map((s) => s.x)) - 2;
    const y = Math.min(...sections.map((s) => s.y)) - 2;
    const x1 = Math.max(...sections.map((s) => s.x + s.width)) + 2;
    const y1 = Math.max(...sections.map((s) => s.y + s.height)) + 2;
    return { x, y, w: x1 - x, h: y1 - y };
  });
  /** The marker inside the strip: half its 2 px stroke in from each edge, in view box units. */
  let inset = $derived(cardWidth && cardHeight ? Math.max(box.w / cardWidth, box.h / cardHeight) : 0);
  let mark = $derived.by(() => {
    if (!marker) return null;
    const x0 = Math.max(box.x + marker.x0 * box.w, box.x + inset);
    const y0 = Math.max(box.y + marker.y0 * box.h, box.y + inset);
    const x1 = Math.min(box.x + marker.x1 * box.w, box.x + box.w - inset);
    const y1 = Math.min(box.y + marker.y1 * box.h, box.y + box.h - inset);
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  });
  const whole = (s: { width: number; height: number }) => ({ x0: 0, y0: 0, x1: s.width, y1: s.height });
</script>

{#snippet one(s: PanelSectionT)}
  <PanelSection section={s} {targets} {guardClosed} band={whole(s)} frame={whole(s)} titled={false} textless halo k={K} ringed={ringed ? (ringed.section === s.id ? ringed.item : -1) : null} />
{/snippet}

<svg class="preview" viewBox="{box.x} {box.y} {box.w} {box.h}" role="img" aria-label={label} bind:this={svg} bind:clientWidth={cardWidth} bind:clientHeight={cardHeight}>
  {#each sections as s, i (s.id)}
    {#if packed}
      <g transform="translate({packed.at[i]?.dx ?? 0} {packed.at[i]?.dy ?? 0})">{@render one(s)}</g>
    {:else}
      {@render one(s)}
    {/if}
  {/each}
  {#if mark}
    <rect class="marker" x={mark.x} y={mark.y} width={mark.width} height={mark.height} rx="3" />
  {/if}
</svg>

<style>
  /* The navigator's frame: the part of the panel the labeled view shows. */
  .marker {
    fill: var(--panel-changed-fill);
    fill-opacity: 0.25;
    stroke: var(--panel-changed);
    stroke-width: var(--border-thick);
    vector-effect: non-scaling-stroke;
  }
  .preview {
    display: block;
    overflow: hidden;
    width: 100%;
    height: auto;
    max-height: var(--size-preview-max);
  }
</style>
