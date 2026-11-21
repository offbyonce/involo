// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The manifest, and the files a pack holds: types and names.

use super::ids::{valid_id, valid_segment};
use super::{Code, Issue, error};
use crate::{Pack, PackKind, format_problem};

/// File types a pack must not contain. Vendor images and screenshots never ship.
const BLOCKED_FILE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "pdf",
];

/// Device names Windows reserves, besides `COM1`-`COM9` and `LPT1`-`LPT9`. A file with one of
/// these names cannot be checked out there, even with an extension.
const WINDOWS_RESERVED_NAMES: &[&str] = &["CON", "PRN", "AUX", "NUL"];

pub(super) fn check_manifest(pack: &Pack, issues: &mut Vec<Issue>) {
    let m = &pack.manifest;
    if !valid_id(&m.id) {
        issues.push(error(
            Code::PackId,
            "pack.json",
            format!(
                "pack id `{}` must be lower-case letters, digits, dots and dashes",
                m.id
            ),
        ));
    }
    if let Some(problem) = format_problem(m.schema_version) {
        issues.push(error(Code::FormatVersion, "pack.json", problem));
    }
    check_aircraft(pack, issues);
    check_extends(pack, issues);
    if m.kind == PackKind::Aircraft {
        // A built child's lists may all come from its parent.
        if pack.checklists.is_empty() {
            issues.push(error(
                Code::NoChecklists,
                "pack.json",
                "an aircraft pack must list at least one checklist",
            ));
        }
        if pack.content.phases.is_none() {
            issues.push(error(
                Code::NoPhasesFile,
                "pack.json",
                "an aircraft pack must list a phases file",
            ));
        }
    }
    for tag in &m.basis_tags {
        if !valid_segment(tag) {
            issues.push(error(
                Code::BasisTagFormat,
                "pack.json",
                format!("basis tag `{tag}` must be lower-case letters, digits and dashes"),
            ));
        }
    }
}

/// An ICAO type designator: two to four capital letters and digits, starting with a letter.
fn valid_icao_type(t: &str) -> bool {
    (2..=4).contains(&t.len())
        && t.starts_with(|c: char| c.is_ascii_uppercase())
        && t.chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

/// An aircraft pack names its aircraft; a library has none (decision 0029).
fn check_aircraft(pack: &Pack, issues: &mut Vec<Issue>) {
    let m = &pack.manifest;
    match (m.kind, &m.aircraft) {
        (PackKind::Aircraft, None) => issues.push(error(Code::NoAircraftBlock,
            "pack.json",
            "an aircraft pack must have an `aircraft` block (family, name, icaoTypes, simulator, developer)",
        )),
        (PackKind::Library, Some(_)) => issues.push(error(Code::LibraryHasAircraft,
            "pack.json",
            "a library pack has no `aircraft` block: the packs that extend it name their aircraft",
        )),
        (PackKind::Aircraft, Some(a)) => {
            if a.icao_types.is_empty() {
                issues.push(error(Code::NoIcaoType,
                    "pack.json",
                    "`aircraft.icaoTypes` must list at least one ICAO type designator",
                ));
            }
            for t in a.icao_types.iter().filter(|t| !valid_icao_type(t)) {
                issues.push(error(Code::BadIcaoType,
                    "pack.json",
                    format!("`{t}` is not an ICAO type designator (two to four capital letters and digits, starting with a letter)"),
                ));
            }
            for (field, value) in [
                ("family", &a.family),
                ("name", &a.name),
                ("simulator", &a.simulator),
                ("developer", &a.developer),
            ] {
                if value.trim().is_empty() {
                    issues.push(error(Code::EmptyAircraftField,
                        "pack.json",
                        format!("`aircraft.{field}` must not be empty"),
                    ));
                }
            }
        }
        (PackKind::Library, None) => {}
    }
}

/// `extends` names at most one parent, by a valid id that is not the pack's own.
fn check_extends(pack: &Pack, issues: &mut Vec<Issue>) {
    let m = &pack.manifest;
    if m.extends.len() > 1 {
        issues.push(error(
            Code::ExtendsMany,
            "pack.json",
            format!(
                "`extends` names {} packs; a pack builds on one parent",
                m.extends.len()
            ),
        ));
    }
    for parent in m.extends.keys() {
        if !valid_id(parent) {
            issues.push(error(
                Code::ExtendsBadId,
                "pack.json",
                format!("`extends` names `{parent}`, which is not a valid pack id"),
            ));
        } else if parent == &m.id {
            issues.push(error(
                Code::ExtendsSelf,
                "pack.json",
                "a pack cannot extend itself",
            ));
        }
    }
}

/// Whether Windows reserves this file or folder name. Case and any extension do not matter.
fn is_windows_reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    WINDOWS_RESERVED_NAMES.contains(&stem.as_str())
        || matches!(
            stem.as_bytes(),
            [b'C', b'O', b'M', b'1'..=b'9'] | [b'L', b'P', b'T', b'1'..=b'9']
        )
}

fn check_windows_name(path: &str, issues: &mut Vec<Issue>) {
    if path.split(['/', '\\']).any(is_windows_reserved) {
        issues.push(error(
            Code::ReservedFileName,
            path,
            "this name is reserved on Windows, so the file cannot be checked out there",
        ));
    }
}

pub(super) fn check_files(pack: &Pack, issues: &mut Vec<Issue>) {
    for file in pack.manifest.data_files() {
        check_windows_name(file, issues);
    }
    for file in &pack.other_files {
        check_windows_name(&file.to_string_lossy(), issues);
        let ext = file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if BLOCKED_FILE_EXTENSIONS.contains(&ext.as_str()) {
            issues.push(error(Code::ImageOrPdf,
                file.to_string_lossy(),
                "packs must not contain images or PDFs; vendor artwork, screenshots and manuals never ship",
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{assert_flags, messages, pack, step};
    use super::*;

    #[test]
    fn windows_reserved_names_are_recognized() {
        for name in [
            "CON",
            "con",
            "Con.yaml",
            "prn.txt",
            "AUX",
            "nul.tar.gz",
            "com1",
            "COM9.yaml",
            "lpt1",
            "Lpt9.md",
        ] {
            assert!(is_windows_reserved(name), "{name}");
        }
        for name in [
            "console.yaml",
            "center-console.yaml",
            "com",
            "com0",
            "com10",
            "lpt0",
            "lpt.yaml",
            "auxiliary",
            "null",
            "my-con.yaml",
        ] {
            assert!(!is_windows_reserved(name), "{name}");
        }
    }

    #[test]
    fn rejects_windows_reserved_names_listed_in_the_manifest() {
        let mut p = pack(vec![], vec![]);
        p.manifest.panels = vec!["panels/con.yaml".into(), "panels/oh.yaml".into()];
        p.manifest.checklists = vec!["aux/preflight.yaml".into()];
        let joined = messages(&p);
        assert!(joined.contains("panels/con.yaml"), "{joined}");
        assert!(joined.contains("aux/preflight.yaml"), "{joined}");
        assert!(!joined.contains("panels/oh.yaml"), "{joined}");
    }

    #[test]
    fn rejects_windows_reserved_names_among_other_files() {
        let p = pack(vec![], vec!["NUL", "extra/LPT3.md", "notes.md"]);
        let joined = messages(&p);
        assert!(joined.contains("NUL"), "{joined}");
        assert!(joined.contains("LPT3"), "{joined}");
        assert!(!joined.contains("notes.md"), "{joined}");
    }

    #[test]
    fn content_rules_are_enforced() {
        let joined = messages(&pack(
            vec![step("a"), step("a")],
            vec!["cockpit.png", "manual.pdf", "notes.md"],
        ));
        assert!(joined.contains("used twice"), "{joined}");
        assert!(joined.contains("cockpit.png"), "{joined}");
        assert!(joined.contains("manual.pdf"), "{joined}");
        assert!(!joined.contains("notes.md"), "{joined}");
    }

    /// The issues a pack has beyond the demo pack's own (it has none).
    fn errors(p: &Pack) -> Vec<String> {
        crate::validate_pack(p)
            .iter()
            .filter(|i| i.severity == crate::Severity::Error)
            .map(ToString::to_string)
            .collect()
    }

    #[test]
    fn the_demo_pack_is_clean() {
        assert_eq!(errors(&pack(vec![step("a")], vec![])), Vec::<String>::new());
    }

    #[test]
    fn a_pack_newer_than_the_app_needs_a_newer_involo() {
        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.schema_version = crate::SCHEMA_VERSION + 1;
        assert_flags(&p, "Needs a newer Involo");
    }

    #[test]
    fn formats_4_and_5_are_no_longer_read() {
        for old in [4, 5] {
            let mut p = pack(vec![step("a")], vec![]);
            p.manifest.schema_version = old;
            let e = errors(&p);
            assert_eq!(e.len(), 1, "{e:?}");
            assert!(
                e[0].contains(&format!(
                    "Format {old} is no longer read; move the pack to format 6"
                )),
                "{e:?}"
            );
        }
    }

    #[test]
    fn an_aircraft_pack_names_its_aircraft() {
        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.aircraft = None;
        let e = errors(&p);
        assert_eq!(e.len(), 1, "{e:?}");
        assert!(e[0].contains("must have an `aircraft` block"), "{e:?}");
    }

    #[test]
    fn an_aircraft_block_lists_icao_types() {
        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.aircraft.as_mut().unwrap().icao_types.clear();
        let e = errors(&p);
        assert_eq!(e.len(), 1, "{e:?}");
        assert!(e[0].contains("at least one ICAO type designator"), "{e:?}");
        p.manifest.aircraft.as_mut().unwrap().icao_types =
            vec!["B38M".into(), "b738".into(), "7".into()];
        assert_eq!(errors(&p).len(), 2, "lower case and too short");
    }

    #[test]
    fn a_library_has_no_aircraft_block_and_skips_aircraft_checks() {
        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.kind = PackKind::Library;
        let e = errors(&p);
        assert_eq!(e.len(), 1, "{e:?}");
        assert!(
            e[0].contains("a library pack has no `aircraft` block"),
            "{e:?}"
        );
        p.manifest.aircraft = None;
        p.content.phases = None;
        assert_eq!(errors(&p), Vec::<String>::new());
    }

    #[test]
    fn extends_names_one_valid_parent_that_is_not_itself() {
        let range = || semver::VersionReq::parse(">=1.0, <2").unwrap();
        let mut p = pack(vec![step("a")], vec![]);
        p.manifest.extends.insert("lib.boeing-737".into(), range());
        assert_eq!(errors(&p), Vec::<String>::new(), "one parent is fine");
        p.manifest.extends.insert("lib.boeing-cdu".into(), range());
        let e = errors(&p);
        assert_eq!(e.len(), 1, "{e:?}");
        assert!(e[0].contains("a pack builds on one parent"), "{e:?}");
        for (bad, wanted) in [
            ("Lib Boeing", "not a valid pack id"),
            (super::super::test_support::PACK, "cannot extend itself"),
        ] {
            p.manifest.extends = std::collections::BTreeMap::from([(bad.to_string(), range())]);
            let e = errors(&p);
            assert_eq!(e.len(), 1, "{e:?}");
            assert!(e[0].contains(wanted), "{e:?}");
        }
    }

    #[test]
    fn an_aircraft_pack_needs_phases() {
        let mut p = pack(vec![step("a")], vec![]);
        p.content.phases = None;
        assert_flags(&p, "phases file");
    }
}
