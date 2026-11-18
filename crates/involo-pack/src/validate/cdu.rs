// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! CDU walkthrough text.

use involo_checklist_core::{
    CduField, CduInline, CduPart, CduRouteCount, CduText, CduWhen, FieldId, MAX_ROUTE_LEG,
};

use super::index::Index;
use super::{Issue, error};
use crate::Pack;

fn check_cdu_field(at: &str, field: &CduField, idx: &Index, issues: &mut Vec<Issue>) {
    idx.require_field(at, field.field.as_str(), issues);
    if field.field.as_str() == FieldId::MANUAL {
        issues.push(error(at, "`manual` is only valid in a step's `fill`"));
    }
    if field.field.as_str() == FieldId::ROUTE_LEG {
        if field.part.is_none() || field.index.is_none() {
            issues.push(error(at, "`route_leg` needs an `index` and a `part`"));
        }
        if field
            .index
            .is_some_and(|n| !(1..=MAX_ROUTE_LEG).contains(&n))
        {
            issues.push(error(
                at,
                format!("`route_leg` index must be from 1 to {MAX_ROUTE_LEG}"),
            ));
        }
    } else if field.index.is_some() || field.part.is_some() {
        issues.push(error(at, "only `route_leg` takes an `index` or `part`"));
    }
}

fn check_route_count(at: &str, count: &CduRouteCount, issues: &mut Vec<Issue>) {
    if count.per_page == 0 {
        issues.push(error(at, "`per_page` must be at least 1"));
    }
}

fn check_cdu_inline(at: &str, part: &CduInline, idx: &Index, issues: &mut Vec<Issue>) {
    match part {
        CduInline::Field(field) => check_cdu_field(at, field, idx, issues),
        CduInline::RouteCount(count) => check_route_count(at, count, issues),
        CduInline::Text(_) | CduInline::Styled(_) => {}
    }
}

fn check_cdu_when(at: &str, when: &CduWhen, idx: &Index, issues: &mut Vec<Issue>) {
    for field in &when.when_known {
        idx.require_field(at, field.as_str(), issues);
    }
    if when.when_known.is_empty() {
        issues.push(error(at, "`when_known` must name a field"));
    }
    if when
        .when_known
        .iter()
        .any(|f| f.as_str() == FieldId::MANUAL)
    {
        issues.push(error(at, "`manual` is only valid in a step's `fill`"));
    }
    if when
        .when_known
        .iter()
        .any(|f| f.as_str() == FieldId::ROUTE_LEG)
    {
        issues.push(error(
            at,
            "`when_known` cannot test `route_leg`; test `route`",
        ));
    }
    for part in when.show.iter().chain(&when.otherwise) {
        check_cdu_inline(at, part, idx, issues);
    }
}

fn check_cdu_text(at: &str, text: &CduText, idx: &Index, issues: &mut Vec<Issue>) {
    for part in text {
        match part {
            CduPart::Field(field) => check_cdu_field(at, field, idx, issues),
            CduPart::RouteCount(count) => check_route_count(at, count, issues),
            CduPart::When(when) => check_cdu_when(at, when, idx, issues),
            CduPart::Text(_) | CduPart::Styled(_) => {}
        }
    }
}

pub(super) fn check_cdu(pack: &Pack, idx: &Index, issues: &mut Vec<Issue>) {
    let Some(file) = &pack.content.cdu else {
        return;
    };
    for walkthrough in &file.walkthroughs {
        for page in &walkthrough.pages {
            let at = format!("{} page `{}`", walkthrough.id, page.title);
            let screen = &page.screen;
            let cells = screen
                .rows
                .iter()
                .flat_map(|r| [&r.left_label, &r.left, &r.right_label, &r.right]);
            let texts = [
                &page.action,
                &page.check,
                &page.note,
                &screen.title,
                &screen.page,
                &screen.scratchpad,
            ];
            for text in texts.into_iter().chain(cells) {
                check_cdu_text(&at, text, idx, issues);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{
        AliasKind, CduField, CduFile, CduInline, CduPage, CduPart, CduRouteCount, CduScreen,
        CduText, CduWalkthrough, CduWhen, FieldId, HintPart, MAX_ROUTE_LEG, RouteLegCount,
        RouteLegPart,
    };

    use super::super::test_support::{alias, alias_pack, assert_flags, messages, pack, step};
    use crate::Pack;

    #[test]
    fn route_leg_needs_a_valid_index_and_part() {
        let leg = |index, part| {
            let mut f = field(FieldId::from("route_leg"));
            f.index = index;
            f.part = part;
            cdu_pack(vec![CduPart::Field(f)])
        };
        assert_eq!(messages(&leg(Some(1), Some(RouteLegPart::Via))), "");
        assert_eq!(
            messages(&leg(Some(MAX_ROUTE_LEG), Some(RouteLegPart::To))),
            ""
        );
        assert_flags(&leg(None, Some(RouteLegPart::To)), "needs an `index`");
        assert_flags(&leg(Some(1), None), "needs an `index`");
        assert_flags(&leg(Some(0), Some(RouteLegPart::To)), "from 1 to 30");
        assert_flags(&leg(Some(31), Some(RouteLegPart::To)), "from 1 to 30");
    }

    #[test]
    fn route_leg_stays_in_cdu_text() {
        let mut f = field(FieldId::from("runway"));
        f.index = Some(1);
        assert_flags(&cdu_pack(vec![CduPart::Field(f)]), "only `route_leg` takes");

        let mut s = step("a");
        s.expect = "___".into();
        s.fill = vec![FieldId::from("route_leg")];
        assert_flags(&pack(vec![s], vec![]), "only valid in CDU text");

        let mut s = step("a");
        s.hint = vec![HintPart {
            prefix: "X ".into(),
            field: FieldId::from("route_leg"),
        }];
        assert_flags(&pack(vec![s], vec![]), "only valid in CDU text");

        let when = CduWhen {
            when_known: vec![FieldId::from("route_leg")],
            show: vec![CduInline::Text("x".into())],
            otherwise: vec![],
        };
        assert_flags(
            &cdu_pack(vec![CduPart::When(when)]),
            "cannot test `route_leg`",
        );

        let p = alias_pack(vec![alias(AliasKind::FillField, "x", "route_leg")]);
        assert_flags(&p, "unknown fill field");
    }

    #[test]
    fn route_counts_need_a_page_size() {
        let count = |per_page| {
            cdu_pack(vec![CduPart::RouteCount(CduRouteCount {
                route_legs: RouteLegCount::Pages,
                per_page,
                style: None,
                before: None,
                after: None,
                empty: None,
            })])
        };
        assert_eq!(messages(&count(5)), "");
        assert_flags(&count(0), "`per_page` must be at least 1");
    }

    #[test]
    fn cdu_text_names_the_pack_s_own_fields() {
        let mut p = cdu_pack(vec![CduPart::Field(field(FieldId::from(
            "flex_temperature",
        )))]);
        assert_flags(
            &p,
            "`flex_temperature` is not a flight field the pack defines in flight.yaml",
        );
        let mut flex = super::super::test_support::flight().fields[4].clone();
        flex.id = "flex_temperature".into();
        p.content.flight.as_mut().unwrap().fields.push(flex);
        assert_eq!(messages(&p), "");
    }

    fn cdu_pack(action: CduText) -> Pack {
        let mut p = pack(vec![step("a")], vec![]);
        p.content.cdu = Some(CduFile {
            walkthroughs: vec![CduWalkthrough {
                id: "setup".into(),
                title: "Setup".into(),
                pages: vec![CduPage {
                    page: "RTE".into(),
                    key: None,
                    title: "Route".into(),
                    action,
                    check: vec![],
                    note: vec![],
                    screen: CduScreen {
                        title: vec![],
                        page: vec![],
                        rows: vec![],
                        highlight: vec![],
                        scratchpad: vec![],
                    },
                }],
            }],
        });
        p
    }

    fn field(field: FieldId) -> CduField {
        CduField {
            field,
            style: None,
            before: None,
            after: None,
            empty: None,
            empty_style: None,
            index: None,
            part: None,
        }
    }

    #[test]
    fn cdu_groups_are_checked() {
        let good = CduWhen {
            when_known: vec![FieldId::from("runway")],
            show: vec![
                CduInline::Text("<SEL> ".into()),
                CduInline::Field(field(FieldId::from("runway"))),
            ],
            otherwise: vec![],
        };
        assert_eq!(messages(&cdu_pack(vec![CduPart::When(good.clone())])), "");

        let mut empty = good.clone();
        empty.when_known.clear();
        assert_flags(
            &cdu_pack(vec![CduPart::When(empty)]),
            "`when_known` must name",
        );

        let mut manual_shown = good.clone();
        manual_shown
            .show
            .push(CduInline::Field(field(FieldId::from("manual"))));
        assert_flags(&cdu_pack(vec![CduPart::When(manual_shown)]), "`manual`");

        let mut manual_tested = good;
        manual_tested.when_known = vec![FieldId::from("manual")];
        assert_flags(&cdu_pack(vec![CduPart::When(manual_tested)]), "`manual`");
    }
}
