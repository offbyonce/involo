// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! A stable code for every problem `involo-pack check` reports (decision 0030), with what it means
//! and how to fix it. This table is the one place they are written: the checks name a [`Code`],
//! `involo-pack explain <code>` prints its entry, and the docs are made from the same table.
//!
//! A code never changes its meaning once released. A check that goes away leaves its code unused;
//! a new check gets a new code. The hundreds follow the file a problem is usually in:
//! P00xx reading and building, P01xx `pack.json` and the folder, P02xx ids and references,
//! P03xx lists and steps, P04xx step targets and terms, P05xx `phases.yaml`, P06xx `labels.yaml`,
//! P07xx `flight.yaml`, P08xx panels, lights and the overview, P09xx panel item kinds and
//! outlines, P10xx CDU text, messages, aliases, confirmations and links.

use std::fmt;

/// One code's entry: its short title, what it means, and how to fix it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct CodeInfo {
    pub code: &'static str,
    pub title: &'static str,
    pub explain: &'static str,
    pub hint: &'static str,
}

/// The code groups, by the first two digits of a code: what the problems in each are about. A
/// test checks every code falls in one.
pub const GROUPS: &[(&str, &str)] = &[
    ("P00", "Reading the files and building the pack"),
    ("P01", "pack.json and the files in the folder"),
    ("P02", "Ids and references between files"),
    ("P03", "Lists and steps"),
    ("P04", "Step targets and glossary terms"),
    ("P05", "phases.yaml"),
    ("P06", "labels.yaml"),
    ("P07", "flight.yaml"),
    ("P08", "Panels, lights and the flight deck overview"),
    ("P09", "Panel item kinds and outlines"),
    (
        "P10",
        "CDU text, messages, aliases, confirmations and links",
    ),
];

macro_rules! codes {
    ($( $(#[$doc:meta])* $name:ident = $code:literal {
        title: $title:literal,
        explain: $explain:literal,
        hint: $hint:literal $(,)?
    } )*) => {
        /// A problem's stable code. Its text form (`P0123`) is what authors and tools see.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub enum Code {
            $( $(#[$doc])* $name, )*
        }

        /// Each code's name in the source, in the table's order.
        #[cfg(test)]
        const NAMES: &[&str] = &[$( stringify!($name), )*];

        impl Code {
            /// Every code, in the table's order.
            pub const ALL: &[Code] = &[$( Code::$name, )*];

            /// This code's entry in the table.
            pub const fn info(self) -> CodeInfo {
                match self {
                    $( Code::$name => CodeInfo {
                        code: $code,
                        title: $title,
                        explain: $explain,
                        hint: $hint,
                    }, )*
                }
            }
        }
    };
}

impl Code {
    /// The code as authors see it, such as `P0202`.
    pub const fn as_str(self) -> &'static str {
        self.info().code
    }

    /// One line on how to fix the problem.
    pub const fn hint(self) -> &'static str {
        self.info().hint
    }

    /// The code written as `P0202` (any case), or `None` for a code the table lacks.
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        Self::ALL
            .iter()
            .copied()
            .find(|c| c.as_str().eq_ignore_ascii_case(text))
    }
}

impl fmt::Display for Code {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl serde::Serialize for Code {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

codes! {
    // P00xx: reading the files and building the pack.
    ReadFailed = "P0001" {
        title: "A file can't be read",
        explain: "A file the pack needs could not be opened: it is missing, or the folder can't be read. The manifest names every data file by its path in the pack folder.",
        hint: "Check that the file exists at the path pack.json gives, spelled the same way, and that you can read it.",
    }
    BadYaml = "P0002" {
        title: "A data file doesn't read",
        explain: "A YAML file is not valid YAML, or it does not match its file's format: a field the format doesn't have, a missing required field, or a value of the wrong type. The message gives the line and column where reading stopped.",
        hint: "Fix the file at the line given. `involo-pack describe <file>` lists the fields the file takes.",
    }
    BadManifest = "P0003" {
        title: "pack.json doesn't read",
        explain: "pack.json is not valid JSON, or it does not match the manifest's format. The message gives the line and column where reading stopped.",
        hint: "Fix pack.json at the line given. `involo-pack describe pack.json` lists its fields.",
    }
    FormatVersion = "P0004" {
        title: "A pack format this version doesn't read",
        explain: "pack.json's `schemaVersion` names a pack format older than the oldest this version reads, or newer than the newest.",
        hint: "Set `schemaVersion` to the format this version of involo-pack reads, and move the pack to it.",
    }
    BadFile = "P0005" {
        title: "A file the pack can't use",
        explain: "A file is too large, is not UTF-8 text, or is named by a path that leaves the pack folder.",
        hint: "Keep every data file inside the pack folder, as UTF-8 text, under the size limit; split a large file in two.",
    }
    ParentNotFound = "P0006" {
        title: "The parent pack isn't found",
        explain: "The pack `extends` another pack, which is looked for beside it and in the folders `--parents` names. None of them holds a pack with that id.",
        hint: "Put the parent's folder beside this one, or pass its folder with `--parents <dir>`.",
    }
    PatchFailed = "P0007" {
        title: "The pack can't be built over its parent",
        explain: "The pack can't be built from its `extends` and `patches`: the `extends` chain makes a cycle or is too long, the parent found is of another version or format, pack.json holds fields only `involo-pack build` writes, or a patch names no target or more than one, matches nothing, or changes a field in a way its target doesn't allow. The message says which.",
        hint: "Fix what the message names: the `extends` entry, pack.json, or the patch it quotes.",
    }
    OverLimit = "P0008" {
        title: "Over a size limit",
        explain: "The pack is over one of the limits every pack keeps to: too many steps or glossary terms, or a name that is too long. A pack over a limit is refused for that alone, before the other checks run.",
        hint: "Shorten the name, or split the pack's content so it keeps within the limit the message gives.",
    }

    // P01xx: pack.json and the files in the folder.
    PackId = "P0101" {
        title: "The pack id isn't valid",
        explain: "A pack id is written in lower-case letters, digits, dots and dashes. Step ids start with it, and the catalog names the pack's file after it.",
        hint: "Change `id` in pack.json to lower-case letters, digits, dots and dashes, such as `my-twin`.",
    }
    NoChecklists = "P0102" {
        title: "An aircraft pack with no lists",
        explain: "An aircraft pack must list at least one checklist file in pack.json's `checklists`.",
        hint: "Add a list file and name it in `checklists`.",
    }
    NoPhasesFile = "P0103" {
        title: "An aircraft pack with no phases file",
        explain: "An aircraft pack places its lists in phases, so pack.json must name a phases file.",
        hint: "Add `\"phases\": \"phases.yaml\"` to pack.json, and write the file.",
    }
    BasisTagFormat = "P0104" {
        title: "A basis tag isn't valid",
        explain: "Basis tags name the kind of material a list was checked against. Each is written in lower-case letters, digits and dashes.",
        hint: "Write the tag in lower-case letters, digits and dashes, such as `vendor-docs`.",
    }
    NoAircraftBlock = "P0105" {
        title: "An aircraft pack with no aircraft",
        explain: "An aircraft pack says which aircraft it is for in pack.json's `aircraft` block: family, name, icaoTypes, simulator and developer.",
        hint: "Add the `aircraft` block to pack.json.",
    }
    LibraryHasAircraft = "P0106" {
        title: "A library pack with an aircraft",
        explain: "A library pack is only ever a parent; the packs that extend it name their own aircraft.",
        hint: "Remove the `aircraft` block, or make the pack `\"kind\": \"aircraft\"`.",
    }
    NoIcaoType = "P0107" {
        title: "No ICAO type designator",
        explain: "`aircraft.icaoTypes` lists the ICAO type designators the pack is for, at least one. The app warns when a flight plan is for another type.",
        hint: "Add the aircraft's type designator to `aircraft.icaoTypes`.",
    }
    BadIcaoType = "P0108" {
        title: "Not an ICAO type designator",
        explain: "An ICAO type designator is two to four capital letters and digits, starting with a letter.",
        hint: "Write the designator in capitals, such as `B738` or `A20N`.",
    }
    EmptyAircraftField = "P0109" {
        title: "An empty aircraft field",
        explain: "Every field of pack.json's `aircraft` block has a value; the app shows them on the Packs page.",
        hint: "Fill in the field the message names.",
    }
    ExtendsMany = "P0110" {
        title: "More than one parent",
        explain: "A pack builds on at most one parent, named in `extends`.",
        hint: "Keep one entry in `extends`.",
    }
    ExtendsBadId = "P0111" {
        title: "The parent's id isn't valid",
        explain: "`extends` names its parent by pack id, which is lower-case letters, digits, dots and dashes.",
        hint: "Write the parent's id as its pack.json gives it.",
    }
    ExtendsSelf = "P0112" {
        title: "A pack that extends itself",
        explain: "`extends` names the pack's own id.",
        hint: "Name the parent pack's id in `extends`, or remove it.",
    }
    ReservedFileName = "P0113" {
        title: "A file name Windows reserves",
        explain: "Windows reserves device names such as CON, PRN, AUX, NUL, COM1 and LPT1, even with an extension, so a file named that way can't be checked out there.",
        hint: "Rename the file.",
    }
    ImageOrPdf = "P0114" {
        title: "An image or PDF in the pack",
        explain: "Packs never carry images, screenshots, PDFs or other files from an aircraft developer, manufacturer or simulator. Panels are drawn from the pack's data.",
        hint: "Remove the file from the pack folder.",
    }

    // P02xx: ids and references between files.
    DuplicateId = "P0201" {
        title: "An id used twice",
        explain: "Ids are how files refer to each other, so each one is used once where it must be unique: in the pack, or in its section for a panel item.",
        hint: "Give one of the two a different id, and update whatever refers to it.",
    }
    UnknownStep = "P0202" {
        title: "A step that doesn't exist",
        explain: "Something refers to a step id that no list in the pack has.",
        hint: "Check the spelling against the step's `id`, or add the step.",
    }
    UnknownPhase = "P0203" {
        title: "A phase that doesn't exist",
        explain: "Something refers to a phase id that phases.yaml doesn't define.",
        hint: "Check the spelling against the phase's `id` in phases.yaml, or add the phase.",
    }
    UnknownFlightField = "P0204" {
        title: "A flight field the pack doesn't define",
        explain: "A step or CDU text names a flight field that flight.yaml doesn't define.",
        hint: "Check the spelling against flight.yaml's field ids, or add the field there.",
    }
    UnknownControl = "P0205" {
        title: "A control that doesn't exist",
        explain: "Something refers to a control id that controls.yaml doesn't define.",
        hint: "Check the spelling against controls.yaml, or add the control there.",
    }
    UnknownOption = "P0206" {
        title: "An option that doesn't exist",
        explain: "Something names a user option (in `decide`, `when`, `expect_when`, `show_if`, `suggested_by` or an alias) that phases.yaml's `options` doesn't define.",
        hint: "Check the spelling against the option ids in phases.yaml, or add the option.",
    }
    UnknownOptionValue = "P0207" {
        title: "A value an option doesn't have",
        explain: "Something names a value of a user option that is not one of the option's `values`.",
        hint: "Use one of the option's `values`, or add the value to the option.",
    }
    EmptyTest = "P0208" {
        title: "A test with nothing in it",
        explain: "A `show_if` test lists nothing: `one_of` needs at least one value, and `all_of` or `any_of` at least one test.",
        hint: "Add what the test checks, or remove the test.",
    }
    UnknownZone = "P0209" {
        title: "A zone that doesn't exist",
        explain: "A control or an overview area names a flight deck zone that controls.yaml doesn't define.",
        hint: "Check the spelling against the zones in controls.yaml, or add the zone.",
    }
    UnknownList = "P0210" {
        title: "A list that doesn't exist",
        explain: "A phase or a message names a list id that no list file in the pack has.",
        hint: "Check the spelling against the list's `id`, or add the list and name its file in pack.json.",
    }
    UnknownWalkthrough = "P0211" {
        title: "A walkthrough that doesn't exist",
        explain: "A step's `opens` names a CDU walkthrough that cdu.yaml doesn't define.",
        hint: "Check the spelling against the walkthrough ids in cdu.yaml.",
    }
    UnknownHowNote = "P0212" {
        title: "A how note that doesn't exist",
        explain: "A step's `how` names a note that notes.yaml doesn't define.",
        hint: "Check the spelling against the note ids in notes.yaml.",
    }
    UnknownExplanation = "P0213" {
        title: "An explanation that doesn't exist",
        explain: "A step's `explain` names an explanation that notes.yaml doesn't define.",
        hint: "Check the spelling against the explanation ids in notes.yaml.",
    }
    UnknownRole = "P0214" {
        title: "A role the labels don't list",
        explain: "A step's `role` or `respond` names a crew role that labels.yaml's `roles` doesn't list.",
        hint: "Use one of the roles in labels.yaml, or add the role there.",
    }
    UnknownAliasTarget = "P0215" {
        title: "An alias to something that doesn't exist",
        explain: "An alias in aliases.yaml points at a step, briefing item, option value or field the pack doesn't have.",
        hint: "Point the alias at an id the pack has, or remove it.",
    }
    IdFormat = "P0216" {
        title: "An id isn't written as the format asks",
        explain: "Ids are lower-case letters, digits and dashes (flight field ids use underscores instead of dashes and start with a letter), so they read the same in every file and address.",
        hint: "Rewrite the id as the message says, and update whatever refers to it.",
    }

    // P03xx: lists and steps.
    RespondWithoutChallenge = "P0301" {
        title: "`respond` outside a challenge and response list",
        explain: "`respond` names the role that answers a challenge, so it belongs only in a list with `method: challenge_response`.",
        hint: "Remove `respond`, or set the list's `method` to `challenge_response`.",
    }
    StepIdShape = "P0302" {
        title: "A step id of the wrong shape",
        explain: "A step id is `<prefix>.<phase>.<short-name>`, where the prefix is the pack's id or the id of a pack it is built from.",
        hint: "Rename the step to `<pack id>.<phase>.<short name>`, such as `my-twin.before-start.battery`.",
    }
    EmptyStepText = "P0303" {
        title: "A step with no text or response",
        explain: "Every step has the text the pilot reads and its expected response.",
        hint: "Fill in the step's `text` and `expect`.",
    }
    SimulatorModelNoNote = "P0304" {
        title: "`simulator_model` with no note",
        explain: "`simulator_model` marks the step's `note` as true of the simulator model only, so it needs a note to apply to.",
        hint: "Add the `note`, or remove `simulator_model`.",
    }
    FillCount = "P0305" {
        title: "`fill` doesn't match the blanks",
        explain: "A step's `fill` gives one entry for each blank (`___`) in its `expect`, in order.",
        hint: "Give `fill` as many entries as `expect` has blanks.",
    }
    ManualOutsideFill = "P0306" {
        title: "`manual` outside a step's `fill`",
        explain: "`manual` marks a blank the pilot fills in by hand, which only a step's `fill` has.",
        hint: "Remove `manual` here.",
    }
    RouteLegOnlyInCdu = "P0307" {
        title: "`route_leg` outside CDU text",
        explain: "`route_leg` reads one leg of the route, which only CDU text uses, with an `index` and a `part`.",
        hint: "Use another field in the step, or move the entry to cdu.yaml.",
    }
    EmptyList = "P0308" {
        title: "A list with no steps",
        explain: "Every list has at least one step.",
        hint: "Add the list's steps, or remove the list and its entry in pack.json.",
    }
    NoBasis = "P0309" {
        title: "A list with no basis",
        explain: "Every list has a `basis`: the kinds of material it was checked against, by the tags pack.json declares. No per-step citations are kept.",
        hint: "Add `basis: [<tag>]` to the list, with a tag from pack.json's `basisTags`.",
    }
    WhyRepeatsNotice = "P0310" {
        title: "The list repeats the training notice",
        explain: "The app shows the training notice itself; a copy in a list's `why` reads as part of it.",
        hint: "Remove the notice from the list's `why`.",
    }
    UndeclaredBasis = "P0311" {
        title: "A basis tag pack.json doesn't declare",
        explain: "A list's `basis`, or a label in labels.yaml, names a basis tag that pack.json's `basisTags` doesn't list.",
        hint: "Add the tag to `basisTags` in pack.json, or use one it lists.",
    }
    FirstStepBranch = "P0312" {
        title: "A list that starts with a branch",
        explain: "A step with `branch: true` opens a branch from the step before it, so a list's first step can't be one.",
        hint: "Remove `branch: true` from the first step, or put a step before it.",
    }
    NoteRepeatsHow = "P0313" {
        title: "The note repeats the how steps",
        explain: "A step's note says again what its \"How to do it\" steps already say.",
        hint: "Keep it in one place: remove it from the note.",
    }
    ListPlacedTwice = "P0314" {
        title: "A list in more than one phase",
        explain: "Each list is placed in exactly one phase in phases.yaml.",
        hint: "Remove the list from all but one phase.",
    }
    ListNotPlaced = "P0315" {
        title: "A list in no phase",
        explain: "Each list is placed in exactly one phase in phases.yaml, or the app has nowhere to show it.",
        hint: "Add the list's id to a phase's `lists` in phases.yaml.",
    }
    TurnaroundUndeclared = "P0316" {
        title: "Essentials on a turnaround with no turnaround",
        explain: "A step is marked for Essentials on a turnaround, but phases.yaml declares no `turnaround`.",
        hint: "Declare the `turnaround` in phases.yaml, or remove the marking from the step.",
    }

    // P04xx: step targets and glossary terms.
    UnknownTerm = "P0401" {
        title: "A term the glossary doesn't have",
        explain: "A step's `terms` names a term that glossary.yaml doesn't define.",
        hint: "Add the term to glossary.yaml, or remove it from the step's `terms`.",
    }
    TermIsUnit = "P0402" {
        title: "A term marked as a plain abbreviation",
        explain: "A step's `terms` names a glossary term marked `step_term: false`: a unit or plain abbreviation, which steps don't list.",
        hint: "Remove the term from the step's `terms`.",
    }
    TargetTwiceForAnswer = "P0403" {
        title: "Two targets for one answer",
        explain: "An item has two targets for the same option value, so the step can't say which position is right.",
        hint: "Keep one target for each answer.",
    }
    TargetManyOptions = "P0404" {
        title: "Targets that depend on several options",
        explain: "An item's targets can depend on one option only.",
        hint: "Make the item's `when` tests all name the same option.",
    }
    TargetNoOpen = "P0405" {
        title: "No target for before the answer",
        explain: "An item's targets depend on an option, so it needs an `open` target for while the option is not answered yet.",
        hint: "Add a target for the item with `open: true` and no `when`.",
    }
    ExpectWhenBlanks = "P0406" {
        title: "`expect_when` with the wrong number of blanks",
        explain: "Each `expect_when` value replaces the step's `expect`, so it has as many blanks (`___`) as `expect` does.",
        hint: "Give the value the same number of blanks as the step's `expect`.",
    }
    ExpectWhenTwice = "P0407" {
        title: "An answer in `expect_when` twice",
        explain: "`expect_when` gives each option value at most once.",
        hint: "Remove one of the two entries.",
    }
    ExpectWhenUnused = "P0408" {
        title: "`expect_when` with no target that depends on it",
        explain: "`expect_when` gives the step's value for an answer, but none of the step's targets depend on that answer.",
        hint: "Add the target for that answer, or remove the `expect_when` entry.",
    }
    WordingDisagrees = "P0409" {
        title: "A target and the step's wording disagree",
        explain: "A step's targets and its wording say different things: a position set but not said, said but not set, or a light expected on where the wording says out (or the other way).",
        hint: "Make the target and the step's `expect` (or the answer's value) say the same position.",
    }
    NoTargets = "P0410" {
        title: "A drawn step with no targets",
        explain: "The step's controls are drawn on a panel, so it gives a target for each item it sets or reads.",
        hint: "Add `targets`. `involo-pack suggest-targets <pack>` drafts them from the wording.",
    }
    TargetTwice = "P0411" {
        title: "A target listed twice",
        explain: "A step lists the same target twice.",
        hint: "Remove one of the two.",
    }
    UnknownPanelItem = "P0412" {
        title: "A panel item that doesn't exist",
        explain: "A target or light locator (`panel/section/LABEL/n`) matches no item on the pack's panels.",
        hint: "Check each part of the locator against the panel file: the panel id, the section id, the item's label and which one it is.",
    }
    TargetOffControls = "P0413" {
        title: "A target on another control",
        explain: "A step's target is an item that belongs to none of the step's `controls`.",
        hint: "Add the item's control to the step's `controls`, or target an item of the step's controls.",
    }
    TargetOpenAndSet = "P0414" {
        title: "A target both open and set",
        explain: "An `open` target leaves the position to the pilot, so it can't also `set` one.",
        hint: "Remove `open` or `set`.",
    }
    TargetKind = "P0415" {
        title: "The wrong kind of target for the item",
        explain: "A light takes `light` (on or out), not `set`; only a light or legend pushbutton takes `light`.",
        hint: "Use `light` for a light, and `set` with one of its positions for any other item.",
    }
    UnknownPosition = "P0416" {
        title: "A position the item doesn't have",
        explain: "A target, rest, legend or `lit_at` names a position that is not one of the item's `positions`.",
        hint: "Use one of the item's positions as its panel file spells it, or add the position.",
    }

    // P05xx: phases.yaml.
    StartPageTwice = "P0501" {
        title: "A Start page entry listed twice",
        explain: "`start_page` lists each option, and `panel_state`, at most once.",
        hint: "Remove the second entry.",
    }
    StartPageUnknown = "P0502" {
        title: "A Start page entry that isn't asked there",
        explain: "`start_page` lists options asked on the Start page (their `ask_in` names `start`) and `panel_state`.",
        hint: "Add `start` to the option's `ask_in`, or remove the entry.",
    }
    EngineStartMany = "P0503" {
        title: "More than one engine start phase",
        explain: "At most one phase has `engine_start`: the one that starts the engines.",
        hint: "Keep `engine_start` on one phase.",
    }
    EngineStartReference = "P0504" {
        title: "A reference phase that starts the engines",
        explain: "Reference phases hold lists for any time, so none of them is the one that starts the engines.",
        hint: "Move `engine_start` to a phase of the flight.",
    }
    StartStyleMissing = "P0505" {
        title: "A Start page option with no style",
        explain: "An option asked on the Start page needs `start` with a `style`: cards or row (or toggle, for two values).",
        hint: "Add `start: { style: cards }` (or `row`) to the option.",
    }
    StartNotAsked = "P0506" {
        title: "`start` on an option not asked there",
        explain: "`start` says how the Start page shows an option, so it is only for an option whose `ask_in` names `start`.",
        hint: "Add `start` to `ask_in`, or remove the option's `start`.",
    }
    ToggleShape = "P0507" {
        title: "A toggle of the wrong shape",
        explain: "`style: toggle` is for an option of two values, with `on` naming the value it sets when on; `on` is only for a toggle.",
        hint: "Give the toggle two values and an `on`, or use another style without `on`.",
    }
    SuggestsNotWeight = "P0508" {
        title: "`suggests` reads a field that isn't a weight",
        explain: "An option's `suggests` reads a weight field: a number whose unit is LB or KG.",
        hint: "Point `suggests` at a weight field.",
    }
    AskInUnknownPage = "P0509" {
        title: "`ask_in` names a page that doesn't exist",
        explain: "An option's `ask_in` names where the app asks it: `start`, or one of the app's Flight pages.",
        hint: "Use `start` or a Flight page's id.",
    }
    ReferenceGroup = "P0510" {
        title: "A reference phase's group",
        explain: "Each reference phase has a `group`, one of the groups labels.yaml lists; a phase of the flight has none.",
        hint: "Give the reference phase one of the listed groups, or remove `group` from a flight phase.",
    }
    ChoiceValues = "P0511" {
        title: "An option's choices don't match its values",
        explain: "An option's `choices` give one entry for each of its `values`, no more and no fewer.",
        hint: "Give each value exactly one choice.",
    }

    // P06xx: labels.yaml.
    RoleSeat = "P0601" {
        title: "A role in a seat that doesn't exist",
        explain: "A role in labels.yaml sits in a seat that labels.yaml's `seats` doesn't list.",
        hint: "Use one of the listed seats, or add the seat.",
    }
    GlossaryException = "P0602" {
        title: "A glossary exception that isn't a term",
        explain: "labels.yaml lists a glossary exception that glossary.yaml doesn't define.",
        hint: "Remove the exception, or add the term to glossary.yaml.",
    }

    // P07xx: flight.yaml.
    NotFlightPage = "P0701" {
        title: "A Flight page that doesn't exist",
        explain: "A Flight page, an overview row or a field's place names a page that is not one of the app's Flight pages or the pages `pages` lists, or a group that page doesn't have.",
        hint: "Use a page id from `pages` (or the app's Flight pages), and a group title of that page.",
    }
    PlaceholderField = "P0702" {
        title: "A placeholder that names no field",
        explain: "A `{name}` placeholder in an overview row names no flight field.",
        hint: "Use a field id from flight.yaml inside the braces.",
    }
    PlaceholderForm = "P0703" {
        title: "A placeholder of an unknown form",
        explain: "A placeholder is `{field}` or `{field:grouped}`; no other form exists.",
        hint: "Write `{field}` or `{field:grouped}`.",
    }
    FieldWrongKind = "P0704" {
        title: "A field of the wrong kind",
        explain: "`with`, `toggle`, `unit` and `units` each name a field of a certain kind: another number or text field, a choice field of two choices, or a choice field.",
        hint: "Point it at a field of the kind the message says.",
    }
    FieldNotOnPage = "P0705" {
        title: "A field that isn't on the page or group",
        explain: "A page's `selected`, or a group's field list, names a field that is not placed there.",
        hint: "Place the field on that page and group, or name one that is.",
    }
    AppFieldId = "P0706" {
        title: "A field id the app uses itself",
        explain: "The app has fields of its own; a pack's flight field can't take one of their ids.",
        hint: "Give the field another id.",
    }
    ChoicesShape = "P0707" {
        title: "A choice field's choices",
        explain: "A choice field lists its `choices`; a number or text field has none.",
        hint: "Add `choices` to the choice field, or remove them from the other.",
    }
    NumberOnly = "P0708" {
        title: "A number's settings on another kind of field",
        explain: "Only a number field has a `unit`, `ranges` or `display`.",
        hint: "Remove them, or make the field `kind: number`.",
    }
    RangeOrder = "P0709" {
        title: "A range with min above max",
        explain: "A field's range runs from `min` up to `max`.",
        hint: "Swap the two, or fix the one that is wrong.",
    }
    RangeUnit = "P0710" {
        title: "A range for a unit the field doesn't offer",
        explain: "A range's `unit` is one of the choices of the field the number's `unit` names.",
        hint: "Use one of the unit field's choices, or add it there.",
    }
    DisplayScale = "P0711" {
        title: "A `display` without a scale or step",
        explain: "`display` divides a number by `scale` and rounds it to a multiple of `step`, so both are above 0.",
        hint: "Give `display` a `scale` and a `step` above 0.",
    }
    StripNotShown = "P0712" {
        title: "`strip` on a field not in the strip",
        explain: "`strip` is the text a field shows in the strip, so it is only for a field whose `show_in` includes the strip.",
        hint: "Add `strip` to `show_in`, or remove the field's `strip`.",
    }
    CalculationInputs = "P0713" {
        title: "A calculation's inputs",
        explain: "A calculated field reads other fields (decision 0033): each must exist and be a number, the fields of a `sum` share a unit field, a `scale` has a `scale` and a `step` above 0, and no field reads itself, directly or through other calculated fields.",
        hint: "Name number fields from flight.yaml, give a `sum`'s fields the same `unit`, and break any loop.",
    }
    CalculatedTyped = "P0714" {
        title: "A calculated field that is typed or filled",
        explain: "A calculated field is worked out each time the flight is read, so it is a number with no `simbrief`, `input` or `display` of its own.",
        hint: "Make the field `kind: number` and remove its `simbrief`, `input` and `display`, or remove `calculated`.",
    }

    // P08xx: panels, lights and the flight deck overview.
    RegionBounds = "P0801" {
        title: "An overview region outside the overview",
        explain: "Each overview region has a size and lies inside the overview's box.",
        hint: "Give the region a width and height, and keep it inside the overview.",
    }
    SectionNameSame = "P0802" {
        title: "A section name the same as its title",
        explain: "A section's `name` is for a name other than its title.",
        hint: "Remove `name` to use the title.",
    }
    LightWhich = "P0803" {
        title: "Lights that share a label",
        explain: "When two lights in a section share a label, each needs a different `which` so the app can tell them apart.",
        hint: "Give each light with that label its own `which`.",
    }
    PositionCase = "P0804" {
        title: "Positions not in capitals",
        explain: "Drawings print an item's positions as the placard does, which is in capitals.",
        hint: "Write the positions in capitals.",
    }
    LightColor = "P0805" {
        title: "A light's color",
        explain: "A light has a `color`; no other item has one.",
        hint: "Add `color` to the light, or remove it from the other item.",
    }
    SizeOnlyDisplay = "P0806" {
        title: "A size on a control drawn at a standard size",
        explain: "Only a display unit or readout has a `width` or `height`; every other control is drawn at its standard size.",
        hint: "Remove `width` and `height` from the item.",
    }
    GuardedKind = "P0807" {
        title: "A guard on an item that can't have one",
        explain: "Only a toggle switch or push button can be `guarded`.",
        hint: "Remove `guarded`.",
    }
    SelectorPosition = "P0808" {
        title: "A selector position with no name",
        explain: "Each of a selector's positions has a name.",
        hint: "Name the position, or remove it.",
    }
    SelectorAngles = "P0809" {
        title: "A selector's angles",
        explain: "Only a selector has `angles`: one for each position, from -180 to 180 degrees, each larger than the last as they sweep clockwise.",
        hint: "Give one angle per position, in clockwise order, within -180 to 180.",
    }
    PanelStateRest = "P0810" {
        title: "A rest a panel state contradicts",
        explain: "An item rests at one position, but a panel state counts a step as done that sets it to another.",
        hint: "Make the item's `rest` and the panel state agree.",
    }
    LitAt = "P0811" {
        title: "A light's `lit_at`",
        explain: "Only a light has `lit_at`, which names a position of an item that shares its control.",
        hint: "Remove `lit_at`, or name a position of an item on the same control.",
    }
    ShortCaption = "P0812" {
        title: "A caption with no short form",
        explain: "An overview region has a caption on an edge but no short form of it, so the step map falls back to the long one.",
        hint: "Add the `<edge>_short` caption.",
    }
    SeatView = "P0813" {
        title: "A seat view for a seat that doesn't exist",
        explain: "The overview has a view for a seat that labels.yaml's `seats` doesn't list, so it is never shown.",
        hint: "Use one of the listed seats, or add the seat.",
    }
    ViewShape = "P0814" {
        title: "An overview view's drawing",
        explain: "An overview view has a size; its shapes, outlines and labels have their points inside it; each place has a name for each outline; a side view with places has one `eye` point. A top view has only `structure` and `glass` shapes, each of three points or more, and no places.",
        hint: "Fix the part of the view the message names.",
    }
    UnknownRegion = "P0815" {
        title: "A region that doesn't exist",
        explain: "A view's place names an overview region that the overview doesn't have.",
        hint: "Check the spelling against the overview's regions.",
    }
    WalkaroundOutside = "P0816" {
        title: "A walkaround point outside the top view",
        explain: "A step's `walkaround` point is in the units of the overview's top view, and lies inside it, so its stop is drawn on the airplane.",
        hint: "Move the point inside the top view, or make the top view larger.",
    }
    NoTopView = "P0817" {
        title: "Walkaround points with no top view",
        explain: "Steps have `walkaround` points, but the overview has no `top` view to draw their stops on, so the exterior inspection shows as an ordinary list.",
        hint: "Add a `top` view under the overview's `views`.",
    }

    // P09xx: panel item kinds and outlines.
    KindField = "P0901" {
        title: "A field the item's kind doesn't take",
        explain: "Each kind of panel item takes its own fields: a rocker or push/pull knob has two positions, only a legend pushbutton has `legends`, only a keypad has `columns`.",
        hint: "Remove the field, or change the item's `kind`.",
    }
    Legends = "P0902" {
        title: "A legend pushbutton's legends",
        explain: "A legend pushbutton has one or two `legends`, each with its `text`, and names the `positions` it is set to.",
        hint: "Give the button one or two legends with text, and its positions.",
    }
    Keypad = "P0903" {
        title: "A keypad's keys",
        explain: "A keypad lists its keys, each with a name and each once, as `positions`, and `columns` is at least 1.",
        hint: "List each key once in `positions`, and set `columns` to 1 or more.",
    }
    Outline = "P0904" {
        title: "An outline or item outside its box",
        explain: "An `outline` has three points or more, all inside its box; a section stays inside its panel's outline, and an item inside its section's.",
        hint: "Move the points or the item inside the box.",
    }

    // P10xx: CDU text, messages, aliases, confirmations and links.
    CduRouteLeg = "P1001" {
        title: "A `route_leg` entry",
        explain: "`route_leg` needs an `index` (from 1 to the most legs) and a `part`; no other field takes them.",
        hint: "Give `route_leg` its `index` and `part`, or remove them from the other field.",
    }
    PerPage = "P1002" {
        title: "`per_page` below 1",
        explain: "`per_page` is how many rows a CDU page shows, so it is at least 1.",
        hint: "Set `per_page` to 1 or more.",
    }
    WhenKnown = "P1003" {
        title: "A `when_known` test",
        explain: "`when_known` names the field it tests, and it can't test `route_leg`; test `route` instead.",
        hint: "Name a field in `when_known`, using `route` for the route.",
    }
    MessageText = "P1004" {
        title: "A message with no text or meaning",
        explain: "An alert message has its `text`, as shown, and what it means (`meaning`).",
        hint: "Fill in `text` and `meaning`.",
    }
    MessageTwice = "P1005" {
        title: "A message given twice",
        explain: "The same message text is given twice at one level.",
        hint: "Remove one of the two.",
    }
    NoListReason = "P1006" {
        title: "`no_list` on a message with a list",
        explain: "`no_list` says why a message has no list, so a message with a `list` doesn't take it.",
        hint: "Remove `no_list` or `list`.",
    }
    OptionAlias = "P1007" {
        title: "An option alias of the wrong shape",
        explain: "An option alias points at `<option>:<value>`.",
        hint: "Write the alias's target as `<option>:<value>`.",
    }
    ConfirmationDate = "P1008" {
        title: "A confirmation date that isn't a date",
        explain: "A confirmation's `date` is a real date written YYYY-MM-DD.",
        hint: "Write the date as YYYY-MM-DD, such as 2026-11-08.",
    }
    ConfirmationTwice = "P1009" {
        title: "A confirmation recorded twice",
        explain: "The same confirmation (kind and date) is recorded twice.",
        hint: "Remove one of the two.",
    }
    BlockedLink = "P1010" {
        title: "A link on the blocked list",
        explain: "The pack links a site on the blocked list. Packs never link second-hand study material or the sites the project bans.",
        hint: "Remove the link.",
    }
    LinkNotAllowed = "P1011" {
        title: "A third-party link",
        explain: "Packs carry no URLs to third-party material, only to the few places the project allows.",
        hint: "Remove the link, and say what the pilot needs in your own words.",
    }
    LinkScan = "P1012" {
        title: "Text that can't be scanned for links",
        explain: "Part of the pack could not be read to look for links.",
        hint: "Run the check again; if it repeats, report it as a bug.",
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::Code;

    #[test]
    fn every_code_is_unique_and_written_p_and_four_digits() {
        let mut seen = BTreeSet::new();
        for c in Code::ALL {
            let s = c.as_str();
            assert!(
                s.len() == 5 && s.starts_with('P') && s[1..].bytes().all(|b| b.is_ascii_digit()),
                "{s}"
            );
            assert!(seen.insert(s), "{s} is used twice");
        }
    }

    #[test]
    fn every_code_has_a_title_an_explanation_and_a_hint() {
        for c in Code::ALL {
            let i = c.info();
            assert!(
                !i.title.is_empty() && !i.explain.is_empty() && !i.hint.is_empty(),
                "{c}"
            );
            assert!(!i.title.ends_with('.'), "{c}: a title has no full stop");
            assert!(i.explain.ends_with('.') && i.hint.ends_with('.'), "{c}");
        }
    }

    /// A code in the table that no check raises is stale: a check that goes away takes its
    /// entry with it (its code is never reused).
    #[test]
    fn every_code_is_raised_by_a_check() {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut text = String::new();
        let mut stack = vec![src];
        while let Some(dir) = stack.pop() {
            for entry in std::fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.file_name().is_some_and(|n| n != "codes.rs") {
                    text.push_str(&std::fs::read_to_string(&path).unwrap());
                }
            }
        }
        for name in super::NAMES {
            assert!(
                text.contains(&format!("Code::{name}")),
                "no check raises Code::{name}"
            );
        }
    }

    #[test]
    fn parses_a_code_in_any_case_and_refuses_one_it_lacks() {
        assert_eq!(Code::parse("p0202"), Some(Code::UnknownStep));
        assert_eq!(Code::parse(" P0202 "), Some(Code::UnknownStep));
        assert_eq!(Code::parse("P9999"), None);
        assert_eq!(Code::parse("UnknownStep"), None);
    }
}
