import { defineConfig } from '@playwright/test';

const BASE = process.env.AGENT_ONE_E2E_BASE_URL || 'http://localhost:18080';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  expect: { timeout: 15000 },
});
