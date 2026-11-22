<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The schematic CDU on one walkthrough page (#215, CduWalk boards), a panel drawing in the panel
colors: the screen with its title and page count, the six line select rows with keys 1L to 6L and
1R to 6R beside them (the page's keys in the panel's changed colors), the scratchpad, the function
key to press when the page has one, and a legend of the three text styles, so color is never the
only cue. It is one image with a full text alternative: the page, every row, the scratchpad and the
keys to press.
-->
<script lang="ts">
  import type { CduPageView, CduSpan } from "@involo/bindings";

  let { page, caption = true }: { page: CduPageView; caption?: boolean } = $props();

  const words = (spans: CduSpan[]) => spans.map((s) => s.text).join("").trim();
  /** Six rows always, as the CDU has: a page with fewer leaves the rest blank. */
  let rows = $derived(Array.from({ length: Math.max(6, page.screen.rows.length) }, (_, n) => page.screen.rows[n]));
  let lit = $derived(new Set(page.screen.highlight.map((k) => k.toUpperCase())));
  let alt = $derived.by(() => {
    const s = page.screen;
    const parts = [`Schematic CDU on the ${page.page} page`];
    const title = [words(s.title), words(s.page)].filter(Boolean).join(", ");
    if (title) parts.push(`Screen: ${title}`);
    rows.forEach((r, n) => {
      if (!r) return;
      for (const [side, label, value] of [
        ["L", r.leftLabel, r.left],
        ["R", r.rightLabel, r.right],
      ] as const) {
        const text = [words(label), words(value)].filter(Boolean).join(" ");
        if (text) parts.push(`${n + 1}${side}: ${text}`);
      }
      if (r.separator) parts.push(`Line ${n + 1}: ${r.separator}`);
    });
    const pad = words(s.scratchpad);
    if (pad) parts.push(`Scratchpad: ${pad}`);
    const keys = [...s.highlight, ...(page.key ? [`the ${page.key} key`] : [])];
    if (keys.length) parts.push(`Highlighted: ${keys.length > 1 ? `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}` : keys[0]}`);
    return `${parts.join(". ")}.`;
  });
</script>

{#snippet text(spans: CduSpan[])}{#each spans as s, n (n)}<span class={s.style ?? "plain"}>{s.text}</span>{/each}{/snippet}

{#snippet key(name: string)}
  <span class="key" class:lit={lit.has(name)}>{name}</span>
{/snippet}

<figure class="cdu" role="img" aria-label={alt}>
  <div class="screen">
    <div class="line">
      <span></span>
      <div class="title">
        <span class="side"></span>
        <span>{@render text(page.screen.title)}</span>
        <span class="side count">{@render text(page.screen.page)}</span>
      </div>
      <span></span>
    </div>
    {#each rows as r, n (n)}
      <div class="line row">
        {@render key(`${n + 1}L`)}
        <div class="mid">
          {#if r?.separator !== undefined && r?.separator !== null}
            <div class="sep">
              <span class="rule"></span>
              {#if r.separator}<span class="septext">{r.separator}</span><span class="rule"></span>{/if}
            </div>
          {:else}
            <div class="labels"><span>{#if r}{@render text(r.leftLabel)}{/if}</span><span>{#if r}{@render text(r.rightLabel)}{/if}</span></div>
          {/if}
          <div class="values"><span>{#if r}{@render text(r.left)}{/if}</span><span>{#if r}{@render text(r.right)}{/if}</span></div>
        </div>
        {@render key(`${n + 1}R`)}
      </div>
    {/each}
    <div class="line">
      <span></span>
      <div class="pad">{@render text(page.screen.scratchpad)}</div>
      <span></span>
    </div>
  </div>
  {#if page.key}
    <div class="fkey"><span class="fk">{page.key}</span><span>Key to press on the keypad</span></div>
  {/if}
  <div class="legend">
    <span><span class="sample data">123</span> From the airplane</span>
    <span><span class="sample accent">123</span> Calculated or accepted</span>
    <span><span class="sample user">123</span> You type it</span>
  </div>
  {#if caption}<figcaption>Schematic CDU. Highlighted keys are the ones this page uses.</figcaption>{/if}
</figure>

<style>
  /* The CduWalk boards' schematic: the panel's frame around the screen, 10 px in. */
  .cdu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: calc(var(--space-2) + var(--border-thick));
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-bg);
    color: var(--panel-label);
    font-size: var(--font-size-caption);
    line-height: var(--leading-tight);
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
    padding: var(--space-2) calc(var(--space-1) + var(--border-thick));
    border-radius: var(--radius-small);
    background: var(--panel-fill);
    font-family: var(--font-mono);
    /* Geist Mono joins a run of hyphens ("----") into one stroke that reaches over the key beside
       it; the CDU shows each dash. */
    font-variant-ligatures: none;
  }
  /* Each line: a key column either side of the text, 30 px (28 on a phone), 6 px apart. */
  .line {
    display: grid;
    grid-template-columns: var(--cdu-key) minmax(0, 1fr) var(--cdu-key);
    column-gap: calc(var(--space-1) + var(--border-thick));
    --cdu-key: calc(var(--space-8) - var(--border-thick));
  }
  .line.row {
    align-items: end;
  }
  .title,
  .values,
  .pad {
    color: var(--panel-text);
    font-size: var(--font-size-value-mono);
    line-height: calc(var(--space-6) - var(--border-thick));
    white-space: pre;
  }
  .title {
    display: flex;
    justify-content: space-between;
  }
  .side {
    width: calc(var(--font-size-value-mono) * 3);
  }
  .count {
    color: var(--panel-label);
    font-size: var(--font-size-caption);
    text-align: right;
  }
  .mid {
    min-width: 0;
  }
  /* Every row keeps its label and value lines, so the six rows sit where the CDU's do. */
  .labels,
  .sep {
    height: var(--space-4);
  }
  .labels {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--panel-label);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
    line-height: var(--space-4);
    white-space: pre;
  }
  .values {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: calc(var(--space-6) - var(--border-thick));
  }
  .sep {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  .rule {
    flex: 1;
    border-top: var(--border-thin) solid var(--panel-stroke);
  }
  .septext {
    color: var(--panel-text);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
    line-height: var(--space-4);
  }
  .pad {
    min-height: calc(var(--space-6) - var(--border-thick));
    margin-top: var(--space-1);
    padding-top: var(--border-thick);
    border-top: var(--border-thin) solid var(--panel-stroke);
  }
  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--cdu-key);
    height: var(--space-6);
    border: var(--border-thin) solid var(--panel-stroke);
    border-radius: var(--space-1);
    color: var(--panel-label);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
  }
  .key.lit,
  .fk {
    border: var(--border-thick) solid var(--panel-changed);
    background: var(--panel-changed-fill);
    color: var(--panel-changed-text);
    font-weight: var(--weight-bold);
  }
  /* The text styles: from the airplane, calculated or accepted, and typed by the pilot. */
  .plain,
  .data {
    color: var(--panel-text);
  }
  .accent {
    color: var(--color-accent-text);
  }
  .user {
    color: var(--color-text-strong);
    font-weight: var(--weight-bold);
  }
  .fkey {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    padding-top: var(--space-1);
  }
  .fk {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: calc(var(--space-8) - var(--border-thick));
    padding: 0 var(--space-3);
    border-radius: var(--radius-small);
    font-family: var(--font-mono);
    font-size: var(--font-size-caption);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) calc(var(--space-3) + var(--border-thick));
  }
  .sample {
    font-family: var(--font-mono);
    font-weight: var(--weight-regular);
  }
  .sample.user {
    font-weight: var(--weight-bold);
  }
  figcaption {
    color: var(--panel-label);
  }
  @media (max-width: 599px) {
    .line {
      --cdu-key: calc(var(--space-8) - var(--space-1));
    }
  }
</style>
