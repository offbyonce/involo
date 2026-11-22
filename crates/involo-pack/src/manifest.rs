// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `pack.json`: who a pack is, what it needs, and under what terms it ships.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};

/// What a pack is: an aircraft a pilot opens, or a library other packs extend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum PackKind {
    /// A flyable aircraft (e.g. `ifly-737-max8`).
    Aircraft,
    /// Shared content other packs extend (e.g. `lib.boeing-737`). It cannot be installed or
    /// opened on its own, and has no `aircraft` block.
    Library,
}

/// The aircraft an aircraft pack is for (decision 0029). Required for `kind: aircraft`; a
/// library has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AircraftInfo {
    /// The aircraft family, e.g. `Boeing 737`.
    pub family: String,
    /// The aircraft as pilots name it, e.g. `737 MAX 8`.
    pub name: String,
    /// The ICAO type designators the pack covers, e.g. `["B38M"]`: two to four capital letters
    /// and digits, starting with a letter. At least one.
    pub icao_types: Vec<String>,
    /// The simulator the pack is written for.
    pub simulator: String,
    /// Who made the simulator aircraft the pack follows.
    pub developer: String,
}

/// One pack a built pack was built from: its id and exact version (decision 0029).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(deny_unknown_fields)]
pub struct ResolvedParent {
    /// The parent pack's id.
    pub id: String,
    /// The parent's exact version the pack was built over.
    #[schemars(with = "String")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub version: Version,
}

/// A pack's manifest, `pack.json`. Field names: the manifest is camelCase (`schemaVersion`); the
/// pack's YAML files and their fields are snake_case (`expect_when`, `ask_in`), as authors write
/// them; the app's own saved data is camelCase. The app hands pack content to its interface with
/// camelCase field names, so the interface reads one case (decision 0029).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackManifest {
    /// Optional path to `pack.schema.json`, so editors offer autocomplete. Ignored by the app.
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub json_schema: Option<String>,
    /// Lower-case id with dots and dashes, e.g. `ifly-737-max8` or `lib.boeing-cdu`.
    pub id: String,
    /// The pack's name as the app shows it, e.g. on the Packs page and in the catalog.
    pub name: String,
    /// The pack's version, e.g. `1.2.0`. The app keeps one version of each pack and offers a
    /// newer one as an update; raise it for each change you publish.
    #[schemars(with = "String")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub version: Version,
    /// Pack format. The app reads every format from 6 (the first public one) up to its own and
    /// refuses an older or newer pack with the reason. From 6 on, a later format only adds.
    pub schema_version: u32,
    /// `aircraft`, a pack a pilot opens, or `library`, shared content other packs extend.
    pub kind: PackKind,
    /// App versions this pack works with, e.g. `>=0.1, <1`.
    #[schemars(with = "String")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub engine: VersionReq,
    /// The aircraft this pack is for. Required for `kind: aircraft`, refused on `kind: library`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aircraft: Option<AircraftInfo>,
    /// The one pack this pack builds on, with the versions it accepts, e.g.
    /// `{"lib.boeing-737": ">=1.0, <2"}`. A library can be extended but not opened on its own.
    /// This replaces format 5's `dependencies`, which nothing read: a pack has at most one
    /// parent, and builds on it rather than listing what it includes.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    #[schemars(with = "BTreeMap<String, String>")]
    #[cfg_attr(feature = "ts", ts(type = "Record<string, string>"))]
    pub extends: BTreeMap<String, VersionReq>,
    /// A child's changes to its parent, by id (`patches.yaml`). Only with `extends`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patches: Option<String>,
    /// Written by `involo-pack build`, never by an author: each pack this one was built from,
    /// the parent first, with its exact version.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub resolved: Vec<ResolvedParent>,
    /// Written by `involo-pack build`, never by an author: the SHA-256 of the built pack's
    /// content (its lists and content files, flattened), in hex.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    /// SPDX license id for the pack content, e.g. `CC-BY-NC-SA-4.0`. A child's license is the
    /// built pack's.
    pub license: String,
    /// Credit and terms notes. A built child carries its parents' notes first, then its own,
    /// each once.
    #[serde(default)]
    pub attribution: Vec<String>,
    /// The `basis` tags this pack's lists may use: kinds of material, never document names. A
    /// built child may use its parents' tags and its own: theirs first, then its own, each once.
    #[serde(default)]
    pub basis_tags: Vec<String>,
    /// Checklist files, in display order, relative to the pack folder.
    pub checklists: Vec<String>,
    /// Phases, stages and options. Required for an aircraft pack.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phases: Option<String>,
    /// The controls steps name, where they are, and the flight deck overview (`controls.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub controls: Option<String>,
    /// Longer explanations for steps (What, Why, Check, If not) and How notes (`notes.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// Panel files, in display order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub panels: Vec<String>,
    /// What each panel light means (`lights.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lights: Option<String>,
    /// Faults: their causes, what to do and the steps that deal with them (`faults.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faults: Option<String>,
    /// The terms and abbreviations steps use, and what each means (`glossary.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glossary: Option<String>,
    /// Briefings, each with its items (`briefings.yaml`), shown at the top of their phases;
    /// Practice asks about their mnemonics.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub briefings: Option<String>,
    /// Panel states a pilot can start from, and the steps each counts as done or skips
    /// (`panel-states.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel_states: Option<String>,
    /// CDU walkthroughs, screen by screen (`cdu.yaml`), each opened from the step that names it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cdu: Option<String>,
    /// Old ids and the ids they became, so an update keeps a pilot's flight (`aliases.yaml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<String>,
    /// The pack's flight fields (`flight.yaml`): what steps fill and what a SimBrief plan fills.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight: Option<String>,
    /// The aircraft's alert messages (`messages.yaml`), when it has an alert display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub messages: Option<String>,
    /// The words the interface shows for this pack (`labels.yaml`); without it, the app's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<String>,
}

impl PackManifest {
    /// Every data file this manifest lists, relative to the pack folder.
    pub fn data_files(&self) -> Vec<&str> {
        let single = [
            &self.phases,
            &self.controls,
            &self.notes,
            &self.lights,
            &self.faults,
            &self.glossary,
            &self.briefings,
            &self.panel_states,
            &self.cdu,
            &self.aliases,
            &self.flight,
            &self.labels,
            &self.messages,
            &self.patches,
        ];
        self.checklists
            .iter()
            .chain(&self.panels)
            .chain(single.into_iter().flatten())
            .map(String::as_str)
            .collect()
    }
}
