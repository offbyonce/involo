<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
What changed in a pack update (decision 0028; PacksUpdate board): with `tags`, the counts as tags
(added in the done colors, reworded in the accent, removed neutral); otherwise one row per change:
its tag, the step (a link to it while it is still there) and its place; a reworded step's changed
fields with the old wording struck through above the new; a removed step the flight had ticked
says so. Used by the update note and by the Packs page's What's new.
-->
<script lang="ts">
  import type { PackChanges } from "@involo/bindings";

  let {
    changes,
    tags = false,
    onStep,
    stepHref = () => null,
  }: {
    changes: PackChanges;
    /** The counts as tags, in place of the rows. */
    tags?: boolean;
    /** Goes to a step still in the pack; without it, names are plain text. */
    onStep?: ((id: string) => void) | undefined;
    /** The address of a step's phase, for the link; null when it has none. */
    stepHref?: (id: string) => string | null;
  } = $props();

  /** Fields shown in the mono face, as steps show them. */
  const MONO = new Set(["Value", "Check", "If not"]);
</script>

{#snippet title(step: string, name: string, place: string, link: boolean)}
  <span class="what">
    {#if link && onStep}<a
        class="step"
        href={stepHref(step) ?? "#/"}
        onclick={(e) => {
          e.preventDefault();
          onStep(step);
        }}>{name}</a
      >{:else}<span class="step plain">{name}</span>{/if}
    {#if place}<span class="place">{place}</span>{/if}
  </span>
{/snippet}

{#if tags}
  <span class="tags">
    {#if changes.added.length}<span class="tag added">{`+${changes.added.length} added`}</span>{/if}
    {#if changes.reworded.length}<span class="tag reworded">{`${changes.reworded.length} reworded`}</span>{/if}
    {#if changes.removed.length}<span class="tag removed">{`−${changes.removed.length} removed`}</span>{/if}
  </span>
{:else}
  <ul class="rows">
    {#each changes.added as row (row.step)}
      <li><span><span class="tag added">Added</span></span><span class="body">{@render title(row.step, row.title, row.place, true)}</span></li>
    {/each}
    {#each changes.reworded as row (row.step)}
      <li>
        <span><span class="tag reworded">Reworded</span></span>
        <span class="body">
          {@render title(row.step, row.title, row.place, true)}
          <span class="fields">
            {#each row.fields as f (f.field)}
              <span class="label">{f.field}</span>
              <span class:mono={MONO.has(f.field)}><s class="before">{f.before || "—"}</s><br /><span class="after">{f.after || "—"}</span></span>
            {/each}
          </span>
        </span>
      </li>
    {/each}
    {#each changes.removed as row (row.step)}
      <li>
        <span><span class="tag removed">Removed</span></span>
        <span class="body">
          {@render title(row.step, row.title, row.place, false)}
          {#if row.wasTicked}<span class="gone">You had ticked this step; the tick is gone with it.</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--space-1) + var(--border-thick));
    padding-top: var(--border-thick);
  }
  /* Change tags (Packs README): added in the done colors, reworded in the accent, removed neutral. */
  .tag {
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--space-6) - var(--border-thick));
    padding: 0 var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .tag.added {
    border-color: var(--color-done);
    background: var(--color-done-soft);
    color: var(--color-done);
  }
  .tag.reworded {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent-text);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rows li {
    position: relative;
    display: grid;
    grid-template-columns: calc(var(--space-10) * 2 + var(--space-4)) minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-top: var(--border-thin) solid var(--color-line);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) calc(var(--space-2) + var(--border-thick));
  }
  .step {
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
    text-decoration: none;
  }
  /* The whole row opens the step (a stretched target over the row, as on the checklist), so the
     tap target is the row's height, not the line's. */
  a.step::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  /* A removed step is gone from the pack: named, not linked. */
  .step.plain {
    color: var(--color-text-strong);
    cursor: default;
  }
  .place,
  .label,
  .before {
    color: var(--color-text-muted);
  }
  .place {
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .fields {
    display: grid;
    grid-template-columns: calc(var(--space-10) + var(--space-3)) minmax(0, 1fr);
    gap: var(--border-thick) var(--space-2);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    line-height: var(--leading-normal);
  }
  .mono {
    font-family: var(--font-mono);
  }
  .after {
    color: var(--color-text);
  }
  .gone {
    color: var(--color-text);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
</style>
