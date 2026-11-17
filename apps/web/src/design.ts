// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { DecisionGallery, DrawingGallery, GateGallery } from "@involo/ui";
import "@involo/ui/app.css";
import "./fonts/fonts.css";
import { mount } from "svelte";
import { webHost } from "./web-host";

const target = document.getElementById("gallery");
if (!target) throw new Error("missing #gallery element");

// ?view=gate: round 6's dense-panel gate; ?view=decision: the decision step's states from an
// invented fixture; otherwise every control kind and state.
const params = new URLSearchParams(location.search);
const view = params.get("view");
export default view === "decision"
  ? mount(DecisionGallery, {
      target,
      props: { state: params.get("state") ?? "unanswered", theme: params.get("theme") ?? "dark" },
    })
  : mount(view === "gate" ? GateGallery : DrawingGallery, {
      target,
      // The pack read through the WebAssembly module, as the app reads it.
      props: { loadPack: () => webHost.loadPack("ifly-737-max8") },
    });
