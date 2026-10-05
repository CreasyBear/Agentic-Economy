import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const sourcePort = process.env.PLAYWRIGHT_TEST_PORT === undefined ? 3020 : Number(process.env.PLAYWRIGHT_TEST_PORT)
if (!Number.isInteger(sourcePort) || sourcePort < 1024 || sourcePort > 65535) {
  throw new Error('PLAYWRIGHT_TEST_PORT must be an integer between 1024 and 65535.')
}
const sourceBaseUrl = `http://127.0.0.1:${sourcePort}`

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: process.env.AE_E2E_SKIP_A11Y === '1' ? ['**/a11y/**'] : [],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: externalBaseUrl ?? sourceBaseUrl,
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
      command: `npm run dev -- --port ${sourcePort} --strictPort --host 127.0.0.1`,
      // This source proof has no backend. Use PLAYWRIGHT_BASE_URL for the real local/hosted stack.
      env: { AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_CONVEX_SERVER_FUNCTION_TOKEN: '', CONVEX_URL: '', VITE_CONVEX_URL: '', AE_DISABLE_OBSERVABILITY: 'true', VITE_AE_DISABLE_OBSERVABILITY: 'true' },
      url: sourceBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
    },
  } : {}),
})
