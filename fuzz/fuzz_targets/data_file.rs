// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! One file of a pack folder: `pack.json`, or any YAML content file, read as the kind of file
//! its first line names (`checklists`, `panels`, `glossary`, … as `pack.json` names them; any
//! other first line picks a kind by its first byte). Reading may fail, but never panic, hang or
//! run out of memory.

#![no_main]

use std::path::Path;

use involo_checklist_core as core;
use involo_pack::patch::PatchesFile;
use involo_pack::{PackManifest, parse_yaml};
use libfuzzer_sys::fuzz_target;

/// Every kind of file in a pack folder, by the name `pack.json` gives it.
const KINDS: &[&str] = &[
    "pack.json",
    "checklists",
    "phases",
    "controls",
    "notes",
    "panels",
    "lights",
    "faults",
    "glossary",
    "briefings",
    "panelStates",
    "cdu",
    "aliases",
    "flight",
    "messages",
    "labels",
    "patches",
];

fn read<T: serde::de::DeserializeOwned>(text: &str) {
    let _ = parse_yaml::<T>(text, Path::new("fuzz.yaml"));
}

fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    let (first, rest) = text.split_once('\n').unwrap_or((&text, ""));
    let kind = KINDS
        .iter()
        .position(|k| *k == first.trim())
        .unwrap_or_else(|| usize::from(data.first().copied().unwrap_or(0)) % KINDS.len());
    match KINDS[kind] {
        "pack.json" => {
            let _ = serde_json::from_str::<PackManifest>(rest);
        }
        "checklists" => read::<core::Checklist>(rest),
        "phases" => read::<core::PhasesFile>(rest),
        "controls" => read::<core::ControlsFile>(rest),
        "notes" => read::<core::NotesFile>(rest),
        "panels" => read::<core::Panel>(rest),
        "lights" => read::<core::LightsFile>(rest),
        "faults" => read::<core::FaultsFile>(rest),
        "glossary" => read::<core::GlossaryFile>(rest),
        "briefings" => read::<core::BriefingsFile>(rest),
        "panelStates" => read::<core::PanelStatesFile>(rest),
        "cdu" => read::<core::CduFile>(rest),
        "aliases" => read::<core::AliasesFile>(rest),
        "flight" => read::<core::FlightFile>(rest),
        "messages" => read::<core::MessagesFile>(rest),
        "labels" => read::<core::LabelsFile>(rest),
        _ => read::<PatchesFile>(rest),
    }
});
