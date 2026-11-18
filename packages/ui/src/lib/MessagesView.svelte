<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The Flight deck page's Alert messages tab (MsgDesk and MsgPhone boards), from the pack's
messages: a search, a filter for each level the pack uses after All, and the list. On desktop and
tablet the selected message's details sit beside the list: what it means, what to do (the list
that deals with it, or why none is needed) and the steps that deal with it. On a phone a tapped
message opens in place. The app never shows which messages are on in the simulator (0006).
-->
<script lang="ts">
  import type { Message, MessageLevel } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import Icon from "./Icon.svelte";
  import LevelBadge from "./LevelBadge.svelte";
  import MessageText from "./MessageText.svelte";
  import { levelCounts, levelName, matches, messageHref, stepPlace } from "./messages";

  let {
    index,
    selected: selectedId,
    phone = false,
    onStep,
  }: {
    index: PackIndex;
    /** The message in the address, if any. */
    selected: string | null;
    phone?: boolean;
    onStep: (id: string) => void;
  } = $props();

  let query = $state("");
  let level = $state<MessageLevel | null>(null);
  let all = $derived(index.messages);
  let levels = $derived(levelCounts(all));
  let shown = $derived(all.filter((m) => (level === null || m.level === level) && matches(m, query)));
  /** Desktop: the address's message, or the first shown; a phone opens only the one tapped. */
  let selected = $derived(all.find((m) => m.id === selectedId) ?? (phone ? null : (shown[0] ?? null)));
  const go = (href: string) => location.replace(href);
  /** The list that deals with a message, opened at its first step. */
  const openList = (m: Message) => {
    const first = m.list ? index.list(m.list)?.steps[0] : undefined;
    if (first) onStep(first.id);
  };
</script>

{#snippet find()}
  <label class="find">
    <span class="cap">Find a message</span>
    <span class="field"><Icon name="search" /><input bind:value={query} placeholder="Message text or meaning" /></span>
  </label>
{/snippet}

{#snippet filters()}
  <div class="filters" role="group" aria-label="Show messages by level">
    <button type="button" aria-pressed={level === null} onclick={() => (level = null)}>All <span class="n">{all.length}</span></button>
    {#each levels as l (l.level)}
      <button type="button" aria-pressed={level === l.level} onclick={() => (level = l.level)}
        >{levelName(l.level)} <span class="n">{l.count}</span></button
      >
    {/each}
  </div>
{/snippet}

{#snippet whatToDo(m: Message)}
  {@const list = m.list ? index.list(m.list) : undefined}
  {#if list}
    <button class="to-list" type="button" onclick={() => openList(m)}>{list.title}<Icon name="chevron-right" /></button>
  {:else if m.noList}
    <p class="text">{m.noList}</p>
  {/if}
{/snippet}

{#if phone}
  <div class="phone">
    {@render find()}
    {@render filters()}
    <div class="rows">
      {#each shown as m (m.id)}
        {#if selected?.id === m.id}
          <div class="open">
            <button class="head" type="button" aria-expanded="true" onclick={() => go(messageHref())}>
              <MessageText text={m.text} level={m.level} /><LevelBadge level={m.level} />
            </button>
            <div class="more">
              <span class="text">{m.meaning}</span>
              {@render whatToDo(m)}
              <span class="cap">{(m.steps ?? []).length ? `Mentioned in ${(m.steps ?? []).length} step${(m.steps ?? []).length === 1 ? "" : "s"}` : "No steps mention it."}</span>
            </div>
          </div>
        {:else}
          <button class="closed" type="button" aria-expanded="false" onclick={() => go(messageHref(m.id))}>
            <span class="line"><MessageText text={m.text} level={m.level} /><LevelBadge level={m.level} /></span>
            <span class="meaning">{m.meaning}</span>
          </button>
        {/if}
      {/each}
    </div>
  </div>
{:else}
  <div class="desk">
    <div class="main">
      <div class="intro">
        <h2>Alert messages</h2>
        <span>The messages this aircraft’s alert display can show, what each means, and the procedure that deals with it.</span>
      </div>
      <div class="tools">{@render find()}{@render filters()}</div>
      <div class="list">
        {#each shown as m (m.id)}
          <a
            class="row"
            href={messageHref(m.id)}
            aria-current={selected?.id === m.id ? "true" : undefined}
            onclick={(e) => (e.preventDefault(), go(messageHref(m.id)))}
          >
            <span><MessageText text={m.text} level={m.level} /></span>
            <span><LevelBadge level={m.level} /></span>
            <span class="meaning">{m.meaning}</span>
          </a>
        {/each}
      </div>
    </div>
    <aside class="details" aria-label="Message details">
      {#if selected}
        <div class="shown">
          <MessageText text={selected.text} level={selected.level} large />
          <span class="badge-line"><LevelBadge level={selected.level} /><span class="cap">As shown on the alert display</span></span>
        </div>
        <div class="block"><h3>What it means</h3><span class="text">{selected.meaning}</span></div>
        {#if selected.list || selected.noList}
          <div class="block"><h3>What to do</h3>{@render whatToDo(selected)}</div>
        {/if}
        <div class="block steps">
          <h3>Steps that mention it</h3>
          {#each selected.steps ?? [] as id (id)}
            <a href={messageHref(selected.id)} onclick={(e) => (e.preventDefault(), onStep(id))}>{stepPlace(index, id) ?? id}</a>
          {:else}
            <p class="text">No steps mention it.</p>
          {/each}
        </div>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .desk {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) calc(114 * var(--space-1));
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6) var(--space-8);
    overflow: auto;
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .intro span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: 1.5;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-4);
  }
  .find {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: calc(9 * var(--space-10));
    max-width: 100%;
  }
  .cap {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-field-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-text-muted);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .field:focus-within {
    outline: var(--border-thick) solid var(--color-accent);
    outline-offset: var(--border-thick);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filters button {
    min-height: calc(var(--size-touch-min) - var(--space-2));
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
  }
  .filters button[aria-pressed="true"] {
    border: var(--size-focus-ring) solid var(--color-accent);
    background: var(--color-accent-soft);
    box-shadow: none;
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .n {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  [aria-pressed="true"] .n {
    color: var(--color-accent-text);
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: calc(52.5 * var(--space-1)) calc(24 * var(--space-1)) minmax(0, 1fr);
    align-items: center;
    gap: var(--space-4);
    box-sizing: border-box;
    min-height: calc(var(--size-touch-min) + var(--space-3));
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-thin) solid var(--color-line);
    border-radius: calc(var(--radius-small) + var(--border-thick));
    text-decoration: none;
  }
  .row[aria-current="true"] {
    background: var(--color-accent-soft);
  }
  .meaning {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: 1.45;
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    border-left: var(--border-thin) solid var(--color-line);
    background: var(--color-surface);
    overflow: auto;
  }
  .shown {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space-2) + var(--border-thick));
  }
  .badge-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .badge-line .cap {
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .block.steps {
    gap: var(--border-thick);
  }
  h3 {
    margin: 0;
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .text {
    margin: 0;
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    line-height: 1.5;
  }
  .to-list {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    color: var(--color-link);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    text-align: left;
  }
  .to-list :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .steps a {
    display: flex;
    align-items: center;
    min-height: var(--size-touch-min);
    border-bottom: var(--border-thin) solid var(--color-line);
    color: var(--color-text);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  /* Phone (MsgPhone): the same list; a tapped message opens in place. */
  .phone {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: var(--space-4);
  }
  .phone .find {
    width: 100%;
  }
  .open {
    padding: var(--space-3) 0 var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .head,
  .closed {
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .head {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: var(--size-touch-min);
    padding: 0;
  }
  .more {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: calc(var(--space-2) + var(--border-thick));
  }
  .more .cap {
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .closed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: calc(var(--space-1) + var(--border-thick));
    min-height: calc(var(--size-touch-min) + var(--space-4) + var(--space-1));
    padding: calc(var(--space-2) + var(--border-thick)) 0;
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .line {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
  }
</style>
