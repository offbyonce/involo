// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Flight deck page's areas (Deck and PhoneDeck boards), from the pack's overview map: one per
// region, in the pack's order. A region the side view draws as several outlines is split into that
// many areas, by its places' own area names, front to back as the map lists them top to bottom,
// each named as the side view names that outline.
// With a side view, a region it does not draw holds the places with no map region of their own:
// shown last, without a map box.

import type { OverviewArea, OverviewRegion, Panel, PanelSection, Zone } from "@involo/bindings";
import { type PackIndex, splitArea } from "../pack-index";

export type DeckArea = {
  /** The address key, from its name. */
  id: string;
  /** The region's name, or for one of a split region's areas its own name. */
  name: string;
  /** The region's or area's code; none when the pack gives none. */
  code: string | null;
  /** The pack's sentence on where to look. */
  locate: string | null;
  /** The region it is drawn from, for the edge captions; none for a region the side view does
   * not draw. */
  region: OverviewRegion | null;
  /** The map's boxes (the pack's overview areas), and the places (zones) they are. */
  boxes: OverviewArea[];
  zones: Zone[];
  /** The side view's place to highlight, by region name, and which of its outlines for a split
   * region (front to back). */
  side: { region: string; shape: number | null } | null;
};

const key = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The page's areas, in the pack's order, the regions the side view does not draw last; for a pack
 * without regions, its zones' area names. */
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
  // No regions: one area per area name the zones give, in map order, each listing its zones.
  if (!regions.length) {
    const names = [
      ...new Set(overview.areas.map((b) => byId.get(b.zone)?.area).filter((a): a is string => !!a)),
    ];
    return names.map((full) => {
      const [name, code] = splitArea(full);
      const boxes = overview.areas.filter((b) => byId.get(b.zone)?.area === full);
      return {
        id: key(name),
        name,
        code,
        locate: null,
        region: null,
        boxes,
        zones: zonesOf(boxes),
        side: null,
      };
    });
  }
  const side = overview.views?.side;
  const placeOf = (name: string) => side?.places?.find((p) => p.region === name) ?? null;
  const out: DeckArea[] = [];
  const around: DeckArea[] = [];
  for (const region of regions) {
    const boxes = overview.areas.filter((a) => regionOf(a) === region);
    const place = placeOf(region.name);
    if (side && !place) {
      around.push({
        id: key(region.name),
        name: region.name,
        code: region.code ?? null,
        locate: region.locate ?? null,
        region: null,
        boxes: [],
        zones: zonesOf(boxes),
        side: null,
      });
      continue;
    }
    // The region's own area names, top to bottom on the map: one per outline of a split region.
    const top = (area: string) =>
      Math.min(...boxes.filter((b) => byId.get(b.zone)?.area === area).map((b) => b.y));
    const split = [...new Set(boxes.map((b) => byId.get(b.zone)?.area).filter((a): a is string => !!a))].sort(
      (a, b) => top(a) - top(b),
    );
    const outlines = place?.shapes.length ?? 0;
    if (outlines > 1 && split.length === outlines) {
      split.forEach((full, shape) => {
        const [name, code] = splitArea(full);
        const mine = boxes.filter((b) => byId.get(b.zone)?.area === full);
        // The side view's name for this outline, else the area's name as written.
        const short = place?.names?.[shape] ?? name;
        out.push({
          id: key(short),
          name: short,
          code,
          locate: region.locate ?? null,
          region,
          boxes: mine,
          zones: zonesOf(mine),
          side: { region: region.name, shape },
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
      side: place ? { region: region.name, shape: null } : null,
    });
  }
  return [...out, ...around];
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
): { label: string; color: string | null; meaning: string; when: string; action: string }[] {
  return zoneSections(index, zone).flatMap(({ panel, section }) =>
    section.items.flatMap((item, i) => {
      if (item.kind !== "light") return [];
      const note = index.lightNote(panel.id, section.id, i);
      return note?.meaning ? [{ label: item.label, color: item.color ?? null, ...note }] : [];
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
