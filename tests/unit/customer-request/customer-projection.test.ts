import { describe, expect, it } from 'vitest'

import { projectCustomerRequest } from '@/modules/customer-request/customer-projection'

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
      kind: 'request', requestRef: 'request:1', revision: 1, status: 'ready_to_compare', summary: 'Find a suitable option',
      nextAction: 'compare_options', missingFields: [], stepCount: 1,
    })
    expect(JSON.stringify(projection)).not.toContain('capability')
    expect(JSON.stringify(projection)).not.toContain('action:1')
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
