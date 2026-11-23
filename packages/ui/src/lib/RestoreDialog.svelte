<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Restoring a backup (#47; Backup board, RestoreReview, RestorePhone and RestoreRefused). The review
says what each part of the backup will change on this device and changes nothing until Restore;
Cancel and Esc change nothing. Every row starts ticked; an unticked row's part stays as it is here,
and with every row unticked Restore is disabled. A file that can't be restored gets the refusal,
which always says nothing changed. On a phone the review is the Remove dialog's phone form:
Download moves under its row's text and the buttons share the bottom row. A failed Download says
why on its row, as the Packs page does, and the row stays ticked, so its flight is still kept.
-->
<script lang="ts">
  import type { CatalogEntry } from "@involo/bindings";
  import type { ReviewFlight } from "./backup";
  import type { PackNotice } from "./packs";
  import Icon from "./Icon.svelte";
  import { trapFocus } from "./trap";

  export type Review = {
    kind: "review";
    /** The line under the title: when and by which version the backup was saved. */
    saved: string;
    flights: ReviewFlight[];
    /** The Flight log row's line, or null when the backup adds nothing to the log. */
    log: string | null;
    /** A muted line at the end of Also in the file: what a 3.0 file holds that isn't restored. */
    leftOut: string | null;
  };
  export type Refused = { kind: "refused"; line: string };
  export type Chosen = { flights: string[]; settings: boolean; log: boolean };

  let {
    shown,
    downloading = null,
    problems = {},
    onClose,
    onRestore,
    onDownload,
  }: {
    shown: Review | Refused;
    /** The pack being downloaded from the review, by id. */
    downloading?: string | null;
    /** A failed Download, on its row, by pack id: what the Packs page says for one. */
    problems?: Record<string, PackNotice>;
    onClose: () => void;
    onRestore: (chosen: Chosen) => void;
    onDownload: (entry: CatalogEntry) => void;
  } = $props();

  // Every row starts ticked; unticking leaves that part on this device as it is.
  let unticked = $state<Set<string>>(new Set());
  const ticked = (key: string) => !unticked.has(key);
  function toggle(key: string): void {
    const next = new Set(unticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    unticked = next;
  }
  let chosen = $derived<Chosen>(
    shown.kind === "review"
      ? {
          flights: shown.flights.map((f) => f.pack).filter((p) => ticked(`flight:${p}`)),
          settings: ticked("settings"),
          log: shown.log !== null && ticked("log"),
        }
      : { flights: [], settings: false, log: false },
  );
  let any = $derived(chosen.flights.length > 0 || chosen.settings || chosen.log);
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") onClose();
  }}
/>

<div class="scrim" aria-hidden="true"></div>
<div class="center" class:top={shown.kind === "review"}>
  {#if shown.kind === "refused"}
    <div class="dialog refused" role="dialog" aria-modal="true" aria-labelledby="restore-title" use:trapFocus>
      <h2 id="restore-title">This backup can’t be restored</h2>
      <div class="why"><Icon name="warning" /><p>{shown.line}</p></div>
      <p class="sub">Nothing on this device was changed.</p>
      <div class="row"><button class="btn" type="button" onclick={onClose}>Close</button></div>
    </div>
  {:else}
    <div class="dialog review" role="dialog" aria-modal="true" aria-labelledby="restore-title" use:trapFocus>
      <h2 id="restore-title">Restore from this backup?</h2>
      <p class="sub">{shown.saved}</p>
      <div class="rows">
        {#if shown.flights.length}
          <span class="head">Flights</span>
          {#each shown.flights as f (f.pack)}
            <div class="item">
              <label class="tick">
                <input type="checkbox" checked={ticked(`flight:${f.pack}`)} onchange={() => toggle(`flight:${f.pack}`)} />
                <span class="txt">
                  <span class="name"><b>{f.name}</b>{#if f.version !== null}<span class="mono">v{f.version}</span>{/if}{#if f.badge}<span class="tag">{f.badge}</span>{/if}{#if !f.installed}<span class="tag">Not installed</span>{/if}</span>
                  {#if f.inBackup}<span class="line">{f.inBackup}</span>{/if}
                  <span class="line" class:replaces={f.device.replaces} class:muted={!f.device.replaces}>{f.device.text}</span>
                  {#if f.upgrade}<span class="line muted">{f.upgrade}</span>{/if}
                </span>
              </label>
              {#if f.download}
                {@const entry = f.download}
                <button class="btn get" type="button" disabled={downloading !== null} onclick={() => onDownload(entry)}><Icon name="download" />{downloading === f.pack ? "Downloading…" : "Download"}</button>
              {/if}
              {#if problems[f.pack]}
                {@const p = problems[f.pack]}
                <div class="notice" role="alert">
                  <b>{p?.title}</b>
                  {#if p?.lines.length === 1}<span>{p.lines[0]}</span>{:else if p && p.lines.length > 1}<ul>
                      {#each p.lines as line, i (i)}<li>{line}</li>{/each}
                    </ul>{/if}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
        <span class="head">Also in the file</span>
        <div class="item">
          <label class="tick">
            <input type="checkbox" checked={ticked("settings")} onchange={() => toggle("settings")} />
            <span class="txt"><span class="name"><b>Settings</b></span><span class="line">Replaces your settings on this device: theme, view, seat and the rest.</span></span>
          </label>
        </div>
        {#if shown.log !== null}
          <div class="item">
            <label class="tick">
              <input type="checkbox" checked={ticked("log")} onchange={() => toggle("log")} />
              <span class="txt"><span class="name"><b>Flight log</b></span><span class="line">{shown.log}</span></span>
            </label>
          </div>
        {/if}
        {#if shown.leftOut}<p class="line muted left-out">{shown.leftOut}</p>{/if}
      </div>
      <div class="row">
        <button class="btn" type="button" onclick={onClose}>Cancel</button>
        <button class="btn primary" type="button" disabled={!any || downloading !== null} onclick={() => onRestore(chosen)}>Restore</button>
      </div>
    </div>
  {/if}
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
    max-width: 100%;
    max-height: calc(100dvh - var(--space-8));
    padding: var(--space-6);
    border: var(--border-thin) solid var(--color-popover-border);
    border-radius: var(--radius-sheet);
    background: var(--color-popover-surface);
    box-shadow: var(--color-overlay-shadow);
  }
  .refused {
    width: var(--size-side-pane);
  }
  .review {
    width: calc(var(--size-side-pane) + var(--space-10) * 3);
  }
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .sub {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  .why {
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-2) + var(--border-thick));
    color: var(--color-open-text);
  }
  .why :global(svg) {
    flex: none;
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
    margin-top: var(--border-thick);
  }
  .why p {
    margin: 0;
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  /* The rows scroll inside the dialog when the backup holds many flights. */
  .rows {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
  .head {
    padding-top: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-top: var(--border-thin) solid var(--color-line);
  }
  .tick {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }
  .tick input {
    flex: none;
    width: calc(var(--space-4) + var(--space-1));
    height: calc(var(--space-4) + var(--space-1));
    margin: var(--border-thick) 0 0;
    accent-color: var(--color-accent);
  }
  .txt {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--border-thick) + var(--border-thin));
    min-width: 0;
  }
  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .name b {
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .mono {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
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
  .line {
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    line-height: var(--leading-snug);
  }
  .line.replaces {
    color: var(--color-open-text);
  }
  .line.muted {
    color: var(--color-text-muted);
  }
  /* A 3.0 file's "Not brought across" line, closing Also in the file like a row without a box. */
  .left-out {
    margin: 0;
    padding: var(--space-3) 0 0;
    border-top: var(--border-thin) solid var(--color-line);
  }
  /* A failed Download (the Packs page's notice), under the row's text. */
  .notice {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    flex-basis: calc(100% - var(--space-4) - var(--space-1) - var(--space-3));
    align-items: center;
    box-sizing: border-box;
    margin-left: calc(var(--space-4) + var(--space-1) + var(--space-3));
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
  .btn.get {
    flex: none;
    min-height: var(--space-10);
  }
  .btn :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  /* Phone (RestorePhone): from the top, Download under its row's text, the buttons sharing the
     bottom row. */
  @media (max-width: 599px) {
    .center.top {
      align-items: flex-start;
      padding: var(--space-6) var(--space-4);
    }
    .dialog {
      gap: calc(var(--space-3) + var(--border-thick));
      max-height: 100%;
      padding: calc(var(--space-4) + var(--space-1));
    }
    .review {
      width: 100%;
    }
    .item {
      flex-wrap: wrap;
    }
    .tick {
      flex-basis: 100%;
    }
    .btn.get {
      margin-left: calc(var(--space-4) + var(--space-1) + var(--space-3));
    }
    .row .btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>
