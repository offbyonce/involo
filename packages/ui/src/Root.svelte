<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
What the web app mounts: the app, started again from the start screen whenever the current pack
changes (decision 0028), so nothing of the pack that was open stays behind. The pack to open is
handed on as well as saved, so a switch holds even when the settings can't be saved.
-->
<script lang="ts">
  import App from "./App.svelte";

  let run = $state(0);
  /** The pack the last switch chose; null: the settings say. */
  let pack = $state<string | null>(null);
</script>

{#key run}
  <App
    {pack}
    onRestart={(next) => {
      pack = next;
      if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
      run++;
    }}
  />
{/key}
