// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The one Node function tests use: the design token test reads stylesheets with it (Vitest returns empty text
// for a raw CSS import). Declared here so the package needs no Node type definitions.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  /** The test pack helper reads the WebAssembly module's bytes. */
  export function readFileSync(path: string): Uint8Array;
}

interface ImportMeta {
  /** The folder of this module (Node and Vitest). */
  readonly dirname: string;
}
