// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The web host: thin WebAssembly glue between the web interface and `involo-app-core`, as the Tauri
//! shell is for desktop (decision 0010). Each export calls one `involo-app-core` function and holds no
//! logic of its own.
//!
//! Values cross the boundary as JSON strings, checked against the ts-rs types on the other side.
//! Every export answers with a [`Reply`], so errors arrive as a typed [`AppError`], not a thrown
//! string.

use std::cell::RefCell;
use std::collections::BTreeMap;

use involo_app_core::{Action, AppError, Flight, Settings};
use involo_pack::FlatPack;
use serde::Serialize;
use serde::de::DeserializeOwned;
use ts_rs::TS;
use wasm_bindgen::prelude::wasm_bindgen;

thread_local! {
    /// Packs loaded so far, by id. Kept here so a pack crosses the boundary once (decision 0012).
    static PACKS: RefCell<BTreeMap<String, FlatPack>> = const { RefCell::new(BTreeMap::new()) };
}

fn with_pack<T>(id: &str, f: impl FnOnce(&FlatPack) -> Result<T, AppError>) -> Result<T, AppError> {
    PACKS.with_borrow(|packs| match packs.get(id) {
        Some(pack) => f(pack),
        None => Err(AppError::PackInvalid(format!("pack {id} is not loaded"))),
    })
}

/// Reads JSON the interface sent; a failure is a bug on that side, so it is an invalid action.
fn read<T: DeserializeOwned>(what: &str, json: &str) -> Result<T, AppError> {
    serde_json::from_str(json)
        .map_err(|e| AppError::InvalidAction(format!("could not read the {what}: {e}")))
}

/// What every export answers: `{ "ok": value }` or `{ "error": AppError }`.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Reply<T> {
    Ok(T),
    Error(AppError),
}

/// Sent if an answer cannot be encoded, which only a bug could cause.
const UNENCODABLE: &str =
    r#"{"error":{"kind":"PackInvalid","message":"the answer could not be encoded"}}"#;

fn reply<T: Serialize>(result: Result<T, AppError>) -> String {
    let reply = match result {
        Ok(value) => Reply::Ok(value),
        Err(error) => Reply::Error(error),
    };
    // Field names in camelCase: the interface reads one case (decision 0029, Names).
    involo_app_core::to_interface_json(&reply).unwrap_or_else(|_| UNENCODABLE.to_owned())
}

/// Basic facts for the About box and the window title.
#[wasm_bindgen]
pub fn app_info() -> String {
    reply(Ok(involo_app_core::app_info()))
}

/// The bundled format-demo checklist.
#[wasm_bindgen]
pub fn example_checklist() -> String {
    reply(involo_app_core::example_checklist())
}

/// Parse a flattened pack, as written by `involo-pack build`, and keep it for the calls below.
#[wasm_bindgen]
pub fn parse_pack(json: &str) -> String {
    reply(involo_app_core::load_pack(json).inspect(|pack| {
        PACKS.with_borrow_mut(|packs| packs.insert(pack.manifest.id.clone(), pack.clone()));
    }))
}

/// Check a pack file before it is installed (decision 0028): `sha256` is the catalog's hash for a
/// download, or empty for a file the pilot chose. Answers the pack's summary or every reason it is
/// refused; nothing is kept.
#[wasm_bindgen]
pub fn check_pack(bytes: &[u8], sha256: &str) -> String {
    let sha256 = Some(sha256).filter(|s| !s.is_empty());
    reply(Ok::<_, AppError>(involo_app_core::check_pack(
        bytes, sha256,
    )))
}

/// The largest pack file the app reads, in bytes: a larger file is refused before it is read.
#[wasm_bindgen]
pub fn pack_file_limit() -> f64 {
    // Exact: the limit is far below 2^53.
    #[allow(clippy::cast_precision_loss)]
    let limit = involo_app_core::MAX_PACK_FILE_BYTES as f64;
    limit
}

/// What changed between two versions of a pack, from their files: the installed one and an update
/// (decision 0028).
#[wasm_bindgen]
pub fn compare_packs(old: &str, new: &str) -> String {
    reply(involo_app_core::load_pack(old).and_then(|o| {
        involo_app_core::load_pack(new).map(|n| involo_app_core::pack_changes(&o, &n))
    }))
}

/// A saved flight brought in line with the loaded pack's version, through its aliases.
#[wasm_bindgen]
pub fn reconcile_flight(pack: &str, flight: &str) -> String {
    reply(
        read::<Flight>("flight", flight)
            .and_then(|f| with_pack(pack, |p| Ok(involo_app_core::reconcile(p, &f)))),
    )
}

/// Read the pack catalog, `packs/index.json`.
#[wasm_bindgen]
pub fn parse_catalog(json: &str) -> String {
    reply(involo_app_core::parse_catalog(json))
}

/// A new flight for a loaded pack.
#[wasm_bindgen]
pub fn new_flight(pack: &str) -> String {
    reply(with_pack(pack, |p| Ok(involo_app_core::new_flight(p))))
}

/// Apply an action to a flight and return the changed flight.
#[wasm_bindgen]
pub fn apply(pack: &str, flight: &str, action: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        let action: Action = read("action", action)?;
        with_pack(pack, |p| involo_app_core::apply(p, flight, action))
    })())
}

/// The phase rail for a flight, for the pilot's settings (Full or Essentials).
#[wasm_bindgen]
pub fn rail(pack: &str, flight: &str, settings: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        let settings: Settings = read("settings", settings)?;
        with_pack(pack, |p| Ok(involo_app_core::rail(p, &flight, &settings)))
    })())
}

/// The flight's open steps; with a phase id, only those from phases before it ("" for all).
#[wasm_bindgen]
pub fn open_steps(pack: &str, flight: &str, settings: &str, before: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        let settings: Settings = read("settings", settings)?;
        let before = (!before.is_empty()).then_some(before);
        with_pack(pack, |p| {
            Ok(involo_app_core::open_steps(p, &flight, &settings, before))
        })
    })())
}

/// The answer an option's rule suggests for this flight, or null (decision 0027).
#[wasm_bindgen]
pub fn suggestion(pack: &str, flight: &str, option: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        with_pack(pack, |p| {
            Ok(involo_app_core::suggestion(p, &flight, option))
        })
    })())
}

/// One phase of a flight as the interface shows it: lists, step states, progress, neighbors.
#[wasm_bindgen]
pub fn phase_model(pack: &str, flight: &str, settings: &str, phase: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        let settings: Settings = read("settings", settings)?;
        with_pack(pack, |p| {
            involo_app_core::phase_model(p, &flight, &settings, phase)
        })
    })())
}

/// Parse a saved flight's text: ready (migrated if older), newer, or unreadable.
#[wasm_bindgen]
pub fn parse_flight(json: &str) -> String {
    reply(Ok(involo_app_core::load_flight(json)))
}

/// Parse saved settings' text: ready (migrated if older), newer, or unreadable.
#[wasm_bindgen]
pub fn parse_settings(json: &str) -> String {
    reply(Ok(involo_app_core::load_settings(json)))
}

/// Settings for a first visit.
#[wasm_bindgen]
pub fn default_settings() -> String {
    reply(Ok(Settings::default()))
}

/// The address of the latest SimBrief plan for a username or Pilot ID.
#[wasm_bindgen]
pub fn plan_url(user: &str) -> String {
    reply(involo_app_core::plan_url(user))
}

/// Parse a SimBrief plan: fetched JSON, or a saved JSON or XML file.
#[wasm_bindgen]
pub fn parse_plan(text: &str) -> String {
    reply(involo_app_core::parse_plan(text))
}

/// The flight values a plan fills in for a loaded pack's fields (decisions 0019 and 0029).
#[wasm_bindgen]
pub fn plan_values(pack: &str, plan: &str) -> String {
    reply((|| {
        let plan = read("plan", plan)?;
        with_pack(pack, |p| involo_app_core::plan_values(p, &plan))
    })())
}

/// Parse the saved SimBrief plan's text: ready (migrated if older), newer or unreadable.
#[wasm_bindgen]
pub fn parse_saved_plan(json: &str) -> String {
    reply(Ok::<_, AppError>(involo_app_core::load_plan(json)))
}

/// The saved plan's format number, for a plan the host keeps.
#[wasm_bindgen]
pub fn plan_format() -> u32 {
    involo_app_core::PLAN_FORMAT
}

/// An empty flight log (decision 0026).
#[wasm_bindgen]
pub fn new_log() -> String {
    reply(Ok::<_, AppError>(involo_app_core::new_log()))
}

/// Parse the saved flight log's text: ready (migrated if older), newer or unreadable.
#[wasm_bindgen]
pub fn parse_log(json: &str) -> String {
    reply(Ok::<_, AppError>(involo_app_core::load_log(json)))
}

/// The flight as a log entry: `plan` is the JSON "simbrief" or "manual", `at` when it was logged
/// (milliseconds, as JSON).
#[wasm_bindgen]
pub fn log_entry(pack: &str, flight: &str, settings: &str, plan: &str, at: &str) -> String {
    reply((|| {
        let flight: Flight = read("flight", flight)?;
        let settings: Settings = read("settings", settings)?;
        let plan: involo_app_core::PlanSource = read("plan source", plan)?;
        let at: u64 = read("time", at)?;
        with_pack(pack, |p| {
            Ok(involo_app_core::log_entry(p, &flight, &settings, plan, at))
        })
    })())
}

/// Applies an edit to the log: add, delete, or merge a log file.
#[wasm_bindgen]
pub fn edit_log(log: &str, edit: &str) -> String {
    reply((|| {
        involo_app_core::edit_log(read("log", log)?, read("log edit", edit)?)
    })())
}

/// The log's flights as CSV, one row per flight.
#[wasm_bindgen]
pub fn log_csv(log: &str) -> String {
    reply((|| Ok(involo_app_core::log_csv(&read("log", log)?)))())
}

/// A METAR decoded from the code table.
#[wasm_bindgen]
pub fn decode_metar(text: &str) -> String {
    reply(Ok::<_, involo_app_core::AppError>(
        involo_app_core::decode_metar(text),
    ))
}

/// A TAF decoded from the code table.
#[wasm_bindgen]
pub fn decode_taf(text: &str) -> String {
    reply(Ok::<_, involo_app_core::AppError>(
        involo_app_core::decode_taf(text),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(text: &str) -> serde_json::Value {
        serde_json::from_str(text).unwrap()
    }

    fn new_log_text() -> String {
        json(&new_log())["ok"].to_string()
    }

    #[test]
    fn answers_are_ok_or_a_tagged_error() {
        assert_eq!(json(&app_info())["ok"]["name"], "Involo");
        assert_eq!(json(&example_checklist())["ok"]["id"], "before-start");
        assert_eq!(
            json(&plan_url(" ")),
            json(
                r#"{"error":{"kind":"FlightPlan","message":"enter a SimBrief username or Pilot ID"}}"#
            )
        );
        assert_eq!(json(&parse_pack("{}"))["error"]["kind"], "PackInvalid");
        assert_eq!(json(&new_flight("nope"))["error"]["kind"], "PackInvalid");
        assert_eq!(
            json(&apply("x", "{}", "{}"))["error"]["kind"],
            "InvalidAction"
        );
        assert_eq!(json(&default_settings())["ok"]["theme"], "system");
        assert_eq!(
            json(&new_log())["ok"]["format"],
            involo_app_core::LOG_FORMAT
        );
        assert_eq!(json(&parse_log(r#"{"format":99}"#))["ok"]["state"], "newer");
        assert_eq!(
            json(&edit_log(
                &new_log_text(),
                r#"{"type":"merge","text":"nope"}"#
            ))["error"]["kind"],
            "LogFile"
        );
        assert!(
            json(&log_csv(&new_log_text()))["ok"]
                .as_str()
                .unwrap()
                .starts_with("Date")
        );
        assert_eq!(
            json(&parse_settings(r#"{"format":99}"#))["ok"]["state"],
            "newer"
        );
        assert_eq!(
            json(&parse_plan(
                "<OFP><origin><icao_code>EGLL</icao_code></origin></OFP>"
            ))["ok"]["origin"]["icao"],
            "EGLL"
        );
    }

    #[test]
    fn a_pack_file_is_checked_against_the_catalog_s_hash() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let text =
            serde_json::to_string(&FlatPack::built(involo_pack::load_pack_dir(&dir).unwrap()))
                .unwrap();
        let ready = json(&check_pack(text.as_bytes(), ""));
        assert_eq!(ready["ok"]["state"], "ready");
        assert_eq!(ready["ok"]["summary"]["id"], "example-trainer");
        let hash = involo_pack::sha256_hex(text.as_bytes());
        assert_eq!(
            json(&check_pack(text.as_bytes(), &hash))["ok"]["state"],
            "ready"
        );
        let other = json(&check_pack(b"{}", &hash));
        assert_eq!(other["ok"]["state"], "refused");
        assert!(
            other["ok"]["reasons"][0]
                .as_str()
                .unwrap()
                .contains("SHA-256")
        );
        assert_eq!(pack_file_limit(), 16.0 * 1024.0 * 1024.0);
        assert!(json(&parse_catalog("[]"))["ok"].is_array());
        assert_eq!(json(&parse_catalog("{}"))["error"]["kind"], "PackInvalid");
    }

    #[test]
    fn two_versions_of_a_pack_compare_and_a_flight_is_brought_in_line() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let old = FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap());
        let mut new = old.clone();
        new.manifest.version = semver::Version::new(0, 2, 0);
        new.lists[0].steps.remove(1);
        let (old_json, new_json) = (
            serde_json::to_string(&old).unwrap(),
            serde_json::to_string(&new).unwrap(),
        );
        let changes = json(&compare_packs(&old_json, &new_json))["ok"].clone();
        assert_eq!(changes["toVersion"], "0.2.0");
        assert_eq!(
            changes["removed"][0]["step"],
            "example-trainer.before-start.beacon"
        );
        // A flight saved with 0.1.0, loaded with 0.2.0: brought in line, the version recorded.
        json(&parse_pack(&new_json));
        let flight = json(&new_flight("example-trainer"))["ok"].clone();
        let mut old_flight = flight.clone();
        old_flight["packVersion"] = "0.1.0".into();
        let brought = json(&reconcile_flight(
            "example-trainer",
            &old_flight.to_string(),
        ))["ok"]
            .clone();
        assert_eq!(brought["packVersion"], "0.2.0");
        assert_eq!(
            json(&compare_packs("{}", &new_json))["error"]["kind"],
            "PackInvalid"
        );
    }

    #[test]
    fn a_loaded_pack_gives_flights_actions_and_a_rail() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/example-trainer");
        let pack = FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap());
        assert!(json(&parse_pack(&serde_json::to_string(&pack).unwrap()))["ok"].is_object());
        assert_eq!(
            json(&plan_values(
                "example-trainer",
                r#"{"origin":{"icao":"EGLL"}}"#
            ))["error"]["kind"],
            "FlightPlan",
            "a plan with no destination fills nothing"
        );
        let flight = json(&new_flight("example-trainer"))["ok"].to_string();
        let action = r#"{"type":"tick","step":"example-trainer.before-start.battery","at":7}"#;
        let ticked = json(&apply("example-trainer", &flight, action))["ok"].clone();
        assert_eq!(
            ticked["session"]["done"]["example-trainer.before-start.battery"],
            7
        );
        let settings = default_settings();
        let settings = json(&settings)["ok"].to_string();
        assert!(
            json(&rail("example-trainer", &ticked.to_string(), &settings))["ok"]["stages"]
                .is_array()
        );
        assert!(
            json(&open_steps(
                "example-trainer",
                &ticked.to_string(),
                &settings,
                ""
            ))["ok"]
                .is_array()
        );
        // No suggestion rule in the example pack: null, not an error.
        assert!(json(&suggestion("example-trainer", &ticked.to_string(), "power"))["ok"].is_null());
        assert!(json(&suggestion("example-trainer", "{", "power"))["error"].is_object());
        let view = json(&phase_model(
            "example-trainer",
            &ticked.to_string(),
            &settings,
            "before-start",
        ))["ok"]
            .clone();
        assert_eq!(view["lists"][0]["steps"][0]["state"], "done");
        assert_eq!(
            json(&phase_model("example-trainer", &flight, &settings, "nope"))["error"]["kind"],
            "InvalidAction"
        );
    }
}
