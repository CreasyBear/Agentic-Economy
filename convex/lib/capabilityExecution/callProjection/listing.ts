import type { QueryCtx } from '../../../_generated/server'
import { requireSourceRead } from '../../security/sourceWrite/admission'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { listAgentSupplyCallsHandler, type supplyCallsArgs } from '../callLifecycle/supplyCallsListing'
import type { ObjectType } from 'convex/values'

export async function listAgentSupplyCallsQuery(ctx: QueryCtx, args: ObjectType<typeof supplyCallsArgs>) {
    if ((await requireSourceRead(args, 'catalog_publish')).kind === 'rejected') {
      return { kind: 'error' as const, code: 'source_unavailable' as const }
    }
    const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
    if (admission.kind !== 'allowed') return { kind: 'error' as const, code: 'unauthenticated' as const }

    return await listAgentSupplyCallsHandler(ctx, {
      ownerId: admission.ownerId,
      ...(args.state === undefined ? {} : { state: args.state }),
      limit: args.limit,
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    })

}
