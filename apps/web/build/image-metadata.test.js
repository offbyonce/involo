// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { IMAGE_DIRS, imagesUnder, metadataIn } from "./image-metadata.js";

const root = path.resolve(import.meta.dirname, "../../..");

/** A PNG with the given chunks after the signature (sizes and types only; CRCs are zeros). */
function png(...chunks) {
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [type, data = Buffer.alloc(0)] of chunks) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    parts.push(head, data, Buffer.alloc(4));
  }
  return Buffer.concat(parts);
}

test("an image with a C2PA block, or other metadata, is caught", () => {
  const c2pa = png(
    ["IHDR", Buffer.alloc(13)],
    ["caBX", Buffer.from("jumbc2pa")],
    ["IDAT", Buffer.alloc(4)],
    ["IEND"],
  );
  assert.deepEqual(metadataIn("a.png", c2pa), ["a C2PA block", "a caBX chunk"]);
  assert.deepEqual(
    metadataIn("a.png", png(["IHDR", Buffer.alloc(13)], ["tEXt", Buffer.from("Software")], ["IEND"])),
    ["a tEXt chunk"],
  );
  const svg = Buffer.from(
    '<svg xmlns:c2pa="http://c2pa.org/manifest"><metadata><c2pa:manifest>x</c2pa:manifest></metadata></svg>',
  );
  assert.deepEqual(metadataIn("a.svg", svg), ["a C2PA block", "a <metadata> element"]);
});

test("an image with only its pixels and how to show them passes", () => {
  assert.deepEqual(
    metadataIn(
      "a.png",
      png(["IHDR", Buffer.alloc(13)], ["sRGB", Buffer.alloc(1)], ["IDAT", Buffer.alloc(4)], ["IEND"]),
    ),
    [],
  );
  assert.deepEqual(metadataIn("a.svg", Buffer.from('<svg><title>Involo</title><path d="M0 0"/></svg>')), []);
});

test("the site's images, the brand assets and the desktop icons hold no metadata", () => {
  const files = IMAGE_DIRS.flatMap((d) => imagesUnder(path.join(root, d)));
  assert.ok(files.length > 80, `found ${files.length} images`);
  const found = files
    .map((f) => [path.relative(root, f), metadataIn(f, fs.readFileSync(f))])
    .filter(([, m]) => m.length)
    .map(([f, m]) => `${f}: ${m.join(", ")}`);
  assert.deepEqual(found, []);
});
