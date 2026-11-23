// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! A file exported by the earlier single-file checklist (3.0, "Export JSON"), restored as a
//! backup (#240). 3.0 kept its progress in its own browser storage, under another address, so its
//! export file is the only way across. The file names no pack, so it goes to the loaded pack whose
//! `aliases` know its ids: those aliases (step, blank, option value, panel state, fill field) map
//! every 3.0 id. The flight keeps 3.0's step, blank, option and panel state ids, and restoring it
//! brings them in line through the same aliases as any flight from an earlier version of its pack.
//! Only its flight values are mapped here, since restoring doesn't map those.
//!
//! What comes across: ticks and skips with their times, blanks, the start options, the panel
//! state, the flight values and notes, and the settings 3.0 shares with Involo. Not the pilot's
//! name (decision 0019), the flight log, practice scores or running timers.

use std::collections::BTreeMap;

use involo_checklist_core::{AliasKind, FieldId, Millis, Quick, Session, StepId};
use involo_pack::FlatPack;
use serde_json::{Map, Value};

use crate::{
    Backup, BackupFlight, BackupRefusal, Detail, EarlierFile, EssentialsChanges, Flight,
    PackSource, Settings, StepLayout, Theme, new_flight, new_log,
};

/// The version every 3.0 export file gives, and the version its flight is said to come from.
const EARLIER_VERSION: u64 = 3;
const EARLIER_NAME: &str = "3.0";

/// Whether `object` has the shape of a 3.0 export file: its app's name, version 3 and the saved
/// state.
pub(crate) fn is_earlier_export(object: &Map<String, Value>) -> bool {
    object.get("app").is_some_and(Value::is_string)
        && object.get("version").and_then(Value::as_u64) == Some(EARLIER_VERSION)
        && object.get("state").is_some_and(Value::is_object)
}

/// The 3.0 export file `object` as a backup for the loaded pack that knows it, or why not.
pub(crate) fn earlier_backup(
    object: &Map<String, Value>,
    packs: &[&FlatPack],
) -> Result<(Backup, EarlierFile), BackupRefusal> {
    let state = object
        .get("state")
        .and_then(Value::as_object)
        .ok_or(BackupRefusal::NotBackup)?;
    let exported = object
        .get("exported")
        .and_then(Value::as_str)
        .or_else(|| state.get("savedAt").and_then(Value::as_str))
        .and_then(millis)
        .unwrap_or(0);
    let pack = packs
        .iter()
        .map(|p| (known(p, state), *p))
        .filter(|(score, _)| *score > 0)
        .max_by_key(|(score, _)| *score)
        .map(|(_, p)| p)
        .ok_or(BackupRefusal::NoPackForEarlier)?;
    let flight = flight(pack, state, exported);
    let settings = settings(pack, state);
    // The pack's steps the file marks, as the restore will map them; a tick wins over a skip.
    let steps = aliases(pack, AliasKind::Step);
    let count = |key: &str, also_ticked: bool| {
        let n = self::object(state, key)
            .filter(|(id, _)| steps.contains_key(id.as_str()))
            .filter(|(id, _)| also_ticked || !self::object(state, "done").any(|(d, _)| d == *id))
            .count();
        u32::try_from(n).unwrap_or(u32::MAX)
    };
    let file = EarlierFile {
        ticked: count("done", true),
        skipped: count("skip", false),
    };
    let backup = Backup {
        kind: crate::BACKUP_KIND.to_owned(),
        format: crate::BACKUP_FORMAT,
        app_version: EARLIER_NAME.to_owned(),
        saved_at: i64::try_from(exported).unwrap_or(0),
        flights: vec![BackupFlight {
            pack: pack.manifest.id.clone(),
            name: pack.manifest.name.clone(),
            version: EARLIER_NAME.to_owned(),
            source: PackSource::Catalog,
            place: None,
            flight,
            plan: None,
        }],
        settings,
        log: new_log(),
    };
    Ok((backup, file))
}

use crate::update::aliases;

/// A saved object's entry, or an empty one.
fn object<'a>(
    state: &'a Map<String, Value>,
    key: &str,
) -> impl Iterator<Item = (&'a String, &'a Value)> {
    state
        .get(key)
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
}

/// A saved text: a string, or a number as 3.0 sometimes saved one.
fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// The start options 3.0 saves at the top of its state, as `<option>:<value>`.
fn options(state: &Map<String, Value>) -> Vec<(String, String)> {
    ["power", "start", "appr"]
        .into_iter()
        .filter_map(|o| Some((o.to_owned(), state.get(o)?.as_str()?.to_owned())))
        .collect()
}

/// The flight values 3.0 saved: the clearance and performance values, the flight's own, and the
/// units at the top of its state, by 3.0's name.
fn saved_values(state: &Map<String, Value>) -> Vec<(String, String)> {
    let units = ["fu", "qu", "mt"]
        .into_iter()
        .filter_map(|k| Some((k.to_owned(), text(state.get(k)?)?)));
    object(state, "set")
        .chain(object(state, "flight"))
        .filter_map(|(k, v)| Some((k.clone(), text(v)?)))
        .chain(units)
        .filter(|(_, v)| !v.trim().is_empty())
        .collect()
}

/// How many of the file's ids the pack's aliases know: 0 for a pack that isn't the file's.
fn known(pack: &FlatPack, state: &Map<String, Value>) -> usize {
    let steps = aliases(pack, AliasKind::Step);
    let blanks = aliases(pack, AliasKind::Blank);
    let options = aliases(pack, AliasKind::OptionValue);
    let fields = aliases(pack, AliasKind::FillField);
    let marks = ["done", "skip", "ess"]
        .into_iter()
        .flat_map(|k| object(state, k))
        .filter(|(id, _)| steps.contains_key(id.as_str()))
        .count();
    let typed = object(state, "vals")
        .filter(|(id, _)| blanks.contains_key(id.as_str()))
        .count();
    let chosen = self::options(state)
        .iter()
        .filter(|(o, v)| options.contains_key(format!("{o}:{v}").as_str()))
        .count();
    let values = saved_values(state)
        .iter()
        .filter(|(k, _)| fields.contains_key(k.as_str()))
        .count();
    marks + typed + chosen + values
}

/// 3.0's marks of one kind, by its step id, at the time each was made (an older 3.0 saved `true`
/// for a tick with no time: the export's).
fn marks(state: &Map<String, Value>, key: &str, exported: Millis) -> BTreeMap<StepId, Millis> {
    let mut out = BTreeMap::new();
    for (id, v) in object(state, key) {
        let at = match v {
            Value::String(s) => millis(s).unwrap_or(exported),
            Value::Bool(true) | Value::Number(_) => exported,
            _ => continue,
        };
        out.insert(StepId::new(id), at);
    }
    out
}

fn flight(pack: &FlatPack, state: &Map<String, Value>, exported: Millis) -> Flight {
    let mut f = new_flight(pack);
    // Said to come from 3.0, so restoring brings it in line through the pack's aliases.
    EARLIER_NAME.clone_into(&mut f.pack_version);
    f.session = Session::from_marks(
        marks(state, "done", exported),
        marks(state, "skip", exported),
    );
    f.blanks.clear();
    for (k, v) in object(state, "vals") {
        if let Some(v) = text(v).filter(|v| !v.trim().is_empty()) {
            f.blanks.insert(k.clone(), v);
        }
    }
    f.options.clear();
    for (option, value) in options(state) {
        f.options.insert(option, value);
    }
    f.answers.clear();
    f.panel_state = state
        .get("pst")
        .and_then(|p| p.get("k"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    f.notes = object(state, "flight")
        .find(|(k, _)| *k == "notes")
        .and_then(|(_, v)| text(v))
        .unwrap_or_default();
    f.values = values(pack, state);
    f
}

/// The flight values through the pack's fill field aliases, each kept only when the field takes
/// it. 3.0 saved the departure's latitude and longitude apart; the pack's field holds both.
fn values(pack: &FlatPack, state: &Map<String, Value>) -> BTreeMap<FieldId, String> {
    let fields = aliases(pack, AliasKind::FillField);
    let mut joined: BTreeMap<&str, String> = BTreeMap::new();
    let mut saved = saved_values(state);
    // Two 3.0 values for one field: the latitude before the longitude.
    saved.retain(|(k, _)| !k.contains("lon"));
    saved.extend(
        saved_values(state)
            .into_iter()
            .filter(|(k, _)| k.contains("lon")),
    );
    for (key, value) in &saved {
        if let Some(to) = fields.get(key.as_str()) {
            let v = joined.entry(to).or_default();
            if !v.is_empty() {
                v.push(' ');
            }
            v.push_str(value.trim());
        }
    }
    let mut out = BTreeMap::new();
    for (to, value) in joined {
        let id = FieldId::from(to);
        let Some(def) = crate::values::field(pack, &id) else {
            continue;
        };
        if def.calculated.is_some()
            || crate::values::allowed(def).is_some_and(|ok| !ok.contains(&value.as_str()))
        {
            continue;
        }
        out.insert(id, value);
    }
    out
}

/// The settings 3.0 shares with Involo, over the defaults, with Essentials changed for this pack.
fn settings(pack: &FlatPack, state: &Map<String, Value>) -> Settings {
    let mut s = Settings::default();
    let word = |k: &str| state.get(k).and_then(Value::as_str);
    let flag = |k: &str| state.get(k).and_then(Value::as_bool);
    s.theme = match word("theme") {
        Some("dark") => Theme::Dark,
        Some("light") => Theme::Light,
        _ => Theme::System,
    };
    s.essentials = word("mode") == Some("quick");
    if word("ui") == Some("flow") {
        s.list_view = StepLayout::Flow;
    }
    if word("view") == Some("simple") {
        s.detail = Detail::Quick;
    }
    if let Some(chime) = flag("chime") {
        s.chime = chime;
    }
    if let Some(map) = flag("map") {
        s.panel_preview = map;
    }
    s.simbrief_user = word("sbu")
        .map(str::trim)
        .filter(|u| !u.is_empty())
        .map(str::to_owned);
    s.tour_seen = word("tour").is_some_and(|t| !t.is_empty()) || flag("tourOff") == Some(true);
    s.current_pack = Some(pack.manifest.id.clone());
    let steps = aliases(pack, AliasKind::Step);
    let quick = |id: &str| {
        pack.lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|st| st.id.as_str() == id)
            .map(|st| st.quick)
    };
    let mut changes = EssentialsChanges::default();
    for (id, value) in object(state, "ess") {
        let (Some(to), Some(on)) = (steps.get(id.as_str()), value.as_bool()) else {
            continue;
        };
        let Some(default) = quick(to) else {
            continue;
        };
        let default = &default;
        if on && *default != Some(Quick::Always) {
            changes.added.insert(StepId::new(*to));
        } else if !on && default.is_some() {
            changes.removed.insert(StepId::new(*to));
        }
    }
    if changes != EssentialsChanges::default() {
        s.essentials_changes
            .insert(pack.manifest.id.clone(), changes);
    }
    s
}

/// `2025-11-13T10:00:00.000Z`, a UTC time as 3.0 saved it, in milliseconds since 1970.
fn millis(iso: &str) -> Option<Millis> {
    let (date, time) = iso.trim().strip_suffix('Z')?.split_once('T')?;
    let mut dates = date.splitn(3, '-').map(str::parse::<i64>);
    let (year, month, day) = (
        dates.next()?.ok()?,
        dates.next()?.ok()?,
        dates.next()?.ok()?,
    );
    let (hms, frac) = time.split_once('.').unwrap_or((time, "0"));
    let mut times = hms.splitn(3, ':').map(str::parse::<i64>);
    let (hour, min, sec) = (
        times.next()?.ok()?,
        times.next()?.ok()?,
        times.next()?.ok()?,
    );
    let ms: i64 = format!("{frac:0<3}").get(..3)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || min > 59 || sec > 60 {
        return None;
    }
    // A civil date to days since 1970-01-01 (Howard Hinnant's algorithm).
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year.rem_euclid(400);
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Millis::try_from((((days * 24 + hour) * 60 + min) * 60 + sec) * 1000 + ms).ok()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;
    use crate::test_support::{example_pack, ifly_pack};
    use crate::{BackupRead, read_backup, restore_flight};

    /// An invented 3.0 export: ticks with and without a time, a step both ticked and skipped, ids
    /// no alias knows, blanks, flight values (one not among its field's choices, one empty),
    /// units, the start options, a panel state, Essentials changes, settings, and parts that
    /// don't come across (the pilot's name, the log, practice scores and timers).
    const EXPORT: &str = include_str!("../tests/fixtures/earlier-export-3.json");

    fn ready(read: BackupRead) -> Backup {
        match read {
            BackupRead::Ready { backup, .. } => *backup,
            BackupRead::Refused { refusal } => panic!("refused: {refusal:?}"),
        }
    }

    #[test]
    fn a_3_0_export_restores_into_the_pack_whose_aliases_know_it() {
        let (example, ifly) = (example_pack(), ifly_pack());
        let read = read_backup(EXPORT, &[&example, &ifly]);
        let BackupRead::Ready { earlier, .. } = &read else {
            panic!("refused");
        };
        assert_eq!(
            *earlier,
            Some(EarlierFile {
                ticked: 2,
                skipped: 1
            }),
            "the pack's steps the file marks: the unknown tick left out, the skip of a ticked step too"
        );
        let backup = ready(read);
        assert_eq!(backup.app_version, "3.0");
        assert_eq!(backup.saved_at, 1_795_167_000_000, "the export's time");
        assert_eq!(backup.log.flights.len(), 0, "3.0's log stays behind");
        let [entry] = backup.flights.as_slice() else {
            panic!("one flight");
        };
        assert_eq!(entry.pack, "ifly-737-max8");
        assert_eq!(entry.version, "3.0");

        // Restoring brings 3.0's ids in line through the pack's aliases.
        let f = restore_flight(&ifly, &entry.flight);
        let step = |id: &str| StepId::new(format!("ifly-737-max8.cold-dark.{id}"));
        assert_eq!(
            f.session.done_at(&step("battery-switch")),
            Some(1_795_165_265_250)
        );
        assert_eq!(
            f.session.done_at(&step("standby-power-switch")),
            Some(1_795_167_000_000),
            "a tick saved with no time takes the export's, and a tick wins over a skip"
        );
        assert!(!f.session.is_skipped(&step("standby-power-switch")));
        assert_eq!(
            f.session.skipped_at(&step("alternate-flaps-switches")),
            Some(1_795_165_380_000)
        );
        assert_eq!(
            f.blanks,
            BTreeMap::from([(
                "ifly-737-max8.before-start.fuel#0".to_owned(),
                "12500".to_owned()
            )])
        );
        let option = |o: &str| f.options.get(o).map(String::as_str);
        assert_eq!(
            (option("power"), option("start"), option("approach")),
            (Some("apu"), Some("turn"), Some("rnav"))
        );
        assert_eq!(f.panel_state.as_deref(), Some("cd"));
        assert_eq!(f.notes, "Expect runway 16L");
        let values: Vec<(&str, &str)> = f
            .values
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        assert_eq!(
            values,
            [
                ("destination", "KSFO"),
                ("flight_number", "PL123"),
                ("minimums_type", "BARO"),
                ("origin", "KSEA"),
                ("origin_position", "47.449 -122.309"),
                ("qnh_unit", "hPa"),
                ("runway", "16L"),
                ("sid", "SUMMA2"),
                ("weight_unit", "KG"),
                ("zfw", "126.5"),
            ],
            "an autobrake value that isn't one of its choices and an empty cost index stay out"
        );
        assert!(
            !serde_json::to_string(&backup).unwrap().contains("N123XX")
                && !serde_json::to_string(&backup)
                    .unwrap()
                    .contains("\"Pilot\""),
            "no aircraft registration or pilot name"
        );

        let s = &backup.settings;
        assert_eq!(s.theme, Theme::Dark);
        assert!(s.essentials && !s.chime && !s.panel_preview && s.tour_seen);
        assert_eq!((s.list_view, s.detail), (StepLayout::Flow, Detail::Quick));
        assert_eq!(s.simbrief_user.as_deref(), Some("pilot"));
        assert_eq!(s.current_pack.as_deref(), Some("ifly-737-max8"));
        let changes = &s.essentials_changes["ifly-737-max8"];
        assert_eq!(
            changes.removed,
            BTreeSet::from([step("battery-switch")]),
            "a step always in Essentials that 3.0 took out"
        );
        assert_eq!(
            changes.added,
            BTreeSet::from([step("wiper-selectors")]),
            "a step not in Essentials that 3.0 put in; the id no alias knows stays out"
        );
    }

    #[test]
    fn a_3_0_export_no_loaded_pack_knows_is_refused_as_such() {
        let example = example_pack();
        assert_eq!(
            read_backup(EXPORT, &[&example]),
            BackupRead::Refused {
                refusal: BackupRefusal::NoPackForEarlier
            }
        );
        assert_eq!(
            read_backup(EXPORT, &[]),
            BackupRead::Refused {
                refusal: BackupRefusal::NoPackForEarlier
            }
        );
    }

    #[test]
    fn only_version_3_with_its_state_reads_as_a_3_0_export() {
        let ifly = ifly_pack();
        let other = EXPORT.replacen("\"version\": 3", "\"version\": 2", 1);
        assert_eq!(
            read_backup(&other, &[&ifly]),
            BackupRead::Refused {
                refusal: BackupRefusal::NotBackup
            }
        );
        let no_state = r#"{"app":"x","version":3,"state":[]}"#;
        assert_eq!(
            read_backup(no_state, &[&ifly]),
            BackupRead::Refused {
                refusal: BackupRefusal::NotBackup
            }
        );
    }

    #[test]
    fn times_read_as_3_0_saved_them() {
        assert_eq!(millis("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(millis("2000-02-29T23:59:59.999Z"), Some(951_868_799_999));
        assert_eq!(millis("2026-11-20T09:01:05.25Z"), Some(1_795_165_265_250));
        for bad in [
            "2026-11-20T09:30:00",
            "2026-13-01T00:00:00Z",
            "yesterday",
            "",
        ] {
            assert_eq!(millis(bad), None, "{bad}");
        }
    }
}
