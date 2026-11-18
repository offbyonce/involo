// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Packs: folders of data that describe an aircraft (or a shared library of content).
//!
//! Authors write pack content in YAML. This crate reads it strictly into the typed
//! model from `involo-checklist-core`, validates them, and writes plain JSON for the app.

pub mod load;
pub mod manifest;
pub mod patch;
pub mod resolve;
pub mod schema;
pub mod suggest;
pub mod terms;
pub mod validate;

pub use load::{LoadError, load_pack_dir, parse_checklist_yaml, parse_yaml};
pub use manifest::{AircraftInfo, PackKind, PackManifest, ResolvedParent};
pub use resolve::{ResolveError, Resolved, resolve};
pub use validate::{Issue, Severity, validate_pack};

/// The newest pack format this build of the app reads.
pub const SCHEMA_VERSION: u32 = 6;

/// The oldest pack format the app reads: format 6 is the first public one, and later formats only
/// add (decision 0029).
pub const MIN_SCHEMA_VERSION: u32 = 6;

/// Why a pack of format `version` can't be read, or `None` when it can.
pub fn format_problem(version: u32) -> Option<String> {
    if version < MIN_SCHEMA_VERSION {
        Some(format!(
            "Format {version} is no longer read; move the pack to format {MIN_SCHEMA_VERSION}"
        ))
    } else if version > SCHEMA_VERSION {
        Some(format!(
            "Needs a newer Involo: the pack uses format {version}, and this version reads up to {SCHEMA_VERSION}"
        ))
    } else {
        None
    }
}

/// Everything a pack holds besides its manifest and lists. Each part is optional.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
pub struct PackContent {
    pub phases: Option<involo_checklist_core::PhasesFile>,
    pub controls: Option<involo_checklist_core::ControlsFile>,
    pub notes: Option<involo_checklist_core::NotesFile>,
    pub panels: Vec<involo_checklist_core::Panel>,
    pub lights: Option<involo_checklist_core::LightsFile>,
    pub faults: Option<involo_checklist_core::FaultsFile>,
    pub glossary: Option<involo_checklist_core::GlossaryFile>,
    pub briefings: Option<involo_checklist_core::BriefingsFile>,
    pub panel_states: Option<involo_checklist_core::PanelStatesFile>,
    pub cdu: Option<involo_checklist_core::CduFile>,
    pub aliases: Option<involo_checklist_core::AliasesFile>,
    /// The pack's flight fields (decision 0029).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight: Option<involo_checklist_core::FlightFile>,
    /// The aircraft's alert messages (decision 0029).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub messages: Option<involo_checklist_core::MessagesFile>,
    /// The words the interface shows for this pack: its `labels.yaml` over the app's defaults,
    /// always complete (decision 0029).
    #[serde(default)]
    pub labels: involo_checklist_core::Labels,
}

/// A loaded pack: its manifest plus every checklist and other content it defines.
#[derive(Debug, Clone, PartialEq)]
pub struct Pack {
    pub manifest: PackManifest,
    pub checklists: Vec<involo_checklist_core::Checklist>,
    pub content: PackContent,
    /// `labels.yaml` as the pack wrote it, for `involo-pack check`; `content.labels` is the
    /// complete set.
    pub labels_file: Option<involo_checklist_core::LabelsFile>,
    /// Files in the pack folder that the manifest does not list (checked for images).
    pub other_files: Vec<std::path::PathBuf>,
}

/// A pack as the app receives it: everything in one JSON file, written by `involo-pack build` once the
/// pack has passed `involo-pack check`. Library packs and overrides will be resolved into it when they
/// exist, so the app never reads YAML or follows references between packs.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(deny_unknown_fields)]
pub struct FlatPack {
    pub manifest: PackManifest,
    pub lists: Vec<involo_checklist_core::Checklist>,
    pub content: PackContent,
}

impl From<Pack> for FlatPack {
    fn from(pack: Pack) -> Self {
        Self {
            manifest: pack.manifest,
            lists: pack.checklists,
            content: pack.content,
        }
    }
}

impl FlatPack {
    /// The pack as `involo-pack build` writes it: flattened, with its content hash recorded.
    pub fn built(pack: Pack) -> Self {
        let mut flat = Self::from(pack);
        flat.manifest.content_hash = Some(resolve::content_hash(&flat.lists, &flat.content));
        flat
    }
}

/// One built pack in `index.json`, which `involo-pack build` writes beside the packs so the app can
/// find them without naming any aircraft.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(deny_unknown_fields)]
pub struct PackSummary {
    pub id: String,
    pub name: String,
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub version: semver::Version,
    pub kind: PackKind,
    /// The aircraft an aircraft pack is for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aircraft: Option<AircraftInfo>,
}

impl From<&PackManifest> for PackSummary {
    fn from(m: &PackManifest) -> Self {
        Self {
            id: m.id.clone(),
            name: m.name.clone(),
            version: m.version.clone(),
            kind: m.kind,
            aircraft: m.aircraft.clone(),
        }
    }
}
