// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `briefings.yaml`: crew briefings.

data_types! {
    /// One line of a briefing: the letter of its mnemonic and the rest of the word.
    pub struct BriefItem {
        /// Unique in the pack. Saved progress uses it, so it never changes once published.
        pub id: String,
        /// The letters of the mnemonic this line stands for, e.g. `R`; with `rest` it makes the
        /// line's word as Practice shows it.
        pub lead: String,
        /// The rest of the word after `lead`, e.g. `unway`.
        pub rest: String,
        /// What to cover under this line.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub detail: Option<String>,
    }

    /// A crew briefing for one phase. The app doesn't show briefings yet; Practice asks about a
    /// briefing's mnemonic and its items.
    pub struct Briefing {
        /// Unique in the pack.
        pub id: String,
        /// Its name, e.g. `Departure`: Practice calls it "the Departure briefing".
        pub title: String,
        /// The word its lines' letters spell. Practice asks about briefings that have one, and
        /// leaves out one whose mnemonic is empty.
        pub mnemonic: String,
        /// The phase it belongs to, which must exist; Practice links to it.
        pub phase: String,
        /// Its lines, in order.
        pub items: Vec<BriefItem>,
    }

    /// `briefings.yaml`: the crew briefings and their mnemonics, which Practice asks about.
    pub struct BriefingsFile {
        /// Every briefing.
        pub briefings: Vec<Briefing>,
    }
}
