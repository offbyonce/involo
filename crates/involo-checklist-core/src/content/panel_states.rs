// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `panel-states.yaml`: ready-made starting points.

use std::collections::BTreeMap;

use crate::model::StepId;

data_types! {
    /// A ready-made point to start from, with earlier steps already accounted for.
    pub struct PanelState {
        /// The state's id, which a flight records and aliases can rename.
        pub id: String,
        /// Its name in the Start page's panel-state picker.
        pub title: String,
        /// What it starts from, in words; shown under the Start page's picker once it is chosen.
        pub description: String,
        /// Options this start selects.
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        pub set: BTreeMap<String, String>,
        /// The phase to open.
        pub phase: String,
        /// Steps ticked when this state is chosen, unless already ticked or skipped; choosing
        /// another state takes those ticks back.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub done: Vec<StepId>,
        /// Steps skipped when this state is chosen, unless already ticked or skipped; choosing
        /// another state takes those skips back.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub skip: Vec<StepId>,
    }

    /// `panel-states.yaml`: the starting points a pilot can pick on the Start page, each with
    /// the steps it counts as already done or skipped.
    pub struct PanelStatesFile {
        /// The states, in the picker's order.
        pub states: Vec<PanelState>,
    }
}
