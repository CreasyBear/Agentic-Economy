import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

type Phase6BusinessActionStripeSmokeConfig = {
  baseUrl: URL
  ownerStorageState: string
  requestId: string
  checkpointId: string
  receiptId: string
  stripeCheckoutSessionId: string
  stripeEventId: string
  supportRecordId: string
  killRuleId: string
  operatorNextAction: string
}

let config: Phase6BusinessActionStripeSmokeConfig | undefined

test.describe('Phase 6 business-action Stripe provider smoke', () => {
  test.beforeAll(() => {
    config = readPhase6BusinessActionStripeSmokeConfig()
  })

  test('owner request and receipt routes show source-owned evidence rather than decorative proof', async ({ browser }) => {
    const smokeConfig = requirePhase6BusinessActionStripeSmokeConfig()
    const context = await browser.newContext({ storageState: smokeConfig.ownerStorageState })
    const page = await context.newPage()

    await page.goto(resolvePath(`/owner/business-actions/${smokeConfig.requestId}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(smokeConfig.checkpointId, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/authorization checkpoint|source-owned|receipt/i)

    await page.goto(resolvePath(`/owner/business-actions/${smokeConfig.requestId}/receipt`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(smokeConfig.receiptId, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/Action Receipt|Stripe|support|proof/i)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/screenshot proved|return URL proved|dashboard proved|env var proved|webhook arrival proved/i)

    await context.close()
  })

  test('admin readback reconstructs Stripe evidence, support, kill-rule, and operator next action', async ({ browser }) => {
    const smokeConfig = requirePhase6BusinessActionStripeSmokeConfig()
    const context = await browser.newContext({ storageState: smokeConfig.ownerStorageState })
    const page = await context.newPage()

    await page.goto(resolvePath(`/admin/business-actions/${smokeConfig.requestId}`, smokeConfig.baseUrl))
    await expect(page.locator('body')).toContainText(smokeConfig.stripeCheckoutSessionId, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText(smokeConfig.stripeEventId)
    await expect(page.locator('body')).toContainText(smokeConfig.supportRecordId)
    await expect(page.locator('body')).toContainText(smokeConfig.killRuleId)
    await expect(page.locator('body')).toContainText(smokeConfig.operatorNextAction)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/raw provider payload|raw Stripe payload|webhook secret|STRIPE_SECRET_KEY|card number|payment credential/i)

    await context.close()
  })
})

function requirePhase6BusinessActionStripeSmokeConfig(): Phase6BusinessActionStripeSmokeConfig {
  if (config === undefined) {
    throw new Error('Phase 6 business-action Stripe smoke config was not loaded.')
  }

  return config
}

function readPhase6BusinessActionStripeSmokeConfig(): Phase6BusinessActionStripeSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    SMOKE_P6_OWNER_STORAGE_STATE: process.env.SMOKE_P6_OWNER_STORAGE_STATE,
    SMOKE_P6_BUSINESS_ACTION_REQUEST_ID: process.env.SMOKE_P6_BUSINESS_ACTION_REQUEST_ID,
    SMOKE_P6_AUTHORIZATION_CHECKPOINT_ID: process.env.SMOKE_P6_AUTHORIZATION_CHECKPOINT_ID,
    SMOKE_P6_ACTION_RECEIPT_ID: process.env.SMOKE_P6_ACTION_RECEIPT_ID,
    SMOKE_P6_STRIPE_CHECKOUT_SESSION_ID: process.env.SMOKE_P6_STRIPE_CHECKOUT_SESSION_ID,
    SMOKE_P6_STRIPE_EVENT_ID: process.env.SMOKE_P6_STRIPE_EVENT_ID,
    SMOKE_P6_SUPPORT_RECORD_ID: process.env.SMOKE_P6_SUPPORT_RECORD_ID,
    SMOKE_P6_KILL_RULE_ID: process.env.SMOKE_P6_KILL_RULE_ID,
    SMOKE_P6_OPERATOR_NEXT_ACTION: process.env.SMOKE_P6_OPERATOR_NEXT_ACTION,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Phase 6 business-action Stripe smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, SMOKE_P6_OWNER_STORAGE_STATE, SMOKE_P6_BUSINESS_ACTION_REQUEST_ID, SMOKE_P6_AUTHORIZATION_CHECKPOINT_ID, SMOKE_P6_ACTION_RECEIPT_ID, SMOKE_P6_STRIPE_CHECKOUT_SESSION_ID, SMOKE_P6_STRIPE_EVENT_ID, SMOKE_P6_SUPPORT_RECORD_ID, SMOKE_P6_KILL_RULE_ID, and SMOKE_P6_OPERATOR_NEXT_ACTION.',
        'The deployed source state must include a source-owned capability request, accepted authorization checkpoint, Action Receipt, bound test-mode Stripe Checkout Session evidence, signed Stripe event evidence, support record, kill-rule row, and redacted operator next action.',
        'This smoke must not be replaced by env-var presence, provider dashboards, screenshots, return URL arrival, webhook arrival alone, or local-only source assertions.',
        'Until those inputs are configured and this smoke passes, provider-smoke status is not external proof.',
      ].join(' ')
    )
  }

  const ownerStorageState = (required.SMOKE_P6_OWNER_STORAGE_STATE as string).trim()
  if (!existsSync(ownerStorageState)) {
    throw new Error(`SMOKE_P6_OWNER_STORAGE_STATE does not exist: ${ownerStorageState}`)
  }

  const evidence = {
    requestId: assertSourceEvidenceRef(
      'SMOKE_P6_BUSINESS_ACTION_REQUEST_ID',
      required.SMOKE_P6_BUSINESS_ACTION_REQUEST_ID as string,
    ),
    checkpointId: assertSourceEvidenceRef(
      'SMOKE_P6_AUTHORIZATION_CHECKPOINT_ID',
      required.SMOKE_P6_AUTHORIZATION_CHECKPOINT_ID as string,
    ),
    receiptId: assertSourceEvidenceRef('SMOKE_P6_ACTION_RECEIPT_ID', required.SMOKE_P6_ACTION_RECEIPT_ID as string),
    stripeCheckoutSessionId: assertSourceEvidenceRef(
      'SMOKE_P6_STRIPE_CHECKOUT_SESSION_ID',
      required.SMOKE_P6_STRIPE_CHECKOUT_SESSION_ID as string,
    ),
    stripeEventId: assertSourceEvidenceRef('SMOKE_P6_STRIPE_EVENT_ID', required.SMOKE_P6_STRIPE_EVENT_ID as string),
    supportRecordId: assertSourceEvidenceRef(
      'SMOKE_P6_SUPPORT_RECORD_ID',
      required.SMOKE_P6_SUPPORT_RECORD_ID as string,
    ),
    killRuleId: assertSourceEvidenceRef('SMOKE_P6_KILL_RULE_ID', required.SMOKE_P6_KILL_RULE_ID as string),
    operatorNextAction: assertRedactedOperatorNextAction(
      required.SMOKE_P6_OPERATOR_NEXT_ACTION as string,
    ),
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string),
    ownerStorageState,
    ...evidence,
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
    throw new Error(`${name} must use https:// for deployed business-action Stripe smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function assertSourceEvidenceRef(name: string, rawValue: string): string {
  const value = rawValue.trim()
  if (decorativeProofPattern.test(value) || /^https?:\/\//i.test(value)) {
    throw new Error(
      `${name} must be a source-owned evidence/readback ref, not a screenshot, return URL, dashboard, env var, webhook arrival, or external URL.`
    )
  }

  return value
}

function assertRedactedOperatorNextAction(rawValue: string): string {
  const value = rawValue.trim()
  if (decorativeProofPattern.test(value)) {
    throw new Error(
      'SMOKE_P6_OPERATOR_NEXT_ACTION must be a redacted source-owned operator action, not dashboard/screenshot/return/webhook proof.'
    )
  }

  if (/(?:sk_live|sk_test|whsec_|card number|payment credential|raw provider payload|raw Stripe payload)/i.test(value)) {
    throw new Error('SMOKE_P6_OPERATOR_NEXT_ACTION must be redacted and must not contain provider secrets or raw payment data.')
  }

  return value
}

const decorativeProofPattern = /\b(?:screenshot|return URL|dashboard|env var|webhook arrival|webhook arrived)\b/i

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}
