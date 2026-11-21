// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! One backup file (#47): every pack's flight and plan, the settings and the flight log, so a
//! pilot can keep a copy and move to another browser or device. Each part keeps its own format
//! number inside the file, so reading a backup migrates each part as reading it from the device
//! does; the file has a format number of its own and the app version that wrote it.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{
    Flight, Glossaries, Loaded, Log, SavedPlan, Settings, load_flight, load_log, load_plan,
    load_settings,
};

/// The format of a backup file. Raise it, with a migration and tests, when its shape changes.
pub const BACKUP_FORMAT: u32 = 1;

/// What every backup file says it is, so it is told apart from a flight log file.
pub const BACKUP_KIND: &str = "involo-backup";

/// Where a pack on the device came from: the catalog, or a file the pilot chose (decision 0028).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PackSource {
    Catalog,
    File,
}

/// Where a flight was when the backup was saved, as the Packs page shows it, so a restore can say
/// so even on a device without the pack.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct FlightPlace {
    /// "Stage › Phase", or the stage alone.
    pub place: String,
    pub done: u32,
    pub total: u32,
}

/// One pack's flight and plan in a backup, with the pack it belongs to.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct BackupFlight {
    /// The pack's id, name and version when the backup was saved.
    pub pack: String,
    pub name: String,
    pub version: String,
    pub source: PackSource,
    /// Where the flight was; None when the device saving the backup didn't have the pack.
    pub place: Option<FlightPlace>,
    pub flight: Flight,
    pub plan: Option<SavedPlan>,
}

/// A backup file, every part in its current format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Backup {
    /// Always [`BACKUP_KIND`].
    pub kind: String,
    pub format: u32,
    /// The Involo version that saved it.
    pub app_version: String,
    /// When it was saved, in milliseconds since 1970 (UTC).
    #[ts(type = "number")]
    pub saved_at: i64,
    pub flights: Vec<BackupFlight>,
    pub settings: Settings,
    pub log: Log,
}

/// What the host gives to save a backup: everything but the parts Rust stamps.
#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct BackupParts {
    #[ts(type = "number")]
    pub saved_at: i64,
    pub flights: Vec<BackupFlight>,
    pub settings: Settings,
    pub log: Log,
}

/// Why a file can't be restored. Whatever the reason, nothing on the device changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum BackupRefusal {
    /// Saved by a newer version of Involo, named here.
    Newer { version: String },
    /// Not a backup, or damaged.
    NotBackup,
    /// A flight log file, which the Flight log page loads.
    LogFile,
}

/// A file read as a backup: ready to review, every part migrated to its current format, or
/// refused.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "state", rename_all = "camelCase")]
#[ts(export)]
pub enum BackupRead {
    Ready { backup: Box<Backup> },
    Refused { refusal: BackupRefusal },
}

/// The file as it is read, before each part is migrated.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawBackup {
    #[allow(dead_code)]
    kind: String,
    #[allow(dead_code)]
    format: u32,
    app_version: String,
    saved_at: i64,
    flights: Vec<RawFlight>,
    settings: Value,
    log: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawFlight {
    pack: String,
    name: String,
    version: String,
    source: PackSource,
    place: Option<FlightPlace>,
    flight: Value,
    plan: Option<Value>,
}

/// The backup file's text for these parts, saved by `app_version`.
///
/// # Errors
/// [`crate::AppError::InvalidAction`] if a flight's pack doesn't match its entry, or a pack
/// appears twice: a restore of that file would be refused.
pub fn backup_text(parts: BackupParts, app_version: &str) -> Result<String, crate::AppError> {
    let mut packs = BTreeSet::new();
    for entry in &parts.flights {
        if entry.flight.pack != entry.pack || !packs.insert(entry.pack.as_str()) {
            return Err(crate::AppError::InvalidAction(format!(
                "the backup's flight for {} doesn't match its pack",
                entry.pack
            )));
        }
    }
    let backup = Backup {
        kind: BACKUP_KIND.to_owned(),
        format: BACKUP_FORMAT,
        app_version: app_version.to_owned(),
        saved_at: parts.saved_at,
        flights: parts.flights,
        settings: parts.settings,
        log: parts.log,
    };
    let mut text = crate::to_interface_json(&backup)
        .map_err(|e| crate::AppError::InvalidAction(format!("could not write the backup: {e}")))?;
    text.push('\n');
    Ok(text)
}

/// One part read through its own loader: its value, or why the file is refused.
fn part<T>(loaded: Loaded<T>, newer: &BackupRefusal) -> Result<T, BackupRefusal> {
    match loaded {
        Loaded::Ready { value, .. } => Ok(value),
        Loaded::Newer { .. } => Err(newer.clone()),
        Loaded::Unreadable { .. } => Err(BackupRefusal::NotBackup),
    }
}

/// Whether a JSON value has the shape of a flight log file: a format number, flights and practice
/// results, and no backup kind.
fn looks_like_log(object: &serde_json::Map<String, Value>) -> bool {
    object.get("format").is_some_and(Value::is_u64)
        && object.get("flights").is_some_and(Value::is_array)
        && object.get("practice").is_some_and(Value::is_array)
}

/// Reads a file chosen to restore from. A newer backup, or one with a part from a newer version,
/// is refused naming the version that saved it; a flight log file and anything else that isn't
/// an intact backup are refused too. Nothing here changes the device.
pub fn read_backup(text: &str) -> BackupRead {
    match read(text) {
        Ok(backup) => BackupRead::Ready {
            backup: Box::new(backup),
        },
        Err(refusal) => BackupRead::Refused { refusal },
    }
}

fn read(text: &str) -> Result<Backup, BackupRefusal> {
    let value: Value = serde_json::from_str(text).map_err(|_| BackupRefusal::NotBackup)?;
    let object = value.as_object().ok_or(BackupRefusal::NotBackup)?;
    if object.get("kind").and_then(Value::as_str) != Some(BACKUP_KIND) {
        return Err(if looks_like_log(object) {
            BackupRefusal::LogFile
        } else {
            BackupRefusal::NotBackup
        });
    }
    let format = object
        .get("format")
        .and_then(Value::as_u64)
        .ok_or(BackupRefusal::NotBackup)?;
    let version = object
        .get("appVersion")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let newer = BackupRefusal::Newer { version };
    if format > u64::from(BACKUP_FORMAT) {
        return Err(newer);
    }
    if format == 0 {
        return Err(BackupRefusal::NotBackup);
    }
    let raw: RawBackup = serde_json::from_value(value).map_err(|_| BackupRefusal::NotBackup)?;
    let mut packs = BTreeSet::new();
    let mut flights = Vec::with_capacity(raw.flights.len());
    for entry in raw.flights {
        let flight = part(load_flight(&entry.flight.to_string()), &newer)?;
        if flight.pack != entry.pack || !packs.insert(entry.pack.clone()) {
            return Err(BackupRefusal::NotBackup);
        }
        let plan = match entry.plan {
            Some(plan) => Some(part(load_plan(&plan.to_string()), &newer)?),
            None => None,
        };
        flights.push(BackupFlight {
            pack: entry.pack,
            name: entry.name,
            version: entry.version,
            source: entry.source,
            place: entry.place,
            flight,
            plan,
        });
    }
    // A backup's log is never older than format 3 (backups came after it), so it needs no pack
    // glossaries to migrate.
    let log = part(load_log(&raw.log.to_string(), &Glossaries::new()), &newer)?;
    Ok(Backup {
        kind: BACKUP_KIND.to_owned(),
        format: BACKUP_FORMAT,
        app_version: raw.app_version,
        saved_at: raw.saved_at,
        flights,
        settings: part(load_settings(&raw.settings.to_string()), &newer)?,
        log,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::test_support::example_pack;
    use crate::{Action, LOG_FORMAT, PLAN_FORMAT, SETTINGS_FORMAT, apply, new_flight};

    const FROZEN: &str = include_str!("../tests/fixtures/backup-format-1.json");

    /// A backup's parts: the example pack's flight with its first step ticked and a plan, the
    /// settings, and the frozen format 2 log, migrated.
    fn parts() -> BackupParts {
        let pack = example_pack();
        let step = pack.lists[0].steps[0].id.clone();
        let flight = apply(
            &pack,
            new_flight(&pack),
            Action::Tick {
                step,
                at: 1_763_400_000_000,
            },
        )
        .unwrap();
        let plan = SavedPlan {
            format: PLAN_FORMAT,
            plan: involo_simbrief::Plan {
                request_id: Some("101".into()),
                ..Default::default()
            },
            loaded_at: 1_763_390_000_000,
        };
        let Loaded::Ready { value: log, .. } = load_log(
            include_str!("../tests/fixtures/log-format-2.json"),
            &Glossaries::new(),
        ) else {
            panic!("the log fixture did not load");
        };
        BackupParts {
            saved_at: 1_763_460_840_000,
            flights: vec![BackupFlight {
                pack: pack.manifest.id.clone(),
                name: pack.manifest.name.clone(),
                version: pack.manifest.version.to_string(),
                source: PackSource::File,
                place: Some(FlightPlace {
                    place: "Preflight".into(),
                    done: 1,
                    total: 10,
                }),
                flight,
                plan: Some(plan),
            }],
            settings: Settings {
                theme: crate::Theme::Light,
                seat: Some("right".into()),
                last_backup: Some(1_763_000_000_000),
                ..Settings::default()
            },
            log,
        }
    }

    fn ready(text: &str) -> Backup {
        match read_backup(text) {
            BackupRead::Ready { backup } => *backup,
            BackupRead::Refused { refusal } => panic!("refused: {refusal:?}"),
        }
    }

    fn refused(text: &str) -> BackupRefusal {
        match read_backup(text) {
            BackupRead::Refused { refusal } => refusal,
            BackupRead::Ready { .. } => panic!("read as a backup"),
        }
    }

    /// The frozen file as a JSON value, for changing one part of it.
    fn frozen() -> Value {
        serde_json::from_str(FROZEN).unwrap()
    }

    #[test]
    fn a_backup_reads_back_as_it_was_saved() {
        let parts = parts();
        let text = backup_text(parts.clone(), "0.1.0").unwrap();
        let backup = ready(&text);
        assert_eq!(
            (
                backup.kind.as_str(),
                backup.format,
                backup.app_version.as_str()
            ),
            (BACKUP_KIND, BACKUP_FORMAT, "0.1.0")
        );
        assert_eq!(backup.saved_at, parts.saved_at);
        assert_eq!(backup.flights, parts.flights);
        assert_eq!(backup.settings, parts.settings);
        assert_eq!(backup.log, parts.log);
    }

    #[test]
    fn the_first_format_is_frozen() {
        // Frozen: a format 1 backup as the app saves it. Reading it gives the same parts, and
        // saving those again writes the same JSON.
        let backup = ready(FROZEN);
        let parts = parts();
        assert_eq!(backup.flights, parts.flights);
        assert_eq!(backup.settings, parts.settings);
        assert_eq!(backup.log, parts.log);
        let again = BackupParts {
            saved_at: backup.saved_at,
            flights: backup.flights,
            settings: backup.settings,
            log: backup.log,
        };
        let written: Value =
            serde_json::from_str(&backup_text(again, &backup.app_version).unwrap()).unwrap();
        assert_eq!(written, frozen());
    }

    #[test]
    fn older_parts_are_migrated_as_saved_data_is() {
        let mut file = frozen();
        file["settings"] =
            serde_json::from_str(include_str!("../tests/fixtures/settings-format-7.json")).unwrap();
        let mut flight: Value =
            serde_json::from_str(include_str!("../tests/fixtures/flight-format-4.json")).unwrap();
        let pack = flight["pack"].as_str().unwrap().to_owned();
        file["flights"][0]["pack"] = json!(pack);
        file["flights"][0]["flight"] = flight.take();
        let backup = ready(&file.to_string());
        assert_eq!(backup.settings.format, SETTINGS_FORMAT);
        assert_eq!(backup.settings.seat.as_deref(), Some("right"));
        assert_eq!(backup.flights[0].flight.format, crate::FLIGHT_FORMAT);
        assert_eq!(backup.log.format, LOG_FORMAT);
    }

    #[test]
    fn a_newer_backup_is_refused_naming_its_version() {
        let mut file = frozen();
        file["format"] = json!(BACKUP_FORMAT + 1);
        file["appVersion"] = json!("0.3.0");
        // Whatever else a newer format holds.
        file["somethingNew"] = json!(true);
        assert_eq!(
            refused(&file.to_string()),
            BackupRefusal::Newer {
                version: "0.3.0".into()
            }
        );
    }

    #[test]
    fn a_part_from_a_newer_version_refuses_the_whole_backup() {
        for part in ["settings", "log", "flight", "plan"] {
            let mut file = frozen();
            file["appVersion"] = json!("0.2.0");
            let target = match part {
                "flight" | "plan" => &mut file["flights"][0][part],
                _ => &mut file[part],
            };
            target["format"] = json!(99);
            assert_eq!(
                refused(&file.to_string()),
                BackupRefusal::Newer {
                    version: "0.2.0".into()
                },
                "{part}"
            );
        }
    }

    #[test]
    fn a_flight_log_file_is_refused_as_one() {
        assert_eq!(
            refused(include_str!("../tests/fixtures/log-format-2.json")),
            BackupRefusal::LogFile
        );
        let log = serde_json::to_string(&crate::new_log()).unwrap();
        assert_eq!(refused(&log), BackupRefusal::LogFile);
    }

    #[test]
    fn anything_else_is_not_a_backup() {
        let mut no_kind = frozen();
        no_kind.as_object_mut().unwrap().remove("kind");
        let mut damaged_flight = frozen();
        damaged_flight["flights"][0]["flight"] = json!({"format": 5, "pack": 3});
        let mut wrong_pack = frozen();
        wrong_pack["flights"][0]["pack"] = json!("another-pack");
        let mut twice = frozen();
        let entry = twice["flights"][0].clone();
        twice["flights"].as_array_mut().unwrap().push(entry);
        let mut format_zero = frozen();
        format_zero["format"] = json!(0);
        let mut unknown = frozen();
        unknown["extra"] = json!(1);
        let mut settings = frozen();
        settings["settings"] = json!("dark");
        for (what, text) in [
            ("empty", String::new()),
            ("not JSON", "{ not json".into()),
            ("a list", "[]".into()),
            (
                "a settings file",
                include_str!("../tests/fixtures/settings-format-7.json").into(),
            ),
            ("no kind", no_kind.to_string()),
            ("a damaged flight", damaged_flight.to_string()),
            ("a flight under another pack", wrong_pack.to_string()),
            ("a pack twice", twice.to_string()),
            ("format 0", format_zero.to_string()),
            ("an unknown field", unknown.to_string()),
            ("unreadable settings", settings.to_string()),
            ("cut short", FROZEN[..FROZEN.len() / 2].into()),
        ] {
            assert_eq!(refused(&text), BackupRefusal::NotBackup, "{what}");
        }
    }

    #[test]
    fn saving_refuses_a_flight_filed_under_another_pack() {
        let mut parts = parts();
        parts.flights[0].pack = "another-pack".into();
        assert!(backup_text(parts, "0.1.0").is_err());
        let mut parts = self::parts();
        let entry = parts.flights[0].clone();
        parts.flights.push(entry);
        assert!(backup_text(parts, "0.1.0").is_err());
    }
}
