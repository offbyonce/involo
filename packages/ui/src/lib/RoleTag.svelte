<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

A crew role's tag (Roles board): the pack's short name in a neutral outline, the full name as
what a screen reader says. Roles are never colored, so status colors keep their meaning.
-->
<script lang="ts">
  import type { RoleLabel } from "@involo/bindings";

  let { role }: { role: RoleLabel } = $props();
</script>

<abbr class="role" title={role.title}><span aria-hidden="true">{role.short}</span><span class="sr-only">{role.title}</span></abbr>

<style>
  /* Roles board: 20 tall, 6 across, Geist Mono 11 semibold, text-secondary, a border outline,
     radius 4. */
  .role {
    display: inline-flex;
    flex: none;
    align-items: center;
    height: calc(var(--space-4) + var(--space-1));
    padding: 0 calc(var(--space-1) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--space-1);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: calc(var(--font-size-caption) - var(--border-thin));
    font-weight: var(--weight-semibold);
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
  }
</style>
