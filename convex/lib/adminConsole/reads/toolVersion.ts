import { v } from 'convex/values'

import { parseBusinessSlug } from '@/modules/business/public'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type { AdminToolVersionView } from '@/lib/operator/admin-console/views'
import type { QueryCtx } from '../../../_generated/server'
import { readSourceAuthorityState } from './sourceAuthority'

const publicationDispositionValue = v.union(
  v.literal('current'),
  v.literal('withdrawn'),
  v.literal('incompatible'),
  v.literal('superseded'),
)
const sourceAuthorityStateValue = v.union(
  v.literal('verified'),
  v.literal('review_required'),
  v.literal('unset'),
)

export const adminToolVersionViewValue = v.object({
  kind: v.literal('tool_version'),
  ref: v.string(),
  publicationRef: v.string(),
  revision: v.union(v.number(), v.null()),
  disposition: publicationDispositionValue,
  businessSlug: v.string(),
  sourceAuthorityState: sourceAuthorityStateValue,
  admissionCaseRef: v.union(v.string(), v.null()),
  readinessValidUntil: v.union(v.number(), v.null()),
})

export async function readAdminToolVersionView(
  ctx: QueryCtx,
  ref: PublicToolRef,
): Promise<AdminToolVersionView | { kind: 'object_not_found' }> {
  const publications = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (query) => query
      .eq('toolRef', ref)
      .eq('disposition', 'current'))
    .take(500)
  const publication = publications.reduce<(typeof publications)[number] | undefined>(
    (latest, candidate) => latest === undefined || candidate.revision > latest.revision ? candidate : latest,
    undefined,
  )
  if (publication === undefined) return { kind: 'object_not_found' }

  const [business, admissionCase] = await Promise.all([
    ctx.db.get(publication.businessId),
    ctx.db
      .query('capabilitySupplyAdmissionCases')
      .withIndex('by_publicationRef_and_revision', (query) => query
        .eq('publicationRef', publication.publicationRef)
        .eq('publicationRevision', publication.revision))
      .unique(),
  ])
  if (business === null) return { kind: 'object_not_found' }
  const parsedSlug = parseBusinessSlug(business.slug)
  if (parsedSlug.kind === 'malformed') return { kind: 'object_not_found' }

  return {
    kind: 'tool_version',
    ref,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    disposition: publication.disposition,
    businessSlug: parsedSlug.slug,
    sourceAuthorityState: readSourceAuthorityState(publication),
    admissionCaseRef: admissionCase?.caseRef ?? null,
    readinessValidUntil: publication.readinessValidUntil ?? null,
  }
}
