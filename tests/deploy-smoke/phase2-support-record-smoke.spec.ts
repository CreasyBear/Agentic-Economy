import { expect, test } from '@playwright/test'
import { parseHttpsUrl, resolvePath } from '../helpers/deployed-smoke'

type Phase2SupportSmokeConfig = {
  baseUrl: URL
  businessSlug: string
}

let config: Phase2SupportSmokeConfig | undefined

test.describe('Phase 2 retired inquiry surface smoke', () => {
  test.beforeAll(() => {
    config = readPhase2SupportSmokeConfig()
  })

  test('public inquiry URL is gone on the deployed host', async ({ page }) => {
    const smokeConfig = requirePhase2SupportSmokeConfig()
    const response = await page.goto(resolvePath(`/${smokeConfig.businessSlug}/inquiry`, smokeConfig.baseUrl))
    expect(response?.status()).toBe(404)
  })
})

function readPhase2SupportSmokeConfig(): Phase2SupportSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    SMOKE_PHASE2_BUSINESS_SLUG: process.env.SMOKE_PHASE2_BUSINESS_SLUG,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Phase 2 retired-inquiry smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL and SMOKE_PHASE2_BUSINESS_SLUG.',
        'SMOKE_PHASE2_BUSINESS_SLUG must be a published public slug such as demo-listed-provider.',
        'This smoke asserts /{slug}/inquiry is 404 after the inquiry cut.',
      ].join(' ')
    )
  }

  const businessSlug = (required.SMOKE_PHASE2_BUSINESS_SLUG as string).trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    throw new Error('SMOKE_PHASE2_BUSINESS_SLUG must be a lowercase public route slug, such as demo-listed-provider.')
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string, 'deployed retired-inquiry smoke'),
    businessSlug,
  }
}

function requirePhase2SupportSmokeConfig(): Phase2SupportSmokeConfig {
  if (config === undefined) {
    throw new Error('Phase 2 retired-inquiry smoke config was not loaded.')
  }

  return config
}
