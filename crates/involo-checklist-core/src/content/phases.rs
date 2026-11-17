// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `phases.yaml`: options, stages and phases.

use crate::model::{FillField, ShowIf};

data_types! {
    /// A choice the pilot makes that decides what is shown, e.g. the power source.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct UserOption {
        pub id: String,
        pub title: String,
        pub values: Vec<String>,
        /// The value used until the pilot chooses. Must be one of `values`.
        pub default: String,
        /// What the choice changes, shown beside it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        /// How each value is shown. When present, every value has exactly one.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub choices: Vec<OptionChoice>,
        /// Phases that show the choice above their lists.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub ask_in: Vec<String>,
        /// How a flight value suggests the answer, for the pilot to confirm (decisions 0022 and
        /// 0027).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub suggests: Option<Suggests>,
    }

    /// What suggests an option's answer: a rule (decision 0027), or, as format 4 wrote it, a bare
    /// flight field, which suggests nothing.
    #[serde(untagged)]
    pub enum Suggests {
        Rule(SuggestRule),
        Field(FillField),
    }

    /// A weight from the flight, less `minus`, above `more_than` suggests `then`, otherwise
    /// `otherwise`; within `near` of `more_than` the suggestion says it is close to the line
    /// (decision 0027). The amounts are in `unit`. With `minus` at 0, nothing is suggested.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct SuggestRule {
        pub field: FillField,
        pub unit: WeightUnit,
        pub minus: u32,
        pub more_than: u32,
        #[serde(default)]
        pub near: u32,
        /// The line and margin for a flight in the other unit, when the choices name both
        /// ("More than 1,000 lb (450 kg)"): a pound flight is held to 1,000 lb, not 992.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub other_unit: Option<SuggestLine>,
        pub then: String,
        pub otherwise: String,
    }

    /// A suggestion rule's line and margin in the other unit.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct SuggestLine {
        pub more_than: u32,
        #[serde(default)]
        pub near: u32,
    }

    /// A unit for a suggestion rule's amounts.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum WeightUnit {
        Kg,
        Lb,
    }

    /// How one value of an option is shown, e.g. "Ground power at the gate".
    pub struct OptionChoice {
        pub value: String,
        pub label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
    }

    /// A phase's place in a stage.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct StagePhase {
        pub phase: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub show_if: Option<ShowIf>,
    }

    /// A group of phases, e.g. "Preflight".
    pub struct Stage {
        pub title: String,
        pub phases: Vec<StagePhase>,
    }

    /// One paragraph of a phase's introduction.
    pub struct IntroParagraph {
        /// A short lead-in shown before the text, e.g. "When to use them".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub heading: Option<String>,
        pub text: String,
    }

    /// One part of the flight, holding its lists in order.
    pub struct Phase {
        pub id: String,
        pub title: String,
        /// Reference material, outside the normal flow of a flight.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub reference: bool,
        /// Shown at the top of the phase.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub intro: Vec<IntroParagraph>,
        /// Ids of the lists in this phase.
        pub lists: Vec<String>,
    }

    /// `phases.yaml`.
    pub struct PhasesFile {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub options: Vec<UserOption>,
        /// Which option choices make a turnaround, for steps in Essentials only on a turnaround
        /// (`quick: turnaround`). Required when any step uses it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub turnaround: Option<ShowIf>,
        pub stages: Vec<Stage>,
        pub phases: Vec<Phase>,
    }
}
