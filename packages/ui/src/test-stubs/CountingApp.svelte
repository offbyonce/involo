<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
A stand-in for App in Root's test: counts its mounts and restarts when its button is pressed.
-->
<script lang="ts" module>
  export const mounts = { count: 0 };
</script>

<script lang="ts">
  let { pack, onRestart }: { pack: string | null; onRestart: (pack: string | null) => void } = $props();
  mounts.count++;
  const mine = mounts.count;
</script>

<button type="button" onclick={() => onRestart(`pack-${mine + 1}`)}>{`Mount ${mine}${pack ? `: ${pack}` : ""}`}</button>
