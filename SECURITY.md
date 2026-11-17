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
working offline once loaded.

- **Content security policy.** Every page carries a strict policy: scripts, styles, images,
  fonts and the WebAssembly module load only from this site, no JavaScript `eval` is allowed,
  and forms and `<base>` are blocked.
- **Network requests** go only to this site (the app's own files and packs) and to SimBrief,
  when you import a flight plan. The SimBrief request goes straight from your browser, sends no
  cookies or referrer, and carries only your SimBrief username or Pilot ID. The SimBrief probe
  page at `/simbrief-probe.html` makes a similar request, also without cookies, when you use it.
- **Updates** come from this site through the service worker. A new version downloads in the
  background and runs only after you press Reload, or on the next launch.
- **No telemetry.** The app sends nothing about you or your use of it anywhere.

## What is stored, and where

Everything stays in this browser on this device. Nothing is sent to a server.

- **Browser storage (localStorage):**
  - your progress on the current flight (`involo.flight.<pack>`)
  - your settings, including the SimBrief username you entered (`involo.settings`)
  - the last SimBrief plan you imported, kept in a compact form: no names or other personal
    fields, and not SimBrief's full text (`involo.plan.<pack>`)
  - saved data the app couldn't use, set aside under the same name with `.kept-<time>`
  - a marker recording that data saved under the app's old name was moved (`involo.renamed`)
- **IndexedDB:** the flight log, in the database `involo`.
- **Cache storage:** the service worker's copy of the app's files, for offline use.

Clearing this site's data in your browser removes all of it. Files you export (the log as
HTML, CSV or JSON, a copy of kept data) are saved where you choose and are yours to keep.

## What the hosting sees

GitHub Pages serves the site and logs visitors' IP addresses, under GitHub's privacy
statement. This project receives none of it.

## Known limits

- The policy is set in a `<meta>` tag, because GitHub Pages cannot send response headers. A
  `<meta>` policy cannot set `frame-ancestors`, so the site has no protection against being
  framed by another site (clickjacking). The app holds no account and takes no payment, which
  limits what framing could do.

A desktop build may follow later; this file will describe it when it exists.

## For maintainers

- Signing and update keys never live in this repository. They are passed to release
  builds only, never to builds of pull requests.
- GitHub secret scanning and push protection are enabled.
- `just deny` checks dependency licenses and known advisories.
