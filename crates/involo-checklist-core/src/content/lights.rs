// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `lights.yaml`: what panel lights mean.

use crate::model::Confirmation;

data_types! {
    /// What a panel light means.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct LightNote {
        /// `<panel>/<section>/<label>/<n>`, where n counts items with that label from 1.
        pub locator: String,
        /// Which one of the lights sharing its label on a section this is ("transfer bus 1"),
        /// as Practice names it; every light that shares its label needs one, each different.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub which: Option<String>,
        /// What the light means when it is on; shown in the Flight deck page's light list and
        /// asked in Practice.
        pub meaning: String,
        /// When the light comes on, and when that is normal; shown under the meaning as "When
        /// it comes on".
        pub when: String,
        /// What to do when it is on; shown under the meaning as "What to do".
        pub action: String,
        /// Internal record of what this note was confirmed against (decision 0013).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub confirmed_by: Vec<Confirmation>,
    }

    /// `lights.yaml`: what the panel lights mean, each found by its place on a panel.
    pub struct LightsFile {
        /// One note per light.
        pub lights: Vec<LightNote>,
    }
}
