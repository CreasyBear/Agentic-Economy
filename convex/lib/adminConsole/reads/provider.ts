import { v } from 'convex/values'

import type { Slug } from '@/modules/common/ids'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type { AdminProviderView } from '@/lib/operator/admin-console/views'
import type { QueryCtx } from '../../../_generated/server'

const publicStatusValue = v.union(
  v.literal('unpublished'),
  v.literal('published'),
  v.literal('suppressed'),
)
const trustTierValue = v.union(
  v.literal('claimed'),
  v.literal('contact_confirmed'),
  v.literal('listed'),
  v.literal('registry_verified'),
)
const publicationDispositionValue = v.union(
  v.literal('current'),
  v.literal('withdrawn'),
  v.literal('incompatible'),
  v.literal('superseded'),
)
const sourceAuthorityStateValue = v.union(
  v.literal('verified'),
  v.literal('review_required'),
)
const connectionLifecycleValue = v.union(
  v.literal('active'),
  v.literal('reauthorization_required'),
  v.literal('revocation_pending'),
  v.literal('revoked'),
  v.literal('cleanup_required'),
)
const admissionCaseStateValue = v.union(
  v.literal('submitted'),
  v.literal('under_review'),
  v.literal('completed'),
)
const disputeStatusValue = v.union(
  v.literal('opened'),
  v.literal('updated'),
  v.literal('closed'),
  v.literal('contested'),
)
const sourceAuthorityReviewValue = v.object({
  publicationRef: v.string(),
  expectedRevision: v.number(),
  expectedSourceDigest: v.string(),
  operationRef: v.string(),
  sourceKind: v.literal('x402'),
  sourceUrl: v.string(),
})

export const adminProviderViewValue = v.object({
  kind: v.literal('provider'),
  slug: v.string(),
  publicStatus: publicStatusValue,
  trustTier: trustTierValue,
  suppressedAt: v.union(v.number(), v.null()),
  publications: v.array(v.object({
    ref: v.string(),
    revision: v.union(v.number(), v.null()),
    disposition: publicationDispositionValue,
    sourceAuthorityState: sourceAuthorityStateValue,
    sourceAuthorityReview: v.union(sourceAuthorityReviewValue, v.null()),
  })),
  connections: v.array(v.object({
    connectionRef: v.string(),
    lifecycle: connectionLifecycleValue,
    sourceEnvironment: v.union(v.string(), v.null()),
  })),
  admissionCases: v.array(v.object({
    caseRef: v.string(),
    state: admissionCaseStateValue,
    updatedAt: v.number(),
  })),
  removalDisputes: v.array(v.object({
    disputeRef: v.string(),
    status: disputeStatusValue,
    updatedAt: v.number(),
  })),
  payout: v.union(
    v.literal('connected'),
    v.literal('not_connected'),
    v.literal('unavailable'),
  ),
})

export const adminProviderRowValue = v.object({
  slug: v.string(),
  publicStatus: publicStatusValue,
  trustTier: trustTierValue,
  suppressedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
})

export async function readAdminProviderView(
  ctx: QueryCtx,
  slug: Slug,
): Promise<AdminProviderView | { kind: 'object_not_found' }> {
  const business = await ctx.db
    .query('businesses')
    .withIndex('by_businessContext_kind_and_slug', (query) => query
      .eq('businessContext.kind', 'programmable_provider')
      .eq('slug', slug))
    .unique()
  if (business === null) return { kind: 'object_not_found' }

  const [publicationRows, connectionRows, admissionRows, disputeRows] = await Promise.all([
    ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (query) => query.eq('businessId', business._id))
      .take(50),
    ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_connectionRef', (query) => query.eq('businessId', business._id))
      .take(20),
    ctx.db.query('capabilitySupplyAdmissionCases')
      .withIndex('by_businessId_and_submittedAt', (query) => query.eq('businessId', business._id))
      .order('desc')
      .take(20),
    ctx.db.query('disputes')
      .withIndex('by_business_status', (query) => query.eq('businessId', business._id))
      .order('desc')
      .take(20),
  ])

  return {
    kind: 'provider',
    slug,
    publicStatus: business.publicStatus,
    trustTier: business.trustTier,
    suppressedAt: business.suppressedAt ?? null,
    publications: publicationRows.flatMap((publication) => {
      if (!isPublicToolRef(publication.toolRef)) return []
      const selector = publication.sourceSelector
      const sourceAuthorityReview: AdminProviderView['publications'][number]['sourceAuthorityReview'] =
        publication.sourceKind === 'x402'
          && selector !== undefined
          && 'resourceUrl' in selector
          ? {
              publicationRef: publication.publicationRef,
              expectedRevision: publication.revision,
              expectedSourceDigest: publication.sourceDigest,
              operationRef: publication.toolRef,
              sourceKind: 'x402',
              sourceUrl: selector.resourceUrl,
            }
          : null
      return [{
        ref: publication.toolRef,
        revision: publication.revision,
        disposition: publication.disposition,
        sourceAuthorityState: publication.sourceAuthorityState ?? 'review_required',
        sourceAuthorityReview,
      }]
    }),
    connections: connectionRows.map((connection) => ({
      connectionRef: connection.connectionRef,
      lifecycle: connection.lifecycle,
      sourceEnvironment: connection.sourceEnvironment ?? null,
    })),
    admissionCases: admissionRows.map((admissionCase) => ({
      caseRef: admissionCase.caseRef,
      state: admissionCase.state,
      updatedAt: admissionCase.updatedAt,
    })),
    removalDisputes: disputeRows.map((dispute) => ({
      disputeRef: String(dispute._id),
      status: dispute.status,
      updatedAt: dispute.updatedAt,
    })),
    payout: 'unavailable',
  }
}
