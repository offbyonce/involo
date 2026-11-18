<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A panel drawing for one step: the panel sections that hold the step's controls, and nothing else
(never a neighbor, even one between them). PanelTiles draws each panel as its own
tile; a tile among several is titled with its panel's name. It is as wide as its card,
keeping its proportions, unless that would draw a label under 11 px; then it is drawn at the
smallest size that keeps 11 px labels, scrolls sideways, and offers a full-width view.
-->
<script lang="ts">
  import { panelCaption, sectionName } from "./panel-name";
  import type { ItemTarget, Panel, PanelSection as Section } from "@involo/bindings";
  import { drawingScale, K, layoutSection, openingScroll, positionsOf, roomScale, tileScale } from "./panel-layout";
  import PanelSection from "./PanelSection.svelte";
  import PanelSheet from "./PanelSheet.svelte";
  import Self from "./PanelSchematic.svelte";
  import type { PackIndex } from "../pack-index";

  let {
    panel,
    focus,
    targets,
    guardClosed = false,
    large = false,
    index,
    sides = undefined,
    picked = $bindable(),
    around = false,
    named = "",
    enlargeable = $bindable(),
    fits = $bindable(),
    ownButton = true,
    room,
    ownCard = true,
    wider = $bindable(),
    scroller = $bindable(),
    tile = false,
    natural = $bindable(),
    overview = false,
    extent = $bindable(),
    shared,
  }: {
    /** The panel the sections are on. */
    panel: Panel;
    /** Ids of the sections that hold the step's controls. */
    focus: string[];
    /** The step's targets (from Rust). */
    targets: ItemTarget[];
    /** The step asks for the guard closed. */
    guardClosed?: boolean;
    /** Drawn in the full-width view, which offers no larger one. */
    large?: boolean | undefined;
    /** With the pack's index, tapping a control opens its card: what it is and what it does. */
    index?: PackIndex | undefined;
    /** Words that pair two panels in the caption; the index's side words by default. */
    sides?: string[] | undefined;
    /** The side pane's drawing (Checklist board): a section drawn alone shows the rows around the
     * step's controls, whole across; the larger view shows the whole section. */
    around?: boolean | undefined;
    /** Text naming more controls to keep in the step's rows (its Check and If not: "ALIGN light
     * on, then off"). */
    named?: string | undefined;
    /** The control whose card is open. */
    picked?: { section: string; item: number } | null | undefined;
    /** Out: whether the step's controls fit the drawing's room top to bottom at 11 px. */
    fits?: boolean | undefined;
    /** Out: whether there is a larger view to open (the drawing is cut to fit, or overflows). */
    enlargeable?: boolean | undefined;
    /** Draws its own "See the whole panel larger" button; the side pane puts it in the card's
     * caption row instead and calls `openLarger`. */
    ownButton?: boolean | undefined;
    /** The slide-out's panel: the room it has, in pixels. The whole drawing fits it both ways at
     * 11 px labels or more, at its own height (taller than the room, the slide-out's body
     * scrolls); wider than the room, it scrolls sideways (round 6, gate reviews). */
    room?: { width: number; height: number } | undefined;
    /** Shows its own control card under the drawing; the slide-out shows round 6's instead and
     * reads `picked`. */
    ownCard?: boolean | undefined;
    /** Out: the drawing is wider than its room (the slide-out shows a navigator). */
    wider?: boolean | undefined;
    /** Out: the element that scrolls the drawing, for the navigator. */
    scroller?: HTMLDivElement | null | undefined;
    /** An overview (the Flight deck page's selected panel): fitted to its width, never
     * scrolling, its labels smaller than 11 px where they must be; the panel sheet has it at full size. */
    overview?: boolean | undefined;
    /** One tile among several: the whole section, titled with its name (PanelTiles board). */
    tile?: boolean | undefined;
    /** Out: the drawing's width in pixels at its scale, for laying tiles side by side. */
    natural?: number | undefined;
    /** Out: the drawing's box in panel units, for the scale panels shown together share. */
    extent?: { w: number; h: number } | undefined;
    /** The scale every panel shown with it shares (sharedScale), in place of its own. */
    shared?: number | undefined;
  } = $props();

  let focused = $derived(panel.sections.filter((s) => focus.includes(s.id)));
  /** A section with an outline of its own (format 6). */
  const shapedSection = (s: Section) => (s.outline?.length ?? 0) >= 3;
  /** Every section of a panel with an outline of its own is drawn: its outline is drawn behind. */
  let wholePanel = $derived((panel.outline?.length ?? 0) >= 3 && panel.sections.every((s) => focus.includes(s.id)));
  /** Only the step's sections. */
  let drawn = $derived(focused);

  type Band = { y0: number; y1: number; x0: number; x1: number };
  const wholeOf = (s: Section): Band => ({ y0: 0, y1: s.height, x0: 0, x1: s.width });

  /**
   * The rows a lone section shows in the side pane: from the step's highest control, with room
   * above for its lights and labels, to its lowest, whole across. The whole section otherwise.
   */
  let band = $derived.by((): Band | null => {
    const only = drawn.length === 1 ? drawn[0] : undefined;
    // A section with its own outline is drawn whole, so its outline shows (format 6).
    if (!around || large || !only || tile || shapedSection(only)) return null;
    const words = ` ${named.toUpperCase().replace(/[^A-Z0-9/ ]+/g, " ")} `;
    const ys = only.items.flatMap((it, i) =>
      targets.some((t) => t.section === only.id && t.item === i) || (it.label && words.includes(` ${it.label.toUpperCase()} `))
        ? [it.y]
        : [],
    );
    if (!ys.length) return null;
    const y0 = Math.max(0, Math.min(...ys) - 62);
    const y1 = Math.min(only.height, Math.max(...ys) + 24);
    return y0 <= 0 && y1 >= only.height ? null : { x0: 0, x1: only.width, y0, y1 };
  });
  const bandOf = (s: Section): Band => (band && drawn.length === 1 ? band : wholeOf(s));

  /** How a section's labels lay out, title at `titleTop`. */
  function layoutFor(s: Section, titleTop: number) {
    const on = (i: number) => targets.find((t) => t.section === s.id && t.item === i);
    const b = bandOf(s);
    return layoutSection(
      s,
      s.items.flatMap((it, i) => (it.y >= b.y0 + 10 && it.y <= b.y1 - 10 ? [i] : [])),
      (i) => {
        const item = s.items[i] as (typeof s.items)[number];
        return {
          on: !!on(i),
          t: on(i)?.position ?? null,
          rest: !on(i) && item.rest ? positionsOf(item).indexOf(item.rest) : -1,
          lit: on(i)?.lit ?? false,
          resolved: on(i)?.resolved ?? false,
        };
      },
      K,
      titleTop,
    );
  }

  /**
   * The drawing's frames and box, in panel units. A section drawn alone is framed to what it
   * shows (its controls and labels), so the drawing fills the card instead of the section's empty
   * corners; the card's caption names it, so it needs no title of its own.
   */
  let view = $derived.by(() => {
    const frames = new Map<string, Band | undefined>();
    const only = drawn.length === 1 && !tile && !shapedSection(drawn[0] as Section) ? drawn[0] : undefined;
    if (only) {
      const e = layoutFor(only, -1000).extent;
      const f = { x0: e.x0 - 8, x1: e.x1 + 8, y0: e.y0 - 8, y1: e.y1 + 8 };
      frames.set(only.id, f);
      return {
        frames,
        titled: false,
        box: { x: only.x + f.x0 - 2, y: only.y + f.y0 - 2, w: f.x1 - f.x0 + 4, h: f.y1 - f.y0 + 4 },
      };
    }
    // The whole panel drawn, with its own outline: the outline is the drawing's edge.
    const outlined = wholePanel ? (panel.outline ?? []) : [];
    const x = Math.min(...drawn.map((s) => s.x), ...outlined.map(([px]) => px)) - 2;
    const y = Math.min(...drawn.map((s) => s.y), ...outlined.map(([, py]) => py)) - 2;
    const right = Math.max(...drawn.map((s) => s.x + s.width), ...outlined.map(([px]) => px)) + 2;
    const low = Math.max(
      ...drawn.map((s) => s.y + Math.max(s.height, layoutFor(s, 0).bottom)),
      ...outlined.map(([, py]) => py),
    );
    return { frames, titled: true, box: { x, y, w: right - x, h: low + 2 - y } };
  });

  let width = $state(0);
  /** The page's own scale (wide screens and Text size), so a drawing grows with the page. */
  let pageScale = $state(1);
  $effect(() => {
    if (!wrap) return;
    const read = () => {
      pageScale = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  });
  /** A tile's corner radius on screen, in pixels (PanelTiles board). */
  const TILE_RADIUS = 8;
  let wrap = $state<HTMLDivElement | null>(null);
  let height = $state(0);
  $effect(() => {
    extent = { w: view.box.w, h: view.box.h };
  });
  let scale = $derived.by(() => {
    if (shared != null) {
      // Panels shown together share one scale; wider than its room, it scrolls as before.
      const roomWidth = room?.width ?? width;
      const over = !overview && roomWidth > 0 && view.box.w * shared > roomWidth + 1;
      return room ? { k: shared, overflow: over, wider: over } : { k: shared, overflow: over };
    }
    if (overview) return { k: width > 0 ? Math.min(width / view.box.w, K * pageScale) : K * pageScale, overflow: false };
    if (!room) {
      const fit = drawingScale(width, view.box.w, pageScale);
      // A tile among several keeps its own size here too (PanelTiles board; the flow's pane).
      return tile ? { ...fit, k: tileScale(fit.k, pageScale) } : fit;
    }
    const fit = roomScale(room.width, room.height, view.box, pageScale);
    // A tile among several keeps its drawing's own size, smaller only to fit (PanelTiles board).
    const k = tile ? tileScale(fit.k, pageScale) : fit.k;
    return { k, overflow: fit.wider, wider: fit.wider };
  });
  $effect(() => {
    if (room) wider = "wider" in scale ? scale.wider : false;
  });
  $effect(() => {
    scroller = wrap;
  });
  $effect(() => {
    natural = Math.floor(view.box.w * scale.k);
  });

  /**
   * A drawing bigger than its room (wider than the card, or taller than the room the side pane
   * leaves it) opens centered on the step's controls, both ways, at every size,
   * and fades at the edges where there is more.
   */
  let moreY = $state(false);
  $effect(() => {
    if (!wrap) return;
    const el = wrap;
    void width;
    void height;
    void scale.k;
    // After the drawing has taken its new size (wide screens rescale it after the first frame).
    const frame = requestAnimationFrame(() => {
      moreY = el.scrollHeight > el.clientHeight + 1;
      openOnTargets(el);
    });
    return () => cancelAnimationFrame(frame);
  });
  function openOnTargets(el: HTMLDivElement) {
    const on = [...el.querySelectorAll("g.item.on")].map((g) => g.getBoundingClientRect());
    if (!on.length) {
      fits = true;
      return;
    }
    const box = el.getBoundingClientRect();
    const span = {
      left: Math.min(...on.map((r) => r.left)) - box.left + el.scrollLeft,
      right: Math.max(...on.map((r) => r.right)) - box.left + el.scrollLeft,
      top: Math.min(...on.map((r) => r.top)) - box.top + el.scrollTop,
      bottom: Math.max(...on.map((r) => r.bottom)) - box.top + el.scrollTop,
    };
    fits = span.bottom - span.top <= el.clientHeight + 1;
    el.scrollLeft = openingScroll(span.left, span.right, el.clientWidth);
    el.scrollTop = openingScroll(span.top, span.bottom, el.clientHeight);
  }

  let sheetEl = $state<PanelSheet | null>(null);
  $effect(() => {
    enlargeable = !large && (scale.overflow || moreY || !!band);
  });
  /**
   * Opens the larger view scrolled so the step's controls are in sight. The
   * drawing takes its full size a frame or two after the sheet opens, so it centers again whenever
   * the drawing resizes in the first half second.
   */
  export function openLarger() {
    sheetEl?.open();
  }

  /** The open control card: the item, its light meaning, and what its control does. */
  let card = $derived.by(() => {
    if (!picked || !index) return null;
    // Only the drawing that holds it shows its card: tiles of one panel share `picked`.
    const item = drawn.find((s) => s.id === picked?.section)?.items[picked.item];
    if (!item) return null;
    const meaning = item.kind === "light" ? index.lightMeaning(panel.id, picked.section, picked.item) : undefined;
    const does = (item.controls ?? []).map((c) => index?.control(c)?.function).find(Boolean);
    return { item, meaning, does };
  });

  let described = $derived(
    targets
      .map((t) => {
        const item = panel.sections.find((s) => s.id === t.section)?.items[t.item];
        const pos = t.position != null ? item?.positions?.[t.position]?.trim() : undefined;
        return item ? `${item.label}${pos ? ` set to ${pos}` : ""}` : null;
      })
      .filter(Boolean)
      .join("; "),
  );
  /** The drawing's name, and the larger view's title: the pane card's caption ("Fuel panel"). */
  let caption = $derived(panelCaption(focused.map(sectionName), sides ?? index?.sideWords ?? []));
</script>

<div
  class="wrap"
  style:height={room ? `${Math.ceil(view.box.h * scale.k)}px` : undefined}
  class:across={!!room}
  class:more={scale.overflow} class:more-y={moreY} bind:clientWidth={width} bind:clientHeight={height} bind:this={wrap}>
  <svg
    class="schematic"
    viewBox="{view.box.x} {view.box.y} {view.box.w} {view.box.h}"
    style:width="{Math.floor(view.box.w * scale.k)}px"
    role={index ? "group" : "img"}
    aria-label="{caption}, schematic.{described ? ` This step: ${described}.` : ''}"
  >
    {#if wholePanel}
      <path class="panel-outline" d="M {(panel.outline ?? []).map(([x, y]) => `${x} ${y}`).join(' L ')} Z" />
    {/if}
    {#each drawn as s (s.id)}
      <PanelSection section={s} {targets} {guardClosed} band={bandOf(s)} frame={view.frames.get(s.id)} titled={view.titled} tileRx={tile ? TILE_RADIUS / scale.k : null} framed={large || !around || view.titled} k={K} layer={index ? "drawing" : "all"} selected={picked?.section === s.id ? picked.item : null} />
    {/each}
    {#if index}
      <!-- Every control can be reached with Tab and is named: the step's controls first, then
           the rest, in the drawing's order (New panel controls board). -->
      {#each ["step-hits", "other-hits"] as const as layer (layer)}
        {#each drawn as s (s.id)}
          <PanelSection section={s} {targets} {guardClosed} band={bandOf(s)} frame={view.frames.get(s.id)} titled={false} k={K} {layer} hit={(44 * pageScale) / scale.k} onPick={(section, item) => (picked = { section, item })} />
        {/each}
      {/each}
    {/if}
  </svg>
</div>
{#if card && ownCard}
  <div class="control-card" role="region" aria-label="{card.item.label}">
    <div class="card-head">
      <b>{card.item.label}</b>
      <button type="button" class="card-close" aria-label="Close" onclick={() => (picked = null)}>×</button>
    </div>
    {#if card.item.description}<p>{card.item.description}</p>{/if}
    {#if card.meaning}<p><b>When lit</b> {card.meaning}</p>{/if}
    {#if card.does}<p><b>What it does</b> {card.does}</p>{/if}
  </div>
{/if}
{#if (scale.overflow || band) && !large}
  {#if ownButton}<button type="button" class="btn larger" onclick={openLarger}>See the whole panel larger</button>{/if}
  <PanelSheet {caption} bind:this={sheetEl}>
    <Self {panel} {focus} {targets} {guardClosed} large />
  </PanelSheet>
{/if}

<style>
  /* A panel's own outline, drawn as a section's frame is (format 6). */
  .panel-outline {
    fill: var(--panel-bg);
    stroke: var(--panel-stroke);
    stroke-width: 1;
  }
  /* The drawing centers in its room; where it is bigger, the room scrolls. */
  .wrap {
    display: flex;
    width: 100%;
    overflow: auto;
    /* No scrollbar, as on the boards: the edge fades show there is more. */
    scrollbar-width: none;
  }
  .wrap::-webkit-scrollbar {
    display: none;
  }
  /* A drawing bigger than its room fades at the edges where there is more. */
  /* The slide-out's panel scrolls sideways only; the slide-out's body scrolls it up and down. */
  .wrap.across {
    overflow-y: hidden;
  }
  .wrap.more {
    mask-image: linear-gradient(90deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent);
  }
  .wrap.more-y {
    mask-image: linear-gradient(180deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent);
  }
  .wrap.more.more-y {
    mask-image:
      linear-gradient(90deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent),
      linear-gradient(180deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent);
    mask-composite: intersect;
  }
  .schematic {
    display: block;
    flex: none;
    height: auto;
    margin: auto;
  }
  .control-card {
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-fill);
    color: var(--panel-text);
    font-size: var(--font-size-secondary);
  }
  .control-card p {
    margin: var(--space-1) 0 0;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-close {
    color: var(--panel-label);
    font-size: var(--font-size-panel-title);
  }
  .larger {
    margin-top: var(--space-2);
  }
  /* The full-width view: the whole window across, the drawing scrolling inside if needed. */
</style>
