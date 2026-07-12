import { describe, expect, it } from 'vitest'

import { discoverRequestEvaluationCandidates } from '@/modules/customer-request/evaluation'
import { createCapabilityContractRegistry } from '@/modules/customer-request/public'

describe('semantic candidate discovery', () => {
  it('uses kernel-validated capability ids rather than binding query terms', () => {
    const registry = createCapabilityContractRegistry([{
      capabilityContractId: 'parcel.rate:v1', name: 'Parcel rate', operation: 'quote',
      input: {}, output: {},
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
    }])

    const candidates = discoverRequestEvaluationCandidates({
      candidateCapabilityContractIds: ['parcel.rate:v1', 'invented:v1'],
      bindings: [{
        businessId: 'business:one', bindingId: 'binding:one', capabilityContractId: 'parcel.rate:v1',
        queryTerms: ['words that do not occur in the request'], registrationHash: 'sha256:one',
      }],
      resolveContract: (capabilityContractId) => registry.get(capabilityContractId),
    })

    expect(candidates.map((candidate) => candidate.bindingId)).toEqual(['binding:one'])
  })
})
