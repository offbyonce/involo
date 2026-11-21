// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The authoring commands (decision 0030), run as the real `involo-pack`: `new` starts a pack that
//! passes `check`; `check` gives every problem a code, a file, a line and a hint, in text and in
//! `--json`; `explain` knows every code; `describe` lists a file's fields as its schema has them.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};

    use involo_pack::Code;

    fn run(args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .args(args)
            .output()
            .unwrap()
    }

    fn stdout(o: &Output) -> String {
        String::from_utf8(o.stdout.clone()).unwrap()
    }

    fn stderr(o: &Output) -> String {
        String::from_utf8(o.stderr.clone()).unwrap()
    }

    /// A new, empty folder for one test.
    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("pack-authoring-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn copy(from: &Path, to: &Path) {
        std::fs::create_dir_all(to).unwrap();
        for entry in std::fs::read_dir(from).unwrap() {
            let entry = entry.unwrap();
            let target = to.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy(&entry.path(), &target);
            } else {
                std::fs::copy(entry.path(), target).unwrap();
            }
        }
    }

    /// A copy of the twin example with one edit, `(file, from, to)`.
    fn broken(name: &str, edits: &[(&str, &str, &str)]) -> PathBuf {
        let dir = scratch(name).join("example-twin");
        let from = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples/example-twin");
        copy(&from, &dir);
        for (file, old, new) in edits {
            let path = dir.join(file);
            let text = std::fs::read_to_string(&path).unwrap();
            assert!(text.contains(old), "{name}: {file} has no {old:?}");
            std::fs::write(&path, text.replacen(old, new, 1)).unwrap();
        }
        dir
    }

    fn check_json(dir: &Path) -> serde_json::Value {
        let out = run(&["check", "--json", dir.to_str().unwrap()]);
        serde_json::from_slice(&out.stdout).unwrap_or_else(|e| panic!("{e}: {}", stderr(&out)))
    }

    #[test]
    fn new_starts_a_pack_that_passes_check_with_its_own_id_and_name() {
        let dir = scratch("new");
        let demo = dir.join("demo");
        let out = run(&["new", demo.to_str().unwrap()]);
        assert!(out.status.success(), "{}", stderr(&out));
        assert!(
            stdout(&out).contains("pack id `demo`, name \"Demo\""),
            "{}",
            stdout(&out)
        );
        let checked = run(&["check", demo.to_str().unwrap()]);
        assert!(checked.status.success(), "{}", stdout(&checked));
        assert!(
            stdout(&checked).starts_with("ok   demo 0.1.0"),
            "{}",
            stdout(&checked)
        );
        // An AGENTS.md for whoever writes it: the pack, how to check it, the content rules.
        let agents = std::fs::read_to_string(demo.join("AGENTS.md")).unwrap();
        for part in [
            "This folder is an Involo pack, Demo (`demo`)",
            "involo-pack check .",
            "involo-pack mcp",
            "involo://guide/",
            "## Content rules",
            "No citations and no links to third-party material",
        ] {
            assert!(
                agents.contains(part),
                "AGENTS.md has no {part:?}:\n{agents}"
            );
        }
        // Nothing of the example's id, name or repository schema paths is left.
        let mut stack = vec![demo.clone()];
        while let Some(d) = stack.pop() {
            for entry in std::fs::read_dir(&d).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                let text = std::fs::read_to_string(&path).unwrap();
                for gone in [
                    "example-twin",
                    "Example Twin",
                    "yaml-language-server",
                    "$schema",
                ] {
                    assert!(!text.contains(gone), "{}: {gone}", path.display());
                }
            }
        }
        let side = dir.join("my-side");
        let out = run(&[
            "new",
            side.to_str().unwrap(),
            "--from",
            "example-sidestick",
            "--name",
            "My Side",
        ]);
        assert!(out.status.success(), "{}", stderr(&out));
        assert!(run(&["check", side.to_str().unwrap()]).status.success());
        let manifest = std::fs::read_to_string(side.join("pack.json")).unwrap();
        assert!(manifest.contains("\"name\": \"My Side\""), "{manifest}");
        assert_the_authors_own(&demo);
        assert_the_authors_own(&side);
    }

    /// A new pack is the author's work: no file keeps the example's copyright or license lines,
    /// and no comment says its content is invented.
    fn assert_the_authors_own(pack: &Path) {
        let mut stack = vec![pack.to_path_buf()];
        let mut files = 0;
        while let Some(d) = stack.pop() {
            for entry in std::fs::read_dir(&d).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                files += 1;
                let text = std::fs::read_to_string(&path).unwrap();
                assert!(!text.contains("SPDX-"), "{}: an SPDX line", path.display());
                for line in text.lines().filter(|l| l.trim_start().starts_with('#')) {
                    assert!(
                        !line.to_lowercase().contains("invented"),
                        "{}: {line}",
                        path.display()
                    );
                }
            }
        }
        assert!(files > 10, "{} has the starter's files", pack.display());
    }

    #[test]
    fn new_refuses_a_bad_id_a_used_folder_and_an_example_that_needs_a_parent() {
        let dir = scratch("new-refused");
        let out = run(&["new", dir.join("Demo").to_str().unwrap()]);
        assert_eq!(out.status.code(), Some(2));
        assert!(
            stderr(&out).contains("can't be a pack id"),
            "{}",
            stderr(&out)
        );
        std::fs::create_dir_all(dir.join("used")).unwrap();
        std::fs::write(dir.join("used/notes.txt"), "mine").unwrap();
        let out = run(&["new", dir.join("used").to_str().unwrap()]);
        assert!(
            stderr(&out).contains("already exists and is not empty"),
            "{}",
            stderr(&out)
        );
        let out = run(&[
            "new",
            dir.join("lr").to_str().unwrap(),
            "--from",
            "example-twin-lr",
        ]);
        assert!(
            stderr(&out).contains("extends another pack, so it can't start one on its own: choose one of example-sidestick, example-twin"),
            "{}",
            stderr(&out)
        );
        let out = run(&["new", dir.join("x").to_str().unwrap(), "--from", "nope"]);
        assert!(
            stderr(&out).contains("no example `nope`"),
            "{}",
            stderr(&out)
        );
    }

    /// One problem in each kind of place, by the code it must raise: each problem `check` finds
    /// has a known code, a file and a line, and a hint.
    #[test]
    #[allow(clippy::too_many_lines)]
    fn every_problem_has_a_code_a_file_a_line_and_a_hint() {
        let cases: &[(&str, (&str, &str, &str), Code)] = &[
            (
                "icao",
                ("pack.json", "\"ZZZT\"", "\"zz\""),
                Code::BadIcaoType,
            ),
            (
                "control",
                (
                    "lists/before-start.yaml",
                    "controls: [battery]",
                    "controls: [batery]",
                ),
                Code::UnknownControl,
            ),
            (
                "basis",
                (
                    "lists/before-start.yaml",
                    "basis: [invented-example]",
                    "basis: [made-up]",
                ),
                Code::UndeclaredBasis,
            ),
            (
                "step-id",
                (
                    "lists/before-start.yaml",
                    "- id: example-twin.before-start.beacon",
                    "- id: beacon",
                ),
                Code::StepIdShape,
            ),
            (
                "date",
                (
                    "lists/before-start.yaml",
                    "date: 2026-11-08",
                    "date: 2026-13-08",
                ),
                Code::ConfirmationDate,
            ),
            (
                "link",
                (
                    "lists/before-start.yaml",
                    "why: Gives the aircraft its first electrical power.",
                    "why: Gives the aircraft power, see https://example.com/power.",
                ),
                Code::LinkNotAllowed,
            ),
            (
                "phase-list",
                ("phases.yaml", "lists: [start-flow]", "lists: [start-flo]"),
                Code::UnknownList,
            ),
            (
                "message-list",
                ("messages.yaml", "list: battery-low", "list: battery-lo"),
                Code::UnknownList,
            ),
            (
                "alias",
                ("aliases.yaml", "to: smoke}", "to: smok}"),
                Code::UnknownAliasTarget,
            ),
            (
                "when-known",
                ("cdu.yaml", "- when_known: [zfw]", "- when_known: []"),
                Code::WhenKnown,
            ),
            (
                "field-id",
                ("flight.yaml", "- id: squawk", "- id: Squawk"),
                Code::IdFormat,
            ),
            (
                "light",
                (
                    "lights.yaml",
                    "locator: overhead/electrical/BATT LOW/1",
                    "locator: overhead/electrical/BATT LOWW/1",
                ),
                Code::UnknownPanelItem,
            ),
            (
                "item-id",
                ("panels/overhead.yaml", "- id: battery", "- id: Battery"),
                Code::IdFormat,
            ),
            (
                "yaml",
                ("glossary.yaml", "terms:", "terms:\n  bogus: 1\nmore:"),
                Code::BadYaml,
            ),
        ];
        let known: Vec<&str> = Code::ALL.iter().map(|c| c.as_str()).collect();
        for (name, edit, code) in cases {
            let dir = broken(name, &[*edit]);
            let report = check_json(&dir);
            assert_eq!(report["ok"], false, "{name}: {report}");
            let issues = report["packs"][0]["issues"].as_array().unwrap();
            assert!(
                issues.iter().any(|i| i["code"] == code.as_str()),
                "{name}: no {code} in {report:#}"
            );
            for i in issues {
                let c = i["code"].as_str().unwrap_or_default();
                assert!(known.contains(&c), "{name}: unknown code in {i}");
                assert_eq!(i["hint"], Code::parse(c).unwrap().hint(), "{name}: {i}");
                assert!(
                    i["file"].is_string() && i["line"].is_u64(),
                    "{name}: no place in {i}"
                );
                let file = i["file"].as_str().unwrap();
                assert!(
                    dir.join(file).is_file(),
                    "{name}: {file} is not a file of the pack"
                );
            }
        }
    }

    #[test]
    fn check_prints_each_problem_with_its_code_place_and_hint() {
        let dir = broken(
            "text",
            &[(
                "lists/before-start.yaml",
                "controls: [battery]",
                "controls: [batery]",
            )],
        );
        let out = run(&["check", dir.to_str().unwrap()]);
        assert_eq!(out.status.code(), Some(1));
        let text = stdout(&out);
        assert!(
            text.contains("  error P0205: lists/before-start.yaml:15: example-twin.before-start.battery: refers to unknown control `batery`\n    hint: Check the spelling against controls.yaml, or add the control there.\n"),
            "{text}"
        );
    }

    /// The `--json` report's shape is stable: a tool may read it.
    #[test]
    fn check_json_is_stable() {
        let dir = broken(
            "json",
            &[
                (
                    "lists/before-start.yaml",
                    "controls: [battery]",
                    "controls: [batery]",
                ),
                ("pack.json", "\"ZZZT\"", "\"zz\""),
            ],
        );
        let mut report = check_json(&dir);
        report["packs"][0]["folder"] = "example-twin".into();
        insta::with_settings!({ snapshot_path => "snapshots/authoring", prepend_module_to_snapshot => false, omit_expression => true }, {
            insta::assert_json_snapshot!("check-json", report);
        });
    }

    #[test]
    fn explain_knows_every_code_and_gives_each_one_its_table_entry() {
        let out = run(&["explain", "--json"]);
        assert!(out.status.success());
        let all: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        // One entry per code, in the table's order, each with exactly these four fields.
        let expected: Vec<serde_json::Value> = Code::ALL
            .iter()
            .map(|c| {
                let i = c.info();
                serde_json::json!({ "code": i.code, "title": i.title, "explain": i.explain, "hint": i.hint })
            })
            .collect();
        assert_eq!(all, serde_json::Value::Array(expected));
        let one = run(&["explain", "p0205"]);
        assert_eq!(
            stdout(&one),
            "P0205: A control that doesn't exist\n\nSomething refers to a control id that controls.yaml doesn't define.\n\nHow to fix it: Check the spelling against controls.yaml, or add the control there.\n"
        );
        let unknown = run(&["explain", "P9999"]);
        assert_eq!(unknown.status.code(), Some(2));
        assert!(
            stderr(&unknown).contains("no code `P9999`"),
            "{}",
            stderr(&unknown)
        );
    }

    #[test]
    fn describe_lists_the_fields_of_the_committed_schema_and_the_known_names() {
        let out = run(&["describe", "flight.yaml"]);
        assert!(out.status.success(), "{}", stderr(&out));
        let text = stdout(&out);
        let schema: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schemas/flight.schema.json"),
            )
            .unwrap(),
        )
        .unwrap();
        let mut parts = vec![("FlightFile".to_owned(), &schema)];
        for (name, def) in schema["$defs"].as_object().unwrap() {
            parts.push((name.clone(), def));
        }
        for (part, node) in parts {
            for field in node["properties"]
                .as_object()
                .into_iter()
                .flatten()
                .map(|f| f.0)
            {
                // Each field is listed under its part's heading.
                let heading = if part == "FlightFile" {
                    "The file: FlightFile\n".to_owned()
                } else {
                    format!("\n{part}\n")
                };
                let after = text.split_once(&heading).map_or_else(
                    || panic!("no {part} in\n{text}"),
                    |(_, rest)| rest.split("\n\n").next().unwrap_or(rest),
                );
                assert!(
                    after.contains(&format!("  - {field}: ")),
                    "{part}.{field} in\n{after}"
                );
            }
        }
        let unknown = run(&["describe", "weather.yaml"]);
        assert_eq!(unknown.status.code(), Some(2));
        assert!(
            stderr(&unknown).contains("`weather.yaml` is not a pack file involo-pack knows; it knows pack.json, aliases.yaml"),
            "{}",
            stderr(&unknown)
        );
    }
}
