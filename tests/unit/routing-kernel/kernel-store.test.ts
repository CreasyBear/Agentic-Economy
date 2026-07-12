import { describe, expect, it } from 'vitest'

import { canonicalAuthorityDigest, createInMemoryKernelStore, createStepGrant, type RootRunSnapshot } from '@/modules/routing-kernel/public'

const quoteDigest = canonicalAuthorityDigest({ quote: 1 })
const requestDigest = canonicalAuthorityDigest({ request: 1 })
const incidentEpochDigest = canonicalAuthorityDigest({ incidentEpochs: [] })

describe('routing kernel step release authority', () => {
  it('claims each exact step grant once and refuses grant reuse across leaves', async () => {
    const store = createInMemoryKernelStore()
    await store.putQuote(quoteFixture())
    await store.putAuthorization({
      authorizationRef: 'authorization:1', quoteId: 'quote:1', quoteDigest,
      budgetAuthorityRef: 'budget:1', budgetMaximumGrossMinor: 125,
      dataAuthorizationBudgetRef: 'data-budget:1', protectedFieldSetId: 'field-set:test:v1',
      dataBudgetMaximumAttempts: 0, dataBudgetMaximumExposures: 0,
      allowedRecipientBindingIds: [], allowedDisclosurePurposes: [], maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0,
      principalId: 'principal:1', agentId: 'agent:1', maximumSpendMinor: 125,
      currency: 'AUD', expiresAt: 2_000, allowedDataFields: [],
      incidentEpochDigest,
    })
    await store.claimExecution({
      executionScope: 'scope:1', rootRunId: 'root:1', authorizationRef: 'authorization:1',
      consumedAt: 1_000, caller: { principalId: 'principal:1', agentId: 'agent:1' },
      requestDigest, run: runCheckpoint('pending', 'not_released'),
    })

    const primary = {
      grant: exactGrant(),
      releasedAt: 1_001, run: runCheckpoint('released', 'released'),
    }
    expect(await store.authorizeProviderRelease(primary)).toBe('released')
    expect(await store.authorizeProviderRelease(primary)).toBe('already_released')
    expect(await store.authorizeProviderRelease({
      ...primary,
      grant: { ...primary.grant, requestDigest: 'request:mutated' },
    })).toBe('release_conflict')
    expect(await store.authorizeProviderRelease({
      ...primary, grant: { ...primary.grant, leafRunId: 'leaf:fallback', bindingId: 'binding:fallback' },
    })).toBe('release_conflict')
    expect(await store.authorizeProviderRelease({
      grant: createStepGrant({
        ...exactGrant(), stepGrantId: 'step-grant:fallback', leafRunId: 'leaf:fallback', bindingId: 'binding:fallback',
      }),
      releasedAt: 1_002, run: {
        ...runCheckpoint('released', 'released'),
        leaves: [{ ...runCheckpoint('released', 'released').leaves[0]!, leafRunId: 'leaf:fallback', stepGrantId: 'step-grant:fallback', bindingId: 'binding:fallback' }],
      },
    })).toBe('released')
    expect(await store.requestCancellation('root:1', { principalId: 'principal:1', agentId: 'agent:1' }, 1_003)).toBe('not_possible')
  })

  it('refuses expired or quote-inconsistent step grants before provider release', async () => {
    const store = createInMemoryKernelStore()
    await store.putQuote(quoteFixture())
    await store.putAuthorization({
      authorizationRef: 'authorization:1', quoteId: 'quote:1', quoteDigest,
      budgetAuthorityRef: 'budget:1', budgetMaximumGrossMinor: 125,
      dataAuthorizationBudgetRef: 'data-budget:1', protectedFieldSetId: 'field-set:test:v1',
      dataBudgetMaximumAttempts: 0, dataBudgetMaximumExposures: 0,
      allowedRecipientBindingIds: [], allowedDisclosurePurposes: [], maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0,
      principalId: 'principal:1', agentId: 'agent:1', maximumSpendMinor: 125,
      currency: 'AUD', expiresAt: 2_000, allowedDataFields: [],
      incidentEpochDigest,
    })
    await store.claimExecution({
      executionScope: 'scope:1', rootRunId: 'root:1', authorizationRef: 'authorization:1',
      consumedAt: 1_000, caller: { principalId: 'principal:1', agentId: 'agent:1' },
      requestDigest, run: runCheckpoint('pending', 'not_released'),
    })
    const released = runCheckpoint('released', 'released')

    expect(await store.authorizeProviderRelease({
      grant: createStepGrant({ ...exactGrant(), expiresAt: 1_000 }), releasedAt: 1_001, run: released,
    })).toBe('release_conflict')
    expect(await store.authorizeProviderRelease({
      grant: createStepGrant({ ...exactGrant(), maximumCost: { currency: 'AUD', amountMinor: 124 } }), releasedAt: 1_001, run: released,
    })).toBe('release_conflict')
  })
})

function exactGrant() {
  return createStepGrant({
    stepGrantId: 'step-grant:primary', rootRunId: 'root:1', leafRunId: 'leaf:primary',
    quoteId: 'quote:1', quoteDigest, requestDigest,
    bindingId: 'binding:primary', nodeId: 'node:primary', capabilityContractId: 'capability:1',
    maximumCost: { currency: 'AUD', amountMinor: 125 }, disclosedDataFields: [], attempt: 1,
    issuedAt: 1_000, expiresAt: 2_000, enforcementPoint: 'provider_release' as const,
    incidentEpochDigest,
  })
}

function quoteFixture() {
  const primary = {
    role: 'primary' as const, bindingId: 'binding:primary', nodeId: 'node:primary', capabilityContractId: 'capability:1',
    expectedCost: { currency: 'AUD', amountMinor: 125 }, maximumCost: { currency: 'AUD', amountMinor: 125 },
    expectedLatencyMs: 100, dataFields: [], disclosures: [],
  }
  const fallback = { ...primary, role: 'fallback' as const, trigger: 'on_effect_not_committed' as const, bindingId: 'binding:fallback' }
  return {
    quoteId: 'quote:1', quoteDigest, routingRequestId: 'routing:1', networkId: 'network:1', executionMode: 'simulation' as const,
    caller: { principalId: 'principal:1', agentId: 'agent:1' }, query: 'test', createdAt: 900, expiresAt: 2_000,
    routingSnapshot: {
      compilerVersion: 'routing-compiler:v2' as const, optimizerVersion: 'organic-cost-latency-evidence:v2' as const,
      networkPolicyVersion: 'network-policy:binding-evidence:v2' as const, networkId: 'network:1',
      caller: { principalId: 'principal:1', agentId: 'agent:1' }, normalizedQuery: 'test',
      constraints: { currency: 'AUD', maximumSpendMinor: 125, optimizeFor: 'cost' as const },
      eligibleBindingIds: ['binding:primary', 'binding:fallback'], relevantBindingIds: ['binding:primary', 'binding:fallback'],
      bindingEvidence: ['binding:fallback', 'binding:primary'].map((bindingId) => ({ bindingId, disposition: 'legacy_unbound' as const, healthState: 'unknown' as const, incidentRoutingEffect: 'none' as const, executionReliabilityStatus: 'insufficient_evidence' as const })),
    },
    organicDecision: {
      optimizerVersion: 'organic-cost-latency-evidence:v2' as const, optimizeFor: 'cost' as const, selectedBindingId: 'binding:primary',
      factors: [{ bindingId: 'binding:primary', feasible: true, expectedCostMinor: 125, maximumCostMinor: 125, expectedLatencyMs: 100, evidence: { bindingId: 'binding:primary', disposition: 'legacy_unbound' as const, healthState: 'unknown' as const, incidentRoutingEffect: 'none' as const, executionReliabilityStatus: 'insufficient_evidence' as const } }],
    },
    selectedGraph: { bindingId: primary.bindingId, nodeId: primary.nodeId, capabilityContractId: primary.capabilityContractId, expectedCost: primary.expectedCost, maximumCost: primary.maximumCost, expectedLatencyMs: 200, dataFields: [], disclosures: [], steps: [primary, fallback] },
    alternatives: [], effects: ['test'], disclosures: [], enforcement: 'required' as const, incidentEpochDigest,
  }
}

function runCheckpoint(
  state: RootRunSnapshot['leaves'][number]['state'],
  attemptDisposition: RootRunSnapshot['leaves'][number]['attemptDisposition'],
): RootRunSnapshot {
  const released = state === 'released'
  return {
    rootRunId: 'root:1', quoteId: 'quote:1', quoteDigest, incidentEpochDigest, networkId: 'network:1',
    executionMode: 'simulation', caller: { principalId: 'principal:1', agentId: 'agent:1' },
    state: 'running', enforcement: 'enforced', effectState: released ? 'released' : 'not_started',
    cost: { authorized: { currency: 'AUD', amountMinor: 125 }, quotedMaximum: { currency: 'AUD', amountMinor: 125 }, reserved: null, providerReported: null, settled: null },
    leaves: [{
      leafRunId: 'leaf:primary', stepGrantId: 'step-grant:primary', bindingId: 'binding:primary',
      nodeId: 'node:primary', capabilityContractId: 'capability:1', state, attemptDisposition,
      effectState: released ? 'released' : 'not_started', enforcement: 'enforced',
    }],
    records: [{ recordId: 'record:1', type: 'root_run_admitted', rootRunId: 'root:1', incidentEpochDigest, occurredAt: 1_000 }],
  }
}
