<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->

# Design tokens

Every token in `docs/design/tokens.json` and its value. `token-table.test.ts` checks this table
against the token file, so a token changes only when a pull request changes this table too, on
purpose. When the test fails, it names each token that differs and the row to write here.

Colors are given in both themes. Sizes are in pixels unless they carry their own unit.

## Colors

| Token | Dark | Light |
| --- | --- | --- |
| `color.bg` | #0f1218 | #f5f7fa |
| `color.surface` | #161b23 | #ffffff |
| `color.surface-2` | #121720 | #eef1f5 |
| `color.sheet` | #121720 | #ffffff |
| `color.field` | #0f1218 | #ffffff |
| `color.border` | #2a323e | #d3d9e1 |
| `color.line` | #222934 | #e2e6ec |
| `color.chip` | #2a323e | #e2e6ec |
| `color.text` | #e6e9ee | #1a1f27 |
| `color.text-secondary` | #b7bec9 | #3d4552 |
| `color.text-muted` | #8b94a3 | #5b6472 |
| `color.text-strong` | #ffffff | #0b0f14 |
| `color.accent` | #4c8dff | #2563eb |
| `color.on-accent` | #08101f | #ffffff |
| `color.accent-soft` | #14243c | #e4ecfd |
| `color.accent-text` | #a9caff | #1d4fd8 |
| `color.current-row` | #132036 | #eaf1fe |
| `color.link` | #7fb0ff | #1d4fd8 |
| `color.done` | #3fb67a | #1f8a55 |
| `color.on-done` | #08140e | #ffffff |
| `color.done-soft` | #12261b | #e3f3ea |
| `color.track` | #2a323e | #d3d9e1 |
| `color.todo-ring` | #6b7482 | #7a8391 |
| `color.open-text` | #f2bd5c | #8a5a00 |
| `color.open-dot` | #e0a43a | #a86f00 |
| `color.open-bg` | #241d10 | #fdf4e1 |
| `color.open-border` | #6b5020 | #e0b766 |
| `color.danger` | #e2564a | #c62f22 |
| `color.danger-text` | #ff8a7a | #b3261e |
| `color.danger-bg` | transparent | #fdecea |
| `color.danger-soft` | #2a1614 | #fdecea |
| `color.segment-track` | #121720 | #e6eaf0 |
| `color.segment-border` | #2a323e | #dde2e8 |
| `color.segment-on` | #2a323e | #ffffff |
| `color.segment-shadow` | none | 0 1px 2px rgba(16, 24, 40, 0.14) |
| `color.button-bg` | transparent | #ffffff |
| `color.button-shadow` | none | 0 1px 2px rgba(16, 24, 40, 0.10) |
| `color.skip-bg` | transparent | #fdf4e1 |
| `color.toggle-off` | #3a4351 | #b9c1cc |
| `color.essentials-text` | #a9b4c4 | #3d4552 |
| `color.essentials-border` | #4a5361 | #8a93a0 |
| `color.scrim` | rgba(6, 8, 12, 0.55) | rgba(20, 26, 36, 0.35) |
| `color.lit-amber` | #f2bd5c | #f2bd5c |
| `color.on-lit-amber` | #3a2a00 | #3a2a00 |
| `color.popover-border` | #34404f | #d3d9e1 |
| `color.overlay-shadow` | 0 24px 60px rgba(0, 0, 0, 0.55) | 0 24px 60px rgba(16, 24, 40, 0.18) |
| `color.slideout-scrim` | rgba(6, 8, 12, 0.45) | rgba(20, 26, 36, 0.28) |
| `color.scrim-light` | rgba(6, 8, 12, 0.35) | rgba(20, 26, 36, 0.18) |
| `color.popover-surface` | #1b212b | #ffffff |
| `color.toggle-knob` | #ffffff | #ffffff |
| `color.toast-text` | #0f1218 | #ffffff |
| `color.toast-link` | #1d4fd8 | #7fb0ff |
| `color.toast-shadow` | 0 12px 32px rgba(0, 0, 0, 0.5) | 0 12px 32px rgba(16, 24, 40, 0.28) |
| `color.paper` | #1b212b | #ffffff |
| `color.paper-block` | #3a4351 | #c3cad4 |
| `color.paper-highlight` | rgba(76, 141, 255, 0.35) | rgba(37, 99, 235, 0.3) |
| `color.paper-text` | #d5dae2 | #2b313b |
| `color.strip-panel` | #121720 | #ffffff |
| `color.drop-zone` | #121720 | #f5f7fa |
| `color.drop-zone-border` | #6b7482 | #7a8391 |
| `color.field-border` | #66727f | #828b99 |
| `panel.bg` | #161b23 | #ffffff |
| `panel.frame` | #2a323e | #d3d9e1 |
| `panel.fill` | #1b212b | #e3e7ec |
| `panel.stroke` | #6b7482 | #8a93a0 |
| `panel.label` | #a3abb8 | #4a5462 |
| `panel.text` | #d5dae2 | #1a1f27 |
| `panel.changed-fill` | #163056 | #d6e4fd |
| `panel.changed` | #4c8dff | #2563eb |
| `panel.changed-text` | #ffffff | #0b1f4d |
| `panel.resting` | #6b7482 | #7a8391 |
| `panel.fuselage` | #12171f | #f3f5f8 |
| `panel.seat` | #20262f | #d3d9e1 |
| `panel.glass` | #1d2a3a | #d4e3f6 |

## Type, space, sizes and layout

| Token | Value | |
| --- | --- | --- |
| `font.family.sans` | Geist, system-ui, sans-serif |  |
| `font.family.mono` | 'Geist Mono', ui-monospace, monospace |  |
| `font.size.caption` | 12 |  |
| `font.size.secondary` | 14 |  |
| `font.size.body` | 16 |  |
| `font.size.panel-title` | 20 |  |
| `font.size.section-title` | 24 |  |
| `font.size.page-title` | 32 |  |
| `font.size.value-mono` | 15 |  |
| `font.size.flow-title` | 48 |  |
| `font.size.flow-value` | 32 |  |
| `font.size.wordmark` | 17 |  |
| `font.tracking.wordmark` | -0.02em |  |
| `font.weight.regular` | 400 |  |
| `font.weight.medium` | 500 |  |
| `font.weight.semibold` | 600 |  |
| `font.weight.bold` | 700 |  |
| `font.drawing.label-min` | 11 |  |
| `font.drawing.light-legend-min` | 10 |  |
| `space.1` | 4 |  |
| `space.2` | 8 |  |
| `space.3` | 12 |  |
| `space.4` | 16 |  |
| `space.6` | 24 |  |
| `space.8` | 32 |  |
| `space.10` | 40 |  |
| `radius.small` | 6 |  |
| `radius.control` | 10 |  |
| `radius.segment` | 12 |  |
| `radius.panel` | 12 |  |
| `radius.sheet` | 16 |  |
| `radius.pill` | 999 |  |
| `radius.popover` | 14 |  |
| `border.thin` | 1 |  |
| `border.thick` | 2 |  |
| `border.bar` | 4 |  |
| `line-height.tight` | 1.2 |  |
| `line-height.snug` | 1.45 |  |
| `line-height.normal` | 1.5 |  |
| `size.touch-min` | 44 |  |
| `size.header` | 60 |  |
| `size.phase-row` | 60 |  |
| `size.flight-strip` | 48 |  |
| `size.side-pane` | 520 |  |
| `size.flight-section-nav` | 232 |  |
| `size.row-padding-y` | 12 |  |
| `size.content-max` | 1040 |  |
| `size.icon` | 20 |  |
| `size.icon-small` | 16 |  |
| `size.side-pane-tablet` | 440 |  |
| `size.drawer` | 360 |  |
| `size.dot` | 7 |  |
| `size.status-icon` | 22 |  |
| `size.progress-bar` | 3 |  |
| `size.flow-button` | 56 |  |
| `size.map-figure` | 280 |  |
| `size.slideout` | 840 |  |
| `size.slideout-tablet` | 700 |  |
| `size.preview-max` | 240 |  |
| `size.navigator-max` | 120 |  |
| `size.toggle.width` | 52 |  |
| `size.toggle.height` | 30 |  |
| `size.toggle.knob` | 24 |  |
| `size.focus-ring` | 1.5 |  |
| `layout.breakpoints.phone-max` | 599 |  |
| `layout.breakpoints.tablet-portrait-max` | 899 |  |
| `layout.breakpoints.tablet-landscape-max` | 1439 |  |
| `layout.scale` | max(1, min(width / 1440, height / 900)) |  |
| `layout.gutter.desktop` | 32 |  |
| `layout.gutter.tablet` | 20 |  |
| `layout.gutter.phone` | 16 |  |
