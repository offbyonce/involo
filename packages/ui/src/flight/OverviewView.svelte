<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Overview (FSOverview): "Still to enter" lists every value the steps still need, each linking to
its field; "This flight" holds the key values the pack's overview rows name (or one row per page),
each linking to its section.
-->
<script lang="ts">
  import { flightHref } from "../route.svelte";
  import { overviewRows, sections, toEnter, type Ctx } from "./sections";

  let { ctx, descriptions }: { ctx: Ctx; descriptions: boolean } = $props();

  const sectionOf = (id: string) => sections().find((s) => s.groups.some((g) => g.rows.some((r) => r.id === id)));
  const first = (text: string) => text.split(/(?<=\.)\s/)[0] ?? text;

  let missing = $derived(toEnter(ctx.values));
  /** "This flight": the pack's rows, or one per page. */
  let flightRows = $derived(overviewRows(ctx));
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
</script>

<section class="card" aria-label="Still to enter">
  <div class="ghead">
    <h3>Still to enter</h3>
    <span class="fill"></span>
    <span class="note">{missing.length} {missing.length === 1 ? "value" : "values"}</span>
  </div>
  {#each missing as row (row.id)}
    {@const s = sectionOf(row.id)}
    <div class="orow">
      <span class="label">{row.label}</span>
      <a class="enter" href={s ? flightHref(s.id, row.field) : "#"}>— enter{row.placeholder && row.placeholder !== "Enter" ? ` ${row.placeholder.charAt(0).toLowerCase()}${row.placeholder.slice(1)}` : ""}</a>
      <span class="about">
        {#if descriptions}<span class="desc">{first(row.desc)}</span>{/if}
        {#if s}<a class="go" href={flightHref(s.id)}>{s.title} ›</a>{/if}
      </span>
    </div>
  {:else}
    <div class="orow none"><span class="desc">Nothing the steps need is missing.</span></div>
  {/each}
</section>
<section class="card" aria-label="This flight">
  <div class="ghead">
    <h3>This flight</h3>
    <span class="fill"></span>
    {#if ctx.plan}<span class="note">From SimBrief, {time(ctx.plan.loadedAt)}</span>{/if}
  </div>
  {#each flightRows as row (row.label)}
    <div class="orow">
      <span class="label">{row.label}</span>
      <span class="ro">{row.value}</span>
      <span class="about">
        {#if descriptions}<span class="desc">{row.desc}</span>{/if}
        <a class="go" href={flightHref(row.page)}>{row.title} ›</a>
      </span>
    </div>
  {/each}
</section>

<style>
  .card {
    flex: none;
    margin: 0;
    max-width: calc(26 * var(--space-10));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: 0 calc(var(--space-4) + var(--space-1));
  }
  h3 {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .fill {
    flex: 1;
  }
  .note {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .orow {
    display: grid;
    grid-template-columns:
      calc(4 * var(--space-10) + var(--space-3))
      calc(3 * var(--space-10) + var(--space-6) + var(--space-1) + var(--border-thick))
      minmax(0, 1fr);
    column-gap: var(--space-4);
    align-items: start;
    padding: var(--space-3) calc(var(--space-4) + var(--space-1));
    border-top: var(--border-thin) solid var(--color-line);
  }
  .orow.none {
    display: block;
  }
  .label {
    padding-top: calc(var(--space-3) - var(--border-thin));
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .ro,
  .enter {
    padding-top: calc(var(--space-3) - var(--border-thin));
    font-family: var(--font-mono);
    font-size: var(--font-size-value-mono);
    overflow-wrap: anywhere;
  }
  /* Ink, as the board draws it; the section link under the description is the blue one. */
  .enter {
    color: var(--color-text);
    text-decoration: none;
  }
  .about {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space-1) + var(--border-thick));
    padding-top: calc(var(--space-3) - var(--border-thin));
  }
  .desc {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .go {
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    text-decoration: none;
  }
  /* Each link's tap area reaches the 44 px touch size with nothing drawn: "— enter" upward over
     its row's label, the page link downward over the row's padding, so in a row with both, the two
     areas never meet. */
  .enter,
  .go {
    position: relative;
  }
  .enter::before,
  .go::before {
    position: absolute;
    inset: 0;
    content: "";
  }
  .enter::before {
    top: min(0px, calc(100% - var(--size-touch-min)));
  }
  .go::before {
    bottom: min(0px, calc(100% - var(--size-touch-min)));
  }
  @media (max-width: 599px) {
    .orow {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--space-2);
    }
    .label,
    .ro,
    .enter,
    .about {
      padding-top: 0;
    }
  }
</style>
