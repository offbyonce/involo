<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# The desktop app

Involo for Windows and macOS (decision 0031): the same interface (`packages/ui`) and Rust crates as
the web app, in a Tauri 2 window. It never connects to the simulator (decision 0006).

- **`src/`** is the window's entry. `main.ts` mounts the shared interface with `host.ts`, the desktop
  host, which implements the interface's `Host` with Tauri commands. What a webview does as a
  browser does (the SimBrief request, the screen wake lock, the checks around installing a pack
  file) is the web app's own code in `apps/web/src`, shared.
- **`src-tauri/`** is the shell. Each command in `src/commands.rs` wraps one `involo-app-core`
  function and answers with the same JSON as the web app's WebAssembly module. A command is named
  once, in `src/command_names.rs`: `build.rs` makes its permission from there, and the tests check
  that `capabilities/main.json` grants it, that `lib.rs` registers it, and that the host calls no
  other.
- **Links and files.** Links that open a new tab in the web app open in the default browser
  (`open_link`, https only). Backups and log exports go through the save dialog (`save_file`); the
  window never names a path itself.
- **Not yet:** saved data and installed packs are kept in memory until the window closes, and the
  pack catalog isn't read. Files on disk and the catalog come next (#114), then releases and the
  update check (#116).

The crate is a workspace member but not one of its `default-members`, because it needs the system
webview to compile. Never pass `--workspace` to cargo in the justfile.

```sh
just desktop          # the app in a window, with live reload
just desktop-check    # clippy and tests for the Rust crate
just desktop-build    # the installer: NSIS on Windows, a disk image on macOS
```
