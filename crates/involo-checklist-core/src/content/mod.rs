// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Everything in a pack other than the lists of steps: phases, controls, panels, notes and
//! the CDU walkthrough. Each `...File` type is the top level of one YAML file.

mod aliases;
mod briefings;
mod cdu;
mod controls;
mod faults;
mod flight;
mod glossary;
mod labels;
mod lights;
mod notes;
mod panel_states;
mod panels;
mod phases;

pub use aliases::{Alias, AliasKind, AliasesFile};
pub use briefings::{BriefItem, Briefing, BriefingsFile};
pub use cdu::{
    CduField, CduFile, CduInline, CduPage, CduPart, CduRouteCount, CduRow, CduScreen, CduStyle,
    CduStyled, CduText, CduWalkthrough, CduWhen, RouteLegCount, RouteLegPart,
};
pub use controls::{
    Control, ControlsFile, LabelAnchor, Overview, OverviewArea, OverviewCaption, OverviewRegion,
    OverviewViews, SeatViews, ViewFrame, ViewLabel, ViewPlace, ViewRole, ViewShape, Zone,
};
pub use faults::{Fault, FaultsFile};
pub use flight::{
    FieldChoice, FieldDisplay, FieldKind, FieldRange, FlightField, FlightFile, Rounding, ShowIn,
    SimbriefSource, StripText,
};
pub use glossary::{GlossaryEntry, GlossaryFile};
pub use labels::{
    BasisTagLabel, GroupLabel, Labels, LabelsFile, ListKindLabels, ListKindLabelsFile,
    MethodLabels, MethodLabelsFile, PanelStateLabels, PanelStateLabelsFile, ReferenceLabels,
    ReferenceLabelsFile, RoleLabel, SeatLabel,
};
pub use lights::{LightNote, LightsFile};
pub use notes::{ExplainNote, HowNote, NotesFile};
pub use panel_states::{PanelState, PanelStatesFile};
pub use panels::{LightColor, Panel, PanelItem, PanelItemKind, PanelSection};
pub use phases::{
    IntroParagraph, OptionChoice, Phase, PhasesFile, Stage, StagePhase, SuggestLine, SuggestRule,
    Suggests, UserOption, WeightUnit,
};
