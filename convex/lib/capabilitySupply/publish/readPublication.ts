import {
  contractRefFromRow,
  publicationLifecycle,
  publicationProjection,
} from '@/modules/capability-supply/public'
import type { QueryCtx } from '../../../_generated/server'
import {
  convexPublicationLifecycle,
  ownsPublishedBusiness,
} from '../../../capabilitySupplyShared'

export async function readCapabilityPublicationHandler(
  ctx: QueryCtx,
  args: { publicationRef: string },
) {
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index.eq('publicationRef', args.publicationRef),
    )
    .order('desc')
    .first()
  if (
    publication === null ||
    !(await ownsPublishedBusiness(ctx, publication.businessId))
  )
    return null
  if (publication.disposition === 'incompatible') {
    const projection = publicationProjection(
      contractRefFromRow(publication),
      publication.offeringId,
      publication.bindingId,
      { state: 'incompatible', reasons: ['incompatible_revision'] },
    )
    return {
      ...projection,
      lifecycle: convexPublicationLifecycle(projection.lifecycle),
    }
  }
  const [offering, binding] = await Promise.all([
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (index) =>
        index.eq('offeringId', publication.offeringId),
      )
      .unique(),
    ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) =>
        index.eq('bindingId', publication.bindingId),
      )
      .unique(),
  ])
  if (offering === null || binding === null) return null
  const providerAuthority =
    binding.authority.kind === 'provider_connection'
      ? binding.authority
      : undefined
  const currentConnection =
    providerAuthority === undefined
      ? undefined
      : await ctx.db
          .query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (index) =>
            index.eq('connectionRef', providerAuthority.connectionRef),
          )
          .unique()
  const projection = publicationProjection(
    contractRefFromRow(publication),
    publication.offeringId,
    publication.bindingId,
    publicationLifecycle(
      publication,
      offering,
      binding,
      Date.now(),
      currentConnection,
    ),
  )
  return {
    ...projection,
    lifecycle: convexPublicationLifecycle(projection.lifecycle),
  }
}
