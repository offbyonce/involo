<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The simulator-only notice (#241; Release board, RelNotice and RelNoticePhone): a dialog over the
whole app on a first visit, before anything else, in the Remove dialog's form. I understand is the
only way to close it: no Esc, no scrim click, no close button. It has no privacy link: the privacy
note (#52) is reached from Settings' last line.
-->
<script lang="ts">
  import { onDesktop } from "../host";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";

  let { onUnderstood }: { onUnderstood: () => void } = $props();

  let button = $state<HTMLButtonElement | null>(null);
  // Focus starts on I understand.
  $effect(() => {
    button?.focus();
  });

  // The app underneath is inert while the notice is open, as under the tour, so nothing reaches it,
  // not even a screen reader's browse mode.
  let root = $state<HTMLElement | null>(null);
  $effect(() => {
    const parent = root?.parentElement;
    if (!parent) return;
    // What renders after the notice opens (the first launch's Packs page) is made inert too.
    const others = new Set<HTMLElement>();
    const cover = () => {
      for (const el of parent.children)
        if (el !== root && el instanceof HTMLElement && !el.inert) {
          el.inert = true;
          others.add(el);
        }
    };
    cover();
    const watch = new MutationObserver(cover);
    watch.observe(parent, { childList: true });
    return () => {
      watch.disconnect();
      for (const el of others) el.inert = false;
    };
  });
</script>

<div class="sim-notice" bind:this={root}>
<div class="scrim" aria-hidden="true"></div>
<div class="center">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="notice-title" aria-describedby="notice-body" use:trapFocus>
    <div class="head"><Icon name="shield" /><h2 id="notice-title">Simulator training only</h2></div>
    <div id="notice-body">
      <p class="lead">
        Involo is a training aid for flight simulators. Don’t use it for real-world flying: it isn’t a substitute for an
        aircraft’s approved documentation, procedures or training.
      </p>
      <p class="sub">
        {onDesktop()
          ? "Everything you do here is saved on this computer only. Nothing is sent to us."
          : "Everything you do here is saved in this browser, on this device only. Nothing is sent to us."}
      </p>
    </div>
    <div class="row">
      <button class="btn primary" type="button" bind:this={button} onclick={onUnderstood}>I understand</button>
    </div>
  </div>
</div>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 60;
    inset: 0;
    background: var(--color-scrim);
  }
  .center {
    display: flex;
    position: fixed;
    z-index: 61;
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
    width: calc(var(--size-side-pane) + var(--space-10));
    max-width: 100%;
    padding: calc(var(--space-6) + var(--space-1));
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-sheet);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-accent);
  }
  .head :global(svg) {
    flex: none;
    width: var(--size-status-icon);
    height: var(--size-status-icon);
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-panel-title) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  #notice-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  p {
    margin: 0;
    /* The board's 1.55 has no token; the nearest is leading-normal (1.5). */
    line-height: var(--leading-normal);
  }
  .lead {
    color: var(--color-text);
    font-size: var(--font-size-body);
  }
  .sub {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .row {
    display: flex;
    justify-content: flex-end;
  }
  .row .btn {
    padding: 0 var(--space-4);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  /* RelNoticePhone: at the bottom, full width, the button across it. */
  @media (max-width: 599px) {
    .center {
      align-items: flex-end;
      padding: var(--space-4) var(--space-4) var(--space-6);
    }
    .dialog {
      width: 100%;
      padding: calc(var(--space-4) + var(--space-1));
    }
    h2 {
      font-size: var(--font-size-panel-title);
    }
    .row .btn {
      flex: 1;
      min-height: calc(var(--size-touch-min) + var(--space-1));
    }
  }
</style>
