<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A light's notes under its meaning (the LightNotes board, #211): each note the pack writes, as a
short bold label and the pack's text, in the board's order. A note the pack leaves empty is left
out, label and all; with none, nothing is drawn.
-->
<script lang="ts">
  let { when = "", action = "" }: { when?: string; action?: string } = $props();
  let notes = $derived(
    [
      { label: "When it comes on", text: when.trim() },
      { label: "What to do", text: action.trim() },
    ].filter((n) => n.text !== ""),
  );
</script>

{#each notes as n (n.label)}
  <span class="note"><span class="label">{n.label}</span><span class="text">{n.text}</span></span>
{/each}

<style>
  .note {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .label {
    color: var(--color-text);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
    line-height: var(--leading-tight);
  }
  .text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
</style>
