// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The favicon and theme-color follow the in-app theme (docs/brand/BRAND.md, DESIGN-SYSTEM.md §9),
// adapted from the brand kit's favicon-theme snippet. Safari, installed apps and Chrome on Android
// tint the toolbar with theme-color, so the icon must match the app's theme, not only the OS.
// "system" puts back the page's own media-scoped tags (index.html), which follow the OS.

import type { Theme } from "@involo/bindings";
import { COLOR } from "@involo/ui";

const ICONS = { light: "./icons/favicon-light.svg", dark: "./icons/favicon-dark.svg" } as const;
const MARK = "data-involo-theme";

/** The page's media-scoped icon and theme-color tags, kept the first time for "system". */
let saved: { el: Element; next: Node | null }[] | null = null;

export function applyBrandTheme(theme: Theme, doc: Document = document): void {
  const head = doc.head;
  saved ??= [...head.querySelectorAll('link[rel="icon"][media], meta[name="theme-color"][media]')].map(
    (el) => ({
      el,
      next: el.nextSibling,
    }),
  );
  for (const el of head.querySelectorAll(`[${MARK}]`)) el.remove();

  if (theme === "system") {
    for (const { el, next } of saved) {
      if (!el.isConnected) head.insertBefore(el, next?.isConnected ? next : null);
    }
    return;
  }

  // The media-scoped tags would otherwise win over the chosen theme.
  for (const { el } of saved) el.remove();
  const icon = doc.createElement("link");
  icon.rel = "icon";
  icon.type = "image/svg+xml";
  icon.href = ICONS[theme];
  icon.setAttribute(MARK, "");
  const meta = doc.createElement("meta");
  meta.name = "theme-color";
  meta.content = COLOR[theme].bg;
  meta.setAttribute(MARK, "");
  // The last declared icon wins among equal candidates.
  head.append(icon, meta);
}

/** Forgets the kept tags (tests start from a fresh page). */
export function resetBrandTheme(): void {
  saved = null;
}
