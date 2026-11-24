<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The privacy note (#52; Privacy board, PrivacyPage and PrivacyPagePhone): what the app stores, where,
and what it sends, reached from Settings' last line. It is part of the app, so it works offline.
The text must stay true: when what the app stores or sends changes, this page and SECURITY.md
change with it.
-->
<script lang="ts">
  import { onDesktop } from "../host";
  import { settingsHref } from "../route.svelte";

  let { version }: { version: string | null } = $props();

  /** The desktop app's text (#116, DeskPrivacy): the same sections, true of files on the computer,
   * the update check and an app downloaded from GitHub releases. */
  const desktop = onDesktop();
  const GITHUB_PRIVACY = "https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement";
</script>

<article class="privacy" aria-labelledby="privacy-title">
  <div class="head">
    <h1 id="privacy-title">Privacy</h1>
    <p class="lead">Involo keeps everything on this {desktop ? "computer" : "device"}. Here’s what that means.</p>
  </div>
  <section aria-labelledby="privacy-stored">
    <h2 id="privacy-stored">What’s stored</h2>
    <ul>
      <li>Your progress on each flight: ticks, skips, timers, briefings and where you are.</li>
      <li>Your settings, including the SimBrief username or pilot ID you typed.</li>
      <li>
        The flight plan you imported, in short form: route, numbers and weather, with no names or other
        personal fields.
      </li>
      <li>Your flight log and practice results.</li>
      <li>The packs you installed.</li>
    </ul>
    <p>Nothing else that could identify you.</p>
  </section>
  <section aria-labelledby="privacy-kept">
    <h2 id="privacy-kept">Where it’s kept</h2>
    {#if desktop}
      <p>
        In Involo’s data folder on this computer. There’s no account and nothing is copied anywhere else.
        Deleting that folder removes all of it.
      </p>
    {:else}
      <p>
        In this browser, on this device only. There’s no account and nothing is copied anywhere else. Clearing
        this site’s data in your browser removes all of it.
      </p>
    {/if}
  </section>
  <section aria-labelledby="privacy-sent">
    <h2 id="privacy-sent">What’s sent</h2>
    <p>Nothing is sent to us: no analytics, no tracking and no cookies.</p>
    {#if desktop}
      <p>When you import a plan, Involo asks SimBrief for it directly, with the username you typed.</p>
      <p>
        When it starts, Involo asks GitHub whether a newer version is out, unless you turn off Settings › Check
        for updates. It also reads the pack catalog from the Involo site when you add or update a pack. Neither
        request carries anything about you.
      </p>
      <p>
        Report a problem with a step opens GitHub’s issue form in your browser. Nothing is sent unless you submit
        it there.
      </p>
    {:else}
      <p>
        When you import a plan, your browser asks SimBrief for it directly, with the username you typed. Other
        than that, Involo connects only to its own site, to load the app, its updates and the packs you add.
      </p>
      <p>
        Report a problem with a step opens GitHub’s issue form in a new tab. Nothing is sent unless you submit
        it there.
      </p>
    {/if}
  </section>
  <section aria-labelledby="privacy-host">
    <h2 id="privacy-host">Where the app comes from</h2>
    {#if desktop}
      <p>
        You downloaded Involo from its GitHub releases. Like any website host, GitHub records visitors’ IP
        addresses, for downloads and the update check too, under
        <a href={GITHUB_PRIVACY} target="_blank" rel="noopener noreferrer">GitHub’s privacy statement</a>.
      </p>
    {:else}
      <p>
        Involo is served by GitHub Pages. Like any website host, GitHub records visitors’ IP addresses, under
        <a href={GITHUB_PRIVACY} target="_blank" rel="noopener noreferrer">GitHub’s privacy statement</a>.
      </p>
    {/if}
  </section>
  <section aria-labelledby="privacy-copy">
    <h2 id="privacy-copy">Keep a copy</h2>
    {#if desktop}
      <p>
        Your data is files on this computer. Save a backup file to keep a copy, or to move your progress to
        another computer or the web app: <a href={settingsHref("backup")}>Settings › Back up and restore</a>.
      </p>
    {:else}
      <p>
        Because everything lives in this browser, save a backup file from time to time:
        <a href={settingsHref("backup")}>Settings › Back up and restore</a>.
      </p>
    {/if}
  </section>
  {#if version}<p class="ver">Involo {version}</p>{/if}
</article>

<style>
  /* PrivacyPage: a column up to 680 px; 26 px between the title block and the sections. */
  .privacy {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-6) + var(--border-thick));
    max-width: calc(17 * var(--space-10));
    color: var(--color-text);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
  }
  h1 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-page-title);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }
  .lead {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
    line-height: var(--leading-normal);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--font-size-body);
    line-height: var(--leading-normal);
  }
  /* The section headings: 18 px. */
  h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-semibold);
    line-height: var(--leading-tight);
  }
  p,
  ul {
    margin: 0;
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-left: calc(var(--space-4) + var(--space-1));
  }
  a {
    color: var(--color-link);
  }
  /* The running version: 13 px, muted. */
  .ver {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  /* PrivacyPagePhone: 22 px between blocks, the title at 26, the text at 15, headings at 17. */
  @media (max-width: 599px) {
    .privacy {
      gap: calc(var(--space-4) + var(--space-1) + var(--border-thick));
    }
    h1 {
      font-size: calc(var(--font-size-section-title) + var(--border-thick));
    }
    .lead,
    section {
      font-size: calc(var(--font-size-secondary) + var(--border-thin));
    }
    h2 {
      font-size: calc(var(--font-size-body) + var(--border-thin));
    }
  }
</style>
