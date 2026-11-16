// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// How procedures work: every word on the page, in one place to edit (the owner's CONTENT.md, a
// first draft to adjust after seeing it in the app). How to write here:
//   **word**   shows in bold.
//   {stages}   a count from the pack: {stages}, {memory}, {qrh} and {procedures}.
// Each part has a title, its blocks in order, and its "In Involo" box: the line, and where the link
// goes ("phase": the pilot's current phase, "step": the current step, "emergency": the Emergency
// list, "settings", "open": Open steps, "flight": Flight › Overview).

/** One block of a part: a paragraph, a list of terms and what they mean, or part 2's figure. */
export type HowBlock = { p: string } | { terms: { term: string; text: string }[] } | { figure: true };

/** Where an "In Involo" link goes. */
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
    emergency: "Emergency",
    settings: "Settings",
    open: "Open steps",
    flight: "Flight › Overview",
  } satisfies Record<HowLink, string>,

  parts: [
    {
      title: "The shape of a flight",
      blocks: [
        {
          p: "Involo splits a flight into {stages} stages: Preflight, Departure, Enroute, Arrival and Post-flight. Each stage is made of phases, such as Before start or Taxi, and each phase holds its procedures in the order you fly them.",
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
          p: "Involo has {memory} memory-item lists, {qrh} quick reference lists and {procedures} procedures, all behind the Emergency button. Opening one doesn’t lose your place in the normal checklist.",
        },
      ],
      inInvolo: { text: "Emergency, in the header.", link: "emergency" },
    },
    {
      title: "How much you see",
      blocks: [
        {
          p: "**Full** shows every step. **Essentials** shows only the steps marked E, the ones that matter most for this flight. **Detailed** shows each step’s Check, If not and Why; **Simple** shows just the value.",
        },
        {
          p: "**Checklist** lists the steps; **Flow** follows the same steps across the panels, in the order you sweep through them. Change any of these at any time; your ticks stay as they are.",
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
    flowLabel:
      "A flow sweeps across the panels in a fixed pattern: overhead, glareshield, main panel, then pedestal",
    panels: { overhead: "OVERHEAD", glareshield: "GLARESHIELD", main: "MAIN PANEL", pedestal: "PEDESTAL" },
    start: "start",
    end: "end",
    checklistHeading: "2 · THE CHECKLIST, READ ALOUD",
    challenge: "CHALLENGE · ONE PILOT READS",
    response: "RESPONSE · THE OTHER CONFIRMS",
    rows: [
      { challenge: "Fuel", response: "____ kg, pumps ON" },
      { challenge: "Hydraulic pumps", response: "ON" },
      { challenge: "Anti-collision light", response: "ON" },
      { challenge: "Stabilizer trim", response: "____ units" },
    ],
    caption: "Do the flow, then use the checklist to confirm nothing was missed.",
  },
};

/** The counts the text names, from the pack. */
export type HowCounts = { stages: number; memory: number; qrh: number; procedures: number };

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
