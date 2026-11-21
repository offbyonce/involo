// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The guide's walkthrough (`docs/packs/walkthrough.md`), run as written: each command's output
//! the page shows is what the command prints, so the page can't drift from the command or the
//! starter pack.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};

    fn run(dir: &Path, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap()
    }

    fn stdout(o: &Output) -> String {
        String::from_utf8(o.stdout.clone()).unwrap()
    }

    /// The YAML blocks of the page, in order.
    fn yaml_blocks(page: &str) -> Vec<String> {
        page.split("```yaml\n")
            .skip(1)
            .map(|b| b.split("```").next().unwrap().to_owned())
            .collect()
    }

    /// Asserts the page shows `output` as one of its blocks. The page shows paths with `/`, as
    /// macOS and Linux print them; Windows prints its own separator, which the page notes.
    fn shown(page: &str, output: &str, what: &str) {
        let output = output.replace(std::path::MAIN_SEPARATOR, "/");
        let block = format!("```\n{output}```");
        assert!(
            page.contains(&block),
            "walkthrough.md should show the {what} output as\n{block}"
        );
    }

    #[test]
    fn the_walkthrough_runs_as_written() {
        let page = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/packs/walkthrough.md"),
        )
        .unwrap();
        let dir: PathBuf =
            std::env::temp_dir().join(format!("pack-walkthrough-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let blocks = yaml_blocks(&page);
        let [step, targets, alias] = blocks.as_slice() else {
            panic!("walkthrough.md has {} YAML blocks, not 3", blocks.len());
        };

        let new = run(&dir, &["new", "my-twin", "--name", "My Twin"]);
        assert!(new.status.success());
        shown(&page, &stdout(&new), "`new`");
        shown(
            &page,
            &stdout(&run(&dir, &["check", "my-twin"])),
            "first `check`",
        );

        let list = dir.join("my-twin").join("lists").join("before-start.yaml");
        let text = std::fs::read_to_string(&list).unwrap();
        std::fs::write(&list, format!("{}\n{step}", text.trim_end())).unwrap();
        let failing = run(&dir, &["check", "my-twin"]);
        assert_eq!(failing.status.code(), Some(1));
        shown(&page, &stdout(&failing), "failing `check`");

        let text = std::fs::read_to_string(&list).unwrap();
        std::fs::write(&list, format!("{text}{targets}")).unwrap();
        let passing = run(&dir, &["check", "my-twin"]);
        assert!(passing.status.success(), "{}", stdout(&passing));
        shown(&page, &stdout(&passing), "passing `check`");

        let built = run(&dir, &["build", "my-twin", "dist"]);
        assert!(built.status.success());
        shown(&page, &stdout(&built), "`build`");

        // The update: the renamed id, its alias and a new version still check.
        let text = std::fs::read_to_string(&list).unwrap();
        std::fs::write(
            &list,
            text.replace(
                "my-twin.before-start.parking-brake",
                "my-twin.before-start.park-brake",
            ),
        )
        .unwrap();
        let aliases = dir.join("my-twin").join("aliases.yaml");
        let text = std::fs::read_to_string(&aliases).unwrap();
        std::fs::write(&aliases, format!("{}\n{alias}", text.trim_end())).unwrap();
        let manifest = dir.join("my-twin").join("pack.json");
        let text = std::fs::read_to_string(&manifest).unwrap();
        std::fs::write(
            &manifest,
            text.replace("\"version\": \"0.1.0\"", "\"version\": \"0.2.0\""),
        )
        .unwrap();
        let updated = run(&dir, &["check", "my-twin"]);
        assert!(
            stdout(&updated).starts_with("ok   my-twin 0.2.0"),
            "{}",
            stdout(&updated)
        );
        assert!(run(&dir, &["build", "my-twin", "dist"]).status.success());
        assert!(dir.join("dist").join("my-twin-0.2.0.involo-pack").is_file());
        let _ = std::fs::remove_dir_all(dir);
    }
}
