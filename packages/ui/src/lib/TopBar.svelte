<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The header (Checklist board, 60 px): menu, the app's name and aircraft, the stage tabs (the
current one bold and underlined, an amber dot on any stage holding an open step), the Checklist /
view switch and the reference area's button, Find before them (Ctrl K; the icon alone below 1440 px). Below 1440 px it is
the compact header (Tablet and Mobile boards): no brand and no stage tabs, but a stage
button (with the phase on phone, and an amber dot when another stage holds an open step) that opens
the stage and phase picker; phone keeps Checklist / Flow in the menu.
-->
<script lang="ts">
  import type { StepLayout, Rail } from "@involo/bindings";
  import { phaseHref } from "../route.svelte";
  import Icon from "./Icon.svelte";
  import headerMark from "../icons/brand/header-mark.svg?raw";

  let {
    aircraft,
    reference,
    rail,
    stage,
    view,
    menuOpen,
    open = [],
    phase = null,
    pickerOpen = false,
    onMenu,
    onView,
    onPicker = () => {},
    onFind,
    findKey = "Ctrl K",
  }: {
    aircraft: string;
    /** The reference area's title, from the pack's labels (the app's default word otherwise). */
    reference: string;
    rail: Rail | null;
    /** The stage of the phase on screen, if any. */
    stage: string | null;
    /** The list view, when a phase is on screen. */
    view: StepLayout | null;
    menuOpen: boolean;
    /** Phases holding an open step (skipped or missed), for the amber dots. */
    open?: string[];
    /** The title of the phase on screen, if any (phone's stage button). */
    phase?: string | null;
    pickerOpen?: boolean;
    onMenu: () => void;
    onView: (view: StepLayout) => void;
    onPicker?: () => void;
    /** Opens Find (Find boards); no button without it. */
    onFind?: (() => void) | undefined;
    /** The Find shortcut as this computer writes it ("Ctrl K", "⌘K"). */
    findKey?: string;
  } = $props();
  /** Open steps in stages other than the one on screen (the stage button's amber dot). */
  let elsewhere = $derived(
    rail?.stages.filter((s) => s.title !== stage).some((s) => s.phases.some((p) => open.includes(p.id))) ?? false,
  );

  /** A stage opens on its first phase that still has steps open. */
  const target = (phases: Rail["stages"][number]["phases"]) => (phases.find((p) => !p.complete) ?? phases[0])?.id;
</script>

<header class="top">
  <button class="menu" type="button" aria-label="Menu" aria-expanded={menuOpen} aria-controls="drawer" onclick={onMenu}>
    <Icon name="menu" />
  </button>
  <div class="brand">
    <span class="name"><span class="mark" aria-hidden="true">{@html headerMark}</span>involo</span>
    <small>{aircraft}</small>
  </div>
  {#if rail && stage}
    <button
      class="pick"
      data-tour="stage-button"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      aria-label="Stage and phase: {stage}{phase ? `, ${phase}` : ''}. Change"
      onclick={onPicker}
    >
      <span class="st"
        >{stage}{#if elsewhere}<span class="dot" title="Open step in another stage"></span>{/if}<span class="chev"
          ><Icon name="chevron-down" /></span
        ></span
      >
      {#if phase}<span class="ph">{phase}<span class="chev"><Icon name="chevron-down" /></span></span>{/if}
    </button>
  {/if}
  {#if rail}
    <nav class="stages" aria-label="Stages" data-tour="stages">
      {#each rail.stages as s (s.id)}
        {@const id = target(s.phases)}
        <!-- The dot marks other stages holding an open step; the current stage's own show on its
             phase tabs (Checklist board). -->
        {@const openHere = s.title === stage ? 0 : s.phases.filter((p) => open.includes(p.id)).length}
        {#if id}
          <a href={phaseHref(id)} aria-current={s.title === stage ? "page" : undefined}
            >{s.title}{#if openHere}<span class="dot" aria-label="{openHere} open step{openHere === 1 ? '' : 's'}"></span>{/if}</a
          >
        {/if}
      {/each}
    </nav>
  {/if}
  <div class="end">
    {#if onFind}
      <!-- Find (Checklist, Tablet and Mobile boards): the word and its shortcut on desktop, the
           icon alone below 1440 px. -->
      <button class="find" data-tour="find" type="button" aria-label="Find a step, control or term" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" onclick={onFind}
        ><Icon name="find" /><span class="fw">Find</span><span class="fk" aria-hidden="true" data-key={findKey}></span></button
      >
    {/if}
    {#if view}
      <div class="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={view === "checklist"} onclick={() => onView("checklist")}>List</button>
        <button type="button" aria-pressed={view === "flow"} onclick={() => onView("flow")}>Step by step</button>
      </div>
    {/if}
    <a class="emg" href="#/reference">{reference}</a>
  </div>
</header>

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: var(--bar-header);
    padding: 0 var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
    background: var(--color-bg);
  }
  .menu {
    display: grid;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .brand {
    display: flex;
    flex-direction: column;
    line-height: var(--leading-tight);
    white-space: nowrap;
  }
  /* The header logo (docs/brand/DESIGN-SYSTEM.md §11): the small mark, sized from the wordmark in
     its own file (18 × 15 at 17 px), a 4 px gap, then the live wordmark. */
  .name {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-strong);
    font-size: var(--font-size-wordmark);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wordmark);
  }
  .mark {
    display: flex;
    flex: none;
  }
  .brand small {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  .stages {
    display: flex;
    align-items: stretch;
    height: var(--bar-header);
  }
  .stages a {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    padding: 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .stages a:hover {
    color: var(--color-text);
  }
  .stages a[aria-current="page"] {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
    box-shadow: inset 0 calc(-1 * (var(--border-thick) + var(--border-thin))) 0 var(--color-accent);
  }
  .dot {
    width: var(--size-dot);
    height: var(--size-dot);
    border-radius: 50%;
    background: var(--color-open-dot);
  }
  .end {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-left: auto;
  }
  .find {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .find :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  /* The shortcut is drawn from data-key, so the button's words are only "Find" (its name starts
     with them; the shortcut is in aria-keyshortcuts). */
  .fk::before {
    content: attr(data-key);
  }
  .fk {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  /* The segmented control (rules.md components). */
  .seg {
    display: flex;
    padding: var(--border-thick);
    border: var(--border-thin) solid var(--color-segment-border);
    border-radius: var(--radius-segment);
    background: var(--color-segment-track);
  }
  .seg button {
    height: var(--size-touch-min);
    padding: 0 var(--space-4);
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
  /* Keyboard focus shows the app's ring (app.css), over the pressed segment's own outline. */
  .seg button:focus-visible {
    outline: var(--border-thick) solid var(--color-accent);
    outline-offset: var(--border-thick);
  }
  .emg {
    display: inline-flex;
    align-items: center;
    height: var(--size-touch-min);
    padding: 0 var(--space-4);
    border: var(--size-focus-ring) solid var(--color-danger);
    border-radius: var(--radius-control);
    background: var(--color-danger-bg);
    color: var(--color-danger-text);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    text-decoration: none;
    white-space: nowrap;
  }
  .pick {
    display: none;
  }
  .chev {
    display: flex;
    color: var(--color-text-muted);
  }
  .chev :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }

  /* The compact header, 600 to 1439 px (Tablet board): menu, the stage button, View, Emergency. */
  @media (max-width: 1439px) {
    .top {
      gap: var(--space-2);
      padding: 0 var(--space-3) 0 calc(var(--space-1) + var(--border-thick));
    }
    .brand,
    .stages {
      display: none;
    }
    .pick {
      display: flex;
      align-items: center;
      height: var(--size-touch-min);
      margin-right: auto;
      padding: 0 calc(var(--space-2) + var(--border-thick));
      border: 0;
      background: transparent;
      color: var(--color-text-strong);
      font: inherit;
    }
    .st {
      display: flex;
      align-items: center;
      gap: calc(var(--space-1) + var(--border-thick));
      font-size: var(--font-size-body);
      font-weight: var(--weight-semibold);
    }
    .ph {
      display: none;
    }
    .end {
      gap: var(--space-2);
    }
    .seg button {
      padding: 0 calc(var(--space-3) + var(--border-thick));
    }
    .emg {
      padding: 0 var(--space-3);
    }
  }

  /* Phone (Mobile board): 56 high; the stage above the phase, no View switch. */
  @media (max-width: 599px) {
    .top {
      gap: var(--space-1);
      padding: 0 var(--space-2) 0 var(--space-1);
    }
    .pick {
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      padding: 0 calc(var(--space-1) + var(--border-thick));
      line-height: var(--leading-tight);
    }
    .st {
      color: var(--color-text-muted);
      font-size: var(--font-size-caption);
      font-weight: var(--weight-regular);
    }
    .st .chev {
      display: none;
    }
    .st .dot {
      width: calc(var(--size-dot) - var(--border-thin));
      height: calc(var(--size-dot) - var(--border-thin));
    }
    .ph {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--font-size-body);
      font-weight: var(--weight-semibold);
    }
    .ph .chev :global(.icon) {
      width: calc(var(--space-3) + var(--border-thick));
      height: calc(var(--space-3) + var(--border-thick));
    }
    .seg {
      display: none;
    }
    .emg {
      padding: 0 calc(var(--space-2) + var(--border-thick));
    }
  }
  /* Below 1440 px Find is the icon alone: boxed on tablet, plain on phone (Tablet, Mobile boards). */
  @media (max-width: 1439px) {
    .find {
      justify-content: center;
      width: var(--size-touch-min);
      padding: 0;
    }
    .find :global(.icon) {
      width: calc(var(--space-4) + var(--border-thick));
      height: calc(var(--space-4) + var(--border-thick));
    }
    .fw,
    .fk {
      display: none;
    }
  }
  @media (max-width: 599px) {
    .find {
      border: 0;
      background: transparent;
      box-shadow: none;
    }
    .find :global(.icon) {
      width: var(--size-icon);
      height: var(--size-icon);
    }
  }
</style>
