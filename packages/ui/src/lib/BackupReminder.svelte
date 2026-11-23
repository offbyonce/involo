<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The backup reminder (#243; Release board, RelReminder, RelReminderNever and RelReminderPhone): a
band at the top of the main column after a flight is logged, when the last backup is more than 30
days old or there has never been one. The surface with an accent edge: a suggestion, not a warning.
Save a backup file saves at once, as Settings does; Not now hides it for 30 days.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";

  let { line, onSave, onLater }: { line: string; onSave: () => void; onLater: () => void } = $props();
</script>

<section class="reminder" aria-label="Backup reminder">
  <div class="body">
    <span class="mark"><Icon name="download" /></span>
    <div class="text">
      <span class="title">Save a backup?</span>
      <span class="line">{line}</span>
    </div>
  </div>
  <div class="acts">
    <button class="btn save" type="button" onclick={onSave}><Icon name="download" />Save a backup file</button>
    <button class="later" type="button" onclick={onLater}>Not now</button>
  </div>
</section>

<style>
  .reminder {
    display: flex;
    align-items: center;
    gap: var(--space-3) calc(var(--space-4) + var(--space-1));
    margin-bottom: var(--space-4);
    padding: var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    box-shadow: inset var(--space-1) 0 0 var(--color-accent);
  }
  .body {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .mark {
    display: flex;
    margin-top: var(--border-thin);
    color: var(--color-accent);
  }
  .mark :global(svg),
  .save :global(svg) {
    flex: none;
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .title {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .line {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .save {
    padding: 0 calc(var(--space-3) + var(--border-thick));
    color: var(--color-text);
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    font-weight: var(--weight-regular);
    white-space: nowrap;
  }
  .later {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-link);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    white-space: nowrap;
  }
  /* RelReminderPhone: the text above, the buttons across the band under it. */
  @media (max-width: 599px) {
    .reminder {
      flex-direction: column;
      align-items: stretch;
      padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    }
    .acts {
      flex-direction: column;
      align-items: stretch;
    }
    .later {
      justify-content: center;
    }
  }
</style>
