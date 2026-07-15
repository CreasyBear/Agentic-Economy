import { expect, test } from '@playwright/test'

import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

test('choice review is legible and authority-free until explicit confirmation', async ({ page }) => {
  let confirmations = 0
  const preview = decisionView()
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: preview }))
  await page.route('**/api/requests/*/confirmation', async (route) => {
    confirmations += 1
    await route.fulfill({ json: confirmedView(preview) })
  })

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Prepare a governed result')
  await page.getByRole('button', { name: 'Explore' }).click()

  await expect(page.getByRole('heading', { name: 'One way forward is available.' })).toBeVisible()
  await expect(page.getByText('Maximum $14.00')).toBeVisible()
  await expect(page.getByText('2 information recipients')).toBeVisible()
  await expect(page.getByText('1 irreversible effect')).toBeVisible()
  await expect(page.getByText(/Fields: Request \(public\)/)).not.toBeVisible()
  await expect(page.getByText('City Ledger will follow step 1.')).not.toBeVisible()

  await page.getByRole('button', { name: 'Review Prepare a governed result' }).click()
  await expect(page.getByRole('heading', { name: 'Review before you confirm' })).toBeVisible()
  await expect(page.getByText(/Fields: Request \(public\)/)).toBeVisible()
  await expect(page.getByText('Choice code quote:decision')).toBeVisible()
  await expect(page.getByText(/does not start the work/)).toBeVisible()
  expect(confirmations).toBe(0)

  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('button', { name: 'Review Prepare a governed result' })).toBeVisible()
  expect(confirmations).toBe(0)

  await page.getByRole('button', { name: 'Review Prepare a governed result' }).click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()
  await expect(page.getByText('Choice confirmed')).toBeVisible()
  await expect(page.getByText('Confirmation code confirmation:decision')).toBeVisible()
  expect(confirmations).toBe(1)
})

test('exact clarification stays conversational and explains its decision impact', async ({ page }) => {
  let refinementBody: unknown
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: clarificationView() }))
  await page.route('**/api/requests/*/facts', async (route) => {
    refinementBody = route.request().postDataJSON()
    await route.fulfill({ json: clarifiedView() })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Find a nearby business')
  await page.getByRole('button', { name: 'Explore' }).click()

  await expect(page.getByRole('heading', { name: 'Which area should the business cover?' })).toBeVisible()
  await expect(page.getByPlaceholder('Answer in your own words')).toBeVisible()
  await page.getByLabel('Your answer').fill('Fremantle and nearby suburbs would work.')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('button', { name: 'Show available options' })).toBeVisible()
  await expect(page.getByText(/Area:/)).toBeVisible()
  await expect(page.getByText(/You said this.*Used to decide which options fit and how they compare/)).toBeVisible()
  expect(refinementBody).toMatchObject({
    expectedRevision: 1,
    requirementKey: 'requirement:area',
    value: 'Fremantle and nearby suburbs would work.',
  })
})

function clarificationView(): CustomerRequestView {
  return {
    kind: 'request', requestRef: 'request:clarification', revision: 1,
    state: 'needs_information', summary: 'Find a nearby business', nextAction: 'provide_information',
    missingFields: [{
      field: 'requirement:area', label: 'Which area should the business cover?',
      explanation: 'This answer changes which registered options can be prepared now.',
    }],
    clarification: {
      kind: 'contract_fact', requirementKey: 'requirement:area',
      prompt: 'Which area should the business cover?', answerKind: 'typed_value',
    },
    options: [],
  }
}

function clarifiedView(): CustomerRequestView {
  return {
    kind: 'request', requestRef: 'request:clarification', revision: 2,
    state: 'ready_to_compare', summary: 'Find a nearby business around Fremantle',
    nextAction: 'prepare_options', missingFields: [], options: [],
    criteria: [{
      label: 'Area', value: 'Fremantle and nearby suburbs', basis: 'customer_provided',
      impact: 'eligibility_and_comparison',
    }],
  }
}

function decisionView(): CustomerRequestView {
  const validUntil = Date.now() + 300_000
  return {
    kind: 'request', requestRef: 'request:decision', revision: 2,
    routeGenerationRef: 'generation:decision', state: 'routes_ready',
    summary: 'Prepare a governed result', nextAction: 'inspect_routes', missingFields: [], options: [],
    decision: {
      generationRef: 'generation:decision', requestRevision: 2,
      outcome: { kind: 'routes_available', routeCount: 1, summary: 'One way forward is available.' },
      routes: [{
        routeRef: 'route:decision', quoteDigest: 'quote:decision',
        result: {
          resultRef: 'result:decision', summary: 'Prepare a governed result.', deliverables: ['Result reference'],
        },
        availability: 'current', stepCount: 2,
        businesses: [
          { businessRef: 'business:north-star', name: 'North Star Services' },
          { businessRef: 'business:city-ledger', name: 'City Ledger' },
        ],
        maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_400 },
        dataUse: {
          recipientCount: 2, purposes: ['Find the service', 'Prepare the result'],
          recipients: [
            {
              recipientRef: 'recipient:north-star', name: 'North Star Services', purposes: ['Find the service'],
              fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' }],
            },
            {
              recipientRef: 'recipient:city-ledger', name: 'City Ledger', purposes: ['Prepare the result'],
              fields: [{ fieldRef: 'field:result', label: 'Result', classification: 'personal' }],
            },
          ],
        },
        effects: [{ kind: 'information_shared', reversibility: 'irreversible' }],
        evidence: [{ label: 'Result reference', purpose: 'completion' }],
        recovery: [
          { step: 1, businessName: 'North Star Services', posture: 'retry_safe' },
          { step: 2, businessName: 'City Ledger', posture: 'reconcile_required' },
        ],
        cancellation: { kind: 'unavailable', summary: 'No cancellation path is published.' },
        validUntil, fallback: { available: false, alternatives: [] }, uncertainty: [],
        comparison: {
          outcomeRef: 'outcome:decision', outcomeFit: 'same_promised_result', completeness: 'complete',
          hardConstraints: 'satisfied', maximumCost: { kind: 'known', currency: 'AUD', amountMinor: 1_400 },
          dataExposureCount: 2, irreversibleEffectCount: 1, uncertaintyCount: 0,
          duration: 'not_declared', recovery: 'reconcile_required', trust: 'registered_live_supply',
          evidenceCount: 1, freshness: { state: 'current', validUntil },
          commercialInfluence: { status: 'none', evidenceRefs: ['commercial:none'] },
        },
        steps: [
          { step: 1, business: { businessRef: 'business:north-star', name: 'North Star Services' }, after: [] },
          { step: 2, business: { businessRef: 'business:city-ledger', name: 'City Ledger' }, after: [1] },
        ],
      }],
      comparison: {
        kind: 'single', summary: 'One current way forward is available. This is not a comparison or recommendation.',
      },
      actions: {
        confirm: { kind: 'confirm_current_option', createsAuthority: true },
        change: { kind: 'revise_request', createsAuthority: false, preservesRequest: true },
        decline: { kind: 'leave_unconfirmed', createsAuthority: false, preservesRequest: true },
      },
      changes: { kind: 'initial' },
      nextBoundary: { kind: 'confirmation', authorityCreated: false },
    },
  }
}

function confirmedView(preview: CustomerRequestView): CustomerRequestView {
  const route = preview.decision?.routes[0]
  if (route === undefined) throw new Error('decision route missing')
  return {
    kind: 'request', requestRef: preview.requestRef, revision: preview.revision,
    routeGenerationRef: preview.routeGenerationRef, state: 'route_confirmed',
    summary: 'Your choice is confirmed. Nothing has started yet.', nextAction: 'inspect_confirmation',
    missingFields: [], options: [],
    confirmation: {
      confirmationRef: 'confirmation:decision', generationRef: preview.routeGenerationRef ?? '',
      requestRevision: preview.revision, confirmedAt: Date.now(), validUntil: route.validUntil, route,
    },
  }
}
