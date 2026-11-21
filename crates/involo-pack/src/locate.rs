// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Where in a pack's files a problem is: the file, and the line where the source has one
//! (decision 0030). The checks work on the loaded pack, which keeps no positions, so this reads the
//! files' text: an issue names its subject (a step id, a list id, `panel `x``, a file), and the
//! subject is found by its `id:` line, as a key, or else anywhere it is written; then, within the
//! subject's block, the line that holds a value the message names in backticks, if any.

use crate::{Issue, LoadError, ResolveError};

/// A problem's place: the file (a path in the pack folder, with `/`) and its 1-based line.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct Located {
    pub file: Option<String>,
    pub line: Option<u32>,
}

/// The fields whose value names the entry a block is about.
const NAMING_KEYS: &[&str] = &["id", "from", "locator", "label", "title", "name", "key"];

/// Where `issue` is in `files`: `(path in the pack folder, text)`, in the order to search them.
pub fn locate(files: &[(String, String)], issue: &Issue) -> Located {
    let at = issue.at.replace('\\', "/");
    let wanted = ticked(&issue.message);
    // The subject is a file of the pack: the line is the first value the message names in it.
    if let Some((path, text)) = files.iter().find(|(p, _)| *p == at) {
        let lines: Vec<&str> = text.lines().collect();
        let line = wanted
            .iter()
            .flat_map(|w| last_part(w))
            .find_map(|w| find_in(&lines, 0, lines.len(), w));
        return Located {
            file: Some(path.clone()),
            line: line.map(line_number),
        };
    }
    for subject in subjects(&at) {
        for how in [Naming::Field, Naming::Key, Naming::Anywhere] {
            for (path, text) in files {
                let lines: Vec<&str> = text.lines().collect();
                let start = match how {
                    Naming::Anywhere => find_in(&lines, 0, lines.len(), &subject),
                    _ => lines
                        .iter()
                        .position(|l| names(l, &subject, how == Naming::Field)),
                };
                let Some(start) = start else {
                    continue;
                };
                let end = block_end(&lines, start);
                let line = wanted
                    .iter()
                    .filter(|w| **w != subject)
                    .find_map(|w| find_in(&lines, start, end, w))
                    .unwrap_or(start);
                return Located {
                    file: Some(path.clone()),
                    line: Some(line_number(line)),
                };
            }
        }
    }
    Located::default()
}

/// How a line names an issue's subject, in the order they are tried.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Naming {
    /// As a naming field's value: `- id: battery`.
    Field,
    /// As a key: `start_page:`.
    Key,
    /// Anywhere, as a whole word or value: `- {kind: list, from: 'm:Smoke', to: smoke}`.
    Anywhere,
}

/// Where a pack that couldn't be read or built went wrong: the file in the pack folder `dir` the
/// error names, and the line its message gives (`line 12`).
pub fn locate_error(dir: &std::path::Path, error: &ResolveError) -> Located {
    let ResolveError::Load(load) = error else {
        return Located::default();
    };
    let (LoadError::Io { path, .. }
    | LoadError::Yaml { path, .. }
    | LoadError::Json { path, .. }
    | LoadError::Format { path, .. }
    | LoadError::File { path, .. }) = load;
    let file = path
        .strip_prefix(dir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let text = load.to_string();
    let line = text.split("line ").nth(1).and_then(|rest| {
        rest.split(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|n| n.parse().ok())
    });
    Located {
        file: Some(file),
        line,
    }
}

fn line_number(index: usize) -> u32 {
    u32::try_from(index + 1).unwrap_or(u32::MAX)
}

/// The values a message names in backticks, in order.
fn ticked(text: &str) -> Vec<String> {
    text.split('`')
        .skip(1)
        .step_by(2)
        .map(str::to_owned)
        .filter(|t| !t.trim().is_empty())
        .collect()
}

/// A dotted field name's last part (`aircraft.icaoTypes` → `icaoTypes`), and the name itself.
fn last_part(name: &str) -> Vec<&str> {
    let mut out = vec![name];
    if let Some((_, last)) = name.rsplit_once('.') {
        out.insert(0, last);
    }
    out
}

/// What an issue's `at` may name, most specific first: the values it quotes in backticks, the
/// whole of it (a step, list or option id, or a key such as `start_page`), and the list a link
/// path starts in (`list before-start/steps/3/text`).
fn subjects(at: &str) -> Vec<String> {
    let mut out: Vec<String> = ticked(at).into_iter().rev().collect();
    out.push(at.to_owned());
    let head = at.split('/').next().unwrap_or(at);
    let head = head.strip_prefix("list ").unwrap_or(head);
    out.push(head.to_owned());
    out.retain(|s| !s.trim().is_empty());
    out.dedup();
    out
}

/// A line that names `subject`: as a naming field's value (`- id: battery`) when `named`, or as
/// a key (`start_page:`, `"icaoTypes":`) otherwise.
fn names(line: &str, subject: &str, named: bool) -> bool {
    let body = line.trim_start().trim_start_matches("- ").trim_start();
    let Some((key, value)) = body.split_once(':') else {
        return false;
    };
    let key = key.trim().trim_matches('"');
    if named {
        let value = value.split(" #").next().unwrap_or(value).trim();
        let value = value.trim_end_matches(',').trim_matches(['"', '\'']);
        NAMING_KEYS.contains(&key) && value == subject
    } else {
        key == subject.trim_matches(['"', '\''])
    }
}

/// The line after the block that starts at `start`: the lines below it that are indented more
/// than its entry (the `- ` of a list item, or the key), or the whole file for a top-level key.
fn block_end(lines: &[&str], start: usize) -> usize {
    let indent = |l: &str| l.len() - l.trim_start().len();
    let own = indent(lines[start]);
    // A top-level key such as a list file's `id:`: the block is the whole file.
    if own == 0 && !lines[start].starts_with('-') {
        return lines.len();
    }
    lines
        .iter()
        .enumerate()
        .skip(start + 1)
        .find(|(_, l)| !l.trim().is_empty() && indent(l) <= own)
        .map_or(lines.len(), |(i, _)| i)
}

/// The first line in `lines[from..to]` that holds `word` as a whole word or value.
fn find_in(lines: &[&str], from: usize, to: usize, word: &str) -> Option<usize> {
    if word.is_empty() {
        return None;
    }
    (from..to.min(lines.len())).find(|&i| {
        let line = lines[i];
        line.match_indices(word).any(|(pos, _)| {
            let before = line[..pos].chars().next_back();
            let after = line[pos + word.len()..].chars().next();
            let edge = |c: Option<char>| c.is_none_or(|c| !(c.is_alphanumeric() || c == '_'));
            edge(before) && edge(after)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Code, Severity};

    fn files() -> Vec<(String, String)> {
        vec![
            (
                "pack.json".into(),
                "{\n  \"id\": \"demo\",\n  \"aircraft\": {\n    \"icaoTypes\": [\"b738\"]\n  }\n}\n"
                    .into(),
            ),
            (
                "lists/before-start.yaml".into(),
                "id: before-start\nsteps:\n  - id: demo.before-start.battery\n    text: Battery\n    terms: [XPDR]\n  - id: demo.before-start.beacon\n    text: Beacon\n"
                    .into(),
            ),
            (
                "panels/overhead.yaml".into(),
                "id: overhead\nsections:\n  - id: electrical\n    items:\n      - id: battery\n        label: BATTERY\n".into(),
            ),
        ]
    }

    fn issue(at: &str, message: &str) -> Issue {
        Issue {
            severity: Severity::Error,
            code: Code::UnknownTerm,
            at: at.into(),
            message: message.into(),
        }
    }

    fn place(at: &str, message: &str) -> (Option<String>, Option<u32>) {
        let l = locate(&files(), &issue(at, message));
        (l.file, l.line)
    }

    #[test]
    fn finds_a_step_by_its_id_and_the_value_the_message_names_in_it() {
        assert_eq!(
            place(
                "demo.before-start.battery",
                "term `XPDR` is not in the glossary"
            ),
            (Some("lists/before-start.yaml".into()), Some(5))
        );
        // Not in the step's own block: the step's line.
        assert_eq!(
            place(
                "demo.before-start.beacon",
                "term `XPDR` is not in the glossary"
            ),
            (Some("lists/before-start.yaml".into()), Some(6))
        );
    }

    #[test]
    fn finds_a_quoted_subject_and_a_field_of_pack_json() {
        assert_eq!(
            place(
                "section `electrical`",
                "`BATTERY` lies outside the section's outline"
            ),
            (Some("panels/overhead.yaml".into()), Some(6))
        );
        assert_eq!(
            place("pack.json", "`aircraft.icaoTypes` must list at least one"),
            (Some("pack.json".into()), Some(4))
        );
        // A list's own field: found anywhere in its file.
        assert_eq!(
            place("before-start", "basis `XPDR` is not declared"),
            (Some("lists/before-start.yaml".into()), Some(5))
        );
        assert_eq!(
            place("list before-start/steps/1/text", "link"),
            (Some("lists/before-start.yaml".into()), Some(1))
        );
    }

    #[test]
    fn says_nothing_it_cannot_find() {
        assert_eq!(place("nothing-like-it", "no `such` thing"), (None, None));
    }
}
