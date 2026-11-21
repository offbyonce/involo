// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Builds the example packs (`packs/examples`) into the command, for `involo-pack new`: an
//! installed `involo-pack` has no repository beside it. Writes `examples.rs` in `OUT_DIR`: each
//! example's id and its files, as paths in its folder and their bytes. Where the examples aren't
//! there (a crate built outside the repository), the list is empty and `new` says so.

// Cargo reads a build script's instructions from its standard output.
#![allow(clippy::print_stdout)]

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

fn main() {
    let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap_or_default());
    let examples = manifest.join("../../packs/examples");
    println!("cargo:rerun-if-changed={}", examples.display());
    let mut out = String::from(
        "/// An example's files, as `(path in its folder, bytes)`.\npub type Files = &'static [(&'static str, &'static [u8])];\n/// Each example pack: its id, and its files.\npub static EXAMPLES: &[(&str, Files)] = &[\n",
    );
    let mut packs: Vec<PathBuf> = std::fs::read_dir(&examples)
        .map(|dir| {
            dir.filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.join("pack.json").is_file())
                .collect()
        })
        .unwrap_or_default();
    packs.sort();
    for pack in packs {
        let id = pack.file_name().unwrap_or_default().to_string_lossy();
        let _ = writeln!(out, "    ({id:?}, &[");
        let mut files = Vec::new();
        walk(&pack, &mut files);
        files.sort();
        for file in files {
            let rel = file
                .strip_prefix(&pack)
                .unwrap_or(&file)
                .to_string_lossy()
                .replace('\\', "/");
            let abs = file.canonicalize().unwrap_or(file);
            let _ = writeln!(
                out,
                "        ({rel:?}, include_bytes!({:?})),",
                abs.to_string_lossy()
            );
        }
        out.push_str("    ]),\n");
    }
    out.push_str("];\n");
    let dest = PathBuf::from(std::env::var_os("OUT_DIR").unwrap_or_default()).join("examples.rs");
    if let Err(e) = std::fs::write(&dest, out) {
        panic!("cannot write {}: {e}", dest.display());
    }
}

fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, files);
        } else {
            files.push(path);
        }
    }
}
