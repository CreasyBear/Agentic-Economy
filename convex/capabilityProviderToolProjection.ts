import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function upsertProviderToolIdentity(
  ctx: MutationCtx,
  input: Readonly<{
    businessId: Id<'businesses'>
    providerRef: string
    toolRef: string
    offeringRef: string
    offeringRevision: number
    publicationRef?: string
    publicationRevision?: number
    offeringId?: string
    bindingId?: string
    updatedAt: number
  }>,
): Promise<void> {
  const existing = await ctx.db
    .query('capabilityProviderToolProjections')
    .withIndex('by_businessId_and_offeringRef', (query) =>
      query.eq('businessId', input.businessId).eq('offeringRef', input.offeringRef),
    )
    .unique()
  const revision = await ctx.db.query('businessOfferingRevisions')
    .withIndex('by_offeringRef_and_revision', query => query.eq('offeringRef', input.offeringRef).eq('revision', input.offeringRevision))
    .unique()
  const inventory = revision?.businessId === input.businessId ? {
    inventoryName: revision.name.trim().toLowerCase(),
    inventoryText: `${revision.name} ${revision.summary} ${revision.category}`,
  } : {}
  const value = {
    ...inventory,
    businessId: input.businessId,
    providerRef: input.providerRef,
    toolRef: input.toolRef,
    offeringRef: input.offeringRef,
    offeringRevision: input.offeringRevision,
    ...(input.publicationRef === undefined ? {} : { publicationRef: input.publicationRef }),
    ...(input.publicationRevision === undefined ? {} : { publicationRevision: input.publicationRevision }),
    ...(input.offeringId === undefined ? {} : { offeringId: input.offeringId }),
    ...(input.bindingId === undefined ? {} : { bindingId: input.bindingId }),
    updatedAt: input.updatedAt,
  }
  if (existing === null) await ctx.db.insert('capabilityProviderToolProjections', value)
  else await ctx.db.replace(existing._id, value)
}
