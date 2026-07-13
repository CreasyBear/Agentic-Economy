import { describe, expect, it } from 'vitest'

import { projectCustomerOptionSet } from '@/modules/customer-request/customer-option-set'
import type { PreparedRouteCandidateSet } from '@/modules/customer-request/preparation'

describe('customer option set', () => {
  it('distinguishes one option from a comparison and preserves provider provenance and coverage', () => {
    const result = projectCustomerOptionSet(candidateSet({
      candidates: [candidate('one', 1_200)],
      attempts: [
        attempt('One', 'option_received'),
        attempt('Two', 'unavailable'),
        attempt('Three', 'uncertain'),
      ],
    }))

    expect(result).toEqual({
      cardinality: 'single', optionCount: 1,
      ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
      coverage: {
        evaluated: 3, optionsReceived: 1, unavailable: 1, pending: 0, uncertain: 1,
        businesses: [
          { name: 'One', status: 'option_received', explanation: 'One returned an option.' },
          { name: 'Two', status: 'unavailable', explanation: 'Two was unavailable.' },
          { name: 'Three', status: 'uncertain', explanation: 'Three is uncertain.' },
        ],
      },
      options: [expect.objectContaining({
        optionRef: 'option:one', business: { name: 'One' },
        provenance: { kind: 'provider_assertion', observedAt: 1_000, validUntil: 2_000 },
      })],
    })
  })

  it('keeps multiple options explicitly unranked when decision and influence evidence are absent', () => {
    const result = projectCustomerOptionSet(candidateSet({
      candidates: [candidate('one', 1_200), candidate('two', 900)],
      attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))

    expect(result.cardinality).toBe('multiple')
    expect(result.ordering).toEqual({ kind: 'unranked', commercialInfluence: 'unknown' })
    expect(result.options.map((option) => option.business.name)).toEqual(['One', 'Two'])
    expect(JSON.stringify(result)).not.toMatch(/best|recommended|cheapest|winner/i)
  })

  it('recommends the unique lowest maximum only from an explicit customer preference and like-for-like evidence', () => {
    const result = projectCustomerOptionSet(candidateSet({
      decisionPreference: {
        objective: 'lowest_maximum_price', basis: 'extracted_from_request', evidenceRef: 'inference:customer-price-priority',
      },
      candidates: [
        candidate('one', 1_200, { status: 'none', summary: 'No commercial relationship.' }),
        candidate('two', 900, { status: 'none', summary: 'No commercial relationship.' }),
      ],
      attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))

    expect(result.ordering).toEqual({
      kind: 'recommended', commercialInfluence: 'none', objective: 'lowest_maximum_price',
      optionRef: 'option:two', evidenceRef: 'inference:customer-price-priority',
      reasons: ['Lowest provider maximum at AUD 9.00.', 'AUD 3.00 below the next-lowest provider maximum.'],
      tradeoffs: ['No differing registered comparison outputs were reported.'],
    })
  })

  it('may recommend with a disclosed relationship only when registration says it affected no decision stage', () => {
    const result = projectCustomerOptionSet(candidateSet({
      decisionPreference: {
        objective: 'lowest_maximum_price', basis: 'extracted_from_request', evidenceRef: 'inference:customer-price-priority',
      },
      candidates: [
        candidate('one', 1_200, { status: 'none', summary: 'No commercial relationship.' }),
        candidate('two', 900, {
          status: 'disclosed', relationship: 'commission', summary: 'AE may receive a referral fee.', payerName: 'Two',
          beneficiaryName: 'AE', compensationBasis: 'Fixed fee', influencesEligibility: false, influencesInclusion: false,
          influencesOrder: false,
        }),
      ],
      attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))

    expect(result.ordering).toMatchObject({
      kind: 'recommended', commercialInfluence: 'disclosed', optionRef: 'option:two',
    })
  })

  it.each([
    ['commercially influenced ordering', {
      decisionPreference: { objective: 'lowest_maximum_price' as const, basis: 'extracted_from_request' as const, evidenceRef: 'inference:price' },
      candidates: [
        candidate('one', 1_200, { status: 'none', summary: 'None.' }),
        candidate('two', 900, {
          status: 'disclosed', relationship: 'commission', summary: 'Paid relationship.', payerName: 'Two',
          beneficiaryName: 'AE', compensationBasis: 'Fee', influencesEligibility: false, influencesInclusion: false, influencesOrder: true,
        }),
      ],
    }],
    ['an unresolved commercial relationship', {
      decisionPreference: { objective: 'lowest_maximum_price' as const, basis: 'extracted_from_request' as const, evidenceRef: 'inference:price' },
      candidates: [candidate('one', 1_200), candidate('two', 900, { status: 'none', summary: 'None.' })],
    }],
    ['a tied lowest maximum', {
      decisionPreference: { objective: 'lowest_maximum_price' as const, basis: 'extracted_from_request' as const, evidenceRef: 'inference:price' },
      candidates: [
        candidate('one', 900, { status: 'none', summary: 'None.' }),
        candidate('two', 900, { status: 'none', summary: 'None.' }),
      ],
    }],
  ])('refuses to recommend with %s', (_case, input) => {
    const result = projectCustomerOptionSet(candidateSet({
      ...input, attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))
    expect(result.ordering.kind).toBe('unranked')
  })

  it.each([
    ['different currencies', {
      ...candidate('two', 900, { status: 'none', summary: 'None.' }),
      expectedCost: { currency: 'USD', amountMinor: 900 }, maximumCost: { currency: 'USD', amountMinor: 900 },
    }],
    ['different registered output shapes', {
      ...candidate('two', 900, { status: 'none', summary: 'None.' }),
      comparableOutputs: [{ label: 'Different service', value: 'Registered service' }],
    }],
  ])('refuses to call options comparable when they have %s', (_case, second) => {
    const result = projectCustomerOptionSet(candidateSet({
      decisionPreference: {
        objective: 'lowest_maximum_price', basis: 'extracted_from_request', evidenceRef: 'inference:price',
      },
      candidates: [candidate('one', 1_200, { status: 'none', summary: 'None.' }), second],
      attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))
    expect(result.ordering.kind).toBe('unranked')
  })

  it('preserves registered commercial relationships without allowing them to create rank', () => {
    const result = projectCustomerOptionSet(candidateSet({
      candidates: [
        candidate('one', 1_200, { status: 'none', summary: 'No commercial relationship.' }),
        candidate('two', 900, {
          status: 'disclosed', relationship: 'commission', summary: 'AE may receive a referral fee.',
          payerName: 'Two', beneficiaryName: 'Agentic Economy', compensationBasis: 'Fixed referral fee',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        }),
      ],
      attempts: [attempt('One', 'option_received'), attempt('Two', 'option_received')],
    }))

    expect(result.ordering).toEqual({ kind: 'unranked', commercialInfluence: 'disclosed' })
    expect(result.options[1]?.commercialInfluence).toMatchObject({
      status: 'disclosed', relationship: 'commission', influencesOrder: false,
    })
  })

  it('preserves pending and uncertain coverage when no option returned', () => {
    const result = projectCustomerOptionSet(candidateSet({
      candidates: [],
      attempts: [attempt('One', 'contact_pending'), attempt('Two', 'uncertain')],
    }))

    expect(result).toMatchObject({
      cardinality: 'none', optionCount: 0,
      ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
      coverage: { evaluated: 2, optionsReceived: 0, unavailable: 0, pending: 1, uncertain: 1 },
      options: [],
    })
  })
})

function candidate(
  key: string,
  amountMinor: number,
  commercialInfluence?: PreparedRouteCandidateSet['candidates'][number]['commercialInfluence'],
): PreparedRouteCandidateSet['candidates'][number] {
  return {
    optionRef: `option:${key}`, business: { name: title(key) },
    expectedCost: { currency: 'AUD', amountMinor }, maximumCost: { currency: 'AUD', amountMinor },
    expectedLatencyMs: 100, priceComponents: [{ label: 'Provider amount', amountMinor }],
    comparableOutputs: [{ label: 'Service', value: 'Registered service' }],
    materialTerms: ['Provider term'], cancellation: { kind: 'unsupported', summary: 'No cancellation.' },
    ...(commercialInfluence === undefined ? {} : { commercialInfluence }),
    issuedAt: 1_000, expiresAt: 2_000, inspectionRef: `evidence:${key}`,
  }
}

function attempt(name: string, status: PreparedRouteCandidateSet['attempts'][number]['status']): PreparedRouteCandidateSet['attempts'][number] {
  const descriptions = {
    not_contacted: `${name} was not contacted.`, contact_pending: `${name} is pending.`, contacted: `${name} was contacted.`,
    option_received: `${name} returned an option.`, unavailable: `${name} was unavailable.`, uncertain: `${name} is uncertain.`,
  } as const
  return { business: { name }, status, explanation: descriptions[status] }
}

function candidateSet(input: Pick<PreparedRouteCandidateSet, 'candidates' | 'attempts'> & Partial<Pick<PreparedRouteCandidateSet, 'decisionPreference'>>): PreparedRouteCandidateSet {
  return { inspectionRef: 'options:evidence', ...input }
}

function title(value: string): string { return value[0]?.toUpperCase() + value.slice(1) }
