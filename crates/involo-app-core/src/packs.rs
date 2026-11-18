// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Reading a flattened pack, the one JSON file per pack that `involo-pack build` writes.

use involo_pack::{FlatPack, PackKind, format_problem};

use crate::AppError;

/// Read a flattened pack. A format this version doesn't read (older than 6, or newer than the
/// app) is refused with the reason before the rest is read, and so is a library pack, which is
/// only built into the packs that extend it.
pub fn load_pack(json: &str) -> Result<FlatPack, AppError> {
    let format = serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| v.get("manifest")?.get("schemaVersion")?.as_u64());
    if let Some(problem) = format.and_then(|v| format_problem(u32::try_from(v).unwrap_or(u32::MAX)))
    {
        return Err(AppError::PackInvalid(problem));
    }
    let flat: FlatPack = serde_json::from_str(json)
        .map_err(|e| AppError::PackInvalid(format!("the pack file could not be read: {e}")))?;
    if flat.manifest.kind == PackKind::Library {
        return Err(AppError::PackInvalid(format!(
            "{} is a library pack: it can't be opened on its own, only built into the packs that extend it",
            flat.manifest.id
        )));
    }
    Ok(with_positional_locators(flat))
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
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
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
        assert_eq!(flat.manifest.id, "example-trainer");
        assert_eq!(flat.lists.len(), 3);
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
}
