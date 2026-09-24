import { type Infer } from 'convex/values'
import { queryCapabilityGraph as queryCapabilityGraphFromModule, bindingObservedRowDigest } from '@/modules/capability-supply/public'
import { resolveAdminAuthority } from '../../../authz'
import { capabilitySupplyGraphPorts } from './ports'
import type { QueryCtx } from '../../../_generated/server'
import { capabilityGraphResultValue } from './contracts'

export async function queryCapabilityGraphHandler(
  ctx: QueryCtx,
  args: { networkId: string; includeInactive: boolean; limit: number },
) {
  if (args.includeInactive) {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'register_capability_supply',
    )
    if (authority.kind !== 'allowed') {
      return {
        kind: 'unavailable' as const,
        reason: 'authorization_denied' as const,
      }
    }
  }
  return (await queryCapabilityGraphFromModule(
    capabilitySupplyGraphPorts(ctx.db),
    args,
  )) as Infer<typeof capabilityGraphResultValue>
}

export async function inspectBindingControlStateHandler(
  ctx: QueryCtx,
  args: { bindingId: string },
) {
  const authority = await resolveAdminAuthority(
    { db: ctx.db, auth: ctx.auth },
    'register_capability_supply',
  )
  if (authority.kind !== 'allowed')
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  const binding = await ctx.db
    .query('capabilityTransportBindings')
    .withIndex('by_bindingId', (index) =>
      index.eq('bindingId', args.bindingId),
    )
    .unique()
  if (binding === null)
    return {
      kind: 'unavailable' as const,
      reason: 'binding_not_found' as const,
    }
  return {
    kind: 'available' as const,
    bindingId: binding.bindingId,
    observedRowDigest: bindingObservedRowDigest(binding),
    admission: binding.admission,
    conformance: binding.conformance,
  }
}
