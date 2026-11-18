<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

An alert message's text as the pack writes it, as the alert display shows it (Alert messages
boards): Geist Mono, semibold, in its level's text color, in a box. `large` is the selected
message's; `compact` is a Find result's (FindMessages), whose text may mark the match.
-->
<script lang="ts">
  import type { MessageLevel } from "@involo/bindings";
  import type { Snippet } from "svelte";

  let {
    text,
    level,
    large = false,
    compact = false,
    children,
  }: {
    text: string;
    level: MessageLevel;
    large?: boolean;
    compact?: boolean;
    /** The text with its match marked, in place of `text`. */
    children?: Snippet | undefined;
  } = $props();
</script>

<span class="msg {level}" class:large class:compact>{#if children}<span>{@render children()}</span>{:else}{text}{/if}</span>

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
  .compact {
    min-height: calc(var(--space-6) + var(--space-1));
    padding: 0 var(--space-2);
    border-radius: var(--radius-small);
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
