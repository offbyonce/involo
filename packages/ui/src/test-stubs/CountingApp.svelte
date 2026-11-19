<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
A stand-in for App in Root's test: counts its mounts and restarts when its button is pressed.
-->
<script lang="ts" module>
  export const mounts = { count: 0 };
</script>

<script lang="ts">
  let { onRestart }: { onRestart: () => void } = $props();
  mounts.count++;
  const mine = mounts.count;
</script>

<button type="button" onclick={onRestart}>{`Mount ${mine}`}</button>
