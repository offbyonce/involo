// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The end-to-end tests (e2e/): the built site in Chromium and WebKit, served locally with the
// catalog, the network blocked. `just e2e` builds the site and runs them.

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 8790);

export default defineConfig({
  testDir: "e2e",
  outputDir: "../../target/e2e/results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "../../target/e2e/report" }]]
    : "list",
  use: {
    baseURL: `http://localhost:${port}/`,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `node e2e/serve.mjs`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PORT: String(port) },
  },
});
