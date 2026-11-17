// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The JSON the interface receives (decision 0029, Names). Pack files and their fields are
//! snake_case, as authors write them; the app's own saved data is camelCase. A host hands every
//! value to the interface through [`to_interface_json`], which writes struct field names in
//! camelCase, so the interface reads one case. Only field names change: map keys (ids, flight
//! fields) and values (enum names, text) are written as they are. App data is camelCase already,
//! so it comes back from the interface unchanged and saved formats do not move.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::ser::{
    Serialize, SerializeMap, SerializeSeq, SerializeStruct, SerializeStructVariant, SerializeTuple,
    SerializeTupleStruct, SerializeTupleVariant, Serializer,
};

/// A value as the interface receives it: JSON with camelCase field names.
pub fn to_interface_json<T: Serialize + ?Sized>(value: &T) -> serde_json::Result<String> {
    serde_json::to_string(&Camel(value))
}

/// A snake_case field name in camelCase ("show_if" is "showIf"); other names are unchanged.
fn camel_case(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut upper = false;
    for c in name.chars() {
        if c == '_' && !out.is_empty() {
            upper = true;
        } else if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

/// The camelCase form of a field name, kept for the life of the program: serde takes field
/// names as `&'static str`, and a program has a fixed set of them.
fn field(name: &'static str) -> &'static str {
    static NAMES: OnceLock<Mutex<HashMap<&'static str, &'static str>>> = OnceLock::new();
    if !name.contains('_') {
        return name;
    }
    let mut names = NAMES
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    names
        .entry(name)
        .or_insert_with(|| Box::leak(camel_case(name).into_boxed_str()))
}

/// A value whose struct field names are written in camelCase, at every depth.
struct Camel<'a, T: ?Sized>(&'a T);

impl<T: Serialize + ?Sized> Serialize for Camel<'_, T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(CamelSerializer(serializer))
    }
}

/// Passes everything to the serializer it wraps, renaming struct fields on the way.
struct CamelSerializer<S>(S);

/// A compound value's serializer, wrapped so its elements are renamed too.
struct Compound<C>(C);

impl<S: Serializer> Serializer for CamelSerializer<S> {
    type Ok = S::Ok;
    type Error = S::Error;
    type SerializeSeq = Compound<S::SerializeSeq>;
    type SerializeTuple = Compound<S::SerializeTuple>;
    type SerializeTupleStruct = Compound<S::SerializeTupleStruct>;
    type SerializeTupleVariant = Compound<S::SerializeTupleVariant>;
    type SerializeMap = Compound<S::SerializeMap>;
    type SerializeStruct = Compound<S::SerializeStruct>;
    type SerializeStructVariant = Compound<S::SerializeStructVariant>;

    fn serialize_bool(self, v: bool) -> Result<S::Ok, S::Error> {
        self.0.serialize_bool(v)
    }
    fn serialize_i8(self, v: i8) -> Result<S::Ok, S::Error> {
        self.0.serialize_i8(v)
    }
    fn serialize_i16(self, v: i16) -> Result<S::Ok, S::Error> {
        self.0.serialize_i16(v)
    }
    fn serialize_i32(self, v: i32) -> Result<S::Ok, S::Error> {
        self.0.serialize_i32(v)
    }
    fn serialize_i64(self, v: i64) -> Result<S::Ok, S::Error> {
        self.0.serialize_i64(v)
    }
    fn serialize_i128(self, v: i128) -> Result<S::Ok, S::Error> {
        self.0.serialize_i128(v)
    }
    fn serialize_u8(self, v: u8) -> Result<S::Ok, S::Error> {
        self.0.serialize_u8(v)
    }
    fn serialize_u16(self, v: u16) -> Result<S::Ok, S::Error> {
        self.0.serialize_u16(v)
    }
    fn serialize_u32(self, v: u32) -> Result<S::Ok, S::Error> {
        self.0.serialize_u32(v)
    }
    fn serialize_u64(self, v: u64) -> Result<S::Ok, S::Error> {
        self.0.serialize_u64(v)
    }
    fn serialize_u128(self, v: u128) -> Result<S::Ok, S::Error> {
        self.0.serialize_u128(v)
    }
    fn serialize_f32(self, v: f32) -> Result<S::Ok, S::Error> {
        self.0.serialize_f32(v)
    }
    fn serialize_f64(self, v: f64) -> Result<S::Ok, S::Error> {
        self.0.serialize_f64(v)
    }
    fn serialize_char(self, v: char) -> Result<S::Ok, S::Error> {
        self.0.serialize_char(v)
    }
    fn serialize_str(self, v: &str) -> Result<S::Ok, S::Error> {
        self.0.serialize_str(v)
    }
    fn serialize_bytes(self, v: &[u8]) -> Result<S::Ok, S::Error> {
        self.0.serialize_bytes(v)
    }
    fn serialize_none(self) -> Result<S::Ok, S::Error> {
        self.0.serialize_none()
    }
    fn serialize_some<T: Serialize + ?Sized>(self, value: &T) -> Result<S::Ok, S::Error> {
        self.0.serialize_some(&Camel(value))
    }
    fn serialize_unit(self) -> Result<S::Ok, S::Error> {
        self.0.serialize_unit()
    }
    fn serialize_unit_struct(self, name: &'static str) -> Result<S::Ok, S::Error> {
        self.0.serialize_unit_struct(name)
    }
    fn serialize_unit_variant(
        self,
        name: &'static str,
        index: u32,
        variant: &'static str,
    ) -> Result<S::Ok, S::Error> {
        self.0.serialize_unit_variant(name, index, variant)
    }
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        name: &'static str,
        value: &T,
    ) -> Result<S::Ok, S::Error> {
        self.0.serialize_newtype_struct(name, &Camel(value))
    }
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        name: &'static str,
        index: u32,
        variant: &'static str,
        value: &T,
    ) -> Result<S::Ok, S::Error> {
        self.0
            .serialize_newtype_variant(name, index, variant, &Camel(value))
    }
    fn serialize_seq(self, len: Option<usize>) -> Result<Self::SerializeSeq, S::Error> {
        self.0.serialize_seq(len).map(Compound)
    }
    fn serialize_tuple(self, len: usize) -> Result<Self::SerializeTuple, S::Error> {
        self.0.serialize_tuple(len).map(Compound)
    }
    fn serialize_tuple_struct(
        self,
        name: &'static str,
        len: usize,
    ) -> Result<Self::SerializeTupleStruct, S::Error> {
        self.0.serialize_tuple_struct(name, len).map(Compound)
    }
    fn serialize_tuple_variant(
        self,
        name: &'static str,
        index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeTupleVariant, S::Error> {
        self.0
            .serialize_tuple_variant(name, index, variant, len)
            .map(Compound)
    }
    fn serialize_map(self, len: Option<usize>) -> Result<Self::SerializeMap, S::Error> {
        self.0.serialize_map(len).map(Compound)
    }
    fn serialize_struct(
        self,
        name: &'static str,
        len: usize,
    ) -> Result<Self::SerializeStruct, S::Error> {
        self.0.serialize_struct(name, len).map(Compound)
    }
    fn serialize_struct_variant(
        self,
        name: &'static str,
        index: u32,
        variant: &'static str,
        len: usize,
    ) -> Result<Self::SerializeStructVariant, S::Error> {
        self.0
            .serialize_struct_variant(name, index, variant, len)
            .map(Compound)
    }
    fn is_human_readable(&self) -> bool {
        self.0.is_human_readable()
    }
}

impl<C: SerializeSeq> SerializeSeq for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), C::Error> {
        self.0.serialize_element(&Camel(value))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

impl<C: SerializeTuple> SerializeTuple for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_element<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), C::Error> {
        self.0.serialize_element(&Camel(value))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

impl<C: SerializeTupleStruct> SerializeTupleStruct for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), C::Error> {
        self.0.serialize_field(&Camel(value))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

impl<C: SerializeTupleVariant> SerializeTupleVariant for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_field<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), C::Error> {
        self.0.serialize_field(&Camel(value))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

/// Map keys are data (ids, flight fields) and stay as they are; values are renamed inside.
impl<C: SerializeMap> SerializeMap for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_key<T: Serialize + ?Sized>(&mut self, key: &T) -> Result<(), C::Error> {
        self.0.serialize_key(key)
    }
    fn serialize_value<T: Serialize + ?Sized>(&mut self, value: &T) -> Result<(), C::Error> {
        self.0.serialize_value(&Camel(value))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

impl<C: SerializeStruct> SerializeStruct for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_field<T: Serialize + ?Sized>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<(), C::Error> {
        self.0.serialize_field(field(key), &Camel(value))
    }
    fn skip_field(&mut self, key: &'static str) -> Result<(), C::Error> {
        self.0.skip_field(field(key))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

impl<C: SerializeStructVariant> SerializeStructVariant for Compound<C> {
    type Ok = C::Ok;
    type Error = C::Error;
    fn serialize_field<T: Serialize + ?Sized>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<(), C::Error> {
        self.0.serialize_field(field(key), &Camel(value))
    }
    fn skip_field(&mut self, key: &'static str) -> Result<(), C::Error> {
        self.0.skip_field(field(key))
    }
    fn end(self) -> Result<C::Ok, C::Error> {
        self.0.end()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde::Serialize;
    use serde_json::{Value, json};

    use super::*;

    #[derive(Serialize)]
    struct Inner {
        look_for: &'static str,
    }

    #[derive(Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    enum Tagged {
        ToggleSwitch { short_title: &'static str },
    }

    #[derive(Serialize)]
    struct Outer {
        show_if: Option<Inner>,
        items: Vec<Inner>,
        by_id: BTreeMap<&'static str, Inner>,
        kind: Tagged,
        already_camel: u8,
        #[serde(rename = "migratedFrom")]
        migrated_from: u8,
    }

    fn interface(value: &impl Serialize) -> Value {
        serde_json::from_str(&to_interface_json(value).unwrap()).unwrap()
    }

    #[test]
    fn struct_fields_become_camel_case_at_every_depth_and_nothing_else_changes() {
        let value = Outer {
            show_if: Some(Inner { look_for: "a_b" }),
            items: vec![Inner { look_for: "x" }],
            by_id: BTreeMap::from([("center_tank", Inner { look_for: "y" })]),
            kind: Tagged::ToggleSwitch { short_title: "S" },
            already_camel: 1,
            migrated_from: 2,
        };
        assert_eq!(
            interface(&value),
            json!({
                "showIf": {"lookFor": "a_b"},
                "items": [{"lookFor": "x"}],
                // A map key is data (an option id here): kept as it is.
                "byId": {"center_tank": {"lookFor": "y"}},
                // An enum's name is a value: kept as it is.
                "kind": {"kind": "toggle_switch", "shortTitle": "S"},
                "alreadyCamel": 1,
                "migratedFrom": 2,
            })
        );
    }

    /// App data is camelCase already, so what the interface receives is exactly what it saves and
    /// sends back: saved formats do not move.
    #[test]
    fn app_data_passes_through_unchanged() {
        // Actions only come in from the interface; they are read, never written.
        use crate::{Action, LogEdit, Settings, new_flight, new_log};
        let pack = crate::test_support::ifly_pack();
        let mut flight = new_flight(&pack);
        flight.panel_state = Some("gpu".into());
        flight
            .values
            .insert(involo_checklist_core::FillField::WeightUnit, "KG".into());
        let flight = crate::apply(
            &pack,
            flight,
            Action::Answer {
                option: "center_tank".into(),
                value: "more".into(),
                by: crate::AnswerSource::Plan,
            },
        )
        .unwrap_or_else(|_| new_flight(&pack));
        let same = |v: &dyn erased::Json| assert_eq!(v.interface(), v.plain());
        same(&flight);
        same(&Settings::default());
        same(&new_log());
        same(&LogEdit::DeleteFlight { id: "x".into() });
        same(&crate::load_flight("{}"));
    }

    /// Both encodings of one value, for the test above.
    mod erased {
        pub trait Json {
            fn interface(&self) -> String;
            fn plain(&self) -> String;
        }
        impl<T: serde::Serialize> Json for T {
            fn interface(&self) -> String {
                super::to_interface_json(self).unwrap()
            }
            fn plain(&self) -> String {
                serde_json::to_string(self).unwrap()
            }
        }
    }

    #[test]
    fn camel_case_of_field_names() {
        assert_eq!(camel_case("if_not_detail"), "ifNotDetail");
        assert_eq!(camel_case("lit_at"), "litAt");
        assert_eq!(camel_case("format"), "format");
        assert_eq!(camel_case("migratedFrom"), "migratedFrom");
        assert_eq!(field("show_if"), "showIf");
        assert!(
            std::ptr::eq(field("show_if"), field("show_if")),
            "kept once"
        );
    }
}
