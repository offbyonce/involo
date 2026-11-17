// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight deck page's areas (Deck and PhoneDeck boards): the board's seven, from the pack's
// overview map, the center console split into its three panels by the pack's own area names, and
// "Around the flight deck" last, for the places with no map region of their own.

import type { OverviewArea, OverviewRegion, Panel, PanelSection, Zone } from "@involo/bindings";
import { type PackIndex, splitArea } from "../pack-index";

export type DeckArea = {
  /** The address key ("forward-overhead"). */
  id: string;
  /** "Forward overhead", "Forward electronic", "Around the flight deck". */
  name: string;
  /** "P5", "P1–P3", "P9"; none for the control stand. */
  code: string | null;
  /** The pack's sentence on where to look ("Above the windshield, in front of your head."). */
  locate: string | null;
  /** The region it is drawn from, for the edge captions; none for Around the flight deck. */
  region: OverviewRegion | null;
  /** The map's boxes (the pack's overview areas), and the places (zones) they are. */
  boxes: OverviewArea[];
  zones: Zone[];
  /** The side view's place to highlight, by region name, and which of its outlines (the console's
   * three panels are one place of three outlines, front to back). */
  side: { region: string; shape: number | null } | null;
};

const key = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const AROUND = "Around the flight deck";
/** The console's panels front to back, as the side view draws its three outlines. */
const CONSOLE = ["Forward electronic panel (P9)", "Control stand", "Aft electronic panel (P8)"];

/** The page's areas, in the board's order, Around the flight deck last. */
export function deckAreas(index: PackIndex): DeckArea[] {
  const overview = index.overview;
  if (!overview) return [];
  const regions = overview.regions ?? [];
  const holds = (r: OverviewRegion, a: OverviewArea) => {
    const x = a.x + a.width / 2;
    const y = a.y + a.height / 2;
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  };
  const regionOf = (a: OverviewArea) => regions.find((r) => holds(r, a)) ?? null;
  const byId = new Map(index.zones.map((z) => [z.id, z]));
  const zonesOf = (boxes: OverviewArea[]) => {
    const seen = new Set<string>();
    return boxes.flatMap((b) => {
      const z = byId.get(b.zone);
      if (!z || seen.has(z.id)) return [];
      seen.add(z.id);
      return [z];
    });
  };
  const sideHas = (name: string) => !!overview.views?.side?.places?.some((p) => p.region === name);
  const out: DeckArea[] = [];
  let around: DeckArea | null = null;
  for (const region of regions) {
    const boxes = overview.areas.filter((a) => regionOf(a) === region);
    if (region.name === AROUND) {
      around = {
        id: key(AROUND),
        name: AROUND,
        code: null,
        locate: region.locate ?? null,
        region: null,
        boxes: [],
        zones: zonesOf(boxes),
        side: null,
      };
      continue;
    }
    const split = CONSOLE.filter((name) => boxes.some((b) => byId.get(b.zone)?.area === name));
    if (split.length > 1) {
      split.forEach((full) => {
        const [name, code] = splitArea(full);
        const mine = boxes.filter((b) => byId.get(b.zone)?.area === full);
        const short = name.replace(/\s+panel$/i, "");
        out.push({
          id: key(short),
          name: short,
          code,
          locate: region.locate ?? null,
          region,
          boxes: mine,
          zones: zonesOf(mine),
          side: sideHas(region.name) ? { region: region.name, shape: CONSOLE.indexOf(full) } : null,
        });
      });
      continue;
    }
    out.push({
      id: key(region.name),
      name: region.name,
      code: region.code ?? null,
      locate: region.locate ?? null,
      region,
      boxes,
      zones: zonesOf(boxes),
      side: sideHas(region.name) ? { region: region.name, shape: null } : null,
    });
  }
  if (around) out.push(around);
  return out;
}

/** The sections that draw a place: its own section, or those holding one of its controls. */
export function zoneSections(index: PackIndex, zone: Zone): { panel: Panel; section: PanelSection }[] {
  const out: { panel: Panel; section: PanelSection }[] = [];
  for (const panel of index.panels) {
    for (const section of panel.sections) {
      const own = section.id === zone.id;
      const holds = section.items.some((it) =>
        (it.controls ?? []).some((c) => index.control(c)?.zone === zone.id),
      );
      if (own || holds) out.push({ panel, section });
    }
  }
  return out;
}

/** A place's controls by name (listed, for a place the pack does not draw). */
export const zoneControls = (index: PackIndex, zone: Zone): string[] =>
  index.controls.filter((c) => c.zone === zone.id).map((c) => c.name);

/** A place's lights with their meanings, in drawing order. */
export function zoneLights(
  index: PackIndex,
  zone: Zone,
): { label: string; color: string | null; meaning: string }[] {
  return zoneSections(index, zone).flatMap(({ panel, section }) =>
    section.items.flatMap((item, i) => {
      if (item.kind !== "light") return [];
      const meaning = index.lightMeaning(panel.id, section.id, i);
      return meaning ? [{ label: item.label, color: item.color ?? null, meaning }] : [];
    }),
  );
}

/** The steps that use a place's items, each once, in flight order, with their phase's title. */
export function zoneSteps(index: PackIndex, zone: Zone): { id: string; phase: string }[] {
  const seen = new Set<string>();
  const out: { id: string; phase: string; at: number }[] = [];
  for (const { panel, section } of zoneSections(index, zone))
    section.items.forEach((_, i) => {
      for (const u of index.usedIn(panel.id, section.id, i)) {
        if (seen.has(u.step.id)) continue;
        seen.add(u.step.id);
        out.push({ id: u.step.id, phase: u.phase, at: index.order(u.step.id) });
      }
    });
  return out.sort((a, b) => a.at - b.at).map(({ id, phase }) => ({ id, phase }));
}

/** The area a place is in. */
export const areaOf = (areas: DeckArea[], zone: string): DeckArea | undefined =>
  areas.find((a) => a.zones.some((z) => z.id === zone));

/** The page's address: an area, and optionally a place in it. */
export const deckHref = (area?: string | null, zone?: string | null): string =>
  `#/deck${area ? `/${encodeURIComponent(area)}` : ""}${area && zone ? `/${encodeURIComponent(zone)}` : ""}`;
