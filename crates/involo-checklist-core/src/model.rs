// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Checklist data shapes. These Rust types are the single source of truth:
//! the pack JSON Schema and the TypeScript types are generated from them.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A stable step id: `<pack-id>.<phase>.<short-name>`, e.g. `demo-aircraft.preflight.irs-mode`.
/// An id never changes once published, even if the step is reworded or moved to another phase.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(transparent)]
pub struct StepId(pub String);

impl StepId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for StepId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// A flight field's id, e.g. `zfw`: one of the fields the pack defines in `flight.yaml`
/// (decision 0029), or one of the app's own, [`FieldId::MANUAL`] and [`FieldId::ROUTE_LEG`].
/// Saved flights key their values by it, as text.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(transparent)]
pub struct FieldId(pub String);

impl FieldId {
    /// A blank the pilot types in, with no linked value. Only valid in a step's `fill`.
    pub const MANUAL: &'static str = "manual";
    /// One part of a route row, in CDU text, with `index` and `part`.
    pub const ROUTE_LEG: &'static str = "route_leg";

    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// One of the app's own fields, which no pack defines.
    pub fn is_built_in(&self) -> bool {
        self.0 == Self::MANUAL || self.0 == Self::ROUTE_LEG
    }
}

impl std::fmt::Display for FieldId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<&str> for FieldId {
    fn from(id: &str) -> Self {
        Self(id.to_owned())
    }
}

impl std::borrow::Borrow<str> for FieldId {
    fn borrow(&self) -> &str {
        &self.0
    }
}

/// The highest route row a CDU field can refer to.
pub const MAX_ROUTE_LEG: u32 = 30;

data_types! {
    /// What kind of list this is.
    #[serde(rename_all = "snake_case")]
    pub enum ListKind {
        /// Read and confirm after the work is done.
        Checklist,
        /// A sequence of actions done from memory or by following along.
        Flow,
        /// For abnormal situations.
        #[serde(rename = "non-normal")]
        NonNormal,
    }

    /// How a list is used (decision 0029). Its display name comes from the pack's labels.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum ListMethod {
        /// Each step done as it is read.
        Do,
        /// Read aloud, then done.
        ReadAndDo,
        /// One crew member reads each item, the other answers (a step's `respond`).
        ChallengeResponse,
        /// Done from memory, then checked.
        FromMemory,
    }

    /// What a step or light note was confirmed against (decision 0013, which defines each kind).
    /// The list grows by adding a kind there and here.
    #[derive(Copy, Eq, PartialOrd, Ord)]
    #[serde(rename_all = "kebab-case")]
    pub enum ConfirmationKind {
        /// Matches the aircraft developer's documentation for the simulated aircraft.
        VendorDocs,
        /// Matches an official public document from an aviation authority.
        RegulatorDocs,
    }

    /// An internal maintenance record (decision 0013): the kind of source and the day it was
    /// recorded, never who or which document. The app never shows it.
    pub struct Confirmation {
        /// The kind of source it was confirmed against.
        pub kind: ConfirmationKind,
        /// `YYYY-MM-DD`.
        pub date: String,
    }

    /// When a step still shows in quick mode.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum Quick {
        /// In Essentials on every flight.
        Always,
        /// In Essentials only when the start options make a turnaround (`turnaround` in
        /// `phases.yaml`).
        Turnaround,
    }

    /// One test against a pilot-chosen option. The options are declared by the pack.
    #[serde(untagged)]
    #[cfg_attr(feature = "ts", ts(rename_all_fields = "camelCase"))]
    pub enum OptionTest {
        /// Passes when the option has this value.
        Equals {
            /// The option's id.
            option: String,
            /// The value it must have.
            equals: String,
        },
        /// Passes when the option has one of these values.
        OneOf {
            /// The option's id.
            option: String,
            /// The values, any one of which passes.
            one_of: Vec<String>,
        },
    }

    /// When something is shown. Deliberately small: tests combine one level deep, with no
    /// negation, comparisons, step state or expressions.
    #[serde(untagged)]
    #[cfg_attr(feature = "ts", ts(rename_all_fields = "camelCase"))]
    pub enum ShowIf {
        /// One test.
        Test(OptionTest),
        /// Shown when every test passes.
        AllOf {
            /// The tests, all of which must pass.
            all_of: Vec<OptionTest>,
        },
        /// Shown when any test passes.
        AnyOf {
            /// The tests, one of which must pass.
            any_of: Vec<OptionTest>,
        },
    }


    /// One piece of a hint shown beside a step, e.g. `GND` and the ground frequency.
    pub struct HintPart {
        /// Literal text before the value, including any space, e.g. `SQUAWK `.
        pub prefix: String,
        /// The flight field whose value follows the prefix.
        pub field: FieldId,
    }

    /// Where a step's stop is on the exterior inspection's top view of the airplane (decision
    /// 0032), in the top view's units.
    pub struct WalkaroundPoint {
        /// The stop's point across, from the top view's left edge.
        pub x: u32,
        /// The stop's point down, from the top view's top edge (the nose is up).
        pub y: u32,
    }

    /// Which of several ticked steps starts a timer.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum AutoStartPick {
        /// The step ticked first.
        Earliest,
        /// The step ticked last.
        Latest,
    }

    /// Steps whose ticks start a timer by itself; `check` makes sure each step named exists.
    pub struct AutoStart {
        /// The steps whose ticks start the timer; `check` makes sure each is a step in the pack.
        pub from: Vec<StepId>,
        /// Which of those ticks starts it: the `earliest` or the `latest`.
        pub pick: AutoStartPick,
    }

    /// A wait attached to a step: a timer chip under the step's value (on the current step before
    /// it starts, and on its row once started, running, paused or finished), and in the
    /// running-timers bar while it runs or is paused. Without `auto_start`, the step's own tick
    /// starts it.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Timer {
        /// How long the wait is, in seconds.
        pub seconds: u32,
        /// The timer's name, e.g. `Warm-up`: on the chip and in the running-timers bar.
        pub label: String,
        /// A note about the wait, for whoever writes the pack; the app doesn't show it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub note: Option<String>,
        /// The earlier steps whose ticks start the timer; the words under the timer name them
        /// before it starts.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub auto_start: Option<AutoStart>,
    }

    /// The state a step expects a light in.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum LightState {
        /// The light is lit.
        On,
        /// The light is out.
        Out,
    }

    /// One panel item a step involves, and what the step asks of it (decision 0018).
    pub struct StepTarget {
        /// The item, as `panel/section/LABEL/n`: the n-th item (from 1) with that label in the
        /// section, as light notes name them.
        pub at: String,
        /// The position the step sets a switch, selector, lever or handle to: one of its
        /// `positions`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub set: Option<String>,
        /// The state the step expects a light in. Leave it out for a light that may cycle (window
        /// heat ON lights), so a drawing never claims a state the light may not be in.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub light: Option<LightState>,
        /// The step's wording names one of the item's positions, but leaves it open: a condition
        /// ("ON IF MORE THAN 1,000 LB"), an option, one engine of two, or the word belongs to
        /// something else. The drawing claims no position, and `involo-pack check` accepts the wording.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub open: bool,
        /// Applies only when a decision step has answered an option with this value (decision
        /// 0022). Until it is answered, the item's target without `when` (`open: true`) applies.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub when: Option<TargetWhen>,
    }

    /// The answer a target depends on: an option and one of its values (decision 0022).
    pub struct TargetWhen {
        /// The option's id.
        pub option: String,
        /// The value that makes the target apply.
        pub equals: String,
    }

    /// A step's value once a decision has answered an option with this value (decision 0027),
    /// e.g. "MAIN PUMPS ON · CENTER PUMPS OFF". Until it is answered, the step's own `expect`
    /// shows.
    pub struct ExpectWhen {
        /// The option's id.
        pub option: String,
        /// The answer this value is for.
        pub equals: String,
        /// The step's value once the option has that answer.
        pub expect: String,
    }

    /// One challenge and response line.
    // These flags are independent facts from pack data; a step can have any mix of them.
    #[allow(clippy::struct_excessive_bools)]
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Step {
        /// The step's id, `<prefix>.<phase>.<short-name>`, unique in the pack. It never changes
        /// once published; a renamed id gets a `step` alias in `aliases.yaml`.
        pub id: StepId,
        /// Printed number; absent for steps that are not numbered.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub number: Option<u32>,
        /// Starts a new titled section at this step.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub section: Option<String>,
        /// The challenge, e.g. "IRS mode selectors".
        pub text: String,
        /// The expected response or position, e.g. "NAV". Always text, never a boolean.
        /// `___` marks a blank the pilot fills in.
        pub expect: String,
        /// Ids from the pack's controls file.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub controls: Vec<String>,
        /// The panel items the step involves and the state it asks of each, which the control
        /// drawings show exactly (decision 0018). `involo-pack check` holds them to the step's wording.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub targets: Vec<StepTarget>,
        /// One field per `___` in `expect`, in order.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub fill: Vec<FieldId>,
        /// Flight values shown beside the expected response.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub hint: Vec<HintPart>,
        /// The id of the CDU walkthrough for this step; `check` makes sure it exists. The step,
        /// when it's current, opens it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub opens: Option<String>,
        /// In a memory list: read this step rather than recalling it.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub non_recall: bool,
        /// Puts the step in Essentials: `always`, or `turnaround`. Without it, the step shows only
        /// when the pilot sees every step.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub quick: Option<Quick>,
        /// Shows the step only when the pilot's option choices pass this test.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub show_if: Option<ShowIf>,
        /// A decision step: it asks the pilot this option (by id), and the answer sets it for the
        /// flight. Targets elsewhere may depend on the answer (decision 0022).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub decide: Option<String>,
        /// The step's value for each answer of a decision its targets depend on (decision 0027).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub expect_when: Vec<ExpectWhen>,
        /// Who does the step: a role id from the pack's labels (decision 0029). Optional.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub role: Option<String>,
        /// In a challenge-and-response list, who answers the challenge: a role id from the
        /// pack's labels.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub respond: Option<String>,
        /// Optional note shown under the step.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub note: Option<String>,
        /// The note is a caution: it stays visible on the step (under If not) instead of in How
        /// to do it. Changes only where the note shows, never its wording.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub note_caution: bool,
        /// The step opens a case of its own ("IF RUNAWAY CONTINUES"): which case applies decides
        /// what follows, so Practice never asks across it. Never on a list's first step.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub branch: bool,
        /// Glossary terms the step uses, shown under Why (each must be in the glossary).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub terms: Vec<String>,
        /// Why the step matters, shown under Why. Takes the place of the shared explanation's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub why: Option<String>,
        /// How to tell the step worked, shown under Check. Takes the place of the shared
        /// explanation's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub check: Option<String>,
        /// More on Check, shown after it. Used only with the step's own `check`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub check_detail: Option<String>,
        /// What to do when Check fails, shown under If not. Takes the place of the shared
        /// explanation's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub if_not: Option<String>,
        /// More on If not, shown after it. Used only with the step's own `if_not`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub if_not_detail: Option<String>,
        /// Id of a shared "how to do it" note.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub how: Option<String>,
        /// Id of a shared explanation.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub explain: Option<String>,
        /// The step's stop on the exterior inspection's top view: the step pane and the phone's
        /// step card draw every stop of the list there, numbered by step `number`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub walkaround: Option<WalkaroundPoint>,
        /// What to look for, shown as "Look for" when the step is open.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub look_for: Option<String>,
        /// Overrides the location text of the step's first control.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub location: Option<String>,
        /// What the crew says.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub callout: Option<String>,
        /// A wait attached to the step: a timer the step's tick, or its trigger steps' ticks,
        /// start.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub timer: Option<Timer>,
        /// Panel lights this step refers to: control id, then light labels.
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        pub panel_lights: BTreeMap<String, Vec<String>>,
        /// The simulator does not model this step, so it is left out of progress.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub not_simulated: bool,
        /// Internal record of what this step was confirmed against (decision 0013).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub confirmed_by: Vec<Confirmation>,
        /// The simulator simplifies the real aircraft here.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub sim_simplified: bool,
        /// The step's note describes how the simulator behaves, not the real aircraft.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub simulator_model: bool,
    }

    /// An ordered list of steps: a checklist, a flow or a non-normal procedure.
    pub struct Checklist {
        /// The list's id, unique in the pack; other files and patches name the list by it.
        pub id: String,
        /// The list's title, as the app shows it.
        pub title: String,
        /// `checklist`, `flow` or `non-normal`.
        pub kind: ListKind,
        /// Kinds of material this list was checked against, from the tags the pack declares.
        /// Never a document name or a link.
        pub basis: Vec<String>,
        /// Part of the memory items.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub memory: bool,
        /// When to use this list.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub when: Option<String>,
        /// Why this list matters.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub why: Option<String>,
        /// How the list is used. Optional.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub method: Option<ListMethod>,
        /// The steps, in order.
        pub steps: Vec<Step>,
    }
}

impl Step {
    /// The step's value for these answers (decision 0027): the value for the answered option's
    /// value, else its own `expect`.
    pub fn value_for(&self, options: &std::collections::BTreeMap<String, String>) -> &str {
        self.expect_when
            .iter()
            .find(|e| options.get(&e.option) == Some(&e.equals))
            .map_or(self.expect.as_str(), |e| e.expect.as_str())
    }

    /// A step with only the required fields set.
    pub fn new(id: impl Into<String>, text: impl Into<String>, expect: impl Into<String>) -> Self {
        Self {
            id: StepId::new(id),
            number: None,
            section: None,
            text: text.into(),
            expect: expect.into(),
            controls: Vec::new(),
            targets: Vec::new(),
            fill: Vec::new(),
            hint: Vec::new(),
            opens: None,
            non_recall: false,
            expect_when: Vec::new(),
            role: None,
            respond: None,
            quick: None,
            show_if: None,
            decide: None,
            note: None,
            note_caution: false,
            branch: false,
            terms: Vec::new(),
            why: None,
            check: None,
            check_detail: None,
            if_not: None,
            if_not_detail: None,
            how: None,
            explain: None,
            walkaround: None,
            look_for: None,
            location: None,
            callout: None,
            timer: None,
            panel_lights: BTreeMap::new(),
            not_simulated: false,
            confirmed_by: Vec::new(),
            sim_simplified: false,
            simulator_model: false,
        }
    }
}

impl Checklist {
    pub fn step(&self, id: &StepId) -> Option<&Step> {
        self.steps.iter().find(|s| &s.id == id)
    }

    pub fn contains(&self, id: &StepId) -> bool {
        self.step(id).is_some()
    }
}
