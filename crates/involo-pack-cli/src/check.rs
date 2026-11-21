// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack check`: each pack checked, and each problem with its code, file, line and hint
//! (decision 0030). `check`, `check --json`, `build` and the MCP server's `check` and `build`
//! tools all report through [`check_dir`] and [`Found`].

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use involo_pack::locate::{Located, locate, locate_error};
use involo_pack::{
    Code, Issue, Places, ResolveError, Resolved, Severity, resolve_files, validate_pack,
};
use serde_json::json;

/// A folder with `pack.json` is one pack; otherwise each child folder with one is a pack.
pub fn pack_dirs(dir: &Path) -> Result<Vec<PathBuf>> {
    if dir.join("pack.json").is_file() {
        return Ok(vec![dir.to_path_buf()]);
    }
    let mut found = Vec::new();
    for entry in std::fs::read_dir(dir).with_context(|| format!("cannot read {}", dir.display()))? {
        let path = entry?.path();
        if path.join("pack.json").is_file() {
            found.push(path);
        }
    }
    found.sort();
    Ok(found)
}

/// The pack folder's YAML and JSON files, `(path in the folder with /, text)`, `pack.json` first:
/// where the checks' problems are looked for.
pub fn source_files(dir: &Path) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path
                .extension()
                .is_some_and(|e| e == "yaml" || e == "yml" || e == "json")
                && let Ok(text) = std::fs::read_to_string(&path)
            {
                let rel = path
                    .strip_prefix(dir)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                found.push((rel, text));
            }
        }
    }
    found.sort_by(|a, b| (a.0 != "pack.json", &a.0).cmp(&(b.0 != "pack.json", &b.0)));
    found
}

/// One problem as `check` reports it: the issue, or a build error, with its place and hint.
pub struct Found {
    pub code: Code,
    pub severity: Severity,
    pub place: Located,
    pub at: String,
    pub message: String,
}

impl Found {
    pub fn of_issue(issue: Issue, files: &[(String, String)]) -> Self {
        Self {
            code: issue.code,
            severity: issue.severity,
            place: locate(files, &issue),
            at: issue.at,
            message: issue.message,
        }
    }

    pub fn of_error(dir: &Path, e: &ResolveError) -> Self {
        Self {
            code: e.code(),
            severity: Severity::Error,
            place: locate_error(dir, e),
            at: String::new(),
            message: e.to_string(),
        }
    }

    /// `error P0202: lists/a.yaml:12: <where>: <what>`, and the hint on the next line.
    pub fn text(&self) -> String {
        let level = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let mut place = String::new();
        if let Some(file) = &self.place.file {
            place.push_str(file);
            if let Some(line) = self.place.line {
                place.push(':');
                place.push_str(&line.to_string());
            }
            place.push_str(": ");
        }
        // A build error's message names its file itself; so does an issue about a whole file.
        let at = if self.at.is_empty()
            || Some(&self.at.replace('\\', "/")) == self.place.file.as_ref()
        {
            String::new()
        } else {
            format!("{}: ", self.at)
        };
        let place = if self.at.is_empty() {
            String::new()
        } else {
            place
        };
        format!(
            "{level} {}: {place}{at}{}\n    hint: {}",
            self.code,
            self.message,
            self.code.hint()
        )
    }

    pub fn json(&self) -> serde_json::Value {
        json!({
            "code": self.code,
            "severity": match self.severity { Severity::Error => "error", Severity::Warning => "warning" },
            "file": self.place.file,
            "line": self.place.line,
            "at": self.at,
            "message": self.message,
            "hint": self.code.hint(),
        })
    }
}

/// One pack's result: what it is, if it could be built, and its problems.
pub struct PackReport {
    pub dir: PathBuf,
    pub id: Option<String>,
    pub version: Option<String>,
    /// `4 checklists, 19 steps`, when it could be built.
    pub summary: Option<String>,
    pub found: Vec<Found>,
}

impl PackReport {
    /// Whether it has no errors; warnings don't count.
    pub fn ok(&self) -> bool {
        !self.found.iter().any(|f| f.severity == Severity::Error)
    }

    /// `ok   demo 0.1.0 (4 checklists, 19 steps)`, then each problem, indented.
    pub fn text(&self) -> String {
        let status = if self.ok() { "ok  " } else { "FAIL" };
        let mut out = match (&self.id, &self.version, &self.summary) {
            (Some(id), Some(version), Some(summary)) => {
                format!("{status} {id} {version} ({summary})")
            }
            _ => format!("{status} {}", self.dir.display()),
        };
        for f in &self.found {
            out.push_str("\n  ");
            out.push_str(&f.text());
        }
        out
    }

    /// The pack as `check --json` gives it, with its folder written as `folder`.
    pub fn json(&self, folder: &str) -> serde_json::Value {
        json!({
            "folder": folder,
            "id": self.id,
            "version": self.version,
            "ok": self.ok(),
            "issues": self.found.iter().map(Found::json).collect::<Vec<_>>(),
        })
    }
}

/// Where the command looks for a pack's parent: beside it, then in each `--parents` folder.
pub fn places(dir: &Path, parents: &[PathBuf]) -> Vec<PathBuf> {
    involo_pack::resolve::beside(dir)
        .into_iter()
        .chain(parents.iter().cloned())
        .collect()
}

/// The pack in `dir`, built over its parent if it extends one, found in one of `places`.
pub fn resolve_in(dir: &Path, places: &[PathBuf]) -> Result<Resolved, ResolveError> {
    resolve_files(
        &involo_pack::Folder(dir.to_path_buf()),
        &Places(places.to_vec()),
    )
}

/// Checks the pack in `dir`, built over its parent first if it extends one (found in `places`).
pub fn check_dir(dir: &Path, places: &[PathBuf]) -> PackReport {
    match resolve_in(dir, places) {
        Err(e) => PackReport {
            dir: dir.to_path_buf(),
            id: None,
            version: None,
            summary: None,
            found: vec![Found::of_error(dir, &e)],
        },
        Ok(built) => {
            let pack = built.pack;
            let files = source_files(dir);
            let found = involo_pack::resolve::attribute(validate_pack(&pack), &built.touched)
                .into_iter()
                .map(|i| Found::of_issue(i, &files))
                .collect();
            let steps: usize = pack.checklists.iter().map(|c| c.steps.len()).sum();
            PackReport {
                dir: dir.to_path_buf(),
                id: Some(pack.manifest.id.clone()),
                version: Some(pack.manifest.version.to_string()),
                summary: Some(format!(
                    "{} checklists, {steps} steps",
                    pack.checklists.len()
                )),
                found,
            }
        }
    }
}
