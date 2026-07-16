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
  await expect(page.getByRole('heading', { name: 'What confirming means' })).toBeVisible()
  await expect(page.getByText('Confirming gives AE permission for this exact choice and maximum cost. It does not start work or share information yet.')).toBeVisible()
  await expect(page.getByText('Starting uses that confirmation to contact the listed businesses and begin the work.')).toBeVisible()
  await expect(page.getByText('What starting could change')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change this Request' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Decline this choice' })).toBeVisible()
  expect(confirmations).toBe(0)

  await page.getByRole('button', { name: 'Decline this choice' }).click()
  await expect(page.getByRole('button', { name: 'Review Prepare a governed result' })).toBeVisible()
  expect(confirmations).toBe(0)

  await page.getByRole('button', { name: 'Review Prepare a governed result' }).click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()
  await expect(page.getByText('Choice confirmed')).toBeVisible()
  await expect(page.getByText('Confirmation code confirmation:decision')).toBeVisible()
  expect(confirmations).toBe(1)
})

test('recommendation explains price evidence and keeps non-ranking commercial influence visible', async ({ page }) => {
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: recommendedDecisionView() }))

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Choose the lowest maximum cost')
  await page.getByRole('button', { name: 'Explore' }).click()

  await expect(page.getByText('One way forward best matches the price priority in this Request.')).toBeVisible()
  await expect(page.getByText('Lowest maximum cost: AUD 14.00.')).toBeVisible()
  await expect(page.getByText('AUD 3.00 below the next current way forward.')).toBeVisible()
  await expect(page.getByText(
    'Commercial relationships did not change eligibility, inclusion, or order.',
  )).toBeVisible()
  await expect(page.getByText('AE may receive a fixed referral fee.').first()).toBeVisible()
  await expect(page.getByText('Recommended for your stated priority')).toBeVisible()
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
  await expect(page.getByPlaceholder('Add a detail…')).toBeVisible()
  await page.getByRole('textbox', { name: 'Which area should the business cover?' })
    .fill('Fremantle and nearby suburbs would work.')
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

test('partial progress remains legible when a later business result is unknown', async ({ page }) => {
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: unknownOutcomeView() }))

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Resolve a service and prepare its quote')
  await page.getByRole('button', { name: 'Explore' }).click()

  await expect(page.getByText('Still confirming', { exact: true })).toBeVisible()
  await expect(page.getByText('1 of 2 business steps completed.')).toBeVisible()
  await expect(page.getByText('AE will not repeat the step whose result is still being confirmed.')).toBeVisible()
  await expect(page.getByText('Wait for confirmation before changing or starting this Request again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit this Request' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Start a new Request' })).not.toBeVisible()
})

test('a too-late stop request remains legible without offering cancellation again', async ({ page }) => {
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: {
    kind: 'request', requestRef: 'request:too-late-to-stop', revision: 1,
    state: 'in_progress', summary: 'Your request is in progress.', nextAction: 'wait',
    missingFields: [], criteria: [], options: [],
    progress: { completed: 0, total: 1, current: { step: 1, state: 'contacting' } },
    activity: {
      actor: 'ae', certainty: 'pending', updatedAt: 20_100, nextCheckAt: 50_100,
      retry: 'not_needed',
      cancellation: {
        state: 'not_available', reason: 'business_step_released',
        changedAt: 20_100, requestedAt: 20_200,
      },
      safeNextAction: 'check_progress',
    },
  } satisfies CustomerRequestView }))

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Stop the current business work')
  await page.getByRole('button', { name: 'Explore' }).click()

  await expect(page.getByText('You asked AE to stop, but the business step had already started.')).toBeVisible()
  await expect(page.getByText(/AE recorded your stop request at/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop before the next step' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Check progress' })).toBeVisible()
})

test('suspected duplicate-effect reporting binds selected step evidence and keeps sharing private by default', async ({ page }) => {
  let problemBody: unknown
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: unknownOutcomeView() }))
  await page.route('**/api/requests/*/evidence', async (route) => await route.fulfill({ json: {
    kind: 'evidence', requestRef: 'request:unknown', state: 'outcome_unknown', generatedAt: 20,
    steps: [
      { step: 1, state: 'completed', observedAt: 10, evidence: [{ receiptRef: 'evidence:first', label: 'First result evidence' }] },
      { step: 2, state: 'outcome_unknown', observedAt: 20, evidence: [{ receiptRef: 'evidence:second', label: 'Second result evidence' }] },
    ],
    problems: [],
  } }))
  await page.route('**/api/requests/*/problems', async (route) => {
    problemBody = route.request().postDataJSON()
    await route.fulfill({ json: {
      kind: 'problem_reported', requestRef: 'request:unknown', reportRef: 'problem:one',
      state: 'received', reportedAt: 21,
    } })
  })

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Recover an uncertain result')
  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: 'Report a problem' }).click()
  await expect(page.getByLabel('Which step is this about?')).toBeVisible()
  await page.getByLabel('Which step is this about?').selectOption('1')
  await page.getByLabel('First result evidence').check()
  await page.getByLabel('What kind of problem is this?').selectOption('duplicate_charge_or_effect')
  await page.getByLabel('What went wrong?').fill('I received two notifications and may have been charged or affected twice.')
  await expect(page.getByLabel('Who can see this report?')).toHaveValue('customer_and_ae_only')
  await page.getByRole('button', { name: 'Send problem report' }).click()

  await expect(page.getByText(/Problem recorded/)).toBeVisible()
  expect(problemBody).toMatchObject({
    category: 'duplicate_charge_or_effect',
    affectedStep: 1,
    evidenceReceiptRefs: ['evidence:first'],
    visibility: 'customer_and_ae_only',
  })
})

test('customer can answer an exact support question and hand the next update back to AE', async ({ page }) => {
  let replied = false
  let replyBody: unknown
  await page.route('**/api/requests', async (route) => await route.fulfill({ json: unknownOutcomeView() }))
  await page.route('**/api/requests/*/problems/*/replies', async (route) => {
    replyBody = route.request().postDataJSON()
    replied = true
    await route.fulfill({ json: {
      kind: 'problem_reply_recorded',
      reportRef: 'problem:one',
      version: 2,
      state: 'investigating',
      nextAction: 'await_status_update',
      nextActor: 'ae',
      nextUpdateDueAt: 86_407_000,
      decisionAuthority: 'not_assigned',
      recordedAt: 7_000,
    } })
  })
  await page.route('**/api/requests/*/evidence', async (route) => await route.fulfill({ json: {
    kind: 'evidence', requestRef: 'request:unknown', state: 'outcome_unknown', generatedAt: replied ? 7_000 : 6_000,
    steps: [
      { step: 1, state: 'completed', observedAt: 10, evidence: [] },
      { step: 2, state: 'outcome_unknown', observedAt: 20, evidence: [] },
    ],
    problems: [{
      reportRef: 'problem:one',
      version: replied ? 2 : 1,
      state: replied ? 'investigating' : 'waiting_for_customer',
      category: 'incorrect_result',
      summary: 'The first result does not match the confirmed constraint.',
      claimSource: 'customer',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      nextAction: replied ? 'await_status_update' : 'provide_information',
      nextActor: replied ? 'ae' : 'customer',
      ...(replied ? { nextUpdateDueAt: 86_407_000 } : {}),
      decisionAuthority: 'not_assigned',
      visibility: 'customer_and_ae_only',
      evidence: [],
      reportedAt: 5_000,
      affected: { step: 1, business: 'Journey Case Intake' },
      history: [
        {
          version: 0, state: 'received', source: 'customer',
          message: 'The first result does not match the confirmed constraint.', recordedAt: 5_000,
        },
        {
          version: 1, state: 'waiting_for_customer', source: 'ae_support',
          message: 'Please identify the constraint that the result did not meet.', recordedAt: 6_000,
        },
        ...(replied ? [{
          version: 2, state: 'investigating', source: 'customer',
          message: 'The result exceeded the maximum by 25 dollars.', recordedAt: 7_000,
        }] : []),
      ],
    }],
  } }))

  await page.goto('/engine')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('What are you looking for?').fill('Recover an uncertain result')
  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: 'View activity record' }).click()

  await expect(page.getByText('AE support: Please identify the constraint that the result did not meet.')).toBeVisible()
  await page.getByLabel('Your reply').fill('The result exceeded the maximum by 25 dollars.')
  await page.getByRole('button', { name: 'Send reply' }).click()

  await expect(page.getByText('You: The result exceeded the maximum by 25 dollars.')).toBeVisible()
  await expect(page.getByText(/AE owns the next status update/u)).toBeVisible()
  expect(replyBody).toMatchObject({
    expectedVersion: 1,
    message: 'The result exceeded the maximum by 25 dollars.',
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

function unknownOutcomeView(): CustomerRequestView {
  return {
    kind: 'request', requestRef: 'request:partial-unknown', revision: 1,
    state: 'outcome_unknown',
    summary: 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.',
    nextAction: 'wait', missingFields: [], options: [],
    progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
    action: {
      state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false, observedAt: 10,
    },
    activity: {
      actor: 'ae_for_customer', certainty: 'unknown', updatedAt: 10, nextCheckAt: 40,
      retry: 'blocked_until_reconciled', cancellation: 'too_late_or_unsupported',
      safeNextAction: 'wait_for_evidence',
    },
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
          duration: 'not_declared', recovery: 'reconcile_required', trust: 'registered_current_option',
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
        review: { kind: 'inspect_current_option', createsAuthority: false, startsWork: false, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
        confirm: { kind: 'confirm_current_option', createsAuthority: true, startsWork: false, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
        start: { kind: 'start_confirmed_option', availableAfter: 'confirmation', startsWork: true, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
        change: { kind: 'revise_request', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
        decline: { kind: 'leave_unconfirmed', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
      },
      changes: { kind: 'initial' },
      nextBoundary: { kind: 'confirmation', authorityCreated: false },
    },
  }
}

function recommendedDecisionView(): CustomerRequestView {
  const base = decisionView()
  const first = base.decision?.routes[0]
  if (first === undefined) throw new Error('recommendation fixture route missing')
  const recommended = {
    ...first,
    comparison: {
      ...first.comparison,
      commercialInfluence: {
        status: 'disclosed' as const,
        summaries: ['AE may receive a fixed referral fee.'],
        evidenceRefs: ['commercial:referral'],
        affectsDecision: false,
      },
    },
  }
  const other = {
    ...first,
    routeRef: 'route:other',
    quoteDigest: 'quote:other',
    businesses: [{ businessRef: 'business:other', name: 'Other Services' }],
    maximumTotalCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_700 },
    comparison: {
      ...first.comparison,
      maximumCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_700 },
    },
  }
  return {
    ...base,
    summary: 'Two ways forward are available.',
    decision: {
      ...base.decision!,
      outcome: { kind: 'routes_available', routeCount: 2, summary: 'Two ways forward are available.' },
      routes: [recommended, other],
      comparison: {
        kind: 'recommended',
        summary: 'One way forward best matches the price priority in this Request.',
        routeRef: recommended.routeRef,
        objective: 'lowest_maximum_price',
        evidenceRef: 'preference:lowest-price',
        commercialInfluence: 'disclosed',
        reasons: ['Lowest maximum cost: AUD 14.00.', 'AUD 3.00 below the next current way forward.'],
        tradeoffs: ['No other declared comparison dimension separates the two leading ways forward.'],
      },
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
