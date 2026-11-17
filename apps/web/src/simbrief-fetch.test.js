// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPlanText, statusMessage } from "./simbrief-fetch.js";

const reply = (status, body) => async () => new Response(body, { status });

test("a 2xx reply gives its text, asked for with no cache and no credentials", async () => {
  let asked;
  const fetch = async (_url, init) => {
    asked = init;
    return new Response('{"fetch":{}}', { status: 200 });
  };
  assert.equal(await fetchPlanText("https://example.invalid/plan", { fetch }), '{"fetch":{}}');
  assert.equal(asked.cache, "no-store");
  assert.equal(asked.credentials, "omit");
  assert.ok(asked.signal instanceof AbortSignal);
});

test("a request that takes longer than the timeout is cancelled and reported as a timeout", async () => {
  const fetch = (_url, init) =>
    new Promise((_, fail) =>
      init.signal.addEventListener("abort", () => fail(new DOMException("aborted", "AbortError"))),
    );
  await assert.rejects(fetchPlanText("u", { fetch, timeout: 20 }), {
    kind: "FlightPlan",
    message: "SimBrief didn’t answer within 0.02 seconds. Try again, or use a saved OFP file.",
  });
});

test("a 5xx reply is reported by its status, not as a reply that isn't JSON", async () => {
  await assert.rejects(fetchPlanText("u", { fetch: reply(503, "<html>Service unavailable</html>") }), {
    kind: "FlightPlan",
    message: "SimBrief is unavailable right now (error 503). Try again later, or use a saved OFP file.",
  });
});

test("a 4xx reply gives SimBrief's own message when it has one, else the status", async () => {
  const own = async (text) =>
    text.includes("Unknown UserID") ? "SimBrief says: Error: Unknown UserID" : null;
  await assert.rejects(
    fetchPlanText("u", { fetch: reply(400, '{"fetch":{"status":"Error: Unknown UserID"}}'), own }),
    {
      message: "SimBrief says: Error: Unknown UserID",
    },
  );
  await assert.rejects(fetchPlanText("u", { fetch: reply(404, "Not found"), own }), {
    message: statusMessage(404),
  });
  await assert.rejects(fetchPlanText("u", { fetch: reply(429, "") }), { message: statusMessage(429) });
  await assert.rejects(fetchPlanText("u", { fetch: reply(418, "") }), {
    message: "SimBrief answered with error 418. Try again, or use a saved OFP file.",
  });
});

test("a network failure stays a TypeError, for the interface to report as a connection problem", async () => {
  const fetch = async () => {
    throw new TypeError("NetworkError when attempting to fetch resource.");
  };
  await assert.rejects(fetchPlanText("u", { fetch }), TypeError);
});
