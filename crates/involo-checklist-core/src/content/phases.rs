// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `phases.yaml`: options, stages and phases.

use crate::model::{FieldId, ShowIf};

data_types! {
    /// A choice the pilot makes that decides what is shown, e.g. the power source.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct UserOption {
        /// Unique in the pack: `show_if` tests, `ask_in`, `start_page` and saved flights name
        /// the option by it.
        pub id: String,
        /// The choice's name where it is asked; the Start page may give its own.
        pub title: String,
        /// The values the pilot chooses among, in order. `show_if` tests compare against them.
        pub values: Vec<String>,
        /// The value used until the pilot chooses. Must be one of `values`.
        pub default: String,
        /// What the choice changes, shown beside it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        /// How each value is shown. When present, every value has exactly one.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub choices: Vec<OptionChoice>,
        /// Phases that show the choice above their lists, and `start` for the Start page.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub ask_in: Vec<String>,
        /// How the Start page shows the choice; required when `ask_in` names `start`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub start: Option<StartControl>,
        /// How a flight value suggests the answer, for the pilot to confirm (decisions 0022 and
        /// 0027).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub suggests: Option<Suggests>,
    }

    /// How the Start page draws an option: one card per choice, or a segmented row.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum StartStyle {
        /// One card per choice.
        Cards,
        /// A segmented row of the choices.
        Row,
        /// An on/off switch, for an option of two values: `on` names the value it sets when on.
        Toggle,
    }

    /// A link from a Start page option to a phase, e.g. "Preview the inspection".
    pub struct StartLink {
        /// The id of the phase the link opens.
        pub phase: String,
        /// The link's text.
        pub text: String,
    }

    /// An option on the Start page (decision 0029): its control style, and optionally its own
    /// title and description there (the option's own are used otherwise) and a link to a phase.
    pub struct StartControl {
        /// How the choice is drawn.
        pub style: StartStyle,
        /// Its title on the Start page; the option's own otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        /// Its description on the Start page; the option's own otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        /// A link under it to a phase.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub link: Option<StartLink>,
        /// With `style: toggle`: the value the switch sets when on; off sets the other.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub on: Option<String>,
    }

    /// What suggests an option's answer: a rule (decision 0027), or, as format 4 wrote it, a bare
    /// flight field, which suggests nothing.
    #[serde(untagged)]
    pub enum Suggests {
        /// A rule that suggests an answer.
        Rule(SuggestRule),
        /// A bare flight field, as format 4 wrote it: suggests nothing.
        Field(FieldId),
    }

    /// A weight from the flight, less `minus`, above `more_than` suggests `then`, otherwise
    /// `otherwise`; within `near` of `more_than` the suggestion says it is close to the line
    /// (decision 0027). The amounts are in `unit`. With `minus` at 0, nothing is suggested.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct SuggestRule {
        /// The flight field whose weight is read, e.g. the planned fuel.
        pub field: FieldId,
        /// The unit `minus`, `more_than` and `near` are in; a flight in the other unit is
        /// converted.
        pub unit: WeightUnit,
        /// Taken from the weight before it is compared (what other tanks hold). At 0, nothing is
        /// suggested.
        pub minus: u32,
        /// The line: what is left above it suggests `then`.
        pub more_than: u32,
        /// How close to the line the suggestion says it is close; 0 never says so.
        #[serde(default)]
        pub near: u32,
        /// The line and margin for a flight in the other unit, when the choices name both
        /// ("More than 1,000 lb (450 kg)"): a pound flight is held to 1,000 lb, not 992.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub other_unit: Option<SuggestLine>,
        /// The option value suggested when what is left is above the line.
        pub then: String,
        /// The option value suggested when what is left is at or below the line.
        pub otherwise: String,
    }

    /// A suggestion rule's line and margin in the other unit.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct SuggestLine {
        /// The line, in the other unit.
        pub more_than: u32,
        /// How close to the line counts as close, in the other unit.
        #[serde(default)]
        pub near: u32,
    }

    /// A unit for a suggestion rule's amounts.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum WeightUnit {
        /// Kilograms.
        Kg,
        /// Pounds.
        Lb,
    }

    /// How one value of an option is shown, e.g. "Ground power at the gate".
    pub struct OptionChoice {
        /// The option value it shows: one of the option's `values`.
        pub value: String,
        /// The text shown for the value.
        pub label: String,
        /// A line shown under the label.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
    }

    /// A phase's place in a stage.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct StagePhase {
        /// The id of the phase.
        pub phase: String,
        /// Shows the phase in this stage only when the pilot's options pass this test.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub show_if: Option<ShowIf>,
    }

    /// A group of phases, e.g. "Preflight".
    pub struct Stage {
        /// Unique in the pack, and never changes once published: the rail, Find and a pack
        /// extending this one name the stage by it (decision 0029). The title is display text.
        pub id: String,
        /// The stage's name in the rail.
        pub title: String,
        /// Its phases, in the rail's order.
        pub phases: Vec<StagePhase>,
    }

    /// One paragraph of a phase's introduction.
    pub struct IntroParagraph {
        /// A short lead-in shown before the text, e.g. "When to use them".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub heading: Option<String>,
        /// The paragraph's text.
        pub text: String,
    }

    /// One part of the flight, holding its lists in order.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Phase {
        /// Unique in the pack: stages, `ask_in`, links and other files name the phase by it.
        pub id: String,
        /// The phase's name in the rail and at its top.
        pub title: String,
        /// Reference material, outside the normal flow of a flight.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub reference: bool,
        /// Which reference group the phase is, required on a reference phase: `memory` (memory
        /// items), `quick` (quick reference) or `procedures` (non-normal procedures). The app
        /// reads reference phases by group, never by their order or title (decision 0029).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub group: Option<String>,
        /// The phase that starts the engines, on at most one flight phase: Practice's "Before
        /// engine start" covers the flight up to and including it.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub engine_start: bool,
        /// Shown at the top of the phase.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub intro: Vec<IntroParagraph>,
        /// Ids of the lists in this phase.
        pub lists: Vec<String>,
    }

    /// `phases.yaml`: the pilot's options, the stages and phases of a flight with the lists in
    /// each phase, the turnaround rule and the Start page's order.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct PhasesFile {
        /// The choices the pilot makes that `show_if` tests read.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub options: Vec<UserOption>,
        /// Which option choices make a turnaround, for steps in Essentials only on a turnaround
        /// (`quick: turnaround`). Required when any step uses it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub turnaround: Option<ShowIf>,
        /// The stages of a flight, in order, as the rail shows them.
        pub stages: Vec<Stage>,
        /// Every phase, flight and reference, with its lists.
        pub phases: Vec<Phase>,
        /// The Start page's order: the ids of options asked there, and `panel_state` for the
        /// panel-state picker. Without it, the options in this file's order, then the picker.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub start_page: Vec<String>,
    }
}
