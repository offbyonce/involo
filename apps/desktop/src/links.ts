// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Links the web app opens in a new tab (What's new, GitHub's privacy statement, Report a problem)
// open in the default browser instead: the window has no tabs. One listener for the whole page,
// so the shared interface keeps its plain links.

/** Sends a click on an https link with `target="_blank"` to `open`, instead of the window. */
export function openLinksWith(open: (url: string) => void, page: Document = document): void {
  page.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const link = e.target instanceof Element ? e.target.closest("a[target='_blank']") : null;
    if (!(link instanceof HTMLAnchorElement) || link.protocol !== "https:") return;
    e.preventDefault();
    open(link.href);
  });
}
