// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack build`: the pack catalog (decision 0028). The command line and the MCP server's
//! `build` tool both call [`build`], and report its [`BuildReport`].

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use involo_pack::{CatalogEntry, FlatPack, PackKind, Severity, sha256_hex, validate_pack};
use serde_json::json;

use crate::check::{Found, resolve_in, source_files};

/// What became of one pack.
pub enum Outcome {
    /// Written as `file`, `size` bytes.
    Built {
        id: String,
        file: PathBuf,
        size: u64,
    },
    /// A library: checked, and not written, because packs extend it.
    Library { id: String },
    /// Not written: `pack` couldn't be built, or has errors, listed in `found`.
    Failed {
        pack: String,
        built: bool,
        found: Vec<Found>,
    },
}

/// What a build did.
pub struct BuildReport {
    pub outcomes: Vec<Outcome>,
    /// `index.json`, and how many packs it lists.
    pub index: PathBuf,
    pub count: usize,
}

impl BuildReport {
    /// Whether every pack was built or checked without errors.
    pub fn ok(&self) -> bool {
        !self
            .outcomes
            .iter()
            .any(|o| matches!(o, Outcome::Failed { .. }))
    }

    /// The report as JSON, each path written by `path`.
    pub fn json(&self, path: impl Fn(&Path) -> String) -> serde_json::Value {
        let packs: Vec<_> = self
            .outcomes
            .iter()
            .map(|o| match o {
                Outcome::Built { id, file, size } => {
                    json!({ "id": id, "result": "built", "file": path(file), "size": size })
                }
                Outcome::Library { id } => json!({ "id": id, "result": "library" }),
                Outcome::Failed { pack, built, found } => json!({
                    "id": pack,
                    "result": if *built { "has errors" } else { "not built" },
                    "issues": found.iter().map(Found::json).collect::<Vec<_>>(),
                }),
            })
            .collect();
        json!({ "ok": self.ok(), "packs": packs, "index": path(&self.index), "count": self.count })
    }
}

/// Checks every pack in `dirs`, then writes the catalog into `out`: each pack, built over its
/// parents (found in the folders `places` gives for it), as `<id>-<version>.involo-pack`, and `index.json` with an entry for each, in the order
/// given. Pack files already in `out` are removed first. A pack with errors is not written; nor is
/// a library, which is only ever a parent.
pub fn build(
    dirs: &[PathBuf],
    out: &Path,
    places: &dyn Fn(&Path) -> Vec<PathBuf>,
) -> Result<BuildReport> {
    std::fs::create_dir_all(out).with_context(|| format!("cannot create {}", out.display()))?;
    // The catalog is what this build writes: pack files left from an earlier one go.
    for entry in std::fs::read_dir(out).with_context(|| format!("cannot read {}", out.display()))? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "involo-pack") {
            std::fs::remove_file(&path)
                .with_context(|| format!("cannot remove {}", path.display()))?;
        }
    }
    let mut outcomes = Vec::new();
    let mut index = Vec::new();
    for dir in dirs {
        let built = match resolve_in(dir, &places(dir)) {
            Ok(built) => built,
            Err(e) => {
                outcomes.push(Outcome::Failed {
                    pack: dir.display().to_string(),
                    built: false,
                    found: vec![Found::of_error(dir, &e)],
                });
                continue;
            }
        };
        let pack = built.pack;
        let errors: Vec<_> = involo_pack::resolve::attribute(validate_pack(&pack), &built.touched)
            .into_iter()
            .filter(|i| i.severity == Severity::Error)
            .collect();
        if !errors.is_empty() {
            let files = source_files(dir);
            outcomes.push(Outcome::Failed {
                pack: pack.manifest.id.clone(),
                built: true,
                found: errors
                    .into_iter()
                    .map(|i| Found::of_issue(i, &files))
                    .collect(),
            });
            continue;
        }
        let m = pack.manifest.clone();
        let (PackKind::Aircraft, Some(aircraft)) = (m.kind, m.aircraft) else {
            outcomes.push(Outcome::Library { id: m.id });
            continue;
        };
        let json = serde_json::to_string(&FlatPack::built(pack))?;
        let entry = CatalogEntry {
            id: m.id,
            name: m.name,
            version: m.version,
            aircraft,
            engine: m.engine,
            size: json.len() as u64,
            sha256: sha256_hex(json.as_bytes()),
        };
        let path = out.join(catalog_file(&entry));
        std::fs::write(&path, &json).with_context(|| format!("cannot write {}", path.display()))?;
        outcomes.push(Outcome::Built {
            id: entry.id.clone(),
            file: path,
            size: json.len() as u64,
        });
        index.push(entry);
    }
    let path = out.join("index.json");
    std::fs::write(&path, serde_json::to_string(&index)?)
        .with_context(|| format!("cannot write {}", path.display()))?;
    Ok(BuildReport {
        outcomes,
        index: path,
        count: index.len(),
    })
}

/// A pack's file name in the catalog: `<id>-<version>.involo-pack`, beside `index.json`.
fn catalog_file(entry: &CatalogEntry) -> String {
    format!("{}-{}.involo-pack", entry.id, entry.version)
}
