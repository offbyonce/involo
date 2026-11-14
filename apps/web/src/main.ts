// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { App, hostContext } from "@involo/ui";
import "@involo/ui/app.css";
import "./app-page.css";
import "./fonts/fonts.css";
import { mount } from "svelte";
import { prepareStorage } from "./storage-keys.js";
import { registerServiceWorker } from "./updates";
import { webHost } from "./web-host";

const target = document.getElementById("app");
if (!target) throw new Error("missing #app element");

// Saved data from before the rename moves to the new name first (decision 0025).
try {
  prepareStorage(window.localStorage);
} catch {
  // Storage is blocked: nothing is saved, under either name.
}
registerServiceWorker();

export default mount(App, { target, context: hostContext(webHost) });
