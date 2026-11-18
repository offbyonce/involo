// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Building a pack that extends a parent (decision 0029): find the parent, build it first (it may
//! extend a pack of its own), merge the child over it and apply the child's patches, giving one
//! flat pack that records what it was built from.
//!
//! The merge rules: the child's manifest is the built pack's, with its parents' attribution notes
//! and basis tags first and its own after, each once. The child's lists and panels follow the
//! parent's. Its `labels.yaml` applies over the parent's words. Any other content file the parent
//! already has is changed with patches, not given again.

use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::patch::{self, PatchesFile, Touched};
use crate::{Issue, LoadError, Pack, PackContent, ResolvedParent, load_pack_dir};

/// Why a pack could not be built from its parents.
#[derive(Debug, thiserror::Error)]
pub enum ResolveError {
    #[error(transparent)]
    Load(#[from] LoadError),
    #[error("{child}: its parent `{parent}` is in none of {}", searched.join(", "))]
    NotFound {
        child: String,
        parent: String,
        searched: Vec<String>,
    },
    #[error("{0}")]
    Pack(String),
}

/// A pack built over its parents, and what each of its patches touched.
#[derive(Debug, Clone)]
pub struct Resolved {
    pub pack: Pack,
    pub touched: Vec<Touched>,
}

/// Loads the pack in `dir` and, when it extends a parent, builds it over the parent. Parents are
/// looked for among the packs beside `dir` and in each of `search`.
pub fn resolve(dir: &Path, search: &[PathBuf]) -> Result<Resolved, ResolveError> {
    let mut places: Vec<PathBuf> = dir.parent().map(Path::to_path_buf).into_iter().collect();
    places.extend(search.iter().cloned());
    resolve_in(dir, &places, &mut Vec::new())
}

fn resolve_in(
    dir: &Path,
    places: &[PathBuf],
    chain: &mut Vec<String>,
) -> Result<Resolved, ResolveError> {
    let child = load_pack_dir(dir)?;
    let id = child.manifest.id.clone();
    let fail = |m: String| Err(ResolveError::Pack(format!("{id}: {m}")));
    if !child.manifest.resolved.is_empty() || child.manifest.content_hash.is_some() {
        return fail("`resolved` and `contentHash` are written by `involo-pack build`; remove them from pack.json".into());
    }
    if let Some(start) = chain.iter().position(|c| c == &id) {
        let mut cycle = chain[start..].to_vec();
        cycle.push(id.clone());
        return fail(format!("`extends` makes a cycle: {}", cycle.join(" → ")));
    }
    let Some((parent_id, range)) = child.manifest.extends.iter().next() else {
        if child.manifest.patches.is_some() {
            return fail("`patches` change a parent; this pack `extends` none".into());
        }
        return Ok(Resolved {
            pack: child,
            touched: vec![],
        });
    };
    let parent_dir = find(parent_id, places).ok_or_else(|| ResolveError::NotFound {
        child: id.clone(),
        parent: parent_id.clone(),
        searched: places.iter().map(|p| p.display().to_string()).collect(),
    })?;
    chain.push(id.clone());
    let parent = resolve_in(&parent_dir, places, chain)?.pack;
    chain.pop();
    let pm = &parent.manifest;
    if !range.matches(&pm.version) {
        return fail(format!(
            "extends `{parent_id}` {range}, but the parent found is version {}",
            pm.version
        ));
    }
    if pm.schema_version != child.manifest.schema_version {
        return fail(format!(
            "is format {} and its parent `{parent_id}` is format {}; build both on one format",
            child.manifest.schema_version, pm.schema_version
        ));
    }
    let patches: Option<PatchesFile> = match &child.manifest.patches {
        Some(rel) => Some(crate::load::parse_yaml(
            &std::fs::read_to_string(dir.join(rel)).map_err(|source| LoadError::Io {
                path: dir.join(rel),
                source,
            })?,
            &dir.join(rel),
        )?),
        None => None,
    };
    let file = child.manifest.patches.clone().unwrap_or_default();
    merge(parent, child, &file, patches.as_ref())
}

/// The folder among `places` (each a folder of packs) whose pack has the id `id`.
fn find(id: &str, places: &[PathBuf]) -> Option<PathBuf> {
    places.iter().find_map(|place| {
        let mut dirs: Vec<PathBuf> = std::fs::read_dir(place)
            .ok()?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.join("pack.json").is_file())
            .collect();
        dirs.sort();
        dirs.into_iter().find(|d| {
            std::fs::read_to_string(d.join("pack.json"))
                .ok()
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                .and_then(|v| v.get("id")?.as_str().map(|s| s == id))
                .unwrap_or(false)
        })
    })
}

/// `a` then whatever of `b` is not already in it.
fn union(a: &[String], b: &[String]) -> Vec<String> {
    let mut out = a.to_vec();
    for x in b {
        if !out.contains(x) {
            out.push(x.clone());
        }
    }
    out
}

/// The child merged over its built parent, and its patches applied.
fn merge(
    parent: Pack,
    child: Pack,
    file: &str,
    patches: Option<&PatchesFile>,
) -> Result<Resolved, ResolveError> {
    let id = child.manifest.id.clone();
    let mut manifest = child.manifest.clone();
    let pm = &parent.manifest;
    manifest.attribution = union(&pm.attribution, &child.manifest.attribution);
    manifest.basis_tags = union(&pm.basis_tags, &child.manifest.basis_tags);
    if manifest.aircraft.is_none() && manifest.kind == crate::PackKind::Aircraft {
        manifest.aircraft.clone_from(&pm.aircraft);
    }
    manifest.resolved = std::iter::once(ResolvedParent {
        id: pm.id.clone(),
        version: pm.version.clone(),
    })
    .chain(pm.resolved.iter().cloned())
    .collect();

    let (p, c) = (parent.content, child.content);
    let doubled = doubled(&child.manifest, &p);
    if !doubled.is_empty() {
        return Err(ResolveError::Pack(format!(
            "{id}: its parent `{}` already has {}; change {} with patches",
            pm.id,
            doubled
                .iter()
                .map(|d| format!("`{d}`"))
                .collect::<Vec<_>>()
                .join(", "),
            if doubled.len() == 1 { "it" } else { "them" }
        )));
    }
    let labels = involo_checklist_core::Labels::extend(
        &p.labels,
        child.labels_file.as_ref(),
        &manifest.basis_tags,
    );
    let content = PackContent {
        phases: c.phases.or(p.phases),
        controls: c.controls.or(p.controls),
        notes: c.notes.or(p.notes),
        panels: p.panels.into_iter().chain(c.panels).collect(),
        lights: c.lights.or(p.lights),
        faults: c.faults.or(p.faults),
        glossary: c.glossary.or(p.glossary),
        briefings: c.briefings.or(p.briefings),
        panel_states: c.panel_states.or(p.panel_states),
        cdu: c.cdu.or(p.cdu),
        aliases: c.aliases.or(p.aliases),
        flight: c.flight.or(p.flight),
        messages: c.messages.or(p.messages),
        labels,
    };
    let lists: Vec<_> = parent
        .checklists
        .into_iter()
        .chain(child.checklists)
        .collect();
    let mut pack = Pack {
        manifest,
        checklists: lists,
        content,
        labels_file: child.labels_file,
        other_files: child.other_files,
    };
    let Some(patches) = patches else {
        return Ok(Resolved {
            pack,
            touched: vec![],
        });
    };
    let touched = apply_patches(&mut pack, file, patches)?;
    Ok(Resolved { pack, touched })
}

/// The content files a child gives that its parent already has, by their manifest names.
fn doubled(m: &crate::PackManifest, p: &PackContent) -> Vec<&'static str> {
    [
        ("phases", m.phases.is_some(), p.phases.is_some()),
        ("controls", m.controls.is_some(), p.controls.is_some()),
        ("notes", m.notes.is_some(), p.notes.is_some()),
        ("lights", m.lights.is_some(), p.lights.is_some()),
        ("faults", m.faults.is_some(), p.faults.is_some()),
        ("glossary", m.glossary.is_some(), p.glossary.is_some()),
        ("briefings", m.briefings.is_some(), p.briefings.is_some()),
        (
            "panelStates",
            m.panel_states.is_some(),
            p.panel_states.is_some(),
        ),
        ("cdu", m.cdu.is_some(), p.cdu.is_some()),
        ("aliases", m.aliases.is_some(), p.aliases.is_some()),
        ("flight", m.flight.is_some(), p.flight.is_some()),
        ("messages", m.messages.is_some(), p.messages.is_some()),
    ]
    .into_iter()
    .filter_map(|(name, given, had)| (given && had).then_some(name))
    .collect()
}

/// Applies the child's patches to the merged pack's lists and content.
fn apply_patches(
    pack: &mut Pack,
    file: &str,
    patches: &PatchesFile,
) -> Result<Vec<Touched>, ResolveError> {
    let id = pack.manifest.id.clone();
    let mut doc = serde_json::json!({ "lists": pack.checklists, "content": pack.content });
    let touched = patch::apply(&mut doc, file, &patches.patches)
        .map_err(|problems| ResolveError::Pack(format!("{id}: {}", problems.join("\n  "))))?;
    let read = |what: &str, v: Option<&Value>| -> Result<Value, ResolveError> {
        v.cloned()
            .ok_or_else(|| ResolveError::Pack(format!("{id}: the patched {what} are missing")))
    };
    pack.checklists = serde_json::from_value(read("lists", doc.get("lists"))?).map_err(|e| {
        ResolveError::Pack(format!("{id}: after {file}, the lists do not read: {e}"))
    })?;
    pack.content = serde_json::from_value(read("content", doc.get("content"))?).map_err(|e| {
        ResolveError::Pack(format!(
            "{id}: after {file}, the content does not read: {e}"
        ))
    })?;
    Ok(touched)
}

/// Adds the patch that touched an issue's subject to the issue, so a problem the patches caused
/// names the child's file and patch.
pub fn attribute(issues: Vec<Issue>, touched: &[Touched]) -> Vec<Issue> {
    issues
        .into_iter()
        .map(|mut issue| {
            let text = format!("{} {}", issue.at, issue.message);
            if let Some(t) = touched
                .iter()
                .find(|t| t.ids.iter().any(|id| text.contains(id.as_str())))
            {
                issue.message = format!("{} (after {})", issue.message, t.patch);
            }
            issue
        })
        .collect()
}

/// The SHA-256 of a built pack's lists and content, in hex: it changes when any of them changes,
/// and only then.
pub fn content_hash(lists: &[involo_checklist_core::Checklist], content: &PackContent) -> String {
    let mut hasher = Sha256::new();
    let bytes = serde_json::to_vec(&(lists, content)).unwrap_or_default();
    hasher.update(&bytes);
    hasher
        .finalize()
        .iter()
        .fold(String::with_capacity(64), |mut hex, b| {
            use std::fmt::Write;
            let _ = write!(hex, "{b:02x}");
            hex
        })
}
