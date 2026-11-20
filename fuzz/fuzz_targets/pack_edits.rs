// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! A valid built pack (the example pack) with fuzzer-chosen edits: a value set, removed, copied
//! from elsewhere in the pack or made deep, so the install check and opening the pack see packs
//! that read as JSON and are wrong in every other way. Neither may panic, hang or run out of
//! memory.

#![no_main]

use std::sync::OnceLock;

use involo_app_core::{check_pack, load_pack};
use involo_pack::{FlatPack, load_pack_dir};
use libfuzzer_sys::arbitrary::{self, Arbitrary};
use libfuzzer_sys::fuzz_target;
use serde_json::Value;

/// The example pack, built as `involo-pack build` writes it.
fn example() -> &'static Value {
    static PACK: OnceLock<Value> = OnceLock::new();
    PACK.get_or_init(|| {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../packs/example-trainer");
        serde_json::to_value(FlatPack::built(
            load_pack_dir(&dir).expect("the example pack loads"),
        ))
        .expect("a built pack writes as JSON")
    })
}

#[derive(Arbitrary, Debug)]
enum New {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Text(String),
    /// A copy of the value at another place in the pack.
    CopyOf(Vec<u16>),
    /// The value wrapped this many times in a list.
    Deep(u8),
    EmptyList,
    EmptyMap,
}

#[derive(Arbitrary, Debug)]
enum Edit {
    Set(Vec<u16>, New),
    Remove(Vec<u16>),
    /// Repeats a list entry (or a map entry under a new key) this many times.
    Repeat(Vec<u16>, u8),
    Rename(Vec<u16>, String),
}

/// The value at `path`, each step picking a child by its position (modulo how many there are).
fn at<'a>(mut v: &'a mut Value, path: &[u16]) -> &'a mut Value {
    for &step in path {
        let n = match &*v {
            Value::Array(a) => a.len(),
            Value::Object(o) => o.len(),
            _ => 0,
        };
        if n == 0 {
            break;
        }
        let i = usize::from(step) % n;
        v = match v {
            Value::Array(a) => &mut a[i],
            Value::Object(o) => o.values_mut().nth(i).expect("in range"),
            _ => unreachable!(),
        };
    }
    v
}

/// The parent of the value at `path`, and the child's place in it.
fn parent<'a>(v: &'a mut Value, path: &[u16]) -> Option<(&'a mut Value, usize)> {
    let (last, rest) = path.split_last()?;
    let p = at(v, rest);
    let n = match &*p {
        Value::Array(a) => a.len(),
        Value::Object(o) => o.len(),
        _ => 0,
    };
    (n > 0).then(|| (p, usize::from(*last) % n))
}

fn apply(pack: &mut Value, edit: Edit) {
    match edit {
        Edit::Set(path, new) => {
            let value = match new {
                New::Null => Value::Null,
                New::Bool(b) => Value::Bool(b),
                New::Int(i) => Value::from(i),
                New::Float(f) => serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number),
                New::Text(s) => Value::String(s),
                New::CopyOf(from) => at(&mut pack.clone(), &from).clone(),
                New::Deep(n) => {
                    let mut v = at(pack, &path).clone();
                    for _ in 0..n {
                        v = Value::Array(vec![v]);
                    }
                    v
                }
                New::EmptyList => Value::Array(vec![]),
                New::EmptyMap => Value::Object(serde_json::Map::new()),
            };
            *at(pack, &path) = value;
        }
        Edit::Remove(path) => {
            if let Some((p, i)) = parent(pack, &path) {
                match p {
                    Value::Array(a) => {
                        a.remove(i);
                    }
                    Value::Object(o) => {
                        let key = o.keys().nth(i).cloned().expect("in range");
                        o.remove(&key);
                    }
                    _ => {}
                }
            }
        }
        Edit::Repeat(path, times) => {
            if let Some((p, i)) = parent(pack, &path) {
                match p {
                    Value::Array(a) => {
                        let v = a[i].clone();
                        for _ in 0..times {
                            a.insert(i, v.clone());
                        }
                    }
                    Value::Object(o) => {
                        let (k, v) = o
                            .iter()
                            .nth(i)
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .expect("in range");
                        for n in 0..times {
                            o.insert(format!("{k}{n}"), v.clone());
                        }
                    }
                    _ => {}
                }
            }
        }
        Edit::Rename(path, name) => {
            if let Some((Value::Object(o), i)) = parent(pack, &path) {
                let key = o.keys().nth(i).cloned().expect("in range");
                if let Some(v) = o.remove(&key) {
                    o.insert(name, v);
                }
            }
        }
    }
}

fuzz_target!(|edits: Vec<Edit>| {
    let mut pack = example().clone();
    for edit in edits.into_iter().take(16) {
        apply(&mut pack, edit);
    }
    let json = pack.to_string();
    let _ = check_pack(json.as_bytes(), None);
    let _ = load_pack(&json);
});
