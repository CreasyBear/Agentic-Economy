import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { authenticatedE2EEnvironment, requireAuthenticatedE2EEnvironment } from '../e2e/authenticated/environment'

const environment = authenticatedE2EEnvironment
if (environment.required) requireAuthenticatedE2EEnvironment()

export default defineConfig({
  testDir: '../e2e/authenticated',
  outputDir: fileURLToPath(new URL('../../test-results', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github']] : [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: environment.baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  metadata: {
    configured: environment.configured,
    missing: environment.missing,
    invalid: environment.invalid,
  },
  projects: environment.configured
    ? [
        {
          name: 'clerk-setup',
          testMatch: /global\.setup\.ts/u,
        },
        {
          name: 'authenticated-chromium',
          dependencies: ['clerk-setup'],
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
        },
      ]
    : [{
        name: 'authenticated-chromium',
        use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
      }],
  ...(environment.configured && environment.externalBaseUrl === undefined ? {
    webServer: {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      command: 'npm run dev -- --port 3021 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:3021',
      env: {
        AE_CANONICAL_BASE_URL: environment.baseURL,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
    },
  } : {}),
})
