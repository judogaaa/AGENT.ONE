import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: true,
    timeout: 60000,
  },
  expect: { timeout: 15000 },
})
