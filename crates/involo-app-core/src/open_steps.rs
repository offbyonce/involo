// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Open steps, as in 3.0: on every phase the pilot has started (a step done or skipped), the
//! steps not yet done, each marked skipped or missed, in the order the phases come (decision
//! 0012). Asked for a phase, only the phases before it count, as 3.0's "from earlier pages".

use involo_checklist_core::StepId;
use involo_pack::FlatPack;
use serde::Serialize;
use ts_rs::TS;

use crate::flight::Flight;
use crate::rail::rail;
use crate::settings::Settings;
use crate::visibility::{Shown, shown_steps};

/// One open step and where it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OpenStep {
    pub step: StepId,
    pub phase: String,
    pub phase_title: String,
    pub list_title: String,
    /// Skipped by the pilot; otherwise missed (left to do on a phase the pilot moved past).
    pub skipped: bool,
    /// A skipped briefing (#214), not a step: `step` holds the briefing's id and `list_title`
    /// its title. It comes first in its phase, as the briefing sits above the phase's lists.
    pub briefing: bool,
}

/// The flight's open steps for the pilot's choices. With `before`, only phases ahead of that
/// phase in the flight count, and never the phase itself or the reference phases.
pub fn open_steps(
    pack: &FlatPack,
    flight: &Flight,
    settings: &Settings,
    before: Option<&str>,
) -> Vec<OpenStep> {
    let filled = crate::flight::with_defaults(pack, flight);
    let flight = &filled;
    let shown = Shown::new(pack, settings);
    let Some(file) = &pack.content.phases else {
        return vec![];
    };
    let r = rail(pack, flight, settings);
    let flow: Vec<&str> = r
        .stages
        .iter()
        .flat_map(|s| &s.phases)
        .map(|p| p.id.as_str())
        .collect();
    let order: Vec<&str> = match before {
        Some(id) => flow.iter().copied().take_while(|p| *p != id).collect(),
        None => flow
            .iter()
            .copied()
            .chain(r.reference.iter().map(|p| p.id.as_str()))
            .collect(),
    };
    let mut out = vec![];
    for id in order {
        let Some(phase) = file.phases.iter().find(|p| p.id == id) else {
            continue;
        };
        let steps: Vec<(
            &involo_checklist_core::Checklist,
            &involo_checklist_core::Step,
        )> = phase
            .lists
            .iter()
            .filter_map(|l| pack.lists.iter().find(|x| &x.id == l))
            .flat_map(|list| {
                shown_steps(list, &flight.options, shown, phase.reference).map(move |s| (list, s))
            })
            .collect();
        // A skipped briefing is open, as a skipped step is (#214).
        for b in pack
            .content
            .briefings
            .iter()
            .flat_map(|f| &f.briefings)
            .filter(|b| b.phase == phase.id)
        {
            if matches!(
                flight.briefings.get(&b.id),
                Some(crate::flight::BriefingMark::Skipped { .. })
            ) {
                out.push(OpenStep {
                    step: StepId::new(&b.id),
                    phase: phase.id.clone(),
                    phase_title: phase.title.clone(),
                    list_title: b.title.clone(),
                    skipped: true,
                    briefing: true,
                });
            }
        }
        let started = steps
            .iter()
            .any(|(_, s)| flight.session.is_done(&s.id) || flight.session.is_skipped(&s.id));
        if !started {
            continue;
        }
        for (list, step) in steps {
            if !flight.session.is_done(&step.id) {
                out.push(OpenStep {
                    step: step.id.clone(),
                    phase: phase.id.clone(),
                    phase_title: phase.title.clone(),
                    list_title: list.title.clone(),
                    skipped: flight.session.is_skipped(&step.id),
                    briefing: false,
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions::{Action, apply};
    use crate::flight::new_flight;
    use crate::phase_model::phase_model;
    use crate::test_support::{example_pack, ifly_pack};

    #[test]
    fn a_skipped_briefing_is_open_first_in_its_phase() {
        // #214: like a skipped step, and before the phase's steps; a briefed one is not open.
        let pack = example_pack();
        let s = Settings::default();
        let skip = Action::SkipBriefing {
            briefing: "departure".into(),
            at: 2,
        };
        let mut flight = apply(&pack, new_flight(&pack), skip).unwrap();
        let open = open_steps(&pack, &flight, &s, None);
        assert_eq!(open.len(), 1, "{open:?}");
        let first = &open[0];
        assert_eq!(
            (
                first.step.as_str(),
                first.phase.as_str(),
                first.list_title.as_str(),
                first.skipped,
                first.briefing
            ),
            (
                "departure",
                "before-start",
                "Departure briefing",
                true,
                true
            )
        );
        let step = phase_model(&pack, &flight, &s, "before-start")
            .unwrap()
            .lists[0]
            .steps[0]
            .id
            .clone();
        flight = apply(&pack, flight, Action::Skip { step, at: 3 }).unwrap();
        let open = open_steps(&pack, &flight, &s, None);
        assert!(open[0].briefing && open[1..].iter().all(|o| !o.briefing));
        let briefed = Action::Brief {
            briefing: "departure".into(),
            at: 4,
        };
        flight = apply(&pack, flight, briefed).unwrap();
        assert!(
            open_steps(&pack, &flight, &s, None)
                .iter()
                .all(|o| !o.briefing)
        );
    }

    #[test]
    fn open_steps_are_the_undone_steps_of_started_phases() {
        let pack = ifly_pack();
        let s = Settings::default();
        let mut flight = new_flight(&pack);
        let cold = phase_model(&pack, &flight, &s, "cold-dark").unwrap().lists[0]
            .steps
            .clone();
        assert!(
            open_steps(&pack, &flight, &s, None).is_empty(),
            "nothing started yet"
        );
        flight = apply(
            &pack,
            flight,
            Action::Tick {
                step: cold[0].id.clone(),
                at: 1,
            },
        )
        .unwrap();
        flight = apply(
            &pack,
            flight,
            Action::Skip {
                step: cold[1].id.clone(),
                at: 2,
            },
        )
        .unwrap();
        let open = open_steps(&pack, &flight, &s, None);
        assert_eq!(
            open.len(),
            cold.len() - 1,
            "every undone step of the started phase"
        );
        assert!(open[0].skipped && open[0].step == cold[1].id);
        assert!(open[1..].iter().all(|o| !o.skipped), "the rest are missed");
        // From a later phase they count as earlier pages; on the phase itself they do not.
        assert_eq!(
            open_steps(&pack, &flight, &s, Some("gpu-power")).len(),
            open.len()
        );
        assert_eq!(open_steps(&pack, &flight, &s, Some("cold-dark")).len(), 0);
        // Ticked or unskipped, a skipped step is no longer marked skipped.
        flight = apply(
            &pack,
            flight,
            Action::Unskip {
                step: cold[1].id.clone(),
            },
        )
        .unwrap();
        assert!(
            open_steps(&pack, &flight, &s, None)
                .iter()
                .all(|o| !o.skipped)
        );
    }
}
