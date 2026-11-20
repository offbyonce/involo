// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Pack folders as `involo-pack check` reads them: `pack.json` and every file it lists, a parent
//! it `extends` and the patches it makes, built into one pack and checked. The input holds one or
//! more packs as text (see `fuzz/seeds.mjs`):
//!
//! ```text
//! ==== pack <name>
//! ---- <path in the pack>
//! <the file's text>
//! ```
//!
//! The first pack is the one checked; the others are the parents it may extend. Building and
//! checking may refuse the pack, but never panic, hang or run out of memory.

#![no_main]

use std::path::PathBuf;

use involo_pack::{InMemory, Shelf, resolve_files, validate_pack};
use libfuzzer_sys::fuzz_target;

/// The packs written in `text`.
fn packs(text: &str) -> Vec<InMemory> {
    let mut packs: Vec<InMemory> = Vec::new();
    let mut file: Option<(String, String)> = None;
    let close = |packs: &mut Vec<InMemory>, file: &mut Option<(String, String)>| {
        if let (Some(pack), Some((path, body))) = (packs.last_mut(), file.take()) {
            pack.files.insert(path, body.into_bytes());
        }
    };
    for line in text.split_inclusive('\n') {
        if let Some(name) = line.strip_prefix("==== pack ") {
            close(&mut packs, &mut file);
            packs.push(InMemory {
                name: PathBuf::from(name.trim()),
                ..InMemory::default()
            });
        } else if let Some(path) = line.strip_prefix("---- ") {
            close(&mut packs, &mut file);
            file = Some((path.trim().to_owned(), String::new()));
        } else if let Some((_, body)) = &mut file {
            body.push_str(line);
        }
    }
    close(&mut packs, &mut file);
    packs
}

fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    let packs = packs(&text);
    let Some(first) = packs.first().cloned() else {
        return;
    };
    let shelf = Shelf(packs[1..].to_vec());
    if let Ok(built) = resolve_files(&first, &shelf) {
        let issues = validate_pack(&built.pack);
        let _ = involo_pack::resolve::attribute(issues, &built.touched);
        let _ = involo_pack::FlatPack::built(built.pack);
    }
});
