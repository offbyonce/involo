<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The side pane for the selected step (round 6, R6PanePre; round 5 Checklist board above it): the
step and its value, Check, If not, a caution note, Why with How to do it and Terms, the location
line, and a label-free preview of each panel the step uses. The location line opens the
slide-out with Where it is expanded; a preview (or Show panel) opens it on that panel. Nothing
else is drawn; the rest of the pane stays empty. Approved additions: a Say line in the Check box
and a caution note under If not. A step with no control shows the steps coming up instead.
-->
<script lang="ts">
  import { stepValue } from "./answers.svelte";
  import { controlName, stepTitle } from "./names";
  import type { ItemTarget, Step, StepState } from "@involo/bindings";
  import type { PackIndex } from "../pack-index";
  import LevelBadge from "./LevelBadge.svelte";
  import MessageText from "./MessageText.svelte";
  import { messageHref } from "./messages";
  import Icon from "./Icon.svelte";
  import PanelPreview from "./PanelPreview.svelte";
  import type { Opening } from "./opening";
  import { glossaryHref } from "./glossary";
  import { panelName } from "./panel-name";
  import { stepTiles, tilesTitle } from "./step-tiles";

  let {
    index,
    step,
    targets,
    number,
    total,
    upcoming = [],
    preview = true,
    onOpen,
    flow = false,
    inline = false,
  }: {
    index: PackIndex;
    step: Step;
    targets: ItemTarget[];
    /** The step's place in its list, as shown: "Step 7 of 10". */
    number: number;
    total: number;
    upcoming?: { step: Step; state: StepState }[];
    /** Settings › Panel preview in steps; off, a Show panel button instead. */
    preview?: boolean;
    /** Opens the slide-out. */
    onOpen: (how: Opening) => void;
    /** Step by step view's pane (R6Flow): the location line and the previews only; it shows the step's
     * details itself. */
    flow?: boolean;
    /** Opened in the step's row (tablet portrait and phone): no heading, the row shows the step; Check
     * and If not side by side on tablet, the preview first on phone (Tablet and Mobile boards). */
    inline?: boolean;
  } = $props();


  let place = $derived(index.place(step));
  /** The alert messages that call for this step (MsgPane); none in a pack without messages. */
  let calledBy = $derived(index.messagesFor(step.id));
  let how = $derived(step.how ? index.how(step.how) : undefined);
  let explain = $derived(step.explain ? index.explain(step.explain) : undefined);
  let check = $derived(step.check ?? explain?.check ?? null);
  let checkMore = $derived([step.check ? step.checkDetail : explain?.checkDetail, explain?.success].filter(Boolean) as string[]);
  let ifNot = $derived(step.ifNot ?? explain?.ifNot ?? null);
  let ifNotMore = $derived([step.ifNot ? step.ifNotDetail : explain?.ifNotDetail, explain?.failure].filter(Boolean) as string[]);
  let why = $derived(step.why ?? explain?.why ?? null);
  let caution = $derived(step.note && step.noteCaution ? step.note : null);
  let background = $derived(step.note && !step.noteCaution ? step.note : null);
  let terms = $derived((step.terms ?? []).map((t) => ({ term: t, meaning: index.glossary(t) ?? "" })));

  let checkOpen = $state(false);
  let ifNotOpen = $state(false);
  let howOpen = $state(false);
  let termsOpen = $state(false);

  // The step's panels as tiles, in one preview card at thumbnail size.
  let tiles = $derived(stepTiles(index, step, targets));
  let drawnTiles = $derived(tiles.flatMap((t) => (t.kind === "drawn" ? [t] : [])));
  let listedTiles = $derived(tiles.flatMap((t) => (t.kind === "listed" ? [t] : [])));
  let cardName = $derived(tilesTitle(tiles, index.sideWords).title);
  /** The step's own control, for How to do it's link to its card. */
  let own = $derived.by(() => {
    const id = place?.control?.id;
    if (!id) return null;
    for (const t of targets) {
      const item = index.section(t.section)?.items[t.item];
      if (item?.controls?.includes(id)) return t;
    }
    return null;
  });
  const openOwn = () => {
    if (own) onOpen({ entry: "control", control: { section: own.section, item: own.item } });
  };
  let guardClosed = $derived(/\bGUARDS? CLOSED\b/i.test(step.expect));
  let where = $derived(place ? `${place.zone.area}` : "");
</script>

<div class="pane-step" class:inline>
  {#if !flow}
  {#if !inline}
  <div class="head">
    <span class="pos">Step {number} of {total} · {stepTitle(index, step)}</span>
    <span class="value">{stepValue(step)}</span>
  </div>
  {/if}
  {#if check || ifNot}<div class="cells">
  {#if check}
    <div class="box check">
      <div class="txt">
        <span class="cap">Check</span>
        <span class="main">{check}</span>
        {#if step.callout}<span class="say">Say: {step.callout}</span>{/if}
        {#if checkOpen}{#each checkMore as line, n (n)}<span class="more">{line}</span>{/each}{/if}
      </div>
      {#if checkMore.length}
        <button class="q" type="button" aria-label="Why this check" aria-expanded={checkOpen} onclick={() => (checkOpen = !checkOpen)}>?</button>
      {/if}
    </div>
  {/if}
  {#if ifNot}
    <div class="box ifnot">
      <div class="txt">
        <span class="cap">If not</span>
        <span class="main">{ifNot}</span>
        {#if ifNotOpen}{#each ifNotMore as line, n (n)}<span class="more">{line}</span>{/each}{/if}
      </div>
      {#if ifNotMore.length}
        <button class="q" type="button" aria-label="More about this case" aria-expanded={ifNotOpen} onclick={() => (ifNotOpen = !ifNotOpen)}>?</button>
      {/if}
    </div>
  {/if}
  </div>{/if}
  {#if caution}<p class="caution"><b>Caution</b> {caution}</p>{/if}

  {#if why || how?.length || explain || background || terms.length || (own && place?.control)}
    <div class="why">
      {#if why}<span><strong>Why</strong> {why}</span>{/if}
      {#if how?.length || explain || background || (own && place?.control)}
        <button class="lk" type="button" aria-expanded={howOpen} onclick={() => (howOpen = !howOpen)}>How to do it ⌄</button>
      {/if}
      {#if terms.length}
        <button class="lk" type="button" aria-expanded={termsOpen} onclick={() => (termsOpen = !termsOpen)}>Terms: {terms.map((t) => t.term).join(", ")} ⌄</button>
      {/if}
    </div>
    {#if howOpen}
      <div class="open-block">
        {#if how?.length}<ol>{#each how as line, n (n)}<li>{line}</li>{/each}</ol>{/if}
        {#if explain}<p><b>What it is</b> {explain.what}</p>{/if}
        {#if background}<p><b>Note</b> {background}</p>{/if}
        {#if own && place?.control}<button class="lk" type="button" onclick={openOwn}>What the {controlName(index, place.control).toLowerCase()} does</button>{/if}
      </div>
    {/if}
    {#if termsOpen}
      <dl class="open-block terms">
        <!-- Each term keeps its definition here, with its own way into the Glossary. -->
        {#each terms as t (t.term)}<div>
            <dt>{t.term}</dt>
            <dd>{t.meaning} <a class="lk" href={glossaryHref(t.term)}>Open in Glossary<span class="sr-only">: {t.term}</span></a></dd>
          </div>{/each}
      </dl>
    {/if}
  {/if}
  {/if}

  {#each calledBy as m (m.id)}
    <a class="called" href={messageHref(m.id)}>
      <span class="bell"><Icon name="bell" /></span>
      <span class="what">
        <span class="called-cap">The message that calls for this step</span>
        <span class="msg"><MessageText text={m.text} level={m.level} /><LevelBadge level={m.level} /></span>
      </span>
      <span class="go"><Icon name="chevron-right" /></span>
    </a>
  {/each}

  {#if place}
    <button class="line" data-tour="where" class:flow type="button" onclick={() => onOpen({ entry: "where" })}>
      {#if !flow}<span class="pin"><Icon name="pin" /></span>{/if}
      <span class="area">{where} · {place.zone.title}</span>
      <span class="lk">Where is this?</span>
    </button>
    {#if preview}
      {#if tiles.length}
        <!-- The whole card opens the panel: its Show panel button stretches over the card. The
             button's name is its own words ("Show panel") and what it shows; the drawing and the
             caption inside the card are not part of the button. -->
        <div class="preview" data-tour="where">
          {#if drawnTiles[0]}
            <PanelPreview panel={drawnTiles[0].panel} focus={[]} tiles={drawnTiles.map((d) => d.section)} {targets} {guardClosed} label="The whole {cardName}" />
          {/if}
          {#each listedTiles as l (l.id)}
            <span class="listed"><b>{panelName(l.title)}</b> {l.controls.join(", ")}</span>
          {/each}
          <span class="foot">
            <span class="cap">{cardName}{#if drawnTiles.length}{" · blue: set by this step"}{/if}</span>
            <button class="show" type="button" aria-label="Show panel: the whole {[cardName, tilesTitle(tiles, index.sideWords).also].filter(Boolean).join(", ")}" onclick={() => onOpen({ entry: "panel" })}>Show panel</button>
            <kbd aria-hidden="true" data-key="P"></kbd>
          </span>
        </div>
      {/if}
    {:else}
      <button class="show-panel" type="button" onclick={() => onOpen({ entry: "panel" })}>
        <Icon name="panel" /> Show panel <kbd aria-hidden="true" data-key="P"></kbd>
      </button>
    {/if}
    {#if !targets.length && place.control}
      <p class="note">{place.control.name} isn't drawn among the controls.</p>
    {/if}
  {:else if upcoming.length}
    <h3 class="soon">Coming up</h3>
    <ol class="next">
      {#each upcoming as u (u.step.id)}
        <li class={u.state}><span class="nm">{u.step.text}</span><span class="mono">{stepValue(u.step)}</span></li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* The Checklist board's side pane. */
  /* Fills the side pane, so the controls take the height left below the rest (the Checklist
     and Flow boards). */
  .pane-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 100%;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .pos {
    color: var(--color-link);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .value {
    color: var(--color-text-strong);
    font: var(--weight-regular) var(--font-size-value-mono) / var(--leading-snug) var(--font-mono);
  }
  .box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
  }
  .box.ifnot {
    border-color: var(--color-open-border);
    background: var(--color-open-bg);
  }
  .txt {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .cap {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .ifnot .cap,
  .ifnot .q {
    color: var(--color-open-text);
  }
  .main {
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .say {
    color: var(--color-text-strong);
    font: var(--weight-medium) var(--font-size-value-mono) var(--font-mono);
  }
  .more {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .q {
    flex: none;
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .caution {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-secondary);
  }
  .caution b {
    color: var(--color-open-text);
    font-weight: var(--weight-semibold);
  }
  .why {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--space-4);
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .why strong {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .lk {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    color: var(--color-link);
    font-size: var(--font-size-secondary);
  }
  .open-block {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .open-block p,
  .open-block ol {
    margin: 0 0 var(--space-2);
  }
  .terms div {
    display: flex;
    gap: var(--space-2);
  }
  .terms dt {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .terms dd {
    margin: 0;
  }
  /* The location line (R6PanePre): one 44 px target that opens Where it is. */
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
  }
  .pin {
    display: inline-flex;
    color: var(--color-text-muted);
  }
  .pin :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .line .area {
    flex: 1;
    color: var(--color-text-secondary);
  }
  .line .lk {
    color: var(--color-link);
  }
  /* The panel preview card (R6PanePre): the whole card is the button; nothing below it. */
  .preview {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-control);
    background: var(--panel-bg);
    font: inherit;
    text-align: left;
  }
  /* A panel the pack does not draw, named with the step's controls on it. */
  .listed {
    color: var(--panel-text);
    font-size: var(--font-size-secondary);
  }
  .listed b {
    color: var(--panel-label);
    font-weight: var(--weight-semibold);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: calc(var(--size-touch-min) - 2 * var(--space-2));
  }
  .foot .cap {
    flex: 1;
    color: var(--panel-label);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  /* No touch-size minimum of its own: its target is the whole card (below), and the caption row
     keeps the board's height. */
  .show {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  /* The button's target is the whole card, and so is its focus ring. */
  .show::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  .show:focus-visible {
    outline: none;
  }
  .preview:has(.show:focus-visible) {
    outline: var(--border-thick) solid var(--color-accent);
    outline-offset: var(--border-thick);
  }
  /* The key is drawn from data-key, so it isn't part of any button's words (a speech user says
     the button's name, not its shortcut). */
  kbd::before {
    content: attr(data-key);
  }
  kbd {
    padding: 0 var(--space-1);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-small);
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-caption);
  }
  /* Settings › Panel preview in steps Off: the Show panel button (R6Pane). */
  .show-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .note {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .soon {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .next {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .next li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: var(--border-thin) solid var(--color-line);
    font-size: var(--font-size-secondary);
  }
  .next .mono {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }
  .next li.done {
    color: var(--color-text-muted);
  }
  .cells {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .inline {
    min-height: 0;
  }
  @media (min-width: 600px) {
    .inline .cells {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }
  @media (max-width: 599px) {
    .inline .preview,
    .inline .show-panel {
      order: -1;
    }
    .inline kbd {
      display: none;
    }
  }
  /* The message that calls for this step (MsgPane): a link to it on the Alert messages tab. */
  .called {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    min-height: calc(var(--size-touch-min) + var(--space-2));
    padding: var(--space-2) var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    text-decoration: none;
  }
  .called .bell {
    display: flex;
    color: var(--color-text-muted);
  }
  .called .what {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
  }
  .called .called-cap {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-regular);
  }
  .called .msg {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .called .go {
    display: flex;
    color: var(--color-link);
  }
  .called .bell :global(svg) {
    width: calc(var(--size-icon-small) + var(--border-thick));
    height: calc(var(--size-icon-small) + var(--border-thick));
  }
  .called .go :global(svg) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
</style>
