// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The limits on what a pack may hold, named once here. Packs are files people add from
//! anywhere, so whatever a file holds, reading and checking it must end quickly with a clear
//! answer. Each limit is many times what the largest pack today needs (the iFly 737 MAX 8: a
//! 0.6 MB built file, 527 steps, 152 glossary terms, files of at most 62 KB), and the pack
//! authoring docs list them (`docs/packs/limits.md`).

use involo_checklist_core::Checklist;

use crate::PackContent;

/// The largest built pack file the app reads (`.involo-pack`). A larger file is refused before
/// it is read.
pub const MAX_PACK_FILE_BYTES: u64 = 16 * 1024 * 1024;

/// The largest `pack.json` or YAML data file in a pack folder. A larger file is refused before
/// it is read.
pub const MAX_DATA_FILE_BYTES: u64 = 4 * 1024 * 1024;

/// How deeply a YAML data file may nest maps and lists.
pub const MAX_YAML_NESTING: usize = 64;

/// How deeply a JSON file (`pack.json`, a built pack file) may nest. This is the JSON reader's
/// own limit; it is named here so the docs and tests have one place to find it.
pub const MAX_JSON_NESTING: usize = 128;

/// The most YAML nodes (each map, list and value) in one data file.
pub const MAX_YAML_NODES: usize = 250_000;

/// The most YAML aliases (`*name`) in one data file.
pub const MAX_YAML_ALIASES: usize = 10_000;

/// The most packs in one `extends` chain, the pack itself included.
pub const MAX_EXTENDS_CHAIN: usize = 8;

/// The most steps in a pack, over all its lists.
pub const MAX_STEPS: usize = 5_000;

/// The most terms in a pack's glossary.
pub const MAX_GLOSSARY_TERMS: usize = 2_000;

/// The longest step text or control name, in characters. The app looks for every glossary term
/// in each of these to name them, so their length and the glossary's size are bounded together.
pub const MAX_NAME_CHARS: usize = 300;

/// The YAML reader's budget, from the limits above.
pub(crate) fn yaml_budget() -> serde_saphyr::Budget {
    // Budget is non-exhaustive: set fields on a default rather than building a literal.
    let mut budget = serde_saphyr::Budget::default();
    budget.max_depth = MAX_YAML_NESTING;
    budget.max_nodes = MAX_YAML_NODES;
    budget.max_aliases = MAX_YAML_ALIASES;
    budget
}

/// The size limit a file of `bytes` goes over, as a sentence naming `what`, or `None`.
#[must_use]
pub fn file_too_large(what: &str, bytes: u64, limit: u64) -> Option<String> {
    (bytes > limit).then(|| {
        format!(
            "{what} is {}, over the {} a pack may use for it",
            size(bytes),
            size(limit)
        )
    })
}

fn size(bytes: u64) -> String {
    const MB: u64 = 1024 * 1024;
    if bytes >= MB {
        // Tenths of a megabyte, in whole numbers: no float.
        let tenths = (bytes * 10).div_ceil(MB);
        format!("{}.{} MB", tenths / 10, tenths % 10)
    } else {
        format!("{} KB", bytes.div_ceil(1024))
    }
}

/// Every item limit the pack's lists and content go over, each as `(where, what)`. Checked
/// before anything else reads the pack's content.
#[must_use]
pub fn over_limits(lists: &[Checklist], content: &PackContent) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let steps: usize = lists.iter().map(|l| l.steps.len()).sum();
    if steps > MAX_STEPS {
        out.push((
            "lists".to_owned(),
            format!("the pack has {steps} steps; the most a pack may have is {MAX_STEPS}"),
        ));
    }
    let terms = content.glossary.as_ref().map_or(0, |g| g.terms.len());
    if terms > MAX_GLOSSARY_TERMS {
        out.push((
            "glossary".to_owned(),
            format!(
                "the glossary has {terms} terms; the most a pack may have is {MAX_GLOSSARY_TERMS}"
            ),
        ));
    }
    let long = |at: &str, what: &str, text: &str| {
        let chars = text.chars().count();
        (chars > MAX_NAME_CHARS).then(|| {
            (
                at.to_owned(),
                format!("{what} is {chars} characters; the most is {MAX_NAME_CHARS}"),
            )
        })
    };
    out.extend(
        lists
            .iter()
            .flat_map(|l| &l.steps)
            .filter_map(|s| long(s.id.as_str(), "its text", &s.text)),
    );
    out.extend(
        content
            .controls
            .iter()
            .flat_map(|c| &c.controls)
            .filter_map(|c| long(&c.id, "its name", &c.name)),
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 5000 as the docs write it: 5,000.
    fn grouped(n: usize) -> String {
        let digits = n.to_string();
        let mut out = String::new();
        for (i, c) in digits.chars().enumerate() {
            if i > 0 && (digits.len() - i).is_multiple_of(3) {
                out.push(',');
            }
            out.push(c);
        }
        out
    }

    #[test]
    fn sizes_read_as_an_author_would_write_them() {
        assert_eq!(
            file_too_large("controls.yaml", 5 * 1024 * 1024, MAX_DATA_FILE_BYTES).as_deref(),
            Some("controls.yaml is 5.0 MB, over the 4.0 MB a pack may use for it")
        );
        assert_eq!(file_too_large("a", 10, 10), None);
        assert_eq!(size(1500), "2 KB");
    }

    #[test]
    fn the_authoring_docs_give_every_limit() {
        let page = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/packs/limits.md"),
        )
        .unwrap();
        let mb = |bytes: u64| format!("{} MB", bytes / (1024 * 1024));
        for (what, value) in [
            ("MAX_PACK_FILE_BYTES", mb(MAX_PACK_FILE_BYTES)),
            ("MAX_DATA_FILE_BYTES", mb(MAX_DATA_FILE_BYTES)),
            ("MAX_YAML_NESTING", format!("{MAX_YAML_NESTING} levels")),
            ("MAX_JSON_NESTING", format!("{MAX_JSON_NESTING} levels")),
            ("MAX_YAML_NODES", format!("| {} |", grouped(MAX_YAML_NODES))),
            (
                "MAX_YAML_ALIASES",
                format!("| {} |", grouped(MAX_YAML_ALIASES)),
            ),
            ("MAX_STEPS", format!("| {} |", grouped(MAX_STEPS))),
            (
                "MAX_GLOSSARY_TERMS",
                format!("| {} |", grouped(MAX_GLOSSARY_TERMS)),
            ),
            ("MAX_NAME_CHARS", format!("| {MAX_NAME_CHARS} characters |")),
            ("MAX_EXTENDS_CHAIN", format!("| {MAX_EXTENDS_CHAIN} |")),
        ] {
            assert!(
                page.contains(&value),
                "docs/packs/limits.md doesn't give {what} as {value:?}"
            );
        }
    }

    #[test]
    fn the_largest_pack_today_is_well_inside_every_limit() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/ifly-737-max8");
        let pack = crate::load_pack_dir(&dir).unwrap();
        assert_eq!(over_limits(&pack.checklists, &pack.content), vec![]);
        let steps: usize = pack.checklists.iter().map(|l| l.steps.len()).sum();
        assert!(steps * 5 < MAX_STEPS, "{steps} steps");
        let terms = pack.content.glossary.as_ref().map_or(0, |g| g.terms.len());
        assert!(terms * 5 < MAX_GLOSSARY_TERMS, "{terms} terms");
    }
}
