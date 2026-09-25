import { type Infer } from 'convex/values'
import { getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule, listIntegratedCapabilitySupply as listIntegratedCapabilitySupplyFromModule, listRouteableCapabilitySupply as listRouteableCapabilitySupplyFromModule } from '@/modules/capability-supply/public'
import { toRegisteredToolMapping } from '../../../capabilitySupplyRowMappers'
import { eligibleSupplyPorts } from '../../../capabilitySupplyEligiblePorts'
import { resolveBusinessActor } from '../../../authz'
import type { Id } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import type { ContractRef } from '../publish/contracts'
import { eligibleSupplyResultValue } from './contracts'

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
    .query('registeredToolMappings')
    .withIndex('by_networkId_and_mappingRef', (query) =>
      query.eq('networkId', args.networkId),
    )
    .take(args.limit)
  return rows.flatMap((row) => {
    const mapping = toRegisteredToolMapping(row)
    return mapping === null ? [] : [mapping]
  })
}

export async function authorizeOwnerSupplyActionHandler(
  ctx: QueryCtx,
  args: { businessId: Id<'businesses'> },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const business = await ctx.db.get(args.businessId)
  return business !== null &&
    business.owningAccountRef === actor.canonicalAccountRef &&
    business.publicStatus === 'published' &&
    business.suppressedAt === undefined
}
