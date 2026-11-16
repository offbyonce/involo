<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The menu drawer, at every size (boards: Menu at 1440, Tablet's menu overlay from 600 to 1439 px,
Mobile's menu screen below 600 px). Its header holds the small mark, "involo", a sub-line
(aircraft, the time of the last save this visit, and on tablet the overall count) and Close. Then
the step settings, the menu groups and Reset flight plan. Items whose page does not exist yet
(Practice, How procedures work, Flight deck, References, Flight log, Take the tour) stay
hidden until that page is built, with any group heading left empty (owner, batch 5). The version
line lives at the foot of Settings.
-->
<script lang="ts">
  import type { Detail, ListView, Progress } from "@involo/bindings";
  import headerMark from "../icons/brand/header-mark.svg?raw";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";
  let {
    open,
    aircraft,
    savedAt,
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
    onClose,
  }: {
    open: boolean;
    aircraft: string;
    /** When this visit last saved, if it has. */
    savedAt: number | null;
    total: Progress;
    /** The list view, when a phase is on screen (phone shows Checklist / Flow here). */
    view: ListView | null;
    detail: Detail;
    essentials: boolean;
    onView: (view: ListView) => void;
    onDetail: (detail: Detail) => void;
    onEssentials: (on: boolean) => void;
    onReset: () => void;
    /** The procedure whose ticks Clear ticks clears (tablet and phone; desktop has it in the
     * procedure's header), with its tick count; null when nothing is ticked. */
    clear?: { title: string; ticks: number } | null;
    onClearTicks?: () => void;
    onClose: () => void;
  } = $props();
  /** The desktop menu's "Where is Flight setup?", folded until asked. */
  let whereOpen = $state(false);
  let saved = $derived(
    savedAt === null ? null : new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  );
  let closer = $state<HTMLButtonElement | null>(null);
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
    if (open && e.key === "Escape") onClose();
  }}
/>
{#if open}
  <button class="scrim" type="button" aria-label="Close menu" tabindex="-1" onclick={onClose}></button>
{/if}
<nav id="drawer" class:open aria-label="Menu" inert={!open} use:trapFocus={open}>
  <div class="head">
    <div class="who">
      <span class="name"><span class="mark" aria-hidden="true">{@html headerMark}</span>involo</span>
      <small
        >{aircraft}{#if saved}<span>{` · saved ${saved}`}</span>{/if}<span class="count">{` · ${total.done}/${total.total}`}</span></small
      >
    </div>
    <button bind:this={closer} class="close" type="button" aria-label="Close menu" onclick={onClose}><Icon name="x" /></button>
  </div>
  <div class="body">
    <div class="steps">
      <span class="label">Steps</span>
      {#if view && open}
        <div class="seg view" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "checklist"} onclick={() => onView("checklist")}>Checklist</button>
          <button type="button" aria-pressed={view === "flow"} onclick={() => onView("flow")}>Flow</button>
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
    <!-- Reference (Menu board): Glossary; Flight deck and References wait for their pages. -->
    <div class="group">
      <span class="label">Reference</span>
      <a href="#/glossary" onclick={onClose}>Glossary</a>
    </div>
    <div class="group">
      <span class="label">This flight and the app</span>
      <a href="#/settings" onclick={onClose}>Settings</a>
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
    align-items: center;
    height: var(--bar-header);
    padding: 0 var(--space-2) 0 calc(var(--space-4) + var(--space-1));
    border-bottom: var(--border-thin) solid var(--color-line);
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
  .who small {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
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
  .group a {
    display: flex;
    align-items: center;
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
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

  /* Phone (below 600 px): Mobile's menu screen, 320 wide, with Checklist / Flow. */
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
    .group a {
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
