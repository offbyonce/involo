// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Installing a pack on this device (decision 0028): from a file the pilot chose, or from the
// catalog on the app's own site. Every pack is checked by Rust (`check`, the same checks as
// `involo-pack check`, plus the catalog's SHA-256 for a download) before it is kept, and nothing
// is kept when it is refused. A file over the size limit is refused before it is read. The calls
// into Rust, storage and the network are passed in, so Node's test runner covers this file
// (pack-install.test.js).

const MB = 1024 * 1024;

/** The pack file's name beside the catalog: `<id>-<version>.involo-pack`. */
export function catalogFile(entry) {
  return `${entry.id}-${entry.version}.involo-pack`;
}

const refused = (reason) => ({ state: "refused", reasons: [reason] });

/**
 * Reads the catalog, `packs/index.json` beside the app. The request carries nothing about the
 * pilot: no cookies, no referrer and no query.
 */
export async function readCatalog({ fetch, parse }) {
  const response = await fetch("../packs/index.json", {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-cache",
  });
  if (!response.ok) throw new Error(`Could not load the pack catalog (${response.status}).`);
  return parse(await response.text());
}

/** Checks the pack's bytes and keeps it when it passes: what happened, and the pack's text when
 * it passed. */
async function install(bytes, source, sha256, { check, keep, now, askToKeep }) {
  const checked = await check(bytes, sha256);
  if (checked.state === "refused") return { outcome: checked, text: null };
  const pack = { summary: checked.summary, source, installedAt: now() };
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!(await keep({ ...pack, text }))) return { outcome: { state: "notKept", pack }, text };
  askToKeep();
  return { outcome: { state: "installed", pack }, text };
}

/** Installs a pack file the pilot chose. One over `limit` bytes is refused unread. */
export async function installFile(file, deps) {
  if (file.size > deps.limit)
    return refused(
      `That file is too large to be an Involo pack (over ${deps.limit / MB} MB), so it wasn’t read.`,
    );
  return (await install(new Uint8Array(await file.arrayBuffer()), "file", "", deps)).outcome;
}

/**
 * Downloads a catalog pack and installs it once its SHA-256 matches the catalog's. One the
 * catalog or the server says is over `limit` bytes is refused before it is downloaded.
 */
export async function installFromCatalog(entry, deps) {
  return (await openFromCatalog(entry, deps)).outcome;
}

/** As installFromCatalog, with the pack's text when it passed (null when refused), so it can be
 * opened even when this device doesn't keep it. */
export async function openFromCatalog(entry, deps) {
  const tooLarge = {
    outcome: refused(`The pack is too large (over ${deps.limit / MB} MB), so it wasn’t downloaded.`),
    text: null,
  };
  if (entry.size > deps.limit) return tooLarge;
  const file = catalogFile(entry);
  // Called on its own: the browser's fetch refuses to run as another object's method.
  const { fetch } = deps;
  const response = await fetch(`../packs/${encodeURIComponent(file)}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`Could not download ${file} (${response.status}).`);
  if (Number(response.headers.get("content-length") ?? 0) > deps.limit) {
    await response.body?.cancel();
    return tooLarge;
  }
  return install(new Uint8Array(await response.arrayBuffer()), "catalog", entry.sha256, deps);
}
