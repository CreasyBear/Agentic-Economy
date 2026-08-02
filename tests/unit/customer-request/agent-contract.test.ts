import { describe, expect, it } from 'vitest'

import {
  customerRequestFactInputSchema,
  customerRequestMessageInputSchema,
  customerRequestViewSchema,
  workTreeScopeAllowedForMode,
} from '@/modules/customer-request/agent-contract'
import { projectRequestEvaluation } from '@/modules/customer-request/customer-projection'
import { projectCustomerRequestAgentNavigation } from '@/modules/customer-request/agent-navigation'

describe('Customer Request agent contract', () => {
  it('allows inspect-only agents to inspect WorkTree repeat uses without granting repeat writes', () => {
    expect(workTreeScopeAllowedForMode('work_trees:inspect', 'inspect_only')).toBe(true)
    expect(workTreeScopeAllowedForMode('work_trees:repeat_inspect', 'inspect_only')).toBe(true)
    expect(workTreeScopeAllowedForMode('work_trees:repeat_reserve', 'inspect_only')).toBe(false)
    expect(workTreeScopeAllowedForMode('work_trees:repeat_finalize', 'inspect_only')).toBe(false)
    expect(workTreeScopeAllowedForMode('work_trees:repeat_reconcile', 'inspect_only')).toBe(false)
  })
  it('requires an exact source-owned replacement target for append supersession only', () => {
    expect(customerRequestMessageInputSchema.parse({
      idempotencyKey: 'amend:one',
      expectedRevision: 1,
      message: 'Arrival before 09:00 is now immovable.',
      replacesPriorStatement: 'Arrival before 08:00 is immovable.',
    })).toMatchObject({
      mode: 'append',
      replacesPriorStatement: 'Arrival before 08:00 is immovable.',
    })
    expect(customerRequestMessageInputSchema.safeParse({
      idempotencyKey: 'replace:one',
      expectedRevision: 1,
      message: 'A complete replacement Request.',
      mode: 'replace',
      replacesPriorStatement: 'An old statement.',
    }).success).toBe(false)
    expect(customerRequestMessageInputSchema.parse({
      idempotencyKey: 'report:one',
      expectedRevision: 2,
      message: 'This exact option cannot meet the deadline.',
      reportedRouteRef: 'choice:generation%3Atwo:route%3Aone',
    })).toMatchObject({
      mode: 'append',
      reportedRouteRef: 'choice:generation%3Atwo:route%3Aone',
    })
    expect(customerRequestMessageInputSchema.safeParse({
      idempotencyKey: 'replace:route',
      expectedRevision: 2,
      message: 'A complete replacement Request.',
      mode: 'replace',
      reportedRouteRef: 'choice:generation%3Atwo:route%3Aone',
    }).success).toBe(false)
  })

  it('owns the exact typed-fact wire shape used by the handler and external agent', () => {
    expect(customerRequestFactInputSchema.parse({
      idempotencyKey: 'fact:one', expectedRevision: 1,
      requirementKey: 'sandbox.reference.lookup:request_context', value: 'Compare sandbox options',
    })).toMatchObject({ requirementKey: 'sandbox.reference.lookup:request_context' })

    expect(customerRequestFactInputSchema.safeParse({
      idempotencyKey: 'fact:one', expectedRevision: 1,
      facts: { requestContext: 'Compare sandbox options' },
    }).success).toBe(false)
  })

  it('tells human and agent callers how every understood fact affects the choice', () => {
    const view = projectRequestEvaluation({
      snapshot: { requestId: 'request:understanding', revision: 1, intent: 'Find a nearby option' },
      evaluation: {
        posture: 'progress_available',
        criteria: [{ label: 'Area', value: 'Fremantle', basis: 'extracted_from_request' }],
      },
    })

    expect(view.criteria).toEqual([{
      label: 'Area', value: 'Fremantle', basis: 'extracted_from_request',
      impact: 'eligibility_and_comparison',
    }])
    expect(customerRequestViewSchema.parse(view).criteria).toEqual(view.criteria)
  })

  it('gives human and agent callers the same exact unsupported-request data disposition', () => {
    const view = projectRequestEvaluation({
      snapshot: {
        requestId: 'request:unsupported-private-context',
        revision: 1,
        intent: 'Find an option using private medical context.',
      },
      evaluation: { posture: 'unsupported', criteria: [] },
      outcome: 'unsupported',
      actionCount: 0,
    })

    expect(customerRequestViewSchema.parse(view).dataHandling).toEqual({
      requestStorage: 'saved_for_revision',
      businessSharing: 'not_shared',
      explanation: 'AE saved this revision so you can change it. No information from this revision was sent to a business.',
    })
    expect(customerRequestViewSchema.parse(view).unsupportedRecovery).toEqual({
      reason: 'requested_result_not_available',
      preservedRequest: true,
      authorityCreatedForThisRevision: false,
      businessContactedForThisRevision: false,
      nextStep: {
        kind: 'change_request',
        summary: 'Change the outcome you want while keeping this Request and its history.',
      },
    })
    expect(projectCustomerRequestAgentNavigation(view).actions).toEqual([{
      relation: 'change_request',
      method: 'POST',
      href: '/api/v1/requests/request%3Aunsupported-private-context/messages',
      summary: 'Change the outcome you want while keeping this Request and its history.',
      input: {
        idempotencyKey: '<unique string>',
        expectedRevision: 1,
        message: '<natural-language change>',
      },
    }])
  })

  it('accepts a truthful durable-state restoration receipt on a resumed Request', () => {
    const resumed = customerRequestViewSchema.parse({
      kind: 'request',
      requestRef: 'request:restored',
      revision: 3,
      state: 'ready_to_compare',
      summary: 'Compare suitable options',
      nextAction: 'prepare_options',
      missingFields: [],
      options: [],
      recovery: {
        state: 'restored',
        reason: 'choice_expired',
        restoredAt: 4_000,
        workRestarted: false,
      },
    })

    expect(resumed.recovery).toEqual({
      state: 'restored',
      reason: 'choice_expired',
      restoredAt: 4_000,
      workRestarted: false,
    })
  })

  it('validates the customer-semantic prepared decision and every terminal recovery state', () => {
    const prepared = {
      kind: 'request', requestRef: 'request:sandbox', revision: 2,
      state: 'options_ready', summary: 'Sandbox Option Two can provide Sandbox reference lookup.',
      nextAction: 'inspect_options', missingFields: [], criteria: [], options: [],
      preparedAction: {
        actionRef: 'prepared-action:v2:opaque', businessName: 'Sandbox Option Two',
        offeringLabel: 'Sandbox Option Two', summary: 'Labelled sandbox supply.',
        price: { currency: 'AUD', minimumAmountMinor: 900, maximumAmountMinor: 900 },
        materialTerms: [{ label: 'Environment', value: 'Sandbox only; not real supply.' }],
        cancellation: { kind: 'unsupported' }, validUntil: 10_000,
        selection: {
          basis: 'lowest_maximum_price', alternativeCount: 1, unavailableCount: 0,
          commercialInfluence: 'none',
        },
        dataUse: {
          categories: [{ label: 'Request details', classification: 'public' }],
          purposes: ['return_sandbox_result'],
        },
        effects: [{ class: 'data_release', reversibility: 'irreversible' }],
        alternatives: [{
          businessName: 'Sandbox Option One',
          price: { currency: 'AUD', minimumAmountMinor: 1_200, maximumAmountMinor: 1_200 },
          validUntil: 10_000,
        }],
      },
    }

    expect(customerRequestViewSchema.parse(prepared).preparedAction?.businessName).toBe('Sandbox Option Two')
    for (const [state, actionState, resolution] of [
      ['outcome_unknown', 'unknown', 'awaiting_evidence'],
      ['completed', 'completed', 'provider_result'],
      ['failed', 'failed', 'reconciled'],
      ['failed', 'failed', 'not_sent'],
    ] as const) {
      expect(customerRequestViewSchema.safeParse({
        ...prepared, state, nextAction: state === 'outcome_unknown' ? 'wait' : 'none',
        preparedAction: undefined,
        businesses: [
          { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
          { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
        ],
        action: { state: actionState, resolution, automaticRetry: false, observedAt: 10_000 },
      }).success).toBe(true)
    }
  })

  it('rejects an empty routes-ready shell', () => {
    const shell = {
      kind: 'request', requestRef: 'request:route', revision: 2,
      routeGenerationRef: 'generation:two', state: 'routes_ready',
      summary: 'Ways forward are available.', nextAction: 'inspect_routes',
      missingFields: [], criteria: [], options: [],
    }
    expect(customerRequestViewSchema.safeParse(shell).success).toBe(false)
  })
})
