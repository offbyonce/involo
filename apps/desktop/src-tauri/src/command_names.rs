// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Every command the interface may call, once: `build.rs` makes a permission for each, the tests
// check that `capabilities/main.json` grants each one and that `lib.rs` registers each one, and the
// desktop host's tests check that it calls no other. Read with `include!`, so build.rs can use it.

/// The commands, by name, in the order `commands.rs` defines them.
pub const COMMANDS: &[&str] = &[
    "app_info",
    "parse_pack",
    "check_pack",
    "pack_file_limit",
    "compare_packs",
    "reconcile_flight",
    "restore_flight",
    "new_flight",
    "apply",
    "rail",
    "open_steps",
    "suggestion",
    "calculated",
    "timers",
    "cdu_walkthrough",
    "phase_model",
    "seat_frame",
    "parse_flight",
    "parse_settings",
    "default_settings",
    "plan_url",
    "parse_plan",
    "plan_values",
    "other_aircraft",
    "parse_saved_plan",
    "plan_format",
    "new_log",
    "log_packs",
    "parse_log",
    "log_entry",
    "practice_result",
    "edit_log",
    "log_csv",
    "backup_text",
    "read_backup",
    "decode_metar",
    "decode_taf",
    "open_link",
    "save_file",
];
