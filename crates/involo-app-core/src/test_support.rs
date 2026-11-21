// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Packs for tests, loaded from the repo's own packs.

use std::path::Path;

use involo_pack::FlatPack;

fn load(path: &str) -> FlatPack {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs")
        .join(path);
    FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap())
}

/// The invented Boeing-style example pack (packs/examples, decision 0030).
pub(crate) fn example_pack() -> FlatPack {
    load("examples/example-twin")
}

/// The invented Airbus-style example pack: crew roles, seats and a seat frame for each.
pub(crate) fn sidestick_pack() -> FlatPack {
    load("examples/example-sidestick")
}

/// The iFly pack, read from disk once per test run (a fresh copy each call).
pub(crate) fn ifly_pack() -> FlatPack {
    static PACK: std::sync::OnceLock<FlatPack> = std::sync::OnceLock::new();
    PACK.get_or_init(|| load("ifly-737-max8")).clone()
}
