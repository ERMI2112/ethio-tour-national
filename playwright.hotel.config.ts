import { defineConfig } from '@playwright/test';

import { hotelE2eConfig } from './tests/e2e/hotel-onboarding-support';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'hotel-onboarding-live.spec.ts',
  outputDir: './test-results/hotel-onboarding',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: hotelE2eConfig.workspaceUrl.href,
    browserName: 'chromium',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    acceptDownloads: false,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
});
