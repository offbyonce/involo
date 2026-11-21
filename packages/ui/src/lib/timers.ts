// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers in the interface (#213, Timer board): the time each has left at the clock's time,
// as the core reports when it started, and the words the chip and the bar show.

import type { StepTimer } from "@involo/bindings";

/** What the step rows and the running-timers bar need: each step's timer, the clock, and the
 * pilot's controls. The app makes it from the core's timers. */
export type Timers = {
  /** Every step timer in the pack. */
  list: StepTimer[];
  /** The step's timer, if it has one. */
  of(step: string): StepTimer | undefined;
  /** The clock's time, in milliseconds, ticking every second while a timer runs. */
  now: number;
  /** Settings › Timer chime: whether a timer chimes at zero. */
  chime: boolean;
  pause(step: string): void;
  resume(step: string): void;
  restart(step: string): void;
};

/** The time a timer has left at `now`, in milliseconds: the whole time before it starts, what it
 * had when paused, and never below zero (as the core's `StepTimer::left_at`). */
export function leftAt(t: StepTimer, now: number): number {
  const whole = t.seconds * 1000;
  if (t.pausedLeft !== null) return t.pausedLeft;
  if (t.startedAt === null) return whole;
  return Math.max(0, whole - Math.max(0, now - t.startedAt));
}

/** Started, not paused, and with time left: the state the Timer board draws. */
export const running = (t: StepTimer, now: number): boolean =>
  t.startedAt !== null && t.pausedLeft === null && leftAt(t, now) > 0;

/** "7:12": whole minutes and seconds, rounded up so the chip reads 0:00 only at zero. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "7 minutes 12 seconds left", for screen readers. */
export function spoken(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts = [
    m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "",
    r || !m ? `${r} ${r === 1 ? "second" : "seconds"}` : "",
  ];
  return `${parts.filter(Boolean).join(" ")} left`;
}

/** The timers that reached zero between the clock's last tick and this one: the ones to chime
 * for. A timer that ran out while the app was closed doesn't chime when it opens. */
export const finishedBetween = (list: StepTimer[], before: number, now: number): StepTimer[] =>
  list.filter(
    (t) => t.startedAt !== null && t.pausedLeft === null && leftAt(t, before) > 0 && leftAt(t, now) === 0,
  );
