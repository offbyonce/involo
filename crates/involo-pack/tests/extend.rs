// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Packs that extend a parent (decision 0029): invented children of the example pack, built over
//! it, and the errors a build gives.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use involo_pack::{FlatPack, Pack, ResolveError, Severity, resolve, validate_pack};
    use proptest::prelude::*;

    fn root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn packs() -> PathBuf {
        root().join("packs")
    }

    /// A fresh folder of packs for one test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("involo-extend-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A pack folder `id` in `place`, its manifest from `manifest` (merged over a child of the
    /// example pack's), with `patches` as its `patches.yaml` when given.
    fn write_pack(
        place: &Path,
        id: &str,
        manifest: &serde_json::Value,
        patches: Option<&str>,
    ) -> PathBuf {
        let dir = place.join(id);
        std::fs::create_dir_all(&dir).unwrap();
        let mut m = serde_json::json!({
            "id": id, "name": "Child", "version": "0.1.0", "schemaVersion": 6, "kind": "aircraft",
            "engine": ">=0.1.0", "extends": {"example-trainer": ">=0.1.0, <1.0.0"},
            "license": "CC-BY-NC-SA-4.0", "checklists": []
        });
        for (k, v) in manifest.as_object().unwrap() {
            m[k] = v.clone();
        }
        if let Some(text) = patches {
            m["patches"] = "patches.yaml".into();
            std::fs::write(dir.join("patches.yaml"), text).unwrap();
        }
        std::fs::write(dir.join("pack.json"), m.to_string()).unwrap();
        dir
    }

    /// A child of the example pack with these patches, built.
    fn child(name: &str, patches: &str) -> Result<Pack, ResolveError> {
        let dir = write_pack(
            &scratch(name),
            "example-child",
            &serde_json::json!({}),
            Some(patches),
        );
        resolve(&dir, &[packs()]).map(|r| r.pack)
    }

    fn err(r: Result<Pack, ResolveError>) -> String {
        r.expect_err("should fail").to_string()
    }

    fn step<'a>(pack: &'a Pack, id: &str) -> Option<&'a involo_checklist_core::Step> {
        pack.checklists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.id.as_str() == id)
    }

    #[test]
    fn a_child_that_patches_removes_inserts_and_relabels_builds_to_the_expected_flat_pack() {
        let dir = root().join("crates/involo-pack/tests/fixtures/extend/example-variant");
        let built = resolve(&dir, &[packs()]).unwrap();
        let errors: Vec<_> = validate_pack(&built.pack)
            .into_iter()
            .filter(|i| i.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "{errors:?}");
        let mut flat = FlatPack::built(built.pack);
        let m = &flat.manifest;
        assert_eq!(m.resolved.len(), 1);
        assert_eq!(
            (
                m.resolved[0].id.as_str(),
                m.resolved[0].version.to_string().as_str()
            ),
            ("example-trainer", "0.1.0")
        );
        // Attribution and basis tags: the parent's first, then the child's, each once.
        assert_eq!(
            m.attribution.last().map(String::as_str),
            Some("Invented variant of the example trainer, for tests.")
        );
        assert_eq!(m.basis_tags, ["invented-example", "prior-release"]);
        // The hash is checked on its own (it changes with any content); the snapshot holds the rest.
        let hash = flat.manifest.content_hash.take().unwrap();
        assert!(
            hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()),
            "{hash}"
        );
        insta::assert_json_snapshot!("example-variant", flat);
    }

    #[test]
    fn each_kind_with_an_id_can_be_patched() {
        let pack = child(
            "kinds",
            "patches:
      - {op: set, stage: departure, to: {title: 'Departure, variant'}}
      - {op: set, list: smoke, to: {title: 'Smoke, variant'}}
      - {op: set, step: example-trainer.smoke.masks, to: {expect: ON AND 100%}}
      - {op: set, panel: overhead, to: {title: 'Overhead, variant'}}
      - {op: set, section: overhead/electrical, to: {title: Power}}
      - {op: set, item: autoflight/autoflight/alt, to: {description: 'Altitude, variant.'}}
      - {op: set, flight_field: runway, to: {label: Departure runway}}
      - {op: set, panel_state: ready, to: {title: 'Ready, variant'}}
      - {op: set, glossary_term: CDU, to: {meaning: The variant's computer.}}
      - {op: set, label: list_kinds.checklist, to: Check}
    ",
        )
        .unwrap();
        let c = &pack.content;
        assert_eq!(
            c.phases.as_ref().unwrap().stages[0].title,
            "Departure, variant"
        );
        assert_eq!(
            pack.checklists
                .iter()
                .find(|l| l.id == "smoke")
                .unwrap()
                .title,
            "Smoke, variant"
        );
        assert_eq!(
            step(&pack, "example-trainer.smoke.masks").unwrap().expect,
            "ON AND 100%"
        );
        let overhead = c.panels.iter().find(|p| p.id == "overhead").unwrap();
        assert_eq!(overhead.title, "Overhead, variant");
        assert_eq!(overhead.sections[0].title, "Power");
        let af = c.panels.iter().find(|p| p.id == "autoflight").unwrap();
        let alt = af.sections[0]
            .items
            .iter()
            .find(|i| i.id.as_deref() == Some("alt"))
            .unwrap();
        assert_eq!(alt.description, "Altitude, variant.");
        let runway = c
            .flight
            .as_ref()
            .unwrap()
            .fields
            .iter()
            .find(|f| f.id == "runway")
            .unwrap();
        assert_eq!(runway.label, "Departure runway");
        assert_eq!(
            c.panel_states.as_ref().unwrap().states[0].title,
            "Ready, variant"
        );
        let cdu = c
            .glossary
            .as_ref()
            .unwrap()
            .terms
            .iter()
            .find(|t| t.term == "CDU")
            .unwrap();
        assert_eq!(cdu.meaning, "The variant's computer.");
        assert_eq!(c.labels.list_kinds.checklist, "Check");
    }

    #[test]
    fn replace_remove_and_insert_work_on_lists_of_every_kind() {
        let pack = child(
            "ops",
            "patches:
      - op: replace
        flight_field: runway
        with: {id: runway, label: Runway in use, kind: text}
      - {op: remove, panel_state: ready}
      - op: insert_before
        glossary_term: CDU
        with:
          - {term: AAA, meaning: First.}
          - {term: AAB, meaning: Second.}
      - op: insert_after
        stage: departure
        with: {id: arrival, title: Arrival, phases: []}
      - {op: remove, label: roles}
    ",
        );
        // Removing a label that every pack has leaves the labels unreadable.
        assert!(err(pack).contains("patch 5 (remove label `roles`): leaves it unreadable"));
        let pack = child(
            "ops2",
            "patches:
      - op: replace
        flight_field: runway
        with: {id: runway, label: Runway in use, kind: text}
      - {op: remove, panel_state: ready}
      - op: insert_before
        glossary_term: CDU
        with:
          - {term: AAA, meaning: First.}
          - {term: AAB, meaning: Second.}
      - op: insert_after
        stage: departure
        with: {id: arrival, title: Arrival, phases: []}
    ",
        )
        .unwrap();
        let c = &pack.content;
        assert_eq!(c.flight.as_ref().unwrap().fields[0].label, "Runway in use");
        assert_eq!(c.panel_states.as_ref().unwrap().states.len(), 0);
        let terms: Vec<&str> = c
            .glossary
            .as_ref()
            .unwrap()
            .terms
            .iter()
            .map(|t| t.term.as_str())
            .collect();
        assert_eq!(terms[..3], ["AAA", "AAB", "CDU"]);
        let stages: Vec<&str> = c
            .phases
            .as_ref()
            .unwrap()
            .stages
            .iter()
            .map(|s| s.id.as_str())
            .collect();
        assert_eq!(stages, ["departure", "arrival"]);
    }

    #[test]
    fn an_item_without_an_id_cannot_be_patched_and_the_error_says_to_add_one() {
        let e = err(child(
            "noid",
            "patches:\n  - {op: set, item: overhead/electrical/battery, to: {description: X}}\n",
        ));
        assert!(
            e.contains("patches.yaml patch 1 (set item `overhead/electrical/battery`)"),
            "{e}"
        );
        assert!(
            e.contains("add the id `battery` to the item in the parent"),
            "{e}"
        );
    }

    #[test]
    fn an_unmatched_patch_and_two_patches_on_one_target_fail_naming_the_file_and_patch() {
        let e = err(child(
            "unmatched",
            "patches:\n  - {op: remove, step: example-trainer.nope.x}\n",
        ));
        assert!(e.contains("example-child: patches.yaml patch 1 (remove step `example-trainer.nope.x`): matches no step"), "{e}");
        let e = err(child(
            "conflict",
            "patches:
      - {op: set, list: smoke, to: {title: A}}
      - {op: remove, list: smoke}
    ",
        ));
        assert!(
            e.contains(
                "patches.yaml patch 2 (remove list `smoke`): patch 1 already changes this list"
            ),
            "{e}"
        );
    }

    #[test]
    fn a_patch_that_names_no_target_or_lacks_its_value_fails() {
        assert!(err(child("none", "patches:\n  - {op: remove}\n")).contains("names no target"));
        assert!(
            err(child("noto", "patches:\n  - {op: set, list: smoke}\n")).contains("needs `to`")
        );
        assert!(
            err(child(
                "bad",
                "patches:\n  - {op: set, list: smoke, to: {colour: red}}\n"
            ))
            .contains("leaves it unreadable")
        );
    }

    #[test]
    fn a_cycle_fails_naming_the_packs() {
        let place = scratch("cycle");
        let a = write_pack(
            &place,
            "pack-a",
            &serde_json::json!({"extends": {"pack-b": ">=0.1"}}),
            None,
        );
        write_pack(
            &place,
            "pack-b",
            &serde_json::json!({"extends": {"pack-a": ">=0.1"}}),
            None,
        );
        let e = resolve(&a, &[]).unwrap_err().to_string();
        assert!(
            e.contains("`extends` makes a cycle: pack-a → pack-b → pack-a"),
            "{e}"
        );
    }

    #[test]
    fn a_parent_outside_the_range_on_another_format_or_missing_fails() {
        let place = scratch("range");
        let dir = write_pack(
            &place,
            "old",
            &serde_json::json!({"extends": {"example-trainer": ">=2.0"}}),
            None,
        );
        let e = resolve(&dir, &[packs()]).unwrap_err().to_string();
        assert!(
            e.contains("extends `example-trainer` >=2.0, but the parent found is version 0.1.0"),
            "{e}"
        );
        let dir = write_pack(
            &place,
            "lost",
            &serde_json::json!({"extends": {"nowhere": ">=0.1"}}),
            None,
        );
        assert!(
            resolve(&dir, &[packs()])
                .unwrap_err()
                .to_string()
                .contains("its parent `nowhere` is in none of")
        );
        // A child on another format is refused before anything else is read.
        let dir = write_pack(
            &place,
            "newer",
            &serde_json::json!({"schemaVersion": 7}),
            None,
        );
        assert!(
            resolve(&dir, &[packs()])
                .unwrap_err()
                .to_string()
                .contains("format 7")
        );
    }

    #[test]
    fn a_child_does_not_give_a_content_file_its_parent_has_or_write_what_build_writes() {
        let place = scratch("doubled");
        let dir = write_pack(
            &place,
            "doubled",
            &serde_json::json!({"glossary": "glossary.yaml"}),
            None,
        );
        std::fs::write(dir.join("glossary.yaml"), "terms: []\n").unwrap();
        let e = resolve(&dir, &[packs()]).unwrap_err().to_string();
        assert!(
            e.contains(
                "its parent `example-trainer` already has `glossary`; change it with patches"
            ),
            "{e}"
        );
        let dir = write_pack(
            &place,
            "hashed",
            &serde_json::json!({"contentHash": "abc"}),
            None,
        );
        assert!(
            resolve(&dir, &[packs()])
                .unwrap_err()
                .to_string()
                .contains("written by `involo-pack build`")
        );
        let dir = write_pack(
            &place,
            "orphan",
            &serde_json::json!({"extends": {}}),
            Some("patches: []\n"),
        );
        assert!(
            resolve(&dir, &[packs()])
                .unwrap_err()
                .to_string()
                .contains("this pack `extends` none")
        );
    }

    #[test]
    fn a_child_s_own_lists_and_panels_follow_the_parent_s() {
        let place = scratch("own");
        let dir = write_pack(
            &place,
            "example-own",
            &serde_json::json!({"checklists": ["extra.yaml"]}),
            None,
        );
        std::fs::write(
            dir.join("extra.yaml"),
            "id: extra\ntitle: Extra\nkind: checklist\nbasis: [invented-example]\nsteps:\n  - {id: example-own.extra.a, text: Lights, expect: 'ON'}\n",
        )
        .unwrap();
        let pack = resolve(&dir, &[packs()]).unwrap().pack;
        assert_eq!(pack.checklists.last().map(|l| l.id.as_str()), Some("extra"));
        assert_eq!(pack.checklists.len(), 4);
    }

    #[test]
    fn a_library_resolves_as_a_parent_and_its_chain_is_recorded() {
        let place = scratch("library");
        let lib = place.join("lib.demo");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(
            lib.join("pack.json"),
            serde_json::json!({
                "id": "lib.demo", "name": "Demo library", "version": "1.2.0", "schemaVersion": 6,
                "kind": "library", "engine": ">=0.1.0", "license": "CC-BY-NC-SA-4.0",
                "attribution": ["Library notes."], "basisTags": ["invented-example"],
                "checklists": ["shared.yaml"]
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            lib.join("shared.yaml"),
            "id: shared\ntitle: Shared\nkind: checklist\nbasis: [invented-example]\nsteps:\n  - {id: lib.demo.shared.a, text: Lights, expect: 'ON'}\n",
        )
        .unwrap();
        // A middle pack extends the library; a child extends the middle one.
        write_pack(
            &place,
            "middle",
            &serde_json::json!({"extends": {"lib.demo": ">=1.0, <2"}, "checklists": []}),
            None,
        );
        let dir = write_pack(
            &place,
            "leaf",
            &serde_json::json!({"extends": {"middle": ">=0.1"}}),
            None,
        );
        let pack = resolve(&dir, &[]).unwrap().pack;
        let chain: Vec<String> = pack
            .manifest
            .resolved
            .iter()
            .map(|r| format!("{} {}", r.id, r.version))
            .collect();
        assert_eq!(chain, ["middle 0.1.0", "lib.demo 1.2.0"]);
        assert_eq!(pack.manifest.attribution, ["Library notes."]);
        // The library's step keeps its prefix: any pack up the chain may be one.
        let issues = validate_pack(&pack);
        assert!(
            !issues.iter().any(|i| i.message.contains("step id")),
            "{issues:?}"
        );
    }

    #[test]
    fn a_check_issue_the_patches_caused_names_the_patch() {
        let dir = write_pack(
            &scratch("attribute"),
            "example-child",
            &serde_json::json!({}),
            Some(
                "patches:\n  - op: insert_after\n    step: example-trainer.before-start.doors\n    with: {id: example-trainer.before-start.battery, text: Again, expect: 'ON'}\n",
            ),
        );
        let built = resolve(&dir, &[packs()]).unwrap();
        let issues = involo_pack::resolve::attribute(validate_pack(&built.pack), &built.touched);
        let twice = issues
            .iter()
            .find(|i| i.message.contains("twice"))
            .expect("a duplicate step id");
        assert!(
            twice.message.contains(
                "(after patches.yaml patch 1 (insert_after step `example-trainer.before-start.doors`))"
            ),
            "{twice}"
        );
    }

    fn example() -> FlatPack {
        FlatPack::from(resolve(&packs().join("example-trainer"), &[]).unwrap().pack)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        /// The content hash changes when any step's text changes, and only then: not for a manifest
        /// change, nor for building the same content again.
        #[test]
        fn the_content_hash_changes_with_the_content_and_only_then(n in 0usize..13, text in "[A-Z ]{1,12}", version in 0u64..50) {
            let base = example();
            let hash = |f: &FlatPack| involo_pack::resolve::content_hash(&f.lists, &f.content);
            let before = hash(&base);
            let mut same = example();
            same.manifest.version = semver::Version::new(version, 0, 0);
            prop_assert_eq!(&hash(&same), &before);
            let mut changed = example();
            let steps: Vec<_> = changed.lists.iter_mut().flat_map(|l| l.steps.iter_mut()).collect();
            let count = steps.len();
            let s = steps.into_iter().nth(n % count).unwrap();
            let was = s.expect.clone();
            s.expect = text.clone();
            prop_assert_eq!(hash(&changed) == before, was == text);
        }
    }
}
