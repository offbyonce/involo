// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The flight log (decision 0026): flights the pilot logged and practice results, saved on the
//! device only, never sent. A versioned format read like the flight (decision 0012): older formats
//! migrate forward, newer or unreadable ones are kept and reported. The newest [`LOG_LIMIT`]
//! flights and as many practice results are kept; saving more drops the oldest.

use std::collections::BTreeSet;

use checklist_core::{Millis, StepId};
use pack::FlatPack;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppError;
use crate::flight::Flight;
use crate::rail::rail;
use crate::saved::{Loaded, Migration, load_with};
use crate::settings::Settings;
use crate::values::blank_values;

/// The saved format of a [`Log`]. Raise it, with a migration and tests, when the shape changes.
pub const LOG_FORMAT: u32 = 1;

/// How many flights, and how many practice results, the log keeps.
pub const LOG_LIMIT: usize = 500;

/// Migrations for [`Log`]: entry `i` turns format `i + 1` into format `i + 2`. None yet.
const LOG_MIGRATIONS: &[Migration] = &[];

/// Flights and practice results, each newest first.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Log {
    pub format: u32,
    pub flights: Vec<LoggedFlight>,
    pub practice: Vec<PracticeResult>,
}

/// Where a logged flight's plan came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PlanSource {
    /// Imported from SimBrief.
    Simbrief,
    /// Entered by the pilot.
    Manual,
}

/// One logged flight. It stands on its own: names and values are copied in, so it reads the same
/// after the pack changes or on another device.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct LoggedFlight {
    /// Unique in the log: the pack and when the flight was logged. An import skips ids it has.
    pub id: String,
    #[ts(type = "number")]
    pub logged_at: Millis,
    pub pack: String,
    pub pack_version: String,
    /// The pack's name, such as the aircraft's.
    pub aircraft: String,
    /// The departure and destination as entered, or empty.
    pub origin: String,
    pub destination: String,
    /// The first and last tick.
    #[ts(type = "number | null")]
    pub off_blocks: Option<Millis>,
    #[ts(type = "number | null")]
    pub on_blocks: Option<Millis>,
    /// The time in each stage that has ticks, in the flight's order.
    pub stages: Vec<StageTime>,
    /// Steps done out of the total, counted as the app counted them (Full or Essentials).
    pub done: usize,
    pub total: usize,
    pub skipped: Vec<LoggedStep>,
    pub plan: PlanSource,
    /// The last phase of the last stage was done.
    pub finished: bool,
    /// Every tick, oldest first.
    pub ticks: Vec<LoggedTick>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct StageTime {
    pub title: String,
    #[ts(type = "number")]
    pub ms: Millis,
}

/// A step as logged: its name and value as the pack wrote them, and where it was.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct LoggedStep {
    pub step: StepId,
    pub text: String,
    /// The expected response, with the flight's values in its blanks.
    pub value: String,
    pub stage: String,
    pub phase: String,
    pub phase_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct LoggedTick {
    #[ts(type = "number")]
    pub at: Millis,
    pub step: StepId,
    pub text: String,
    /// The expected response, with the flight's values in its blanks.
    pub value: String,
}

/// One finished practice test.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct PracticeResult {
    pub id: String,
    #[ts(type = "number")]
    pub at: Millis,
    pub pack: String,
    pub title: String,
    /// Right answers out of the questions answered.
    pub score: usize,
    pub total: usize,
}

/// A change to the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum LogEdit {
    /// Adds a flight (also how a deleted one comes back); one already in the log is skipped.
    AddFlight {
        flight: Box<LoggedFlight>,
    },
    AddPractice {
        result: PracticeResult,
    },
    DeleteFlight {
        id: String,
    },
    /// Merges a log file's entries, skipping any already in the log.
    Merge {
        text: String,
    },
}

/// The log after an edit, and what the edit did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogChange {
    pub log: Log,
    pub added_flights: usize,
    pub added_practice: usize,
    /// Entries skipped because the log already had them.
    pub already: usize,
    /// The oldest entries dropped to keep the newest [`LOG_LIMIT`].
    pub dropped_flights: usize,
    pub dropped_practice: usize,
}

/// An empty log.
pub fn new_log() -> Log {
    Log {
        format: LOG_FORMAT,
        ..Log::default()
    }
}

/// Read a saved log or a log file.
pub fn load_log(json: &str) -> Loaded<Log> {
    load_with(json, LOG_FORMAT, LOG_MIGRATIONS)
}

/// A flight's ticks (oldest first), skipped steps, and each stage's first tick (in the flight's
/// order), from the stages and phases on its rail.
struct Marks {
    ticks: Vec<LoggedTick>,
    skipped: Vec<LoggedStep>,
    starts: Vec<(usize, Millis)>,
}

fn marks(pack: &FlatPack, flight: &Flight, r: &crate::rail::Rail) -> Marks {
    let phases = pack
        .content
        .phases
        .as_ref()
        .map_or(&[][..], |f| &f.phases[..]);
    let mut out = Marks {
        ticks: vec![],
        skipped: vec![],
        starts: vec![],
    };
    let mut seen = BTreeSet::new();
    for (n, stage) in r.stages.iter().enumerate() {
        let mut first: Option<Millis> = None;
        for rp in &stage.phases {
            let Some(phase) = phases.iter().find(|p| p.id == rp.id) else {
                continue;
            };
            let steps = phase
                .lists
                .iter()
                .filter_map(|l| pack.lists.iter().find(|x| &x.id == l))
                .flat_map(|l| &l.steps);
            for step in steps.filter(|s| seen.insert(s.id.clone())) {
                if let Some(t) = flight.session.done_at(&step.id) {
                    first = Some(first.map_or(t, |f| f.min(t)));
                    out.ticks.push(LoggedTick {
                        at: t,
                        step: step.id.clone(),
                        text: step.text.clone(),
                        value: filled_value(flight, step),
                    });
                } else if flight.session.is_skipped(&step.id) {
                    out.skipped.push(LoggedStep {
                        step: step.id.clone(),
                        text: step.text.clone(),
                        value: filled_value(flight, step),
                        stage: stage.title.clone(),
                        phase: phase.id.clone(),
                        phase_title: phase.title.clone(),
                    });
                }
            }
        }
        if let Some(f) = first {
            out.starts.push((n, f));
        }
    }
    out.ticks.sort_by_key(|t| t.at);
    out.starts.sort_by_key(|&(_, t)| t);
    out
}

/// Each stage with ticks runs from its first tick to the next first tick of another stage (the
/// last to on blocks), so the times add up to the flight's; they are listed in the flight's order.
fn stage_times(
    r: &crate::rail::Rail,
    starts: &[(usize, Millis)],
    on_blocks: Option<Millis>,
) -> Vec<StageTime> {
    let mut times = starts
        .iter()
        .enumerate()
        .map(|(i, &(n, from))| {
            let to = starts
                .get(i + 1)
                .map(|&(_, t)| t)
                .or(on_blocks)
                .unwrap_or(from);
            (
                n,
                StageTime {
                    title: r.stages[n].title.clone(),
                    ms: to.saturating_sub(from),
                },
            )
        })
        .collect::<Vec<_>>();
    times.sort_by_key(|&(n, _)| n);
    times.into_iter().map(|(_, t)| t).collect()
}

/// The flight as a log entry, logged at `at`.
pub fn log_entry(
    pack: &FlatPack,
    flight: &Flight,
    settings: &Settings,
    plan: PlanSource,
    at: Millis,
) -> LoggedFlight {
    let filled = crate::flight::with_defaults(pack, flight);
    let flight = &filled;
    let r = rail(pack, flight, settings);
    let Marks {
        ticks,
        skipped,
        starts,
    } = marks(pack, flight, &r);
    let off_blocks = ticks.first().map(|t| t.at);
    let on_blocks = ticks.last().map(|t| t.at);
    let (done, total) = r
        .stages
        .iter()
        .flat_map(|s| &s.phases)
        .fold((0, 0), |(d, t), p| {
            (d + p.progress.done, t + p.progress.total)
        });
    let finished = r
        .stages
        .iter()
        .rev()
        .find(|s| !s.phases.is_empty())
        .and_then(|s| s.phases.last())
        .is_some_and(|p| p.complete);
    let value = |f| {
        flight
            .values
            .get(&f)
            .map(|v| v.trim().to_owned())
            .unwrap_or_default()
    };
    LoggedFlight {
        id: format!("{}@{at}", pack.manifest.id),
        logged_at: at,
        pack: pack.manifest.id.clone(),
        pack_version: pack.manifest.version.to_string(),
        aircraft: pack.manifest.name.clone(),
        origin: value(checklist_core::FillField::Origin),
        destination: value(checklist_core::FillField::Destination),
        off_blocks,
        on_blocks,
        stages: stage_times(&r, &starts, on_blocks),
        done,
        total,
        skipped,
        plan,
        finished,
        ticks,
    }
}

/// A step's expected response with its blanks filled from the flight, as the step shows it.
fn filled_value(flight: &Flight, step: &checklist_core::Step) -> String {
    let values = blank_values(flight, step);
    let mut out = String::new();
    let mut rest = step.expect.as_str();
    let mut n = 0;
    while let Some(i) = rest.find("___") {
        out.push_str(&rest[..i]);
        let end = i + rest[i..].chars().take_while(|&c| c == '_').count();
        match values.get(n).filter(|v| !v.is_empty()) {
            Some(v) => out.push_str(v),
            None => out.push_str(&rest[i..end]),
        }
        n += 1;
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

/// Applies an edit to the log.
pub fn edit_log(log: Log, edit: LogEdit) -> Result<LogChange, AppError> {
    let mut change = LogChange {
        log,
        added_flights: 0,
        added_practice: 0,
        already: 0,
        dropped_flights: 0,
        dropped_practice: 0,
    };
    match edit {
        LogEdit::AddFlight { flight } => add_flights(&mut change, vec![*flight]),
        LogEdit::AddPractice { result } => add_practice(&mut change, vec![result]),
        LogEdit::DeleteFlight { id } => change.log.flights.retain(|f| f.id != id),
        LogEdit::Merge { text } => {
            let other = match load_log(&text) {
                Loaded::Ready { value, .. } => value,
                Loaded::Newer { .. } => {
                    return Err(AppError::LogFile(
                        "This log file is from a newer version of Involo. Update the app, then load it again.".into(),
                    ));
                }
                Loaded::Unreadable { .. } => {
                    return Err(AppError::LogFile(
                        "This file isn’t an Involo log file.".into(),
                    ));
                }
            };
            add_flights(&mut change, other.flights);
            add_practice(&mut change, other.practice);
        }
    }
    Ok(change)
}

fn add_flights(change: &mut LogChange, new: Vec<LoggedFlight>) {
    let list = &mut change.log.flights;
    for f in new {
        if list.iter().any(|x| x.id == f.id) {
            change.already += 1;
        } else {
            list.push(f);
            change.added_flights += 1;
        }
    }
    list.sort_by(|a, b| b.logged_at.cmp(&a.logged_at).then_with(|| a.id.cmp(&b.id)));
    change.dropped_flights = list.len().saturating_sub(LOG_LIMIT);
    list.truncate(LOG_LIMIT);
}

fn add_practice(change: &mut LogChange, new: Vec<PracticeResult>) {
    let list = &mut change.log.practice;
    for r in new {
        if list.iter().any(|x| x.id == r.id) {
            change.already += 1;
        } else {
            list.push(r);
            change.added_practice += 1;
        }
    }
    list.sort_by(|a, b| b.at.cmp(&a.at).then_with(|| a.id.cmp(&b.id)));
    change.dropped_practice = list.len().saturating_sub(LOG_LIMIT);
    list.truncate(LOG_LIMIT);
}

/// The log's flights as CSV, one row per flight, newest first. Times are UTC (ISO 8601), so the
/// file reads the same anywhere.
pub fn log_csv(log: &Log) -> String {
    let mut out = String::from(
        "Date (UTC),From,To,Aircraft,Off blocks (UTC),On blocks (UTC),Minutes,Steps done,Steps total,Skipped,Finished,Flight plan,Time in each stage (min)\r\n",
    );
    for f in &log.flights {
        let date = utc(f.off_blocks.unwrap_or(f.logged_at));
        let time = |t: Option<Millis>| t.map(|t| utc(t).1).unwrap_or_default();
        let total_min = match (f.off_blocks, f.on_blocks) {
            (Some(a), Some(b)) => minutes(b.saturating_sub(a)).to_string(),
            _ => String::new(),
        };
        let stages = f
            .stages
            .iter()
            .zip(stage_minutes(&f.stages))
            .map(|(s, m)| format!("{} {m}", s.title))
            .collect::<Vec<_>>()
            .join("; ");
        let row = [
            date.0,
            f.origin.clone(),
            f.destination.clone(),
            f.aircraft.clone(),
            time(f.off_blocks),
            time(f.on_blocks),
            total_min,
            f.done.to_string(),
            f.total.to_string(),
            f.skipped.len().to_string(),
            if f.finished { "Yes" } else { "No" }.into(),
            match f.plan {
                PlanSource::Simbrief => "SimBrief",
                PlanSource::Manual => "Entered by hand",
            }
            .into(),
            stages,
        ];
        let cells: Vec<String> = row.iter().map(|c| csv_cell(c)).collect();
        out.push_str(&cells.join(","));
        out.push_str("\r\n");
    }
    out
}

/// Whole minutes, rounded to the nearest.
fn minutes(ms: Millis) -> u64 {
    (ms + 30_000) / 60_000
}

/// Each stage's whole minutes, rounded so they add up to the flight's rounded total (the largest
/// remainder method: every stage gets its whole minutes, then the stages with the largest leftover
/// seconds get one more each, earlier stages first on a tie). The stages run from off blocks to on
/// blocks, so their sum is the flight's time. packages/ui's `stageTimes` does the same; both are
/// tested against tests/fixtures/stage-minutes.json.
fn stage_minutes(stages: &[StageTime]) -> Vec<u64> {
    const MIN: Millis = 60_000;
    let mut out: Vec<u64> = stages.iter().map(|s| s.ms / MIN).collect();
    let target = minutes(stages.iter().map(|s| s.ms).sum());
    let short = usize::try_from(target.saturating_sub(out.iter().sum())).unwrap_or(0);
    let mut order: Vec<usize> = (0..stages.len()).collect();
    order.sort_by(|&a, &b| {
        (stages[b].ms % MIN)
            .cmp(&(stages[a].ms % MIN))
            .then(a.cmp(&b))
    });
    for &i in order.iter().take(short) {
        out[i] += 1;
    }
    out
}

/// A CSV cell, quoted when it holds a comma, quote or line break. A cell a spreadsheet would read
/// as a formula is prefixed with an apostrophe.
fn csv_cell(text: &str) -> String {
    let text = if text.starts_with(['=', '+', '-', '@']) {
        format!("'{text}")
    } else {
        text.to_owned()
    };
    if text.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

/// The UTC date ("2026-11-14") and time ("09:48") of a moment.
fn utc(ms: Millis) -> (String, String) {
    let secs = ms / 1000;
    let days = i64::try_from(secs / 86_400).unwrap_or(0);
    let rem = secs % 86_400;
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    (
        format!("{y:04}-{m:02}-{d:02}"),
        format!("{:02}:{:02}", rem / 3600, rem % 3600 / 60),
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::actions::{Action, apply};
    use crate::flight::new_flight;
    use crate::test_support::ifly_pack;

    const MIN: Millis = 60_000;

    fn entry(id: &str, at: Millis) -> LoggedFlight {
        LoggedFlight {
            id: id.into(),
            logged_at: at,
            pack: "p".into(),
            pack_version: "1".into(),
            aircraft: "Trainer".into(),
            origin: "KSEA".into(),
            destination: "KSFO".into(),
            off_blocks: Some(at.saturating_sub(10 * MIN)),
            on_blocks: Some(at),
            stages: vec![],
            done: 1,
            total: 2,
            skipped: vec![],
            plan: PlanSource::Manual,
            finished: false,
            ticks: vec![],
        }
    }

    fn result(id: &str, at: Millis) -> PracticeResult {
        PracticeResult {
            id: id.into(),
            at,
            pack: "p".into(),
            title: "Memory items".into(),
            score: 9,
            total: 10,
        }
    }

    fn add(log: Log, f: LoggedFlight) -> LogChange {
        edit_log(
            log,
            LogEdit::AddFlight {
                flight: Box::new(f),
            },
        )
        .unwrap()
    }

    /// The steps of a phase, in order.
    fn steps(pack: &FlatPack, phase: &str) -> Vec<StepId> {
        let p = pack
            .content
            .phases
            .as_ref()
            .unwrap()
            .phases
            .iter()
            .find(|p| p.id == phase)
            .unwrap();
        p.lists
            .iter()
            .filter_map(|l| pack.lists.iter().find(|x| &x.id == l))
            .flat_map(|l| l.steps.iter().map(|s| s.id.clone()))
            .collect()
    }

    #[test]
    fn a_flight_is_logged_with_its_blocks_stages_counts_skips_and_every_tick() {
        let pack = ifly_pack();
        let s = Settings::default();
        let mut flight = new_flight(&pack);
        for (f, v) in [
            (checklist_core::FillField::Origin, "KSEA"),
            (checklist_core::FillField::Destination, "KSFO"),
        ] {
            flight = apply(
                &pack,
                flight,
                Action::SetValue {
                    field: f,
                    value: v.into(),
                },
            )
            .unwrap();
        }
        // Preflight's exterior inspection from minute 0, its first step skipped; then the first
        // Departure phase from minute 30 to 50.
        let stages = rail(&pack, &flight, &s).stages;
        let departure = stages[1].phases[0].id.clone();
        let exterior = steps(&pack, "exterior");
        flight = apply(
            &pack,
            flight,
            Action::Skip {
                step: exterior[0].clone(),
                at: 1,
            },
        )
        .unwrap();
        for (n, id) in exterior.iter().enumerate().skip(1) {
            let at = 1_000_000 + n as Millis * MIN / 10;
            flight = apply(
                &pack,
                flight,
                Action::Tick {
                    step: id.clone(),
                    at,
                },
            )
            .unwrap();
        }
        let dep = steps(&pack, &departure);
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: dep[0].clone(),
                at: 1_000_000 + 30 * MIN,
            },
        )
        .unwrap();
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: dep[1].clone(),
                at: 1_000_000 + 50 * MIN,
            },
        )
        .unwrap();

        let e = log_entry(&pack, &flight, &s, PlanSource::Simbrief, 9_000_000);
        assert_eq!(e.id, "ifly-737-max8@9000000");
        assert_eq!(
            (e.origin.as_str(), e.destination.as_str()),
            ("KSEA", "KSFO")
        );
        assert_eq!(e.aircraft, pack.manifest.name);
        assert_eq!(e.off_blocks, Some(1_000_000 + MIN / 10));
        assert_eq!(e.on_blocks, Some(1_000_000 + 50 * MIN));
        assert_eq!(e.ticks.len(), exterior.len() - 1 + 2);
        assert!(
            e.ticks.windows(2).all(|w| w[0].at <= w[1].at),
            "oldest first"
        );
        // Each stage runs from its first tick to the next stage's; the last to on blocks.
        assert_eq!(e.stages.len(), 2);
        assert_eq!(e.stages[0].title, stages[0].title);
        assert_eq!(e.stages[0].ms, 30 * MIN - MIN / 10);
        assert_eq!(e.stages[1].ms, 20 * MIN);
        let sum: Millis = e.stages.iter().map(|s| s.ms).sum();
        assert_eq!(Some(sum), e.on_blocks.zip(e.off_blocks).map(|(b, a)| b - a));
        assert_eq!(e.skipped.len(), 1);
        assert_eq!(e.skipped[0].step, exterior[0]);
        assert_eq!(e.skipped[0].stage, stages[0].title);
        assert_eq!(e.skipped[0].phase, "exterior");
        let r = rail(&pack, &flight, &s);
        let total: usize = r
            .stages
            .iter()
            .flat_map(|s| &s.phases)
            .map(|p| p.progress.total)
            .sum();
        assert_eq!((e.done, e.total), (exterior.len() - 1 + 2, total));
        assert!(!e.finished);
        assert_eq!(e.plan, PlanSource::Simbrief);
    }

    #[test]
    fn stage_times_follow_the_flight_s_order_even_when_a_later_stage_was_ticked_early() {
        let pack = ifly_pack();
        let s = Settings::default();
        let mut flight = new_flight(&pack);
        let stages = rail(&pack, &flight, &s).stages;
        let ext = steps(&pack, "exterior");
        let dep = steps(&pack, &stages[1].phases[0].id);
        // A Departure step ticked at minute 5, inside Preflight's 0 to 20.
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: ext[0].clone(),
                at: 0,
            },
        )
        .unwrap();
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: dep[0].clone(),
                at: 5 * MIN,
            },
        )
        .unwrap();
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: ext[1].clone(),
                at: 20 * MIN,
            },
        )
        .unwrap();
        let e = log_entry(&pack, &flight, &s, PlanSource::Manual, 30 * MIN);
        let titles: Vec<&str> = e.stages.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles, [stages[0].title.as_str(), stages[1].title.as_str()]);
        let sum: Millis = e.stages.iter().map(|t| t.ms).sum();
        assert_eq!(sum, 20 * MIN);
    }

    #[test]
    fn an_open_step_keeps_its_value_as_this_flight_shows_it() {
        let pack = ifly_pack();
        let ext = steps(&pack, "exterior");
        let flight = apply(
            &pack,
            new_flight(&pack),
            Action::Skip {
                step: ext[0].clone(),
                at: 1,
            },
        )
        .unwrap();
        let e = log_entry(&pack, &flight, &Settings::default(), PlanSource::Manual, 2);
        let step = pack
            .lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.id == ext[0])
            .unwrap();
        assert_eq!(e.skipped[0].value, step.expect);
    }

    #[test]
    fn a_flight_is_finished_when_the_last_phase_is_done() {
        let pack = ifly_pack();
        let s = Settings::default();
        let mut flight = new_flight(&pack);
        let last = rail(&pack, &flight, &s)
            .stages
            .last()
            .unwrap()
            .phases
            .last()
            .unwrap()
            .id
            .clone();
        for (n, id) in steps(&pack, &last).into_iter().enumerate() {
            flight = apply(
                &pack,
                flight,
                Action::Tick {
                    step: id,
                    at: 10 + n as Millis,
                },
            )
            .unwrap();
        }
        let e = log_entry(&pack, &flight, &s, PlanSource::Manual, 99);
        assert!(e.finished);
        // Nothing before it was ticked, so it is finished but has one stage.
        assert_eq!(e.stages.len(), 1);
    }

    #[test]
    fn a_blank_in_a_ticked_value_shows_the_flight_s_value() {
        let pack = ifly_pack();
        let step = pack
            .lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.fill.contains(&checklist_core::FillField::Qnh))
            .unwrap()
            .clone();
        let mut flight = new_flight(&pack);
        assert_eq!(filled_value(&flight, &step), step.expect);
        flight
            .values
            .insert(checklist_core::FillField::Qnh, "29.92".into());
        let v = filled_value(&flight, &step);
        assert!(v.contains("29.92"), "{v}");
        assert_eq!(
            v.matches("___").count() + 1,
            step.expect.matches("___").count(),
            "{v}"
        );
    }

    #[test]
    fn flights_are_kept_newest_first() {
        let log = add(new_log(), entry("a", 100)).log;
        let log = add(log, entry("c", 300)).log;
        let log = add(log, entry("b", 200)).log;
        let ids: Vec<&str> = log.flights.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["c", "b", "a"]);
    }

    #[test]
    fn the_log_keeps_the_newest_500_flights_and_500_results() {
        let mut log = new_log();
        log.flights = (0..LOG_LIMIT as Millis)
            .rev()
            .map(|n| entry(&format!("f{n}"), 1000 + n))
            .collect();
        log.practice = (0..LOG_LIMIT as Millis)
            .rev()
            .map(|n| result(&format!("r{n}"), 1000 + n))
            .collect();
        let change = add(log, entry("new", 5000));
        assert_eq!(change.log.flights.len(), LOG_LIMIT);
        assert_eq!(change.dropped_flights, 1);
        assert_eq!(change.log.flights[0].id, "new");
        assert!(
            change.log.flights.iter().all(|f| f.id != "f0"),
            "the oldest goes"
        );
        let change = edit_log(
            change.log,
            LogEdit::AddPractice {
                result: result("new", 5000),
            },
        )
        .unwrap();
        assert_eq!(change.log.practice.len(), LOG_LIMIT);
        assert_eq!(change.dropped_practice, 1);
        assert_eq!(change.log.practice[0].id, "new");
        // Below the limit nothing is dropped.
        let change = add(new_log(), entry("x", 1));
        assert_eq!(change.dropped_flights, 0);
    }

    #[test]
    fn a_deleted_flight_comes_back_in_its_place() {
        let mut log = new_log();
        for (id, at) in [("a", 100), ("b", 200), ("c", 300)] {
            log = add(log, entry(id, at)).log;
        }
        let b = log.flights[1].clone();
        let log = edit_log(log, LogEdit::DeleteFlight { id: "b".into() })
            .unwrap()
            .log;
        assert_eq!(log.flights.len(), 2);
        let log = add(log, b).log;
        let ids: Vec<&str> = log.flights.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["c", "b", "a"]);
    }

    #[test]
    fn merging_a_log_file_adds_what_is_new_and_skips_what_the_log_has() {
        let mut mine = new_log();
        mine = add(mine, entry("a", 100)).log;
        mine.practice.push(result("r1", 100));
        let mut theirs = new_log();
        theirs.flights = vec![entry("b", 200), entry("a", 100)];
        theirs.practice = vec![result("r2", 300), result("r1", 100)];
        let text = serde_json::to_string(&theirs).unwrap();
        let change = edit_log(mine, LogEdit::Merge { text }).unwrap();
        assert_eq!(
            (change.added_flights, change.added_practice, change.already),
            (1, 1, 2)
        );
        let ids: Vec<&str> = change.log.flights.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["b", "a"]);
        assert_eq!(change.log.practice[0].id, "r2");
        // A merge past the limit drops the oldest.
        let mut big = new_log();
        big.flights = (0..LOG_LIMIT as Millis)
            .rev()
            .map(|n| entry(&format!("f{n}"), 1000 + n))
            .collect();
        let text = serde_json::to_string(&theirs).unwrap();
        let change = edit_log(big, LogEdit::Merge { text }).unwrap();
        assert_eq!(change.log.flights.len(), LOG_LIMIT);
        assert_eq!(
            change.dropped_flights, 2,
            "both imported flights are older than every kept one"
        );
    }

    #[test]
    fn a_log_file_from_a_newer_app_or_not_a_log_is_refused_and_the_log_unchanged() {
        for text in [
            r#"{"format": 99}"#,
            "not json",
            r#"{"format": 1, "flights": 3}"#,
        ] {
            let e = edit_log(new_log(), LogEdit::Merge { text: text.into() }).unwrap_err();
            assert!(matches!(e, AppError::LogFile(_)), "{text}");
        }
    }

    #[test]
    fn a_saved_log_reads_back_and_newer_or_unreadable_logs_are_kept() {
        let mut log = add(new_log(), entry("a", 100)).log;
        log.practice.push(result("r", 50));
        let text = serde_json::to_string(&log).unwrap();
        assert_eq!(
            load_log(&text),
            Loaded::Ready {
                value: log,
                migrated_from: None
            }
        );
        assert_eq!(load_log(r#"{"format": 2}"#), Loaded::Newer { format: 2 });
        assert!(matches!(
            load_log(r#"{"format": 1}"#),
            Loaded::Unreadable { .. }
        ));
    }

    /// The first log format, frozen: whatever format the app moves to, a log saved by format 1
    /// must still load (the migrations carry it forward), with every entry and value kept.
    #[test]
    fn a_format_1_log_still_loads() {
        let text = include_str!("../tests/fixtures/log-format-1.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_log(text)
        else {
            panic!("the format 1 log did not load");
        };
        assert_eq!(migrated_from, (LOG_FORMAT > 1).then_some(1));
        assert_eq!(value.format, LOG_FORMAT);
        assert_eq!(value.flights.len(), 2);
        let f = &value.flights[0];
        assert_eq!(
            (f.origin.as_str(), f.destination.as_str()),
            ("KSEA", "KSFO")
        );
        assert_eq!(f.ticks.len(), 3);
        assert_eq!(f.skipped[0].phase_title, "Before start");
        assert_eq!(value.practice[0].score, 9);
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(raw["format"], json!(1));
    }

    #[test]
    fn stage_minutes_add_up_to_the_flight_s_total() {
        // The cases packages/ui's stageTimes test reads too, so the two copies cannot drift.
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/stage-minutes.json")).unwrap();
        let cases = fixture["cases"].as_array().unwrap();
        assert!(cases.len() >= 5);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let numbers = |key: &str| -> Vec<u64> {
                case[key]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|n| n.as_u64().unwrap())
                    .collect()
            };
            let stages: Vec<StageTime> = numbers("ms")
                .into_iter()
                .map(|ms| StageTime {
                    title: "Stage".into(),
                    ms,
                })
                .collect();
            let shown = stage_minutes(&stages);
            assert_eq!(shown, numbers("minutes"), "{name}");
            let total = minutes(stages.iter().map(|s| s.ms).sum());
            assert_eq!(shown.iter().sum::<u64>(), total, "{name}");
        }
    }

    #[test]
    fn csv_has_a_row_per_flight_in_utc_and_quotes_what_needs_it() {
        let mut log = new_log();
        let mut f = entry("a", 1_763_113_740_000);
        f.off_blocks = Some(1_763_113_740_000 - 161 * MIN);
        f.origin = "=KSEA".into();
        f.destination = "San Francisco, CA".into();
        f.stages = vec![StageTime {
            title: "Preflight".into(),
            ms: 38 * MIN,
        }];
        log.flights = vec![f, entry("b", 1000 * MIN)];
        let csv = log_csv(&log);
        let rows: Vec<&str> = csv.split("\r\n").filter(|r| !r.is_empty()).collect();
        assert_eq!(rows.len(), 3);
        assert!(rows[0].starts_with("Date (UTC),From,To"));
        assert_eq!(
            rows[1],
            "2025-11-14,'=KSEA,\"San Francisco, CA\",Trainer,07:08,09:49,161,1,2,0,No,Entered by hand,Preflight 38"
        );
    }

    #[test]
    fn utc_dates_follow_the_calendar() {
        assert_eq!(utc(0), ("1970-01-01".into(), "00:00".into()));
        assert_eq!(utc(951_782_400_000), ("2000-02-29".into(), "00:00".into()));
        assert_eq!(
            utc(1_767_225_599_000),
            ("2025-12-31".into(), "23:59".into())
        );
    }
}
