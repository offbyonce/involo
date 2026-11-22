// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `flight.yaml`: the flight fields a pack defines (decision 0029). Steps fill their blanks and
//! hints from these fields, and a SimBrief plan fills the fields that name a source. SimBrief
//! sources are the app's own list ([`SimbriefSource`]): they describe SimBrief, not an aircraft.

/// The app's Flight pages that hold fields, as `pages`, a field's `page` and an option's
/// `ask_in` (`flight:approach`) name them.
pub const FIELD_PAGES: [&str; 6] = [
    "route",
    "fuel",
    "cruise",
    "clearance",
    "takeoff",
    "approach",
];

data_types! {
    /// What a field holds.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum FieldKind {
        /// A number, with ranges per unit when it has a `unit`.
        Number,
        /// Any text.
        Text,
        /// One of the field's `choices`.
        Choice,
    }

    /// Where else a field's value shows, besides the Flight pages.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum ShowIn {
        /// The flight strip's summary, in the pack's order.
        Strip,
        /// The Arrival data box.
        Arrival,
    }

    /// How a field's value reads in the flight strip: `prefix`, the value, `suffix`. A field with
    /// `join` follows the strip part before it, after that text (the destination after the
    /// departure with " → ", a transition after its SID with ".").
    pub struct StripText {
        /// Text written before the value, e.g. "FL".
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub prefix: String,
        /// Text written after the value.
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub suffix: String,
        /// The text that joins this value to the strip part before it (" → ", "."); without it,
        /// the value starts a part of its own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub join: Option<String>,
    }

    /// Which way a value is rounded to its `step`.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum Rounding {
        /// To the next multiple of `step` up.
        Up,
        /// To the next multiple of `step` down.
        Down,
        /// To the nearest multiple of `step`.
        Nearest,
    }

    /// How a number from a plan is stored: divided by `scale` (1000 for thousands, as the CDU
    /// takes a weight), then rounded to a multiple of `step` (0.1 keeps one decimal).
    pub struct FieldDisplay {
        /// What the plan's number is divided by before it is stored, e.g. 1000.
        pub scale: f64,
        /// Which way the scaled number is rounded to `step`.
        pub round: Rounding,
        /// The multiple the scaled number is rounded to, e.g. 0.1 for one decimal.
        pub step: f64,
    }

    /// The range a number may take, in one unit (a value of the field's `unit` field), or in
    /// every unit when `unit` is left out. Stored values are checked, so a weight stored in
    /// thousands has its range in thousands.
    pub struct FieldRange {
        /// The unit this range is for: a value of the field's `unit` field, e.g. `KG`. Left
        /// out, the range holds in every unit.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub unit: Option<String>,
        /// The lowest value in range; the Flight pages flag a value below it.
        pub min: f64,
        /// The highest value in range; the Flight pages flag a value above it.
        pub max: f64,
        /// What the Flight pages say under a value outside the range, e.g. "Enter FL100 to
        /// FL410"; `{unit}` is the flight's unit in lower case. Without it, "Enter {min} to
        /// {max}", in the values as the page shows them.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub message: Option<String>,
    }

    /// How a value is typed on the Flight pages.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum InputMode {
        /// Whole numbers.
        Numeric,
        /// Numbers with a decimal point.
        Decimal,
        /// Any text.
        Text,
    }

    /// The box a value is typed in. Every part is optional: without them, the box takes text of
    /// any length, or numbers for a number field, and shows no placeholder beyond the app's.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct FieldInput {
        /// The most characters the box takes.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub max_length: Option<u32>,
        /// What the box takes: it picks the keyboard a phone shows, and a number mode stores the
        /// value without a leading "FL" or any "°", "%", "+", comma or space typed with it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub mode: Option<InputMode>,
        /// What the empty box says, e.g. "From the FMC".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub placeholder: Option<String>,
    }

    /// How a value reads on the Flight pages: `prefix`, the value, `suffix` ("FL" 360, 24.5
    /// "%"), with thousands grouped (18,000) or a plus sign on a positive number (+2). Content
    /// only: the app decides how it looks.
    pub struct FieldShow {
        /// Text shown before the value, e.g. "FL".
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub prefix: String,
        /// Text shown after the value, e.g. "%".
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub suffix: String,
        /// Show a number with its thousands grouped (18,000). Takes the place of `signed`.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub grouped: bool,
        /// Show a plus sign before a positive number (+2).
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub signed: bool,
    }

    /// The side panel beside a selected row: where the flight plan (the OFP) prints the value.
    /// The app has a panel for each SimBrief source it reads; these parts change it. A field
    /// with no source and no panel of its own takes its page's, or the app's "not in the plan"
    /// panel.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct FieldOfp {
        /// Show where the plan prints this source (the plan's close-up of it).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub from: Option<SimbriefSource>,
        /// The panel's heading, in place of the app's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        /// The text under the heading, in place of the app's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub body: Option<String>,
        /// The note under the plan's close-up, in place of the app's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub note: Option<String>,
        /// The value is not set from the plan (a clearance, a value from the aircraft's own
        /// computer), which the panel says.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub not_in_plan: Option<bool>,
        /// The panel shows the plan's page outline; false shows the close-up alone.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub outline: Option<bool>,
    }

    /// A read-only copy of a field on another page and group, with a link to the field's own
    /// page, e.g. the runway on the Takeoff page.
    pub struct FieldAlso {
        /// The Flight page the copy shows on, e.g. `takeoff`.
        pub page: String,
        /// The card on that page the copy shows in, by its title.
        pub group: String,
        /// The row's label there; the field's own label otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label: Option<String>,
        /// The row's description there; the field's own otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        /// The side panel's parts for the copy, over the field's own panel.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub ofp: Option<FieldOfp>,
    }

    /// A field whose group toggles a unit: the choice field it sets, and the words before the
    /// toggle ("Weights in"); the field's label otherwise.
    pub struct GroupUnits {
        /// The id of the choice field the toggle sets, e.g. `weight_unit`.
        pub field: String,
        /// The words before the toggle; the field's label otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label: Option<String>,
    }

    /// The flight's notes from ATC, as a row of a group: its label and description.
    pub struct NotesRow {
        /// The row's label.
        pub label: String,
        /// The text under the label.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
    }

    /// One titled card of a Flight page. Its rows are the fields naming this page and group,
    /// in `flight.yaml`'s order.
    pub struct FlightGroup {
        /// The card's title. Fields name it as their `group`, and `also` copies as theirs.
        pub title: String,
        /// A short note in the card's header, e.g. "Same unit as fuel".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub note: Option<String>,
        /// A unit toggle in the card's header.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub units: Option<GroupUnits>,
        /// The flight's notes from ATC, as the card's last row.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub notes: Option<NotesRow>,
        /// The order of its rows, by field id (a field naming this page and group, or a copy
        /// `also` places here); fields not listed follow in `flight.yaml`'s order.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub fields: Vec<String>,
    }

    /// One Flight page: one of the app's (`route`, `fuel`, `cruise`, `clearance`, `takeoff`,
    /// `approach`), with its title, sub-line and cards. Without `pages`, the app's own page
    /// names hold every field, each card titled by the fields' `group`.
    pub struct FlightPage {
        /// Which of the app's Flight pages this is; fields name it as their `page`.
        pub id: String,
        /// The page's title.
        pub title: String,
        /// The line under the title.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub sub: Option<String>,
        /// The field selected when the page opens; its first otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub selected: Option<String>,
        /// The side panel for the page's fields with no source and no panel of their own.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub ofp: Option<FieldOfp>,
        /// The page's cards, in order. A card with no rows is left out.
        pub groups: Vec<FlightGroup>,
    }

    /// One choice of a choice field, with the text shown for it when it differs from the value.
    pub struct FieldChoice {
        /// The value stored when it is chosen.
        pub value: String,
        /// The text shown for it; the value otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label: Option<String>,
    }

    /// One flight field.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct FlightField {
        /// Lower-case letters, digits and underscores, e.g. `zfw`. Steps name it in `fill`,
        /// `hint` and CDU text, and saved flights key its value by it.
        pub id: String,
        /// The row's name on the Flight pages.
        pub label: String,
        /// The text under the row's name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        /// What it holds: a number, any text, or one of its `choices`.
        pub kind: FieldKind,
        /// For a number: the choice field that holds its unit (`weight_unit`), whose values its
        /// `ranges` name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub unit: Option<String>,
        /// For a number: the values in range, per unit or for every unit. A value outside is
        /// flagged on the Flight pages.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub ranges: Vec<FieldRange>,
        /// For a choice field: its values, in order.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub choices: Vec<FieldChoice>,
        /// Where the value goes in the aircraft, e.g. "Enter on the CDU › PERF INIT".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub location: Option<String>,
        /// The Flight page and group it shows in.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub page: Option<String>,
        /// The card on its page it shows in: a `pages` card by its title, or, without `pages`,
        /// the title of the card it makes.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub group: Option<String>,
        /// Where else its value shows: the flight strip, the Arrival data box.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub show_in: Vec<ShowIn>,
        /// How it reads in the flight strip, when `show_in` names the strip.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub strip: Option<StripText>,
        /// How a number from a plan is stored.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub display: Option<FieldDisplay>,
        /// The plan values that fill it. More than one are added together (reserve fuel and
        /// alternate fuel, for the FMC's reserves). A read-only source (air distance, en route
        /// time, trip fuel, taxi fuel) is shown from the plan and never stored.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub simbrief: Vec<SimbriefSource>,
        /// The Flight pages' box for it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub input: Option<FieldInput>,
        /// How its value reads on the Flight pages.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub show: Option<FieldShow>,
        /// What a link or a second box calls it ("V1", "runway heading"); its id, in words,
        /// otherwise.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub spoken: Option<String>,
        /// A second field typed in the same row (cargo, beside passengers).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub with: Option<String>,
        /// A choice field of two choices shown under its description (minimums: BARO or RADIO).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub toggle: Option<String>,
        /// Read-only copies on other pages.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub also: Vec<FieldAlso>,
        /// Shown on its page but not typed there.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub read_only: bool,
        /// The phase that uses it, linked from its row ("Before start ›").
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub phase: Option<String>,
        /// An option whose suggestion (decision 0027) the row shows as its value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub suggested_by: Option<String>,
        /// Counted in "N to enter" though no step fills it; a field a step fills always is.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub needed: bool,
        /// The side panel's parts for its row.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub ofp: Option<FieldOfp>,
    }

    /// `flight.yaml`: the pack's Flight pages and its flight fields, in order. The pack gives
    /// content and grouping only; the app decides how every part looks.
    pub struct FlightFile {
        /// The Flight pages' titles and cards. Without them, each page the fields name holds
        /// them, in cards titled by their `group`.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub pages: Vec<FlightPage>,
        /// Every flight field, in order: the order rows and strip parts follow.
        pub fields: Vec<FlightField>,
        /// The Overview page's "This flight" rows. Without them, one row per Flight page that
        /// has fields: its title, its first two values and its sub-line.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub overview: Vec<FlightOverviewRow>,
    }

    /// A "This flight" row on the Overview page, linking to a Flight page by its title. `value`
    /// and `description` are parts written with `{field}` for a field's value as typed,
    /// `{field:grouped}` for a number with its thousands grouped, and `{unit}` for the flight's
    /// unit. A part shows when any field it names has a value, its other fields reading "—";
    /// value parts join with " · ", description parts with a space.
    pub struct FlightOverviewRow {
        /// The row's label.
        pub label: String,
        /// The Flight page the row links to.
        pub page: String,
        /// The row's value, as parts joined with " · ".
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub value: Vec<String>,
        /// The text under the value, as parts joined with a space.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub description: Vec<String>,
        /// The description when no description part shows.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub empty: Option<String>,
    }

    /// A value the app reads from a SimBrief plan. The list is the app's: it describes SimBrief,
    /// so a pack chooses among these sources but cannot add one.
    #[derive(Copy, Eq, PartialOrd, Ord)]
    #[serde(rename_all = "snake_case")]
    pub enum SimbriefSource {
        /// Departure airport, ICAO code.
        Origin,
        /// Destination airport, ICAO code.
        Destination,
        /// The first alternate, ICAO code.
        Alternate,
        /// Airline code and flight number, at most seven characters.
        FlightNumber,
        /// The cruise flight level.
        CruiseLevel,
        /// The departure runway.
        Runway,
        /// The SID.
        Sid,
        /// The SID's transition.
        Transition,
        /// The arrival runway.
        ArrivalRunway,
        /// The STAR.
        Star,
        /// The filed route.
        Route,
        /// Block (ramp) fuel, in the plan's unit.
        BlockFuel,
        /// Reserve fuel, in the plan's unit.
        ReserveFuel,
        /// Alternate fuel, in the plan's unit.
        AlternateFuel,
        /// Minimum takeoff fuel, in the plan's unit.
        MinimumTakeoffFuel,
        /// The plan's weight unit, `LB` or `KG`.
        WeightUnit,
        /// Zero fuel weight, in the plan's unit.
        ZeroFuelWeight,
        /// Planned takeoff weight, in the plan's unit.
        TakeoffWeight,
        /// Passengers.
        Passengers,
        /// Cargo, in the plan's unit.
        Cargo,
        /// Cost index.
        CostIndex,
        /// Average wind at cruise, `ddd/sss`.
        CruiseWind,
        /// Average ISA deviation at cruise.
        IsaDeviation,
        /// The departure's transition altitude, in feet.
        TransitionAltitude,
        /// The destination's transition level, as a flight level.
        TransitionLevel,
        /// The destination's elevation, in feet.
        DestinationElevation,
        /// The departure's altimeter setting, from its METAR.
        OriginAltimeter,
        /// The destination's altimeter setting, from its METAR, in the departure's unit.
        DestinationAltimeter,
        /// The altimeter setting's unit, `inHg` or `hPa`.
        AltimeterUnit,
        /// The departure airport's position, latitude and longitude.
        OriginPosition,
        /// The AIRAC cycle.
        NavDatabase,
        /// The AIRAC cycle's dates: when it takes effect and when the next one does, as
        /// `2025-10-30/2025-11-27`.
        NavDatabaseDates,
        /// The planned time out of the gate, in UTC, as `10:00`.
        DepartureTime,
        /// The planned date out of the gate, in UTC, as `2025-11-13`.
        DepartureDate,
        /// The planned air distance, read-only.
        AirDistance,
        /// The planned time en route, read-only.
        EnrouteTime,
        /// Trip fuel, read-only.
        TripFuel,
        /// Taxi fuel, read-only.
        TaxiFuel,
    }
}
