import type { PublicationLifecycle } from '@/modules/capability-supply/public'
import { v, type Infer } from 'convex/values'

import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { providerRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'

export const contractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})
export type ContractRef = Infer<typeof contractRefValue>

export const evidenceRefsValue = v.array(v.string())
export const commercialRelationshipValue = v.object({
  kind: v.union(
    v.literal('none'),
    v.literal('direct'),
    v.literal('affiliate'),
    v.literal('ownership'),
  ),
  summary: v.string(),
  influencesEligibility: v.boolean(),
  influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(),
  evidenceRefs: evidenceRefsValue,
})
export const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
export const priceValue = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmountValue }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountValue,
    maximum: exactAmountValue,
  }),
  v.object({ kind: v.literal('on_request') }),
)
export const presentationValue = v.object({
  label: v.string(),
  summary: v.string(),
  price: priceValue,
  materialTerms: v.array(
    v.object({ termId: v.string(), label: v.string(), value: v.string() }),
  ),
  commercialRelationship: commercialRelationshipValue,
})
export const offeringOriginValue = v.union(
  v.object({
    kind: v.literal('catalog_offering'),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    declaredAccessPathRef: v.optional(v.string()),
    accessPathSourceHash: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('standalone') }),
)
export const continuationValue = v.object({
  kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
export const cancellationValue = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
export const publicUpstreamAuthorityValue = v.object({ kind: v.literal('public_upstream') })
export const providerConnectionAuthorityValue = v.object({
  kind: v.literal('provider_connection'),
  connectionRef: v.string(),
  providerRef: v.string(),
})
export const authorityValue = v.union(
  publicUpstreamAuthorityValue,
  providerConnectionAuthorityValue,
)
export const publicationAuthorityModeValue = v.union(
  v.literal('provider_owned'),
  v.literal('ae_curated_external'),
  v.literal('third_party_gateway'),
  v.literal('observed_external'),
)
export const contextFields = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: evidenceRefsValue,
}
export const publicationLifecycleValue = v.object({
  state: v.union(
    v.literal('inactive'),
    v.literal('active'),
    v.literal('withdrawn'),
    v.literal('incompatible'),
  ),
  reasons: v.array(
    v.union(
      v.literal('admission_unproven'),
      v.literal('conformance_unproven'),
      v.literal('credential_readiness_unobserved'),
      v.literal('health_unobserved'),
      v.literal('credential_unavailable'),
      v.literal('health_unhealthy'),
      v.literal('health_stale'),
      v.literal('withdrawn'),
      v.literal('incompatible_revision'),
      v.literal('eligibility_integrity_failure'),
      v.literal('provider_authority_unverified'),
    ),
  ),
})

export function convexPublicationLifecycle(
  lifecycle: PublicationLifecycle,
): Infer<typeof publicationLifecycleValue> {
  return { state: lifecycle.state, reasons: [...lifecycle.reasons] }
}

async function publishedBusiness(
  db: QueryCtx['db'],
  businessId: string | Id<'businesses'>,
) {
  const business = await db.get(businessId as Id<'businesses'>)
  return business !== null &&
    business.publicStatus === 'published' &&
    business.suppressedAt === undefined
    ? business
    : null
}

export async function ownsPublishedBusiness(
  ctx: Pick<MutationCtx | QueryCtx, 'auth' | 'db'>,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false

  return business.owningAccountRef === actor.canonicalAccountRef
}

export async function ownsPublishedBusinessForOwnerId(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
  ownerId: string,
): Promise<boolean> {
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false
  return business.owningAccountRef === ownerId
}

/**
 * The pagination guards inside the rebuild command
 * (`business_catalog_rebuild_requires_pagination`,
 * `registry_search_document_rebuild_requires_pagination`) say "this fleet is
 * bigger than one transaction's page" - not "this projection is invalid". The
 * capacity guards inside `deriveBusinessOfferingSupportFromCapabilitySupply`
 * (`capability_offering_capacity_exceeded`, `capability_publication_capacity_exceeded`,
 * both bounded by `MAX_ELIGIBLE_SUPPLY`) say the same thing one step earlier -
 * this provider has more active offerings/publications than fit in one
 * transaction's page, not that its supply is invalid.
 */
function deferredBusinessSupplyProjectionReason(
  error: unknown,
): 'requires_pagination' | 'capacity_exceeded' | undefined {
  if (!(error instanceof Error)) return undefined
  if (error.message.endsWith('_requires_pagination')) return 'requires_pagination'
  if (error.message.endsWith('_capacity_exceeded')) return 'capacity_exceeded'
  return undefined
}

/**
 * Writes `registrySearchDocuments`, the only table public business search
 * reads, for every publish/withdraw path.
 *
 * Programmable providers used to be skipped outright here (commit 0bc62abed,
 * "remove provider offering fleet cap"), which left every x402 provider
 * unsearchable. The rebuild - and the derive step that feeds it - are already
 * bounded: they read at most one page of offerings/publications and throw
 * `*_requires_pagination` or `*_capacity_exceeded` beyond that, so run them
 * for providers too, and treat only those throws as deferred work rather than
 * a failed publish. `capabilitySupplyProjection:rebuildAllBusinessSupplyProjections`
 * is the recovery path for a fleet that outgrew one page. Every other error
 * still fails the publish.
 */
export async function rebuildCapabilityOriginSupplyProjection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  now: number,
): Promise<void> {
  const db = ctx.db
  if (await providerRouteabilityIsFrozen(ctx, businessId)) return
  try {
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(
      db,
      businessId,
      now,
    )
    await rebuildBusinessSupplyProjectionSnapshotCommand({
      db,
      sourceDb: db,
      businessId,
      support,
      now,
    })
  } catch (error) {
    const reason = deferredBusinessSupplyProjectionReason(error)
    if (reason === undefined) throw error
    console.warn(
      JSON.stringify({
        kind: 'business_supply_projection_deferred',
        businessId,
        reason,
      }),
    )
  }
}
