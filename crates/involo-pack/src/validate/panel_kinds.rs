// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The format 6 panel kinds (push/pull knobs, legend pushbuttons, rockers and keypads) and
//! outlines that are not rectangles.

use std::collections::BTreeSet;

use involo_checklist_core::{Panel, PanelItem, PanelItemKind, PanelSection};

use super::{Code, Issue, error};

/// The most legends a legend pushbutton has: a top and a bottom one.
const MAX_LEGENDS: usize = 2;

/// What each format 6 kind needs, and fields only they take.
pub(super) fn check_kind(at: &str, item: &PanelItem, issues: &mut Vec<Issue>) {
    let label = &item.label;
    let positions: Vec<&str> = item.positions.iter().map(|p| p.trim()).collect();
    match item.kind {
        PanelItemKind::PushPullKnob | PanelItemKind::Rocker if positions.len() != 2 => {
            let what = if item.kind == PanelItemKind::Rocker {
                "a rocker has two positions, the top end first"
            } else {
                "a push/pull knob has two positions, pushed in first"
            };
            issues.push(error(Code::KindField, at, format!("`{label}`: {what}")));
        }
        PanelItemKind::LegendPushbutton => check_legends(at, item, &positions, issues),
        PanelItemKind::Keypad => check_keypad(at, item, &positions, issues),
        _ => {}
    }
    if item.kind != PanelItemKind::LegendPushbutton && !item.legends.is_empty() {
        issues.push(error(
            Code::KindField,
            at,
            format!("`{label}`: only a legend pushbutton has `legends`"),
        ));
    }
    if item.kind != PanelItemKind::Keypad && item.columns.is_some() {
        issues.push(error(
            Code::KindField,
            at,
            format!("`{label}`: only a keypad has `columns`"),
        ));
    }
}

/// One or two legends, each with text, lit only in positions the button has.
fn check_legends(at: &str, item: &PanelItem, positions: &[&str], issues: &mut Vec<Issue>) {
    let label = &item.label;
    if item.legends.is_empty() || item.legends.len() > MAX_LEGENDS {
        issues.push(error(
            Code::Legends,
            at,
            format!("`{label}`: a legend pushbutton has one or two `legends`"),
        ));
    }
    if positions.is_empty() {
        issues.push(error(
            Code::Legends,
            at,
            format!("`{label}`: a legend pushbutton names the `positions` it is set to"),
        ));
    }
    for legend in &item.legends {
        if legend.text.trim().is_empty() {
            issues.push(error(
                Code::Legends,
                at,
                format!("`{label}`: a legend needs its `text`"),
            ));
        }
        for p in &legend.lit_in {
            if !positions.contains(&p.trim()) {
                issues.push(error(
                    Code::UnknownPosition,
                    at,
                    format!(
                        "`{label}`: legend `{}` is lit in `{p}`, which is not one of its positions",
                        legend.text
                    ),
                ));
            }
        }
    }
}

/// At least one key, each named once, and a row of one key or more.
fn check_keypad(at: &str, item: &PanelItem, keys: &[&str], issues: &mut Vec<Issue>) {
    let label = &item.label;
    if keys.is_empty() || keys.iter().any(|k| k.is_empty()) {
        issues.push(error(
            Code::Keypad,
            at,
            format!("keypad `{label}` needs its keys, each with a name, as `positions`"),
        ));
    }
    let mut seen = BTreeSet::new();
    for key in keys.iter().filter(|k| !k.is_empty()) {
        if !seen.insert(*key) {
            issues.push(error(
                Code::Keypad,
                at,
                format!("keypad `{label}` has the key `{key}` twice"),
            ));
        }
    }
    if item.columns == Some(0) {
        issues.push(error(
            Code::Keypad,
            at,
            format!("keypad `{label}`: `columns` is at least 1"),
        ));
    }
}

/// An outline has three points or more, inside its box, and holds what is drawn in it: a
/// section's items, a panel's sections.
pub(super) fn check_outlines(panel: &Panel, issues: &mut Vec<Issue>) {
    if !panel.outline.is_empty() {
        let at = format!("panel `{}`", panel.id);
        if shaped(&at, &panel.outline, panel.width, panel.height, issues) {
            for section in &panel.sections {
                let corners = corners(section)
                    .into_iter()
                    .map(|[x, y]| [x + section.x, y + section.y]);
                if !corners.into_iter().all(|p| inside(&panel.outline, p)) {
                    issues.push(error(
                        Code::Outline,
                        &at,
                        format!(
                            "section `{}` reaches outside the panel's outline",
                            section.id
                        ),
                    ));
                }
            }
        }
    }
    for section in &panel.sections {
        if section.outline.is_empty() {
            continue;
        }
        let at = format!("section `{}`", section.id);
        if !shaped(&at, &section.outline, section.width, section.height, issues) {
            continue;
        }
        for item in &section.items {
            if !inside(&section.outline, [item.x, item.y]) {
                issues.push(error(
                    Code::Outline,
                    &at,
                    format!("`{}` lies outside the section's outline", item.label),
                ));
            }
        }
    }
}

/// Three points or more, all inside the box `width` by `height`.
fn shaped(
    at: &str,
    outline: &[[f64; 2]],
    width: f64,
    height: f64,
    issues: &mut Vec<Issue>,
) -> bool {
    let within = |[x, y]: &[f64; 2]| (0.0..=width).contains(x) && (0.0..=height).contains(y);
    let ok = outline.len() >= 3 && outline.iter().all(within);
    if !ok {
        issues.push(error(
            Code::Outline,
            at,
            "an `outline` needs three points or more, all inside its box",
        ));
    }
    ok
}

/// A section's corners, or its own outline's points, in its own units.
fn corners(section: &PanelSection) -> Vec<[f64; 2]> {
    if section.outline.is_empty() {
        let (w, h) = (section.width, section.height);
        vec![[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]]
    } else {
        section.outline.clone()
    }
}

/// Whether `p` lies inside the closed outline or on its edge.
fn inside(outline: &[[f64; 2]], p: [f64; 2]) -> bool {
    const EDGE: f64 = 1e-6;
    let [x, y] = p;
    let edges = outline.iter().zip(outline.iter().cycle().skip(1));
    let mut odd = false;
    for (&[x1, y1], &[x2, y2]) in edges {
        // On the edge counts as inside: the distance to the segment is (nearly) zero.
        let (dx, dy) = (x2 - x1, y2 - y1);
        let len = dx.mul_add(dx, dy * dy);
        let t = if len > 0.0 {
            ((x - x1).mul_add(dx, (y - y1) * dy) / len).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let (cx, cy) = (t.mul_add(dx, x1), t.mul_add(dy, y1));
        if (x - cx).hypot(y - cy) <= EDGE {
            return true;
        }
        if (y1 > y) != (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1 {
            odd = !odd;
        }
    }
    odd
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{Legend, LightColor, PanelItemKind};

    use super::super::panels::tests::panel_pack;
    use super::super::test_support::{assert_flags, messages};
    use crate::Pack;

    /// The test panel's one item as `kind`, with `positions`.
    fn kind_pack(kind: PanelItemKind, positions: &[&str]) -> Pack {
        let mut p = panel_pack();
        let item = &mut p.content.panels[0].sections[0].items[0];
        item.kind = kind;
        item.color = None;
        item.positions = positions.iter().map(|&s| s.into()).collect();
        p
    }

    fn legend(text: &str, light: LightColor, lit_in: &[&str]) -> Legend {
        Legend {
            text: text.into(),
            light,
            lit_in: lit_in.iter().map(|&s| s.into()).collect(),
        }
    }

    fn pushbutton(legends: Vec<Legend>) -> Pack {
        let mut p = kind_pack(
            PanelItemKind::LegendPushbutton,
            &["ON (PUSHED OUT)", "OFF (PUSHED IN)"],
        );
        p.content.panels[0].sections[0].items[0].legends = legends;
        p
    }

    #[test]
    fn push_pull_knobs_and_rockers_have_two_positions() {
        for kind in [PanelItemKind::PushPullKnob, PanelItemKind::Rocker] {
            assert_eq!(messages(&kind_pack(kind, &["PUSH", "PULL"])), "");
            assert_flags(&kind_pack(kind, &["PUSH"]), "has two positions");
        }
    }

    #[test]
    fn a_legend_pushbutton_needs_one_or_two_legends_lit_in_its_own_positions() {
        let fault = || legend("FAULT", LightColor::Amber, &[]);
        let off = |lit: &str| legend("OFF", LightColor::White, &[lit]);
        assert_eq!(
            messages(&pushbutton(vec![fault(), off("OFF (PUSHED IN)")])),
            ""
        );
        assert_eq!(messages(&pushbutton(vec![off("OFF (PUSHED IN)")])), "");
        assert_flags(&pushbutton(vec![]), "has one or two `legends`");
        assert_flags(
            &pushbutton(vec![fault(), fault(), off("OFF (PUSHED IN)")]),
            "has one or two `legends`",
        );
        assert_flags(
            &pushbutton(vec![off("OFF")]),
            "legend `OFF` is lit in `OFF`, which is not one of its positions",
        );
        assert_flags(
            &pushbutton(vec![legend(" ", LightColor::Blue, &[])]),
            "a legend needs its `text`",
        );
        let mut p = kind_pack(PanelItemKind::PushButton, &[]);
        p.content.panels[0].sections[0].items[0].legends = vec![fault()];
        assert_flags(&p, "only a legend pushbutton has `legends`");
    }

    #[test]
    fn a_keypad_needs_keys_each_named_once() {
        let keys = ["1", "2", "3", "CLR", "0", "ENT"];
        assert_eq!(messages(&kind_pack(PanelItemKind::Keypad, &keys)), "");
        assert_flags(&kind_pack(PanelItemKind::Keypad, &[]), "needs its keys");
        assert_flags(
            &kind_pack(PanelItemKind::Keypad, &["1", "1"]),
            "has the key `1` twice",
        );
        let mut p = kind_pack(PanelItemKind::Keypad, &keys);
        p.content.panels[0].sections[0].items[0].columns = Some(0);
        assert_flags(&p, "`columns` is at least 1");
        let mut p = kind_pack(PanelItemKind::Rocker, &["ON", "OFF"]);
        p.content.panels[0].sections[0].items[0].columns = Some(3);
        assert_flags(&p, "only a keypad has `columns`");
    }

    #[test]
    fn an_outline_holds_its_items_and_sections() {
        // The test section is 10 by 10, its one item at (1.5, 2); the panel is 100 by 100.
        let with = |section: Vec<[f64; 2]>, panel: Vec<[f64; 2]>| {
            let mut p = panel_pack();
            p.content.panels[0].sections[0].outline = section;
            p.content.panels[0].outline = panel;
            p
        };
        // An angled corner, as the board's glareshield, holding the item.
        let angled = vec![
            [1.0, 0.0],
            [10.0, 0.0],
            [10.0, 10.0],
            [0.0, 10.0],
            [0.0, 1.0],
        ];
        assert_eq!(messages(&with(angled, vec![])), "");
        // The item on the outline's edge is inside.
        let edge = vec![[1.5, 0.0], [10.0, 0.0], [10.0, 10.0], [1.5, 10.0]];
        assert_eq!(messages(&with(edge, vec![])), "");
        let cut = vec![
            [5.0, 0.0],
            [10.0, 0.0],
            [10.0, 10.0],
            [0.0, 10.0],
            [0.0, 5.0],
        ];
        assert_flags(
            &with(cut, vec![]),
            "`A/B LOW` lies outside the section's outline",
        );
        assert_flags(
            &with(vec![[0.0, 0.0], [10.0, 0.0]], vec![]),
            "three points or more",
        );
        assert_flags(
            &with(vec![[0.0, 0.0], [20.0, 0.0], [0.0, 10.0]], vec![]),
            "all inside its box",
        );
        // The section at (0, 0): an angled panel corner cuts it; one clear of it holds it.
        let panel = vec![
            [5.0, 0.0],
            [100.0, 0.0],
            [100.0, 100.0],
            [0.0, 100.0],
            [0.0, 5.0],
        ];
        let mut p = with(vec![], panel.clone());
        p.content.panels[0].sections[0].x = 20.0;
        assert_eq!(messages(&p), "");
        assert_flags(
            &with(vec![], panel),
            "section `elec` reaches outside the panel's outline",
        );
    }
}
