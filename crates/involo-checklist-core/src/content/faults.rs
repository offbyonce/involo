// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `faults.yaml`: likely causes when a step goes wrong.

use crate::model::StepId;

data_types! {
    /// The likely causes when a step does not give the expected result.
    pub struct Fault {
        /// The steps it is about; each must be a step of the pack. Practice asks about the first
        /// one, when that step has an `if_not`, alongside faults in the same flight deck area.
        pub steps: Vec<StepId>,
        /// The likely causes, each a short sentence. Practice asks for one of them.
        pub causes: Vec<String>,
        /// What to do about it. Practice asks for it.
        pub action: String,
    }

    /// `faults.yaml`: what most likely went wrong when a step does not give its expected result,
    /// and what to do, for Practice's Faults questions.
    pub struct FaultsFile {
        /// Every fault.
        pub faults: Vec<Fault>,
    }
}
