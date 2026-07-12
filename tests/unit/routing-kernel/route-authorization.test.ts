import { describe, expect, it, vi } from 'vitest'

import { authorizeRouteForPrincipal } from '@/modules/routing-kernel/authorization'
import type { AuthorizeInput } from '@/modules/routing-kernel/application'
import { canonicalAuthorityDigest, type RouteQuote } from '@/modules/routing-kernel/runtime'

const quoteDigest = canonicalAuthorityDigest({ quote: 1 })
const incidentEpochDigest = canonicalAuthorityDigest({ incidentEpochs: [] })

describe('Route Authorization control', () => {
  it('intersects the human ceiling and expiry with the immutable quote instead of widening authority', async () => {
    const issue = vi.fn(async (input: AuthorizeInput) => ({
      authorizationRef: 'route-authorization:1',
      budgetAuthorityRef: input.budgetAuthorityRef ?? 'budget-authority:test',
      budgetMaximumGrossMinor: input.budgetMaximumGrossMinor ?? input.maximumSpendMinor,
      ...input,
      dataAuthorizationBudgetRef: input.dataAuthorizationBudgetRef ?? 'data-budget:test',
      protectedFieldSetId: input.protectedFieldSetId ?? 'field-set:test:v1',
      dataBudgetMaximumAttempts: input.dataBudgetMaximumAttempts ?? 1,
      dataBudgetMaximumExposures: input.dataBudgetMaximumExposures ?? 1,
      allowedRecipientBindingIds: input.allowedRecipientBindingIds ?? ['binding:primary:v1'],
      allowedDisclosurePurposes: input.allowedDisclosurePurposes ?? ['capability:parcel-label-purchase:v1'],
      maximumDisclosureAttempts: input.maximumDisclosureAttempts ?? 1,
      maximumDisclosureExposures: input.maximumDisclosureExposures ?? 1,
      allowedDataFields: input.allowedDataFields ?? [],
      incidentEpochDigest: input.incidentEpochDigest ?? canonicalAuthorityDigest({ incidentEpochs: [] }),
    }))
    const result = await authorizeRouteForPrincipal({
      principalId: 'principal:merchant-1',
      agentId: 'agent:http-1',
      budgetAuthorityRef: 'budget-authority:principal:merchant-1:AUD:provider-cost-v1',
      budgetMaximumGrossMinor: 9_999,
      quoteId: 'quote:1',
      quoteDigest,
      maximumSpendMinor: 9_999,
      currency: 'AUD',
      expiresAt: 1_750_000_999_999,
      now: 1_750_000_000_000,
    }, {
      getQuote: async () => quote(),
      issue,
    })

    expect(result).toEqual({
      kind: 'authorized',
      authorization: {
        authorizationRef: 'route-authorization:1',
        budgetAuthorityRef: 'budget-authority:principal:merchant-1:AUD:provider-cost-v1',
        budgetMaximumGrossMinor: 9_999,
        dataAuthorizationBudgetRef: 'data-budget:principal:merchant-1:default',
        protectedFieldSetId: 'field-set:kernel-input:v1',
        dataBudgetMaximumAttempts: 0,
        dataBudgetMaximumExposures: 0,
        allowedRecipientBindingIds: [],
        allowedDisclosurePurposes: [],
        maximumDisclosureAttempts: 0,
        maximumDisclosureExposures: 0,
        quoteId: 'quote:1',
        quoteDigest,
        principalId: 'principal:merchant-1',
        agentId: 'agent:http-1',
        allowedDataFields: [],
        maximumSpendMinor: 1_145,
        currency: 'AUD',
        expiresAt: 1_750_000_060_000,
        incidentEpochDigest,
      },
    })
    expect(issue).toHaveBeenCalledWith({
      quoteId: 'quote:1',
      quoteDigest,
      principalId: 'principal:merchant-1',
      agentId: 'agent:http-1',
      budgetAuthorityRef: 'budget-authority:principal:merchant-1:AUD:provider-cost-v1',
      budgetMaximumGrossMinor: 9_999,
      dataAuthorizationBudgetRef: 'data-budget:principal:merchant-1:default',
      protectedFieldSetId: 'field-set:kernel-input:v1',
      dataBudgetMaximumAttempts: 0,
      dataBudgetMaximumExposures: 0,
      allowedRecipientBindingIds: [],
      allowedDisclosurePurposes: [],
      maximumDisclosureAttempts: 0,
      maximumDisclosureExposures: 0,
      maximumSpendMinor: 1_145,
      currency: 'AUD',
      expiresAt: 1_750_000_060_000,
      allowedDataFields: [],
      incidentEpochDigest,
    })
  })

  it('refuses a different Principal or Agent without issuing authority', async () => {
    const issue = vi.fn()
    const result = await authorizeRouteForPrincipal({
      principalId: 'principal:attacker',
      agentId: 'agent:http-1',
      quoteId: 'quote:1',
      quoteDigest,
      maximumSpendMinor: 1_145,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
      now: 1_750_000_000_000,
    }, {
      getQuote: async () => quote(),
      issue,
    })

    expect(result).toEqual({ kind: 'authorization_refused', reason: 'quote_caller_mismatch' })
    expect(issue).not.toHaveBeenCalled()
  })

  it('refuses data authority that the immutable selected graph did not declare', async () => {
    const issue = vi.fn()
    const result = await authorizeRouteForPrincipal({
      principalId: 'principal:merchant-1',
      agentId: 'agent:http-1',
      quoteId: 'quote:1',
      quoteDigest,
      maximumSpendMinor: 1_145,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
      allowedDataFields: ['payment_card_number'],
      now: 1_750_000_000_000,
    }, {
      getQuote: async () => quote(),
      issue,
    })

    expect(result).toEqual({ kind: 'authorization_refused', reason: 'data_field_not_declared' })
    expect(issue).not.toHaveBeenCalled()
  })

  it('refuses a legacy non-cryptographic quote digest before issuing authority', async () => {
    const issue = vi.fn()
    await expect(authorizeRouteForPrincipal({
      principalId: 'principal:merchant-1', agentId: 'agent:http-1', quoteId: 'quote:1', quoteDigest: 'hash:legacy',
      maximumSpendMinor: 1_145, currency: 'AUD', expiresAt: 1_750_000_030_000, now: 1_750_000_000_000,
    }, { getQuote: async () => ({ ...quote(), quoteDigest: 'hash:legacy' }), issue })).resolves.toEqual({
      kind: 'authorization_refused', reason: 'quote_digest_invalid',
    })
    expect(issue).not.toHaveBeenCalled()
  })
})

function quote(): RouteQuote {
  return {
    quoteId: 'quote:1',
    quoteDigest,
    routingRequestId: 'routing-request:1',
    networkId: 'network:au-first',
    executionMode: 'simulation',
    caller: { agentId: 'agent:http-1', principalId: 'principal:merchant-1' },
    query: 'Purchase one parcel label.',
    routingSnapshot: {
      compilerVersion: 'routing-compiler:v2', optimizerVersion: 'organic-cost-latency-evidence:v2',
      networkPolicyVersion: 'network-policy:binding-evidence:v2', networkId: 'network:au-first',
      caller: { agentId: 'agent:http-1', principalId: 'principal:merchant-1' }, normalizedQuery: 'purchase one parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_145, optimizeFor: 'cost' },
      eligibleBindingIds: ['binding:parcel-sim-economy:v1'], relevantBindingIds: ['binding:parcel-sim-economy:v1'],
      bindingEvidence: [{ bindingId: 'binding:parcel-sim-economy:v1', disposition: 'legacy_unbound', healthState: 'unknown', incidentRoutingEffect: 'none', executionReliabilityStatus: 'insufficient_evidence' }],
    },
    organicDecision: {
      optimizerVersion: 'organic-cost-latency-evidence:v2', optimizeFor: 'cost', selectedBindingId: 'binding:parcel-sim-economy:v1',
      factors: [{ bindingId: 'binding:parcel-sim-economy:v1', feasible: true, expectedCostMinor: 1_145, maximumCostMinor: 1_145, expectedLatencyMs: 2_000, evidence: { bindingId: 'binding:parcel-sim-economy:v1', disposition: 'legacy_unbound', healthState: 'unknown', incidentRoutingEffect: 'none', executionReliabilityStatus: 'insufficient_evidence' } }],
    },
    createdAt: 1_750_000_000_000,
    expiresAt: 1_750_000_060_000,
    selectedGraph: {
      bindingId: 'binding:parcel-sim-economy:v1',
      nodeId: 'node:registered-business-economy',
      capabilityContractId: 'capability:parcel-label-purchase:v1',
      expectedCost: { currency: 'AUD', amountMinor: 1_145 },
      maximumCost: { currency: 'AUD', amountMinor: 1_145 },
      expectedLatencyMs: 2_000,
      dataFields: ['recipient_address'],
      disclosures: ['Recipient address is released to the selected shipping provider.'],
      steps: [{
        role: 'primary',
        bindingId: 'binding:parcel-sim-economy:v1',
        nodeId: 'node:registered-business-economy',
        capabilityContractId: 'capability:parcel-label-purchase:v1',
        expectedCost: { currency: 'AUD', amountMinor: 1_145 },
        maximumCost: { currency: 'AUD', amountMinor: 1_145 },
        expectedLatencyMs: 2_000,
        dataFields: ['recipient_address'],
        disclosures: ['Recipient address is released to the selected shipping provider.'],
      }],
    },
    alternatives: [],
    effects: ['purchase_label'],
    disclosures: ['Recipient address is released to the selected shipping provider.'],
    enforcement: 'required',
    incidentEpochDigest,
  }
}
