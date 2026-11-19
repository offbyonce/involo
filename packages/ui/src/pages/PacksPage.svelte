<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
The Packs page (decision 0028; boards PacksDesktop, PacksPhone, PacksFirst and PacksRemove, dark and
light): the packs on this device, one card each, with the open one outlined and "In use", a waiting
update as a band in its card, Use this pack and Remove…; then More packs from the catalog with
Download, and Add a pack file…. With no packs it is the first launch: the welcome, the three steps
and the catalog, its first Download the primary button. Remove asks first. Everything comes from
the packs, the catalog and the saved flights.
-->
<script lang="ts" module>
  import type { CatalogEntry } from "@involo/bindings";
  import type { InstalledPack } from "../host";
  import type { SavedLine } from "../lib/packs";

  /** One installed pack as the page shows it. */
  export type PackRow = { pack: InstalledPack; saved: SavedLine | null; update: CatalogEntry | null };
  /** What the last install or removal said, when it needs saying. */
  export type PacksNotice = { title: string; lines: string[] };
</script>

<script lang="ts">
  import headerMark from "../icons/brand/header-mark.svg?raw";
  import Icon from "../lib/Icon.svelte";
  import { aircraftLine, sizeLabel } from "../lib/packs";
  import { trapFocus } from "../lib/trap";

  let {
    rows,
    more,
    current,
    catalogProblem = null,
    notice = null,
    busy = null,
    backHref,
    onUse,
    onDownload,
    onUpdate,
    onFile,
    onRemove,
    onRetry,
  }: {
    /** The packs on this device, the open one first. Empty: the first launch. */
    rows: PackRow[];
    /** The catalog's packs not on this device. */
    more: CatalogEntry[];
    /** The open pack's id. */
    current: string | null;
    /** Why the catalog couldn't be read (offline, say), or null. */
    catalogProblem?: string | null;
    notice?: PacksNotice | null;
    /** The pack being installed or removed (or "file"), while it is: its buttons wait. */
    busy?: string | null;
    backHref: string;
    onUse: (id: string) => void;
    onDownload: (entry: CatalogEntry) => void;
    onUpdate: (entry: CatalogEntry) => void;
    onFile: (file: File) => void;
    onRemove: (id: string, alsoFlight: boolean) => void;
    onRetry: () => void;
  } = $props();

  const wideQuery = "(min-width: 600px)";
  let wide = $state(typeof window !== "undefined" && (window.matchMedia?.(wideQuery).matches ?? true));
  $effect(() => {
    const mq = window.matchMedia?.(wideQuery);
    if (!mq) return;
    const read = () => (wide = mq.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  });

  let first = $derived(rows.length === 0);
  let fileInput = $state<HTMLInputElement | null>(null);
  /** The pack Remove… asked about, and whether its flight goes too. */
  let removing = $state<PackRow | null>(null);
  let alsoFlight = $state(false);
  let removeBack: HTMLElement | null = null;
  let cancelButton = $state<HTMLButtonElement | null>(null);

  function askRemove(row: PackRow, e: MouseEvent): void {
    removeBack = e.currentTarget as HTMLElement;
    alsoFlight = false;
    removing = row;
  }
  function closeRemove(): void {
    removing = null;
    removeBack?.focus();
    removeBack = null;
  }
  $effect(() => {
    if (removing) cancelButton?.focus();
  });

  function chosen(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) onFile(file);
  }

  const versionOf = (v: string) => `v${v}`;
</script>

<svelte:window
  onkeydown={(e) => {
    if (removing && e.key === "Escape") closeRemove();
  }}
/>

<input class="file" type="file" accept=".involo-pack,application/json" bind:this={fileInput} onchange={chosen} tabindex="-1" aria-hidden="true" />

{#snippet addFile()}
  <button class="btn" type="button" disabled={busy !== null} onclick={() => fileInput?.click()}><Icon name="file-add" />Add a pack file…</button>
{/snippet}

{#snippet notices()}
  {#if notice}
    <div class="notice" role="alert">
      <b>{notice.title}</b>
      {#if notice.lines.length === 1}<span>{notice.lines[0]}</span>{:else if notice.lines.length > 1}<ul>
          {#each notice.lines as line, i (i)}<li>{line}</li>{/each}
        </ul>{/if}
    </div>
  {/if}
{/snippet}

{#snippet catalogRow(entry: CatalogEntry, primary: boolean)}
  <article class="more">
    <div class="who">
      <h3>{entry.name}</h3>
      <div class="meta"><span>{aircraftLine(entry.aircraft)}</span><span class="mono">{`${versionOf(entry.version)} · ${sizeLabel(entry.size)}`}</span></div>
    </div>
    <button class={primary ? "btn primary" : "btn"} type="button" disabled={busy !== null} aria-label={`Download ${entry.name}`} onclick={() => onDownload(entry)}
      ><Icon name="download" />{busy === entry.id ? "Downloading…" : "Download"}</button
    >
  </article>
{/snippet}

{#snippet catalogTrouble()}
  {#if catalogProblem}
    <div class="notice" role="status">
      <span>{catalogProblem}</span>
      <button class="link" type="button" onclick={onRetry}>Try again</button>
    </div>
  {/if}
{/snippet}

{#snippet card(row: PackRow)}
  {@const inUse = row.pack.summary.id === current}
  {@const name = row.pack.summary.name}
  <article class="pk" class:use={inUse} aria-label={name}>
    <div class="top">
      <div class="who">
        <div class="title">
          <h3>{name}</h3>
          {#if inUse}<span class="tag use">In use</span>{/if}
          {#if row.pack.source === "file"}<span class="tag">Not from the Involo catalog</span>{/if}
        </div>
        <div class="meta"><span>{aircraftLine(row.pack.summary.aircraft)}</span><span class="mono">{versionOf(row.pack.summary.version)}</span></div>
      </div>
      {#if wide}
        <div class="acts">
          {#if !inUse}<button class="btn primary" type="button" disabled={busy !== null} onclick={() => onUse(row.pack.summary.id)}>Use this pack</button>{/if}
          <button class="btn" type="button" disabled={busy !== null} aria-label={`Remove ${name}…`} onclick={(e) => askRemove(row, e)}>Remove…</button>
        </div>
      {/if}
    </div>
    <div class="saved">
      {#if row.saved}
        {@const label = `Saved flight: ${row.saved.where}`}
        <div class="line"><span>{label}</span><span class="mono">{`${row.saved.done}/${row.saved.total}`}</span></div>
        <div class="bar" role="progressbar" aria-valuenow={row.saved.done} aria-valuemin="0" aria-valuemax={row.saved.total} aria-label={label}>
          <div style:width={`${row.saved.total ? (row.saved.done / row.saved.total) * 100 : 0}%`}></div>
        </div>
      {:else}
        <span class="none">No saved flight yet</span>
      {/if}
    </div>
    {#if row.update}
      <div class="update">
        <span class="ic"><Icon name="download" /></span>
        <span class="txt"><b>{`Version ${row.update.version} is available.`}</b> Your ticks are kept when you update.</span>
        <button class="btn primary short" type="button" disabled={busy !== null} aria-label={`Update ${name} to version ${row.update.version}`} onclick={() => row.update && onUpdate(row.update)}
          >{busy === row.pack.summary.id ? "Updating…" : "Update"}</button
        >
      </div>
    {/if}
    {#if !wide}
      <div class="acts">
        {#if !inUse}<button class="btn primary" type="button" disabled={busy !== null} onclick={() => onUse(row.pack.summary.id)}>Use this pack</button>{/if}
        <button class="btn" type="button" disabled={busy !== null} aria-label={`Remove ${name}…`} onclick={(e) => askRemove(row, e)}>Remove…</button>
      </div>
    {/if}
  </article>
{/snippet}

<div class="packs" class:wide class:first data-app-ready="">
  {#if first}
    <main class="main">
      <div class="body">
        <div class="welcome">
          <span class="brand"><span class="mark" aria-hidden="true">{@html headerMark}</span>involo</span>
          <h1>Choose your first aircraft</h1>
          <p>Involo teaches the procedures of the aircraft in each pack. Start with one; you can add more and switch between them any time.</p>
        </div>
        <ol class="steps">
          <li><span class="n">1</span><span class="st"><b>Download a pack</b><span>The aircraft you fly in the simulator.</span></span></li>
          <li><span class="n">2</span><span class="st"><b>Load your flight</b><span>From SimBrief, or type it in.</span></span></li>
          <li><span class="n">3</span><span class="st"><b>Follow the steps</b><span>From cold and dark to shutdown.</span></span></li>
        </ol>
        {@render notices()}
        <section>
          <div class="sh">
            <div class="sht"><h2>Packs</h2><span>From the Involo catalog, checked before they install.</span></div>
            {@render addFile()}
          </div>
          {@render catalogTrouble()}
          <div class="list tight">
            {#each more as entry, i (entry.id)}{@render catalogRow(entry, i === 0)}{/each}
          </div>
        </section>
        <p class="foot">Every pack is checked when you add it. Packs hold data only: steps, panels and words, never code. Packs and saved flights stay on this device.</p>
      </div>
    </main>
  {:else}
    <header class="head">
      {#if wide}
        <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
        <div class="ttl"><h1>Packs</h1><span>The aircraft you can train on</span></div>
      {:else}
        <a class="icon" href={backHref} aria-label="Back"><Icon name="chevron-left" /></a>
        <div class="ttl"><h1>Packs</h1><span>{`${rows.length} on this device`}</span></div>
      {/if}
    </header>
    <main class="main">
      <div class="body">
        {@render notices()}
        <section>
          <div class="sh">
            <div class="sht">
              <h2>On this device</h2>
              <span>{wide ? "Switch packs any time; each keeps its own flight." : "Each pack keeps its own flight."}</span>
            </div>
            {#if wide}{@render addFile()}{/if}
          </div>
          <div class="list">
            {#each rows as row (row.pack.summary.id)}{@render card(row)}{/each}
          </div>
        </section>
        {#if !wide}<div>{@render addFile()}</div>{/if}
        {#if more.length || catalogProblem}
          <section>
            <div class="sh">
              <div class="sht">
                <h2>More packs</h2>
                <span>{wide ? "From the Involo catalog, checked before they install." : "From the Involo catalog."}</span>
              </div>
            </div>
            {@render catalogTrouble()}
            <div class="list tight">
              {#each more as entry (entry.id)}{@render catalogRow(entry, false)}{/each}
            </div>
          </section>
        {/if}
        {#if wide}<p class="foot">Every pack is checked when you add it. Packs hold data only: steps, panels and words, never code. Packs and saved flights stay on this device.</p>{/if}
      </div>
    </main>
  {/if}
</div>

{#if removing}
  {@const name = removing.pack.summary.name}
  <div class="scrim" aria-hidden="true"></div>
  <div class="center">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title" use:trapFocus>
      <h2 id="remove-title">{`Remove ${name}?`}</h2>
      <p>The pack leaves this device. You can download it again from Packs.</p>
      <label class="tick">
        <input type="checkbox" bind:checked={alsoFlight} />
        <span><span>Also remove its saved flight</span><small>Left unticked, the flight comes back if you add the pack again.</small></span>
      </label>
      <div class="row">
        <button class="btn" type="button" bind:this={cancelButton} onclick={closeRemove}>Cancel</button>
        <button
          class="btn danger"
          type="button"
          onclick={() => {
            const id = removing?.pack.summary.id;
            const flightToo = alsoFlight;
            removing = null;
            removeBack = null;
            if (id) onRemove(id, flightToo);
          }}>Remove</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .file {
    display: none;
  }
  .packs {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: var(--leading-tight);
  }
  /* The header (PacksDesktop): 60 px, the Checklist button and the 20 px title; phone: 56 px. */
  .head {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3) + var(--border-thin));
    padding: 0 var(--space-3) 0 var(--space-1);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .wide .head {
    gap: var(--space-4);
    height: calc(var(--size-header) + var(--border-thin));
    padding: 0 var(--space-4);
  }
  .ttl {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: var(--leading-tight);
  }
  .ttl h1 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .wide .ttl h1 {
    font-size: var(--font-size-panel-title);
  }
  .ttl span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .back {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .icon {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .back :global(svg),
  .icon :global(svg),
  .btn :global(svg),
  .ic :global(svg) {
    flex: none;
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .main {
    flex: 1;
    padding: var(--space-4);
  }
  .wide .main {
    padding: var(--space-8) 0;
  }
  .wide.first .main {
    padding: calc(var(--space-8) * 2) 0;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-4) + var(--space-1));
  }
  .wide .body {
    gap: var(--space-8);
    max-width: calc(var(--size-content-max) - var(--space-10) * 4 + var(--space-6) * 2);
    margin: 0 auto;
    padding: 0 var(--space-6);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .sh {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .sht {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .sht span,
  .none {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .list.tight {
    gap: calc(var(--space-2) + var(--border-thick));
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
  .btn.primary,
  .btn.danger {
    padding: 0 var(--space-4);
    border: 0;
    background: var(--color-accent);
    box-shadow: none;
    color: var(--color-on-accent);
    font-weight: var(--weight-semibold);
  }
  .btn.danger {
    border: var(--border-thin) solid var(--color-danger);
    background: var(--color-danger);
  }
  .btn.short {
    min-height: var(--space-10);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .link {
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    cursor: pointer;
  }
  /* An installed pack's card (not the shared .card): the open one outlined in the accent. */
  .pk {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-3) + var(--border-thick));
    padding: calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-popover);
    background: var(--color-surface);
  }
  .pk.use {
    border: var(--size-focus-ring) solid var(--color-accent);
  }
  .pk .top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-6);
  }
  .who {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    min-width: 0;
  }
  .title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  h3 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
    letter-spacing: calc(var(--tracking-wordmark) / 2);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .mono {
    font-family: var(--font-mono);
  }
  /* "In use" (accent) and "Not from the Involo catalog" (neutral, never a warning color). */
  .tag {
    display: inline-flex;
    align-items: center;
    min-height: var(--space-6);
    padding: 0 var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .tag.use {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent-text);
  }
  .acts {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .pk > .acts {
    justify-content: flex-start;
  }
  .wide .saved {
    max-width: calc(var(--size-side-pane-tablet) - var(--space-4) - var(--space-1));
  }
  .saved .line {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: calc(var(--space-1) + var(--border-thick));
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .saved .line span:first-child {
    color: var(--color-text-secondary);
  }
  .saved .line .mono {
    color: var(--color-text-muted);
  }
  /* The saved flight's progress: the track in color.todo-ring, the fill in the accent. */
  .bar {
    height: calc(var(--space-1) + var(--border-thick));
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--color-todo-ring);
  }
  .bar div {
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
  }
  /* A waiting update: the open (amber) band. */
  .update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: calc(var(--space-2) + var(--border-thick)) var(--space-3);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-control);
    background: var(--color-open-bg);
  }
  .update .ic {
    display: flex;
    color: var(--color-open-text);
  }
  .update .txt {
    flex: 1;
    min-width: calc(var(--space-10) * 4 + var(--space-4) + var(--space-1));
    color: var(--color-text);
    font-size: var(--font-size-secondary);
  }
  .update b {
    color: var(--color-text-strong);
  }
  /* A catalog pack. */
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-popover);
    background: var(--color-surface);
  }
  .more .who {
    gap: var(--space-1);
    min-width: calc(var(--size-preview-max) - var(--space-4) - var(--space-1));
  }
  .more h3 {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
    letter-spacing: 0;
  }
  .foot {
    margin: 0;
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-open-border);
    border-radius: var(--radius-panel);
    background: var(--color-open-bg);
    color: var(--color-text);
    font-size: var(--font-size-secondary);
  }
  .notice b {
    color: var(--color-text-strong);
  }
  .notice ul {
    flex-basis: 100%;
    margin: 0;
    padding-left: var(--space-4);
  }
  /* The first launch (PacksFirst): the wordmark, the 32 px title, the three steps. */
  .welcome {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wordmark);
  }
  .mark {
    display: inline-flex;
  }
  .mark :global(svg) {
    width: calc(var(--space-4) + var(--border-thick));
    height: auto;
  }
  .welcome h1 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-page-title);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-wordmark);
  }
  .welcome p {
    max-width: calc(var(--size-side-pane) + var(--space-10) * 2 + var(--space-4) + var(--space-1));
    margin: 0;
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-body) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    margin: 0;
    padding: var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-popover);
    background: var(--color-surface);
    list-style: none;
  }
  .steps li {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: calc(var(--size-preview-max) - var(--space-10));
  }
  .steps .n {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: calc(var(--space-6) + var(--space-1));
    height: calc(var(--space-6) + var(--space-1));
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-accent-text);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .st {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .st b {
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .st span {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    line-height: var(--leading-snug);
  }
  /* Remove… (PacksRemove): the dialog over the scrim. */
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
  }
  .dialog h2 {
    font-size: var(--font-size-panel-title);
  }
  .dialog p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .tick {
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: var(--size-touch-min);
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
  }
  .tick input {
    width: calc(var(--space-4) + var(--space-1));
    height: calc(var(--space-4) + var(--space-1));
    margin: var(--border-thick) 0 0;
    accent-color: var(--color-accent);
  }
  .tick > span {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .tick small {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .dialog .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
