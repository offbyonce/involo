// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `messages.yaml`: the alert messages the aircraft's alert display can show (EICAS or ECAM),
//! what each means and the list that deals with it (decision 0029). The app shows them; it never
//! simulates an alert system or reacts to the simulator (decision 0006).

use crate::model::StepId;

data_types! {
    /// How serious a message is. The app draws each level in its own theme colors and always
    /// writes its name; a pack never sets a color.
    #[derive(Copy, Eq, PartialOrd, Ord)]
    #[serde(rename_all = "snake_case")]
    pub enum MessageLevel {
        /// A warning, the most serious level; its filter comes first.
        Warning,
        /// A caution; its filter comes after warnings.
        Caution,
        /// An advisory; its filter comes after cautions.
        Advisory,
        /// A memo; its filter comes after advisories.
        Memo,
        /// A status message; its filter comes last.
        Status,
    }

    /// One alert message.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Message {
        /// Lower-case letters, digits and dashes, e.g. `engine-fire-l`, so a step, a link or a
        /// pack extending this one can name it.
        pub id: String,
        /// The message as the alert display shows it, e.g. `ENGINE FIRE L`.
        pub text: String,
        /// How serious it is, which sets its badge, its colors and the level filter it is under.
        pub level: MessageLevel,
        /// What it means.
        pub meaning: String,
        /// The list that deals with it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub list: Option<String>,
        /// Without a list: why none is needed, e.g. a memo that only reminds.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub no_list: Option<String>,
        /// The steps that deal with it, in order: each shows the message that calls for it.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub steps: Vec<StepId>,
    }

    /// `messages.yaml`, in the order the app lists them.
    pub struct MessagesFile {
        /// Every message.
        pub messages: Vec<Message>,
    }
}
