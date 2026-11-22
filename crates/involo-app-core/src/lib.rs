// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! App operations that do not depend on where the app runs (decision 0010). The web host
//! (WebAssembly) and a later desktop shell call these and add no logic of their own.

mod actions;
mod app;
mod backup;
mod boundary;
mod cdu;
mod error;
mod flight;
mod log;
mod names;
mod open_steps;
mod packs;
mod phase_model;
mod plans;
mod rail;
mod saved;
mod seat;
mod settings;
mod suggest;
mod targets;
#[cfg(test)]
mod test_support;
mod timers;
mod update;
mod values;
mod visibility;
mod weather;

pub use actions::{Action, apply};
pub use app::{AppInfo, app_info, example_checklist};
pub use backup::{
    BACKUP_FORMAT, BACKUP_KIND, Backup, BackupFlight, BackupParts, BackupRead, BackupRefusal,
    FlightPlace, PackSource, backup_text, read_backup,
};
pub use boundary::to_interface_json;
pub use cdu::{CduPageView, CduRowView, CduScreenView, CduSpan, CduWalk, cdu_walkthrough};
pub use error::AppError;
pub use flight::{AnswerSource, BriefingMark, FLIGHT_FORMAT, Flight, new_flight};
pub use log::{
    LOG_FORMAT, LOG_LIMIT, Log, LogChange, LogEdit, LoggedFlight, LoggedStep, LoggedTick,
    PlanSource, PracticeResult, StageTime, edit_log, load_log, log_csv, log_entry, log_packs,
    new_log, practice_result,
};
pub use names::{Glossaries, pack_glossaries, pack_names};
pub use open_steps::{OpenStep, open_steps};
pub use packs::{MAX_PACK_FILE_BYTES, PackCheck, check_pack, load_pack, parse_catalog};
pub use phase_model::{PhaseLink, PhaseList, PhaseModel, StepRow, phase_model};
pub use plans::{
    OtherAircraft, PLAN_FORMAT, PlanValues, SavedPlan, other_aircraft, parse_plan, plan_url,
    plan_values,
};
pub use rail::{Rail, RailPhase, RailStage, rail};
pub use saved::{Loaded, load_flight, load_plan, load_settings};
pub use seat::seat_frame;
pub use settings::{
    Detail, EssentialsChanges, MAX_DIMMING, SETTINGS_FORMAT, Settings, StepLayout, TextSize, Theme,
};
pub use suggest::{Suggestion, suggestion};
pub use targets::{ItemTarget, step_targets};
pub use timers::{StepTimer, timers};
pub use update::{
    ChangedStep, PackChanges, RewordedStep, Rewording, UpdateNote, pack_changes, reconcile,
    restore_flight,
};
pub use visibility::{
    Shown, has_essentials, in_essentials, passes, shown_steps, step_shows, visible_steps,
};
pub use weather::{Altimeter, Decoded, DecodedRow, Element, altimeter, decode_metar, decode_taf};
