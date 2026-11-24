// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Pack downloads that keep the last file: What's new downloads an update to compare it, and Update
// then installs the same bytes without downloading them again. Each pack version has its own
// address, so the bytes never go stale. Browser code with no host of its own: the web host and the
// desktop host both use it, each with its own fetch.

/** `fetch`, keeping the last successful download by address. */
export function keepingLastDownload(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  let last: { url: string; bytes: ArrayBuffer } | null = null;
  return async (input, init) => {
    const url = String(input);
    if (last?.url === url) return new Response(last.bytes.slice(0));
    const response = await fetch(input, init);
    if (!response.ok) return response;
    const bytes = await response.arrayBuffer();
    last = { url, bytes };
    return new Response(bytes.slice(0), { status: response.status, headers: response.headers });
  };
}
