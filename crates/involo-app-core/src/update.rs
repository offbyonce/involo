// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! A pack update during a flight (decision 0028): what changed between two versions of a pack,
//! and the saved flight brought in line with the new version through the pack's `aliases`.
//!
//! One version of each pack is installed, so the changes are worked out when an update is
//! downloaded, while both versions are at hand (What's new, and Update). The flight keeps them
//! as its update note until the pilot dismisses it; loading the flight with the new version then
//! keeps its ticks through the aliases and marks the removed steps whose ticks went.

use std::collections::{BTreeMap, BTreeSet};

use involo_checklist_core::{AliasKind, Step, StepId};
use involo_pack::FlatPack;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::flight::Flight;

/// A step added or removed by an update, as the note lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ChangedStep {
    /// The step's id: in the new version for an added step, in the old one for a removed step.
    pub step: StepId,
    /// The step's name.
    pub title: String,
    /// Where it is: "Departure › Before start" (the stage and phase), or the reference phase.
    pub place: String,
    /// A removed step the flight had ticked: the tick is gone with it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub was_ticked: bool,
}

/// One field of a step reworded by an update: its name in the note, and the wording before and
/// after.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Rewording {
    /// "Name", "Value", "Check" or "If not".
    pub field: String,
    pub before: String,
    pub after: String,
}

/// A step that is still there, reworded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct RewordedStep {
    /// The step's id in the new version.
    pub step: StepId,
    pub title: String,
    pub place: String,
    pub fields: Vec<Rewording>,
}

/// What changed between two versions of a pack: the steps added, reworded and removed, each in
/// its pack's order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct PackChanges {
    pub pack_name: String,
    pub from_version: String,
    pub to_version: String,
    pub added: Vec<ChangedStep>,
    pub reworded: Vec<RewordedStep>,
    pub removed: Vec<ChangedStep>,
    /// Ticks lost to steps the pack no longer has when no list of changes was made (a flight
    /// brought in line with a version it was never compared with): counted, never named by id.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub lost_ticks: u32,
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_zero(n: &u32) -> bool {
    *n == 0
}

/// The note a flight keeps after its pack updated, until the pilot dismisses it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct UpdateNote {
    pub changes: PackChanges,
    /// Whether the note has been shown: its list of changes opens by itself only the first time.
    pub seen: bool,
}

/// The update note's actions: keep what changed, mark the note shown, or dismiss it.
pub(crate) fn apply_note(flight: &mut Flight, action: crate::Action) {
    match action {
        crate::Action::NoteUpdate { changes } => {
            flight.update = Some(UpdateNote {
                changes,
                seen: false,
            });
        }
        crate::Action::SeeUpdateNote => {
            if let Some(note) = &mut flight.update {
                note.seen = true;
            }
        }
        crate::Action::DismissUpdateNote => flight.update = None,
        _ => {}
    }
}

/// The new id of each id the pack's `aliases` retire, for one kind of alias.
fn aliases(pack: &FlatPack, kind: AliasKind) -> BTreeMap<&str, &str> {
    pack.content
        .aliases
        .iter()
        .flat_map(|f| &f.aliases)
        .filter(|a| a.kind == kind)
        .map(|a| (a.from.as_str(), a.to.as_str()))
        .collect()
}

/// Where each step is shown: "<stage> › <phase>", or a reference phase's title.
fn places(pack: &FlatPack) -> BTreeMap<&str, String> {
    let Some(file) = &pack.content.phases else {
        return BTreeMap::new();
    };
    let mut out = BTreeMap::new();
    for phase in &file.phases {
        let stage = file
            .stages
            .iter()
            .find(|s| s.phases.iter().any(|p| p.phase == phase.id));
        let place = match stage {
            Some(s) => format!("{} › {}", s.title, phase.title),
            None => phase.title.clone(),
        };
        for list in pack.lists.iter().filter(|l| phase.lists.contains(&l.id)) {
            for step in &list.steps {
                out.entry(step.id.as_str()).or_insert_with(|| place.clone());
            }
        }
    }
    out
}

fn steps(pack: &FlatPack) -> impl Iterator<Item = &Step> {
    pack.lists.iter().flat_map(|l| &l.steps)
}

/// The fields the note compares, by the name it gives them.
fn wording(step: &Step) -> [(&'static str, String); 4] {
    [
        ("Name", step.text.clone()),
        ("Value", step.expect.clone()),
        ("Check", step.check.clone().unwrap_or_default()),
        ("If not", step.if_not.clone().unwrap_or_default()),
    ]
}

/// What changed from `old` to `new`, two versions of one pack. A step is the same step when it
/// keeps its id or `new`'s aliases retire its old id for its new one.
pub fn pack_changes(old: &FlatPack, new: &FlatPack) -> PackChanges {
    let renamed = aliases(new, AliasKind::Step);
    let now = |id: &StepId| -> StepId {
        renamed
            .get(id.as_str())
            .map_or_else(|| id.clone(), |to| StepId::new(*to))
    };
    let (old_places, new_places) = (places(old), places(new));
    let old_steps: BTreeMap<StepId, &Step> = steps(old).map(|s| (now(&s.id), s)).collect();
    let new_ids: BTreeSet<&StepId> = steps(new).map(|s| &s.id).collect();
    let place = |places: &BTreeMap<&str, String>, id: &StepId| {
        places.get(id.as_str()).cloned().unwrap_or_default()
    };
    let mut added = Vec::new();
    let mut reworded = Vec::new();
    for step in steps(new) {
        match old_steps.get(&step.id) {
            None => added.push(ChangedStep {
                step: step.id.clone(),
                title: step.text.clone(),
                place: place(&new_places, &step.id),
                was_ticked: false,
            }),
            Some(before) => {
                let fields: Vec<Rewording> = wording(before)
                    .into_iter()
                    .zip(wording(step))
                    .filter(|((_, a), (_, b))| a != b)
                    .map(|((field, before), (_, after))| Rewording {
                        field: field.to_owned(),
                        before,
                        after,
                    })
                    .collect();
                if !fields.is_empty() {
                    reworded.push(RewordedStep {
                        step: step.id.clone(),
                        title: step.text.clone(),
                        place: place(&new_places, &step.id),
                        fields,
                    });
                }
            }
        }
    }
    let removed = steps(old)
        .filter(|s| !new_ids.contains(&now(&s.id)))
        .map(|s| ChangedStep {
            step: s.id.clone(),
            title: s.text.clone(),
            place: place(&old_places, &s.id),
            was_ticked: false,
        })
        .collect();
    PackChanges {
        pack_name: new.manifest.name.clone(),
        from_version: old.manifest.version.to_string(),
        to_version: new.manifest.version.to_string(),
        added,
        reworded,
        removed,
        lost_ticks: 0,
    }
}

/// The flight brought in line with `pack` when it was saved with another version (decision
/// 0028); unchanged when the version is the same. Ticks, skips, timers and blanks follow the
/// pack's step and blank aliases; a step the pack no longer has loses its marks, and when it was
/// ticked its row in the update note says so (a note is made for it when the flight has none). Option values follow
/// the option aliases, and a value the pack no longer offers goes back to unanswered. A panel
/// state follows its alias, and one the pack no longer has is cleared (the ticks it made stay).
pub fn reconcile(pack: &FlatPack, flight: &Flight) -> Flight {
    let version = pack.manifest.version.to_string();
    if flight.pack_version == version {
        return flight.clone();
    }
    let mut f = flight.clone();
    let known: BTreeSet<&str> = steps(pack).map(|s| s.id.as_str()).collect();
    let renamed = aliases(pack, AliasKind::Step);
    let step_now = |id: &StepId| -> Option<StepId> {
        let to = renamed.get(id.as_str()).copied().unwrap_or(id.as_str());
        known.contains(to).then(|| StepId::new(to))
    };
    let dropped: Vec<StepId> = f
        .session
        .remap(step_now)
        .into_iter()
        .filter(|id| flight.session.is_done(id))
        .collect();
    f.state_ticks = f.state_ticks.iter().filter_map(step_now).collect();
    f.state_skips = f.state_skips.iter().filter_map(step_now).collect();
    f.timers = std::mem::take(&mut f.timers)
        .into_iter()
        .filter_map(|(id, at)| step_now(&id).map(|to| (to, at)))
        .collect();
    let blanks = aliases(pack, AliasKind::Blank);
    f.blanks = std::mem::take(&mut f.blanks)
        .into_iter()
        .filter_map(|(key, text)| {
            let key = blanks
                .get(key.as_str())
                .map_or(key.clone(), |to| (*to).to_owned());
            let (step, n) = key.split_once('#')?;
            let step = step_now(&StepId::new(step))?;
            Some((format!("{step}#{n}"), text))
        })
        .collect();
    reconcile_options(pack, &mut f);
    reconcile_panel_state(pack, &mut f);
    let lost: BTreeSet<&StepId> = dropped.iter().collect();
    match &mut f.update {
        Some(note) => {
            for row in &mut note.changes.removed {
                row.was_ticked = lost.contains(&row.step);
            }
            // A lost tick the list doesn't name is counted, never shown by its id.
            let named: BTreeSet<&StepId> = note.changes.removed.iter().map(|r| &r.step).collect();
            let unnamed = lost.iter().filter(|id| !named.contains(*id)).count();
            note.changes.lost_ticks = u32::try_from(unnamed).unwrap_or(u32::MAX);
        }
        None if !dropped.is_empty() => {
            // No list of changes to mark: say how many ticks went, never which step ids.
            f.update = Some(UpdateNote {
                changes: PackChanges {
                    pack_name: pack.manifest.name.clone(),
                    from_version: f.pack_version.clone(),
                    to_version: version.clone(),
                    added: vec![],
                    reworded: vec![],
                    removed: vec![],
                    lost_ticks: u32::try_from(dropped.len()).unwrap_or(u32::MAX),
                },
                seen: false,
            });
        }
        None => {}
    }
    f.pack_version = version;
    f
}

/// Option values through the option aliases; a value or option the pack no longer has goes
/// (unanswered, so the pack's default or a decision step asks again).
fn reconcile_options(pack: &FlatPack, f: &mut Flight) {
    let renamed = aliases(pack, AliasKind::OptionValue);
    let offered: BTreeMap<&str, Vec<&str>> = pack
        .content
        .phases
        .iter()
        .flat_map(|p| &p.options)
        .map(|o| (o.id.as_str(), o.values.iter().map(String::as_str).collect()))
        .collect();
    let mut options = BTreeMap::new();
    for (option, value) in std::mem::take(&mut f.options) {
        let key = format!("{option}:{value}");
        let (option, value) = match renamed.get(key.as_str()).and_then(|to| to.split_once(':')) {
            Some((o, v)) => (o.to_owned(), v.to_owned()),
            None => (option, value),
        };
        if offered
            .get(option.as_str())
            .is_some_and(|values| values.contains(&value.as_str()))
        {
            options.insert(option, value);
        }
    }
    f.answers.retain(|option, _| options.contains_key(option));
    f.options = options;
}

/// The panel state through its alias; cleared when the pack no longer has it.
fn reconcile_panel_state(pack: &FlatPack, f: &mut Flight) {
    let Some(state) = f.panel_state.take() else {
        return;
    };
    let renamed = aliases(pack, AliasKind::PanelState);
    let state = renamed
        .get(state.as_str())
        .map_or(state.clone(), |to| (*to).to_owned());
    let exists = pack
        .content
        .panel_states
        .iter()
        .flat_map(|p| &p.states)
        .any(|s| s.id == state);
    if exists {
        f.panel_state = Some(state);
    } else {
        // The state is gone; the ticks it made stay, as the pilot's.
        f.state_ticks.clear();
        f.state_skips.clear();
    }
}

#[cfg(test)]
mod tests {
    use involo_checklist_core::{Alias, AliasesFile};

    use super::*;
    use crate::flight::new_flight;
    use crate::test_support::example_pack;

    const BATTERY: &str = "example-trainer.before-start.battery";
    const BEACON: &str = "example-trainer.before-start.beacon";
    const DOORS: &str = "example-trainer.before-start.doors";
    const MAIN_POWER: &str = "example-trainer.before-start.main-power";

    fn id(s: &str) -> StepId {
        StepId::new(s)
    }

    /// The example pack's next version: the battery step renamed (with its alias), the doors step
    /// removed, a step added, the beacon step reworded, the external power value retired for
    /// `ground`, and the `ready` panel state gone.
    fn next() -> FlatPack {
        let mut p = example_pack();
        p.manifest.version = semver::Version::new(0, 2, 0);
        let list = &mut p.lists[0];
        list.steps[0].id = id(MAIN_POWER);
        list.steps.retain(|s| s.id.as_str() != DOORS);
        let beacon = list
            .steps
            .iter_mut()
            .find(|s| s.id.as_str() == BEACON)
            .unwrap();
        beacon.expect = "ON, CHECK".into();
        beacon.check = Some("Beacon flashing".into());
        let mut added = list.steps[0].clone();
        added.id = id("example-trainer.before-start.seat-belts");
        added.text = "Seat belt sign".into();
        list.steps.push(added);
        let aliases = p
            .content
            .aliases
            .get_or_insert_with(|| AliasesFile { aliases: vec![] });
        aliases.aliases.push(Alias {
            kind: AliasKind::Step,
            from: BATTERY.into(),
            to: MAIN_POWER.into(),
        });
        aliases.aliases.push(Alias {
            kind: AliasKind::OptionValue,
            from: "power:external".into(),
            to: "power:ground".into(),
        });
        let power = p
            .content
            .phases
            .as_mut()
            .unwrap()
            .options
            .iter_mut()
            .find(|o| o.id == "power")
            .unwrap();
        power.values = vec!["ground".into(), "internal".into()];
        power.default = "ground".into();
        power.choices.clear();
        p.content.panel_states.as_mut().unwrap().states.clear();
        p
    }

    #[test]
    fn what_changed_lists_the_steps_added_reworded_and_removed() {
        let changes = pack_changes(&example_pack(), &next());
        assert_eq!(
            (changes.from_version.as_str(), changes.to_version.as_str()),
            ("0.1.0", "0.2.0")
        );
        let ids =
            |rows: &[ChangedStep]| rows.iter().map(|r| r.step.to_string()).collect::<Vec<_>>();
        // The renamed step is the same step, through its alias: not added, not removed.
        assert_eq!(
            ids(&changes.added),
            ["example-trainer.before-start.seat-belts"]
        );
        assert_eq!(ids(&changes.removed), [DOORS]);
        assert_eq!(changes.added[0].title, "Seat belt sign");
        assert_eq!(changes.added[0].place, "Departure › Before start");
        assert_eq!(changes.reworded.len(), 1);
        let beacon = &changes.reworded[0];
        assert_eq!(beacon.step.as_str(), BEACON);
        let fields: Vec<(&str, &str, &str)> = beacon
            .fields
            .iter()
            .map(|f| (f.field.as_str(), f.before.as_str(), f.after.as_str()))
            .collect();
        assert_eq!(
            fields,
            [
                ("Value", "ON", "ON, CHECK"),
                ("Check", "", "Beacon flashing")
            ]
        );
    }

    #[test]
    fn ticks_follow_the_aliases_and_a_removed_step_s_tick_is_reported() {
        let old = example_pack();
        let new = next();
        let mut flight = new_flight(&old);
        let list = &old.lists[0];
        flight.session.tick(list, &id(BATTERY), 1).unwrap();
        flight.session.tick(list, &id(DOORS), 2).unwrap();
        flight.session.skip(list, &id(BEACON), 3).unwrap();
        flight.update = Some(UpdateNote {
            changes: pack_changes(&old, &new),
            seen: false,
        });
        let f = reconcile(&new, &flight);
        assert_eq!(
            f.session.done_at(&id(MAIN_POWER)),
            Some(1),
            "kept under the new id"
        );
        assert_eq!(f.session.done_at(&id(BATTERY)), None);
        assert_eq!(f.session.done_at(&id(DOORS)), None);
        assert!(f.session.is_skipped(&id(BEACON)));
        let note = f.update.unwrap();
        assert!(
            note.changes.removed[0].was_ticked,
            "the doors tick is listed as not kept"
        );
        assert_eq!(f.pack_version, "0.2.0");
    }

    #[test]
    fn a_retired_option_value_follows_its_alias_and_a_removed_one_is_unanswered() {
        let old = example_pack();
        let mut flight = new_flight(&old);
        flight.options.insert("power".into(), "external".into());
        flight.options.insert("start".into(), "turnaround".into());
        flight.options.insert("gone".into(), "x".into());
        let f = reconcile(&next(), &flight);
        assert_eq!(f.options.get("power").map(String::as_str), Some("ground"));
        assert_eq!(
            f.options.get("start").map(String::as_str),
            Some("turnaround")
        );
        assert!(!f.options.contains_key("gone"));
        // A value the new version doesn't offer and has no alias for goes back to unanswered.
        let mut flight = new_flight(&old);
        flight.options.insert("start".into(), "hot".into());
        assert!(!reconcile(&next(), &flight).options.contains_key("start"));
    }

    #[test]
    fn a_removed_panel_state_is_cleared_and_the_ticks_it_made_stay() {
        let old = example_pack();
        let mut flight = new_flight(&old);
        flight.panel_state = Some("ready".into());
        flight.session.tick(&old.lists[0], &id(BEACON), 4).unwrap();
        flight.state_ticks.insert(id(BEACON));
        let f = reconcile(&next(), &flight);
        assert_eq!(f.panel_state, None);
        assert!(f.state_ticks.is_empty());
        assert_eq!(f.session.done_at(&id(BEACON)), Some(4));
    }

    #[test]
    fn the_same_version_changes_nothing_and_makes_no_note() {
        let pack = example_pack();
        let mut flight = new_flight(&pack);
        flight.options.insert("gone".into(), "x".into());
        assert_eq!(reconcile(&pack, &flight), flight);
        assert_eq!(reconcile(&pack, &flight).update, None);
    }

    #[test]
    fn a_tick_lost_without_a_note_still_says_so() {
        let old = example_pack();
        let mut flight = new_flight(&old);
        flight.session.tick(&old.lists[0], &id(DOORS), 2).unwrap();
        let f = reconcile(&next(), &flight);
        let note = f.update.expect("a note for the lost tick");
        // Counted, never named by its step id.
        assert_eq!(note.changes.lost_ticks, 1);
        assert_eq!(note.changes.removed, vec![]);
        assert!(!serde_json::to_string(&note).unwrap().contains(DOORS));
    }

    #[test]
    fn the_note_is_kept_then_shown_then_dismissed_for_good() {
        let pack = example_pack();
        let changes = pack_changes(&pack, &next());
        let f = crate::apply(
            &pack,
            new_flight(&pack),
            crate::Action::NoteUpdate {
                changes: changes.clone(),
            },
        )
        .unwrap();
        assert_eq!(
            f.update,
            Some(UpdateNote {
                changes,
                seen: false
            })
        );
        let f = crate::apply(&pack, f, crate::Action::SeeUpdateNote).unwrap();
        assert!(f.update.as_ref().unwrap().seen);
        let f = crate::apply(&pack, f, crate::Action::DismissUpdateNote).unwrap();
        assert_eq!(f.update, None);
        // A flight saved with the note reads back with it.
        let saved = serde_json::to_string(
            &crate::apply(
                &pack,
                f,
                crate::Action::NoteUpdate {
                    changes: pack_changes(&pack, &next()),
                },
            )
            .unwrap(),
        )
        .unwrap();
        let crate::Loaded::Ready { value, .. } = crate::load_flight(&saved) else {
            panic!("did not load")
        };
        assert!(value.update.is_some());
    }
}
