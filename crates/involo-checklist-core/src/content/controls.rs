// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `controls.yaml`: zones, controls and the cockpit overview.

data_types! {
    /// An area of the cockpit.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct Zone {
        pub id: String,
        pub area: String,
        pub title: String,
        pub short_title: String,
        /// Where the zone sits in its area, for the step map's position line ("Captain side,
        /// row nearest the windshield").
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub position: Option<String>,
    }

    /// A switch, lever or other control a step refers to.
    pub struct Control {
        pub id: String,
        pub name: String,
        /// Absent for controls with no place in the cockpit, such as a briefing.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub zone: Option<String>,
        pub location: String,
        pub function: String,
    }

    /// A caption on the cockpit overview map.
    pub struct OverviewCaption {
        pub text: String,
        pub x: f64,
        pub y: f64,
    }

    /// A rectangle on the cockpit overview map. A zone can have several.
    pub struct OverviewArea {
        pub zone: String,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
        /// Overrides the zone's short title on the map.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label: Option<String>,
    }

    /// A part of the cockpit on the overview map, e.g. the forward overhead panel. A map of one
    /// region shows the areas whose centers fall inside its rectangle (the first region that
    /// holds them), with its captions around the edges.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct OverviewRegion {
        pub name: String,
        /// The area's short name, e.g. "Overhead", where a picture of a flow names the areas;
        /// regions may share one. Without it, the name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub short: Option<String>,
        /// A short reference shown after the name, e.g. "P5".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub code: Option<String>,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
        /// Captions for the edges, saying which way each faces.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub top: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub bottom: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub left: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub right: Option<String>,
        /// Short edge captions for the small step map ("AFT", "FORWARD", "CAPT", "F/O"); the
        /// long ones stay for the Flight deck page.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub top_short: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub bottom_short: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub left_short: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub right_short: Option<String>,
        /// Where to look from the seat, for "Where is this?".
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub locate: Option<String>,
        /// The Where is this? title, as a whole question ("Where is the forward overhead
        /// panel?"), and the shorter one phones use ("Where is the forward overhead?").
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub short_title: Option<String>,
    }

    /// How the renderer draws a shape in a side or seat view (decision 0023). Roles name no
    /// aircraft part, so any pack can draw its own airplane.
    #[derive(Copy, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum ViewRole {
        /// The airplane's outline (fuselage, walls): filled with the fuselage color.
        Structure,
        /// Windshield and windows.
        Glass,
        /// The pilot's seat and head.
        Seat,
        /// Where the pilot's eyes are: one point. The side view's sight line starts here.
        Eye,
    }

    /// One shape in a side or seat view: an outline through its points (a curve is given as many
    /// points), closed when `closed`. An `eye` is one point.
    pub struct ViewShape {
        pub points: Vec<[f64; 2]>,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        pub closed: bool,
        pub role: ViewRole,
    }

    /// Which way a label runs from its point.
    #[derive(Copy, Eq, Default)]
    #[serde(rename_all = "snake_case")]
    pub enum LabelAnchor {
        Start,
        #[default]
        Middle,
        End,
    }

    /// A fixed label in a side or seat view, e.g. "WINDSHIELD" or "CABIN →".
    pub struct ViewLabel {
        pub text: String,
        pub x: f64,
        pub y: f64,
        #[serde(default)]
        pub anchor: LabelAnchor,
    }

    /// Where one overview region sits in a side or seat view: one or more closed outlines.
    #[cfg_attr(feature = "ts", ts(rename_all = "camelCase"))]
    pub struct ViewPlace {
        /// The region's `name` on the overview.
        pub region: String,
        pub shapes: Vec<Vec<[f64; 2]>>,
        /// Where the region's name goes when it is the one shown, if the view names it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub label_at: Option<[f64; 2]>,
    }

    /// A side or seat view of the flight deck, in its own units (decision 0023).
    pub struct ViewFrame {
        pub width: f64,
        pub height: f64,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub shapes: Vec<ViewShape>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub places: Vec<ViewPlace>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub labels: Vec<ViewLabel>,
    }

    /// The seat view: one frame, or one per seat, keyed by the seat ids the pack's labels list
    /// (decision 0029).
    #[serde(untagged)]
    pub enum SeatViews {
        One(ViewFrame),
        BySeat(std::collections::BTreeMap<String, ViewFrame>),
    }

    /// The side and seat views for "Where is this?".
    pub struct OverviewViews {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub side: Option<ViewFrame>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub seat: Option<SeatViews>,
    }

    /// A schematic of the whole cockpit, in our own layout.
    pub struct Overview {
        pub width: f64,
        pub height: f64,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub captions: Vec<OverviewCaption>,
        pub areas: Vec<OverviewArea>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub regions: Vec<OverviewRegion>,
        /// The side and seat views (decision 0023).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub views: Option<OverviewViews>,
    }

    /// `controls.yaml`.
    pub struct ControlsFile {
        pub zones: Vec<Zone>,
        pub controls: Vec<Control>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub overview: Option<Overview>,
    }
}

impl OverviewViews {
    /// The seat frame "Where is this?" shows for a step (decision 0029). One frame is always
    /// that frame. With a frame per seat: the seat the step's `role` sits in, if the role names
    /// one with a frame; then the pilot's chosen seat; then the first frame, in the order the
    /// labels list the seats.
    pub fn seat_frame<'a>(
        &'a self,
        labels: &crate::Labels,
        role: Option<&str>,
        chosen: Option<&str>,
    ) -> Option<&'a ViewFrame> {
        let frames = match self.seat.as_ref()? {
            SeatViews::One(frame) => return Some(frame),
            SeatViews::BySeat(frames) => frames,
        };
        let seat_of_role = role
            .and_then(|r| labels.roles.iter().find(|x| x.id == r))
            .and_then(|r| r.seat.as_deref());
        seat_of_role
            .and_then(|s| frames.get(s))
            .or_else(|| chosen.and_then(|s| frames.get(s)))
            .or_else(|| labels.seats.iter().find_map(|s| frames.get(&s.id)))
            .or_else(|| frames.values().next())
    }
}

#[cfg(test)]
mod seat_tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::{Labels, RoleLabel, SeatLabel};

    fn frame(width: f64) -> ViewFrame {
        ViewFrame {
            width,
            height: 10.0,
            shapes: vec![],
            places: vec![],
            labels: vec![],
        }
    }

    fn labels() -> Labels {
        let seats = vec![
            SeatLabel {
                id: "left".into(),
                title: "Left seat".into(),
            },
            SeatLabel {
                id: "right".into(),
                title: "Right seat".into(),
            },
        ];
        let role = |id: &str, seat: Option<&str>| RoleLabel {
            id: id.into(),
            title: id.into(),
            short: id.into(),
            seat: seat.map(Into::into),
        };
        let roles = vec![
            role("capt", Some("left")),
            role("fo", Some("right")),
            role("pf", None),
        ];
        Labels {
            seats,
            roles,
            ..Labels::default()
        }
    }

    fn by_seat() -> OverviewViews {
        OverviewViews {
            side: None,
            seat: Some(SeatViews::BySeat(BTreeMap::from([
                ("left".to_owned(), frame(1.0)),
                ("right".to_owned(), frame(2.0)),
            ]))),
        }
    }

    fn width(f: Option<&ViewFrame>) -> Option<f64> {
        f.map(|f| f.width)
    }

    #[test]
    fn one_frame_is_always_the_frame() {
        let one = OverviewViews {
            side: None,
            seat: Some(SeatViews::One(frame(5.0))),
        };
        assert_eq!(
            width(one.seat_frame(&labels(), Some("fo"), Some("right"))),
            Some(5.0)
        );
        assert_eq!(
            width(one.seat_frame(&Labels::default(), None, None)),
            Some(5.0)
        );
    }

    #[test]
    fn the_role_s_seat_comes_first() {
        assert_eq!(
            width(by_seat().seat_frame(&labels(), Some("fo"), Some("left"))),
            Some(2.0)
        );
    }

    #[test]
    fn a_duty_role_with_no_seat_falls_to_the_chosen_seat() {
        assert_eq!(
            width(by_seat().seat_frame(&labels(), Some("pf"), Some("right"))),
            Some(2.0)
        );
        assert_eq!(
            width(by_seat().seat_frame(&labels(), None, Some("right"))),
            Some(2.0)
        );
    }

    #[test]
    fn with_no_role_seat_and_no_choice_the_first_seat_s_frame() {
        assert_eq!(
            width(by_seat().seat_frame(&labels(), Some("pf"), None)),
            Some(1.0)
        );
        assert_eq!(
            width(by_seat().seat_frame(&labels(), None, Some("jumpseat"))),
            Some(1.0)
        );
    }
}
