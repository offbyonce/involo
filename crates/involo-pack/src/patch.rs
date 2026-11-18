// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `patches.yaml`: a child pack's changes to its parent, by id (decision 0029).
//!
//! Patches apply in order to the parent's built content: its lists and content files, as their
//! YAML field names write them. Each patch names one target by its id and changes it. A patch
//! that matches nothing, two patches on one target, or a change that leaves the target unreadable
//! is an error naming the file and the patch.

use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// What a patch does to its target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PatchOp {
    /// Changes some of the target's fields (`to`, a map; a field set to null is removed). A label
    /// that is plain text takes its new text as `to`.
    Set,
    /// Puts `with` in the target's place.
    Replace,
    /// Removes the target.
    Remove,
    /// Puts `with` (one new entry, or a list of them) just before the target.
    InsertBefore,
    /// Puts `with` (one new entry, or a list of them) just after the target.
    InsertAfter,
}

/// One change to the parent. It names exactly one target, by id:
/// - `stage`, `list`, `step`, `panel`, `flight_field`, `panel_state`: the entry's `id`;
/// - `section`: `panel/section`; `item`: `panel/section/item`, the item's `id` (an item without an
///   id cannot be patched: add the id in the parent);
/// - `glossary_term`: the entry's `term`;
/// - `label`: a dotted path into the pack's labels, a list entry named by its `id`, e.g.
///   `list_kinds.checklist` or `roles.pf.title`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Patch {
    pub op: PatchOp,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight_field: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glossary_term: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// `set`: the fields to change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<Value>,
    /// `replace`, `insert_before`, `insert_after`: the new entry, or entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub with: Option<Value>,
}

/// `patches.yaml`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PatchesFile {
    pub patches: Vec<Patch>,
}

/// The kinds of thing a patch can target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Stage,
    List,
    Step,
    Panel,
    Section,
    Item,
    FlightField,
    PanelState,
    GlossaryTerm,
    Label,
}

impl Kind {
    /// The name a patch file uses.
    pub const fn name(self) -> &'static str {
        match self {
            Self::Stage => "stage",
            Self::List => "list",
            Self::Step => "step",
            Self::Panel => "panel",
            Self::Section => "section",
            Self::Item => "item",
            Self::FlightField => "flight_field",
            Self::PanelState => "panel_state",
            Self::GlossaryTerm => "glossary_term",
            Self::Label => "label",
        }
    }
}

impl Patch {
    /// The patch's targets, by kind: a well-formed patch has exactly one.
    fn targets(&self) -> Vec<(Kind, &str)> {
        [
            (Kind::Stage, &self.stage),
            (Kind::List, &self.list),
            (Kind::Step, &self.step),
            (Kind::Panel, &self.panel),
            (Kind::Section, &self.section),
            (Kind::Item, &self.item),
            (Kind::FlightField, &self.flight_field),
            (Kind::PanelState, &self.panel_state),
            (Kind::GlossaryTerm, &self.glossary_term),
            (Kind::Label, &self.label),
        ]
        .into_iter()
        .filter_map(|(k, v)| v.as_deref().map(|v| (k, v)))
        .collect()
    }

    /// The patch's one target, when it names exactly one.
    pub fn target(&self) -> Option<(Kind, &str)> {
        match self.targets()[..] {
            [one] => Some(one),
            _ => None,
        }
    }
}

/// How a patch is named in an error: `patches.yaml patch 2 (set step `a.b.c`)`.
pub fn describe(file: &str, n: usize, patch: &Patch) -> String {
    let op = serde_json::to_value(patch.op)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default();
    match patch.target() {
        Some((kind, id)) => format!("{file} patch {n} ({op} {} `{id}`)", kind.name()),
        None => format!("{file} patch {n} ({op})"),
    }
}

/// Where a target sits: an entry of a list, or a field of a map, as JSON pointers.
enum Slot {
    InList { list: String, index: usize },
    InMap { map: String, key: String },
}

fn escape(key: &str) -> String {
    key.replace('~', "~0").replace('/', "~1")
}

/// The index of the entry of the list at `list` whose `key` is `id`.
fn find(doc: &Value, list: &str, key: &str, id: &str) -> Option<usize> {
    doc.pointer(list)?
        .as_array()?
        .iter()
        .position(|e| e.get(key).and_then(Value::as_str) == Some(id))
}

/// Finds a patch's target, or says why it matches nothing.
fn locate(doc: &Value, kind: Kind, id: &str) -> Result<Slot, String> {
    let nothing = || format!("matches no {} `{id}`", kind.name());
    let simple = |list: &str, key: &str| {
        find(doc, list, key, id)
            .map(|index| Slot::InList {
                list: list.to_owned(),
                index,
            })
            .ok_or_else(nothing)
    };
    match kind {
        Kind::Stage => simple("/content/phases/stages", "id"),
        Kind::List => simple("/lists", "id"),
        Kind::Step => {
            let lists = doc.pointer("/lists").and_then(Value::as_array);
            for n in 0..lists.map_or(0, Vec::len) {
                let list = format!("/lists/{n}/steps");
                if let Some(index) = find(doc, &list, "id", id) {
                    return Ok(Slot::InList { list, index });
                }
            }
            Err(nothing())
        }
        Kind::Panel => simple("/content/panels", "id"),
        Kind::Section | Kind::Item => {
            let parts: Vec<&str> = id.split('/').collect();
            let want = if kind == Kind::Section { 2 } else { 3 };
            if parts.len() != want {
                return Err(format!(
                    "a {} is named `{}`",
                    kind.name(),
                    if kind == Kind::Section {
                        "panel/section"
                    } else {
                        "panel/section/item"
                    }
                ));
            }
            let panel = find(doc, "/content/panels", "id", parts[0])
                .ok_or_else(|| format!("matches no panel `{}`", parts[0]))?;
            let sections = format!("/content/panels/{panel}/sections");
            let section = find(doc, &sections, "id", parts[1])
                .ok_or_else(|| format!("matches no section `{}/{}`", parts[0], parts[1]))?;
            if kind == Kind::Section {
                return Ok(Slot::InList {
                    list: sections,
                    index: section,
                });
            }
            let items = format!("{sections}/{section}/items");
            if let Some(index) = find(doc, &items, "id", parts[2]) {
                return Ok(Slot::InList { list: items, index });
            }
            let unnamed = doc
                .pointer(&items)
                .and_then(Value::as_array)
                .is_some_and(|a| a.iter().any(|i| i.get("id").is_none()));
            Err(if unnamed {
                format!(
                    "matches no item `{id}`; an item without an id cannot be patched: add the id `{}` to the item in the parent",
                    parts[2]
                )
            } else {
                nothing()
            })
        }
        Kind::FlightField => simple("/content/flight/fields", "id"),
        Kind::PanelState => simple("/content/panel_states/states", "id"),
        Kind::GlossaryTerm => simple("/content/glossary/terms", "term"),
        Kind::Label => locate_label(doc, id).ok_or_else(nothing),
    }
}

/// A label's place: map keys, and list entries by their `id`.
fn locate_label(doc: &Value, path: &str) -> Option<Slot> {
    let mut at = "/content/labels".to_owned();
    let mut slot = None;
    for part in path.split('.') {
        if let Some(s) = slot.take() {
            at = pointer_of(&s);
        }
        let here = doc.pointer(&at)?;
        slot = Some(match here {
            Value::Object(m) => {
                m.get(part)?;
                Slot::InMap {
                    map: at.clone(),
                    key: part.to_owned(),
                }
            }
            Value::Array(_) => Slot::InList {
                list: at.clone(),
                index: find(doc, &at, "id", part)?,
            },
            _ => return None,
        });
    }
    slot
}

fn pointer_of(slot: &Slot) -> String {
    match slot {
        Slot::InList { list, index } => format!("{list}/{index}"),
        Slot::InMap { map, key } => format!("{map}/{}", escape(key)),
    }
}

/// The new entries a patch's `with` holds: one, or a list of them.
fn entries(with: &Value) -> Vec<Value> {
    match with {
        Value::Array(a) => a.clone(),
        other => vec![other.clone()],
    }
}

/// Applies one patch to `doc`.
fn apply_one(doc: &mut Value, patch: &Patch) -> Result<(), String> {
    let Some((kind, id)) = patch.target() else {
        return Err("names no target, or more than one: give exactly one of stage, list, step, panel, section, item, flight_field, panel_state, glossary_term or label".into());
    };
    let needs = |field: &str, given: bool, wanted: bool| match (given, wanted) {
        (false, true) => Err(format!("needs `{field}`")),
        (true, false) => Err(format!("does not take `{field}`")),
        _ => Ok(()),
    };
    let set = patch.op == PatchOp::Set;
    let takes_with = !matches!(patch.op, PatchOp::Set | PatchOp::Remove);
    needs("to", patch.to.is_some(), set)?;
    needs("with", patch.with.is_some(), takes_with)?;
    let slot = locate(doc, kind, id)?;
    let target = pointer_of(&slot);
    match patch.op {
        PatchOp::Set => {
            let to = patch.to.as_ref().unwrap_or(&Value::Null);
            let Some(value) = doc.pointer_mut(&target) else {
                return Err("matches nothing".into());
            };
            match (value, to) {
                (Value::Object(fields), Value::Object(changes)) => {
                    for (k, v) in changes {
                        if v.is_null() {
                            fields.remove(k);
                        } else {
                            fields.insert(k.clone(), v.clone());
                        }
                    }
                }
                (Value::Object(_), _) => return Err("`to` is a map of the fields to change".into()),
                (value, to) => *value = to.clone(),
            }
        }
        PatchOp::Replace => {
            if let Some(value) = doc.pointer_mut(&target) {
                *value = patch.with.clone().unwrap_or(Value::Null);
            }
        }
        PatchOp::Remove => match &slot {
            Slot::InList { list, index } => {
                if let Some(a) = doc.pointer_mut(list).and_then(Value::as_array_mut) {
                    a.remove(*index);
                }
            }
            Slot::InMap { map, key } => {
                if let Some(m) = doc.pointer_mut(map).and_then(Value::as_object_mut) {
                    m.remove(key);
                }
            }
        },
        PatchOp::InsertBefore | PatchOp::InsertAfter => {
            let Slot::InList { list, index } = &slot else {
                return Err("inserts only into a list; this target is a single field".into());
            };
            let at = if patch.op == PatchOp::InsertAfter {
                index + 1
            } else {
                *index
            };
            let new = entries(patch.with.as_ref().unwrap_or(&Value::Null));
            if let Some(a) = doc.pointer_mut(list).and_then(Value::as_array_mut) {
                for (n, entry) in new.into_iter().enumerate() {
                    a.insert(at + n, entry);
                }
            }
        }
    }
    check_shape(doc, kind, patch, &slot)
}

/// Reads `value` as `T`, so a patch that leaves its target unreadable says why.
fn reads<T: DeserializeOwned>(value: &Value) -> Result<(), String> {
    serde_json::from_value::<T>(value.clone())
        .map(|_| ())
        .map_err(|e| format!("leaves it unreadable: {e}"))
}

/// Each entry a patch wrote reads as its kind.
fn check_shape(doc: &Value, kind: Kind, patch: &Patch, slot: &Slot) -> Result<(), String> {
    use involo_checklist_core as core;
    if kind == Kind::Label {
        return doc
            .pointer("/content/labels")
            .map_or(Ok(()), reads::<core::Labels>);
    }
    let written: Vec<Value> = match (patch.op, slot) {
        (PatchOp::Remove, _) => return Ok(()),
        (PatchOp::Set | PatchOp::Replace, s) => {
            doc.pointer(&pointer_of(s)).cloned().into_iter().collect()
        }
        (_, _) => entries(patch.with.as_ref().unwrap_or(&Value::Null)),
    };
    for value in &written {
        match kind {
            Kind::Stage => reads::<core::Stage>(value)?,
            Kind::List => reads::<core::Checklist>(value)?,
            Kind::Step => reads::<core::Step>(value)?,
            Kind::Panel => reads::<core::Panel>(value)?,
            Kind::Section => reads::<core::PanelSection>(value)?,
            Kind::Item => reads::<core::PanelItem>(value)?,
            Kind::FlightField => reads::<core::FlightField>(value)?,
            Kind::PanelState => reads::<core::PanelState>(value)?,
            Kind::GlossaryTerm => reads::<core::GlossaryEntry>(value)?,
            Kind::Label => {}
        }
    }
    Ok(())
}

/// What a patch touched, so a check issue about it can name the patch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Touched {
    /// The ids the patch's change involves: its target, and the ids of entries it wrote.
    pub ids: Vec<String>,
    /// The patch, as errors name it.
    pub patch: String,
}

/// Applies every patch in order to `doc` (`{"lists": [...], "content": {...}}`). Returns what each
/// patch touched, or every problem, each naming its patch.
pub fn apply(doc: &mut Value, file: &str, patches: &[Patch]) -> Result<Vec<Touched>, Vec<String>> {
    let mut problems = Vec::new();
    let mut seen: Vec<(Kind, &str, usize)> = Vec::new();
    let mut touched = Vec::new();
    for (i, patch) in patches.iter().enumerate() {
        let n = i + 1;
        let name = describe(file, n, patch);
        if let Some((kind, id)) = patch.target() {
            if let Some((_, _, first)) = seen.iter().find(|(k, t, _)| *k == kind && *t == id) {
                problems.push(format!(
                    "{name}: patch {first} already changes this {}; put both changes in one patch",
                    kind.name()
                ));
                continue;
            }
            seen.push((kind, id, n));
        }
        match apply_one(doc, patch) {
            Ok(()) => {
                let mut ids: Vec<String> = patch
                    .target()
                    .map(|(_, id)| id.to_owned())
                    .into_iter()
                    .collect();
                for entry in patch.with.iter().flat_map(entries) {
                    if let Some(id) = entry
                        .get("id")
                        .or_else(|| entry.get("term"))
                        .and_then(Value::as_str)
                    {
                        ids.push(id.to_owned());
                    }
                }
                touched.push(Touched { ids, patch: name });
            }
            Err(e) => problems.push(format!("{name}: {e}")),
        }
    }
    if problems.is_empty() {
        Ok(touched)
    } else {
        Err(problems)
    }
}
