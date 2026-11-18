<svelte:options namespace="svg" />

<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

One panel section inside a panel drawing (PanelSchematic): its frame and title and our own control
glyphs, drawn from scratch and never traced from a real panel, at the pack's own positions, in the
panel palette (decision 0021). Each control is in one state:
- changed: the step sets it; blue fill and outline, the knob or pointer at the target, whose
  position label is the one in bold (no board draws a "SET TO" caption);
- resolved: changed, with the position from a decision step's answer, its label marked ◆
  (decision 0022);
- conditional: the step sets it only if a condition applies that the app does not know yet;
  a dashed blue outline and no position;
- resting: a control the step does not use, a neutral outline at its resting position;
- lit or unlit: a light the step expects on takes its real color; every other light is an outline
  and its legend, with no fill.
What the step asks for, never the simulator's state (decision 0006).
-->
<script lang="ts">
  import type { ItemTarget, PanelItem, PanelSection } from "@involo/bindings";
  import { angleOf, BUTTON, COVER_RAISE, DIAL, grow, half, halfWidth, KEYPAD, keypadKeys, LEGEND_KEY, legendSlots, type Outline, outline, PUSH_PULL, RING_PAD, ROCKER, withinAcross, knobY, LAMP, LEGEND_MIN, TOGGLE, labelled, lampText, layoutSection, leverY, PX, positionsOf, slotY } from "./panel-layout";
  import { em } from "./text-width";

  let {
    section,
    targets,
    guardClosed,
    band,
    frame,
    titled = true,
    tileRx = null,
    framed = true,
    textless = false,
    halo = false,
    k,
    hit = 0,
    onPick,
    selected,
    ringed = null,
    layer = "all",
  }: {
    section: PanelSection;
    targets: ItemTarget[];
    guardClosed: boolean;
    /** The part to draw, in section units: rows and, for a wide section, a span across. */
    band: { y0: number; y1: number; x0: number; x1: number };
    /** The outline drawn around the controls, fitted to them; by default the band and labels. */
    frame?: { y0: number; y1: number; x0: number; x1: number } | undefined;
    /** The section's title is drawn; a later part of a divided section continues without it. */
    titled?: boolean;
    /** One tile among several (PanelTiles board): the panel's fill, a thin frame, and this radius
     * (8 px on screen, in drawing units). */
    tileRx?: number | null;
    /** Its outline is drawn; the side pane's card is the outline of a drawing of one section, as
     * on the boards, so a cut frame never shows as stray lines across it. */
    framed?: boolean;
    /** The label-free panel preview (round 6): the same geometry, glyphs and states, no text, and
     * every light outline only. */
    textless?: boolean;
    /** A thick solid blue halo around the step's controls, the same width on screen at any scale
     * (the preview, so they read at small sizes). */
    halo?: boolean;
    /** Screen pixels per drawing unit, for the fixed text sizes. */
    k: number;
    /** The smallest hit area, in drawing units (44 px on screen); 0 draws none. */
    hit?: number;
    /** Tapping a control opens its detail card. */
    onPick?: ((section: string, item: number) => void) | undefined;
    /** The tapped control, ringed while its card is open (solid, never dashed). */
    selected?: number | null | undefined;
    /** A control tapped in the phone's controls list: the only one with the halo in the
     * label-free outline (R6PhoneCtl); -1 when it is in another section. */
    ringed?: number | null | undefined;
    /** What to draw: everything, or only the tap targets of the step's controls or of the rest,
     * so a drawing can put every step's control first in the tab order (PanelSchematic). */
    layer?: "all" | "drawing" | "step-hits" | "other-hits";
  } = $props();

  /** The selection ring's width, in drawing units, and the focus ring's, in screen pixels
   * (size.focus-ring). */
  const SELECTION_STROKE = 2;
  const FOCUS_PX = 1.5;
  /** Room above a cut-down section for its title, so it never overlaps the top row. */
  const TITLE = 18;
  const fs = (px: number) => `${(px / k).toFixed(2)}px`;
  /** Half the guard's width and height around a toggle's track. */
  const gw = TOGGLE.w / 2 + TOGGLE.guard;
  /** A guard is shut when the step does not touch its switch (as on the airplane) or the step
   * closes it; open while the step sets the switch. */
  const guardShut = (on: boolean) => !on || guardClosed;
  const gh = TOGGLE.h / 2 + TOGGLE.guard;
  /** Light words shrink only if they would not fit inside the light. */
  /** A screen's label: 3.0's size, smaller only if it would not fit across the screen. */
  const screenFs = (label: string, boxWidth: number) =>
    `${Math.min(PX.screen / k, (boxWidth - 6) / em(label)).toFixed(2)}px`;

  let byItem = $derived(new Map(targets.filter((t) => t.section === section.id).map((t) => [t.item, t])));
  /** A keypad's pressed keys: one target per key (format 6), each set or dashed. */
  let keysOf = $derived.by(() => {
    const keys = new Map<number, Map<number, "set" | "open">>();
    for (const t of targets) {
      if (t.section !== section.id || t.position == null) continue;
      const item = keys.get(t.item) ?? new Map();
      item.set(t.position, t.open ? "open" : "set");
      keys.set(t.item, item);
    }
    return keys;
  });
  /** A legend's words at the lamp size, smaller only to fit across the key's inset. */
  const legendFs = (text: string, scale: number) =>
    Math.max(LEGEND_MIN, Math.min(PX.lamp * scale, ((LEGEND_KEY.w - 2 * LEGEND_KEY.inset - 2) * k) / Math.max(em(text), 0.01)));
  /** Whether a legend shows lit: in the position the step sets, or, for a legend the airplane
   * lights, when the step expects the button's light on. Never the simulator's state. */
  const legendLit = (litIn: string[] | undefined, positions: string[], t: number | null, on: boolean, expected: boolean) =>
    on && ((t != null && (litIn ?? []).includes(positions[t] ?? "")) || (expected && !(litIn ?? []).length));
  /** A section's own outline, drawn in place of its rectangle when it is drawn whole. */
  let shaped = $derived(
    (section.outline?.length ?? 0) >= 3 && !frame && band.y0 <= 0 && band.y1 >= section.height && band.x0 <= 0 && band.x1 >= section.width,
  );
  let outlinePath = $derived(shaped ? `M ${(section.outline ?? []).map(([x, y]) => `${x} ${y}`).join(" L ")} Z` : "");
  let outlineMid = $derived.by(() => {
    const xs = (section.outline ?? []).map(([x]) => x);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  });
  const drawing = $derived(layer === "all" || layer === "drawing");
  const hitsFor = (on: boolean) => layer === "all" || (on ? layer === "step-hits" : layer === "other-hits");


  let top = $derived(frame ? frame.y0 : band.y0 === 0 ? 0 : band.y0 - TITLE);
  const shownItems = () =>
    section.items
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item }) =>
          item.y >= band.y0 + 10 && item.y <= band.y1 - 10 && withinAcross(item, band),
      );
  let shown = $derived(shownItems());
  /** Every label placed clear of the controls and of each other (panel-layout.ts). */
  let layout = $derived(
    layoutSection(
      section,
      shown.map((s) => s.i),
      (i) => {
        const item = section.items[i] as PanelItem;
        const on = byItem.has(i);
        return {
          on,
          t: byItem.get(i)?.position ?? null,
          rest: !on && item.rest ? positionsOf(item).indexOf(item.rest) : -1,
          lit: byItem.get(i)?.lit ?? false,
          open: byItem.get(i)?.open ?? false,
          resolved: byItem.get(i)?.resolved ?? false,
        };
      },
      k,
      top,
      // Labels may reach past a crop's edge; the frame fits them, so check them against the section.
      { x0: 0, x1: section.width },
    ),
  );
  /** The frame reaches past the lowest label, so no text crosses its edge. */
  let frameBottom = $derived(frame ? frame.y1 : Math.max(band.y1, layout.bottom));
  let left = $derived(frame?.x0 ?? band.x0);
  let right = $derived(frame?.x1 ?? band.x1);
</script>

{#snippet ring(o: Outline, cls: string)}
  {#if o.kind === "circle"}
    <circle class={cls} r={o.r} />
  {:else}
    <rect class={cls} x={o.x} y={o.y} width={o.w} height={o.h} rx={o.rx} />
  {/if}
{/snippet}

{#snippet tapTarget(item: PanelItem, i: number, on: boolean, own: Outline)}
      {@const hw = Math.max(halfWidth(item), hit / 2)}
      {@const hh = Math.max(half(item), hit / 2)}
      <!-- A tap target of 44 px or more around the control (rules.md §3). Every control is in
           the tab order, named; a drawing puts the step's controls first (PanelSchematic). -->
      <rect
        class="hit"
        x={-hw}
        y={-hh}
        width={2 * hw}
        height={2 * hh}
        role="button"
        tabindex="0"
        aria-label="{item.label}{on ? ', in this step' : ''}: what it is"
        onclick={() => onPick?.(section.id, i)}
        onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick?.(section.id, i))}
      />
      <!-- The keyboard focus ring: the selection ring's shape, 2 px outside it (shown by CSS while
           the tap target has keyboard focus). The tap target itself draws nothing. -->
      {@render ring(grow(own, RING_PAD + (SELECTION_STROKE / 2) + (2 + FOCUS_PX / 2) / k), "focusring")}
{/snippet}

<g class:textless transform="translate({section.x} {section.y})">
  {#if drawing}
    {#if shaped}
      <!-- A section with its own outline (format 6): its title centered at the top, as the board's
           angled glareshield. -->
      <path class="frame" class:bare={!framed} d={outlinePath} />
      {#if titled}<text class="title centered" x={outlineMid} y={top + 13} style:font-size={fs(PX.title * layout.scale)}>{section.title.toUpperCase()}</text>{/if}
    {:else}
      <rect class="frame" class:bare={!framed} class:tile={tileRx != null} x={left} y={top} width={right - left} height={frameBottom - top} rx={tileRx ?? 3} />
      {#if titled}<text class="title" x={left + 8} y={top + 13} style:font-size={fs(PX.title * layout.scale)}>{section.title.toUpperCase()}</text>{/if}
    {/if}
  {/if}
  {#each shown as { item, i } (i)}
    {@const on = byItem.has(i)}
    {@const positions = positionsOf(item)}
    {@const t = byItem.get(i)?.position ?? null}
    <!-- A control the step does not use rests where the pack says, drawn dimmed. -->
    <!-- A step's control whose position the step leaves to a condition shows no position at all
         (its caption says to see the step): drawn at rest, it read as set to that position. -->
    {@const open = on && (byItem.get(i)?.open ?? false)}
    {@const r = (!on || (t == null && !open)) && item.rest ? positions.indexOf(item.rest) : -1}
    <!-- The control's own outline, which the selection and focus rings follow. -->
    {@const own = outline(item, { guardOpen: item.kind === "toggle_switch" && !!item.guarded && !guardShut(on), at: on && t != null ? t : r })}
    {#if drawing}
    <g class="item {item.kind}" class:on class:resolved={on && (byItem.get(i)?.resolved ?? false)} class:conditional={open} transform="translate({item.x} {item.y})">
      {#if ringed != null ? ringed === i : halo && on}
        {@const hw = item.kind === "light" ? LAMP.w / 2 : halfWidth(item)}
        {@const hh = item.kind === "light" ? LAMP.h / 2 : half(item)}
        <rect class="halo" x={-hw - 6} y={-hh - 6} width={2 * hw + 12} height={2 * hh + 12} rx="6" />
      {/if}

      {#if item.kind === "toggle_switch"}
        {#if item.guarded && !guardShut(on)}
          <!-- An open guard: its cover raised on the hinge at the top, clear of the switch. -->
          <path class="cover raised" class:step={on} d="M {-gw} {-gh} L {gw} {-gh} L {gw + 1.5} {-gh - COVER_RAISE} L {-gw - 1.5} {-gh - COVER_RAISE} Z" />
          <line class="hinge" class:step={on} x1={-gw} x2={gw} y1={-gh} y2={-gh} />
        {/if}
        <rect class="body track" class:changed={on && !open} class:conditional={open} x={-TOGGLE.w / 2} y={-TOGGLE.h / 2} width={TOGGLE.w} height={TOGGLE.h} rx={TOGGLE.w / 2} />
        {#if on && t != null}
          <circle class="knob set" cy={knobY(t, positions.length)} r={TOGGLE.knob + 0.3} />
        {:else if r >= 0}
          <circle class="knob rest" cy={knobY(r, positions.length)} r={TOGGLE.knob} />
        {/if}
        {#if item.guarded && guardShut(on)}
          <!-- A closed guard: its cover down over the switch, hinged at the top. -->
          <rect class="cover shut" class:step={on} x={-gw} y={-gh} width={2 * gw} height={2 * gh} rx="2" />
          <line class="hinge" class:step={on} x1={-gw} x2={gw} y1={-gh} y2={-gh} />
        {/if}
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "selector"}
        <!-- A rotary selector: a tick for each labelled position, a round body and a pointer bar
             across the knob, turned to the target (or resting) position. -->
        {#each layout.items.get(i)?.positions.map((l) => l.n) ?? [] as n (n)}
          <line class="tick" class:target={on && n === t} x1="0" y1={-DIAL - 1.5} x2="0" y2={-DIAL - 5} transform="rotate({angleOf(item, n)})" />
        {/each}
        <circle class="body" class:changed={on && !open} class:conditional={open} r={DIAL} />
        {#if on && t != null}
          <rect class="bar set" x="-1.6" y={-DIAL + 1.5} width="3.2" height={2 * DIAL - 3} rx="1.6" transform="rotate({angleOf(item, t)})" />
          <circle class="tip set" cy={-DIAL + 3.2} r="1.3" transform="rotate({angleOf(item, t)})" />
        {:else if r >= 0}
          <rect class="bar rest" x="-1.6" y={-DIAL + 2.5} width="3.2" height={2 * DIAL - 5} rx="1.6" transform="rotate({angleOf(item, r)})" />
          <!-- The pointing end, so a resting knob reads one way (SYS DSPL L or R). -->
          <circle class="tip rest" cy={-DIAL + 3.4} r="2.1" transform="rotate({angleOf(item, r)})" />
        {/if}
        <!-- Each label sits at its own tick, so the pointer and its label always agree. -->
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "push_button"}
        <!-- As 3.0 draws a push button: a key with its name inside and a line along its bottom. -->
        {@const words = lampText(item, k, PX.lamp * layout.scale, BUTTON.w)}
        {#if item.guarded}
          <rect class="guard" x={-BUTTON.w / 2 - 2} y={-BUTTON.h / 2 - 2} width={BUTTON.w + 4} height={BUTTON.h + 4} rx="4" />
        {/if}
        <rect class="body key" class:changed={on && !open} class:conditional={open} x={-BUTTON.w / 2} y={-BUTTON.h / 2} width={BUTTON.w} height={BUTTON.h} rx="3" />
        <line class="key-line" class:changed-line={on && !open} class:conditional-line={open} x1={-BUTTON.w / 2 + 2} x2={BUTTON.w / 2 - 2} y1={BUTTON.h / 2 - 1.3} y2={BUTTON.h / 2 - 1.3} />
        {#each words.lines as line, n (n)}
          <text
            class="lamp-text"
            y={(n - (words.lines.length - 1) / 2) * ((words.px * 1.12) / k) + (words.px * 0.35) / k - 0.6}
            style:font-size={fs(words.px)}>{line}</text
          >
        {/each}
      {:else if item.kind === "light"}
        <!-- Every light the same size, its words wrapped inside, as in 3.0. A light the step
             expects on is filled in its color and says so; it is never the simulator's state. -->
        {@const words = lampText(item, k, PX.lamp * layout.scale)}
        {@const lit = byItem.get(i)?.lit ?? false}
        <rect class="lamp {item.color ?? ''}" class:lit={lit && !textless} class:focus={on && (!lit || textless)} x={-LAMP.w / 2} y={-LAMP.h / 2} width={LAMP.w} height={LAMP.h} rx="2.6" />
        {#each words.lines as line, n (n)}
          <text
            class="lamp-text {item.color ?? ''}"
            class:lit
            y={(n - (words.lines.length - 1) / 2) * ((words.px * 1.12) / k) + (words.px * 0.35) / k}
            style:font-size={fs(words.px)}>{line}</text
          >
        {/each}
        {#if lit}
          <text class="set-to lamp-on {item.color ?? ''}" y={LAMP.h / 2 + (PX.setTo * layout.scale * 1.1) / k} style:font-size={fs(PX.setTo * layout.scale)}>EXPECTED ON</text>
        {/if}
      {:else if item.kind === "lever"}
        <!-- A slot and the lever's knob at the target or resting position. -->
        <rect class="body slot" class:changed={on && !open} class:conditional={open} x="-3" y="-16" width="6" height="32" rx="3" />
        {#if on && t != null}
          <rect class="knob set" x="-8" y={slotY(t, positions.length) - 3} width="16" height="6" rx="2" />
        {:else if r >= 0}
          <rect class="knob rest" x="-8" y={slotY(r, positions.length) - 3} width="16" height="6" rx="2" />
        {/if}
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "handle"}
        <!-- A T-shaped pull handle on a short stem. -->
        <!-- The grip sits at the target (or resting) position, beside its label: in at the top,
             pulled out at the bottom. -->
        {@const at = on && t != null ? t : r >= 0 ? r : -1}
        {@const gy = at >= 0 ? leverY(at, positions.length) : 0}
        <rect class="body stem" class:changed={on && !open} class:conditional={open} x="-2" y="-12" width="4" height={gy + 8} rx="1" />
        <rect class="body grip" class:changed={on && !open} class:conditional={open} x="-13" y={gy - 5} width="26" height="10" rx="4" />
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "push_pull_knob"}
        <!-- A push/pull knob (format 6): pushed in, a dot in its center; pulled out, a second ring
             as the knob stands proud. -->
        {@const at = on && t != null ? t : r}
        {#if at === 1}
          <circle class="pull-ring" class:set-ring={on && t === 1} r={PUSH_PULL.ring} />
        {/if}
        <circle class="body" class:changed={on && !open} class:conditional={open} r={DIAL} />
        {#if at === 0}
          <circle class={on && t === 0 ? "dot set" : "dot rest"} r={on && t === 0 ? PUSH_PULL.dotSet : PUSH_PULL.dot} />
        {/if}
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "legend_pushbutton"}
        <!-- A pushbutton with legends (format 6): a key split across its middle, a lit legend a
             filled inset in its light's color. -->
        {@const expected = byItem.get(i)?.lit ?? false}
        {@const inner = LEGEND_KEY.w - 2 * LEGEND_KEY.inset}
        <!-- A step that only expects a legend lit leaves the key resting, as a light stays
             unoutlined when lit. -->
        {@const keySet = on && !open && !(t == null && expected)}
        <rect class="body key" class:changed={keySet} class:conditional={open} x={-LEGEND_KEY.w / 2} y={-LEGEND_KEY.h / 2} width={LEGEND_KEY.w} height={LEGEND_KEY.h} rx={LEGEND_KEY.rx} />
        <line class="split" class:step={keySet || open} x1={-inner / 2} x2={inner / 2} y1="0" y2="0" />
        {#each legendSlots(item) as { legend, top }, n (n)}
          {@const glow = !open && !textless && legendLit(legend.litIn, positions, t, on, expected)}
          {@const px = legendFs(legend.text, layout.scale)}
          {@const mid = top ? -LEGEND_KEY.h / 4 : LEGEND_KEY.h / 4}
          {#if glow}
            <rect class="legend-lit {legend.light}" x={-inner / 2} y={mid - LEGEND_KEY.lit / 2} width={inner} height={LEGEND_KEY.lit} rx="1.5" />
          {/if}
          <text class="legend {legend.light}" class:lit={glow} y={mid + (px * 0.35) / k} style:font-size={fs(px)}>{legend.text}</text>
        {/each}
        {#each layout.items.get(i)?.caption ?? [] as c (c.text)}
          <text class="set-to" class:caption-target={c.target} y={c.y} style:font-size={fs(PX.setTo * layout.scale)}>{c.text}</text>
        {/each}
      {:else if item.kind === "rocker"}
        <!-- A rocker (format 6): a body that tips about the line across its middle; the pressed
             end an inset half, filled as the step's target. -->
        {@const at = on && t != null ? t : r}
        <rect class="body rocker" class:changed={on && !open} class:conditional={open} x={-ROCKER.w / 2} y={-ROCKER.h / 2} width={ROCKER.w} height={ROCKER.h} rx={ROCKER.rx} />
        <line class="pivot" class:step={on} x1={-ROCKER.w / 2} x2={ROCKER.w / 2} y1="0" y2="0" />
        {#if at === 0 || at === 1}
          <rect class={on && t === at ? "end set" : "end rest"} x={-ROCKER.endW / 2} y={at === 0 ? -ROCKER.h / 2 + 2 : 1} width={ROCKER.endW} height={ROCKER.endH} rx="1.5" />
        {/if}
        {#each layout.items.get(i)?.positions ?? [] as l (l.n)}
          <text class="pos" class:target={on && l.n === t} class:at-rest={l.n === r} x={l.x} y={l.y} text-anchor={l.anchor} style:font-size={fs(PX.pos * layout.scale)}>{on && l.n === t && byItem.get(i)?.resolved ? "◆ " : ""}{positions[l.n]}</text>
        {/each}
      {:else if item.kind === "keypad"}
        <!-- A keypad (format 6): the keys the step presses in its state, the rest resting. -->
        {@const pressed = keysOf.get(i)}
        {#each keypadKeys(item) as key, n (n)}
          {@const state = pressed?.get(n)}
          {@const px = Math.max(LEGEND_MIN, Math.min(PX.lamp * layout.scale, ((KEYPAD.w - 3) * k) / Math.max(em(positions[n] ?? ""), 0.01)))}
          <rect class="keycap" class:changed={state === "set"} class:conditional={state === "open"} x={key.x - KEYPAD.w / 2} y={key.y - KEYPAD.h / 2} width={KEYPAD.w} height={KEYPAD.h} rx={KEYPAD.rx} />
          <text class="keycap-text" class:pressed={state === "set"} class:pending={state === "open"} x={key.x} y={key.y + (px * 0.35) / k} style:font-size={fs(px)}>{positions[n]}</text>
        {/each}
      {:else if item.kind === "gauge"}
        <circle class="body" class:changed={on} r="14" />
        <path class="scale" d="M -9 6 A 11 11 0 1 1 9 6" />
      {:else}
        {@const w = item.width ?? 60}
        {@const hh = item.height ?? 30}
        <!-- A screen: a bezel and its display area, outlined; the step's screen has a blue bezel. -->
        <rect class="body screen" class:changed={on} x={-w / 2} y={-hh / 2} width={w} height={hh} rx="3" />
        <rect class="display" x={-w / 2 + 4} y={-hh / 2 + 4} width={Math.max(0, w - 8)} height={Math.max(0, hh - 8)} rx="1.5" />
        <text class="lamp-text" y="2" style:font-size={screenFs(item.label, w)}>{item.label}</text>
      {/if}
      {#if labelled(item)}
        {@const name = layout.items.get(i)?.name}
        {#if name}
          {#each name.lines as line, n (n)}
            <text class="label" y={name.y + (n * name.px * 1.15) / k} style:font-size={fs(name.px)}>{line}</text>
          {/each}
        {/if}
      {/if}
      {#if selected === i}
        <!-- The one selection ring, following the control's own outline (after round 6). -->
        {@render ring(grow(own, RING_PAD), "selection")}
      {/if}
      {#if layer === "all" && hit > 0 && onPick}{@render tapTarget(item, i, on, own)}{/if}
    </g>
    {:else if hitsFor(on) && hit > 0 && onPick}
      <!-- Only the tap target, in a layer of its own so the drawing can order the tab stops. -->
      <g class="hit-item" transform="translate({item.x} {item.y})">{@render tapTarget(item, i, on, own)}</g>
    {/if}
  {/each}
</g>

<style>
  /* Panel palette only (decision 0021): outlines, switch bodies and lens rims at 3:1 or better
     against the panel, labels at 4.5:1, in both themes. */
  /* Sections sit on the panel background, as on the boards, so the blue of a changed control
     stands out against it (design review F2). */
  /* The tapped control's selection ring (round 6, R6Control): solid. */
  .selection {
    fill: none;
    pointer-events: none;
    stroke: var(--panel-changed);
    stroke-width: 2;
  }
  .halo {
    fill: none;
    stroke: var(--panel-changed);
    stroke-width: calc(1.5 * var(--border-thick));
    vector-effect: non-scaling-stroke;
  }
  /* The preview draws no text at all, and its outlines keep their width on screen at any scale,
     so they read as the full panel's do (3:1 or better). */
  .textless text {
    display: none;
  }
  .textless :global(*) {
    vector-effect: non-scaling-stroke;
  }
  /* A 1 px outline between two screen pixels would be drawn half as dark (under 3:1), so the
     preview's rectangles snap to whole pixels. */
  .textless :global(rect) {
    shape-rendering: crispEdges;
  }
  /* A round outline cannot snap to pixels; half a pixel more keeps its diagonals at 3:1. */
  .textless :global(circle.body) {
    stroke-width: 1.5;
  }
  .frame {
    fill: var(--panel-bg);
    stroke: var(--panel-stroke);
    stroke-width: 1;
  }
  .frame.tile {
    fill: var(--panel-fill);
    stroke: var(--panel-frame);
    vector-effect: non-scaling-stroke;
  }
  .frame.bare {
    stroke: none;
  }
  .title {
    font-weight: var(--weight-semibold);
    fill: var(--panel-label);
  }
  text {
    font-family: var(--font-sans);
    fill: var(--panel-text);
  }
  .label {
    font-weight: var(--weight-semibold);
    text-anchor: middle;
  }
  .pos {
    fill: var(--panel-label);
  }
  /* The target position reads first by weight; color stays on the drawing (rules.md §4). */
  .pos.target {
    font-weight: var(--weight-bold);
    fill: var(--panel-text);
  }
  .set-to {
    font-weight: var(--weight-semibold);
    text-anchor: middle;
    fill: var(--panel-text);
  }
  /* Resting: a control the step does not use, a neutral outline. */
  .body,
  .tick,
  .scale {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 1.4;
  }
  .track {
    stroke-width: 1.2;
  }
  .key {
    fill: var(--panel-fill);
  }
  /* The key's bottom line takes its key's state, so no grey line crosses a blue or dashed key. */
  .key-line.changed-line {
    stroke: var(--panel-changed);
  }
  .key-line.conditional-line {
    stroke: var(--panel-changed);
    stroke-dasharray: 2 1.5;
  }
  .key-line {
    stroke: var(--panel-resting);
    stroke-width: 0.8;
  }
  .knob.rest,
  .bar.rest {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 1.3;
  }
  /* A guard's cover: down over the switch when shut, raised clear of it on its hinge when open;
     the step's guard in blue. */
  .cover {
    fill: var(--panel-fill);
    stroke: var(--panel-resting);
    stroke-width: 1.1;
  }
  .cover.shut {
    fill-opacity: 0.82;
  }
  .cover.step {
    fill: var(--panel-changed-fill);
    stroke: var(--panel-changed);
    stroke-width: 1.6;
  }
  .hinge {
    stroke: var(--panel-resting);
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  .hinge.step {
    stroke: var(--panel-changed);
  }
  .guard {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 1.1;
  }
  .screen {
    fill: var(--panel-fill);
    stroke: var(--panel-stroke);
  }
  .display {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 0.8;
  }
  /* Changed (and resolved): blue fill and outline, the knob or pointer at the target. */
  .body.changed,
  .on .tick.target {
    fill: var(--panel-changed-fill);
    stroke: var(--panel-changed);
    stroke-width: 2;
  }
  .on .tick.target {
    fill: none;
  }
  /* A screen the step uses keeps its neutral face, its bezel outlined in blue: a screen-sized blue
     fill read as one large blue box. */
  .screen.changed {
    fill: var(--panel-fill);
  }
  .set,
  .bar.set {
    fill: var(--panel-changed);
    stroke: none;
  }
  .tip.set {
    fill: var(--panel-changed-fill);
  }
  .tip.rest {
    fill: var(--panel-text);
  }

  .on .lamp-text {
    fill: var(--panel-changed-text);
  }
  /* Conditional: a dashed blue outline and no position, until the condition is known. */
  .body.conditional {
    fill: none;
    stroke: var(--panel-changed);
    stroke-width: 1.6;
    stroke-dasharray: 3 2;
  }
  /* Lights: unlit is an outline and its legend, no fill; lit takes its real color. */
  .lamp {
    fill: none;
    stroke: var(--panel-stroke);
    stroke-width: 1.2;
  }
  .lamp.focus {
    stroke: var(--panel-changed);
    stroke-width: 2;
  }
  .lamp-text {
    font-weight: var(--weight-semibold);
    text-anchor: middle;
    fill: var(--panel-label);
  }
  .lamp.lit {
    stroke: none;
  }
  .lamp.lit.amber {
    fill: var(--color-lit-amber);
  }
  .lamp.lit.red {
    fill: var(--color-danger);
  }
  .lamp.lit.green {
    fill: var(--color-done);
  }
  .lamp.lit.blue {
    fill: var(--color-accent);
  }
  /* White has no lit color: a lit white light or legend is the panel's text color, its words the
     panel's background (New panel controls board). */
  .lamp.lit.white {
    fill: var(--panel-text);
  }
  .lamp-text.lit.white {
    fill: var(--panel-bg);
  }
  .lamp-text.lit.amber {
    fill: var(--color-on-lit-amber);
  }
  .lamp-text.lit.red {
    fill: var(--color-on-accent);
  }
  .lamp-text.lit.green {
    fill: var(--color-on-done);
  }
  .lamp-text.lit.blue {
    fill: var(--color-on-accent);
  }
  .hit {
    fill: transparent;
    cursor: pointer;
  }
  .hit:focus-visible {
    outline: none;
  }
  /* The keyboard focus ring follows the selection ring's shape, 2 px outside it. */
  .focusring {
    display: none;
    fill: none;
    stroke: var(--panel-changed);
    stroke-width: var(--size-focus-ring);
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .hit:focus-visible + .focusring {
    display: inline;
  }
  .lamp-on {
    fill: var(--panel-text);
  }
  .title.centered {
    text-anchor: middle;
  }
  /* Format 6 controls (New panel controls board), in the three states of every control. */
  .pull-ring {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 1.4;
  }
  .pull-ring.set-ring {
    stroke: var(--panel-changed);
  }
  .dot.rest {
    fill: var(--panel-text);
  }
  .split,
  .pivot {
    stroke: var(--panel-resting);
  }
  .split {
    stroke-width: 0.8;
  }
  .pivot {
    stroke-width: 1;
  }
  .split.step,
  .pivot.step {
    stroke: var(--panel-changed);
  }
  .legend {
    font-weight: var(--weight-semibold);
    text-anchor: middle;
    fill: var(--panel-label);
  }
  .legend.lit {
    font-weight: var(--weight-bold);
  }
  .legend-lit.amber {
    fill: var(--color-lit-amber);
  }
  .legend-lit.red {
    fill: var(--color-danger);
  }
  .legend-lit.green {
    fill: var(--color-done);
  }
  .legend-lit.blue {
    fill: var(--color-accent);
  }
  .legend-lit.white {
    fill: var(--panel-text);
  }
  .legend.lit.amber {
    fill: var(--color-on-lit-amber);
  }
  .legend.lit.red,
  .legend.lit.blue {
    fill: var(--color-on-accent);
  }
  .legend.lit.green {
    fill: var(--color-on-done);
  }
  .legend.lit.white {
    fill: var(--panel-bg);
  }
  .caption-target {
    font-weight: var(--weight-bold);
  }
  .end.rest {
    fill: none;
    stroke: var(--panel-resting);
    stroke-width: 1.2;
  }
  .keycap {
    fill: var(--panel-fill);
    stroke: var(--panel-resting);
    stroke-width: 1;
  }
  .keycap.changed {
    fill: var(--panel-changed-fill);
    stroke: var(--panel-changed);
    stroke-width: 2;
  }
  .keycap.conditional {
    fill: none;
    stroke: var(--panel-changed);
    stroke-width: 1.6;
    stroke-dasharray: 3 2;
  }
  .keycap-text {
    font-weight: var(--weight-semibold);
    text-anchor: middle;
    fill: var(--panel-label);
  }
  .keycap-text.pressed {
    font-weight: var(--weight-bold);
    fill: var(--panel-changed-text);
  }
  .keycap-text.pending {
    font-weight: var(--weight-bold);
  }
</style>
