import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  BusinessCapabilityActionSlug,
  BusinessCapabilityKind,
  CapabilityDescriptor,
  CapabilityTrustState,
} from '@/modules/capabilities/public'
import {
  AeEndpointCheckStandardVersion,
  BusinessCapabilityActionSlugValues,
  BusinessCapabilityKindValues,
  CapabilityTrustStateValues,
} from '@/modules/capabilities/public'
import type {
  CapabilityCheckFacetResults,
  ContradictionFacetResult,
  FreshnessFacetResult,
  ReachabilityFacetResult,
  SchemaFacetResult,
} from '@/modules/capabilities/internal/check-standard'

describe('capability public type contracts', () => {
  it('keeps exported runtime values aligned to exact closed literal unions', () => {
    expectTypeOf<(typeof BusinessCapabilityKindValues)[number]>().toEqualTypeOf<BusinessCapabilityKind>()
    expectTypeOf<BusinessCapabilityKind>().toEqualTypeOf<
      'informational_page' | 'inquiry_intake' | 'business_endpoint' | 'action_card'
    >()
    expectTypeOf<(typeof CapabilityTrustStateValues)[number]>().toEqualTypeOf<CapabilityTrustState>()
    expectTypeOf<CapabilityTrustState>().toEqualTypeOf<
      'business_supplied' | 'checked' | 'stale' | 'contradicted' | 'unsupported'
    >()
    expectTypeOf<typeof AeEndpointCheckStandardVersion>().toEqualTypeOf<'ae-endpoint-check:v1'>()
    expect(BusinessCapabilityActionSlugValues).toEqual([
      'provision-paid-intake-endpoint',
      'publish-agent-intake-endpoint',
    ])
    expectTypeOf<(typeof BusinessCapabilityActionSlugValues)[number]>().toEqualTypeOf<BusinessCapabilityActionSlug>()
    expectTypeOf<BusinessCapabilityActionSlug>().toEqualTypeOf<
      'provision-paid-intake-endpoint' | 'publish-agent-intake-endpoint'
    >()
  })

  it('keeps descriptors discriminated by kind instead of wide optional columns', () => {
    expectTypeOf<DescriptorKeys<'informational_page'>>().toEqualTypeOf<'kind' | 'publicUrl'>()
    expectTypeOf<DescriptorKeys<'inquiry_intake'>>().toEqualTypeOf<
      'kind' | 'serviceId' | 'firstRequestMode' | 'publicChannel'
    >()
    expectTypeOf<DescriptorKeys<'business_endpoint'>>().toEqualTypeOf<
      'kind' | 'originUrl' | 'manifestUrl' | 'schemaRef'
    >()
    expectTypeOf<DescriptorKeys<'action_card'>>().toEqualTypeOf<'kind' | 'actionSlug' | 'cardRef'>()
    expectTypeOf<DescriptorFor<'inquiry_intake'>['firstRequestMode']>().toEqualTypeOf<
      'inquiry_available' | 'quote_request_available' | 'not_available_yet'
    >()
    expectTypeOf<DescriptorFor<'inquiry_intake'>['publicChannel']>().toEqualTypeOf<
      'public_business_contact' | 'ae_status_only' | 'not_available'
    >()
  })

  it('keeps check-standard facet results as typed discriminated unions', () => {
    expectTypeOf<CapabilityCheckFacetResults['reachability']>().toEqualTypeOf<ReachabilityFacetResult>()
    expectTypeOf<CapabilityCheckFacetResults['schema']>().toEqualTypeOf<SchemaFacetResult>()
    expectTypeOf<CapabilityCheckFacetResults['freshness']>().toEqualTypeOf<FreshnessFacetResult>()
    expectTypeOf<CapabilityCheckFacetResults['contradiction']>().toEqualTypeOf<ContradictionFacetResult>()
  })
})

type DescriptorFor<Kind extends BusinessCapabilityKind> = Extract<CapabilityDescriptor, { kind: Kind }>
type DescriptorKeys<Kind extends BusinessCapabilityKind> = keyof DescriptorFor<Kind>

// @ts-expect-error capability kind is closed; generic/open kinds require a future ADR
const invalidCapabilityKind: BusinessCapabilityKind = 'other'
void invalidCapabilityKind

// @ts-expect-error verified is not a Scope 2 trust state without a stricter named verification standard
const invalidTrustState: CapabilityTrustState = 'verified'
void invalidTrustState

// @ts-expect-error informational_page descriptors require their own URL, not a wide optional payload
const missingInformationalUrl: CapabilityDescriptor = { kind: 'informational_page' }
void missingInformationalUrl

const inquiryWithEndpointFields: CapabilityDescriptor = {
  kind: 'inquiry_intake',
  firstRequestMode: 'inquiry_available',
  publicChannel: 'public_business_contact',
  // @ts-expect-error cross-kind endpoint fields cannot appear on inquiry_intake descriptors
  originUrl: 'https://operator.example',
}
void inquiryWithEndpointFields

const endpointWithServiceArea: CapabilityDescriptor = {
  kind: 'business_endpoint',
  originUrl: 'https://operator.example',
  manifestUrl: 'https://operator.example/.well-known/ucp',
  schemaRef: 'ae-ucp:v1',
  // @ts-expect-error local-service shaped fields stay out of business_endpoint descriptors
  serviceArea: 'Sydney',
}
void endpointWithServiceArea

const actionCardWithUrgency: CapabilityDescriptor = {
  kind: 'action_card',
  actionSlug: 'provision-paid-intake-endpoint',
  cardRef: 'business_action_card:test',
  // @ts-expect-error local urgency fields stay out of action_card descriptors
  urgency: 'emergency',
}
void actionCardWithUrgency

const actionCardWithPublishSlug: CapabilityDescriptor = {
  kind: 'action_card',
  actionSlug: 'publish-agent-intake-endpoint',
  cardRef: 'business_action_card:publish-agent-intake',
}
void actionCardWithPublishSlug

// @ts-expect-error arbitrary action strings cannot replace the closed action-card slug set
const actionCardWithArbitrarySlug: BusinessCapabilityActionSlug = 'executeAction'
void actionCardWithArbitrarySlug

// @ts-expect-error local-service-shaped action strings stay out of action-card descriptors
const actionCardWithLocalServiceSlug: BusinessCapabilityActionSlug = 'emergency-pipe-repair'
void actionCardWithLocalServiceSlug
