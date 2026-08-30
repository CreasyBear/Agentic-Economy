import { v, type Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import {
  readOwnerSupplyFunnelProjection,
  type OwnerSupplyFunnelResult,
} from './capabilitySupplyOwnerFunnelProjection'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteArgs,
  sourceWriteRequestArg,
} from './sourceWriteAdmission'

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
  ctx: MutationCtx,
  args: AgentOwnerSupplyFunnelReadArgs,
): Promise<OwnerSupplyFunnelResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
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
