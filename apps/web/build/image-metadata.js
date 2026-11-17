// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Images ship without embedded metadata: no C2PA provenance block, no text, EXIF or time chunks
// left by the tools that exported them. It is weight every visitor downloads and the service
// worker precaches, and not something the project means to publish. image-metadata.test.js
// checks every image the site, the brand assets and the desktop icons hold.

import fs from "node:fs";
import path from "node:path";

/** The PNG chunks an image needs: the pixels and how to show them. Anything else is metadata. */
export const PNG_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "pHYs",
  "bKGD",
]);

/** The folders whose images are checked, from the repository root. */
export const IMAGE_DIRS = ["apps/web/public", "assets/brand", "apps/desktop/src-tauri/icons"];

const IMAGE = /\.(png|svg|ico|icns|jpe?g|webp|gif)$/i;

/** What metadata an image holds, as short descriptions; empty when it holds none. */
export function metadataIn(name, bytes) {
  const found = [];
  if (bytes.includes("c2pa")) found.push("a C2PA block");
  if (/\.png$/i.test(name)) {
    for (let i = 8; i + 8 <= bytes.length; ) {
      const size = bytes.readUInt32BE(i);
      const type = bytes.toString("latin1", i + 4, i + 8);
      if (!PNG_CHUNKS.has(type)) found.push(`a ${type} chunk`);
      i += 12 + size;
    }
  }
  if (/\.svg$/i.test(name) && /<metadata[\s>]/.test(bytes.toString("utf8")))
    found.push("a <metadata> element");
  return [...new Set(found)];
}

/** Every image file under a folder. */
export function imagesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return imagesUnder(p);
    return IMAGE.test(e.name) ? [p] : [];
  });
}
