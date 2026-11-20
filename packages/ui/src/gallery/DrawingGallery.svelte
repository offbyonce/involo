<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The drawing renderer's gallery (decision 0021), for review and screenshots only; unlinked and
never part of the installed app. Every control kind in every state it can be drawn in, from
invented one-control panels made here (not pack content), and the pack's side and seat views for
each region. `?theme=dark|light` picks the theme.
-->
<script lang="ts">
  import type { FlatPack, ItemTarget, Panel, PanelItem, ViewFrame } from "@involo/bindings";
  import PanelSchematic from "../lib/PanelSchematic.svelte";
  import { safely } from "../lib/safely";
  import { indexPack } from "../pack-index";
  import ViewDrawing from "../lib/ViewDrawing.svelte";
  import { applyPalette } from "../theme/tokens";

  /** The pack as the interface receives it, from the host (decision 0029, Names). */
  let { loadPack }: { loadPack: () => Promise<FlatPack> } = $props();

  const params = new URLSearchParams(location.search);
  const dark = params.get("theme") !== "light";
  applyPalette(document.documentElement, dark, 0);

  let pack = $state<FlatPack | null>(null);
  $effect(() => {
    safely(
      loadPack(),
      (p) => {
        pack = p;
      },
    );
  });

  type State = { name: string; target: Omit<ItemTarget, "section" | "item"> | null; guardClosed?: boolean };
  const set = (position: number | null, extra: Partial<ItemTarget> = {}) => ({
    position,
    lit: false,
    open: false,
    resolved: false,
    ...extra,
  });
  const RESTING: State = { name: "Resting", target: null };
  const CHANGED = (p: number | null): State => ({ name: "Changed", target: set(p) });
  const RESOLVED = (p: number): State => ({ name: "Resolved", target: set(p, { resolved: true }) });
  const CONDITIONAL: State = { name: "Conditional", target: set(null, { open: true }) };

  /** Invented one-control panels: a label, positions and a resting position where it has one. */
  const kinds: { title: string; item: Partial<PanelItem>; states: State[] }[] = [
    {
      title: "Toggle switch",
      item: { kind: "toggle_switch", label: "PUMP", positions: ["OFF", "ON"], rest: "OFF" },
      states: [RESTING, CHANGED(1), RESOLVED(0), CONDITIONAL],
    },
    {
      title: "Guarded switch",
      item: { kind: "toggle_switch", label: "STBY PWR", positions: ["BAT", "OFF", "AUTO"], rest: "AUTO", guarded: true },
      states: [RESTING, { name: "Changed, guard closed", target: set(2), guardClosed: true }, CHANGED(0)],
    },
    {
      title: "Selector",
      item: { kind: "selector", label: "MODE", positions: ["OFF", "ALIGN", "NAV", "ATT"], rest: "OFF" },
      states: [RESTING, CHANGED(2), RESOLVED(1), CONDITIONAL],
    },
    {
      title: "Push button",
      item: { kind: "push_button", label: "TEST" },
      states: [RESTING, CHANGED(null), CONDITIONAL],
    },
    {
      title: "Light",
      item: { kind: "light", label: "LOW PRESSURE", color: "amber" },
      states: [
        { name: "Unlit", target: null },
        { name: "Unlit, the step's", target: set(null) },
        { name: "Lit", target: set(null, { lit: true }) },
      ],
    },
    {
      title: "Red and green lights",
      item: { kind: "light", label: "FIRE WARN", color: "red" },
      states: [
        { name: "Unlit", target: null },
        { name: "Lit", target: set(null, { lit: true }) },
      ],
    },
    {
      title: "Lever",
      item: { kind: "lever", label: "FLAP", positions: ["UP", "1", "5", "15", "30"], rest: "UP" },
      states: [RESTING, CHANGED(2), CONDITIONAL],
    },
    {
      title: "Handle",
      item: { kind: "handle", label: "BRAKE", positions: ["RELEASED", "SET"], rest: "RELEASED" },
      states: [RESTING, CHANGED(1)],
    },
    {
      title: "White light",
      item: { kind: "light", label: "AVAIL", color: "white" },
      states: [
        { name: "Unlit", target: null },
        { name: "Lit", target: set(null, { lit: true }) },
      ],
    },
    // Format 6 (New panel controls board).
    {
      title: "Push/pull knob",
      item: { kind: "push_pull_knob", label: "ALT", positions: ["PUSH", "PULL"], rest: "PUSH" },
      states: [
        { name: "Resting: pushed in", target: null },
        { name: "Changed: PULL", target: set(1) },
        { name: "Changed: PUSH", target: set(0) },
        RESOLVED(1),
        CONDITIONAL,
      ],
    },
    {
      title: "Pushbutton with legends",
      item: {
        kind: "legend_pushbutton",
        label: "PUMP 1",
        positions: ["ON (PUSHED OUT)", "OFF (PUSHED IN)"],
        legends: [
          { text: "FAULT", light: "amber" },
          { text: "OFF", light: "white", litIn: ["OFF (PUSHED IN)"] },
        ],
      },
      states: [
        { name: "Resting: no legend lit", target: null },
        { name: "Changed: OFF, lit", target: set(1) },
        { name: "A legend expected on", target: set(null, { lit: true }) },
        CONDITIONAL,
      ],
    },
    {
      title: "Legend light roles",
      item: {
        kind: "legend_pushbutton",
        label: "ROLES",
        positions: ["A", "B"],
        legends: [
          { text: "RED", light: "red", litIn: ["A"] },
          { text: "GREEN", light: "green", litIn: ["A"] },
        ],
      },
      states: [{ name: "Red and green, lit", target: set(0) }],
    },
    {
      title: "Legend light roles, blue",
      item: {
        kind: "legend_pushbutton",
        label: "ROLES",
        positions: ["A", "B"],
        legends: [
          { text: "BLUE", light: "blue", litIn: ["A"] },
          { text: "WHITE", light: "white", litIn: ["A"] },
        ],
      },
      states: [{ name: "Blue and white, lit", target: set(0) }],
    },
    {
      title: "Rocker",
      item: { kind: "rocker", label: "SEAT BELTS", positions: ["ON", "OFF"], rest: "OFF" },
      states: [{ name: "Resting: OFF pressed", target: null }, { name: "Changed: ON", target: set(0) }, RESOLVED(0), CONDITIONAL],
    },
    {
      title: "Keypad",
      item: {
        kind: "keypad",
        label: "RADIO",
        positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "ENT"],
      },
      states: [
        RESTING,
        { name: "Changed: ENT", target: set(11) },
        { name: "Conditional: ENT", target: set(11, { open: true }) },
      ],
    },
    {
      title: "Gauge and screen",
      item: { kind: "gauge", label: "TEMP" },
      states: [RESTING, CHANGED(null)],
    },
  ];

  const panelOf = (item: Partial<PanelItem>): Panel =>
    ({
      id: "gallery",
      title: "Gallery",
      width: 200,
      height: 110,
      sections: [
        {
          id: "s",
          title: "Invented",
          x: 0,
          y: 0,
          width: 180,
          height: 100,
          items: [{ x: 70, y: 46, controls: ["c"], description: "", ...item } as PanelItem],
        },
      ],
    }) as Panel;

  /** The board's invented panel: an angled outline, three push/pull knobs and two legend
   * pushbuttons; the step sets ALT to PULL, and HDG, which the step does not use, has keyboard
   * focus (New panel controls board). */
  const knob = (label: string, x: number): PanelItem =>
    ({ kind: "push_pull_knob", label, x, y: 66, positions: ["PUSH", "PULL"], rest: "PUSH", controls: [], description: "" }) as PanelItem;
  const legendButton = (label: string, x: number): PanelItem =>
    ({
      kind: "legend_pushbutton",
      label,
      x,
      y: 70,
      positions: ["OFF", "ON"],
      legends: [{ text: "ON", light: "green", litIn: ["ON"] }],
      controls: [],
      description: "",
    }) as PanelItem;
  const autoflight: Panel = {
    id: "gallery-autoflight",
    title: "Autoflight panel",
    width: 510,
    height: 150,
    sections: [
      {
        id: "af",
        title: "Autoflight panel",
        x: 10,
        y: 10,
        width: 490,
        height: 132,
        outline: [
          [20, 0],
          [470, 0],
          [490, 26],
          [490, 132],
          [0, 132],
          [0, 26],
        ],
        items: [knob("SPD", 70), knob("HDG", 170), knob("ALT", 270), legendButton("AP", 386), legendButton("A/THR", 440)],
      },
    ],
  } as Panel;
  /** Tap targets, so every control is a tab stop as in the app (focus HDG with Tab to see its
   * ring). */
  let index = $derived(pack ? indexPack(pack) : undefined);

  let regions = $derived(pack?.content.controls?.overview?.regions ?? []);
  let views = $derived(pack?.content.controls?.overview?.views ?? null);
  /** Every seat frame the pack draws, each with the seat it is from: one, or one per seat. */
  let seats = $derived.by(() => {
    const seat = views?.seat;
    if (!seat) return [];
    if (typeof (seat as ViewFrame).width === "number") return [{ id: "", frame: seat as ViewFrame }];
    return Object.entries(seat as Record<string, ViewFrame>).map(([id, frame]) => ({ id, frame }));
  });
  const seatTitle = (id: string) =>
    pack?.content.labels.seats.find((s) => s.id === id)?.title ?? pack?.content.labels.seatViewTitle ?? "";
</script>

<main class="gallery" data-gallery-ready={pack ? "" : undefined}>
  <h1>Drawing renderer: every control and state ({dark ? "dark" : "light"})</h1>
  <p class="note">Invented one-control panels for review, not pack content.</p>
  {#each kinds as kind (kind.title)}
    <section class="kind" data-kind={kind.title}>
      <h2>{kind.title}</h2>
      <div class="row">
        {#each kind.states as state (state.name)}
          <figure class="cell" data-cell="{kind.title}: {state.name}">
            <div class="draw">
              <PanelSchematic
                panel={panelOf(kind.item)}
                focus={["s"]}
                targets={state.target ? [{ section: "s", item: 0, ...state.target }] : []}
                guardClosed={state.guardClosed ?? false}
              />
            </div>
            <figcaption>{state.name}</figcaption>
          </figure>
        {/each}
      </div>
    </section>
  {/each}

  <section class="kind" data-kind="On a panel">
    <h2>On a panel: an angled outline, ALT set to PULL, focus on HDG</h2>
    <figure class="cell" data-cell="On a panel">
      <div class="draw">
        <PanelSchematic
          panel={autoflight}
          focus={["af"]}
          targets={[{ section: "af", item: 2, position: 1, lit: false, open: false, resolved: false }]}
          {index}
        />
      </div>
    </figure>
  </section>

  {#if views}
    <section class="kind" data-kind="Where is this?">
      <h2>Where is this? side and seat views (from the pack)</h2>
      {#each regions as region (region.name)}
        {#if views.side?.places?.some((p) => p.region === region.name) || seats.some((s) => s.frame.places?.some((p) => p.region === region.name))}
          <div class="row views" data-region={region.name}>
            {#if views.side}<ViewDrawing frame={views.side} region={region.name} kind="side" title="{region.name}: from the side" />{/if}
            {#each seats as s (s.id)}<ViewDrawing frame={s.frame} region={region.name} kind="seat" title="{region.name}: {seatTitle(s.id)}" />{/each}
          </div>
        {/if}
      {/each}
    </section>
  {/if}
</main>

<style>
  .gallery {
    max-width: var(--size-content-max);
    margin: 0 auto;
    padding: var(--space-6) var(--gutter) var(--space-10);
    color: var(--color-text);
  }
  h1 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-section-title);
  }
  h2 {
    margin: var(--space-6) 0 var(--space-3);
    font-size: var(--font-size-panel-title);
  }
  .note {
    margin: 0;
    color: var(--color-text-muted);
  }
  .row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }
  .row.views {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: var(--space-3);
  }
  .cell {
    margin: 0;
    overflow: hidden;
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-panel);
    background: var(--panel-bg);
  }
  .draw {
    padding: var(--space-2);
  }
  figcaption {
    padding: var(--space-2) var(--space-3);
    border-top: var(--border-thin) solid var(--color-border);
    background: var(--color-surface);
    font-size: var(--font-size-secondary);
  }
</style>
