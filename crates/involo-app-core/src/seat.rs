// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The seat view "Where is this?" draws for a step (decision 0029).

use involo_checklist_core::ViewFrame;
use involo_pack::FlatPack;

/// The pack's seat frame for a step done by `role`, with the pilot's `chosen` seat: the frame
/// of the seat the role sits in, then the chosen seat's, then the first (see
/// `OverviewViews::seat_frame`). None when the pack draws no seat view.
pub fn seat_frame(pack: &FlatPack, role: Option<&str>, chosen: Option<&str>) -> Option<ViewFrame> {
    pack.content
        .controls
        .as_ref()?
        .overview
        .as_ref()?
        .views
        .as_ref()?
        .seat_frame(&pack.content.labels, role, chosen)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{example_pack, ifly_pack};

    /// The text of the frame's first label, which tells the example pack's frames apart.
    fn seat_of(frame: Option<ViewFrame>) -> Option<String> {
        frame.and_then(|f| f.labels.first().map(|l| l.text.clone()))
    }

    #[test]
    fn a_role_that_sits_in_a_seat_shows_that_seat_whatever_was_chosen() {
        let pack = example_pack();
        assert_eq!(
            seat_of(seat_frame(&pack, Some("fo"), Some("left"))).as_deref(),
            Some("FROM THE RIGHT SEAT")
        );
        assert_eq!(
            seat_of(seat_frame(&pack, Some("capt"), Some("right"))).as_deref(),
            Some("FROM THE LEFT SEAT")
        );
    }

    #[test]
    fn a_duty_role_or_no_role_shows_the_chosen_seat_then_the_first() {
        let pack = example_pack();
        assert_eq!(
            seat_of(seat_frame(&pack, Some("pf"), Some("right"))).as_deref(),
            Some("FROM THE RIGHT SEAT")
        );
        assert_eq!(
            seat_of(seat_frame(&pack, None, Some("right"))).as_deref(),
            Some("FROM THE RIGHT SEAT")
        );
        assert_eq!(
            seat_of(seat_frame(&pack, Some("pm"), None)).as_deref(),
            Some("FROM THE LEFT SEAT")
        );
    }

    #[test]
    fn a_pack_with_one_seat_frame_always_shows_it() {
        let pack = ifly_pack();
        let one = seat_frame(&pack, None, None);
        assert!(one.is_some());
        assert_eq!(seat_frame(&pack, Some("fo"), Some("right")), one);
    }
}
