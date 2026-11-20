// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! A pack file as the app receives it, from the catalog or "Add a pack file": the check before it
//! is installed, then opening it. Neither may panic, hang or run out of memory, whatever the
//! bytes are.

#![no_main]

use involo_app_core::{check_pack, load_pack};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = check_pack(data, None);
    if let Ok(json) = std::str::from_utf8(data) {
        let _ = load_pack(json);
    }
});
