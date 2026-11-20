// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The flight log (decision 0026): flights the pilot logged and practice results, saved on the
//! device only, never sent. A versioned format read like the flight (decision 0012): older formats
//! migrate forward, newer or unreadable ones are kept and reported. The newest [`LOG_LIMIT`]
//! flights and as many practice results are kept; saving more drops the oldest.

use std::collections::BTreeSet;

use involo_checklist_core::{Millis, StepId};
use involo_pack::FlatPack;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppError;
use crate::flight::Flight;
use crate::names::Glossaries;
use crate::rail::rail;
use crate::saved::{Loaded, load_with};
use crate::settings::Settings;
use crate::values::blank_values;

/// The saved format of a [`Log`]. Raise it, with a migration and tests, when the shape changes.
pub const LOG_FORMAT: u32 = 3;

/// How many flights, and how many practice results, the log keeps.
pub const LOG_LIMIT: usize = 500;

/// Format 3 records each entry's pack by name and version and the aircraft's name, and keys a
/// stage time by the stage's id. A format 2 flight's `aircraft` held the pack's name, which
/// becomes its `packName`; what an older entry never recorded (a flight's aircraft name, a stage's
/// id, a practice result's pack version, pack name and aircraft) is kept unknown (`null`), never
/// guessed.
fn log_2_to_3(mut value: serde_json::Value) -> Result<serde_json::Value, String> {
    use serde_json::Value;
    for key in ["flights", "practice"] {
        let entries = value
            .get_mut(key)
            .and_then(Value::as_array_mut)
            .ok_or(format!("the log has no {key}"))?;
        for o in entries.iter_mut().filter_map(Value::as_object_mut) {
            if key == "flights" {
                let name = o.remove("aircraft").unwrap_or_default();
                o.insert("packName".into(), name);
                o.insert("aircraft".into(), Value::Null);
                for stage in o
                    .get_mut("stages")
                    .and_then(Value::as_array_mut)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_object_mut)
                {
                    stage.insert("id".into(), Value::Null);
                }
            } else {
                for field in ["packVersion", "packName", "aircraft"] {
                    o.insert(field.into(), Value::Null);
                }
            }
        }
    }
    Ok(value)
}

/// Format 2 saves each logged step's name as the app showed it. An entry logged before that has
/// only the pack's text: its name is that text by the app's naming rule, without control labels,
/// which the entry doesn't carry, and with the glossary of the entry's pack when that pack is
/// installed (`names::saved_text_name`). The interface shows this name only for a step its pack
/// no longer has; a step still in the pack is named from it.
fn log_1_to_2(
    mut value: serde_json::Value,
    glossaries: &Glossaries,
) -> Result<serde_json::Value, String> {
    let flights = value
        .get_mut("flights")
        .and_then(serde_json::Value::as_array_mut)
        .ok_or("the log has no flights")?;
    for flight in flights {
        let glossary = flight
            .get("pack")
            .and_then(serde_json::Value::as_str)
            .and_then(|id| glossaries.get(id));
        for key in ["ticks", "skipped"] {
            for step in flight
                .get_mut(key)
                .and_then(serde_json::Value::as_array_mut)
                .into_iter()
                .flatten()
            {
                let name = step
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .map(|text| crate::names::saved_text_name(text, glossary))
                    .unwrap_or_default();
                if let Some(o) = step.as_object_mut() {
                    o.insert("name".into(), name.into());
                }
            }
        }
    }
    Ok(value)
}

// What a merged log file's entries can hold. A log file is outside data: these keep an
// impossible entry out of the log, where it would stay until deleted.
/// The latest moment an entry can have: the last millisecond of the year 9999. Past it a date
/// loses its four-digit year, and past 8.64e15 ms JavaScript can't show it ("Invalid Date").
pub const MAX_TIME: Millis = 253_402_300_799_999;
/// The longest a stage can last: 30 days, far beyond any flight.
const MAX_STAGE_MS: Millis = 30 * 24 * 3_600_000;
/// The most ticks or skipped steps a logged flight keeps: over ten times the steps of the
/// largest pack today (about 370).
const MAX_STEPS: usize = 5_000;
/// The most stages a logged flight keeps.
const MAX_STAGES: usize = 100;
/// The longest text kept in an entry's names and values, in characters; the pack's longest is
/// a fraction of it.
const MAX_TEXT: usize = 1_000;
/// The longest id an entry can have; a longer one is refused rather than cut, since a cut id
/// could match another entry's.
const MAX_ID: usize = 200;

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
    /// The pack's name when the flight was logged, as the app showed it (format 3; a format 1 or
    /// 2 flight's `aircraft` held it).
    pub pack_name: String,
    /// The aircraft's name from the pack's `aircraft` block (format 3), or `None` for a flight
    /// logged before, which didn't record it.
    pub aircraft: Option<String>,
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
    /// The stage's id (format 3), or `None` for a time logged before, which kept only the title.
    pub id: Option<String>,
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
    /// The step's name as the app showed it when it was logged (format 2).
    pub name: String,
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
    /// The step's name as the app showed it when it was logged (format 2).
    pub name: String,
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
    /// The pack's version, its name and the aircraft's name (format 3), or `None` for a result
    /// saved before, which didn't record them.
    pub pack_version: Option<String>,
    pub pack_name: Option<String>,
    pub aircraft: Option<String>,
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
    /// Entries in a merged file that can't be real (a date past [`MAX_TIME`], an overlong id),
    /// left out.
    pub refused: usize,
}

/// An empty log.
pub fn new_log() -> Log {
    Log {
        format: LOG_FORMAT,
        ..Log::default()
    }
}

/// Read a saved log or a log file. `glossaries` holds the installed packs' glossaries that
/// [`log_packs`] asked for, used to name a format 1 log's entries.
pub fn load_log(json: &str, glossaries: &Glossaries) -> Loaded<Log> {
    let migrations: [&dyn Fn(serde_json::Value) -> Result<serde_json::Value, String>; 2] =
        [&|v| log_1_to_2(v, glossaries), &log_2_to_3];
    load_with(json, LOG_FORMAT, &migrations)
}

/// The packs whose glossaries loading this log text needs: the packs a format 1 log's flights
/// were logged with, so their entries can be named. None for any other text.
pub fn log_packs(json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    if value.get("format").and_then(serde_json::Value::as_u64) != Some(1) {
        return Vec::new();
    }
    value
        .get("flights")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|f| f.get("pack").and_then(serde_json::Value::as_str))
        .map(str::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
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
    // For a step the pack's names don't give, indexed once for every step.
    let terms = crate::names::Terms::of(pack);
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
                        name: shown_name(pack, &terms, step),
                        value: filled_value(flight, step),
                    });
                } else if flight.session.is_skipped(&step.id) {
                    out.skipped.push(LoggedStep {
                        step: step.id.clone(),
                        text: step.text.clone(),
                        name: shown_name(pack, &terms, step),
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
                    id: Some(r.stages[n].id.clone()),
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
/// A step's name as the app shows it: the pack's names when it was read, else worked out here.
fn shown_name(
    pack: &FlatPack,
    terms: &crate::names::Terms,
    step: &involo_checklist_core::Step,
) -> String {
    pack.names
        .steps
        .get(&step.id)
        .cloned()
        .unwrap_or_else(|| crate::names::step_name_with(pack, step, terms))
}

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
    let value = |source| {
        crate::values::field_from(pack, source)
            .and_then(|f| flight.values.get(f.id.as_str()))
            .map(|v| v.trim().to_owned())
            .unwrap_or_default()
    };
    LoggedFlight {
        id: format!("{}@{at}", pack.manifest.id),
        logged_at: at,
        pack: pack.manifest.id.clone(),
        pack_version: pack.manifest.version.to_string(),
        pack_name: pack.manifest.name.clone(),
        aircraft: pack.manifest.aircraft.as_ref().map(|a| a.name.clone()),
        origin: value(involo_checklist_core::SimbriefSource::Origin),
        destination: value(involo_checklist_core::SimbriefSource::Destination),
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

/// A finished practice test as a log entry, with the pack it was taken in: `title` is the test's,
/// `score` the right answers out of the `total` answered, `at` when it ended.
pub fn practice_result(
    pack: &FlatPack,
    title: &str,
    score: usize,
    total: usize,
    at: Millis,
) -> PracticeResult {
    PracticeResult {
        id: format!("{}@{at}", pack.manifest.id),
        at,
        pack: pack.manifest.id.clone(),
        pack_version: Some(pack.manifest.version.to_string()),
        pack_name: Some(pack.manifest.name.clone()),
        aircraft: pack.manifest.aircraft.as_ref().map(|a| a.name.clone()),
        title: title.to_owned(),
        score: score.min(total),
        total,
    }
}

/// A step's expected response with its blanks filled from the flight, as the step shows it: for
/// a step whose value depends on a decision, the value for the flight's answer.
fn filled_value(flight: &Flight, step: &involo_checklist_core::Step) -> String {
    let values = blank_values(flight, step);
    let mut out = String::new();
    let mut rest = step.value_for(&flight.options);
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

/// Applies an edit to the log. `glossaries` names a merged format 1 log file's entries, as for
/// [`load_log`].
pub fn edit_log(log: Log, edit: LogEdit, glossaries: &Glossaries) -> Result<LogChange, AppError> {
    let mut change = LogChange {
        log,
        added_flights: 0,
        added_practice: 0,
        already: 0,
        dropped_flights: 0,
        dropped_practice: 0,
        refused: 0,
    };
    match edit {
        LogEdit::AddFlight { flight } => add_flights(&mut change, vec![*flight]),
        LogEdit::AddPractice { result } => add_practice(&mut change, vec![result]),
        LogEdit::DeleteFlight { id } => change.log.flights.retain(|f| f.id != id),
        LogEdit::Merge { text } => {
            let other = match load_log(&text, glossaries) {
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
            let total = other.flights.len() + other.practice.len();
            let flights: Vec<_> = other
                .flights
                .into_iter()
                .filter_map(checked_flight)
                .collect();
            let practice: Vec<_> = other
                .practice
                .into_iter()
                .filter_map(checked_result)
                .collect();
            change.refused = total - flights.len() - practice.len();
            add_flights(&mut change, flights);
            add_practice(&mut change, practice);
        }
    }
    Ok(change)
}

/// Text cut to [`MAX_TEXT`] characters.
fn cut(text: &mut String) {
    if let Some((at, _)) = text.char_indices().nth(MAX_TEXT) {
        text.truncate(at);
    }
}

/// A moment an entry can hold.
fn in_time(at: Millis) -> bool {
    at <= MAX_TIME
}

/// A merged flight as the log can keep it, or none when it can't be real: its log time past
/// [`MAX_TIME`], or an id longer than [`MAX_ID`]. Everything else is clamped: times past the
/// limit dropped, counts to the total, text cut, lists shortened.
fn checked_flight(mut f: LoggedFlight) -> Option<LoggedFlight> {
    if !in_time(f.logged_at) || f.id.len() > MAX_ID {
        return None;
    }
    f.off_blocks = f.off_blocks.filter(|t| in_time(*t));
    f.on_blocks = f.on_blocks.filter(|t| in_time(*t));
    f.done = f.done.min(f.total);
    for t in [
        &mut f.pack,
        &mut f.pack_version,
        &mut f.pack_name,
        &mut f.origin,
        &mut f.destination,
    ] {
        cut(t);
    }
    f.aircraft.as_mut().map(cut);
    f.stages.truncate(MAX_STAGES);
    for s in &mut f.stages {
        s.ms = s.ms.min(MAX_STAGE_MS);
        s.id.as_mut().map(cut);
        cut(&mut s.title);
    }
    f.ticks.retain(|t| in_time(t.at));
    f.ticks.truncate(MAX_STEPS);
    for t in &mut f.ticks {
        cut(&mut t.step.0);
        cut(&mut t.text);
        cut(&mut t.name);
        cut(&mut t.value);
    }
    f.skipped.truncate(MAX_STEPS);
    for s in &mut f.skipped {
        for t in [
            &mut s.step.0,
            &mut s.text,
            &mut s.name,
            &mut s.value,
            &mut s.stage,
            &mut s.phase,
            &mut s.phase_title,
        ] {
            cut(t);
        }
    }
    Some(f)
}

/// A merged practice result as the log can keep it, or none when it can't be real.
fn checked_result(mut r: PracticeResult) -> Option<PracticeResult> {
    if !in_time(r.at) || r.id.len() > MAX_ID {
        return None;
    }
    r.score = r.score.min(r.total);
    cut(&mut r.pack);
    for t in [&mut r.pack_version, &mut r.pack_name, &mut r.aircraft] {
        t.as_mut().map(cut);
    }
    cut(&mut r.title);
    Some(r)
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
        "Date (UTC),From,To,Pack,Pack version,Aircraft,Off blocks (UTC),On blocks (UTC),Minutes,Steps done,Steps total,Skipped,Finished,Flight plan,Time in each stage (min)\r\n",
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
            f.pack_name.clone(),
            f.pack_version.clone(),
            f.aircraft.clone().unwrap_or_default(),
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
    ms / 60_000 + u64::from(ms % 60_000 >= 30_000)
}

/// Each stage's whole minutes, rounded so they add up to the flight's rounded total (the largest
/// remainder method: every stage gets its whole minutes, then the stages with the largest leftover
/// seconds get one more each, earlier stages first on a tie). The stages run from off blocks to on
/// blocks, so their sum is the flight's time. packages/ui's `stageTimes` does the same; both are
/// tested against tests/fixtures/stage-minutes.json.
fn stage_minutes(stages: &[StageTime]) -> Vec<u64> {
    const MIN: Millis = 60_000;
    let mut out: Vec<u64> = stages.iter().map(|s| s.ms / MIN).collect();
    let target = minutes(
        stages
            .iter()
            .fold(0, |sum: Millis, s| sum.saturating_add(s.ms)),
    );
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
/// as a formula is prefixed with an apostrophe: one starting with a tab or carriage return, or
/// with `=`, `+`, `-` or `@` after any leading spaces or control characters (spreadsheets skip
/// those before reading a formula).
fn csv_cell(text: &str) -> String {
    let lead = text.trim_start_matches(|c: char| c.is_whitespace() || c.is_control());
    let text = if text.starts_with(['\t', '\r']) || lead.starts_with(['=', '+', '-', '@']) {
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
            pack_name: "Trainer".into(),
            aircraft: Some("Trainer jet".into()),
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
            pack_version: Some("1".into()),
            pack_name: Some("Trainer".into()),
            aircraft: Some("Trainer jet".into()),
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
            &Glossaries::new(),
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
            (involo_checklist_core::FieldId::from("origin"), "KSEA"),
            (involo_checklist_core::FieldId::from("destination"), "KSFO"),
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
        // Format 3: the pack by name and version, and the aircraft's name from the pack's
        // `aircraft` block.
        assert_eq!(e.pack_name, pack.manifest.name);
        assert_eq!(e.pack_version, pack.manifest.version.to_string());
        assert_eq!(e.aircraft.as_deref(), Some("737 MAX 8"));
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
        // Format 3 keys each stage time by the stage's id; the title is what it read then.
        assert_eq!(e.stages[0].id.as_deref(), Some(stages[0].id.as_str()));
        assert_eq!(e.stages[1].id.as_deref(), Some(stages[1].id.as_str()));
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
            .find(|s| {
                s.fill
                    .contains(&involo_checklist_core::FieldId::from("qnh"))
            })
            .unwrap()
            .clone();
        let mut flight = new_flight(&pack);
        assert_eq!(filled_value(&flight, &step), step.expect);
        flight
            .values
            .insert(involo_checklist_core::FieldId::from("qnh"), "29.92".into());
        let v = filled_value(&flight, &step);
        assert!(v.contains("29.92"), "{v}");
        assert_eq!(
            v.matches("___").count() + 1,
            step.expect.matches("___").count(),
            "{v}"
        );
    }

    #[test]
    fn a_step_whose_value_depends_on_a_decision_is_logged_with_the_answer_s_value() {
        let pack = ifly_pack();
        let step = pack
            .lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.id.as_str() == "ifly-737-max8.before-start.fuel-pump-switches")
            .unwrap()
            .clone();
        let mut flight = new_flight(&pack);
        assert_eq!(filled_value(&flight, &step), step.expect, "unanswered");
        flight.options.insert("center_tank".into(), "less".into());
        assert_eq!(
            filled_value(&flight, &step),
            "MAIN PUMPS ON · CENTER PUMPS OFF"
        );
        // The Before start checklist's FUEL item keeps its blanks in the answer's value.
        let fuel = pack
            .lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.id.as_str() == "ifly-737-max8.before-start.fuel")
            .unwrap();
        flight.values.insert(
            involo_checklist_core::FieldId::from("minimum_takeoff_fuel"),
            "5160".into(),
        );
        flight
            .values
            .insert(involo_checklist_core::FieldId::from("fuel"), "6400".into());
        let v = filled_value(&flight, fuel);
        assert!(v.ends_with("MAIN PUMPS ON · CENTER PUMPS OFF"), "{v}");
        assert!(v.contains("5160") && v.contains("6400"), "{v}");
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
            &Glossaries::new(),
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
        let log = edit_log(
            log,
            LogEdit::DeleteFlight { id: "b".into() },
            &Glossaries::new(),
        )
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
        let change = edit_log(mine, LogEdit::Merge { text }, &Glossaries::new()).unwrap();
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
        let change = edit_log(big, LogEdit::Merge { text }, &Glossaries::new()).unwrap();
        assert_eq!(change.log.flights.len(), LOG_LIMIT);
        assert_eq!(
            change.dropped_flights, 2,
            "both imported flights are older than every kept one"
        );
    }

    fn merge(flights: Vec<LoggedFlight>, practice: Vec<PracticeResult>) -> LogChange {
        let mut theirs = new_log();
        theirs.flights = flights;
        theirs.practice = practice;
        let text = serde_json::to_string(&theirs).unwrap();
        edit_log(new_log(), LogEdit::Merge { text }, &Glossaries::new()).unwrap()
    }

    #[test]
    fn a_merged_entry_dated_past_the_year_9999_is_refused() {
        let ok = entry("ok", MAX_TIME);
        let late = entry("late", MAX_TIME + 1);
        let max = entry("max", Millis::MAX);
        let change = merge(
            vec![ok, late, max],
            vec![result("r-ok", MAX_TIME), result("r-late", MAX_TIME + 1)],
        );
        let ids: Vec<&str> = change.log.flights.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["ok"]);
        assert_eq!(change.log.practice.len(), 1);
        assert_eq!(
            (change.added_flights, change.added_practice, change.refused),
            (1, 1, 3)
        );
    }

    #[test]
    fn a_merged_flight_s_block_and_tick_times_past_the_limit_are_dropped() {
        let mut f = entry("a", 2_000 * MIN);
        f.off_blocks = Some(MAX_TIME + 1);
        f.on_blocks = Some(Millis::MAX);
        f.ticks = vec![
            LoggedTick {
                at: 1_000 * MIN,
                step: StepId::new("s1"),
                text: "ONE".into(),
                name: "ONE".into(),
                value: "ON".into(),
            },
            LoggedTick {
                at: Millis::MAX,
                step: StepId::new("s2"),
                text: "TWO".into(),
                name: "TWO".into(),
                value: "ON".into(),
            },
        ];
        let got = &merge(vec![f], vec![]).log.flights[0];
        assert_eq!((got.off_blocks, got.on_blocks), (None, None));
        assert_eq!(got.ticks.len(), 1);
        assert_eq!(got.ticks[0].step.as_str(), "s1");
    }

    #[test]
    fn a_merged_entry_s_counts_are_clamped_to_its_total() {
        let mut f = entry("a", 100);
        f.done = 900;
        f.total = 12;
        let mut r = result("r", 100);
        r.score = 50;
        r.total = 10;
        let change = merge(vec![f], vec![r]);
        assert_eq!(
            (change.log.flights[0].done, change.log.flights[0].total),
            (12, 12)
        );
        assert_eq!(
            (change.log.practice[0].score, change.log.practice[0].total),
            (10, 10)
        );
    }

    #[test]
    fn a_merged_entry_s_overlong_text_is_cut_and_an_overlong_id_refused() {
        let mut f = entry("a", 100);
        f.origin = "é".repeat(MAX_TEXT + 5);
        f.pack_name = "x".repeat(MAX_TEXT * 3);
        f.aircraft = Some("y".repeat(MAX_TEXT * 2));
        f.ticks = vec![LoggedTick {
            at: 100,
            step: StepId::new("s"),
            text: "T".repeat(MAX_TEXT + 1),
            name: "T".repeat(MAX_TEXT + 1),
            value: "V".into(),
        }];
        f.stages = vec![StageTime {
            id: None,
            title: "S".repeat(MAX_TEXT + 1),
            ms: MIN,
        }];
        let long_id = entry(&"i".repeat(MAX_ID + 1), 100);
        let mut r = result("r", 100);
        r.title = "q".repeat(MAX_TEXT + 1);
        let change = merge(vec![f, long_id], vec![r]);
        assert_eq!(change.refused, 1);
        let got = &change.log.flights[0];
        assert_eq!(got.origin.chars().count(), MAX_TEXT);
        assert_eq!(got.pack_name.chars().count(), MAX_TEXT);
        assert_eq!(got.aircraft.as_ref().unwrap().chars().count(), MAX_TEXT);
        assert_eq!(got.ticks[0].text.chars().count(), MAX_TEXT);
        assert_eq!(got.stages[0].title.chars().count(), MAX_TEXT);
        assert_eq!(change.log.practice[0].title.chars().count(), MAX_TEXT);
    }

    #[test]
    fn a_merged_flight_keeps_no_more_ticks_skips_or_stages_than_a_flight_can_have() {
        let mut f = entry("a", 100);
        let tick = LoggedTick {
            at: 100,
            step: StepId::new("s"),
            text: "T".into(),
            name: "T".into(),
            value: "V".into(),
        };
        f.ticks = vec![tick; MAX_STEPS + 10];
        let skip = LoggedStep {
            step: StepId::new("s"),
            text: "T".into(),
            name: "T".into(),
            value: "V".into(),
            stage: "S".into(),
            phase: "p".into(),
            phase_title: "P".into(),
        };
        f.skipped = vec![skip; MAX_STEPS + 10];
        f.stages = vec![
            StageTime {
                id: None,
                title: "S".into(),
                ms: Millis::MAX
            };
            MAX_STAGES + 10
        ];
        let got = &merge(vec![f], vec![]).log.flights[0];
        assert_eq!(got.ticks.len(), MAX_STEPS);
        assert_eq!(got.skipped.len(), MAX_STEPS);
        assert_eq!(got.stages.len(), MAX_STAGES);
        assert!(got.stages.iter().all(|s| s.ms == MAX_STAGE_MS));
        // The CSV of such a flight still adds up, without overflowing.
        let mut log = new_log();
        log.flights = vec![got.clone()];
        assert_eq!(log_csv(&log).lines().count(), 2);
    }

    #[test]
    fn minutes_never_overflow() {
        // The largest value: its leftover 51,615 ms round up.
        assert_eq!(Millis::MAX % 60_000, 51_615);
        assert_eq!(minutes(Millis::MAX), Millis::MAX / 60_000 + 1);
        assert_eq!(minutes(29_999), 0);
        assert_eq!(minutes(30_000), 1);
        let huge = [
            StageTime {
                id: None,
                title: "A".into(),
                ms: Millis::MAX,
            },
            StageTime {
                id: None,
                title: "B".into(),
                ms: Millis::MAX,
            },
        ];
        assert_eq!(stage_minutes(&huge).len(), 2);
    }

    #[test]
    fn csv_guards_every_form_a_spreadsheet_reads_as_a_formula() {
        for (cell, out) in [
            ("=SUM(A1)", "'=SUM(A1)"),
            ("+1", "'+1"),
            ("-1+2", "'-1+2"),
            ("@cmd", "'@cmd"),
            // After leading spaces or control characters.
            ("  =SUM(A1)", "'  =SUM(A1)"),
            ("\u{1}=1", "'\u{1}=1"),
            ("\u{a0}@x", "'\u{a0}@x"),
            // Tab and carriage return first, whatever follows.
            ("\tKSEA", "'\tKSEA"),
            ("\r=1", "\"'\r=1\""),
        ] {
            assert_eq!(csv_cell(cell), out, "{cell:?}");
        }
        // What the log writes itself is unchanged: dates, times, counts, words.
        for cell in [
            "2025-11-14",
            "07:08",
            "161",
            "0",
            "KSEA",
            "Entered by hand",
            "Preflight 38",
            " KSEA",
            "",
        ] {
            assert_eq!(csv_cell(cell), cell, "{cell:?}");
        }
        assert_eq!(csv_cell("San Francisco, CA"), "\"San Francisco, CA\"");
    }

    #[test]
    fn a_log_file_from_a_newer_app_or_not_a_log_is_refused_and_the_log_unchanged() {
        for text in [
            r#"{"format": 99}"#,
            "not json",
            r#"{"format": 1, "flights": 3}"#,
        ] {
            let e = edit_log(
                new_log(),
                LogEdit::Merge { text: text.into() },
                &Glossaries::new(),
            )
            .unwrap_err();
            assert!(matches!(e, AppError::LogFile(_)), "{text}");
        }
    }

    #[test]
    fn a_saved_log_reads_back_and_newer_or_unreadable_logs_are_kept() {
        let mut log = add(new_log(), entry("a", 100)).log;
        log.practice.push(result("r", 50));
        let text = serde_json::to_string(&log).unwrap();
        assert_eq!(
            load_log(&text, &Glossaries::new()),
            Loaded::Ready {
                value: log,
                migrated_from: None
            }
        );
        let newer = LOG_FORMAT + 1;
        assert_eq!(
            load_log(&format!(r#"{{"format": {newer}}}"#), &Glossaries::new()),
            Loaded::Newer { format: newer }
        );
        assert!(matches!(
            load_log(r#"{"format": 1}"#, &Glossaries::new()),
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
        } = load_log(text, &Glossaries::new())
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
        // Format 2's names: an entry logged before them is named from its saved text by the
        // naming rule, without labels (and here without a glossary: its pack isn't installed);
        // the text itself stays as saved.
        let names: Vec<(&str, &str)> = f
            .ticks
            .iter()
            .map(|t| (t.text.as_str(), t.name.as_str()))
            .collect();
        assert_eq!(names[0], ("BATTERY SWITCH", "Battery switch"));
        assert_eq!(names[1], ("ALTIMETERS", "Altimeters"));
        assert_eq!(
            (f.skipped[0].text.as_str(), f.skipped[0].name.as_str()),
            ("TERR", "Terr")
        );
        assert_eq!(value.practice[0].score, 9);
        // Format 3: the pack's name was saved as `aircraft`; what format 1 never recorded stays
        // unknown.
        assert!(value.flights.iter().all(|f| f.pack_name == "Trainer"
            && f.pack_version == "0.1.0"
            && f.aircraft.is_none()));
        assert!(f.stages.iter().all(|s| s.id.is_none()));
        assert_eq!(
            f.stages
                .iter()
                .map(|s| s.title.as_str())
                .collect::<Vec<_>>(),
            ["Preflight", "Departure"]
        );
        let r = &value.practice[0];
        assert_eq!(
            (r.pack.as_str(), r.title.as_str()),
            ("trainer", "Memory items")
        );
        assert_eq!(
            (&r.pack_version, &r.pack_name, &r.aircraft),
            (&None, &None, &None)
        );
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(raw["format"], json!(1));
        assert_eq!(
            value.flights.len() + value.practice.len(),
            raw["flights"].as_array().unwrap().len() + raw["practice"].as_array().unwrap().len(),
            "every entry kept"
        );
    }

    /// The second log format, frozen: a log saved by format 2 (step names saved, the pack's name
    /// as `aircraft`, two packs) loads with every entry and value kept, its pack's name moved to
    /// `packName`, and what it never recorded unknown.
    #[test]
    fn a_format_2_log_still_loads_with_every_entry() {
        let text = include_str!("../tests/fixtures/log-format-2.json");
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(raw["format"], json!(2));
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_log(text, &Glossaries::new())
        else {
            panic!("the format 2 log did not load");
        };
        assert_eq!(migrated_from, Some(2));
        assert_eq!(value.format, LOG_FORMAT);
        assert_eq!(
            value.flights.len(),
            raw["flights"].as_array().unwrap().len()
        );
        assert_eq!(
            value.practice.len(),
            raw["practice"].as_array().unwrap().len()
        );
        for (f, old) in value.flights.iter().zip(raw["flights"].as_array().unwrap()) {
            assert_eq!(f.id, old["id"].as_str().unwrap());
            assert_eq!(f.pack, old["pack"].as_str().unwrap());
            assert_eq!(f.pack_version, old["packVersion"].as_str().unwrap());
            assert_eq!(f.pack_name, old["aircraft"].as_str().unwrap());
            assert_eq!(f.aircraft, None);
            assert_eq!(f.ticks.len(), old["ticks"].as_array().unwrap().len());
            assert_eq!(f.skipped.len(), old["skipped"].as_array().unwrap().len());
            assert_eq!(
                f.done,
                usize::try_from(old["done"].as_u64().unwrap()).unwrap()
            );
            let titles: Vec<&str> = f.stages.iter().map(|s| s.title.as_str()).collect();
            let old_titles: Vec<&str> = old["stages"]
                .as_array()
                .unwrap()
                .iter()
                .map(|s| s["title"].as_str().unwrap())
                .collect();
            assert_eq!(titles, old_titles);
            assert!(f.stages.iter().all(|s| s.id.is_none()));
        }
        assert_eq!(value.flights[0].ticks[0].name, "Canopy");
        for (r, old) in value
            .practice
            .iter()
            .zip(raw["practice"].as_array().unwrap())
        {
            assert_eq!(r.pack, old["pack"].as_str().unwrap());
            assert_eq!(
                r.score,
                usize::try_from(old["score"].as_u64().unwrap()).unwrap()
            );
            assert_eq!(
                (&r.pack_version, &r.pack_name, &r.aircraft),
                (&None, &None, &None)
            );
        }
    }

    /// A log file of any format this version reads merges into today's log: format 1 and 2
    /// files are carried forward first, and their entries keep what they recorded.
    #[test]
    fn format_1_and_2_log_files_merge_into_a_format_3_log() {
        let mut log = new_log();
        log.flights = vec![entry("p@1", 1000 * MIN)];
        for (text, flights, practice) in [
            (include_str!("../tests/fixtures/log-format-1.json"), 2, 1),
            (include_str!("../tests/fixtures/log-format-2.json"), 1, 1),
        ] {
            let change = edit_log(
                log.clone(),
                LogEdit::Merge { text: text.into() },
                &Glossaries::new(),
            )
            .unwrap();
            assert_eq!(change.log.format, LOG_FORMAT);
            assert_eq!(
                (change.added_flights, change.added_practice),
                (flights, practice),
                "the format 2 file shares the format 1 file's entries except the glider's"
            );
            log = change.log;
        }
        assert_eq!(log.flights.len(), 4);
        assert_eq!(log.practice.len(), 2);
        let glider = log.flights.iter().find(|f| f.pack == "glider").unwrap();
        assert_eq!(
            (glider.pack_name.as_str(), glider.pack_version.as_str()),
            ("Glider trainer", "2.3.0")
        );
        // And the merged log saves and loads as today's format.
        let text = serde_json::to_string(&log).unwrap();
        assert!(matches!(
            load_log(&text, &Glossaries::new()),
            Loaded::Ready {
                migrated_from: None,
                ..
            }
        ));
    }

    #[test]
    fn a_practice_result_records_its_pack_by_name_and_version_and_the_aircraft() {
        let pack = crate::test_support::example_pack();
        let r = practice_result(&pack, "Memory items", 11, 10, 5_000);
        assert_eq!(r.id, format!("{}@5000", pack.manifest.id));
        assert_eq!(r.pack, pack.manifest.id);
        assert_eq!(
            r.pack_version.as_deref(),
            Some(pack.manifest.version.to_string().as_str())
        );
        assert_eq!(r.pack_name.as_deref(), Some(pack.manifest.name.as_str()));
        assert_eq!(r.aircraft.as_deref(), Some("Example trainer"));
        assert_eq!(
            (r.score, r.total),
            (10, 10),
            "the score is never over the total"
        );
    }

    /// The example pack's text as installed under `id`, with `term` added to its glossary.
    fn installed_pack(id: &str, term: &str) -> String {
        let mut pack = serde_json::to_value(crate::test_support::example_pack()).unwrap();
        pack["manifest"]["id"] = json!(id);
        pack["content"]["glossary"]["terms"]
            .as_array_mut()
            .unwrap()
            .push(json!({ "term": term, "meaning": "A term for the test." }));
        pack.to_string()
    }

    #[test]
    fn a_format_1_entry_keeps_its_installed_pack_s_glossary_terms_in_capitals() {
        let text = include_str!("../tests/fixtures/log-format-1.json");
        // The log names the packs it needs; only a format 1 log needs any.
        assert_eq!(log_packs(text), vec!["trainer".to_owned()]);
        assert_eq!(
            log_packs(&serde_json::to_string(&new_log()).unwrap()),
            Vec::<String>::new()
        );
        let named = |packs: &[String]| {
            let Loaded::Ready { value, .. } = load_log(text, &crate::names::pack_glossaries(packs))
            else {
                panic!("the format 1 log did not load");
            };
            value.flights[0].skipped[0].name.clone()
        };
        // Its pack is installed, with TERR in the glossary: "TERR" stays "TERR".
        assert_eq!(named(&[installed_pack("trainer", "TERR")]), "TERR");
        // Its pack isn't installed (another pack is): the rule without a glossary.
        assert_eq!(named(&[installed_pack("other", "TERR")]), "Terr");
        assert_eq!(named(&[]), "Terr");
        // A merged log file is named the same way.
        let change = edit_log(
            new_log(),
            LogEdit::Merge { text: text.into() },
            &crate::names::pack_glossaries(&[installed_pack("trainer", "TERR")]),
        )
        .unwrap();
        let merged = change.log.flights.iter().find(|f| f.pack == "trainer");
        assert_eq!(merged.unwrap().skipped[0].name, "TERR");
    }

    #[test]
    fn a_format_1_entry_for_a_step_gone_from_its_pack_is_named_by_the_rule() {
        // A skipped step logged in format 1, whose step the pack has since removed: the log page
        // can't name it from the pack, so it shows the name the migration gave it.
        let gone = "ifly-737-max8.preflight.crew-oxygen-old";
        let pack = crate::test_support::ifly_pack();
        assert!(
            pack.lists
                .iter()
                .flat_map(|l| &l.steps)
                .all(|s| s.id.as_str() != gone)
        );
        let text = json!({ "format": 1, "flights": [{
            "id": "ifly-737-max8@1", "loggedAt": 1, "pack": "ifly-737-max8",
            "packVersion": "0.0.1", "aircraft": "Trainer", "origin": "KSEA",
            "destination": "KSFO", "offBlocks": 1, "onBlocks": 2, "stages": [],
            "done": 0, "total": 1, "plan": "simbrief", "finished": false,
            "skipped": [{ "step": gone, "text": "CREW OXYGEN", "value": "VERIFY",
                "stage": "Preflight", "phase": "preflight", "phaseTitle": "Preflight" }],
            "ticks": [{ "at": 1, "step": gone, "text": "CREW OXYGEN", "value": "VERIFY" }]
        }], "practice": [] })
        .to_string();
        let Loaded::Ready { value, .. } = load_log(&text, &Glossaries::new()) else {
            panic!(
                "the format 1 log did not load: {:?}",
                load_log(&text, &Glossaries::new())
            );
        };
        let f = &value.flights[0];
        assert_eq!(f.skipped[0].name, "Crew oxygen");
        assert_eq!(f.skipped[0].text, "CREW OXYGEN");
        assert_eq!(f.ticks[0].name, "Crew oxygen");
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
                    id: None,
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
            id: None,
            title: "Preflight".into(),
            ms: 38 * MIN,
        }];
        let mut older = entry("b", 1000 * MIN);
        older.aircraft = None;
        log.flights = vec![f, older];
        let csv = log_csv(&log);
        let rows: Vec<&str> = csv.split("\r\n").filter(|r| !r.is_empty()).collect();
        assert_eq!(rows.len(), 3);
        assert!(rows[0].starts_with("Date (UTC),From,To,Pack,Pack version,Aircraft,"));
        assert_eq!(
            rows[1],
            "2025-11-14,'=KSEA,\"San Francisco, CA\",Trainer,1,Trainer jet,07:08,09:49,161,1,2,0,No,Entered by hand,Preflight 38"
        );
        // A flight logged before format 3 has no aircraft name: its cell is empty.
        assert!(rows[2].contains(",Trainer,1,,"), "{}", rows[2]);
    }

    /// The pack's name and version and the aircraft's name come from a pack file, which can say
    /// anything: the formula guard (#46) covers their cells too.
    #[test]
    fn csv_guards_the_pack_and_aircraft_cells_against_formulas() {
        let mut log = new_log();
        let mut f = entry("a", 1000 * MIN);
        f.pack_name = "=HYPERLINK(\"x\")".into();
        f.pack_version = "+1".into();
        f.aircraft = Some("@SUM(A1)".into());
        log.flights = vec![f];
        let csv = log_csv(&log);
        let row = csv.split("\r\n").nth(1).unwrap();
        assert!(
            row.contains(",\"'=HYPERLINK(\"\"x\"\")\",'+1,'@SUM(A1),"),
            "{row}"
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
