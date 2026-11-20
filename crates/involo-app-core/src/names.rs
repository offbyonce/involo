// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The names the app shows for a pack's steps and controls, worked out once, here, when the app
//! reads the pack: every screen (the checklist, the step pane, Find, Practice, the flight log and
//! the update note) names a step the same way, because there is one rule.

use std::collections::{BTreeSet, HashSet};

use involo_checklist_core::Step;
use involo_pack::{FlatPack, PackNames};

/// Every step's and control's name, as the app shows them. The pack's glossary is indexed once
/// and each word of each name is looked up in it, so naming grows with the length of the names,
/// not with steps × terms.
pub fn pack_names(pack: &FlatPack) -> PackNames {
    let terms = Terms::of(pack);
    let mut names = PackNames::default();
    for step in pack.lists.iter().flat_map(|l| &l.steps) {
        names
            .steps
            .entry(step.id.clone())
            .or_insert_with(|| step_name_with(pack, step, &terms));
    }
    for control in pack.content.controls.iter().flat_map(|c| &c.controls) {
        names.controls.insert(
            control.id.clone(),
            sentence(&control.name, &[], |w| terms.contains(w)),
        );
    }
    names
}

/// A pack's glossary terms, indexed once for naming: a word is looked up in one step, however
/// many terms there are.
pub(crate) struct Terms<'a>(HashSet<&'a str>);

impl<'a> Terms<'a> {
    pub(crate) fn of(pack: &'a FlatPack) -> Self {
        Self(glossary(pack).collect())
    }

    fn contains(&self, word: &str) -> bool {
        self.0.contains(word)
    }
}

fn glossary(pack: &FlatPack) -> impl Iterator<Item = &str> {
    pack.content
        .glossary
        .iter()
        .flat_map(|g| &g.terms)
        .map(|t| t.term.as_str())
}

/// One step's name (see [`step_name_with`]), for tests. It indexes the pack's glossary for this
/// one step; the app indexes it once per pack with [`Terms::of`].
#[cfg(test)]
pub(crate) fn step_name(pack: &FlatPack, step: &Step) -> String {
    step_name_with(pack, step, &Terms::of(pack))
}

/// A step's name as its checklist row shows it: a name in capitals as a sentence, keeping its
/// controls' labels, glossary terms and codes (a word with a digit or a slash) in capitals; a
/// name in mixed case as it is.
pub(crate) fn step_name_with(pack: &FlatPack, step: &Step, terms: &Terms) -> String {
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
    sentence(&step.text, &labels, |w| terms.contains(w))
}

/// The name for a step logged before the log saved names (format 1), from its saved text: the
/// same rule with no control labels, which a log entry doesn't carry, and with its pack's glossary
/// when that pack is installed (`None` when it isn't). Codes (a word with a digit or a slash)
/// stay in capitals either way.
pub(crate) fn saved_text_name(text: &str, glossary: Option<&BTreeSet<String>>) -> String {
    sentence(text, &[], |w| glossary.is_some_and(|g| g.contains(w)))
}

/// Each pack's glossary terms, by pack id, from installed packs' texts. A text that isn't a pack
/// is skipped: its entries are named without a glossary.
pub fn pack_glossaries(texts: &[String]) -> Glossaries {
    texts
        .iter()
        .filter_map(|text| serde_json::from_str::<FlatPack>(text).ok())
        .map(|pack| {
            let terms = glossary(&pack).map(str::to_owned).collect();
            (pack.manifest.id.clone(), terms)
        })
        .collect()
}

/// Glossary terms by pack id: what naming a format 1 log's entries needs from installed packs.
pub type Glossaries = std::collections::BTreeMap<String, BTreeSet<String>>;

/// `text` as a name: `is_term` says whether a word is one of the pack's glossary terms.
fn sentence(text: &str, keep: &[String], is_term: impl Fn(&str) -> bool) -> String {
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
            || is_term(word.as_str())
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
                |w| glossary.contains(w),
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
        assert_eq!(terms, &glossary(&pack).map(str::to_owned).collect());
    }

    /// A pack at the limits on what naming reads (`involo_pack::limits`): the most steps, each
    /// text as long as it may be and in capitals (so every word is looked up), and the most
    /// glossary terms, some of them in the texts.
    pub(crate) fn pack_at_the_limits() -> FlatPack {
        use involo_pack::limits::{MAX_GLOSSARY_TERMS, MAX_NAME_CHARS, MAX_STEPS};
        let mut pack = crate::test_support::ifly_pack();
        let glossary = pack.content.glossary.as_mut().unwrap();
        let entry = glossary.terms[0].clone();
        for n in glossary.terms.len()..MAX_GLOSSARY_TERMS {
            let mut e = entry.clone();
            e.term = format!("TERM{n}");
            glossary.terms.push(e);
        }
        let words = "APU BLEED AIR SWITCH TERM1999 STANDBY POWER (IRS 2) FMC/CDU ";
        let text: String = words.repeat(MAX_NAME_CHARS / words.len() + 1)[..MAX_NAME_CHARS]
            .trim_end()
            .to_owned();
        let first = pack.lists[0].steps[0].clone();
        let mut n = pack.lists.iter().map(|l| l.steps.len()).sum::<usize>();
        let steps = &mut pack.lists[0].steps;
        while n < MAX_STEPS {
            let mut s = first.clone();
            s.id = involo_checklist_core::StepId::new(format!("ifly-737-max8.limits.step-{n}"));
            s.text.clone_from(&text);
            steps.push(s);
            n += 1;
        }
        assert_eq!(
            involo_pack::limits::over_limits(&pack.lists, &pack.content),
            vec![]
        );
        pack
    }

    /// The best of three timings of naming `pack`'s steps and controls.
    fn naming_time(pack: &FlatPack) -> std::time::Duration {
        (0..3)
            .map(|_| {
                let start = std::time::Instant::now();
                let names = pack_names(pack);
                let took = start.elapsed();
                assert_eq!(names.steps.len(), involo_pack::limits::MAX_STEPS);
                took
            })
            .min()
            .unwrap()
    }

    /// Naming looks each word up in the glossary, indexed once per pack: it grows with the length
    /// of the names, not with steps × terms. Before the index, the glossary was gathered again for
    /// every step, and a pack at the limits took 255 ms to name in an optimized build (1.49 s in
    /// a test build); with it, 32 ms (278 ms).
    #[test]
    fn a_pack_at_the_limits_is_named_in_well_under_a_second() {
        let pack = pack_at_the_limits();
        let mut no_glossary = pack.clone();
        no_glossary.content.glossary = None;
        let (with_terms, without) = (naming_time(&pack), naming_time(&no_glossary));
        // 2,000 terms cost about what none do. Before the index they cost 8 times as much; the
        // margin leaves room for a busy machine (the tests run in parallel).
        assert!(
            with_terms < without * 3 + std::time::Duration::from_millis(50),
            "naming took {with_terms:?} with the glossary and {without:?} without it"
        );
        // Tests build without optimizing, several times slower than the app, and run beside the
        // other tests: the budget there allows for both, and the old naming still missed it.
        let budget = if cfg!(debug_assertions) {
            std::time::Duration::from_millis(1200)
        } else {
            std::time::Duration::from_millis(100)
        };
        assert!(
            with_terms < budget,
            "naming a pack at the limits took {with_terms:?}"
        );
    }
}
