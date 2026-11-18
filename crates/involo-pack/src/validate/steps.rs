// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Lists and their steps.

use involo_checklist_core::{Checklist, FieldId, Step};

use super::confirmations::check_confirmations;
use super::index::Index;
use super::{BLANK, Issue, error, valid_step_id};

const ROUTE_LEG_ONLY_IN_CDU: &str =
    "`route_leg` is only valid in CDU text, with `index` and `part`";

/// A step's `role` and `respond` name roles the labels list; `respond` only answers a challenge,
/// so it belongs to a challenge-and-response list (decision 0029).
fn check_roles(list: &Checklist, idx: &Index, issues: &mut Vec<Issue>) {
    for step in &list.steps {
        let at = step.id.as_str();
        for (field, role) in [("role", &step.role), ("respond", &step.respond)] {
            if let Some(role) = role
                && !idx.roles.contains(role.as_str())
            {
                issues.push(error(
                    at,
                    format!("`{field}` names `{role}`, which is not a role in the pack's labels"),
                ));
            }
        }
        if step.respond.is_some()
            && list.method != Some(involo_checklist_core::ListMethod::ChallengeResponse)
        {
            issues.push(error(
                at,
                "`respond` belongs in a list with `method: challenge_response`",
            ));
        }
    }
}

fn check_step(step: &Step, idx: &Index, issues: &mut Vec<Issue>) {
    let at = step.id.as_str();
    if !idx.step_prefixes.iter().any(|p| valid_step_id(p, at)) {
        issues.push(error(
            at,
            format!(
                "step id must be `<prefix>.<phase>.<short-name>`, where the prefix is {}",
                idx.step_prefixes
                    .iter()
                    .map(|p| format!("`{p}`"))
                    .collect::<Vec<_>>()
                    .join(" or ")
            ),
        ));
    }
    if step.text.trim().is_empty() || step.expect.trim().is_empty() {
        issues.push(error(
            at,
            "step text and expected response must not be empty",
        ));
    }
    for control in step.controls.iter().chain(step.panel_lights.keys()) {
        idx.require_control(at, control, issues);
    }
    check_confirmations(at, &step.confirmed_by, issues);
    if step.simulator_model && step.note.is_none() {
        issues.push(error(at, "`simulator_model` needs a `note` to apply to"));
    }
    let blanks = step.expect.matches(BLANK).count();
    if !step.fill.is_empty() && step.fill.len() != blanks {
        issues.push(error(
            at,
            format!(
                "`fill` has {} entries but `expect` has {blanks} blanks",
                step.fill.len()
            ),
        ));
    }
    for field in step.fill.iter().chain(step.hint.iter().map(|h| &h.field)) {
        idx.require_field(at, field.as_str(), issues);
    }
    if step
        .hint
        .iter()
        .any(|h| h.field.as_str() == FieldId::MANUAL)
    {
        issues.push(error(at, "`manual` is only valid in a step's `fill`"));
    }
    let hint_fields = step.hint.iter().map(|h| &h.field);
    if step
        .fill
        .iter()
        .chain(hint_fields)
        .any(|f| f.as_str() == FieldId::ROUTE_LEG)
    {
        issues.push(error(at, ROUTE_LEG_ONLY_IN_CDU));
    }
    if let Some(id) = &step.opens
        && !idx.walkthroughs.contains(id.as_str())
    {
        issues.push(error(at, format!("opens unknown walkthrough `{id}`")));
    }
    if let Some(id) = &step.how
        && !idx.how.contains(id.as_str())
    {
        issues.push(error(at, format!("refers to unknown how note `{id}`")));
    }
    if let Some(id) = &step.explain
        && !idx.explain.contains(id.as_str())
    {
        issues.push(error(at, format!("refers to unknown explanation `{id}`")));
    }
    if let Some(show_if) = &step.show_if {
        idx.check_show_if(at, show_if, issues);
    }
    if let Some(auto) = step.timer.as_ref().and_then(|t| t.auto_start.as_ref()) {
        for id in &auto.from {
            idx.require_step(at, id, issues);
        }
    }
}

pub(super) fn check_list(list: &Checklist, idx: &Index, issues: &mut Vec<Issue>) {
    if list.steps.is_empty() {
        issues.push(error(&list.id, "checklist has no steps"));
    }
    check_roles(list, idx, issues);
    if list.basis.is_empty() {
        issues.push(error(&list.id, "list has no `basis`"));
    }
    // The app shows the training notice itself; a copy in a list's text reads as part of it.
    if list
        .why
        .as_deref()
        .is_some_and(|w| w.contains("Simulator training only"))
    {
        issues.push(error(
            &list.id,
            "the list's `why` repeats the training notice",
        ));
    }
    for tag in &list.basis {
        if !idx.tags.contains(tag.as_str()) {
            issues.push(error(
                &list.id,
                format!("basis `{tag}` is not declared in pack.json"),
            ));
        }
    }
    for step in &list.steps {
        check_step(step, idx, issues);
    }
}

/// Words too common to tell two sentences apart.
const COMMON: &[&str] = &[
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "is", "are", "be",
    "it", "its", "this", "that", "as", "by", "from", "then", "each", "one", "if", "not", "no",
    "up", "down", "so", "than", "out", "into",
];

fn words(text: &str) -> std::collections::BTreeSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '/')
        .filter(|w| !w.is_empty() && !COMMON.contains(w))
        .map(str::to_owned)
        .collect()
}

/// A step's note must add something to its "How to do it" steps: a note whose words are mostly
/// already there says the same thing twice, so the pilot reads it twice.
pub(super) fn check_notes_repeat_how(pack: &crate::Pack, issues: &mut Vec<Issue>) {
    let Some(notes) = &pack.content.notes else {
        return;
    };
    for step in pack.checklists.iter().flat_map(|l| &l.steps) {
        let (Some(note), Some(how)) = (&step.note, &step.how) else {
            continue;
        };
        let Some(how) = notes.how.iter().find(|h| &h.id == how) else {
            continue;
        };
        let note_words = words(note);
        let how_words = words(&how.steps.join(" "));
        let shared = note_words.intersection(&how_words).count();
        if !note_words.is_empty() && shared * 10 >= note_words.len() * 7 {
            issues.push(error(
                step.id.as_str(),
                "the note repeats its \"How to do it\" steps; say it once",
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{
        CduField, CduFile, CduPage, CduPart, CduScreen, CduWalkthrough, FieldId, HintPart,
    };

    use super::super::test_support::{assert_flags, messages, pack, step};

    /// The demo pack with a captain and a first officer, and its one list using `method`.
    fn crewed(method: Option<involo_checklist_core::ListMethod>) -> crate::Pack {
        let mut p = pack(vec![step("demo-aircraft.preflight.a")], vec![]);
        let role = |id: &str| involo_checklist_core::RoleLabel {
            id: id.into(),
            title: id.into(),
            short: id.into(),
            seat: None,
        };
        p.content.labels.roles = vec![role("capt"), role("fo")];
        p.checklists[0].method = method;
        p
    }

    #[test]
    fn every_method_and_a_step_s_role_and_respond_pass() {
        use involo_checklist_core::ListMethod;
        for method in [
            ListMethod::Do,
            ListMethod::ReadAndDo,
            ListMethod::ChallengeResponse,
            ListMethod::FromMemory,
        ] {
            let mut p = crewed(Some(method));
            p.checklists[0].steps[0].role = Some("capt".into());
            if method == ListMethod::ChallengeResponse {
                p.checklists[0].steps[0].respond = Some("fo".into());
            }
            assert!(
                !messages(&p).contains("role"),
                "{method:?}: {}",
                messages(&p)
            );
        }
    }

    #[test]
    fn a_role_the_labels_do_not_list_fails() {
        let mut p = crewed(None);
        p.checklists[0].steps[0].role = Some("purser".into());
        assert_flags(
            &p,
            "`role` names `purser`, which is not a role in the pack's labels",
        );
    }

    #[test]
    fn respond_outside_a_challenge_and_response_list_fails() {
        let mut p = crewed(Some(involo_checklist_core::ListMethod::ReadAndDo));
        p.checklists[0].steps[0].respond = Some("fo".into());
        assert_flags(
            &p,
            "`respond` belongs in a list with `method: challenge_response`",
        );
        let mut p = crewed(None);
        p.checklists[0].steps[0].respond = Some("fo".into());
        assert_flags(
            &p,
            "`respond` belongs in a list with `method: challenge_response`",
        );
    }

    #[test]
    fn a_step_id_may_start_with_the_pack_it_extends_and_nothing_else() {
        let id = |s: &str| involo_checklist_core::Step::new(s, "Battery", "ON");
        let mut p = pack(vec![id("lib.demo.preflight.a")], vec![]);
        assert_flags(&p, "where the prefix is `demo-aircraft`");
        p.manifest.extends.insert(
            "lib.demo".into(),
            semver::VersionReq::parse(">=1.0").unwrap(),
        );
        assert!(!messages(&p).contains("step id"), "{}", messages(&p));
        p.checklists[0].steps = vec![id("other.preflight.a")];
        assert_flags(&p, "where the prefix is `demo-aircraft` or `lib.demo`");
    }

    #[test]
    fn a_built_pack_s_step_ids_may_start_with_any_pack_up_its_chain() {
        let id = |s: &str| involo_checklist_core::Step::new(s, "Battery", "ON");
        let mut p = pack(vec![id("lib.family.preflight.a")], vec![]);
        p.manifest.extends.insert(
            "lib.demo".into(),
            semver::VersionReq::parse(">=1.0").unwrap(),
        );
        assert_flags(&p, "where the prefix is `demo-aircraft` or `lib.demo`");
        // Built: the parent extends a family library, so its steps keep that prefix.
        p.manifest.resolved = ["lib.demo", "lib.family"]
            .map(|id| crate::ResolvedParent {
                id: id.into(),
                version: semver::Version::new(1, 0, 0),
            })
            .to_vec();
        assert!(!messages(&p).contains("step id"), "{}", messages(&p));
    }

    #[test]
    fn a_list_why_does_not_repeat_the_training_notice() {
        let mut p = pack(vec![step("ifly-737-max8.preflight.a")], vec![]);
        p.checklists[0].why =
            Some("Simulator training only. Not for real-world use. Fly first.".into());
        assert_flags(&p, "repeats the training notice");
        p.checklists[0].why = Some("Fly first.".into());
        assert!(!messages(&p).contains("training notice"));
    }

    #[test]
    fn a_note_must_not_repeat_its_how_to_steps() {
        let mut s = step("ifly-737-max8.preflight.n1-bugs");
        s.how = Some("n1".into());
        s.note = Some(
            "Compare the takeoff thrust bugs with the green N1 reference on the engine display."
                .into(),
        );
        let mut p = pack(vec![s], vec![]);
        p.content.notes = Some(involo_checklist_core::NotesFile {
            how: vec![involo_checklist_core::HowNote {
                id: "n1".into(),
                steps: vec![
                    "Compare the N1 bugs with the green reference N1 readouts on the engine display.".into(),
                    "Check that they agree with the CDU value.".into(),
                ],
            }],
            explain: vec![],
        });
        assert_flags(&p, "the note repeats its \"How to do it\" steps");
        p.checklists[0].steps[0].note = Some("Set the bugs before the engines start.".into());
        assert!(!messages(&p).contains("repeats"));
    }

    #[test]
    fn lists_need_a_declared_basis() {
        let mut p = pack(vec![step("a")], vec![]);
        p.checklists[0].basis.clear();
        assert_flags(&p, "no `basis`");

        let mut p = pack(vec![step("a")], vec![]);
        p.checklists[0].basis = vec!["some-manual".into()];
        assert_flags(&p, "not declared");

        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.basis_tags = vec!["Some Manual".into()];
        assert_flags(&p, "must be lower-case");
    }

    /// The demo pack with a field the app has never heard of.
    fn with_flex() -> crate::Pack {
        let mut p = pack(vec![step("a")], vec![]);
        let mut flex = super::super::test_support::flight().fields[4].clone();
        flex.id = "flex_temperature".into();
        p.content.flight.as_mut().unwrap().fields.push(flex);
        p
    }

    #[test]
    fn a_field_the_pack_defines_fills_blanks_and_hints_and_an_unknown_one_fails() {
        let mut p = with_flex();
        let s = &mut p.checklists[0].steps[0];
        s.expect = "FLEX ___".into();
        s.fill = vec![FieldId::from("flex_temperature")];
        s.hint = vec![HintPart {
            field: FieldId::from("flex_temperature"),
            prefix: "FLEX ".into(),
        }];
        assert_eq!(messages(&p), "");
        p.checklists[0].steps[0].fill = vec![FieldId::from("assumed_temp")];
        assert_flags(
            &p,
            "`assumed_temp` is not a flight field the pack defines in flight.yaml",
        );
        let mut p = with_flex();
        p.checklists[0].steps[0].hint = vec![HintPart {
            field: FieldId::from("trim_units"),
            prefix: String::new(),
        }];
        assert_flags(
            &p,
            "`trim_units` is not a flight field the pack defines in flight.yaml",
        );
    }

    #[test]
    fn fill_must_match_the_blanks() {
        let mut s = step("a");
        s.expect = "V1 ___ VR ___".into();
        s.fill = vec![FieldId::from("v1")];
        assert_flags(
            &pack(vec![s.clone()], vec![]),
            "1 entries but `expect` has 2 blanks",
        );
        s.fill = vec![FieldId::from("v1"), FieldId::from("manual")];
        assert_eq!(messages(&pack(vec![s], vec![])), "");
    }

    #[test]
    fn simulator_model_applies_to_a_note() {
        let mut s = step("a");
        s.simulator_model = true;
        assert_flags(&pack(vec![s.clone()], vec![]), "needs a `note`");
        s.note = Some("The guard closes by itself.".into());
        assert_eq!(messages(&pack(vec![s], vec![])), "");
    }

    #[test]
    fn manual_is_only_for_step_blanks() {
        let mut s = step("a");
        s.hint = vec![HintPart {
            prefix: "X ".into(),
            field: FieldId::from("manual"),
        }];
        assert_flags(&pack(vec![s], vec![]), "only valid in a step's `fill`");

        let mut p = pack(vec![step("a")], vec![]);
        p.content.cdu = Some(CduFile {
            walkthroughs: vec![CduWalkthrough {
                id: "preflight".into(),
                title: "Preflight".into(),
                pages: vec![CduPage {
                    page: "IDENT".into(),
                    key: None,
                    title: "Check".into(),
                    action: vec![CduPart::Field(CduField {
                        field: FieldId::from("manual"),
                        style: None,
                        before: None,
                        after: None,
                        empty: None,
                        empty_style: None,
                        index: None,
                        part: None,
                    })],
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
        assert_flags(&p, "only valid in a step's `fill`");
    }

    #[test]
    fn step_references_must_resolve() {
        let mut s = step("a");
        s.controls = vec!["nope".into()];
        assert_flags(&pack(vec![s], vec![]), "unknown control");

        let mut s = step("a");
        s.opens = Some("nope".into());
        assert_flags(&pack(vec![s], vec![]), "unknown walkthrough");

        let mut s = step("a");
        s.how = Some("nope".into());
        assert_flags(&pack(vec![s], vec![]), "unknown how note");

        let mut s = step("a");
        s.explain = Some("nope".into());
        assert_flags(&pack(vec![s], vec![]), "unknown explanation");
    }
}
