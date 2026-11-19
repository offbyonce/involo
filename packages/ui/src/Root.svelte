<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
What the web app mounts: the app, started again from the start screen whenever the current pack
changes (decision 0028), so nothing of the pack that was open stays behind.
-->
<script lang="ts">
  import App from "./App.svelte";

  let run = $state(0);
</script>

{#key run}
  <App
    onRestart={() => {
      if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
      run++;
    }}
  />
{/key}
