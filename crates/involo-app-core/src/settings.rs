// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! What outlives a flight (decision 0012). Saved on the device with a format number.

use std::collections::{BTreeMap, BTreeSet};

use involo_checklist_core::StepId;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The saved format of [`Settings`]. Raise it, with a migration and tests, when the shape changes.
pub const SETTINGS_FORMAT: u32 = 12;

/// The highest dimming step; 0 is full brightness.
pub const MAX_DIMMING: u8 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Theme {
    /// Follow the device's light or dark setting.
    #[default]
    System,
    Dark,
    Light,
}

/// Text and controls size, applied on top of the wide-screen scaling (decision 0021).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TextSize {
    #[default]
    #[serde(rename = "100")]
    Standard,
    #[serde(rename = "115")]
    Larger,
    #[serde(rename = "130")]
    Largest,
}

impl TextSize {
    /// The size as a percentage of the standard size.
    #[must_use]
    pub const fn percent(self) -> u16 {
        match self {
            Self::Standard => 100,
            Self::Larger => 115,
            Self::Largest => 130,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Detail {
    /// Item and value only.
    Quick,
    /// Where it is, why, and the rest.
    #[default]
    Expanded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum StepLayout {
    /// Every item in the list.
    #[default]
    Checklist,
    /// One item at a time, in the current-item box.
    Flow,
}

/// The pilot's own additions to and removals from Essentials, for one pack.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct EssentialsChanges {
    pub added: BTreeSet<StepId>,
    pub removed: BTreeSet<StepId>,
}

// Each flag is an independent on/off choice the pilot makes in Settings; an enum would not help.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Settings {
    pub format: u32,
    pub theme: Theme,
    /// 0 (full brightness) to [`MAX_DIMMING`].
    pub dimming: u8,
    pub text_size: TextSize,
    pub detail: Detail,
    pub list_view: StepLayout,
    /// Essentials only, instead of every step.
    pub essentials: bool,
    /// Pack id to the pilot's changes to Essentials.
    pub essentials_changes: BTreeMap<String, EssentialsChanges>,
    /// Settings › Panel preview in steps (round 6): the label-free panel beside each step. Show
    /// panel and Where is this? always work.
    pub panel_preview: bool,
    /// The Flight pages' Descriptions On/Off: each field's description under its value.
    /// Off keeps the label, the value and the chip; ? keeps the longer note. Set only from the
    /// Flight header.
    pub descriptions: bool,
    pub chime: bool,
    pub simbrief_user: Option<String>,
    pub load_plan_on_open: bool,
    /// Whether the tour's welcome card has been seen (the tour, 2026-11-16): the only thing the
    /// tour stores. Not flight data.
    pub tour_seen: bool,
    /// The pack the app opens (decision 0028), by id: set when the pilot installs, opens or
    /// switches to a pack. None until one is chosen; settings from format 6 take the pack whose
    /// flight is saved, which the app finds when it starts.
    pub current_pack: Option<String>,
    /// The pilot's seat, by one of the pack's seat ids; None until chosen.
    pub seat: Option<String>,
    /// When this device last saved a backup file (#47), in milliseconds since 1970 (UTC); None
    /// before the first. Restoring settings from a backup keeps this device's.
    #[ts(type = "number | null")]
    pub last_backup: Option<i64>,
    /// Whether the simulator-only notice has been answered with I understand on this device
    /// (#241). It shows once, before anything else; never again once answered.
    pub notice_seen: bool,
    /// The backup reminder's Not now (#243): no reminder before this time, in milliseconds since
    /// 1970 (UTC); None until the pilot first answers Not now.
    #[ts(type = "number | null")]
    pub backup_reminder_after: Option<i64>,
    /// Settings › Keep screen awake (#245): asks the browser to keep the screen on while Involo is
    /// open, where it can.
    pub keep_awake: bool,
    /// Settings › Check for updates (desktop app, #116): at launch, ask GitHub whether a newer
    /// release is out, and say so. On by default; off, the app never contacts GitHub at launch.
    pub check_updates: bool,
    /// The newer version whose notice the pilot answered with Not now (#116): it never shows
    /// again, and a version after it does. None until then.
    pub update_dismissed: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            format: SETTINGS_FORMAT,
            theme: Theme::default(),
            dimming: 0,
            text_size: TextSize::default(),
            detail: Detail::default(),
            list_view: StepLayout::default(),
            essentials: false,
            essentials_changes: BTreeMap::new(),
            panel_preview: true,
            descriptions: true,
            chime: true,
            simbrief_user: None,
            load_plan_on_open: false,
            tour_seen: false,
            current_pack: None,
            seat: None,
            last_backup: None,
            notice_seen: false,
            backup_reminder_after: None,
            keep_awake: false,
            check_updates: true,
            update_dismissed: None,
        }
    }
}
