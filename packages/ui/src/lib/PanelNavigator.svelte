<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The slide-out's panel navigator (round 6, gate review): above a labeled panel bigger than
its room, the whole panel label-free with a frame marking the part in view. Tapping or dragging on
it moves the view there; arrow keys move it a step at a time. It keeps the whole layout in view
while the labeled panel stays at 11 px labels or more.
-->
<script lang="ts">
  import type { ItemTarget, Panel } from "@involo/bindings";
  import PanelPreview from "./PanelPreview.svelte";

  let {
    panel,
    focus,
    targets,
    guardClosed = false,
    scroller,
    title,
  }: {
    panel: Panel;
    focus: string[];
    targets: ItemTarget[];
    guardClosed?: boolean;
    /** The element that scrolls the labeled panel. */
    scroller: HTMLDivElement;
    /** The panel's name, for screen readers. */
    title: string;
  } = $props();

  let svg = $state<SVGSVGElement | null>(null);
  /** The labeled drawing's view box, so the navigator maps one to one. */
  let view = $state<{ x: number; y: number; w: number; h: number } | undefined>(undefined);
  /** The part in view, as fractions of the labeled drawing. */
  let marker = $state({ x0: 0, y0: 0, x1: 1, y1: 1 });

  const drawing = () => scroller.querySelector("svg");
  function read() {
    const d = drawing();
    if (!d) return;
    const b = d.viewBox.baseVal;
    if (!view || view.w !== b.width || view.h !== b.height || view.x !== b.x || view.y !== b.y) view = { x: b.x, y: b.y, w: b.width, h: b.height };
    const r = d.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    marker = {
      x0: clamp((s.left - r.left) / r.width),
      x1: clamp((s.right - r.left) / r.width),
      y0: clamp((s.top - r.top) / r.height),
      y1: clamp((s.bottom - r.top) / r.height),
    };
  }
  $effect(() => {
    const el = scroller;
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    const d = drawing();
    if (d) watch.observe(d);
    el.addEventListener("scroll", read, { passive: true });
    return () => {
      watch.disconnect();
      el.removeEventListener("scroll", read);
    };
  });

  /** Centers the labeled view on the panel point under the pointer. */
  function moveTo(clientX: number, clientY: number) {
    const d = drawing();
    const ctm = svg?.getScreenCTM();
    if (!d || !svg || !ctm || !view) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const fx = (p.x - view.x) / view.w;
    const fy = (p.y - view.y) / view.h;
    const r = d.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    scroller.scrollLeft += r.left + fx * r.width - (s.left + s.width / 2);
    scroller.scrollTop += r.top + fy * r.height - (s.top + s.height / 2);
  }
  let dragging = false;
  function down(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    moveTo(e.clientX, e.clientY);
  }
  function move(e: PointerEvent) {
    if (dragging) moveTo(e.clientX, e.clientY);
  }
  function up() {
    dragging = false;
  }
  function key(e: KeyboardEvent) {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    scroller.scrollBy({ left: step[0] * scroller.clientWidth * 0.25, top: step[1] * scroller.clientHeight * 0.25 });
  }
</script>

<div class="nav">
<div
  class="navigator"
  role="slider"
  tabindex="0"
  aria-label="Where the view is on the {title}: tap, drag or use the arrow keys to move it"
  aria-valuetext="{Math.round(marker.x0 * 100)}% across, {Math.round(marker.y0 * 100)}% down"
  aria-valuenow={Math.round(marker.x0 * 100)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onkeydown={key}
>
  <PanelPreview {panel} {focus} {targets} {guardClosed} label="The whole {title}" {view} {marker} bind:svg />
</div>
<span class="sideways">Scroll sideways for the rest of the panel →</span>
</div>

<style>
  /* The navigator's strip, drawn as the Locator board draws a wide panel's figure: the panel's
     background and frame, the whole panel, and "Scroll sideways for the rest of the panel →" beside it. */
  .nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-2) calc(var(--space-2) + var(--border-thick));
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-bg);
  }
  .sideways {
    color: var(--panel-label);
    font-size: var(--font-size-caption);
  }
  .navigator {
    flex: 0 1 auto;
    min-width: 0;
    cursor: grab;
    touch-action: none;
  }
  /* The navigator is smaller than a preview (size.navigator-max). */
  .navigator :global(.preview) {
    width: auto;
    max-width: 100%;
    height: var(--size-navigator-max);
  }
</style>
