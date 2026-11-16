<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

Practice (the owner's Practice boards and README): a test engine whose questions are generated
from the pack (lib/practice.ts). Home: the ready-made tests, Build a test (topics with their counts,
stages, 10, 20 or 40 questions, feedback after each or at the end) and "Earlier this visit". A test:
the progress row (question N of M, the bar, the running score), a multiple-choice question (keys 1
to 4; locked once chosen; right in green, "Your answer" in red with the right one in green and a
feedback box with the source's own words and links to it) or a step order question (drag, the ↑
and ↓ buttons, or Space to pick a step up and the arrow keys to move it; Check order). At the end
(exam mode) a choice moves straight on, with no marking until the results. Results: the score, by
topic, every missed question with its source, and Retry the missed, Same test again or New test.
900 px and up take the desktop layout (tablet landscape too); below, the phone layout (tablet
portrait too). Results last only for this visit.
-->
<script lang="ts">
  import type { FlatPack } from "@involo/bindings";
  import { tick } from "svelte";
  import Icon from "../lib/Icon.svelte";
  import { available, beforeEngineStart, deal, type Link, orderMiss, type Question, random, type Seed, seeds, sourcesIn, phasesOf, stepShows, TOPICS, type Topic, topicTitle } from "../lib/practice";
  import { correct, type Feedback, type Test, visit } from "../lib/practice-visit.svelte";
  import type { PackIndex } from "../pack-index";

  let {
    pack,
    index,
    options,
    backHref,
    onStep,
  }: {
    pack: FlatPack;
    index: PackIndex;
    /** The flight's options: questions follow them. */
    options: Record<string, string>;
    backHref: string;
    onStep: (id: string) => void;
  } = $props();

  /** 900 px and up: the desktop layout (tablet landscape too). */
  let wide = $state(typeof matchMedia === "function" ? matchMedia("(min-width: 900px)").matches : true);
  $effect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(min-width: 900px)");
    const set = () => (wide = mq.matches);
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  });

  let all = $derived(seeds(pack, index));
  let shows = $derived(stepShows(pack, options));
  let stages = $derived((pack.content.phases?.stages ?? []).map((s) => s.title));

  // Build a test: the board's starting choice.
  let topics = $state<Topic[]>(["memory", "lights", "values", "order", "where"]);
  let chosenStages = $state<string[] | null>(null);
  let picked = $derived(chosenStages ?? stages.slice(0, 2));
  let count = $state(20);
  let feedback = $state<Feedback>("each");
  /** The questions some topics can draw on, in some stages (every stage: every question), or in
   * the given phases. */
  const pool = (t: Topic[], s: string[], phases?: string[]) =>
    available(all, { topics: t, phases: phases ?? (s.length === stages.length ? null : phasesOf(pack, s)), options }, shows);
  let engineStart = $derived(beforeEngineStart(pack));
  let poolNow = $derived(pool(topics, picked));
  let room = $derived(sourcesIn(poolNow));

  const fmt = (n: number) => n.toLocaleString("en-US");
  const memoryLists = $derived((pack.content.phases?.phases ?? []).find((p) => p.id === "memory")?.lists.length ?? 0);
  const lightCount = $derived(pack.content.lights?.lights.length ?? 0);
  /** The ready-made tests (README). */
  let ready = $derived([
    { title: "Memory items", sub: `${memoryLists} lists · every item, in order`, topics: ["memory"] as Topic[], stages, count: 10, feedback: "each" as Feedback },
    { title: "Lights of the flight deck", sub: `${fmt(lightCount)} lights and what they mean`, topics: ["lights"] as Topic[], stages, count: 20, feedback: "each" as Feedback },
    // Preflight, and Departure up to and including Engine start, by the pack's phase ids (owner).
    { title: "Before engine start", sub: `${andList(engineStart.stages)}: values, order, locations`, topics: ["values", "order", "where"] as Topic[], stages: engineStart.stages, phases: engineStart.phases, count: 20, feedback: "each" as Feedback },
    { title: "Check ride", sub: "Every topic, every stage", topics: TOPICS.map((t) => t.id), stages, count: 40, feedback: "end" as Feedback },
  ]);

  function andList(xs: string[]): string {
    if (xs.length < 2) return xs.join("");
    return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
  }

  function start(title: string, custom: boolean, t: Topic[], s: string[], n: number, fb: Feedback, from?: Seed[], phases?: string[]): void {
    const questions = deal(from ?? pool(t, s, phases), n, random(Math.floor(Math.random() * 2 ** 31)));
    if (!questions.length) return;
    visit.test = { title, custom, topics: t, stages: s, allStages: s.length === stages.length, count: n, feedback: fb, questions, answers: questions.map(() => null), at: 0, started: Date.now(), ended: null };
    order = null;
    grabbed = null;
    void tick().then(() => document.querySelector<HTMLElement>(".practice h2")?.focus());
  }
  /** Retry: the missed questions again, dealt afresh. */
  function retry(t: Test): void {
    const missed = t.questions.filter((q, i) => t.answers[i] !== null && !correct(q, t.answers[i]));
    const ids = new Set(missed.map((q) => q.id));
    start(t.title, t.custom, t.topics, t.stages, missed.length, t.feedback, all.filter((s) => ids.has(s.id)));
  }
  function again(t: Test): void {
    const ids = new Set(t.questions.map((q) => q.id));
    start(t.title, t.custom, t.topics, t.stages, t.questions.length, t.feedback, all.filter((s) => ids.has(s.id)));
  }
  function finish(): void {
    const t = visit.test;
    if (!t) return;
    if (!t.answers.some((a) => a !== null)) {
      visit.test = null;
      focusTop();
      return;
    }
    t.ended = Date.now();
    visit.last = t;
    showAll = false;
    focusTop();
  }
  function home(): void {
    visit.test = null;
    focusTop();
  }
  /** After End test, See results or New test, focus goes to the new screen's heading (review). */
  const focusTop = () => void tick().then(() => document.querySelector<HTMLElement>(".practice [data-top]")?.focus());

  let test = $derived(visit.test);
  let q = $derived(test && !test.ended ? test.questions[test.at] : undefined);
  let answer = $derived(test && q ? test.answers[test.at] : null);
  let locked = $derived(answer !== null && answer !== undefined);
  let answered = $derived(test ? test.questions.filter((_, i) => test.answers[i] !== null) : []);
  let score = $derived(test ? test.questions.filter((x, i) => correct(x, test.answers[i])).length : 0);
  let last = $derived(!!test && test.at === test.questions.length - 1);

  function choose(i: number): void {
    const t = visit.test;
    if (!t || !q || q.kind !== "choice" || locked) return;
    t.answers[t.at] = i;
    if (t.feedback === "end") next();
  }
  function next(): void {
    const t = visit.test;
    if (!t) return;
    if (t.at >= t.questions.length - 1) return finish();
    t.at += 1;
    order = null;
    grabbed = null;
    void tick().then(() => document.querySelector<HTMLElement>(".practice h2")?.focus());
  }

  // Step order: the order on screen, as indexes of the question's items.
  let order = $state<number[] | null>(null);
  let shown = $derived(q?.kind === "order" ? (Array.isArray(answer) ? answer : (order ?? q.shown)) : []);
  let grabbed = $state<number | null>(null);
  let said = $state("");
  function move(from: number, to: number): void {
    if (!q || q.kind !== "order" || locked || to < 0 || to >= shown.length || from === to) return;
    const a = [...shown];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x as number);
    order = a;
    said = `${q.items[x as number]}, now ${to + 1} of ${a.length}`;
  }
  function check(): void {
    const t = visit.test;
    if (!t || !q || q.kind !== "order" || locked) return;
    t.answers[t.at] = [...shown];
    grabbed = null;
    if (t.feedback === "end") next();
  }
  function rowKey(e: KeyboardEvent, i: number): void {
    // Keys on the row's ↑ and ↓ buttons are theirs (review).
    if (locked || e.target !== e.currentTarget) return;
    if (e.key === " ") {
      e.preventDefault();
      grabbed = grabbed === i ? null : i;
      said = grabbed === null ? `${rowName(i)} dropped at ${i + 1}` : `${rowName(i)} picked up. Use the arrow keys, then Space to drop it.`;
    } else if (grabbed === i && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = i + (e.key === "ArrowUp" ? -1 : 1);
      move(i, to);
      if (to >= 0 && to < shown.length) {
        grabbed = to;
        void tick().then(() => document.querySelectorAll<HTMLElement>(".order li")[to]?.focus());
      }
    }
  }
  const rowName = (i: number) => (q?.kind === "order" ? (q.items[shown[i] as number] ?? "") : "");
  // Dragging by the grip: the row follows the pointer over the others.
  let dragging = $state<number | null>(null);
  let list = $state<HTMLOListElement | null>(null);
  function dragStart(e: PointerEvent, i: number): void {
    if (locked) return;
    dragging = i;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function dragMove(e: PointerEvent): void {
    if (dragging === null || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>("li")];
    const to = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    const target = to < 0 ? rows.length - 1 : to > dragging ? to - 1 : to;
    if (target !== dragging) {
      move(dragging, target);
      dragging = target;
    }
  }
  const dragEnd = () => (dragging = null);

  function key(e: KeyboardEvent): void {
    if (!q || e.altKey || e.ctrlKey || e.metaKey) return;
    // Enter on an answered option, or on a step row, still moves on or checks (review); on any
    // other button or link it does what that control does.
    const onControl = (e.target as HTMLElement | null)?.closest("a, button:not(.opt)");
    if (q.kind === "choice" && !locked && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      choose(Number(e.key) - 1);
    } else if (q.kind === "choice" && (e.key === "ArrowDown" || e.key === "ArrowUp") && (e.target as HTMLElement | null)?.closest(".opt")) {
      // The answers are a radio group: the arrow keys move between them.
      e.preventDefault();
      const opts = [...document.querySelectorAll<HTMLElement>(".answers .opt")];
      const at = opts.indexOf(e.target as HTMLElement);
      opts[(at + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length]?.focus();
    } else if (e.key === "Enter" && !onControl) {
      e.preventDefault();
      if (q.kind === "order" && !locked) check();
      else if (locked) next();
    }
  }

  const minutes = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  };
  function about(t: Test): string {
    const names = t.topics.map((x, i) => (i === 0 ? topicTitle(x) : topicTitle(x).charAt(0).toLowerCase() + topicTitle(x).slice(1)));
    const st = t.allStages ? "Every stage" : andList(t.stages);
    return `${andList(names)} · ${st} · ${minutes((t.ended ?? Date.now()) - t.started)}`;
  }
  const missedOf = (t: Test) => t.questions.map((x, i) => ({ q: x, a: t.answers[i] })).filter((m) => m.a !== null && !correct(m.q, m.a));
  const byTopic = (t: Test) =>
    TOPICS.filter((x) => t.questions.some((y, i) => y.topic === x.id && t.answers[i] !== null)).map((x) => {
      const qs = t.questions.map((y, i) => ({ y, a: t.answers[i] })).filter((m) => m.y.topic === x.id && m.a !== null);
      return { title: x.title, right: qs.filter((m) => correct(m.y, m.a)).length, of: qs.length };
    });
  function yoursAndRight(x: Question, a: number | number[] | null | undefined): { yours: string; right: string } {
    if (x.kind === "choice") return { yours: x.options[a as number] ?? "", right: x.options[x.answer] ?? "" };
    return orderMiss(x.items, ((a as number[]) ?? []).map((v) => x.items[v] ?? "")) ?? { yours: "", right: "" };
  }
  let showAll = $state(false);
  const letters = ["A", "B", "C", "D"];
  const follow = (l: Link) => (e: MouseEvent) => {
    if (l.step) {
      e.preventDefault();
      onStep(l.step);
    }
  };
  const sub = (t: Test) => `${t.custom ? "Custom test" : t.title} · ${t.questions.length} questions`;
</script>

<svelte:window onkeydown={key} />

{#snippet links(ls: Link[])}
  <div class="links">
    {#each ls as l (l.href + l.label)}
      <a href={l.href} onclick={follow(l)}>{l.label} <Icon name="chevron-right" /></a>
    {/each}
  </div>
{/snippet}

{#snippet header(title: string, line: string, end: boolean)}
  {#if wide}
    <header class="top">
      <a class="back" href={backHref}><Icon name="chevron-left" />Checklist</a>
      <div class="ttl"><h1 tabindex="-1" data-top>Practice</h1><span>{line}</span></div>
      <span class="fill"></span>
      {#if end}<button class="btn-2" type="button" onclick={finish}>End test</button>{/if}
    </header>
  {:else}
    <header class="top phone">
      <a class="icon" href={backHref} aria-label="Back to checklist"><Icon name="chevron-left" /></a>
      <div class="ttl"><span class="h1" tabindex="-1" data-top>{title}</span><span>{line}</span></div>
      {#if end}<button class="end" type="button" onclick={finish}>End</button>{/if}
    </header>
  {/if}
{/snippet}

{#snippet chip(on: boolean, label: string, n: string, toggle: () => void, disabled = false)}
  <button class="chip" type="button" aria-pressed={on} {disabled} onclick={toggle}>
    {#if on}<span class="tick"><Icon name="answer-right" /></span>{/if}{label}<span class="n">{n}</span>
  </button>
{/snippet}

{#snippet homeScreen()}
  {@render header("Practice", "Test yourself on this aircraft’s procedures", false)}
  <div class="scroll"><main class="home">
    <div class="group">
      <span class="label">Ready-made tests</span>
      <div class="cards">
        {#each ready as r (r.title)}
          <button class="ready" type="button" onclick={() => start(r.title, false, r.topics, r.stages, r.count, r.feedback, undefined, "phases" in r ? r.phases : undefined)}>
            <span class="c-title">{r.title}</span>
            <span class="c-sub">{r.sub}</span>
            <span class="fill"></span>
            <span class="c-n">{r.count} questions{r.feedback === "end" ? " · feedback at the end" : ""}</span>
          </button>
        {/each}
      </div>
    </div>
    <section class="build" aria-labelledby="build-title">
      <div class="b-head">
        <h2 id="build-title">Build a test</h2>
        <span>Mix any topics. Questions are drawn from the stages you choose.</span>
      </div>
      <div class="group">
        <span class="label">Topics · {topics.length} chosen</span>
        <div class="chips">
          {#each TOPICS as t (t.id)}
            {@render chip(topics.includes(t.id), t.title, fmt(sourcesIn(pool([t.id], picked))), () => (topics = topics.includes(t.id) ? topics.filter((x) => x !== t.id) : TOPICS.map((x) => x.id).filter((x) => x === t.id || topics.includes(x))))}
          {/each}
        </div>
      </div>
      <div class="group">
        <span class="label">Stages</span>
        <div class="chips">
          {@render chip(picked.length === stages.length, "All stages", "", () => (chosenStages = picked.length === stages.length ? [] : [...stages]))}
          {#each stages as s (s)}
            {@render chip(picked.length !== stages.length && picked.includes(s), s, "", () => (chosenStages = picked.length === stages.length ? [s] : picked.includes(s) ? picked.filter((x) => x !== s) : stages.filter((x) => x === s || picked.includes(x))))}
          {/each}
        </div>
      </div>
      <div class="pair">
        <div class="group">
          <span class="label" id="practice-count">Questions</span>
          <div class="seg" role="group" aria-labelledby="practice-count">
            {#each [10, 20, 40] as n (n)}<button type="button" aria-pressed={count === n} onclick={() => (count = n)}>{n}</button>{/each}
          </div>
        </div>
        <div class="group">
          <span class="label" id="practice-feedback">Feedback</span>
          <div class="seg" role="group" aria-labelledby="practice-feedback">
            <button type="button" aria-pressed={feedback === "each"} onclick={() => (feedback = "each")}>After each question</button>
            <button type="button" aria-pressed={feedback === "end"} onclick={() => (feedback = "end")}>At the end</button>
          </div>
        </div>
      </div>
      <div class="go">
        <button class="btn-1" type="button" disabled={!topics.length || !room} onclick={() => start("Custom test", true, topics, picked, count, feedback)}>Start test</button>
        <span>
          {#if !topics.length}Choose a topic to start
          {:else if !room}No questions in these topics and stages
          {:else if room < count}Only {fmt(room)} questions in these topics and stages: the test uses all of them
          {:else}{count} questions from {fmt(room)} in these topics and stages{/if}
        </span>
      </div>
    </section>
    {#if visit.last}
      {@const l = visit.last}
      {@const missed = missedOf(l).length}
      <div class="earlier">
        <span>Earlier this visit: <span class="t">{l.title}</span>, {l.questions.filter((x, i) => correct(x, l.answers[i])).length} of {l.answers.filter((a) => a !== null).length}</span>
        {#if missed}<button class="link" type="button" onclick={() => retry(l)}>Retry the {missed} missed <Icon name="chevron-right" /></button>{/if}
      </div>
    {/if}
  </main></div>
{/snippet}

{#snippet progress(t: Test)}
  <div class="progress">
    <span class="qn">Question {t.at + 1} of {t.questions.length}</span>
    <div class="bar" role="progressbar" aria-valuenow={t.at + 1} aria-valuemin={1} aria-valuemax={t.questions.length} aria-label="Question {t.at + 1} of {t.questions.length}">
      <div style:width="{((t.at + 1) / t.questions.length) * 100}%"></div>
    </div>
    {#if t.feedback === "each"}<span class="score">Score <span class="mono">{score}</span> of {answered.length}</span>{/if}
  </div>
{/snippet}

{#snippet stem(x: Question)}
  {#if x.stem?.kind === "light"}
    <figure class="light" aria-label="{x.stem.color === 'white' ? 'A white' : x.stem.color === 'amber' ? 'An amber' : `A ${x.stem.color}`} {x.stem.label} light, lit">
      <span class="lamp {x.stem.color}" aria-hidden="true">{x.stem.label}</span>
      <figcaption>{x.stem.caption}</figcaption>
    </figure>
  {:else if x.stem?.kind === "card"}
    <div class="stem"><span class="s-title">{x.stem.title}</span>{#if x.stem.body}<span class="s-body">{x.stem.body}</span>{/if}</div>
  {/if}
{/snippet}

{#snippet choiceQuestion(t: Test, x: Question & { kind: "choice" })}
  <div class="answers" role="radiogroup" aria-label="Answers">
    {#each x.options as o, i (o)}
      {@const mine = answer === i}
      {@const right = i === x.answer}
      {@const marked = locked && t.feedback === "each"}
      <button
        class="opt"
        class:right={marked && right}
        class:wrong={marked && mine && !right}
        class:dim={marked && !right && !mine}
        type="button"
        role="radio"
        aria-checked={mine}
        aria-disabled={locked}
        onclick={() => choose(i)}
      >
        <span class="letter">{letters[i]}</span>
        <span class="o-text">{o}</span>
        {#if marked && right}<span class="mark right" role={mine ? "status" : undefined}><Icon name="answer-right" />Correct answer</span>
        {:else if marked && mine}<span class="mark wrong"><Icon name="answer-wrong" />Your answer</span>{/if}
      </button>
    {/each}
  </div>
  {#if locked && t.feedback === "each" && answer !== x.answer}
    <div class="fb" role="status">
      <span class="fb-title">Not this one</span>
      {#if x.why}<span class="fb-why">{x.why}</span>{/if}
      {@render links(x.links)}
    </div>
  {/if}
{/snippet}

{#snippet orderQuestion(t: Test, x: Question & { kind: "order" })}
  {@const marked = locked && t.feedback === "each"}
  {#if !marked}
    <span class="hint">Drag a step, or use its arrows. Space picks a step up with the keyboard.</span>
    <ol class="order" aria-label="Steps, in your order" bind:this={list} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
      {#each shown as item, i (item)}
        {@const name = x.items[item] ?? ""}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <li class:grabbed={grabbed === i || dragging === i} tabindex="0" aria-roledescription="Movable step" onkeydown={(e) => rowKey(e, i)}>
          <span class="grip" aria-hidden="true" onpointerdown={(e) => dragStart(e, i)}><Icon name="grip" /></span>
          <span class="num">{i + 1}</span>
          <span class="o-text">{name}</span>
          <button type="button" class="arrow" aria-label="Move {name} up" onclick={() => move(i, i - 1)}>↑</button>
          <button type="button" class="arrow" aria-label="Move {name} down" onclick={() => move(i, i + 1)}>↓</button>
        </li>
      {/each}
    </ol>
    <span class="sr-only" aria-live="assertive">{said}</span>
  {:else}
    {@const mine = answer as number[]}
    <ol class="order checked" aria-label="The correct order">
      {#each x.items as name, i (name)}
        {@const at = mine.indexOf(i)}
        <li class:right={at === i} class:wrong={at !== i}>
          <span class="num">{i + 1}</span>
          <span class="o-text">{name}</span>
          {#if at === i}<span class="mark right"><Icon name="answer-right" />In place</span>
          {:else}<span class="mark wrong"><Icon name="answer-wrong" />You had it {at + 1}</span>{/if}
        </li>
      {/each}
    </ol>
    {#if !correct(x, mine)}
      <div class="fb" role="status">
        <span class="fb-title">Not this order</span>
        {#if x.why}<span class="fb-why">{x.why}</span>{/if}
        {@render links(x.links)}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet testScreen(t: Test, x: Question)}
  {@render header("Practice", wide ? `${sub(t)} · feedback ${t.feedback === "each" ? "after each" : "at the end"}` : sub(t), true)}
  <div class="scroll"><main class="question">
    {@render progress(t)}
    <span class="tag">{topicTitle(x.topic)}</span>
    <h2 tabindex="-1">{x.prompt}</h2>
    {@render stem(x)}
    {#if x.kind === "choice"}{@render choiceQuestion(t, x)}{:else}{@render orderQuestion(t, x)}{/if}
  </main></div>
  <div class="foot">
    {#if wide}<span class="keys">{x.kind === "order" && !locked ? "Enter to check" : "1–4 to answer · Enter for next"}</span>{/if}
    <span class="fill"></span>
    {#if x.kind === "order" && !locked}
      <button class="next" type="button" onclick={check}>Check order</button>
    {:else}
      <button class="next" type="button" aria-disabled={!locked} onclick={() => locked && next()}>{last ? "See results" : "Next question"}</button>
    {/if}
  </div>
{/snippet}

{#snippet resultsScreen(t: Test)}
  {@const missed = missedOf(t)}
  {@const right = t.questions.filter((x, i) => correct(x, t.answers[i])).length}
  {@const of = t.answers.filter((a) => a !== null).length}
  {@render header("Practice", wide ? `Results · ${t.custom ? "custom test" : t.title}` : "Results", false)}
  <div class="scroll"><main class="results">
    <div class="left">
      <div class="big"><span class="sc">{right} of {of}</span><span class="pct">{Math.round((right / of) * 100)}%</span></div>
      <span class="about">{about(t)}</span>
      <div class="acts">
        {#if missed.length}<button class="btn-1" type="button" onclick={() => retry(t)}>Retry the {missed.length} missed</button>{/if}
        <button class="btn-2" type="button" onclick={() => again(t)}>Same test again</button>
        <button class="btn-2" type="button" onclick={home}>New test</button>
      </div>
      <section class="box">
        <h3>By topic</h3>
        <div class="topics">
          {#each byTopic(t) as r (r.title)}
            <div class="trow">
              <span>{r.title}</span>
              <div class="tbar"><div style:width="{Math.round((r.right / r.of) * 100)}%"></div></div>
              <span class="mono">{r.right}/{r.of}</span>
            </div>
          {/each}
        </div>
      </section>
    </div>
    <section class="box missed">
      <h3>Missed · {missed.length}</h3>
      {#each wide || showAll ? missed : missed.slice(0, 2) as m (m.q.id)}
        {@const ya = yoursAndRight(m.q, m.a)}
        <div class="miss">
          <span class="m-topic">{topicTitle(m.q.topic)}</span>
          <span class="m-q">{m.q.short}</span>
          <span class="m-line wrong"><Icon name="answer-wrong" /><span class="sr-only">Your answer: </span>{ya.yours}</span>
          <span class="m-line right"><Icon name="answer-right" /><span class="sr-only">Right answer: </span>{ya.right}</span>
          {@render links(m.q.links)}
        </div>
      {/each}
      {#if !wide && !showAll && missed.length > 2}
        <button class="show" type="button" onclick={() => (showAll = true)}>Show all {missed.length}</button>
      {/if}
    </section>
  </main></div>
{/snippet}

<div class="practice" class:wide data-app-ready="">
  {#if test && !test.ended && q}
    {@render testScreen(test, q)}
  {:else if test?.ended}
    {@render resultsScreen(test)}
  {:else}
    {@render homeScreen()}
  {/if}
</div>

<style>
  .practice {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
    /* The boards set no line height: the browser's normal one. */
    line-height: normal;
  }
  /* The boards' widths (1100, 820, 1240) are the column's content, inside its padding. */
  /* The page scrolls at its edge; the column keeps the board's width inside it (review). */
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  main {
    box-sizing: content-box;
    display: flex;
    flex-direction: column;
  }
  [data-top] {
    outline: none;
  }
  .fill {
    flex: 1;
  }
  .mono {
    font-family: var(--font-mono);
  }
  /* Header (Practice boards): 60 px, the Checklist button, Practice and its sub-line, End test. */
  .top {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-4);
    height: var(--size-header);
    padding: 0 var(--space-4);
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .back {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-touch-min);
    padding: 0 var(--space-3);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font-size: var(--font-size-body);
    text-decoration: none;
  }
  .back :global(.icon) {
    width: calc(var(--size-icon) - var(--border-thick));
    height: calc(var(--size-icon) - var(--border-thick));
  }
  .ttl {
    display: flex;
    flex-direction: column;
    line-height: var(--leading-tight);
  }
  .ttl h1 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-panel-title);
    font-weight: var(--weight-bold);
  }
  .ttl span {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* Phone header (PhoneHome): 56 px, the back icon, Practice and its sub-line, End. */
  .top.phone {
    gap: calc(var(--space-1) + var(--border-thick));
    height: calc(var(--size-touch-min) + var(--space-3));
    padding: 0 var(--space-3) 0 var(--space-1);
  }
  .top.phone .ttl {
    flex: 1;
  }
  .ttl .h1 {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    color: var(--color-text-secondary);
  }
  .end {
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-2) + var(--border-thick));
    border: 0;
    background: transparent;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-value-mono);
  }
  .btn-1,
  .btn-2 {
    height: var(--size-touch-min);
    border-radius: var(--radius-control);
    font: inherit;
    font-size: var(--font-size-value-mono);
    cursor: pointer;
  }
  .btn-1 {
    padding: 0 calc(var(--space-4) + var(--border-thick));
    border: 0;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
  .btn-1:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn-2 {
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
  }
  .label {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Home (PracticeHome): 28 / 48 padding, 20 apart, up to 1100 wide. */
  .home {
    gap: calc(var(--space-4) + var(--space-1));
    max-width: calc(var(--size-content-max) + var(--space-10) + var(--space-4) + var(--space-1));
    padding: calc(var(--space-6) + var(--space-1)) calc(var(--space-10) + var(--space-2));
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }
  .ready {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-height: calc(var(--size-touch-min) * 2 + var(--space-4));
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .c-title {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .c-sub {
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .c-n {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .build {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-4) + var(--border-thick));
    padding: calc(var(--space-4) + var(--space-1)) var(--space-6);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .b-head {
    display: flex;
    flex-direction: column;
    gap: var(--border-thick);
  }
  .b-head h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-body) + var(--border-thick));
    font-weight: var(--weight-bold);
  }
  .b-head span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .chip .n {
    color: var(--color-text-muted);
  }
  .chip[aria-pressed="true"] {
    border: var(--size-focus-ring) solid var(--color-accent);
    background: var(--color-accent-soft);
    box-shadow: none;
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .chip[aria-pressed="true"] .n {
    color: var(--color-text-secondary);
    font-weight: var(--weight-regular);
  }
  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tick {
    display: flex;
    color: var(--color-accent-text);
  }
  .tick :global(.icon) {
    width: calc(var(--space-3) + var(--border-thick));
    height: calc(var(--space-3) + var(--border-thick));
  }
  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--space-4) + var(--border-thick)) var(--space-8);
  }
  .seg {
    display: inline-flex;
    align-self: flex-start;
    padding: var(--border-thick);
    border: var(--border-thin) solid var(--color-segment-border);
    border-radius: var(--radius-segment);
    background: var(--color-segment-track);
  }
  .seg button {
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .seg button[aria-pressed="true"] {
    background: var(--color-segment-on);
    outline: var(--size-focus-ring) solid var(--color-accent);
    outline-offset: calc(-1 * var(--size-focus-ring));
    box-shadow: var(--color-segment-shadow);
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .go {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .go span {
    color: var(--color-text-muted);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
  }
  .earlier {
    display: flex;
    align-items: center;
    gap: calc(var(--space-2) + var(--border-thick));
    padding: var(--space-3) calc(var(--space-3) + var(--border-thick));
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .earlier > span {
    flex: 1;
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .earlier .t {
    color: var(--color-text);
  }
  .link,
  .links a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--size-touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-decoration: none;
    cursor: pointer;
  }
  .link :global(.icon),
  .links :global(.icon) {
    width: calc(var(--space-3) + var(--border-thick));
    height: calc(var(--space-3) + var(--border-thick));
  }

  /* A question (PracticeQuestion, PracticeOrder): 24 / 48 padding, 16 apart, up to 820 wide. */
  .question {
    gap: var(--space-4);
    max-width: calc(var(--size-slideout) - var(--space-4) - var(--border-bar));
    padding: var(--space-6) calc(var(--space-10) + var(--space-2));
  }
  .progress {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--space-3) + var(--border-thick));
    font-size: var(--font-size-secondary);
  }
  .qn {
    color: var(--color-text-strong);
    font-weight: var(--weight-semibold);
  }
  .bar {
    flex: 1;
    min-width: var(--size-navigator-max);
    height: calc(var(--space-1) + var(--border-thick));
    overflow: hidden;
    border-radius: var(--size-progress-bar);
    background: var(--color-track);
  }
  .bar div,
  .tbar div {
    height: 100%;
    background: var(--color-accent);
  }
  .score {
    color: var(--color-text-secondary);
  }
  .score .mono {
    color: var(--color-text-strong);
  }
  .tag {
    align-self: flex-start;
    padding: calc(var(--border-thick) + var(--border-thin)) calc(var(--space-2) + var(--border-thick));
    border-radius: var(--radius-pill);
    background: var(--color-chip);
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .question h2 {
    margin: 0;
    color: var(--color-text-strong);
    font-size: var(--font-size-section-title);
    font-weight: var(--weight-bold);
    line-height: 1.3;
    outline: none;
  }
  /* The drawn light (panel palette): a lit light in its own color, its place under it. */
  .light {
    display: flex;
    flex-direction: column;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-2);
    margin: 0;
    padding: calc(var(--space-4) + var(--space-1)) calc(var(--space-6) + var(--space-1));
    border: var(--border-thin) solid var(--panel-frame);
    border-radius: var(--radius-panel);
    background: var(--panel-bg);
  }
  .light figcaption {
    color: var(--panel-label);
    font-size: var(--font-size-caption);
  }
  .lamp {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-touch-min) * 2 + var(--space-2));
    height: calc(var(--size-touch-min) + var(--space-1));
    padding: 0 var(--space-1);
    border-radius: var(--space-1);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-bold);
    line-height: 1.1;
    text-align: center;
    box-sizing: border-box;
  }
  .lamp.amber {
    background: var(--color-lit-amber);
    color: var(--color-on-lit-amber);
  }
  .lamp.red {
    background: var(--color-danger);
    color: var(--color-on-accent);
  }
  .lamp.green {
    background: var(--color-done);
    color: var(--color-on-done);
  }
  .lamp.blue {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .lamp.white {
    background: var(--panel-text);
    color: var(--panel-bg);
  }
  .stem {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .s-title {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .s-body {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    line-height: var(--leading-normal);
  }
  .answers {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .opt,
  .order li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--size-flow-button);
    box-sizing: border-box;
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    text-align: left;
  }
  .opt {
    padding: var(--space-2) var(--space-4) var(--space-2) calc(var(--space-2) + var(--border-thick));
    cursor: pointer;
  }
  .opt[aria-disabled="true"] {
    cursor: default;
  }
  .opt.right,
  .order li.right {
    border: var(--size-focus-ring) solid var(--color-done);
    background: var(--color-done-soft);
  }
  .opt.wrong,
  .order li.wrong {
    border: var(--size-focus-ring) solid var(--color-danger);
    background: var(--color-danger-soft);
  }
  .opt.dim {
    opacity: 0.7;
  }
  .letter {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--space-8);
    height: var(--space-8);
    border-radius: calc(var(--radius-small) + var(--border-thick));
    background: var(--color-chip);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .o-text {
    flex: 1;
    font-size: var(--font-size-body);
  }
  .mark {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    font-weight: var(--weight-semibold);
  }
  .mark :global(.icon) {
    width: calc(var(--space-4) + var(--border-thick));
    height: calc(var(--space-4) + var(--border-thick));
  }
  .mark.right {
    color: var(--color-done);
  }
  .mark.wrong {
    color: var(--color-danger-text);
  }
  .fb {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-left: var(--border-bar) solid var(--color-danger);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .fb-title {
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-bold);
  }
  .fb-why {
    color: var(--color-text);
    font-size: var(--font-size-value-mono);
    line-height: var(--leading-normal);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    column-gap: calc(var(--space-4) + var(--space-1));
  }
  .hint {
    color: var(--color-text-secondary);
    font-size: var(--font-size-value-mono);
  }
  .order {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .order li {
    padding: calc(var(--space-1) + var(--border-thick)) var(--space-2) calc(var(--space-1) + var(--border-thick)) var(--space-3);
    outline: none;
  }
  .order li.grabbed,
  .order li:focus-visible {
    box-shadow: inset 0 0 0 var(--size-focus-ring) var(--color-accent);
  }
  .order.checked li {
    min-height: var(--size-flow-button);
  }
  .grip {
    display: flex;
    color: var(--color-text-muted);
    cursor: grab;
    touch-action: none;
  }
  .grip :global(.icon) {
    width: var(--size-icon-small);
    height: var(--size-icon-small);
  }
  .num {
    width: calc(var(--space-6) + var(--space-1));
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-secondary);
  }
  .arrow {
    width: var(--size-touch-min);
    height: var(--size-touch-min);
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--font-size-body);
    cursor: pointer;
  }
  /* The foot: the keys and Next question (48 high, at least 200 wide). */
  .foot {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
    padding: calc(var(--space-3) + var(--border-thick)) calc(var(--space-10) + var(--space-2));
    border-top: var(--border-thin) solid var(--color-line);
    background: var(--color-surface-2);
  }
  .keys {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  .next {
    min-width: calc(var(--size-touch-min) * 4 + var(--space-6));
    height: var(--size-flight-strip);
    padding: 0 calc(var(--space-4) + var(--space-1));
    border: 0;
    border-radius: var(--radius-panel);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font: inherit;
    font-size: calc(var(--font-size-body) + var(--border-thin));
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  .next[aria-disabled="true"] {
    opacity: 0.5;
    cursor: default;
  }

  /* Results (PracticeResults): 420 | the missed list, up to 1240 wide. */
  .results {
    display: grid;
    grid-template-columns: calc(var(--size-side-pane-tablet) - var(--space-4) - var(--border-bar)) minmax(0, 1fr);
    align-content: start;
    gap: var(--space-6) var(--space-8);
    max-width: calc(var(--size-content-max) + var(--size-flight-section-nav) - var(--space-8));
    padding: calc(var(--space-6) + var(--space-1)) calc(var(--space-10) + var(--space-2));
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .big {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: calc(var(--space-3) + var(--border-thick));
  }
  .sc {
    color: var(--color-text-strong);
    font-size: calc(var(--font-size-flow-title) + var(--space-2));
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-wordmark);
  }
  .pct {
    color: var(--color-text-secondary);
    font-size: var(--font-size-section-title);
    font-weight: var(--weight-semibold);
  }
  .about {
    color: var(--color-text-secondary);
    font-size: var(--font-size-secondary);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--space-2) + var(--border-thick));
  }
  .box {
    display: flex;
    flex-direction: column;
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
  }
  .box h3 {
    margin: 0;
    padding: calc(var(--space-3) + var(--border-thick)) calc(var(--space-3) + var(--border-thick)) var(--space-2);
    color: var(--color-text-strong);
    font-size: var(--font-size-secondary);
    font-weight: var(--weight-semibold);
  }
  .topics {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-1) calc(var(--space-3) + var(--border-thick)) var(--space-4);
  }
  .trow {
    display: grid;
    grid-template-columns: calc(var(--size-touch-min) * 4 - var(--space-4)) minmax(0, 1fr) var(--size-flight-strip);
    align-items: center;
    gap: var(--space-3);
    font-size: var(--font-size-secondary);
  }
  .tbar {
    height: var(--space-2);
    overflow: hidden;
    border-radius: var(--space-1);
    background: var(--color-track);
  }
  .trow .mono {
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-caption) + var(--border-thin));
    text-align: right;
  }
  .box.missed {
    align-self: start;
  }
  .miss {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) + var(--border-thick));
    padding: var(--space-3) calc(var(--space-3) + var(--border-thick));
    border-bottom: var(--border-thin) solid var(--color-line);
  }
  .m-topic {
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
    font-weight: var(--weight-semibold);
  }
  .m-q {
    color: var(--color-text-strong);
    font-size: var(--font-size-value-mono);
  }
  .m-line {
    display: flex;
    align-items: center;
    gap: calc(var(--space-1) + var(--border-thick));
    font-size: var(--font-size-secondary);
  }
  .m-line :global(.icon) {
    width: calc(var(--space-3) + var(--border-thick));
    height: calc(var(--space-3) + var(--border-thick));
  }
  .m-line.wrong {
    color: var(--color-danger-text);
  }
  .m-line.right {
    color: var(--color-done);
  }
  .show {
    display: flex;
    align-items: center;
    min-height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: var(--font-size-secondary);
    text-align: left;
    cursor: pointer;
  }

  /* Below 900 px (the phone boards; tablet portrait too). */
  .practice:not(.wide) .home {
    gap: var(--space-4);
    max-width: none;
    padding: var(--space-4);
  }
  .practice:not(.wide) .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .practice:not(.wide) .build {
    padding: var(--space-4);
  }
  .practice:not(.wide) .question {
    gap: calc(var(--space-3) + var(--border-thick));
    max-width: none;
    padding: calc(var(--space-3) + var(--border-thick)) var(--space-4);
  }
  .practice:not(.wide) .question h2 {
    font-size: var(--font-size-panel-title);
  }
  .practice:not(.wide) .foot {
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + var(--space-1));
  }
  .practice:not(.wide) .next {
    flex: 1;
    min-width: 0;
    height: calc(var(--space-10) + var(--space-3));
  }
  .practice:not(.wide) .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: none;
    padding: calc(var(--space-4) + var(--space-1)) var(--space-4);
  }
  .practice:not(.wide) .sc {
    font-size: calc(var(--font-size-page-title) + var(--space-2));
  }
  .practice:not(.wide) .pct {
    font-size: var(--font-size-panel-title);
  }
  .practice:not(.wide) .trow {
    grid-template-columns: calc(var(--size-touch-min) * 2 + var(--space-6) - var(--border-thick)) minmax(0, 1fr) var(--size-flight-strip);
  }
</style>
