// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `flight.yaml`: the flight fields a pack defines (decision 0029). Steps fill their blanks and
//! hints from these fields, and a SimBrief plan fills the fields that name a source. SimBrief
//! sources are the app's own list ([`SimbriefSource`]): they describe SimBrief, not an aircraft.

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
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub prefix: String,
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub suffix: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub join: Option<String>,
    }

    /// Which way a value is rounded to its `step`.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum Rounding {
        Up,
        Down,
        Nearest,
    }

    /// How a number from a plan is stored: divided by `scale` (1000 for thousands, as the CDU
    /// takes a weight), then rounded to a multiple of `step` (0.1 keeps one decimal).
    pub struct FieldDisplay {
        pub scale: f64,
        pub round: Rounding,
        pub step: f64,
    }

    /// The range a number may take, in one unit (a value of the field's `unit` field), or in
    /// every unit when `unit` is left out.
    pub struct FieldRange {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub unit: Option<String>,
        pub min: f64,
        pub max: f64,
    }

    /// One choice of a choice field, with the text shown for it when it differs from the value.
    pub struct FieldChoice {
        pub value: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label: Option<String>,
    }

    /// One flight field.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct FlightField {
        /// Lower-case letters, digits and underscores, e.g. `zfw`. Steps name it in `fill`,
        /// `hint` and CDU text, and saved flights key its value by it.
        pub id: String,
        pub label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub description: Option<String>,
        pub kind: FieldKind,
        /// For a number: the choice field that holds its unit (`weight_unit`), whose values its
        /// `ranges` name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub unit: Option<String>,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub group: Option<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub show_in: Vec<ShowIn>,
        /// How it reads in the flight strip, when `show_in` names the strip.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub strip: Option<StripText>,
        /// How a number from a plan is stored.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub display: Option<FieldDisplay>,
        /// The plan values that fill it. More than one are added together (reserve fuel and
        /// alternate fuel, for the FMC's reserves).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub simbrief: Vec<SimbriefSource>,
    }

    /// `flight.yaml`: the pack's flight fields, in order.
    pub struct FlightFile {
        pub fields: Vec<FlightField>,
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
    }
}
