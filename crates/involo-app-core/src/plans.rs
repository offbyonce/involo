// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! SimBrief plans. The host fetches the text from the address given here, or reads a saved
//! file, and hands it back to be read into the compact plan (decision 0019). The app reads its own
//! list of SimBrief sources from a plan; each pack field that names sources is filled from them,
//! scaled and rounded as the field says (decision 0029).

use std::collections::BTreeMap;

use involo_checklist_core::{FieldId, FlightField, Millis, Rounding, SimbriefSource as Src};
use involo_pack::FlatPack;
use involo_simbrief::{Plan, Units};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::AppError;

/// The saved format of a [`SavedPlan`]. Raise it, with a migration and tests, when the shape changes.
pub const PLAN_FORMAT: u32 = 1;

/// The last plan, kept on the device for offline use and its age (decision 0019).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct SavedPlan {
    pub format: u32,
    pub plan: Plan,
    /// When the app loaded it, in milliseconds since 1970 (UTC).
    #[ts(type = "number")]
    pub loaded_at: i64,
}

/// The flight values a plan fills in, and how many of the pilot's fields that is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlanValues {
    #[ts(type = "Record<string, string>")]
    pub values: BTreeMap<FieldId, String>,
    /// The fields the pilot sees filled (3.0 counted these in its notice).
    pub filled: usize,
    pub origin: String,
    pub destination: String,
    /// The plan sets a runway or departure, which the pilot checks against the clearance.
    pub check_clearance: bool,
}

/// A plan for an aircraft type the open pack doesn't cover (decision 0028: warn, never refuse):
/// what the warning names on each side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OtherAircraft {
    /// The plan's aircraft name in SimBrief, when the plan has one (`737 MAX 8`).
    #[ts(optional)]
    pub plan_name: Option<String>,
    /// The plan's type code (`A20N`).
    pub plan_type: String,
    /// The open pack's name (`iFly 737 MAX 8`).
    pub pack_name: String,
    /// Every type code the pack covers, in its order (`["B38M"]`).
    pub pack_types: Vec<String>,
}

/// Whether a plan is for an aircraft type the pack doesn't list in `aircraft.icaoTypes`
/// (compared ignoring case and surrounding spaces), and if so what to name. A plan with no type,
/// or a pack for no aircraft, gives `None`: nothing to compare, so no warning.
pub fn other_aircraft(pack: &FlatPack, plan: &Plan) -> Option<OtherAircraft> {
    let plan_type = plan
        .general
        .aircraft
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())?;
    let aircraft = pack.manifest.aircraft.as_ref()?;
    if aircraft
        .icao_types
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case(plan_type))
    {
        return None;
    }
    Some(OtherAircraft {
        plan_name: plan
            .general
            .aircraft_name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .map(str::to_owned),
        plan_type: plan_type.to_owned(),
        pack_name: pack.manifest.name.clone(),
        pack_types: aircraft.icao_types.clone(),
    })
}

/// The address of the latest plan for a SimBrief username or Pilot ID.
pub fn plan_url(user: &str) -> Result<String, AppError> {
    Ok(involo_simbrief::fetch_url(user)?)
}

/// Read a plan fetched from SimBrief, or a saved plan file in JSON or XML.
pub fn parse_plan(text: &str) -> Result<Plan, AppError> {
    Ok(involo_simbrief::parse_ofp(text)?)
}

/// The most fuel a plan's figure is taken as, in its unit (lb or kg): more than the largest
/// airliner holds in pounds (about 560,000 lb). A figure above it isn't a real plan's and is left
/// for the pilot. The engine names no aircraft, so the limit fits every pack.
const MAX_FUEL: i32 = 1_000_000;
/// The most a plan's weight figure is taken as, in its unit: above the largest airliner's
/// takeoff weight in pounds (about 1,270,000 lb).
const MAX_WEIGHT: i32 = 1_500_000;

fn icao(code: Option<&String>) -> Option<String> {
    let c = code?.to_uppercase();
    (c.len() == 4 && c.chars().all(|ch| ch.is_ascii_alphanumeric())).then_some(c)
}

/// A runway as the pilot types it: "9R" and "RW09R" are "09R".
fn runway(r: &str) -> Option<String> {
    let r = r.to_uppercase();
    let r = r.strip_prefix("RW").unwrap_or(&r);
    let (num, side) = r.split_at(r.find(|c: char| !c.is_ascii_digit()).unwrap_or(r.len()));
    let n: u8 = num.parse().ok()?;
    ((1..=36).contains(&n) && num.len() <= 2 && matches!(side, "" | "L" | "C" | "R"))
        .then(|| format!("{n:02}{side}"))
}

/// The departure and its transition: the plan's own SID fields, else 3.0's reading of the
/// navlog (the first SID fix in the first six, and the route's next word or the SID's last fix).
fn departure(plan: &Plan) -> (Option<String>, Option<String>) {
    let word = |w: &str, max: usize| {
        let ok = (2..=max).contains(&w.len()) && w.chars().all(|c| c.is_ascii_alphanumeric());
        ok.then(|| w.to_owned())
    };
    if let Some(sid) = plan
        .general
        .sid
        .as_deref()
        .and_then(|s| word(&s.to_uppercase(), 8))
    {
        let trans = plan
            .general
            .sid_transition
            .as_deref()
            .and_then(|t| word(&t.to_uppercase(), 5));
        return (Some(sid), trans);
    }
    let fixes = &plan.fixes;
    let Some(i) = fixes
        .iter()
        .position(|f| f.sid_star == Some(true) && f.stage.as_deref() != Some("DSC"))
        .filter(|i| *i < 6)
    else {
        return (None, None);
    };
    let Some(sid) = fixes[i]
        .via
        .as_deref()
        .map(str::to_uppercase)
        .filter(|v| v != "DCT")
        .and_then(|v| word(&v, 8))
    else {
        return (None, None);
    };
    let mut k = i;
    while fixes.get(k + 1).is_some_and(|f| {
        f.sid_star == Some(true)
            && f.via.as_deref().map(str::to_uppercase).as_deref() == Some(sid.as_str())
    }) {
        k += 1;
    }
    let route = plan
        .general
        .route
        .clone()
        .unwrap_or_default()
        .to_uppercase();
    let mut words = route.split_whitespace();
    let letters = |w: &str| (2..=5).contains(&w.len()) && w.chars().all(|c| c.is_ascii_uppercase());
    let trans = match (words.next(), words.next()) {
        (Some(first), Some(next)) if first == sid && letters(next) => Some(next.to_owned()),
        _ => fixes[k]
            .ident
            .as_deref()
            .map(str::to_uppercase)
            .filter(|f| letters(f)),
    };
    (Some(sid), trans)
}

/// A plan value as read: text the field takes as it is, or a number its `display` may scale.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Raw<'a> {
    Text(&'a str),
    Number(i32),
}

/// The values the app reads from a plan, by source, as 3.0 read them. Numbers outside what an
/// airliner can hold are left out (#43); a pack field's own range decides what it shows.
#[allow(clippy::too_many_lines)]
fn sources(plan: &Plan, origin: &str, destination: &str) -> BTreeMap<Src, String> {
    let mut v = BTreeMap::new();
    let g = &plan.general;
    v.insert(Src::Origin, origin.to_owned());
    v.insert(Src::Destination, destination.to_owned());
    if let Some(n) = g.flight_number.as_deref() {
        let n: String = n.to_uppercase().split_whitespace().collect();
        let full = format!(
            "{}{n}",
            g.airline.as_deref().unwrap_or_default().to_uppercase()
        );
        v.insert(
            Src::FlightNumber,
            if full.len() <= 7 {
                full
            } else {
                n.chars().take(7).collect()
            },
        );
    }
    if let Some(a) = g.cruise_altitude_ft {
        let fl = if a >= 1000 {
            a.saturating_add(50) / 100
        } else {
            a
        };
        if (100..=410).contains(&fl) {
            v.insert(Src::CruiseLevel, fl.to_string());
        }
    }
    if let Some(r) = plan
        .origin
        .as_ref()
        .and_then(|o| o.runway.as_deref())
        .and_then(runway)
    {
        v.insert(Src::Runway, r);
    }
    let (sid, trans) = departure(plan);
    if let Some(s) = sid {
        v.insert(Src::Sid, s);
    }
    if let Some(t) = trans {
        v.insert(Src::Transition, t);
    }
    let fuel = |f: Option<i32>| f.filter(|f| (1..=MAX_FUEL).contains(f));
    let weight = |w: Option<i32>| w.filter(|w| (1..=MAX_WEIGHT).contains(w));
    if let Some(f) = fuel(plan.fuel.plan_ramp) {
        v.insert(Src::BlockFuel, f.to_string());
        if let Some(u) = plan.units {
            v.insert(
                Src::WeightUnit,
                if u == Units::Kg { "KG" } else { "LB" }.into(),
            );
        }
    }
    if let Some(e) = plan
        .destination
        .as_ref()
        .and_then(|d| d.elevation_ft)
        .filter(|e| (-1000..=14000).contains(e))
    {
        v.insert(Src::DestinationElevation, e.to_string());
    }
    if let Some(z) = weight(plan.weights.zfw) {
        v.insert(Src::ZeroFuelWeight, z.to_string());
    }
    if let Some(r) = fuel(plan.fuel.reserve) {
        v.insert(Src::ReserveFuel, r.to_string());
    }
    if let Some(a) = fuel(plan.fuel.alternate) {
        v.insert(Src::AlternateFuel, a.to_string());
    }
    if let Some(m) = fuel(plan.fuel.min_takeoff) {
        v.insert(Src::MinimumTakeoffFuel, m.to_string());
    }
    if let Some(ci) = g.cost_index.filter(|c| (0..=9999).contains(c)) {
        v.insert(Src::CostIndex, ci.to_string());
    }
    if let (Some(d), Some(s)) = (g.avg_wind_dir, g.avg_wind_speed)
        && (0..=360).contains(&d)
        && (0..400).contains(&s)
    {
        let d = if d % 360 == 0 { 360 } else { d % 360 };
        v.insert(Src::CruiseWind, format!("{d:03}/{s:03}"));
    }
    if let Some(i) = g.avg_isa_deviation.filter(|i| i.abs() <= 60) {
        v.insert(Src::IsaDeviation, i.to_string());
    }
    if let Some(t) = plan
        .origin
        .as_ref()
        .and_then(|o| o.transition_altitude_ft)
        .filter(|t| (1000..=20000).contains(t))
    {
        v.insert(Src::TransitionAltitude, t.to_string());
    }
    if let Some(t) = plan
        .destination
        .as_ref()
        .and_then(|d| d.transition_level_ft)
        .filter(|t| (1000..=60000).contains(t))
    {
        v.insert(Src::TransitionLevel, ((t + 50) / 100).to_string());
    }
    if let Some(w) = weight(plan.weights.takeoff) {
        v.insert(Src::TakeoffWeight, w.to_string());
    }
    if let Some(p) = plan.weights.passengers.filter(|p| (0..=500).contains(p)) {
        v.insert(Src::Passengers, p.to_string());
    }
    if let Some(c) = plan.weights.cargo.filter(|c| (0..=MAX_WEIGHT).contains(c)) {
        v.insert(Src::Cargo, c.to_string());
    }
    if let Some(r) = g.route.as_deref() {
        let r = r
            .to_uppercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !r.is_empty() && r.len() <= 400 {
            v.insert(Src::Route, r);
        }
    }
    if let Some(o) = plan.origin.as_ref()
        && let (Some(lat), Some(lon)) = (o.lat, o.lon)
        && lat.abs() <= 90.0
        && lon.abs() <= 180.0
    {
        v.insert(Src::OriginPosition, format!("{lat} {lon}"));
    }
    if let Some(a) = g
        .airac
        .as_deref()
        .filter(|a| a.len() == 4 && a.chars().all(|c| c.is_ascii_digit()))
    {
        v.insert(Src::NavDatabase, a.to_owned());
        if let Some((from, to)) = airac_dates(a) {
            v.insert(Src::NavDatabaseDates, format!("{from}/{to}"));
        }
    }
    // Before 2000 or past 9999 isn't a plan's departure.
    if let Some(out) = plan
        .times
        .sched_out
        .filter(|t| (946_684_800..253_402_300_800).contains(t))
        .and_then(|t| u64::try_from(t).ok())
    {
        let (date, time) = crate::log::utc(out * 1000);
        v.insert(Src::DepartureDate, date);
        v.insert(Src::DepartureTime, time);
    }
    arrival(plan, &mut v);
    v
}

/// The dates of an AIRAC cycle (`2511`): the day it takes effect and the day the next one does.
/// Cycles last 28 days from cycle 2001 on 2 January 2020, numbered from 01 in each year; cycles
/// before 2020 aren't read.
fn airac_dates(cycle: &str) -> Option<(String, String)> {
    const DAY: Millis = 86_400_000;
    let date = |day: u64| crate::log::utc(day * DAY).0;
    let year = |day: u64| date(day)[..4].parse::<u32>().ok();
    let want: u32 = cycle.parse().ok()?;
    let (want_year, want_n) = (2000 + want / 100, want % 100);
    if want_year < 2020 || want_n == 0 {
        return None;
    }
    // 2020-01-02, in days since 1970.
    let mut day: u64 = 18_263;
    let (mut y, mut n) = (2020, 1);
    while y <= want_year {
        if (y, n) == (want_year, want_n) {
            return Some((date(day), date(day + 28)));
        }
        day += 28;
        let next = year(day)?;
        if next == y {
            n += 1;
        } else {
            (y, n) = (next, 1);
        }
    }
    None
}

/// The alternate, the arrival and each airport's altimeter setting (decision 0019, amended).
/// The destination's setting takes the departure's unit, converted when its METAR uses the other.
fn arrival(plan: &Plan, v: &mut BTreeMap<Src, String>) {
    if let Some(a) = icao(plan.alternates.first().and_then(|a| a.icao.as_ref())) {
        v.insert(Src::Alternate, a);
    }
    if let Some(r) = plan
        .destination
        .as_ref()
        .and_then(|d| d.runway.as_deref())
        .and_then(runway)
    {
        v.insert(Src::ArrivalRunway, r);
    }
    if let Some(star) = plan
        .general
        .star
        .as_deref()
        .map(str::to_uppercase)
        .filter(|s| (2..=8).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric()))
    {
        v.insert(Src::Star, star);
    }
    let metar = |a: Option<&involo_simbrief::Airport>| {
        a.and_then(|a| a.metar.as_deref())
            .and_then(crate::weather::altimeter)
    };
    let dep = metar(plan.origin.as_ref());
    let dest = metar(plan.destination.as_ref());
    let unit = dep.as_ref().or(dest.as_ref()).map(|a| a.unit.clone());
    if let Some(u) = &unit {
        v.insert(Src::AltimeterUnit, u.clone());
    }
    if let Some(a) = dep {
        v.insert(Src::OriginAltimeter, a.value);
    }
    if let (Some(a), Some(u)) = (dest, unit) {
        v.insert(Src::DestinationAltimeter, in_unit(&a, &u));
    }
}

/// Sources that are numbers a field's `display` may scale; the rest are text.
fn raw(source: Src, value: &str) -> Raw<'_> {
    let number = matches!(
        source,
        Src::BlockFuel
            | Src::ReserveFuel
            | Src::AlternateFuel
            | Src::MinimumTakeoffFuel
            | Src::ZeroFuelWeight
            | Src::TakeoffWeight
            | Src::Cargo
    );
    match value.parse() {
        Ok(n) if number => Raw::Number(n),
        _ => Raw::Text(value),
    }
}

/// A number as the field stores it: divided by its scale and rounded to a multiple of its step,
/// written with the step's decimals. Without a `display`, as read.
fn shown(field: &FlightField, n: i32) -> String {
    let Some(d) = &field.display else {
        return n.to_string();
    };
    rounded(f64::from(n) / d.scale, d.round, d.step)
}

/// A number rounded to a multiple of `step`, written with the step's decimals.
pub(crate) fn rounded(n: f64, round: Rounding, step: f64) -> String {
    let steps = n / step;
    // A hair's margin, so a value already on a step is not pushed to the next one.
    let steps = match round {
        Rounding::Up => (steps - 1e-9).ceil(),
        Rounding::Down => (steps + 1e-9).floor(),
        Rounding::Nearest => steps.round(),
    };
    let decimals = format!("{step}")
        .split_once('.')
        .map_or(0, |(_, f)| f.len());
    format!("{:.*}", decimals, steps * step)
}

/// A field's value from the plan's sources: one source as read, or several numbers added
/// together (saturating, and left out past what an airliner holds), when the first is there.
fn field_value(field: &FlightField, read: &BTreeMap<Src, String>) -> Option<String> {
    let first = *field.simbrief.first()?;
    let value = read.get(&first)?;
    if field.simbrief.len() == 1 {
        return Some(match raw(first, value) {
            Raw::Number(n) => shown(field, n),
            Raw::Text(t) => t.to_owned(),
        });
    }
    let mut sum: i32 = 0;
    for source in &field.simbrief {
        match read.get(source).map(|v| raw(*source, v)) {
            Some(Raw::Number(n)) => sum = sum.saturating_add(n),
            Some(Raw::Text(_)) => return None,
            None => {}
        }
    }
    (sum <= MAX_FUEL).then(|| shown(field, sum))
}

/// An altimeter setting in the flight's unit: 1 inHg is 33.8639 hPa.
fn in_unit(a: &crate::weather::Altimeter, unit: &str) -> String {
    match (a.unit.as_str(), unit) {
        ("inHg", "hPa") => a
            .value
            .parse::<f64>()
            .map_or_else(|_| a.value.clone(), |v| format!("{:.0}", v * 33.8639)),
        ("hPa", "inHg") => a
            .value
            .parse::<f64>()
            .map_or_else(|_| a.value.clone(), |v| format!("{:.2}", v / 33.8639)),
        _ => a.value.clone(),
    }
}

/// The flight values a plan fills in for a pack: each field that names SimBrief sources, filled
/// from the plan as 3.0 read it. A plan without both airports is refused, as 3.0 refused it.
pub fn plan_values(pack: &FlatPack, plan: &Plan) -> Result<PlanValues, AppError> {
    let (Some(origin), Some(destination)) = (
        icao(plan.origin.as_ref().and_then(|a| a.icao.as_ref())),
        icao(plan.destination.as_ref().and_then(|a| a.icao.as_ref())),
    ) else {
        return Err(AppError::FlightPlan(
            "that plan has no departure and destination airports".into(),
        ));
    };
    let read = sources(plan, &origin, &destination);
    let mut values = BTreeMap::new();
    let mut filled = 0;
    let mut check_clearance = false;
    for field in pack.content.flight.iter().flat_map(|f| &f.fields) {
        let Some(value) = field_value(field, &read) else {
            continue;
        };
        // The pilot's fields, as 3.0 counted them: not the position, the database or the unit.
        let quiet = [
            Src::OriginPosition,
            Src::NavDatabase,
            Src::NavDatabaseDates,
            Src::DepartureTime,
            Src::DepartureDate,
            Src::WeightUnit,
        ];
        if !field.simbrief.iter().all(|s| quiet.contains(s)) {
            filled += 1;
        }
        check_clearance |= field
            .simbrief
            .iter()
            .any(|s| matches!(s, Src::Runway | Src::Sid));
        values.insert(FieldId::new(field.id.as_str()), value);
    }
    Ok(PlanValues {
        values,
        filled,
        origin,
        destination,
        check_clearance,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn fixture(name: &str) -> String {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../involo-simbrief/tests/fixtures");
        std::fs::read_to_string(dir.join(name)).unwrap()
    }

    #[test]
    fn a_plan_for_another_type_names_both_aircraft() {
        let pack = crate::test_support::ifly_pack();
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        // The pack's own type, in any case or with spaces: no warning.
        for code in ["B38M", "b38m", " B38M "] {
            plan.general.aircraft = Some(code.into());
            assert_eq!(other_aircraft(&pack, &plan), None, "{code}");
        }
        // Another type: both sides named, the plan's name when it has one.
        plan.general.aircraft = Some("A20N".into());
        plan.general.aircraft_name = Some("A320neo".into());
        assert_eq!(
            other_aircraft(&pack, &plan),
            Some(OtherAircraft {
                plan_name: Some("A320neo".into()),
                plan_type: "A20N".into(),
                pack_name: pack.manifest.name.clone(),
                pack_types: vec!["B38M".into()],
            })
        );
        plan.general.aircraft_name = Some("  ".into());
        assert_eq!(other_aircraft(&pack, &plan).unwrap().plan_name, None);
        // Every type the pack covers counts.
        let mut two = pack.clone();
        if let Some(a) = two.manifest.aircraft.as_mut() {
            a.icao_types.push("A20N".into());
        }
        assert_eq!(other_aircraft(&two, &plan), None);
        // No type in the plan: nothing to compare, no warning.
        for none in [None, Some(String::new()), Some(" ".into())] {
            plan.general.aircraft = none;
            assert_eq!(other_aircraft(&pack, &plan), None);
        }
        // A pack for no aircraft: no warning either.
        plan.general.aircraft = Some("A20N".into());
        let mut library = pack;
        library.manifest.aircraft = None;
        assert_eq!(other_aircraft(&library, &plan), None);
    }

    #[test]
    fn a_plan_fills_flight_values_as_3_0_did() {
        let plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        let get = |f: FieldId| pv.values.get(&f).map(String::as_str);
        // TSTX and 4567 make eight characters, over 3.0's seven: the number alone.
        assert_eq!(get(FieldId::from("flight_number")), Some("4567"));
        assert_eq!(get(FieldId::from("origin")), Some("EGLL"));
        assert_eq!(get(FieldId::from("cruise_level")), Some("370"));
        assert_eq!(get(FieldId::from("runway")), Some("09R"));
        assert_eq!(get(FieldId::from("sid")), Some("SUMMA2"));
        assert_eq!(get(FieldId::from("fuel")), Some("6400"));
        assert_eq!(get(FieldId::from("weight_unit")), Some("KG"));
        assert_eq!(get(FieldId::from("zfw")), Some("52.3"));
        // Reserve plus alternate, in thousands rounded up: 1,200 + 700 is 1.9.
        assert_eq!(get(FieldId::from("reserves")), Some("1.9"));
        assert_eq!(get(FieldId::from("cruise_wind")), Some("265/042"));
        assert_eq!(get(FieldId::from("transition_level")), Some("70"));
        assert_eq!(get(FieldId::from("takeoff_weight")), Some("58.5"));
        assert_eq!(get(FieldId::from("cargo")), Some("2.1"));
        assert_eq!(get(FieldId::from("nav_database")), Some("2406"));
        assert!(pv.check_clearance);
        assert!(
            !pv.values.contains_key(&FieldId::from("transition")),
            "the plan's SID has no transition"
        );
    }

    #[test]
    fn a_plan_gives_its_departure_time_and_date_and_the_cycles_dates() {
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        plan.general.airac = Some("2511".into());
        // 2025-11-13 10:00 UTC.
        plan.times.sched_out = Some(1_763_028_000);
        let read = sources(&plan, "KSEA", "KSFO");
        assert_eq!(
            read.get(&Src::DepartureTime).map(String::as_str),
            Some("10:00")
        );
        assert_eq!(
            read.get(&Src::DepartureDate).map(String::as_str),
            Some("2025-11-13")
        );
        assert_eq!(
            read.get(&Src::NavDatabaseDates).map(String::as_str),
            Some("2025-10-30/2025-11-27")
        );
        // Cycle 2001 is 2 January 2020; 2021 has 13 cycles, the last on 30 December, and 2201
        // follows it; there's no cycle 00 and none before 2020.
        assert_eq!(
            airac_dates("2001"),
            Some(("2020-01-02".into(), "2020-01-30".into()))
        );
        assert_eq!(
            airac_dates("2113"),
            Some(("2021-12-30".into(), "2022-01-27".into()))
        );
        assert_eq!(
            airac_dates("2201"),
            Some(("2022-01-27".into(), "2022-02-24".into()))
        );
        assert_eq!(airac_dates("2500"), None);
        assert_eq!(airac_dates("1913"), None);
        assert_eq!(airac_dates("2514"), None, "2025 has 13 cycles");
        plan.times.sched_out = Some(0);
        assert!(!sources(&plan, "KSEA", "KSFO").contains_key(&Src::DepartureTime));
    }

    #[test]
    fn a_plan_fills_the_alternate_arrival_and_both_altimeter_settings() {
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        assert_eq!(
            pv.values
                .get(&FieldId::from("alternate"))
                .map(String::as_str),
            Some("LFPO")
        );
        assert_eq!(
            pv.values
                .get(&FieldId::from("landing_altitude"))
                .map(String::as_str),
            Some("392")
        );
        let o = plan.origin.as_mut().unwrap();
        o.metar = Some("EGLL 010850Z 24008KT 9999 FEW030 15/08 Q1015".into());
        let d = plan.destination.as_mut().unwrap();
        d.metar = Some("KSFO 010856Z 28010KT 10SM FEW017 15/11 A2992".into());
        d.runway = Some("RW28R".into());
        plan.general.star = Some("bdega4".into());
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        let get = |f: FieldId| pv.values.get(&f).map(String::as_str);
        assert_eq!(get(FieldId::from("qnh_unit")), Some("hPa"));
        assert_eq!(get(FieldId::from("qnh")), Some("1015"));
        // The destination's 29.92 inHg in the departure's unit.
        assert_eq!(get(FieldId::from("destination_qnh")), Some("1013"));
        assert_eq!(get(FieldId::from("arrival_runway")), Some("28R"));
        assert_eq!(get(FieldId::from("star")), Some("BDEGA4"));
    }

    #[test]
    fn a_plan_goes_into_the_flight_in_one_action() {
        let pack = crate::test_support::ifly_pack();
        let plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        let values = plan_values(&crate::test_support::ifly_pack(), &plan)
            .unwrap()
            .values;
        let flight = crate::apply(
            &pack,
            crate::new_flight(&pack),
            crate::Action::SetValues {
                values: values.clone(),
            },
        )
        .unwrap();
        assert_eq!(flight.values, values);
    }

    #[test]
    fn a_long_flight_number_and_odd_runways_read_as_3_0_read_them() {
        assert_eq!(runway("RW9R").as_deref(), Some("09R"));
        assert_eq!(runway("27").as_deref(), Some("27"));
        assert_eq!(runway("37"), None);
        assert_eq!(runway("09X"), None);
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        plan.general.airline = Some("TSTX".into());
        plan.general.flight_number = Some("45678".into());
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        assert_eq!(
            pv.values[&FieldId::from("flight_number")],
            "45678",
            "airline and number exceed 7"
        );
        plan.destination = None;
        assert!(plan_values(&crate::test_support::ifly_pack(), &plan).is_err());
    }

    #[test]
    fn plans_read_and_errors_become_flight_plan_errors() {
        let plan = parse_plan(&fixture("ofp-sample.xml")).unwrap();
        assert_eq!(plan.origin.and_then(|o| o.icao).as_deref(), Some("EGLL"));
        assert_eq!(
            parse_plan(&fixture("ofp-error.json")),
            Err(AppError::FlightPlan(
                "SimBrief says: Error: Unknown UserID".into()
            ))
        );
        assert!(
            plan_url("Pilot")
                .unwrap()
                .ends_with("username=Pilot&json=1")
        );
        assert!(matches!(plan_url(" "), Err(AppError::FlightPlan(_))));
    }

    /// A METAR with a character outside ASCII: the plan still loads, and that airport's
    /// altimeter setting is left for the pilot (the weather page shows the report as printed).
    #[test]
    fn a_metar_with_non_ascii_text_still_loads_the_plan() {
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        plan.origin.as_mut().unwrap().metar = Some("EGLL 010850Z 24008KT 9999 Qé15 15/08".into());
        plan.destination.as_mut().unwrap().metar = Some("LFPG 010850Z 1é010KT Q1013".into());
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        assert_eq!(pv.values.get(&FieldId::from("qnh")), None);
        assert_eq!(
            pv.values
                .get(&FieldId::from("destination_qnh"))
                .map(String::as_str),
            Some("1013")
        );
    }

    #[test]
    fn fuel_and_weights_outside_what_an_airliner_can_hold_are_not_filled() {
        let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
        let get = |p: &Plan, f: FieldId| {
            plan_values(&crate::test_support::ifly_pack(), p)
                .unwrap()
                .values
                .get(&f)
                .cloned()
        };
        // At the top of each range: filled.
        plan.fuel.plan_ramp = Some(MAX_FUEL);
        plan.fuel.min_takeoff = Some(MAX_FUEL);
        plan.fuel.reserve = Some(MAX_FUEL - 700);
        plan.weights.zfw = Some(MAX_WEIGHT);
        plan.weights.takeoff = Some(MAX_WEIGHT);
        plan.weights.cargo = Some(MAX_WEIGHT);
        assert_eq!(
            get(&plan, FieldId::from("fuel")),
            Some(MAX_FUEL.to_string())
        );
        assert_eq!(
            get(&plan, FieldId::from("minimum_takeoff_fuel")),
            Some(MAX_FUEL.to_string())
        );
        assert_eq!(get(&plan, FieldId::from("reserves")), Some("1000.0".into()));
        assert_eq!(get(&plan, FieldId::from("zfw")), Some("1500.0".into()));
        assert_eq!(
            get(&plan, FieldId::from("takeoff_weight")),
            Some("1500.0".into())
        );
        assert_eq!(get(&plan, FieldId::from("cargo")), Some("1500.0".into()));
        // One over: left out.
        plan.fuel.plan_ramp = Some(MAX_FUEL + 1);
        plan.fuel.min_takeoff = Some(MAX_FUEL + 1);
        plan.fuel.reserve = Some(MAX_FUEL - 699);
        plan.weights.zfw = Some(MAX_WEIGHT + 1);
        plan.weights.takeoff = Some(MAX_WEIGHT + 1);
        plan.weights.cargo = Some(MAX_WEIGHT + 1);
        for f in [
            FieldId::from("fuel"),
            FieldId::from("weight_unit"),
            FieldId::from("minimum_takeoff_fuel"),
            FieldId::from("reserves"),
            FieldId::from("zfw"),
            FieldId::from("takeoff_weight"),
            FieldId::from("cargo"),
        ] {
            assert_eq!(get(&plan, f.clone()), None, "{f:?}");
        }
        // The parser's ceiling for a figure it can't hold: neither filled nor overflowing.
        plan.fuel.reserve = Some(i32::MAX);
        plan.fuel.alternate = Some(i32::MAX);
        plan.general.cruise_altitude_ft = Some(i32::MAX);
        let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
        assert_eq!(pv.values.get(&FieldId::from("reserves")), None);
        assert_eq!(pv.values.get(&FieldId::from("cruise_level")), None);
        // An alternate figure out of range adds nothing to the reserve.
        plan.fuel.reserve = Some(1200);
        plan.fuel.alternate = Some(MAX_FUEL + 1);
        assert_eq!(get(&plan, FieldId::from("reserves")), Some("1.2".into()));
    }

    fn figure() -> impl proptest::strategy::Strategy<Value = Option<i32>> {
        proptest::option::of(proptest::prelude::any::<i32>())
    }

    proptest::proptest! {
        /// Any numbers at all in the plan's figures: plan values return without overflowing (this
        /// runs in debug builds, where an overflow panics).
        #[test]
        fn plan_values_never_overflow(
            fuel in proptest::collection::vec(figure(), 11),
            weights in proptest::collection::vec(figure(), 10),
            general in proptest::collection::vec(figure(), 7),
            airport in proptest::collection::vec(figure(), 3),
        ) {
            let mut plan = parse_plan(&fixture("ofp-sample.json")).unwrap();
            let f = &mut plan.fuel;
            [f.taxi, f.trip, f.contingency, f.alternate, f.reserve, f.etops, f.extra, f.min_takeoff, f.plan_takeoff, f.plan_ramp, f.plan_landing] =
                fuel.try_into().unwrap();
            let w = &mut plan.weights;
            [w.oew, w.passengers, w.cargo, w.payload, w.zfw, w.max_zfw, w.takeoff, w.max_takeoff, w.landing, w.max_landing] =
                weights.try_into().unwrap();
            let g = &mut plan.general;
            [g.cruise_altitude_ft, g.cost_index, g.avg_wind_dir, g.avg_wind_speed, g.avg_isa_deviation, g.air_distance_nm, g.route_distance_nm] =
                general.try_into().unwrap();
            for a in [plan.origin.as_mut(), plan.destination.as_mut()].into_iter().flatten() {
                [a.elevation_ft, a.transition_altitude_ft, a.transition_level_ft] =
                    airport.clone().try_into().unwrap();
            }
            let pv = plan_values(&crate::test_support::ifly_pack(), &plan).unwrap();
            for v in pv.values.values() {
                proptest::prop_assert!(!v.starts_with('-') || v.len() < 8, "{v}");
            }
        }
    }

    /// The same plans fill the same values with the iFly pack's flight.yaml as they did when
    /// the fields were a fixed list (the values frozen before, field by field).
    #[test]
    fn the_ifly_pack_fills_what_the_fixed_list_filled() {
        let frozen: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/plan-values-ifly.json")).unwrap();
        let pack = crate::test_support::ifly_pack();
        let mut weather = parse_plan(&fixture("ofp-sample.json")).unwrap();
        weather.origin.as_mut().unwrap().metar =
            Some("EGLL 010850Z 24008KT 9999 FEW030 15/08 Q1015".into());
        let d = weather.destination.as_mut().unwrap();
        d.metar = Some("KSFO 010856Z 28010KT 10SM FEW017 15/11 A2992".into());
        d.runway = Some("RW28R".into());
        weather.general.star = Some("bdega4".into());
        weather.general.airline = Some("TSTX".into());
        weather.general.flight_number = Some("45678".into());
        weather.weights.passengers = Some(150);
        weather.general.route = Some("summa2 dvr ul9 kok".into());
        let plans = [
            (
                "ofp-sample.json",
                parse_plan(&fixture("ofp-sample.json")).unwrap(),
            ),
            (
                "ofp-sample.xml",
                parse_plan(&fixture("ofp-sample.xml")).unwrap(),
            ),
            ("ofp-sample.json with weather, arrival and route", weather),
        ];
        for (name, plan) in plans {
            let now = serde_json::to_value(plan_values(&pack, &plan).unwrap()).unwrap();
            let before = &frozen["plans"][name];
            let fields: std::collections::BTreeSet<&String> = before["values"]
                .as_object()
                .unwrap()
                .keys()
                .chain(now["values"].as_object().unwrap().keys())
                .collect();
            // Fields the fixed list never had, which the pack fills since #222.
            let added = ["nav_active_dates", "utc_time", "utc_date"];
            for f in fields {
                if before["values"][f].is_null() && added.contains(&f.as_str()) {
                    continue;
                }
                assert_eq!(now["values"][f], before["values"][f], "{name}: {f}");
            }
            for key in ["filled", "origin", "destination", "checkClearance"] {
                assert_eq!(now[key], before[key], "{name}: {key}");
            }
        }
    }

    /// A field stored in thousands rounded up to a tenth gives what the fixed ZFW rounding gave.
    #[test]
    fn display_in_thousands_rounded_up_matches_the_old_zfw_rounding() {
        let old = |v: i32| format!("{:.1}", (f64::from(v) / 100.0 - 1e-9).ceil() / 10.0);
        let mut field = crate::test_support::ifly_pack()
            .content
            .flight
            .unwrap()
            .fields
            .into_iter()
            .find(|f| f.id == "zfw")
            .unwrap();
        field.id = "gross_mass".into();
        for v in [1, 52_300, 52_301, 52_399, 99_999, 100_000, MAX_WEIGHT] {
            assert_eq!(shown(&field, v), old(v), "{v}");
        }
    }
}
