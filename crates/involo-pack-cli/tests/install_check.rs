// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The app checks a pack on install with the same rules as `involo-pack check` (decision 0028):
//! the same broken packs go to the real command and to the app's check, and both find the same.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use involo_app_core::{PackCheck, check_pack};
    use involo_pack::{FlatPack, load_pack_dir};

    /// A copy of the example pack with `edits` made, each `(file, from, to)`, and `added` files
    /// (one of the pack's own is replaced).
    fn broken(name: &str, edits: &[Edit], added: &[(&str, &str)]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-install-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let from = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples/example-twin");
        copy(&from, &dir);
        for (file, old, new) in edits {
            let path = dir.join(file);
            let text = std::fs::read_to_string(&path).unwrap();
            assert!(text.contains(old), "{name}: {file} has no {old:?}");
            std::fs::write(&path, text.replacen(old, new, 1)).unwrap();
        }
        for (file, text) in added {
            std::fs::write(dir.join(file), text).unwrap();
        }
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

    /// The errors `involo-pack check --json` reports for the pack, as `where: what`.
    fn check_errors(dir: &Path) -> Vec<String> {
        let output = Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .args(["check", "--json"])
            .arg(dir)
            .output()
            .unwrap();
        let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        let errors: Vec<String> = report["packs"][0]["issues"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|i| i["severity"] == "error")
            .map(|i| {
                format!(
                    "{}: {}",
                    i["at"].as_str().unwrap(),
                    i["message"].as_str().unwrap()
                )
            })
            .collect();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert_eq!(
            output.status.success(),
            errors.is_empty(),
            "{report}{stderr}"
        );
        errors
    }

    /// The reasons the app gives for refusing the same pack, built into one file.
    fn install_reasons(dir: &Path) -> Vec<String> {
        let flat = FlatPack::built(load_pack_dir(dir).unwrap());
        let json = serde_json::to_string(&flat).unwrap();
        match check_pack(json.as_bytes(), None) {
            PackCheck::Refused { reasons } => reasons,
            PackCheck::Ready { .. } => vec![],
        }
    }

    const LABELS: &str = "roles:\n  - {id: pilot, title: Pilot, short: P, seat: nowhere}\n\
                          glossary_exceptions: [NOT A TERM]\n";

    /// An edit to one file of the example pack: `(file, from, to)`.
    type Edit = (&'static str, &'static str, &'static str);

    /// A broken copy of the example pack: its name, edits, and files added as `(name, text)`.
    struct Case {
        name: &'static str,
        edits: &'static [Edit],
        added: &'static [(&'static str, &'static str)],
    }

    const ICAO: Edit = ("pack.json", r#"["ZZZT"]"#, r#"["zz"]"#);
    const CONTROL: Edit = (
        "lists/before-start.yaml",
        "controls: [battery]",
        "controls: [no-such]",
    );
    /// The example pack names a labels file, for the cases that add a broken one.
    const WITH_LABELS: Edit = (
        "pack.json",
        r#""messages": "messages.yaml""#,
        r#""messages": "messages.yaml", "labels": "labels.yaml""#,
    );
    const LIGHT: Edit = (
        "lights.yaml",
        "overhead/electrical/BATT LOW/1",
        "overhead/electrical/NOPE/1",
    );
    const CASES: &[Case] = &[
        Case {
            name: "icao",
            edits: &[ICAO],
            added: &[],
        },
        Case {
            name: "control",
            edits: &[CONTROL],
            added: &[],
        },
        Case {
            name: "target",
            edits: &[(
                "lists/before-start.yaml",
                "overhead/electrical/BATTERY/1",
                "overhead/electrical/NOPE/1",
            )],
            added: &[],
        },
        Case {
            name: "light",
            edits: &[LIGHT],
            added: &[],
        },
        Case {
            name: "link",
            edits: &[(
                "lists/before-start.yaml",
                "note: Turn on before engine start.",
                "note: See https://www.brainscape.com/x",
            )],
            added: &[],
        },
        Case {
            name: "duplicate",
            edits: &[(
                "lists/before-start.yaml",
                "id: example-twin.before-start.beacon",
                "id: example-twin.before-start.battery",
            )],
            added: &[],
        },
        Case {
            name: "basis",
            edits: &[(
                "lists/before-start.yaml",
                "basis: [invented-example]",
                "basis: [not-listed]",
            )],
            added: &[],
        },
        // A broken labels file.
        Case {
            name: "labels",
            edits: &[WITH_LABELS],
            added: &[("labels.yaml", LABELS)],
        },
        Case {
            name: "several",
            edits: &[ICAO, CONTROL, LIGHT, WITH_LABELS],
            added: &[("labels.yaml", LABELS)],
        },
    ];

    #[test]
    fn the_app_refuses_what_pack_check_refuses_with_the_same_reasons() {
        for case in CASES {
            let dir = broken(case.name, case.edits, case.added);
            let check = check_errors(&dir);
            assert!(!check.is_empty(), "{}: pack check found nothing", case.name);
            assert_eq!(install_reasons(&dir), check, "{}", case.name);
            std::fs::remove_dir_all(dir).unwrap();
        }
        // The pack as it is passes both.
        let clean = broken("clean", &[], &[]);
        assert_eq!(
            (check_errors(&clean), install_reasons(&clean)),
            (vec![], vec![])
        );
        std::fs::remove_dir_all(clean).unwrap();
    }

    #[test]
    fn files_beside_the_data_are_checked_when_the_pack_is_built() {
        // A built pack is one file: an image left in the folder is refused by `check` and
        // `build`, and never reaches a pack file for the app to see.
        let dir = broken("image", &[], &[("photo.png", "not really an image")]);
        assert!(
            check_errors(&dir)
                .iter()
                .any(|e| e.contains("must not contain images"))
        );
        assert_eq!(install_reasons(&dir), Vec::<String>::new());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
