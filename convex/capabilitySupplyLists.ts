import { v, type Infer } from 'convex/values'
import { connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import {
  getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule,
  listIntegratedCapabilitySupply as listIntegratedCapabilitySupplyFromModule,
  listRouteableCapabilitySupply as listRouteableCapabilitySupplyFromModule,
  pricingConfigValue,
} from '@/modules/capability-supply/public'

import { registeredOperationMappingValue } from './capabilitySupplyValues'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { readCanonicalCompatibilityOwner, resolveBusinessActor } from './authz'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import {
  authorityValue,
  cancellationValue,
  continuationValue,
  offeringOriginValue,
  presentationValue,
  type ContractRef,
} from './capabilitySupplyShared'

export const eligibleSupplyValue = v.object({
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
      operationRef: v.string(),
      pricingConfig: pricingConfigValue,
      priceDigest: v.string(),
      connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
      admittedOperation: v.object({
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
  operationRef: v.optional(v.string()),
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
export const listMappingsReturns = v.array(registeredOperationMappingValue)

export async function listIntegratedCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listIntegratedCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function listRouteableCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listRouteableCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
}

export async function getEligibleExactCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{
    networkId: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: ContractRef
    expectedOfferingRegistrationHash: string
    expectedBindingRegistrationHash: string
    now: number
  }>,
) {
  return getEligibleExactCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function listIntegratedHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number; now: number },
) {
  return (await listIntegratedCapabilitySupply(ctx.db, args)) as Infer<
    typeof eligibleSupplyResultValue
  >
}

export async function listRouteableHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number; now: number },
) {
  return (await listRouteableCapabilitySupply(ctx.db, args)) as Infer<
    typeof eligibleSupplyResultValue
  >
}

export async function listMappingsHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number },
) {
  const rows = await ctx.db
    .query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) =>
      query.eq('networkId', args.networkId),
    )
    .take(args.limit)
  return rows.flatMap((row) => {
    const mapping = toRegisteredOperationMapping(row)
    return mapping === null ? [] : [mapping]
  })
}

export async function authorizeOwnerSupplyActionHandler(
  ctx: QueryCtx,
  args: { businessId: Id<'businesses'> },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const owner = await readCanonicalCompatibilityOwner(ctx.db, actor)
  if (owner === null) return false
  const business = await ctx.db.get(args.businessId)
  return business !== null &&
    business.ownerId === owner._id &&
    business.publicStatus === 'published' &&
    business.suppressedAt === undefined
}

export async function recordCapabilityCallEventHandler() {
  return { kind: 'replayed' as const }
}
