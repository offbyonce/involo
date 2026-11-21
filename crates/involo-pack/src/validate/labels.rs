// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `labels.yaml`: seats, roles, reference groups, basis tags and glossary exceptions as the pack
//! wrote them (decision 0029). The defaults the app adds are not checked here.

use std::collections::BTreeSet;

use involo_checklist_core::content::ReferenceLabelsFile;
use involo_checklist_core::{Labels, LabelsFile};

use super::ids::{unique, valid_segment};
use super::{Code, Issue, error};
use crate::Pack;

const FILE: &str = "labels.yaml";

/// The words a built pack carries, as a `labels.yaml` for these checks (decision 0028): each list
/// the app's defaults don't give, so a flattened pack is checked as its own `labels.yaml` was.
/// What building already drops can't be seen here and is checked when the pack is built: labels
/// for basis tags `pack.json` doesn't list, a second label for one tag or reference group, and a
/// list of glossary exceptions written the same as the default list.
pub(super) fn as_written(labels: &Labels) -> LabelsFile {
    let defaults = Labels::default();
    let given = |list: &Vec<String>, default: &Vec<String>| (list != default).then(|| list.clone());
    LabelsFile {
        list_kinds: None,
        methods: None,
        seats: (labels.seats != defaults.seats).then(|| labels.seats.clone()),
        roles: (labels.roles != defaults.roles).then(|| labels.roles.clone()),
        reference: (labels.reference.groups != defaults.reference.groups).then(|| {
            ReferenceLabelsFile {
                title: None,
                groups: labels.reference.groups.clone(),
            }
        }),
        seat_view_title: None,
        panel_states: None,
        position_words: None,
        find_examples: None,
        glossary_exceptions: given(&labels.glossary_exceptions, &defaults.glossary_exceptions),
        side_words: None,
        plain_words: None,
        basis_tags: labels.basis_tags.clone(),
    }
}

// One check per rule, in order; each one's code makes the calls longer than one line.
#[allow(clippy::too_many_lines)]
pub(super) fn check_labels(pack: &Pack, issues: &mut Vec<Issue>) {
    let Some(file) = &pack.labels_file else {
        return;
    };
    let seats = unique(
        "seat",
        file.seats.iter().flatten().map(|s| s.id.as_str()),
        issues,
    );
    unique(
        "role",
        file.roles.iter().flatten().map(|r| r.id.as_str()),
        issues,
    );
    // Seats the role may name: the pack's own list, or the default list when it gives none.
    let known: BTreeSet<&str> = if file.seats.is_some() {
        seats
    } else {
        pack.content
            .labels
            .seats
            .iter()
            .map(|s| s.id.as_str())
            .collect()
    };
    for (what, id) in file
        .seats
        .iter()
        .flatten()
        .map(|s| ("seat", &s.id))
        .chain(file.roles.iter().flatten().map(|r| ("role", &r.id)))
    {
        if !valid_segment(id) {
            issues.push(error(
                Code::IdFormat,
                FILE,
                format!("{what} id `{id}` must be lower-case letters, digits and dashes"),
            ));
        }
    }
    for role in file.roles.iter().flatten() {
        if let Some(seat) = &role.seat
            && !known.contains(seat.as_str())
        {
            issues.push(error(
                Code::RoleSeat,
                FILE,
                format!("role `{}` sits in unknown seat `{seat}`", role.id),
            ));
        }
    }
    if let Some(reference) = &file.reference {
        unique(
            "reference group",
            reference.groups.iter().map(|g| g.id.as_str()),
            issues,
        );
        for group in &reference.groups {
            if !valid_segment(&group.id) {
                issues.push(error(
                    Code::IdFormat,
                    FILE,
                    format!(
                        "reference group id `{}` must be lower-case letters, digits and dashes",
                        group.id
                    ),
                ));
            }
        }
    }
    unique(
        "basis tag label",
        file.basis_tags.iter().map(|t| t.id.as_str()),
        issues,
    );
    for tag in &file.basis_tags {
        if !pack.manifest.basis_tags.contains(&tag.id) {
            issues.push(error(
                Code::UndeclaredBasis,
                FILE,
                format!(
                    "a label for basis tag `{}`, which pack.json's basisTags does not list",
                    tag.id
                ),
            ));
        }
    }
    let terms: BTreeSet<&str> = pack
        .content
        .glossary
        .iter()
        .flat_map(|g| &g.terms)
        .map(|t| t.term.as_str())
        .collect();
    for term in file.glossary_exceptions.iter().flatten() {
        if !terms.contains(term.as_str()) {
            issues.push(error(
                Code::GlossaryException,
                FILE,
                format!("glossary exception `{term}` is not a glossary term"),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{
        BasisTagLabel, GlossaryEntry, GlossaryFile, LabelsFile, RoleLabel, SeatLabel,
    };

    use super::super::test_support::{assert_flags, messages, pack, step};

    fn with(file: LabelsFile) -> crate::Pack {
        let mut p = pack(vec![step("a")], vec![]);
        p.content.glossary = Some(GlossaryFile {
            terms: vec![GlossaryEntry {
                term: "APU".into(),
                meaning: "Auxiliary power unit.".into(),
                step_term: None,
            }],
        });
        p.labels_file = Some(file);
        p
    }

    fn empty() -> LabelsFile {
        serde_json::from_str("{}").unwrap()
    }

    fn role(id: &str, seat: Option<&str>) -> RoleLabel {
        RoleLabel {
            id: id.into(),
            title: id.into(),
            short: id.into(),
            seat: seat.map(Into::into),
        }
    }

    #[test]
    fn a_clean_labels_file_passes() {
        let mut f = empty();
        f.seats = Some(vec![SeatLabel {
            id: "left".into(),
            title: "Left seat".into(),
        }]);
        f.roles = Some(vec![role("capt", Some("left")), role("pf", None)]);
        f.glossary_exceptions = Some(vec!["APU".into()]);
        assert_eq!(messages(&with(f)), "");
    }

    #[test]
    fn a_role_in_an_unknown_seat_fails() {
        let mut f = empty();
        f.roles = Some(vec![role("capt", Some("left"))]);
        assert_flags(&with(f), "role `capt` sits in unknown seat `left`");
    }

    #[test]
    fn two_roles_with_one_id_fail() {
        let mut f = empty();
        f.roles = Some(vec![role("pf", None), role("pf", None)]);
        assert_flags(&with(f), "pf: role id is used twice");
    }

    #[test]
    fn a_label_for_a_basis_tag_the_manifest_lacks_fails() {
        let mut f = empty();
        f.basis_tags = vec![BasisTagLabel {
            id: "airline-sops".into(),
            label: "Airline SOP".into(),
            about: None,
            pending: false,
        }];
        assert_flags(
            &with(f),
            "a label for basis tag `airline-sops`, which pack.json's basisTags does not list",
        );
    }

    #[test]
    fn a_glossary_exception_that_is_not_a_term_fails() {
        let mut f = empty();
        f.glossary_exceptions = Some(vec!["IGN L".into()]);
        assert_flags(
            &with(f),
            "glossary exception `IGN L` is not a glossary term",
        );
    }
}
