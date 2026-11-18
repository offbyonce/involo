// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Small packs the validation tests build on.

use std::path::PathBuf;

use involo_checklist_core::{
    Alias, AliasKind, AliasesFile, BriefItem, Briefing, BriefingsFile, Checklist, ControlsFile,
    ListKind, PanelState, PanelStatesFile, Phase, PhasesFile, Stage, StagePhase, Step, UserOption,
    Zone,
};

use super::validate_pack;
use crate::manifest::{PackKind, PackManifest};
use crate::{Pack, PackContent, SCHEMA_VERSION};

pub(super) const PACK: &str = "demo-aircraft";

pub(super) fn manifest() -> PackManifest {
    PackManifest {
        json_schema: None,
        id: PACK.into(),
        name: "Demo".into(),
        version: semver::Version::new(0, 1, 0),
        schema_version: SCHEMA_VERSION,
        kind: PackKind::Aircraft,
        engine: semver::VersionReq::parse(">=0.1").unwrap(),
        aircraft: Some(crate::AircraftInfo {
            family: "Demo".into(),
            name: "Demo aircraft".into(),
            icao_types: vec!["ZZZZ".into()],
            simulator: "None".into(),
            developer: "Nobody".into(),
        }),
        extends: std::collections::BTreeMap::default(),
        patches: None,
        resolved: vec![],
        content_hash: None,
        license: "CC-BY-NC-SA-4.0".into(),
        attribution: vec![],
        basis_tags: vec!["sim-observed".into()],
        checklists: vec!["preflight.yaml".into()],
        phases: Some("phases.yaml".into()),
        controls: None,
        notes: None,
        panels: vec![],
        lights: None,
        faults: None,
        glossary: None,
        briefings: None,
        panel_states: None,
        cdu: None,
        aliases: None,
        flight: None,
        labels: None,
        messages: None,
    }
}

pub(super) fn step(short: &str) -> Step {
    Step::new(format!("{PACK}.preflight.{short}"), "Battery", "ON")
}

pub(super) fn phases() -> PhasesFile {
    PhasesFile {
        turnaround: None,
        options: vec![UserOption {
            id: "power".into(),
            title: "Power".into(),
            values: vec!["gpu".into(), "apu".into()],
            default: "gpu".into(),
            description: None,
            choices: vec![],
            ask_in: vec![],
            start: None,
            suggests: None,
        }],
        stages: vec![Stage {
            id: "preflight".into(),
            title: "Preflight".into(),
            phases: vec![StagePhase {
                phase: "preflight".into(),
                show_if: None,
            }],
        }],
        phases: vec![Phase {
            id: "preflight".into(),
            title: "Preflight".into(),
            reference: false,
            group: None,
            engine_start: false,
            intro: vec![],
            lists: vec!["preflight".into()],
        }],
    }
}

/// The demo pack's flight fields: a weight with its unit, an altimeter setting, a speed, the
/// runway, the route and the takeoff flaps.
pub(super) fn flight() -> involo_checklist_core::FlightFile {
    use involo_checklist_core::{FieldChoice, FieldKind};
    let field = |id: &str, kind| involo_checklist_core::FlightField {
        id: id.into(),
        label: id.into(),
        description: None,
        kind,
        unit: None,
        ranges: vec![],
        choices: vec![],
        location: None,
        page: None,
        group: None,
        show_in: vec![],
        strip: None,
        display: None,
        simbrief: vec![],
        input: None,
        show: None,
        spoken: None,
        with: None,
        toggle: None,
        also: vec![],
        read_only: false,
        phase: None,
        suggested_by: None,
        needed: false,
        ofp: None,
    };
    let choice = |id: &str, values: &[&str]| {
        let mut f = field(id, FieldKind::Choice);
        f.choices = values
            .iter()
            .map(|v| FieldChoice {
                value: (*v).into(),
                label: None,
            })
            .collect();
        f
    };
    let mut fuel = field("fuel", FieldKind::Number);
    fuel.unit = Some("weight_unit".into());
    let mut min_fuel = fuel.clone();
    min_fuel.id = "minimum_takeoff_fuel".into();
    involo_checklist_core::FlightFile {
        pages: vec![],
        fields: vec![
            fuel,
            min_fuel,
            choice("weight_unit", &["LB", "KG"]),
            field("qnh", FieldKind::Number),
            field("v1", FieldKind::Number),
            field("runway", FieldKind::Text),
            field("route", FieldKind::Text),
            field("sid", FieldKind::Text),
            choice("takeoff_flaps", &["1", "5"]),
        ],
    }
}

pub(super) fn pack(steps: Vec<Step>, other_files: Vec<&str>) -> Pack {
    Pack {
        manifest: manifest(),
        checklists: vec![Checklist {
            id: "preflight".into(),
            title: "Preflight".into(),
            kind: ListKind::Checklist,
            basis: vec!["sim-observed".into()],
            memory: false,
            when: None,
            why: None,
            method: None,
            steps,
        }],
        content: PackContent {
            phases: Some(phases()),
            flight: Some(flight()),
            ..PackContent::default()
        },
        labels_file: None,
        other_files: other_files.into_iter().map(PathBuf::from).collect(),
    }
}

pub(super) fn messages(p: &Pack) -> String {
    validate_pack(p)
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn assert_flags(p: &Pack, expected: &str) {
    let joined = messages(p);
    assert!(
        joined.contains(expected),
        "wanted `{expected}` in:\n{joined}"
    );
}

pub(super) fn alias(kind: AliasKind, from: &str, to: &str) -> Alias {
    Alias {
        kind,
        from: from.into(),
        to: to.into(),
    }
}

pub(super) fn alias_pack(aliases: Vec<Alias>) -> Pack {
    let mut s = step("a");
    s.expect = "V1 ___ VR ___".into();
    let mut p = pack(vec![s], vec![]);
    p.content.controls = Some(ControlsFile {
        zones: vec![Zone {
            id: "overhead".into(),
            area: "Overhead".into(),
            title: "Overhead".into(),
            short_title: "OH".into(),
            position: None,
        }],
        controls: vec![],
        overview: None,
    });
    p.content.briefings = Some(BriefingsFile {
        briefings: vec![Briefing {
            id: "departure".into(),
            title: "Departure".into(),
            mnemonic: "R".into(),
            phase: "preflight".into(),
            items: vec![BriefItem {
                id: "departure.runway".into(),
                lead: "R".into(),
                rest: "UNWAY".into(),
                detail: None,
            }],
        }],
    });
    p.content.panel_states = Some(PanelStatesFile {
        states: vec![PanelState {
            id: "ready".into(),
            title: "Ready".into(),
            description: "Ready".into(),
            set: std::collections::BTreeMap::default(),
            phase: "preflight".into(),
            done: vec![],
            skip: vec![],
        }],
    });
    p.content.aliases = Some(AliasesFile { aliases });
    p
}
