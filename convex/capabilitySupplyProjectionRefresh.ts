import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalogSupplyProjection'
import { runtimeDb } from './source_state'

export async function rebuildCapabilityOriginSupplyProjection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  now: number,
): Promise<void> {
  const db = runtimeDb(ctx.db)
  const supportByOfferingRef = await deriveBusinessOfferingSupportFromCapabilitySupply(
    db,
    businessId,
    now,
  )
  await rebuildBusinessSupplyProjectionSnapshotCommand(
    db,
    businessId,
    supportByOfferingRef,
    now,
  )
}

export async function rebuildCapabilityOfferingOriginSupplyProjection(
  ctx: MutationCtx,
  offeringId: string,
  now: number,
): Promise<void> {
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', offeringId))
    .unique()
  if (offering?.origin?.kind !== 'catalog_offering') return
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    offering.businessId,
    now,
  )
}
