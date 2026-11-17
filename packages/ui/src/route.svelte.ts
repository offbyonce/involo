// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Screens have their own address after `#`, so Back works and a screen can be bookmarked,
// offline too. `#/phase/<id>`, `#/reference` (optionally `/<phase id>`), `#/settings`,
// `#/flight/<section>` (the Flight pages; optionally `/<field>` to focus a field, or the
// Weather tab), `#/open` (open steps), `#/glossary` (optionally `/<term>`), `#/deck` (optionally `/<area>/<place>`), `#/practice`, `#/how` (optionally `/<part>`, 1 to 7), `#/log` (optionally `/<flight id>`, or `/current` for This flight), `#/references`; anything else is the start. `#/setup` (Flight setup until
// leads to Flight › Overview.

export type Route =
  | { screen: "start" }
  | { screen: "phase"; id: string }
  | { screen: "reference"; id: string | null }
  | { screen: "settings" }
  | { screen: "flight"; section: FlightSection; focus: string | null }
  | { screen: "open" }
  | { screen: "glossary"; term: string | null }
  | { screen: "deck"; area: string | null; zone: string | null }
  | { screen: "practice" }
  | { screen: "how"; part: number | null }
  | { screen: "log"; entry: string | null }
  | { screen: "references" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "phase" && parts[1]) return { screen: "phase", id: parts[1] };
  if (parts[0] === "reference") return { screen: "reference", id: parts[1] ?? null };
  if (parts[0] === "settings") return { screen: "settings" };
  if (parts[0] === "setup") return { screen: "flight", section: "overview", focus: null };
  if (parts[0] === "flight") {
    const section = (FLIGHT_SECTIONS as readonly string[]).includes(parts[1] ?? "")
      ? (parts[1] as FlightSection)
      : "overview";
    return { screen: "flight", section, focus: parts[2] ?? null };
  }
  if (parts[0] === "open") return { screen: "open" };
  if (parts[0] === "glossary") return { screen: "glossary", term: parts[1] ?? null };
  if (parts[0] === "practice") return { screen: "practice" };
  if (parts[0] === "how") {
    const n = Number(parts[1]);
    return { screen: "how", part: Number.isInteger(n) && n >= 1 ? n : null };
  }
  if (parts[0] === "references") return { screen: "references" };
  if (parts[0] === "log") return { screen: "log", entry: parts[1] ?? null };
  if (parts[0] === "deck") return { screen: "deck", area: parts[1] ?? null, zone: parts[2] ?? null };
  return { screen: "start" };
}

/** The Flight pages' sections, in the section list's order (FlightSection boards). */
export const FLIGHT_SECTIONS = [
  "overview",
  "route",
  "fuel",
  "cruise",
  "weather",
  "clearance",
  "takeoff",
  "approach",
  "start",
  "simbrief",
] as const;
export type FlightSection = (typeof FLIGHT_SECTIONS)[number];

/** A Flight section, optionally with a field to focus or a Weather tab. */
export function flightHref(section: FlightSection, focus?: string): string {
  return `#/flight/${section}${focus ? `/${encodeURIComponent(focus)}` : ""}`;
}

/** How procedures work, at a part (1 to 7). */
export function howHref(part?: number): string {
  return part ? `#/how/${part}` : "#/how";
}

/** The Flight log, at an earlier flight ("current" for This flight). */
export function logHref(entry?: string): string {
  return entry ? `#/log/${encodeURIComponent(entry)}` : "#/log";
}

export function phaseHref(id: string): string {
  return `#/phase/${encodeURIComponent(id)}`;
}

/** The current route, kept in step with the address. */
export function currentRoute(): { readonly value: Route } {
  let value = $state(parseRoute(window.location.hash));
  $effect(() => {
    const update = () => {
      value = parseRoute(window.location.hash);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  });
  return {
    get value() {
      return value;
    },
  };
}
