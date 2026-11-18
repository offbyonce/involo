// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The phases file: options, list placement and stages.

use std::collections::BTreeSet;

use involo_checklist_core::{FieldKind, Quick, Suggests, UserOption};

use super::index::Index;
use super::{Issue, error};
use crate::Pack;

/// What `ask_in` names for the Start page.
const START: &str = "start";

/// An option asked on the Start page says how it is drawn there; a link names a real phase.
fn check_start(option: &UserOption, idx: &Index, issues: &mut Vec<Issue>) {
    let asked = option.ask_in.iter().any(|p| p == START);
    match (&option.start, asked) {
        (None, true) => issues.push(error(
            &option.id,
            "asked on the Start page, so it needs `start` with a `style` (cards or row)",
        )),
        (Some(_), false) => issues.push(error(
            &option.id,
            "`start` is for an option `ask_in` names `start`",
        )),
        (Some(control), true) => {
            if let Some(link) = &control.link {
                idx.require_phase(&option.id, &link.phase, issues);
            }
        }
        (None, false) => {}
    }
}

/// A suggestion rule (decision 0027) reads a planned fuel weight and suggests one of the option's
/// own values.
fn check_suggests(pack: &Pack, option: &UserOption, issues: &mut Vec<Issue>) {
    let Some(Suggests::Rule(rule)) = &option.suggests else {
        return;
    };
    // A weight: a number field whose unit field offers LB and KG.
    let fields = || pack.content.flight.iter().flat_map(|f| &f.fields);
    let field = fields().find(|f| f.id == rule.field.as_str());
    let unit = field
        .and_then(|f| f.unit.as_deref())
        .and_then(|u| fields().find(|f| f.id == u));
    let weighs =
        |c: &str| unit.is_some_and(|u| u.choices.iter().any(|x| x.value.eq_ignore_ascii_case(c)));
    if field.is_none_or(|f| f.kind != FieldKind::Number) || !(weighs("LB") && weighs("KG")) {
        issues.push(error(
            &option.id,
            format!(
                "`suggests` reads `{}`, which is not a weight field (a number whose unit is LB or KG)",
                rule.field
            ),
        ));
    }
    for value in [&rule.then, &rule.otherwise] {
        if !option.values.contains(value) {
            issues.push(error(
                &option.id,
                format!("`suggests` names `{value}`, which is not one of the option's values"),
            ));
        }
    }
}

pub(super) fn check_phases(pack: &Pack, idx: &Index, issues: &mut Vec<Issue>) {
    let Some(file) = &pack.content.phases else {
        return;
    };
    if let Some(turnaround) = &file.turnaround {
        idx.check_show_if("turnaround", turnaround, issues);
    }
    let uses_turnaround = pack
        .checklists
        .iter()
        .flat_map(|l| &l.steps)
        .find(|s| s.quick == Some(Quick::Turnaround));
    if let (Some(step), None) = (uses_turnaround, &file.turnaround) {
        issues.push(error(
            step.id.as_str(),
            "is in Essentials on a turnaround, but phases.yaml declares no `turnaround`",
        ));
    }
    for option in &file.options {
        idx.check_option_value(&option.id, &option.id, &option.default, issues);
        check_choices(option, issues);
        check_suggests(pack, option, issues);
        if let Some(Suggests::Field(field)) = &option.suggests {
            idx.require_field(&option.id, field.as_str(), issues);
        }
        for phase in option.ask_in.iter().filter(|p| *p != START) {
            idx.require_phase(&option.id, phase, issues);
        }
        check_start(option, idx, issues);
    }
    let mut placed = BTreeSet::new();
    for phase in &file.phases {
        for list in &phase.lists {
            if !idx.lists.contains(list.as_str()) {
                issues.push(error(&phase.id, format!("refers to unknown list `{list}`")));
            }
            if !placed.insert(list.as_str()) {
                issues.push(error(list, "list is placed in more than one phase"));
            }
        }
    }
    for list in &idx.lists {
        if !placed.contains(list) {
            issues.push(error(*list, "list is not placed in any phase"));
        }
    }
    super::ids::unique("stage", file.stages.iter().map(|s| s.id.as_str()), issues);
    for stage in &file.stages {
        if !super::ids::valid_segment(&stage.id) {
            issues.push(error(
                &stage.title,
                format!(
                    "stage id `{}` must be lower-case letters, digits and dashes",
                    stage.id
                ),
            ));
        }
        for place in &stage.phases {
            idx.require_phase(&stage.id, &place.phase, issues);
            if let Some(show_if) = &place.show_if {
                idx.check_show_if(&stage.id, show_if, issues);
            }
        }
    }
    let groups: Vec<&str> = pack
        .content
        .labels
        .reference
        .groups
        .iter()
        .map(|g| g.id.as_str())
        .collect();
    for phase in &file.phases {
        check_group(phase, &groups, issues);
    }
}

/// A reference phase names its group (the built-in ones, or one the pack's labels add); a phase
/// in the flight has none.
fn check_group(phase: &involo_checklist_core::Phase, groups: &[&str], issues: &mut Vec<Issue>) {
    match (&phase.group, phase.reference) {
        (None, true) => issues.push(error(
            &phase.id,
            format!(
                "a reference phase needs a `group`: one of {}",
                groups.join(", ")
            ),
        )),
        (Some(_), false) => issues.push(error(&phase.id, "only a reference phase has a `group`")),
        (Some(group), true) if !groups.contains(&group.as_str()) => {
            issues.push(error(
                &phase.id,
                format!(
                    "unknown reference group `{group}`: one of {}",
                    groups.join(", ")
                ),
            ));
        }
        _ => {}
    }
}

/// Choices, when given, show each value of the option exactly once.
fn check_choices(option: &UserOption, issues: &mut Vec<Issue>) {
    if option.choices.is_empty() {
        return;
    }
    let mut seen = BTreeSet::new();
    for choice in &option.choices {
        if !option.values.contains(&choice.value) {
            issues.push(error(
                &option.id,
                format!("choice for unknown value `{}`", choice.value),
            ));
        } else if !seen.insert(choice.value.as_str()) {
            issues.push(error(
                &option.id,
                format!("more than one choice for value `{}`", choice.value),
            ));
        }
    }
    for value in &option.values {
        if !seen.contains(value.as_str()) {
            issues.push(error(&option.id, format!("no choice for value `{value}`")));
        }
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{FieldId, OptionChoice, OptionTest, ShowIf};

    use super::super::test_support::{assert_flags, messages, pack, step};

    fn on_start(control: Option<involo_checklist_core::StartControl>) -> crate::Pack {
        let mut p = pack(vec![step("a")], vec![]);
        let option = &mut p.content.phases.as_mut().unwrap().options[0];
        option.ask_in.push("start".into());
        option.start = control;
        p
    }

    fn control(
        style: involo_checklist_core::StartStyle,
        link: Option<&str>,
    ) -> involo_checklist_core::StartControl {
        involo_checklist_core::StartControl {
            style,
            title: None,
            description: Some("What it changes.".into()),
            link: link.map(|phase| involo_checklist_core::StartLink {
                phase: phase.into(),
                text: "Preview".into(),
            }),
        }
    }

    #[test]
    fn an_option_on_the_start_page_passes_in_either_style() {
        use involo_checklist_core::StartStyle;
        for style in [StartStyle::Cards, StartStyle::Row] {
            assert_eq!(
                messages(&on_start(Some(control(style, Some("preflight"))))),
                ""
            );
        }
    }

    #[test]
    fn an_option_on_the_start_page_needs_a_style_and_a_real_linked_phase() {
        use involo_checklist_core::StartStyle;
        assert_flags(
            &on_start(None),
            "asked on the Start page, so it needs `start` with a `style` (cards or row)",
        );
        assert_flags(
            &on_start(Some(control(StartStyle::Row, Some("walkaround")))),
            "walkaround",
        );
        let mut p = pack(vec![step("a")], vec![]);
        p.content.phases.as_mut().unwrap().options[0].start = Some(control(StartStyle::Row, None));
        assert_flags(&p, "`start` is for an option `ask_in` names `start`");
    }

    #[test]
    fn a_stage_needs_an_id_of_its_own() {
        let without = "stages:\n  - title: Preflight\n    phases: []\nphases: []\n";
        let e = crate::parse_yaml::<involo_checklist_core::PhasesFile>(
            without,
            std::path::Path::new("phases.yaml"),
        )
        .unwrap_err();
        assert!(e.to_string().contains("id"), "{e}");
        let mut p = pack(vec![step("a")], vec![]);
        let file = p.content.phases.as_mut().unwrap();
        let copy = file.stages[0].clone();
        file.stages.push(copy);
        assert_flags(&p, "preflight: stage id is used twice");
    }

    #[test]
    fn a_reference_phase_names_its_group() {
        let mut p = pack(vec![step("a")], vec![]);
        let phase = &mut p.content.phases.as_mut().unwrap().phases[0];
        phase.reference = true;
        assert_flags(
            &p,
            "a reference phase needs a `group`: one of memory, quick, procedures",
        );
        p.content.phases.as_mut().unwrap().phases[0].group = Some("memory".into());
        assert!(!messages(&p).contains("group"), "{}", messages(&p));
        p.content.phases.as_mut().unwrap().phases[0].group = Some("checklists".into());
        assert_flags(&p, "unknown reference group `checklists`");
        p.content.phases.as_mut().unwrap().phases[0].reference = false;
        assert_flags(&p, "only a reference phase has a `group`");
    }

    #[test]
    fn stage_places_are_checked_too() {
        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.stages[0].phases[0].show_if = Some(ShowIf::Test(OptionTest::Equals {
                option: "power".into(),
                equals: "nope".into(),
            }));
        }
        assert_flags(&p, "has no value");
    }

    #[test]
    fn every_list_sits_in_exactly_one_phase() {
        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.phases[0].lists.clear();
        }
        assert_flags(&p, "not placed in any phase");

        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.phases[0].lists = vec!["preflight".into(), "preflight".into(), "ghost".into()];
        }
        assert_flags(&p, "more than one phase");
        assert_flags(&p, "unknown list");
    }

    #[test]
    fn a_turnaround_step_needs_a_turnaround_declaration() {
        let mut s = step("a");
        s.quick = Some(involo_checklist_core::Quick::Turnaround);
        let mut p = pack(vec![s.clone()], vec![]);
        assert_flags(&p, "declares no `turnaround`");
        if let Some(file) = &mut p.content.phases {
            file.turnaround = Some(ShowIf::Test(OptionTest::Equals {
                option: "power".into(),
                equals: "nope".into(),
            }));
        }
        assert_flags(&p, "has no value `nope`");
        let mut p = pack(vec![s], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.turnaround = Some(ShowIf::Test(OptionTest::Equals {
                option: "power".into(),
                equals: "apu".into(),
            }));
        }
        assert!(
            crate::validate_pack(&p)
                .iter()
                .all(|i| !i.message.contains("turnaround"))
        );
    }

    #[test]
    fn a_suggestion_rule_reads_a_fuel_weight_and_suggests_the_option_s_values() {
        let rule = |field, then: &str| {
            Some(involo_checklist_core::Suggests::Rule(
                involo_checklist_core::SuggestRule {
                    field,
                    unit: involo_checklist_core::WeightUnit::Kg,
                    minus: 7738,
                    near: 225,
                    other_unit: None,
                    more_than: 450,
                    then: then.into(),
                    otherwise: "gpu".into(),
                },
            ))
        };
        let with = |suggests| {
            let mut p = pack(vec![step("a")], vec![]);
            if let Some(file) = p.content.phases.as_mut() {
                file.options[0].suggests = suggests;
            }
            p
        };
        assert!(!messages(&with(rule(FieldId::from("fuel"), "apu"))).contains("suggests"));
        assert_flags(
            &with(rule(FieldId::from("qnh"), "apu")),
            "`suggests` reads `qnh`, which is not a weight field",
        );
        assert_flags(
            &with(rule(FieldId::from("fuel"), "battery")),
            "`suggests` names `battery`, which is not one of the option's values",
        );
        // Format 4's bare field still reads, and suggests nothing.
        assert!(
            !messages(&with(Some(involo_checklist_core::Suggests::Field(
                FieldId::from("fuel")
            ))))
            .contains("suggests")
        );
    }

    #[test]
    fn choices_cover_each_value_once_and_ask_in_names_phases() {
        let choice = |value: &str| OptionChoice {
            value: value.into(),
            label: value.to_uppercase(),
            description: None,
        };
        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.options[0].choices = vec![choice("gpu"), choice("gpu"), choice("solar")];
            file.options[0].ask_in = vec!["preflight".into(), "ghost".into()];
        }
        assert_flags(&p, "more than one choice for value `gpu`");
        assert_flags(&p, "choice for unknown value `solar`");
        assert_flags(&p, "no choice for value `apu`");
        assert_flags(&p, "unknown phase `ghost`");

        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.options[0].choices = vec![choice("gpu"), choice("apu")];
            file.options[0].ask_in = vec!["preflight".into()];
        }
        assert!(
            crate::validate_pack(&p)
                .iter()
                .all(|i| !i.message.contains("choice"))
        );
    }

    #[test]
    fn an_option_default_must_be_one_of_its_values() {
        let mut p = pack(vec![step("a")], vec![]);
        if let Some(file) = &mut p.content.phases {
            file.options[0].default = "solar".into();
        }
        assert_flags(&p, "has no value `solar`");
    }
}
