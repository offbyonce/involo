// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

/** How long a download's file stays reachable after its link is clicked (#69): long enough for a
 * browser that starts the download a little later (Safari, Firefox), then it is freed. */
export const REVOKE_AFTER_MS = 10_000;

/** Hands the pilot a file to save, made on this device, as a browser download: the web host's
 * `saveFile`. A browser doesn't say whether it was saved, so this always counts as saved. */
export function downloadFile(name: string, text: string, type: string): boolean {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  return true;
}
