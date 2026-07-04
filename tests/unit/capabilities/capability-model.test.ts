import { describe, expect, it } from 'vitest'

import {
  BusinessCapabilityKindValues,
  CapabilityTrustStateValues,
} from '@/modules/capabilities/public'
import type { CapabilityTrustState } from '@/modules/capabilities/public'
import {
  computeCapabilityTrustState,
  createActionCardDescriptor,
  createBusinessEndpointDescriptor,
  createInformationalPageDescriptor,
  createInquiryIntakeDescriptor,
} from '@/modules/capabilities/internal/capability-model'
import type { CapabilityCheckFacetResults } from '@/modules/capabilities/internal/check-standard'

const forbiddenLocalServiceFields = ['serviceArea', 'suburb', 'hours', 'urgency', 'emergency'] as const

describe('capability model contract', () => {
  it('keeps capability kinds and trust states closed to the ADR-002 D1/D4 sets', () => {
    expect(BusinessCapabilityKindValues).toEqual([
      'informational_page',
      'inquiry_intake',
      'business_endpoint',
      'action_card',
    ])
    expect(CapabilityTrustStateValues).toEqual([
      'business_supplied',
      'checked',
      'stale',
      'contradicted',
      'unsupported',
    ])
    expect(CapabilityTrustStateValues).not.toContain('verified')
  })

  it('constructs exact per-kind descriptors without local-service fields leaking in', () => {
    const descriptors = [
      {
        name: 'informational_page',
        descriptor: createInformationalPageDescriptor({ publicUrl: 'https://example.test/about' }),
        expectedKeys: ['kind', 'publicUrl'],
      },
      {
        name: 'inquiry_intake',
        descriptor: createInquiryIntakeDescriptor({
          firstRequestMode: 'inquiry_available',
          publicChannel: 'public_business_contact',
        }),
        expectedKeys: ['firstRequestMode', 'kind', 'publicChannel'],
      },
      {
        name: 'business_endpoint',
        descriptor: createBusinessEndpointDescriptor({
          originUrl: 'https://operator.example',
          manifestUrl: 'https://operator.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
        }),
        expectedKeys: ['kind', 'manifestUrl', 'originUrl', 'schemaRef'],
      },
      {
        name: 'action_card',
        descriptor: createActionCardDescriptor({
          actionSlug: 'provision-paid-intake-endpoint',
          cardRef: 'business_action_card:test',
        }),
        expectedKeys: ['actionSlug', 'cardRef', 'kind'],
      },
    ]

    for (const { descriptor, expectedKeys, name } of descriptors) {
      expect(Object.keys(descriptor).sort(), name).toEqual(expectedKeys)
      expect(forbiddenLocalServiceFields.filter((field) => field in descriptor), name).toEqual([])
    }
  })

  it('preserves each admitted action-card slug in constructed descriptors', () => {
    const cases = [
      {
        name: 'paid intake endpoint',
        actionSlug: 'provision-paid-intake-endpoint',
        cardRef: 'business_action_card:paid-intake',
      },
      {
        name: 'published agent intake endpoint',
        actionSlug: 'publish-agent-intake-endpoint',
        cardRef: 'business_action_card:publish-agent-intake',
      },
    ] as const

    for (const { actionSlug, cardRef, name } of cases) {
      expect(createActionCardDescriptor({ actionSlug, cardRef }), name).toEqual({
        kind: 'action_card',
        actionSlug,
        cardRef,
      })
    }
  })

  it('maps facet outcomes to the five trust states without premature unsupported transitions', () => {
    const cases = [
      {
        name: 'never checked starts as business_supplied',
        input: { kind: 'never_checked' },
        expected: 'business_supplied',
      },
      {
        name: 'all facets pass and fresh becomes checked',
        input: { kind: 'checked', previousState: 'business_supplied', facets: passingFacets() },
        expected: 'checked',
      },
      {
        name: 'freshness outside the per-kind window becomes stale',
        input: {
          kind: 'checked',
          previousState: 'checked',
          facets: { ...passingFacets(), freshness: staleFreshness() },
        },
        expected: 'stale',
      },
      {
        name: 'manifest contradiction becomes contradicted',
        input: {
          kind: 'checked',
          previousState: 'checked',
          facets: { ...passingFacets(), contradiction: contradictedFields() },
        },
        expected: 'contradicted',
      },
      {
        name: 'exhausted reachability failures become unsupported',
        input: {
          kind: 'checked',
          previousState: 'business_supplied',
          facets: { ...passingFacets(), reachability: unreachable({ exhausted: true }) },
        },
        expected: 'unsupported',
      },
      {
        name: 'exhausted schema failures become unsupported',
        input: {
          kind: 'checked',
          previousState: 'business_supplied',
          facets: { ...passingFacets(), schema: schemaInvalid({ exhausted: true }) },
        },
        expected: 'unsupported',
      },
      {
        name: 'non-exhausted reachability failures preserve business_supplied',
        input: {
          kind: 'checked',
          previousState: 'business_supplied',
          facets: { ...passingFacets(), reachability: unreachable({ exhausted: false }) },
        },
        expected: 'business_supplied',
      },
      {
        name: 'non-exhausted schema failures preserve business_supplied',
        input: {
          kind: 'checked',
          previousState: 'business_supplied',
          facets: { ...passingFacets(), schema: schemaInvalid({ exhausted: false }) },
        },
        expected: 'business_supplied',
      },
    ] satisfies readonly {
      name: string
      input: Parameters<typeof computeCapabilityTrustState>[0]
      expected: CapabilityTrustState
    }[]

    for (const { expected, input, name } of cases) {
      expect(computeCapabilityTrustState(input), name).toBe(expected)
    }
  })

  it('computes the same trust state for the same facet input every time', () => {
    const input = {
      kind: 'checked',
      previousState: 'checked',
      facets: { ...passingFacets(), freshness: staleFreshness() },
    } satisfies Parameters<typeof computeCapabilityTrustState>[0]

    expect([
      computeCapabilityTrustState(input),
      computeCapabilityTrustState(input),
      computeCapabilityTrustState(input),
    ]).toEqual(['stale', 'stale', 'stale'])
  })
})


function passingFacets(): CapabilityCheckFacetResults {
  return {
    reachability: { facet: 'reachability', outcome: 'pass', code: 'reachable' },
    schema: { facet: 'schema', outcome: 'pass', code: 'schema_conformant' },
    freshness: { facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs: 3_600_000 },
    contradiction: { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' },
  }
}

function staleFreshness(): CapabilityCheckFacetResults['freshness'] {
  return { facet: 'freshness', outcome: 'stale', code: 'window_exceeded', windowMs: 3_600_000 }
}

function contradictedFields(): CapabilityCheckFacetResults['contradiction'] {
  return {
    facet: 'contradiction',
    outcome: 'contradicted',
    code: 'ae_held_fact_conflict',
    fields: ['name'],
  }
}

function unreachable(input: { exhausted: boolean }): CapabilityCheckFacetResults['reachability'] {
  return {
    facet: 'reachability',
    outcome: 'fail',
    code: 'unreachable',
    reason: 'timeout',
    retryable: true,
    exhausted: input.exhausted,
  }
}

function schemaInvalid(input: { exhausted: boolean }): CapabilityCheckFacetResults['schema'] {
  return {
    facet: 'schema',
    outcome: 'fail',
    code: 'schema_invalid',
    reason: 'parse_failed',
    retryable: false,
    exhausted: input.exhausted,
  }
}
