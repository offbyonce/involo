// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Step timers (#213): when each of a pack's step timers started, from the flight. A timer with
//! `auto_start` starts from its trigger steps' ticks (the earliest or the latest, as the pack
//! says); any other timer starts from its own step's tick. Restarting or resuming a timer sets its
//! start in the flight (`timers`), which wins over a tick; pausing keeps the time it had left
//! (`timer_pauses`). The interface counts down from these with the clock.

use involo_checklist_core::{AutoStartPick, Millis, StepId};
use involo_pack::FlatPack;
use serde::Serialize;
use ts_rs::TS;

use crate::flight::Flight;

/// One step timer, as the flight has it now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StepTimer {
    pub step: StepId,
    /// The timer's name, e.g. `IRS alignment`.
    pub label: String,
    /// How long it runs, in seconds.
    pub seconds: u32,
    /// The pack's note on it.
    pub note: Option<String>,
    /// Started by its trigger steps' ticks (`auto_start`), rather than its own step's.
    pub auto: bool,
    /// Its trigger steps, in the pack's order; empty without `auto_start`.
    pub from: Vec<StepId>,
    /// When it started, or `None` while nothing has started it. A paused timer keeps its start.
    #[ts(type = "number | null")]
    pub started_at: Option<Millis>,
    /// The step whose tick started it: a trigger step, or its own step. `None` when the pilot
    /// restarted or resumed it, or it has not started.
    pub started_by: Option<StepId>,
    /// The time it had left when paused, in milliseconds; `None` unless paused.
    #[ts(type = "number | null")]
    pub paused_left: Option<u64>,
}

impl StepTimer {
    /// The time left at `now`, in milliseconds: the whole time before it starts, what it had when
    /// paused, and never below zero.
    pub fn left_at(&self, now: Millis) -> u64 {
        let whole = u64::from(self.seconds) * 1000;
        if let Some(left) = self.paused_left {
            return left;
        }
        self.started_at.map_or(whole, |start| {
            whole.saturating_sub(now.saturating_sub(start))
        })
    }
}

/// Every step timer in the pack, in list order, with its state in `flight`.
pub fn timers(pack: &FlatPack, flight: &Flight) -> Vec<StepTimer> {
    pack.lists
        .iter()
        .flat_map(|l| &l.steps)
        .filter_map(|step| {
            let timer = step.timer.as_ref()?;
            // The tick that starts it: the trigger the pack picks, or its own step's.
            let ticked = match &timer.auto_start {
                Some(auto) => {
                    let ticks = auto
                        .from
                        .iter()
                        .filter_map(|s| flight.session.done_at(s).map(|at| (at, s)));
                    match auto.pick {
                        AutoStartPick::Earliest => ticks.min_by_key(|(at, _)| *at),
                        AutoStartPick::Latest => ticks.max_by_key(|(at, _)| *at),
                    }
                }
                None => flight.session.done_at(&step.id).map(|at| (at, &step.id)),
            };
            let (started_at, started_by) = match flight.timers.get(&step.id) {
                Some(at) => (Some(*at), None),
                None => (ticked.map(|(at, _)| at), ticked.map(|(_, s)| s.clone())),
            };
            Some(StepTimer {
                step: step.id.clone(),
                label: timer.label.clone(),
                seconds: timer.seconds,
                note: timer.note.clone(),
                auto: timer.auto_start.is_some(),
                from: timer
                    .auto_start
                    .as_ref()
                    .map(|a| a.from.clone())
                    .unwrap_or_default(),
                started_at,
                started_by,
                paused_left: started_at.and_then(|_| flight.timer_pauses.get(&step.id).copied()),
            })
        })
        .collect()
}

/// The timer on `step`, or why there is none to change.
pub(crate) fn timer_of(
    pack: &FlatPack,
    flight: &Flight,
    step: &StepId,
) -> Result<StepTimer, String> {
    timers(pack, flight)
        .into_iter()
        .find(|t| &t.step == step)
        .ok_or_else(|| format!("step `{step}` has no timer"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::flight::new_flight;
    use crate::test_support::ifly_pack;
    use crate::{Action, apply};

    const IRS: &str = "ifly-737-max8.preflight.irs";
    const WARM_UP: &str = "ifly-737-max8.takeoff.engine-warm-up";

    fn step(id: &str) -> StepId {
        StepId::new(id)
    }

    fn timer(pack: &FlatPack, flight: &Flight, id: &str) -> StepTimer {
        timer_of(pack, flight, &step(id)).unwrap()
    }

    fn act(pack: &FlatPack, flight: Flight, action: Action) -> Flight {
        apply(pack, flight, action).unwrap()
    }

    #[test]
    fn every_pack_timer_is_listed_with_its_words() {
        let pack = ifly_pack();
        let all = timers(&pack, &new_flight(&pack));
        assert_eq!(all.len(), 4);
        let irs = all.iter().find(|t| t.step == step(IRS)).unwrap();
        assert_eq!(
            (irs.label.as_str(), irs.seconds, irs.auto),
            ("IRS alignment", 600, false)
        );
        assert!(
            all.iter()
                .all(|t| t.started_at.is_none() && t.paused_left.is_none())
        );
    }

    #[test]
    fn a_timer_without_auto_start_starts_when_its_own_step_is_ticked() {
        let pack = ifly_pack();
        let flight = act(
            &pack,
            new_flight(&pack),
            Action::Tick {
                step: step(IRS),
                at: 1_000,
            },
        );
        let irs = timer(&pack, &flight, IRS);
        assert_eq!(
            (irs.started_at, irs.started_by.clone()),
            (Some(1_000), Some(step(IRS)))
        );
        assert_eq!(irs.left_at(1_000 + 60_000), 540_000);
        // Unticked, it has not started.
        let flight = act(&pack, flight, Action::Untick { step: step(IRS) });
        assert_eq!(timer(&pack, &flight, IRS).started_at, None);
    }

    #[test]
    fn an_auto_start_timer_starts_from_the_trigger_tick_the_pack_picks() {
        // Engine warm-up starts from the later of the two start lever ticks.
        let pack = ifly_pack();
        let mut flight = new_flight(&pack);
        assert_eq!(timer(&pack, &flight, WARM_UP).started_at, None);
        flight = act(
            &pack,
            flight,
            Action::Tick {
                step: step("ifly-737-max8.engine-start.engine-2-start-lever"),
                at: 5_000,
            },
        );
        assert_eq!(timer(&pack, &flight, WARM_UP).started_at, Some(5_000));
        flight = act(
            &pack,
            flight,
            Action::Tick {
                step: step("ifly-737-max8.engine-start.engine-1-start-lever"),
                at: 9_000,
            },
        );
        let warm = timer(&pack, &flight, WARM_UP);
        assert_eq!((warm.started_at, warm.auto), (Some(9_000), true));
        assert_eq!(
            warm.from,
            [
                step("ifly-737-max8.engine-start.engine-2-start-lever"),
                step("ifly-737-max8.engine-start.engine-1-start-lever"),
            ],
            "its trigger steps, for the words before it starts"
        );
        assert_eq!(
            warm.started_by,
            Some(step("ifly-737-max8.engine-start.engine-1-start-lever"))
        );
        assert_eq!(warm.left_at(9_000 + 200_000), 0, "never below zero");
    }

    #[test]
    fn pause_resume_and_restart_change_the_timer_and_are_saved_with_the_flight() {
        let pack = ifly_pack();
        let mut flight = act(
            &pack,
            new_flight(&pack),
            Action::Tick {
                step: step(IRS),
                at: 0,
            },
        );
        // Paused 100 s in: 500 s left, however long it stays paused.
        flight = act(
            &pack,
            flight,
            Action::PauseTimer {
                step: step(IRS),
                at: 100_000,
            },
        );
        let paused = timer(&pack, &flight, IRS);
        assert_eq!(paused.paused_left, Some(500_000));
        assert_eq!(paused.left_at(400_000), 500_000);
        // Through a save and a reload.
        let saved = serde_json::to_string(&flight).unwrap();
        let reloaded: Flight = serde_json::from_str(&saved).unwrap();
        assert_eq!(timer(&pack, &reloaded, IRS).paused_left, Some(500_000));
        // Resumed at 400 s: it runs on from 500 s left.
        flight = act(
            &pack,
            reloaded,
            Action::ResumeTimer {
                step: step(IRS),
                at: 400_000,
            },
        );
        let resumed = timer(&pack, &flight, IRS);
        assert_eq!(resumed.paused_left, None);
        assert_eq!(resumed.left_at(400_000), 500_000);
        assert_eq!(resumed.left_at(450_000), 450_000);
        // Restarted: the whole time again from now, paused or not.
        flight = act(
            &pack,
            flight,
            Action::PauseTimer {
                step: step(IRS),
                at: 450_000,
            },
        );
        flight = act(
            &pack,
            flight,
            Action::RestartTimer {
                step: step(IRS),
                at: 500_000,
            },
        );
        let restarted = timer(&pack, &flight, IRS);
        assert_eq!(restarted.started_by, None, "the pilot restarted it");
        assert_eq!(
            (restarted.started_at, restarted.paused_left),
            (Some(500_000), None)
        );
        assert_eq!(restarted.left_at(500_000), 600_000);
        // A new flight clears it all.
        flight = act(&pack, flight, Action::Clear);
        assert_eq!(timer(&pack, &flight, IRS).started_at, None);
        assert!(flight.timer_pauses.is_empty());
    }

    #[test]
    fn a_timer_that_has_not_started_cannot_be_paused_or_resumed() {
        let pack = ifly_pack();
        let flight = new_flight(&pack);
        assert!(
            apply(
                &pack,
                flight.clone(),
                Action::PauseTimer {
                    step: step(IRS),
                    at: 1
                }
            )
            .is_err()
        );
        assert!(
            apply(
                &pack,
                flight.clone(),
                Action::ResumeTimer {
                    step: step(IRS),
                    at: 1
                }
            )
            .is_err()
        );
        // A step without a timer has none to change.
        let other = pack.lists[0]
            .steps
            .iter()
            .find(|s| s.timer.is_none())
            .unwrap()
            .id
            .clone();
        assert!(apply(&pack, flight, Action::RestartTimer { step: other, at: 1 }).is_err());
    }
}
