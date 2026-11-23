// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The Screen Wake Lock, for Settings › Keep screen awake. Browser code with no host of its own:
// the web host uses it, and so does the desktop host, whose window is a webview.

/** Settings › Keep screen awake (#245): the Screen Wake Lock, held while the setting is on and
 * taken again whenever the page comes back into view (the browser lets it go when the page is
 * hidden). */
type WakeLock = { release(): Promise<void> };
const wakeLocks = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLock> } })
  .wakeLock;
let wakeWanted = false;
let wakeHeld: WakeLock | null = null;
async function holdWake(): Promise<boolean> {
  if (!wakeLocks || !wakeWanted || document.visibilityState !== "visible") return false;
  try {
    wakeHeld ??= await wakeLocks.request("screen");
    return true;
  } catch {
    return false;
  }
}
if (wakeLocks)
  document.addEventListener("visibilitychange", () => {
    wakeHeld = null;
    void holdWake();
  });
export async function keepAwake(on: boolean): Promise<boolean> {
  wakeWanted = on;
  if (on) return holdWake();
  const held = wakeHeld;
  wakeHeld = null;
  await held?.release().catch(() => {});
  return false;
}

/** Whether this browser can keep the screen on. */
export const canKeepAwake = (): boolean => !!wakeLocks;
