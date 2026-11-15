import { defineConfig, devices } from "@playwright/test";

// E2E needs Postgres running (npm run db:start) and a build (npm run build).
// The spec re-seeds the DB before each project, so never point this at real data.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "npx next start -p 3100", port: 3100, reuseExistingServer: false, timeout: 120_000, env: { HAM_ENV: "local" } },
});
