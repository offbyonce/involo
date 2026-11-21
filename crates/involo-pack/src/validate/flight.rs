// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `flight.yaml`: the pack's flight fields (decision 0029).

use std::collections::BTreeSet;

use involo_checklist_core::{FieldId, FieldKind, FlightField, ShowIn};

use super::ids::unique;
use super::{Code, Issue, error};
use crate::Pack;

/// A field id: lower-case letters, digits and underscores, starting with a letter.
fn valid_field_id(id: &str) -> bool {
    id.starts_with(|c: char| c.is_ascii_lowercase())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

pub(super) fn check_flight(pack: &Pack, issues: &mut Vec<Issue>) {
    let Some(file) = &pack.content.flight else {
        return;
    };
    let ids = unique(
        "flight field",
        file.fields.iter().map(|f| f.id.as_str()),
        issues,
    );
    for field in &file.fields {
        check_field(field, &file.fields, &ids, issues);
    }
    check_pages(pack, file, issues);
    check_overview(file, &ids, issues);
}

/// The Overview rows name Flight pages and fields that exist, in placeholders written correctly.
fn check_overview(
    file: &involo_checklist_core::FlightFile,
    ids: &BTreeSet<&str>,
    issues: &mut Vec<Issue>,
) {
    use involo_checklist_core::FIELD_PAGES;
    for row in &file.overview {
        let at = format!("overview `{}`", row.label);
        if !FIELD_PAGES.contains(&row.page.as_str()) {
            issues.push(error(
                Code::NotFlightPage,
                &at,
                format!("`{}` is not a Flight page", row.page),
            ));
        }
        for part in row.value.iter().chain(&row.description) {
            for name in placeholders(part) {
                let (field, how) = name.split_once(':').unwrap_or((name, ""));
                if field == "unit" && how.is_empty() {
                    continue;
                }
                if !ids.contains(field) {
                    issues.push(error(
                        Code::PlaceholderField,
                        &at,
                        format!("`{{{name}}}` names no flight field"),
                    ));
                } else if !how.is_empty() && how != "grouped" {
                    issues.push(error(
                        Code::PlaceholderForm,
                        &at,
                        format!("`{{{name}}}`: the only form is `:grouped`"),
                    ));
                }
            }
        }
    }
}

/// The names in a part's `{…}` placeholders.
fn placeholders(part: &str) -> Vec<&str> {
    part.split('{')
        .skip(1)
        .filter_map(|s| s.split_once('}').map(|(n, _)| n))
        .collect()
}

/// A Flight page or group a field or copy names, and the fields its links name.
fn check_pages(pack: &Pack, file: &involo_checklist_core::FlightFile, issues: &mut Vec<Issue>) {
    unique(
        "Flight page",
        file.pages.iter().map(|p| p.id.as_str()),
        issues,
    );
    for page in &file.pages {
        check_page(page, file, issues);
    }
    for f in &file.fields {
        check_field_links(pack, file, f, issues);
    }
}

/// A page is one of the app's, its groups are named once, and what they name is real.
fn check_page(
    page: &involo_checklist_core::FlightPage,
    file: &involo_checklist_core::FlightFile,
    issues: &mut Vec<Issue>,
) {
    use involo_checklist_core::FIELD_PAGES;
    let field = |id: &str| file.fields.iter().find(|f| f.id == id);
    let at = format!("Flight page `{}`", page.id);
    if !FIELD_PAGES.contains(&page.id.as_str()) {
        issues.push(error(
            Code::NotFlightPage,
            &at,
            format!(
                "is not one of the app's Flight pages ({})",
                FIELD_PAGES.join(", ")
            ),
        ));
    }
    unique(
        &format!("{at} group"),
        page.groups.iter().map(|g| g.title.as_str()),
        issues,
    );
    if let Some(sel) = &page.selected
        && !file
            .fields
            .iter()
            .any(|f| &f.id == sel && f.page.as_deref() == Some(page.id.as_str()))
    {
        issues.push(error(
            Code::FieldNotOnPage,
            &at,
            format!("`selected` names `{sel}`, which is not a field on this page"),
        ));
    }
    for g in &page.groups {
        for id in &g.fields {
            let here = field(id).is_some_and(|f| {
                (f.page.as_deref() == Some(page.id.as_str())
                    && f.group.as_deref() == Some(g.title.as_str()))
                    || f.also
                        .iter()
                        .any(|a| a.page == page.id && a.group == g.title)
            });
            if !here {
                issues.push(error(
                    Code::FieldNotOnPage,
                    &at,
                    format!(
                        "group `{}` lists `{id}`, which is not a field in it",
                        g.title
                    ),
                ));
            }
        }
        if let Some(u) = &g.units
            && field(&u.field).is_none_or(|f| f.kind != FieldKind::Choice)
        {
            issues.push(error(
                Code::FieldWrongKind,
                &at,
                format!("`units` names `{}`, which is not a choice field", u.field),
            ));
        }
    }
}

/// Why a page and group a field names don't exist, if they don't.
fn place_problem(
    file: &involo_checklist_core::FlightFile,
    page: &str,
    group: Option<&str>,
) -> Option<String> {
    use involo_checklist_core::FIELD_PAGES;
    if file.pages.is_empty() {
        return (!FIELD_PAGES.contains(&page))
            .then(|| format!("`{page}` is not one of the app's Flight pages"));
    }
    let Some(p) = file.pages.iter().find(|p| p.id == page) else {
        return Some(format!("`{page}` is not a page `pages` lists"));
    };
    match group {
        None => Some(format!("names page `{page}` but no `group`")),
        Some(g) if !p.groups.iter().any(|x| x.title == g) => {
            Some(format!("`{g}` is not a group of page `{page}`"))
        }
        Some(_) => None,
    }
}

/// A field's page, copies, second box, toggle, phase and suggesting option are real.
fn check_field_links(
    pack: &Pack,
    file: &involo_checklist_core::FlightFile,
    f: &FlightField,
    issues: &mut Vec<Issue>,
) {
    let field = |id: &str| file.fields.iter().find(|x| x.id == id);
    let phases = pack.content.phases.as_ref();
    let at = &f.id;
    if let Some(page) = &f.page
        && let Some(problem) = place_problem(file, page, f.group.as_deref())
    {
        issues.push(error(Code::NotFlightPage, at, problem));
    }
    for also in &f.also {
        if let Some(problem) = place_problem(file, &also.page, Some(&also.group)) {
            issues.push(error(Code::NotFlightPage, at, format!("`also`: {problem}")));
        }
    }
    if let Some(w) = &f.with
        && field(w).is_none_or(|x| x.kind == FieldKind::Choice || x.id == f.id)
    {
        issues.push(error(
            Code::FieldWrongKind,
            at,
            format!("`with` names `{w}`, which is not another number or text field"),
        ));
    }
    if let Some(t) = &f.toggle
        && field(t).is_none_or(|x| x.kind != FieldKind::Choice || x.choices.len() != 2)
    {
        issues.push(error(
            Code::FieldWrongKind,
            at,
            format!("`toggle` names `{t}`, which is not a choice field of two choices"),
        ));
    }
    if let Some(p) = &f.phase
        && !phases.is_some_and(|ph| ph.phases.iter().any(|x| &x.id == p))
    {
        issues.push(error(
            Code::UnknownPhase,
            at,
            format!("`phase` names `{p}`, which is not a phase"),
        ));
    }
    if let Some(o) = &f.suggested_by
        && !phases.is_some_and(|ph| ph.options.iter().any(|x| &x.id == o))
    {
        issues.push(error(
            Code::UnknownOption,
            at,
            format!("`suggested_by` names `{o}`, which is not an option"),
        ));
    }
}

fn check_field(
    field: &FlightField,
    all: &[FlightField],
    ids: &BTreeSet<&str>,
    issues: &mut Vec<Issue>,
) {
    let at = &field.id;
    if !valid_field_id(at) {
        issues.push(error(
            Code::IdFormat,
            at,
            "a field id is lower-case letters, digits and underscores, starting with a letter",
        ));
    }
    if FieldId::new(at.as_str()).is_built_in() {
        issues.push(error(
            Code::AppFieldId,
            at,
            format!("`{at}` is one of the app's own fields"),
        ));
    }
    match field.kind {
        FieldKind::Choice if field.choices.is_empty() => {
            issues.push(error(
                Code::ChoicesShape,
                at,
                "a choice field lists its `choices`",
            ));
        }
        FieldKind::Number | FieldKind::Text if !field.choices.is_empty() => {
            issues.push(error(
                Code::ChoicesShape,
                at,
                "only a choice field has `choices`",
            ));
        }
        _ => {}
    }
    if field.kind != FieldKind::Number
        && (field.unit.is_some() || !field.ranges.is_empty() || field.display.is_some())
    {
        issues.push(error(
            Code::NumberOnly,
            at,
            "only a number has a `unit`, `ranges` or `display`",
        ));
    }
    let unit = field
        .unit
        .as_deref()
        .map(|u| (u, all.iter().find(|f| f.id == u)));
    match unit {
        Some((u, None)) if !ids.contains(u) => {
            issues.push(error(
                Code::FieldWrongKind,
                at,
                format!("`unit` names `{u}`, which is not a field"),
            ));
        }
        Some((u, Some(f))) if f.kind != FieldKind::Choice => {
            issues.push(error(
                Code::FieldWrongKind,
                at,
                format!("`unit` names `{u}`, which is not a choice field"),
            ));
        }
        _ => {}
    }
    for range in &field.ranges {
        if range.min > range.max {
            issues.push(error(
                Code::RangeOrder,
                at,
                "a range's `min` is above its `max`",
            ));
        }
        if let Some(value) = &range.unit {
            let named = unit
                .and_then(|(_, f)| f)
                .is_some_and(|f| f.choices.iter().any(|c| &c.value == value));
            if !named {
                issues.push(error(
                    Code::RangeUnit,
                    at,
                    format!("a range for unit `{value}`, which the field's `unit` does not offer"),
                ));
            }
        }
    }
    if let Some(display) = &field.display
        && (display.scale <= 0.0 || display.step <= 0.0)
    {
        issues.push(error(
            Code::DisplayScale,
            at,
            "`display` needs a `scale` and a `step` above 0",
        ));
    }
    if field.strip.is_some() && !field.show_in.contains(&ShowIn::Strip) {
        issues.push(error(
            Code::StripNotShown,
            at,
            "`strip` text is for a field `show_in` the strip",
        ));
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{FieldKind, FieldRange, FlightFile};

    use super::super::test_support::{assert_flags, flight, messages, pack, step};

    fn with(edit: impl FnOnce(&mut FlightFile)) -> crate::Pack {
        let mut p = pack(vec![step("a")], vec![]);
        edit(p.content.flight.as_mut().unwrap());
        p
    }

    #[test]
    fn the_demo_fields_are_clean() {
        assert_eq!(messages(&with(|_| {})), "");
        assert_eq!(flight().fields.len(), 9);
    }

    fn page(id: &str, groups: &[&str]) -> involo_checklist_core::FlightPage {
        involo_checklist_core::FlightPage {
            id: id.into(),
            title: id.into(),
            sub: None,
            selected: None,
            ofp: None,
            groups: groups
                .iter()
                .map(|g| involo_checklist_core::FlightGroup {
                    title: (*g).into(),
                    note: None,
                    units: None,
                    notes: None,
                    fields: vec![],
                })
                .collect(),
        }
    }

    #[test]
    fn pages_and_the_fields_on_them_name_real_places_and_fields() {
        let placed = |edit: &dyn Fn(&mut FlightFile)| {
            with(|f| {
                f.pages = vec![page("takeoff", &["Speeds"])];
                f.fields[4].page = Some("takeoff".into());
                f.fields[4].group = Some("Speeds".into());
                edit(f);
            })
        };
        assert_eq!(messages(&placed(&|_| {})), "");
        assert_flags(
            &placed(&|f| f.pages[0].id = "engines".into()),
            "is not one of the app's Flight pages",
        );
        assert_flags(
            &placed(&|f| f.fields[4].group = Some("Brakes".into())),
            "`Brakes` is not a group of page `takeoff`",
        );
        assert_flags(
            &placed(&|f| f.fields[4].page = Some("fuel".into())),
            "`fuel` is not a page `pages` lists",
        );
        assert_flags(
            &placed(&|f| f.pages[0].groups[0].fields = vec!["route".into()]),
            "lists `route`, which is not a field in it",
        );
        assert_flags(
            &placed(&|f| f.pages[0].selected = Some("route".into())),
            "`selected` names `route`",
        );
        assert_flags(
            &placed(&|f| {
                f.pages[0].groups[0].units = Some(involo_checklist_core::GroupUnits {
                    field: "fuel".into(),
                    label: None,
                });
            }),
            "`units` names `fuel`, which is not a choice field",
        );
    }

    #[test]
    fn a_field_s_links_name_real_fields_phases_and_options() {
        assert_flags(
            &with(|f| f.fields[0].with = Some("weight_unit".into())),
            "`with` names `weight_unit`",
        );
        assert_flags(
            &with(|f| f.fields[0].toggle = Some("route".into())),
            "not a choice field of two choices",
        );
        assert_eq!(
            messages(&with(|f| f.fields[0].toggle = Some("weight_unit".into()))),
            ""
        );
        assert_flags(
            &with(|f| f.fields[0].phase = Some("cruise".into())),
            "`phase` names `cruise`",
        );
        assert_flags(
            &with(|f| f.fields[0].suggested_by = Some("tank".into())),
            "`suggested_by` names `tank`",
        );
        assert_eq!(
            messages(&with(|f| f.fields[0].suggested_by = Some("power".into()))),
            ""
        );
        assert_flags(
            &with(|f| {
                f.fields[0].also = vec![involo_checklist_core::FieldAlso {
                    page: "engines".into(),
                    group: "X".into(),
                    label: None,
                    description: None,
                    ofp: None,
                }];
            }),
            "`also`: `engines` is not one of the app's Flight pages",
        );
    }

    #[test]
    fn an_unknown_simbrief_source_does_not_read() {
        let yaml = "fields:\n  - id: fuel\n    label: Fuel\n    kind: number\n    simbrief: [fuel_on_board]\n";
        let e =
            crate::parse_yaml::<FlightFile>(yaml, std::path::Path::new("flight.yaml")).unwrap_err();
        assert!(e.to_string().contains("fuel_on_board"), "{e}");
    }

    #[test]
    fn fields_are_well_formed() {
        assert_flags(
            &with(|f| f.fields[0].id = "Fuel".into()),
            "a field id is lower-case",
        );
        assert_flags(
            &with(|f| f.fields[0].id = "manual".into()),
            "one of the app's own fields",
        );
        assert_flags(
            &with(|f| f.fields.push(f.fields[0].clone())),
            "fuel: flight field id is used twice",
        );
        assert_flags(
            &with(|f| f.fields[2].choices.clear()),
            "a choice field lists its `choices`",
        );
        assert_flags(
            &with(|f| f.fields[0].kind = FieldKind::Text),
            "only a number has a `unit`, `ranges` or `display`",
        );
        assert_flags(
            &with(|f| f.fields[0].unit = Some("qnh".into())),
            "`unit` names `qnh`, which is not a choice field",
        );
        assert_flags(
            &with(|f| {
                f.fields[0].ranges = vec![FieldRange {
                    unit: Some("TONNES".into()),
                    min: 0.0,
                    max: 1.0,
                    message: None,
                }];
            }),
            "a range for unit `TONNES`",
        );
    }

    #[test]
    fn overview_rows_name_real_pages_and_fields() {
        let row = |page: &str, value: &str| involo_checklist_core::FlightOverviewRow {
            label: "Route".into(),
            page: page.into(),
            value: vec![value.into()],
            description: vec![],
            empty: None,
        };
        let mut p =
            super::super::test_support::pack(vec![super::super::test_support::step("a")], vec![]);
        let mut file = super::super::test_support::flight();
        file.overview = vec![row("route", "{runway} · {sid} {route:grouped} {unit}")];
        p.content.flight = Some(file.clone());
        assert!(!messages(&p).contains("overview"), "{}", messages(&p));
        file.overview = vec![row("weather", "{nope} {sid:bold}")];
        p.content.flight = Some(file);
        assert_flags(&p, "`weather` is not a Flight page");
        assert_flags(&p, "`{nope}` names no flight field");
        assert_flags(&p, "`{sid:bold}`: the only form is `:grouped`");
    }
}
