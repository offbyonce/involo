// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// The desktop window's build (decision 0031), into dist/, which tauri.conf.json bundles. Its
// content security policy is in tauri.conf.json, which Tauri adds to the page. The dev server
// uses its own port, so it can run beside the web app's (1420).
export default defineConfig({
  plugins: [svelte()],
  base: "./",
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  build: { target: "es2022" },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
