import { expect, test } from '@playwright/test'

type Phase2SupportSmokeConfig = {
  baseUrl: URL
  businessSlug: string
}

let config: Phase2SupportSmokeConfig | undefined

test.describe('Phase 2 human inquiry support-record smoke', () => {
  test.beforeAll(() => {
    config = readPhase2SupportSmokeConfig()
  })

  test('public inquiry submit proves deployed support record readiness through the user path', async ({ page }) => {
    const smokeConfig = requirePhase2SupportSmokeConfig()
    const stamp = Date.now()

    await page.goto(resolvePath(`/${smokeConfig.businessSlug}/inquiry`, smokeConfig.baseUrl))
    await expect(page.getByRole('heading', { name: 'Send a human inquiry to the owner' })).toBeVisible()
    await expect(page.getByText(/does not create a booking, payment, or automated action/i)).toBeVisible()

    await page.getByLabel('Name').fill('Phase 2 Support Smoke')
    await page.getByLabel('Contact details for the owner reply').fill(`phase2.support.smoke+${stamp}@example.test`)
    await page.getByLabel('What do you need help with?').fill(
      `Phase 2 deployed support-record smoke ${stamp}: please ignore this source-owned test inquiry.`
    )
    await page.getByRole('button', { name: 'Submit inquiry' }).click()

    await expect(page.getByText('Inquiry recorded')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Message saved for .* Delivery state:/)).toBeVisible()
    await expect(page.getByText('Inquiry needs attention')).toHaveCount(0)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/book now|pay now|guaranteed response|AI reply|agent handled/i)
    expect(bodyText).not.toMatch(/provider dispatched|protected action|marketplace|request market/i)
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
        `Missing required Phase 2 support-record smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL and SMOKE_PHASE2_BUSINESS_SLUG.',
        'The deployed Convex source state must contain a complete capabilityLaunchSupportRecords row for human_inquiry_owner_inbox.',
        'SMOKE_PHASE2_BUSINESS_SLUG must point to a published service whose first request mode is inquiry_available.',
      ].join(' ')
    )
  }

  const businessSlug = (required.SMOKE_PHASE2_BUSINESS_SLUG as string).trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    throw new Error('SMOKE_PHASE2_BUSINESS_SLUG must be a lowercase public route slug, such as parramatta-emergency-plumbing.')
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string),
    businessSlug,
  }
}

function parseHttpsUrl(name: string, rawValue: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// for deployed support-record smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function requirePhase2SupportSmokeConfig(): Phase2SupportSmokeConfig {
  if (config === undefined) {
    throw new Error('Phase 2 support-record smoke config was not loaded.')
  }

  return config
}

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}
