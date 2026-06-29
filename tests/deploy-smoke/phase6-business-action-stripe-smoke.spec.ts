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

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}
