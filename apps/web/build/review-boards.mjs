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
  // Start on a phone (#198): the Start board is drawn at desktop width; the phone shots go beside it.
  "board-flight-start-phone": { phone: "Start" },
  "board-flight-start-panel-state": { phone: "Start" },
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
  // Step timers (#213, Timers.dc.html and TimersPhone.dc.html): the four states.
  "board-timer-waiting": { desktop: "TimerWaiting", phone: "TimerWaitingPhone" },
  "board-timer-running": { desktop: "TimerRunning", phone: "TimerRunningPhone" },
  "board-timer-paused": { desktop: "TimerPaused", phone: "TimerPausedPhone" },
  "board-timer-finished": { desktop: "TimerFinished", phone: "TimerFinishedPhone" },
  "board-timer-bar": { desktop: "TimerRunning" },
  // Briefings (#214, Briefings.dc.html and BriefingsPhone.dc.html): the three states.
  "board-briefing-open": { desktop: "BriefOpen", phone: "BriefOpenPhone" },
  "board-briefing-briefed": { desktop: "BriefBriefed", phone: "BriefBriefedPhone" },
  "board-briefing-skipped": { desktop: "BriefSkipped", phone: "BriefSkippedPhone" },
  // CDU walkthroughs (#215, CduWalk.dc.html and CduWalkPhone.dc.html): the step and the slide-out.
  "board-cdu-start": { desktop: "CduStepStart", phone: "CduStepStartPhone" },
  "board-cdu-resume": { desktop: "CduStepResume", phone: "CduStepResumePhone" },
  "board-cdu-values": { desktop: "CduPage", phone: "CduPagePhone" },
  "board-cdu-novalues": { desktop: "CduPageEmpty", phone: "CduPageEmptyPhone" },
  "board-cdu-last": { desktop: "CduPageLast", phone: "CduPageLastPhone" },
  // The flight's values on POS INIT and RTE (#222) and IDENT (#231), beside the page board they share.
  "board-cdu-pos": { desktop: "CduPage", phone: "CduPagePhone" },
  "board-cdu-route": { desktop: "CduPage", phone: "CduPagePhone" },
  "board-cdu-ident": { desktop: "CduPage", phone: "CduPagePhone" },
  // The exterior inspection's top view (#216, Walkaround.dc.html and WalkaroundPhone.dc.html).
  "board-walk-first": { desktop: "WalkFirst", phone: "WalkFirstPhone" },
  "board-walk-mid": { desktop: "WalkMid", phone: "WalkMidPhone" },
  // Light notes and panel-state descriptions (#211, Notes.dc.html).
  "board-light-notes": { desktop: "LightNotes", phone: "LightNotesPhone" },
  "board-state-note": { desktop: "StateNote", phone: "StateNotePhone" },
  // Forget the SimBrief username (#244, Release.dc.html): the SimBrief board's Import card.
  "board-forget": { desktop: "RelForget", phone: "RelForgetPhone" },
  "board-forgotten": { desktop: "RelForgotten", phone: "RelForgottenPhone" },
  // Report a problem with a step (#242, Release.dc.html): the row menu.
  "board-report": { desktop: "RelReport", phone: "RelReportPhone" },
  // The simulator-only notice (#241, Release.dc.html).
  "board-notice": { desktop: "RelNotice", phone: "RelNoticePhone" },
  // The backup reminder (#243, Release.dc.html): the band above the lists.
  "board-reminder": { desktop: "RelReminder", phone: "RelReminderPhone" },
  "board-reminder-never": { desktop: "RelReminderNever", phone: "RelReminderPhone" },
  // Back up and restore (#47, Backup.dc.html).
  "board-backup-setting": { desktop: "BackupSetting", phone: "BackupSettingPhone" },
  "board-restore-review": { desktop: "RestoreReview", phone: "RestorePhone" },
  "board-restore-refused": { desktop: "RestoreRefused", phone: "RestoreRefused" },
  "board-restore-too-large": { desktop: "RestoreRefused", phone: "RestoreRefused" },
  "board-restore-download-failed": { desktop: "RestoreReview", phone: "RestorePhone" },
  // A file the 3.0 checklist exported (#240), beside the same boards.
  "board-restore-earlier": { desktop: "RestoreReview", phone: "RestorePhone" },
  "board-restore-earlier-refused": { desktop: "RestoreRefused", phone: "RestoreRefused" },
  // Several packs (Packs.dc.html).
  "board-packs-two": { desktop: "PacksDesktop", phone: "PacksPhone" },
  "board-packs-first": { desktop: "PacksFirst" },
  "board-packs-switcher": { phone: "PacksSwitcher" },
  "board-packs-remove": { desktop: "PacksRemove" },
  "board-simbrief-other": { desktop: "PacksSimbrief" },
  "board-simbrief-other-file": { desktop: "PacksSimbrief" },
  "board-update-note": { desktop: "PacksUpdate", tablet: "PacksUpdate", phone: "PacksUpdate" },
};
