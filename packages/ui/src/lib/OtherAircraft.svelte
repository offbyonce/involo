<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
<script lang="ts">
  // A SimBrief plan for an aircraft type the open pack doesn't cover (PacksSimbrief, decision
  // 0028): the plan's aircraft and type against the open pack's, "Use it anyway" (the primary
  // button: warn, then go on) and Cancel (the plan isn't loaded). On a phone it takes the Remove
  // dialog's form: the same dialog, the screen's width less the gutters.
  import type { OtherAircraft } from "@involo/bindings";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";

  let {
    other,
    fromFile = false,
    onUse,
    onCancel,
  }: {
    other: OtherAircraft;
    /** The open pack came from a file: its row carries the neutral "Not from the Involo catalog". */
    fromFile?: boolean;
    onUse: () => void;
    onCancel: () => void;
  } = $props();

  let cancel = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    cancel?.focus();
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") onCancel();
  }}
/>

<div class="scrim" aria-hidden="true"></div>
<div class="center">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="other-title" use:trapFocus>
    <h2 id="other-title">Use this plan anyway?</h2>
    <div class="warn">
      <span class="ic"><Icon name="warning" /></span>
      <p>This SimBrief plan is for a different aircraft. Weights, fuel and speeds may not suit the open pack.</p>
    </div>
    <div class="both">
      <span class="k">This plan</span>
      <span class="v">{#if other.planName}{`${other.planName} `}{/if}<span class="code">{other.planType}</span></span>
      <span class="k">The open pack</span>
      <span class="v"
        >{other.packName} <span class="code">{other.packTypes.join(", ")}</span>{#if fromFile}
          <span class="tag">Not from the Involo catalog</span>{/if}</span
      >
    </div>
    <p class="note">If you fly a close variant on purpose, you can use it anyway.</p>
    <div class="row">
      <button class="btn" type="button" bind:this={cancel} onclick={onCancel}>Cancel</button>
      <button class="btn primary" type="button" onclick={onUse}>Use it anyway</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 40;
    inset: 0;
    background: var(--color-scrim);
  }
  .center {
    display: flex;
    position: fixed;
    z-index: 41;
    inset: 0;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    box-sizing: border-box;
    width: var(--size-side-pane);
    max-width: 100%;
    padding: var(--space-6);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-sheet);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
    color: var(--color-text);
    /* The board's dialog sets no line height: its title and rows take the font's own. */
    line-height: normal;
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .warn {
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-2) + var(--border-thick));
    color: var(--color-open-text);
  }
  .ic {
    display: flex;
    flex: none;
  }
  .ic :global(.icon) {
    width: calc(var(--space-4) + var(--border-thick));
    height: calc(var(--space-4) + var(--border-thick));
  }
  p {
    margin: 0;
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .both {
    display: grid;
    grid-template-columns: calc(var(--space-10) * 3) minmax(0, 1fr);
    gap: calc(var(--space-1) + var(--border-thick)) var(--space-3);
    padding: var(--space-3) calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
    font-size: var(--font-size-secondary);
  }
  .k {
    color: var(--color-text-muted);
  }
  .v {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .code {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }
  /* "Not from the Involo catalog": the Packs page's neutral badge, never a warning color. */
  .tag {
    display: inline-flex;
    align-items: center;
    min-height: var(--space-6);
    margin-left: var(--space-1);
    padding: 0 var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
    vertical-align: middle;
  }
  p.note {
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    white-space: nowrap;
    cursor: pointer;
  }
  .btn.primary {
    padding: 0 var(--space-4);
    border: 0;
    background: var(--color-accent);
    box-shadow: none;
    color: var(--color-on-accent);
    font-weight: var(--weight-semibold);
  }
</style>
