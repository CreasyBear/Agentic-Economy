import { describe, expect, it } from 'vitest'

import { evaluateCustomerRequestSnapshot } from '@/modules/customer-request/evaluation'

describe('customer Request evaluation', () => {
  it('selects the missing fact that unlocks the most registered options without creating a plan', () => {
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:parcel-rates',
      requestRevision: 1,
      intent: 'Compare ways to send this parcel',
      facts: {
        origin_postcode: { value: '6000', source: { kind: 'customer', assertionRef: 'assertion:origin' } },
        destination_postcode: { value: '2000', source: { kind: 'customer', assertionRef: 'assertion:destination' } },
      },
      registrySnapshotDigest: 'registry:snapshot:1',
      candidates: [
        candidate('sandbox-parcel-one', 'binding:parcel-one'),
        candidate('sandbox-parcel-two', 'binding:parcel-two'),
      ],
    })

    expect(evaluation).toMatchObject({
      requestId: 'request:parcel-rates',
      requestRevision: 1,
      posture: 'needs_information',
      nextRequirement: {
        field: 'weight_grams',
        customerLabel: 'Parcel weight',
        impact: {
          affectedCandidates: ['candidate:binding:parcel-one', 'candidate:binding:parcel-two'],
          probesEnabled: ['candidate:binding:parcel-one', 'candidate:binding:parcel-two'],
        },
      },
      criteria: [
        { label: 'Destination postcode', value: '2000', basis: 'customer_provided' },
        { label: 'Origin postcode', value: '6000', basis: 'customer_provided' },
      ],
      candidates: [
        { candidateRef: 'candidate:binding:parcel-one', viability: { kind: 'blocked_on_information', fields: ['weight_grams'] } },
        { candidateRef: 'candidate:binding:parcel-two', viability: { kind: 'blocked_on_information', fields: ['weight_grams'] } },
      ],
    })
    expect(evaluation).not.toHaveProperty('planRevision')
    expect(evaluation).not.toHaveProperty('maximumSpendMinor')
  })

  it('describes protected preparation before any registered business receives data', () => {
    const baseCandidate = candidate('business:protected', 'binding:protected')
    const protectedCandidate = {
      ...baseCandidate,
      contract: {
        ...baseCandidate.contract,
        preparation: { purpose: 'parcel_comparison', customerLabel: 'Compare parcel services' },
        input: {
          ...baseCandidate.contract.input,
          origin_postcode: {
            ...baseCandidate.contract.input.origin_postcode,
            disclosure: {
              classification: 'personal' as const, phase: 'preparation' as const,
              recipient: 'candidate_provider' as const, purposes: ['parcel_comparison'],
            },
          },
        },
      },
    }
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:protected', requestRevision: 1, intent: 'Send my parcel',
      facts: {
        origin_postcode: { value: '6000', source: { kind: 'customer', assertionRef: 'assertion:origin' } },
        destination_postcode: { value: '2000', source: { kind: 'customer', assertionRef: 'assertion:destination' } },
        weight_grams: { value: '500', source: { kind: 'customer', assertionRef: 'assertion:weight' } },
      },
      registrySnapshotDigest: 'registry:protected', candidates: [protectedCandidate],
    })

    expect(evaluation.preparationDisclosure).toEqual({
      purposeLabel: 'Compare parcel services', maximumRecipients: 1,
      categories: [{ field: 'origin_postcode', label: 'Origin postcode', classification: 'personal' }],
    })
  })
})

function candidate(businessId: string, bindingId: string) {
  return {
    businessId,
    bindingId,
    contract: {
      capabilityContractId: 'parcel.rate:v1',
      name: 'Parcel rate',
      operation: 'quote' as const,
      input: {
        origin_postcode: field('Origin postcode'),
        destination_postcode: field('Destination postcode'),
        weight_grams: field('Parcel weight'),
      },
      output: {
        total_price: {
          ...field('Total price', false),
          valueType: 'money_minor' as const,
          evidenceRole: 'provider_offer' as const,
        },
      },
      consequence: {
        commitment: 'none' as const,
        spend: 'quoted' as const,
        reversibility: 'not_applicable' as const,
        approval: 'none' as const,
      },
    },
  }
}

function field(customerLabel: string, required = true) {
  return { customerLabel, required, valueType: 'string' as const, decisionRelevance: 'option_selection' as const }
}
