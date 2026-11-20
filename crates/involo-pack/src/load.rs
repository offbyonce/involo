// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Reading packs from disk, or from memory (tests and fuzzing). YAML is parsed strictly: unknown
//! fields, duplicate keys and YAML 1.1 "yes/no" booleans are all rejected, with line and column in
//! the error. Whatever a file holds, reading it ends with the pack or an error: files over
//! [`MAX_DATA_FILE_BYTES`], YAML nested or repeated past the limits in [`crate::limits`], text that
//! is not UTF-8 and paths that leave the pack folder are all refused with a message.

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

use involo_checklist_core::Checklist;

use serde::de::DeserializeOwned;

use crate::limits::{MAX_DATA_FILE_BYTES, file_too_large};
use crate::manifest::PackManifest;
use crate::{Pack, PackContent};

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("cannot read {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("{path}: {message}")]
    Yaml { path: PathBuf, message: String },
    #[error("{path}: {source}")]
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
    /// A pack format this version doesn't read, found before reading the rest (an older format
    /// may not parse as the current one).
    #[error("{path}: {message}")]
    Format { path: PathBuf, message: String },
    /// A file the pack can't use as it is: too large, not UTF-8, or named by a path that leaves
    /// the pack folder.
    #[error("{path}: {message}")]
    File { path: PathBuf, message: String },
}

fn options() -> serde_saphyr::Options {
    // Options is non-exhaustive, so set fields on a default rather than building a literal.
    // Duplicate keys are already an error by default.
    let mut options = serde_saphyr::Options::default();
    options.strict_booleans = true;
    options.budget = Some(crate::limits::yaml_budget());
    options
}

/// Parse one pack data file from YAML text. `origin` is only used in error messages.
pub fn parse_yaml<T: DeserializeOwned>(text: &str, origin: &Path) -> Result<T, LoadError> {
    if let Some(message) = file_too_large("the file", text.len() as u64, MAX_DATA_FILE_BYTES) {
        return Err(LoadError::File {
            path: origin.to_path_buf(),
            message,
        });
    }
    serde_saphyr::from_str_with_options(text, options()).map_err(|e| LoadError::Yaml {
        path: origin.to_path_buf(),
        message: plain_yaml_error(&e),
    })
}

/// The YAML reader's message, with a limit it ran into said in words an author can act on. The
/// reader writes a budget it ran into as `budget breached: Kind { … }` (whatever wraps the error,
/// a snippet of the file included), and its recursion limit as `recursion limit exceeded`.
fn plain_yaml_error(e: &serde_saphyr::Error) -> String {
    use crate::limits::{MAX_YAML_ALIASES, MAX_YAML_NESTING, MAX_YAML_NODES};
    const BREACH: &str = "budget breached: ";
    let message = e.to_string();
    let nested = format!(
        "maps and lists nest too deeply; a pack file may nest them at most {MAX_YAML_NESTING} deep"
    );
    let Some(start) = message.find(BREACH) else {
        return message.replace("recursion limit exceeded", &nested);
    };
    let rest = &message[start + BREACH.len()..];
    let kind: String = rest
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    // The breach runs to its closing brace, or is the bare name.
    let len = if rest[kind.len()..].trim_start().starts_with('{') {
        rest.find('}').map_or(rest.len(), |i| i + 1)
    } else {
        kind.len()
    };
    let plain = match kind.as_str() {
        "Depth" => nested,
        "Nodes" => format!(
            "the file has more than {MAX_YAML_NODES} values (maps, lists and the values in them), the most one pack file may have"
        ),
        "Aliases" => format!(
            "the file uses more than {MAX_YAML_ALIASES} aliases (`*name`), the most one pack file may use"
        ),
        _ => {
            format!("the file repeats itself or nests too much to read (the reader's {kind} limit)")
        }
    };
    format!(
        "{}{plain}{}",
        &message[..start],
        &message[start + BREACH.len() + len..]
    )
}

/// Parse one checklist from YAML text. `origin` is only used in error messages.
pub fn parse_checklist_yaml(text: &str, origin: &Path) -> Result<Checklist, LoadError> {
    parse_yaml(text, origin)
}

/// Where a pack's files come from: a folder on disk ([`Folder`]) or memory ([`InMemory`]).
pub trait PackFiles {
    /// The path error messages give for the file at `rel`.
    fn path(&self, rel: &str) -> PathBuf;
    /// The bytes of the file at `rel`, a path relative to the pack, or `None` when there is no
    /// such file. A file over `limit` bytes is refused before it is read.
    fn bytes(&self, rel: &str, limit: u64) -> Result<Option<Vec<u8>>, LoadError>;
    /// Every file in the pack, relative to it.
    fn list(&self) -> Result<Vec<PathBuf>, LoadError>;
    /// The pack's id as its `pack.json` gives it, or `None` (looking for a parent by id).
    fn id(&self) -> Option<String> {
        let bytes = self.bytes("pack.json", MAX_DATA_FILE_BYTES).ok()??;
        let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
        v.get("id")?.as_str().map(str::to_owned)
    }
}

/// A pack folder on disk.
#[derive(Debug, Clone)]
pub struct Folder(pub PathBuf);

impl PackFiles for Folder {
    fn path(&self, rel: &str) -> PathBuf {
        self.0.join(rel)
    }

    fn bytes(&self, rel: &str, limit: u64) -> Result<Option<Vec<u8>>, LoadError> {
        let path = self.path(rel);
        let io = |source| LoadError::Io {
            path: path.clone(),
            source,
        };
        let meta = match std::fs::metadata(&path) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io(e)),
        };
        if let Some(message) = file_too_large("the file", meta.len(), limit) {
            return Err(LoadError::File { path, message });
        }
        std::fs::read(&path).map(Some).map_err(io)
    }

    fn list(&self) -> Result<Vec<PathBuf>, LoadError> {
        let mut out = Vec::new();
        collect_files(&self.0, &self.0, &mut out)?;
        Ok(out)
    }
}

/// A pack held in memory: each file's path relative to the pack, and its bytes. `name` stands for
/// the folder in error messages.
#[derive(Debug, Clone, Default)]
pub struct InMemory {
    pub name: PathBuf,
    pub files: BTreeMap<String, Vec<u8>>,
}

impl PackFiles for InMemory {
    fn path(&self, rel: &str) -> PathBuf {
        self.name.join(rel)
    }

    fn bytes(&self, rel: &str, limit: u64) -> Result<Option<Vec<u8>>, LoadError> {
        let Some(bytes) = self.files.get(rel) else {
            return Ok(None);
        };
        if let Some(message) = file_too_large("the file", bytes.len() as u64, limit) {
            return Err(LoadError::File {
                path: self.path(rel),
                message,
            });
        }
        Ok(Some(bytes.clone()))
    }

    fn list(&self) -> Result<Vec<PathBuf>, LoadError> {
        Ok(self.files.keys().map(PathBuf::from).collect())
    }
}

/// Why `rel`, a path a pack's manifest gives for one of its files, can't be used, or `None`: it
/// must name a file inside the pack folder.
fn unsafe_path(rel: &str) -> Option<&'static str> {
    let path = Path::new(rel);
    if rel.is_empty() {
        Some("the path is empty")
    } else if path.is_absolute()
        || rel.starts_with(['/', '\\'])
        // A drive (`C:\…`, `C:…`): absolute on Windows, and refused alike everywhere so a pack
        // checked on one system reads the same on another.
        || rel.as_bytes().get(1) == Some(&b':')
    {
        Some("the path must be relative to the pack folder")
    } else if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
        || rel.split(['/', '\\']).any(|part| part == "..")
    {
        Some("the path must stay inside the pack folder (no `..`)")
    } else {
        None
    }
}

/// The text of the file at `rel` in `files`.
pub(crate) fn read_text(files: &impl PackFiles, rel: &str) -> Result<String, LoadError> {
    let path = files.path(rel);
    let file_error = |message: String| LoadError::File {
        path: path.clone(),
        message,
    };
    if let Some(problem) = unsafe_path(rel) {
        return Err(file_error(problem.to_owned()));
    }
    let bytes = files
        .bytes(rel, MAX_DATA_FILE_BYTES)?
        .ok_or_else(|| LoadError::Io {
            path: path.clone(),
            source: std::io::Error::from(std::io::ErrorKind::NotFound),
        })?;
    String::from_utf8(bytes).map_err(|e| {
        file_error(format!(
            "the file is not UTF-8 text (an invalid byte at {})",
            e.utf8_error().valid_up_to()
        ))
    })
}

fn load_file<T: DeserializeOwned>(files: &impl PackFiles, rel: &str) -> Result<T, LoadError> {
    parse_yaml(&read_text(files, rel)?, &files.path(rel))
}

fn load_optional<T: DeserializeOwned>(
    files: &impl PackFiles,
    rel: Option<&String>,
) -> Result<Option<T>, LoadError> {
    rel.map(|r| load_file(files, r)).transpose()
}

/// Load `pack.json` and every file it lists from a pack folder.
pub fn load_pack_dir(dir: &Path) -> Result<Pack, LoadError> {
    load_pack_files(&Folder(dir.to_path_buf()))
}

/// Load `pack.json` and every file it lists from `files`.
pub fn load_pack_files(files: &impl PackFiles) -> Result<Pack, LoadError> {
    let manifest_path = files.path("pack.json");
    let text = read_text(files, "pack.json")?;
    if let Some(message) = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("schemaVersion")?.as_u64())
        .and_then(|v| crate::format_problem(u32::try_from(v).unwrap_or(u32::MAX)))
    {
        return Err(LoadError::Format {
            path: manifest_path,
            message,
        });
    }
    let manifest: PackManifest = serde_json::from_str(&text).map_err(|source| LoadError::Json {
        path: manifest_path.clone(),
        source,
    })?;

    let checklists = manifest
        .checklists
        .iter()
        .map(|rel| load_file(files, rel))
        .collect::<Result<Vec<Checklist>, _>>()?;
    let content = PackContent {
        phases: load_optional(files, manifest.phases.as_ref())?,
        controls: load_optional(files, manifest.controls.as_ref())?,
        notes: load_optional(files, manifest.notes.as_ref())?,
        panels: manifest
            .panels
            .iter()
            .map(|rel| load_file(files, rel))
            .collect::<Result<_, _>>()?,
        lights: load_optional(files, manifest.lights.as_ref())?,
        faults: load_optional(files, manifest.faults.as_ref())?,
        glossary: load_optional(files, manifest.glossary.as_ref())?,
        briefings: load_optional(files, manifest.briefings.as_ref())?,
        panel_states: load_optional(files, manifest.panel_states.as_ref())?,
        cdu: load_optional(files, manifest.cdu.as_ref())?,
        aliases: load_optional(files, manifest.aliases.as_ref())?,
        flight: load_optional(files, manifest.flight.as_ref())?,
        messages: load_optional(files, manifest.messages.as_ref())?,
        labels: involo_checklist_core::Labels::default(),
    };
    let labels_file: Option<involo_checklist_core::LabelsFile> =
        load_optional(files, manifest.labels.as_ref())?;
    let mut content = content;
    content.labels =
        involo_checklist_core::Labels::complete(labels_file.as_ref(), &manifest.basis_tags);

    let mut other_files = files.list()?;
    let listed = manifest.data_files();
    other_files
        .retain(|p| p != Path::new("pack.json") && !listed.iter().any(|c| Path::new(c) == p));
    other_files.sort();

    Ok(Pack {
        manifest,
        checklists,
        content,
        labels_file,
        other_files,
    })
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), LoadError> {
    let entries = std::fs::read_dir(dir).map_err(|source| LoadError::Io {
        path: dir.to_path_buf(),
        source,
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| LoadError::Io {
            path: dir.to_path_buf(),
            source,
        })?;
        let path = entry.path();
        // The entry's own type: a link to a folder is listed as a file, never followed, so a link
        // back up the tree can't loop.
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if is_dir {
            collect_files(root, &path, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_path_buf());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(yaml: &str) -> Result<Checklist, String> {
        parse_checklist_yaml(yaml, Path::new("test.yaml")).map_err(|e| e.to_string())
    }

    const VALID: &str = "\
id: preflight
title: Preflight
kind: checklist
basis: [sim-observed]
steps:
  - id: demo.preflight.irs
    text: IRS mode selectors
    expect: NAV
    confirmed_by:
      - kind: vendor-docs
        date: 2026-11-09
    sim_simplified: true
  - id: demo.preflight.yaw-damper
    text: Yaw damper
    expect: NO
";

    #[test]
    fn valid_yaml_parses_and_keeps_text_values() {
        let list = parse(VALID).unwrap();
        assert_eq!(list.steps.len(), 2);
        // `NO` must stay text: a switch position, not a boolean.
        assert_eq!(list.steps[1].expect, "NO");
        // An unquoted date stays text too.
        let record = &list.steps[0].confirmed_by[0];
        assert_eq!(
            record.kind,
            involo_checklist_core::ConfirmationKind::VendorDocs
        );
        assert_eq!(record.date, "2026-11-09");
    }

    #[test]
    fn misspelled_field_is_rejected_with_location() {
        let err = parse("id: p\ntitle: P\nsteps:\n  - id: a\n    text: T\n    expcet: NAV\n")
            .unwrap_err();
        assert!(err.contains("unknown field `expcet`"), "{err}");
        assert!(err.contains("line 6"), "{err}");
    }

    #[test]
    fn a_legend_names_a_light_role_the_app_knows() {
        let panel = |light: &str| {
            format!(
                "id: p\ntitle: P\nwidth: 100\nheight: 60\nsections:\n  - id: s\n    title: S\n    x: 0\n    y: 0\n    width: 100\n    height: 60\n    items:\n      - kind: legend_pushbutton\n        label: PUMP 1\n        x: 50\n        y: 30\n        positions: [ON, OFF]\n        legends:\n          - text: FAULT\n            light: {light}\n        description: A pump.\n"
            )
        };
        let read = |light: &str| {
            super::parse_yaml::<involo_checklist_core::Panel>(&panel(light), Path::new("p.yaml"))
        };
        assert!(read("amber").is_ok());
        let err = read("purple").unwrap_err().to_string();
        assert!(err.contains("purple"), "{err}");
        assert!(err.contains("line 20"), "{err}");
    }

    #[test]
    fn a_message_names_a_level_the_app_knows() {
        let file = |level: &str| {
            format!(
                "messages:\n  - id: fire\n    text: ENGINE FIRE\n    level: {level}\n    meaning: Fire.\n"
            )
        };
        let read = |level: &str| {
            super::parse_yaml::<involo_checklist_core::MessagesFile>(
                &file(level),
                Path::new("messages.yaml"),
            )
        };
        assert!(read("warning").is_ok());
        let err = read("danger").unwrap_err().to_string();
        assert!(err.contains("danger") && err.contains("line 4"), "{err}");
    }

    #[test]
    fn duplicate_key_is_rejected() {
        let err = parse("id: p\ntitle: P\ntitle: Q\nsteps: []\n").unwrap_err();
        assert!(err.contains("duplicate"), "{err}");
    }

    fn with_step_field(field: &str) -> String {
        format!(
            "id: p\ntitle: P\nkind: flow\nbasis: [a]\nsteps:\n  - id: a\n    text: T\n    expect: E\n    {field}\n"
        )
    }

    #[test]
    fn simulator_model_is_read_separately_from_sim_simplified() {
        let list = parse(&with_step_field("simulator_model: true")).unwrap();
        assert!(list.steps[0].simulator_model);
        assert!(!list.steps[0].sim_simplified);
    }

    #[test]
    fn list_needs_a_kind_and_a_basis() {
        let err = parse("id: p\ntitle: P\nbasis: [a]\nsteps: []\n").unwrap_err();
        assert!(err.contains("kind"), "{err}");
        let err = parse("id: p\ntitle: P\nkind: flow\nsteps: []\n").unwrap_err();
        assert!(err.contains("basis"), "{err}");
    }

    #[test]
    fn per_step_sources_are_gone() {
        assert!(parse(&with_step_field("sources: []")).is_err());
    }

    #[test]
    fn show_if_accepts_each_form_of_the_grammar() {
        for field in [
            "show_if: {option: power, equals: gpu}",
            "show_if: {option: approach, one_of: [ils, rnav]}",
            "show_if: {all_of: [{option: power, equals: gpu}, {option: approach, one_of: [ils]}]}",
            "show_if: {any_of: [{option: power, equals: gpu}]}",
        ] {
            let list = parse(&with_step_field(field)).unwrap_or_else(|e| panic!("{field}: {e}"));
            assert!(list.steps[0].show_if.is_some(), "{field}");
        }
    }

    #[test]
    fn show_if_rejects_anything_outside_the_grammar() {
        for field in [
            "show_if: {option: power, not_equals: gpu}",
            "show_if: {not: {option: power, equals: gpu}}",
            "show_if: {option: power, equals: gpu, one_of: [gpu]}",
            "show_if: {all_of: [{any_of: [{option: power, equals: gpu}]}]}",
            "show_if: power == gpu",
        ] {
            assert!(parse(&with_step_field(field)).is_err(), "{field}");
        }
    }

    #[test]
    fn fill_names_any_field_and_check_holds_it_to_the_pack() {
        // Any name reads; `involo-pack check` holds it to the pack's flight.yaml (decision 0029).
        let list = parse(&with_step_field("fill: [zfw, flex_temperature, manual]")).unwrap();
        assert_eq!(list.steps[0].fill[1].as_str(), "flex_temperature");
    }

    #[test]
    fn cdu_text_mixes_styles_and_groups_do_not_nest() {
        use involo_checklist_core::{CduFile, CduPart};
        let doc = |action: &str| {
            format!(
                "walkthroughs:\n  - id: w\n    title: W\n    pages:\n      - page: P\n        title: T\n        action: {action}\n        check: []\n        screen: {{title: [], page: [], rows: []}}\n"
            )
        };
        let good = doc(
            "[{when_known: [runway], show: ['<SEL> ', {field: runway, style: user}], otherwise: [{text: '(none)', style: data}]}]",
        );
        let file: CduFile = parse_yaml(&good, Path::new("c.yaml")).unwrap();
        let part = &file.walkthroughs[0].pages[0].action[0];
        assert!(matches!(part, CduPart::When(w) if w.show.len() == 2));

        let route = doc(
            "[{field: route_leg, index: 30, part: via}, {route_legs: overflow, per_page: 5, empty: none}]",
        );
        let file: CduFile = parse_yaml(&route, Path::new("c.yaml")).unwrap();
        assert!(matches!(
            file.walkthroughs[0].pages[0].action[1],
            CduPart::RouteCount(_)
        ));

        let nested = doc("[{when_known: [runway], show: [{when_known: [sid], show: [x]}]}]");
        assert!(parse_yaml::<CduFile>(&nested, Path::new("c.yaml")).is_err());
    }

    #[test]
    fn an_older_or_newer_format_is_refused_before_the_rest_is_read() {
        for (version, wanted) in [
            (4, "Format 4 is no longer read; move the pack to format 6"),
            (5, "Format 5 is no longer read; move the pack to format 6"),
            (crate::SCHEMA_VERSION + 1, "Needs a newer Involo"),
        ] {
            let dir = std::env::temp_dir().join(format!(
                "involo-pack-format-{version}-{}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            // Format 5's `dependencies` and no checklists: it is never read that far.
            std::fs::write(
                dir.join("pack.json"),
                format!(r#"{{"id": "old", "schemaVersion": {version}, "dependencies": {{}}}}"#),
            )
            .unwrap();
            let error = load_pack_dir(&dir).unwrap_err();
            std::fs::remove_dir_all(&dir).unwrap();
            assert!(matches!(error, LoadError::Format { .. }), "{error}");
            assert!(error.to_string().contains(wanted), "{error}");
        }
    }

    #[test]
    fn the_ifly_pack_s_one_seat_frame_is_the_frame_for_every_step() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/ifly-737-max8");
        let pack = load_pack_dir(&dir).unwrap();
        let views = pack
            .content
            .controls
            .as_ref()
            .and_then(|c| c.overview.as_ref())
            .and_then(|o| o.views.as_ref())
            .unwrap();
        let Some(involo_checklist_core::SeatViews::One(frame)) = &views.seat else {
            panic!("the iFly pack has one seat frame");
        };
        let labels = &pack.content.labels;
        assert_eq!(views.seat_frame(labels, None, None), Some(frame));
        assert_eq!(
            views.seat_frame(labels, Some("pf"), Some("right")),
            Some(frame)
        );
    }

    #[test]
    fn words_a_labels_file_leaves_out_are_the_app_s() {
        // The example pack's labels file names only its seats, crew roles and seat view title.
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let pack = load_pack_dir(&dir).unwrap();
        assert!(pack.manifest.labels.is_some());
        let labels = &pack.content.labels;
        assert_eq!(labels.seats.len(), 2);
        assert_eq!(labels.roles.len(), 4);
        let mut app = involo_checklist_core::Labels::complete(None, &pack.manifest.basis_tags);
        app.seats.clone_from(&labels.seats);
        app.roles.clone_from(&labels.roles);
        app.seat_view_title.clone_from(&labels.seat_view_title);
        assert_eq!(labels, &app);
        assert_eq!(labels.reference.title, "Emergency");
    }

    #[test]
    fn example_pack_uses_every_content_file_and_passes() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let pack = load_pack_dir(&dir).unwrap();
        let c = &pack.content;
        assert!(
            c.phases.is_some()
                && c.controls.is_some()
                && c.notes.is_some()
                && !c.panels.is_empty()
                && c.lights.is_some()
                && c.faults.is_some()
                && c.glossary.is_some()
                && c.briefings.is_some()
                && c.panel_states.is_some()
                && c.cdu.is_some()
                && c.aliases.is_some()
        );
        assert_eq!(pack.other_files, Vec::<PathBuf>::new());
        assert_eq!(crate::validate_pack(&pack), Vec::new());
    }

    proptest::proptest! {
        /// The parser returns an error, never a panic, on arbitrary input.
        #[test]
        fn never_panics(input in ".{0,400}") {
            let _ = parse(&input);
        }
    }

    /// A link inside a pack folder to a folder above it is listed, never followed. Before, the
    /// walk followed it until the system refused the path (about 40 times round), listing the
    /// pack's files dozens of times over; two such links made that exponential.
    #[cfg(unix)]
    #[test]
    fn a_link_back_up_the_pack_folder_does_not_loop() {
        let place = std::env::temp_dir().join(format!("involo-link-loop-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&place);
        let dir = place.join("example-trainer");
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        std::fs::create_dir_all(dir.join("panels")).unwrap();
        for entry in std::fs::read_dir(&source)
            .unwrap()
            .chain(std::fs::read_dir(source.join("panels")).unwrap())
        {
            let path = entry.unwrap().path();
            if path.is_file() {
                let rel = path.strip_prefix(&source).unwrap();
                std::fs::copy(&path, dir.join(rel)).unwrap();
            }
        }
        std::os::unix::fs::symlink(&dir, dir.join("panels/loop")).unwrap();
        let pack = load_pack_dir(&dir).unwrap();
        assert_eq!(pack.other_files, vec![PathBuf::from("panels/loop")]);
        std::fs::remove_dir_all(&place).unwrap();
    }
}
