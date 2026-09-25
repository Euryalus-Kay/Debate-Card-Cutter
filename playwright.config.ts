import { defineConfig } from "@playwright/test";

/**
 * End-to-end scenarios against a running app (default: the local dev server,
 * which provides /api/dev/login for synthetic test users). Uses the installed
 * Google Chrome, so no browser download is needed.
 *
 *   npx playwright test            # E2E_BASE_URL=http://localhost:3100 by default
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
