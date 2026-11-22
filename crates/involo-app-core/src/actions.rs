// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The only way the interface changes a flight (decision 0012).

use involo_checklist_core::{FieldId, Millis, StepId};
use involo_pack::FlatPack;
use serde::Deserialize;
use ts_rs::TS;

use crate::AppError;
use crate::flight::{AnswerSource, BriefingMark, Flight};
use crate::values::blank_key;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub enum Action {
    /// The pilot confirmed the step in the cockpit.
    Tick {
        step: StepId,
        #[ts(type = "number")]
        at: Millis,
    },
    Untick {
        step: StepId,
    },
    /// Skipped for now; it stays open.
    Skip {
        step: StepId,
        #[ts(type = "number")]
        at: Millis,
    },
    /// Back to do: the skip mark goes.
    Unskip {
        step: StepId,
    },
    /// Clear every tick and skip in one list.
    ClearList {
        list: String,
    },
    SetOption {
        option: String,
        value: String,
    },
    /// A decision step's answer (decisions 0022 and 0027): sets the option and records how it
    /// was given.
    Answer {
        option: String,
        value: String,
        by: AnswerSource,
    },
    /// A flight value, typed by the pilot. An empty value removes it (decision 0019).
    SetValue {
        field: FieldId,
        value: String,
    },
    /// Several flight values at once, such as those a SimBrief plan fills in; each replaces the
    /// value it covers, and the whole change is one step to undo (decision 0019).
    SetValues {
        #[ts(type = "Record<string, string>")]
        values: std::collections::BTreeMap<FieldId, String>,
    },
    /// What the pilot typed into a step's blank (`index` from 0). Empty removes the entry, so the
    /// blank shows the linked flight value again.
    SetBlank {
        step: StepId,
        index: usize,
        value: String,
    },
    /// The clearance and other notes from the flight strip.
    SetNotes {
        notes: String,
    },
    /// The pack's panel state the flight starts from, or none. It sets the state's options and
    /// ticks and skips the steps it has already set; picking another state, or none, takes back
    /// only the marks the earlier state made. The pilot's own ticks and skips are never changed.
    SetPanelState {
        state: Option<String>,
        #[ts(type = "number")]
        at: Millis,
    },
    /// A new flight: ticks, values, notes, timers and briefings are cleared; option choices are kept.
    Clear,
    /// The pack is updating while this flight is saved: keep what changed as the update note
    /// (decision 0028), in place of any earlier note.
    NoteUpdate {
        changes: crate::update::PackChanges,
    },
    /// The update note has been shown: its list no longer opens by itself.
    SeeUpdateNote,
    /// The pilot dismissed the update note; it doesn't come back.
    DismissUpdateNote,
    /// Pause a running step timer: it keeps the time it has left (#213).
    PauseTimer {
        step: StepId,
        #[ts(type = "number")]
        at: Millis,
    },
    /// Run a paused step timer on from the time it had left.
    ResumeTimer {
        step: StepId,
        #[ts(type = "number")]
        at: Millis,
    },
    /// Start a step timer again from its whole time, now.
    RestartTimer {
        step: StepId,
        #[ts(type = "number")]
        at: Millis,
    },
    /// The pilot gave a briefing (#214): Briefed.
    Brief {
        briefing: String,
        #[ts(type = "number")]
        at: Millis,
    },
    /// The pilot skipped a briefing; it stays open until it is given.
    SkipBriefing {
        briefing: String,
        #[ts(type = "number")]
        at: Millis,
    },
    /// Back to give: the briefed or skipped mark goes.
    UnmarkBriefing {
        briefing: String,
    },
}

/// Marks a briefing given or skipped, or takes the mark away (#214).
fn mark_briefing(pack: &FlatPack, flight: &mut Flight, action: Action) -> Result<(), AppError> {
    let known = |id: &str| -> Result<String, AppError> {
        pack.content
            .briefings
            .iter()
            .flat_map(|f| &f.briefings)
            .any(|b| b.id == id)
            .then(|| id.to_owned())
            .ok_or_else(|| invalid(format!("no briefing `{id}`")))
    };
    match action {
        Action::Brief { briefing, at } => {
            let id = known(&briefing)?;
            flight.briefings.insert(id, BriefingMark::Briefed { at });
        }
        Action::SkipBriefing { briefing, at } => {
            let id = known(&briefing)?;
            flight.briefings.insert(id, BriefingMark::Skipped { at });
        }
        Action::UnmarkBriefing { briefing } => {
            let id = known(&briefing)?;
            flight.briefings.remove(&id);
        }
        _ => {}
    }
    Ok(())
}

/// Pause, resume or restart a step timer (#213): a pause keeps the time it had left, and a resume
/// or restart sets the start that counts, over the tick that started it.
fn change_timer(pack: &FlatPack, flight: &mut Flight, action: Action) -> Result<(), AppError> {
    match action {
        Action::PauseTimer { step, at } => {
            let timer = crate::timers::timer_of(pack, flight, &step).map_err(invalid)?;
            if timer.started_at.is_none() || timer.paused_left.is_some() {
                return Err(invalid(format!("the timer on `{step}` is not running")));
            }
            flight.timer_pauses.insert(step, timer.left_at(at));
        }
        Action::ResumeTimer { step, at } => {
            let timer = crate::timers::timer_of(pack, flight, &step).map_err(invalid)?;
            let Some(left) = timer.paused_left else {
                return Err(invalid(format!("the timer on `{step}` is not paused")));
            };
            let whole = u64::from(timer.seconds) * 1000;
            flight.timer_pauses.remove(&step);
            flight
                .timers
                .insert(step, at.saturating_sub(whole - left.min(whole)));
        }
        Action::RestartTimer { step, at } => {
            crate::timers::timer_of(pack, flight, &step).map_err(invalid)?;
            flight.timer_pauses.remove(&step);
            flight.timers.insert(step, at);
        }
        _ => {}
    }
    Ok(())
}

/// A new flight: everything the last one marked or entered goes; option choices stay, except the
/// answers to decision steps.
fn clear(pack: &FlatPack, flight: &mut Flight) {
    flight.panel_state = None;
    flight.state_ticks.clear();
    flight.state_skips.clear();
    flight.session.clear();
    flight.values.clear();
    flight.blanks.clear();
    flight.notes.clear();
    flight.timers.clear();
    flight.timer_pauses.clear();
    flight.briefings.clear();
    // A decision belongs to its flight: the next one asks again.
    for option in decided(pack) {
        flight.options.remove(option);
    }
    flight.answers.clear();
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::InvalidAction(message.into())
}

/// Takes back the earlier state's own marks, then applies the new state's options, ticks and
/// skips to steps the pilot has not marked.
fn set_panel_state(
    pack: &FlatPack,
    flight: &mut Flight,
    state: Option<String>,
    at: Millis,
) -> Result<(), AppError> {
    let list_of = |step: &StepId| pack.lists.iter().find(|l| l.contains(step));
    let chosen = match &state {
        Some(id) => Some(
            pack.content
                .panel_states
                .iter()
                .flat_map(|f| &f.states)
                .find(|s| &s.id == id)
                .ok_or_else(|| invalid(format!("no panel state `{id}`")))?
                .clone(),
        ),
        None => None,
    };
    for step in std::mem::take(&mut flight.state_ticks) {
        if let Some(list) = list_of(&step) {
            let _ = flight.session.untick(list, &step);
        }
    }
    for step in std::mem::take(&mut flight.state_skips) {
        if let Some(list) = list_of(&step) {
            let _ = flight.session.unskip(list, &step);
        }
    }
    if let Some(s) = chosen {
        for (option, value) in &s.set {
            set_option(pack, flight, option.clone(), value.clone())?;
        }
        for step in &s.done {
            let Some(list) = list_of(step) else { continue };
            if flight.session.done_at(step).is_none() && !flight.session.is_skipped(step) {
                flight
                    .session
                    .tick(list, step, at)
                    .map_err(|e| invalid(e.to_string()))?;
                flight.state_ticks.insert(step.clone());
            }
        }
        for step in &s.skip {
            let Some(list) = list_of(step) else { continue };
            if flight.session.done_at(step).is_none() && !flight.session.is_skipped(step) {
                flight
                    .session
                    .skip(list, step, at)
                    .map_err(|e| invalid(e.to_string()))?;
                flight.state_skips.insert(step.clone());
            }
        }
    }
    flight.panel_state = state;
    Ok(())
}

fn set_value(
    pack: &FlatPack,
    flight: &mut Flight,
    field: &FieldId,
    value: &str,
) -> Result<(), AppError> {
    let Some(def) = crate::values::field(pack, field) else {
        return Err(invalid(format!(
            "`{field}` is not a flight field of this pack"
        )));
    };
    // Kept as typed: the interface saves on every keystroke, so a space typed between words must
    // stay. A blank value removes the entry.
    if value.trim().is_empty() {
        flight.values.remove(field);
        return Ok(());
    }
    if let Some(ok) = crate::values::allowed(def)
        && !ok.contains(&value)
    {
        return Err(invalid(format!(
            "`{value}` is not one of {}",
            ok.join(", ")
        )));
    }
    flight.values.insert(field.clone(), value.to_owned());
    Ok(())
}

/// The options a decision step asks (decision 0022).
fn decided(pack: &FlatPack) -> Vec<&str> {
    pack.lists
        .iter()
        .flat_map(|l| &l.steps)
        .filter_map(|s| s.decide.as_deref())
        .collect()
}

fn set_option(
    pack: &FlatPack,
    flight: &mut Flight,
    option: String,
    value: String,
) -> Result<(), AppError> {
    let known = pack
        .content
        .phases
        .iter()
        .flat_map(|p| &p.options)
        .find(|o| o.id == option);
    match known {
        None => Err(invalid(format!("unknown option `{option}`"))),
        Some(o) if !o.values.contains(&value) => {
            Err(invalid(format!("option `{option}` has no value `{value}`")))
        }
        Some(_) => {
            flight.options.insert(option, value);
            Ok(())
        }
    }
}

fn set_blank(
    pack: &FlatPack,
    flight: &mut Flight,
    step: &StepId,
    index: usize,
    value: &str,
) -> Result<(), AppError> {
    let found = pack
        .lists
        .iter()
        .flat_map(|l| &l.steps)
        .find(|s| &s.id == step)
        .ok_or_else(|| invalid(format!("unknown step `{step}`")))?;
    if index >= found.fill.len() {
        return Err(invalid(format!("step `{step}` has no blank {index}")));
    }
    let key = blank_key(found, index);
    if value.trim().is_empty() {
        flight.blanks.remove(&key);
    } else {
        flight.blanks.insert(key, value.to_owned());
    }
    Ok(())
}

/// Apply an action and return the changed flight.
pub fn apply(pack: &FlatPack, mut flight: Flight, action: Action) -> Result<Flight, AppError> {
    if flight.pack != pack.manifest.id {
        return Err(invalid(format!(
            "this flight belongs to pack {}",
            flight.pack
        )));
    }
    let list_of = |step: &StepId| {
        pack.lists
            .iter()
            .find(|l| l.contains(step))
            .ok_or_else(|| invalid(format!("unknown step `{step}`")))
    };
    match action {
        Action::Tick { step, at } => {
            let list = list_of(&step)?;
            // A mark the pilot makes is theirs: a later state change leaves it alone.
            flight.state_ticks.remove(&step);
            flight.state_skips.remove(&step);
            flight
                .session
                .tick(list, &step, at)
                .map_err(|e| invalid(e.to_string()))?;
        }
        Action::Untick { step } => {
            let list = list_of(&step)?;
            flight.state_ticks.remove(&step);
            flight
                .session
                .untick(list, &step)
                .map_err(|e| invalid(e.to_string()))?;
        }
        Action::Skip { step, at } => {
            let list = list_of(&step)?;
            flight.state_ticks.remove(&step);
            flight.state_skips.remove(&step);
            flight
                .session
                .skip(list, &step, at)
                .map_err(|e| invalid(e.to_string()))?;
        }
        Action::Unskip { step } => {
            let list = list_of(&step)?;
            flight.state_skips.remove(&step);
            flight
                .session
                .unskip(list, &step)
                .map_err(|e| invalid(e.to_string()))?;
        }
        Action::ClearList { list } => {
            let list = pack
                .lists
                .iter()
                .find(|l| l.id == list)
                .ok_or_else(|| invalid(format!("unknown list `{list}`")))?;
            flight.session.clear_list(list);
        }
        Action::SetOption { option, value } => set_option(pack, &mut flight, option, value)?,
        Action::Answer { option, value, by } => {
            if !decided(pack).contains(&option.as_str()) {
                return Err(invalid(format!("no step asks option `{option}`")));
            }
            set_option(pack, &mut flight, option.clone(), value)?;
            flight.answers.insert(option, by);
        }
        Action::SetValue { field, value } => set_value(pack, &mut flight, &field, &value)?,
        Action::SetValues { values } => {
            for (field, value) in &values {
                set_value(pack, &mut flight, field, value)?;
            }
        }
        Action::SetBlank { step, index, value } => {
            set_blank(pack, &mut flight, &step, index, &value)?;
        }
        Action::SetNotes { notes } => flight.notes = notes,
        Action::SetPanelState { state, at } => set_panel_state(pack, &mut flight, state, at)?,
        Action::Clear => clear(pack, &mut flight),
        note @ (Action::NoteUpdate { .. } | Action::SeeUpdateNote | Action::DismissUpdateNote) => {
            crate::update::apply_note(&mut flight, note);
        }
        timer @ (Action::PauseTimer { .. }
        | Action::ResumeTimer { .. }
        | Action::RestartTimer { .. }) => change_timer(pack, &mut flight, timer)?,
        brief @ (Action::Brief { .. }
        | Action::SkipBriefing { .. }
        | Action::UnmarkBriefing { .. }) => mark_briefing(pack, &mut flight, brief)?,
    }
    Ok(flight)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::flight::new_flight;

    #[test]
    fn a_panel_state_marks_its_steps_and_a_change_takes_back_only_its_own() {
        let pack = crate::test_support::ifly_pack();
        let states = &pack.content.panel_states.as_ref().unwrap().states;
        let cd = states.iter().find(|s| s.id == "cd").unwrap().clone();
        let gpu = states.iter().find(|s| s.id == "gpu").unwrap().clone();
        let hand = cd.done[0].clone();
        // The pilot ticks one of the state's steps by hand first.
        let f = apply(
            &pack,
            new_flight(&pack),
            Action::Tick {
                step: hand.clone(),
                at: 1,
            },
        )
        .unwrap();
        let f = apply(
            &pack,
            f,
            Action::SetPanelState {
                state: Some("gpu".into()),
                at: 2,
            },
        )
        .unwrap();
        assert_eq!(f.panel_state.as_deref(), Some("gpu"));
        assert_eq!(f.options["power"], "gpu");
        for step in &gpu.done {
            assert!(f.session.done_at(step).is_some(), "{step} ticked");
        }
        assert!(
            !f.state_ticks.contains(&hand),
            "the pilot's own tick is not the state's"
        );
        assert_eq!(f.session.done_at(&hand), Some(1));
        // Back to Cold & Dark: the steps only GPU set are open again; the pilot's tick stays.
        let only_gpu: Vec<_> = gpu
            .done
            .iter()
            .filter(|s| !cd.done.contains(s))
            .cloned()
            .collect();
        assert_ne!(only_gpu.len(), 0);
        let f = apply(
            &pack,
            f,
            Action::SetPanelState {
                state: Some("cd".into()),
                at: 3,
            },
        )
        .unwrap();
        for step in &only_gpu {
            assert!(f.session.done_at(step).is_none(), "{step} taken back");
        }
        assert_eq!(f.session.done_at(&hand), Some(1));
        // A step the state ticked and the pilot then ticks again by hand becomes theirs.
        let other = cd.done.iter().find(|s| **s != hand).unwrap().clone();
        let f = apply(
            &pack,
            f,
            Action::Untick {
                step: other.clone(),
            },
        )
        .unwrap();
        let f = apply(
            &pack,
            f,
            Action::Tick {
                step: other.clone(),
                at: 4,
            },
        )
        .unwrap();
        let f = apply(&pack, f, Action::SetPanelState { state: None, at: 5 }).unwrap();
        assert_eq!(f.panel_state, None);
        assert_eq!(f.session.done_at(&other), Some(4));
        assert_eq!(f.session.done_at(&hand), Some(1));
        assert!(f.state_ticks.is_empty() && f.state_skips.is_empty());
        assert!(
            apply(
                &pack,
                f,
                Action::SetPanelState {
                    state: Some("nope".into()),
                    at: 6
                }
            )
            .is_err()
        );
    }
    use crate::test_support::{example_pack, ifly_pack};

    fn step() -> StepId {
        StepId::new("example-twin.before-start.battery")
    }

    #[test]
    fn tick_skip_and_clear_change_the_flight() {
        let pack = example_pack();
        let flight = new_flight(&pack);
        let skipped = apply(
            &pack,
            flight,
            Action::Skip {
                step: step(),
                at: 5,
            },
        )
        .unwrap();
        assert!(skipped.session.is_skipped(&step()));
        let ticked = apply(
            &pack,
            skipped,
            Action::Tick {
                step: step(),
                at: 9,
            },
        )
        .unwrap();
        assert!(!ticked.session.is_skipped(&step()), "ticking un-skips");
        assert_eq!(ticked.session.done_at(&step()), Some(9));
        let cleared = apply(&pack, ticked, Action::Clear).unwrap();
        assert!(!cleared.session.is_done(&step()));
    }

    #[test]
    fn an_answer_sets_the_option_and_records_how_it_was_given() {
        let pack = ifly_pack();
        let flight = new_flight(&pack);
        assert!(
            !flight.options.contains_key("center_tank"),
            "asked, so unanswered"
        );
        let answered = apply(
            &pack,
            flight,
            Action::Answer {
                option: "center_tank".into(),
                value: "less".into(),
                by: AnswerSource::You,
            },
        )
        .unwrap();
        assert_eq!(answered.options["center_tank"], "less");
        assert_eq!(answered.answers["center_tank"], AnswerSource::You);
        let changed = apply(
            &pack,
            answered,
            Action::Answer {
                option: "center_tank".into(),
                value: "more".into(),
                by: AnswerSource::Changed,
            },
        )
        .unwrap();
        assert_eq!(changed.options["center_tank"], "more");
        assert_eq!(changed.answers["center_tank"], AnswerSource::Changed);
        let wrong = Action::Answer {
            option: "center_tank".into(),
            value: "half".into(),
            by: AnswerSource::You,
        };
        assert!(matches!(
            apply(&pack, changed, wrong),
            Err(AppError::InvalidAction(_))
        ));
    }

    #[test]
    fn options_must_be_declared_and_wrong_steps_are_refused() {
        let pack = example_pack();
        let flight = new_flight(&pack);
        let option = pack.content.phases.as_ref().unwrap().options[0].clone();
        let other = option
            .values
            .iter()
            .find(|v| **v != option.default)
            .unwrap()
            .clone();
        let changed = apply(
            &pack,
            flight.clone(),
            Action::SetOption {
                option: option.id.clone(),
                value: other.clone(),
            },
        )
        .unwrap();
        assert_eq!(changed.options[&option.id], other);
        let bad_value = Action::SetOption {
            option: option.id,
            value: "nope".into(),
        };
        assert!(matches!(
            apply(&pack, flight.clone(), bad_value),
            Err(AppError::InvalidAction(_))
        ));
        let bad_step = Action::Tick {
            step: StepId::new("example-twin.x.y"),
            at: 1,
        };
        assert!(matches!(
            apply(&pack, flight.clone(), bad_step),
            Err(AppError::InvalidAction(_))
        ));
        let mut foreign = flight;
        foreign.pack = "other".into();
        assert!(matches!(
            apply(&pack, foreign, Action::Clear),
            Err(AppError::InvalidAction(_))
        ));
    }

    #[test]
    fn a_briefing_is_briefed_skipped_unmarked_and_cleared_with_the_flight() {
        // #214: the mark and its time are saved; a new flight starts with none.
        let pack = example_pack();
        let brief = |flight, action| apply(&pack, flight, action).unwrap();
        let f = brief(
            new_flight(&pack),
            Action::SkipBriefing {
                briefing: "departure".into(),
                at: 3,
            },
        );
        assert_eq!(
            f.briefings.get("departure"),
            Some(&BriefingMark::Skipped { at: 3 })
        );
        let f = brief(
            f,
            Action::Brief {
                briefing: "departure".into(),
                at: 7,
            },
        );
        assert_eq!(
            f.briefings.get("departure"),
            Some(&BriefingMark::Briefed { at: 7 })
        );
        let unmarked = brief(
            f.clone(),
            Action::UnmarkBriefing {
                briefing: "departure".into(),
            },
        );
        assert!(unmarked.briefings.is_empty());
        assert!(brief(f, Action::Clear).briefings.is_empty());
    }

    #[test]
    fn a_briefing_the_pack_lacks_is_refused() {
        let pack = example_pack();
        for action in [
            Action::Brief {
                briefing: "nope".into(),
                at: 1,
            },
            Action::SkipBriefing {
                briefing: "nope".into(),
                at: 1,
            },
            Action::UnmarkBriefing {
                briefing: "nope".into(),
            },
        ] {
            assert!(matches!(
                apply(&pack, new_flight(&pack), action),
                Err(AppError::InvalidAction(_))
            ));
        }
        let action: Action =
            serde_json::from_str(r#"{"type":"brief","briefing":"departure","at":4}"#).unwrap();
        assert_eq!(
            action,
            Action::Brief {
                briefing: "departure".into(),
                at: 4
            }
        );
    }

    #[test]
    fn actions_arrive_as_tagged_json() {
        let action: Action =
            serde_json::from_str(r#"{"type":"tick","step":"a.b.c","at":12}"#).unwrap();
        assert_eq!(
            action,
            Action::Tick {
                step: StepId::new("a.b.c"),
                at: 12
            }
        );
        assert!(serde_json::from_str::<Action>(r#"{"type":"tick","step":"a.b.c"}"#).is_err());
    }
}
