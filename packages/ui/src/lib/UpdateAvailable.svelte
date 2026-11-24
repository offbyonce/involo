<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Update available (#116; desktop boards, DeskUpdate and DeskUpdateNarrow): at launch, when GitHub's
latest release is newer than the running app, a band at the top of the main column in the backup
reminder's form (the surface with an accent edge). Download and What's new open the release's page
in the browser, so the pilot picks the right installer; Not now hides this version for good. Notify
only (0005): nothing is downloaded or installed by the app.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    version,
    running,
    onDownload,
    onNews,
    onLater,
  }: {
    /** The newer release's version. */
    version: string;
    /** The running app's version. */
    running: string;
    onDownload: () => void;
    onNews: () => void;
    onLater: () => void;
  } = $props();
</script>

<section class="update" aria-label="Update available">
  <div class="body">
    <span class="mark"><Icon name="download" /></span>
    <div class="text">
      <span class="title">Involo {version} is available</span>
      <span class="line"
        >You have {running}. Download the new version from GitHub and install it over this one. Your progress,
        settings and packs are kept.</span
      >
    </div>
  </div>
  <div class="acts">
    <button class="btn primary get" type="button" onclick={onDownload}>Download</button>
    <button class="btn secondary news" type="button" onclick={onNews}>What’s new</button>
    <button class="later" type="button" onclick={onLater}>Not now</button>
  </div>
</section>

<style>
  /* DeskUpdate: 16 px by 20, a 4 px accent edge, 12 px between the text and the buttons when
     they wrap and 20 px across. */
  .update {
    display: flex;
    align-items: center;
    gap: var(--space-3) calc(var(--space-4) + var(--space-1));
    margin-bottom: var(--space-4);
    padding: var(--space-4) calc(var(--space-4) + var(--space-1));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    box-shadow: inset var(--space-1) 0 0 var(--color-accent);
  }
  .body {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .mark {
    display: flex;
    margin-top: var(--border-thin);
    color: var(--color-accent);
  }
  .mark :global(svg) {
    flex: none;
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .title {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .line {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--leading-normal);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  /* Download: the accent button, 15 px semibold, 16 px each side. What's new: the secondary
     button, 15 px, 14 px each side. Not now: a 15 px link. */
  .get,
  .news {
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    white-space: nowrap;
  }
  .get {
    padding: 0 var(--space-4);
  }
  .later {
    display: inline-flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-link);
    font: inherit;
    font-size: calc(var(--font-size-secondary) + var(--border-thin));
    white-space: nowrap;
  }
  /* DeskUpdateNarrow: the text above, the buttons stretched across the band under it. */
  @media (max-width: 599px) {
    .update {
      flex-direction: column;
      align-items: stretch;
      padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    }
    .acts {
      flex-direction: column;
      align-items: stretch;
    }
    .later {
      justify-content: center;
    }
  }
</style>
