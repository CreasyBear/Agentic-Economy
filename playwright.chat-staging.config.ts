import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  testDir: './tests/deploy-smoke',
  testMatch: 'chat-anonymous-streaming-smoke.spec.ts',
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'output/release/playwright-chat-staging-smoke.json' }],
  ],
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chat-staging' }],
})
