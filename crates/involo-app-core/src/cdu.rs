// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! CDU walkthroughs as the app shows them (#215): each page's text with the flight's values filled
//! in. A value that isn't known shows its `empty` text instead, or nothing. The only numbers the
//! app works out are the ones the pack names: the route's rows, split from the flight's route, and
//! the counts made from them. Nothing else is calculated.

use involo_checklist_core::{
    CduField, CduInline, CduPart, CduRouteCount, CduStyle, CduText, CduWalkthrough, FieldId,
    RouteLegCount, RouteLegPart, SimbriefSource,
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

/// The route split into CDU rows, `(via, to)`, as 3.0 did: the words of the route, without a SID
/// it starts with (DEP/ARR enters it) or a leading DCT; the first word is flown DIRECT, and each
/// pair after it is an airway (DCT is DIRECT) and the waypoint it ends at.
fn route_legs(route: &str, sid: Option<&str>) -> Vec<(String, String)> {
    let mut words: Vec<String> = route.split_whitespace().map(str::to_uppercase).collect();
    if let (Some(first), Some(sid)) = (words.first(), sid)
        && first.eq_ignore_ascii_case(sid.trim())
    {
        words.remove(0);
    }
    if words.first().is_some_and(|w| w == "DCT") {
        words.remove(0);
    }
    let Some(first) = words.first() else {
        return vec![];
    };
    let mut legs = vec![("DIRECT".to_owned(), first.clone())];
    for [via, to] in words[1..].as_chunks::<2>().0 {
        let via = if via == "DCT" { "DIRECT" } else { via };
        legs.push((via.to_owned(), to.clone()));
    }
    legs
}

/// The flight's values, as CDU text reads them.
struct Values<'a> {
    flight: &'a Flight,
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
        Self {
            flight,
            legs: get(SimbriefSource::Route).map_or_else(Vec::new, |r| route_legs(r, sid)),
            sid_known: sid.is_some(),
        }
    }

    fn known(&self, id: &FieldId) -> Option<&str> {
        self.flight
            .values
            .get(id.as_str())
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
                    text: v.to_owned(),
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
    fn the_route_splits_into_rows_as_3_0_did() {
        assert_eq!(
            route_legs("summa2 summa j1 ekk dct ofoel", Some("SUMMA2")),
            vec![
                ("DIRECT".into(), "SUMMA".into()),
                ("J1".into(), "EKK".into()),
                ("DIRECT".into(), "OFOEL".into()),
            ]
        );
        assert_eq!(
            route_legs("DCT ALPHA Q1 BRAVO", None),
            vec![
                ("DIRECT".into(), "ALPHA".into()),
                ("Q1".into(), "BRAVO".into())
            ]
        );
        // An airway with no waypoint after it is left out; an empty route has no rows.
        assert_eq!(route_legs("ALPHA Q1", None).len(), 1);
        assert_eq!(route_legs("  ", None), Vec::<(String, String)>::new());
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

        flight.values.insert("fuel_thousands".into(), "12.4".into());
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
