// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `flight.yaml`: the pack's flight fields (decision 0029).

use std::collections::BTreeSet;

use involo_checklist_core::{FieldId, FieldKind, FlightField, ShowIn};

use super::ids::unique;
use super::{Issue, error};
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
            at,
            "a field id is lower-case letters, digits and underscores, starting with a letter",
        ));
    }
    if FieldId::new(at.as_str()).is_built_in() {
        issues.push(error(at, format!("`{at}` is one of the app's own fields")));
    }
    match field.kind {
        FieldKind::Choice if field.choices.is_empty() => {
            issues.push(error(at, "a choice field lists its `choices`"));
        }
        FieldKind::Number | FieldKind::Text if !field.choices.is_empty() => {
            issues.push(error(at, "only a choice field has `choices`"));
        }
        _ => {}
    }
    if field.kind != FieldKind::Number
        && (field.unit.is_some() || !field.ranges.is_empty() || field.display.is_some())
    {
        issues.push(error(
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
                at,
                format!("`unit` names `{u}`, which is not a field"),
            ));
        }
        Some((u, Some(f))) if f.kind != FieldKind::Choice => {
            issues.push(error(
                at,
                format!("`unit` names `{u}`, which is not a choice field"),
            ));
        }
        _ => {}
    }
    for range in &field.ranges {
        if range.min > range.max {
            issues.push(error(at, "a range's `min` is above its `max`"));
        }
        if let Some(value) = &range.unit {
            let named = unit
                .and_then(|(_, f)| f)
                .is_some_and(|f| f.choices.iter().any(|c| &c.value == value));
            if !named {
                issues.push(error(
                    at,
                    format!("a range for unit `{value}`, which the field's `unit` does not offer"),
                ));
            }
        }
    }
    if let Some(display) = &field.display
        && (display.scale <= 0.0 || display.step <= 0.0)
    {
        issues.push(error(at, "`display` needs a `scale` and a `step` above 0"));
    }
    if field.strip.is_some() && !field.show_in.contains(&ShowIn::Strip) {
        issues.push(error(at, "`strip` text is for a field `show_in` the strip"));
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
                }];
            }),
            "a range for unit `TONNES`",
        );
    }
}
