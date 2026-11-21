// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The fields one pack file takes, read from its JSON Schema (decision 0030):
//! `involo-pack describe flight.yaml`. Each part of the file is listed with its fields' types,
//! defaults and descriptions, starting with the file itself and then each part it uses, in the
//! order they are first used.

use std::collections::BTreeSet;

use serde_json::{Map, Value};

/// The pack files `describe` knows, as authors name them, and the schema each one uses.
const FILES: &[(&str, &str)] = &[
    ("pack.json", "pack.schema.json"),
    ("aliases.yaml", "aliases.schema.json"),
    ("briefings.yaml", "briefings.schema.json"),
    ("cdu.yaml", "cdu.schema.json"),
    ("controls.yaml", "controls.schema.json"),
    ("faults.yaml", "faults.schema.json"),
    ("flight.yaml", "flight.schema.json"),
    ("glossary.yaml", "glossary.schema.json"),
    ("labels.yaml", "labels.schema.json"),
    ("lights.yaml", "lights.schema.json"),
    ("messages.yaml", "messages.schema.json"),
    ("notes.yaml", "notes.schema.json"),
    ("panel-states.yaml", "panel-states.schema.json"),
    ("patches.yaml", "patches.schema.json"),
    ("phases.yaml", "phases.schema.json"),
    ("lists/<name>.yaml", "checklist.schema.json"),
    ("panels/<name>.yaml", "panel.schema.json"),
];

/// One part of a file: the file itself, or a kind of entry in it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Part {
    pub name: String,
    pub description: Option<String>,
    pub fields: Vec<Field>,
    /// For a part that is one of a set of words, each word and what it means.
    pub values: Vec<(String, Option<String>)>,
}

/// One field of a part.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Field {
    pub name: String,
    /// The value it takes, in words: `text`, `list of FlightField`, `one of a, b`.
    pub kind: String,
    pub required: bool,
    pub default: Option<String>,
    pub description: Option<String>,
}

/// A file's description: the name asked for, its schema's file name and schema, and its parts.
#[derive(Debug, Clone)]
pub struct Description {
    pub file: String,
    pub schema_file: &'static str,
    pub schema: Value,
    pub parts: Vec<Part>,
}

/// The names `describe` knows, for the message when it doesn't know one.
pub fn known_files() -> Vec<&'static str> {
    FILES.iter().map(|(name, _)| *name).collect()
}

/// The schema file for a pack file named `name`: `flight.yaml`, `pack.json`, a list file under
/// `lists/` or a panel file under `panels/`, with or without its folder or extension.
pub fn schema_file_for(name: &str) -> Option<&'static str> {
    let name = name.replace('\\', "/");
    let mut parts = name.rsplit('/');
    let base = parts.next().unwrap_or_default();
    let folder = parts.next().unwrap_or_default();
    let stem = base
        .strip_suffix(".yaml")
        .or_else(|| base.strip_suffix(".yml"))
        .or_else(|| base.strip_suffix(".json"))
        .unwrap_or(base);
    match (folder, stem) {
        ("lists", _) | (_, "checklist" | "list") => Some("checklist.schema.json"),
        ("panels", _) | (_, "panel") => Some("panel.schema.json"),
        (_, "pack") => Some("pack.schema.json"),
        _ => FILES
            .iter()
            .map(|(_, schema)| *schema)
            .find(|schema| schema.strip_suffix(".schema.json") == Some(stem)),
    }
}

/// The fields of the pack file `name`, or the names `describe` knows when it doesn't know it.
pub fn describe(name: &str) -> Result<Description, Vec<&'static str>> {
    let schema_file = schema_file_for(name).ok_or_else(known_files)?;
    let text = crate::schema::all()
        .into_iter()
        .find(|(file, _)| *file == schema_file)
        .map(|(_, json)| json)
        .ok_or_else(known_files)?;
    let schema: Value = serde_json::from_str(&text).map_err(|_| known_files())?;
    let parts = parts(&schema);
    Ok(Description {
        file: name.to_owned(),
        schema_file,
        schema,
        parts,
    })
}

/// The file's own part, then each definition it uses, in the order they are first named.
fn parts(schema: &Value) -> Vec<Part> {
    let empty = Map::new();
    let defs = schema
        .get("$defs")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let title = schema
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("file");
    let mut out = vec![part(title, schema)];
    let mut queue: Vec<String> = refs_in(schema);
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut i = 0;
    while i < queue.len() {
        let name = queue[i].clone();
        i += 1;
        if !seen.insert(name.clone()) {
            continue;
        }
        if let Some(def) = defs.get(&name) {
            out.push(part(&name, def));
            queue.extend(refs_in(def));
        }
    }
    // Any definition nothing names still has its fields listed.
    for (name, def) in defs {
        if seen.insert(name.clone()) {
            out.push(part(name, def));
        }
    }
    out
}

fn part(name: &str, node: &Value) -> Part {
    let required: BTreeSet<&str> = node
        .get("required")
        .and_then(Value::as_array)
        .map(|r| r.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let fields = node
        .get("properties")
        .and_then(Value::as_object)
        .map(|props| {
            props
                .iter()
                .map(|(field, p)| Field {
                    name: field.clone(),
                    kind: kind(p),
                    required: required.contains(field.as_str()),
                    default: p.get("default").map(|d| match d {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    }),
                    description: text(p),
                })
                .collect()
        })
        .unwrap_or_default();
    Part {
        name: name.to_owned(),
        description: text(node),
        fields,
        values: values(node),
    }
}

fn text(node: &Value) -> Option<String> {
    node.get("description")
        .and_then(Value::as_str)
        .map(|d| d.split_whitespace().collect::<Vec<_>>().join(" "))
}

/// The words a part may be, with what each means: `enum`, or `oneOf` of `const`s.
fn values(node: &Value) -> Vec<(String, Option<String>)> {
    let word = |v: &Value| v.as_str().map_or_else(|| v.to_string(), str::to_owned);
    if let Some(list) = node.get("enum").and_then(Value::as_array) {
        return list.iter().map(|v| (word(v), None)).collect();
    }
    node.get("oneOf")
        .and_then(Value::as_array)
        .map(|alts| {
            alts.iter()
                .flat_map(|alt| {
                    let described = text(alt);
                    let words: Vec<Value> = match (alt.get("const"), alt.get("enum")) {
                        (Some(c), _) => vec![c.clone()],
                        (None, Some(Value::Array(list))) => list.clone(),
                        _ => Vec::new(),
                    };
                    words
                        .into_iter()
                        .map(move |w| (word(&w), described.clone()))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// What a field takes, in words.
fn kind(node: &Value) -> String {
    if let Some(r) = node.get("$ref").and_then(Value::as_str) {
        return r.rsplit('/').next().unwrap_or(r).to_owned();
    }
    for key in ["anyOf", "oneOf", "allOf"] {
        if let Some(alts) = node.get(key).and_then(Value::as_array) {
            let kinds: Vec<String> = alts
                .iter()
                .filter(|a| a.get("type").and_then(Value::as_str) != Some("null"))
                .map(kind)
                .collect();
            if !kinds.is_empty() {
                return kinds.join(" or ");
            }
        }
    }
    if let Some(list) = node.get("enum").and_then(Value::as_array) {
        let words: Vec<String> = list
            .iter()
            .filter(|v| !v.is_null())
            .map(|v| v.as_str().map_or_else(|| v.to_string(), str::to_owned))
            .collect();
        return format!("one of {}", words.join(", "));
    }
    if let Some(c) = node.get("const") {
        return c.as_str().map_or_else(|| c.to_string(), str::to_owned);
    }
    let types: Vec<&str> = match node.get("type") {
        Some(Value::String(t)) => vec![t.as_str()],
        Some(Value::Array(ts)) => ts
            .iter()
            .filter_map(Value::as_str)
            .filter(|t| *t != "null")
            .collect(),
        _ => Vec::new(),
    };
    match types.as_slice() {
        ["array"] => format!(
            "list of {}",
            node.get("items").map_or_else(|| "values".to_owned(), kind)
        ),
        ["object"] => match node.get("additionalProperties") {
            Some(v) if v.is_object() => format!("map of {}", kind(v)),
            _ => "map".to_owned(),
        },
        ["string"] => "text".to_owned(),
        ["integer"] => "whole number".to_owned(),
        ["number"] => "number".to_owned(),
        ["boolean"] => "true or false".to_owned(),
        [] => "any value".to_owned(),
        many => many.join(" or "),
    }
}

/// Every definition a node names, in order.
fn refs_in(node: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![node];
    // Depth first, children in order: a stack of the remaining nodes, last child pushed first.
    while let Some(n) = stack.pop() {
        match n {
            Value::Object(map) => {
                if let Some(r) = map.get("$ref").and_then(Value::as_str) {
                    out.push(r.rsplit('/').next().unwrap_or(r).to_owned());
                }
                for (k, v) in map.iter().rev() {
                    if k != "$defs" {
                        stack.push(v);
                    }
                }
            }
            Value::Array(list) => stack.extend(list.iter().rev()),
            _ => {}
        }
    }
    out
}

/// The description as text, the way `involo-pack describe` prints it.
pub fn render(d: &Description) -> String {
    use std::fmt::Write as _;
    let mut out = String::new();
    let _ = writeln!(out, "{} (schemas/{})", d.file, d.schema_file);
    for (n, part) in d.parts.iter().enumerate() {
        out.push('\n');
        if n == 0 {
            let _ = writeln!(out, "The file: {}", part.name);
        } else {
            let _ = writeln!(out, "{}", part.name);
        }
        if let Some(desc) = &part.description {
            let _ = writeln!(out, "  {desc}");
        }
        for f in &part.fields {
            let mut line = format!("  - {}: {}", f.name, f.kind);
            if f.required {
                line.push_str(", required");
            }
            if let Some(default) = &f.default {
                let _ = write!(line, ", default {default}");
            }
            let _ = writeln!(out, "{line}");
            if let Some(desc) = &f.description {
                let _ = writeln!(out, "      {desc}");
            }
        }
        for (word, desc) in &part.values {
            match desc {
                Some(desc) => {
                    let _ = writeln!(out, "  - `{word}`: {desc}");
                }
                None => {
                    let _ = writeln!(out, "  - `{word}`");
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    /// Every field name in a schema: the file's own and each definition's.
    fn schema_fields(schema: &Value) -> BTreeSet<(String, String)> {
        let mut out = BTreeSet::new();
        let title = schema["title"].as_str().unwrap().to_owned();
        for f in schema["properties"].as_object().into_iter().flatten() {
            out.insert((title.clone(), f.0.clone()));
        }
        for (def, node) in schema["$defs"].as_object().into_iter().flatten() {
            for f in node["properties"].as_object().into_iter().flatten() {
                out.insert((def.clone(), f.0.clone()));
            }
        }
        out
    }

    #[test]
    fn lists_every_field_of_every_file_as_its_schema_has_them() {
        for name in known_files() {
            let d = describe(name).unwrap();
            let listed: BTreeSet<(String, String)> = d
                .parts
                .iter()
                .flat_map(|p| p.fields.iter().map(|f| (p.name.clone(), f.name.clone())))
                .collect();
            assert_eq!(listed, schema_fields(&d.schema), "{name}");
        }
    }

    #[test]
    fn describes_flight_yaml_with_its_types_and_required_fields() {
        let d = describe("flight.yaml").unwrap();
        assert_eq!(d.schema_file, "flight.schema.json");
        let file = &d.parts[0];
        assert_eq!(file.name, "FlightFile");
        let fields = file.fields.iter().find(|f| f.name == "fields").unwrap();
        assert_eq!(fields.kind, "list of FlightField");
        assert!(fields.required);
        assert!(d.parts.iter().any(|p| p.name == "FlightField"));
        let text = render(&d);
        assert!(
            text.starts_with("flight.yaml (schemas/flight.schema.json)\n"),
            "{text}"
        );
        assert!(
            text.contains("  - fields: list of FlightField, required\n"),
            "{text}"
        );
    }

    #[test]
    fn knows_files_by_folder_or_name_and_lists_the_names_for_one_it_doesnt_know() {
        assert_eq!(
            schema_file_for("lists/before-start.yaml"),
            Some("checklist.schema.json")
        );
        assert_eq!(
            schema_file_for("panels\\overhead.yaml"),
            Some("panel.schema.json")
        );
        assert_eq!(
            schema_file_for("my-pack/pack.json"),
            Some("pack.schema.json")
        );
        assert_eq!(
            schema_file_for("panel-states"),
            Some("panel-states.schema.json")
        );
        let known = describe("weather.yaml").unwrap_err();
        assert!(known.contains(&"flight.yaml") && known.contains(&"lists/<name>.yaml"));
    }
}
