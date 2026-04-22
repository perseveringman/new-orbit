import { defineConfig } from '@playwright/test';

// Playwright drives a built Electron app. Skipped by default because it needs
// a display; run with `ORBIT_E2E=1 npm run e2e`.
const enabled = process.env.ORBIT_E2E === '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  // When disabled, Playwright exits cleanly with no tests picked up.
  testMatch: enabled ? /.*\.spec\.ts$/ : /__nothing__/
});
