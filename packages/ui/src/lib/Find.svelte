<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Find (Find.dc.html: FindDesk, FindDeskNone, FindDeskStart and the phone boards). From 900 px
a 640 px dialog 88 px from the top, centered, on the pop-over tokens over color.scrim; below 900 px a
full-screen sheet with a back button and a boxed field. It searches every step, control and term
in the pack: Steps, Controls, Terms, each with its count and its first three matches ("Show all N";
Terms shows every match). The first result is active; ↑ and ↓ move, Enter opens. A step goes to the
step and opens it, a control opens its Where is this?, a term opens the Glossary at that
term. Before typing: the help line and the Try chips; no match: "Nothing
matches “…”". Esc, the scrim and the back button close it.
-->
<script lang="ts">
  import type { Rail } from "@involo/bindings";
  import { onMount, tick } from "svelte";
  import { answered } from "./answers.svelte";
  import { type FindControl, type FindIndex, type FindTerm, type FoundStep, findIn, findOnly, foundValue, marked } from "./find-index";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";

  let {
    find,
    rail,
    done,
    current,
    phase = null,
    findKey = "Ctrl K",
    onStep,
    onControl,
    onTerm = () => {},
    onClose,
    only = null,
  }: {
    find: FindIndex;
    rail: Rail | null;
    /** The steps ticked this flight (the session), for the state icons. */
    done: Record<string, number>;
    /** The step under way, and the phase on screen: their matches come first. */
    current: string | null;
    phase?: string | null;
    findKey?: string;
    onStep: (id: string) => void;
    onControl: (control: FindControl) => void;
    /** A term opens the Glossary at that term, in place of its definition. */
    onTerm?: (term: string) => void;
    onClose: () => void;
    /** Opened on a set of steps (References' simulator model notes): their name, and the steps. */
    only?: { label: string; steps: string[] } | null;
  } = $props();

  const TRY = ["Fuel panel", "Parking brake", "MCP", "Transponder"];
  const FIRST = 3;

  let query = $state("");
  let input = $state<HTMLInputElement | null>(null);
  /** The set of steps Find opened on, until the pilot clears it. */
  // svelte-ignore state_referenced_locally
  let scope = $state(only);
  let found = $derived(scope ? findOnly(find, scope.steps, query, rail) : findIn(find, query, rail, { phase, step: current }));
  /** Results show: on typed words, or at once when Find opened on a set of steps. */
  let showing = $derived(!!scope || query.trim() !== "");
  let all = $state({ steps: false, controls: false });
  /** A control no step on this flight uses, opened in place. */
  let opened = $state<string | null>(null);
  $effect(() => {
    void query;
    all = { steps: false, controls: false };
    opened = null;
    active = 0;
  });
  let steps = $derived(all.steps || scope ? found.steps : found.steps.slice(0, FIRST));
  let controls = $derived(all.controls ? found.controls : found.controls.slice(0, FIRST));
  type Row = { kind: "step"; s: FoundStep } | { kind: "control"; c: FindControl } | { kind: "term"; t: FindTerm };
  let rows = $derived<Row[]>([
    ...steps.map((s) => ({ kind: "step" as const, s })),
    ...controls.map((c) => ({ kind: "control" as const, c })),
    ...found.terms.map((t) => ({ kind: "term" as const, t })),
  ]);
  let active = $state(0);
  let none = $derived(showing && rows.length === 0);
  /** What a screen reader hears as the results change. */
  let said = $derived.by(() => {
    if (!showing) return "";
    if (none) return `Nothing matches “${query.trim()}”`;
    if (scope) return `${scope.label}: ${found.steps.length} step${found.steps.length === 1 ? "" : "s"}`;
    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
    return [n(found.steps.length, "step"), n(found.controls.length, "control"), n(found.terms.length, "term")].join(", ");
  });

  const keyOf = (r: Row) => (r.kind === "step" ? `s:${r.s.id}` : r.kind === "control" ? `c:${r.c.id}` : `t:${r.t.term}`);
  const stateOf = (id: string) => (id === current ? "current" : done[id] !== undefined ? "done" : "todo");

  function choose(r: Row): void {
    if (r.kind === "step") onStep(r.s.id);
    else if (r.kind === "control" && r.c.step) onControl(r.c);
    else if (r.kind === "term") onTerm(r.t.term);
    else opened = opened === keyOf(r) ? null : keyOf(r);
  }
  async function move(by: number): Promise<void> {
    if (!rows.length) return;
    active = Math.max(0, Math.min(rows.length - 1, active + by));
    await tick();
    document.getElementById(`find-r-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }
  /** Show all keeps the active result where it was, and focus in the field. */
  async function showAll(section: "steps" | "controls"): Promise<void> {
    const r = rows[active];
    const was = r ? keyOf(r) : null;
    all = { ...all, [section]: true };
    await tick();
    const at = rows.findIndex((x) => keyOf(x) === was);
    active = at < 0 ? 0 : at;
    input?.focus();
  }
  // On the window, so the keys still reach Find when focus is not in the field.
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      void move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      void move(-1);
    } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) {
      const r = rows[active];
      if (r) {
        e.preventDefault();
        choose(r);
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== input && !(e.target instanceof HTMLButtonElement && e.key === " ")) {
      // A letter typed anywhere in Find goes to the field, never to the page behind it.
      input?.focus();
    }
  }
  function fill(word: string): void {
    query = word;
    input?.focus();
  }
  onMount(() => input?.focus());
</script>

<svelte:window onkeydown={onKey} />

<!-- The match marked in a title, a step's value or a term's definition. -->
{#snippet title(text: string)}
  {@const m = marked(text, query)}
  {#if m}{m[0]}<mark>{m[1]}</mark>{m[2]}{:else}{text}{/if}
{/snippet}

{#snippet head(name: string, count: number, id: string)}
  <div class="head" {id}><b>{name}</b><span>{count}</span></div>
{/snippet}

<div class="scrim" aria-hidden="true" onclick={onClose}></div>
<div class="find" role="dialog" aria-modal="true" aria-label="Find" tabindex="-1" use:trapFocus>
  <div class="bar">
    <button class="back" type="button" aria-label="Close Find" onclick={onClose}><Icon name="chevron-left" /></button>
    <div class="field">
      <Icon name="find" />
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-controls="find-steps find-controls find-terms"
        aria-autocomplete="list"
        aria-activedescendant={rows[active] ? `find-r-${active}` : undefined}
        aria-label="Find a step, control or term"
        placeholder="Find a step, control or term"
        autocomplete="off"
        spellcheck="false"
      />
      {#if query}<button class="clear" type="button" aria-label="Clear" onclick={() => fill("")}><Icon name="x" /></button>{/if}
    </div>
    <kbd class="esc">Esc</kbd>
  </div>
  <p class="said" role="status">{said}</p>
  {#if scope}
    <!-- Opened on a set of steps: its name and count, and × to search everything again. -->
    <div class="scope">
      <span><b>{scope.label}</b> · {found.steps.length} step{found.steps.length === 1 ? "" : "s"}</span>
      <button
        type="button"
        class="unscope"
        aria-label="Search every step, control and term"
        onclick={() => {
          scope = null;
          all = { steps: false, controls: false };
          opened = null;
          active = 0;
          input?.focus();
        }}><Icon name="x" /></button
      >
    </div>
  {/if}
  <div class="results">
    {#if !showing}
      <div class="start">
        <p class="help">Search every step, control and term for this aircraft: a step’s title or value, a control, a panel or a word you don’t know.</p>
        <div class="try">
          <span>Try</span>
          <div class="chips">
            {#each TRY as word (word)}<button type="button" onclick={() => fill(word)}>{word}</button>{/each}
          </div>
        </div>
      </div>
    {:else if none}
      <div class="none">
        <b>Nothing matches “{query.trim()}”</b>
        <p class="help">Find looks through every step, control and term for this aircraft. Check the spelling, or try a panel or control name, like Fuel or MCP.</p>
      </div>
    {:else}
      {#if found.steps.length}
        {@render head("Steps", found.steps.length, "find-steps-h")}
        <div class="group" id="find-steps" role="listbox" aria-labelledby="find-steps-h">
          {#each steps as s, i (s.id)}
            {@const st = stateOf(s.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="opt" role="option" tabindex="-1" id="find-r-{i}" aria-selected={active === i} onclick={() => onStep(s.id)}>
              <span class="ic st-{st}" role="img" aria-label={st === "current" ? "Current step" : st === "done" ? "Done" : "To do"}
                ><Icon name="find-{st}" /></span
              >
              <span class="txt"
                ><span class="t">{@render title(s.title)}</span><span class="sub"
                  ><span>{s.stage} › {s.phaseTitle}</span><span class="val">{@render title(foundValue(s, answered.options))}</span></span
                ></span
              >
              <span class="end">{#if st === "current"}<span class="now">Current</span>{/if}<Icon name="chevron-right" /></span>
            </div>
          {/each}
        </div>
        {#if found.steps.length > FIRST && !all.steps && !scope}
          <button class="all" type="button" onclick={() => void showAll("steps")}>Show all {found.steps.length} steps</button>
        {/if}
      {/if}
      {#if found.controls.length}
        {@render head("Controls", found.controls.length, "find-controls-h")}
        <div class="group" id="find-controls" role="listbox" aria-labelledby="find-controls-h">
          {#each controls as c, i (c.id)}
            {@const at = steps.length + i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="opt"
              class:opened={opened === `c:${c.id}`}
              role="option"
              tabindex="-1"
              id="find-r-{at}"
              aria-selected={active === at}
              onclick={() => choose({ kind: "control", c })}
            >
              <span class="ic kind"><Icon name="find-control" /></span>
              <span class="txt"
                ><span class="t">{@render title(c.name)}</span><span class="sub">{c.where}</span>{#if opened === `c:${c.id}`}<span
                    class="sub">{c.location}</span
                  >{/if}</span
              >
              <span class="end"><Icon name="chevron-right" /></span>
            </div>
          {/each}
        </div>
        {#if found.controls.length > FIRST && !all.controls}
          <button class="all" type="button" onclick={() => void showAll("controls")}>Show all {found.controls.length} controls</button>
        {/if}
      {/if}
      {#if found.terms.length}
        {@render head("Terms", found.terms.length, "find-terms-h")}
        <div class="group" id="find-terms" role="listbox" aria-labelledby="find-terms-h">
          {#each found.terms as t, i (t.term)}
            {@const at = steps.length + controls.length + i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="opt"
              role="option"
              tabindex="-1"
              id="find-r-{at}"
              aria-selected={active === at}
              onclick={() => choose({ kind: "term", t })}
            >
              <span class="ic kind"><Icon name="find-term" /></span>
              <span class="txt"><span class="t">{@render title(t.term)}</span><span class="sub mean">{@render title(t.meaning)}</span></span>
              <span class="end"><Icon name="chevron-right" /></span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
  {#if showing && !none}
    <div class="keys" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd><i>Move</i></span>
      <span><kbd>Enter</kbd><i>Open</i></span>
      <span><kbd>Esc</kbd><i>Close</i></span>
      <span class="fill"></span>
      <span>{findKey} opens Find from any page</span>
    </div>
  {/if}
</div>

<style>
  /* From 900 px (FindDesk): the dialog over the scrim. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: var(--color-scrim);
  }
  .find {
    position: fixed;
    top: calc(2 * var(--space-10) + var(--space-2));
    left: 50%;
    z-index: 61;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: calc(16 * var(--space-10));
    max-width: calc(100vw - 2 * var(--gutter));
    max-height: calc(100dvh - 2 * (2 * var(--space-10) + var(--space-2)));
    overflow: hidden;
    transform: translateX(-50%);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-popover);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
    color: var(--color-text);
  }
  .find:focus {
    outline: none;
  }
  .bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    height: calc(var(--space-10) + var(--space-4) + var(--space-1));
    padding: 0 calc(var(--space-2) + var(--border-thick)) 0 calc(var(--space-4) + var(--border-thick));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .back {
    display: none;
  }
  /* Opened on a set of steps: a line under the field naming it, with × to leave it. */
  .scope {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-2) 0 calc(var(--space-4) + var(--border-thick));
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .scope b {
    color: var(--color-text);
    font-weight: var(--weight-semibold);
  }
  .unscope {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    border: 0;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .field {
    display: flex;
    flex: 1;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    min-width: 0;
    color: var(--color-text-muted);
  }
  .field input {
    flex: 1;
    min-width: 0;
    height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text-strong);
    font: inherit;
    font-size: calc(var(--font-size-body) + var(--border-thin));
    caret-color: var(--color-accent);
  }
  .field input::placeholder {
    color: var(--color-text-muted);
  }
  .field input:focus-visible {
    outline: none;
  }
  .clear,
  .back {
    place-items: center;
    flex: none;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-muted);
  }
  .clear {
    display: grid;
  }
  .clear :global(.icon) {
    width: calc(var(--space-4) + var(--border-thick));
    height: calc(var(--space-4) + var(--border-thick));
  }
  kbd {
    flex: none;
    padding: var(--border-thin) calc(var(--space-1) + var(--border-thin));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--space-1);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
  }
  .esc {
    color: var(--color-text-muted);
  }
  .results {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-2) var(--space-2);
    scrollbar-width: none;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .said {
    position: absolute;
    width: var(--border-thin);
    height: var(--border-thin);
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: calc(var(--space-1) + var(--border-thick));
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-3) var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .head b {
    font-weight: var(--weight-semibold);
  }
  .opt {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
    box-sizing: border-box;
    min-height: calc(var(--space-10) + var(--space-4));
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  /* The active result (keyboard): the current-row fill and a 1.5 px inset accent ring. */
  .opt[aria-selected="true"] {
    background: var(--color-current-row);
    box-shadow: inset 0 0 0 calc(1.5 * var(--border-thin)) var(--color-accent);
  }
  .ic {
    display: flex;
    flex: none;
    width: var(--size-icon);
    height: var(--size-icon);
  }
  .ic :global(.icon) {
    width: 100%;
    height: 100%;
  }
  .st-current {
    color: var(--color-accent);
  }
  .st-done {
    color: var(--color-done);
  }
  .st-todo {
    color: var(--color-todo-ring);
  }
  .kind {
    color: var(--color-text-secondary);
  }
  .txt {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thick);
    min-width: 0;
  }
  .t {
    color: var(--color-text);
    font-size: var(--font-size-body);
  }
  mark {
    padding: 0 var(--border-thin);
    border-radius: calc(var(--border-thick) + var(--border-thin));
    background: var(--color-accent-soft);
    color: var(--color-text-strong);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: var(--border-thick) var(--space-2);
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  /* A long value clamps to two lines. */
  .val {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  /* A term's definition on one line (the Glossary holds it whole). */
  .mean {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .end {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    color: var(--color-text-muted);
  }
  .end :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .now {
    color: var(--color-accent-text);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .all {
    display: flex;
    flex: none;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3) 0 calc(var(--space-10) + var(--space-1));
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .help {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .none {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: calc(var(--space-6) + var(--space-1)) var(--space-6) var(--space-8);
  }
  .none b {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .start {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: calc(var(--space-4) + var(--space-1)) var(--space-6) var(--space-6);
  }
  .try {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .try > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chips button {
    height: calc(var(--space-8) + var(--space-1));
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .keys {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-4);
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-4) + var(--border-thick));
    border-top: var(--border-thin) solid var(--color-line);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .keys > span {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .keys i {
    margin-left: var(--border-thick);
    font-style: normal;
  }
  .keys .fill {
    flex: 1;
  }

  /* Below 900 px (FindPhone): a full-screen sheet, a back button and a boxed field; rows edge to
     edge with lines between them, no keys. */
  @media (max-width: 899px) {
    .scrim {
      display: none;
    }
    .find {
      inset: 0;
      width: auto;
      max-width: none;
      max-height: none;
      transform: none;
      border: 0;
      border-radius: 0;
      background: var(--color-sheet);
      box-shadow: none;
    }
    .bar {
      gap: var(--space-1);
      height: calc(var(--space-10) + var(--space-4) + var(--space-1));
      padding: 0 var(--space-3) 0 var(--space-1);
    }
    .back {
      display: grid;
      color: var(--color-text-secondary);
    }
    .field {
      gap: var(--space-2);
      height: var(--size-touch-min);
      box-sizing: border-box;
      padding-left: var(--space-3);
      border: var(--border-thin) solid var(--color-field-border);
      border-radius: var(--radius-control);
      background: var(--color-field);
    }
    .field input {
      height: auto;
    }
    .esc,
    .keys {
      display: none;
    }
    .results {
      flex: 1;
      padding: 0;
    }
    .head {
      padding: var(--space-4) calc(var(--space-3) + var(--border-thick)) calc(var(--space-1) + var(--border-thick));
    }
    .opt {
      padding: var(--space-2) calc(var(--space-3) + var(--border-thick));
      border-bottom: var(--border-thin) solid var(--color-line);
      border-radius: 0;
    }
    .opt[aria-selected="true"] {
      background: none;
      box-shadow: none;
    }
    .all {
      padding: 0 calc(var(--space-3) + var(--border-thick)) 0 calc(var(--space-10) + var(--space-1) + var(--border-thick));
      border-bottom: var(--border-thin) solid var(--color-line);
    }
    .none {
      padding: var(--space-8) calc(var(--space-4) + var(--space-1));
    }
    .start {
      padding: var(--space-6) var(--space-4);
    }
  }
</style>
