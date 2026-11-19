<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The menu drawer, at every size (boards: Menu at 1440, Tablet's menu overlay from 600 to 1439 px,
Mobile's menu screen below 600 px). Its header holds the small mark, "involo", the pack line
(the open pack, the time of the last save this visit, and on tablet the overall count) and Close.
The pack line opens the pack switcher (PacksSwitcher board): the installed packs, a tick on the
open one, each with its saved flight or catalog label, and Manage packs. Then
the step settings, the menu groups and Reset flight plan. Every item on the Menu boards has its page
now (References was the last). The version line lives at the foot of Settings.
-->
<script lang="ts" module>
  /** An installed pack as the switcher lists it. */
  export type SwitchPack = { id: string; name: string; line: string; fromFile: boolean };
</script>

<script lang="ts">
  import type { Detail, StepLayout, Progress } from "@involo/bindings";
  import headerMark from "../icons/brand/header-mark.svg?raw";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";
  let {
    open,
    aircraft,
    packs = [],
    currentPack = "",
    onSwitchPack = () => {},
    savedAt,
    saveFailed = false,
    total,
    view,
    detail,
    essentials,
    onView,
    onDetail,
    onEssentials,
    onReset,
    clear = null,
    onClearTicks = () => {},
    onTour = () => {},
    onClose,
  }: {
    open: boolean;
    aircraft: string;
    /** The installed packs, for the switcher. */
    packs?: SwitchPack[];
    /** The open pack's id. */
    currentPack?: string;
    onSwitchPack?: (id: string) => void;
    /** When this visit last saved, if it has. */
    savedAt: number | null;
    /** The last save was refused: "not saved" in place of the save time (the page's notice says why). */
    saveFailed?: boolean;
    total: Progress;
    /** The list view, when a phase is on screen (phone shows Checklist / Flow here). */
    view: StepLayout | null;
    detail: Detail;
    essentials: boolean;
    onView: (view: StepLayout) => void;
    onDetail: (detail: Detail) => void;
    onEssentials: (on: boolean) => void;
    onReset: () => void;
    /** The procedure whose ticks Clear ticks clears (tablet and phone; desktop has it in the
     * procedure's header), with its tick count; null when nothing is ticked. */
    clear?: { title: string; ticks: number } | null;
    onClearTicks?: () => void;
    /** Take the tour: from step 2, at any time (Tour README). */
    onTour?: () => void;
    onClose: () => void;
  } = $props();
  /** The desktop menu's "Where is Flight setup?", folded until asked. */
  let whereOpen = $state(false);
  let saved = $derived(
    savedAt === null ? null : new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  );
  let closer = $state<HTMLButtonElement | null>(null);
  /** The pack switcher, a menu under the pack line (PacksSwitcher). */
  let switching = $state(false);
  let packLine = $state<HTMLButtonElement | null>(null);
  let switcher = $state<HTMLDivElement | null>(null);
  const items = () => [...(switcher?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]') ?? [])];
  function openSwitcher(): void {
    switching = true;
    // The open pack first, as a menu opens on its checked item.
    queueMicrotask(() => (switcher?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items()[0])?.focus());
  }
  function closeSwitcher(focusLine = true): void {
    switching = false;
    if (focusLine) packLine?.focus();
  }
  function menuKey(e: KeyboardEvent): void {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      all[(i + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSwitcher();
    } else if (e.key === "Tab") closeSwitcher(false);
  }
  $effect(() => {
    if (!open) switching = false;
  });
  let back: HTMLElement | null = null;
  // Focus moves into the drawer when it opens and back to where it was when it closes.
  $effect(() => {
    if (open) {
      back = document.activeElement as HTMLElement | null;
      closer?.focus();
    } else if (back) {
      back.focus();
      back = null;
    }
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && !switching && e.key === "Escape") onClose();
  }}
/>
{#if open}
  <button class="scrim" type="button" aria-label="Close menu" tabindex="-1" onclick={onClose}></button>
{/if}
<nav id="drawer" class:open aria-label="Menu" inert={!open} use:trapFocus={open}>
  <div class="head">
    <div class="who">
      <span class="name"><span class="mark" aria-hidden="true">{@html headerMark}</span>involo</span>
      <button
        bind:this={packLine}
        class="packline"
        type="button"
        aria-haspopup="menu"
        aria-expanded={switching}
        aria-controls="pack-switcher"
        onclick={() => (switching ? closeSwitcher() : openSwitcher())}
        ><span
          >{aircraft}{#if saveFailed}<span>{" · not saved"}</span>{:else if saved}<span>{` · saved ${saved}`}</span>{/if}<span class="count">{` · ${total.done}/${total.total}`}</span></span
        ><Icon name="chevron-down" /></button
      >
    </div>
    <button bind:this={closer} class="close" type="button" aria-label="Close menu" onclick={onClose}><Icon name="x" /></button>
  </div>
  <div class="body" class:switching>
    {#if switching}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div id="pack-switcher" class="switcher" role="menu" aria-label="Switch pack" tabindex="-1" bind:this={switcher} onkeydown={menuKey}>
        {#each packs as p (p.id)}
          {@const on = p.id === currentPack}
          <button
            class="pk"
            class:on
            type="button"
            role="menuitemradio"
            aria-checked={on}
            tabindex="-1"
            onclick={() => {
              closeSwitcher(false);
              if (!on) onSwitchPack(p.id);
            }}
            ><span class="tk">{#if on}<Icon name="check" />{/if}</span><span class="pt"
              ><span class="pn">{p.name}</span>{#if p.line}<span class="pl">{p.line}</span>{/if}{#if p.fromFile}<span class="pl">Not from the Involo catalog</span>{/if}</span
            ></button
          >
        {/each}
        <div class="manage">
          <a
            href="#/packs"
            role="menuitem"
            tabindex="-1"
            onclick={() => {
              closeSwitcher(false);
              onClose();
            }}>Manage packs<Icon name="chevron-right" /></a
          >
        </div>
      </div>
    {/if}
    <div class="steps">
      <span class="label">Steps</span>
      {#if view && open}
        <div class="seg view" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "checklist"} onclick={() => onView("checklist")}>List</button>
          <button type="button" aria-pressed={view === "flow"} onclick={() => onView("flow")}>Step by step</button>
        </div>
      {/if}
      <div class="seg" role="group" aria-label="Steps shown">
        <button type="button" aria-pressed={!essentials} onclick={() => onEssentials(false)}>Full</button>
        <button type="button" aria-pressed={essentials} onclick={() => onEssentials(true)}>Essentials</button>
      </div>
      <div class="seg" role="group" aria-label="Step detail">
        <button type="button" aria-pressed={detail === "expanded"} onclick={() => onDetail("expanded")}>Detailed</button>
        <button type="button" aria-pressed={detail === "quick"} onclick={() => onDetail("quick")}>Simple</button>
      </div>
    </div>
    <!-- Learn (Menu board): Practice, then How procedures work. -->
    <div class="group">
      <span class="label">Learn</span>
      <a href="#/practice" onclick={onClose}>Practice</a>
      <a href="#/how" onclick={onClose}>How procedures work</a>
    </div>
    <!-- Reference (Menu board): Flight deck, Glossary, References. -->
    <div class="group">
      <span class="label">Reference</span>
      <a class="deck" href="#/deck" onclick={onClose}>Flight deck<small>Panels and lights</small></a>
      <a href="#/glossary" onclick={onClose}>Glossary</a>
      <a href="#/references" onclick={onClose}>References</a>
    </div>
    <div class="group">
      <span class="label">This flight and the app</span>
      <!-- Flight log (Menu, Tablet and Mobile boards): first in this group. -->
      <a href="#/log" onclick={onClose}>Flight log</a>
      <a href="#/settings" onclick={onClose}>Settings</a>
      <!-- Take the tour (Menu, Tablet and Mobile boards): the last item of this group. -->
      <button
        class="tour"
        type="button"
        onclick={() => {
          onClose();
          onTour();
        }}>Take the tour</button
      >
    </div>
    <div class="fill"></div>
    <div class="rule"></div>
    {#if clear}
      <!-- Tablet and phone (Tablet and Mobile boards): Clear ticks above Reset flight plan, the same
           Undo toast. -->
      <button
        class="reset clear"
        type="button"
        onclick={() => {
          onClose();
          onClearTicks();
        }}
        ><b>Clear ticks</b><small class="long">{clear.title}: {clear.ticks} {clear.ticks === 1 ? "tick" : "ticks"}. Undo right after.</small><small
          class="short">{clear.title} · Undo right after</small
        ></button
      >
    {/if}
    <button
      class="reset"
      type="button"
      onclick={() => {
        onClose();
        onReset();
      }}
      ><b>Reset flight plan</b><small class="long">Clears the plan, clearance and notes. Undo right after.</small><small class="short"
        >Undo right after</small
      ></button
    >
    <!-- Desktop (Menu board, MenuWhere): where the old Flight setup went. -->
    <div class="where">
      <button class="wlink" type="button" aria-expanded={whereOpen} aria-controls="drawer-where" onclick={() => (whereOpen = !whereOpen)}
        >Where is Flight setup? {whereOpen ? "⌃" : "⌄"}</button
      >
      {#if whereOpen}
        <div id="drawer-where">
          <p>Flight setup is now the Flight pages. Open them from the flight strip, or from any step that needs a flight value.</p>
          <a href="#/flight/overview" onclick={onClose}>Open Flight ›</a>
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  /* Tablet (600 to 1439 px): the Tablet board's menu overlay. Phone and desktop follow below. */
  nav {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    width: var(--size-drawer);
    border-right: var(--border-thin) solid var(--color-border);
    background: var(--color-sheet);
    transform: translateX(-102%);
    transition: transform 0.18s;
  }
  nav.open {
    transform: none;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: var(--color-scrim);
  }
  .head {
    display: flex;
    flex: none;
    align-items: flex-start;
    min-height: var(--bar-header);
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-2) calc(var(--space-2) + var(--border-thick)) calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .who {
    gap: var(--space-1);
  }
  .who {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: var(--leading-tight);
  }
  /* The header logo, as in the top bar (docs/brand/DESIGN-SYSTEM.md §11). */
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
  /* The pack line (PacksSwitcher): the open pack and the last save, opening the switcher. */
  .packline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    max-width: 100%;
    min-height: var(--space-8);
    margin-left: calc(-1 * (var(--space-1) + var(--border-thick)));
    padding: 0 calc(var(--space-1) + var(--border-thick));
    border: 0;
    border-radius: var(--radius-small);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    text-align: left;
    cursor: pointer;
  }
  .packline[aria-expanded="true"] {
    background: var(--color-accent-soft);
    color: var(--color-text);
  }
  .packline > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .packline :global(svg) {
    flex: none;
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  /* The switcher: a popover menu under the pack line; the rest of the menu dims behind it. */
  .switcher {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    padding: calc(var(--space-1) + var(--border-thick));
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-segment);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .body.switching > :not(.switcher) {
    opacity: 0.5;
  }
  .pk {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    width: 100%;
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: calc(var(--space-1) + var(--border-thick)) calc(var(--space-2) + var(--border-thick));
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pk.on {
    background: var(--color-accent-soft);
  }
  .tk {
    display: flex;
    flex: none;
    width: calc(var(--size-icon-small) + var(--border-thick));
    color: var(--color-accent);
  }
  .tk :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .pt {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .pn {
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .pk.on .pn {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .pl {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .manage {
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-1) 0;
    border-top: var(--border-thin) solid var(--color-line);
  }
  .manage a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--size-touch-min);
    color: var(--color-link);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-decoration: none;
  }
  .manage :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: var(--space-3);
    overflow-y: auto;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-1);
  }
  .steps .label {
    padding: 0;
  }
  .label {
    padding: 0 var(--space-2) var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  /* The segmented control (rules.md components). */
  .seg {
    display: flex;
    padding: var(--border-thick);
    border: var(--border-thin) solid var(--color-segment-border);
    border-radius: var(--radius-segment);
    background: var(--color-segment-track);
  }
  .seg.view {
    display: none;
  }
  .seg button {
    flex: 1;
    height: var(--size-touch-min);
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
  .group {
    display: flex;
    flex-direction: column;
  }
  .group a,
  .group .tour {
    display: flex;
    align-items: center;
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .group .tour {
    border: 0;
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* Flight deck (Menu board): "Panels and lights" at the right, 12 px muted. */
  .group a.deck {
    justify-content: space-between;
  }
  .deck small {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .fill {
    flex: 1;
  }
  .rule {
    flex: none;
    height: var(--border-thin);
    background: var(--color-line);
  }
  .reset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: 0 var(--space-3);
    border: 0;
    background: transparent;
    color: var(--color-danger-text);
    font: inherit;
    text-align: left;
  }
  .reset.clear {
    color: var(--color-text);
  }
  .reset b {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .reset small {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .reset .short {
    display: none;
  }

  .where {
    display: none;
  }
  /* Desktop (1440 px and wider): the Menu board. */
  @media (min-width: 1440px) {
    /* Desktop clears ticks from the procedure's header (Checklist board). */
    .reset.clear {
      display: none;
    }
    .where {
      display: flex;
      flex-direction: column;
    }
    .wlink,
    .where a {
      display: flex;
      align-items: center;
      min-height: var(--size-touch-min);
      padding: 0 var(--space-3);
      border: 0;
      background: none;
      color: var(--color-link);
      font: inherit;
      font-size: var(--font-size-caption);
      text-align: left;
      text-decoration: none;
    }
    .where p {
      margin: 0;
      padding: 0 var(--space-3) calc(var(--space-1) + var(--border-thick));
      color: var(--color-text-secondary);
      font-size: var(--font-size-secondary);
      line-height: var(--leading-snug);
    }
    .where a {
      font-size: var(--font-size-secondary);
      font-weight: var(--weight-semibold);
    }
    nav {
      background: var(--color-surface);
      box-shadow: var(--color-overlay-shadow);
    }
    .head {
      gap: var(--space-3);
    }
    .count {
      display: none;
    }
    .body {
      gap: var(--space-4);
    }
    .rule {
      margin: 0 var(--space-1);
    }
    .reset {
      gap: var(--border-thick);
      padding: calc(var(--space-1) + var(--border-thick)) var(--space-3);
      border-radius: var(--radius-control);
    }
  }

  /* Phone (below 600 px): Mobile's menu screen, 320 wide, with List / Step by step. */
  @media (max-width: 599px) {
    nav {
      width: calc(var(--size-drawer) - var(--space-10));
    }
    .head {
      padding: 0 calc(var(--space-1) + var(--border-thick)) 0 var(--space-4);
    }
    .count {
      display: none;
    }
    .body {
      gap: calc(var(--space-2) + var(--border-thick));
      padding: calc(var(--space-2) + var(--border-thick)) var(--space-2);
    }
    .steps {
      gap: calc(var(--space-1) + var(--border-thick));
      padding: 0 calc(var(--space-1) + var(--border-thick));
    }
    .steps .label {
      display: none;
    }
    .seg.view {
      display: flex;
    }
    .label {
      padding: 0 calc(var(--space-2) + var(--border-thick)) var(--border-thick);
    }
    .group a,
    .group .tour {
      padding: 0 calc(var(--space-2) + var(--border-thick));
    }
    .reset {
      min-height: calc(var(--size-touch-min) + var(--space-1));
      padding: 0 calc(var(--space-2) + var(--border-thick));
    }
    .reset .long {
      display: none;
    }
    .reset .short {
      display: inline;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    nav {
      transition: none;
    }
  }
</style>
