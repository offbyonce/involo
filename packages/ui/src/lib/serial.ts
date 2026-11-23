// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// A queue for changes that read state, wait for the host, then write it back (#267). With the web
// host each call settles before the next tap is handled; the desktop host's calls cross to another
// process, so two changes could start from the same state and one would be lost.

/**
 * Returns a function that runs each task after the one before it has settled, in the order they
 * came. With nothing running, a task starts at once, so the web app behaves as it did before the
 * queue. A task that fails rejects only its own promise; the next one still runs. A task must
 * never wait for another task on the same queue, or both wait forever.
 */
export function serial(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<void> | null = null;
  let waiting = 0;
  return <T>(task: () => Promise<T>): Promise<T> => {
    const before = last;
    const run = before
      ? (async () => {
          await before;
          return task();
        })()
      : started(task);
    waiting++;
    last = (async () => {
      try {
        await run;
      } catch {
        // The task's caller has the failure; the queue only waits for it to settle.
      }
      waiting--;
      // Nothing left: the next task starts at once.
      if (waiting === 0) last = null;
    })();
    return run;
  };
}

/** Starts a task, with a synchronous throw as a rejection, as an async function gives. */
function started<T>(task: () => Promise<T>): Promise<T> {
  try {
    return task();
  } catch (e) {
    return Promise.reject(e);
  }
}
