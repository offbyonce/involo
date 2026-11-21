// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack new`: a starter pack copied from an example built into the command, with the
//! example's id and name replaced, and an `AGENTS.md` for the person or agent who writes it
//! (decision 0030). The command line and the MCP server's `new` tool both call [`create`].

use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

mod examples {
    include!(concat!(env!("OUT_DIR"), "/examples.rs"));
}

pub use examples::EXAMPLES;

/// The example `new` starts from when none is named.
pub const DEFAULT_EXAMPLE: &str = "example-twin";

/// The `AGENTS.md` written into every starter pack, with `{name}` and `{id}` filled in: where to
/// check work and learn the format, and the content rules in short (decision 0030).
const AGENTS_MD: &str = "# Writing this pack

This folder is an Involo pack, {name} (`{id}`): checklists, flows and panels for one aircraft,
as data. The app never connects to the simulator.

## Check as you go

- After every change, run `involo-pack check .`. Fix every error; `involo-pack explain <code>`
  says what a code means and how to fix it.
- `involo-pack describe <file>` lists the fields a file takes (`flight.yaml`, `lists/x.yaml`).
- `involo-pack import-panel <drawing.svg>` turns a drawn panel into a panel file.
- With an MCP client, run `involo-pack mcp` on this folder or the folder that holds it: the same
  commands as tools, plus the format, the schemas, the guide and the example packs.
- The guide: the server's `involo://guide/` resources, or `docs/packs/` in the Involo repository.

## Content rules

- Facts are checked against the vendor's documentation, then written in your own words from your
  own flow structure. Never copy or closely paraphrase text, tables, diagrams or layout.
- No citations and no links to third-party material. Each list's `basis` names only the kind of
  material it was checked against.
- Never add images, screenshots, PDFs or other files from an aircraft developer, manufacturer or
  simulator. Switch names, positions and values are facts and are fine.
- Label systems content as real aircraft, simulator model, or both.
- American English.
";

/// A pack `new` made.
#[derive(Debug)]
pub struct Created {
    pub folder: PathBuf,
    pub id: String,
    pub name: String,
    pub example: String,
    /// Its files, as paths in the folder.
    pub files: Vec<String>,
}

/// The examples a pack can start from: those that don't extend another.
pub fn starters() -> Vec<&'static str> {
    EXAMPLES
        .iter()
        .filter(|(_, files)| !extends_another(files))
        .map(|(id, _)| *id)
        .collect()
}

/// Copies the example `from` into `folder`, which must be missing or empty: its id becomes the
/// folder's name, and its name `name` (the id in words otherwise). The schema links the examples
/// carry point into the repository, so they are left out.
pub fn create(folder: &Path, from: &str, name: Option<&str>) -> Result<Created> {
    let id = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    if !involo_pack::validate::valid_pack_id(&id) {
        bail!(
            "`{id}` can't be a pack id, which the folder's name becomes: use lower-case letters, digits, dots and dashes, such as `my-twin`"
        );
    }
    let starters = starters();
    let Some((example, files)) = EXAMPLES.iter().find(|(e, _)| *e == from) else {
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
        && std::fs::read_dir(folder)
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
    let name = name.map_or_else(|| words(&id), str::to_owned);
    let mut written = Vec::new();
    let agents = AGENTS_MD.replace("{name}", &name).replace("{id}", &id);
    let texts = files
        .iter()
        .map(|(path, bytes)| {
            let text = std::str::from_utf8(bytes)
                .with_context(|| format!("{example}/{path} is not text"))?;
            Ok((
                (*path).to_owned(),
                starter_text(path, text, example, &id, &old_name, &name),
            ))
        })
        .chain(std::iter::once(Ok(("AGENTS.md".to_owned(), agents))))
        .collect::<Result<Vec<_>>>()?;
    for (path, text) in texts {
        let dest = folder.join(&path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("cannot create {}", parent.display()))?;
        }
        std::fs::write(&dest, text).with_context(|| format!("cannot write {}", dest.display()))?;
        written.push(path);
    }
    Ok(Created {
        folder: folder.to_path_buf(),
        id,
        name,
        example: (*example).to_owned(),
        files: written,
    })
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

/// An id in words, for a name or title: `my-twin` → `My twin`.
pub fn words(id: &str) -> String {
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
