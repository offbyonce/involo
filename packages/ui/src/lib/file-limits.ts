// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The largest files the app reads when the pilot chooses one. A larger file is refused before it
// is read, so an oversized or wrong file can't stall the page.

const MB = 1024 * 1024;

/** A full flight log as Export JSON writes it (500 flights, every step ticked) is about 32 MB;
 * twice that leaves room for a longer pack. */
export const MAX_LOG_FILE_BYTES = 64 * MB;

/** A SimBrief OFP file, JSON or XML, is a few megabytes even for a long-haul flight. */
export const MAX_PLAN_FILE_BYTES = 16 * MB;

/** Why a chosen file is refused unread, or null when it may be read. */
export function tooLarge(file: File, max: number, what: string): string | null {
  return file.size > max
    ? `That file is too large to be ${what} (over ${max / MB} MB), so it wasn’t read.`
    : null;
}
