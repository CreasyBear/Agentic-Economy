import { describe, expect, it } from 'vitest'

import { createIncidentControlTestHarness } from '@/modules/routing-kernel/incident-control'
import { createNeutralRoutingKernel, type CapabilityBindingAdapter } from '@/modules/routing-kernel/public'

const caller = { agentId: 'agent:external', principalId: 'principal:merchant' }

describe('routing kernel incident control', () => {
  it('refuses to construct a live kernel without an incident-control evaluator', () => {
    expect(() => createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'live', ids: sequentialIds(),
      quoteTtlMs: 60_000, bindings: [parcelBinding(() => undefined)],
    })).toThrow('incident_control_required_for_live_execution')
  })

  it('invalidates stale authority before provider release and requires evidence-backed resume plus fresh authority', async () => {
    let now = 1_750_000_000_000
    let dispatched = 0
    const incidents = createIncidentControlTestHarness()
    const kernel = createNeutralRoutingKernel({
      now: () => now,
      executionMode: 'live',
      ids: sequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [parcelBinding(() => { dispatched += 1 })],
      incidentControl: incidents,
    })

    const firstQuote = await kernel.operations.route(routeInput())
    expect(firstQuote.kind).toBe('quoted')
    if (firstQuote.kind !== 'quoted') throw new Error(firstQuote.kind)
    const firstAuthorization = await kernel.authority.authorize(authorizationInput(firstQuote.quote))

    const freeze = await incidents.issueFreeze({
      incidentId: 'incident:credential-compromise',
      freezeOrderId: 'freeze:credential-compromise:1',
      issuerId: 'principal:incident-responder',
      reason: 'Provider credential may be compromised.',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
      blockedActions: ['route', 'authorize', 'root_admission', 'provider_release', 'data_release'],
      issuedAt: now + 1,
    })
    expect(freeze).toMatchObject({ kind: 'freeze_issued', epoch: 1 })

    const refused = await kernel.operations.execute({
      caller,
      quoteId: firstQuote.quote.quoteId,
      quoteDigest: firstQuote.quote.quoteDigest,
      authorizationRef: firstAuthorization.authorizationRef,
      idempotencyKey: 'execute:parcel:1',
    })
    expect(refused).toEqual({ kind: 'execution_refused', reason: 'incident_frozen' })
    expect(dispatched).toBe(0)

    await expect(incidents.issueResume({
      resumeOrderId: 'resume:credential-compromise:1',
      freezeOrderId: 'freeze:credential-compromise:1',
      approverIds: ['principal:incident-responder'],
      evidenceRefs: ['evidence:credential-rotated'],
      issuedAt: now + 2,
    })).resolves.toEqual({ kind: 'resume_refused', reason: 'independent_approval_required' })

    const resumed = await incidents.issueResume({
      resumeOrderId: 'resume:credential-compromise:2',
      freezeOrderId: 'freeze:credential-compromise:1',
      approverIds: ['principal:incident-responder', 'principal:independent-approver'],
      evidenceRefs: ['evidence:credential-rotated', 'evidence:conformance-rerun'],
      issuedAt: now + 3,
    })
    expect(resumed).toMatchObject({ kind: 'resume_issued', epoch: 2 })

    const staleAfterResume = await kernel.operations.execute({
      caller,
      quoteId: firstQuote.quote.quoteId,
      quoteDigest: firstQuote.quote.quoteDigest,
      authorizationRef: firstAuthorization.authorizationRef,
      idempotencyKey: 'execute:parcel:2',
    })
    expect(staleAfterResume).toEqual({ kind: 'execution_refused', reason: 'incident_epoch_stale' })

    now += 10
    const freshQuote = await kernel.operations.route(routeInput())
    expect(freshQuote.kind).toBe('quoted')
    if (freshQuote.kind !== 'quoted') throw new Error(freshQuote.kind)
    const freshAuthorization = await kernel.authority.authorize(authorizationInput(freshQuote.quote))
    const executed = await kernel.operations.execute({
      caller,
      quoteId: freshQuote.quote.quoteId,
      quoteDigest: freshQuote.quote.quoteDigest,
      authorizationRef: freshAuthorization.authorizationRef,
      idempotencyKey: 'execute:parcel:3',
    })
    expect(executed.kind).toBe('run_admitted')
    expect(dispatched).toBe(1)
  })

  it('records an admitted run as incident-frozen when containment lands before provider release', async () => {
    const incidents = createIncidentControlTestHarness()
    let dispatched = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'live',
      ids: sequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [parcelBinding(() => { dispatched += 1 })],
      incidentControl: incidents,
      lifecycle: {
        afterRootAdmission: async () => {
          await incidents.issueFreeze({
            incidentId: 'incident:egress', freezeOrderId: 'freeze:egress:1',
            issuerId: 'principal:incident-responder', reason: 'Stop provider egress.',
            scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
            blockedActions: ['provider_release'], issuedAt: 1_750_000_000_001,
          })
        },
      },
    })
    const routed = await kernel.operations.route(routeInput())
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize(authorizationInput(routed.quote))

    const executed = await kernel.operations.execute({
      caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef, idempotencyKey: 'execute:freeze-before-egress',
    })

    expect(executed).toMatchObject({
      kind: 'run_admitted',
      run: {
        state: 'incident_frozen', effectState: 'not_started',
        leaves: [{ state: 'incident_frozen', attemptDisposition: 'not_released', effectState: 'not_started' }],
        records: expect.arrayContaining([
          expect.objectContaining({
            type: 'incident_freeze_observed', incidentId: 'incident:egress', freezeOrderId: 'freeze:egress:1',
          }),
        ]),
      },
    })
    expect(dispatched).toBe(0)
  })

  it('releases exactly one simulation canary step through explicit recovery authority', async () => {
    const incidents = createIncidentControlTestHarness()
    await incidents.issueFreeze({
      incidentId: 'incident:canary', freezeOrderId: 'freeze:canary:1', issuerId: 'principal:incident-responder',
      reason: 'Validate the repaired provider pathway.',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
      blockedActions: ['provider_release'], issuedAt: 1_750_000_000_000,
    })
    let dispatched = 0
    const usedOperations = new Set<string>()
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: sequentialIds(),
      quoteTtlMs: 60_000, bindings: [parcelBinding(() => { dispatched += 1 })],
      incidentControl: {
        evaluate: incidents.evaluate,
        claimRecovery: async (request) => {
          if (request.lane !== 'canary' || request.recoveryGrantId !== 'recovery:canary:1'
            || usedOperations.size >= 1 && !usedOperations.has(request.operationRef)) {
            return { kind: 'recovery_refused', reason: 'recovery_grant_exhausted' }
          }
          const replay = usedOperations.has(request.operationRef)
          usedOperations.add(request.operationRef)
          return { kind: 'recovery_authorized', replay }
        },
      },
    })
    const routed = await kernel.operations.route(routeInput())
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize(authorizationInput(routed.quote))
    const executed = await kernel.operations.execute({
      caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef, idempotencyKey: 'execute:incident-canary',
      executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:canary:1',
    })
    expect(executed).toMatchObject({
      kind: 'run_admitted', run: { state: 'completed', records: expect.arrayContaining([
        expect.objectContaining({
          type: 'incident_canary_recovery_consumed', recoveryGrantId: 'recovery:canary:1',
        }),
      ]) },
    })
    expect(dispatched).toBe(1)
    expect(usedOperations.size).toBe(1)
  })

  it('refuses canary authority when no matching freeze is active', async () => {
    let recoveryClaims = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: sequentialIds(),
      quoteTtlMs: 60_000, bindings: [parcelBinding(() => undefined)],
      incidentControl: {
        evaluate: async () => ({ kind: 'allowed', epochDigest: 'sha256:no-active-freeze' }),
        claimRecovery: async () => { recoveryClaims += 1; return { kind: 'recovery_authorized', replay: false } },
      },
    })
    const routed = await kernel.operations.route(routeInput())
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize(authorizationInput(routed.quote))
    await expect(kernel.operations.execute({
      caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef, idempotencyKey: 'execute:invalid-canary',
      executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:not-applicable',
    })).resolves.toEqual({ kind: 'execution_refused', reason: 'canary_active_freeze_required' })
    expect(recoveryClaims).toBe(0)
  })
})

function routeInput() {
  return {
    networkId: 'network:au', caller, query: 'Purchase one parcel label.',
    constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
  }
}

function authorizationInput(quote: { quoteId: string; quoteDigest: string }) {
  return {
    quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    principalId: caller.principalId, agentId: caller.agentId,
    maximumSpendMinor: 1_500, currency: 'AUD', expiresAt: 1_750_000_030_000,
  }
}

function parcelBinding(onExecute: () => void): CapabilityBindingAdapter {
  return {
    binding: {
      bindingId: 'binding:parcel:v1', nodeId: 'node:parcel', networkId: 'network:au',
      capabilityContractId: 'shipping.label.book:v1', operation: 'purchase_label',
      admission: 'admitted', conformance: 'conformant', queryTerms: ['parcel', 'label'],
    },
    quote: async () => ({
      kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 1_000 },
      maximumCost: { currency: 'AUD', amountMinor: 1_200 }, expectedLatencyMs: 100,
      dataFields: [], disclosures: [],
    }),
    execute: async () => {
      onExecute()
      return { kind: 'effect_committed', providerReference: 'label:1', outcome: { status: 'purchased' } }
    },
    reconcile: async () => ({ kind: 'reconciliation_pending' }),
  }
}

function sequentialIds() {
  let value = 0
  return { next: (prefix: string) => `${prefix}:${++value}` }
}
