<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

An alert message's text as the pack writes it, as the alert display shows it (Alert messages
boards): Geist Mono, semibold, in its level's text color, in a box. `large` is the selected
message's.
-->
<script lang="ts">
  import type { MessageLevel } from "@involo/bindings";

  let { text, level, large = false }: { text: string; level: MessageLevel; large?: boolean } = $props();
</script>

<span class="msg {level}" class:large>{text}</span>

<style>
  .msg {
    display: inline-flex;
    align-items: center;
    min-height: var(--space-8);
    padding: 0 calc(var(--space-2) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: calc(var(--radius-small) + var(--border-thick));
    background: var(--color-surface-2);
    font-family: var(--font-mono);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .large {
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    font-size: calc(var(--font-size-panel-title) + var(--border-thick));
  }
  .warning {
    color: var(--color-danger-text);
  }
  .caution,
  .advisory {
    color: var(--color-open-text);
  }
  .memo {
    color: var(--color-text-secondary);
  }
  .status {
    color: var(--color-text-muted);
  }
</style>
