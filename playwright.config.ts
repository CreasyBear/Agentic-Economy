import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3020',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'compact-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'wide-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
  ],
  ...(externalBaseUrl === undefined ? {
    webServer: {
      command: 'npm run dev -- --port 3020 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:3020',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
      env: {
        VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: 'true',
      },
    },
  } : {}),
})
