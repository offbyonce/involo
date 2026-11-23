// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Commands the interface may call. Each one is named in `command_names.rs` (so `build.rs` makes
//! its permission), granted in `capabilities/main.json` and registered in `lib.rs`; anything else
//! is refused. Each wraps one `involo-app-core` function, as the web app's WebAssembly module does
//! (`crates/involo-web-host`), and answers with the same JSON: field names in camelCase
//! ([`ForInterface`]), and an [`AppError`] as the rejection.
//!
//! Commands are `async`, so they run off the window's thread.

use std::collections::BTreeMap;
use std::sync::{Mutex, PoisonError};

use involo_app_core::{
    Action, AppError, AppInfo, BackupParts, BackupRead, CduWalk, Decoded, Flight, ForInterface,
    Loaded, Log, LogChange, LogEdit, LoggedFlight, OpenStep, OtherAircraft, PackChanges, PackCheck,
    PhaseModel, PlanSource, PlanValues, PracticeResult, Rail, SavedPlan, Settings, StepTimer,
    Suggestion,
};
use involo_checklist_core::{FieldId, ViewFrame};
use involo_pack::FlatPack;
use involo_simbrief::Plan;
use serde::Deserialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// What a command answers: the value as the interface reads it, or the error it rejects with.
type Answer<T> = Result<ForInterface<T>, AppError>;

#[allow(clippy::unnecessary_wraps)]
fn ok<T>(value: T) -> Answer<T> {
    Ok(ForInterface(value))
}

/// Packs loaded so far, by id, so a pack crosses the bridge once (decision 0012).
#[derive(Debug, Default)]
pub struct Packs(Mutex<BTreeMap<String, FlatPack>>);

impl Packs {
    fn with<T>(&self, id: &str, f: impl FnOnce(&FlatPack) -> Result<T, AppError>) -> Answer<T> {
        let packs = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        match packs.get(id) {
            Some(pack) => f(pack).map(ForInterface),
            None => Err(AppError::PackInvalid(format!("pack {id} is not loaded"))),
        }
    }
}

/// Basic facts for the About box and the window title.
#[tauri::command]
pub async fn app_info() -> Answer<AppInfo> {
    ok(involo_app_core::app_info())
}

/// Reads a flattened pack, as written by `involo-pack build`, and keeps it for the calls below.
#[tauri::command]
pub async fn parse_pack(packs: State<'_, Packs>, json: String) -> Answer<FlatPack> {
    let pack = involo_app_core::load_pack(&json)?;
    packs
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(pack.manifest.id.clone(), pack.clone());
    ok(pack)
}

/// Checks a pack file before it is installed (decision 0028). The file's bytes are the request's
/// body, so they cross the bridge as they are; the `sha256` header is the catalog's hash for a
/// download, missing or empty for a file the pilot chose. Nothing is kept.
#[tauri::command]
pub async fn check_pack(request: Request<'_>) -> Answer<PackCheck> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::InvalidAction(
            "a pack file must be sent as bytes".into(),
        ));
    };
    let sha256 = request
        .headers()
        .get("sha256")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty());
    ok(involo_app_core::check_pack(bytes, sha256))
}

/// The largest pack file the app reads, in bytes: a larger file is refused before it is read.
#[tauri::command]
pub async fn pack_file_limit() -> Answer<u64> {
    ok(involo_app_core::MAX_PACK_FILE_BYTES)
}

/// What changed between two versions of a pack, from their files (decision 0028).
#[tauri::command]
pub async fn compare_packs(old: String, new: String) -> Answer<PackChanges> {
    let old = involo_app_core::load_pack(&old)?;
    let new = involo_app_core::load_pack(&new)?;
    ok(involo_app_core::pack_changes(&old, &new))
}

/// A saved flight brought in line with the loaded pack's version, through its aliases.
#[tauri::command]
pub async fn reconcile_flight(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
) -> Answer<Flight> {
    packs.with(&pack, |p| Ok(involo_app_core::reconcile(p, &flight)))
}

/// A flight from a backup, reconciled as loading does, with a note when it came from another
/// version of the pack (#47).
#[tauri::command]
pub async fn restore_flight(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
) -> Answer<Flight> {
    packs.with(&pack, |p| Ok(involo_app_core::restore_flight(p, &flight)))
}

/// A new flight for a loaded pack.
#[tauri::command]
pub async fn new_flight(packs: State<'_, Packs>, pack: String) -> Answer<Flight> {
    packs.with(&pack, |p| Ok(involo_app_core::new_flight(p)))
}

/// Applies an action to a flight and returns the changed flight.
#[tauri::command]
pub async fn apply(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    action: Action,
) -> Answer<Flight> {
    packs.with(&pack, |p| involo_app_core::apply(p, flight, action))
}

/// The phase rail for a flight, for the pilot's settings (Full or Essentials).
#[tauri::command]
pub async fn rail(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    settings: Settings,
) -> Answer<Rail> {
    packs.with(&pack, |p| Ok(involo_app_core::rail(p, &flight, &settings)))
}

/// The flight's open steps; with a phase id, only those from phases before it.
#[tauri::command]
pub async fn open_steps(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    settings: Settings,
    before: Option<String>,
) -> Answer<Vec<OpenStep>> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::open_steps(
            p,
            &flight,
            &settings,
            before.as_deref(),
        ))
    })
}

/// The answer an option's rule suggests for this flight, or null (decision 0027).
#[tauri::command]
pub async fn suggestion(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    option: String,
) -> Answer<Option<Suggestion>> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::suggestion(p, &flight, &option))
    })
}

/// The pack's calculated fields' values for this flight, by field id (decision 0033).
#[tauri::command]
pub async fn calculated(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
) -> Answer<BTreeMap<FieldId, String>> {
    packs.with(&pack, |p| Ok(involo_app_core::calculated(p, &flight)))
}

/// Every step timer in the pack, with when it started, and the time it had left if paused (#213).
#[tauri::command]
pub async fn timers(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
) -> Answer<Vec<StepTimer>> {
    packs.with(&pack, |p| Ok(involo_app_core::timers(p, &flight)))
}

/// A CDU walkthrough with the flight's values filled in (#215), or null when the pack has none by
/// that id.
#[tauri::command]
pub async fn cdu_walkthrough(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    id: String,
) -> Answer<Option<CduWalk>> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::cdu_walkthrough(p, &flight, &id))
    })
}

/// One phase of a flight as the interface shows it: lists, step states, progress, neighbors.
#[tauri::command]
pub async fn phase_model(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    settings: Settings,
    phase: String,
) -> Answer<PhaseModel> {
    packs.with(&pack, |p| {
        involo_app_core::phase_model(p, &flight, &settings, &phase)
    })
}

/// The seat frame "Where is this?" draws for a step done by `role`, with the chosen seat.
#[tauri::command]
pub async fn seat_frame(
    packs: State<'_, Packs>,
    pack: String,
    role: Option<String>,
    chosen: Option<String>,
) -> Answer<Option<ViewFrame>> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::seat_frame(
            p,
            role.as_deref(),
            chosen.as_deref(),
        ))
    })
}

/// Reads a saved flight's text: ready (migrated if older), newer, or unreadable.
#[tauri::command]
pub async fn parse_flight(json: String) -> Answer<Loaded<Flight>> {
    ok(involo_app_core::load_flight(&json))
}

/// Reads saved settings' text: ready (migrated if older), newer, or unreadable.
#[tauri::command]
pub async fn parse_settings(json: String) -> Answer<Loaded<Settings>> {
    ok(involo_app_core::load_settings(&json))
}

/// Settings for a first launch.
#[tauri::command]
pub async fn default_settings() -> Answer<Settings> {
    ok(Settings::default())
}

/// The address of the latest SimBrief plan for a username or Pilot ID.
#[tauri::command]
pub async fn plan_url(user: String) -> Answer<String> {
    involo_app_core::plan_url(&user).map(ForInterface)
}

/// Reads a SimBrief plan: fetched JSON, or a saved JSON or XML file.
#[tauri::command]
pub async fn parse_plan(text: String) -> Answer<Plan> {
    involo_app_core::parse_plan(&text).map(ForInterface)
}

/// The flight values a plan fills in for a loaded pack's fields (decisions 0019 and 0029).
#[tauri::command]
pub async fn plan_values(packs: State<'_, Packs>, pack: String, plan: Plan) -> Answer<PlanValues> {
    packs.with(&pack, |p| involo_app_core::plan_values(p, &plan))
}

/// Whether a plan is for an aircraft type the loaded pack doesn't cover, or null (decision 0028).
#[tauri::command]
pub async fn other_aircraft(
    packs: State<'_, Packs>,
    pack: String,
    plan: Plan,
) -> Answer<Option<OtherAircraft>> {
    packs.with(&pack, |p| Ok(involo_app_core::other_aircraft(p, &plan)))
}

/// Reads the saved SimBrief plan's text: ready (migrated if older), newer or unreadable.
#[tauri::command]
pub async fn parse_saved_plan(json: String) -> Answer<Loaded<SavedPlan>> {
    ok(involo_app_core::load_plan(&json))
}

/// The saved plan's format number, for a plan the host keeps.
#[tauri::command]
pub async fn plan_format() -> Answer<u32> {
    ok(involo_app_core::PLAN_FORMAT)
}

/// An empty flight log (decision 0026).
#[tauri::command]
pub async fn new_log() -> Answer<Log> {
    ok(involo_app_core::new_log())
}

/// The installed packs whose text reading this log text needs: any only for a format 1 log.
#[tauri::command]
pub async fn log_packs(json: String) -> Answer<Vec<String>> {
    ok(involo_app_core::log_packs(&json))
}

/// Reads the saved flight log's text: ready (migrated if older), newer or unreadable. `packs` are
/// the texts of the installed packs `log_packs` named.
#[tauri::command]
pub async fn parse_log(json: String, packs: Vec<String>) -> Answer<Loaded<Log>> {
    ok(involo_app_core::load_log(
        &json,
        &involo_app_core::pack_glossaries(&packs),
    ))
}

/// The flight as a log entry, logged at `at` (milliseconds).
#[tauri::command]
pub async fn log_entry(
    packs: State<'_, Packs>,
    pack: String,
    flight: Flight,
    settings: Settings,
    plan: PlanSource,
    at: u64,
) -> Answer<LoggedFlight> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::log_entry(p, &flight, &settings, plan, at))
    })
}

/// A finished practice test, as the interface sends it.
#[derive(Debug, Deserialize)]
pub struct Finished {
    title: String,
    score: usize,
    total: usize,
    at: u64,
}

/// A finished practice test as a log entry, with the pack it was taken in.
#[tauri::command]
pub async fn practice_result(
    packs: State<'_, Packs>,
    pack: String,
    result: Finished,
) -> Answer<PracticeResult> {
    packs.with(&pack, |p| {
        Ok(involo_app_core::practice_result(
            p,
            &result.title,
            result.score,
            result.total,
            result.at,
        ))
    })
}

/// Applies an edit to the log: add, delete, or merge a log file. `packs` are the texts of the
/// installed packs `log_packs` named for a merged file.
#[tauri::command]
pub async fn edit_log(log: Log, edit: LogEdit, packs: Vec<String>) -> Answer<LogChange> {
    involo_app_core::edit_log(log, edit, &involo_app_core::pack_glossaries(&packs))
        .map(ForInterface)
}

/// The log's flights as CSV, one row per flight.
#[tauri::command]
pub async fn log_csv(log: Log) -> Answer<String> {
    ok(involo_app_core::log_csv(&log))
}

/// A backup file's text (#47) for these parts, stamped with this app's version.
#[tauri::command]
pub async fn backup_text(parts: BackupParts) -> Answer<String> {
    involo_app_core::backup_text(parts, &involo_app_core::app_info().version).map(ForInterface)
}

/// Reads a file chosen to restore from: the backup, every part migrated, or why it is refused. A
/// file exported by the earlier checklist (3.0) is read for the loaded pack whose aliases know it.
#[tauri::command]
pub async fn read_backup(packs: State<'_, Packs>, text: String) -> Answer<BackupRead> {
    let packs = packs.0.lock().unwrap_or_else(PoisonError::into_inner);
    let loaded: Vec<&FlatPack> = packs.values().collect();
    ok(involo_app_core::read_backup(&text, &loaded))
}

/// A METAR decoded from the code table.
#[tauri::command]
pub async fn decode_metar(text: String) -> Answer<Decoded> {
    ok(involo_app_core::decode_metar(&text))
}

/// A TAF decoded from the code table.
#[tauri::command]
pub async fn decode_taf(text: String) -> Answer<Decoded> {
    ok(involo_app_core::decode_taf(&text))
}

/// The address a link may open in the default browser: https only, so a page can never start a
/// program or open a file through it.
fn web_address(url: &str) -> Result<tauri::Url, String> {
    match tauri::Url::parse(url) {
        Ok(u) if u.scheme() == "https" => Ok(u),
        _ => Err(format!("Only https links open in the browser, not {url}.")),
    }
}

/// Opens a link in the default browser: the links the web app opens in a new tab.
#[tauri::command]
pub async fn open_link<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    let url = web_address(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("The link couldn't be opened: {e}"))
}

/// The save dialog's filter for a file name: its kind, by extension.
fn filter(name: &str) -> Option<(&'static str, &str)> {
    let ext = name.rsplit_once('.')?.1;
    let kind = match ext {
        "json" => "JSON file",
        "csv" => "CSV file",
        "html" => "Web page",
        _ => return None,
    };
    Some((kind, ext))
}

/// Saves a file the app made (a backup, a log export, a copy of kept data): the save dialog asks
/// where, starting with `name`, and the text is written there. False when the pilot cancelled.
/// The interface never names a path itself.
#[tauri::command]
pub async fn save_file<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    text: String,
) -> Result<bool, String> {
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some((kind, ext)) = filter(&name) {
        dialog = dialog.add_filter(kind, &[ext]);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = chosen
        .into_path()
        .map_err(|e| format!("That place can't be saved to: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("The file couldn't be saved: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_links_open() {
        assert!(web_address("https://github.com/offbyonce/involo/releases").is_ok());
        for url in [
            "http://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "tauri://localhost/index.html",
            "smb://server/share",
            "not a link",
        ] {
            assert!(web_address(url).is_err(), "{url} must not open");
        }
    }

    #[test]
    fn the_save_dialog_filters_by_the_files_kind() {
        assert_eq!(
            filter("involo-backup-2026-11-23.json"),
            Some(("JSON file", "json"))
        );
        assert_eq!(filter("involo-log-1.csv"), Some(("CSV file", "csv")));
        assert_eq!(filter("involo-log-1.html"), Some(("Web page", "html")));
        assert_eq!(filter("notes.txt"), None);
        assert_eq!(filter("no-extension"), None);
    }

    #[test]
    fn a_pack_must_be_loaded_first() {
        let packs = Packs::default();
        let got = packs.with("nope", |_| Ok(()));
        assert!(matches!(got, Err(AppError::PackInvalid(m)) if m == "pack nope is not loaded"));
    }
}
