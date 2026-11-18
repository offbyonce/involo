// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Runs the real `involo-pack build` command.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use involo_pack::FlatPack;

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

    #[test]
    fn writes_one_flattened_file_per_pack() {
        let out = temp_dir("ok");
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs");
        let output = build(&packs, &out);
        assert!(output.status.success(), "{output:?}");
        let text = std::fs::read_to_string(out.join("example-trainer.json")).unwrap();
        let flat: FlatPack = serde_json::from_str(&text).unwrap();
        assert_eq!(flat.manifest.id, "example-trainer");
        assert_eq!(flat.lists.len(), 3);
        assert!(out.join("ifly-737-max8.json").is_file());
        let index: Vec<involo_pack::PackSummary> =
            serde_json::from_str(&std::fs::read_to_string(out.join("index.json")).unwrap())
                .unwrap();
        let ids: Vec<&str> = index.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["example-trainer", "ifly-737-max8"]);
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
        assert!(!out.join("demo.json").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn build_with(args: &[&std::ffi::OsStr]) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .arg("build")
            .args(args)
            .output()
            .unwrap()
    }

    fn fixtures() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../involo-pack/tests/fixtures/extend")
    }

    #[test]
    fn a_child_builds_over_its_parent_and_records_its_version_and_content_hash() {
        let out = temp_dir("child");
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs");
        let output = build_with(&[
            fixtures().as_os_str(),
            out.as_os_str(),
            "--parents".as_ref(),
            packs.as_os_str(),
        ]);
        assert!(output.status.success(), "{output:?}");
        let flat: FlatPack = serde_json::from_str(
            &std::fs::read_to_string(out.join("example-variant.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(flat.manifest.resolved[0].id, "example-trainer");
        assert_eq!(flat.manifest.resolved[0].version.to_string(), "0.1.0");
        assert_eq!(
            flat.manifest.content_hash.as_deref(),
            Some(involo_pack::resolve::content_hash(&flat.lists, &flat.content).as_str())
        );
        // The parent is only read, never written beside its child.
        assert!(!out.join("example-trainer.json").exists());
        std::fs::remove_dir_all(out).unwrap();
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
        assert!(!out.join("lib.demo.json").exists());
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
               "engine":">=0.1.0","extends":{"example-trainer":">=0.1"},"patches":"patches.yaml",
               "license":"CC-BY-NC-SA-4.0","checklists":[]}"#,
        )
        .unwrap();
        std::fs::write(
            pack.join("patches.yaml"),
            "patches:\n  - {op: remove, list: nope}\n",
        )
        .unwrap();
        let out = dir.join("out");
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs");
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
        assert!(!out.join("child.json").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
