// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers in the interface (#213, Timers boards): the time each has left at the clock's time,
// as the core reports when it started, and the words the chip and the bar show.

import type { Step, StepTimer } from "@involo/bindings";

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
  /** The row form at this width: the desktop rows (from 1440 px), the phone's (below 600 px), or
   * the tablet's in between. Where a timer's words go depends on it (Timers boards). */
  layout: "desktop" | "tablet" | "phone";
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

/** Started, not paused, and with time left. */
export const running = (t: StepTimer, now: number): boolean =>
  t.startedAt !== null && t.pausedLeft === null && leftAt(t, now) > 0;

/** The four states the Timers boards draw: not started, running, paused, and finished (at zero,
 * until restarted). */
export type TimerState = "waiting" | "running" | "paused" | "finished";

export function stateAt(t: StepTimer, now: number): TimerState {
  if (t.startedAt === null) return "waiting";
  if (t.pausedLeft !== null) return "paused";
  return leftAt(t, now) > 0 ? "running" : "finished";
}

/** "7:12": whole minutes and seconds, rounded up so the chip reads 0:00 only at zero. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "10 minutes", "7 minutes 12 seconds": a time in words. */
export function duration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts = [
    m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "",
    r || !m ? `${r} ${r === 1 ? "second" : "seconds"}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** "7 minutes 12 seconds left". */
export const spoken = (ms: number): string => `${duration(ms)} left`;

/** The chip's accessible name: the timer's name and its state, so the state never rests on color
 * ("IRS alignment timer, paused, 4 minutes 31 seconds left"). */
export function chipName(t: StepTimer, now: number): string {
  const left = leftAt(t, now);
  const state = stateAt(t, now);
  const words = {
    waiting: `${duration(left)}, not started`,
    running: spoken(left),
    paused: `paused, ${spoken(left)}`,
    finished: "finished",
  }[state];
  return `${t.label} timer, ${words}`;
}

/** "A or B": the steps whose tick starts a timer, by name. */
const either = (names: string[]): string =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");

/** How the line of text names steps: a step's title, and what doing it is ("set NAV"). */
export type StepWords = { name(step: string): string; action(step: string): string };

/** What ticking `step` does, in words: "set NAV" from the positions its targets set, or "ticked
 * <its title>" when it sets none. */
export function stepAction(step: Step | undefined, title: string): string {
  const set = [...new Set((step?.targets ?? []).filter((t) => t.set && !t.when).map((t) => t.set as string))];
  return set.length ? `set ${set.join(" and ")}` : `ticked ${title}`;
}

/**
 * The line of text under a timer (Timers boards). `chime` is Settings › Timer chime: the running
 * words promise a chime only when it is on.
 */
export function timerWords(t: StepTimer, now: number, words: StepWords, chime: boolean): string {
  const state = stateAt(t, now);
  if (state === "waiting") {
    const by = t.from.length ? either(t.from.map(words.name)) : "this step";
    return `Timer: ${duration(t.seconds * 1000)}. It starts when you tick ${by}.`;
  }
  if (state === "running") {
    const how = t.startedBy ? `Timer started when you ${words.action(t.startedBy)}.` : "Timer running.";
    return `${how} Carry on with other steps${chime ? "; a chime plays at zero" : ""}.`;
  }
  if (state === "paused") return `Timer paused with ${clock(leftAt(t, now))} left.`;
  return "Timer finished.";
}

/** The timers that reached zero between the clock's last tick and this one: the ones to chime
 * for. A timer that ran out while the app was closed doesn't chime when it opens. */
export const finishedBetween = (list: StepTimer[], before: number, now: number): StepTimer[] =>
  list.filter(
    (t) => t.startedAt !== null && t.pausedLeft === null && leftAt(t, before) > 0 && leftAt(t, now) === 0,
  );
