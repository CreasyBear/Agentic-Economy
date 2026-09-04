import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function upsertSupplierOperationIdentity(
  ctx: MutationCtx,
  input: Readonly<{
    businessId: Id<'businesses'>
    providerRef: string
    operationRef: string
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
    .query('capabilitySupplierOperationProjections')
    .withIndex('by_businessId_and_offeringRef', (query) =>
      query.eq('businessId', input.businessId).eq('offeringRef', input.offeringRef),
    )
    .unique()
  const value = {
    businessId: input.businessId,
    providerRef: input.providerRef,
    operationRef: input.operationRef,
    offeringRef: input.offeringRef,
    offeringRevision: input.offeringRevision,
    ...(input.publicationRef === undefined ? {} : { publicationRef: input.publicationRef }),
    ...(input.publicationRevision === undefined ? {} : { publicationRevision: input.publicationRevision }),
    ...(input.offeringId === undefined ? {} : { offeringId: input.offeringId }),
    ...(input.bindingId === undefined ? {} : { bindingId: input.bindingId }),
    updatedAt: input.updatedAt,
  }
  if (existing === null) await ctx.db.insert('capabilitySupplierOperationProjections', value)
  else await ctx.db.replace(existing._id, value)
}
