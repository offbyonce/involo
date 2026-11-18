<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

An alert message's level in a badge (Alert messages boards): its name always written, so it never
relies on color alone, in the level's existing tokens.
-->
<script lang="ts">
  import type { MessageLevel } from "@involo/bindings";
  import { levelName } from "./messages";

  let { level }: { level: MessageLevel } = $props();
</script>

<span class="badge {level}">{levelName(level)}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    min-height: var(--space-6);
    padding: 0 var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: transparent;
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .warning {
    border-color: var(--color-danger);
    background: var(--color-danger-soft);
    color: var(--color-danger-text);
  }
  .caution {
    border-color: var(--color-open-border);
    background: var(--color-open-bg);
    color: var(--color-open-text);
  }
  .advisory {
    border-color: var(--color-open-border);
    color: var(--color-open-text);
  }
  .memo {
    color: var(--color-text-secondary);
  }
  .status {
    color: var(--color-text-muted);
  }
</style>
