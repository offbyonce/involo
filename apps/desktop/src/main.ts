// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop window's entry (decision 0031): the shared interface with the desktop host, and the
// web app's bundled typefaces.

import { hostContext, Root } from "@involo/ui";
import "@involo/ui/app.css";
import "../../web/src/fonts/fonts.css";
import { mount } from "svelte";
import { desktopHost } from "./host";
import { openLinksWith } from "./links";

const target = document.getElementById("app");
if (!target) throw new Error("missing #app element");

openLinksWith((url) => void desktopHost.openLink(url).catch(() => {}));

export default mount(Root, { target, context: hostContext(desktopHost) });
