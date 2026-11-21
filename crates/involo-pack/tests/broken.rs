// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Broken pack folders: the example pack with one thing wrong, each refused by `involo-pack
//! check` (loading, building over a parent, then the checks) with a message that says what is
//! wrong and where. Each pack is held in memory, so a test can break any file in any way, bytes
//! included.

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fmt::Write as _;
    use std::path::{Path, PathBuf};

    use involo_pack::limits::{
        MAX_DATA_FILE_BYTES, MAX_EXTENDS_CHAIN, MAX_GLOSSARY_TERMS, MAX_NAME_CHARS, MAX_STEPS,
    };
    use involo_pack::{InMemory, Severity, Shelf, resolve_files, validate_pack};

    /// The example pack, every file of it in memory.
    fn example() -> InMemory {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let mut files = BTreeMap::new();
        let mut stack = vec![dir.clone()];
        while let Some(d) = stack.pop() {
            for entry in std::fs::read_dir(&d).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                } else {
                    let rel = path
                        .strip_prefix(&dir)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/");
                    files.insert(rel, std::fs::read(&path).unwrap());
                }
            }
        }
        InMemory {
            name: PathBuf::from("example-trainer"),
            files,
        }
    }

    /// How a message names the example pack's file `rel`: as a path, with the system's separator
    /// (`example-trainer\smoke.yaml` on Windows), as the loader joins it.
    fn file(rel: &str) -> String {
        Path::new("example-trainer").join(rel).display().to_string()
    }

    fn text(pack: &InMemory, rel: &str) -> String {
        String::from_utf8(pack.files[rel].clone()).unwrap()
    }

    fn put(pack: &mut InMemory, rel: &str, body: impl Into<Vec<u8>>) {
        pack.files.insert(rel.to_owned(), body.into());
    }

    /// `pack.json` changed by `edit`.
    fn manifest(pack: &mut InMemory, edit: impl FnOnce(&mut serde_json::Value)) {
        let mut m: serde_json::Value = serde_json::from_slice(&pack.files["pack.json"]).unwrap();
        edit(&mut m);
        put(pack, "pack.json", serde_json::to_vec_pretty(&m).unwrap());
    }

    /// What `involo-pack check` says of `pack` built over `parents`: the build's error, or every
    /// error the checks find, one per line. Empty when the pack passes.
    fn refusal(pack: &InMemory, parents: &[InMemory]) -> String {
        match resolve_files(pack, &Shelf(parents.to_vec())) {
            Err(e) => e.to_string(),
            Ok(built) => validate_pack(&built.pack)
                .into_iter()
                .filter(|i| i.severity == Severity::Error)
                .map(|i| format!("{}: {}", i.at, i.message))
                .collect::<Vec<_>>()
                .join("\n"),
        }
    }

    fn refused_with(pack: &InMemory, parents: &[InMemory], expected: &str) {
        let said = refusal(pack, parents);
        assert!(said.contains(expected), "expected {expected:?} in:\n{said}");
    }

    #[test]
    fn the_example_pack_passes_as_it_is() {
        assert_eq!(refusal(&example(), &[]), "");
    }

    #[test]
    fn an_empty_manifest_or_data_file_is_refused_naming_the_file() {
        let mut pack = example();
        put(&mut pack, "pack.json", "");
        refused_with(
            &pack,
            &[],
            &format!(
                "{}: EOF while parsing a value at line 1 column 0",
                file("pack.json")
            ),
        );
        let mut pack = example();
        put(&mut pack, "glossary.yaml", "");
        refused_with(&pack, &[], &format!("{}:", file("glossary.yaml")));
    }

    #[test]
    fn a_truncated_file_is_refused_with_its_line() {
        let mut pack = example();
        let json = text(&pack, "pack.json");
        put(&mut pack, "pack.json", &json[..json.len() / 2]);
        refused_with(
            &pack,
            &[],
            &format!("{}: EOF while parsing", file("pack.json")),
        );
        let mut pack = example();
        let yaml = text(&pack, "smoke.yaml");
        // Cut inside the second step's quoted value.
        let cut = yaml.find("'ON").unwrap() + 2;
        put(&mut pack, "smoke.yaml", &yaml[..cut]);
        refused_with(&pack, &[], &format!("{}:", file("smoke.yaml")));
        assert!(
            refusal(&pack, &[]).contains("line 17"),
            "{}",
            refusal(&pack, &[])
        );
    }

    #[test]
    fn a_file_that_is_not_utf8_is_refused() {
        let mut pack = example();
        let mut bytes = pack.files["smoke.yaml"].clone();
        bytes.splice(200..200, [0xff, 0xfe]);
        put(&mut pack, "smoke.yaml", bytes);
        refused_with(
            &pack,
            &[],
            &format!(
                "{}: the file is not UTF-8 text (an invalid byte at 200)",
                file("smoke.yaml")
            ),
        );
    }

    #[test]
    fn a_very_large_file_is_refused_before_it_is_read() {
        let mut pack = example();
        let mut big = text(&pack, "glossary.yaml");
        big.push_str(&"# padding\n".repeat(usize::try_from(MAX_DATA_FILE_BYTES).unwrap() / 10 + 1));
        put(&mut pack, "glossary.yaml", big);
        refused_with(
            &pack,
            &[],
            &format!(
                "{}: the file is 4.1 MB, over the 4.0 MB a pack may use for it",
                file("glossary.yaml")
            ),
        );
    }

    #[test]
    fn very_deep_nesting_and_an_alias_bomb_are_refused() {
        // A step's `show_if` is read whole before its form is known, so it is where nesting could
        // go deep.
        for depth in [100, 100_000] {
            let mut pack = example();
            let deep = format!("{}x{}", "[".repeat(depth), "]".repeat(depth));
            let yaml = text(&pack, "smoke.yaml").replace(
                "    expect: 'ON'",
                &format!("    expect: 'ON'\n    show_if: {deep}"),
            );
            put(&mut pack, "smoke.yaml", yaml);
            let said = refusal(&pack, &[]);
            assert!(
                said.starts_with(&format!("{}:", file("smoke.yaml"))),
                "{said}"
            );
            assert!(
                said.contains("line 18")
                    && said.contains(
                        "maps and lists nest too deeply; a pack file may nest them at most 64 deep"
                    ),
                "{said}"
            );
        }

        // Each anchor doubles the one before: a billion entries from 30 short ones, in a step's
        // `show_if`, which is read whole.
        let mut bomb = String::from("[&a0 [x, x]");
        for n in 1..30 {
            write!(bomb, ", &a{n} [*a{m}, *a{m}]", m = n - 1).unwrap();
        }
        bomb.push(']');
        let mut pack = example();
        let yaml = text(&pack, "smoke.yaml").replace(
            "    expect: 'ON'",
            &format!("    expect: 'ON'\n    show_if: {bomb}"),
        );
        put(&mut pack, "smoke.yaml", yaml);
        let said = refusal(&pack, &[]);
        assert!(
            said.starts_with(&format!("{}:", file("smoke.yaml"))),
            "{said}"
        );
        assert!(
            said.contains("line 18")
                && said.contains(
                    "the file has more than 250000 values (maps, lists and the values in them)"
                ),
            "{said}"
        );
    }

    #[test]
    fn an_extends_cycle_and_a_missing_parent_are_refused_naming_the_packs() {
        let mut a = example();
        a.name = PathBuf::from("a");
        manifest(&mut a, |m| {
            m["id"] = "pack-a".into();
            m["extends"] = serde_json::json!({ "pack-b": "*" });
        });
        let mut b = example();
        b.name = PathBuf::from("b");
        manifest(&mut b, |m| {
            m["id"] = "pack-b".into();
            m["extends"] = serde_json::json!({ "pack-a": "*" });
        });
        refused_with(
            &a,
            &[a.clone(), b.clone()],
            "`extends` makes a cycle: pack-a → pack-b → pack-a",
        );
        refused_with(&a, &[], "pack-a: its parent `pack-b` is in none of");
    }

    #[test]
    fn an_extends_chain_past_the_limit_is_refused() {
        // pack-0 extends pack-1, … up to one past the limit; the last extends nothing.
        let packs: Vec<InMemory> = (0..=MAX_EXTENDS_CHAIN)
            .map(|n| {
                let mut p = example();
                p.name = PathBuf::from(format!("p{n}"));
                manifest(&mut p, |m| {
                    m["id"] = format!("pack-{n}").into();
                    if n < MAX_EXTENDS_CHAIN {
                        m["extends"] = serde_json::json!({ format!("pack-{}", n + 1): "*" });
                    }
                });
                p
            })
            .collect();
        refused_with(
            &packs[0],
            &packs,
            "is longer than 8 packs, the most a pack may build on",
        );
    }

    #[test]
    fn duplicate_and_malformed_ids_are_refused() {
        let mut pack = example();
        let yaml = text(&pack, "smoke.yaml").replace(
            "example-trainer.smoke.checklist",
            "example-trainer.smoke.masks",
        );
        put(&mut pack, "smoke.yaml", yaml);
        refused_with(
            &pack,
            &[],
            "example-trainer.smoke.masks: step id is used twice",
        );

        let mut pack = example();
        let yaml = text(&pack, "smoke.yaml").replace(
            "example-trainer.smoke.masks",
            "example-trainer.smoke.Oxygen Masks",
        );
        put(&mut pack, "smoke.yaml", yaml);
        refused_with(&pack, &[], "example-trainer.smoke.Oxygen Masks:");
    }

    #[test]
    fn a_reference_to_an_id_that_does_not_exist_is_refused() {
        let mut pack = example();
        let yaml =
            text(&pack, "phases.yaml").replace("lists: [before-start]", "lists: [before-strat]");
        put(&mut pack, "phases.yaml", yaml);
        refused_with(&pack, &[], "before-strat");
    }

    #[test]
    fn a_wrong_or_future_format_number_is_refused() {
        let mut pack = example();
        manifest(&mut pack, |m| m["schemaVersion"] = 5.into());
        refused_with(
            &pack,
            &[],
            "Format 5 is no longer read; move the pack to format 6",
        );
        manifest(&mut pack, |m| m["schemaVersion"] = 99.into());
        refused_with(
            &pack,
            &[],
            "Needs a newer Involo: the pack uses format 99, and this version reads up to 6",
        );
        manifest(&mut pack, |m| m["schemaVersion"] = "six".into());
        refused_with(
            &pack,
            &[],
            &format!("{}: invalid type: string \"six\"", file("pack.json")),
        );
    }

    #[test]
    fn a_path_that_leaves_the_pack_folder_is_refused() {
        for (path, why) in [
            (
                "../ifly-737-max8/glossary.yaml",
                "the path must stay inside the pack folder (no `..`)",
            ),
            (
                "/etc/glossary.yaml",
                "the path must be relative to the pack folder",
            ),
            ("", "the path is empty"),
            // Windows separators and drives, refused alike on every system.
            (
                "..\\ifly-737-max8\\glossary.yaml",
                "the path must stay inside the pack folder (no `..`)",
            ),
            (
                "\\etc\\glossary.yaml",
                "the path must be relative to the pack folder",
            ),
            (
                "C:\\packs\\glossary.yaml",
                "the path must be relative to the pack folder",
            ),
            (
                "C:glossary.yaml",
                "the path must be relative to the pack folder",
            ),
        ] {
            let mut pack = example();
            manifest(&mut pack, |m| m["glossary"] = path.into());
            refused_with(&pack, &[], why);
        }
    }

    #[test]
    fn a_pack_over_an_item_limit_is_refused_for_that_alone() {
        // Steps: one list made long enough to pass the limit.
        let mut pack = example();
        let mut yaml = text(&pack, "smoke.yaml");
        for n in 0..MAX_STEPS {
            write!(
                yaml,
                "  - id: example-trainer.smoke.step-{n}\n    text: Step\n    expect: SET\n"
            )
            .unwrap();
        }
        put(&mut pack, "smoke.yaml", yaml);
        assert_eq!(
            refusal(&pack, &[]),
            format!(
                "lists: the pack has {} steps; the most a pack may have is {MAX_STEPS}",
                MAX_STEPS + 13
            )
        );

        let mut pack = example();
        let mut yaml = text(&pack, "glossary.yaml");
        for n in 0..=MAX_GLOSSARY_TERMS {
            write!(yaml, "  - term: TERM{n}\n    meaning: A term.\n").unwrap();
        }
        put(&mut pack, "glossary.yaml", yaml);
        assert!(
            refusal(&pack, &[]).starts_with("glossary: the glossary has"),
            "{}",
            refusal(&pack, &[])
        );

        let mut pack = example();
        let long = "Oxygen masks ".repeat(30);
        let yaml = text(&pack, "smoke.yaml")
            .replace("text: Oxygen masks", &format!("text: {}", long.trim()));
        put(&mut pack, "smoke.yaml", yaml);
        assert_eq!(
            refusal(&pack, &[]),
            format!(
                "example-trainer.smoke.masks: its text is {} characters; the most is {MAX_NAME_CHARS}",
                long.trim().len()
            )
        );
    }
}
