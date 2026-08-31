import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.AE_AUTHENTICATED_E2E_BASE_URL?.trim() || undefined
const requiredShared = ['CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'AE_E2E_OWNER_EMAIL'] as const
const requiredLocal = [
  'VITE_CLERK_PUBLISHABLE_KEY',
  'CLERK_JWT_ISSUER_DOMAIN',
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'AE_CONVEX_SERVER_FUNCTION_TOKEN',
] as const
const missing = [...requiredShared, ...(externalBaseUrl === undefined ? requiredLocal : [])]
  .filter((name) => process.env[name]?.trim().length === 0 || process.env[name] === undefined)
const configured = missing.length === 0

if (!configured && process.env.AE_REQUIRE_AUTHENTICATED_E2E === 'true') {
  throw new Error(`Authenticated E2E is required but missing: ${missing.join(', ')}`)
}

export default defineConfig({
  testDir: './tests/e2e/authenticated',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github']] : [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3021',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  metadata: { configured, missing },
  projects: [{
    name: 'authenticated-chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
  }],
  ...(configured && externalBaseUrl === undefined ? {
    webServer: {
      command: 'npm run dev -- --port 3021 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:3021',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
    },
  } : {}),
})
