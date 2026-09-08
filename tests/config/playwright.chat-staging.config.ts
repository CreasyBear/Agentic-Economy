import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  testDir: '../deploy-smoke',
  outputDir: fileURLToPath(new URL('../../test-results', import.meta.url)),
  testMatch: [
    'chat-anonymous-streaming-smoke.spec.ts',
    'chat-browser-staging.spec.ts',
  ],
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: fileURLToPath(new URL('../../output/release/playwright-chat-staging-smoke.json', import.meta.url)) }],
  ],
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chat-staging' }],
})
