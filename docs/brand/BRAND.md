# Involo brand

Involo (Italian for "takeoff") is a free, open-source procedures trainer for flight sim pilots. It starts with the iFly 737 MAX 8 in Microsoft Flight Simulator and is built for every aircraft, so the brand never names one. The brand is derived from the app: every color is an app token, the wordmark is set in the app's UI font, and the logo sits on the app's own backgrounds without a tile.

Files: `logo/` (masters), `icons/` (every platform icon, plus `contact-sheet.png`), `tokens/tokens.json`, `snippets/`, and `DESIGN-SYSTEM.md` for the interface.

## 1. The mark

A paper airplane climbing away, folded from one sheet.

- **Upper fold** (the lit side): `color.strong`.
- **Lower fold** (the shaded side): `color.accent`.
- **Crease**: a gap between the folds that tapers from 0 at the nose to 3 units at the fold point, where it opens through the corner. The background shows through it, so the plane reads as folded paper rather than a filled "send" arrow.
- **Climb**: shallow, about 20° above level. A plane steepened toward 45° reads as the generic send icon; keep the angle.
- **Construction** (viewBox 0 0 100 100): upper fold `M78.5 27 L17 49.5 L38.5 57.5 Z`, lower fold `M78.5 27 L38.5 57.5 L47.5 77.5 Z`, corners rounded by a 4.5-unit round join, outlined. The plane is centered on its area (centroid 49.9, 49.5).
- **Meaning**: a training aid that gets you off the ground. Paper, because it's about learning and practice; climbing, because the name means takeoff.

### Small cut (16 to 39 px)

Bigger plane, 6-unit join, no crease (it muddies below 32 px): upper `M81 25 L14.5 49.5 L37.5 58 Z`, lower `M81 25 L37.5 58 L47.5 79.5 Z`. In two colors the folds part by lightness (3.20:1 dark, 3.72:1 light). In one color the folds would merge into the send-arrow silhouette, so the one-color small cut keeps a crease (4 units at the fold point), which renders as a soft line at 16 px and still separates the folds.

## 2. Variants and when to use them

| File | Use |
|---|---|
| `involo-mark-on-dark.svg` | The mark on color.bg.dark, surface or sheet. 40 px and up |
| `involo-mark-on-light.svg` | The mark on light backgrounds. 40 px and up |
| `involo-mark-small-on-dark.svg` / `-on-light.svg` | 16 to 39 px: header, tabs, small UI |
| `involo-mark-white.svg` / `involo-mark-black.svg` | One ink: embossing, single-color print, photos, stickers |
| `involo-mark-small-white.svg` / `-black.svg` | One ink at 16 to 39 px |
| `involo-mark-universal.svg` / `-small-universal.svg` | Only for icons the OS shows on a background we can't know (Windows, Linux, PWA "any", favicon fallback). Upper fold color.accent.light, lower fold color.accent.dark |
| `involo-lockup-on-dark.svg` / `-on-light.svg` | Mark and wordmark side by side: README, website, docs, social |
| `involo-lockup-small-on-dark.svg` / `-on-light.svg` | Lockups under 144 px wide |
| `involo-lockup-white.svg` / `-black.svg` | One-ink lockups |
| `involo-lockup-stacked-on-dark.svg` / `-on-light.svg` | Square spaces: README hero, about screen, splash |
| `involo-wordmark-white.svg` / `-black.svg` | The wordmark alone, when the mark is already present nearby |
| `GEIST-OFL.txt` | License of the font the wordmark outlines come from |

All masters are plain filled paths: no strokes, no `<style>`, no clip paths, no masks, no opacity. Every fill is an app token value.

## 3. Clear space and minimum sizes

- **Lockups**: keep one x-height of the wordmark (the height of the "o", 0.534 em) clear on every side.
- **Mark alone**: its 100-unit square is the clear space; the plane already sits inside it with at least 14 units on every side (11 in the small cut).
- **Minimum sizes**: regular mark 40 px (the crease needs 1.2 px); small cut 16 px; lockup 144 px wide with the regular mark, 60 px wide with the small mark (wordmark about 14 px).

## 4. Do and don't

Do:

- Put the mark straight on the background, no tile, wherever we control the surface.
- Use the on-dark version in the dark theme and the on-light version in the light theme; switch with the theme.
- Use the small cut from 16 to 39 px.
- Use the solid color.bg.dark square only where the platform forces one (iOS/iPadOS home screen, Android adaptive, PWA maskable, macOS plate).

Don't:

- Put it on a tile, badge or circle anywhere we control.
- Recolor it, even with other app tokens.
- Rotate it, steepen the climb, stretch, squash or skew it.
- Add trail dots, motion lines, shadows, glows or gradients.
- Use the on-dark version on light, or the reverse.
- Retype or capitalize the wordmark; use the outlined files.
- Draw the mark as an outline, or use it as a UI icon for "send" or "submit".

## 5. Color (token references only)

| Brand role | Token | Dark | Light |
|---|---|---|---|
| Upper fold | color.strong | `#ffffff` | `#0b0f14` |
| Lower fold | color.accent | `#4c8dff` | `#2563eb` |
| Wordmark | color.strong | `#ffffff` | `#0b0f14` |
| Tagline | color.sub | `#b7bec9` | `#3d4552` |
| Header sub-line | color.muted | `#8b94a3` | `#5b6472` |
| Platform square, OG and GitHub images | color.bg.dark | `#0f1218` | same |
| Universal upper / lower fold | color.accent.light / color.accent.dark | `#2563eb` / `#4c8dff` | same |
| theme-color | color.bg | `#0f1218` | `#f5f7fa` |
| Safari mask-icon color | color.accent.light | `#2563eb` | same |

The hex values are shown for reading only; `tokens.json` maps each role to its token (`brand.*`). Contrast numbers are in DESIGN-SYSTEM.md, section 10.

## 6. Wordmark

- "involo", always lowercase in the wordmark. In running text the name is "Involo".
- Geist SemiBold (600), letter-spacing −0.02 em, kerning on, color.strong.
- Outlined in the logo files. In the app header it is live text (the app bundles Geist).
- Lockup: the plane is 0.9 em tall, its center 0.36 em above the baseline, 0.30 em from the wordmark. Stacked: the plane at 1.62 em, centered, 0.38 em above the ascender.
- Geist is © Vercel, SIL Open Font License 1.1 (`logo/GEIST-OFL.txt`). Outlined artwork made from it isn't font software and carries no further obligation, but keep the license with the source.

## 7. Icon matrix

Transparent where the platform allows it; color.bg.dark where it forces a square. Transparent OS icons use the universal colors, because their background can be light or dark.

| File | Size | Platform | Background | Mark |
|---|---|---|---|---|
| `web/favicon-light.svg` | vector | Browsers, light tab bars | transparent | small, on-light |
| `web/favicon-dark.svg` | vector | Browsers, dark tab bars | transparent | small, on-dark |
| `web/favicon.ico` | 16, 32, 48 | Fallback (Safari without script, legacy) | transparent | small, universal |
| `web/favicon-16.png`, `favicon-32.png` | 16, 32 | Fallback PNGs | transparent | small, universal |
| `web/apple-touch-icon.png` | 180 | iOS/iPadOS home screen, Safari favorites | color.bg.dark, opaque | regular, on-dark |
| `web/icon-192.png`, `icon-512.png` | 192, 512 | PWA, purpose "any" | transparent | regular, universal |
| `web/icon-maskable-512.png` | 512 | PWA, purpose "maskable" | color.bg.dark, opaque; plane inside the 40% safe circle | regular, on-dark |
| `web/mask-icon.svg` | vector | Safari pinned tab (legacy) | transparent, one color | small, one color |
| `desktop/32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | 32, 64, 128, 256 | Tauri: Linux and bundle | transparent | 32: small; others regular; universal |
| `desktop/icon.png` | 1024 | Tauri source, Linux | transparent | regular, universal |
| `desktop/icon.ico` | 16, 24, 32, 48, 64, 256 | Windows | transparent | ≤32 small; universal |
| `desktop/icon.icns` | 16 to 1024 | macOS | color.bg.dark plate, 824/1024, radius 185 | regular, on-dark |
| `desktop/macos-icon-1024.png` | 1024 | macOS source (for `tauri icon` or Icon Composer) | same plate | regular, on-dark |
| `desktop/Square30x30Logo.png`, `Square44x44Logo.png` | 30, 44 | Windows taskbar, lists | transparent, 92% wide | small, universal |
| `desktop/StoreLogo.png` | 50 | Microsoft Store | transparent, 84% wide | regular, universal |
| `desktop/Square71x71Logo.png` … `Square310x310Logo.png` | 71, 89, 107, 142, 150, 284, 310 | Windows tiles | transparent, 58% wide | regular, universal |
| `mobile/ios-app-store-1024.png` | 1024 | App Store, iOS/iPadOS | color.bg.dark, opaque, full square (the OS rounds it) | regular, on-dark |
| `mobile/android-adaptive-foreground-432.png` | 432 (108 dp) | Android adaptive foreground | transparent; plane inside a 60 dp circle (safe zone 66 dp) | regular, on-dark |
| `mobile/android-adaptive-background-432.png` | 432 | Android adaptive background | color.bg.dark | none |
| `mobile/android-monochrome-432.png` | 432 | Android 13+ themed icon; PWA "monochrome" | transparent, white alpha | regular, one color |
| `social/og-image-1200x630.png` | 1200 × 630 | Open Graph, link previews | color.bg.dark | lockup + tagline |
| `social/github-social-preview-1280x640.png` | 1280 × 640 | GitHub repository preview | color.bg.dark | lockup + tagline |
| `src/macos-icon.svg`, `src/android-foreground.svg` | vector | Sources for the two composed icons | | |
| `contact-sheet.png` | | Every icon at true size on light and dark | | |

Why transparent vs solid:

- **Windows, Linux, PWA "any", Windows Store**: the OS allows transparency, so no box (rule: no tile where we control it). Windows plates Store tiles itself.
- **macOS** (a platform exception to "no box"): macOS 26 puts any icon without the standard rounded-square plate into a gray box, so the plate is forced; it uses color.bg.dark.
- **iOS/iPadOS, Android adaptive, PWA maskable, Apple touch**: the platform forces a square or masks a full-bleed layer; color.bg.dark.

To regenerate the platform set from one source, `tauri icon icons/desktop/icon.png` writes Tauri's names; but it would plate nothing for macOS and use the universal mark there. Keep `icon.icns` from this kit (or rebuild it from `macos-icon-1024.png`).

## 8. Voice

Calm, precise, instructional. Say what to do and why, in the order you'd do it, the way a good captain briefs a first officer. No hype, no exclamation marks; plain American English, sentence case, and the airplane's own words in capitals only where the airplane uses them.

## 9. Decision log

1. **Colors from app tokens.** Upper fold color.strong, lower fold color.accent (from the review). The old #0b3d91 and #7fb2ff aren't app tokens and are gone.
2. **No tile.** The mark sits on the app backgrounds. Re-checked the review's decisions without the tile, below.
3. **Geometry: kept the review's 0.9 scale and recentering.** Without a tile the plane no longer needs to clear rounded corners, but the 100-unit square is now the clear space, and the recentered plane is centered on its area within 0.5 units.
4. **Crease: kept, as true negative space.** On the tileless mark it is cut out of the paths, so it shows whatever background is behind, light or dark. Rendered at 16 to 400 px on both themes: it reads from about 32 px and muddies below, as the review found. Rule: regular mark from 40 px.
5. **Small cut: kept for two colors (no crease); changed for one color.** Without the tile, the one-color small cut lost the fold entirely and became the Lucide/Feather send silhouette. It now keeps a 4-unit crease. Also fixed: two abutting fills showed an anti-aliasing seam on the fold line, so the upper fold now runs 0.8 units under the lower one in the small files.
6. **Trail dots: dropped** (from the review).
7. **Universal colors: added.** Transparent OS icons and the favicon fallback can land on either a light or a dark surface. White-plus-blue vanishes on white; near-black-plus-blue vanishes on dark. Upper fold color.accent.light plus lower fold color.accent.dark keeps one fold at 4.82:1 or better on light and 5.86:1 on dark. The lower fold dips to 2.98:1 on #f5f7fa; accepted, because the upper fold carries the silhouette there.
8. **Wordmark: Geist SemiBold, −0.02 em, lowercase "involo"** (the review's choice; lowercase keeps the approved wordmark form). Outlined with fontTools from the official `geist` npm package, with kerning applied by HarfBuzz.
9. **Lockup proportions**: plane 0.9 em (tried 0.8 em: the plane looked timid next to the wordmark), centered on 0.36 em, gap 0.30 em.
10. **Header**: the tile was 22 px; the tileless small mark is 18 × 15 px in a tight box with a 4 px gap, which keeps the same visual weight and the header's layout. Wordmark stays 17 px.
11. **macOS gets a plate**, because macOS 26 boxes icons without one; every other desktop icon is transparent.
12. **Not done**: a hand-hinted pixel version of the 16 px favicon. The vector render reads well on both themes; hinting is an optional polish.

## 10. Using the logo

The logo files and icons are all rights reserved (`LICENSES/LicenseRef-Involo-Brand.txt`, decision 0025). Anyone may use them unmodified to refer to Involo: articles, reviews, videos, community posts and links to the app, following section 4. Changed versions, use in another product's name or logo, and merchandise need written permission. The code stays MIT and the packs CC BY-NC-SA 4.0.
