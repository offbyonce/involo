// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The chime a step timer plays at zero (Settings › Timer chime): two short tones, made with the
// Web Audio API, so the app ships no sound file. Silent where the browser has no audio.

export function chime(): void {
  const Context = globalThis.AudioContext;
  if (!Context) return;
  try {
    const ctx = new Context();
    [880, 660].forEach((hz, i) => {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = hz;
      tone.connect(gain);
      gain.connect(ctx.destination);
      const at = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      tone.start(at);
      tone.stop(at + 0.32);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // No sound is better than a failed step.
  }
}
