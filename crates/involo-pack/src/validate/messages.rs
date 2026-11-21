// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Alert messages (decision 0029).

use std::collections::BTreeSet;

use super::ids::{unique, valid_segment};
use super::index::Index;
use super::{Code, Issue, error};
use crate::Pack;

/// Ids are well formed and unique; a message's text is given once per level; its list and steps
/// exist; a message without a list may say why none is needed, one with a list does not.
pub(super) fn check_messages(pack: &Pack, idx: &Index, issues: &mut Vec<Issue>) {
    let Some(file) = &pack.content.messages else {
        return;
    };
    unique(
        "message",
        file.messages.iter().map(|m| m.id.as_str()),
        issues,
    );
    let mut texts = BTreeSet::new();
    for m in &file.messages {
        let at = format!("message `{}`", m.id);
        if !valid_segment(&m.id) {
            issues.push(error(
                Code::IdFormat,
                &at,
                "an id is lower-case letters, digits and dashes",
            ));
        }
        if m.text.trim().is_empty() || m.meaning.trim().is_empty() {
            issues.push(error(
                Code::MessageText,
                &at,
                "a message needs its `text` and what it means (`meaning`)",
            ));
        }
        if !texts.insert((m.level, m.text.trim())) {
            issues.push(error(
                Code::MessageTwice,
                &at,
                format!("`{}` is given twice at this level", m.text.trim()),
            ));
        }
        if let Some(list) = &m.list {
            if !idx.lists.contains(list.as_str()) {
                issues.push(error(
                    Code::UnknownList,
                    &at,
                    format!("refers to unknown list `{list}`"),
                ));
            }
            if m.no_list.is_some() {
                issues.push(error(
                    Code::NoListReason,
                    &at,
                    "`no_list` says why a message has no list; this one has a `list`",
                ));
            }
        }
        for step in &m.steps {
            idx.require_step(&at, step, issues);
        }
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{Message, MessageLevel, MessagesFile, StepId};

    use super::super::test_support::{assert_flags, messages, pack, step};
    use crate::Pack;

    fn message(id: &str, text: &str, level: MessageLevel) -> Message {
        Message {
            id: id.into(),
            text: text.into(),
            level,
            meaning: "Something is wrong.".into(),
            list: Some("preflight".into()),
            no_list: None,
            steps: vec![StepId::new("demo-aircraft.preflight.a")],
        }
    }

    fn with(list: Vec<Message>) -> Pack {
        let mut p = pack(vec![step("a")], vec![]);
        p.content.messages = Some(MessagesFile { messages: list });
        p
    }

    #[test]
    fn messages_that_link_to_real_lists_and_steps_pass() {
        let mut memo = message("brake", "PARKING BRAKE", MessageLevel::Memo);
        memo.list = None;
        memo.no_list = Some("A reminder only.".into());
        memo.steps.clear();
        let p = with(vec![
            message("fire", "ENGINE FIRE", MessageLevel::Warning),
            memo,
        ]);
        assert_eq!(messages(&p), "");
    }

    #[test]
    fn a_link_to_a_missing_list_or_step_fails() {
        let mut m = message("fire", "ENGINE FIRE", MessageLevel::Warning);
        m.list = Some("nope".into());
        assert_flags(&with(vec![m]), "refers to unknown list `nope`");
        let mut m = message("fire", "ENGINE FIRE", MessageLevel::Warning);
        m.steps = vec![StepId::new("demo-aircraft.preflight.zz")];
        assert_flags(&with(vec![m]), "refers to unknown step");
    }

    #[test]
    fn text_is_unique_per_level_and_ids_are_unique() {
        let p = with(vec![
            message("fire", "ENGINE FIRE", MessageLevel::Warning),
            message("fire-2", "ENGINE FIRE", MessageLevel::Warning),
        ]);
        assert_flags(&p, "`ENGINE FIRE` is given twice at this level");
        // The same words at another level are another message.
        let p = with(vec![
            message("fire", "ENGINE FIRE", MessageLevel::Warning),
            message("fire-memo", "ENGINE FIRE", MessageLevel::Memo),
        ]);
        assert_eq!(messages(&p), "");
        let p = with(vec![
            message("fire", "ENGINE FIRE", MessageLevel::Warning),
            message("fire", "APU FAULT", MessageLevel::Advisory),
        ]);
        assert_flags(&p, "fire");
        assert_flags(
            &with(vec![message("Fire", "X", MessageLevel::Caution)]),
            "lower-case letters, digits and dashes",
        );
    }

    #[test]
    fn no_list_is_only_for_a_message_without_one() {
        let mut m = message("fire", "ENGINE FIRE", MessageLevel::Warning);
        m.no_list = Some("Nothing to do.".into());
        assert_flags(&with(vec![m]), "this one has a `list`");
    }
}
