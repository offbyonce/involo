<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Settings, laid out as in 3.0: one row per choice with a segmented control. The host saves them
on the device (decision 0012).
-->
<script lang="ts">
  import type { Settings } from "@involo/bindings";
  import { lastBackupLine } from "../lib/backup";
  import Icon from "../lib/Icon.svelte";
  import Toggle from "../lib/Toggle.svelte";

  let {
    settings,
    version,
    seats = [],
    hasEssentials = true,
    canKeepAwake = true,
    essentialsChanged = null,
    start = null,
    onChange,
    onBackup = () => {},
    onRestore = () => {},
    onResetEssentials = () => {},
    onStart = () => {},
    onClearAll = () => {},
    row = null,
  }: {
    settings: Settings;
    version: string | null;
    /** Your seat's choices (decision 0029); none for a pack with one seat view or none. */
    seats?: { id: string; label: string }[];
    /** The pack marks quick steps; without them the Steps row (Full or Essentials) is left out. */
    hasEssentials?: boolean;
    onChange: (s: Settings) => void;
    /** Whether this browser can keep the screen on (#245); without it, Keep screen awake is off and disabled. */
    canKeepAwake?: boolean;
    /** The open pack's Essentials changes (#245): how many steps added and removed; null without Essentials. */
    essentialsChanged?: { added: number; removed: number } | null;
    /** The pack's start option, the one its turnaround rule names (#245), with the flight's value; null without one. */
    start?: { title: string; choices: { value: string; label: string }[]; value: string } | null;
    onResetEssentials?: () => void;
    onStart?: (value: string) => void;
    onClearAll?: () => void;
    /** Save a backup file (#47): written at once, no dialog. */
    onBackup?: () => void;
    /** Restore from a file: the file the pilot chose, for the review. */
    onRestore?: (file: File) => void;
    /** A row to scroll to, by its heading's id without `set-` (`#/settings/backup`, from the privacy note). */
    row?: string | null;
  } = $props();
  $effect(() => {
    if (row) document.getElementById(`set-${row}`)?.closest(".set")?.scrollIntoView?.({ block: "start" });
  });
  let picker = $state<HTMLInputElement | null>(null);
  /** No seat chosen yet: "Where is this?" shows the first seat's view, so that one is selected. */
  let seat = $derived(seats.some((s) => s.id === settings.seat) ? settings.seat : (seats[0]?.id ?? null));
  /** The release notes, on the project's own releases page. */
  /** What's new (#54): the release of the running version, tagged `v<version>`. */
  const releaseFor = (v: string) => `https://github.com/offbyonce/involo/releases/tag/v${encodeURIComponent(v)}`;

  type Row = {
    key: "listView" | "essentials" | "detail" | "theme" | "textSize" | "dimming";
    title: string;
    text: string;
    choices: [string | number | boolean, string][];
  };
  const ROWS: Row[] = [
    {
      key: "listView",
      title: "View",
      text: "List shows full lists you tick. Step by step shows one step at a time in large text.",
      choices: [
        ["checklist", "List"],
        ["flow", "Step by step"],
      ],
    },
    {
      key: "essentials",
      title: "Steps",
      text: "Full is maximum immersion, with every step. Essentials is only what you need, in the right order, to get off the ground fast.",
      choices: [
        [false, "Full"],
        [true, "Essentials"],
      ],
    },
    {
      key: "detail",
      title: "Step info",
      text: "Detailed shows where each control is and lets you open a step for more. Simple shows only the step and its setting.",
      choices: [
        ["expanded", "Detailed"],
        ["quick", "Simple"],
      ],
    },
    {
      key: "theme",
      title: "Appearance",
      text: "Auto follows your system setting.",
      choices: [
        ["system", "Auto"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
    },
    {
      key: "textSize",
      title: "Text and controls size",
      text: "Scales everything, on top of the automatic wide-screen scaling.",
      choices: [
        ["100", "100%"],
        ["115", "115%"],
        ["130", "130%"],
      ],
    },
    {
      key: "dimming",
      title: "Dimming",
      text: "Dims the whole screen for a dark room. Text stays readable at every step.",
      choices: [
        [0, "Off"],
        [1, "1"],
        [2, "2"],
        [3, "3"],
        [4, "4"],
      ],
    },
  ];
</script>

<h1>Settings</h1>
<p class="lead">Choose how the checklist looks. Your choices stay in place when you clear a flight.</p>
{#snippet preview()}
  <!-- Settings › Panel preview in steps (round 6, R6Settings): On or Off. -->
  <div class="set">
    <div>
      <b id="set-preview">Panel preview in steps</b>
      <p>The small outline of the panel beside each step. Show panel and Where is this? always work.</p>
    </div>
    <Toggle on={settings.panelPreview} labelledby="set-preview" onToggle={() => onChange({ ...settings, panelPreview: !settings.panelPreview })} />
  </div>
  {#if seats.length > 1}
    <!-- Settings › Your seat (SeatSetting board): the title, the seats, then what it does. Both
         choices on one line when they fit; otherwise one under the other, never cut short. -->
    <div class="set seat">
      <b id="set-seat">Your seat</b>
      <div class="seg seats" role="radiogroup" aria-labelledby="set-seat">
        {#each seats as s (s.id)}
          <button type="button" role="radio" aria-checked={seat === s.id} onclick={() => onChange({ ...settings, seat: s.id })}>{s.label}</button>
        {/each}
      </div>
      <p>Panel views show what you see from this seat.</p>
    </div>
  {/if}
  {#if start}
    <!-- Settings › Start (#245, RelSettings): the same setting as Flight › Start options. -->
    <div class="set">
      <div>
        <b id="set-start">Start</b>
        <p>How a new flight begins. The same setting as Flight › Start options.</p>
      </div>
      <div class="seg" role="radiogroup" aria-labelledby="set-start">
        {#each start.choices as c (c.value)}
          <button type="button" role="radio" aria-checked={start.value === c.value} onclick={() => onStart(c.value)}>{c.label}</button>
        {/each}
      </div>
    </div>
  {/if}
  <!-- Settings › Back up and restore (#47, BackupSetting board): after Your seat, or after Panel
       preview when there is no seat setting. On a phone the buttons stack, full width. -->
  <div class="set backup">
    <b id="set-backup">Back up and restore</b>
    <p>One file holds every pack’s flight and plan, your settings and the flight log. Keep a copy somewhere safe: clearing this browser’s site data removes everything saved here.</p>
    <div class="acts" role="group" aria-labelledby="set-backup">
      <button class="btn" type="button" onclick={onBackup}><Icon name="download" />Save a backup file</button>
      <button class="btn" type="button" onclick={() => picker?.click()}><Icon name="file-add" />Restore from a file…</button>
    </div>
    <span class="last">{lastBackupLine(settings.lastBackup ?? null)}</span>
    <input
      bind:this={picker}
      type="file"
      accept=".json,application/json"
      hidden
      onchange={(e) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (file) onRestore(file);
      }}
    />
  </div>
  <!-- Settings › Timer chime (Settings board, #213): the Settings board puts it after Map in steps,
       now Panel preview; the newer SeatSetting and BackupSetting boards keep Your seat and Back up
       and restore right after Panel preview, so it follows them. -->
  <div class="set">
    <div>
      <b id="set-chime">Timer chime</b>
      <p>Plays when a step timer reaches zero.</p>
    </div>
    <Toggle on={settings.chime} labelledby="set-chime" onToggle={() => onChange({ ...settings, chime: !settings.chime })} />
  </div>
{/snippet}
<div class="card">
  {#each ROWS.filter((r) => hasEssentials || r.key !== "essentials") as row (row.key)}
    <div class="set">
      <div>
        <b id="set-{row.key}">{row.title}</b>
        <p>{row.text}</p>
      </div>
      <div class="seg" role="radiogroup" aria-labelledby="set-{row.key}">
        {#each row.choices as [value, label] (String(value))}
          <button
            type="button"
            role="radio"
            aria-checked={settings[row.key] === value}
            onclick={() =>
              onChange({
                ...settings,
                [row.key]: value,
              })}>{label}</button
          >
        {/each}
      </div>
    </div>
    {#if row.key === "textSize"}{@render preview()}{/if}
    {#if row.key === "essentials" && essentialsChanged}
      <!-- Settings › Your Essentials (#245, RelSettings): what the pilot changed, and Reset. -->
      {@const changed = essentialsChanged.added + essentialsChanged.removed}
      <div class="set">
        <div>
          <b id="set-yours">Your Essentials</b>
          <p>
            {changed
              ? `You’ve changed ${changed} ${changed === 1 ? "step" : "steps"}: ${essentialsChanged.added} added, ${essentialsChanged.removed} removed. Reset puts back the pack’s own Essentials.`
              : "You’re using the pack’s own Essentials."}
          </p>
        </div>
        <button class="btn" type="button" aria-describedby="set-yours" disabled={!changed} onclick={onResetEssentials}>Reset to default</button>
      </div>
    {/if}
    {#if row.key === "dimming"}
      <!-- Settings › Keep screen awake (#245, RelSettings): after the display settings. -->
      <div class="set">
        <div>
          <b id="set-awake">Keep screen awake</b>
          <p>
            Stops the screen dimming or locking while Involo is open. It uses more battery.{canKeepAwake
              ? " Where the browser can’t keep the screen on, this row says so."
              : " This browser can’t keep the screen on."}
          </p>
        </div>
        <Toggle on={canKeepAwake && !!settings.keepAwake} labelledby="set-awake" disabled={!canKeepAwake} onToggle={() => onChange({ ...settings, keepAwake: !settings.keepAwake })} />
      </div>
    {/if}
  {/each}
  <!-- Settings › Clear all progress (#245, RelSettings): last on the page; it clears at once, with Undo. -->
  <div class="set">
    <div>
      <b id="set-clear">Clear all progress</b>
      <p>Clears the saved flight in every pack: ticks, skips, timers, the flight plan and where you are. Your settings, backups and the flight log stay.</p>
    </div>
    <button class="btn danger-outline" type="button" aria-describedby="set-clear" onclick={onClearAll}>Clear all progress</button>
  </div>
</div>
<div class="done"><a class="btn primary" href="#/">Done</a></div>
<!-- The last line (PrivacySetting board): the version, What's new (its release, in a new tab) and
     Privacy (the privacy note, in the app), each link a 44 px target. -->
<p class="ver">
  {#if version}
    <span>Involo {version}</span>
    <span aria-hidden="true">·</span>
    <a href={releaseFor(version)} target="_blank" rel="noopener noreferrer">What’s new</a>
    <span aria-hidden="true">·</span>
  {/if}
  <a href="#/privacy">Privacy</a>
</p>

<style>
  /* Clear all progress (RelSettings): the danger-outline button. */
  .danger-outline {
    border-color: var(--color-danger);
    background: transparent;
    color: var(--color-danger);
  }
  /* PrivacySetting: 14 px, muted, wrapping, 10 px between the parts. */
  .ver {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 calc(var(--space-2) + var(--border-thick));
    margin: var(--space-1) var(--space-1) 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .ver a {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    color: var(--color-link);
    text-decoration: none;
  }
  h1 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-section-title);
    font-weight: 650;
  }
  .lead {
    margin: 0 0 var(--space-4);
    color: var(--color-text-muted);
  }
  .set {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4) var(--space-8);
    padding: var(--space-4);
    border-top: var(--border-thin) solid var(--color-border);
  }
  .set:first-child {
    border-top: 0;
  }
  .set b {
    font-weight: var(--weight-semibold);
  }
  .set p {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-secondary);
  }
  /* Equal segments, in one aligned column on every row. */
  .seg {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
  }
  .seg button {
    min-width: 0;
    min-height:  var(--size-touch-min);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
  }
  .seg button[aria-checked="true"] {
    background: var(--color-surface);
    box-shadow: inset 0 0 0 var(--size-focus-ring) var(--color-accent);
    color: var(--color-text);
  }
  /* Your seat: stacked, its seats side by side when both fit whole, else one per line. */
  .set.seat {
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
    gap: var(--space-3);
  }
  .set.seat p {
    margin: 0;
  }
  .seats {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
  }
  .seats button {
    flex: 1 1 auto;
    padding-block: var(--space-2);
    text-align: center;
  }
  /* Back up and restore: stacked like Your seat; the buttons side by side, stacked on a phone. */
  .set.backup {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .set.backup p {
    margin: 0;
  }
  .set.backup .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .set.backup .btn :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .last {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  /* The toggle switch (rules.md components; R6Settings). */
  .done {
    display: flex;
    justify-content: flex-end;
  }
  @media (max-width: 599px) {
    .set {
      grid-template-columns: 1fr;
    }
    .set.backup .acts {
      flex-direction: column;
    }
    .set.backup .btn {
      justify-content: center;
    }
  }
</style>
