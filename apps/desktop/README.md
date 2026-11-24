<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# The desktop app

Involo for Windows and macOS (decision 0031): the same interface (`packages/ui`) and Rust crates as
the web app, in a Tauri 2 window. It never connects to the simulator (decision 0006).

- **`src/`** is the window's entry. `main.ts` mounts the shared interface with `host.ts`, the desktop
  host, which implements the interface's `Host` with Tauri commands and says it is the desktop app
  (`Host.desktop`), so the places that talk about the browser say "this computer" instead. What a
  webview does as a browser does (the SimBrief request, the screen wake lock, the catalog, and the
  checks around installing a pack) is the web app's own code in `apps/web/src`, shared.
- **`src-tauri/`** is the shell. Each command in `src/commands.rs` wraps one `involo-app-core`
  function and answers with the same JSON as the web app's WebAssembly module. A command is named
  once, in `src/command_names.rs`: `build.rs` makes its permission from there, and the tests check
  that `capabilities/main.json` grants it, that `lib.rs` registers it, and that the host calls no
  other.
- **Links and files.** Links that open a new tab in the web app open in the default browser
  (`open_link`, https only). Backups and log exports go through the save dialog (`save_file`); the
  window never names a path itself.
- **Files on disk** (`src-tauri/src/files.rs`, `src/files.ts`): the data folder is
  `com.offbyonce.involo` (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS). It
  holds one JSON file per saved item, in the web app's formats (`settings.json`,
  `flight.<pack>.json`, `plan.<pack>.json`, `log.json`), and the installed packs in `packs/`
  (`<id>.involo-pack`, and `installed.json` saying where each came from). A write goes to a
  temporary file that is renamed into place, so a crash never leaves half a file; text the app
  can't use is set aside as `<name>.kept-<time>`, never written over.
- **One window:** starting the app again focuses the open one (the single-instance plugin), so two
  windows never write the same files.
- **The catalog** is read from the app's site, `https://offbyonce.github.io/involo/packs/`, with the
  web app's checks.
- **Not yet:** releases and the update check (#116).

The crate is a workspace member but not one of its `default-members`, because it needs the system
webview to compile. Never pass `--workspace` to cargo in the justfile.

```sh
just desktop          # the app in a window, with live reload
just desktop-check    # clippy and tests for the Rust crate
just desktop-build    # the installer: NSIS on Windows, a disk image on macOS
```
