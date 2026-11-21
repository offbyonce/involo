<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Start options (Start.dc.html), from the pack (decision 0029): each option its `ask_in` names
`start`, in its style (a toggle, a segmented row, or cards), with its title, description and phase
link, and the panel-state picker in the pack's words, in the order the pack's `start_page` gives.
-->
<script lang="ts">
  import type { Flight, PanelState, PanelStateLabels, UserOption } from "@involo/bindings";
  import { phaseHref } from "../route.svelte";
  import OptionChoices from "../lib/OptionChoices.svelte";
  import Toggle from "../lib/Toggle.svelte";
  import Icon from "../lib/Icon.svelte";

  let {
    flight,
    options,
    states,
    labels,
    order = [],
    onOption,
    onPanelState,
  }: {
    flight: Flight;
    options: UserOption[];
    states: PanelState[];
    /** The panel state row's words, from the pack's labels. */
    labels: PanelStateLabels;
    /** The page's order (the pack's `start_page`): option ids and `panel_state`. */
    order?: string[];
    onOption: (option: string, value: string) => void;
    onPanelState: (state: string | null) => void;
  } = $props();

  /** The picker's place in `order`, and what `ask_in` names for this page. */
  const PICKER = "panel_state";
  const THIS_PAGE = "start";
  let asked = $derived(options.filter((o) => o.start && (o.askIn ?? []).includes(THIS_PAGE)));
  let entries = $derived(order.length ? order : [...asked.map((o) => o.id), PICKER]);
  /** The chosen panel state's description (StateNote board); nothing until one is chosen. */
  let chosenDescription = $derived(states.find((s) => s.id === flight.panelState)?.description?.trim() || "");
  const value = (o: UserOption) => flight.options[o.id] ?? o.default ?? "";
  /** The other of a toggle's two values. */
  const other = (o: UserOption, v: string) => o.values.find((x) => x !== v) ?? v;
</script>

{#snippet text(o: UserOption)}
  <div class="text">
    <span class="t" id="st-{o.id}">{o.start?.title ?? o.title}</span>
    {#if o.start?.description ?? o.description}<span class="d">{o.start?.description ?? o.description}</span>{/if}
    {#if o.start?.link}<a class="link" href={phaseHref(o.start.link.phase)}>{o.start.link.text}</a>{/if}
  </div>
{/snippet}

{#each entries as entry (entry)}
  {#if entry === PICKER}
    {#if states.length}
      <section class="card stack">
        <div class="text">
          <span class="t">{labels.title}</span>
          <span class="d">{labels.description}</span>
        </div>
        <label class="pick">
          Panel state
          <span class="sel">
            <select value={flight.panelState ?? ""} onchange={(e) => onPanelState(e.currentTarget.value || null)}>
              <option value="">{labels.placeholder}</option>
              {#each states as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
            </select>
            <Icon name="chevron-down" />
          </span>
          {#if chosenDescription}<span class="state-note">{chosenDescription}</span>{/if}
        </label>
      </section>
    {/if}
  {:else}
    {@const o = asked.find((x) => x.id === entry)}
    {#if o?.start?.style === "toggle"}
      {@const on = o.start.on ?? o.values[0] ?? ""}
      <section class="card">
        {@render text(o)}
        <Toggle on={value(o) === on} labelledby="st-{o.id}" onToggle={() => onOption(o.id, value(o) === on ? other(o, on) : on)} />
      </section>
    {:else if o?.start?.style === "row"}
      <section class="card stack">
        {@render text(o)}
        <span class="seg" role="group" aria-labelledby="st-{o.id}">
          {#each o.values as v (v)}
            <button type="button" aria-pressed={value(o) === v} onclick={() => onOption(o.id, v)}>
              {o.choices?.find((c) => c.value === v)?.label ?? v}
            </button>
          {/each}
        </span>
      </section>
    {:else if o}
      <section class="card column">
        {@render text(o)}
        <OptionChoices option={o} value={value(o)} cards onChoose={(v) => onOption(o.id, v)} />
      </section>
    {/if}
  {/if}
{/each}

<style>
  .card {
    flex: none;
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-4) + var(--space-1));
    max-width: calc(26 * var(--space-10));
    padding: var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  /* Cards: the option's words above its choice cards. */
  .card.column {
    flex-direction: column;
    align-items: stretch;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .t {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .d {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    min-height: var(--size-touch-min);
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  .seg {
    display: flex;
    flex: none;
    padding: var(--border-thick);
    border: var(--border-thin) solid var(--color-segment-border);
    border-radius: var(--radius-segment);
    background: var(--color-segment-track);
  }
  .seg button {
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--space-1) / 2);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .seg button[aria-pressed="true"] {
    background: var(--color-segment-on);
    outline: var(--size-focus-ring) solid var(--color-accent);
    outline-offset: calc(-1 * var(--size-focus-ring));
    box-shadow: var(--color-segment-shadow);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  /* The panel-state picker (StateNote board): 280 wide on desktop, the select across it. */
  .pick {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    width: calc(7 * var(--space-10));
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .pick select {
    width: 100%;
  }
  /* The chosen panel state's description, wrapping within the picker. */
  .state-note {
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    line-height: var(--leading-snug);
  }
  .sel {
    position: relative;
    display: block;
  }
  select {
    appearance: none;
    height: var(--size-touch-min);
    min-width: calc(6 * var(--space-10));
    padding: 0 var(--space-10) 0 var(--space-3);
    border: var(--border-thin) solid var(--color-field-border);
    border-radius: calc(var(--radius-small) + var(--border-thick));
    background: var(--color-field);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  /* Phone: a card with choices or the panel-state menu puts its words on top and the control
     under them, across the card, as the choice cards are; the choices share the width, their
     words wrapping when they must. */
  @media (max-width: 599px) {
    .card.stack {
      flex-direction: column;
      align-items: stretch;
    }
    .card.stack .text {
      flex: none;
    }
    .card.stack .seg button {
      flex: 1 1 0;
      height: auto;
      min-height: var(--size-touch-min);
    }
    .card.stack select {
      width: 100%;
      min-width: 0;
    }
    .card.stack .pick {
      width: auto;
    }
  }
  .sel :global(.icon) {
    position: absolute;
    top: calc((var(--size-touch-min) - var(--size-icon-small)) / 2);
    right: var(--space-3);
    width: var(--size-icon-small);
    height: var(--size-icon-small);
    color: var(--color-text-muted);
    pointer-events: none;
  }
</style>
