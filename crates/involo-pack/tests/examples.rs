// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The example packs in `packs/examples` (decision 0030, #108): invented aircraft that keep the app
//! from depending on one. Each checks with no warnings and builds; the variant's built pack records
//! its parent; and together they use every field the pack format has, so a new field needs a use
//! in an example.

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::path::{Path, PathBuf};

    use involo_pack::{resolve, validate_pack};
    use serde_json::{Map, Value};

    const EXAMPLES: [&str; 3] = ["example-twin", "example-sidestick", "example-twin-lr"];

    /// Fields no author writes: `pack build` writes them into the built pack.
    const BUILD_ONLY: [(&str, &str, &str); 4] = [
        ("pack", "root", "contentHash"),
        ("pack", "root", "resolved"),
        ("pack", "ResolvedParent", "id"),
        ("pack", "ResolvedParent", "version"),
    ];

    fn examples_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/examples")
    }

    #[test]
    fn each_example_checks_with_no_warnings() {
        for id in EXAMPLES {
            let built =
                resolve(&examples_dir().join(id), &[]).unwrap_or_else(|e| panic!("{id}: {e}"));
            let issues = validate_pack(&built.pack);
            let shown: Vec<String> = issues.iter().map(ToString::to_string).collect();
            assert!(shown.is_empty(), "{id}:\n{}", shown.join("\n"));
        }
    }

    #[test]
    fn the_variant_records_its_parent() {
        let built = resolve(&examples_dir().join("example-twin-lr"), &[]).unwrap();
        let parents: Vec<(String, String)> = built
            .pack
            .manifest
            .resolved
            .iter()
            .map(|p| (p.id.clone(), p.version.to_string()))
            .collect();
        assert_eq!(parents, [("example-twin".to_owned(), "0.1.0".to_owned())]);
    }

    /// The schema a pack file is written against, by the manifest key that names it.
    const FILE_KINDS: [(&str, &str); 15] = [
        ("checklists", "checklist"),
        ("panels", "panel"),
        ("phases", "phases"),
        ("controls", "controls"),
        ("notes", "notes"),
        ("lights", "lights"),
        ("faults", "faults"),
        ("glossary", "glossary"),
        ("briefings", "briefings"),
        ("panelStates", "panel-states"),
        ("cdu", "cdu"),
        ("aliases", "aliases"),
        ("flight", "flight"),
        ("messages", "messages"),
        ("patches", "patches"),
    ];

    /// Each example's files as JSON values, by schema name.
    fn example_files() -> BTreeMap<&'static str, Vec<Value>> {
        let mut files: BTreeMap<&'static str, Vec<Value>> = BTreeMap::new();
        for id in EXAMPLES {
            let dir = examples_dir().join(id);
            let manifest: Value =
                serde_json::from_str(&std::fs::read_to_string(dir.join("pack.json")).unwrap())
                    .unwrap();
            for (key, schema) in FILE_KINDS {
                let names = match manifest.get(key) {
                    Some(Value::String(name)) => vec![name.clone()],
                    Some(Value::Array(names)) => names
                        .iter()
                        .filter_map(|n| n.as_str().map(str::to_owned))
                        .collect(),
                    _ => continue,
                };
                for name in names {
                    let text = std::fs::read_to_string(dir.join(&name)).unwrap();
                    let value: Value = serde_saphyr::from_str(&text)
                        .unwrap_or_else(|e| panic!("{id}/{name}: {e}"));
                    files.entry(schema).or_default().push(value);
                }
            }
            if let Some(labels) = manifest.get("labels").and_then(Value::as_str) {
                let text = std::fs::read_to_string(dir.join(labels)).unwrap();
                files
                    .entry("labels")
                    .or_default()
                    .push(serde_saphyr::from_str(&text).unwrap());
            }
            files.entry("pack").or_default().push(manifest);
        }
        files
    }

    /// An object schema's field names.
    fn props(shape: &Value) -> BTreeSet<&str> {
        shape["properties"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect()
    }

    /// A JSON Schema's definitions, and the object shapes in it: each `(name, object schema)`, named
    /// by its definition, with `#n` for the n-th inline alternative of a union.
    struct Schema<'a> {
        defs: &'a Map<String, Value>,
    }

    impl<'a> Schema<'a> {
        fn resolve(&self, mut node: &'a Value) -> &'a Value {
            while let Some(name) = node.get("$ref").and_then(Value::as_str) {
                node = &self.defs[name.rsplit('/').next().unwrap()];
            }
            node
        }

        fn shapes(&self, node: &'a Value, name: &str, out: &mut Vec<(String, &'a Value)>) {
            if let Some(r) = node.get("$ref").and_then(Value::as_str) {
                let def = r.rsplit('/').next().unwrap();
                return self.shapes(&self.defs[def], def, out);
            }
            if node.get("properties").is_some() {
                out.push((name.to_owned(), node));
            }
            for key in ["oneOf", "anyOf", "allOf"] {
                for (i, alt) in node
                    .get(key)
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .enumerate()
                {
                    let inline = alt.get("$ref").is_none() && alt.get("properties").is_some();
                    let alt_name = if inline {
                        format!("{name}#{i}")
                    } else {
                        name.to_owned()
                    };
                    self.shapes(alt, &alt_name, out);
                }
            }
        }

        fn alternatives(&self, node: &'a Value) -> Vec<&'a Value> {
            let node = self.resolve(node);
            let mut all = vec![node];
            for key in ["oneOf", "anyOf"] {
                for alt in node
                    .get(key)
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    all.push(self.resolve(alt));
                }
            }
            all
        }

        /// Marks the fields `data` uses, by shape, walking its schema alongside it.
        fn walk(
            &self,
            data: &Value,
            node: &'a Value,
            used: &mut BTreeMap<String, BTreeSet<String>>,
        ) {
            match data {
                Value::Array(items) => {
                    if let Some(schema) = self
                        .alternatives(node)
                        .into_iter()
                        .find_map(|n| n.get("items"))
                    {
                        for item in items {
                            self.walk(item, schema, used);
                        }
                    }
                }
                Value::Object(object) => {
                    let mut shapes = Vec::new();
                    self.shapes(node, "?", &mut shapes);
                    let keys: BTreeSet<&str> = object.keys().map(String::as_str).collect();
                    let fits = shapes.iter().find(|(_, shape)| {
                        let required: BTreeSet<&str> = shape
                            .get("required")
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .filter_map(Value::as_str)
                            .collect();
                        keys.is_subset(&props(shape)) && required.is_subset(&keys)
                    });
                    let Some((name, shape)) = fits.or_else(|| {
                        shapes
                            .iter()
                            .find(|(_, shape)| !keys.is_disjoint(&props(shape)))
                    }) else {
                        // A map: each value has the same schema.
                        if let Some(values) = self
                            .alternatives(node)
                            .into_iter()
                            .find_map(|n| n.get("additionalProperties").filter(|v| v.is_object()))
                        {
                            for value in object.values() {
                                self.walk(value, values, used);
                            }
                        }
                        return;
                    };
                    let entry = used.entry(name.clone()).or_default();
                    entry.extend(object.keys().cloned());
                    for (key, value) in object {
                        if let Some(schema) = shape["properties"].get(key) {
                            self.walk(value, schema, used);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    #[test]
    fn the_examples_use_every_field_of_the_pack_format() {
        let files = example_files();
        let mut missing = Vec::new();
        for (file, text) in involo_pack::schema::all() {
            let kind = file.trim_end_matches(".schema.json");
            let root: Value = serde_json::from_str(&text).unwrap();
            let empty = Map::new();
            let schema = Schema {
                defs: root
                    .get("$defs")
                    .and_then(Value::as_object)
                    .unwrap_or(&empty),
            };
            let mut fields: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
            let mut shapes = Vec::new();
            schema.shapes(&root, "root", &mut shapes);
            for (name, def) in schema.defs {
                schema.shapes(def, name, &mut shapes);
            }
            for (name, shape) in shapes {
                fields
                    .entry(name)
                    .or_default()
                    .extend(shape["properties"].as_object().unwrap().keys().cloned());
            }
            let mut used = BTreeMap::new();
            for data in files.get(kind).into_iter().flatten() {
                let mut found = BTreeMap::new();
                schema.walk(data, &root, &mut found);
                // The root shape is named "?" while walking: it is the file itself.
                for (name, keys) in found {
                    let name = if name == "?" { "root".to_owned() } else { name };
                    used.entry(name).or_insert_with(BTreeSet::new).extend(keys);
                }
            }
            for (shape, names) in &fields {
                for field in names {
                    let built = BUILD_ONLY.contains(&(kind, shape.as_str(), field.as_str()));
                    if !built && !used.get(shape).is_some_and(|u| u.contains(field)) {
                        missing.push(format!("{kind}: {shape}.{field}"));
                    }
                }
            }
        }
        assert!(
            missing.is_empty(),
            "fields no example pack uses (give each a use in packs/examples):\n{}",
            missing.join("\n")
        );
    }
}
