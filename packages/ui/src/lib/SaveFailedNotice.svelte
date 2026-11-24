<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Shown while saves are refused (storage blocked by the browser, or full), in place of a save time:
the flight lasts only while the page is open. It goes once a save works again. Styled as the kept
notice beside it.
-->
<script lang="ts">
  import { onDesktop } from "../host";

  // No props: App shows it while saves fail.
  const desktop = onDesktop();
</script>

<div class="unsaved" role="alert">
  <p>
    <b>Progress isn’t being saved on this device.</b>
    {#if desktop}
      Involo can’t write to its data folder, so your ticks last only while the app is open. Check
      that the disk has free space, then restart Involo.
    {:else}
      This browser is blocking site data or is out of space for it, so your ticks last only while
      this page is open. Check that this browser allows saving site data.
    {/if}
  </p>
</div>

<style>
  .unsaved {
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-open-text);
    border-radius: var(--radius-panel);
    background: var(--color-open-bg);
  }
  p {
    margin: 0;
    font-size: var(--font-size-secondary);
  }
  b {
    font-weight: var(--weight-semibold);
  }
</style>
