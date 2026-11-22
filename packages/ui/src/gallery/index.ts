// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The design pages' galleries, an entry of their own: Svelte components run code when they are
// imported, so exporting them from the main entry would put them in the app's script too.

export { default as DecisionGallery } from "./DecisionGallery.svelte";
export { default as DrawingGallery } from "./DrawingGallery.svelte";
export { default as GateGallery } from "./GateGallery.svelte";
