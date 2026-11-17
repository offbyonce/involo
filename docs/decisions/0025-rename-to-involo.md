<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# 0025: The app is renamed Involo

Date: 2026-11-14. Status: accepted (2026-11-14).

## Context
The old name is used by another company in aviation. A new name was chosen, with a
complete brand and design-system handoff (`docs/brand/BRAND.md`, `docs/brand/DESIGN-SYSTEM.md`).

## Decision
- **The name is Involo,** Italian for "takeoff". In prose and titles: Involo. In the wordmark:
  "involo", lowercase, Geist SemiBold, −0.02 em, the app's own font. In code: `involo` (crates,
  packages, binaries, storage keys), `Involo` where capitals are needed. The repository slug is
  `involo`; the desktop identifier becomes `com.offbyonce.involo`. This supersedes the names in
  earlier records, which keep the old name as history.
- **The mark is a paper airplane folded from one sheet,** drawn only in app tokens: the upper fold
  `color.strong`, the lower fold `color.accent`. Every brand color is an app token.
- **No box,** except where a platform forces one (iOS and iPadOS home screen, Android adaptive,
  PWA maskable, the macOS plate), where the square is `color.bg.dark`. Everywhere we control the
  surface, the mark sits on the app's own background.
- **Light and dark favicons,** chosen by the browser's color scheme and then by the in-app theme,
  which also sets theme-color.
- **The brand files are all rights reserved,** with permission to use them unmodified to refer to
  Involo (`LICENSES/LicenseRef-Involo-Brand.txt`). This is a deliberate exception to 0003's open
  licenses: the code stays MIT and the packs stay CC BY-NC-SA 4.0.
- **Saved data survives the rename.** The web app stays on the same origin; on start it copies
  every saved key from the old name to the new one, checks each copy, and only then removes the
  old keys. If any step fails it keeps using the old data and tries again on the next start.
  A save under the old name after the move (an old version still open) is kept, never dropped.
  The service worker removes the old name's caches.

## Consequences
- The desktop shell is parked (0009, 0010): only its product name, identifier and icons change
  now. Moving its data folder from the old identifier to the new one is written and tested when
  desktop is revived.
- The project Pages address changes with the repository name and GitHub does not redirect it, so
  a small page published under the old name forwards visitors, keeping the path and query.
- Two tokens were added for the header wordmark: `font.size.wordmark` and
  `font.tracking.wordmark`. The `border-strong` token, which held border colors that had drifted
  into five boards, was removed when those boards were corrected; its uses take `border`.
- Environment variables are renamed with the app (`INVOLO_OVERLAP_REFS`, `INVOLO_BASELINE`,
  `INVOLO_PLAN`); a shell that still sets the old names skips those checks.
