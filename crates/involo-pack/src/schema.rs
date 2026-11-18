// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! JSON Schemas generated from the Rust types. The committed copies in `schemas/`
//! give pack authors editor autocomplete; a test fails if they drift from the code.

use involo_checklist_core::{
    AliasesFile, BriefingsFile, CduFile, Checklist, ControlsFile, FaultsFile, FlightFile,
    GlossaryFile, LabelsFile, LightsFile, NotesFile, Panel, PanelStatesFile, PhasesFile,
};

use crate::manifest::PackManifest;

/// `(file name, pretty JSON)` for every schema we publish.
pub fn all() -> Vec<(&'static str, String)> {
    vec![
        ("aliases.schema.json", render::<AliasesFile>()),
        ("briefings.schema.json", render::<BriefingsFile>()),
        ("cdu.schema.json", render::<CduFile>()),
        ("checklist.schema.json", render::<Checklist>()),
        ("controls.schema.json", render::<ControlsFile>()),
        ("faults.schema.json", render::<FaultsFile>()),
        ("flight.schema.json", render::<FlightFile>()),
        ("glossary.schema.json", render::<GlossaryFile>()),
        ("labels.schema.json", render::<LabelsFile>()),
        ("lights.schema.json", render::<LightsFile>()),
        (
            "messages.schema.json",
            render::<involo_checklist_core::MessagesFile>(),
        ),
        ("notes.schema.json", render::<NotesFile>()),
        ("pack.schema.json", render::<PackManifest>()),
        ("panel.schema.json", render::<Panel>()),
        ("patches.schema.json", render::<crate::patch::PatchesFile>()),
        ("phases.schema.json", render::<PhasesFile>()),
        ("panel-states.schema.json", render::<PanelStatesFile>()),
    ]
}

fn render<T: schemars::JsonSchema>() -> String {
    let schema = schemars::schema_for!(T);
    // Serializing a schema built by schemars cannot fail.
    let mut json = serde_json::to_string_pretty(&schema).unwrap_or_default();
    json.push('\n');
    json
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    /// Fails when the committed schema files no longer match the Rust types.
    /// Run `just schemas` to regenerate them.
    #[test]
    fn committed_schemas_match_the_code() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schemas");
        for (name, expected) in super::all() {
            let committed = std::fs::read_to_string(dir.join(name)).unwrap_or_default();
            assert!(
                committed == expected,
                "schemas/{name} is out of date; run `just schemas`"
            );
        }
    }
}
