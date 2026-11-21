// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Lookups into a loaded pack by id, so screens can show the text Rust's views refer to. No rules
// live here: what shows, what counts and what is current all come from the host.

import type {
  Control,
  ExplainNote,
  FlatPack,
  Labels,
  Message,
  Overview,
  OverviewArea,
  OverviewRegion,
  Panel,
  PanelSection,
  PanelState,
  RoleLabel,
  Step,
  UserOption,
  Zone,
} from "@involo/bindings";
import { kindOf, methodOf } from "./lib/list-words";

/** What a light note says: its meaning, when the light comes on, and what to do (#211). */
export interface LightNoteText {
  meaning: string;
  when: string;
  action: string;
}

export type PackIndex = {
  name: string;
  step(id: string): Step | undefined;
  /** The step's first control, its zone and the panel section drawn for that zone. */
  place(step: Step): Place | null;
  zones: Zone[];
  /** The pack's panel drawings, in pack order. */
  panels: Panel[];
  /** Every control, in pack order. */
  controls: Control[];
  /** A step's place in flight order (the phases' lists in turn), for sorting. */
  order(stepId: string): number;
  overview: Overview | null;
  options: UserOption[];
  /** The panel states the pack offers (a simulator's saved starting points). */
  panelStates: PanelState[];
  /** The Start page's order (the pack's `start_page`): option ids and `panel_state`. */
  startPage: string[];
  /** A shared "how to do it" note's steps, by id. */
  how(id: string): string[] | undefined;
  /** A shared explanation, by id. */
  explain(id: string): ExplainNote | undefined;
  /** A panel section by id. */
  section(id: string): PanelSection | undefined;
  /** The panel a section is on. */
  panelOf(id: string): Panel | undefined;
  /** The overview region a zone is in, and the map areas that region shows. */
  region(zone: Zone): MapRegion | null;
  /** A control by id. */
  control(id: string): Control | undefined;
  /** A glossary term's meaning. */
  glossary(term: string): string | undefined;
  /** A light's meaning (its note), by panel, section and item index. */
  lightMeaning(panel: string, section: string, item: number): string | undefined;
  /** A light's whole note: its meaning, when it comes on and what to do, by panel, section and
   * item index. */
  lightNote(panel: string, section: string, item: number): LightNoteText | undefined;
  /** The phase a step's list is in, by id. */
  phaseOf(stepId: string): string | undefined;
  /** A step's name as the app shows it, by id: Rust works it out when it reads the pack. */
  stepName(stepId: string): string | undefined;
  /** A control's name as the app shows it, by id, worked out the same way. */
  controlName(controlId: string): string | undefined;
  /** The step that asks an option (decision 0022), if any. */
  decider(option: string): Step | undefined;
  /** The steps whose targets depend on an option's answer, in pack order. */
  dependents(option: string): Step[];
  /**
   * The steps whose targets name a panel item, each with its phase's title: in flight order (the
   * phases' order, then their lists'), each step once. A step that two lists repeat in the same
   * phase (a flow and its checklist) is listed once, at its first place.
   */
  usedIn(panel: string, section: string, item: number): { step: Step; phase: string }[];
  /** Whether the pack draws a zone's panel: a section carries its id, or one of its controls. */
  zoneDrawn(zone: string): boolean;
  /** Whether any drawn item carries the control. */
  controlDrawn(control: string): boolean;
  /** The words the interface shows for this pack: its labels over the app's defaults. */
  labels: Labels;
  /** Words that tell one of a pair from the other (labels `side_words`), then the seated roles'
   * names and short names: panel names pair by them. */
  sideWords: string[];
  /** The aircraft's alert messages, in the pack's order; none when it has no alert display. */
  messages: Message[];
  /** The messages that call for a step (that list it in their `steps`). */
  messagesFor(stepId: string): Message[];
  /** The messages that call for a list. */
  messagesCalling(listId: string): Message[];
  /** A list's title and its steps, by id. */
  list(id: string): { title: string; steps: Step[] } | undefined;
  /** The id of the list a step is in. */
  listOf(stepId: string): string | undefined;
  /** A list's kind in the pack's words ("Checklist"), by id. */
  listKind(id: string): string | undefined;
  /** How a list is used in the pack's words ("Challenge and response"), or null when it sets no
   * method (decision 0029). */
  listMethod(id: string): string | null;
  /** A crew role by id (decision 0029); none when the pack's labels don't list it. */
  role(id: string | null | undefined): RoleLabel | undefined;
  /** Settings › Your seat: the seats the labels list, each named with the role that sits there
   * ("Left seat · Captain"); none unless the pack draws a view for more than one seat. */
  seats: { id: string; label: string }[];
  /** Whether the pack marks any step for Essentials (`quick`); without one there is no Essentials
   * to choose (#133). */
  hasEssentials: boolean;
};

export type MapRegion = { region: OverviewRegion | null; areas: OverviewArea[] };

const center = (a: OverviewArea) => [a.x + a.width / 2, a.y + a.height / 2] as const;
const holds = (r: OverviewRegion, [x, y]: readonly [number, number]) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export type Place = {
  control: Control | null;
  zone: Zone;
  section: PanelSection | null;
};

/** "Forward overhead (P5)" → ["Forward overhead", "P5"]. */
export function splitArea(area: string): [string, string | null] {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(area);
  return match ? [match[1] ?? area, match[2] ?? null] : [area, null];
}

export function indexPack(pack: FlatPack): PackIndex {
  const messages = pack.content.messages?.messages ?? [];
  const steps = new Map<string, Step>();
  for (const list of pack.lists) for (const step of list.steps) steps.set(step.id, step);
  const controls = new Map((pack.content.controls?.controls ?? []).map((c) => [c.id, c]));
  const zones = new Map((pack.content.controls?.zones ?? []).map((z) => [z.id, z]));
  const sections = new Map<string, PanelSection>();
  const panels = new Map<string, Panel>();
  for (const panel of pack.content.panels ?? []) {
    for (const s of panel.sections) {
      sections.set(s.id, s);
      panels.set(s.id, panel);
    }
  }

  // The zones whose panel the pack draws (a section with the zone's id, or a drawn control in it).
  const drawnZones = new Set<string>(sections.keys());
  const drawnControls = new Set<string>();
  for (const s of sections.values())
    for (const it of s.items)
      for (const c of it.controls ?? []) {
        drawnControls.add(c);
        const z = controls.get(c)?.zone;
        if (z) drawnZones.add(z);
      }
  const glossary = new Map((pack.content.glossary?.terms ?? []).map((t) => [t.term, t.meaning]));
  const lightNotes = new Map(
    (pack.content.lights?.lights ?? []).map((n) => [
      n.locator,
      { meaning: n.meaning, when: n.when, action: n.action },
    ]),
  );

  /** The locator a step target uses for an item: "oh/fuel/AFT 1/1", the n-th of its label. */
  const locator = (panel: string, section: string, item: number) => {
    const items = sections.get(section)?.items ?? [];
    const it = items[item];
    if (!it) return null;
    const n = items.slice(0, item + 1).filter((o) => o.label === it.label).length;
    return `${panel}/${section}/${it.label}/${n}`;
  };
  const phaseOfList = new Map<string, string>();
  const phaseIdOfList = new Map<string, string>();
  const groupOfList = new Map<string, string>();
  for (const phase of pack.content.phases?.phases ?? []) {
    for (const list of phase.lists) {
      phaseOfList.set(list, phase.title);
      phaseIdOfList.set(list, phase.id);
      if (phase.group) groupOfList.set(list, phase.group);
    }
  }
  // Lists in flight order: each phase's lists in turn, then any list no phase holds.
  const listsById = new Map(pack.lists.map((l) => [l.id, l]));
  const flightOrder = [
    ...(pack.content.phases?.phases ?? []).flatMap((p) => p.lists.flatMap((id) => listsById.get(id) ?? [])),
    ...pack.lists.filter((l) => !phaseOfList.has(l.id)),
  ].filter((l, i, all) => all.indexOf(l) === i);
  const listOfStep = new Map<string, string>();
  for (const list of pack.lists) for (const step of list.steps) listOfStep.set(step.id, list.id);
  const stepOrder = new Map<string, number>();
  for (const list of flightOrder)
    for (const step of list.steps) if (!stepOrder.has(step.id)) stepOrder.set(step.id, stepOrder.size);

  return {
    name: pack.manifest.name,
    phaseOf: (stepId) => phaseIdOfList.get(listOfStep.get(stepId) ?? ""),
    decider: (option) => [...steps.values()].find((s) => s.decide === option),
    dependents: (option) =>
      [...steps.values()].filter((s) => (s.targets ?? []).some((t) => t.when?.option === option)),
    usedIn(panel, section, item) {
      const at = locator(panel, section, item);
      if (!at) return [];
      const seen = new Set<string>();
      const used: { step: Step; phase: string }[] = [];
      for (const list of flightOrder) {
        const phase = phaseOfList.get(list.id) ?? list.title;
        for (const step of list.steps) {
          if (!(step.targets ?? []).some((t) => t.at === at)) continue;
          const key = `${step.text}\u0000${phase}`;
          if (seen.has(key)) continue;
          seen.add(key);
          used.push({ step, phase });
        }
      }
      return used;
    },
    control: (id) => controls.get(id),
    glossary: (term) => glossary.get(term),
    stepName: (id) => pack.names?.steps[id],
    controlName: (id) => pack.names?.controls[id],
    lightMeaning(panel, section, item) {
      return this.lightNote(panel, section, item)?.meaning;
    },
    lightNote(panel, section, item) {
      // The n-th item with that label in the section, counted from 1, as light notes name them.
      const at = locator(panel, section, item);
      return at ? lightNotes.get(at) : undefined;
    },
    step: (id) => steps.get(id),
    place(step) {
      for (const id of step.controls ?? []) {
        const control = controls.get(id);
        const zone = control?.zone ? zones.get(control.zone) : undefined;
        if (control && zone) return { control, zone, section: sections.get(zone.id) ?? null };
      }
      return null;
    },
    zones: [...zones.values()],
    panels: pack.content.panels ?? [],
    controls: [...controls.values()],
    order: (stepId) => stepOrder.get(stepId) ?? Number.MAX_SAFE_INTEGER,
    overview: pack.content.controls?.overview ?? null,
    options: pack.content.phases?.options ?? [],
    panelStates: pack.content.panelStates?.states ?? [],
    startPage: pack.content.phases?.startPage ?? [],
    section: (id) => sections.get(id),
    panelOf: (id) => panels.get(id),
    zoneDrawn: (zone) => drawnZones.has(zone),
    controlDrawn: (control) => drawnControls.has(control),
    labels: pack.content.labels,
    sideWords: [
      ...pack.content.labels.sideWords,
      ...pack.content.labels.roles.filter((r) => r.seat).flatMap((r) => [r.title, r.short]),
    ],
    messages,
    messagesFor: (stepId) => messages.filter((m) => (m.steps ?? []).includes(stepId)),
    messagesCalling: (listId) => messages.filter((m) => m.list === listId),
    listOf: (stepId) => listOfStep.get(stepId),
    listKind: (id) => {
      const list = listsById.get(id);
      return list ? kindOf(pack.content.labels, list, groupOfList.get(id)) : undefined;
    },
    listMethod: (id) => methodOf(pack.content.labels, listsById.get(id)?.method),
    role: (id) => (id ? pack.content.labels.roles.find((r) => r.id === id) : undefined),
    seats: seatChoices(pack),
    hasEssentials: pack.lists.some((l) => l.steps.some((st) => st.quick)),
    list: (id) => {
      const l = pack.lists.find((x) => x.id === id);
      return l ? { title: l.title, steps: l.steps } : undefined;
    },
    how: (id) => pack.content.notes?.how?.find((n) => n.id === id)?.steps,
    explain: (id) => pack.content.notes?.explain?.find((n) => n.id === id),
    region(zone) {
      const overview = pack.content.controls?.overview;
      if (!overview) return null;
      const regions = overview.regions ?? [];
      // An area belongs to the first region that holds its center.
      const regionOf = (a: OverviewArea) => regions.find((r) => holds(r, center(a))) ?? null;
      const mine = overview.areas.find((a) => a.zone === zone.id);
      if (!mine) return null;
      const region = regionOf(mine);
      if (region) return { region, areas: overview.areas.filter((a) => regionOf(a) === region) };
      // A pack without regions: the areas of zones in the same named area.
      const sameArea = (a: OverviewArea) => zones.get(a.zone)?.area === zone.area;
      return { region: null, areas: overview.areas.filter(sameArea) };
    },
  };
}

/** The seat setting's choices: every seat the labels list, when the pack draws more than one seat
 * frame; each named with the first role that sits in it. */
function seatChoices(pack: FlatPack): { id: string; label: string }[] {
  const seat = pack.content.controls?.overview?.views?.seat;
  if (!seat || typeof (seat as { width?: unknown }).width === "number" || Object.keys(seat).length < 2)
    return [];
  const { seats, roles } = pack.content.labels;
  return seats.map((s) => {
    const role = roles.find((r) => r.seat === s.id);
    return { id: s.id, label: role ? `${s.title} · ${role.title}` : s.title };
  });
}
