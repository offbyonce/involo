<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's
**Security → Report a vulnerability** form on this repository, not in a public issue.
This is a hobby project; reports are answered on a best-effort basis.

## What the app does and does not do

Involo is a web app: static files served by GitHub Pages, which run in your browser and keep
working offline once loaded. It is also a desktop app for Windows and macOS, with the same
interface and code; [The desktop app](#the-desktop-app) below says where it differs.

- **Content security policy.** Every page carries a strict policy: scripts, styles, images,
  fonts and the WebAssembly module load only from this site, no JavaScript `eval` is allowed,
  and forms and `<base>` are blocked.
- **Network requests** go only to this site (the app's own files, and the pack catalog when you
  install or update a pack) and to SimBrief, when you import a flight plan. The SimBrief request goes straight from your browser, sends no
  cookies or referrer, and carries only your SimBrief username or Pilot ID. The SimBrief probe
  page at `/simbrief-probe.html` makes a similar request, also without cookies, when you use it.
- **Updates** come from this site through the service worker. A new version downloads in the
  background and runs only after you press Reload, or on the next launch.
- **No telemetry, no cookies.** The app sends nothing about you or your use of it anywhere, and
  sets no cookies.
- **Keep screen awake** uses the browser's Screen Wake Lock, on this device only.
- **Report a problem with a step** opens GitHub's issue form in a new tab, with the pack, list,
  step and app version filled in. Nothing is sent unless you submit that form on GitHub, under
  your own account.

## What is stored, and where

In the web app, everything stays in this browser on this device. Nothing is sent to a server. The app's own
privacy note (Settings › Privacy) says the same in plain words; when what the app stores or sends
changes, both change together.

- **Browser storage (localStorage):**
  - your progress on the current flight (`involo.flight.<pack>`)
  - your settings, including the SimBrief username you entered and the date of your last
    backup (`involo.settings`)
  - the last SimBrief plan you imported, kept in a compact form: no names or other personal
    fields, and not SimBrief's full text (`involo.plan.<pack>`)
  - saved data the app couldn't use, set aside under the same name with `.kept-<time>`
  - a marker recording that data saved under the app's old name was moved (`involo.renamed`)
- **IndexedDB,** in the database `involo`:
  - the flight log and practice results (store `log`)
  - the packs you installed, from this site's catalog or from a file you chose (store `packs`)
- **Cache storage:** the service worker's copy of the app's files, for offline use.

None of it holds your name or a pilot ID beyond the SimBrief username or Pilot ID you typed,
which you can forget in Flight › SimBrief and OFP file. Once a pack is open, the app asks the
browser to keep this site's data even when the device is short of space; the browser may say no.

Clearing this site's data in your browser removes all of it. Files you save (a backup of your
progress, plans, settings and flight log; the log as CSV or JSON; a copy of kept data) go where
you choose and are yours to keep.

## What the hosting sees

GitHub Pages serves the site and logs visitors' IP addresses, under GitHub's privacy
statement. This project receives none of it.

## Known limits

- The policy is set in a `<meta>` tag, because GitHub Pages cannot send response headers. A
  `<meta>` policy cannot set `frame-ancestors`, so the site has no protection against being
  framed by another site (clickjacking). The app holds no account and takes no payment, which
  limits what framing could do.

## The desktop app

The desktop app is the same interface in the system's webview (WebView2 on Windows, WebKit on
macOS), with a small Rust shell (Tauri) that saves its data as files. Everything above about
telemetry, cookies, SimBrief and Report a problem holds for it too; these are the differences.
Its privacy note (Settings › Privacy) says the same in plain words, and changes with this section.

- **Its data is files** in its data folder: `%APPDATA%\com.offbyonce.involo` on Windows and
  `~/Library/Application Support/com.offbyonce.involo` on macOS. One file per item, in the web
  app's formats: `settings.json`, `flight.<pack>.json`, `plan.<pack>.json` and `log.json`, and
  the packs you installed in `packs/` (`<id>.involo-pack`, with `installed.json` saying where each
  came from). Each file is written whole to a temporary file first and then renamed into place.
  Data the app couldn't use is set aside as `<name>.kept-<time>`, never deleted. The system webview
  may keep its own cache files for the window; the app saves nothing there. Deleting the folder
  removes all of it.
- **Network requests** go to SimBrief when you import a plan, as in the web app; to this site
  (`offbyonce.github.io/involo`) for the pack catalog and pack downloads when you add or update a
  pack; and, at launch, to GitHub's API (`api.github.com`) to ask whether a newer release is out,
  unless Settings › Check for updates is off. None sends cookies or a referrer, or anything about
  you. The window's content security policy allows no other address.
- **Updates are notify only.** When a newer release is out, the app says so and links to its
  page. It never downloads or installs anything by itself; you download the new version and
  install it over the old one.
- **The window's permissions:** the interface may call only the app's own commands
  (`apps/desktop/src-tauri/capabilities/main.json`). No file, network or shell access is granted
  to it. Links open in your default browser, and only `https` links. Saved files go where you
  choose in the save dialog. The app's own files can only be read and written by name inside its
  data folder.
- **One window:** starting the app again brings the open window forward, so two windows never
  write the same files.
- **Unsigned builds.** The Windows and macOS builds are not signed yet. Each installer on the
  release has a SHA-256 sum beside it; check your download against it. Windows SmartScreen and
  macOS Gatekeeper warn before opening an unsigned app; the README says how to open it.
- **What the hosting sees:** GitHub logs the IP addresses of downloads and of the update check,
  under GitHub's privacy statement. This project receives none of it.

## For maintainers

- Signing and update keys never live in this repository. They are passed to release
  builds only, never to builds of pull requests.
- The desktop app's updater key pair exists and is backed up outside the repository. Neither key
  is in the repository, and the public key is committed only once in-app installs are turned on.
- GitHub secret scanning and push protection are enabled.
- `just deny` checks dependency licenses and known advisories.
