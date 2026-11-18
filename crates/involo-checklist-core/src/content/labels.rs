// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `labels.yaml`: the words the interface shows that belong to the aircraft or the pack, not to
//! the app (decision 0029). Every key is optional. [`LabelsFile`] is what a pack writes;
//! [`Labels`] is the complete set the flattened pack carries, with the app's defaults (today's
//! words) for anything the pack leaves out. The app's own words (menus, buttons, view names,
//! Full, Essentials, Detailed, Simple) are not here.

use std::collections::BTreeMap;

data_types! {
    /// Display names for the kinds of list.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct ListKindLabels {
        pub flow: String,
        pub checklist: String,
        pub non_normal: String,
        pub memory: String,
        pub quick: String,
    }

    /// Display names for how a list is used (a list's `method`).
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct MethodLabels {
        #[serde(rename = "do")]
        pub do_it: String,
        pub read_and_do: String,
        pub challenge_response: String,
        pub from_memory: String,
    }

    /// A seat in the flight deck, e.g. `left`. Seat frames in the overview are keyed by its id.
    pub struct SeatLabel {
        pub id: String,
        pub title: String,
    }

    /// A crew role, e.g. `capt`. `seat` names the seat it sits in; a duty role such as `pf` or
    /// `pm` names none.
    pub struct RoleLabel {
        pub id: String,
        pub title: String,
        pub short: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub seat: Option<String>,
    }

    /// A reference group, e.g. `memory`, and how its tab is titled.
    pub struct GroupLabel {
        pub id: String,
        pub title: String,
    }

    /// The reference area: its title and its groups, in order.
    pub struct ReferenceLabels {
        pub title: String,
        pub groups: Vec<GroupLabel>,
    }

    /// The panel-state picker's wording.
    pub struct PanelStateLabels {
        pub title: String,
        pub description: String,
        pub placeholder: String,
    }

    /// What a basis tag reads: its label, what kind of material it is, and whether it is a status
    /// (a list still being checked) rather than a source.
    pub struct BasisTagLabel {
        pub id: String,
        pub label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub about: Option<String>,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub pending: bool,
    }

    /// The complete label set the flattened pack carries: the pack's own words where it gives
    /// them, the app's defaults elsewhere.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Labels {
        pub list_kinds: ListKindLabels,
        pub methods: MethodLabels,
        pub seats: Vec<SeatLabel>,
        pub roles: Vec<RoleLabel>,
        pub reference: ReferenceLabels,
        pub seat_view_title: String,
        pub panel_states: PanelStateLabels,
        /// Other words a step's wording uses for a position: `DN: [DOWN]`.
        pub position_words: BTreeMap<String, Vec<String>>,
        pub find_examples: Vec<String>,
        /// Glossary terms whose first sentence reads as a description: no expansion is shown.
        pub glossary_exceptions: Vec<String>,
        /// Words that tell one of a pair from the other, by side or seat (`LEFT`, `CAPTAIN`):
        /// Practice never offers two answers that differ only by them, or by an item's number.
        pub side_words: Vec<String>,
        /// Labels for the manifest's basis tags, in the order the manifest lists them.
        pub basis_tags: Vec<BasisTagLabel>,
    }

    /// `list_kinds` as a pack writes it: any of the names.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct ListKindLabelsFile {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub flow: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub checklist: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub non_normal: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub memory: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub quick: Option<String>,
    }

    /// `methods` as a pack writes it: any of the names.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct MethodLabelsFile {
        #[serde(rename = "do", default, skip_serializing_if = "Option::is_none")]
        pub do_it: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub read_and_do: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub challenge_response: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub from_memory: Option<String>,
    }

    /// `reference` as a pack writes it. Groups are merged with the built-in ones by id.
    pub struct ReferenceLabelsFile {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub groups: Vec<GroupLabel>,
    }

    /// `panel_states` as a pack writes it.
    pub struct PanelStateLabelsFile {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub placeholder: Option<String>,
    }

    /// `labels.yaml`. Every key is optional; a key left out keeps the app's default. Lists
    /// (`seats`, `roles`, `find_examples`, `glossary_exceptions`) replace the default list;
    /// `position_words`, reference `groups` and `basis_tags` are merged with the defaults by key.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct LabelsFile {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub list_kinds: Option<ListKindLabelsFile>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub methods: Option<MethodLabelsFile>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub seats: Option<Vec<SeatLabel>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub roles: Option<Vec<RoleLabel>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub reference: Option<ReferenceLabelsFile>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub seat_view_title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub panel_states: Option<PanelStateLabelsFile>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub position_words: Option<BTreeMap<String, Vec<String>>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub find_examples: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub glossary_exceptions: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub side_words: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub basis_tags: Vec<BasisTagLabel>,
    }
}

impl Default for Labels {
    /// The app's words today, before any pack sets its own.
    fn default() -> Self {
        let s = |t: &str| t.to_owned();
        let group = |id: &str, title: &str| GroupLabel {
            id: s(id),
            title: s(title),
        };
        Self {
            list_kinds: ListKindLabels {
                flow: s("Procedure"),
                checklist: s("Checklist"),
                non_normal: s("Non-normal procedure"),
                memory: s("Memory items"),
                quick: s("Quick reference"),
            },
            methods: MethodLabels {
                do_it: s("Do"),
                read_and_do: s("Read and do"),
                challenge_response: s("Challenge and response"),
                from_memory: s("From memory"),
            },
            seats: vec![],
            roles: vec![],
            reference: ReferenceLabels {
                title: s("Emergency"),
                groups: vec![
                    group("memory", "Memory items"),
                    group("quick", "Quick reference"),
                    group("procedures", "Non-normal procedures"),
                ],
            },
            seat_view_title: s("From the captain seat: which side"),
            panel_states: PanelStateLabels {
                title: s("Panel state"),
                description: s(
                    "Loaded a saved panel state in the simulator? Pick it to tick the steps it has already set and start where the airplane is. Steps it can't set stay open.",
                ),
                placeholder: s("Choose a panel state"),
            },
            position_words: crate::positions::POSITION_WORDS
                .iter()
                .map(|(p, words)| (s(p), words.iter().map(|w| s(w)).collect()))
                .collect(),
            find_examples: ["Fuel panel", "Parking brake", "MCP", "Transponder"]
                .map(s)
                .to_vec(),
            glossary_exceptions: ["IGN L", "IGN R", "PERF INIT", "MA"].map(s).to_vec(),
            side_words: [
                "LEFT",
                "RIGHT",
                "L",
                "R",
                "CAPTAIN",
                "CAPT",
                "FIRST OFFICER",
                "F/O",
                "FO",
            ]
            .map(s)
            .to_vec(),
            basis_tags: vec![
                BasisTagLabel {
                    id: s("regulator-docs"),
                    label: s("Regulator guidance"),
                    about: Some(s(
                        "General practice published by aviation authorities, such as how checklists are used.",
                    )),
                    pending: false,
                },
                BasisTagLabel {
                    id: s("prior-release"),
                    label: s("Source being confirmed"),
                    about: None,
                    pending: true,
                },
            ],
        }
    }
}

impl Labels {
    /// The complete set for a pack: its own words over the defaults. Basis tags are those the
    /// manifest lists (`tags`), in its order, each with the pack's label or the default one; a
    /// tag with neither has no label.
    pub fn complete(file: Option<&LabelsFile>, tags: &[String]) -> Self {
        let mut out = Self::default();
        let defaults = std::mem::take(&mut out.basis_tags);
        if let Some(f) = file {
            out.apply(f);
        }
        let given = file.map(|f| f.basis_tags.as_slice()).unwrap_or_default();
        out.basis_tags = tags
            .iter()
            .filter_map(|tag| {
                given
                    .iter()
                    .chain(&defaults)
                    .find(|l| &l.id == tag)
                    .cloned()
            })
            .collect();
        out
    }

    /// A child pack's words (decision 0029): its parent's built words, with the child's own
    /// `labels.yaml` over them, by the same rules. Basis tag labels come from the child's file,
    /// then the parent's, then the app's defaults, for each of `tags`.
    pub fn extend(parent: &Self, file: Option<&LabelsFile>, tags: &[String]) -> Self {
        let mut out = parent.clone();
        let inherited = std::mem::take(&mut out.basis_tags);
        if let Some(f) = file {
            out.apply(f);
        }
        let given = file.map(|f| f.basis_tags.as_slice()).unwrap_or_default();
        let defaults = Self::default().basis_tags;
        out.basis_tags = tags
            .iter()
            .filter_map(|tag| {
                given
                    .iter()
                    .chain(&inherited)
                    .chain(&defaults)
                    .find(|l| &l.id == tag)
                    .cloned()
            })
            .collect();
        out
    }

    fn apply(&mut self, f: &LabelsFile) {
        let set = |to: &mut String, from: &Option<String>| {
            if let Some(v) = from {
                to.clone_from(v);
            }
        };
        if let Some(k) = &f.list_kinds {
            set(&mut self.list_kinds.flow, &k.flow);
            set(&mut self.list_kinds.checklist, &k.checklist);
            set(&mut self.list_kinds.non_normal, &k.non_normal);
            set(&mut self.list_kinds.memory, &k.memory);
            set(&mut self.list_kinds.quick, &k.quick);
        }
        if let Some(m) = &f.methods {
            set(&mut self.methods.do_it, &m.do_it);
            set(&mut self.methods.read_and_do, &m.read_and_do);
            set(&mut self.methods.challenge_response, &m.challenge_response);
            set(&mut self.methods.from_memory, &m.from_memory);
        }
        if let Some(seats) = &f.seats {
            self.seats.clone_from(seats);
        }
        if let Some(roles) = &f.roles {
            self.roles.clone_from(roles);
        }
        if let Some(r) = &f.reference {
            set(&mut self.reference.title, &r.title);
            for g in &r.groups {
                match self.reference.groups.iter_mut().find(|d| d.id == g.id) {
                    Some(d) => d.title.clone_from(&g.title),
                    None => self.reference.groups.push(g.clone()),
                }
            }
        }
        set(&mut self.seat_view_title, &f.seat_view_title);
        if let Some(p) = &f.panel_states {
            set(&mut self.panel_states.title, &p.title);
            set(&mut self.panel_states.description, &p.description);
            set(&mut self.panel_states.placeholder, &p.placeholder);
        }
        if let Some(words) = &f.position_words {
            for (position, w) in words {
                self.position_words.insert(position.clone(), w.clone());
            }
        }
        if let Some(e) = &f.find_examples {
            self.find_examples.clone_from(e);
        }
        if let Some(e) = &f.glossary_exceptions {
            self.glossary_exceptions.clone_from(e);
        }
        if let Some(w) = &f.side_words {
            self.side_words.clone_from(w);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_a_labels_file_a_pack_gets_the_app_s_words() {
        let tags = ["prior-release".to_owned(), "regulator-docs".to_owned()];
        let labels = Labels::complete(None, &tags);
        assert_eq!(labels.reference.title, "Emergency");
        assert_eq!(labels.methods.challenge_response, "Challenge and response");
        assert_eq!(labels.seat_view_title, "From the captain seat: which side");
        assert_eq!(labels.position_words["DN"], ["DOWN"]);
        // Basis tags in the manifest's order, each with its default label.
        let ids: Vec<&str> = labels.basis_tags.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["prior-release", "regulator-docs"]);
        assert!(labels.basis_tags[0].pending);
    }

    #[test]
    fn a_partial_labels_file_changes_only_what_it_sets() {
        let file = LabelsFile {
            list_kinds: Some(ListKindLabelsFile {
                flow: Some("Flow".into()),
                checklist: None,
                non_normal: None,
                memory: None,
                quick: None,
            }),
            methods: None,
            seats: None,
            roles: None,
            reference: Some(ReferenceLabelsFile {
                title: None,
                groups: vec![
                    GroupLabel {
                        id: "procedures".into(),
                        title: "Abnormal".into(),
                    },
                    GroupLabel {
                        id: "eicas".into(),
                        title: "Alerts".into(),
                    },
                ],
            }),
            seat_view_title: None,
            panel_states: None,
            position_words: Some(BTreeMap::from([(
                "UP".to_owned(),
                vec!["RETRACT".to_owned()],
            )])),
            find_examples: None,
            glossary_exceptions: None,
            side_words: None,
            basis_tags: vec![BasisTagLabel {
                id: "regulator-docs".into(),
                label: "Authority guidance".into(),
                about: None,
                pending: false,
            }],
        };
        let tags = ["regulator-docs".to_owned(), "sim-observed".to_owned()];
        let labels = Labels::complete(Some(&file), &tags);
        let mut expected = Labels::default();
        expected.list_kinds.flow = "Flow".into();
        expected.reference.groups[2].title = "Abnormal".into();
        expected.reference.groups.push(GroupLabel {
            id: "eicas".into(),
            title: "Alerts".into(),
        });
        expected
            .position_words
            .insert("UP".into(), vec!["RETRACT".into()]);
        // `sim-observed` has no label anywhere, so it has none.
        expected.basis_tags = file.basis_tags.clone();
        assert_eq!(labels, expected);
    }
}
