// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The `involo-pack` command for pack authors (decision 0030).
//!
//! `involo-pack new <folder> [--from <example>] [--name <name>]`  start a pack from an example
//! pack, with its id (the folder's name) and names replaced.
//! `involo-pack check [--json] <dir>... [--parents <dir>]`  validate one or more pack folders (or a
//! folder of packs). A pack that extends a parent is built over it first (decision 0029): parents
//! are found among the packs beside it, or in the folders `--parents` names. Each problem has a
//! stable code, the file and line where the source has one, and a hint; `--json` prints them for
//! tools.
//! `involo-pack explain [--json] [<code>]`  what a problem's code means and how to fix it; every
//! code, without one.
//! `involo-pack describe [--json] <file>`  the fields one pack file takes (`flight.yaml`,
//! `lists/<name>.yaml`), from its JSON Schema; `--json` prints the schema.
//! `involo-pack import-panel <file.svg> [--id <id>] [--width <units>] [--out <file>]`
//! a panel drawn in a vector drawing tool, as a panel file for the author to finish: groups named
//! `section:<id>` and `<kind>:<LABEL>` become sections and controls where they are drawn. Prints
//! the file, or writes it to `--out`.
//! `involo-pack mcp <folder>`  an MCP server over standard input and output, for coding agents:
//! the format, the schemas, the guide, the example packs, and `new`, `check`, `build`,
//! `import-panel`, `describe` and `explain` as tools, all inside `<folder>`.
//! `involo-pack schema <dir>`    write every JSON Schema into `<dir>` (`just schemas`).
//! `involo-pack reference <dir>`  write the pack format reference into `<dir>`: a page per pack
//!                        file and the problem codes, replacing the pages there (`just pack-docs`).
//! `involo-pack build <dir>... <out-dir> [--parents <dir>]`  check each pack, then write the
//!                        catalog (decision 0028): each pack as one flattened
//!                        `<id>-<version>.involo-pack`, and `index.json` with each one's entry,
//!                        size and SHA-256. A library is checked but not written: it is only ever
//!                        a parent.
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
use involo_pack::{Code, load_pack_dir};
use involo_pack_overlap::{
    AllowList, REFS_VARIABLE, check_refs_location, find_overlaps, load_references, repo_roots,
};
use serde_json::json;

mod catalog;
mod check;
mod import_panel;
mod mcp;
mod starter;
mod workspace;

use starter::words;

const USAGE: &str = "usage:\n  involo-pack new <folder> [--from <example>] [--name <name>]\n  involo-pack check [--json] <pack-dir | packs-dir>... [--parents <dir>]\n  involo-pack explain [--json] [<code>]\n  involo-pack describe [--json] <file>\n  involo-pack import-panel <file.svg> [--id <id>] [--width <units>] [--out <file>]\n  involo-pack mcp <folder>\n  involo-pack schema <out-dir>\n  involo-pack reference <out-dir>\n  involo-pack build <pack-dir | packs-dir>... <out-dir> [--parents <dir>]\n  involo-pack overlap <pack-dir | packs-dir> [--refs <folder>] [--allow <file>]\n  involo-pack suggest-targets <pack-dir>\n  involo-pack terms [--json] <pack-dir>";

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
    let json = args.iter().any(|a| a == "--json");
    let args: Vec<String> = args.into_iter().filter(|a| a != "--json").collect();
    match args.split_first() {
        Some((cmd, rest)) if cmd == "new" && !rest.is_empty() => new(rest),
        Some((cmd, rest)) if cmd == "check" && !rest.is_empty() => check(rest, &parents, json),
        Some((cmd, rest)) if cmd == "explain" && rest.len() <= 1 => {
            explain(rest.first().map(String::as_str), json)
        }
        Some((cmd, [file])) if cmd == "describe" => describe(file, json),
        Some((cmd, rest)) if cmd == "import-panel" && !rest.is_empty() => import_panel(rest),
        Some((cmd, [dir])) if cmd == "mcp" => mcp::serve(Path::new(dir)).map(|()| true),
        Some((cmd, [out])) if cmd == "reference" => reference(Path::new(out)).map(|()| true),
        Some((cmd, [out])) if cmd == "schema" => schema(Path::new(out)).map(|()| true),
        Some((cmd, [packs @ .., out])) if cmd == "build" && !packs.is_empty() => {
            build(packs, Path::new(out), &parents)
        }
        Some((cmd, rest)) if cmd == "overlap" && !rest.is_empty() => overlap(rest),
        Some((cmd, [dir])) if cmd == "suggest-targets" => suggest_targets(Path::new(dir)),
        Some((cmd, [dir])) if cmd == "terms" && json => terms_json(Path::new(dir)),
        Some((cmd, [dir])) if cmd == "terms" => terms(Path::new(dir)),
        _ => bail!("{USAGE}"),
    }
}

/// `new <folder> [--from <example>] [--name <name>]`: a starter pack (see `starter::create`).
fn new(args: &[String]) -> Result<bool> {
    let mut folder = None;
    let mut from = starter::DEFAULT_EXAMPLE.to_owned();
    let mut name = None;
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--from" => from.clone_from(rest.next().context("`--from` needs an example")?),
            "--name" => name = Some(rest.next().context("`--name` needs a name")?.clone()),
            other if folder.is_none() && !other.starts_with("--") => {
                folder = Some(other.to_owned());
            }
            _ => bail!("{USAGE}"),
        }
    }
    let folder = PathBuf::from(folder.context(USAGE)?);
    let created = starter::create(&folder, &from, name.as_deref())?;
    println!(
        "created {} from {} ({} files): pack id `{}`, name \"{}\"",
        folder.display(),
        created.example,
        created.files.len(),
        created.id,
        created.name
    );
    println!(
        "next: change the aircraft in pack.json and the content in each file, then run `involo-pack check {}`",
        folder.display()
    );
    Ok(true)
}

/// `import-panel <file.svg> [--id <id>] [--width <units>] [--out <file>]`: the
/// panel file a drawing makes, printed or written to `--out` (never over a file that is there).
/// What was left out or guessed goes to standard error.
fn import_panel(args: &[String]) -> Result<bool> {
    let mut file = None;
    let (mut id, mut width, mut out) = (None, None, None);
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let mut value = |what: &str| {
            rest.next()
                .with_context(|| format!("`{arg}` needs {what}"))
                .cloned()
        };
        match arg.as_str() {
            "--id" => id = Some(value("an id")?),
            "--width" => {
                let w = value("a width")?;
                width = Some(
                    w.parse::<f64>()
                        .ok()
                        .filter(|w| w.is_finite() && *w > 0.0)
                        .with_context(|| {
                            format!(
                                "`--width {w}`: give the panel's width in panel units, such as 400"
                            )
                        })?,
                );
            }
            "--out" => out = Some(PathBuf::from(value("a file")?)),
            other if file.is_none() && !other.starts_with("--") => {
                file = Some(PathBuf::from(other));
            }
            _ => bail!("{USAGE}"),
        }
    }
    let file = file.context(USAGE)?;
    let id = import_panel::panel_id(id, &file)?;
    let imported = import_panel::import_file(&file, &id, width)?;
    for warning in &imported.warnings {
        eprintln!("warning: {warning}");
    }
    let Some(out) = out else {
        print!("{}", imported.yaml);
        return Ok(true);
    };
    import_panel::write_new(&out, &imported.yaml)?;
    println!(
        "wrote {}: panel `{id}`, {} sections, {} controls",
        out.display(),
        imported.sections,
        imported.items
    );
    println!(
        "next: give each control its positions, controls and description, list the file in pack.json's `panels`, then run `involo-pack check`"
    );
    Ok(true)
}

/// `explain [<code>]`: what a code means and how to fix it, or every code with its title.
fn explain(code: Option<&str>, json: bool) -> Result<bool> {
    let Some(code) = code else {
        if json {
            let all: Vec<_> = Code::ALL.iter().map(|c| c.info()).collect();
            println!("{}", serde_json::to_string_pretty(&all)?);
        } else {
            for c in Code::ALL {
                println!("{c}  {}", c.info().title);
            }
        }
        return Ok(true);
    };
    let Some(c) = Code::parse(code) else {
        bail!("no code `{code}`: `involo-pack explain` lists every code");
    };
    let info = c.info();
    if json {
        println!("{}", serde_json::to_string_pretty(&info)?);
    } else {
        println!(
            "{}: {}\n\n{}\n\nHow to fix it: {}",
            info.code, info.title, info.explain, info.hint
        );
    }
    Ok(true)
}

/// `describe <file>`: the fields one pack file takes, from its JSON Schema.
fn describe(file: &str, json: bool) -> Result<bool> {
    match involo_pack::describe::describe(file) {
        Ok(d) if json => println!("{}", serde_json::to_string_pretty(&d.schema)?),
        Ok(d) => print!("{}", involo_pack::describe::render(&d)),
        Err(known) => bail!(
            "`{file}` is not a pack file involo-pack knows; it knows {}",
            known.join(", ")
        ),
    }
    Ok(true)
}

/// Prints each step's drafted targets and flags, by step id.
fn suggest_targets(dir: &Path) -> Result<bool> {
    let pack = load_pack_dir(dir).map_err(|e| anyhow::anyhow!("{e}"))?;
    let mut out = serde_json::Map::new();
    for step in pack.checklists.iter().flat_map(|l| &l.steps) {
        if step.controls.is_empty() {
            continue;
        }
        let s = involo_pack::draft_targets::draft_targets(
            &pack.content.panels,
            step,
            &pack.content.labels.position_words,
        );
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

/// `check [--json] <dir>...`: each pack checked (see `check::check_dir`), as text or as JSON.
fn check(args: &[String], parents: &[PathBuf], json_out: bool) -> Result<bool> {
    let mut reports = Vec::new();
    for arg in args {
        for dir in check::pack_dirs(Path::new(arg))? {
            let report = check::check_dir(&dir, &check::places(&dir, parents));
            if !json_out {
                println!("{}", report.text());
            }
            reports.push(report);
        }
    }
    if reports.is_empty() {
        bail!("no packs found in {}", args.join(", "));
    }
    let ok = reports.iter().all(check::PackReport::ok);
    if json_out {
        let packs: Vec<_> = reports
            .iter()
            .map(|r| r.json(&r.dir.to_string_lossy().replace('\\', "/")))
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": ok, "packs": packs }))?
        );
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
    let dirs = check::pack_dirs(Path::new(&parsed.target))?;
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

/// `reference <dir>`: the format reference's pages, written over the Markdown pages there, so a
/// file the format no longer has goes with its page.
fn reference(out: &Path) -> Result<()> {
    std::fs::create_dir_all(out)?;
    for entry in std::fs::read_dir(out).with_context(|| format!("cannot read {}", out.display()))? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "md") {
            std::fs::remove_file(&path)
                .with_context(|| format!("cannot remove {}", path.display()))?;
        }
    }
    let pages = involo_pack::reference::pages();
    for (name, text) in &pages {
        let path = out.join(name);
        std::fs::write(&path, text).with_context(|| format!("cannot write {}", path.display()))?;
    }
    println!("wrote {} reference pages in {}", pages.len(), out.display());
    Ok(())
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

/// `build <dir>... <out>`: the catalog (see `catalog::build`), each pack's result printed.
fn build(packs: &[String], out: &Path, parents: &[PathBuf]) -> Result<bool> {
    let mut dirs = Vec::new();
    for arg in packs {
        let found = check::pack_dirs(Path::new(arg))?;
        if found.is_empty() {
            bail!("no packs found in {arg}");
        }
        dirs.extend(found);
    }
    let report = catalog::build(&dirs, out, &|d| check::places(d, parents))?;
    for outcome in &report.outcomes {
        match outcome {
            catalog::Outcome::Built { file, size, .. } => {
                println!("built {} ({size} bytes)", file.display());
            }
            catalog::Outcome::Library { id } => {
                println!("library {id}: checked, not written (packs extend it)");
            }
            catalog::Outcome::Failed { pack, built, found } => {
                if *built {
                    eprintln!("FAIL {pack}: not built, run `involo-pack check`");
                } else {
                    eprintln!("FAIL {pack}: not built");
                }
                for f in found {
                    eprintln!("  {}", f.text());
                }
            }
        }
    }
    println!("wrote {} ({} packs)", report.index.display(), report.count);
    Ok(report.ok())
}
