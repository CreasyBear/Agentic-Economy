import { describe, expect, it } from 'vitest'

import { projectCustomerRequest, projectNeedsAttention, projectOptionsReady, projectPreparingOptions, projectRequestEvaluation } from '@/modules/customer-request/customer-projection'

describe('customer request projection', () => {
  it('hides capability and protocol identifiers from a ready request', () => {
    const projection = projectCustomerRequest({
      kind: 'plan_ready', request: request(), understanding: request().understanding,
      planRevision: {
        planRevisionId: 'internal:plan:1', requestId: 'request:1', requestRevision: 1,
        proposedByAgentId: 'agent:1', proposalProvenance: { kind: 'direct_structured', proposalDigest: 'sha256:proposal' },
        completionEvidence: [{ actionId: 'internal:action:1', field: 'optionSummary', role: 'provider_offer' }],
        createdAt: 1, actions: [{ actionId: 'internal:action:1', capabilityContractId: 'internal:capability:v1', dependsOn: [], input: {} }],
      },
    })
    expect(projection).toEqual({
      kind: 'request', requestRef: 'request:1', revision: 1, state: 'ready_to_compare', summary: 'Find a suitable option',
      nextAction: 'prepare_options', missingFields: [], criteria: [], options: [],
    })
    expect(JSON.stringify(projection)).not.toContain('capability')
    expect(JSON.stringify(projection)).not.toContain('action:1')
  })

  it('uses the canonical customer states and strips provider recovery references from options', () => {
    const base = { requestRef: 'request:1', revision: 1, summary: 'Find an option' }
    expect(projectPreparingOptions(base)).toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
    expect(projectNeedsAttention(base)).toMatchObject({ state: 'needs_attention', nextAction: 'retry' })
    const options = projectOptionsReady({ ...base, candidateSet: {
      inspectionRef: 'internal:set', attempts: [{ business: { name: 'Provider' }, status: 'uncertain', explanation: 'internal' }],
      candidates: [{
        optionRef: 'option:1', business: { name: 'Provider' }, expectedCost: { currency: 'AUD', amountMinor: 100 },
        maximumCost: { currency: 'AUD', amountMinor: 100 }, expectedLatencyMs: 1, priceComponents: [], comparableOutputs: [],
        materialTerms: [], cancellation: { kind: 'unsupported', summary: 'No commitment.' }, expiresAt: 10, inspectionRef: 'internal:evidence',
      }],
    } })
    expect(options).toMatchObject({
      state: 'options_ready', nextAction: 'inspect_options', options: [{ optionRef: 'option:1' }],
      optionSet: {
        cardinality: 'single', optionCount: 1,
        ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
        coverage: { evaluated: 1, optionsReceived: 1, unavailable: 0, pending: 0, uncertain: 1 },
      },
    })
    expect(JSON.stringify(options)).not.toMatch(/internal:set|internal:evidence|attempts/)
    expect(projectOptionsReady({ ...base, candidateSet: {
      inspectionRef: 'internal:empty', attempts: [], candidates: [],
    } })).toMatchObject({
      state: 'no_options', nextAction: 'revise_request', options: [],
      optionSet: { cardinality: 'none', optionCount: 0, coverage: { evaluated: 0, uncertain: 0, pending: 0 } },
    })
    expect(projectOptionsReady({ ...base, candidateSet: {
      inspectionRef: 'internal:unresolved', candidates: [],
      attempts: [{ business: { name: 'Provider' }, status: 'uncertain', explanation: 'AE is still reconciling this response.' }],
    } })).toMatchObject({
      state: 'needs_attention', nextAction: 'retry',
      optionSet: { cardinality: 'none', coverage: { uncertain: 1 } },
    })

    const needsInformation = projectCustomerRequest({
      kind: 'needs_information', request: { ...request(), compilationState: 'needs_information' }, understanding: request().understanding,
      missingInformation: [{ field: 'destination', customerLabel: 'Destination', reason: 'required_for_registered_capability' }],
    })
    expect(needsInformation).toMatchObject({ state: 'needs_information', nextAction: 'provide_information' })
    const unsupported = projectCustomerRequest({ kind: 'unsupported', request: { ...request(), compilationState: 'unsupported' }, reason: 'no_registered_capability' })
    expect(unsupported).toMatchObject({ state: 'unsupported', nextAction: 'revise_request' })
    expect(new Set([
      'needs_information', 'needs_authorization', 'ready_to_compare', 'preparing_options',
      'options_ready', 'no_options', 'unsupported', 'needs_attention',
    ]).size).toBe(8)
  })

  it('shows protected preparation as a customer disclosure review without protocol fields', () => {
    const projection = projectRequestEvaluation({
      snapshot: { requestId: 'request:protected', revision: 1, intent: 'Send my parcel' },
      evaluation: {
        requestId: 'request:protected', requestRevision: 1, registrySnapshotDigest: 'registry:1',
        factsDigest: 'facts:1', facts: {}, criteria: [], candidates: [], posture: 'progress_available',
        preparationDisclosure: {
          purposeLabel: 'Compare parcel services', maximumRecipients: 2,
          categories: [{ field: 'origin_postcode', label: 'Origin postcode', classification: 'personal' }],
        },
        evaluationDigest: 'evaluation:1',
      },
    })
    expect(projection).toMatchObject({
      state: 'needs_authorization', nextAction: 'review_disclosure',
      disclosureReview: {
        purpose: 'Compare parcel services', maximumRecipients: 2,
        categories: [{ label: 'Origin postcode', classification: 'personal' }],
      },
    })
    expect(JSON.stringify(projection)).not.toContain('origin_postcode')
  })
})

function request() {
  return {
    requestId: 'request:1', principalId: 'principal:1', delegatedAgentId: 'agent:1', intent: 'Find a suitable option', revision: 1,
    compilationState: 'plan_ready' as const,
    understanding: { outcome: 'Find a suitable option', hardConstraints: [], preferences: [], substitutions: { allowed: false, boundaries: [] }, completionCriterion: 'An option is available', completionRequirement: { evidenceRole: 'provider_offer' as const, valueType: 'string' as const } },
    knownFacts: {}, routing: { networkId: 'ae:public', currency: 'AUD', maximumSpendMinor: 0, optimizeFor: 'cost' as const }, createdAt: 1,
  }
}
