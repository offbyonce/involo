// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the SimBrief screen says when an import fails. The app's tagged errors carry their own
// message. Only a failed request (a TypeError from fetch) or a cancelled one is a connection
// problem; anything else is not reported as one. A file the pilot chose never mentions the
// connection.

import { isAppError, type SavedPlan } from "@involo/bindings";

const NETWORK = "Couldn't reach SimBrief. Check your connection, or use a saved OFP file.";

function cancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && "name" in e && e.name === "AbortError";
}

/** "KSEA → KSFO, imported 09:41": the plan the flight keeps, as SimBrief and OFP file names it. */
export function planLine(plan: SavedPlan): string {
  const at = new Date(plan.loadedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${plan.plan.origin?.icao ?? "—"} → ${plan.plan.destination?.icao ?? "—"}, imported ${at}`;
}

/** Why fetching the latest plan from SimBrief failed. With no connection and a plan already kept
 * for the flight, it says that plan is still in use. */
export function fetchProblem(e: unknown, last: SavedPlan | null = null): string {
  if (isAppError(e)) return e.message;
  if (e instanceof TypeError || cancelled(e))
    return last ? `Offline, using your last plan: ${planLine(last)}.` : NETWORK;
  return "Something went wrong importing the plan. Try again, or use a saved OFP file.";
}

/** Why reading a chosen OFP file failed. */
export function fileProblem(e: unknown): string {
  if (isAppError(e)) return e.message;
  return "Something went wrong reading that file. Check that it is a SimBrief OFP file (JSON or XML), then try again.";
}
