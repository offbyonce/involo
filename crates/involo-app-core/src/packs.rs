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
    Ok(flat)
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
