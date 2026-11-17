// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! An answer a decision's option suggests from the flight's values (decision 0027): a planned
//! fuel weight, less what the rule subtracts (for the center tank: what the wing tanks hold),
//! above a threshold suggests one value, otherwise the other. The pilot confirms or changes it.

use checklist_core::{FillField, SuggestRule, Suggests};
use pack::FlatPack;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::flight::Flight;

const LB_PER_KG: f64 = 2.204_62;

/// The suggested answer and the estimate it comes from, in pounds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Suggestion {
    pub value: String,
    pub estimate_lb: u32,
}

/// The answer the option's rule suggests for this flight, or none: no rule, no value to read, or
/// a rule whose subtraction is still 0 (not yet checked).
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

fn from_rule(rule: &SuggestRule, flight: &Flight) -> Option<Suggestion> {
    if rule.minus_lb == 0 {
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
    let kg = flight
        .values
        .get(&FillField::WeightUnit)
        .is_some_and(|u| u.eq_ignore_ascii_case("KG"));
    let lb = if kg { amount * LB_PER_KG } else { amount };
    // A weight in pounds fits a u32; anything beyond is not a real plan.
    let over = (lb - f64::from(rule.minus_lb)).max(0.0).round();
    let estimate_lb = if over > f64::from(u32::MAX) {
        return None;
    } else {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let n = over as u32;
        n
    };
    let value = if estimate_lb > rule.more_than_lb {
        &rule.then
    } else {
        &rule.otherwise
    };
    Some(Suggestion {
        value: value.clone(),
        estimate_lb,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::new_flight;
    use crate::test_support::ifly_pack;

    fn rule(minus_lb: u32) -> SuggestRule {
        SuggestRule {
            field: FillField::Fuel,
            minus_lb,
            more_than_lb: 1000,
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

    #[test]
    fn suggests_from_the_fuel_beyond_what_the_rule_subtracts() {
        let r = rule(17_000);
        assert_eq!(
            from_rule(&r, &flight("20,000", "LB")),
            Some(Suggestion {
                value: "more".into(),
                estimate_lb: 3000
            })
        );
        assert_eq!(from_rule(&r, &flight("17500", "LB")).unwrap().value, "less");
        assert_eq!(from_rule(&r, &flight("9000", "LB")).unwrap().estimate_lb, 0);
        // A kg plan is converted: 9,000 kg is about 19,842 lb.
        let kg = from_rule(&r, &flight("9000", "KG")).unwrap();
        assert_eq!((kg.value.as_str(), kg.estimate_lb), ("more", 2842));
    }

    #[test]
    fn suggests_nothing_until_the_subtraction_is_known_or_without_a_value() {
        assert_eq!(from_rule(&rule(0), &flight("20000", "LB")), None);
        assert_eq!(from_rule(&rule(17_000), &flight("lots", "LB")), None);
        let mut empty = new_flight(&ifly_pack());
        empty.values.clear();
        assert_eq!(from_rule(&rule(17_000), &empty), None);
    }

    #[test]
    fn the_center_tank_answer_suggests_nothing_while_the_wing_capacity_is_unchecked() {
        let pack = ifly_pack();
        let f = flight("30000", "LB");
        assert_eq!(suggestion(&pack, &f, "center_tank"), None);
        assert_eq!(suggestion(&pack, &f, "power"), None, "no rule");
    }
}
