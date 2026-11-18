// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack check <dir>... [--parents <dir>]`  validate one or more pack folders (or a folder of
//! packs). A pack that extends a parent is built over it first (decision 0029): parents are found
//! among the packs beside it, or in the folders `--parents` names.
//! `involo-pack schema <dir>`    write the JSON Schemas into `<dir>`.
//! `involo-pack build <dir> <out-dir> [--parents <dir>]`  check each pack, then write it as one
//!                        flattened `<id>.json`, plus `index.json` listing the packs written. A
//!                        library is checked but not written: it is only ever a parent.
//! `involo-pack overlap <dir> [--refs <folder>] [--allow <file>]`  compare pack text with private
//! reference files. The folder can also come from `INVOLO_OVERLAP_REFS`.
//! `involo-pack suggest-targets <pack-dir>`  draft each step's targets from its wording, as JSON, with
//! every place the reading was not certain (decision 0018). An author checks and keeps them.
//! `involo-pack terms <pack-dir>`  list steps whose name, value, Check, If not or Why use a glossary term
//! their `terms` list lacks (3.0's whole-word rule), so the lists stay current; fails if any.
//! With `--json`, print every step's full list as JSON instead, for an author to write in.
//!
//! Output goes to stdout/stderr on purpose: this is a command-line tool.
#![allow(clippy::print_stdout, clippy::print_stderr)]

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result, bail};
use involo_pack::{
    FlatPack, PackKind, PackSummary, Severity, load_pack_dir, resolve, validate_pack,
};
use involo_pack_overlap::{
    AllowList, REFS_VARIABLE, check_refs_location, find_overlaps, load_references, repo_roots,
};

const USAGE: &str = "usage:\n  involo-pack check <pack-dir | packs-dir>... [--parents <dir>]\n  involo-pack schema <out-dir>\n  involo-pack build <pack-dir | packs-dir> <out-dir> [--parents <dir>]\n  involo-pack overlap <pack-dir | packs-dir> [--refs <folder>] [--allow <file>]\n  involo-pack suggest-targets <pack-dir>\n  involo-pack terms [--json] <pack-dir>";

fn main() -> ExitCode {
    match run() {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<bool> {
    let all: Vec<String> = std::env::args().skip(1).collect();
    let (args, parents) = parents_arg(&all)?;
    match args.split_first() {
        Some((cmd, rest)) if cmd == "check" && !rest.is_empty() => check(rest, &parents),
        Some((cmd, [out])) if cmd == "schema" => schema(Path::new(out)).map(|()| true),
        Some((cmd, [packs, out])) if cmd == "build" => build(packs, Path::new(out), &parents),
        Some((cmd, rest)) if cmd == "overlap" && !rest.is_empty() => overlap(rest),
        Some((cmd, [dir])) if cmd == "suggest-targets" => suggest_targets(Path::new(dir)),
        Some((cmd, [dir])) if cmd == "terms" => terms(Path::new(dir)),
        Some((cmd, [flag, dir])) if cmd == "terms" && flag == "--json" => {
            terms_json(Path::new(dir))
        }
        _ => bail!("{USAGE}"),
    }
}

/// Prints each step's drafted targets and flags, by step id.
fn suggest_targets(dir: &Path) -> Result<bool> {
    let pack = load_pack_dir(dir).map_err(|e| anyhow::anyhow!("{e}"))?;
    let mut out = serde_json::Map::new();
    for step in pack.checklists.iter().flat_map(|l| &l.steps) {
        if step.controls.is_empty() {
            continue;
        }
        let s = involo_pack::suggest::suggest(&pack.content.panels, step);
        out.insert(step.id.to_string(), serde_json::to_value(s)?);
    }
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(true)
}

fn terms(dir: &Path) -> Result<bool> {
    let pack = load_pack_dir(dir).map_err(|e| anyhow::anyhow!("{e}"))?;
    let glossary = involo_pack::terms::step_glossary(&pack);
    let mut clean = true;
    for step in pack.checklists.iter().flat_map(|l| &l.steps) {
        let location = involo_pack::terms::step_location(&pack, step);
        let missing = involo_pack::terms::missing_terms(step, &glossary, &location);
        if !missing.is_empty() {
            clean = false;
            println!(
                "{}: uses {} but its terms list lacks it",
                step.id,
                missing.join(", ")
            );
        }
    }
    if clean {
        println!("every step's terms list covers its wording");
    }
    Ok(clean)
}

/// Each step's terms as its wording and location use them, in order: what `terms` should hold.
fn terms_json(dir: &Path) -> Result<bool> {
    let pack = load_pack_dir(dir).map_err(|e| anyhow::anyhow!("{e}"))?;
    let glossary = involo_pack::terms::step_glossary(&pack);
    let mut out = serde_json::Map::new();
    for step in pack.checklists.iter().flat_map(|l| &l.steps) {
        let location = involo_pack::terms::step_location(&pack, step);
        let all = involo_pack::terms::step_terms(step, &glossary, &location);
        out.insert(step.id.to_string(), serde_json::to_value(all)?);
    }
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(true)
}

/// Takes every `--parents <dir>` out of the arguments: folders of packs to find parents in.
fn parents_arg(all: &[String]) -> Result<(Vec<String>, Vec<PathBuf>)> {
    let mut args = Vec::new();
    let mut parents = Vec::new();
    let mut it = all.iter();
    while let Some(a) = it.next() {
        if a == "--parents" {
            let dir = it.next().context("`--parents` needs a folder")?;
            parents.push(PathBuf::from(dir));
        } else {
            args.push(a.clone());
        }
    }
    Ok((args, parents))
}

/// A folder with `pack.json` is one pack; otherwise each child folder with one is a pack.
fn pack_dirs(arg: &str) -> Result<Vec<PathBuf>> {
    let dir = PathBuf::from(arg);
    if dir.join("pack.json").is_file() {
        return Ok(vec![dir]);
    }
    let mut found = Vec::new();
    for entry in
        std::fs::read_dir(&dir).with_context(|| format!("cannot read {}", dir.display()))?
    {
        let path = entry?.path();
        if path.join("pack.json").is_file() {
            found.push(path);
        }
    }
    found.sort();
    Ok(found)
}

fn check(args: &[String], parents: &[PathBuf]) -> Result<bool> {
    let mut ok = true;
    let mut count = 0;
    for arg in args {
        for dir in pack_dirs(arg)? {
            count += 1;
            match resolve(&dir, parents) {
                Err(e) => {
                    ok = false;
                    eprintln!("FAIL {}\n  {e}", dir.display());
                }
                Ok(built) => {
                    let pack = built.pack;
                    let issues =
                        involo_pack::resolve::attribute(validate_pack(&pack), &built.touched);
                    let errors = issues
                        .iter()
                        .filter(|i| i.severity == Severity::Error)
                        .count();
                    let steps: usize = pack.checklists.iter().map(|c| c.steps.len()).sum();
                    if errors > 0 {
                        ok = false;
                    }
                    let status = if errors > 0 { "FAIL" } else { "ok  " };
                    println!(
                        "{status} {} {} ({} checklists, {steps} steps)",
                        pack.manifest.id,
                        pack.manifest.version,
                        pack.checklists.len()
                    );
                    for issue in issues {
                        println!("  {issue}");
                    }
                }
            }
        }
    }
    if count == 0 {
        bail!("no packs found in {}", args.join(", "));
    }
    Ok(ok)
}

struct OverlapArgs {
    target: String,
    refs: Option<PathBuf>,
    allow: Option<PathBuf>,
}

fn overlap_args(args: &[String]) -> Result<OverlapArgs> {
    let mut parsed = OverlapArgs {
        target: String::new(),
        refs: None,
        allow: None,
    };
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--refs" => parsed.refs = rest.next().map(PathBuf::from),
            "--allow" => parsed.allow = rest.next().map(PathBuf::from),
            other if parsed.target.is_empty() && !other.starts_with("--") => {
                other.clone_into(&mut parsed.target);
            }
            _ => bail!("{USAGE}"),
        }
    }
    if parsed.target.is_empty() {
        bail!("{USAGE}");
    }
    if parsed.refs.is_none() {
        parsed.refs = std::env::var_os(REFS_VARIABLE)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from);
    }
    Ok(parsed)
}

fn overlap(args: &[String]) -> Result<bool> {
    let parsed = overlap_args(args)?;
    let Some(refs) = parsed.refs else {
        println!("overlap check not run: {REFS_VARIABLE} is not set");
        return Ok(true);
    };
    let dirs = pack_dirs(&parsed.target)?;
    if dirs.is_empty() {
        bail!("no packs found in {}", parsed.target);
    }
    let cwd = std::env::current_dir()?;
    let mut places: Vec<&Path> = dirs.iter().map(PathBuf::as_path).collect();
    places.push(&cwd);
    let refs = check_refs_location(&refs, &repo_roots(&places))?;
    let (references, skipped) = load_references(&refs)?;
    let allow = match parsed.allow {
        Some(path) => {
            let text = std::fs::read_to_string(&path)
                .with_context(|| format!("cannot read {}", path.display()))?;
            AllowList::parse(&text)?
        }
        None => AllowList::default(),
    };
    let mut flagged = 0;
    let mut allowed = 0;
    for dir in &dirs {
        let pack = load_pack_dir(dir)?;
        for found in find_overlaps(&pack, &references) {
            if allow.allows(&found.words) {
                allowed += 1;
                continue;
            }
            flagged += 1;
            let scope = if found.across_steps {
                " (across steps)"
            } else {
                ""
            };
            println!(
                "OVERLAP {} {}{scope}\n  in reference: {}\n  words ({}): {}",
                found.file,
                found.at,
                found.reference,
                found.words.len(),
                found.words.join(" ")
            );
        }
    }
    println!(
        "overlap: {} reference files, {skipped} other files skipped, {flagged} flagged, {allowed} allowed",
        references.file_count()
    );
    Ok(flagged == 0)
}

fn schema(out: &Path) -> Result<()> {
    std::fs::create_dir_all(out)?;
    for (name, json) in involo_pack::schema::all() {
        let path = out.join(name);
        std::fs::write(&path, json).with_context(|| format!("cannot write {}", path.display()))?;
        println!("wrote {}", path.display());
    }
    Ok(())
}

/// Check every pack, then write each one as `<out>/<id>.json`, built over its parents. A pack
/// with errors is not written; nor is a library, which is only ever a parent.
fn build(packs: &str, out: &Path, parents: &[PathBuf]) -> Result<bool> {
    let dirs = pack_dirs(packs)?;
    if dirs.is_empty() {
        bail!("no packs found in {packs}");
    }
    std::fs::create_dir_all(out).with_context(|| format!("cannot create {}", out.display()))?;
    let mut ok = true;
    let mut index = Vec::new();
    for dir in dirs {
        let built = match resolve(&dir, parents) {
            Ok(built) => built,
            Err(e) => {
                ok = false;
                eprintln!("FAIL {}: not built\n  {e}", dir.display());
                continue;
            }
        };
        let pack = built.pack;
        let errors: Vec<_> = involo_pack::resolve::attribute(validate_pack(&pack), &built.touched)
            .into_iter()
            .filter(|i| i.severity == Severity::Error)
            .collect();
        if !errors.is_empty() {
            ok = false;
            eprintln!(
                "FAIL {}: not built, run `involo-pack check`",
                pack.manifest.id
            );
            for issue in errors {
                eprintln!("  {issue}");
            }
            continue;
        }
        if pack.manifest.kind == PackKind::Library {
            println!(
                "library {}: checked, not written (packs extend it)",
                pack.manifest.id
            );
            continue;
        }
        let path = out.join(format!("{}.json", pack.manifest.id));
        index.push(PackSummary::from(&pack.manifest));
        let json = serde_json::to_string(&FlatPack::built(pack))?;
        std::fs::write(&path, &json).with_context(|| format!("cannot write {}", path.display()))?;
        println!("built {} ({} bytes)", path.display(), json.len());
    }
    let path = out.join("index.json");
    std::fs::write(&path, serde_json::to_string(&index)?)
        .with_context(|| format!("cannot write {}", path.display()))?;
    println!("wrote {} ({} packs)", path.display(), index.len());
    Ok(ok)
}
