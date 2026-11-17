// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! An answer a decision's option suggests from the flight's values (decision 0027): a planned
//! fuel weight, less what the rule subtracts (for the center tank: what the wing tanks hold),
//! above a line suggests one value, otherwise the other, and near the line it says so. The
//! pilot confirms or changes it.

use involo_checklist_core::{FillField, SuggestRule, Suggests, WeightUnit};
use involo_pack::FlatPack;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::flight::Flight;

const LB_PER_KG: f64 = 2.204_62;

/// The suggested answer and the amount it comes from, in the flight's own unit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Suggestion {
    pub value: String,
    /// What is left after the rule's subtraction, never below 0 ("3,140").
    pub amount: u32,
    /// "lb" or "kg": the flight's weight unit.
    pub unit: String,
    /// Within the rule's `near` of the line: worth checking the gauge.
    pub near: bool,
}

/// The answer the option's rule suggests for this flight, or none: no rule, no value to read, or
/// a rule whose subtraction is still 0 (not yet known).
pub fn suggestion(pack: &FlatPack, flight: &Flight, option: &str) -> Option<Suggestion> {
    let rule = pack
        .content
        .phases
        .iter()
        .flat_map(|p| &p.options)
        .find(|o| o.id == option)
        .and_then(|o| match &o.suggests {
            Some(Suggests::Rule(rule)) => Some(rule),
            _ => None,
        })?;
    from_rule(rule, flight)
}

/// A whole number of the flight's unit, never below 0; none for a figure no plan gives.
fn whole(x: f64) -> Option<u32> {
    let x = x.max(0.0).round();
    if x > f64::from(u32::MAX) {
        return None;
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    Some(x as u32)
}

fn from_rule(rule: &SuggestRule, flight: &Flight) -> Option<Suggestion> {
    if rule.minus == 0 {
        return None;
    }
    let amount: f64 = flight
        .values
        .get(&rule.field)?
        .replace(',', "")
        .trim()
        .parse()
        .ok()
        .filter(|n: &f64| n.is_finite() && *n >= 0.0)?;
    let kg_flight = flight
        .values
        .get(&FillField::WeightUnit)
        .is_some_and(|u| u.eq_ignore_ascii_case("KG"));
    // Everything in the rule's unit, then the amount back in the flight's.
    let to_rule = match (kg_flight, rule.unit) {
        (true, WeightUnit::Lb) => LB_PER_KG,
        (false, WeightUnit::Kg) => 1.0 / LB_PER_KG,
        _ => 1.0,
    };
    let left = (amount * to_rule - f64::from(rule.minus)).max(0.0);
    // The amount the pilot sees, whole, in the flight's unit; the line and margin in that unit
    // too (the rule's own, or its other-unit line), so the suggestion always agrees with the
    // figure shown beside it.
    let shown = whole(left / to_rule)?;
    let same_unit = (rule.unit == WeightUnit::Kg) == kg_flight;
    let (line, margin) = match (&rule.other_unit, same_unit) {
        (_, true) => (f64::from(rule.more_than), f64::from(rule.near)),
        (Some(other), false) => (f64::from(other.more_than), f64::from(other.near)),
        (None, false) => (
            f64::from(rule.more_than) / to_rule,
            f64::from(rule.near) / to_rule,
        ),
    };
    let amount = f64::from(shown);
    let value = if amount > line {
        &rule.then
    } else {
        &rule.otherwise
    };
    let near = margin > 0.0 && (amount - line).abs() <= margin;
    Some(Suggestion {
        value: value.clone(),
        amount: shown,
        unit: if kg_flight { "kg" } else { "lb" }.into(),
        near,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::new_flight;
    use crate::test_support::ifly_pack;

    fn rule(minus: u32) -> SuggestRule {
        SuggestRule {
            field: FillField::Fuel,
            unit: WeightUnit::Kg,
            minus,
            more_than: 450,
            near: 225,
            other_unit: Some(involo_checklist_core::SuggestLine {
                more_than: 1000,
                near: 500,
            }),
            then: "more".into(),
            otherwise: "less".into(),
        }
    }

    fn flight(fuel: &str, unit: &str) -> Flight {
        let mut f = new_flight(&ifly_pack());
        f.values.insert(FillField::Fuel, fuel.into());
        f.values.insert(FillField::WeightUnit, unit.into());
        f
    }

    fn says(r: &SuggestRule, fuel: &str, unit: &str) -> (String, u32, String, bool) {
        let s = from_rule(r, &flight(fuel, unit)).unwrap();
        (s.value, s.amount, s.unit, s.near)
    }

    #[test]
    fn suggests_from_the_fuel_left_after_the_wing_tanks_in_the_flight_s_unit() {
        let r = rule(7738);
        // 9,000 kg on board: 1,262 kg in the center tank.
        assert_eq!(
            says(&r, "9000", "KG"),
            ("more".into(), 1262, "kg".into(), false)
        );
        // 8,001 kg: 263 kg, under the line and within 225 kg of it.
        assert_eq!(
            says(&r, "8,001", "KG"),
            ("less".into(), 263, "kg".into(), true)
        );
        // A pound plan: 20,000 lb is 9,072 kg, so 1,334 kg, shown as 2,941 lb.
        assert_eq!(
            says(&r, "20000", "LB"),
            ("more".into(), 2941, "lb".into(), false)
        );
        // Less fuel than the wings hold: nothing in the center tank.
        assert_eq!(
            says(&r, "5000", "KG"),
            ("less".into(), 0, "kg".into(), false)
        );
        // Close above the line: 8,300 kg leaves 562 kg.
        assert_eq!(
            says(&r, "8300", "KG"),
            ("more".into(), 562, "kg".into(), true)
        );
    }

    #[test]
    fn suggests_nothing_until_the_subtraction_is_known_or_without_a_value() {
        assert_eq!(from_rule(&rule(0), &flight("20000", "LB")), None);
        assert_eq!(from_rule(&rule(7738), &flight("lots", "LB")), None);
        let mut empty = new_flight(&ifly_pack());
        empty.values.clear();
        assert_eq!(from_rule(&rule(7738), &empty), None);
    }

    #[test]
    fn the_center_tank_answer_comes_from_the_pack_s_rule() {
        let pack = ifly_pack();
        let s = suggestion(&pack, &flight("9000", "KG"), "center_tank").unwrap();
        assert_eq!((s.value.as_str(), s.amount), ("more", 1262));
        // The pack's pound line: 18,059 lb leaves 1,000 lb, not more than 1,000.
        let lb = suggestion(&pack, &flight("18059", "LB"), "center_tank").unwrap();
        assert_eq!(
            (lb.value.as_str(), lb.amount, lb.near),
            ("less", 1000, true)
        );
        assert_eq!(
            suggestion(&pack, &flight("9000", "KG"), "power"),
            None,
            "no rule"
        );
    }
}
