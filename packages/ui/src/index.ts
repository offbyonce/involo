// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The shared interface, used by apps/web now and a desktop build later (decision 0010).
// Styles: import "@involo/ui/app.css" in the entry point.

export { default as App } from "./App.svelte";
export {
  getHost,
  type Host,
  hostContext,
  type InstalledPack,
  type PackInstall,
  type PackSource,
  type Saved,
  type SavedItem,
} from "./host";
export { downloadFile } from "./lib/save-file";
export { default as Root } from "./Root.svelte";
export { COLOR } from "./theme/tokens.generated";
