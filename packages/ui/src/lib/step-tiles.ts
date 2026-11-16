// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Which panels a step draws (owner, batch 6): only the panels that hold the step's controls, or the
// lights its Check names (both are the step's targets), each its own tile; nothing between them.
// A control on a panel the pack has no drawing for gets a tile too: the panel's name and the step's
// controls on it, as a list.

import type { ItemTarget, Panel, PanelSection, Step } from "@involo/bindings";
import type { PackIndex } from "../pack-index";
import { panelTitle } from "./panel-name";

export type DrawnTile = { kind: "drawn"; id: string; panel: Panel; section: PanelSection; title: string };
export type ListedTile = { kind: "listed"; id: string; title: string; controls: string[] };
export type Tile = DrawnTile | ListedTile;

/** The step's tiles, the one with its main control (its first) first, then in the step's order. */
export function stepTiles(index: PackIndex, step: Step, targets: ItemTarget[]): Tile[] {
  const controls = step.controls ?? [];
  const rank = (ids: readonly string[]) =>
    Math.min(...ids.map((c) => controls.indexOf(c)).filter((n) => n >= 0), Number.POSITIVE_INFINITY);
  const tiles: { tile: Tile; rank: number; at: number }[] = [];
  const drawnControls = new Set<string>();
  for (const id of [...new Set(targets.map((t) => t.section))]) {
    const section = index.section(id);
    const panel = index.panelOf(id);
    if (!section || !panel) continue;
    const ids = targets.filter((t) => t.section === id).flatMap((t) => section.items[t.item]?.controls ?? []);
    for (const c of ids) drawnControls.add(c);
    tiles.push({
      tile: { kind: "drawn", id, panel, section, title: section.title },
      rank: rank(ids),
      at: tiles.length,
    });
  }
  // The step's controls drawn nowhere it targets, on a panel the pack does not draw.
  const listed = new Map<string, { title: string; controls: string[]; ids: string[] }>();
  for (const c of controls) {
    if (drawnControls.has(c)) continue;
    const control = index.control(c);
    if (!control?.zone || index.zoneDrawn(control.zone)) continue;
    const zone = index.zones.find((z) => z.id === control.zone);
    const entry = listed.get(control.zone) ?? { title: zone?.title ?? control.name, controls: [], ids: [] };
    entry.controls.push(control.name);
    entry.ids.push(c);
    listed.set(control.zone, entry);
  }
  for (const [id, e] of listed)
    tiles.push({
      tile: { kind: "listed", id, title: e.title, controls: e.controls },
      rank: rank(e.ids),
      at: tiles.length,
    });
  return tiles.sort((a, b) => a.rank - b.rank || a.at - b.at).map((t) => t.tile);
}

/** The sheet's title and "Also:" line for the step's tiles. */
export const tilesTitle = (tiles: Tile[]) => panelTitle(tiles.map((t) => t.title));
