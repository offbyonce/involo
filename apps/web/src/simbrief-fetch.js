// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The SimBrief request, straight from the pilot's browser (decision 0019): only the username or
// Pilot ID goes with it. Plain JavaScript, so Node's test runner covers it with a stubbed fetch
// (simbrief-fetch.test.js). It gives up after a timeout, never uses a cached reply, and reports a
// reply that isn't a plan by its HTTP status. Failures are thrown as the app's tagged errors
// (kind "FlightPlan"), whose message the SimBrief screen shows as it is. A network failure stays a
// TypeError, which the interface reports as a connection problem.

/** How long SimBrief has to answer, as on the probe page. */
export const TIMEOUT_MS = 20_000;

const planError = (message) => ({ kind: "FlightPlan", message });

/** What to say for a reply that isn't a plan, by its HTTP status. */
export function statusMessage(status) {
  if (status === 400 || status === 404)
    return "SimBrief found no plan for that username or Pilot ID. Check it, or create a plan on SimBrief first.";
  if (status === 429) return "SimBrief is getting too many requests. Wait a minute, then try again.";
  if (status >= 500)
    return `SimBrief is unavailable right now (error ${status}). Try again later, or use a saved OFP file.`;
  return `SimBrief answered with error ${status}. Try again, or use a saved OFP file.`;
}

/**
 * The text of SimBrief's reply. `own` reads a reply that isn't 2xx: SimBrief's own message (such
 * as an unknown username), or null when it has none, and then the status is reported instead.
 */
export async function fetchPlanText(
  url,
  { fetch = globalThis.fetch, timeout = TIMEOUT_MS, own = async () => null } = {},
) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: abort.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const text = await response.text();
    if (response.ok) return text;
    throw planError((await own(text).catch(() => null)) ?? statusMessage(response.status));
  } catch (e) {
    if (abort.signal.aborted)
      throw planError(
        `SimBrief didn’t answer within ${timeout / 1000} seconds. Try again, or use a saved OFP file.`,
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
