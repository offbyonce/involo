// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! What the interface asks of the app: its basic facts and the bundled example checklist.

use std::path::Path;

use involo_checklist_core::Checklist;
use serde::Serialize;
use ts_rs::TS;

use crate::AppError;

/// Basic facts for the About box and the window title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub pack_schema_version: u32,
}

pub fn app_info() -> AppInfo {
    AppInfo {
        name: "Involo".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        pack_schema_version: involo_pack::SCHEMA_VERSION,
    }
}

/// The Example Twin's Before start checklist (packs/examples), parsed through the same strict
/// loader as real packs.
pub fn example_checklist() -> Result<Checklist, AppError> {
    const YAML: &str = include_str!("../../../packs/examples/example-twin/lists/before-start.yaml");
    Ok(involo_pack::parse_checklist_yaml(
        YAML,
        Path::new("example-twin/lists/before-start.yaml"),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn example_checklist_loads() {
        let list = example_checklist().unwrap();
        assert_eq!(list.id, "before-start");
        assert_eq!(
            list.steps.len(),
            5,
            "the example pack's Before start has five steps"
        );
    }

    #[test]
    fn errors_serialize_as_kind_and_message() {
        let json = serde_json::to_string(&AppError::PackInvalid("bad".into())).unwrap();
        assert_eq!(json, r#"{"kind":"PackInvalid","message":"bad"}"#);
    }
}
