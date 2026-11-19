// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The names the app shows for a pack's steps and controls, worked out once, here, when the app
//! reads the pack: every screen (the checklist, the step pane, Find, Practice, the flight log and
//! the update note) names a step the same way, because there is one rule.

use std::collections::BTreeSet;

use involo_checklist_core::Step;
use involo_pack::{FlatPack, PackNames};

/// Every step's and control's name, as the app shows them.
pub fn pack_names(pack: &FlatPack) -> PackNames {
    let terms = glossary(pack);
    let mut names = PackNames::default();
    for step in pack.lists.iter().flat_map(|l| &l.steps) {
        names
            .steps
            .entry(step.id.clone())
            .or_insert_with(|| step_name(pack, step));
    }
    for control in pack.content.controls.iter().flat_map(|c| &c.controls) {
        names
            .controls
            .insert(control.id.clone(), sentence(&control.name, &[], &terms));
    }
    names
}

fn glossary(pack: &FlatPack) -> BTreeSet<&str> {
    pack.content
        .glossary
        .iter()
        .flat_map(|g| &g.terms)
        .map(|t| t.term.as_str())
        .collect()
}

/// A step's name as its checklist row shows it: a name in capitals as a sentence, keeping its
/// controls' labels, glossary terms and codes (a word with a digit or a slash) in capitals; a
/// name in mixed case as it is.
pub(crate) fn step_name(pack: &FlatPack, step: &Step) -> String {
    let labels: Vec<String> = step
        .targets
        .iter()
        .filter_map(|t| {
            // The item's label on its panel. When the pack doesn't draw that panel (or that
            // section), the label the locator itself names: `panel/section/LABEL/n` gives LABEL.
            // A `panel/section/#id` locator names no label, so it gives none.
            involo_checklist_core::locate(&pack.content.panels, &t.at)
                .and_then(|(section, item)| section.items.get(item).map(|i| i.label.clone()))
                .or_else(|| {
                    let parts: Vec<&str> = t.at.split('/').collect();
                    (parts.len() > 3 && !t.at.contains("/#"))
                        .then(|| parts[2..parts.len() - 1].join("/"))
                })
        })
        .filter(|l| !l.is_empty())
        .collect();
    sentence(&step.text, &labels, &glossary(pack))
}

/// The name for a step logged before the log saved names (format 1), from its saved text: the
/// same rule with no control labels, which a log entry doesn't carry, and with its pack's glossary
/// when that pack is installed (`None` when it isn't). Codes (a word with a digit or a slash)
/// stay in capitals either way.
pub(crate) fn saved_text_name(text: &str, glossary: Option<&BTreeSet<String>>) -> String {
    let terms: BTreeSet<&str> = glossary.into_iter().flatten().map(String::as_str).collect();
    sentence(text, &[], &terms)
}

/// Each pack's glossary terms, by pack id, from installed packs' texts. A text that isn't a pack
/// is skipped: its entries are named without a glossary.
pub fn pack_glossaries(texts: &[String]) -> Glossaries {
    texts
        .iter()
        .filter_map(|text| serde_json::from_str::<FlatPack>(text).ok())
        .map(|pack| {
            let terms = glossary(&pack).into_iter().map(str::to_owned).collect();
            (pack.manifest.id.clone(), terms)
        })
        .collect()
}

/// Glossary terms by pack id: what naming a format 1 log's entries needs from installed packs.
pub type Glossaries = std::collections::BTreeMap<String, BTreeSet<String>>;

fn sentence(text: &str, keep: &[String], glossary: &BTreeSet<&str>) -> String {
    if text != text.to_uppercase() {
        return text.to_owned();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut kept = vec![false; chars.len()];
    let boundary = |c: Option<&char>| {
        c.is_none_or(|c| !(c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '/'))
    };
    let mut labels: Vec<&String> = keep.iter().collect();
    labels.sort_by_key(|l| std::cmp::Reverse(l.chars().count()));
    for label in labels {
        let label: Vec<char> = label.chars().collect();
        if label.is_empty() || label.len() > chars.len() {
            continue;
        }
        for at in 0..=chars.len() - label.len() {
            let end = at + label.len();
            if chars[at..end] == label[..]
                && boundary(at.checked_sub(1).and_then(|i| chars.get(i)))
                && boundary(chars.get(end))
            {
                kept[at..end].iter_mut().for_each(|k| *k = true);
            }
        }
    }
    // Words and the separators between them (runs of space, and each of `(`, `)` and `,`).
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let separator = |c: char| c.is_whitespace() || matches!(c, '(' | ')' | ',');
        let start = i;
        if chars[i].is_whitespace() {
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
        } else if separator(chars[i]) {
            i += 1;
        } else {
            while i < chars.len() && !separator(chars[i]) {
                i += 1;
            }
        }
        let word: String = chars[start..i].iter().collect();
        let keep_word = (!word.trim().is_empty() && kept[start..i].iter().all(|k| *k))
            || glossary.contains(word.as_str())
            || word.chars().any(|c| c.is_ascii_digit() || c == '/');
        out.push_str(&if keep_word { word } else { word.to_lowercase() });
    }
    let mut c = out.chars();
    c.next()
        .map_or_else(String::new, |first| first.to_uppercase().chain(c).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_in_capitals_reads_as_the_checklist_shows_it() {
        let glossary: BTreeSet<&str> = ["APU", "IRS"].into_iter().collect();
        let name = |text: &str, keep: &[&str]| {
            sentence(
                text,
                &keep.iter().map(|k| (*k).to_owned()).collect::<Vec<_>>(),
                &glossary,
            )
        };
        assert_eq!(
            name("ALTERNATE FLAPS MASTER SWITCH", &[]),
            "Alternate flaps master switch"
        );
        // The control's own label stays as it is on the panel.
        assert_eq!(
            name("STANDBY POWER SWITCH", &["STANDBY POWER"]),
            "STANDBY POWER switch"
        );
        // Glossary terms and codes stay in capitals; a name in mixed case stays as written.
        assert_eq!(name("APU BLEED AIR (IRS 2)", &[]), "APU bleed air (IRS 2)");
        assert_eq!(name("FMC/CDU PREFLIGHT", &[]), "FMC/CDU preflight");
        assert_eq!(name("Seat belt sign", &[]), "Seat belt sign");
        // A label inside a longer word is not the label.
        assert_eq!(name("APUS ON", &["APU"]), "Apus on");
    }

    #[test]
    fn a_pack_s_steps_and_controls_are_named_once_when_it_is_read() {
        let pack = crate::test_support::ifly_pack();
        let names = pack_names(&pack);
        let id =
            involo_checklist_core::StepId::new("ifly-737-max8.cold-dark.alternate-flaps-switches");
        assert_eq!(names.steps[&id], "Alternate flaps master switch");
        let id = involo_checklist_core::StepId::new("ifly-737-max8.cold-dark.standby-power-switch");
        assert_eq!(names.steps[&id], "STANDBY POWER switch");
        assert!(!names.controls.is_empty());
        // A pack read by the app carries them.
        let json = serde_json::to_string(&pack).unwrap();
        assert_eq!(crate::load_pack(&json).unwrap().names, names);
    }

    #[test]
    fn a_step_on_a_panel_the_pack_does_not_draw_keeps_the_label_its_locator_names() {
        let mut pack = crate::test_support::example_pack();
        pack.content.panels.clear();
        pack.content.glossary = None;
        let mut step = pack.lists[0].steps[0].clone();
        step.text = "STANDBY POWER SWITCH".into();
        let target = |at: &str| -> involo_checklist_core::StepTarget {
            serde_json::from_value(serde_json::json!({ "at": at })).unwrap()
        };
        // `panel/section/LABEL/n`: the label between the section and the count.
        step.targets = vec![target("oh/elec/STANDBY POWER/1")];
        assert_eq!(step_name(&pack, &step), "STANDBY POWER switch");
        // `panel/section/#id` names an item by its id, not its label: no label to keep.
        step.targets = vec![target("oh/elec/#stby-power")];
        assert_eq!(step_name(&pack, &step), "Standby power switch");
        // With no target at all, the name is the plain sentence.
        step.targets.clear();
        assert_eq!(step_name(&pack, &step), "Standby power switch");
    }

    #[test]
    fn a_saved_text_alone_is_named_by_the_same_rule_without_labels() {
        assert_eq!(saved_text_name("CREW OXYGEN", None), "Crew oxygen");
        assert_eq!(
            saved_text_name("FMC/CDU PREFLIGHT", None),
            "FMC/CDU preflight"
        );
        assert_eq!(saved_text_name("IRS 2 ALIGN", None), "Irs 2 align");
        assert_eq!(saved_text_name("Seat belt sign", None), "Seat belt sign");
        // With its pack's glossary, a glossary term stays in capitals.
        let glossary: BTreeSet<String> = ["IRS".to_owned()].into_iter().collect();
        assert_eq!(
            saved_text_name("IRS 2 ALIGN", Some(&glossary)),
            "IRS 2 align"
        );
    }

    #[test]
    fn installed_packs_give_their_glossaries_by_id() {
        let pack = crate::test_support::example_pack();
        let text = serde_json::to_string(&pack).unwrap();
        let glossaries = pack_glossaries(&[text, "not a pack".into()]);
        assert_eq!(glossaries.len(), 1);
        let terms = &glossaries[pack.manifest.id.as_str()];
        assert!(!terms.is_empty());
        assert_eq!(
            terms,
            &glossary(&pack).into_iter().map(str::to_owned).collect()
        );
    }
}
