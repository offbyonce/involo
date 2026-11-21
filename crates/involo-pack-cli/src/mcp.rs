// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack mcp <folder>`: an MCP server over standard input and output, so a coding agent
//! can learn the pack format and check its work as it writes (decision 0030).
//!
//! The tools are the command's own: `new`, `check`, `build`, `import_panel`, `describe` and
//! `explain` call the same functions the command line does, and the format tools read the same
//! JSON Schemas `involo-pack schema` writes. The resources are the authoring guide and the example
//! packs, built into the command. Every path is inside the folder given ([`Workspace`]), and the
//! server makes no network requests.
//!
//! The protocol: one JSON-RPC message per line. The current revision, 2026-07-28, carries the
//! protocol version on every request (`_meta`) and has `server/discover`; earlier revisions open
//! with an `initialize` handshake instead. The server speaks both ("dual-era"): a request with the
//! version in its `_meta` is served by 2026-07-28, and `initialize` starts a session in the
//! earlier revision it negotiates.

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use involo_pack::Code;
use serde_json::{Map, Value, json};

use crate::workspace::Workspace;
use crate::{catalog, check, import_panel, starter};

mod guide {
    include!(concat!(env!("OUT_DIR"), "/guide.rs"));
}

/// The revisions served by per-request `_meta`, newest first.
pub const MODERN: &[&str] = &["2026-07-28"];
/// The revisions served after an `initialize` handshake, newest first.
pub const LEGACY: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26"];

const VERSION_KEY: &str = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_KEY: &str = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_KEY: &str = "io.modelcontextprotocol/serverInfo";

/// How long a client may keep the tool and resource lists and the resources: they are built into
/// this binary, and change only with it.
const TTL_MS: u64 = 3_600_000;

const INSTRUCTIONS: &str = "Write Involo packs: start one with `new`, read `format_overview` and \
`describe` for the fields each file takes, run `check` after every change and fix each problem \
(`explain` says what a code means), then `build`. Paths are relative to the server's folder. \
Write in your own words: never copy text, tables or layout from manuals, and add no links or \
citations to third-party material.";

/// JSON-RPC and MCP error codes.
const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;
const UNSUPPORTED_VERSION: i64 = -32022;
/// A missing resource in the earlier revisions; 2026-07-28 uses `INVALID_PARAMS`.
const LEGACY_RESOURCE_NOT_FOUND: i64 = -32002;

/// Serves requests from standard input until it closes.
pub fn serve(dir: &Path) -> Result<()> {
    let mut server = Server::new(Workspace::open(dir)?);
    eprintln!(
        "involo-pack mcp: serving {} (MCP {} and, after initialize, {})",
        server.ws.root().display(),
        MODERN.join(", "),
        LEGACY.join(", ")
    );
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.context("cannot read standard input")?;
        if line.trim().is_empty() {
            continue;
        }
        if let Some(reply) = server.handle_line(&line) {
            writeln!(stdout, "{reply}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}

/// Which revision a request is served by.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Era {
    Modern,
    Legacy,
}

/// A JSON-RPC error: its code, message and data.
struct RpcError(i64, String, Option<Value>);

fn invalid(message: impl Into<String>) -> RpcError {
    RpcError(INVALID_PARAMS, message.into(), None)
}

pub struct Server {
    ws: Workspace,
    /// The earlier revision an `initialize` negotiated, if one did.
    legacy: Option<&'static str>,
}

impl Server {
    pub fn new(ws: Workspace) -> Self {
        Self { ws, legacy: None }
    }

    /// The reply to one line, or nothing for a notification.
    pub fn handle_line(&mut self, line: &str) -> Option<Value> {
        let Ok(message) = serde_json::from_str::<Value>(line) else {
            return Some(error_reply(
                &Value::Null,
                RpcError(PARSE_ERROR, "not JSON".into(), None),
            ));
        };
        let id = message.get("id").cloned();
        let method = message.get("method").and_then(Value::as_str);
        let (Some(method), true) = (method, message.get("jsonrpc") == Some(&json!("2.0"))) else {
            return Some(error_reply(
                &id.unwrap_or(Value::Null),
                RpcError(INVALID_REQUEST, "not a JSON-RPC 2.0 request".into(), None),
            ));
        };
        // A notification (initialized, cancelled) needs no reply: every request is answered
        // before the next is read, so there is nothing to cancel.
        let id = id?;
        if !(id.is_string() || id.is_i64() || id.is_u64()) {
            return Some(error_reply(
                &Value::Null,
                RpcError(
                    INVALID_REQUEST,
                    "a request id is a string or an integer".into(),
                    None,
                ),
            ));
        }
        let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
        Some(match self.handle(method, &params) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(e) => error_reply(&id, e),
        })
    }

    fn handle(&mut self, method: &str, params: &Value) -> Result<Value, RpcError> {
        if method == "initialize" {
            return Ok(self.initialize(params));
        }
        let era = self.era(params)?;
        let result = match (method, era) {
            ("server/discover", Era::Modern) => json!({
                "supportedVersions": MODERN,
                "capabilities": capabilities(),
                "instructions": INSTRUCTIONS,
                "ttlMs": TTL_MS,
                "cacheScope": "public",
            }),
            ("ping", Era::Legacy) => json!({}),
            ("tools/list", _) => cacheable(json!({ "tools": tools() }), era),
            ("tools/call", _) => self.call(params)?,
            ("resources/list", _) => cacheable(json!({ "resources": resources() }), era),
            ("resources/read", _) => cacheable(read_resource(params, era)?, era),
            _ => {
                return Err(RpcError(
                    METHOD_NOT_FOUND,
                    format!("no method `{method}`"),
                    None,
                ));
            }
        };
        Ok(match era {
            Era::Modern => complete(result),
            Era::Legacy => result,
        })
    }

    /// The handshake of the earlier revisions: the client's version if it is one of [`LEGACY`],
    /// the newest of them otherwise, as those revisions say.
    fn initialize(&mut self, params: &Value) -> Value {
        let asked = params.get("protocolVersion").and_then(Value::as_str);
        let version = LEGACY
            .iter()
            .find(|v| Some(**v) == asked)
            .copied()
            .unwrap_or(LEGACY[0]);
        self.legacy = Some(version);
        json!({
            "protocolVersion": version,
            "capabilities": capabilities(),
            "serverInfo": server_info(),
            "instructions": INSTRUCTIONS,
        })
    }

    /// The revision a request is served by: the one its `_meta` names, or the session's after
    /// `initialize`.
    fn era(&self, params: &Value) -> Result<Era, RpcError> {
        let meta = params.get("_meta");
        let Some(version) = meta.and_then(|m| m.get(VERSION_KEY)) else {
            if self.legacy.is_some() {
                return Ok(Era::Legacy);
            }
            return Err(invalid(format!(
                "the request has no `_meta` `{VERSION_KEY}`: this server speaks MCP {} with it on every request, or {} after `initialize`",
                MODERN.join(", "),
                LEGACY.join(", ")
            )));
        };
        let Some(version) = version.as_str() else {
            return Err(invalid(format!("`{VERSION_KEY}` is a string")));
        };
        if !MODERN.contains(&version) {
            return Err(RpcError(
                UNSUPPORTED_VERSION,
                "Unsupported protocol version".into(),
                Some(json!({ "supported": MODERN, "requested": version })),
            ));
        }
        if !meta
            .and_then(|m| m.get(CAPABILITIES_KEY))
            .is_some_and(Value::is_object)
        {
            return Err(invalid(format!(
                "the request has no `_meta` `{CAPABILITIES_KEY}`"
            )));
        }
        Ok(Era::Modern)
    }

    /// `tools/call`: an unknown tool or arguments of the wrong shape are protocol errors; a tool
    /// that fails says why in its result, for the agent to fix and retry.
    fn call(&self, params: &Value) -> Result<Value, RpcError> {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("`tools/call` needs the tool's `name`"))?;
        if !TOOLS.iter().any(|t| t.name == name) {
            return Err(invalid(format!("Unknown tool: {name}")));
        }
        let empty = Map::new();
        let args = match params.get("arguments") {
            None | Some(Value::Null) => &empty,
            Some(Value::Object(args)) => args,
            Some(_) => return Err(invalid("`arguments` is an object")),
        };
        Ok(match self.run_tool(name, args) {
            Ok(Output::Data(data)) => json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&data).unwrap_or_default() }],
                "structuredContent": data,
                "isError": false,
            }),
            Ok(Output::Text(text)) => json!({
                "content": [{ "type": "text", "text": text }],
                "isError": false,
            }),
            Err(e) => json!({
                "content": [{ "type": "text", "text": format!("{e:#}") }],
                "isError": true,
            }),
        })
    }

    fn run_tool(&self, name: &str, args: &Map<String, Value>) -> Result<Output> {
        let text = |key: &str| args.get(key).and_then(Value::as_str);
        let need = |key: &str| text(key).with_context(|| format!("`{name}` needs `{key}`"));
        match name {
            "format_overview" => Ok(Output::Data(format_overview())),
            "file_schema" => {
                let file = need("file")?;
                let schema = involo_pack::describe::describe(file)
                    .map_err(|known| unknown_file(file, &known))?
                    .schema;
                Ok(Output::Data(schema))
            }
            "panel_item_kinds" => words_of("panels/<name>.yaml", "PanelItemKind").map(Output::Data),
            "simbrief_sources" => words_of("flight.yaml", "SimbriefSource").map(Output::Data),
            "new" => {
                let folder = self.ws.resolve(need("folder")?)?;
                let from = text("from").unwrap_or(starter::DEFAULT_EXAMPLE);
                let created = starter::create(&folder, from, text("name"))?;
                Ok(Output::Data(json!({
                    "folder": self.ws.show(&created.folder),
                    "id": created.id,
                    "name": created.name,
                    "example": created.example,
                    "files": created.files,
                    "next": "change the aircraft in pack.json and the content in each file, then run `check` on the folder",
                })))
            }
            "check" => {
                let parents = self.paths(args.get("parents"))?;
                let dirs = self.packs(text("path").unwrap_or("."))?;
                let reports: Vec<_> = dirs
                    .iter()
                    .map(|d| check::check_dir(d, &self.ws.places(d, &parents)))
                    .collect();
                let ok = reports.iter().all(check::PackReport::ok);
                let packs: Vec<_> = reports
                    .iter()
                    .map(|r| r.json(&self.ws.show(&r.dir)))
                    .collect();
                Ok(Output::Data(json!({ "ok": ok, "packs": packs })))
            }
            "build" => {
                let out = self.ws.resolve(text("out").unwrap_or("dist"))?;
                let parents = self.paths(args.get("parents"))?;
                let mut dirs = Vec::new();
                let names = match args.get("packs") {
                    None => vec![".".to_owned()],
                    Some(v) => strings(v).context("`packs` is a list of folders")?,
                };
                for name in &names {
                    dirs.extend(self.packs(name)?);
                }
                let report = catalog::build(&dirs, &out, &|d| self.ws.places(d, &parents))?;
                Ok(Output::Data(report.json(|p| self.ws.show(p))))
            }
            "import_panel" => self.import_panel(args).map(Output::Data),
            "describe" => {
                let file = need("file")?;
                let d = involo_pack::describe::describe(file)
                    .map_err(|known| unknown_file(file, &known))?;
                Ok(Output::Text(involo_pack::describe::render(&d)))
            }
            "explain" => match text("code") {
                None => Ok(Output::Data(json!(
                    Code::ALL.iter().map(|c| c.info()).collect::<Vec<_>>()
                ))),
                Some(code) => {
                    let c = Code::parse(code).with_context(|| {
                        format!("no code `{code}`: `explain` without one lists them all")
                    })?;
                    Ok(Output::Data(json!(c.info())))
                }
            },
            _ => bail!("no tool `{name}`"),
        }
    }

    /// `import_panel`: the drawing's panel file, written to `out` or returned.
    fn import_panel(&self, args: &Map<String, Value>) -> Result<Value> {
        let text = |key: &str| args.get(key).and_then(Value::as_str);
        let svg = self
            .ws
            .resolve(text("svg").context("`import_panel` needs `svg`")?)?;
        let out = text("out").map(|o| self.ws.resolve(o)).transpose()?;
        let id = import_panel::panel_id(text("id").map(str::to_owned), &svg)?;
        let width = match args.get("width") {
            None => None,
            Some(w) => Some(
                w.as_f64()
                    .filter(|w| w.is_finite() && *w > 0.0)
                    .context("`width` is the panel's width in panel units, such as 400")?,
            ),
        };
        let imported =
            import_panel::import_file(&svg, &id, text("title").map(str::to_owned), width)?;
        if let Some(out) = &out {
            import_panel::write_new(out, &imported.yaml)?;
        }
        Ok(json!({
            "id": id,
            "file": out.as_deref().map(|o| self.ws.show(o)),
            "yaml": if out.is_none() { Some(&imported.yaml) } else { None },
            "sections": imported.sections,
            "controls": imported.items,
            "warnings": imported.warnings,
        }))
    }

    /// The packs a client names: a pack folder, or a folder of packs, each checked for symlinks
    /// that leave the server's folder.
    fn packs(&self, name: &str) -> Result<Vec<PathBuf>> {
        let dir = self.ws.resolve(name)?;
        let dirs = check::pack_dirs(&dir)?;
        if dirs.is_empty() {
            bail!("no packs in `{name}`: a pack folder holds pack.json");
        }
        for d in &dirs {
            self.ws.check_tree(d)?;
        }
        Ok(dirs)
    }

    /// Folders a client names in a list, such as `parents`.
    fn paths(&self, value: Option<&Value>) -> Result<Vec<PathBuf>> {
        let Some(value) = value else {
            return Ok(Vec::new());
        };
        let names = strings(value).context("`parents` is a list of folders")?;
        names.iter().map(|n| self.ws.resolve(n)).collect()
    }
}

/// What a tool gives: data (also shown as JSON text), or text.
enum Output {
    Data(Value),
    Text(String),
}

fn strings(value: &Value) -> Option<Vec<String>> {
    value
        .as_array()?
        .iter()
        .map(|v| v.as_str().map(str::to_owned))
        .collect()
}

fn unknown_file(file: &str, known: &[&str]) -> anyhow::Error {
    anyhow::anyhow!(
        "`{file}` is not a pack file involo-pack knows; it knows {}",
        known.join(", ")
    )
}

fn error_reply(id: &Value, RpcError(code, message, data): RpcError) -> Value {
    let mut error = json!({ "code": code, "message": message });
    if let Some(data) = data {
        error["data"] = data;
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": error })
}

fn server_info() -> Value {
    json!({ "name": "involo-pack", "version": env!("CARGO_PKG_VERSION") })
}

fn capabilities() -> Value {
    json!({ "tools": {}, "resources": {} })
}

/// A 2026-07-28 result: complete, with the server's name.
fn complete(mut result: Value) -> Value {
    if let Value::Object(map) = &mut result {
        map.insert("resultType".into(), json!("complete"));
        map.insert("_meta".into(), json!({ SERVER_INFO_KEY: server_info() }));
    }
    result
}

/// A list or a resource, with how long a 2026-07-28 client may keep it.
fn cacheable(mut result: Value, era: Era) -> Value {
    if era == Era::Modern
        && let Value::Object(map) = &mut result
    {
        map.insert("ttlMs".into(), json!(TTL_MS));
        map.insert("cacheScope".into(), json!("public"));
    }
    result
}

/// One tool: its name, title, what it does and its arguments.
struct Tool {
    name: &'static str,
    title: &'static str,
    description: &'static str,
    /// `(name, JSON type, required, description)`.
    args: &'static [(&'static str, &'static str, bool, &'static str)],
}

const TOOLS: &[Tool] = &[
    Tool {
        name: "format_overview",
        title: "Pack format overview",
        description: "What a pack folder holds: each file a pack can have, and what it is for. Read this first, then `describe` a file for its fields.",
        args: &[],
    },
    Tool {
        name: "file_schema",
        title: "A pack file's JSON Schema",
        description: "The JSON Schema of one pack file (`flight.yaml`, `pack.json`, `lists/<name>.yaml`, `panels/<name>.yaml`), the same one `involo-pack schema` writes.",
        args: &[(
            "file",
            "string",
            true,
            "The pack file, such as `flight.yaml` or `lists/before-start.yaml`.",
        )],
    },
    Tool {
        name: "panel_item_kinds",
        title: "Panel item kinds",
        description: "Every kind of control or display a panel item can be (`kind` in a panel file), and what each one is.",
        args: &[],
    },
    Tool {
        name: "simbrief_sources",
        title: "SimBrief sources",
        description: "Every value the app reads from a SimBrief plan, which a flight field may name as its source in `flight.yaml`. The list is the app's: a pack chooses among them but cannot add one.",
        args: &[],
    },
    Tool {
        name: "new",
        title: "Start a pack",
        description: "Start a pack in a new or empty folder, copied from an example pack: the folder's name becomes the pack id. The pack has an AGENTS.md with the content rules.",
        args: &[
            (
                "folder",
                "string",
                true,
                "The new pack's folder, inside the server's folder. Its name is the pack id: lower-case letters, digits, dots and dashes.",
            ),
            (
                "from",
                "string",
                false,
                "The example to start from: `example-twin` (the default) or `example-sidestick`.",
            ),
            (
                "name",
                "string",
                false,
                "The pack's name; the id in words otherwise.",
            ),
        ],
    },
    Tool {
        name: "check",
        title: "Check packs",
        description: "Check a pack, or every pack in a folder, as the app does on install. Each problem has a stable code, its file and line, the message and a fix hint; `ok` is false while any error is left. Run it after every change.",
        args: &[
            (
                "path",
                "string",
                false,
                "A pack folder, or a folder of packs; the server's folder when left out.",
            ),
            (
                "parents",
                "array",
                false,
                "Folders of packs to find a parent in, for a pack that extends one; beside the pack is always searched.",
            ),
        ],
    },
    Tool {
        name: "build",
        title: "Build the catalog",
        description: "Check each pack, then write the catalog: one `<id>-<version>.involo-pack` file per pack, and `index.json`. A pack with errors is not written.",
        args: &[
            (
                "packs",
                "array",
                false,
                "Pack folders or folders of packs; the server's folder when left out.",
            ),
            (
                "out",
                "string",
                false,
                "The folder to write the catalog in; `dist` when left out. Pack files already there are replaced.",
            ),
            (
                "parents",
                "array",
                false,
                "Folders of packs to find a parent in.",
            ),
        ],
    },
    Tool {
        name: "import_panel",
        title: "Import a panel drawing",
        description: "Turn an SVG panel drawing into a panel file: groups named `section:<id>` become sections and groups named `<kind>:<LABEL>` controls, where they are drawn. Positions, controls and descriptions are left to fill in; values read from the drawing are marked with a comment to check.",
        args: &[
            (
                "svg",
                "string",
                true,
                "The drawing, inside the server's folder.",
            ),
            (
                "out",
                "string",
                false,
                "The panel file to write, such as `my-pack/panels/overhead.yaml`; never over a file that is there. The file is returned instead when left out.",
            ),
            (
                "id",
                "string",
                false,
                "The panel id; the drawing's file name otherwise.",
            ),
            (
                "title",
                "string",
                false,
                "The panel's title; the id in words otherwise.",
            ),
            (
                "width",
                "number",
                false,
                "The panel's width in panel units; one drawing unit is one panel unit otherwise.",
            ),
        ],
    },
    Tool {
        name: "describe",
        title: "Describe a pack file",
        description: "The fields one pack file takes, from its JSON Schema: each part of the file with its fields' types, whether required, defaults and descriptions.",
        args: &[(
            "file",
            "string",
            true,
            "The pack file, such as `flight.yaml` or `panels/overhead.yaml`.",
        )],
    },
    Tool {
        name: "explain",
        title: "Explain a problem code",
        description: "What a problem code from `check` means and how to fix it; every code with its title when none is given.",
        args: &[("code", "string", false, "The code, such as `P0205`.")],
    },
];

fn tools() -> Vec<Value> {
    TOOLS
        .iter()
        .map(|t| {
            let properties: Map<String, Value> = t
                .args
                .iter()
                .map(|(name, kind, _, description)| {
                    let mut schema = json!({ "type": kind, "description": description });
                    if *kind == "array" {
                        schema["items"] = json!({ "type": "string" });
                    }
                    ((*name).to_owned(), schema)
                })
                .collect();
            let required: Vec<&str> = t.args.iter().filter(|a| a.2).map(|a| a.0).collect();
            json!({
                "name": t.name,
                "title": t.title,
                "description": t.description,
                "inputSchema": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                    "additionalProperties": false,
                },
            })
        })
        .collect()
}

/// Each pack file, its schema and what it is for, from the schemas themselves.
fn format_overview() -> Value {
    let files: Vec<Value> = involo_pack::describe::known_files()
        .into_iter()
        .filter_map(|file| {
            let d = involo_pack::describe::describe(file).ok()?;
            Some(json!({
                "file": file,
                "schema": d.schema_file,
                "description": d.schema.get("description"),
            }))
        })
        .collect();
    json!({
        "pack": "A pack is a folder: pack.json names the pack, its aircraft and its files; each YAML file holds one part of the content. Only the files pack.json names are read.",
        "workflow": ["new", "edit the files", "check", "explain each code until check is ok", "build"],
        "files": files,
    })
}

/// The words a set takes (`kind` in a panel file, a SimBrief source), each with what it means,
/// from the part of the file's schema named `part`.
fn words_of(file: &str, part: &str) -> Result<Value> {
    let d = involo_pack::describe::describe(file)
        .map_err(|_| anyhow::anyhow!("no schema for {file}"))?;
    let part = d
        .parts
        .iter()
        .find(|p| p.name == part)
        .with_context(|| format!("no `{part}` in the {file} schema"))?;
    Ok(json!({
        "description": part.description,
        "values": part
            .values
            .iter()
            .map(|(name, description)| match description {
                Some(d) => json!({ "name": name, "description": d }),
                None => json!({ "name": name }),
            })
            .collect::<Vec<_>>(),
    }))
}

/// Every resource: each guide page, and each example pack's files.
fn resources() -> Vec<Value> {
    let guide = guide::GUIDE.iter().map(|(path, bytes)| {
        json!({
            "uri": format!("involo://guide/{path}"),
            "name": format!("guide/{path}"),
            "title": format!("Pack authoring guide: {path}"),
            "mimeType": mime(path),
            "size": bytes.len(),
        })
    });
    let examples = starter::EXAMPLES.iter().flat_map(|(id, files)| {
        files.iter().map(move |(path, bytes)| {
            json!({
                "uri": format!("involo://examples/{id}/{path}"),
                "name": format!("examples/{id}/{path}"),
                "title": format!("Example pack {id}: {path}"),
                "mimeType": mime(path),
                "size": bytes.len(),
            })
        })
    });
    guide.chain(examples).collect()
}

fn read_resource(params: &Value, era: Era) -> Result<Value, RpcError> {
    let uri = params
        .get("uri")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("`resources/read` needs a `uri`"))?;
    let found = if let Some(path) = uri.strip_prefix("involo://guide/") {
        guide::GUIDE
            .iter()
            .find(|(p, _)| *p == path)
            .map(|(_, b)| *b)
    } else if let Some(rest) = uri.strip_prefix("involo://examples/") {
        rest.split_once('/').and_then(|(id, path)| {
            starter::EXAMPLES
                .iter()
                .find(|(e, _)| *e == id)
                .and_then(|(_, files)| files.iter().find(|(p, _)| *p == path))
                .map(|(_, b)| *b)
        })
    } else {
        None
    };
    let Some(bytes) = found else {
        let code = match era {
            Era::Modern => INVALID_PARAMS,
            Era::Legacy => LEGACY_RESOURCE_NOT_FOUND,
        };
        return Err(RpcError(
            code,
            "Resource not found".into(),
            Some(json!({ "uri": uri })),
        ));
    };
    Ok(json!({
        "contents": [{
            "uri": uri,
            "mimeType": mime(uri),
            "text": String::from_utf8_lossy(bytes),
        }],
    }))
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("md") => "text/markdown",
        Some("json") => "application/json",
        Some("yaml" | "yml") => "application/yaml",
        Some("svg") => "image/svg+xml",
        _ => "text/plain",
    }
}
