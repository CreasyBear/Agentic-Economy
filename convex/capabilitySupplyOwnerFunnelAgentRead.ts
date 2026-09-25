import { v, type Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import { readOwnerSupplyFunnelProjection } from './lib/capabilitySupply/ownerFunnel/reads'
import type { OwnerSupplyFunnelResult } from './lib/capabilitySupply/ownerFunnel/contracts'
import { requireSourceRead } from './lib/security/sourceWrite/admission'
import {
  sourceWriteAdmissionArg,
  sourceWriteArgs,
  sourceWriteRequestArg,
} from './lib/security/sourceWrite/contracts'

export const agentOwnerSupplyFunnelReadArgs = {
  businessId: v.id('businesses'),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export type AgentOwnerSupplyFunnelReadArgs = {
  businessId: Id<'businesses'>
  agentPrincipal: Infer<typeof agentAccessPrincipalValue>
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
}

export async function readAgentOwnerSupplyFunnelHandler(
  ctx: QueryCtx,
  args: AgentOwnerSupplyFunnelReadArgs,
): Promise<OwnerSupplyFunnelResult> {
    const sourceWrite = await requireSourceRead(args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'error', code: 'unauthenticated' }
    const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
    if (admission.kind !== 'allowed')
      return { kind: 'error', code: 'unauthenticated' }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== admission.ownerId)
      return { kind: 'not_found' }
    return await readOwnerSupplyFunnelProjection(ctx, args, business)
}
