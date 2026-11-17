// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Commands the interface may call. Each one is listed in `build.rs` and granted in
//! `capabilities/main.json`; anything else is refused. Each wraps one `involo-app-core` function.

use involo_app_core::{AppError, AppInfo};
use involo_checklist_core::Checklist;

#[tauri::command]
pub fn app_info() -> AppInfo {
    involo_app_core::app_info()
}

#[tauri::command]
pub fn example_checklist() -> Result<Checklist, AppError> {
    involo_app_core::example_checklist()
}
