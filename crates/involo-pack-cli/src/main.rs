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
//! `involo-pack import-panel <file.svg> [--id <id>] [--title <title>] [--width <units>] [--out <file>]`
//! a panel drawn in a vector drawing tool, as a panel file for the author to finish: groups named
//! `section:<id>` and `<kind>:<LABEL>` become sections and controls where they are drawn. Prints
//! the file, or writes it to `--out`.
//! `involo-pack schema <dir>`    write every JSON Schema into `<dir>` (`just schemas`).
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
use involo_pack::locate::{Located, locate, locate_error};
use involo_pack::{
    CatalogEntry, Code, FlatPack, Issue, PackKind, ResolveError, Severity, load_pack_dir, resolve,
    sha256_hex, validate_pack,
};
use involo_pack_overlap::{
    AllowList, REFS_VARIABLE, check_refs_location, find_overlaps, load_references, repo_roots,
};
use serde_json::json;

mod import_panel;

mod examples {
    include!(concat!(env!("OUT_DIR"), "/examples.rs"));
}

const USAGE: &str = "usage:\n  involo-pack new <folder> [--from <example>] [--name <name>]\n  involo-pack check [--json] <pack-dir | packs-dir>... [--parents <dir>]\n  involo-pack explain [--json] [<code>]\n  involo-pack describe [--json] <file>\n  involo-pack import-panel <file.svg> [--id <id>] [--title <title>] [--width <units>] [--out <file>]\n  involo-pack schema <out-dir>\n  involo-pack build <pack-dir | packs-dir>... <out-dir> [--parents <dir>]\n  involo-pack overlap <pack-dir | packs-dir> [--refs <folder>] [--allow <file>]\n  involo-pack suggest-targets <pack-dir>\n  involo-pack terms [--json] <pack-dir>";

/// The example `new` starts from when `--from` names none.
const DEFAULT_EXAMPLE: &str = "example-twin";

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

/// `new <folder> [--from <example>] [--name <name>]`: copies an example pack into a new folder,
/// with the example's id replaced by the folder's name and its name by `--name` (the folder's
/// name in words otherwise). The schema links the examples carry point into the repository, so
/// they are left out.
fn new(args: &[String]) -> Result<bool> {
    let mut folder = None;
    let mut from = DEFAULT_EXAMPLE.to_owned();
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
    let id = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    if !involo_pack::validate::valid_pack_id(&id) {
        bail!(
            "`{id}` can't be a pack id, which the folder's name becomes: use lower-case letters, digits, dots and dashes, such as `my-twin`"
        );
    }
    let starters: Vec<&str> = examples::EXAMPLES
        .iter()
        .filter(|(_, files)| !extends_another(files))
        .map(|(id, _)| *id)
        .collect();
    let Some((example, files)) = examples::EXAMPLES.iter().find(|(e, _)| *e == from) else {
        if starters.is_empty() {
            bail!("this build of involo-pack has no example packs to start from");
        }
        bail!("no example `{from}`: choose one of {}", starters.join(", "));
    };
    if extends_another(files) {
        bail!(
            "`{example}` extends another pack, so it can't start one on its own: choose one of {}",
            starters.join(", ")
        );
    }
    if folder.exists()
        && std::fs::read_dir(&folder)
            .with_context(|| format!("cannot read {}", folder.display()))?
            .next()
            .is_some()
    {
        bail!("{} already exists and is not empty", folder.display());
    }
    let manifest = files
        .iter()
        .find(|(path, _)| *path == "pack.json")
        .context("the example has no pack.json")?;
    let old_name = serde_json::from_slice::<serde_json::Value>(manifest.1)?["name"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let name = name.unwrap_or_else(|| words(&id));
    for (path, bytes) in *files {
        let text =
            std::str::from_utf8(bytes).with_context(|| format!("{example}/{path} is not text"))?;
        let text = starter_text(path, text, example, &id, &old_name, &name);
        let dest = folder.join(path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("cannot create {}", parent.display()))?;
        }
        std::fs::write(&dest, text).with_context(|| format!("cannot write {}", dest.display()))?;
    }
    println!(
        "created {} from {example} ({} files): pack id `{id}`, name \"{name}\"",
        folder.display(),
        files.len()
    );
    println!(
        "next: change the aircraft in pack.json and the content in each file, then run `involo-pack check {}`",
        folder.display()
    );
    Ok(true)
}

/// `import-panel <file.svg> [--id <id>] [--title <title>] [--width <units>] [--out <file>]`: the
/// panel file a drawing makes, printed or written to `--out` (never over a file that is there).
/// What was left out or guessed goes to standard error.
fn import_panel(args: &[String]) -> Result<bool> {
    let mut file = None;
    let (mut id, mut title, mut width, mut out) = (None, None, None, None);
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let mut value = |what: &str| {
            rest.next()
                .with_context(|| format!("`{arg}` needs {what}"))
                .cloned()
        };
        match arg.as_str() {
            "--id" => id = Some(value("an id")?),
            "--title" => title = Some(value("a title")?),
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
    let stem = file
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let id = id.unwrap_or_else(|| import_panel::slug(&stem));
    if !involo_pack::validate::valid_pack_id(&id) || id.contains('.') {
        bail!(
            "`{id}` can't be a panel id: use lower-case letters, digits and dashes, such as `overhead`, with `--id`"
        );
    }
    let size = std::fs::metadata(&file)
        .with_context(|| format!("cannot read {}", file.display()))?
        .len();
    let refused = |why: String| anyhow::anyhow!("refused {}: {why}", file.display());
    if size > import_panel::MAX_BYTES {
        return Err(refused(format!(
            "it is over {} MB; a panel drawing is far smaller",
            import_panel::MAX_BYTES / 1024 / 1024
        )));
    }
    let text = std::fs::read_to_string(&file)
        .with_context(|| format!("cannot read {} as text", file.display()))?;
    let opts = import_panel::Options {
        id: id.clone(),
        title,
        width,
        source: file
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    };
    let imported = import_panel::import(&text, &opts).map_err(|e| refused(e.to_string()))?;
    for warning in &imported.warnings {
        eprintln!("warning: {warning}");
    }
    let Some(out) = out else {
        print!("{}", imported.yaml);
        return Ok(true);
    };
    if out.exists() {
        bail!(
            "{} is already there; choose another file or remove it first",
            out.display()
        );
    }
    std::fs::write(&out, &imported.yaml)
        .with_context(|| format!("cannot write {}", out.display()))?;
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

/// Whether an example's `pack.json` names a parent: such a pack can't start one alone.
fn extends_another(files: &[(&str, &[u8])]) -> bool {
    files
        .iter()
        .find(|(path, _)| *path == "pack.json")
        .and_then(|(_, bytes)| serde_json::from_slice::<serde_json::Value>(bytes).ok())
        .and_then(|m| {
            m.get("extends")
                .and_then(|e| e.as_object().map(|e| !e.is_empty()))
        })
        .unwrap_or(false)
}

/// A pack id in words, for its name: `my-twin` → `My twin`.
fn words(id: &str) -> String {
    let spaced = id.replace(['-', '.'], " ");
    let mut chars = spaced.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

/// One of an example's files as a new pack's: its id and name replaced, and its schema link (a
/// path into the repository) left out.
fn starter_text(
    path: &str,
    text: &str,
    example: &str,
    id: &str,
    old_name: &str,
    name: &str,
) -> String {
    let link = if path == "pack.json" {
        "\"$schema\""
    } else {
        "# yaml-language-server:"
    };
    let mut out = text
        .lines()
        .filter(|l| !l.trim_start().starts_with(link))
        .fold(String::with_capacity(text.len()), |mut out, l| {
            out.push_str(l);
            out.push('\n');
            out
        });
    out = replace_id(&out, example, id);
    if !old_name.is_empty() {
        out = out.replace(old_name, name);
    }
    out
}

/// `text` with every whole `from` id replaced by `to`: `example-twin.before-start.battery` and
/// `"example-twin"` change, `example-twin-lr` doesn't.
fn replace_id(text: &str, from: &str, to: &str) -> String {
    let part = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find(from) {
        out.push_str(&rest[..pos]);
        let before = out.chars().next_back();
        let after = rest[pos + from.len()..].chars().next();
        out.push_str(if before.is_some_and(part) || after.is_some_and(part) {
            from
        } else {
            to
        });
        rest = &rest[pos + from.len()..];
    }
    out.push_str(rest);
    out
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

/// The pack folder's YAML and JSON files, `(path in the folder with /, text)`, `pack.json` first:
/// where the checks' problems are looked for.
fn source_files(dir: &Path) -> Vec<(String, String)> {
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
struct Found {
    code: Code,
    severity: Severity,
    place: Located,
    at: String,
    message: String,
}

impl Found {
    fn of_issue(issue: Issue, files: &[(String, String)]) -> Self {
        Self {
            code: issue.code,
            severity: issue.severity,
            place: locate(files, &issue),
            at: issue.at,
            message: issue.message,
        }
    }

    fn of_error(dir: &Path, e: &ResolveError) -> Self {
        Self {
            code: e.code(),
            severity: Severity::Error,
            place: locate_error(dir, e),
            at: String::new(),
            message: e.to_string(),
        }
    }

    /// `error P0202: lists/a.yaml:12: <where>: <what>`, and the hint on the next line.
    fn text(&self) -> String {
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

    fn json(&self) -> serde_json::Value {
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

fn check(args: &[String], parents: &[PathBuf], json_out: bool) -> Result<bool> {
    let mut ok = true;
    let mut reports = Vec::new();
    for arg in args {
        for dir in pack_dirs(arg)? {
            let (id, version, summary, found) = match resolve(&dir, parents) {
                Err(e) => (None, None, None, vec![Found::of_error(&dir, &e)]),
                Ok(built) => {
                    let pack = built.pack;
                    let files = source_files(&dir);
                    let found: Vec<Found> =
                        involo_pack::resolve::attribute(validate_pack(&pack), &built.touched)
                            .into_iter()
                            .map(|i| Found::of_issue(i, &files))
                            .collect();
                    let steps: usize = pack.checklists.iter().map(|c| c.steps.len()).sum();
                    let summary = format!("{} checklists, {steps} steps", pack.checklists.len());
                    (
                        Some(pack.manifest.id.clone()),
                        Some(pack.manifest.version.to_string()),
                        Some(summary),
                        found,
                    )
                }
            };
            let pack_ok = !found.iter().any(|f| f.severity == Severity::Error);
            ok &= pack_ok;
            if !json_out {
                let status = if pack_ok { "ok  " } else { "FAIL" };
                match (&id, &version, &summary) {
                    (Some(id), Some(version), Some(summary)) => {
                        println!("{status} {id} {version} ({summary})");
                    }
                    _ => println!("{status} {}", dir.display()),
                }
                for f in &found {
                    println!("  {}", f.text());
                }
            }
            reports.push(json!({
                "folder": dir.to_string_lossy().replace('\\', "/"),
                "id": id,
                "version": version,
                "ok": pack_ok,
                "issues": found.iter().map(Found::json).collect::<Vec<_>>(),
            }));
        }
    }
    if reports.is_empty() {
        bail!("no packs found in {}", args.join(", "));
    }
    if json_out {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": ok, "packs": reports }))?
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

/// Check every pack, then write the catalog into `out` (decision 0028): each pack, built over its
/// parents, as `<id>-<version>.involo-pack`, and `index.json` with an entry for each, in the order
/// given. Pack files already in `out` are removed first. A pack with errors is not written; nor is
/// a library, which is only ever a parent.
fn build(packs: &[String], out: &Path, parents: &[PathBuf]) -> Result<bool> {
    let mut dirs = Vec::new();
    for arg in packs {
        let found = pack_dirs(arg)?;
        if found.is_empty() {
            bail!("no packs found in {arg}");
        }
        dirs.extend(found);
    }
    std::fs::create_dir_all(out).with_context(|| format!("cannot create {}", out.display()))?;
    // The catalog is what this build writes: pack files left from an earlier one go.
    for entry in std::fs::read_dir(out).with_context(|| format!("cannot read {}", out.display()))? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "involo-pack") {
            std::fs::remove_file(&path)
                .with_context(|| format!("cannot remove {}", path.display()))?;
        }
    }
    let mut ok = true;
    let mut index = Vec::new();
    for dir in dirs {
        let built = match resolve(&dir, parents) {
            Ok(built) => built,
            Err(e) => {
                ok = false;
                eprintln!(
                    "FAIL {}: not built\n  {}",
                    dir.display(),
                    Found::of_error(&dir, &e).text()
                );
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
            let files = source_files(&dir);
            for issue in errors {
                eprintln!("  {}", Found::of_issue(issue, &files).text());
            }
            continue;
        }
        let m = pack.manifest.clone();
        let (PackKind::Aircraft, Some(aircraft)) = (m.kind, m.aircraft) else {
            println!("library {}: checked, not written (packs extend it)", m.id);
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
        println!("built {} ({} bytes)", path.display(), json.len());
        index.push(entry);
    }
    let path = out.join("index.json");
    std::fs::write(&path, serde_json::to_string(&index)?)
        .with_context(|| format!("cannot write {}", path.display()))?;
    println!("wrote {} ({} packs)", path.display(), index.len());
    Ok(ok)
}

/// A pack's file name in the catalog: `<id>-<version>.involo-pack`, beside `index.json`.
fn catalog_file(entry: &CatalogEntry) -> String {
    format!("{}-{}.involo-pack", entry.id, entry.version)
}
