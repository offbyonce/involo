// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

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
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
