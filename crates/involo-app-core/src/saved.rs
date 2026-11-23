// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Reading saved data (decision 0012). Each saved type carries a format number. An older format
//! is migrated forward step by step; a newer or unreadable one is reported, never discarded, so
//! the interface can keep it, tell the pilot and offer a copy.

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use ts_rs::TS;

use crate::flight::{FLIGHT_FORMAT, Flight};
#[cfg(test)]
use crate::settings::TextSize;
use crate::settings::{SETTINGS_FORMAT, Settings};

/// What reading saved data found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
// The state names are values (snake_case); field names are camelCase, as in all app data.
#[serde(
    tag = "state",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[ts(export, rename_all_fields = "camelCase")]
pub enum Loaded<T> {
    /// Read, and migrated forward if it was older (`migratedFrom` names the old format).
    Ready {
        value: T,
        migrated_from: Option<u32>,
    },
    /// Written by a newer version of the app. Keep it; this version cannot read it.
    Newer { format: u32 },
    /// Not readable as this type. Keep it and tell the pilot why.
    Unreadable { reason: String },
}

/// Turns the saved shape of format `n` into the shape of format `n + 1`.
pub(crate) type Migration = fn(Value) -> Result<Value, String>;

/// Migrations for [`Flight`]: entry `i` turns format `i + 1` into format `i + 2`.
const FLIGHT_MIGRATIONS: &[Migration] = &[
    flight_1_to_2,
    flight_2_to_3,
    flight_3_to_4,
    flight_4_to_5,
    flight_5_to_6,
    flight_6_to_7,
    flight_7_to_8,
];

/// Format 8 saves the page each CDU walkthrough is on (#215); an older flight has started none, so
/// nothing changes.
fn flight_7_to_8(value: Value) -> Result<Value, String> {
    value.as_object().ok_or("the flight is not an object")?;
    Ok(value)
}

/// Format 7 saves briefings given or skipped (#214); an older flight has none, so nothing changes.
fn flight_6_to_7(value: Value) -> Result<Value, String> {
    value.as_object().ok_or("the flight is not an object")?;
    Ok(value)
}

/// Format 6 saves paused step timers (#213); an older flight has none paused, so nothing changes.
fn flight_5_to_6(value: Value) -> Result<Value, String> {
    value.as_object().ok_or("the flight is not an object")?;
    Ok(value)
}

/// Format 5 adds the note a pack update leaves (decision 0028); an older flight has none, so
/// nothing changes.
fn flight_4_to_5(value: Value) -> Result<Value, String> {
    value.as_object().ok_or("the flight is not an object")?;
    Ok(value)
}

/// Format 4 calls the panel state the flight started from what the screen calls it: the saved
/// key `startState` becomes `panelState`, with the same value (decision 0029, Names).
fn flight_3_to_4(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("the flight is not an object")?;
    if let Some(state) = object.remove("startState") {
        object.insert("panelState".into(), state);
    }
    Ok(value)
}

/// Format 3 records how each decision was answered. Format 2 had no plan suggestions, so it
/// starts with no records, and an answered option with no record reads as answered by the pilot.
fn flight_2_to_3(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("the flight is not an object")?;
    if object.contains_key("answers") {
        return Ok(value);
    }
    object.insert("answers".into(), Value::Object(serde_json::Map::new()));
    Ok(value)
}

/// Format 2 adds the steps a panel state ticked or skipped (none yet in an older flight) and new
/// fill fields (destination QNH, arrival runway, STAR, alternate, tower frequency, thrust
/// rating), which are only new keys. Nothing older changes.
fn flight_1_to_2(value: Value) -> Result<Value, String> {
    value.as_object().ok_or("the flight is not an object")?;
    Ok(value)
}
/// Migrations for [`Settings`], indexed the same way.
const SETTINGS_MIGRATIONS: &[Migration] = &[
    settings_1_to_2,
    settings_2_to_3,
    settings_3_to_4,
    settings_4_to_5,
    settings_5_to_6,
    settings_6_to_7,
    settings_7_to_8,
    settings_8_to_9,
    settings_9_to_10,
];

/// Format 10 adds when the backup reminder may show again after Not now (#243): no time yet.
fn settings_9_to_10(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("backupReminderAfter".into(), Value::Null);
    Ok(value)
}

/// Format 9 adds whether the simulator-only notice has been answered (#241). Not before it: the
/// notice is new, so a pilot who used the app already sees it once too.
fn settings_8_to_9(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("noticeSeen".into(), Value::from(false));
    Ok(value)
}

/// Format 8 adds when this device last saved a backup file (#47): never, before it.
fn settings_7_to_8(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("lastBackup".into(), Value::Null);
    Ok(value)
}

/// Format 7 adds the pack the app opens and the pilot's seat (decision 0028), neither chosen yet.
/// The app sets the pack from the flight saved with format 6, the one pack the app had then.
fn settings_6_to_7(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("currentPack".into(), Value::Null);
    object.insert("seat".into(), Value::Null);
    Ok(value)
}

/// Format 6 adds whether the tour's welcome card has been seen. Settings saved before it come from
/// someone who has used the app already, so it counts as seen: the welcome is for a first visit.
fn settings_5_to_6(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("tourSeen".into(), Value::from(true));
    Ok(value)
}

/// Format 5 adds the Flight pages' Descriptions On/Off, On to start with.
fn settings_4_to_5(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("descriptions".into(), Value::from(true));
    Ok(value)
}

/// Format 4 replaces Map in steps with Panel preview in steps (round 6): Off stays Off, every
/// other choice becomes On.
fn settings_3_to_4(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    let mode = object.remove("mapInSteps");
    object.remove("mapBeforeHide");
    let off = mode.as_ref().and_then(Value::as_str) == Some("off");
    object.insert("panelPreview".into(), Value::from(!off));
    Ok(value)
}

/// Format 3 replaces the map On/Off with Map in steps: On becomes Always, Off stays Off.
fn settings_2_to_3(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    let on = object
        .remove("flightDeckMap")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let mode = if on { "always" } else { "off" };
    object.insert("mapInSteps".into(), Value::from(mode));
    object.insert("mapBeforeHide".into(), Value::from(mode));
    Ok(value)
}

/// Format 2 adds Text and controls size, standard for settings saved before it.
fn settings_1_to_2(mut value: Value) -> Result<Value, String> {
    let object = value.as_object_mut().ok_or("settings are not an object")?;
    object.insert("textSize".into(), Value::from("100"));
    Ok(value)
}

pub(crate) fn load_with<T: DeserializeOwned, M: Fn(Value) -> Result<Value, String>>(
    json: &str,
    current: u32,
    migrations: &[M],
) -> Loaded<T> {
    let mut value: Value = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(e) => {
            return Loaded::Unreadable {
                reason: format!("not JSON: {e}"),
            };
        }
    };
    let Some(format) = value
        .get("format")
        .and_then(Value::as_u64)
        .and_then(|f| u32::try_from(f).ok())
    else {
        return Loaded::Unreadable {
            reason: "no format number".into(),
        };
    };
    if format > current {
        return Loaded::Newer { format };
    }
    let first = usize::try_from(format.saturating_sub(1)).unwrap_or(usize::MAX);
    let needed = usize::try_from(current - format).unwrap_or(usize::MAX);
    if format == 0 || migrations.len() < first.saturating_add(needed) {
        return Loaded::Unreadable {
            reason: format!("format {format} is not one this app knows"),
        };
    }
    for (step, migrate) in migrations.iter().enumerate().skip(first).take(needed) {
        value = match migrate(value) {
            Ok(next) => next,
            Err(reason) => {
                return Loaded::Unreadable {
                    reason: format!("migrating from format {}: {reason}", step + 1),
                };
            }
        };
        if let Some(object) = value.as_object_mut() {
            object.insert("format".into(), Value::from(step + 2));
        }
    }
    match serde_json::from_value(value) {
        Ok(value) => Loaded::Ready {
            value,
            migrated_from: (format < current).then_some(format),
        },
        Err(e) => Loaded::Unreadable {
            reason: e.to_string(),
        },
    }
}

/// Read a saved flight.
pub fn load_flight(json: &str) -> Loaded<Flight> {
    load_with(json, FLIGHT_FORMAT, FLIGHT_MIGRATIONS)
}

/// Read the saved SimBrief plan (decision 0019).
pub fn load_plan(json: &str) -> Loaded<crate::SavedPlan> {
    load_with(json, crate::PLAN_FORMAT, &[] as &[Migration])
}

/// Read saved settings.
pub fn load_settings(json: &str) -> Loaded<Settings> {
    load_with(json, SETTINGS_FORMAT, SETTINGS_MIGRATIONS)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde::Deserialize;
    use serde_json::json;

    use super::*;

    #[test]
    fn a_format_1_flight_loads_as_the_current_format_unchanged() {
        let pack = crate::test_support::ifly_pack();
        let mut flight = crate::new_flight(&pack);
        flight
            .values
            .insert(involo_checklist_core::FieldId::from("qnh"), "29.92".into());
        let mut old = serde_json::to_value(&flight).unwrap();
        old["format"] = json!(1);
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(&old.to_string())
        else {
            panic!("did not load");
        };
        assert_eq!(migrated_from, Some(1));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(
            value.values, flight.values,
            "the departure QNH stays; the destination's is new"
        );
        assert!(value.state_ticks.is_empty());
        assert!(value.answers.is_empty());
    }

    #[test]
    fn a_flight_saved_before_packs_defined_their_fields_keeps_every_value() {
        // Format 4, written by the app's own code while flight fields were a fixed list: a flight
        // with 22 values, a panel state, a tick and notes (kept as it was, never regenerated).
        // Values are keyed by field id, as text, so nothing moves.
        let text = include_str!("../tests/fixtures/flight-format-4.json");
        let saved: serde_json::Value = serde_json::from_str(text).unwrap();
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 4 flight did not load");
        };
        // Format 5 only adds the update note, which a format 4 flight never has.
        assert_eq!(migrated_from, Some(4));
        assert_eq!(value.update, None);
        let values: BTreeMap<String, String> = value
            .values
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect();
        let expected: BTreeMap<String, String> =
            serde_json::from_value(saved["values"].clone()).unwrap();
        assert_eq!(values, expected);
        assert_eq!(values.len(), 22);
        assert_eq!(value.panel_state.as_deref(), Some("gpu"));
        assert_eq!(value.notes, "Taxi via A, hold short 16L");
        assert_eq!(
            serde_json::to_value(&value).unwrap()["values"],
            saved["values"]
        );
    }

    #[test]
    fn a_frozen_format_6_flight_keeps_its_paused_timer_and_has_no_briefings() {
        // Format 6, before briefings were saved (#214); kept as it was, never regenerated.
        let text = include_str!("../tests/fixtures/flight-format-6.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 6 flight did not load");
        };
        assert_eq!(migrated_from, Some(6));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(
            value.timer_pauses.get(&involo_checklist_core::StepId::new(
                "ifly-737-max8.preflight.irs"
            )),
            Some(&271_000)
        );
        assert!(value.briefings.is_empty());
    }

    #[test]
    fn a_frozen_format_7_flight_keeps_its_briefing_and_has_no_walkthrough_started() {
        // Format 7, before CDU walkthrough pages were saved (#215); kept as it was.
        let text = include_str!("../tests/fixtures/flight-format-7.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 7 flight did not load");
        };
        assert_eq!(migrated_from, Some(7));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(
            value.briefings.get("takeoff-briefing-items-gate-stand"),
            Some(&crate::BriefingMark::Briefed {
                at: 1_763_400_060_000
            })
        );
        assert!(value.walkthroughs.is_empty());
        assert_eq!(value.values.get("sid").map(String::as_str), Some("SUMMA2"));
    }

    #[test]
    fn a_walkthrough_page_is_saved_with_the_flight() {
        let pack = crate::test_support::ifly_pack();
        let mut flight = crate::new_flight(&pack);
        flight.walkthroughs.insert("preflight-setup".into(), 9);
        let text = serde_json::to_string(&flight).unwrap();
        assert!(text.contains(r#""walkthroughs":{"preflight-setup":9}"#));
        let Loaded::Ready { value, .. } = load_flight(&text) else {
            panic!("the flight did not load");
        };
        assert_eq!(value.walkthroughs, flight.walkthroughs);
    }

    #[test]
    fn briefings_are_saved_with_the_flight() {
        let pack = crate::test_support::ifly_pack();
        let mut flight = crate::new_flight(&pack);
        flight.briefings.insert(
            "approach-briefing".into(),
            crate::BriefingMark::Skipped { at: 9 },
        );
        let text = serde_json::to_string(&flight).unwrap();
        assert!(text.contains(r#""briefings":{"approach-briefing":{"state":"skipped","at":9}}"#));
        let Loaded::Ready { value, .. } = load_flight(&text) else {
            panic!("the flight did not load");
        };
        assert_eq!(value, flight);
    }

    #[test]
    fn a_frozen_format_5_flight_keeps_its_timers_and_has_none_paused() {
        // Format 5, before paused timers were saved (#213); kept as it was, never regenerated.
        let text = include_str!("../tests/fixtures/flight-format-5.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 5 flight did not load");
        };
        assert_eq!(migrated_from, Some(5));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(
            value.timers.get(&involo_checklist_core::StepId::new(
                "ifly-737-max8.preflight.irs"
            )),
            Some(&1_763_400_600_000)
        );
        assert!(value.timer_pauses.is_empty());
    }

    #[test]
    fn a_frozen_format_3_flight_keeps_its_panel_state() {
        // Written by the app at format 3, which saved the panel state as `startState` (kept as it
        // was, never regenerated).
        let text = include_str!("../tests/fixtures/flight-format-3.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 3 flight did not load");
        };
        assert_eq!(migrated_from, Some(3));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(value.panel_state.as_deref(), Some("gpu"));
        assert_eq!(value.state_ticks.len(), 1);
        assert_eq!(value.notes, "Taxi via A, hold short 16L");
        // Saved again, it uses the new key, and reads back the same.
        let saved = serde_json::to_value(&value).unwrap();
        assert_eq!(saved["panelState"], "gpu");
        assert!(saved.get("startState").is_none());
        let Loaded::Ready { value: again, .. } = load_flight(&saved.to_string()) else {
            panic!("did not load again");
        };
        assert_eq!(again, value);
    }

    #[test]
    fn a_frozen_format_2_flight_keeps_everything_and_gains_empty_answers() {
        // Written by the app at format 2 (kept as it was, never regenerated).
        let text = include_str!("../tests/fixtures/flight-format-2.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_flight(text)
        else {
            panic!("the format 2 flight did not load");
        };
        assert_eq!(migrated_from, Some(2));
        assert_eq!(value.format, FLIGHT_FORMAT);
        assert_eq!(value.options["power"], "apu");
        let battery = involo_checklist_core::StepId::new("ifly-737-max8.cold-dark.battery-switch");
        assert_eq!(value.session.done_at(&battery), Some(1_763_110_000_000));
        assert_eq!(
            value.values[&involo_checklist_core::FieldId::from("qnh")],
            "29.92"
        );
        assert_eq!(value.notes, "Taxi via A, hold short 16L");
        assert!(value.answers.is_empty());
        // It saves back at the current format and reads again unchanged.
        let again = serde_json::to_string(&value).unwrap();
        assert_eq!(
            load_flight(&again),
            Loaded::Ready {
                value,
                migrated_from: None
            }
        );
    }

    #[test]
    fn a_flight_from_a_newer_app_is_not_read() {
        let mut flight =
            serde_json::to_value(crate::new_flight(&crate::test_support::ifly_pack())).unwrap();
        flight["format"] = json!(FLIGHT_FORMAT + 1);
        assert!(matches!(
            load_flight(&flight.to_string()),
            Loaded::Newer { .. }
        ));
    }

    #[test]
    fn settings_saved_before_step_layout_was_named_keep_their_layout() {
        // Format 6 settings as the app saved them when the type was still called ListView.
        let saved = |layout: &str| {
            format!(
                r#"{{"format":6,"theme":"system","dimming":0,"textSize":"100","detail":"expanded","listView":"{layout}","essentials":false,"essentialsChanges":{{}},"panelPreview":true,"descriptions":true,"chime":true,"simbriefUser":null,"loadPlanOnOpen":false,"tourSeen":false}}"#
            )
        };
        for (text, layout) in [
            ("flow", crate::StepLayout::Flow),
            ("checklist", crate::StepLayout::Checklist),
        ] {
            let Loaded::Ready { value, .. } = load_settings(&saved(text)) else {
                panic!("{text}: saved settings did not load");
            };
            assert_eq!(value.list_view, layout);
            // Saved back the same, in today's format with the fields format 7 added.
            let mut back: serde_json::Value = serde_json::to_value(&value).unwrap();
            let object = back.as_object_mut().unwrap();
            assert_eq!(object.remove("currentPack"), Some(serde_json::Value::Null));
            assert_eq!(object.remove("seat"), Some(serde_json::Value::Null));
            assert_eq!(object.remove("lastBackup"), Some(serde_json::Value::Null));
            assert_eq!(object.remove("noticeSeen"), Some(json!(false)));
            assert_eq!(
                object.remove("backupReminderAfter"),
                Some(serde_json::Value::Null)
            );
            object.insert("format".into(), json!(6));
            let before: serde_json::Value = serde_json::from_str(&saved(text)).unwrap();
            assert_eq!(back, before);
        }
    }

    #[test]
    fn settings_saved_in_format_6_keep_every_value_and_choose_no_pack_yet() {
        // Frozen: format 6 settings as the app saved them, every value changed from its default.
        let text = include_str!("../tests/fixtures/settings-format-6.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(text)
        else {
            panic!("format 6 settings did not load");
        };
        assert_eq!(migrated_from, Some(6));
        assert_eq!(value.format, SETTINGS_FORMAT);
        assert_eq!(
            (value.current_pack.as_deref(), value.seat.as_deref()),
            (None, None)
        );
        let mut kept = serde_json::to_value(&value).unwrap();
        let object = kept.as_object_mut().unwrap();
        object.remove("currentPack");
        object.remove("seat");
        object.remove("lastBackup");
        object.remove("noticeSeen");
        object.remove("backupReminderAfter");
        object.insert("format".into(), json!(6));
        assert_eq!(
            kept,
            serde_json::from_str::<serde_json::Value>(text).unwrap()
        );
    }

    #[test]
    fn settings_saved_in_format_7_keep_every_value_and_have_no_backup_yet() {
        // Frozen: format 7 settings as the app saved them, every value changed from its default.
        let text = include_str!("../tests/fixtures/settings-format-7.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(text)
        else {
            panic!("format 7 settings did not load");
        };
        assert_eq!(migrated_from, Some(7));
        assert_eq!(value.format, SETTINGS_FORMAT);
        assert_eq!(value.last_backup, None);
        let mut kept = serde_json::to_value(&value).unwrap();
        let object = kept.as_object_mut().unwrap();
        assert_eq!(object.remove("lastBackup"), Some(serde_json::Value::Null));
        assert_eq!(object.remove("noticeSeen"), Some(json!(false)));
        assert_eq!(
            object.remove("backupReminderAfter"),
            Some(serde_json::Value::Null)
        );
        object.insert("format".into(), json!(7));
        assert_eq!(
            kept,
            serde_json::from_str::<serde_json::Value>(text).unwrap()
        );
    }

    #[test]
    fn settings_saved_in_format_8_keep_every_value_and_have_not_seen_the_notice() {
        // Frozen: format 8 settings as the app saved them, every value changed from its default.
        let text = include_str!("../tests/fixtures/settings-format-8.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(text)
        else {
            panic!("format 8 settings did not load");
        };
        assert_eq!(migrated_from, Some(8));
        assert!(!value.notice_seen, "the notice is new, so it shows once");
        let mut kept = serde_json::to_value(&value).unwrap();
        let object = kept.as_object_mut().unwrap();
        assert_eq!(object.remove("noticeSeen"), Some(json!(false)));
        assert_eq!(
            object.remove("backupReminderAfter"),
            Some(serde_json::Value::Null)
        );
        object.insert("format".into(), json!(8));
        assert_eq!(
            kept,
            serde_json::from_str::<serde_json::Value>(text).unwrap()
        );
    }

    #[test]
    fn settings_saved_in_format_9_keep_every_value_and_have_no_reminder_answer_yet() {
        // Frozen: format 9 settings as the app saved them, every value changed from its default.
        let text = include_str!("../tests/fixtures/settings-format-9.json");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(text)
        else {
            panic!("format 9 settings did not load");
        };
        assert_eq!(migrated_from, Some(9));
        assert_eq!(value.backup_reminder_after, None);
        let mut kept = serde_json::to_value(&value).unwrap();
        let object = kept.as_object_mut().unwrap();
        assert_eq!(
            object.remove("backupReminderAfter"),
            Some(serde_json::Value::Null)
        );
        object.insert("format".into(), json!(9));
        assert_eq!(
            kept,
            serde_json::from_str::<serde_json::Value>(text).unwrap()
        );
    }

    #[test]
    fn current_settings_read_back() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();
        assert_eq!(
            load_settings(&json),
            Loaded::Ready {
                value: settings,
                migrated_from: None
            }
        );
    }

    #[test]
    fn settings_from_format_1_get_the_standard_text_size() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        let object = old.as_object_mut().unwrap();
        object.remove("textSize");
        object.insert("format".into(), json!(1));
        object.insert("dimming".into(), json!(2));
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(&old.to_string())
        else {
            panic!("format 1 settings did not load");
        };
        assert_eq!(migrated_from, Some(1));
        assert_eq!(value.text_size, TextSize::Standard);
        assert_eq!(value.dimming, 2);
        assert_eq!(value.format, SETTINGS_FORMAT);
    }

    #[test]
    fn settings_from_format_2_turn_the_map_switch_into_the_panel_preview() {
        for (on, preview) in [(true, true), (false, false)] {
            let mut old = serde_json::to_value(Settings::default()).unwrap();
            let object = old.as_object_mut().unwrap();
            object.remove("panelPreview");
            object.insert("flightDeckMap".into(), json!(on));
            object.insert("format".into(), json!(2));
            let Loaded::Ready {
                value,
                migrated_from,
            } = load_settings(&old.to_string())
            else {
                panic!("format 2 settings did not load");
            };
            assert_eq!(migrated_from, Some(2));
            assert_eq!(value.panel_preview, preview);
        }
    }

    #[test]
    fn settings_from_format_3_keep_off_and_turn_every_other_map_choice_on() {
        for (mode, preview) in [
            ("always", true),
            ("new_panel", true),
            ("on_request", true),
            ("off", false),
        ] {
            let mut old = serde_json::to_value(Settings::default()).unwrap();
            let object = old.as_object_mut().unwrap();
            object.remove("panelPreview");
            object.insert("mapInSteps".into(), json!(mode));
            object.insert("mapBeforeHide".into(), json!("new_panel"));
            object.insert("format".into(), json!(3));
            let Loaded::Ready {
                value,
                migrated_from,
            } = load_settings(&old.to_string())
            else {
                panic!("format 3 settings did not load");
            };
            assert_eq!(migrated_from, Some(3));
            assert_eq!(value.panel_preview, preview, "{mode}");
        }
    }

    #[test]
    fn settings_from_format_4_get_descriptions_on() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        old["format"] = json!(4);
        old.as_object_mut().unwrap().remove("descriptions");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(&old.to_string())
        else {
            panic!("not ready");
        };
        assert_eq!(migrated_from, Some(4));
        assert!(value.descriptions);
    }

    #[test]
    fn settings_from_format_5_count_the_welcome_as_seen() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        old["format"] = json!(5);
        old.as_object_mut().unwrap().remove("tourSeen");
        let Loaded::Ready {
            value,
            migrated_from,
        } = load_settings(&old.to_string())
        else {
            panic!("not ready");
        };
        assert_eq!(migrated_from, Some(5));
        assert!(value.tour_seen);
        // A first visit has no saved settings: the defaults have not seen it.
        assert!(!Settings::default().tour_seen);
    }

    #[test]
    fn newer_and_unreadable_data_are_reported_not_dropped() {
        assert_eq!(
            load_settings(r#"{"format": 99}"#),
            Loaded::Newer { format: 99 }
        );
        assert!(matches!(
            load_settings("not json"),
            Loaded::Unreadable { .. }
        ));
        assert!(matches!(
            load_settings(r#"{"theme": "dark"}"#),
            Loaded::Unreadable { .. }
        ));
        assert!(matches!(
            load_flight(r#"{"format": 0}"#),
            Loaded::Unreadable { .. }
        ));
        // The current format with a missing field cannot be read, so it is kept, not reset.
        assert!(matches!(
            load_flight(r#"{"format": 1}"#),
            Loaded::Unreadable { .. }
        ));
    }

    /// A made-up type at format 3, to test the migration chain before any real migration exists.
    #[derive(Debug, PartialEq, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Demo {
        format: u32,
        name: String,
        lights: bool,
    }

    fn rename_title(mut v: Value) -> Result<Value, String> {
        let title = v["title"].take();
        let object = v.as_object_mut().ok_or("not an object")?;
        object.remove("title");
        object.insert("name".into(), title);
        Ok(v)
    }

    fn add_lights(mut v: Value) -> Result<Value, String> {
        v.as_object_mut()
            .ok_or("not an object")?
            .insert("lights".into(), json!(true));
        Ok(v)
    }

    #[test]
    fn older_formats_migrate_forward_step_by_step() {
        let chain: &[Migration] = &[rename_title, add_lights];
        let from_one = load_with::<Demo, _>(r#"{"format": 1, "title": "A"}"#, 3, chain);
        let expected = Demo {
            format: 3,
            name: "A".into(),
            lights: true,
        };
        assert_eq!(
            from_one,
            Loaded::Ready {
                value: expected,
                migrated_from: Some(1)
            }
        );
        let from_two = load_with::<Demo, _>(r#"{"format": 2, "name": "B"}"#, 3, chain);
        assert!(matches!(
            from_two,
            Loaded::Ready {
                migrated_from: Some(2),
                ..
            }
        ));
        let broken = load_with::<Demo, _>(
            r#"{"format": 1, "title": "A", "name": "x"}"#,
            3,
            &[|_| Err("bad".into()), add_lights],
        );
        assert!(matches!(broken, Loaded::Unreadable { reason } if reason.contains("format 1")));
    }
}
