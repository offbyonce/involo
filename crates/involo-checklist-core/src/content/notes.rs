// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `notes.yaml`: shared how-to notes and explanations.

data_types! {
    /// Shared "how to do it" instructions.
    pub struct HowNote {
        /// Unique in the pack; a step's `how` names it.
        pub id: String,
        /// The instructions, in order: a numbered list under the step's "How to do it".
        pub steps: Vec<String>,
    }

    /// A shared explanation of a test or action.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct ExplainNote {
        /// Unique in the pack; a step's `explain` names it.
        pub id: String,
        /// What the test or action is: the "What it is" line under the step's "How to do it".
        pub what: String,
        /// Why it is done: the step's Why, when the step has no `why` of its own.
        pub why: String,
        /// What a good result looks like.
        pub success: String,
        /// What a bad result can mean.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub failure: Option<String>,
        /// What to check: the step's Check, when the step has no `check` of its own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub check: Option<String>,
        /// More on the check, shown below it when the step has no `check` of its own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub check_detail: Option<String>,
        /// What to do when the check fails: the step's If not, when the step has no `if_not` of
        /// its own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub if_not: Option<String>,
        /// More on the If not, shown below it when the step has no `if_not` of its own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub if_not_detail: Option<String>,
    }

    /// `notes.yaml`: how-to instructions and explanations that several steps share, each named
    /// by the steps that use it.
    pub struct NotesFile {
        /// Shared "How to do it" instructions, named by a step's `how`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub how: Vec<HowNote>,
        /// Shared explanations, named by a step's `explain`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub explain: Vec<ExplainNote>,
    }
}
