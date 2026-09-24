import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from './support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from './snapshot'

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
