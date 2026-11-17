// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The one place the interface calls `.then(`: every promise it doesn't await goes through here, so
// a failure always has somewhere to go and never leaves a screen silently stale. A test
// (safely.test.ts) keeps `.then(` out of every other source file.

/**
 * Runs `ok` with the promise's value; a failure (of the promise or of `ok`) goes to `failed`,
 * which by default reports it on the console.
 */
export function safely<T>(
  promise: Promise<T>,
  ok: (value: T) => void,
  failed: (error: unknown) => void = report,
): void {
  promise.then(ok).catch(failed);
}

function report(error: unknown): void {
  console.error(error);
}
