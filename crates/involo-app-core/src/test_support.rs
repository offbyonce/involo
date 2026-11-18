// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Packs for tests, loaded from the repo's own packs.

use std::path::Path;

use involo_pack::FlatPack;

fn load(id: &str) -> FlatPack {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs")
        .join(id);
    FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap())
}

pub(crate) fn example_pack() -> FlatPack {
    load("example-trainer")
}

/// The iFly pack, read from disk once per test run (a fresh copy each call).
pub(crate) fn ifly_pack() -> FlatPack {
    static PACK: std::sync::OnceLock<FlatPack> = std::sync::OnceLock::new();
    PACK.get_or_init(|| load("ifly-737-max8")).clone()
}
