<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

"2 open steps" and its pop-over (OpenSteps board): every open step from every stage, grouped by
phase and list, each with its setting and Go to step (a skipped briefing first in its phase, with
Go to briefing), and the footer saying skipped steps stay
open. Pop-over tokens; it closes on its X, Esc or a press outside. On phone it is the bottom sheet
(Mobile board, open screen), opened from the progress row's "2 open".
-->
<script lang="ts">
  import { stepValue } from "./answers.svelte";
  import type { OpenStep } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";
  import { openSteps } from "./open-steps.svelte";
  import { stepTitle } from "./names";
  import { phaseHref } from "../route.svelte";

  let { index, open, onGo }: { index: PackIndex; open: OpenStep[]; onGo: (step: string) => void } = $props();

  let box = $state<HTMLElement | null>(null);
  let groups = $derived.by(() => {
    const out: { title: string; steps: OpenStep[] }[] = [];
    for (const o of open) {
      // A skipped briefing (#214) heads its phase, under "<phase> · Briefing".
      const title = `${o.phaseTitle} · ${o.briefing ? "Briefing" : o.listTitle}`;
      const g = out.find((x) => x.title === title) ?? (out.push({ title, steps: [] }), out[out.length - 1]);
      g?.steps.push(o);
    }
    return out;
  });
  const label = (n: number) => `${n} open step${n === 1 ? "" : "s"}`;
  function outside(e: PointerEvent): void {
    if (openSteps.shown && box && !box.contains(e.target as Node)) openSteps.shown = false;
  }
  function key(e: KeyboardEvent): void {
    if (openSteps.shown && e.key === "Escape") openSteps.shown = false;
  }
  // On phone the sheet opens from the progress row: focus goes to its Close, and back after.
  let back: HTMLElement | null = null;
  $effect(() => {
    if (openSteps.shown && !window.matchMedia?.("(min-width: 600px)").matches) {
      back = document.activeElement as HTMLElement | null;
      queueMicrotask(() => box?.querySelector<HTMLElement>(".pop .close")?.focus());
    } else if (!openSteps.shown && back) {
      back.focus();
      back = null;
    }
  });
  // A new page starts with the list closed.
  $effect(() => () => (openSteps.shown = false));
</script>

<svelte:document onpointerdown={outside} onkeydown={key} />

{#if open.length}
  <div class="wrap" bind:this={box}>
    <button class="opener" type="button" aria-haspopup="dialog" aria-expanded={openSteps.shown} onclick={() => (openSteps.shown = !openSteps.shown)}>
      {label(open.length)}<Icon name="chevron-down" />
    </button>
    {#if openSteps.shown}
      <button class="scrim" type="button" aria-label="Close" tabindex="-1" onclick={() => (openSteps.shown = false)}></button>
      <div class="pop" role="dialog" aria-labelledby="open-title" use:trapFocus>
        <span class="arrow" aria-hidden="true"></span>
        <span class="handle" aria-hidden="true"></span>
        <div class="head">
          <h2 id="open-title">{label(open.length)}</h2>
          <button class="close" type="button" aria-label="Close" onclick={() => (openSteps.shown = false)}><Icon name="x" /></button>
        </div>
        {#each groups as g (g.title)}
          <p class="group">{g.title}</p>
          {#each g.steps as o (o.step)}
            {@const step = index.step(o.step)}
            {#if o.briefing}
              <div class="row">
                <span class="status skipped" aria-hidden="true"><i></i></span>
                <span class="txt">
                  <span class="nm">{o.listTitle}</span>
                  <span class="val">{index.briefing(o.step)?.mnemonic ?? ""}</span>
                </span>
                <button
                  class="go"
                  type="button"
                  aria-label="Go to briefing"
                  onclick={() => {
                    openSteps.shown = false;
                    location.hash = phaseHref(o.phase);
                  }}><span class="long">Go to briefing</span><span class="short">Go</span></button
                >
              </div>
            {:else if step}
              <div class="row">
                <span class="status" class:skipped={o.skipped} aria-hidden="true"><i></i></span>
                <span class="txt">
                  <span class="nm">{stepTitle(index, step)}</span>
                  <span class="val">{stepValue(step)}</span>
                </span>
                <button
                  class="go"
                  type="button"
                  aria-label="Go to step"
                  onclick={() => {
                    openSteps.shown = false;
                    onGo(o.step);
                  }}><span class="long">Go to step</span><span class="short">Go</span></button
                >
              </div>
            {/if}
          {/each}
        {/each}
        <p class="foot">Skipped steps stay open until you do them. The Flight log lists any still open at the end.</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap {
    position: relative;
  }
  .opener {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-control);
    background: var(--color-open-bg);
    color: var(--color-open-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .opener :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .pop {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    z-index: 12;
    box-sizing: border-box;
    width: calc(var(--size-drawer) + 5 * var(--space-6));
    padding: var(--space-2) var(--space-2) var(--space-3);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-popover);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .arrow {
    position: absolute;
    top: calc(-1 * var(--space-2) + var(--border-thin));
    right: calc(var(--space-10) + var(--space-6));
    width: var(--space-3);
    height: var(--space-3);
    border-top: var(--border-thin) solid var(--color-popover-border);
    border-left: var(--border-thin) solid var(--color-popover-border);
    background: var(--color-popover-surface);
    transform: rotate(45deg);
  }
  .head {
    display: flex;
    align-items: center;
    padding: 0 0 0 var(--space-3);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .close {
    display: grid;
    place-items: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    border: 0;
    background: none;
    color: var(--color-text-secondary);
  }
  .group {
    margin: var(--space-2) var(--space-3) var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
  }
  .status {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    flex: none;
    width: var(--size-status-icon);
    height: var(--size-status-icon);
    border: var(--border-thick) solid var(--color-todo-ring);
    border-radius: 50%;
  }
  .status.skipped {
    border-style: dashed;
    border-color: var(--color-open-dot);
  }
  .status i {
    width: calc(var(--size-status-icon) / 2);
    height: var(--border-thick);
    background: var(--color-open-dot);
  }
  .txt {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nm {
    font-size: var(--font-size-body);
  }
  .val {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .go {
    min-height: var(--size-touch-min);
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .foot {
    margin: var(--space-3) var(--space-3) 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    line-height: var(--leading-snug);
  }
  .scrim,
  .handle,
  .short {
    display: none;
  }
  /* Phone (Mobile board, open screen): a bottom sheet over a scrim. */
  @media (max-width: 599px) {
    .wrap {
      position: static;
    }
    .opener {
      display: none;
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 55;
      display: block;
      background: var(--color-scrim);
    }
    .pop {
      position: fixed;
      top: auto;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 60;
      display: flex;
      flex-direction: column;
      gap: calc(var(--space-1) + var(--border-thick));
      width: auto;
      min-height: calc(var(--size-drawer) + var(--size-header));
      max-height: calc(100dvh - var(--size-header));
      padding: var(--space-2) var(--space-3) var(--space-6);
      overflow-y: auto;
      border: 0;
      border-top: var(--border-thin) solid var(--color-border);
      border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      background: var(--color-sheet);
      box-shadow: none;
    }
    .arrow,
    .status,
    .foot,
    .long {
      display: none;
    }
    .handle {
      display: block;
      flex: none;
      align-self: center;
      width: var(--space-10);
      height: var(--space-1);
      border-radius: var(--border-thick);
      background: var(--color-border);
    }
    .short {
      display: inline;
    }
    .head {
      padding-left: var(--space-1);
    }
    h2 {
      font-size: calc(var(--font-size-body) + var(--border-thick));
      font-weight: var(--weight-bold);
    }
    .group {
      margin: 0;
      padding: var(--space-2) var(--space-1) var(--space-1);
    }
    .head + .group {
      padding-top: var(--space-1);
    }
    .row {
      gap: calc(var(--space-2) + var(--border-thick));
      min-height: calc(var(--size-touch-min) + var(--space-3));
      padding: 0 var(--space-3);
      background: var(--color-surface);
    }
    .val {
      color: var(--color-text-secondary);
    }
  }
</style>
