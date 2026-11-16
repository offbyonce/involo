<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The tour (Tour boards: TourWelcome, TourStep, TourEnd, each with Phone and Light versions). Step 1,
the welcome, and step 7, "You're set", are centered cards over color.scrim. Steps 2 to 6 light up
one real element: a 2 px accent ring 8 px outside it, color.scrim over everything else, and the card
beside it (below by default, otherwise wherever fits) with an arrow pointing at it; below 900 px the
card is a bottom sheet with the element kept in view above it. On narrow screens step 3 lights the
Done / Skip for now bar, with the card just above the bar (owner). A step whose element isn't on
screen at this size is skipped. While the tour is open no key or click reaches the page, so it never
ticks, skips or changes anything in the flight.
-->
<script lang="ts">
  import { tick } from "svelte";
  import headerMark from "../icons/brand/header-mark.svg?raw";
  import { type Box, STEPS, stepText, type Target, targetOf, tour, union } from "./tour.svelte";

  let {
    stages,
    findKey,
    onSeen,
    onEnd,
  }: {
    /** The flight's first and last stage titles (step 2's words). */
    stages: [string, string];
    /** The Find keys as this computer writes them. */
    findKey: string;
    /** The welcome card was answered: it isn't shown again. */
    onSeen: () => void;
    /** The tour closed; `start` when it ended on "Start the checklist". */
    onEnd: (start: boolean) => void;
  } = $props();

  let vw = $state(typeof window === "undefined" ? 1440 : window.innerWidth);
  let vh = $state(typeof window === "undefined" ? 900 : window.innerHeight);
  /** 900 px and up: the card beside its element; below, a bottom sheet (tablet portrait too). */
  let wide = $derived(vw >= 900);
  /** Below 600 px: the phone welcome and end cards. */
  let phone = $derived(vw < 600);

  let card = $state<HTMLElement | null>(null);
  let heading = $state<HTMLElement | null>(null);
  /** The lit element's ring box, and what was found for this step. */
  let lit = $state<{ ring: Box; tabs: boolean; bar: boolean; radius: number } | null>(null);
  /** Where a card beside its element sits, and its arrow. */
  let place = $state<{ top: number; left: number; side: "top" | "bottom" | "left" | "right"; arrow: number } | null>(null);
  /** A centered card's top. */
  let centerTop = $state<number | null>(null);

  let step = $derived(tour.step ?? 1);
  let text = $derived(stepText(step, { tabs: lit?.tabs ?? true, bar: lit?.bar ?? false, stages, findKey }));
  let sheet = $derived(!wide && !lit?.bar);
  /** Whether the card is placed and can show: a lit step's card waits for its element, so a step
   * that will be skipped never shows (review). */
  let placed = $derived(step === 1 || step === STEPS ? centerTop !== null : !!lit && (sheet || !!place));
  /** The scrim's hole: the window, less the ring's box with its rounded corners. */
  let hole = $derived.by(() => {
    if (!lit || step === 1 || step === STEPS) return undefined;
    const { top: t, left: l, bottom: b, right: r } = lit.ring;
    const c = Math.min(lit.radius, (r - l) / 2, (b - t) / 2);
    const box = `M${l + c} ${t}H${r - c}A${c} ${c} 0 0 1 ${r} ${t + c}V${b - c}A${c} ${c} 0 0 1 ${r - c} ${b}H${l + c}A${c} ${c} 0 0 1 ${l} ${b - c}V${t + c}A${c} ${c} 0 0 1 ${l + c} ${t}Z`;
    return `path(evenodd, "M0 0H${vw}V${vh}H0Z${box}")`;
  });

  /** The page's scale (Text size and wide screens scale the rem-based tokens). */
  const unit = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  const same = (a: Box | undefined, b: Box) =>
    !!a && Math.round(a.top) === Math.round(b.top) && Math.round(a.left) === Math.round(b.left) && Math.round(a.bottom) === Math.round(b.bottom) && Math.round(a.right) === Math.round(b.right);

  let since = 0;
  let revealed = "";
  /** The window size a centered card was placed for. */
  let centered = "";
  function go(n: number, dir: 1 | -1): void {
    tour.step = n;
    tour.dir = dir;
    since = performance.now();
    revealed = "";
    lit = null;
    place = null;
    centerTop = null;
    void focusCard();
  }
  async function focusCard(): Promise<void> {
    await tick();
    // After the menu has closed and given focus back, so the card keeps it.
    requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
  }
  // A card can take focus only once it shows: focus moves in as soon as it does.
  $effect(() => {
    if (placed && card && heading && !card.contains(document.activeElement)) heading.focus({ preventScroll: true });
  });
  function next(): void {
    if (step === 1) {
      onSeen();
      go(2, 1);
    } else if (step < STEPS) go(step + 1, 1);
    else end(true);
  }
  function back(): void {
    if (step > 1) go(step - 1, -1);
  }
  function end(start = false): void {
    if (step === 1) onSeen();
    tour.step = null;
    onEnd(start);
  }

  /** The nearest scrolling box around an element. */
  function scroller(el: Element): Element {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement ?? document.documentElement;
  }
  /** Scrolls an element into the space between `top` and `bottom`, its top first if it is taller. */
  function reveal(el: Element, top: number, bottom: number): void {
    const r = el.getBoundingClientRect();
    let by = 0;
    if (r.bottom > bottom) by = Math.min(r.bottom - bottom, r.top - top);
    else if (r.top < top) by = r.top - top;
    if (by) scroller(el).scrollTop += by;
  }

  /** Each frame while a lit step is open: find its element at this size, ring it and place the card. */
  function measure(): void {
    vw = window.innerWidth;
    vh = window.innerHeight;
    if (tour.step === null || tour.step === 1 || tour.step === STEPS) {
      if (card && tour.step !== null && (centerTop === null || centered !== `${vw}x${vh}`)) {
        centered = `${vw}x${vh}`;
        const u = unit();
        const boardTop = (phone ? (step === 1 ? 190 : 200) : step === 1 ? 220 : 240) * u;
        const top = Math.max(16 * u, Math.min(boardTop, vh - card.offsetHeight - 16 * u));
        if (centerTop !== top) centerTop = top;
      }
      return;
    }
    const t = targetOf(tour.step);
    if (!t) {
      // Not on screen at this size: skip it, once the page has had a moment to draw it.
      if (performance.now() - since > 250) {
        const n = tour.step + tour.dir;
        go(n, tour.dir);
      }
      return;
    }
    const u = unit();
    const view = `${tour.step}:${t.selector}:${vw}x${vh}`;
    if (revealed !== view && card) {
      revealed = view;
      keepInView(t, u);
    }
    const box = union(t.els);
    if (!box) return;
    const pad = 8 * u;
    const inset = 4 * u;
    const ring = {
      top: Math.max(inset, box.top - pad),
      left: Math.max(inset, box.left - pad),
      bottom: Math.min(vh - inset, box.bottom + pad),
      right: Math.min(vw - inset, box.right + pad),
    };
    const tabs = t.selector !== '[data-tour="stage-button"]';
    if (!same(lit?.ring, ring) || lit?.tabs !== tabs || lit?.bar !== t.bar) lit = { ring, tabs, bar: t.bar, radius: 10 * u };
    if (card && (wide || t.bar)) placeCard(ring, t.bar, u);
  }

  /** The lit element in view: above the sheet on narrow screens, on screen beside the card. */
  function keepInView(t: Target, u: number): void {
    if (!card) return;
    // Below the header and the bars that stay with it (the flight strip, the phone progress row).
    let header = 0;
    for (const el of document.querySelectorAll("header.top, [data-tour='strip'], .prow")) {
      const pos = getComputedStyle(el).position;
      const r = el.getBoundingClientRect();
      if ((pos === "sticky" || pos === "fixed") && r.height > 0 && r.top < vh / 2) header = Math.max(header, r.bottom);
    }
    const top = header + 8 * u;
    if (t.bar && t.row) {
      // The row above the card that sits above the bar.
      const bar = t.els[0]?.getBoundingClientRect().top ?? vh;
      reveal(t.row, top, bar - card.offsetHeight - 40 * u);
    } else if (!wide) {
      for (const el of t.els) reveal(el, top, vh - card.offsetHeight - 16 * u);
    } else {
      for (const el of t.els) reveal(el, top, vh - 16 * u);
    }
  }

  /** Beside the ring: below it, else above, else to the right or left; 22 px from the ring's box,
   * as the board, kept 16 px inside the window; the arrow points at the element's middle. */
  function placeCard(ring: Box, bar: boolean, u: number): void {
    if (!card) return;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 22 * u;
    const edge = 16 * u;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    const cx = (ring.left + ring.right) / 2;
    const cy = (ring.top + ring.bottom) / 2;
    const left = clamp(cx - w / 2, edge, vw - w - edge);
    const arrowX = clamp(cx - left, 24 * u, w - 24 * u);
    let next: NonNullable<typeof place>;
    if (!bar && ring.bottom + gap + h <= vh - edge) next = { top: ring.bottom + gap, left, side: "top", arrow: arrowX };
    else if (bar || ring.top - gap - h >= edge) next = { top: ring.top - gap - h, left, side: "bottom", arrow: arrowX };
    else {
      const top = clamp(cy - h / 2, edge, vh - h - edge);
      const arrowY = clamp(cy - top, 24 * u, h - 24 * u);
      if (ring.right + gap + w <= vw - edge) next = { top, left: ring.right + gap, side: "left", arrow: arrowY };
      else if (ring.left - gap - w >= edge) next = { top, left: ring.left - gap - w, side: "right", arrow: arrowY };
      else next = { top: clamp(ring.bottom + gap, edge, vh - h - edge), left, side: "top", arrow: arrowX };
    }
    if (!place || Math.round(place.top) !== Math.round(next.top) || Math.round(place.left) !== Math.round(next.left) || place.side !== next.side || Math.round(place.arrow) !== Math.round(next.arrow))
      place = next;
  }

  // The page underneath is inert while the tour is open, so nothing reaches it, not even a screen
  // reader's browse mode (review).
  let root = $state<HTMLElement | null>(null);
  $effect(() => {
    const parent = root?.parentElement;
    if (!parent) return;
    const others = [...parent.children].filter((el) => el !== root && !el.hasAttribute("inert")) as HTMLElement[];
    for (const el of others) el.inert = true;
    return () => {
      for (const el of others) el.inert = false;
    };
  });

  $effect(() => {
    let id = 0;
    const frame = () => {
      measure();
      id = requestAnimationFrame(frame);
    };
    since = performance.now();
    id = requestAnimationFrame(frame);
    void focusCard();
    return () => cancelAnimationFrame(id);
  });

  /** No key reaches the page while the tour is open: Esc ends it, ← and → move, Tab stays in the
   * card, and Enter or Space press the card's own buttons. */
  function key(e: KeyboardEvent): void {
    if (tour.step === null) return;
    e.stopImmediatePropagation();
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      end();
    } else if (e.key === "ArrowRight" && plain) {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" && plain) {
      e.preventDefault();
      back();
    } else if (e.key === "Tab" && card) {
      e.preventDefault();
      const all = [...card.querySelectorAll<HTMLElement>("button")];
      const at = all.indexOf(document.activeElement as HTMLElement);
      const n = at < 0 ? (e.shiftKey ? all.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + all.length) % all.length;
      all[n]?.focus();
    } else if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
    }
  }
  /** Pressing a card button with Space or Enter: the button's own click, nothing else. */
  function keyup(e: KeyboardEvent): void {
    if (tour.step !== null) e.stopImmediatePropagation();
  }
</script>

<svelte:window onkeydowncapture={key} onkeyupcapture={keyup} />

<div class="tour" bind:this={root}>

<!-- Catches every click outside the card, so nothing under the tour can be pressed. -->
<div class="block" aria-hidden="true"></div>
<!-- color.scrim over everything; on a lit step, with a hole the shape of the ring (Firefox doesn't
     draw a box-shadow spread large enough to cover the window). -->
<div class="scrim" aria-hidden="true" style:clip-path={hole}></div>
{#if lit && step > 1 && step < STEPS}
  <div
    class="ring"
    aria-hidden="true"
    style:top="{lit.ring.top}px"
    style:left="{lit.ring.left}px"
    style:width="{lit.ring.right - lit.ring.left}px"
    style:height="{lit.ring.bottom - lit.ring.top}px"
  ></div>
{/if}

{#if step === 1}
  <div bind:this={card} class="center welcome" class:phone role="dialog" aria-modal="true" aria-label="Welcome to Involo" aria-describedby="tour-body" style:top={centerTop === null ? undefined : `${centerTop}px`} class:placed>
    <span class="mark" aria-hidden="true">{@html headerMark}</span>
    <h2 bind:this={heading} tabindex="-1">Welcome to Involo</h2>
    <p class="lead" id="tour-body">A procedures trainer for flight sim pilots. It walks you through every flow and checklist for this aircraft, from cold and dark to shutdown, and shows where each control is.</p>
    <p class="sub">The tour takes about a minute. You can take it again any time from the menu.</p>
    <div class="btns">
      <button class="primary" type="button" onclick={next}>Take the tour</button>
      <button class="secondary" type="button" onclick={() => end()}>Not now</button>
    </div>
  </div>
{:else if step === STEPS}
  <div bind:this={card} class="center end" class:phone role="dialog" aria-modal="true" aria-label="You’re set" aria-describedby="tour-body" style:top={centerTop === null ? undefined : `${centerTop}px`} class:placed>
    {@render progress()}
    <h2 bind:this={heading} tabindex="-1">You’re set</h2>
    <p class="body" id="tour-body">Everything else is in the menu:</p>
    <ul>
      <li><span class="nm">Practice</span><span class="ds">test yourself with real questions</span></li>
      <li><span class="nm">Flight deck</span><span class="ds">every panel and light</span></li>
      <li><span class="nm">Glossary</span><span class="ds">every term in the steps</span></li>
    </ul>
    <div class="btns">
      <button class="secondary" type="button" onclick={back}>Back</button>
      <span class="fill"></span>
      <button class="primary" type="button" onclick={() => end(true)}>Start the checklist</button>
    </div>
  </div>
{:else if text}
  <div
    bind:this={card}
    class="step"
    class:sheet
    class:above={lit?.bar}
    class:placed
    role="dialog"
    aria-modal="true"
    aria-label="Tour, step {step} of {STEPS}: {text.title}"
    aria-describedby="tour-body"
    style:top={!sheet && place ? `${place.top}px` : undefined}
    style:left={!sheet && place ? `${place.left}px` : undefined}
  >
    {#if !sheet && place}
      <span class="arrow {place.side}" aria-hidden="true" style:left={place.side === "top" || place.side === "bottom" ? `${place.arrow}px` : undefined} style:top={place.side === "left" || place.side === "right" ? `${place.arrow}px` : undefined}></span>
    {/if}
    {@render progress()}
    <h2 bind:this={heading} tabindex="-1">{text.title}</h2>
    <p class="body" id="tour-body">{text.body}</p>
    {#if text.keys && wide}<p class="keys">{text.keys}</p>{/if}
    <div class="btns">
      <button class="link" type="button" onclick={() => end()}>End tour</button>
      <span class="fill"></span>
      <button class="secondary" type="button" onclick={back}>Back</button>
      <button class="primary" type="button" onclick={next}>Next</button>
    </div>
  </div>
{/if}
</div>

{#snippet progress()}
  <div class="count">
    <span class="of">Step {step} of {STEPS}</span>
    <span class="dots" aria-hidden="true">
      {#each Array.from({ length: STEPS }) as _, i}<span class:on={i + 1 === step}></span>{/each}
    </span>
  </div>
{/snippet}

<style>
  .tour {
    display: contents;
  }
  .block,
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .scrim {
    background: var(--color-scrim);
  }
  .ring {
    position: fixed;
    z-index: 91;
    border-radius: var(--radius-control);
    box-shadow: 0 0 0 var(--border-thick) var(--color-accent);
    pointer-events: none;
  }
  .center,
  .step {
    position: fixed;
    z-index: 92;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-surface);
    box-shadow: var(--color-overlay-shadow);
    color: var(--color-text);
    font-family: var(--font-sans);
    /* The browser's normal line height, as the boards set it (paragraphs set their own). */
    line-height: normal;
    visibility: hidden;
  }
  .placed {
    visibility: visible;
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-weight: var(--weight-bold);
  }
  h2:focus {
    outline: none;
  }
  p {
    margin: 0;
  }
  /* The welcome and "You're set" (TourWelcome, TourEnd): 460 px, centered; 342 px on phone. */
  .center {
    left: 50%;
    width: calc(var(--size-side-pane-tablet) + var(--space-4) + var(--space-1));
    gap: var(--space-3);
    border-radius: var(--radius-sheet);
    transform: translateX(-50%);
  }
  .center.phone {
    right: var(--space-6);
    left: var(--space-6);
    width: auto;
    transform: none;
  }
  .welcome {
    align-items: flex-start;
    padding: calc(var(--space-6) + var(--space-1)) var(--space-6) calc(var(--space-4) + var(--space-1));
  }
  .mark {
    display: flex;
    font-size: calc(var(--font-size-page-title) + var(--border-thick));
  }
  .welcome h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-section-title);
  }
  .lead {
    font-size: var(--font-size-body);
    line-height: var(--leading-normal);
  }
  .sub {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .welcome .btns {
    flex-wrap: wrap;
    gap: calc(var(--space-2) + var(--border-thick));
    width: 100%;
    margin-top: calc(var(--space-1) + var(--border-thick));
  }
  .end {
    padding: var(--space-6) var(--space-6) calc(var(--space-4) + var(--border-thick));
  }
  .end h2 {
    font-size: calc(var(--font-size-section-title) - var(--border-thick));
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: calc(var(--space-2) + var(--border-thick));
    font-size: var(--font-size-value-mono);
    line-height: var(--leading-snug);
  }
  .nm {
    min-width: calc(2 * var(--size-touch-min) + var(--space-2));
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .ds {
    color: var(--color-text-secondary);
  }
  .end .btns {
    margin-top: calc(var(--space-1) + var(--border-thick));
  }
  /* A lit step's card (TourStep): 420 px beside its element; a bottom sheet below 900 px. */
  .step {
    width: calc(var(--size-drawer) + var(--size-header));
    gap: calc(var(--space-2) + var(--border-thick));
    padding: calc(var(--space-4) + var(--border-thick)) calc(var(--space-4) + var(--border-thick)) calc(var(--space-3) + var(--border-thick));
    border-radius: var(--radius-popover);
  }
  .step.above {
    max-width: calc(100vw - 2 * var(--space-4));
  }
  .step.sheet {
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    padding-bottom: calc(var(--space-6) + var(--space-1));
    border-bottom: 0;
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  }
  .step h2 {
    font-size: calc(var(--font-size-body) + var(--border-thick));
  }
  .body {
    font-size: var(--font-size-value-mono);
    line-height: var(--leading-normal);
  }
  .keys {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .count {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .of {
    color: var(--color-accent-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .dots {
    display: flex;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .dots span {
    width: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--space-1) + var(--border-thick));
    border-radius: calc(var(--border-thick) + var(--border-thin));
    background: var(--color-toggle-off);
  }
  .dots span.on {
    width: calc(var(--space-4) + var(--border-thick));
    background: var(--color-accent);
  }
  .btns {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .fill {
    flex: 1;
  }
  button {
    height: var(--size-touch-min);
    font: inherit;
    font-size: var(--font-size-value-mono);
    cursor: pointer;
  }
  .primary {
    padding: 0 calc(var(--space-4) + var(--border-thick));
    border: 0;
    border-radius: var(--radius-control);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
  .secondary {
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
  }
  .link {
    padding: 0 calc(var(--space-2) + var(--border-thick));
    border: 0;
    background: transparent;
    color: var(--color-link);
  }
  /* The arrow: a 16 px square turned 45°, half outside the card's edge, toward the element. */
  .arrow {
    position: absolute;
    width: var(--space-4);
    height: var(--space-4);
    margin-left: calc(-1 * (var(--space-2) + var(--border-thin)));
    background: var(--color-surface);
    transform: rotate(45deg);
  }
  .arrow.top {
    top: calc(-1 * (var(--space-2) + var(--border-thin)));
    border-top: var(--border-thin) solid var(--color-border);
    border-left: var(--border-thin) solid var(--color-border);
  }
  .arrow.bottom {
    bottom: calc(-1 * (var(--space-2) + var(--border-thin)));
    border-right: var(--border-thin) solid var(--color-border);
    border-bottom: var(--border-thin) solid var(--color-border);
  }
  .arrow.left,
  .arrow.right {
    margin-top: calc(-1 * (var(--space-2) + var(--border-thin)));
    margin-left: 0;
  }
  .arrow.left {
    left: calc(-1 * (var(--space-2) + var(--border-thin)));
    border-bottom: var(--border-thin) solid var(--color-border);
    border-left: var(--border-thin) solid var(--color-border);
  }
  .arrow.right {
    right: calc(-1 * (var(--space-2) + var(--border-thin)));
    border-top: var(--border-thin) solid var(--color-border);
    border-right: var(--border-thin) solid var(--color-border);
  }
</style>
