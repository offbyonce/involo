// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! CDU walkthroughs as the app shows them (#215): each page's text with the flight's values filled
//! in. A value that isn't known shows its `empty` text instead, or nothing. The only numbers the
//! app works out are the ones the pack names: the route's rows, split from the flight's route, and
//! the counts made from them. Nothing else is calculated.

use involo_checklist_core::{
    CduField, CduForm, CduInline, CduPart, CduRouteCount, CduStyle, CduText, CduWalkthrough,
    FieldId, RouteLegCount, RouteLegPart, SimbriefSource,
};
use involo_pack::FlatPack;
use serde::Serialize;
use ts_rs::TS;

use crate::flight::Flight;
use crate::values::field_from;

/// One run of CDU text in one style.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CduSpan {
    pub text: String,
    /// How it's drawn on the screen; none for plain screen text.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub style: Option<CduStyle>,
    /// A value from the flight, or a count made from it, rather than the pack's own words or a
    /// value's `empty` text.
    pub value: bool,
}

/// One line select row, filled in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CduRowView {
    /// A divider in place of the labels, with its text ("" for a plain line).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub separator: Option<String>,
    pub left_label: Vec<CduSpan>,
    pub left: Vec<CduSpan>,
    pub right_label: Vec<CduSpan>,
    pub right: Vec<CduSpan>,
}

/// The CDU screen on one page, filled in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CduScreenView {
    pub title: Vec<CduSpan>,
    pub page: Vec<CduSpan>,
    pub rows: Vec<CduRowView>,
    pub highlight: Vec<String>,
    pub scratchpad: Vec<CduSpan>,
}

/// One page of a walkthrough, filled in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CduPageView {
    /// The CDU page name, e.g. `PERF INIT`.
    pub page: String,
    /// The function key to press.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub key: Option<String>,
    pub title: String,
    pub action: Vec<CduSpan>,
    pub check: Vec<CduSpan>,
    pub note: Vec<CduSpan>,
    pub screen: CduScreenView,
}

/// A CDU walkthrough for this flight.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CduWalk {
    pub id: String,
    pub title: String,
    pub pages: Vec<CduPageView>,
    /// The flight has values: without any, each page says what to type instead.
    pub flight_added: bool,
    /// The page the pilot is on, from 0, once the walkthrough has been opened.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub at: Option<u32>,
}

/// The pack's walkthrough with this id.
pub(crate) fn walkthrough<'a>(pack: &'a FlatPack, id: &str) -> Option<&'a CduWalkthrough> {
    pack.content
        .cdu
        .iter()
        .flat_map(|f| &f.walkthroughs)
        .find(|w| w.id == id)
}

/// A walkthrough with the flight's values in it, or none when the pack has no such walkthrough.
pub fn cdu_walkthrough(pack: &FlatPack, flight: &Flight, id: &str) -> Option<CduWalk> {
    let w = walkthrough(pack, id)?;
    let values = Values::new(pack, flight);
    let pages = w
        .pages
        .iter()
        .map(|p| CduPageView {
            page: p.page.clone(),
            key: p.key.clone(),
            title: p.title.clone(),
            action: values.text(&p.action),
            check: values.text(&p.check),
            note: values.text(&p.note),
            screen: CduScreenView {
                title: values.text(&p.screen.title),
                page: values.text(&p.screen.page),
                rows: p
                    .screen
                    .rows
                    .iter()
                    .map(|r| CduRowView {
                        separator: r.separator.clone(),
                        left_label: values.text(&r.left_label),
                        left: values.text(&r.left),
                        right_label: values.text(&r.right_label),
                        right: values.text(&r.right),
                    })
                    .collect(),
                highlight: p.screen.highlight.clone(),
                scratchpad: values.text(&p.screen.scratchpad),
            },
        })
        .collect();
    let at = flight
        .walkthroughs
        .get(id)
        .copied()
        .filter(|n| (*n as usize) < w.pages.len());
    Some(CduWalk {
        id: w.id.clone(),
        title: w.title.clone(),
        pages,
        flight_added: flight.values.values().any(|v| !v.trim().is_empty()),
        at,
    })
}

/// The route split into CDU rows, `(via, to)`. The SID it starts with and the STAR it ends with
/// are left out (DEP/ARR enters them): the flight's own SID, or a word shaped like a procedure
/// (three to six letters, a digit and maybe a letter, as BDEGA4); the flight's own STAR, or that
/// shape only when the flight names no STAR. So is a DCT at either end. The first word is flown DIRECT; after it, an airway (letters then digits, as Q1 or UL607)
/// joins the waypoint after it, DCT before a waypoint is DIRECT, and a waypoint on its own is flown
/// DIRECT.
fn route_legs(route: &str, sid: Option<&str>, star: Option<&str>) -> Vec<(String, String)> {
    let mut words: Vec<String> = route.split_whitespace().map(str::to_uppercase).collect();
    let is = |w: &str, name: Option<&str>| name.is_some_and(|n| w.eq_ignore_ascii_case(n.trim()));
    if words.first().is_some_and(|w| w == "DCT") {
        words.remove(0);
    }
    if words.first().is_some_and(|w| is(w, sid) || procedure(w)) {
        words.remove(0);
    }
    if words.first().is_some_and(|w| w == "DCT") {
        words.remove(0);
    }
    if words.last().is_some_and(|w| w == "DCT") {
        words.pop();
    }
    // The flight's own STAR when it has one; only without one is a procedure-shaped word taken
    // for it, so a waypoint shaped like a procedure stays when the STAR is known.
    let star = star.map(str::trim).filter(|s| !s.is_empty());
    if words
        .last()
        .is_some_and(|w| star.map_or_else(|| procedure(w), |_| is(w, star)))
    {
        words.pop();
    }
    if words.last().is_some_and(|w| w == "DCT") {
        words.pop();
    }
    let Some(first) = words.first() else {
        return vec![];
    };
    let mut legs = vec![("DIRECT".to_owned(), first.clone())];
    let mut rest = words[1..].iter().peekable();
    while let Some(word) = rest.next() {
        if word == "DCT" || airway(word) {
            // An airway or DCT with nothing after it ends nowhere, so it's left out.
            if let Some(to) = rest.next() {
                let via = if word == "DCT" {
                    "DIRECT"
                } else {
                    word.as_str()
                };
                legs.push((via.to_owned(), to.clone()));
            }
        } else {
            legs.push(("DIRECT".to_owned(), word.clone()));
        }
    }
    legs
}

/// An airway's name: one or two letters, then one to four digits, and maybe a letter (J1, Q1,
/// UL607, T260). Waypoints and navaids have no digits there.
fn airway(word: &str) -> bool {
    let letters = word.bytes().take_while(u8::is_ascii_uppercase).count();
    let digits = word[letters..]
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    let tail = word.len() - letters - digits;
    (1..=2).contains(&letters)
        && (1..=4).contains(&digits)
        && tail <= 1
        && word[letters + digits..]
            .bytes()
            .all(|b| b.is_ascii_uppercase())
}

/// A SID or STAR's name: three to six letters, one digit, and maybe a letter (SUMMA2, BDEGA4).
fn procedure(word: &str) -> bool {
    let letters = word.bytes().take_while(u8::is_ascii_uppercase).count();
    let rest = &word.as_bytes()[letters..];
    (3..=6).contains(&letters)
        && match rest {
            [d] => d.is_ascii_digit(),
            [d, l] => d.is_ascii_digit() && l.is_ascii_uppercase(),
            _ => false,
        }
}

/// The flight's values, as CDU text reads them, with the pack's calculated fields.
struct Values<'a> {
    flight: &'a Flight,
    calculated: std::collections::BTreeMap<FieldId, String>,
    /// The pack's calculated fields, which are never read from what the flight saved.
    calculated_ids: std::collections::BTreeSet<String>,
    legs: Vec<(String, String)>,
    /// The departure procedure is known: it takes a row of the legs.
    sid_known: bool,
}

impl<'a> Values<'a> {
    fn new(pack: &FlatPack, flight: &'a Flight) -> Self {
        let get = |source| {
            field_from(pack, source)
                .and_then(|f| flight.values.get(f.id.as_str()))
                .map(|v| v.trim())
                .filter(|v| !v.is_empty())
        };
        let sid = get(SimbriefSource::Sid);
        let star = get(SimbriefSource::Star);
        Self {
            flight,
            calculated: crate::values::calculated(pack, flight),
            calculated_ids: crate::values::fields(pack)
                .filter(|f| f.calculated.is_some())
                .map(|f| f.id.clone())
                .collect(),
            legs: get(SimbriefSource::Route).map_or_else(Vec::new, |r| route_legs(r, sid, star)),
            sid_known: sid.is_some(),
        }
    }

    fn known(&self, id: &FieldId) -> Option<&str> {
        // A calculated field is never stored, so a value saved under its id is stale.
        if self.calculated_ids.contains(id.as_str()) {
            self.calculated.get(id)
        } else {
            self.flight.values.get(id.as_str())
        }
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    }

    fn text(&self, text: &CduText) -> Vec<CduSpan> {
        let mut out = vec![];
        for part in text {
            match part {
                CduPart::Text(t) => out.push(plain(t, None)),
                CduPart::Styled(s) => out.push(plain(&s.text, Some(s.style))),
                CduPart::Field(f) => self.field(f, &mut out),
                CduPart::RouteCount(c) => self.count(c, &mut out),
                CduPart::When(w) => {
                    let all = w.when_known.iter().all(|id| self.known(id).is_some());
                    for inline in if all { &w.show } else { &w.otherwise } {
                        match inline {
                            CduInline::Text(t) => out.push(plain(t, None)),
                            CduInline::Styled(s) => out.push(plain(&s.text, Some(s.style))),
                            CduInline::Field(f) => self.field(f, &mut out),
                            CduInline::RouteCount(c) => self.count(c, &mut out),
                        }
                    }
                }
            }
        }
        out.retain(|s| !s.text.is_empty());
        out
    }

    fn field(&self, f: &CduField, out: &mut Vec<CduSpan>) {
        let value = if f.field.as_str() == FieldId::ROUTE_LEG {
            f.index
                .and_then(|n| self.legs.get((n as usize).checked_sub(1)?))
                .map(|(via, to)| match f.part {
                    Some(RouteLegPart::Via) => via.as_str(),
                    _ => to.as_str(),
                })
        } else {
            self.known(&f.field)
        };
        match value {
            // The literal text either side is drawn in the value's style, but isn't the value.
            Some(v) => {
                out.push(plain(f.before.as_deref().unwrap_or(""), f.style));
                out.push(CduSpan {
                    text: f
                        .form
                        .and_then(|form| written(form, v))
                        .unwrap_or_else(|| v.to_owned()),
                    style: f.style,
                    value: true,
                });
                out.push(plain(f.after.as_deref().unwrap_or(""), f.style));
            }
            None => {
                if let Some(empty) = &f.empty {
                    out.push(plain(empty, f.empty_style));
                }
            }
        }
    }

    fn count(&self, c: &CduRouteCount, out: &mut Vec<CduSpan>) {
        let per_page = c.per_page.max(1) as usize;
        let n = match c.route_legs {
            RouteLegCount::Pages => (self.legs.len() + usize::from(self.sid_known))
                .div_ceil(per_page)
                .max(1),
            RouteLegCount::Overflow => self.legs.len().saturating_sub(per_page),
        };
        if n == 0
            && let Some(empty) = &c.empty
        {
            out.push(plain(empty, None));
            return;
        }
        out.push(plain(c.before.as_deref().unwrap_or(""), c.style));
        out.push(CduSpan {
            text: n.to_string(),
            style: c.style,
            value: true,
        });
        out.push(plain(c.after.as_deref().unwrap_or(""), c.style));
    }
}

fn digits(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_digit())
}

/// `2025-11-13` as its month and day (`NOV13`) and its year's last two digits (`25`).
fn date(d: &str) -> Option<(String, &str)> {
    const MONTHS: [&str; 12] = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    let mut p = d.split('-');
    let (y, m, day) = (p.next()?, p.next()?, p.next()?);
    if p.next().is_some() || !digits(y, 4) || !digits(m, 2) || !digits(day, 2) {
        return None;
    }
    let month = MONTHS.get(m.parse::<usize>().ok()?.checked_sub(1)?)?;
    Some((format!("{month}{day}"), &y[2..]))
}

/// A value written in a CDU form, or none when it doesn't read as one.
fn written(form: CduForm, v: &str) -> Option<String> {
    let celsius = |v: &str| {
        v.trim()
            .replace('\u{2212}', "-")
            .trim_start_matches('+')
            .parse::<f64>()
            .ok()
            .filter(|c| c.abs() <= 200.0)
            .map(f64::round)
    };
    match form {
        CduForm::Wind => {
            let (d, s) = v.split_once('/')?;
            let s = s.trim();
            (digits(d.trim(), 3)
                && !s.is_empty()
                && s.len() <= 3
                && s.bytes().all(|b| b.is_ascii_digit()))
            .then(|| format!("{}°/{s:0>3}", d.trim()))
        }
        CduForm::Temperature => {
            let c = celsius(v)?;
            Some(format!("{}°F {c}°C", (c * 1.8 + 32.0).round()))
        }
        CduForm::TemperatureChange => {
            let c = celsius(v)?;
            let sign = if c > 0.0 { "+" } else { "" };
            Some(format!("{sign}{}°F {sign}{c}°C", (c * 1.8).round()))
        }
        CduForm::Position => {
            let mut p = v.split_whitespace();
            let (lat, lon) = (
                p.next()?.parse::<f64>().ok()?,
                p.next()?.parse::<f64>().ok()?,
            );
            if p.next().is_some() || lat.abs() > 90.0 || lon.abs() > 180.0 {
                return None;
            }
            // Degrees, then minutes to a tenth; 59.96 minutes round up to the next degree.
            let part = |v: f64, pos: char, neg: char, width: usize| {
                let tenths = (v.abs() * 600.0).round();
                let deg = (tenths / 600.0).floor();
                let min = (tenths - deg * 600.0) / 10.0;
                let hemi = if v < 0.0 { neg } else { pos };
                format!("{hemi}{deg:0width$}°{min:04.1}")
            };
            Some(format!(
                "{} {}",
                part(lat, 'N', 'S', 2),
                part(lon, 'E', 'W', 3)
            ))
        }
        CduForm::UtcTime => {
            let (h, m) = v.trim().split_once(':')?;
            (digits(h, 2) && digits(m, 2)).then(|| format!("{h}{m}.0z"))
        }
        CduForm::MonthDayYear => {
            let (md, y) = date(v.trim())?;
            Some(format!("{md}/{y}"))
        }
        CduForm::MonthDayRange => {
            let (a, b) = v.trim().split_once('/')?;
            let ((from, _), (to, y)) = (date(a)?, date(b)?);
            Some(format!("{from}{to}/{y}"))
        }
    }
}

fn plain(text: &str, style: Option<CduStyle>) -> CduSpan {
    CduSpan {
        text: text.to_owned(),
        style,
        value: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{example_pack, ifly_pack};

    fn text(spans: &[CduSpan]) -> String {
        spans.iter().map(|s| s.text.as_str()).collect()
    }

    #[test]
    fn the_route_splits_into_rows() {
        assert_eq!(
            route_legs("summa2 summa j1 ekk dct ofoel", Some("SUMMA2"), None),
            vec![
                ("DIRECT".into(), "SUMMA".into()),
                ("J1".into(), "EKK".into()),
                ("DIRECT".into(), "OFOEL".into()),
            ]
        );
        assert_eq!(
            route_legs("DCT ALPHA Q1 BRAVO", None, None),
            vec![
                ("DIRECT".into(), "ALPHA".into()),
                ("Q1".into(), "BRAVO".into())
            ]
        );
        // An airway with no waypoint after it is left out; an empty route has no rows.
        assert_eq!(route_legs("ALPHA Q1", None, None).len(), 1);
        assert_eq!(route_legs("  ", None, None), Vec::<(String, String)>::new());
    }

    #[test]
    fn a_star_at_the_end_of_the_route_is_not_an_airway() {
        let board = vec![
            ("DIRECT".to_owned(), "SUMMA".to_owned()),
            ("Q1".into(), "ETCHY".into()),
            ("DIRECT".into(), "MLBEC".into()),
        ];
        // The board flight: the STAR is the flight's own, or only shaped like one.
        let route = "SUMMA2 SUMMA Q1 ETCHY MLBEC BDEGA4";
        assert_eq!(route_legs(route, Some("SUMMA2"), Some("BDEGA4")), board);
        assert_eq!(route_legs(route, None, None), board);
        // With the flight's STAR known, a last word only shaped like one is a waypoint, and a route
        // ending in a plain waypoint keeps it.
        assert_eq!(
            route_legs("SUMMA Q1 ETCHY MLBEC1", None, Some("BDEGA4")).last(),
            Some(&("DIRECT".to_owned(), "MLBEC1".to_owned()))
        );
        assert_eq!(
            route_legs("SUMMA Q1 ETCHY MLBEC1", None, None).last(),
            Some(&("Q1".to_owned(), "ETCHY".to_owned()))
        );
        assert_eq!(
            route_legs("SUMMA Q1 ETCHY MLBEC", None, Some("BDEGA4")).last(),
            Some(&("DIRECT".to_owned(), "MLBEC".to_owned()))
        );
        // Waypoints in a row are each flown DIRECT, and a trailing DCT goes.
        assert_eq!(
            route_legs("ALPHA BRAVO UL607 CHRLY DCT", None, None),
            vec![
                ("DIRECT".into(), "ALPHA".into()),
                ("DIRECT".into(), "BRAVO".into()),
                ("UL607".into(), "CHRLY".into()),
            ]
        );
        assert!(airway("UL607") && airway("Q1") && airway("J501") && !airway("ETCHY"));
        assert!(
            procedure("BDEGA4") && procedure("SUMMA2") && !procedure("Q1") && !procedure("KSFO")
        );
    }

    #[test]
    fn values_are_written_in_their_cdu_form() {
        let w = |form, v| written(form, v);
        assert_eq!(w(CduForm::Wind, "270/045").as_deref(), Some("270°/045"));
        assert_eq!(w(CduForm::Wind, "090/5").as_deref(), Some("090°/005"));
        assert_eq!(w(CduForm::Wind, "calm"), None);
        assert_eq!(
            w(CduForm::TemperatureChange, "2").as_deref(),
            Some("+4°F +2°C")
        );
        assert_eq!(
            w(CduForm::TemperatureChange, "-5").as_deref(),
            Some("-9°F -5°C")
        );
        assert_eq!(
            w(CduForm::TemperatureChange, "0").as_deref(),
            Some("0°F 0°C")
        );
        assert_eq!(
            w(CduForm::Temperature, "-52").as_deref(),
            Some("-62°F -52°C")
        );
        assert_eq!(
            w(CduForm::Temperature, "\u{2212}50").as_deref(),
            Some("-58°F -50°C")
        );
        assert_eq!(
            w(CduForm::Position, "47.449 -122.309").as_deref(),
            Some("N47°26.9 W122°18.5")
        );
        assert_eq!(
            w(CduForm::Position, "-33.9461 151.1772").as_deref(),
            Some("S33°56.8 E151°10.6")
        );
        assert_eq!(
            w(CduForm::Position, "0.0999 -0.9999").as_deref(),
            Some("N00°06.0 W001°00.0")
        );
        assert_eq!(w(CduForm::Position, "91 0"), None);
        assert_eq!(w(CduForm::Position, "position"), None);
        assert_eq!(w(CduForm::UtcTime, "10:00").as_deref(), Some("1000.0z"));
        assert_eq!(w(CduForm::UtcTime, "1000"), None);
        assert_eq!(
            w(CduForm::MonthDayYear, "2025-11-13").as_deref(),
            Some("NOV13/25")
        );
        assert_eq!(w(CduForm::MonthDayYear, "2025-13-01"), None);
        assert_eq!(
            w(CduForm::MonthDayRange, "2025-10-30/2025-11-27").as_deref(),
            Some("OCT30NOV27/25")
        );
        assert_eq!(w(CduForm::MonthDayRange, "2025-10-30"), None);
    }

    #[test]
    fn values_fill_in_and_unknown_ones_read_their_empty_text() {
        let pack = example_pack();
        let mut flight = crate::new_flight(&pack);
        let walk = cdu_walkthrough(&pack, &flight, "example-setup").unwrap();
        assert!(!walk.flight_added);
        assert_eq!(walk.at, None);
        let page = &walk.pages[0];
        assert_eq!(text(&page.action), "Type the planned fuel and press 1L.");
        assert!(
            page.action.iter().all(|s| !s.value),
            "empty text is plain words"
        );
        assert_eq!(text(&page.check), "Enter your weight.");
        assert_eq!(text(&page.screen.page), "1/1", "at least one page");
        let fuel = &page.screen.rows[0].left;
        assert_eq!(text(fuel), "□□□.□");
        assert_eq!(
            fuel[0].style,
            Some(CduStyle::Data),
            "the empty text's own style"
        );
        assert_eq!(text(&page.screen.rows[0].right), "(list of runways)");
        assert!(
            page.screen.scratchpad.is_empty(),
            "nothing when there's no empty text"
        );

        // Fuel in thousands is worked out from the block fuel (decision 0033).
        flight.values.insert("fuel".into(), "12400".into());
        flight.values.insert("zfw".into(), "126.5".into());
        flight.values.insert("runway".into(), "16L".into());
        flight.walkthroughs.insert("example-setup".into(), 0);
        let walk = cdu_walkthrough(&pack, &flight, "example-setup").unwrap();
        assert!(walk.flight_added);
        assert_eq!(walk.at, Some(0));
        let page = &walk.pages[0];
        assert_eq!(text(&page.action), "Type 12.4 and press 1L.");
        assert_eq!(
            page.action[1],
            CduSpan {
                text: "12.4".into(),
                style: None,
                value: true
            }
        );
        assert_eq!(text(&page.check), "Your weight is shown.");
        assert_eq!(text(&page.screen.rows[0].right), "<SEL> RW16L");
        // `before` is drawn in the value's style but isn't the value.
        let rw: Vec<_> = page.screen.rows[0].right[1..]
            .iter()
            .map(|s| (s.text.as_str(), s.style, s.value))
            .collect();
        assert_eq!(
            rw,
            vec![
                ("RW", Some(CduStyle::User), false),
                ("16L", Some(CduStyle::User), true)
            ]
        );
        assert_eq!(page.screen.rows[0].left[0].style, Some(CduStyle::User));
        assert!(cdu_walkthrough(&pack, &flight, "nope").is_none());
    }

    #[test]
    fn perf_init_and_pos_init_show_the_board_flight_in_the_cdus_forms() {
        let pack = ifly_pack();
        let mut flight = crate::new_flight(&pack);
        let page = |f: &Flight, name: &str| {
            cdu_walkthrough(&pack, f, "preflight-setup")
                .unwrap()
                .pages
                .into_iter()
                .find(|p| p.page == name)
                .unwrap()
        };
        let row = |p: &CduPageView, n: usize| {
            let r = &p.screen.rows[n];
            format!("{} | {}", text(&r.left), text(&r.right))
        };
        // Nothing known: the empty text.
        let perf = page(&flight, "PERF INIT");
        assert_eq!(row(&perf, 0), "□□□.□/--.-% | □□□□□");
        assert_eq!(row(&perf, 1), "---.-/--.-SENS | ---°/---");
        assert_eq!(row(&perf, 2), "□□□.□ | ---°F---°C");
        assert!(row(&perf, 3).ends_with("| ---°F---°C"));

        for (k, v) in [
            ("fuel", "12400"),
            ("zfw", "126.5"),
            ("cruise_level", "350"),
            ("isa_deviation", "2"),
            ("cruise_wind", "270/045"),
            ("origin_position", "47.449 -122.309"),
            ("utc_time", "10:00"),
            ("utc_date", "2025-11-13"),
            ("nav_active_dates", "2025-10-30/2025-11-27"),
            // A value saved under a calculated field's id is stale, never shown.
            ("gross_weight", "999.9"),
        ] {
            flight.values.insert(k.into(), v.into());
        }
        let perf = page(&flight, "PERF INIT");
        // Gross weight is ZFW plus plan fuel in thousands, rounded up: 126.5 + 12.4.
        assert_eq!(row(&perf, 0), "138.9/--.-% | FL350");
        assert_eq!(row(&perf, 1), "12.4/--.-SENS | 270°/045");
        assert_eq!(row(&perf, 2), "126.5 | +4°F +2°C");
        // FL350 is −54.3 °C in the standard atmosphere; 2 warmer is −52 °C.
        assert!(
            row(&perf, 3).ends_with("| -62°F -52°C"),
            "{}",
            row(&perf, 3)
        );
        assert!(perf.screen.rows[0].left[0].value);

        let pos = page(&flight, "POS INIT");
        assert_eq!(text(&pos.screen.rows[0].right), "N47°26.9 W122°18.5");
        assert_eq!(row(&pos, 4), "1000.0z | NOV13/25");
        let ident = page(&flight, "IDENT");
        assert_eq!(text(&ident.screen.rows[1].right), "OCT30NOV27/25");

        // Without fuel, neither plan fuel nor gross weight is known.
        flight.values.remove("fuel");
        let perf = page(&flight, "PERF INIT");
        assert_eq!(row(&perf, 0), "□□□.□/--.-% | FL350");
    }

    #[test]
    fn route_rows_and_counts_come_from_the_flights_route() {
        let pack = ifly_pack();
        let mut flight = crate::new_flight(&pack);
        let rte = |f: &Flight| {
            let w = cdu_walkthrough(&pack, f, "preflight-setup").unwrap();
            let rte = w
                .pages
                .iter()
                .find(|p| p.title == "Enter the route")
                .unwrap()
                .clone();
            let legs = w.pages.iter().find(|p| p.page == "LEGS").unwrap().clone();
            (rte, legs)
        };
        let (page, legs) = rte(&flight);
        assert_eq!(text(&page.screen.rows[0].left), "------");
        assert_eq!(
            text(&page.note),
            "The SID and STAR come from DEP/ARR, so leave them out here."
        );
        assert_eq!(text(&legs.screen.page), "1/1");

        flight.values.insert("sid".into(), "SUMMA2".into());
        flight.values.insert(
            "route".into(),
            "SUMMA2 SUMMA J1 AAA J2 BBB J3 CCC J4 DDD J5 EEE J6 FFF".into(),
        );
        let (page, legs) = rte(&flight);
        let row = |n: usize| {
            let r = &page.screen.rows[n];
            format!("{} {}", text(&r.left), text(&r.right))
        };
        assert_eq!(row(0), "DIRECT SUMMA");
        assert_eq!(row(4), "J4 DDD");
        assert_eq!(
            text(&page.note),
            "2 more on the following RTE pages. The SID and STAR come from DEP/ARR, so leave them out here."
        );
        assert_eq!(text(&page.screen.scratchpad), "SUMMA");
        // Seven rows and the SID: two pages of five.
        assert_eq!(text(&legs.screen.page), "1/2");
    }
}
