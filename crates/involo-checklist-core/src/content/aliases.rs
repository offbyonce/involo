// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `aliases.yaml`: old saved ids and what replaced them.

data_types! {
    /// What an alias renames. Covers everything the previous release saved.
    #[derive(Copy, Eq, PartialOrd, Ord)]
    #[serde(rename_all = "snake_case")]
    pub enum AliasKind {
        /// `to` is a step id.
        Step,
        /// `to` is a briefing item id.
        BriefingItem,
        /// A value typed into a blank. `to` is `<step-id>#<n>`, counting blanks from 0.
        Blank,
        /// `to` is a panel state id.
        PanelState,
        /// A chosen option. `from` and `to` are `<option>:<value>`.
        OptionValue,
        /// A saved flight value. `to` is one of the pack's flight fields.
        FillField,
        /// `to` is a list id.
        List,
        /// `to` is a phase id.
        Phase,
        /// `to` is a zone id.
        Zone,
    }

    /// An old saved id and what replaced it. Lets saved progress carry over.
    pub struct Alias {
        /// What kind of id it renames, which says what `from` and `to` are.
        pub kind: AliasKind,
        /// The old id, as an earlier version of the pack saved it. Each old id is listed once per
        /// kind.
        pub from: String,
        /// The id that replaced it, which must exist in this version of the pack.
        pub to: String,
    }

    /// `aliases.yaml`: the ids an earlier version of the pack used and the ids that replaced them,
    /// so a flight saved with that version keeps its ticks, blanks, options and panel state when
    /// the pack is updated (decision 0028).
    pub struct AliasesFile {
        /// Every renamed id.
        pub aliases: Vec<Alias>,
    }
}
