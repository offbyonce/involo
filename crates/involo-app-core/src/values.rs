// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Flight values as steps show them (decision 0019): the text of each blank and a step's hint,
//! and the values a unit choice may take.

use std::collections::BTreeMap;

use involo_checklist_core::{FieldId, FlightField, ShowIn, SimbriefSource, Step};
use involo_pack::FlatPack;
use serde::Serialize;
use ts_rs::TS;

use crate::flight::Flight;

/// One part of the flight strip's summary ("RWY 16L"), and the field its pop-out focuses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StripPart {
    pub field: FieldId,
    pub text: String,
}

/// The pack's flight fields, in its order.
pub fn fields(pack: &FlatPack) -> impl Iterator<Item = &FlightField> {
    pack.content.flight.iter().flat_map(|f| &f.fields)
}

/// The pack's field with this id.
pub fn field<'a>(pack: &'a FlatPack, id: &FieldId) -> Option<&'a FlightField> {
    fields(pack).find(|f| f.id == id.as_str())
}

/// The pack's first field filled from this SimBrief source (the departure, for the log).
pub fn field_from(pack: &FlatPack, source: SimbriefSource) -> Option<&FlightField> {
    fields(pack).find(|f| f.simbrief.first() == Some(&source))
}

/// The flight strip's summary: the fields `show_in` the strip names, in the pack's order, each
/// only when known, written as its `strip` text says. A field that `join`s follows the part
/// before it (the destination after the departure), and the part keeps the first field of the
/// group, which its pop-out focuses.
pub fn strip(pack: &FlatPack, flight: &Flight) -> Vec<StripPart> {
    let mut out: Vec<StripPart> = vec![];
    // The field that starts the group the next joining field belongs to.
    let mut group: Option<&str> = None;
    for f in fields(pack).filter(|f| f.show_in.contains(&ShowIn::Strip)) {
        let text = f.strip.as_ref();
        let join = text.and_then(|t| t.join.as_deref());
        if join.is_none() {
            group = Some(f.id.as_str());
        }
        let Some(value) = flight
            .values
            .get(f.id.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let (prefix, suffix) = text.map_or(("", ""), |t| (t.prefix.as_str(), t.suffix.as_str()));
        let piece = format!("{prefix}{value}{suffix}");
        let head = group.unwrap_or(f.id.as_str());
        match (join, out.last_mut()) {
            (Some(sep), Some(last)) if last.field.as_str() == head => {
                last.text = format!("{}{sep}{piece}", last.text);
            }
            _ => out.push(StripPart {
                field: FieldId::new(head),
                text: piece,
            }),
        }
    }
    out
}

/// The last line of the flight's notes, for the strip, or empty.
pub fn last_note(flight: &Flight) -> String {
    flight
        .notes
        .trim()
        .lines()
        .last()
        .unwrap_or_default()
        .trim()
        .to_owned()
}

/// The values of the pack's calculated fields for this flight (decision 0033), by field id. A field
/// is left out when any field it reads has no value. Worked out on every read, never stored.
pub fn calculated(pack: &FlatPack, flight: &Flight) -> BTreeMap<FieldId, String> {
    let mut out = BTreeMap::new();
    for f in fields(pack).filter(|f| f.calculated.is_some()) {
        if let Some(v) = calculate(pack, flight, &f.id, 0) {
            out.insert(FieldId::new(f.id.as_str()), v);
        }
    }
    out
}

/// A field's value: typed or from a plan, or worked out when it is calculated. `depth` stops a
/// loop that `pack check` would have refused.
fn calculate(pack: &FlatPack, flight: &Flight, id: &str, depth: usize) -> Option<String> {
    let field = fields(pack).find(|f| f.id == id)?;
    let Some(calc) = &field.calculated else {
        return flight
            .values
            .get(id)
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
    };
    if depth > 16 {
        return None;
    }
    let number = |id: &str| -> Option<(f64, usize)> {
        let v = calculate(pack, flight, id, depth + 1)?;
        let v = v.replace(',', "");
        let n: f64 = v
            .trim_start_matches('+')
            .replace('\u{2212}', "-")
            .parse()
            .ok()?;
        let decimals = v.split_once('.').map_or(0, |(_, d)| d.len());
        n.is_finite().then_some((n, decimals))
    };
    if let Some(sc) = &calc.scale {
        let (n, _) = number(&sc.field)?;
        return (sc.scale > 0.0 && sc.step > 0.0)
            .then(|| crate::plans::rounded(n / sc.scale, sc.round, sc.step));
    }
    if let Some(t) = &calc.isa_temperature {
        let (level, _) = number(&t.level)?;
        let (deviation, _) = number(&t.deviation)?;
        let feet = level * 100.0;
        let standard = if feet < 36_089.0 {
            15.0 - 1.98 * feet / 1000.0
        } else {
            -56.5
        };
        let c = (standard + deviation).round();
        // No minus sign on zero.
        return Some(format!("{}", if c == 0.0 { 0.0 } else { c }));
    }
    if calc.sum.is_empty() {
        return None;
    }
    let mut total = 0.0;
    let mut decimals = 0;
    for id in &calc.sum {
        let (n, d) = number(id)?;
        total += n;
        decimals = decimals.max(d);
    }
    Some(format!("{total:.decimals$}"))
}

/// The key of a step's n-th blank (from 0) in [`Flight::blanks`].
pub fn blank_key(step: &Step, n: usize) -> String {
    format!("{}#{n}", step.id)
}

/// The text for each of a step's blanks: the pilot's entry for that blank, else the linked
/// flight value, else empty.
pub fn blank_values(flight: &Flight, step: &Step) -> Vec<String> {
    step.fill
        .iter()
        .enumerate()
        .map(|(n, field)| {
            flight
                .blanks
                .get(&blank_key(step, n))
                .or_else(|| flight.values.get(field))
                .cloned()
                .unwrap_or_default()
        })
        .collect()
}

/// A step's hint, as 3.0 built it: each part with a value, joined with " · ". Empty when no part
/// has a value.
pub fn hint(flight: &Flight, step: &Step) -> String {
    step.hint
        .iter()
        .filter_map(|h| {
            flight
                .values
                .get(&h.field)
                .filter(|v| !v.is_empty())
                .map(|v| format!("{}{v}", h.prefix))
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

/// The fields the Arrival data box asks for: those `show_in` it names, in the pack's order.
pub fn arrival_fields(pack: &FlatPack) -> Vec<&str> {
    fields(pack)
        .filter(|f| f.show_in.contains(&ShowIn::Arrival))
        .map(|f| f.id.as_str())
        .collect()
}

/// Whether a phase shows the Arrival data box: it is the first phase, in flight order, whose
/// steps have blanks for arrival values (for an airliner, usually the descent, as in 3.0).
pub fn asks_arrival<'a>(
    pack: &FlatPack,
    order: impl IntoIterator<Item = &'a str>,
    id: &str,
) -> bool {
    let arrival = arrival_fields(pack);
    let needs = |phase: &str| {
        pack.content
            .phases
            .iter()
            .flat_map(|p| &p.phases)
            .find(|p| p.id == phase)
            .into_iter()
            .flat_map(|p| &p.lists)
            .filter_map(|l| pack.lists.iter().find(|x| &x.id == l))
            .flat_map(|l| &l.steps)
            .any(|s| s.fill.iter().any(|f| arrival.contains(&f.as_str())))
    };
    order.into_iter().find(|p| needs(p)) == Some(id)
}

/// The values a choice field may take, or `None` for a field that takes any text.
pub fn allowed(field: &FlightField) -> Option<Vec<&str>> {
    (!field.choices.is_empty()).then(|| field.choices.iter().map(|c| c.value.as_str()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions::{Action, apply};
    use crate::flight::new_flight;
    use crate::test_support::ifly_pack;
    use involo_checklist_core::StepId;
    use involo_pack::FlatPack;

    fn step<'a>(pack: &'a FlatPack, id: &str) -> &'a Step {
        pack.lists
            .iter()
            .flat_map(|l| &l.steps)
            .find(|s| s.id.as_str() == id)
            .unwrap()
    }

    fn set(pack: &FlatPack, flight: Flight, field: FieldId, value: &str) -> Flight {
        let action = Action::SetValue {
            field,
            value: value.into(),
        };
        apply(pack, flight, action).unwrap()
    }

    #[test]
    fn the_top_of_climb_temperature_rounds_a_half_degree_away_from_zero() {
        let pack = ifly_pack();
        let oat = |level: &str, deviation: &str| {
            let mut flight = new_flight(&pack);
            flight.values.insert("cruise_level".into(), level.into());
            flight
                .values
                .insert("isa_deviation".into(), deviation.into());
            calculated(&pack, &flight).remove("top_of_climb_oat")
        };
        // Above 36,089 ft the standard atmosphere is -56.5 °C, so a whole-degree deviation lands
        // on a half degree, which the CDU rounds away from zero.
        assert_eq!(oat("370", "0").as_deref(), Some("-57"));
        assert_eq!(oat("370", "1").as_deref(), Some("-56"));
        assert_eq!(oat("390", "-2").as_deref(), Some("-59"));
        assert_eq!(oat("410", "57").as_deref(), Some("1"));
        assert_eq!(oat("410", "56").as_deref(), Some("-1"));
        // Below it, the board flight: FL350 at ISA +2.
        assert_eq!(oat("350", "2").as_deref(), Some("-52"));
    }

    #[test]
    fn a_blank_shows_the_pilots_entry_else_the_flight_value_else_nothing() {
        let pack = ifly_pack();
        let mcp = step(&pack, "ifly-737-max8.before-start.mcp-check");
        let flight = set(&pack, new_flight(&pack), FieldId::from("v2"), "145");
        assert_eq!(blank_values(&flight, mcp), ["145", "", ""]);
        let typed = apply(
            &pack,
            flight,
            Action::SetBlank {
                step: StepId::new("ifly-737-max8.before-start.mcp-check"),
                index: 0,
                value: "147".into(),
            },
        )
        .unwrap();
        assert_eq!(blank_values(&typed, mcp), ["147", "", ""]);
        // Emptying the entry brings the flight value back.
        let back = apply(
            &pack,
            typed,
            Action::SetBlank {
                step: StepId::new("ifly-737-max8.before-start.mcp-check"),
                index: 0,
                value: String::new(),
            },
        )
        .unwrap();
        assert_eq!(blank_values(&back, mcp), ["145", "", ""]);
    }

    #[test]
    fn a_hint_leaves_out_parts_with_no_value() {
        let pack = ifly_pack();
        let radios = step(&pack, "ifly-737-max8.preflight.radio-tuning-panels");
        let flight = new_flight(&pack);
        assert_eq!(hint(&flight, radios), "");
        let flight = set(
            &pack,
            flight,
            FieldId::from("departure_frequency"),
            "125.600",
        );
        assert_eq!(hint(&flight, radios), "DEP 125.600");
        let flight = set(&pack, flight, FieldId::from("ground_frequency"), "121.700");
        assert_eq!(hint(&flight, radios), "GND 121.700 · DEP 125.600");
    }

    #[test]
    fn the_strip_sums_up_the_clearance_as_3_0_did() {
        let pack = ifly_pack();
        let flight = new_flight(&pack);
        assert_eq!(strip(&pack, &flight), []);
        let mut flight = flight;
        for (f, v) in [
            (FieldId::from("destination"), "KSFO"),
            (FieldId::from("runway"), "16L"),
            (FieldId::from("sid"), "SUMMA2"),
            (FieldId::from("transition"), "SEA"),
            (FieldId::from("squawk"), "4521"),
        ] {
            flight = set(&pack, flight, f, v);
        }
        let texts: Vec<String> = strip(&pack, &flight).into_iter().map(|p| p.text).collect();
        assert_eq!(texts, ["KSFO", "RWY 16L", "SUMMA2.SEA", "SQK 4521"]);
        let flight = set(&pack, flight, FieldId::from("origin"), "KSEA");
        assert_eq!(strip(&pack, &flight)[0].text, "KSEA → KSFO");
        let notes = Action::SetNotes {
            notes: "Taxi via A\nClimb 7000 \n\n".into(),
        };
        let flight = apply(&pack, flight, notes).unwrap();
        assert_eq!(last_note(&flight), "Climb 7000");
    }

    #[test]
    fn the_arrival_box_shows_on_the_first_phase_needing_arrival_values() {
        let pack = ifly_pack();
        let order = ["before-start", "descent", "approach", "landing"];
        assert!(asks_arrival(&pack, order, "descent"));
        assert!(
            !asks_arrival(&pack, order, "landing"),
            "landing flaps come later"
        );
        assert!(!asks_arrival(&pack, order, "before-start"));
    }

    #[test]
    fn unit_choices_take_only_their_values_and_an_empty_value_removes() {
        let pack = ifly_pack();
        let flight = set(&pack, new_flight(&pack), FieldId::from("qnh_unit"), "hPa");
        assert_eq!(flight.values[&FieldId::from("qnh_unit")], "hPa");
        for (field, bad) in [
            (FieldId::from("qnh_unit"), "mb"),
            (FieldId::from("minimums_type"), "DH"),
            (FieldId::from("weight_unit"), "kg"),
        ] {
            let action = Action::SetValue {
                field: field.clone(),
                value: bad.into(),
            };
            assert!(
                apply(&pack, flight.clone(), action).is_err(),
                "{field:?} {bad}"
            );
        }
        let cleared = set(&pack, flight, FieldId::from("qnh_unit"), " ");
        assert!(!cleared.values.contains_key(&FieldId::from("qnh_unit")));
        // A space typed between words stays: the interface saves on every keystroke.
        let route = set(&pack, cleared, FieldId::from("route"), "SUMMA2 ");
        assert_eq!(route.values[&FieldId::from("route")], "SUMMA2 ");
    }

    #[test]
    fn blanks_must_exist_and_manual_is_not_a_flight_value() {
        let pack = ifly_pack();
        let flight = new_flight(&pack);
        let no_blank = Action::SetBlank {
            step: StepId::new("ifly-737-max8.before-start.mcp-check"),
            index: 3,
            value: "1".into(),
        };
        assert!(apply(&pack, flight.clone(), no_blank).is_err());
        let manual = Action::SetValue {
            field: FieldId::from("manual"),
            value: "1".into(),
        };
        assert!(apply(&pack, flight, manual).is_err());
    }

    #[test]
    fn a_field_the_pack_shows_in_the_strip_appears_there_in_the_pack_s_order() {
        let mut pack = ifly_pack();
        let fields = &mut pack.content.flight.as_mut().unwrap().fields;
        let mut flex = fields.iter().find(|f| f.id == "v1").unwrap().clone();
        flex.id = "flex_temperature".into();
        flex.show_in = vec![involo_checklist_core::ShowIn::Strip];
        flex.strip = Some(involo_checklist_core::StripText {
            prefix: "FLEX ".into(),
            suffix: "°".into(),
            join: None,
        });
        fields.insert(0, flex);
        let flight = set(
            &pack,
            new_flight(&pack),
            FieldId::from("flex_temperature"),
            "42",
        );
        let flight = set(&pack, flight, FieldId::from("runway"), "16L");
        let texts: Vec<String> = strip(&pack, &flight).into_iter().map(|p| p.text).collect();
        assert_eq!(texts, ["FLEX 42°", "RWY 16L"]);
    }
}
