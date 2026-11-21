// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Which approved board each review shot is checked against, by shot name and size: the board's
// name in board-shots.mjs (its dark render; the light one is the same name with "Light" boards
// already drawn by board-shots.mjs in both themes). `just review-shots` puts each shot that has a
// board beside it; a shot with no board here is written alone, and the run says so. Add a row
// when a pull request adds a screen with its board.

export const REVIEW_BOARDS = {
  // Flight setup (FS*, round 6) and its tablet landscape boards.
  "board-flight-overview": { desktop: "FSOverview" },
  "board-flight-route": { desktop: "FSRoute" },
  "board-flight-fuel": { desktop: "FSFuel" },
  "board-flight-cruise": { desktop: "FSCruise" },
  "board-flight-clearance": { desktop: "FSClearance" },
  "board-flight-takeoff": { desktop: "FSTakeoff", "tablet-landscape": "FSTakeoffTabL" },
  "board-flight-approach": { desktop: "FSApproach" },
  "board-flight-weather": { desktop: "R6Weather", "tablet-landscape": "WxTabL" },
  "board-flight-winds": { desktop: "R6Winds", "tablet-landscape": "WindsTabL" },
  "board-flight-invalid": { desktop: "FSInvalid" },
  "board-flight-start": { desktop: "Start" },
  "board-flight-simbrief": { desktop: "SimBrief" },
  "board-strip-open": { desktop: "StripOpen" },
  "board-strip-freq": { desktop: "StripFreq" },
  // The checklist's overlays (round 6).
  "board-panel": { desktop: "R6Panel", "tablet-landscape": "R6TabL" },
  "board-where": { desktop: "R6Where" },
  "board-control": { desktop: "R6Control" },
  "board-flow": { desktop: "R6Flow" },
  "board-settings": { desktop: "R6Settings" },
  "board-sheet": { tablet: "R6TabPSheet", phone: "R6PhoneSheet", "phone-sideways": "R6PhoneL" },
  "board-menu": { desktop: "Menu" },
  "board-menu-where": { desktop: "MenuWhere" },
  "board-stages": { phone: "StagesPhone", tablet: "StagesTabP", "tablet-landscape": "StagesTabL" },
  // Find, the flight deck, Practice, the tour, the glossary, How it works.
  "board-find": { desktop: "FindDesk", phone: "FindPhone" },
  "board-find-none": { desktop: "FindDeskNone", phone: "FindPhoneNone" },
  "board-find-start": { desktop: "FindDeskStart", phone: "FindPhoneStart" },
  "board-deck": { desktop: "Deck", phone: "PhoneDeck" },
  "board-practice-home": { desktop: "PracticeHome" },
  "board-practice-home-phone": { phone: "PracticeHomePhone" },
  "board-practice-question": { desktop: "PracticeQuestion", phone: "PracticeQuestionPhone" },
  "board-practice-order": { desktop: "PracticeOrder" },
  "board-practice-results": { desktop: "PracticeResults", phone: "PracticeResultsPhone" },
  "board-tour-welcome": { desktop: "TourWelcome", phone: "TourWelcomePhone" },
  "board-tour-step": { desktop: "TourStep", phone: "TourStepPhone" },
  "board-tour-end": { desktop: "TourEnd", phone: "TourEndPhone" },
  "board-glossary": { desktop: "GlossaryDesk" },
  "board-glossary-list": { phone: "GlossaryPhone" },
  "board-glossary-term": { phone: "GlossaryPhoneTerm" },
  "board-how": { desktop: "HowDesk", phone: "HowPhone" },
  // The flight log and References.
  "board-log": { desktop: "LogDesk", phone: "LogPhoneFlight" },
  "board-log-list": { phone: "LogPhone" },
  // The Flight log by pack (#107): PacksLog is drawn at desktop width; the phone shots go beside it too.
  "board-log-packs": { desktop: "PacksLog", phone: "PacksLog" },
  "board-log-pack": { desktop: "PacksLog", phone: "PacksLog" },
  "board-refs": { desktop: "RefsDesk", phone: "RefsPhone" },
  // The Checklist board (the challenge-and-response list folded until its procedure is done).
  "board-checklist": { desktop: "Checklist" },
  // Crew roles and list methods (#133, Roles.dc.html). RolesDesk draws desktop and tablet.
  "board-roles": { desktop: "RolesDesk", "tablet-landscape": "RolesDesk", tablet: "RolesDesk", phone: "RolesPhone" },
  "board-roles-procedure": { desktop: "RolesDesk", phone: "RolesPhone" },
  "board-seat": { desktop: "SeatSetting", phone: "SeatSetting" },
  // Several packs (Packs.dc.html).
  "board-packs-two": { desktop: "PacksDesktop", phone: "PacksPhone" },
  "board-packs-first": { desktop: "PacksFirst" },
  "board-packs-switcher": { phone: "PacksSwitcher" },
  "board-packs-remove": { desktop: "PacksRemove" },
  "board-simbrief-other": { desktop: "PacksSimbrief" },
  "board-simbrief-other-file": { desktop: "PacksSimbrief" },
  "board-update-note": { desktop: "PacksUpdate", tablet: "PacksUpdate", phone: "PacksUpdate" },
};
