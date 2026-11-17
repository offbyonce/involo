// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What the SimBrief screen says when an import fails. The app's tagged errors carry their own
// message. Only a failed request (a TypeError from fetch) or a cancelled one is a connection
// problem; anything else is not reported as one. A file the pilot chose never mentions the
// connection.

import { isAppError } from "@involo/bindings";

const NETWORK = "Couldn't reach SimBrief. Check your connection, or use a saved OFP file.";

function cancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && "name" in e && e.name === "AbortError";
}

/** Why fetching the latest plan from SimBrief failed. */
export function fetchProblem(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof TypeError || cancelled(e)) return NETWORK;
  return "Something went wrong importing the plan. Try again, or use a saved OFP file.";
}

/** Why reading a chosen OFP file failed. */
export function fileProblem(e: unknown): string {
  if (isAppError(e)) return e.message;
  return "Something went wrong reading that file. Check that it is a SimBrief OFP file (JSON or XML), then try again.";
}
