// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `cdu.yaml`: CDU walkthroughs and the text they show.

use crate::model::FieldId;

data_types! {
    /// How text appears on the CDU screen.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum CduStyle {
        /// System data the pilot does not enter.
        Data,
        /// Values the system has calculated or accepted.
        Accent,
        /// Values the pilot enters.
        User,
    }

    /// Fixed text in a style.
    pub struct CduStyled {
        /// The text.
        pub text: String,
        /// The style it is drawn in.
        pub style: CduStyle,
    }

    /// Which half of a route row a field shows.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum RouteLegPart {
        /// The left half: the way the leg is flown.
        Via,
        /// The right half: where the leg ends.
        To,
    }

    /// How a value is written on the CDU screen. The forms are the app's: they describe ways of
    /// writing a value, not an aircraft. A value that doesn't read as its form shows as it is.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum CduForm {
        /// A wind, `ddd/sss`, with a degree sign after the direction: `270°/045`.
        Wind,
        /// A temperature in degrees Celsius, in Fahrenheit then Celsius: `-62°F -52°C`.
        Temperature,
        /// A temperature difference in degrees Celsius, signed, in Fahrenheit then Celsius:
        /// `+4°F +2°C`.
        TemperatureChange,
        /// A UTC time, `10:00`, as hours, minutes and tenths of a minute: `1000.0z`.
        UtcTime,
        /// A date, `2025-11-13`, as month, day and year: `NOV13/25`.
        MonthDayYear,
        /// Two dates, `2025-10-30/2025-11-27`, as month and day each, then the second's year:
        /// `OCT30NOV27/25`.
        MonthDayRange,
    }

    /// A live flight value. Calculations happen in the app, never in the pack.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct CduField {
        /// The flight field whose value is shown, which the pack must define. `route_leg` shows
        /// one route row and needs `index` and `part`; `manual` is not allowed here.
        pub field: FieldId,
        /// For `route_leg`: the row, from 1 to `MAX_ROUTE_LEG`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub index: Option<u32>,
        /// For `route_leg`: which half of the row.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub part: Option<RouteLegPart>,
        /// How the value is written, when the CDU writes it differently from the Flight pages.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub form: Option<CduForm>,
        /// The style the value is drawn in.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub style: Option<CduStyle>,
        /// Literal text before the value, e.g. `RW`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub before: Option<String>,
        /// Literal text after the value, e.g. a degree sign.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub after: Option<String>,
        /// Shown when the value is not known.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub empty: Option<String>,
        /// The style `empty` is drawn in.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub empty_style: Option<CduStyle>,
    }

    /// A count the app works out from the route.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum RouteLegCount {
        /// How many pages the route legs and departure need, at least 1.
        Pages,
        /// How many route rows do not fit on the first page.
        Overflow,
    }

    /// A number calculated from the route. The rows per page are the aircraft's, so they
    /// come from the pack.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct CduRouteCount {
        /// Which count: the pages, or the rows past the first page.
        pub route_legs: RouteLegCount,
        /// How many route rows one page holds; at least 1.
        pub per_page: u32,
        /// The style the number is drawn in.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub style: Option<CduStyle>,
        /// Literal text before the number.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub before: Option<String>,
        /// Literal text after the number.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub after: Option<String>,
        /// Shown instead when the count is zero.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub empty: Option<String>,
    }

    /// Text or a live value, in any style. Mix several in a row to style them differently.
    #[serde(untagged)]
    pub enum CduInline {
        Text(String),
        Styled(CduStyled),
        Field(CduField),
        RouteCount(CduRouteCount),
    }

    /// Shows one group of parts when flight values are known and another when they are not,
    /// e.g. `<SEL>` beside a runway, or a placeholder until there is a runway. Does not nest.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct CduWhen {
        /// Every one of these must be known for `show` to appear.
        pub when_known: Vec<FieldId>,
        /// The parts shown when every field in `when_known` is known.
        pub show: Vec<CduInline>,
        /// The parts shown when any of them is not; nothing when left out.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub otherwise: Vec<CduInline>,
    }

    /// One piece of CDU text.
    #[serde(untagged)]
    pub enum CduPart {
        Text(String),
        Styled(CduStyled),
        Field(CduField),
        RouteCount(CduRouteCount),
        When(CduWhen),
    }
}

/// CDU text: parts joined in order, so live values never need a template language.
pub type CduText = Vec<CduPart>;

data_types! {
    /// One line select row: a small label line above a value line.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct CduRow {
        /// Draws a divider instead of the labels; empty text means a plain line.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub separator: Option<String>,
        /// The small label above the left value.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub left_label: CduText,
        /// The value on the left, beside its line select key.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub left: CduText,
        /// The small label above the right value.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub right_label: CduText,
        /// The value on the right, beside its line select key.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub right: CduText,
    }

    /// What the CDU shows on one walkthrough page.
    pub struct CduScreen {
        /// The title line at the top of the screen.
        pub title: CduText,
        /// The page count beside the title, e.g. `1/2`.
        pub page: CduText,
        /// The line select rows, top to bottom.
        pub rows: Vec<CduRow>,
        /// Line select keys to highlight, e.g. `2L`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub highlight: Vec<String>,
        /// The scratchpad line below the rows.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub scratchpad: CduText,
    }

    /// One step of a CDU walkthrough.
    pub struct CduPage {
        /// The CDU page name, e.g. `PERF INIT`.
        pub page: String,
        /// The function key to highlight.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub key: Option<String>,
        /// This step's heading.
        pub title: String,
        /// What to do on this page.
        pub action: CduText,
        /// What to check once it is done.
        pub check: CduText,
        /// A further note for this page.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub note: CduText,
        /// What the CDU screen shows at this step.
        pub screen: CduScreen,
    }

    /// A page-by-page guide a step can open.
    pub struct CduWalkthrough {
        /// Unique in the pack; a step's `opens` names it.
        pub id: String,
        /// Its name.
        pub title: String,
        /// Its steps, in order.
        pub pages: Vec<CduPage>,
    }

    /// `cdu.yaml`: page-by-page CDU walkthroughs, each with the text and live flight values the
    /// screen shows at every step. A step's `opens` names one, and the app opens it from that step
    /// in the slide-out, with the flight's values filled in.
    pub struct CduFile {
        /// Every walkthrough.
        pub walkthroughs: Vec<CduWalkthrough>,
    }
}
