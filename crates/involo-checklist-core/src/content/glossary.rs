// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `glossary.yaml`: terms and their meanings.

data_types! {
    /// One term and its meaning.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct GlossaryEntry {
        /// The term as steps and panels write it, e.g. `APU`. Each term is listed once; a step's
        /// `terms` name it.
        pub term: String,
        /// What it means. When the term is in capitals and the first sentence is a short name
        /// for it, the Glossary shows that sentence as its expansion and the rest as its
        /// meaning, unless `labels.yaml` lists the term in `glossary_exceptions`.
        pub meaning: String,
        /// `false` for a unit or a plain abbreviation (LB, FT, ENG): it stays in the glossary but is
        /// never one of a step's terms, which name what a learner needs (panels and systems).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub step_term: Option<bool>,
    }

    /// `glossary.yaml`: the abbreviations and terms the pack uses, for the Glossary page, Find
    /// and Practice, and the terms a step can name.
    pub struct GlossaryFile {
        /// Every term, in any order: the Glossary sorts them A to Z.
        pub terms: Vec<GlossaryEntry>,
    }
}
