import { expect, test } from '@playwright/test'

import { applyVercelProtectionBypassToPage } from './vercel-bypass'

const baseUrl = productionBaseUrl()
const requestText = process.env.AE_CUSTOMER_REQUEST_TEXT?.trim()
  || 'Find a labelled sandbox service and tell me what it costs.'
const expectedBusinesses = expectedBusinessNames()

test('a cold human browser completes and resumes the production Request lifecycle', async ({ page }) => {
  test.setTimeout(120_000)
  await applyVercelProtectionBypassToPage(page, baseUrl)
  await page.goto(new URL('/engine', baseUrl).href, { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { level: 1, name: 'What can we help you find?' })).toBeVisible()
  await page.getByLabel('What are you looking for?').fill(requestText)
  await page.getByRole('button', { name: 'Explore' }).click()
  await reachComparableChoice(page)

  for (const business of expectedBusinesses) {
    await expect(page.locator('main')).toContainText(business)
  }
  await expect(page.locator('main')).toContainText('$10.00')
  const decisionText = await page.locator('main').innerText()
  expect(decisionText).not.toMatch(/capabilityId|bindingId|offeringId|RoutePlan|RouteMandate|transport|MCP|x402|graph node/u)

  await page.getByRole('button', { name: /^Review /u }).first().click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()
  await page.getByRole('button', { name: 'Start now' }).click()
  await waitForCompletedResult(page)

  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/sandbox-quote:/u)).toBeVisible()
  const requestRef = await page.evaluate(() => {
    const stored: unknown = JSON.parse(localStorage.getItem('ae.customer-request.active:v1') ?? 'null')
    return stored !== null && typeof stored === 'object' && 'requestRef' in stored
      ? String(stored.requestRef)
      : undefined
  })
  expect(requestRef).toMatch(/^request:/u)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/sandbox-quote:/u)).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(
    /capabilityId|bindingId|offeringId|RoutePlan|RouteMandate|transport|MCP|x402|graph node/u,
  )
})

async function reachComparableChoice(page: import('@playwright/test').Page): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    const continueButton = page.getByRole('button', { name: 'Continue' })
    const allowButton = page.getByRole('button', { name: 'Allow this comparison' })
    const showButton = page.getByRole('button', { name: 'Show available options' })
    await Promise.race([
      continueButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
      allowButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
      showButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
    ])
    if (await continueButton.isVisible().catch(() => false)) {
      await page.getByRole('textbox').last().fill('Resolve a labelled sandbox service and prepare its quote.')
      await continueButton.click()
      continue
    }
    if (await allowButton.isVisible().catch(() => false)) {
      await allowButton.click()
      continue
    }
    if (await showButton.isVisible().catch(() => false)) {
      await showButton.click()
      await page.getByRole('button', { name: /^Review /u }).first().waitFor({ state: 'visible', timeout: 30_000 })
      return
    }
  }
  throw new Error('hosted_human_journey_did_not_reach_choice')
}

async function waitForCompletedResult(page: import('@playwright/test').Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await page.getByText('Completed', { exact: true }).first().isVisible().catch(() => false)) return
    const failed = page.getByText('Could not be completed', { exact: true }).first()
    if (await failed.isVisible().catch(() => false)) {
      throw new Error(`hosted_human_journey_failed:${(await page.locator('main').innerText()).slice(0, 500)}`)
    }
    const unknown = page.getByText('Still confirming', { exact: true }).first()
    if (await unknown.isVisible().catch(() => false)) {
      throw new Error('hosted_human_journey_outcome_unknown')
    }
    const check = page.getByRole('button', { name: 'Check progress' })
    if (await check.isVisible().catch(() => false)) await check.click()
    await page.waitForTimeout(1_000)
  }
  throw new Error('hosted_human_journey_completion_timeout')
}

function productionBaseUrl(): URL {
  const configured = process.env.AE_CUSTOMER_REQUEST_BASE_URL?.trim()
  if (configured === undefined || configured.length === 0) {
    throw new Error('AE_CUSTOMER_REQUEST_BASE_URL_required')
  }
  const url = new URL(configured)
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('hosted_human_journey_https_required')
  }
  return url
}

function expectedBusinessNames(): readonly string[] {
  const configured = process.env.AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON?.trim()
  if (configured === undefined || configured.length === 0) {
    return ['Sandbox Route Resolver', 'Sandbox Route Quoter']
  }
  const parsed: unknown = JSON.parse(configured)
  if (!Array.isArray(parsed) || parsed.length < 2
    || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON_invalid')
  }
  return parsed
}
