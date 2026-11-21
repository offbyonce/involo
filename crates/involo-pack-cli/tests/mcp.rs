// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack mcp` (decision 0030), driven by a scripted client over its standard input and
//! output: an agent's whole round (list, `new`, break, `check`, fix, `build`), version
//! negotiation in both protocol eras, paths kept inside the folder, the schema tool in step with
//! `schemas/`, and no network.

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::path::{Path, PathBuf};
    use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

    use serde_json::{Value, json};

    const VERSION: &str = "2026-07-28";

    /// A running server and the client's end of its pipes.
    struct Client {
        child: Child,
        input: ChildStdin,
        output: BufReader<ChildStdout>,
        next: u64,
    }

    impl Client {
        fn start(folder: &Path) -> Self {
            Self::start_with(Command::new(env!("CARGO_BIN_EXE_involo-pack")), folder)
        }

        fn start_with(mut command: Command, folder: &Path) -> Self {
            let mut child = command
                .args(["mcp", &folder.to_string_lossy()])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let input = child.stdin.take().unwrap();
            let output = BufReader::new(child.stdout.take().unwrap());
            Self {
                child,
                input,
                output,
                next: 0,
            }
        }

        /// Sends one message, and reads one reply line.
        fn send(&mut self, message: &Value) -> Value {
            writeln!(self.input, "{message}").unwrap();
            self.input.flush().unwrap();
            let mut line = String::new();
            self.output.read_line(&mut line).unwrap();
            serde_json::from_str(&line).unwrap_or_else(|e| panic!("{e}: {line:?}"))
        }

        /// A request with no `_meta`, as the earlier revisions send them.
        fn plain(&mut self, method: &str, params: Value) -> Value {
            self.next += 1;
            let id = self.next;
            let mut message = json!({ "jsonrpc": "2.0", "id": id, "method": method });
            message["params"] = params;
            self.send(&message)
        }

        /// A 2026-07-28 request: the version and capabilities in its `_meta`.
        fn request(&mut self, method: &str, mut params: Value) -> Value {
            params["_meta"] = json!({
                "io.modelcontextprotocol/protocolVersion": VERSION,
                "io.modelcontextprotocol/clientInfo": { "name": "test", "version": "1" },
                "io.modelcontextprotocol/clientCapabilities": {},
            });
            self.plain(method, params)
        }

        /// The result of a 2026-07-28 request, which must succeed.
        fn result(&mut self, method: &str, params: Value) -> Value {
            let reply = self.request(method, params);
            let result = reply.get("result").cloned();
            let result = result.unwrap_or_else(|| panic!("{method}: {reply}"));
            assert_eq!(result["resultType"], "complete", "{method}");
            assert_eq!(
                result["_meta"]["io.modelcontextprotocol/serverInfo"]["name"],
                "involo-pack"
            );
            result
        }

        /// A tool's result: `Ok(structured content or text)`, or `Err(its message)`.
        fn tool(&mut self, name: &str, arguments: Value) -> Result<Value, String> {
            let mut params = json!({ "name": name });
            params["arguments"] = arguments;
            let result = self.result("tools/call", params);
            let text = result["content"][0]["text"].as_str().unwrap_or_default();
            if result["isError"] == true {
                return Err(text.to_owned());
            }
            Ok(result
                .get("structuredContent")
                .cloned()
                .unwrap_or_else(|| json!(text)))
        }
    }

    impl Drop for Client {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }

    /// A new, empty folder for one test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-mcp-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("work")).unwrap();
        dir
    }

    fn repo() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    /// The round an agent makes: learn the tools and resources, start a pack, break it, read the
    /// structured error, fix it and build. Returns the problem `check` found.
    fn agent_round(client: &mut Client, work: &Path) -> Value {
        let discover = client.result("server/discover", json!({}));
        assert_eq!(discover["supportedVersions"], json!([VERSION]));
        assert!(discover["capabilities"]["tools"].is_object());

        let tools = client.result("tools/list", json!({}));
        let names: Vec<&str> = tools["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "format_overview",
                "file_schema",
                "panel_item_kinds",
                "simbrief_sources",
                "new",
                "check",
                "build",
                "import_panel",
                "describe",
                "explain"
            ]
        );
        assert!(tools["ttlMs"].is_u64() && tools["cacheScope"] == "public");

        let resources = client.result("resources/list", json!({}));
        let uris: Vec<&str> = resources["resources"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["uri"].as_str().unwrap())
            .collect();
        assert!(uris.contains(&"involo://guide/limits.md"), "{uris:?}");
        assert!(uris.contains(&"involo://examples/example-twin/pack.json"));
        let page = client.result(
            "resources/read",
            json!({ "uri": "involo://guide/limits.md" }),
        );
        assert!(
            page["contents"][0]["text"]
                .as_str()
                .unwrap()
                .contains("# Pack limits")
        );

        let created = client.tool("new", json!({ "folder": "demo" })).unwrap();
        assert_eq!(created["id"], "demo");
        assert!(
            created["files"]
                .as_array()
                .unwrap()
                .contains(&json!("AGENTS.md"))
        );

        let list = work.join("demo/lists/before-start.yaml");
        let good = std::fs::read_to_string(&list).unwrap();
        std::fs::write(
            &list,
            good.replace("controls: [battery]", "controls: [batery]"),
        )
        .unwrap();
        let checked = client.tool("check", json!({ "path": "demo" })).unwrap();
        assert_eq!(checked["ok"], false);
        let issue = checked["packs"][0]["issues"][0].clone();

        std::fs::write(&list, good).unwrap();
        assert_eq!(
            client.tool("check", json!({ "path": "demo" })).unwrap()["ok"],
            true
        );
        let built = client.tool("build", json!({ "packs": ["demo"] })).unwrap();
        assert_eq!(built["ok"], true, "{built}");
        assert_eq!(built["packs"][0]["file"], "dist/demo-0.1.0.involo-pack");
        assert!(work.join("dist/demo-0.1.0.involo-pack").is_file());
        assert!(work.join("dist/index.json").is_file());
        issue
    }

    #[test]
    fn an_agent_starts_a_pack_breaks_it_reads_the_error_fixes_it_and_builds() {
        let dir = scratch("round");
        let work = dir.join("work");
        let mut client = Client::start(&work);
        let issue = agent_round(&mut client, &work);
        assert_eq!(issue["code"], "P0205");
        assert_eq!(issue["severity"], "error");
        assert_eq!(issue["file"], "lists/before-start.yaml");
        // Line 14: `new` leaves out the example's schema link, the line above it.
        assert_eq!(issue["line"], 14);
        assert!(
            issue["message"]
                .as_str()
                .unwrap()
                .contains("unknown control `batery`")
        );
        assert_eq!(
            issue["hint"],
            "Check the spelling against controls.yaml, or add the control there."
        );
        // What the code means, from the same table.
        let explained = client.tool("explain", json!({ "code": "p0205" })).unwrap();
        assert_eq!(explained["code"], "P0205");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_format_tools_answer_from_the_schemas() {
        let dir = scratch("format");
        let mut client = Client::start(&dir.join("work"));
        let overview = client.tool("format_overview", json!({})).unwrap();
        let files = overview["files"].as_array().unwrap();
        assert!(
            files
                .iter()
                .any(|f| f["file"] == "flight.yaml" && f["description"].is_string())
        );
        let kinds = client.tool("panel_item_kinds", json!({})).unwrap();
        let kinds: Vec<&str> = kinds["values"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v["name"].as_str().unwrap())
            .collect();
        assert_eq!(kinds.len(), 13, "{kinds:?}");
        assert!(kinds.contains(&"legend_pushbutton"));
        let sources = client.tool("simbrief_sources", json!({})).unwrap();
        assert!(
            sources["values"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["name"] == "origin")
        );
        let described = client
            .tool("describe", json!({ "file": "flight.yaml" }))
            .unwrap();
        assert!(described.as_str().unwrap().contains("flight.yaml"));
        let unknown = client
            .tool("describe", json!({ "file": "nope.yaml" }))
            .unwrap_err();
        assert!(unknown.contains("it knows pack.json"), "{unknown}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_schema_tool_serves_exactly_the_schemas_in_the_repository() {
        let dir = scratch("schemas");
        let mut client = Client::start(&dir.join("work"));
        let overview = client.tool("format_overview", json!({})).unwrap();
        let mut served = Vec::new();
        for file in overview["files"].as_array().unwrap() {
            let name = file["file"].as_str().unwrap();
            let schema_file = file["schema"].as_str().unwrap();
            let schema = client.tool("file_schema", json!({ "file": name })).unwrap();
            let text = std::fs::read_to_string(repo().join("schemas").join(schema_file)).unwrap();
            let committed: Value = serde_json::from_str(&text).unwrap();
            assert_eq!(schema, committed, "{name} ({schema_file})");
            served.push(schema_file.to_owned());
        }
        // Every committed schema is one the tool serves.
        let mut committed: Vec<String> = std::fs::read_dir(repo().join("schemas"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        committed.sort();
        served.sort();
        assert_eq!(served, committed);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn version_negotiation_follows_both_protocol_eras() {
        let dir = scratch("versions");
        let mut client = Client::start(&dir.join("work"));
        // 2026-07-28: the version rides on every request. One the server doesn't speak is
        // refused with the versions it does, and so is a request without one.
        let reply = client.send(&json!({
            "jsonrpc": "2.0", "id": "a", "method": "tools/list",
            "params": { "_meta": {
                "io.modelcontextprotocol/protocolVersion": "1900-01-01",
                "io.modelcontextprotocol/clientCapabilities": {},
            } },
        }));
        assert_eq!(
            reply["error"],
            json!({
                "code": -32022,
                "message": "Unsupported protocol version",
                "data": { "supported": [VERSION], "requested": "1900-01-01" },
            })
        );
        assert_eq!(reply["id"], "a");
        let reply = client.plain("tools/list", json!({}));
        assert_eq!(reply["error"]["code"], -32602, "{reply}");
        assert!(
            reply["error"]["message"]
                .as_str()
                .unwrap()
                .contains("initialize")
        );
        let reply = client.plain(
            "tools/list",
            json!({ "_meta": { "io.modelcontextprotocol/protocolVersion": VERSION } }),
        );
        assert_eq!(
            reply["error"]["code"], -32602,
            "clientCapabilities is required"
        );
        // A missing resource is Invalid Params in 2026-07-28.
        let reply = client.request("resources/read", json!({ "uri": "involo://guide/nope.md" }));
        assert_eq!(reply["error"]["code"], -32602);
        assert_eq!(reply["error"]["data"]["uri"], "involo://guide/nope.md");
        // `ping` is gone from 2026-07-28.
        assert_eq!(client.request("ping", json!({}))["error"]["code"], -32601);

        // The earlier revisions: `initialize` answers with the client's version when the server
        // speaks it, and with its newest otherwise.
        let reply = client.plain(
            "initialize",
            json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "old", "version": "1" } }),
        );
        assert_eq!(reply["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(reply["result"]["serverInfo"]["name"], "involo-pack");
        assert!(reply["result"]["capabilities"]["tools"].is_object());
        let mut old = Client::start(&dir.join("work"));
        let reply = old.plain(
            "initialize",
            json!({ "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "old", "version": "1" } }),
        );
        assert_eq!(reply["result"]["protocolVersion"], "2025-11-25");
        // The initialized notification gets no reply; the next line answers the next request.
        writeln!(
            old.input,
            "{}",
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })
        )
        .unwrap();
        assert_eq!(old.plain("ping", json!({}))["result"], json!({}));
        // After `initialize`, requests without `_meta` are served the earlier way: no
        // `resultType`, and the earlier code for a missing resource.
        let tools = old.plain("tools/list", json!({}));
        assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 10);
        assert!(tools["result"].get("resultType").is_none());
        let reply = old.plain("resources/read", json!({ "uri": "involo://nope" }));
        assert_eq!(reply["error"]["code"], -32002);
        let checked = old.plain(
            "tools/call",
            json!({ "name": "explain", "arguments": { "code": "P0205" } }),
        );
        assert_eq!(checked["result"]["structuredContent"]["code"], "P0205");
        // A modern request is still served by its own `_meta`.
        assert!(
            old.request("server/discover", json!({}))["result"]["supportedVersions"].is_array()
        );
        // Not JSON, and an unknown method.
        assert_eq!(old.send(&json!("x"))["error"]["code"], -32600);
        assert_eq!(old.plain("nope/nope", json!({}))["error"]["code"], -32601);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// One raw 2026-07-28 reply for each kind of result the server gives, by name.
    fn every_modern_result(client: &mut Client) -> Vec<(&'static str, Value)> {
        let mut call = |name: &'static str, method: &str, params: Value| {
            let reply = client.request(method, params);
            let result = reply.get("result").cloned();
            (name, result.unwrap_or_else(|| panic!("{name}: {reply}")))
        };
        vec![
            call("server/discover", "server/discover", json!({})),
            call("tools/list", "tools/list", json!({})),
            call(
                "tools/call",
                "tools/call",
                json!({ "name": "explain", "arguments": { "code": "P0205" } }),
            ),
            call(
                "tools/call (a failing tool)",
                "tools/call",
                json!({ "name": "explain", "arguments": { "code": "nope" } }),
            ),
            call(
                "tools/call (text)",
                "tools/call",
                json!({ "name": "describe", "arguments": { "file": "flight.yaml" } }),
            ),
            call("resources/list", "resources/list", json!({})),
            call(
                "resources/read",
                "resources/read",
                json!({ "uri": "involo://examples/example-twin/pack.json" }),
            ),
        ]
    }

    #[test]
    fn every_2026_07_28_result_is_complete() {
        let dir = scratch("result-type");
        let mut client = Client::start(&dir.join("work"));
        for (name, result) in every_modern_result(&mut client) {
            assert_eq!(result["resultType"], "complete", "{name}: {result}");
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn lists_and_resources_say_how_long_they_may_be_kept() {
        let dir = scratch("cacheable");
        let mut client = Client::start(&dir.join("work"));
        for (name, result) in every_modern_result(&mut client) {
            if ["tools/list", "resources/list", "resources/read"].contains(&name) {
                assert_eq!(result["ttlMs"], 3_600_000, "{name}");
                assert_eq!(result["cacheScope"], "public", "{name}");
            }
        }
        // The earlier revisions have neither field.
        let mut old = Client::start(&dir.join("work"));
        old.plain("initialize", json!({ "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": { "name": "old", "version": "1" } }));
        let tools = old.plain("tools/list", json!({}));
        assert!(
            tools["result"].get("ttlMs").is_none() && tools["result"].get("cacheScope").is_none()
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_missing_resource_is_invalid_params_with_its_uri() {
        let dir = scratch("missing");
        let mut client = Client::start(&dir.join("work"));
        for uri in [
            "involo://guide/nope.md",
            "involo://examples/example-twin/nope.yaml",
            "involo://examples/nope/pack.json",
            "file:///etc/hostname",
        ] {
            let reply = client.request("resources/read", json!({ "uri": uri }));
            assert_eq!(
                reply["error"],
                json!({ "code": -32602, "message": "Resource not found", "data": { "uri": uri } }),
                "{uri}"
            );
            assert!(reply.get("result").is_none(), "never an empty `contents`");
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn ping_is_only_for_clients_of_the_earlier_revisions() {
        let dir = scratch("ping");
        let mut client = Client::start(&dir.join("work"));
        let reply = client.request("ping", json!({}));
        assert_eq!(reply["error"]["code"], -32601, "{reply}");
        assert_eq!(reply["error"]["message"], "no method `ping`");
        let mut old = Client::start(&dir.join("work"));
        old.plain("initialize", json!({ "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": { "name": "old", "version": "1" } }));
        assert_eq!(
            old.plain("ping", json!({})),
            json!({ "jsonrpc": "2.0", "id": 2, "result": {} })
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn tools_are_listed_in_one_fixed_order() {
        let dir = scratch("order");
        let names = |client: &mut Client| -> Vec<String> {
            client.result("tools/list", json!({}))["tools"]
                .as_array()
                .unwrap()
                .iter()
                .map(|t| t["name"].as_str().unwrap().to_owned())
                .collect()
        };
        let mut first = Client::start(&dir.join("work"));
        let order = names(&mut first);
        assert_eq!(
            order,
            [
                "format_overview",
                "file_schema",
                "panel_item_kinds",
                "simbrief_sources",
                "new",
                "check",
                "build",
                "import_panel",
                "describe",
                "explain"
            ]
        );
        // The same list on every request, after other calls, and from a new server.
        first.tool("new", json!({ "folder": "demo" })).unwrap();
        first.tool("check", json!({ "path": "demo" })).unwrap();
        let whole = first.result("tools/list", json!({}))["tools"].clone();
        assert_eq!(names(&mut first), order);
        let mut second = Client::start(&dir.join("work"));
        assert_eq!(second.result("tools/list", json!({}))["tools"], whole);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn every_2026_07_28_result_names_the_server() {
        let dir = scratch("server-info");
        let mut client = Client::start(&dir.join("work"));
        for (name, result) in every_modern_result(&mut client) {
            assert_eq!(
                result["_meta"]["io.modelcontextprotocol/serverInfo"],
                json!({ "name": "involo-pack", "version": env!("CARGO_PKG_VERSION") }),
                "{name}: {result}"
            );
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn paths_outside_the_folder_are_refused() {
        let dir = scratch("paths");
        let work = dir.join("work");
        std::fs::create_dir_all(dir.join("outside")).unwrap();
        std::fs::write(dir.join("outside/panel.svg"), "<svg/>").unwrap();
        let mut client = Client::start(&work);
        for folder in ["../escaped", "/tmp/escaped", "demo/../../escaped"] {
            let refused = client.tool("new", json!({ "folder": folder })).unwrap_err();
            assert!(refused.starts_with("refused"), "{folder}: {refused}");
        }
        assert!(!dir.join("escaped").exists());
        let refused = client.tool("check", json!({ "path": ".." })).unwrap_err();
        assert!(refused.contains("`..`"), "{refused}");
        let refused = client
            .tool("build", json!({ "packs": ["."], "out": "../dist" }))
            .unwrap_err();
        assert!(refused.starts_with("refused"), "{refused}");

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            // A symlinked folder that leads out.
            symlink(dir.join("outside"), work.join("out")).unwrap();
            let refused = client
                .tool("new", json!({ "folder": "out/demo" }))
                .unwrap_err();
            assert!(refused.contains("symlink"), "{refused}");
            let refused = client
                .tool("import_panel", json!({ "svg": "out/panel.svg" }))
                .unwrap_err();
            assert!(refused.contains("symlink"), "{refused}");
            // A pack with a file that is a symlink out of the folder is not read.
            client.tool("new", json!({ "folder": "demo" })).unwrap();
            std::fs::write(dir.join("outside/glossary.yaml"), "terms: []\n").unwrap();
            std::fs::remove_file(work.join("demo/glossary.yaml")).unwrap();
            symlink(
                dir.join("outside/glossary.yaml"),
                work.join("demo/glossary.yaml"),
            )
            .unwrap();
            let refused = client.tool("check", json!({ "path": "demo" })).unwrap_err();
            assert!(
                refused.contains("refused demo/glossary.yaml: it is a symlink"),
                "{refused}"
            );
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_server_reads_and_writes_no_network() {
        // The code: no networking in the crates the server is built from.
        for krate in [
            "involo-pack-cli",
            "involo-pack",
            "involo-checklist-core",
            "involo-pack-overlap",
        ] {
            let src = repo().join("crates").join(krate).join("src");
            for file in rust_files(&src) {
                let text = std::fs::read_to_string(&file).unwrap();
                for word in [
                    "std::net",
                    "TcpStream",
                    "TcpListener",
                    "UdpSocket",
                    "ToSocketAddrs",
                ] {
                    assert!(!text.contains(word), "{} uses {word}", file.display());
                }
            }
        }
        // Its dependencies: none of the crates that open connections, anywhere below it.
        let lock = std::fs::read_to_string(repo().join("Cargo.lock")).unwrap();
        let deps = dependencies(&lock, "involo-pack-cli");
        for network in [
            "reqwest",
            "hyper",
            "ureq",
            "curl",
            "tokio",
            "mio",
            "socket2",
            "h2",
            "rustls",
            "native-tls",
            "isahc",
            "attohttpc",
            "tungstenite",
        ] {
            assert!(
                !deps.contains(network),
                "involo-pack-cli depends on {network}"
            );
        }
        // And a whole round with no network at all, where the system lets a test turn it off.
        let offline = Command::new("unshare")
            .args(["-rn", "true"])
            .status()
            .is_ok_and(|s| s.success());
        if !offline {
            eprintln!("skipped the run without a network: `unshare -rn` is not allowed here");
            return;
        }
        let dir = scratch("offline");
        let work = dir.join("work");
        let mut command = Command::new("unshare");
        command.args(["-rn", env!("CARGO_BIN_EXE_involo-pack")]);
        let mut client = Client::start_with(command, &work);
        agent_round(&mut client, &work);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn rust_files(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                out.extend(rust_files(&path));
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path);
            }
        }
        out
    }

    /// Every package `root` depends on in `Cargo.lock`, directly or below (development
    /// dependencies included, which only makes the check stricter).
    fn dependencies(lock: &str, root: &str) -> std::collections::BTreeSet<String> {
        let mut deps_of = std::collections::BTreeMap::<String, Vec<String>>::new();
        for package in lock.split("[[package]]").skip(1) {
            let name = package
                .lines()
                .find_map(|l| l.strip_prefix("name = "))
                .unwrap_or_default()
                .trim_matches('"')
                .to_owned();
            let deps: Vec<String> = package
                .split_once("dependencies = [")
                .map(|(_, rest)| {
                    rest.split(']')
                        .next()
                        .unwrap_or_default()
                        .split(',')
                        .filter_map(|d| d.trim().trim_matches('"').split(' ').next())
                        .filter(|d| !d.is_empty())
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            deps_of.entry(name).or_default().extend(deps);
        }
        let mut seen = std::collections::BTreeSet::new();
        let mut queue = vec![root.to_owned()];
        while let Some(name) = queue.pop() {
            for dep in deps_of.get(&name).into_iter().flatten() {
                if seen.insert(dep.clone()) {
                    queue.push(dep.clone());
                }
            }
        }
        assert!(seen.contains("involo-pack"), "the lock file was read");
        seen
    }
}
