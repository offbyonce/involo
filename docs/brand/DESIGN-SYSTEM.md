# Involo design system

The app's interface is the source of truth. This document records its tokens as they appear on the design boards, and adds only how the brand sits inside them. Nothing here changes an app token. Machine-readable values are in `tokens/tokens.json`.

Dark is the default theme; light is the same system with light tokens. Every rule applies to both themes and to desktop, tablet and phone.

## 1. Color

Values are copied from the boards' `renderVals()` objects (`T` for screens, `P` for cockpit drawings, `O` for pop-overs). Where the boards disagree, the majority value is listed and the others are noted in section 1.5.

### 1.1 Surfaces and lines

| Token | Dark | Light | Role |
|---|---|---|---|
| bg | `#0f1218` | `#f5f7fa` | Page background. Also the solid behind the logo where a platform forces a square |
| surface | `#161b23` | `#ffffff` | Panels, cards, rows |
| surface2 | `#121720` | `#eef1f5` | Recessed areas: flight strip, wells |
| sheet | `#121720` | `#ffffff` | Menus and bottom sheets |
| border | `#2a323e` | `#d3d9e1` | Panel and button borders (see 1.5) |
| line | `#222934` | `#e2e6ec` | Dividers, header bottom line |
| chip | `#2a323e` | `#e2e6ec` | Chip and count backgrounds |
| scrim | `rgba(6, 8, 12, 0.55)` | `rgba(20, 26, 36, 0.35)` | Dimming behind menus, sheets and pop-overs |

### 1.2 Text

| Token | Dark | Light | Role |
|---|---|---|---|
| strong | `#ffffff` | `#0b0f14` | Titles, selected labels. The upper fold and the wordmark |
| text | `#e6e9ee` | `#1a1f27` | Body |
| sub | `#b7bec9` | `#3d4552` | Secondary text, descriptions, icon buttons |
| muted | `#8b94a3` | `#5b6472` | Captions, field labels, inactive tabs |

### 1.3 Accent and state

| Token | Dark | Light | Role |
|---|---|---|---|
| accent | `#4c8dff` | `#2563eb` | What the step changes, the current step, the selection ring. The lower fold |
| onAccent | `#08101f` | `#ffffff` | Text on accent |
| accentSoft | `#14243c` | `#e4ecfd` | Current step tab fill |
| accentText | `#a9caff` | `#1d4fd8` | Accent-colored text |
| current | `#132036` | `#eaf1fe` | Current checklist row |
| link | `#7fb0ff` | `#1d4fd8` | Links |
| green / onGreen | `#3fb67a` / `#08140e` | `#1f8a55` / `#ffffff` | Done |
| amber | `#f2bd5c` | `#8a5a00` | Open, skipped, If not (text) |
| amberDot / amberBg / amberBorder | `#e0a43a` / `#241d10` / `#6b5020` | `#a86f00` / `#fdf4e1` / `#e0b766` | Open-step dot, fill, border |
| red / redText / redBg | `#e2564a` / `#ff8a7a` / transparent | `#c62f22` / `#b3261e` / `#fdecea` | Emergency border (1.5 px), text, fill |
| doneBorder | `#2f5a44` | `#9fd0b6` | Done chip border (Main board only) |

### 1.4 Fields and controls

| Token | Dark | Light |
|---|---|---|
| field | `#0f1218` | `#ffffff` |
| fieldBorder | `#66727f` | `#828b99` |
| segTrack / segBorder / segOn | `#121720` / `#2a323e` / `#2a323e` | `#e6eaf0` / `#dde2e8` / `#ffffff` |
| btnBg / btnShadow | transparent / none | `#ffffff` / `0 1px 2px rgba(16, 24, 40, 0.10)` |
| track / todo | `#2a323e` / `#6b7482` | `#d3d9e1` / `#7a8391` |
| toggleOff | `#3a4351` | `#b9c1cc` |

Drawing tokens (`panel.*`), document tokens (`paper*`), toast and emergency-header tokens are in `tokens.json`.

### 1.5 Where the boards disagree

Recorded as found, not resolved here:

- **border** (resolved by the owner): `#2a323e` / `#d3d9e1` is canonical, as on the design rules board. `#2f3846` / `#c9d0d9` had drifted into Mobile, SimBrief, Start, StripOpen and Tablet; those boards are now corrected.
- **segTrack (dark)**: `#121720` on most boards; `#0f1218` on Menu and Mobile.
- **surface (dark)**: `#121720` on Menu (it uses the sheet color as its surface).
- **scrim (dark)**: 0.55 on Menu and Tablet, 0.60 on Mobile. Pop-over boards use 0.45 to 0.50 in their own `O` object.
- **panel.rest (dark)**: `#6b7482` everywhere except Locator (`#7d8694`).
- **Pop-overs (`O`)**: surface `#1b212b` vs `#121720`, border `#34404f` vs `#2f3846`, muted `#9aa3b1` vs `#8b94a3`, shadow sizes differ between Locator/OpenSteps/WherePop and StripOpen.

One app finding: **green (light) `#1f8a55` on white is 4.35:1**. It passes for the check icon (graphics, 3:1) but is short of 4.5:1 if used as text, for example the "Done" chip label on the Main board.

## 2. Type

Geist for the interface, Geist Mono for settings, values and codes. Both SIL OFL 1.1, bundled with the app (no font CDN; the app works offline).

| Style | Size / weight | Use |
|---|---|---|
| Page title | 32 / 700 | |
| Section title | 24 / 700 | |
| Panel title | 20 / 600 | |
| Body | 16 / 400, line-height 1.5 | Body and step names |
| Secondary | 14 / 400, color.sub | Descriptions |
| Caption | 12 / 400, color.muted | Captions, field labels |
| Mono | 15, Geist Mono | Settings, values, codes |

- Also used on screens: 18 (detail titles and the ··· row-menu glyph), 17 (the primary Done button and the header wordmark), 11 (drawing labels minimum), 10 (light legends minimum).
- Weights: 400, 500 (mono counts, some control names), 600, 700.
- UI text uses normal letter-spacing. Only the wordmark is tracked (−0.02 em).
- Sentence case for app labels. Capitals only for text you would see in the airplane or its documents (placards, light legends, CDU pages, METAR groups).

**Wordmark**: "involo", lowercase, Geist SemiBold 600, −0.02 em, kerning on, color.strong. Outlined in `logo/`. In running text the product name is "Involo".

## 3. Spacing

- Scale: 4, 8, 12, 16, 24, 32, 40.
- Rows: 12 top and bottom. Panels: 16 to 24. Page gutters: 32 desktop, 20 tablet, 16 phone.
- Layout: header 60 (phone 56); phase row 60 (tablet 56); flight strip 48 (phone 44); side pane 520 at 1440; flight-page section list 232; checklist content stops at 1040 px before scaling.

## 4. Radii

| Radius | Use |
|---|---|
| 2, 3, 4 | Progress tracks, small marks |
| 6 | Chips |
| 8 | Step tabs, inset code blocks |
| 10 | Buttons, segments, inputs (most common) |
| 12 | Cards, panels, segment tracks, primary actions |
| 16, 20 | Sheets, large panels |
| 999 | Pills, counts |

## 5. Elevation

Dark theme draws no shadows on controls; light theme uses one-pixel shadows.

| Level | Dark | Light |
|---|---|---|
| Button | none | `0 1px 2px rgba(16, 24, 40, 0.10)` |
| Selected segment | none | `0 1px 2px rgba(16, 24, 40, 0.14)` |
| Pop-over | `0 24px 60px rgba(0, 0, 0, 0.55)` | `0 24px 60px rgba(16, 24, 40, 0.18)` |
| Toast | `0 12px 32px rgba(0, 0, 0, 0.5)` | `0 12px 32px rgba(16, 24, 40, 0.28)` |

**Dimming**: menus, sheets and pop-overs lay `color.scrim` over the whole page; the page behind is not blurred or desaturated.

## 6. Control sizes

- Every control and link is at least **44 × 44 px**, including row menus, ? buttons and tabs.
- Primary actions (Done, Skip for now): 52 px tall, radius 12.
- Icons inside buttons: 16, 18 or 20 px, stroke 2.
- Scaling: `scale = max(1, min(w / 1440, h / 900))`, never below 100%. Breakpoints: under 600 phone; 600–899 tablet portrait; 900–1439 tablet landscape; 1440 and up desktop. Wide screens never add columns.

## 7. Focus and selection

- **Selected tab or segment**: `box-shadow: inset 0 0 0 1.5px color.accent`, weight 600, color.strong. Never a pale fill alone.
- **Current stage (header nav)**: `inset 0 -3px 0 color.accent` underline, weight 600, color.strong.
- **Current step tab**: color.accentSoft fill plus the 1.5 px accent ring.
- **Current checklist row**: color.current fill plus `inset 4px 0 0 color.accent`.
- **Keyboard focus** (approved by the owner): `outline: 2px solid color.accent; outline-offset: 2px` on every focusable element, shown only with `:focus-visible`, never on click. It sits outside the control, so it never collides with the 1.5 px inset selection ring; a selected control that has focus shows both. color.accent passes 3:1 on both backgrounds (5.86:1 dark, 4.82:1 light). No new token. Drawn on the design rules board.

## 8. Iconography

- UI icons: 24-unit grid, 2-unit stroke, round caps and joins, `currentColor`, usually color.sub (accent only for what the step changes). Drawn at 16, 18 or 20 px inside 44 px targets.
- Unlit lights are an outline and legend only; lit lights take their real color. Switches are drawn in their real ON direction with OFF / ON labels.
- The logo is not a UI icon: never use the plane as a "send" or "takeoff" glyph in the interface.
- No third-party logos.

## 9. Dark and light

- Dark first. Both themes come from the same token names; never hard-code a theme value in a component.
- Theme switch: follows the OS by default, or the user's choice. When the user chooses, update `<meta name="theme-color">` and the favicon with `snippets/favicon-theme.js`.
- Logo variant follows the theme: on-dark colors in dark, on-light colors in light.

## 10. Accessibility

- Text at least 4.5:1, drawing outlines and icons at least 3:1, in both themes (checked in CI per the Main board). Ratios use WCAG 2.x relative luminance.
- Color is never the only signal: selection adds a ring and weight; status adds a word or icon.
- 44 px targets everywhere.
- The header mark is decorative (`aria-hidden="true"`); the live wordmark text names the app. Standalone logos carry `role="img"` and `aria-label="Involo"`.

### Contrast table (brand and key app pairs)

| Pair | Foreground | Background | Values | Ratio | Needs | |
|---|---|---|---|---|---|---|
| Upper fold on bg (dark) | strong | bg | `#ffffff` on `#0f1218` | 18.75:1 | 3:1 | pass |
| Lower fold on bg (dark) | accent | bg | `#4c8dff` on `#0f1218` | 5.86:1 | 3:1 | pass |
| Upper fold on surface (dark) | strong | surface | `#ffffff` on `#161b23` | 17.28:1 | 3:1 | pass |
| Lower fold on surface (dark) | accent | surface | `#4c8dff` on `#161b23` | 5.40:1 | 3:1 | pass |
| Upper fold on sheet (dark) | strong | sheet | `#ffffff` on `#121720` | 17.96:1 | 3:1 | pass |
| Lower fold on sheet (dark) | accent | sheet | `#4c8dff` on `#121720` | 5.61:1 | 3:1 | pass |
| Fold vs fold (dark) | strong | accent | `#ffffff` on `#4c8dff` | 3.20:1 | 3:1 | pass |
| Upper fold on bg (light) | strong | bg | `#0b0f14` on `#f5f7fa` | 17.91:1 | 3:1 | pass |
| Lower fold on bg (light) | accent | bg | `#2563eb` on `#f5f7fa` | 4.82:1 | 3:1 | pass |
| Upper fold on surface (light) | strong | surface | `#0b0f14` on `#ffffff` | 19.22:1 | 3:1 | pass |
| Lower fold on surface (light) | accent | surface | `#2563eb` on `#ffffff` | 5.17:1 | 3:1 | pass |
| Fold vs fold (light) | strong | accent | `#0b0f14` on `#2563eb` | 3.72:1 | 3:1 | pass |
| Universal upper on bg dark | accent.light | bg.dark | `#2563eb` on `#0f1218` | 3.63:1 | 3:1 | pass |
| Universal lower on bg dark | accent.dark | bg.dark | `#4c8dff` on `#0f1218` | 5.86:1 | 3:1 | pass |
| Universal upper on bg light | accent.light | bg.light | `#2563eb` on `#f5f7fa` | 4.82:1 | 3:1 | pass |
| Universal lower on bg light | accent.dark | bg.light | `#4c8dff` on `#f5f7fa` | 2.98:1 | 3:1 | **below** |
| Universal upper on white | accent.light | surface.light | `#2563eb` on `#ffffff` | 5.17:1 | 3:1 | pass |
| Universal lower on white | accent.dark | surface.light | `#4c8dff` on `#ffffff` | 3.20:1 | 3:1 | pass |
| Universal fold vs fold | accent.light | accent.dark | `#2563eb` on `#4c8dff` | 1.61:1 | 3:1 | **below** |
| Wordmark on bg (dark) | strong | bg | `#ffffff` on `#0f1218` | 18.75:1 | 4.5:1 | pass |
| Wordmark on bg (light) | strong | bg | `#0b0f14` on `#f5f7fa` | 17.91:1 | 4.5:1 | pass |
| Header sub-line on bg (dark) | muted | bg | `#8b94a3` on `#0f1218` | 6.13:1 | 4.5:1 | pass |
| Header sub-line on bg (light) | muted | bg | `#5b6472` on `#f5f7fa` | 5.57:1 | 4.5:1 | pass |
| Tagline on bg (dark) | sub | bg | `#b7bec9` on `#0f1218` | 10.02:1 | 4.5:1 | pass |
| Tagline on bg (light) | sub | bg | `#3d4552` on `#f5f7fa` | 9.01:1 | 4.5:1 | pass |
| Text on bg (dark) | text | bg | `#e6e9ee` on `#0f1218` | 15.41:1 | 4.5:1 | pass |
| Text on bg (light) | text | bg | `#1a1f27` on `#f5f7fa` | 15.42:1 | 4.5:1 | pass |
| Accent text on bg (dark) | accentText | bg | `#a9caff` on `#0f1218` | 11.23:1 | 4.5:1 | pass |
| Accent text on bg (light) | accentText | bg | `#1d4fd8` on `#f5f7fa` | 6.19:1 | 4.5:1 | pass |
| Link on surface (dark) | link | surface | `#7fb0ff` on `#161b23` | 7.86:1 | 4.5:1 | pass |
| Link on surface (light) | link | surface | `#1d4fd8` on `#ffffff` | 6.64:1 | 4.5:1 | pass |
| onAccent on accent (dark) | onAccent | accent | `#08101f` on `#4c8dff` | 5.94:1 | 4.5:1 | pass |
| onAccent on accent (light) | onAccent | accent | `#ffffff` on `#2563eb` | 5.17:1 | 4.5:1 | pass |
| Selection ring on segOn (dark) | accent | segOn | `#4c8dff` on `#2a323e` | 4.04:1 | 3:1 | pass |
| Selection ring on segOn (light) | accent | segOn | `#2563eb` on `#ffffff` | 5.17:1 | 3:1 | pass |
| Field border on field (dark) | fieldBorder | field | `#66727f` on `#0f1218` | 3.82:1 | 3:1 | pass |
| Field border on field (light) | fieldBorder | field | `#828b99` on `#ffffff` | 3.44:1 | 3:1 | pass |
| Amber on amberBg (dark) | amber | amberBg | `#f2bd5c` on `#241d10` | 9.70:1 | 4.5:1 | pass |
| Amber on amberBg (light) | amber | amberBg | `#8a5a00` on `#fdf4e1` | 5.42:1 | 4.5:1 | pass |
| Red text on bg (dark) | redText | bg | `#ff8a7a` on `#0f1218` | 8.19:1 | 4.5:1 | pass |
| Red text on redBg (light) | redText | redBg | `#b3261e` on `#fdecea` | 5.72:1 | 4.5:1 | pass |
| Red border on bg (dark) | red | bg | `#e2564a` on `#0f1218` | 5.06:1 | 3:1 | pass |
| Red border on bg (light) | red | bg | `#c62f22` on `#f5f7fa` | 5.11:1 | 3:1 | pass |
| Green on bg (dark) | green | bg | `#3fb67a` on `#0f1218` | 7.31:1 | 4.5:1 | pass |
| Green on surface (light) | green | surface | `#1f8a55` on `#ffffff` | 4.35:1 | 4.5:1 | **below** |
| Muted on surface (dark) | muted | surface | `#8b94a3` on `#161b23` | 5.65:1 | 4.5:1 | pass |
| Muted on surface (light) | muted | surface | `#5b6472` on `#ffffff` | 5.98:1 | 4.5:1 | pass |
| Panel outline on surface (dark) | panel.stroke | surface | `#6b7482` on `#161b23` | 3.66:1 | 3:1 | pass |
| Panel outline on surface (light) | panel.stroke | surface | `#8a93a0` on `#ffffff` | 3.11:1 | 3:1 | pass |

Universal icons (transparent OS icons and the favicon fallback) sit on backgrounds we can't know. One fold always carries the shape (4.82:1 or more on light, 5.86:1 on dark); the lower fold dips to 2.98:1 on `#f5f7fa`, and the folds part by the crease, not by color (1.61:1). This is the one documented exception, and it never appears on an app surface.

## 11. The logo in the header

The header layout is the app's and is unchanged; only the logo inside it changes (the tile and Quicksand go; the tileless small mark and Geist come in).

**Desktop (1440 and up, and tablet landscape where the desktop header is used)**, inside the 60 px header, after the 44 × 44 menu button and the header's 16 px gap:

```html
<div class="brand" style="display: flex; flex-direction: column; line-height: 1.2">
  <span style="display: flex; align-items: center; gap: 4px;
               font-size: 17px; font-weight: 600; letter-spacing: -0.02em; color: var(--strong)">
    <!-- small cut, tight viewBox: 15 px tall, 18 px wide; aria-hidden because the text names the app -->
    <svg width="18" height="15" viewBox="0 0 72.77 60.68" aria-hidden="true" focusable="false">
      <path fill="var(--strong)" d="…upper fold from logo/involo-mark-small-on-dark.svg, translated…"/>
      <path fill="var(--accent)" d="…lower fold…"/>
    </svg>involo</span>
  <span style="font-size: 12px; color: var(--muted)">iFly 737 MAX 8</span>
</div>
```

- Mark: the **small cut** (no crease), in a tight box 15 px tall and 18 px wide. Its upper fold takes color.strong and its lower fold color.accent, so one inline SVG with `var(--strong)` and `var(--accent)` serves both themes. `snippets/header-mark.svg` has the exact paths.
- Gap: 4 px from the mark's box to the wordmark (0.30 em of optical space with the "i" side bearing).
- Wordmark: live text, Geist 17 px, 600, −0.02 em, color.strong. Live text keeps hinting crisp at 17 px and stays readable to assistive tech.
- Alignment: the row is centered on the text's line box, which puts the plane's center on the wordmark's 0.36 em line, the same as the lockup files.
- Sub-line: 12 px, color.muted, as on the boards.

**Tablet and phone**: the compact header (stage button, Find, Checklist/Flow, Emergency) has no logo, by design. The logo lives in the menu drawer header (60 px on tablet, 56 px on phone; padding 0 8 0 20 and 0 6 0 16), with the same block as desktop.

**Elsewhere**:

- README and website: use `<picture>` so GitHub picks the theme.

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/involo-lockup-on-dark.svg">
  <img src="assets/brand/involo-lockup-on-light.svg" alt="Involo" height="48">
</picture>
```

- Never put the mark on a tile in the app, README, docs or social images.
