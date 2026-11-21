// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `panels/*.yaml`: panel drawings.

data_types! {
    /// What a panel item is, which decides how it is drawn.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum PanelItemKind {
        /// A lever switch flipped between its positions, such as the battery switch; may be
        /// guarded.
        ToggleSwitch,
        /// A rotary knob turned to one of its named positions, drawn on a dial (`angles`).
        Selector,
        /// A button pressed and released; may be guarded.
        PushButton,
        /// An annunciator light in one of the light roles (`color`).
        Light,
        /// A round dial with a pointer, such as a pressure or quantity gauge.
        Gauge,
        /// A small digital window showing a value, such as a frequency or a meter display;
        /// drawn at its `width` and `height`.
        Readout,
        /// A screen, such as a flight or engine display; drawn at its `width` and `height`.
        DisplayUnit,
        /// A lever moved along a slot, such as the start, speedbrake, gear and flap levers.
        Lever,
        /// A handle that is pulled, such as the parking brake and the fire handles.
        Handle,
        /// A rotary knob that is also pushed in or pulled out. Two positions: pushed in first,
        /// pulled out second (format 6).
        PushPullKnob,
        /// A pushbutton with one or two legends that light (`legends`), set to one of its
        /// `positions` (format 6).
        LegendPushbutton,
        /// A two-way switch that tips about its middle. Two positions: the top end pressed
        /// first, the bottom end second (format 6).
        Rocker,
        /// A block of keys: its `positions` are the keys, row by row, `columns` to a row
        /// (format 6). A step presses one key per target.
        Keypad,
    }

    /// A light's role: which light it is, never a color value. The app draws each role in its
    /// theme's lit color (decision 0021); white has no lit color of its own and is drawn in the
    /// panel's text color.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum LightColor {
        /// Drawn in the theme's amber lit color.
        Amber,
        /// Drawn in the theme's red lit color.
        Red,
        /// Drawn in the theme's green lit color.
        Green,
        /// Drawn in the theme's blue lit color.
        Blue,
        /// Drawn in the panel's text color.
        White,
    }

    /// One legend of a legend pushbutton, e.g. FAULT in amber or OFF in white.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Legend {
        /// The legend's words, as the button shows them (`FAULT`, `OFF`).
        pub text: String,
        /// Its light's role.
        pub light: LightColor,
        /// The button's positions it is lit in (OFF lit when pushed to OFF). Without any, it is
        /// lit by the airplane, not the button (FAULT), and shows lit when a step expects the
        /// button's light on.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub lit_in: Vec<String>,
    }

    /// One item on a panel drawing. Positions are our own layout.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct PanelItem {
        /// An id, unique in its section, so a step target or light note can name the item as
        /// `panel/section/#id`, and a pack extending this one can change it (decision 0029).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub id: Option<String>,
        /// What the item is, which decides how it is drawn and the fields it takes.
        pub kind: PanelItemKind,
        /// The item's name, drawn on the panel and used in its locator,
        /// `panel/section/LABEL/n`.
        pub label: String,
        /// Required on a light, and only valid on a light.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub color: Option<LightColor>,
        /// Has a protective cover. Only valid on a toggle switch or push button.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub guarded: bool,
        /// The item's center across, in panel units from its section's left edge.
        pub x: f64,
        /// The item's center down, in panel units from its section's top edge.
        pub y: f64,
        /// Ids of the controls this item belongs to.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub controls: Vec<String>,
        /// The positions it can be set to, in order, e.g. `[OFF, AUTO, ON]`. A position may hold a
        /// comma.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub positions: Vec<String>,
        /// Where it rests when the airplane is cold and dark: one of `positions`. Drawings show it,
        /// dimmed, on controls a step does not use (decision 0015).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub rest: Option<String>,
        /// Only on a light: the position, on another item it shares a control with, that turns
        /// it on, e.g. the parking brake at SET. Drawings show the light on, as expected, when a
        /// step asks for that position.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub lit_at: Option<String>,
        /// Only on a selector: each position's angle on the dial, in degrees clockwise from
        /// straight up, as on the panel (decision 0017). Without it, the positions spread over
        /// the top of the dial.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub angles: Option<Vec<f64>>,
        /// Only on a legend pushbutton: its legends, top then bottom; a single legend sits in
        /// the bottom half.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub legends: Vec<Legend>,
        /// Only on a keypad: keys to a row. Three when left out.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub columns: Option<u32>,
        /// What the item does, shown in its card; the control's `function` when empty.
        pub description: String,
        /// Only on a display unit or readout: its drawn width in panel units, 60 when left out.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub width: Option<f64>,
        /// Only on a display unit or readout: its drawn height in panel units, 30 when left out.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub height: Option<f64>,
    }

    /// A labeled section of a panel.
    pub struct PanelSection {
        /// The section's id, unique on its panel; locators and step targets name it.
        pub id: String,
        /// The title drawn on the panel, as the pack writes it.
        pub title: String,
        /// What card titles, captions and "Also" lines call the panel ("Fuel panel"), when it is
        /// not the title as written.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub name: Option<String>,
        /// The section box's left edge, in panel units from the panel's left edge.
        pub x: f64,
        /// The section box's top edge, in panel units from the panel's top edge.
        pub y: f64,
        /// The section box's width, in panel units.
        pub width: f64,
        /// The section box's height, in panel units.
        pub height: f64,
        /// The section's outline, when it is not a rectangle: points in the section's own units,
        /// inside its box, holding every item (format 6). Drawn as the rectangle frame is.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub outline: Vec<[f64; 2]>,
        /// The controls, lights and displays drawn in the section.
        pub items: Vec<PanelItem>,
    }

    /// One `panels/*.yaml` file: a drawing of one panel, its sections and the items in them, in
    /// our own layout. `pack.json` lists each panel file under `panels`.
    pub struct Panel {
        /// The panel's id, unique in the pack; the first part of a locator or step target.
        pub id: String,
        /// The panel's name. The app names what it shows by its sections and zones, and does not
        /// show this today.
        pub title: String,
        /// The panel's width in panel units; its outline, when it has one, lies inside.
        pub width: f64,
        /// The panel's height in panel units.
        pub height: f64,
        /// The panel's outline, when it is not a rectangle: points in panel units, inside its
        /// box, holding every section (format 6).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub outline: Vec<[f64; 2]>,
        /// The panel's sections, each a labeled box of items.
        pub sections: Vec<PanelSection>,
    }
}
