// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Runs the real `involo-pack build` command.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use involo_pack::{CatalogEntry, FlatPack};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-build-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn build(packs: &Path, out: &Path) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .arg("build")
            .arg(packs)
            .arg(out)
            .output()
            .unwrap()
    }

    /// The pack files in a built catalog, by name.
    fn pack_files(out: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(out)
            .map(|d| {
                d.filter_map(|e| e.ok()?.file_name().into_string().ok())
                    .filter(|n| n.ends_with(".involo-pack"))
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    #[test]
    fn writes_the_catalog_with_each_file_s_size_and_sha256() {
        let out = temp_dir("ok");
        // The example packs' folder: three packs, one of them built over another beside it.
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples");
        let output = build(&packs, &out);
        assert!(output.status.success(), "{output:?}");
        let index: Vec<CatalogEntry> =
            serde_json::from_str(&std::fs::read_to_string(out.join("index.json")).unwrap())
                .unwrap();
        let ids: Vec<&str> = index.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            ["example-sidestick", "example-twin", "example-twin-lr"]
        );
        let mut files = Vec::new();
        for entry in &index {
            let file = format!("{}-{}.involo-pack", entry.id, entry.version);
            let bytes = std::fs::read(out.join(&file)).unwrap();
            // Recomputed from the file as written.
            assert_eq!(entry.size, bytes.len() as u64, "{file}");
            assert_eq!(entry.sha256, involo_pack::sha256_hex(&bytes), "{file}");
            let flat: FlatPack = serde_json::from_slice(&bytes).unwrap();
            // The entry is the pack's own: aircraft block and app version range included.
            assert_eq!(
                Some(&entry.aircraft),
                flat.manifest.aircraft.as_ref(),
                "{file}"
            );
            assert_eq!(entry.engine, flat.manifest.engine, "{file}");
            assert_eq!(entry.version, flat.manifest.version, "{file}");
            // And the app installs it, the hash checked.
            assert!(matches!(
                involo_app_core::check_pack(&bytes, Some(&entry.sha256)),
                involo_app_core::PackCheck::Ready { .. }
            ));
            files.push(file);
        }
        assert_eq!(pack_files(&out), files, "one file per pack, nothing else");
        let catalog = std::fs::read_to_string(out.join("index.json")).unwrap();
        assert_eq!(involo_app_core::parse_catalog(&catalog).unwrap(), index);
        std::fs::remove_dir_all(out).unwrap();
    }

    #[test]
    fn several_packs_are_written_in_the_order_given_and_older_files_go() {
        let out = temp_dir("order");
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs");
        // A pack file from an earlier build, of a version no longer published.
        std::fs::create_dir_all(&out).unwrap();
        std::fs::write(out.join("example-twin-0.0.9.involo-pack"), "{}").unwrap();
        let output = build_with(&[
            packs.join("ifly-737-max8").as_os_str(),
            packs.join("examples/example-twin").as_os_str(),
            out.as_os_str(),
        ]);
        assert!(output.status.success(), "{output:?}");
        let index: Vec<CatalogEntry> =
            serde_json::from_str(&std::fs::read_to_string(out.join("index.json")).unwrap())
                .unwrap();
        let ids: Vec<&str> = index.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["ifly-737-max8", "example-twin"]);
        assert_eq!(
            pack_files(&out),
            [
                "example-twin-0.1.0.involo-pack",
                "ifly-737-max8-0.1.0.involo-pack"
            ],
            "the earlier build's file is gone"
        );
        std::fs::remove_dir_all(out).unwrap();
    }

    #[test]
    fn a_pack_with_errors_is_not_written() {
        let dir = temp_dir("bad");
        let pack = dir.join("pack");
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::write(
            pack.join("pack.json"),
            r#"{"id":"demo","name":"Demo","version":"0.1.0","schemaVersion":6,"kind":"library",
               "engine":">=0.1.0","license":"CC-BY-NC-SA-4.0","checklists":["a.yaml"]}"#,
        )
        .unwrap();
        // No basis and a step id outside the pack: two errors.
        std::fs::write(
            pack.join("a.yaml"),
            "id: a\ntitle: A\nkind: flow\nbasis: []\nsteps:\n  - id: other.p.a\n    text: T\n    expect: E\n",
        )
        .unwrap();
        let out = dir.join("out");
        let output = build(&pack, &out);
        assert_eq!(output.status.code(), Some(1), "{output:?}");
        assert_eq!(pack_files(&out), Vec::<String>::new());
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn build_with(args: &[&std::ffi::OsStr]) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .arg("build")
            .args(args)
            .output()
            .unwrap()
    }

    fn examples() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples")
    }

    #[test]
    fn a_child_named_without_a_folder_finds_its_parent_beside_it() {
        // `involo-pack check my-child` from the folder that holds both packs: the folder beside
        // a pack named this way is `.`, not an empty path that holds nothing.
        let dir = temp_dir("bare");
        for name in ["example-twin", "example-twin-lr"] {
            let to = dir.join(name);
            std::fs::create_dir_all(&to).unwrap();
            for entry in std::fs::read_dir(examples().join(name)).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    let sub = to.join(path.file_name().unwrap());
                    std::fs::create_dir_all(&sub).unwrap();
                    for f in std::fs::read_dir(&path).unwrap() {
                        let f = f.unwrap().path();
                        std::fs::copy(&f, sub.join(f.file_name().unwrap())).unwrap();
                    }
                } else {
                    std::fs::copy(&path, to.join(path.file_name().unwrap())).unwrap();
                }
            }
        }
        let run = |args: &[&str]| {
            Command::new(env!("CARGO_BIN_EXE_involo-pack"))
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap()
        };
        let checked = run(&["check", "example-twin-lr"]);
        let text = String::from_utf8_lossy(&checked.stdout);
        assert!(checked.status.success(), "{text}");
        assert!(text.starts_with("ok   example-twin-lr 0.1.0"), "{text}");
        let built = run(&["build", "example-twin-lr", "out"]);
        assert!(built.status.success(), "{built:?}");
        assert!(dir.join("out/example-twin-lr-0.1.0.involo-pack").is_file());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_child_builds_over_its_parent_and_records_its_version_and_content_hash() {
        let out = temp_dir("child");
        let parents = temp_dir("child-parents");
        // The variant on its own, its parent found through --parents.
        let child = parents.join("lone").join("example-twin-lr");
        std::fs::create_dir_all(&child).unwrap();
        for name in ["pack.json", "patches.yaml"] {
            std::fs::copy(
                examples().join("example-twin-lr").join(name),
                child.join(name),
            )
            .unwrap();
        }
        let output = build_with(&[
            child.as_os_str(),
            out.as_os_str(),
            "--parents".as_ref(),
            examples().as_os_str(),
        ]);
        assert!(output.status.success(), "{output:?}");
        let flat: FlatPack = serde_json::from_str(
            &std::fs::read_to_string(out.join("example-twin-lr-0.1.0.involo-pack")).unwrap(),
        )
        .unwrap();
        assert_eq!(flat.manifest.resolved[0].id, "example-twin");
        assert_eq!(flat.manifest.resolved[0].version.to_string(), "0.1.0");
        assert_eq!(
            flat.manifest.content_hash.as_deref(),
            Some(involo_pack::resolve::content_hash(&flat.lists, &flat.content).as_str())
        );
        // The parent is only read, never written beside its child.
        assert_eq!(pack_files(&out), ["example-twin-lr-0.1.0.involo-pack"]);
        std::fs::remove_dir_all(out).unwrap();
        std::fs::remove_dir_all(parents).unwrap();
    }

    #[test]
    fn a_library_is_checked_but_not_written() {
        let dir = temp_dir("library");
        let pack = dir.join("lib.demo");
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::write(
            pack.join("pack.json"),
            r#"{"id":"lib.demo","name":"Demo library","version":"1.0.0","schemaVersion":6,"kind":"library",
               "engine":">=0.1.0","license":"CC-BY-NC-SA-4.0","basisTags":["invented-example"],"checklists":["a.yaml"]}"#,
        )
        .unwrap();
        std::fs::write(
            pack.join("a.yaml"),
            "id: a\ntitle: A\nkind: flow\nbasis: [invented-example]\nsteps:\n  - id: lib.demo.p.a\n    text: Lights\n    expect: 'ON'\n",
        )
        .unwrap();
        let out = dir.join("out");
        let output = build(&pack, &out);
        assert!(output.status.success(), "{output:?}");
        assert!(
            String::from_utf8_lossy(&output.stdout)
                .contains("library lib.demo: checked, not written")
        );
        assert_eq!(pack_files(&out), Vec::<String>::new());
        let index = std::fs::read_to_string(out.join("index.json")).unwrap();
        assert_eq!(index, "[]");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_child_whose_patch_matches_nothing_is_not_built_and_the_patch_is_named() {
        let dir = temp_dir("unmatched");
        let pack = dir.join("child");
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::write(
            pack.join("pack.json"),
            r#"{"id":"child","name":"Child","version":"0.1.0","schemaVersion":6,"kind":"aircraft",
               "engine":">=0.1.0","extends":{"example-twin":">=0.1"},"patches":"patches.yaml",
               "license":"CC-BY-NC-SA-4.0","checklists":[]}"#,
        )
        .unwrap();
        std::fs::write(
            pack.join("patches.yaml"),
            "patches:\n  - {op: remove, list: nope}\n",
        )
        .unwrap();
        let out = dir.join("out");
        let packs = examples();
        let output = build_with(&[
            pack.as_os_str(),
            out.as_os_str(),
            "--parents".as_ref(),
            packs.as_os_str(),
        ]);
        assert_eq!(output.status.code(), Some(1), "{output:?}");
        let err = String::from_utf8_lossy(&output.stderr);
        assert!(
            err.contains("patches.yaml patch 1 (remove list `nope`): matches no list"),
            "{err}"
        );
        assert_eq!(pack_files(&out), Vec::<String>::new());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
