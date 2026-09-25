import { v } from 'convex/values'
import { connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import { pricingConfigValue } from '@/modules/capability-supply/public'
import { registeredToolMappingValue } from '../../../capabilitySupplyValues'
import type { Id } from '../../../_generated/dataModel'
import { authorityValue, cancellationValue, continuationValue, offeringOriginValue, presentationValue } from '../publish/contracts'

const eligibleSupplyValue = v.object({
  offering: v.object({
    offeringId: v.string(),
    businessId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    origin: v.optional(offeringOriginValue),
    presentation: presentationValue,
    status: v.literal('active'),
    registrationHash: v.string(),
    searchTerms: v.optional(v.array(v.string())),
  }),
  binding: v.object({
    bindingId: v.string(),
    offeringId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    endpointUrl: v.string(),
    authority: authorityValue,
    connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
    continuation: continuationValue,
    cancellation: cancellationValue,
    adapterId: v.string(),
    configJson: v.string(),
    configDigest: v.string(),
    admission: v.literal('admitted'),
    conformance: v.literal('conformant'),
    registrationHash: v.string(),
  }),
  publication: v.optional(
    v.object({
      publicationRef: v.string(),
      revision: v.number(),
      readinessValidUntil: v.number(),
      toolRef: v.string(),
      pricingConfig: pricingConfigValue,
      priceDigest: v.string(),
      connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
      admittedTool: v.object({
        publicationRef: v.string(),
        publicationRevision: v.number(),
        publisherRef: v.string(),
        sourceRevision: v.string(),
        sourceDigest: v.string(),
        businessId: v.string(),
        offeringId: v.string(),
        catalogOfferingRef: v.string(),
        catalogOfferingRevision: v.number(),
        offeringRegistrationHash: v.string(),
        offeringEligibilityHash: v.string(),
        bindingId: v.string(),
        bindingRegistrationHash: v.string(),
        bindingEligibilityHash: v.string(),
        bindingConfigDigest: v.string(),
        operationId: v.string(),
        contractRef: v.object({
          capabilityId: v.string(),
          version: v.number(),
          contractDigest: v.string(),
        }),
        effectDigest: v.string(),
        commercialDigest: v.string(),
        provenanceDigest: v.string(),
        qualificationDigest: v.string(),
        readinessValidUntil: v.number(),
      }),
    }),
  ),
})
export const eligibleSupplyResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    supplies: v.array(eligibleSupplyValue),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('limit_invalid'),
      v.literal('eligible_supply_limit_exceeded'),
      v.literal('supply_integrity_failure'),
      v.literal('contract_integrity_failure'),
    ),
  }),
)

export const listIntegratedArgs = {
  networkId: v.string(),
  limit: v.number(),
  now: v.number(),
} as const
export const listRouteableArgs = listIntegratedArgs
export const listMappingsArgs = {
  networkId: v.string(),
  limit: v.number(),
} as const
export const authorizeOwnerSupplyActionArgs = {
  businessId: v.id('businesses'),
} as const
export const recordCapabilityCallEventArgs = {
  eventRef: v.string(),
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  publicationRef: v.optional(v.string()),
  publicationRevision: v.optional(v.number()),
  toolRef: v.optional(v.string()),
  taskDigest: v.string(),
  eventKind: v.union(
    v.literal('supply_liquidity_fill_observed'),
    v.literal('supply_liquidity_first_success_observed'),
    v.literal('supply_liquidity_depth_observed'),
    v.literal('supply_owner_test_observed'),
  ),
  outcome: v.union(v.literal('filled'), v.literal('zero')),
  zeroReason: v.optional(
    v.union(
      v.literal('no_routeable_supply'),
      v.literal('readiness_unavailable'),
      v.literal('provider_refused'),
      v.literal('credential_unavailable'),
      v.literal('price_unavailable'),
      v.literal('insufficient_credit'),
      v.literal('input_invalid'),
      v.literal('outcome_unknown'),
    ),
  ),
  taskStartedAt: v.optional(v.number()),
  successfulAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  eligibleDepth: v.optional(v.number()),
  observedAt: v.number(),
  evidenceRefs: v.array(v.string()),
  environment: v.union(
    v.literal('local'),
    v.literal('development'),
    v.literal('sandbox'),
    v.literal('production'),
  ),
} as const
export const recordCapabilityCallEventReturns = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('replayed') }),
)
export type RecordCapabilityCallEventArgs = Readonly<{
  eventRef: string
  businessId: Id<'businesses'>
  offeringRef: string
  publicationRef?: string | undefined
  publicationRevision?: number | undefined
  toolRef?: string | undefined
  taskDigest: string
  eventKind: 'supply_liquidity_fill_observed' | 'supply_liquidity_first_success_observed' | 'supply_liquidity_depth_observed' | 'supply_owner_test_observed'
  outcome: 'filled' | 'zero'
  zeroReason?: 'no_routeable_supply' | 'readiness_unavailable' | 'provider_refused' | 'credential_unavailable' | 'price_unavailable' | 'insufficient_credit' | 'input_invalid' | 'outcome_unknown' | undefined
  taskStartedAt?: number | undefined
  successfulAt?: number | undefined
  durationMs?: number | undefined
  eligibleDepth?: number | undefined
  observedAt: number
  evidenceRefs: string[]
  environment: 'local' | 'development' | 'sandbox' | 'production'
}>
export const listMappingsReturns = v.array(registeredToolMappingValue)
