// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// How procedures work: every word on the page, in one place to edit (CONTENT.md, a
// first draft to adjust after seeing it in the app). How to write here:
//   **word**   shows in bold.
//   {stages}   a value from the pack: {stages} (how many), {stageNames}, {groups} (the reference
//              lists by group, "9 memory-item lists, 30 quick reference lists and 18 procedures")
//              and {reference} (the reference area's title).
// Each part has a title, its blocks in order, and its "In Involo" box: the line, and where the link
// goes ("phase": the pilot's current phase, "step": the current step, "emergency": the reference
// area, "settings", "open": Open steps, "flight": Flight › Overview).

/** One block of a part: a paragraph, a list of terms and what they mean, or part 2's figure. */
export type HowBlock = { p: string } | { terms: { term: string; text: string }[] } | { figure: true };

/** Where an "In Involo" link goes. */
import type { FlatPack } from "@involo/bindings";

export type HowLink = "phase" | "step" | "emergency" | "settings" | "open" | "flight";

export type HowPart = {
  title: string;
  blocks: HowBlock[];
  inInvolo: { text: string; link: HowLink };
};

export const HOW = {
  title: "How procedures work",
  /** Under the title on desktop and tablet. */
  sub: "The ideas behind the checklist, in seven short parts",
  /** Under the title on phone: {n} is the part, {total} how many. */
  partOf: "Part {n} of {total}",
  /** Phone: the button that opens the parts list. */
  allParts: "All seven parts",
  /** Phone: the buttons at the foot, to the part before and after. */
  back: "‹ {n} · {title}",
  next: "{n} · {title} ›",
  /** The way back to the checklist (desktop button; the phone's back arrow says it aloud). */
  checklist: "Checklist",
  backToChecklist: "Back to checklist",
  /** The box's label. */
  inInvolo: "In Involo",
  /** The "In Involo" links' words; {phase} and {step} are the pilot's current phase and step. */
  links: {
    phase: "{phase}",
    step: "{step}",
    emergency: "{reference}",
    settings: "Settings",
    open: "Open steps",
    flight: "Flight › Overview",
  } satisfies Record<HowLink, string>,

  parts: [
    {
      title: "The shape of a flight",
      blocks: [
        {
          p: "Involo splits a flight into {stages} stages: {stageNames}. Each stage is made of phases, such as Before start or Taxi, and each phase holds its procedures in the order you fly them.",
        },
        {
          p: "You always know where you are: the stage is in the header and the phase in the row below it. Move ahead or back at any time; your place is saved as you go.",
        },
      ],
      inInvolo: { text: "The stage and phase tabs, or the stage button on smaller screens.", link: "phase" },
    },
    {
      title: "Flows, then checklists",
      blocks: [
        {
          p: "Airline crews don’t read their way through setting up an airplane. They do a **flow**: a fixed sweep across the panels, setting each switch from memory in the same order every time. The order follows the flight deck itself, so nothing is skipped by accident.",
        },
        {
          p: "Then comes the **checklist**. It doesn’t do the work again. One pilot reads each item, the challenge; the other looks, confirms it’s set, and answers, the response. A checklist only catches what the flow missed, so it’s short.",
        },
        { figure: true },
      ],
      inInvolo: {
        text: "The steps list is the flow. A phase’s checklist opens when its procedure is done.",
        link: "phase",
      },
    },
    {
      title: "Reading a step",
      blocks: [
        { p: "Every step names the control, the value to set, and where to find it. Open a step for more:" },
        {
          terms: [
            { term: "Check", text: "what to look at to know it worked" },
            { term: "If not", text: "what to do when it didn’t" },
            { term: "Why", text: "the reason the step exists" },
            { term: "Where is this?", text: "the panel, with the control in blue" },
          ],
        },
        {
          p: "A blank in a value, like “____ units”, is a number from your flight. A step that asks a question offers its answers instead of Done, and the steps that follow can change with your answer.",
        },
      ],
      inInvolo: { text: "Open the current step.", link: "step" },
    },
    {
      title: "When something goes wrong",
      blocks: [
        {
          p: "Some failures can’t wait for a book. Their first actions are **memory items**: a few steps every pilot knows by heart and does at once. The **quick reference** lists come next, read from the list, one action at a time. Longer **non-normal procedures** cover the rest.",
        },
        {
          p: "Involo has {groups}, all behind the {reference} button. Opening one doesn’t lose your place in the normal checklist.",
        },
      ],
      inInvolo: { text: "{reference}, in the header.", link: "emergency" },
    },
    {
      title: "How much you see",
      blocks: [
        {
          p: "**Full** shows every step. **Essentials** shows only the steps marked E, the ones that matter most for this flight. **Detailed** shows each step’s Check, If not and Why; **Simple** shows just the value.",
        },
        {
          p: "**List** shows the steps as lists; **Step by step** follows the same steps one at a time, across the panels in the order you sweep through them. Change any of these at any time; your ticks stay as they are.",
        },
      ],
      inInvolo: { text: "The Full · Detailed button above the steps.", link: "settings" },
    },
    {
      title: "Skipping and coming back",
      blocks: [
        {
          p: "Real flights don’t always go in order. **Skip for now** leaves a step open and moves on. Open steps are counted at the top of the phase, and an amber dot on a stage means it still has one. Come back to any of them from the list, or use **Do it now**.",
        },
        {
          p: "**Clear ticks** starts a procedure over. **Reset flight plan** clears the whole flight. Both can be undone right after.",
        },
      ],
      inInvolo: { text: "The open steps list.", link: "open" },
    },
    {
      title: "Your flight’s numbers",
      blocks: [
        {
          p: "Steps that need a number, like the takeoff trim or the altimeter setting, take it from your flight. Import your plan from SimBrief, or open the flight strip and enter the clearance yourself. The Flight pages show every value, what it’s for, and where it goes in the cockpit.",
        },
        {
          p: "SimBrief import is the only part of Involo that uses the internet. Only your SimBrief username is sent.",
        },
      ],
      inInvolo: { text: "The flight strip, or Flight.", link: "flight" },
    },
  ] satisfies HowPart[],

  /** Part 2's figure (the HowItWorks board). */
  figure: {
    flowHeading: "1 · THE FLOW, FROM MEMORY",
    /** The figure's spoken label: {areas} are its boxes' names, "overhead, glareshield, main panel,
     * then pedestal". */
    flowLabel: "A flow sweeps across the panels in a fixed pattern: {areas}",
    /** A box's name when the pack names no flight deck areas: {n} is 1 to 4. */
    area: "AREA {n}",
    start: "start",
    end: "end",
    checklistHeading: "2 · THE CHECKLIST, READ ALOUD",
    challenge: "CHALLENGE · ONE PILOT READS",
    response: "RESPONSE · THE OTHER CONFIRMS",
    /** Sample rows with no aircraft's values: a control and what the checklist asks for. */
    rows: [
      { challenge: "Battery", response: "ON" },
      { challenge: "Fuel quantity", response: "____, checked" },
      { challenge: "Beacon light", response: "ON" },
      { challenge: "Trim", response: "____, set" },
    ],
    caption: "Do the flow, then use the checklist to confirm nothing was missed.",
  },
};

/** The values the text names, from the pack. */
export type HowCounts = { stages: number; stageNames: string; groups: string; reference: string };

/** "A, B and C". */
const andList = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/** How each reference group's lists are counted in words: the app's three groups by their words,
 * any other by its title from the pack's labels. */
const groupWords = (id: string, title: string, n: number): string => {
  if (id === "memory") return `${n} memory-item ${n === 1 ? "list" : "lists"}`;
  if (id === "quick") return `${n} quick reference ${n === 1 ? "list" : "lists"}`;
  if (id === "procedures") return `${n} ${n === 1 ? "procedure" : "procedures"}`;
  return `${n} ${title} ${n === 1 ? "list" : "lists"}`;
};

/** The values from the pack: the stages the flight shows (`stages`, their titles), and the lists
 * in each reference group, read by `group` in the labels' order, never by the phases' order or
 * titles (decision 0029). */
export function howCountsOf(pack: FlatPack | null | undefined, stages: string[]): HowCounts {
  const phases = (pack?.content.phases?.phases ?? []).filter((p) => p.reference);
  const labels = pack?.content.labels;
  const named = labels?.reference.groups ?? [];
  const ids = [
    ...named.map((g) => g.id),
    ...phases.map((p) => p.group ?? "").filter((g) => g && !named.some((x) => x.id === g)),
  ];
  const groups = [...new Set(ids)]
    .map((id) => ({
      id,
      title: named.find((g) => g.id === id)?.title ?? id,
      n: phases.filter((p) => p.group === id).reduce((n, p) => n + p.lists.length, 0),
    }))
    .filter((g) => g.n > 0)
    .map((g) => groupWords(g.id, g.title, g.n));
  return {
    stages: stages.length,
    stageNames: andList(stages),
    groups: andList(groups),
    reference: labels?.reference.title ?? "",
  };
}

/**
 * The figure's four boxes (part 2): the pack's flight deck areas in its order, by their short
 * names, each name once ("Overhead" for both overhead regions), skipping an area with no panels on
 * the map (Around the flight deck); "AREA 1" to "AREA 4" where the pack names none.
 */
export function flowAreas(pack: FlatPack | null | undefined): string[] {
  const overview = pack?.content.controls?.overview;
  const boxes = overview?.areas ?? [];
  const names: string[] = [];
  for (const r of overview?.regions ?? []) {
    const mapped = boxes.some((a) => {
      const [x, y] = [a.x + a.width / 2, a.y + a.height / 2];
      return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    });
    const name = (r.short ?? r.name).toUpperCase();
    if (mapped && !names.includes(name)) names.push(name);
  }
  return [0, 1, 2, 3].map((n) => names[n] ?? fill(HOW.figure.area, { n: n + 1 }));
}

/** The figure's spoken label, its areas in sweep order: "…: overhead, glareshield, main panel,
 * then pedestal". */
export function flowLabelOf(areas: string[]): string {
  const words = areas.map((a) => a.toLowerCase());
  const list = words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")}, then ${words.at(-1)}`;
  return fill(HOW.figure.flowLabel, { areas: list });
}

/** A line with its {placeholders} filled from `values`; a name with no value stays as written. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));
}

/** A line split into plain and **bold** runs. */
export function runs(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((t, n) => ({ text: t, bold: n % 2 === 1 }))
    .filter((r) => r.text !== "");
}
