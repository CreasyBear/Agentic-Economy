import { expect, test } from '@playwright/test'

import {
  customerRequestAgentResultSchema,
  customerRequestEvidenceResultSchema,
} from '@/modules/customer-request/agent-contract'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { applyVercelProtectionBypassToPage } from './vercel-bypass'

const baseUrl = productionBaseUrl()
const requestText = process.env.AE_CUSTOMER_REQUEST_TEXT?.trim()
  || 'Find a labelled sandbox service and tell me what it costs.'
const expectedBusinesses = expectedBusinessNames()
const finish = expectedFinish()
const existingRequestRef = process.env.AE_CUSTOMER_REQUEST_EXISTING_REF?.trim()

test('a cold human browser executes and resumes the Request lifecycle', async ({ page }) => {
  test.setTimeout(180_000)
  await applyVercelProtectionBypassToPage(page, baseUrl)
  const sessionToken = process.env.AE_CUSTOMER_REQUEST_HUMAN_SESSION_TOKEN?.trim()
  if (sessionToken !== undefined && sessionToken.length > 0) {
    await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${sessionToken}` })
  }
  if (existingRequestRef !== undefined && existingRequestRef.length > 0) {
    const requestRef = existingRequestRef
    await page.addInitScript(({ key, requestRef }) => {
      localStorage.setItem(key, JSON.stringify({ requestRef }))
    }, { key: 'ae.customer-request.active:v1', requestRef })
  }
  await page.goto(new URL('/engine', baseUrl).href, { waitUntil: 'networkidle' })

  if (existingRequestRef === undefined || existingRequestRef.length === 0) {
    await expect(page.getByRole('heading', { level: 1, name: 'What can we help you find?' })).toBeVisible()
    await page.getByLabel('What are you looking for?').fill(requestText)
    await page.getByRole('button', { name: 'Start my Request' }).click()
    await reachComparableChoice(page)

    for (const business of expectedBusinesses) {
      await expect(page.locator('main')).toContainText(business)
    }
    await expect(page.locator('main')).toContainText('$10.00')
    const decisionText = await page.locator('main').innerText()
    expect(decisionText).not.toMatch(/capabilityId|bindingId|offeringId|RoutePlan|RouteMandate|transport|MCP|x402|graph node/u)
    expect(decisionText).not.toContain('[object Object]')

    await page.getByRole('button', { name: /^Review /u }).first().click()
    await provePreApprovalDisclosures(page)
    await page.getByRole('button', { name: 'Confirm this choice' }).click()
    await page.getByRole('button', { name: 'Start now' }).click()
  }
  if (finish === 'outcome_unknown' || finish === 'partial_result') {
    await proveUnknownOutcomeRecovery(page, finish)
    await emitHumanObservation(page, await activeRequestRef(page), finish)
    return
  }
  await waitForCompletedResult(page)

  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Business result', { exact: true })).toBeVisible()
  await proveInlineActivityRecord(page, 'completed')
  const requestRef = await page.evaluate(() => {
    const stored: unknown = JSON.parse(localStorage.getItem('ae.customer-request.active:v1') ?? 'null')
    return stored !== null && typeof stored === 'object' && 'requestRef' in stored
      ? String(stored.requestRef)
      : undefined
  })
  expect(requestRef).toMatch(/^(?:request|acceptance):/u)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Business result', { exact: true })).toBeVisible()
  await expect(page.getByText(
    'AE restored the latest saved state for this Request. Checking it did not restart the work.',
  )).toBeVisible()
  for (const business of expectedBusinesses) {
    await expect(page.locator('main')).toContainText(business)
  }
  expect(await page.locator('main').innerText()).not.toMatch(
    /capabilityId|bindingId|offeringId|RoutePlan|RouteMandate|transport|MCP|x402|graph node/u,
  )
  await emitHumanObservation(page, requestRef as string)
})

async function provePreApprovalDisclosures(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Review before you confirm' })).toBeVisible()
  const main = page.locator('main')
  for (const label of [
    'Maximum cost',
    'Confirm before',
    'What would be shared',
    'What starting could change',
    'What remains uncertain',
    'Commercial relationships',
    'If something goes wrong',
    'Cancellation',
    'Evidence expected',
  ]) {
    await expect(main.getByText(label, { exact: true })).toBeVisible()
  }
  for (const business of expectedBusinesses) {
    await expect(main).toContainText(business)
  }
  await expect(main).toContainText('$10.00')
  await expect(main).toContainText(/resolve sandbox service reference/iu)
  await expect(main).toContainText(/prepare sandbox service quote/iu)
  await expect(main).toContainText('Information would be shared')
  await expect(main).toContainText('cannot be reversed automatically')
  await expect(main).toContainText('No uncertainty is declared for this choice.')
  await expect(main).toContainText('Completion timing has not been declared.')
  await expect(main).toContainText('AE can safely retry after a confirmed failure.')
  await expect(main).toContainText('AE must check what happened before any retry.')
  await expect(main).toContainText('No alternative way is currently declared.')
  await expect(main).toContainText('Service reference')
  await expect(main).toContainText('Quote reference')
  await expect(page.getByRole('heading', { name: 'What confirming means' })).toBeVisible()
  await expect(page.getByText('Confirming gives AE permission for this exact choice and maximum cost. It does not start work or share information yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm this choice' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change this Request' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Decline this choice' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start now' })).not.toBeVisible()
}

async function emitHumanObservation(
  page: import('@playwright/test').Page,
  requestRef: string,
  expected: 'complete' | 'outcome_unknown' | 'partial_result' = 'complete',
): Promise<void> {
  const [viewResponse, evidenceResponse] = await Promise.all([
    page.request.get(new URL(`/api/requests/${encodeURIComponent(requestRef)}`, baseUrl).href),
    page.request.get(new URL(`/api/requests/${encodeURIComponent(requestRef)}/evidence`, baseUrl).href),
  ])
  const view = customerRequestAgentResultSchema.parse(await viewResponse.json())
  const evidence = customerRequestEvidenceResultSchema.parse(await evidenceResponse.json())
  const expectedState = expected === 'complete' ? 'completed' : 'outcome_unknown'
  if (!viewResponse.ok() || view.kind !== 'request' || view.state !== expectedState
    || view.recovery?.state !== 'restored' || view.recovery.workRestarted !== false
    || !evidenceResponse.ok() || evidence.kind !== 'evidence' || evidence.state !== expectedState
    || evidence.result === undefined) {
    throw new Error('hosted_human_journey_parity_observation_incomplete')
  }
  process.stdout.write(`AE_HUMAN_REQUEST_OBSERVATION ${JSON.stringify({
    requestRef: view.requestRef,
    revision: view.revision,
    state: view.state,
    evidenceState: evidence.state,
    resultDigest: canonicalDigest(evidence.result as StableHashValue),
    businesses: view.businesses?.map(({ name }) => name) ?? [],
    resumedAfterReload: true,
    restoration: view.recovery,
  })}\n`)
}

async function proveUnknownOutcomeRecovery(
  page: import('@playwright/test').Page,
  expected: 'outcome_unknown' | 'partial_result',
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await page.getByText('Still confirming', { exact: true }).first().isVisible().catch(() => false)) break
    if (await page.getByText('Completed', { exact: true }).first().isVisible().catch(() => false)) {
      throw new Error('hosted_human_journey_expected_unknown_but_completed')
    }
    const failed = page.getByText('Could not be completed', { exact: true }).first()
    if (await failed.isVisible().catch(() => false)) {
      throw new Error(`hosted_human_journey_failed:${(await page.locator('main').innerText()).slice(0, 500)}`)
    }
    const check = page.getByRole('button', { name: 'Check progress' })
    if (await check.isVisible().catch(() => false)) await check.click()
    await page.waitForTimeout(1_000)
  }
  await expect(page.getByText('Still confirming', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('1 of 2 business steps completed.')).toBeVisible()
  await expect(page.getByText('AE will not repeat the step whose result is still being confirmed.')).toBeVisible()
  await expect(page.getByText('Wait for confirmation before changing or starting this Request again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start now' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit this Request' })).not.toBeVisible()

  const requestRef = await activeRequestRef(page)
  await proveInlineActivityRecord(page, 'outcome_unknown')
  if (expected === 'partial_result') {
    await expect(page.getByText('Partial result received')).toBeVisible()
    await expect(page.getByText('This is preserved evidence, not a completed result.')).toBeVisible()
    await expect(page.getByText('Recorded partial result')).toBeVisible()
    await expect(page.getByText('This evidence does not confirm completion.')).toBeVisible()
    await expect(page.getByText(/sandbox-partial-quote:/u).last()).toBeVisible()
    await expect(page.getByText('Business result')).not.toBeVisible()
  }

  await page.getByRole('button', { name: 'Report a problem' }).click()
  await page.getByLabel('What went wrong?').fill('The labelled sandbox quote result is still unknown.')
  await page.getByRole('button', { name: 'Send problem report' }).click()
  await expect(page.getByText(/Problem recorded\. Report reference/u)).toBeVisible()

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText('Still confirming', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(
    'AE restored the latest saved state for this Request. Checking it did not restart the work.',
  )).toBeVisible()
  await expect(page.getByText('1 of 2 business steps completed.')).toBeVisible()
  await expect(page.getByText('AE will not repeat the step whose result is still being confirmed.')).toBeVisible()
  expect(await activeRequestRef(page)).toBe(requestRef)
}

async function proveInlineActivityRecord(
  page: import('@playwright/test').Page,
  expected: 'completed' | 'outcome_unknown',
): Promise<void> {
  await page.getByRole('button', { name: 'View activity record' }).click()
  await expect(page.getByRole('heading', { name: 'Activity record' })).toBeVisible()
  if (expected === 'completed') {
    for (let step = 1; step <= expectedBusinesses.length; step += 1) {
      await expect(page.getByText(`Step ${step} completed`)).toBeVisible()
    }
    await expect(page.getByText('AE recorded a completed result and the supporting step receipts.')).toBeVisible()
    await expect(page.getByText('Recorded result', { exact: true })).toBeVisible()
  } else {
    await expect(page.getByText('Step 1 completed')).toBeVisible()
    await expect(page.getByText('Step 2 still being confirmed')).toBeVisible()
    await expect(page.getByText(
      'Some work is recorded, but AE is still confirming a later result and will not repeat it automatically.',
    )).toBeVisible()
  }
  expect(await page.locator('main').innerText()).not.toMatch(/receipt:[a-z0-9_-]+/iu)
}

async function activeRequestRef(page: import('@playwright/test').Page): Promise<string> {
  const requestRef = await page.evaluate(() => {
    const stored: unknown = JSON.parse(localStorage.getItem('ae.customer-request.active:v1') ?? 'null')
    return stored !== null && typeof stored === 'object' && 'requestRef' in stored
      ? String(stored.requestRef)
      : undefined
  })
  expect(requestRef).toMatch(/^(?:request|acceptance):/u)
  return requestRef as string
}

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

function expectedFinish(): 'complete' | 'outcome_unknown' | 'partial_result' {
  const configured = process.env.AE_CUSTOMER_REQUEST_FINISH?.trim() ?? 'complete'
  if (configured !== 'complete' && configured !== 'outcome_unknown' && configured !== 'partial_result') {
    throw new Error(
      'AE_CUSTOMER_REQUEST_FINISH must be complete, outcome_unknown, or partial_result for the human smoke',
    )
  }
  return configured
}
