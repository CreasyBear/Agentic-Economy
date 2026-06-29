import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

type Phase5PaidActivationSmokeConfig = {
  baseUrl: URL
  ownerStorageState: string
  businessSlug: string
  operationId: string
  receiptId: string
  providerEventId: string
  reconciliationId: string
  publicClaimText: string
}

let config: Phase5PaidActivationSmokeConfig | undefined

test.describe('Phase 5 Autumn and Stripe PSP paid-activation provider smoke', () => {
  test.beforeAll(() => {
    config = readPhase5PaidActivationSmokeConfig()
  })

  test('owner return and receipt routes show source-owned billing readback, not return-url proof', async ({ browser }) => {
    const smokeConfig = requirePhase5PaidActivationSmokeConfig()
    const context = await browser.newContext({ storageState: smokeConfig.ownerStorageState })
    const page = await context.newPage()

    await page.goto(resolvePath(`/owner/billing/return/${smokeConfig.operationId}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(/provider readback|billing|receipt/i, { timeout: 20_000 })
    await expect(page.locator('body')).not.toContainText(/return URL proved payment|dashboard proved payment|env var proved payment/i)

    await page.goto(resolvePath(`/owner/billing/receipts/${smokeConfig.receiptId}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(/receipt/i, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/paid|refund|dispute|chargeback/i)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/PAN|CVC|card number|webhook secret|AUTUMN_SECRET_KEY|STRIPE_SECRET_KEY/i)

    await context.close()
  })

  test('admin monetization readback reconstructs provider event and reconciliation evidence', async ({ browser }) => {
    const smokeConfig = requirePhase5PaidActivationSmokeConfig()
    const context = await browser.newContext({ storageState: smokeConfig.ownerStorageState })
    const page = await context.newPage()

    await page.goto(resolvePath(`/admin/monetization/${smokeConfig.operationId}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(smokeConfig.providerEventId, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(smokeConfig.reconciliationId)
    await expect(page.locator('body')).toContainText(/operator next action|reconciliation|provider evidence/i)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/rawBody|raw provider payload|webhook secret|card number|payment credential/i)

    await context.close()
  })

  test('public paid claim appears only with source-owned support and kill-rule evidence', async ({ page }) => {
    const smokeConfig = requirePhase5PaidActivationSmokeConfig()

    await page.goto(resolvePath(`/${smokeConfig.businessSlug}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(smokeConfig.publicClaimText, { timeout: 20_000 })

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/wallet|credits|stored value|custody|x402|Connect|marketplace payout|split payout|direct Stripe subscription/i)
    expect(bodyText).not.toMatch(/return URL proved payment|dashboard proved payment|env var proved payment/i)
  })
})

function readPhase5PaidActivationSmokeConfig(): Phase5PaidActivationSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    SMOKE_P5_OWNER_STORAGE_STATE: process.env.SMOKE_P5_OWNER_STORAGE_STATE,
    SMOKE_P5_BUSINESS_SLUG: process.env.SMOKE_P5_BUSINESS_SLUG,
    SMOKE_P5_BILLING_OPERATION_ID: process.env.SMOKE_P5_BILLING_OPERATION_ID,
    SMOKE_P5_BILLING_RECEIPT_ID: process.env.SMOKE_P5_BILLING_RECEIPT_ID,
    SMOKE_P5_PROVIDER_EVENT_ID: process.env.SMOKE_P5_PROVIDER_EVENT_ID,
    SMOKE_P5_RECONCILIATION_ID: process.env.SMOKE_P5_RECONCILIATION_ID,
    SMOKE_P5_PUBLIC_CLAIM_TEXT: process.env.SMOKE_P5_PUBLIC_CLAIM_TEXT,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Phase 5 paid-activation smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, SMOKE_P5_OWNER_STORAGE_STATE, SMOKE_P5_BUSINESS_SLUG, SMOKE_P5_BILLING_OPERATION_ID, SMOKE_P5_BILLING_RECEIPT_ID, SMOKE_P5_PROVIDER_EVENT_ID, SMOKE_P5_RECONCILIATION_ID, and SMOKE_P5_PUBLIC_CLAIM_TEXT.',
        'The deployed source state must include a bound Autumn provider event, Stripe PSP receipt evidence, reconciliation readback, support/kill-rule evidence, and a public claim evidence row.',
        'This smoke must not be replaced by env-var presence, provider dashboards, screenshots, return URL arrival, or webhook arrival alone.',
      ].join(' ')
    )
  }

  const ownerStorageState = (required.SMOKE_P5_OWNER_STORAGE_STATE as string).trim()
  if (!existsSync(ownerStorageState)) {
    throw new Error(`SMOKE_P5_OWNER_STORAGE_STATE does not exist: ${ownerStorageState}`)
  }

  const businessSlug = (required.SMOKE_P5_BUSINESS_SLUG as string).trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    throw new Error('SMOKE_P5_BUSINESS_SLUG must be a lowercase public route slug.')
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string),
    ownerStorageState,
    businessSlug,
    operationId: (required.SMOKE_P5_BILLING_OPERATION_ID as string).trim(),
    receiptId: (required.SMOKE_P5_BILLING_RECEIPT_ID as string).trim(),
    providerEventId: (required.SMOKE_P5_PROVIDER_EVENT_ID as string).trim(),
    reconciliationId: (required.SMOKE_P5_RECONCILIATION_ID as string).trim(),
    publicClaimText: (required.SMOKE_P5_PUBLIC_CLAIM_TEXT as string).trim(),
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
    throw new Error(`${name} must use https:// for deployed paid-activation smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function requirePhase5PaidActivationSmokeConfig(): Phase5PaidActivationSmokeConfig {
  if (config === undefined) {
    throw new Error('Phase 5 paid-activation smoke config was not loaded.')
  }

  return config
}

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}
