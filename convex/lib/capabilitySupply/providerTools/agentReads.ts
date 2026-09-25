import type { Infer } from 'convex/values'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { requireSourceRead } from '../../security/sourceWrite/admission'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { listAgentArgs, readAgentArgs } from './contracts'
import { projectIdentity } from './projection'

async function authorize(ctx: QueryCtx, args: { businessId: Doc<'businesses'>['_id']; agentPrincipal: Parameters<typeof verifySupplyAgentPrincipal>[1] }) {
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
  if (admission.kind !== 'allowed') return null
  const business = await ctx.db.get(args.businessId)
  return business !== null && business.owningAccountRef === admission.ownerId ? business : null
}

export async function listAgentHandler(ctx: QueryCtx, args: Infer<typeof listAgentArgs>) {
    if ((await requireSourceRead(args, 'catalog_publish')).kind === 'rejected') return { kind: 'not_found' as const }
    if ((await authorize(ctx, args)) === null) return { kind: 'not_found' as const }
    const rows = await ctx.db.query('capabilityProviderToolProjections')
      .withIndex('by_businessId_and_updatedAt', (query) => query.eq('businessId', args.businessId))
      .order('desc')
      .paginate(args.paginationOpts)
    const now = Date.now()
    const statuses = await Promise.all(rows.page.map((row) => projectIdentity(ctx, row, now, false)))
    return { kind: 'available' as const, page: statuses.flatMap((status) => status === null ? [] : [{ statusJson: JSON.stringify(status) }]), isDone: rows.isDone, continueCursor: rows.continueCursor }
}

export async function readAgentHandler(ctx: QueryCtx, args: Infer<typeof readAgentArgs>) {
    if ((await requireSourceRead(args, 'catalog_publish')).kind === 'rejected') return { kind: 'not_found' as const }
    if ((await authorize(ctx, args)) === null) return { kind: 'not_found' as const }
    const identity = await ctx.db.query('capabilityProviderToolProjections')
      .withIndex('by_businessId_and_toolRef', (query) => query.eq('businessId', args.businessId).eq('toolRef', args.toolRef))
      .unique()
    if (identity === null) return { kind: 'not_found' as const }
    const status = await projectIdentity(ctx, identity, Date.now(), true)
    return status === null ? { kind: 'not_found' as const } : { kind: 'available' as const, statusJson: JSON.stringify(status) }
}
