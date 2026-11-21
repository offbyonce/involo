<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT
-->
# Installing, updating and publishing

A pack reaches the app in one of two ways: from a file you give it, or from the Involo catalog.
Either way the app checks it first, with the same checks `involo-pack check` makes
([decision 0028](../decisions/0028-multiple-packs.md)).

## Building the pack file

`involo-pack build <pack> <out>` checks the pack and writes it as one file,
`<id>-<version>.involo-pack`, with an `index.json` beside it. A pack that extends another is built
over its parent ([extending](extending.md)); a pack with errors isn't written.

```sh
involo-pack build my-twin dist
```

## Installing from a file

In the app, open **Packs** and choose **Add a pack file…**, then pick the `.involo-pack` file. The
app checks it before it keeps it on the device. The file must be:

- at most 16 MB (a larger one is refused unread; the other limits are in [limits](limits.md));
- JSON with a manifest, of a format the app reads, and not a library;
- for a range of app versions (`engine` in `pack.json`) that includes this one.

A refused pack is reported with every reason, and nothing is kept. A built pack is one file, so
two kinds of rule run only when it is built: the folder's other files (no images or PDFs), and the
`labels.yaml` entries building leaves out (labels for basis tags `pack.json` doesn't list, a second
label for one tag or reference group).

Installed packs are kept in the browser's storage on that device, one version per pack id, with
where each came from. A pack from a file is shown as "Not from the Involo catalog" wherever it's
named.

## Updating a pack

Raise `version` in `pack.json` for every change you give to pilots: the app keeps one version of
each pack, and offers a newer one as an update.

An update keeps a pilot's flight. When the app loads a flight saved with an older version, ticks,
skips, blanks and timers follow `aliases.yaml` to the steps' new ids, option values follow their
`option_value` aliases (a value the pack no longer offers goes back to unanswered), and a panel
state follows its alias or is cleared. A step that is gone loses its marks. So when you rename or
move a step, add a `step` alias from the old id:

```yaml
aliases:
  - kind: step
    from: my-twin.before-start.batt
    to: my-twin.before-start.battery
```

A retired id with no alias drops the pilot's tick. The pilot sees what changed (steps added,
reworded in their name, value, Check or If not, and removed): a new version from the catalog is
shown in What's new before the pilot updates, and a newer version added from a file updates
straight away. Either way, the app says the pack was updated, with what changed and that ticks
are kept. Every field is in the [`aliases.yaml` reference](reference/aliases.md).

## Publishing to the catalog

The Involo catalog holds the packs the project publishes. To add one:

1. Write the pack by the [content rules](content-rules.md), in its own folder under `packs/`, and
   make sure `involo-pack check` passes with no errors.
2. Open a pull request with it. Every content change is reviewed by the maintainer before it is
   published; say what each list's `basis` is and how it was checked.
3. Once accepted, the pack is added to the justfile's `published` list.

`just catalog <out>` builds the catalog: each published pack, checked, as one
`<id>-<version>.involo-pack`, and `index.json` with each pack's id, name, version, aircraft,
`engine`, size and SHA-256. `just site` writes it into the site's `packs/`, and a release attaches
the same files. A pack from the catalog must match the catalog's SHA-256 to install. The invented
example packs in `packs/examples` are never published.
