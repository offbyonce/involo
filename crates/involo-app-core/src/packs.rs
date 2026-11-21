// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Reading a flattened pack, the one JSON file per pack that `involo-pack build` writes, and
//! checking one before it is installed (decision 0028).

use involo_pack::{
    CatalogEntry, FlatPack, PackKind, PackSummary, Severity, format_problem, sha256_hex,
    validate_flat,
};
use semver::{Version, VersionReq};
use serde::Serialize;
use ts_rs::TS;

use crate::AppError;

/// The largest pack file the app reads; a larger file is refused before it is read. The limits on
/// what a pack holds are named in [`involo_pack::limits`].
pub use involo_pack::limits::MAX_PACK_FILE_BYTES;

/// What checking a pack file found: it may be installed, or it is refused with every reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(
    tag = "state",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[ts(export, rename_all_fields = "camelCase")]
pub enum PackCheck {
    /// The pack passed every check.
    Ready { summary: PackSummary },
    /// The pack can't be installed. Each reason is a plain sentence, or a check's finding as
    /// `involo-pack check` prints it (`where: what`).
    Refused { reasons: Vec<String> },
}

/// Read a flattened pack, with the names the app shows for its steps and controls. A format this
/// version doesn't read (older than 6, or newer than the app) is refused with the reason before
/// the rest is read, and so is a library pack, which is only built into the packs that extend it.
pub fn load_pack(json: &str) -> Result<FlatPack, AppError> {
    let mut flat = read_flat(json)
        .map(with_positional_locators)
        .map_err(AppError::PackInvalid)?;
    // Named here, once, for every screen (crate::names).
    flat.names = crate::names::pack_names(&flat);
    Ok(flat)
}

/// The pack in `json`, or why it can't be opened: its format, then the whole file, then its kind.
fn read_flat(json: &str) -> Result<FlatPack, String> {
    let format = serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| v.get("manifest")?.get("schemaVersion")?.as_u64());
    if let Some(problem) = format.and_then(|v| format_problem(u32::try_from(v).unwrap_or(u32::MAX)))
    {
        return Err(problem);
    }
    let flat: FlatPack =
        serde_json::from_str(json).map_err(|e| format!("the pack file could not be read: {e}"))?;
    // Before anything reads the lists and content (naming every step looks for each glossary
    // term in it).
    if let Some((at, what)) = involo_pack::limits::over_limits(&flat.lists, &flat.content)
        .into_iter()
        .next()
    {
        return Err(format!("{at}: {what}"));
    }
    if flat.manifest.kind == PackKind::Library {
        return Err(format!(
            "{} is a library pack: it can't be opened on its own, only built into the packs that extend it",
            flat.manifest.id
        ));
    }
    Ok(flat)
}

/// Check a pack file before it is installed (decision 0028): its size, the SHA-256 the catalog
/// gives for it (`sha256`, for a catalog download), its format and kind, the app versions it
/// works with, and every check `involo-pack check` makes of a pack (see
/// [`involo_pack::validate_flat`] for the two kinds checked when the pack is built).
pub fn check_pack(bytes: &[u8], sha256: Option<&str>) -> PackCheck {
    match checked(bytes, sha256) {
        Ok(flat) => PackCheck::Ready {
            summary: PackSummary::from(&flat.manifest),
        },
        Err(reasons) => PackCheck::Refused { reasons },
    }
}

fn checked(bytes: &[u8], sha256: Option<&str>) -> Result<FlatPack, Vec<String>> {
    let one = |reason: String| vec![reason];
    if bytes.len() as u64 > MAX_PACK_FILE_BYTES {
        return Err(one(format!(
            "The file is over {} MB, the most a pack file may be.",
            MAX_PACK_FILE_BYTES / (1024 * 1024)
        )));
    }
    if let Some(expected) = sha256
        && !sha256_hex(bytes).eq_ignore_ascii_case(expected.trim())
    {
        return Err(one(
            "The download is not the file the catalog lists (its SHA-256 differs), so nothing was installed."
                .to_owned(),
        ));
    }
    // Why the file can't be a pack at all, in words an author can act on.
    let not_a_pack = |why: String| one(format!("This is not an Involo pack file: {why}."));
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Err(not_a_pack("it is empty".to_owned()));
    }
    let json = std::str::from_utf8(bytes).map_err(|e| {
        not_a_pack(format!(
            "it isn't text (the byte at {} isn't UTF-8)",
            e.valid_up_to()
        ))
    })?;
    let value = serde_json::from_str::<serde_json::Value>(json).map_err(|e| {
        not_a_pack(if e.to_string().starts_with("recursion limit exceeded") {
            format!(
                "maps and lists nest too deeply at line {}, column {}; a pack file may nest them at most {} deep",
                e.line(),
                e.column(),
                involo_pack::limits::MAX_JSON_NESTING
            )
        } else {
            format!("it isn't valid JSON ({e})")
        })
    })?;
    if !value
        .get("manifest")
        .is_some_and(serde_json::Value::is_object)
    {
        return Err(not_a_pack("it has no `manifest`".to_owned()));
    }
    let flat = read_flat(json).map_err(one)?;
    if let Some(problem) = engine_problem(&flat.manifest.engine) {
        return Err(one(problem));
    }
    let errors: Vec<String> = validate_flat(&flat)
        .into_iter()
        .filter(|i| i.severity == Severity::Error)
        .map(|i| format!("{}: {}", i.at, i.message))
        .collect();
    if errors.is_empty() {
        Ok(flat)
    } else {
        Err(errors)
    }
}

/// Why a pack whose manifest gives `engine` can't run in this version of the app, or `None`.
fn engine_problem(engine: &VersionReq) -> Option<String> {
    // Cargo only builds a package whose version is semver, so this always parses.
    let Ok(app) = Version::parse(env!("CARGO_PKG_VERSION")) else {
        return None;
    };
    engine_problem_for(engine, &app)
}

fn engine_problem_for(engine: &VersionReq, app: &Version) -> Option<String> {
    if engine.matches(app) {
        return None;
    }
    // Newer when a later version would match: one each comparator names, or the next patch,
    // minor or major release after it or after this one.
    let named = engine
        .comparators
        .iter()
        .map(|c| Version::new(c.major, c.minor.unwrap_or(0), c.patch.unwrap_or(0)));
    let newer = std::iter::once(app.clone())
        .chain(named)
        .flat_map(|v| {
            [
                Version::new(v.major, v.minor, v.patch),
                Version::new(v.major, v.minor, v.patch + 1),
                Version::new(v.major, v.minor + 1, 0),
                Version::new(v.major + 1, 0, 0),
            ]
        })
        .any(|v| v > *app && engine.matches(&v));
    Some(if newer {
        format!("Needs a newer Involo: the pack works with Involo {engine}, and this is {app}.")
    } else {
        format!(
            "Made for an earlier Involo: the pack works with Involo {engine}, and this is {app}."
        )
    })
}

/// Read the catalog, `packs/index.json` (decision 0028).
pub fn parse_catalog(json: &str) -> Result<Vec<CatalogEntry>, AppError> {
    serde_json::from_str(json)
        .map_err(|e| AppError::PackInvalid(format!("the pack catalog could not be read: {e}")))
}

/// The pack with every item locator in one form, `panel/section/LABEL/n`, so the interface
/// compares locators as text: a step target or light note may name an item `panel/section/#id`
/// (decision 0029). A locator that names no item is left as it is (`involo-pack check` refuses it).
fn with_positional_locators(mut flat: FlatPack) -> FlatPack {
    let positional = |panels: &[involo_checklist_core::Panel], at: &str| -> Option<String> {
        if !at.contains("/#") {
            return None;
        }
        let (section, item) = involo_checklist_core::locate(panels, at)?;
        let panel = panels
            .iter()
            .find(|p| p.sections.iter().any(|s| std::ptr::eq(s, section)))?;
        Some(involo_checklist_core::locator(panel, section, item))
    };
    let panels = flat.content.panels.clone();
    for target in flat
        .lists
        .iter_mut()
        .flat_map(|l| &mut l.steps)
        .flat_map(|s| &mut s.targets)
    {
        if let Some(at) = positional(&panels, &target.at) {
            target.at = at;
        }
    }
    if let Some(lights) = &mut flat.content.lights {
        for note in &mut lights.lights {
            if let Some(at) = positional(&panels, &note.locator) {
                note.locator = at;
            }
        }
    }
    flat
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn example_json() -> String {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples/example-twin");
        serde_json::to_string(&FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap())).unwrap()
    }

    #[test]
    fn an_item_named_by_id_reaches_the_interface_by_position() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/ifly-737-max8");
        let mut pack = FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap());
        // A light note and a step target that name their item by id.
        let note = &pack.content.lights.as_ref().unwrap().lights[0];
        let positional = note.locator.clone();
        let (section, item) =
            involo_checklist_core::locate(&pack.content.panels, &positional).unwrap();
        let (panel, section) = (
            positional.split('/').next().unwrap().to_owned(),
            section.id.clone(),
        );
        let entry = pack
            .content
            .panels
            .iter_mut()
            .flat_map(|p| &mut p.sections)
            .find(|s| s.id == section)
            .unwrap();
        entry.items[item].id = Some("noted".into());
        let by_id = format!("{panel}/{section}/#noted");
        pack.content.lights.as_mut().unwrap().lights[0].locator = by_id.clone();
        pack.lists[0].steps[0].targets = vec![involo_checklist_core::StepTarget {
            at: by_id,
            set: None,
            light: None,
            open: true,
            when: None,
        }];
        let loaded = load_pack(&serde_json::to_string(&pack).unwrap()).unwrap();
        assert_eq!(loaded.content.lights.unwrap().lights[0].locator, positional);
        assert_eq!(loaded.lists[0].steps[0].targets[0].at, positional);
    }

    #[test]
    fn a_flattened_pack_loads() {
        let flat = load_pack(&example_json()).unwrap();
        assert_eq!(flat.manifest.id, "example-twin");
        assert_eq!(flat.lists.len(), 4);
    }

    fn with(edit: impl FnOnce(&mut serde_json::Value)) -> String {
        let mut json: serde_json::Value = serde_json::from_str(&example_json()).unwrap();
        edit(&mut json);
        json.to_string()
    }

    fn refused(json: &str) -> String {
        match load_pack(json) {
            Err(AppError::PackInvalid(message)) => message,
            other => panic!("not refused: {other:?}"),
        }
    }

    #[test]
    fn a_newer_or_broken_pack_is_refused() {
        let newer =
            with(|j| j["manifest"]["schemaVersion"] = (involo_pack::SCHEMA_VERSION + 1).into());
        assert!(
            refused(&newer).starts_with("Needs a newer Involo"),
            "{}",
            refused(&newer)
        );
        assert!(matches!(load_pack("{}"), Err(AppError::PackInvalid(_))));
    }

    #[test]
    fn formats_4_and_5_are_refused_naming_format_6() {
        for old in [4, 5] {
            // An old pack may not parse as format 6 at all; the format is read first.
            let json = with(|j| {
                j["manifest"]["schemaVersion"] = old.into();
                j["manifest"]["dependencies"] = serde_json::json!({});
            });
            assert_eq!(
                refused(&json),
                format!("Format {old} is no longer read; move the pack to format 6")
            );
        }
    }

    #[test]
    fn a_library_pack_is_not_opened_on_its_own() {
        let json = with(|j| {
            j["manifest"]["kind"] = "library".into();
            j["manifest"].as_object_mut().unwrap().remove("aircraft");
        });
        assert!(
            refused(&json).contains("library pack"),
            "{}",
            refused(&json)
        );
    }

    fn reasons(bytes: &[u8], sha256: Option<&str>) -> Vec<String> {
        match check_pack(bytes, sha256) {
            PackCheck::Refused { reasons } => reasons,
            PackCheck::Ready { summary } => panic!("not refused: {summary:?}"),
        }
    }

    #[test]
    fn a_built_pack_passes_with_its_summary() {
        let json = example_json();
        let PackCheck::Ready { summary } = check_pack(json.as_bytes(), None) else {
            panic!("refused: {:?}", check_pack(json.as_bytes(), None));
        };
        assert_eq!(summary.id, "example-twin");
        assert_eq!(summary.version.to_string(), "0.1.0");
        // The iFly pack, as the site builds it, passes too.
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/ifly-737-max8");
        let pack = involo_pack::load_pack_dir(&dir).unwrap();
        let ifly = serde_json::to_string(&FlatPack::built(pack)).unwrap();
        assert!(matches!(
            check_pack(ifly.as_bytes(), None),
            PackCheck::Ready { .. }
        ));
    }

    #[test]
    fn a_download_must_match_the_catalog_s_sha256() {
        let json = example_json();
        let hash = sha256_hex(json.as_bytes());
        assert!(matches!(
            check_pack(json.as_bytes(), Some(&hash)),
            PackCheck::Ready { .. }
        ));
        let upper = hash.to_ascii_uppercase();
        assert!(matches!(
            check_pack(json.as_bytes(), Some(&upper)),
            PackCheck::Ready { .. }
        ));
        // One changed letter: still a valid pack, but not the catalog's file.
        let tampered = json.replacen("Example Twin", "Example trainex", 1);
        assert!(matches!(
            check_pack(tampered.as_bytes(), None),
            PackCheck::Ready { .. }
        ));
        assert_eq!(
            reasons(tampered.as_bytes(), Some(&hash)),
            [
                "The download is not the file the catalog lists (its SHA-256 differs), so nothing was installed."
            ]
        );
    }

    #[test]
    fn an_oversized_file_is_refused_before_it_is_read() {
        // Not even a pack: the size is checked first.
        let big = vec![b' '; usize::try_from(MAX_PACK_FILE_BYTES).unwrap() + 1];
        assert_eq!(
            reasons(&big, None),
            ["The file is over 16 MB, the most a pack file may be."]
        );
    }

    #[test]
    fn a_cut_off_or_deeply_nested_pack_file_is_refused_saying_why() {
        let json = example_json();
        let cut = &json[..json.len() / 2];
        let said = reasons(cut.as_bytes(), None);
        assert_eq!(said.len(), 1);
        assert!(
            said[0].starts_with(
                "This is not an Involo pack file: it isn't valid JSON (EOF while parsing"
            ),
            "{said:?}"
        );
        let deep = format!(
            "{{\"manifest\": {{}}, \"lists\": {}{}}}",
            "[".repeat(200),
            "]".repeat(200)
        );
        assert_eq!(
            reasons(deep.as_bytes(), None),
            [
                "This is not an Involo pack file: maps and lists nest too deeply at line 1, column 153; a pack file may nest them at most 128 deep."
            ]
        );
    }

    #[test]
    fn a_pack_over_an_item_limit_is_refused_by_the_check_and_when_opened() {
        use involo_pack::limits::{MAX_GLOSSARY_TERMS, MAX_STEPS};
        let many_steps = with(|j| {
            let step = j["lists"][0]["steps"][0].clone();
            let steps = j["lists"][0]["steps"].as_array_mut().unwrap();
            for n in 0..MAX_STEPS {
                let mut s = step.clone();
                s["id"] = format!("example-twin.many.step-{n}").into();
                steps.push(s);
            }
        });
        let said = reasons(many_steps.as_bytes(), None);
        assert_eq!(said.len(), 1, "{said:?}");
        assert!(said[0].starts_with("lists: the pack has "), "{said:?}");
        assert!(said[0].ends_with(&format!("steps; the most a pack may have is {MAX_STEPS}")));
        assert_eq!(refused(&many_steps), said[0]);

        let many_terms = with(|j| {
            let terms = j["content"]["glossary"]["terms"].as_array_mut().unwrap();
            for n in 0..=MAX_GLOSSARY_TERMS {
                terms.push(serde_json::json!({ "term": format!("TERM{n}"), "meaning": "A term." }));
            }
        });
        let said = reasons(many_terms.as_bytes(), None);
        assert!(
            said[0].starts_with("glossary: the glossary has "),
            "{said:?}"
        );
        assert_eq!(refused(&many_terms), said[0]);
    }

    #[test]
    fn a_file_that_is_not_a_pack_says_so() {
        let not = |why: &str| vec![format!("This is not an Involo pack file: {why}.")];
        for (bytes, why) in [
            (&b""[..], "it is empty".to_owned()),
            (b" \n\t", "it is empty".to_owned()),
            (
                b"\xff\xfe{}",
                "it isn't text (the byte at 0 isn't UTF-8)".to_owned(),
            ),
            (
                b"{\"manifest\": \xc3}",
                "it isn't text (the byte at 13 isn't UTF-8)".to_owned(),
            ),
            (
                b"hello",
                "it isn't valid JSON (expected value at line 1 column 1)".to_owned(),
            ),
            (
                b"{\"manifest\": {\"id\": \"a\"",
                "it isn't valid JSON (EOF while parsing an object at line 1 column 23)".to_owned(),
            ),
            (b"{}", "it has no `manifest`".to_owned()),
            (b"[1, 2]", "it has no `manifest`".to_owned()),
            (b"{\"manifest\": 3}", "it has no `manifest`".to_owned()),
        ] {
            assert_eq!(reasons(bytes, None), not(&why), "{bytes:?}");
        }
        // A pack file that breaks the format names where.
        let broken = with(|j| j["lists"] = 3.into());
        let found = reasons(broken.as_bytes(), None);
        assert!(
            found[0].starts_with("the pack file could not be read"),
            "{found:?}"
        );
    }

    #[test]
    fn a_newer_format_a_library_and_another_app_version_are_refused_plainly() {
        let newer =
            with(|j| j["manifest"]["schemaVersion"] = (involo_pack::SCHEMA_VERSION + 1).into());
        assert!(reasons(newer.as_bytes(), None)[0].starts_with("Needs a newer Involo"));
        let library = with(|j| {
            j["manifest"]["kind"] = "library".into();
            j["manifest"].as_object_mut().unwrap().remove("aircraft");
        });
        assert!(reasons(library.as_bytes(), None)[0].contains("library pack"));
        let later = with(|j| j["manifest"]["engine"] = ">=99.0.0".into());
        assert_eq!(
            reasons(later.as_bytes(), None),
            [format!(
                "Needs a newer Involo: the pack works with Involo >=99.0.0, and this is {}.",
                env!("CARGO_PKG_VERSION")
            )]
        );
        let earlier = with(|j| j["manifest"]["engine"] = "<0.0.1".into());
        assert!(reasons(earlier.as_bytes(), None)[0].starts_with("Made for an earlier Involo"));
    }

    #[test]
    fn an_app_version_outside_the_range_is_newer_or_earlier() {
        let problem = |req: &str, app: &str| {
            engine_problem_for(
                &VersionReq::parse(req).unwrap(),
                &Version::parse(app).unwrap(),
            )
            .map(|p| p.split(':').next().unwrap().to_owned())
        };
        assert_eq!(problem(">=0.1.0, <1.0.0", "0.1.0"), None);
        for (req, app) in [
            (">0.1", "0.1.0"),
            ("=0.2.0", "0.1.0"),
            ("^1", "0.9.0"),
            (">=0.1.1", "0.1.0"),
        ] {
            assert_eq!(
                problem(req, app).as_deref(),
                Some("Needs a newer Involo"),
                "{req} {app}"
            );
        }
        for (req, app) in [
            (">=0.1.0, <1.0.0", "1.2.0"),
            ("~0.1", "0.2.0"),
            ("<0.0.1", "0.1.0"),
        ] {
            assert_eq!(
                problem(req, app).as_deref(),
                Some("Made for an earlier Involo"),
                "{req} {app}"
            );
        }
    }

    #[test]
    fn a_pack_that_fails_its_checks_is_refused_with_each_finding() {
        let json = with(|j| {
            j["manifest"]["aircraft"]["icaoTypes"] = serde_json::json!(["zz"]);
            j["manifest"]["basisTags"][0] = "Bad Tag".into();
        });
        let found = reasons(json.as_bytes(), None);
        assert!(
            found.contains(&"pack.json: `zz` is not an ICAO type designator (two to four capital letters and digits, starting with a letter)".to_owned()),
            "{found:?}"
        );
        assert!(
            found.iter().any(|r| r.contains("basis tag `Bad Tag`")),
            "{found:?}"
        );
    }

    #[test]
    fn the_catalog_reads_each_entry_and_ignores_fields_it_doesn_t_know() {
        let entry = serde_json::json!({
            "id": "example-twin", "name": "Example Twin", "version": "0.1.0",
            "aircraft": {"family": "Example Twin", "name": "Example Twin",
                "icaoTypes": ["ZZZZ"], "simulator": "None", "developer": "Involo examples"},
            "engine": ">=0.1.0, <1.0.0", "size": 1234, "sha256": "ab", "later": true
        });
        let catalog = parse_catalog(&serde_json::json!([entry]).to_string()).unwrap();
        assert_eq!(catalog[0].id, "example-twin");
        assert_eq!(catalog[0].size, 1234);
        let mut no_hash = entry.clone();
        no_hash.as_object_mut().unwrap().remove("sha256");
        assert!(parse_catalog(&serde_json::json!([no_hash]).to_string()).is_err());
    }
}
